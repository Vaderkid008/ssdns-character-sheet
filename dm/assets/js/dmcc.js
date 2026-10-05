/**
 * SSDNS DM Command Center v0.1.0-draft
 * Demo mode (default / ?demo=1) is fully offline — no Firebase CDN load.
 * Live Firebase path dynamic-imports modular v10+ and degrades if RTDB/auth missing.
 */

const VERSION = "0.1.0-draft";
const NOTES_KEY = "ssdns.dmcc.notes";
const ROOM_KEY = "ssdns.dmcc.lastRoom";
const WORDS = ["DUST", "IRON", "HEX", "RUST", "BONE", "COIL", "SAGE", "RAIL", "OXEN", "VELD", "ASH", "QUILL"];

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function roomCode() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return w + "-" + n;
}
function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  } catch (e) { return "—"; }
}
function toast(msg, ms) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms || 2800);
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type || "application/json" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
}
function parseDice(formula) {
  // simple NdM[+/-K] or plain number
  const f = String(formula || "1d20").replace(/\s/g, "").toLowerCase();
  const m = f.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) {
    const n = parseInt(f, 10);
    return isFinite(n) ? { total: n, detail: String(n), nat1: false, rolls: [n] } : { total: 0, detail: "?", nat1: false, rolls: [] };
  }
  const n = Math.max(1, parseInt(m[1] || "1", 10));
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3], 10) : 0;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const sum = rolls.reduce((a, b) => a + b, 0) + mod;
  const detail = rolls.join("+") + (mod ? (mod >= 0 ? "+" : "") + mod : "");
  const nat1 = n === 1 && sides === 20 && rolls[0] === 1;
  return { total: sum, detail, nat1, rolls };
}
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

/* ---------- state ---------- */
const state = {
  demo: true,
  firebaseReady: false,
  firebaseError: null,
  uid: null,
  roomCode: null,
  meta: null,
  players: {},
  ledger: [],
  rolls: [],
  messages: [],
  handouts: [],
  commands: [],
  unsubs: [],
  db: null,
  auth: null,
  app: null
};

function wantDemo() {
  const q = new URLSearchParams(location.search);
  if (q.get("demo") === "0" || q.get("live") === "1") return false;
  if (q.get("demo") === "1") return true;
  // default ON until Firebase has been proven
  return true;
}

/* ---------- Firebase init (graceful) ---------- */
async function initFirebase() {
  const cfg = window.SSDNS_FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) {
    state.firebaseError = "Missing firebase-config.js";
    return false;
  }
  try {
    const [{ initializeApp }, authMod, dbMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js")
    ]);
    state._fb = {
      initializeApp,
      getAuth: authMod.getAuth,
      signInAnonymously: authMod.signInAnonymously,
      onAuthStateChanged: authMod.onAuthStateChanged,
      getDatabase: dbMod.getDatabase,
      ref: dbMod.ref,
      set: dbMod.set,
      update: dbMod.update,
      push: dbMod.push,
      onValue: dbMod.onValue,
      off: dbMod.off,
      get: dbMod.get,
      remove: dbMod.remove
    };
    const fb = state._fb;
    state.app = fb.initializeApp(cfg);
    state.auth = fb.getAuth(state.app);
    state.db = fb.getDatabase(state.app);
    await fb.signInAnonymously(state.auth);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Auth timeout")), 8000);
      fb.onAuthStateChanged(state.auth, (user) => {
        if (user) {
          clearTimeout(t);
          state.uid = user.uid;
          state.firebaseReady = true;
          resolve(user);
        }
      }, reject);
    });
    try {
      await fb.get(fb.ref(state.db, ".info/connected"));
    } catch (e) {
      state.firebaseError = "RTDB probe failed: " + (e.message || e);
      state.firebaseReady = false;
      return false;
    }
    return true;
  } catch (e) {
    state.firebaseError = (e && e.message) || String(e);
    state.firebaseReady = false;
    console.warn("[DMCC] Firebase unavailable:", e);
    return false;
  }
}

function roomRef(path) {
  const fb = state._fb;
  return fb.ref(state.db, "rooms/" + state.roomCode + (path ? "/" + path : ""));
}

function clearUnsubs() {
  state.unsubs.forEach((fn) => { try { fn(); } catch (e) {} });
  state.unsubs = [];
}

/* ---------- Demo load ---------- */
function loadDemo(createNewCode) {
  const D = window.DMCC_DEMO;
  state.demo = true;
  state.roomCode = createNewCode ? roomCode() : D.roomCode;
  state.meta = Object.assign({}, D.meta, {
    code: state.roomCode,
    dmUid: "demo_dm",
    createdAt: new Date().toISOString(),
    status: "live"
  });
  state.players = deepClone(D.players);
  state.ledger = deepClone(D.ledger);
  state.rolls = deepClone(D.rolls);
  state.messages = deepClone(D.messages);
  state.handouts = deepClone(D.handouts);
  state.commands = deepClone(D.commands || []);
  state.uid = "demo_dm";
  showRoom();
  renderAll();
  setStatus("demo", "Demo mode · offline · code " + state.roomCode);
  try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code: state.roomCode, demo: true })); } catch (e) {}
}

async function createLiveRoom(name) {
  if (!state.firebaseReady) {
    toast("Firebase not ready — starting Demo room instead");
    loadDemo(true);
    if (name) state.meta.name = name;
    renderAll();
    return;
  }
  const code = roomCode();
  state.demo = false;
  state.roomCode = code;
  state.meta = {
    code,
    name: name || "",
    dmUid: state.uid,
    dmName: "DM",
    createdAt: new Date().toISOString(),
    status: "live"
  };
  state.players = {};
  state.ledger = [];
  state.rolls = [];
  state.messages = [];
  state.handouts = [];
  state.commands = [];
  try {
    await state._fb.set(roomRef("meta"), state.meta);
    attachLiveListeners();
    showRoom();
    renderAll();
    setStatus("live", "Live · Firebase · " + code);
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code, demo: false })); } catch (e) {}
  } catch (e) {
    console.warn(e);
    toast("Could not create live room (" + (e.message || e) + "). Falling back to Demo.");
    loadDemo(true);
    if (name) { state.meta.name = name; renderAll(); }
  }
}

function attachLiveListeners() {
  clearUnsubs();
  if (!state.db || !state.roomCode) return;
  const bind = (path, handler) => {
    const r = roomRef(path);
    const fb = state._fb;
    const cb = fb.onValue(r, (snap) => handler(snap.val()), (err) => {
      console.warn("[DMCC] listen", path, err);
      setStatus("offline", "Live sync error · " + (err.message || "see console"));
    });
    state.unsubs.push(() => fb.off(r, "value", cb));
  };
  bind("meta", (v) => { if (v) { state.meta = v; renderRoomHero(); } });
  bind("players", (v) => { state.players = v || {}; renderPlayers(); fillTargetSelects(); renderPresence(); });
  bind("ledger", (v) => {
    state.ledger = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    renderLedger();
  });
  bind("rolls", (v) => {
    state.rolls = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    renderRolls();
  });
  bind("messages", (v) => {
    state.messages = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    renderMessages();
  });
  bind("handouts", (v) => {
    state.handouts = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    renderHandouts();
  });
}

function objToArr(o) {
  if (!o) return [];
  if (Array.isArray(o)) return o.filter(Boolean);
  return Object.keys(o).map((k) => Object.assign({ id: o[k].id || k }, o[k]));
}

/* ---------- writes ---------- */
async function pushLedger(entry) {
  entry.id = entry.id || uid("led");
  entry.ts = entry.ts || new Date().toISOString();
  if (state.demo) {
    state.ledger.unshift(entry);
    renderLedger();
    return;
  }
  try { await state._fb.set(roomRef("ledger/" + entry.id), entry); }
  catch (e) { toast("Ledger write failed"); console.warn(e); }
}

async function pushRoll(entry) {
  entry.id = entry.id || uid("r");
  entry.ts = entry.ts || new Date().toISOString();
  if (state.demo) {
    state.rolls.unshift(entry);
    renderRolls();
    return;
  }
  try { await state._fb.set(roomRef("rolls/" + entry.id), entry); }
  catch (e) { toast("Roll write failed"); console.warn(e); }
}

async function pushMessage(entry) {
  entry.id = entry.id || uid("m");
  entry.ts = entry.ts || new Date().toISOString();
  if (state.demo) {
    state.messages.unshift(entry);
    renderMessages();
    return;
  }
  try { await state._fb.set(roomRef("messages/" + entry.id), entry); }
  catch (e) { toast("Message failed"); console.warn(e); }
}

async function pushHandout(entry) {
  entry.id = entry.id || uid("h");
  entry.ts = entry.ts || new Date().toISOString();
  if (state.demo) {
    const i = state.handouts.findIndex((h) => h.id === entry.id);
    if (i >= 0) state.handouts[i] = entry; else state.handouts.unshift(entry);
    renderHandouts();
    return;
  }
  try { await state._fb.set(roomRef("handouts/" + entry.id), entry); }
  catch (e) { toast("Handout failed"); console.warn(e); }
}

async function pushCommand(cmd) {
  cmd.id = cmd.id || uid("cmd");
  cmd.ts = cmd.ts || new Date().toISOString();
  if (state.demo) {
    state.commands.unshift(cmd);
    toast("Command queued (demo): " + cmd.type + (cmd.to && cmd.to !== "all" ? " → " + cmd.to : " → all"));
    return;
  }
  try { await state._fb.set(roomRef("commands/" + cmd.id), cmd); toast("Sent: " + cmd.type); }
  catch (e) { toast("Command failed"); console.warn(e); }
}

async function applyEsToDemoPlayer(playerId, delta) {
  const p = state.players[playerId];
  if (!p || !p.snapshot) return;
  const old = p.snapshot.es || 0;
  p.snapshot.es = Math.max(0, old + delta);
  p.snapshot.updatedAt = new Date().toISOString();
}

/* ---------- UI: status / room ---------- */
function setStatus(mode, text) {
  const dot = $("#statusDot");
  dot.className = "status-dot " + (mode === "live" ? "live" : mode === "offline" ? "offline" : "demo");
  $("#statusText").textContent = text;
  $("#statusExtra").textContent = state.firebaseError && !state.demo
    ? " · " + state.firebaseError
    : (state.firebaseReady && state.demo ? " · Firebase ready if you turn Demo off" : "");
}

function showRoom() {
  $("#lobby").hidden = true;
  $("#roomShell").hidden = false;
  $("#btnCopyCode").hidden = false;
  $("#btnEndSession").hidden = false;
  renderRoomHero();
}

function hideRoom() {
  $("#lobby").hidden = false;
  $("#roomShell").hidden = true;
  $("#btnCopyCode").hidden = true;
  $("#btnEndSession").hidden = true;
  clearUnsubs();
  state.roomCode = null;
}

function renderRoomHero() {
  if (!state.meta) return;
  $("#roomCodeDisplay").textContent = state.meta.code || state.roomCode;
  const online = Object.values(state.players).filter((p) => p.presence && p.presence.online).length;
  const total = Object.keys(state.players).length;
  $("#roomMeta").textContent = (state.meta.name ? state.meta.name + " · " : "") +
    (state.demo ? "Demo" : "Live") + " · " + online + "/" + total + " online · DMCC " + VERSION;
  renderPresence();
}

function renderPresence() {
  const box = $("#presenceList");
  const list = Object.values(state.players);
  if (!list.length) {
    box.innerHTML = '<span class="pill">No players yet — share the code</span>';
    return;
  }
  box.innerHTML = list.map((p) => {
    const s = p.snapshot || {};
    const on = p.presence && p.presence.online;
    return `<span class="pill ${on ? "online" : "offline"}"><span class="dot"></span>${esc(s.name || p.id)} · ${esc(s.player || "?")}</span>`;
  }).join("");
}

function playerOptions(includeAll) {
  const opts = includeAll ? '<option value="all">Everyone</option>' : "";
  return opts + Object.keys(state.players).map((id) => {
    const s = state.players[id].snapshot || {};
    return `<option value="${esc(id)}">${esc(s.name || id)}</option>`;
  }).join("");
}

function fillTargetSelects() {
  ["#rewTarget", "#msgTarget", "#hoTarget", "#selForcePlayer"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    const keep = el.value;
    const all = sel !== "#msgTarget";
    el.innerHTML = (sel === "#msgTarget" ? '<option value="">Select player…</option>' : "") +
      (sel === "#selForcePlayer" ? '<option value="all">Everyone</option>' : "") +
      playerOptions(sel === "#rewTarget" || sel === "#hoTarget");
    if (sel === "#rewTarget" || sel === "#hoTarget") {
      /* playerOptions already has all */
    }
    if ([...el.options].some((o) => o.value === keep)) el.value = keep;
  });
  // fix rew/ho to always have all
  ["#rewTarget", "#hoTarget"].forEach((sel) => {
    const el = $(sel);
    const keep = el.value;
    el.innerHTML = playerOptions(true);
    if ([...el.options].some((o) => o.value === keep)) el.value = keep;
  });
}

/* ---------- render tabs ---------- */
function renderAll() {
  renderRoomHero();
  fillTargetSelects();
  renderPlayers();
  renderLedger();
  renderRolls();
  renderMessages();
  renderHandouts();
  loadNotes();
}

function renderPlayers() {
  const grid = $("#playerGrid");
  const list = Object.values(state.players);
  if (!list.length) {
    grid.innerHTML = '<div class="empty"><b>Empty table</b>Players appear here when they Join with the room code.</div>';
    return;
  }
  grid.innerHTML = list.map((p) => {
    const s = p.snapshot || {};
    const on = p.presence && p.presence.online;
    const guns = (s.guns || []).filter((g) => g && g.name).map((g) => {
      const cls = g.jammed ? "jammed" : (g.condition === "worn" ? "worn" : "");
      const cond = g.jammed ? "JAMMED" : (g.condition || "ok");
      return `<div class="gun-chip ${cls}">${esc(g.name)} · ${g.loaded ?? "?"}/${g.capacity ?? "?"} · ${esc(cond)}</div>`;
    }).join("") || '<div class="gun-chip">No guns listed</div>';
    return `<button type="button" class="pcard ${on ? "" : "offline"}" data-pid="${esc(p.id)}">
      <div class="pcard-head">
        <div>
          <div class="pcard-name">${esc(s.name || "Unknown")}</div>
          <div class="pcard-sub">${esc(s.calling || "?")} · L${esc(s.level ?? "?")} · ${esc(s.player || "")}</div>
        </div>
        <span class="badge ${on ? "eld" : ""}">${on ? "Online" : "Away"}</span>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${esc(s.hpCurrent ?? "—")}<small style="font-size:12px;color:var(--muted)">/${esc(s.hpMax ?? "—")}</small></b><span>HP</span></div>
        <div class="stat"><b>${esc(s.ac ?? "—")}</b><span>AC</span></div>
        <div class="stat"><b>${Number(s.es || 0).toLocaleString()}</b><span>ES</span></div>
      </div>
      ${guns}
    </button>`;
  }).join("");
  $$(".pcard", grid).forEach((btn) => btn.addEventListener("click", () => openDetail(btn.dataset.pid)));
}

function openDetail(pid) {
  const p = state.players[pid];
  if (!p) return;
  const s = p.snapshot || {};
  $("#detailTitle").textContent = s.name || pid;
  $("#detailSub").textContent = [s.calling, "L" + (s.level ?? "?"), s.subclass, s.lineage, "Player: " + (s.player || "?")].filter(Boolean).join(" · ");
  const ab = s.abilities || {};
  const mods = s.mods || {};
  const abilHtml = ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((a) =>
    `<div class="abil-cell"><b>${mods[a] != null ? (mods[a] >= 0 ? "+" : "") + mods[a] : "—"}</b><span>${a} ${ab[a] ?? ""}</span></div>`
  ).join("");
  const skills = Object.entries(s.skills || {}).map(([k, v]) => `${esc(k)} ${v >= 0 ? "+" : ""}${v}`).join(" · ") || "—";
  const saves = Object.entries(s.saves || {}).map(([k, v]) => `${esc(k)} ${v >= 0 ? "+" : ""}${v}`).join(" · ") || "—";
  const spells = s.spells || {};
  const spellTxt = [
    (spells.cantrips || []).filter(Boolean).length ? "Cantrips: " + spells.cantrips.filter(Boolean).join(", ") : "",
    (spells.prepared || []).filter(Boolean).length ? "Prepared: " + spells.prepared.filter(Boolean).join(", ") : ""
  ].filter(Boolean).join("\n") || "None listed";
  const guns = (s.guns || []).filter((g) => g && g.name).map((g) =>
    `${g.name} — ${g.loaded}/${g.capacity} ${g.load || ""} [${g.condition || "ok"}]${g.jammed ? " JAMMED" : ""}${g.note ? " · " + g.note : ""}`
  ).join("\n") || "—";

  $("#detailBody").innerHTML = `
    <div class="stat-row">
      <div class="stat"><b>${esc(s.hpCurrent)}/${esc(s.hpMax)}</b><span>HP</span></div>
      <div class="stat"><b>${esc(s.ac)}</b><span>AC</span></div>
      <div class="stat"><b>${Number(s.es || 0).toLocaleString()}</b><span>ES</span></div>
      <div class="stat"><b>${esc(s.hpTemp || 0)}</b><span>Temp</span></div>
    </div>
    <div class="detail-section"><h3>Abilities</h3><div class="abil-grid">${abilHtml}</div></div>
    <div class="detail-section"><h3>Saves</h3><p>${saves}</p></div>
    <div class="detail-section"><h3>Skills</h3><p>${skills}</p></div>
    <div class="detail-section"><h3>Guns</h3><pre>${esc(guns)}</pre></div>
    <div class="detail-section"><h3>Equipment</h3><pre>${esc(s.equipment || "—")}</pre></div>
    <div class="detail-section"><h3>Features</h3><pre>${esc(s.features || "—")}</pre></div>
    <div class="detail-section"><h3>Spells</h3><pre>${esc(spellTxt)}</pre></div>
    <div class="detail-section"><h3>Personality</h3><p>${esc(s.personality || "—")}</p></div>
    <p class="lede" style="margin-top:12px">Read-only snapshot · updated ${esc(fmtTime(s.updatedAt))}</p>
  `;
  $("#detailOverlay").hidden = false;
}

function renderLedger() {
  const feed = $("#ledgerFeed");
  if (!state.ledger.length) {
    feed.innerHTML = '<div class="empty"><b>Ledger empty</b>ES changes and DM pushes show up here.</div>';
    return;
  }
  feed.innerHTML = state.ledger.map((e) => {
    const delta = (e.oldVal != null && e.newVal != null && typeof e.oldVal === "number" && typeof e.newVal === "number")
      ? `${e.oldVal} → ${e.newVal}` : (e.newVal != null ? String(e.newVal) : "");
    return `<div class="feed-item ${e.flag ? "flag" : ""}">
      <div class="feed-meta"><span>${esc(fmtTime(e.ts))}</span><span>${esc(e.who)}</span><span class="badge">${esc(e.type)}</span>${e.flag ? '<span class="badge warn">Big jump</span>' : ""}</div>
      <div class="feed-what">${esc(e.what)}</div>
      ${delta ? `<div class="feed-delta">${esc(delta)}</div>` : ""}
    </div>`;
  }).join("");
}

function renderRolls() {
  const feed = $("#rollsFeed");
  const visible = state.rolls.filter((r) => !r.private || state.demo || r.uid === state.uid || true);
  // DM sees private rolls; in demo DM is us
  if (!visible.length) {
    feed.innerHTML = '<div class="empty"><b>No rolls yet</b></div>';
    return;
  }
  feed.innerHTML = visible.map((r) => {
    const nat = r.nat1 && r.isFirearm;
    return `<div class="feed-item ${nat ? "nat1" : ""} ${r.private ? "private" : ""}">
      <div class="feed-meta">
        <span>${esc(fmtTime(r.ts))}</span>
        <span>${esc(r.who)}</span>
        ${r.private ? '<span class="badge">Private</span>' : ""}
        ${nat ? '<span class="badge danger">Nat 1 · firearm</span>' : ""}
      </div>
      <div class="feed-what"><b>${esc(r.label || "Roll")}</b> · ${esc(r.formula)} = <b style="color:var(--eld)">${esc(r.result)}</b> <span style="color:var(--muted)">(${esc(r.detail)})</span></div>
    </div>`;
  }).join("");
}

function renderMessages() {
  const feed = $("#msgFeed");
  if (!state.messages.length) {
    feed.innerHTML = '<div class="empty" style="padding:16px"><b>No private messages</b></div>';
    return;
  }
  feed.innerHTML = state.messages.map((m) => `
    <div class="feed-item">
      <div class="feed-meta"><span>${esc(fmtTime(m.ts))}</span><span>DM → ${esc(m.toName || m.to)}</span>${m.read ? "" : '<span class="badge eld">Unread</span>'}</div>
      <div class="feed-what">${esc(m.text)}</div>
    </div>`).join("");
}

function renderHandouts() {
  const grid = $("#handoutGrid");
  if (!state.handouts.length) {
    grid.innerHTML = '<div class="empty"><b>No handouts saved</b></div>';
    return;
  }
  grid.innerHTML = state.handouts.map((h) => `
    <div class="handout-card">
      <img src="${esc(h.url)}" alt="" loading="lazy" onerror="this.style.opacity=.3">
      <div class="body">
        <h3>${esc(h.name)}</h3>
        <div class="feed-meta"><span>${esc(fmtTime(h.ts))}</span><span>→ ${esc(h.to === "all" ? "Table" : h.to)}</span></div>
        <a href="${esc(h.url)}" target="_blank" rel="noopener">Open link</a>
        <div class="toolbar" style="margin:8px 0 0">
          <button type="button" class="btn sm" data-resend="${esc(h.id)}">Send again</button>
        </div>
      </div>
    </div>`).join("");
  $$("[data-resend]", grid).forEach((btn) => btn.addEventListener("click", () => {
    const h = state.handouts.find((x) => x.id === btn.dataset.resend);
    if (h) sendHandoutCommand(h);
  }));
}

/* ---------- notes (local only) ---------- */
function loadNotes() {
  try {
    const key = NOTES_KEY + "." + (state.roomCode || "global");
    $("#dmNotes").value = localStorage.getItem(key) || localStorage.getItem(NOTES_KEY) || "";
  } catch (e) { $("#dmNotes").value = ""; }
}
function saveNotes() {
  try {
    const key = NOTES_KEY + "." + (state.roomCode || "global");
    localStorage.setItem(key, $("#dmNotes").value);
    localStorage.setItem(NOTES_KEY, $("#dmNotes").value);
    $("#notesSaved").textContent = "Saved locally · " + new Date().toLocaleTimeString();
  } catch (e) { $("#notesSaved").textContent = "Could not save notes (storage full?)"; }
}

/* ---------- actions ---------- */
function targetsFor(selValue) {
  if (selValue === "all") return Object.keys(state.players);
  return selValue ? [selValue] : [];
}

async function doPushReward() {
  const target = $("#rewTarget").value;
  const type = $("#rewType").value;
  const ids = targetsFor(target);
  if (!ids.length && target !== "all") { toast("Pick a target"); return; }
  if (type === "es") {
    const delta = parseInt($("#rewEs").value, 10) || 0;
    if (!delta) { toast("Enter a non-zero ES amount"); return; }
    for (const pid of (target === "all" ? Object.keys(state.players) : ids)) {
      const p = state.players[pid];
      const name = (p && p.snapshot && p.snapshot.name) || pid;
      const old = p && p.snapshot ? p.snapshot.es : null;
      if (state.demo) await applyEsToDemoPlayer(pid, delta);
      const neu = p && p.snapshot ? p.snapshot.es : (old != null ? old + delta : delta);
      const flag = Math.abs(delta) >= 500;
      await pushLedger({
        who: "DM", playerId: pid, type: "dm_push",
        what: `DM ${delta >= 0 ? "granted" : "took"} ${Math.abs(delta)} ES → ${name}`,
        oldVal: old, newVal: neu, flag
      });
      await pushCommand({
        type: "reward_es", to: pid, payload: { delta, reason: "DM reward" },
        from: state.uid
      });
    }
    if (state.demo) renderPlayers();
    toast("ES reward pushed");
  } else {
    const text = ($("#rewText").value || "").trim();
    if (!text) { toast("Enter item or note text"); return; }
    const to = target === "all" ? "all" : target;
    await pushLedger({
      who: "DM", playerId: to, type: "dm_push",
      what: (type === "item" ? "Item: " : "Note: ") + text + (to === "all" ? " (everyone)" : ""),
      oldVal: null, newVal: text, flag: false
    });
    await pushCommand({
      type: type === "item" ? "reward_item" : "reward_note",
      to, payload: { text }, from: state.uid
    });
    toast(type === "item" ? "Item pushed" : "Note pushed");
  }
}

async function doSendMsg() {
  const to = $("#msgTarget").value;
  const text = ($("#msgText").value || "").trim();
  if (!to) { toast("Pick a player"); return; }
  if (!text) { toast("Write a message"); return; }
  const p = state.players[to];
  await pushMessage({
    from: state.uid || "demo_dm", fromName: "DM",
    to, toName: (p && p.snapshot && p.snapshot.name) || to,
    text, read: false
  });
  await pushCommand({ type: "message", to, payload: { text }, from: state.uid });
  $("#msgText").value = "";
  toast("Private message sent");
}

async function doDmRoll() {
  const label = ($("#rollLabel").value || "DM roll").trim();
  const formula = ($("#rollFormula").value || "1d20").trim();
  const priv = $("#rollPrivate").checked;
  const out = parseDice(formula);
  await pushRoll({
    who: "DM", playerId: null, uid: state.uid || "demo_dm",
    label, formula, result: out.total, detail: out.detail,
    nat1: out.nat1, isFirearm: false, private: priv
  });
  toast((priv ? "Private " : "") + "roll: " + out.total);
}

async function doHandout(send) {
  const name = ($("#hoName").value || "Handout").trim();
  const url = ($("#hoUrl").value || "").trim();
  const to = $("#hoTarget").value || "all";
  if (!url) { toast("Paste an image URL"); return; }
  const entry = { name, url, to, sent: !!send };
  await pushHandout(entry);
  if (send) await sendHandoutCommand(entry);
  else toast("Saved to handout list");
  $("#hoName").value = "";
  $("#hoUrl").value = "";
}

async function sendHandoutCommand(h) {
  await pushCommand({
    type: "handout", to: h.to || "all",
    payload: { name: h.name, url: h.url },
    from: state.uid
  });
  toast("Handout sent to " + (h.to === "all" ? "table" : h.to));
}

async function doForce(kind, custom) {
  const to = $("#selForcePlayer").value || "all";
  const payload = kind === "custom"
    ? { tab: ($("#inForceTab").value || custom || "").trim() }
    : { panel: kind };
  if (kind === "custom" && !payload.tab) { toast("Enter a tab id"); return; }
  await pushCommand({
    type: kind === "saloon" ? "open_saloon" : kind === "store" ? "open_store" : "open_tab",
    to, payload, from: state.uid
  });
}

function exportLedger(fmt) {
  const code = state.roomCode || "room";
  if (fmt === "json") {
    download(code + "-ledger.json", JSON.stringify(state.ledger, null, 2));
  } else {
    const rows = [["ts", "who", "playerId", "type", "what", "old", "new", "flag"]];
    state.ledger.forEach((e) => rows.push([e.ts, e.who, e.playerId, e.type, e.what, e.oldVal, e.newVal, e.flag]));
    const csv = rows.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(code + "-ledger.csv", csv, "text/csv");
  }
  toast("Exported " + fmt.toUpperCase());
}

async function endSession(wipe) {
  const archive = {
    archivedAt: new Date().toISOString(),
    meta: state.meta,
    ledger: state.ledger,
    rolls: state.rolls.filter((r) => !r.private),
    handouts: state.handouts
  };
  if (state.demo) {
    download((state.roomCode || "demo") + "-archive.json", JSON.stringify(archive, null, 2));
    toast("Demo session ended · archive downloaded" + (wipe ? " · wiped" : " · ledger kept in file"));
    if (wipe) { state.players = {}; state.ledger = []; state.rolls = []; state.messages = []; state.handouts = []; }
    hideRoom();
    return;
  }
  try {
    const aid = uid("arch");
    await state._fb.set(roomRef("archives/" + aid), archive);
    await state._fb.update(roomRef("meta"), { status: "ended", endedAt: new Date().toISOString() });
    if (wipe) {
      // keep meta+archives; clear live feeds
      await state._fb.remove(roomRef("players"));
      await state._fb.remove(roomRef("ledger"));
      await state._fb.remove(roomRef("rolls"));
      await state._fb.remove(roomRef("messages"));
      await state._fb.remove(roomRef("handouts"));
      await state._fb.remove(roomRef("commands"));
    }
    toast("Session ended · ledger archived" + (wipe ? " · live data wiped" : ""));
  } catch (e) {
    download((state.roomCode || "room") + "-archive.json", JSON.stringify(archive, null, 2));
    toast("Archive downloaded locally (cloud write failed)");
  }
  hideRoom();
}

/* ---------- tabs ---------- */
function wireTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      $$(".panel").forEach((p) => { p.hidden = true; });
      const panel = $("#" + tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = false;
    });
  });
}

/* ---------- boot ---------- */
function wire() {
  wireTabs();
  $("#btnCreateRoom").addEventListener("click", () => {
    const name = ($("#inRoomName").value || "").trim();
    if (state.demo || !state.firebaseReady) loadDemo(true);
    else createLiveRoom(name);
    if (name && state.meta) { state.meta.name = name; renderRoomHero(); }
  });
  $("#btnLoadDemo").addEventListener("click", () => loadDemo(false));
  $("#chkDemo").addEventListener("change", async () => {
    state.demo = $("#chkDemo").checked;
    if (!state.demo) {
      const ok = state.firebaseReady || await initFirebase();
      if (!ok) {
        $("#chkDemo").checked = true;
        state.demo = true;
        toast("Firebase not available — stay in Demo. See DM-SETUP.md");
        setStatus("demo", "Demo mode · Firebase not ready");
        return;
      }
      setStatus("live", "Live mode ready · create or re-join a room");
      toast("Demo off · Create room to go live");
    } else {
      setStatus("demo", "Demo mode · offline");
    }
  });
  $("#btnCopyCode").addEventListener("click", async () => {
    const c = state.roomCode;
    try { await navigator.clipboard.writeText(c); toast("Copied " + c); }
    catch (e) { toast(c); }
  });
  $("#btnEndSession").addEventListener("click", () => {
    const dlg = $("#dlgEnd");
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  });
  $("#btnCancelEnd").addEventListener("click", () => {
    const dlg = $("#dlgEnd");
    if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
  });
  $("#btnConfirmEnd").addEventListener("click", () => {
    const wipe = $("#chkWipe").checked;
    const dlg = $("#dlgEnd");
    if (dlg.close) dlg.close(); else dlg.removeAttribute("open");
    endSession(wipe);
  });
  $("#btnCloseDetail").addEventListener("click", () => { $("#detailOverlay").hidden = true; });
  $("#detailOverlay").addEventListener("click", (e) => {
    if (e.target === $("#detailOverlay")) $("#detailOverlay").hidden = true;
  });
  $("#rewType").addEventListener("change", () => {
    const t = $("#rewType").value;
    $("#rewEsWrap").hidden = t !== "es";
    $("#rewTextWrap").hidden = t === "es";
  });
  $("#btnPushReward").addEventListener("click", doPushReward);
  $("#btnSendMsg").addEventListener("click", doSendMsg);
  $("#btnDmRoll").addEventListener("click", doDmRoll);
  $("#btnSendHandout").addEventListener("click", () => doHandout(true));
  $("#btnSaveHandout").addEventListener("click", () => doHandout(false));
  $("#btnExportJson").addEventListener("click", () => exportLedger("json"));
  $("#btnExportCsv").addEventListener("click", () => exportLedger("csv"));
  $("#btnForceSaloon").addEventListener("click", () => doForce("saloon"));
  $("#btnForceStore").addEventListener("click", () => doForce("store"));
  $("#btnForceCustom").addEventListener("click", () => doForce("custom"));
  let notesTimer;
  $("#dmNotes").addEventListener("input", () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(saveNotes, 400);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("#detailOverlay").hidden = true;
  });
}

async function boot() {
  wire();
  state.demo = wantDemo();
  $("#chkDemo").checked = state.demo;
  setStatus("demo", "Starting…");

  // Demo: fully offline — do not touch Firebase CDN.
  // Live (?demo=0): try Firebase; fall back to Demo if it fails.
  if (state.demo) {
    loadDemo(false);
    setStatus("demo", "Demo mode · offline · no Firebase loaded");
  } else {
    setStatus("live", "Connecting to Firebase…");
    const ok = await initFirebase();
    if (!ok) {
      state.demo = true;
      $("#chkDemo").checked = true;
      loadDemo(false);
      setStatus("demo", "Demo mode · Firebase unavailable");
      toast("Firebase unavailable — Demo mode on. See DM-SETUP.md");
    } else {
      setStatus("live", "Live · Firebase connected · create a room");
      $("#lobby").hidden = false;
      $("#roomShell").hidden = true;
    }
  }
}

boot();

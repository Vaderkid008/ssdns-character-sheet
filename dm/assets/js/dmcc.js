/**
 * SSDNS DM Command Center v0.1.0-draft
 * Demo mode (default / ?demo=1) is fully offline — no Firebase CDN load.
 * Live Firebase path dynamic-imports modular v10+ and degrades if RTDB/auth missing.
 */

const VERSION = "0.2.6"; // dmcc-playtest-v026
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
  table: null,
  chat: [],
  addiction: {},
  dockFilter: "all",
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
      remove: dbMod.remove,
      runTransaction: dbMod.runTransaction
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
    // Anonymous sign-in is the readiness check. ref(".info/connected") throws
    // "Invalid token in path" in the modular SDK, which was forcing Demo mode.
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
  state.chat = deepClone(D.chat || []);
  state.addiction = {};
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
    dmName: (($("#inDmName") && $("#inDmName").value) || "DM").trim() || "DM",
    createdAt: new Date().toISOString(),
    status: "live"
  };
  state.players = {};
  state.ledger = [];
  state.rolls = [];
  state.messages = [];
  state.handouts = [];
  state.commands = [];
  state.chat = [];
  state.addiction = {};
  addictionReady = false;
  try {
    await state._fb.set(roomRef("meta"), state.meta);
    attachLiveListeners();
    showRoom();
    renderAll();
    setStatus("live", "Live · Firebase · " + code);
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code, demo: false, uid: state.uid })); } catch (e) {}
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
  addictionReady = false;
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
  const seenJoin = {};
  bind("players", (v) => {
    const prev = state.players || {};
    state.players = v || {};
    Object.keys(state.players).forEach((id) => {
      if (seenJoin[id]) return;
      seenJoin[id] = 1;
      if (!prev[id]) {
        const s = state.players[id].snapshot || {};
        const who = [s.player, s.name].filter(Boolean).join(" · ") || id;
        pushLedger({
          who: who, playerId: id, playerName: s.player || "", characterName: s.name || "",
          type: "join", what: who + " joined the table", oldVal: null, newVal: "joined", flag: false
        });
      }
    });
    renderPlayers();
    fillTargetSelects();
    renderPresence();
    renderRoomHero();
    if (window.DMCCEnhance && window.DMCCEnhance.fillAdds) window.DMCCEnhance.fillAdds();
  });
  bind("ledger", (v) => {
    const next = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    noteAddiction(next);
    state.ledger = next;
    renderLedger();
  });
  bind("rolls", (v) => {
    const all = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    noteConsumeRolls(all);
    state.rolls = all.filter((r) => !isConsumeRoll(r));
    renderRolls();
  });
  bind("archives/addiction", (v) => {
    state.addiction = v && typeof v === "object" ? v : {};
    addictionReady = true;
    flushConsume();
    renderPlayers();
  });
  bind("messages", (v) => {
    state.messages = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    renderMessages();
  });
  bind("handouts", (v) => {
    state.handouts = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    renderHandouts();
  });
  bind("table", (v) => {
    state.table = v || null;
    if (window.DMCCEnhance && window.DMCCEnhance.onTable) window.DMCCEnhance.onTable(v || {});
  });
  bind("chat", (v) => {
    state.chat = objToArr(v).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    renderLiveDock();
  });
}

const knownLedger = {};
let ledgerReady = false;
function noteAddiction(entries) {
  (entries || []).forEach((e) => {
    if (!e || !e.id || knownLedger[e.id]) return;
    knownLedger[e.id] = 1;
  });
  ledgerReady = true;
}

function isConsumeRoll(r) {
  return !!(r && (r.consume || r.formula === "consume"));
}
function blankAddiction() {
  return { addicted: false, uses: 0, daysWithout: 0, penalty: 0, seen: [] };
}
function addictionFloor(uses) {
  return -Math.floor(Number(uses || 0) / 3);
}
function clampAddiction(a) {
  const floor = addictionFloor(a.uses);
  if (a.penalty > 0) a.penalty = 0;
  if (a.penalty > floor) a.penalty = floor;
  return a;
}
function addictionSummary(a) {
  return "uses " + a.uses + ", floor " + addictionFloor(a.uses) + ", WIS/INT/CHA " + a.penalty;
}
function applyConsumeChart(a) {
  const first = !a.addicted;
  a.addicted = true;
  a.uses = Number(a.uses || 0) + 1;
  a.daysWithout = 0;
  if (first) { if (Number(a.penalty) > 0) a.penalty = 0; }
  else a.penalty = Math.min(0, Number(a.penalty || 0) + 1);
  return clampAddiction(a);
}
let addictionReady = true;
const consumeQueue = [];
function noteConsumeRolls(entries) {
  (entries || []).forEach((e) => {
    if (!isConsumeRoll(e) || !e.id) return;
    consumeQueue.push({
      rollId: e.id,
      pid: e.playerId || e.uid || "",
      color: e.consume || e.detail || "",
      name: e.who || "",
      ts: e.ts
    });
  });
  flushConsume();
}
function flushConsume() {
  if (!addictionReady) return;
  while (consumeQueue.length) recordConsume(consumeQueue.shift());
}
function matchPlayer(meta) {
  const name = String((meta && meta.name) || "").trim().toLowerCase();
  const player = String((meta && meta.player) || "").trim().toLowerCase();
  const ids = Object.keys(state.players || {});
  if (name) {
    const hit = ids.find((id) => String((state.players[id].snapshot || {}).name || "").trim().toLowerCase() === name);
    if (hit) return hit;
  }
  if (player) {
    const hit = ids.find((id) => String((state.players[id].snapshot || {}).player || "").trim().toLowerCase() === player);
    if (hit) return hit;
  }
  return "";
}
function saveAddiction(pid) {
  if (state.demo || !state.db || !state._fb || !pid) return;
  const row = state.addiction[pid];
  if (!row) return;
  state._fb.set(roomRef("archives/addiction/" + pid), row).catch((e) => console.warn("[DMCC] addiction", e));
}
function alertAddiction(pid, line) {
  toast(line, 6000);
  const bar = $("#addictionAlert");
  if (bar) { bar.hidden = false; bar.textContent = line; }
  renderPlayers();
  const overlay = $("#detailOverlay");
  if (overlay && !overlay.hidden && overlay.dataset.pid === pid) openDetail(pid);
}
function recordConsume(ev) {
  if (!ev) return null;
  let pid = ev.pid || matchPlayer(ev) || ("anon:" + (ev.name || ev.rollId || "unknown"));
  const prev = state.addiction[pid] || blankAddiction();
  const a = Object.assign(blankAddiction(), prev, { seen: (prev.seen || []).slice() });
  if (ev.rollId && a.seen.indexOf(ev.rollId) >= 0) return a;
  if (ev.rollId) {
    a.seen.push(ev.rollId);
    if (a.seen.length > 40) a.seen = a.seen.slice(-40);
  }
  applyConsumeChart(a);
  a.lastShard = ev.color || "";
  state.addiction[pid] = a;
  saveAddiction(pid);
  const s = (state.players[pid] && state.players[pid].snapshot) || {};
  const who = [s.player || ev.player, s.name || ev.name].filter(Boolean).join(" · ") || "A player";
  const shard = ev.color || "a";
  alertAddiction(pid, who + " consumed 1 " + shard + " shard. " + addictionSummary(a) + ".");
  return a;
}
function missAddictionDay(pid) {
  const prev = state.addiction[pid];
  if (!prev || !prev.addicted) { toast("No consume yet for that character."); return; }
  const a = Object.assign(blankAddiction(), prev, { seen: (prev.seen || []).slice() });
  a.daysWithout = Number(a.daysWithout || 0) + 1;
  a.penalty = Number(a.penalty || 0) - 1;
  state.addiction[pid] = a;
  saveAddiction(pid);
  const s = (state.players[pid] && state.players[pid].snapshot) || {};
  alertAddiction(pid, (s.name || "Character") + " missed a day. " + addictionSummary(a) + ".");
}
function takeConsumePing(ping) {
  if (!ping || !ping.id) return;
  recordConsume({
    rollId: ping.id,
    pid: matchPlayer(ping),
    color: ping.color || "",
    name: ping.name || "",
    player: ping.player || ""
  });
}
function addictionLine(pid) {
  const a = state.addiction[pid];
  if (!a || !a.addicted) return "";
  return `<div class="addict-line">Addiction · uses ${esc(a.uses)} · floor ${esc(addictionFloor(a.uses))} · WIS/INT/CHA ${esc(a.penalty)}</div>`;
}
function addictionDetail(pid) {
  const a = state.addiction[pid];
  const body = a && a.addicted
    ? `<p>Uses ${esc(a.uses)} · floor ${esc(addictionFloor(a.uses))} · WIS/INT/CHA ${esc(a.penalty)} · days without ${esc(a.daysWithout || 0)}</p>`
    : `<p>No consume yet.</p>`;
  return body + `<p class="lede">Every 3rd use drops the floor by 1. A consume restores 1 point, never above the floor. Players do not see this.</p><button type="button" class="btn sm" id="btnAddictMiss">Missed a day</button>`;
}

function objToArr(o) {
  if (!o) return [];
  if (Array.isArray(o)) return o.filter(Boolean);
  return Object.keys(o).map((k) => Object.assign({ id: o[k].id || k }, o[k]));
}

/* ---------- writes ---------- */
function namesFor(pid) {
  const p = pid && state.players[pid];
  const s = (p && p.snapshot) || {};
  return { playerName: s.player || "", characterName: s.name || "" };
}
function ledgerNames(e) {
  const looked = namesFor(e.playerId);
  const playerName = e.playerName || looked.playerName;
  const characterName = e.characterName || looked.characterName;
  const both = [playerName, characterName].filter(Boolean).join(" · ");
  return both || e.who || "";
}
async function pushLedger(entry) {
  entry.id = entry.id || uid("led");
  entry.ts = entry.ts || new Date().toISOString();
  const names = namesFor(entry.playerId);
  if (!entry.playerName) entry.playerName = names.playerName;
  if (!entry.characterName) entry.characterName = names.characterName;
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
  try {
    await state._fb.set(roomRef("rolls/" + entry.id), entry);
    if (!entry.private) {
      const text = (entry.label || "Roll") + " " + (entry.formula || "") + " = " + (entry.result ?? "") + (entry.detail ? " (" + entry.detail + ")" : "");
      const feed = {
        id: entry.id, ts: entry.ts, from: state.uid || "dm", fromName: "DM",
        text: text, kind: "roll", who: entry.who || "DM"
      };
      try { await state._fb.set(roomRef("tableFeed/" + entry.id), feed); } catch (err) { console.warn("[DMCC] feed", err); }
      await pushCommand({ type: "roll", to: "all", payload: { text: text, who: entry.who || "DM", id: entry.id }, from: state.uid });
    }
  }
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
  const to = cmd.to || "all";
  try {
    await state._fb.set(roomRef("commands/" + cmd.id), cmd);
    const copy = to && to !== "all" ? "inbox/" + to + "/" + cmd.id : "broadcast/" + cmd.id;
    try { await state._fb.set(roomRef(copy), cmd); }
    catch (err) { console.warn("[DMCC] deliver", err); }
    toast("Sent: " + cmd.type);
  } catch (e) { toast("Command failed"); console.warn(e); }
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
  document.body.classList.add("in-room");
  const dock = $("#liveDock");
  if (dock) dock.hidden = false;
  renderRoomHero();
}

function hideRoom() {
  $("#lobby").hidden = false;
  $("#roomShell").hidden = true;
  $("#btnCopyCode").hidden = true;
  $("#btnEndSession").hidden = true;
  document.body.classList.remove("in-room");
  const dock = $("#liveDock");
  if (dock) dock.hidden = true;
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
  if (window.DMCCEnhance && window.DMCCEnhance.afterRender) window.DMCCEnhance.afterRender();
}

function slotLine(s) {
  const slots = (s.spells && s.spells.slots) || {};
  const spent = (s.spells && s.spells.spent) || {};
  const bits = [];
  for (let lv = 1; lv <= 9; lv++) {
    const total = Number(slots[lv] || 0);
    if (!total) continue;
    bits.push(lv + ": " + Math.max(0, total - Number(spent[lv] || 0)) + "/" + total);
  }
  return bits.length ? "Shells " + bits.join(" · ") : "";
}

const HEX_CASE = ["#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#3b0764", "#2e1065"];
const SPECIAL_CASE = { buck: "#c4a35a", slug: "#6b4f3a", percussion: "#7d8b99", bigfifty: "#4d6270", arrows: "#5e8a55" };
function chamberTokens(g) {
  if (Array.isArray(g.chambers) && g.chambers.length) return g.chambers.slice();
  const cap = Number(g.capacity) || 0;
  const out = [];
  let plain = Number(g.plain);
  let hex = Number(g.hex);
  if (!isFinite(plain)) plain = Math.max(0, (Number(g.loaded) || 0) - (isFinite(hex) ? hex : 0));
  if (!isFinite(hex)) hex = 0;
  const kind = (g.load === "buck" || g.load === "slug") ? g.load : "cartridge";
  for (let i = 0; i < cap; i++) {
    if (hex > 0) { out.push("k:hex:1:spent"); hex--; }
    else if (plain > 0) { out.push("k:" + kind + "::"); plain--; }
    else out.push("");
  }
  return out;
}
function cylinderHtml(g) {
  const tokens = chamberTokens(g);
  if (!tokens.length) return "";
  const next = tokens.findIndex(Boolean);
  return `<div class="chambers" aria-label="${esc(g.name || "Gun")} cylinder">${tokens.map((st, k) => {
    const s = String(st || "");
    let cls = "chamber";
    let style = "";
    let text = "";
    let label = "Empty";
    if (/^[1-9]$/.test(s) || s.indexOf("k:hex:") === 0) {
      const lv = s.indexOf("k:hex:") === 0 ? (s.split(":")[2] || "1") : s;
      const color = HEX_CASE[Math.max(0, (parseInt(lv, 10) || 1) - 1)] || "#9b6fd6";
      cls += " loaded tinted hex";
      style = `--case:${color}`;
      text = esc(lv);
      label = "Hex shell " + lv;
    } else if (s) {
      const kind = (s.split(":")[1] || "");
      if (SPECIAL_CASE[kind]) {
        cls += " loaded tinted";
        style = `--case:${SPECIAL_CASE[kind]}`;
        label = kind;
      } else {
        cls += " loaded brass";
        label = "Cartridge";
      }
    }
    if (k === next) cls += " next";
    return `<span class="${cls}"${style ? ` style="${style}"` : ""} title="${esc(label)}" aria-label="${esc(label)}">${text}</span>`;
  }).join("")}</div>`;
}
function rollFace(r) {
  let nat = Number(r && r.nat);
  if (!isFinite(nat) && r && /1d20|2d20/.test(String(r.formula || ""))) {
    const m = String(r.detail || "").match(/^(\d+)/);
    if (m) nat = Number(m[1]);
  }
  const crit = !!(r && (r.crit || nat === 20));
  let attack = !!(r && r.attack);
  if (!attack && r && /attack/i.test(String(r.label || "")) && /1d20|2d20/.test(String(r.formula || ""))) attack = true;
  if (crit) return { cls: "roll-crit", tag: "CRITICAL", attack: true, crit: true };
  if (attack) return { cls: "roll-attack", tag: "ATTACK", attack: true, crit: false };
  return { cls: "", tag: "", attack: false, crit: false };
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
    const hpCur = Number(s.hpCurrent);
    const downed = isFinite(hpCur) && hpCur <= 0;
    const initials = String(s.name || "?").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";
    const portrait = s.portrait
      ? `<img class="portrait" src="${esc(s.portrait)}" alt="">`
      : `<span class="portrait initials" aria-hidden="true">${esc(initials)}</span>`;
    const conds = String(s.conditions || "").split(",").map((c) => c.trim()).filter(Boolean);
    const condHtml = conds.map((c) => `<span class="cond-chip">${esc(c)}</span>`).join("");
    const ds = s.deathSaves || {};
    const dsHtml = downed
      ? `<div class="death-pips">Death saves ${((ds.success || []).filter(Boolean).length)} success / ${((ds.fail || []).filter(Boolean).length)} fail</div>`
      : "";
    const guns = (s.guns || []).filter((g) => g && g.name).map((g) => {
      const flags = [g.jammed ? "jammed" : "", g.cracked ? "cracked" : "", g.fouled ? "fouled" : "", g.dirty ? "dirty" : ""].filter(Boolean);
      const cls = g.jammed ? "jammed" : (g.condition === "worn" || g.condition === "cracked" ? "worn" : "");
      const cond = flags.length ? flags.join(", ") : (g.condition || "ok");
      return `<div class="gun-chip ${cls}"><div>${esc(g.name)} · ${g.loaded ?? "?"}/${g.capacity ?? "?"} rounds · ${esc(cond)}</div>${cylinderHtml(g)}</div>`;
    }).join("") || '<div class="gun-chip">No guns listed</div>';
    return `<button type="button" class="pcard ${on ? "" : "offline"} ${downed ? "downed" : ""}" data-pid="${esc(p.id)}">
      <div class="pcard-head">
        ${portrait}
        <div>
          <div class="pcard-name">${esc(s.name || "Unknown")}</div>
          <div class="pcard-sub">${esc(s.calling || "?")} · L${esc(s.level ?? "?")} · ${esc(s.player || "")}</div>
        </div>
        <span class="badge ${downed ? "danger" : (on ? "eld" : "")}">${downed ? "Down" : (on ? "Online" : "Away")}</span>
      </div>
      ${condHtml ? `<div class="cond-row">${condHtml}</div>` : ""}
      <div class="stat-row">
        <div class="stat"><b>${esc(s.hpCurrent ?? "—")}<small style="font-size:12px;color:var(--muted)">/${esc(s.hpMax ?? "—")}</small></b><span>HP</span></div>
        <div class="stat"><b>${esc(s.ac ?? "—")}</b><span>AC</span></div>
        <div class="stat"><b>${Number(s.es || 0).toLocaleString()}</b><span>ES</span></div>
      </div>
      ${dsHtml}
      ${guns}
      ${addictionLine(p.id)}
      ${slotLine(s) ? `<div class="slot-line">${esc(slotLine(s))}</div>` : ""}
    </button>`;
  }).join("");
  $$(".pcard", grid).forEach((btn) => btn.addEventListener("click", () => openDetail(btn.dataset.pid)));
}

function openDetail(pid) {
  const p = state.players[pid];
  if (!p) return;
  const s = p.snapshot || {};
  const overlay = $("#detailOverlay");
  if (overlay) overlay.dataset.pid = pid;
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

  const initials = String(s.name || "?").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";
  const portrait = s.portrait
    ? `<img class="portrait lg" src="${esc(s.portrait)}" alt="">`
    : `<span class="portrait lg initials">${esc(initials)}</span>`;
  $("#detailBody").innerHTML = `
    <div class="detail-id">${portrait}<div class="stat-row">
      <div class="stat"><b>${esc(s.hpCurrent)}/${esc(s.hpMax)}</b><span>HP</span></div>
      <div class="stat"><b>${esc(s.ac)}</b><span>AC</span></div>
      <div class="stat"><b>${Number(s.es || 0).toLocaleString()}</b><span>ES</span></div>
      <div class="stat"><b>${esc(s.hpTemp || 0)}</b><span>Temp</span></div>
    </div></div>
    <div class="detail-section"><h3>Abilities</h3><div class="abil-grid">${abilHtml}</div></div>
    <div class="detail-section"><h3>Saves</h3><p>${saves}</p></div>
    <div class="detail-section"><h3>Skills</h3><p>${skills}</p></div>
    <div class="detail-section"><h3>Guns</h3>${(s.guns || []).filter((g) => g && g.name).map((g) => `<div class="gun-chip ${g.jammed ? "jammed" : ""}"><div>${esc(g.name)} — ${esc(g.loaded)}/${esc(g.capacity)} ${esc(g.load || "")}</div>${cylinderHtml(g)}</div>`).join("") || "<p>—</p>"}</div>
    <div class="detail-section"><h3>Equipment</h3><pre>${esc(s.equipment || "—")}</pre></div>
    <div class="detail-section"><h3>Features</h3><pre>${esc(s.features || "—")}</pre></div>
    <div class="detail-section"><h3>Spells</h3><p>${esc(slotLine(s) || "No shell slots")}${s.spellAtk ? " · attack " + esc(s.spellAtk) : ""}${s.spellDC ? " · DC " + esc(s.spellDC) : ""}</p><pre>${esc(spellTxt)}</pre></div>
    <div class="detail-section"><h3>Personality</h3><p>${esc(s.personality || "—")}</p></div>
    <div class="detail-section"><h3>Eldorite addiction</h3>${addictionDetail(pid)}</div>
    <p class="lede" style="margin-top:12px">Snapshot · updated ${esc(fmtTime(s.updatedAt))}</p>
  `;
  const miss = $("#btnAddictMiss");
  if (miss) miss.addEventListener("click", () => missAddictionDay(pid));
  if (window.DMCCEnhance && window.DMCCEnhance.decorateDetail) window.DMCCEnhance.decorateDetail(pid);
  $("#detailOverlay").hidden = false;
}

function renderLedger() {
  const feed = $("#ledgerFeed");
  if (!state.ledger.length) {
    feed.innerHTML = '<div class="empty"><b>Ledger empty</b>ES changes and DM pushes show up here.</div>';
    renderLiveDock();
    return;
  }
  feed.innerHTML = state.ledger.filter((e) => e.type !== "addiction").map((e) => {
    const delta = (e.oldVal != null && e.newVal != null && typeof e.oldVal === "number" && typeof e.newVal === "number")
      ? `${e.oldVal} → ${e.newVal}` : (e.newVal != null ? String(e.newVal) : "");
    return `<div class="feed-item ${e.flag ? "flag" : ""}">
      <div class="feed-meta"><span>${esc(fmtTime(e.ts))}</span><span>${esc(ledgerNames(e))}</span><span class="badge">${esc(e.type)}</span>${e.flag ? '<span class="badge warn">Big jump</span>' : ""}</div>
      <div class="feed-what">${esc(e.what)}</div>
      ${delta ? `<div class="feed-delta">${esc(delta)}</div>` : ""}
    </div>`;
  }).join("");
  renderLiveDock();
}

const MONEY_TYPES = /es|store|reward|shard/i;
const ALERT_TYPES = /jam|explode|death|condition|alert|undo/i;
let dockSeen = 0;

function dockItems() {
  const rows = [];
  (state.chat || []).forEach((c) => rows.push({
    ts: c.ts, kind: "chat",
    who: (c.fromName || "Table") + (c.to && c.to !== "all" ? " → " + (c.toName || "one player") : ""),
    text: c.text || ""
  }));
  (state.ledger || []).forEach((e) => {
    if (e.type === "addiction") return;
    const money = MONEY_TYPES.test(String(e.type || ""));
    const alert = ALERT_TYPES.test(String(e.type || "")) || !!e.flag;
    rows.push({
      ts: e.ts,
      kind: money ? "money" : (alert ? "alerts" : "ledger"),
      who: ledgerNames(e) || e.who || "",
      text: e.what || e.type || ""
    });
  });
  (state.rolls || []).forEach((r) => {
    const face = rollFace(r);
    rows.push({
      ts: r.ts,
      kind: (r.nat1 && r.isFirearm) ? "alerts" : "rolls",
      who: r.who || "",
      cls: (r.private ? "private " : "") + (face.cls || ""),
      tag: r.private ? "PRIVATE" : face.tag,
      text: (r.label || "Roll") + " " + (r.formula || "") + " = " + (r.result ?? "") + (r.detail ? " · " + r.detail : "")
    });
  });
  (state.messages || []).forEach((m) => rows.push({
    ts: m.ts, kind: "alerts",
    who: "DM → " + (m.toName || m.to || "player"),
    text: m.text || ""
  }));
  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return rows;
}
function dockIsOpen() {
  if (!document.body.classList.contains("in-room")) return false;
  if (window.matchMedia("(max-width: 800px)").matches) return document.body.classList.contains("dock-open");
  return !document.body.classList.contains("dock-collapsed");
}
function fillDockTargets() {
  const sel = $("#dockTo");
  if (!sel) return;
  const keep = sel.value || "all";
  const opts = '<option value="all">Whole table</option>' + Object.keys(state.players || {}).map((id) => {
    const s = (state.players[id] && state.players[id].snapshot) || {};
    const label = [s.player, s.name].filter(Boolean).join(" · ") || id;
    return `<option value="${esc(id)}">${esc(label)}</option>`;
  }).join("");
  if (sel.dataset.sig === opts) { if (keep) sel.value = keep; return; }
  sel.dataset.sig = opts;
  sel.innerHTML = opts;
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function renderLiveDock() {
  const feed = $("#dockFeed");
  if (!feed) return;
  fillDockTargets();
  const filter = state.dockFilter || "all";
  const all = dockItems();
  const items = all.filter((row) => filter === "all" || row.kind === filter || (filter === "alerts" && row.kind === "alerts"));
  const stick = feed.dataset.stick !== "0";
  feed.innerHTML = items.slice(-80).map((row) =>
    `<div class="dock-item dock-${esc(row.kind)} ${esc(row.cls || "")}"><div class="dock-meta">${esc(fmtTime(row.ts))} · ${esc(row.who)}${row.tag ? ' · <span class="roll-tag">' + esc(row.tag) + "</span>" : ""}</div><div>${esc(row.text)}</div></div>`
  ).join("") || '<p class="lede">Nothing in this filter yet.</p>';
  if (stick) feed.scrollTop = feed.scrollHeight;
  if (dockIsOpen()) dockSeen = all.length;
  const unread = Math.max(0, all.length - dockSeen);
  const badge = $("#dockBadge");
  if (badge) { badge.hidden = unread < 1; badge.textContent = String(unread); }
}
async function sendDockChat(text, to) {
  const row = {
    id: uid("chat"),
    ts: new Date().toISOString(),
    from: state.uid || "demo_dm",
    fromName: "DM",
    text: text,
    to: to || "all"
  };
  if (to && to !== "all") {
    const names = namesFor(to);
    row.toName = names.characterName || names.playerName || to;
    await pushMessage({
      from: row.from, fromName: "DM", to: to, toName: row.toName, text: text, read: false
    });
    await pushCommand({ type: "message", to: to, payload: { text: text }, from: state.uid });
    toast("Sent to " + (row.toName || "that player"));
    const dockTo = $("#dockTo");
    if (dockTo) dockTo.value = "all";
    return;
  }
  if (state.demo || !state.db) {
    state.chat = state.chat || [];
    state.chat.push(row);
    renderLiveDock();
    toast("Sent to the table");
    return;
  }
  try {
    await state._fb.set(roomRef("chat/" + row.id), row);
    toast("Sent to the table");
  } catch (e) { toast("Chat failed"); console.warn(e); }
}

function renderRolls() {
  const feed = $("#rollsFeed");
  const visible = state.rolls.filter((r) => !r.private || state.demo || r.uid === state.uid || true);
  // DM sees private rolls; in demo DM is us
  if (!visible.length) {
    feed.innerHTML = '<div class="empty"><b>No rolls yet</b></div>';
    renderLiveDock();
    return;
  }
  if (window.DMCCEnhance && window.DMCCEnhance.onRolls) window.DMCCEnhance.onRolls(visible);
  feed.innerHTML = visible.map((r) => {
    const nat = r.nat1 && r.isFirearm;
    const face = rollFace(r);
    return `<div class="feed-item ${nat ? "nat1" : ""} ${face.cls} ${r.private ? "private" : ""}">
      <div class="feed-meta">
        <span>${esc(fmtTime(r.ts))}</span>
        <span>${esc(r.who)}</span>
        ${r.private ? '<span class="badge">Private</span>' : ""}${r.whisper ? '<span class="badge">Whisper</span>' : ""}
        ${face.tag ? '<span class="roll-tag">' + esc(face.tag) + "</span>" : ""}
        ${nat ? '<span class="badge danger">Nat 1 · firearm</span>' : ""}
      </div>
      <div class="feed-what"><b>${esc(r.label || "Roll")}</b> · ${esc(r.formula)} = <b style="color:var(--eld)">${esc(r.result)}</b> <span style="color:var(--muted)">(${esc(r.detail)})</span></div>
    </div>`;
  }).join("");
  renderLiveDock();
}

function renderMessages() {
  const feed = $("#msgFeed");
  if (!state.messages.length) {
    feed.innerHTML = '<div class="empty" style="padding:16px"><b>No private messages</b></div>';
    renderLiveDock();
    return;
  }
  feed.innerHTML = state.messages.map((m) => `
    <div class="feed-item">
      <div class="feed-meta"><span>${esc(fmtTime(m.ts))}</span><span>DM → ${esc(m.toName || m.to)}</span>${m.read ? "" : '<span class="badge eld">Unread</span>'}</div>
      <div class="feed-what">${esc(m.text)}</div>
    </div>`).join("");
  renderLiveDock();
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
    const reason = (($("#rewReason") && $("#rewReason").value) || "DM reward").trim() || "DM reward";
    for (const pid of (target === "all" ? Object.keys(state.players) : ids)) {
      const p = state.players[pid];
      const snap = (p && p.snapshot) || {};
      const name = snap.name || pid;
      const old = snap.es == null || snap.es === "" ? null : Number(snap.es);
      if (state.demo) await applyEsToDemoPlayer(pid, delta);
      const neu = old == null || !isFinite(old) ? null : old + delta;
      const flag = Math.abs(delta) >= 500;
      await pushLedger({
        who: "DM", playerId: pid, playerName: snap.player || "", characterName: name, type: "dm_push",
        what: reason + " (" + (delta >= 0 ? "+" : "") + delta + " ES) → " + name,
        oldVal: old, newVal: neu, flag
      });
      await pushCommand({
        type: "reward_es", to: pid, payload: { delta, reason: reason },
        from: state.uid
      });
    }
    if (state.demo) renderPlayers();
    if (window.SSDNSAudio) window.SSDNSAudio.play("reward");
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
  const msgTarget = $("#msgTarget");
  if (msgTarget) msgTarget.value = "";
  toast("Private message sent");
}

let rolling = false;
async function doDmRoll() {
  if (rolling) return;
  rolling = true;
  try {
    const label = ($("#rollLabel").value || "DM roll").trim();
    const formula = ($("#rollFormula").value || "1d20").trim();
    const priv = $("#rollPrivate").checked;
    const out = parseDice(formula);
    await pushRoll({
      who: "DM", playerId: null, uid: state.uid || "demo_dm",
      label, formula, result: out.total, detail: out.detail,
      nat1: out.nat1, isFirearm: false, private: priv
    });
    toast((priv ? "Private " : "Public ") + "roll: " + out.total);
  } finally { rolling = false; }
}

async function doHandout(send) {
  const name = ($("#hoName").value || "Handout").trim();
  const url = ($("#hoUrl").value || "").trim();
  const text = ($("#hoText") && $("#hoText").value || "").trim();
  const to = $("#hoTarget").value || "all";
  if (!url && !text) { toast("Add an image URL or some text"); return; }
  const entry = { name, url, text, to, sent: !!send };
  await pushHandout(entry);
  await pushLedger({
    who: "DM", playerId: to, type: "handout",
    what: "Handout: " + name + (to === "all" ? " (table)" : ""),
    oldVal: null, newVal: name, flag: false
  });
  if (send) await sendHandoutCommand(entry);
  else toast("Saved to handout list");
  $("#hoName").value = "";
  $("#hoUrl").value = "";
  if ($("#hoText")) $("#hoText").value = "";
}

async function sendHandoutCommand(h) {
  await pushCommand({
    type: "handout", to: h.to || "all",
    payload: { name: h.name, url: h.url || "", text: h.text || "" },
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
  const type = kind === "saloon" ? "open_saloon" : kind === "store" ? "open_store" : "open_tab";
  await pushCommand({ type: type, to, payload, from: state.uid });
  await pushLedger({
    who: "DM", playerId: to, type: type,
    what: (kind === "saloon" ? "Saloon opened" : kind === "store" ? "Store opened" : "Opened " + (payload.tab || kind)) + (to === "all" ? " for the table" : ""),
    oldVal: null, newVal: kind, flag: false
  });
  toast(kind === "saloon" ? "Saloon opened" : kind === "store" ? "Store opened" : "Sent");
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

async function wipeOwnedChildren() {
  const fb = state._fb;
  const paths = ["players", "ledger", "rolls", "messages", "handouts", "commands", "table", "chat"];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const snap = await fb.get(roomRef(path));
    const val = snap.val();
    if (!val || typeof val !== "object") continue;
    const keys = Object.keys(val);
    await Promise.all(keys.map((k) => fb.remove(roomRef(path + "/" + k))));
  }
}

function buildRecap() {
  const lines = [];
  const code = (state.meta && state.meta.code) || state.roomCode || "room";
  lines.push("SSDNS session recap");
  lines.push("Room: " + code + (state.meta && state.meta.name ? " · " + state.meta.name : ""));
  lines.push("Ended: " + new Date().toISOString());
  lines.push("");
  const by = {};
  state.ledger.forEach((e) => {
    const key = ledgerNames(e) || e.who || "Unknown";
    if (!by[key]) by[key] = { es: 0, damage: 0, heal: 0, notes: [] };
    const bucket = by[key];
    if (typeof e.oldVal === "number" && typeof e.newVal === "number" && /es|dm_push|saloon|store/i.test(String(e.type) + String(e.what))) {
      bucket.es += e.newVal - e.oldVal;
    }
    if (e.type === "damage") bucket.damage += Number(e.newVal != null && e.oldVal != null ? Math.abs(e.oldVal - e.newVal) : 0) || Number(String(e.what).match(/(\d+)/) ? String(e.what).match(/(\d+)/)[1] : 0);
    if (e.type === "heal") bucket.heal += Number(String(e.what).match(/(\d+)/) ? String(e.what).match(/(\d+)/)[1] : 0);
    if (/jam|explode|condition|rest|undo|store|note|Item/i.test(String(e.type) + " " + String(e.what))) bucket.notes.push(e.what);
  });
  lines.push("People");
  Object.keys(by).forEach((name) => {
    const b = by[name];
    lines.push("- " + name + ": ES net " + (b.es >= 0 ? "+" : "") + b.es + ", damage " + b.damage + ", healing " + b.heal);
    b.notes.slice(0, 8).forEach((n) => lines.push("  · " + n));
  });
  if (!Object.keys(by).length) lines.push("- No ledger lines.");
  lines.push("");
  lines.push("Notable events");
  state.ledger.filter((e) => /jam|explode|rest|undo|store|condition|dm_push/i.test(String(e.type))).slice(0, 40).forEach((e) => {
    lines.push("- " + fmtTime(e.ts) + " " + ledgerNames(e) + ": " + e.what);
  });
  return lines.join("\n");
}
async function endSession(wipe) {
  const recap = buildRecap();
  const archive = {
    archivedAt: new Date().toISOString(),
    meta: state.meta,
    ledger: state.ledger,
    rolls: state.rolls.filter((r) => !r.private),
    handouts: state.handouts,
    recap: recap
  };
  const codeName = state.roomCode || "demo";
  if (state.demo) {
    download(codeName + "-archive.json", JSON.stringify(archive, null, 2));
    setTimeout(() => download(codeName + "-recap.txt", recap, "text/plain"), 400);
    toast("Demo session ended · archive and recap downloaded" + (wipe ? " · wiped" : ""));
    if (wipe) { state.players = {}; state.ledger = []; state.rolls = []; state.messages = []; state.handouts = []; }
    hideRoom();
    return;
  }
  try {
    const aid = uid("arch");
    await state._fb.set(roomRef("archives/" + aid), archive);
    await state._fb.update(roomRef("meta"), { status: "ended", endedAt: new Date().toISOString() });
    if (wipe) {
      // keep meta+archives. Parent remove() is denied; delete each child the DM can write.
      await wipeOwnedChildren();
    }
    download(codeName + "-recap.txt", recap, "text/plain");
    toast("Session ended · ledger archived and recap saved" + (wipe ? " · live data wiped" : ""));
  } catch (e) {
    download(codeName + "-archive.json", JSON.stringify(archive, null, 2));
    download(codeName + "-recap.txt", recap, "text/plain");
    toast("Archive and recap downloaded locally (cloud write failed)");
  }
  try { localStorage.removeItem(ROOM_KEY); } catch (err) {}
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
  const priv = $("#rollPrivate");
  const privState = $("#rollPrivateState");
  if (priv && privState) {
    const paint = () => { privState.textContent = priv.checked ? "ON" : "OFF"; };
    priv.addEventListener("change", paint);
    paint();
  }
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
  $$("[data-dock-filter]").forEach((btn) => btn.addEventListener("click", () => {
    state.dockFilter = btn.getAttribute("data-dock-filter") || "all";
    $$("[data-dock-filter]").forEach((b) => b.classList.toggle("on", b === btn));
    renderLiveDock();
  }));
  const dockFeed = $("#dockFeed");
  if (dockFeed) dockFeed.addEventListener("scroll", () => {
    const gap = dockFeed.scrollHeight - dockFeed.scrollTop - dockFeed.clientHeight;
    dockFeed.dataset.stick = gap < 64 ? "1" : "0";
  });
  const dockForm = $("#dockChat");
  if (dockForm) dockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ($("#dockText").value || "").trim();
    if (!text) return;
    $("#dockText").value = "";
    sendDockChat(text, $("#dockTo") && $("#dockTo").value);
  });
  const collapse = $("#btnDockCollapse");
  if (collapse) collapse.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 800px)").matches) {
      document.body.classList.remove("dock-open");
      renderLiveDock();
      return;
    }
    document.body.classList.toggle("dock-collapsed");
    collapse.textContent = document.body.classList.contains("dock-collapsed") ? "Show" : "Hide";
    try { localStorage.setItem("ssdns.dmcc.dock", document.body.classList.contains("dock-collapsed") ? "closed" : "open"); } catch (err) {}
    renderLiveDock();
  });
  const fab = $("#btnDockFab");
  if (fab) fab.addEventListener("click", () => {
    document.body.classList.toggle("dock-open");
    if (document.body.classList.contains("dock-open")) dockSeen = dockItems().length;
    renderLiveDock();
  });
  const alertBar = $("#addictionAlert");
  if (alertBar) alertBar.addEventListener("click", () => { alertBar.hidden = true; });
  window.addEventListener("storage", (e) => {
    if (e.key !== "ssdns.v1.consumePing" || !e.newValue) return;
    try { takeConsumePing(JSON.parse(e.newValue)); } catch (err) { console.warn("[DMCC] consume", err); }
  });
  try {
    if (localStorage.getItem("ssdns.dmcc.dock") === "closed") {
      document.body.classList.add("dock-collapsed");
      if (collapse) collapse.textContent = "Show";
    }
  } catch (err) {}
}

async function tryResumeLive() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(ROOM_KEY) || "null"); } catch (e) {}
  if (!saved || saved.demo || !saved.code || !saved.uid || saved.uid !== state.uid) return false;
  try {
    const snap = await state._fb.get(state._fb.ref(state.db, "rooms/" + saved.code + "/meta"));
    if (!snap.exists()) return false;
    const meta = snap.val();
    if (!meta || meta.status === "ended" || meta.dmUid !== state.uid) return false;
    state.demo = false;
    state.roomCode = saved.code;
    state.meta = meta;
    state.players = {};
    state.ledger = [];
    state.rolls = [];
    state.messages = [];
    state.handouts = [];
    state.commands = [];
    attachLiveListeners();
    showRoom();
    renderAll();
    setStatus("live", "Rejoined " + saved.code + " · players stay connected");
    toast("Rejoined " + saved.code);
    return true;
  } catch (e) {
    console.warn("[DMCC] resume", e);
    return false;
  }
}

window.DMCC = {
  version: VERSION,
  state: state,
  $: $,
  $$: $$,
  esc: esc,
  uid: uid,
  toast: toast,
  parseDice: parseDice,
  deepClone: deepClone,
  download: download,
  fmtTime: fmtTime,
  pushLedger: pushLedger,
  pushRoll: pushRoll,
  pushCommand: pushCommand,
  pushMessage: pushMessage,
  pushHandout: pushHandout,
  doDmRoll: doDmRoll,
  renderPlayers: renderPlayers,
  renderAll: renderAll,
  recordConsume: recordConsume,
  missAddictionDay: missAddictionDay,
  renderLedger: renderLedger,
  openDetail: openDetail,
  roomRef: roomRef,
  namesFor: namesFor
};

async function boot() {
  wire();
  state.demo = wantDemo();
  $("#chkDemo").checked = state.demo;
  setStatus("demo", "Starting…");
  const lobbyVer = $("#lobbyVersion");
  if (lobbyVer) lobbyVer.textContent = "DMCC " + VERSION;

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
      const resumed = await tryResumeLive();
      if (!resumed) {
        setStatus("live", "Live · Firebase connected · create a room");
        $("#lobby").hidden = false;
        $("#roomShell").hidden = true;
      }
    }
  }
}

boot();

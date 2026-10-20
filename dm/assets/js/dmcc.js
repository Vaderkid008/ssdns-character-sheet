/**
 * SSDNS DM Command Center v0.1.0-draft
 * Demo mode (?demo=1, or Load demo table) is fully offline — no Firebase CDN load.
 * Create room always opens a live Firebase table.
 * Live Firebase path dynamic-imports modular v10+ and degrades if RTDB/auth missing.
 */

const VERSION = "0.2.101"; // dmcc-playtest-v02101
const NOTES_KEY = "ssdns.dm.notes";
const ROOM_KEY = "ssdns.dm.lastRoom";
const OPEN_KEY = "ssdns.dm.open";
function migrateDmKey(next, prev) {
  try {
    if (localStorage.getItem(next) == null) {
      const old = localStorage.getItem(prev);
      if (old != null) localStorage.setItem(next, old);
    }
  } catch (e) {}
}
migrateDmKey(NOTES_KEY, "ssdns.dmcc.notes");
migrateDmKey(ROOM_KEY, "ssdns.dmcc.lastRoom");
let sessionOpen = false;
function releaseSession() {
  sessionOpen = false;
  try { sessionStorage.removeItem(OPEN_KEY); } catch (e) {}
}
function rememberOpenSession() {
  sessionOpen = true;
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify({ code: state.roomCode, demo: !!state.demo }));
  } catch (e) {}
}
function readOpenFlag() {
  try { return JSON.parse(sessionStorage.getItem(OPEN_KEY) || "null"); } catch (e) { return null; }
}
const WORDS = ["DUST", "IRON", "HEX", "RUST", "BONE", "COIL", "SAGE", "RAIL", "OXEN", "VELD", "ASH", "QUILL"];

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
/* L0184: older player snapshots may still carry pre-PHB #6 labels (see renames.js); show the new names. */
const relabel = (s) => (window.SSDNSRenames ? window.SSDNSRenames.text(s) : s);

function uid(prefix) {
  return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function roomCode() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = String(Math.floor(1000 + Math.random() * 9000));
  return w + "-" + n;
}
function fmtTime(iso) {
  if (window.SSDNSClock) return window.SSDNSClock.format(iso, true);
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
function writeFailed(err, fallback) {
  const msg = (err && (err.code || err.message)) || String(err || "");
  const denied = /permission[_\s-]*denied/i.test(String(msg));
  toast(denied ? "Couldn't sync to players: permission denied" : (fallback || "Couldn't sync to players"));
  console.warn(err);
}
function setCreateBusy(busy) {
  const main = $("#btnCreateRoom");
  if (main) {
    main.disabled = !!busy;
    main.textContent = busy ? "Connecting…" : "Create room";
  }
}
function isFormField(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  const tag = el.tagName || "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}
function fieldSnap(el) {
  if (!isFormField(el)) return null;
  const kind = el.hasAttribute("data-init-val") ? "init" : el.hasAttribute("data-hp-val") ? "hp" : el.hasAttribute("data-ac-val") ? "ac" : "";
  return {
    id: el.id || "",
    kind: kind,
    rowId: el.getAttribute("data-row-id") || "",
    value: "value" in el ? el.value : "",
    start: typeof el.selectionStart === "number" ? el.selectionStart : null,
    end: typeof el.selectionEnd === "number" ? el.selectionEnd : null
  };
}
function findField(snap) {
  if (!snap) return null;
  if (snap.rowId && snap.kind) {
    const hit = document.querySelector('[data-' + snap.kind + '-val][data-row-id="' + (window.CSS && CSS.escape ? CSS.escape(snap.rowId) : snap.rowId) + '"]');
    if (hit) return hit;
  }
  if (snap.id) return document.getElementById(snap.id);
  return null;
}
function restoreField(snap) {
  const el = findField(snap);
  if (!el) return;
  if ("value" in el && snap.value != null && el.value !== snap.value) el.value = snap.value;
  if (document.activeElement !== el) {
    try { el.focus({ preventScroll: true }); } catch (err) { try { el.focus(); } catch (e2) {} }
  }
  try { if (snap.start != null && el.setSelectionRange) el.setSelectionRange(snap.start, snap.end); } catch (err) {}
}
function guardFocus(fn) {
  const active = document.activeElement;
  const snap = isFormField(active) ? fieldSnap(active) : null;
  const node = active;
  fn();
  if (!snap) return;
  if (node && document.contains(node)) {
    if ("value" in node && document.activeElement === node && node.value !== snap.value) node.value = snap.value;
    if (document.activeElement !== node) restoreField(snap);
    else try { if (snap.start != null && node.setSelectionRange && node.selectionStart !== snap.start) node.setSelectionRange(snap.start, snap.end); } catch (err) {}
    return;
  }
  restoreField(snap);
}
function listenRef(path, handler) {
  const r = roomRef(path);
  const fb = state._fb;
  const unsub = fb.onValue(r, (snap) => handler(snap.val()), (err) => {
    console.warn("[DMCC] listen", path, err);
    setStatus("offline", "Live sync error · " + (err.message || "see console"));
  });
  state.unsubs.push(typeof unsub === "function" ? unsub : () => { try { fb.off(r, "value", unsub); } catch (e) {} });
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
  const forced = sides === 20 && n === 1 && window.SSDNSTestRoll && window.SSDNSTestRoll();
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(forced || (1 + Math.floor(Math.random() * sides)));
  const sum = rolls.reduce((a, b) => a + b, 0) + mod;
  const detail = rolls.join("+") + (mod ? (mod >= 0 ? "+" : "") + mod : "");
  const nat1 = n === 1 && sides === 20 && rolls[0] === 1;
  return { total: sum, detail, nat1, rolls };
}
function rollChecked(formula, mode, extra) {
  const bonus = Number(extra) || 0;
  const first = parseDice(formula);
  const sign = (n) => (n > 0 ? "+" + n : String(n));
  if (mode !== "adv" && mode !== "dis") {
    return {
      total: first.total + bonus,
      detail: first.detail + (bonus ? sign(bonus) : ""),
      nat1: first.nat1,
      rolls: first.rolls
    };
  }
  const second = parseDice(formula);
  const pick = mode === "adv"
    ? (first.total >= second.total ? first : second)
    : (first.total <= second.total ? first : second);
  return {
    total: pick.total + bonus,
    detail: first.detail + " / " + second.detail + (bonus ? sign(bonus) : "") + (mode === "adv" ? " adv" : " dis"),
    nat1: pick.nat1,
    rolls: pick.rolls
  };
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
  kicked: {},
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
  return q.get("demo") === "1";
}

/* ---------- Firebase init (graceful) ---------- */
let firebaseBoot = null;
async function initFirebase() {
  if (state.firebaseReady && state.app) return true;
  if (firebaseBoot) return firebaseBoot;
  firebaseBoot = runFirebaseInit().then((ok) => {
    if (!ok) firebaseBoot = null;
    return ok;
  }, (err) => {
    firebaseBoot = null;
    throw err;
  });
  return firebaseBoot;
}
async function runFirebaseInit() {
  const cfg = window.SSDNS_FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) {
    state.firebaseError = "Missing firebase-config.js";
    return false;
  }
  try {
    const [{ initializeApp, getApp }, authMod, dbMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js")
    ]);
    state._fb = {
      initializeApp,
      getApp,
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
    try {
      state.app = fb.initializeApp(cfg, "ssdns-dm");
    } catch (err) {
      if (!/already exists/i.test(String((err && err.message) || err))) throw err;
      state.app = fb.getApp("ssdns-dm");
    }
    state.auth = fb.getAuth(state.app);
    const emu = /(?:\?|&)emu=1(?:&|$)/.test(String((window.location && window.location.search) || ""));
    if (emu && authMod.connectAuthEmulator) {
      try { authMod.connectAuthEmulator(state.auth, "http://127.0.0.1:9099", { disableWarnings: true }); }
      catch (err) {}
    }
    state.db = fb.getDatabase(state.app);
    if (emu && dbMod.connectDatabaseEmulator) {
      try { dbMod.connectDatabaseEmulator(state.db, "127.0.0.1", 9000); }
      catch (err) {}
    }
    await fb.signInAnonymously(state.auth);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Auth timeout")), 8000);
      fb.onAuthStateChanged(state.auth, (user) => {
        if (!user) {
          if (sessionOpen) fb.signInAnonymously(state.auth).catch(() => {});
          return;
        }
        state.uid = user.uid;
        state.firebaseReady = true;
        clearTimeout(t);
        resolve(user);
      }, reject);
    });
    // Anonymous sign-in is the readiness check. ref(".info/connected") throws
    // "Invalid token in path" in the modular SDK, which was forcing Demo mode.
    try {
      fb.onValue(fb.ref(state.db, ".info/serverTimeOffset"), (snap) => {
        if (window.SSDNSClock) window.SSDNSClock.setOffset(snap.val() || 0);
      });
    } catch (err) { /* offset is optional */ }
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
function loadDemo(createNewCode, resumeCode) {
  const D = window.DMCC_DEMO;
  state.demo = true;
  state.roomCode = createNewCode ? roomCode() : (resumeCode || D.roomCode);
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
  if (window.DMCCEnhance && window.DMCCEnhance.enterRoom) window.DMCCEnhance.enterRoom();
  setStatus("demo", "Demo mode · offline · code " + state.roomCode);
  try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code: state.roomCode, demo: true })); } catch (e) {}
}

async function createLiveRoom(name) {
  if (!state.firebaseReady || !state._fb) {
    toast("Firebase isn't ready yet. Use Load demo table to practice offline.");
    setStatus("offline", "Firebase isn't ready");
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
    if (window.DMCCEnhance && window.DMCCEnhance.enterRoom) window.DMCCEnhance.enterRoom();
    setStatus("live", "Live · Firebase · " + code);
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code, demo: false, uid: state.uid })); } catch (e) {}
  } catch (e) {
    console.warn(e);
    toast("Could not create the room (" + ((e && e.message) || e) + ").");
    state.roomCode = null;
    state.meta = null;
    setStatus("live", "Live · Firebase connected · start a new session");
  }
}

function attachLiveListeners() {
  clearUnsubs();
  if (!state.db || !state.roomCode) return;
  state._listenCode = state.roomCode;
  addictionReady = false;
  const bind = (path, handler) => listenRef(path, handler);
  bind("meta", (v) => { if (v) { state.meta = v; if (window.SSDNSItems && window.SSDNSItems.setRoom) window.SSDNSItems.setRoom({ weightOn: !!v.weightOn, catalog: v.itemCatalog || {} }); if (window.SSDNSItems && window.SSDNSItems.paintDm) window.SSDNSItems.paintDm(); guardFocus(() => renderRoomHero()); } });
  bind("encounter/requests", (v) => {
    const rows = v || {};
    state.bankReqs = rows;
    state._bankSeen = state._bankSeen || {};
    Object.keys(rows).forEach((id) => {
      const row = rows[id];
      if (!row || row.type !== "bank" || row.resolved || state._bankSeen[id]) return;
      state._bankSeen[id] = 1;
      toast((row.characterName || "A player") + " asks the bank for " + (Number(row.amount) || 0) + " ES");
    });
    renderBankReqs();
    state._mercySeen = state._mercySeen || {};
    Object.keys(rows).forEach((id) => {
      const row = rows[id];
      if (!row || row.type !== "mercy" || state._mercySeen[id] || row.applied) return;
      state._mercySeen[id] = 1;
      const amount = Number(row.amount) || 0;
      if (!amount || !row.targetId) return;
      pushCommand({
        type: "hp",
        to: row.targetId,
        quiet: true,
        payload: { delta: amount, kind: "heal", grantId: "mercy:" + id, text: (row.characterName || "Mercy Hands") + " heals " + amount }
      });
    });
  });
  const presenceState = {};
  const leaveTimers = {};
  bind("players", (v) => {
    state.players = v || {};
    if (window.SSDNSMapHost && window.SSDNSMapHost.setPlayers) {
      window.SSDNSMapHost.setPlayers(Object.keys(state.players).map((id) => {
        const s = (state.players[id] && state.players[id].snapshot) || {};
        return { uid: id, id: id, name: s.name || s.player || id };
      }));
    }
    Object.keys(state.players).forEach((id) => {
      const p = state.players[id] || {};
      const on = playerOnline(p);
      const s = p.snapshot || {};
      const who = [s.player, s.name].filter(Boolean).join(" · ") || id;
      const prev = presenceState[id] || { phase: "new", pending: false };
      const step = window.SSDNSApplied && window.SSDNSApplied.presenceStep
        ? window.SSDNSApplied.presenceStep(prev, on)
        : { phase: on ? "online" : prev.phase, pending: !on && prev.phase === "online", log: "", arm: !on && prev.phase === "online" && !prev.pending, cancel: on && prev.pending };
      presenceState[id] = { phase: step.phase, pending: step.pending };
      state.presenceHold = state.presenceHold || {};
      state.presenceHold[id] = step.phase;
      if (step.cancel && leaveTimers[id]) {
        clearTimeout(leaveTimers[id]);
        delete leaveTimers[id];
      }
      if (step.log === "join") {
        const already = (state.ledger || []).some((e) => e && (e.type === "join" || e.type === "rejoin") && e.playerId === id);
        if (!already) {
          pushLedger({
            who: who, playerId: id, playerName: s.player || "", characterName: s.name || "",
            type: "join", what: who + " joined the table", oldVal: null, newVal: "joined", flag: false
          });
        }
      } else if (step.log === "rejoin") {
        pushLedger({
          who: who, playerId: id, playerName: s.player || "", characterName: s.name || "",
          type: "rejoin", what: who + " rejoined the table", oldVal: null, newVal: "rejoined", flag: false
        });
      }
      if (step.arm && !leaveTimers[id]) {
        const wait = window.SSDNSApplied && window.SSDNSApplied.PRESENCE_LEAVE_MS || 30000;
        leaveTimers[id] = setTimeout(() => {
          delete leaveTimers[id];
          const still = state.players[id];
          if (still && playerOnline(still)) {
            presenceState[id] = { phase: "online", pending: false };
            return;
          }
          const done = window.SSDNSApplied && window.SSDNSApplied.presenceLeave
            ? window.SSDNSApplied.presenceLeave()
            : { phase: "offline", pending: false };
          presenceState[id] = { phase: done.phase, pending: false };
          state.presenceHold = state.presenceHold || {};
          state.presenceHold[id] = done.phase;
          const snap = (still && still.snapshot) || s;
          const name = [snap.player, snap.name].filter(Boolean).join(" · ") || who;
          pushLedger({
            who: name, playerId: id, playerName: snap.player || "", characterName: snap.name || "",
            type: "leave", what: name + " left the table", oldVal: null, newVal: "left", flag: false
          });
          if (window.DMCCEnhance && window.DMCCEnhance.notePresence) window.DMCCEnhance.notePresence(id, false);
        }, wait);
      }
      if (on && window.DMCCEnhance && window.DMCCEnhance.notePresence) window.DMCCEnhance.notePresence(id, true);
    });
    guardFocus(() => {
      holdUi(() => {
        renderPlayers();
        fillTargetSelects();
        renderPresence();
        renderRoomHero();
        if (window.DMCCEnhance && window.DMCCEnhance.fillAdds) window.DMCCEnhance.fillAdds();
        if (window.DMCCEnhance && window.DMCCEnhance.syncPlayers) window.DMCCEnhance.syncPlayers();
        const overlay = $("#detailOverlay");
        const typing = overlay && document.activeElement && overlay.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if (overlay && !overlay.hidden && overlay.dataset.pid && !typing) openDetail(overlay.dataset.pid);
      });
    });
  });
  bind("ledger", (v) => {
    const next = objToArr(v).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    noteAddiction(next);
    state.ledger = dedupeById(next);
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
  bind("playerInit", (v) => {
    state.playerInit = v || {};
    if (window.DMCCEnhance && window.DMCCEnhance.onPlayerInit) window.DMCCEnhance.onPlayerInit(v || {});
  });
  bind("chat", (v) => {
    const rows = objToArr(v);
    state.chat = (window.SSDNSApplied && window.SSDNSApplied.dedupeById ? window.SSDNSApplied.dedupeById(rows) : dedupeById(rows))
      .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    renderLiveDockNow();
  });
  bind("kicked", (v) => {
    state.kicked = v && typeof v === "object" ? v : {};
    renderPlayers();
    renderKicked();
  });
  if (!state._visCatch) {
    state._visCatch = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      paintFeedsNow();
      catchUpFeeds();
    });
  }
}
function paintFeedsNow() {
  renderPlayers();
  renderLedger();
  renderRolls();
  renderMessages();
  renderHandouts();
  renderLiveDockNow();
  if (window.DMCCEnhance && window.DMCCEnhance.renderFight) window.DMCCEnhance.renderFight();
}
async function catchUpFeeds() {
  if (state.demo || !state.db || !state.roomCode || !state._fb) return;
  const code = state.roomCode;
  const fb = state._fb;
  const pull = async (path) => {
    const snap = await fb.get(roomRef(path));
    return snap.val();
  };
  try {
    const [rolls, ledger, players, handouts, messages] = await Promise.all([
      pull("rolls"), pull("ledger"), pull("players"), pull("handouts"), pull("messages")
    ]);
    if (state.roomCode !== code) return;
    const allRolls = objToArr(rolls).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    noteConsumeRolls(allRolls);
    state.rolls = allRolls.filter((r) => !isConsumeRoll(r));
    const nextLedger = objToArr(ledger).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    noteAddiction(nextLedger);
    state.ledger = dedupeById(nextLedger);
    state.players = players || {};
    state.handouts = objToArr(handouts).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    state.messages = objToArr(messages).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    paintFeedsNow();
  } catch (e) { /* the live listeners still own the next snapshot */ }
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
  state._fb.set(roomRef("archives/addiction/" + pid), row).catch((e) => writeFailed(e, "Couldn't sync to players"));
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
  const who = String((e && e.who) || "").trim();
  if (/^dm$/i.test(who)) {
    const looked = namesFor(e.playerId);
    const target = e.characterName || looked.characterName || e.playerName || looked.playerName || "";
    if (e.playerId && e.playerId !== "all" && target && !/^dm$/i.test(target)) return "DM → " + target;
    return "DM";
  }
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
  catch (e) { writeFailed(e, "Ledger write failed"); }
}

async function pushRoll(entry) {
  entry.id = entry.id || uid("r");
  entry.ts = entry.ts || new Date().toISOString();
  if (window.SSDNSDice && window.SSDNSDice.showRoll) {
    try { window.SSDNSDice.showRoll(entry); } catch (err) {}
  }
  if (state.demo || !state.db || !state.roomCode) {
    state.rolls.unshift(entry);
    renderRolls();
    return;
  }
  try {
    await state._fb.set(roomRef("rolls/" + entry.id), entry);
    if (!entry.private) {
      const one = !(entry.freeShot || entry.heal || entry.attack) && !/→/.test(String(entry.detail || "")) ? singleDie(entry) : null;
      const text = entry.freeShot && entry.detail ? entry.detail : one ? one.text : (entry.label || "Roll") + " " + (entry.formula || "") + " = " + (entry.result ?? "") + (entry.detail ? " (" + entry.detail + ")" : "");
      const feed = {
        id: entry.id, ts: entry.ts, from: state.uid || "dm", fromName: "DM",
        text: text, kind: "roll", who: entry.who || "DM",
        formula: entry.formula || "", dice: Array.isArray(entry.dice) ? entry.dice : null
      };
      // One public copy. A roll command as well made the player log the same roll twice.
      try { await state._fb.set(roomRef("tableFeed/" + entry.id), feed); } catch (err) { writeFailed(err, "Couldn't sync to players"); }
    }
  }
  catch (e) { writeFailed(e, "Roll write failed"); }
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
  catch (e) { writeFailed(e, "Message failed"); }
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
  catch (e) { writeFailed(e, "Handout failed"); }
}

function renderBankReqs() {
  const box = document.getElementById("bankReqs");
  if (!box) return;
  const rows = state.bankReqs || {};
  box.textContent = "";
  const ids = Object.keys(rows).filter((id) => {
    const row = rows[id];
    return row && row.type === "bank" && !row.resolved;
  });
  if (!ids.length) { box.hidden = true; return; }
  box.hidden = false;
  ids.forEach((id) => {
    const row = rows[id];
    const card = document.createElement("div");
    card.className = "bank-req";
    const p = document.createElement("p");
    const who = row.characterName || "A player";
    p.textContent = who + " asks the bank for " + (Number(row.amount) || 0) + " ES. " + (row.reason || "");
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "btn btn-primary";
    approve.textContent = "Approve";
    approve.addEventListener("click", () => settleBank(id, true));
    const decline = document.createElement("button");
    decline.type = "button";
    decline.className = "btn";
    decline.textContent = "Decline";
    decline.addEventListener("click", () => settleBank(id, false));
    card.appendChild(p);
    card.appendChild(approve);
    card.appendChild(decline);
    box.appendChild(card);
  });
}
async function settleBank(id, ok) {
  const row = (state.bankReqs || {})[id];
  if (!row || row.resolved || row.type !== "bank") return;
  row.resolved = true;
  row.approved = !!ok;
  const amount = Math.floor(Number(row.amount) || 0);
  if (ok && amount > 0 && row.from) {
    await pushCommand({
      type: "reward_es",
      to: row.from,
      quiet: true,
      payload: { delta: amount, reason: row.reason || "Bank", grantId: "bank:" + (row.clientId || id) }
    });
    toast("Bank approved " + amount + " ES");
  } else if (row.from) {
    await pushCommand({
      type: "bank_reply",
      to: row.from,
      quiet: true,
      payload: { ok: false, requestId: row.clientId || id, amount }
    });
    toast("Bank declined");
  }
  renderBankReqs();
  if (state.demo || !state.db || !state._fb) return;
  try {
    await state._fb.update(roomRef("encounter/requests/" + id), { resolved: true, approved: !!ok });
  } catch (e) { writeFailed(e, "Couldn't close the bank request"); }
}
window.SSDNSBank = {
  show: function (rows) { state.bankReqs = rows || {}; renderBankReqs(); }
};

async function pushCommand(cmd) {
  cmd.id = cmd.id || uid("cmd");
  cmd.ts = cmd.ts || new Date().toISOString();
  if (cmd.payload && (cmd.type === "reward_es" || cmd.type === "reward_item" || cmd.type === "hp" || cmd.type === "gun")) {
    if (!cmd.payload.grantId) cmd.payload.grantId = cmd.id;
  }
  if (state.demo) {
    state.commands.unshift(cmd);
    if (!cmd.quiet) toast("Command queued (demo): " + cmd.type + (cmd.to && cmd.to !== "all" ? " → " + cmd.to : " → all"));
    return;
  }
  const to = cmd.to || "all";
  const copy = to && to !== "all" ? "inbox/" + to + "/" + cmd.id : "broadcast/" + cmd.id;
  try {
    const results = await Promise.allSettled([
      state._fb.set(roomRef("commands/" + cmd.id), cmd),
      state._fb.set(roomRef(copy), cmd)
    ]);
    const inboxFailed = results[1] && results[1].status === "rejected";
    const logFailed = results[0] && results[0].status === "rejected";
    if (inboxFailed) writeFailed(results[1].reason, "Couldn't sync to players");
    else if (logFailed) writeFailed(results[0].reason, "Command failed");
    else if (!cmd.quiet) toast("Sent: " + cmd.type);
  } catch (e) { writeFailed(e, "Command failed"); }
}

/* 0.2.75: DMCC gun panel. One status line, then only the fixes that apply to the gun right now,
   then Repair (always), then the test toggles folded away. */
function gunStatusParts(g) {
  g = g || {};
  const lockN = Array.isArray(g.lockedChambers) ? g.lockedChambers.length : 0;
  const bits = [];
  const streak = Number(g.misStreak) || 0;
  if (streak) bits.push("Streak " + streak);
  if (g.jammed) bits.push("Jammed");
  if (g.dirty) bits.push("Dirty");
  if (lockN) bits.push("LOCKED UP \u00d7" + lockN);
  if (g.pendingD4) bits.push("d4 pending");
  if (g.exploded) bits.push("Exploded");
  if (g.ruined || g.broken) bits.push("Ruined");
  else if (g.fouled) bits.push("Fouled");
  return bits;
}
function gunStatusHtml(g) {
  const bits = gunStatusParts(g);
  const bad = bits.some((b) => b !== "Streak " + (Number(g && g.misStreak) || 0));
  return `<p class="gun-status ${bits.length ? (bad ? "gun-status-bad" : "gun-status-warn") : "gun-status-ok"}" data-gun-status>${bits.length ? esc(bits.join(" \u00b7 ")) : "OK \u00b7 ready to fire"}</p>`;
}
function gunRepairList(g) {
  g = g || {};
  const lockN = Array.isArray(g.lockedChambers) ? g.lockedChambers.length : 0;
  const list = [];
  if (g.exploded) list.push("the explosion mark");
  if (g.ruined || g.broken) list.push("Ruined");
  else if (g.fouled) list.push("Fouled");
  if (g.jammed) list.push("the jam");
  if (g.dirty) list.push("Dirty");
  if (lockN) list.push(lockN + " locked chamber" + (lockN === 1 ? "" : "s"));
  if (g.pendingD4) list.push("the pending d4");
  if (Number(g.misStreak) || 0) list.push("the misfire streak (" + Number(g.misStreak) + ")");
  return list;
}
function gunFixButtonsHtml(g, sheetI) {
  g = g || {};
  const lockN = Array.isArray(g.lockedChambers) ? g.lockedChambers.length : 0;
  const fouled = !!(g.fouled || g.ruined || g.broken);
  const b = [];
  if (g.jammed && !fouled && !g.pendingD4) b.push(`<button type="button" class="btn sm" data-gun-op="clean" data-clean="unjam" data-gun-i="${sheetI}">Unjam</button>`);
  if (g.dirty && !fouled) b.push(`<button type="button" class="btn sm" data-gun-op="misfire" data-mf="clean-dirt" data-gun-i="${sheetI}" title="Clears Dirty and resets the streak, like a cleaning kit">Clean dirt</button>`);
  if (lockN) b.push(`<button type="button" class="btn sm" data-gun-op="clear-locks" data-lock-mode="one" data-gun-i="${sheetI}">Reopen 1 locked chamber</button>`);
  if (lockN > 1) b.push(`<button type="button" class="btn sm" data-gun-op="clear-locks" data-lock-mode="all" data-gun-i="${sheetI}">Reopen all locked chambers</button>`);
  if (g.pendingD4) b.push(`<button type="button" class="btn sm" data-gun-op="misfire" data-mf="cancel" data-gun-i="${sheetI}" title="Drops the d4 roll and resets the streak">Cancel d4</button>`);
  if (fouled) b.push(`<button type="button" class="btn sm" data-gun-op="misfire" data-mf="clear-foul" data-gun-i="${sheetI}" title="Clears Fouled and Ruined only">Clear Fouled</button>`);
  b.push(`<button type="button" class="btn sm btn-repair" data-gun-op="repair" data-gun-i="${sheetI}" title="Clears every misfire state on this gun">Repair gun (clear everything)</button>`);
  return `<div class="gun-row gun-fix-row">${b.join("")}</div>`;
}
function misfireOverrideWords(payload) {
  const bits = [];
  if (payload.resetStreak) bits.push("streak reset");
  if (payload.cancelD4) bits.push("pending d4 cancelled");
  ["dirty", "fouled", "ruined"].forEach((k) => {
    if (payload[k] == null) return;
    bits.push((payload[k] ? "set " : "cleared ") + k);
  });
  return bits.join(", ") || "gun";
}
async function postDmAction(text, playerId) {
  const id = uid("dmact");
  const entry = {
    id, ts: new Date().toISOString(), who: "DM", playerId: playerId || "all",
    type: "dm", what: text, oldVal: null, newVal: text, flag: false
  };
  await pushLedger(entry);
  const feed = { id, ts: entry.ts, from: state.uid || "dm", fromName: "DM", text, kind: "dm", who: "DM" };
  if (state.demo) return feed;
  try { await state._fb.set(roomRef("tableFeed/" + id), feed); }
  catch (err) { writeFailed(err, "Couldn't sync the DM action"); }
  return feed;
}
/** 0.2.67: the pile a demo reload draws from: the gun's chosen pool, else its only/first matching pool. */
function demoReloadPool(snapshot, g) {
  const pools = Array.isArray(g && g.pools) ? g.pools : [];
  if (!pools.length) return null;
  const want = g.ammoPool !== "" && g.ammoPool != null ? Number(g.ammoPool) : null;
  const chosen = want != null ? pools.find((row) => Number(row.idx) === want) : null;
  return chosen || pools.find((row) => (Number(row.count) || 0) > 0) || pools[0];
}
function demoGunAt(snapshot, index) {
  const guns = (snapshot && snapshot.guns) || [];
  const n = Number(index);
  if (!isFinite(n)) return null;
  const tagged = guns.find((g) => g && g.index != null && g.index !== "" && Number(g.index) === n);
  if (tagged) return tagged;
  return guns[n] || null;
}
function grantDemoTestGun(snapshot, payload) {
  const jam = window.SSDNSTestJammer && window.SSDNSTestJammer.weapon ? window.SSDNSTestJammer.weapon() : null;
  const id = jam && jam.id ? jam.id : "test-jammer";
  const name = jam && jam.name ? jam.name : "TEST Jammer";
  const cap = jam && jam.capacity ? jam.capacity : 6;
  const guns = snapshot.guns || (snapshot.guns = []);
  let slot = guns.find((g) => g && g.weapon === id);
  if (!slot) {
    slot = {};
    guns.push(slot);
  }
  const chambers = [];
  for (let k = 0; k < cap; k++) chambers.push("k:percussion::medium");
  const index = payload.index != null && payload.index !== "" && isFinite(Number(payload.index))
    ? Number(payload.index)
    : (slot.index != null && slot.index !== "" ? Number(slot.index) : guns.indexOf(slot));
  Object.assign(slot, {
    name: name,
    weapon: id,
    action: jam && jam.action ? jam.action : "Percussion revolver (slow)",
    ammo: "percussion",
    group: "pistol",
    tier: "medium",
    capacity: cap,
    loaded: cap,
    chambers: chambers,
    misfire: "1–20",
    range: "20/60",
    damage: "1d8",
    properties: jam && jam.properties ? jam.properties : "TEST, close quarters, simple",
    index: index,
    jammed: false,
    fouled: false,
    dirty: false,
    ruined: false,
    misStreak: 0,
    pendingD4: false,
    condition: "ok",
    debug: true,
    testOnly: true
  });
}
function applyDemoGun(playerId, payload) {
  const p = state.players[playerId];
  if (!p || !p.snapshot) return;
  payload = payload || {};
  if (payload.op === "test-gun") grantDemoTestGun(p.snapshot, payload);
  if (payload.op === "equip" && payload.kind === "melee") {
    const row = (p.snapshot.melee || []).find((m) => m && Number(m.index) === Number(payload.index));
    if (row) row.equipped = payload.equipped !== false;
    renderPlayers();
    if ($("#detailOverlay") && !$("#detailOverlay").hidden) openDetail(playerId);
    return;
  }
  if (payload.op === "equip" && payload.kind === "focus") {
    p.snapshot.focus = p.snapshot.focus || { id: "focus" };
    p.snapshot.focus.equipped = payload.equipped !== false;
    renderPlayers();
    if ($("#detailOverlay") && !$("#detailOverlay").hidden) openDetail(playerId);
    return;
  }
  if (payload.op === "receive") {
    const guns = p.snapshot.guns || (p.snapshot.guns = []);
    const melee = p.snapshot.melee || (p.snapshot.melee = []);
    const list = payload.kind === "melee" ? melee : guns;
    let slot = list.find((row) => row && !row.weapon && !row.name);
    if (!slot) {
      slot = { index: list.length };
      list.push(slot);
    }
    slot.weapon = payload.weapon || "";
    slot.name = payload.name || payload.weapon || "Taken weapon";
    slot.equipped = payload.equipped === true;
    slot.loaded = 0;
    renderPlayers();
    if ($("#detailOverlay") && !$("#detailOverlay").hidden) openDetail(playerId);
    return;
  }
  if (payload.op === "take" && payload.kind === "melee") {
    const row = (p.snapshot.melee || []).find((m) => m && Number(m.index) === Number(payload.index));
    if (row) {
      row.equipped = false;
      row.weapon = "";
      row.name = "";
    }
    renderPlayers();
    if ($("#detailOverlay") && !$("#detailOverlay").hidden) openDetail(playerId);
    return;
  }
  const g = payload.op === "test-gun" ? null : demoGunAt(p.snapshot, payload.index);
  if (payload.op !== "test-gun" && !g) return;
  if (payload.op === "unload") { g.loaded = 0; g.chambers = (g.chambers || []).map(() => ""); }
  else if (payload.op === "reload") {
    const cap = Number(g.capacity) || 0;
    const max = payload.max != null && isFinite(Number(payload.max)) ? Number(payload.max) : cap;
    const chambers = Array.isArray(g.chambers) && g.chambers.length === cap ? g.chambers.slice() : Array.from({ length: cap }, (_, idx) => (idx < (Number(g.loaded) || 0) ? "round" : ""));
    /* 0.2.67: demo reload uses the player's chosen ammo pile (g.ammoPool), like the live sheet. */
    const pick = demoReloadPool(p.snapshot, g);
    const locked = Array.isArray(g.lockedChambers) ? g.lockedChambers.map(Number) : [];
    let left = max;
    if (pick) left = Math.min(left, Math.max(0, Number(pick.count) || 0));
    const token = pick ? "k:" + (pick.type || "cartridge") + ":" + (pick.caliber || "") + ":" + (g.tier || "") : "round";
    let took = 0;
    for (let k = 0; k < chambers.length && left > 0; k++) {
      if (!chambers[k] && locked.indexOf(k) < 0) { chambers[k] = token; left -= 1; took += 1; }
    }
    if (pick) {
      pick.count = (Number(pick.count) || 0) - took;
      const pile = ((p.snapshot && p.snapshot.ammo) || []).find((a) => a && a.type === pick.type && String(a.caliber || "") === String(pick.caliber || ""));
      if (pile && pile !== pick) pile.count = Math.max(0, (Number(pile.count) || 0) - took);
    }
    g.chambers = chambers;
    g.loaded = chambers.filter(Boolean).length;
  } else if (payload.op === "rechamber" && payload.chamber) {
    const parts = String(payload.chamber).split("|");
    g.chambers = (g.chambers || []).map(() => "");
    g.loaded = 0;
    g.chamber = payload.chamber;
    g.tier = parts[0] || g.tier;
    if (Array.isArray(g.rechamber)) g.rechamber = g.rechamber.filter((o) => o.value !== payload.chamber);
  } else if (payload.op === "set" && payload.loaded != null && isFinite(payload.loaded)) {
    g.loaded = payload.loaded;
    if (Array.isArray(payload.chambers)) g.chambers = payload.chambers.slice();
    if (payload.jammed != null) g.jammed = !!payload.jammed;
    if (payload.fouled != null) g.fouled = !!payload.fouled;
    if (payload.ruined != null) g.ruined = !!payload.ruined;
    if (payload.pendingD4 != null) g.pendingD4 = !!payload.pendingD4;
    if (payload.dirty != null) g.dirty = !!payload.dirty;
    if (payload.misStreak != null) g.misStreak = payload.misStreak;
  } else if (payload.op === "pool") g.ammoPool = payload.pool == null ? "" : String(payload.pool);
  else if (payload.op === "mode") g.attackMode = payload.mode === "adv" || payload.mode === "dis" ? payload.mode : "";
  else if (payload.op === "clean" && window.SSDNSMisfire && window.SSDNSMisfire.commitClean) {
    window.SSDNSMisfire.commitClean(g, payload.optionId);
    if (g.ruined || g.broken) g.condition = "ruined";
    else if (g.jammed) g.condition = "jammed";
    else if (g.fouled) g.condition = "fouled";
    else if (g.dirty) g.condition = "dirty";
    else g.condition = "ok";
  } else if (payload.op === "misfire" && window.SSDNSMisfire) {
    const applied = window.SSDNSMisfire.applyOverride(g, payload);
    const next = applied.gun;
    g.dirty = !!next.dirty;
    g.fouled = !!next.fouled;
    g.ruined = !!next.ruined;
    g.misStreak = next.misStreak || 0;
    g.pendingD4 = !!next.pendingD4;
    if (g.ruined) g.condition = "ruined";
    else if (g.fouled) g.condition = "fouled";
    else if (g.dirty) g.condition = "dirty";
  } else if (payload.op === "reopen") {
    const locks = Array.isArray(g.lockedChambers) ? g.lockedChambers.slice() : [];
    if (locks.length) g.lockedChambers = locks.slice(1);
  } else if (payload.op === "clear-locks") {
    const next = window.SSDNSMisfire && window.SSDNSMisfire.clearLocks
      ? window.SSDNSMisfire.clearLocks(g, payload.mode, payload.chamber)
      : null;
    if (next && next.cleared && next.cleared.length) g.lockedChambers = next.lockedChambers.slice();
  } else if (payload.op === "equip") {
    g.equipped = payload.equipped !== false;
  } else if (payload.op === "take") {
    g.equipped = false;
    g.weapon = "";
    g.name = "";
    g.loaded = 0;
    g.chambers = [];
  } else if (payload.op === "repair") {
    const next = window.SSDNSMisfire && window.SSDNSMisfire.repair ? window.SSDNSMisfire.repair(g) : null;
    if (next) {
      g.dirty = false;
      g.fouled = false;
      g.ruined = false;
      g.broken = false;
      g.jammed = false;
      g.misStreak = 0;
      g.lockedChambers = [];
      g.pendingD4 = false;
      g.pendingD4Rolls = null;
      g.pendingD4Step = 0;
      g.exploded = false;
      g.cracked = false;
      g.condition = "ok";
    }
  } else if (payload.op === "fire") {
    const chambers = Array.isArray(g.chambers) ? g.chambers : [];
    const k = Number(payload.chamber);
    if (chambers.length && isFinite(k) && k >= 0 && k < chambers.length && chambers[k]) {
      chambers[k] = "";
      g.loaded = Math.max(0, (Number(g.loaded) || 0) - 1);
    } else if ((Number(g.loaded) || 0) > 0) {
      g.loaded = Math.max(0, Number(g.loaded) - 1);
    }
  }
  renderPlayers();
  if ($("#detailOverlay") && !$("#detailOverlay").hidden) openDetail(playerId);
}

async function applyEsToDemoPlayer(playerId, delta) {
  const p = state.players[playerId];
  if (!p || !p.snapshot) return;
  const old = p.snapshot.es || 0;
  p.snapshot.es = Math.max(0, old + delta);
  p.snapshot.updatedAt = new Date().toISOString();
}

/* ---------- UI: status / room ---------- */
function sessionStrip(event, info) {
  const extra = info || {};
  if (window.SSDNSApplied && window.SSDNSApplied.sessionStrip) {
    return window.SSDNSApplied.sessionStrip(event, extra);
  }
  if (event === "end" || extra.roomStatus === "ended") {
    return extra.demo
      ? { mode: "demo", text: "Demo mode · offline · no Firebase loaded" }
      : { mode: "offline", text: "Session ended" };
  }
  return { mode: "offline", text: "Session ended" };
}
function paintSession(event, info) {
  const next = sessionStrip(event, info || {});
  setStatus(next.mode, next.text);
}
function setStatus(mode, text) {
  const inRoom = document.body.classList.contains("in-room") && !!state.roomCode;
  const roomStatus = (state.meta && state.meta.status) || "";
  const allowed = window.SSDNSApplied && window.SSDNSApplied.liveStripAllowed
    ? window.SSDNSApplied.liveStripAllowed(mode, text, { roomStatus: roomStatus, inRoom: inRoom })
    : !(mode === "live" && /players stay connected/i.test(text || "") && (!inRoom || roomStatus === "ended" || roomStatus === "moved"));
  if (!allowed) {
    const ended = roomStatus === "ended" || roomStatus === "moved";
    mode = state.demo ? "demo" : (ended ? "offline" : "live");
    text = ended
      ? (state.demo ? "Demo mode · offline · no Firebase loaded" : "Session ended")
      : sessionStrip("leave", {
          code: (state.meta && state.meta.code) || "",
          roomStatus: roomStatus,
          demo: !!state.demo
        }).text;
  }
  const dot = $("#statusDot");
  dot.className = "status-dot " + (mode === "live" ? "live" : mode === "offline" ? "offline" : "demo");
  $("#statusText").textContent = text;
  $("#statusExtra").textContent = state.firebaseError && !state.demo
    ? " · " + state.firebaseError
    : (state.firebaseReady && state.demo ? " · Firebase ready if you turn Demo off" : "");
}

function syncSessionButtons() {
  const inRoom = document.body.classList.contains("in-room");
  const leave = $("#btnLeaveRoom");
  if (leave) leave.hidden = !inRoom;
  const copy = $("#btnCopyCode");
  const link = $("#btnCopyLink");
  const end = $("#btnEndSession");
  const fresh = $("#btnNewCode");
  if (copy) copy.hidden = !inRoom;
  if (link) link.hidden = !inRoom;
  if (fresh) fresh.hidden = !inRoom;
  if (end) end.hidden = !inRoom;
}
function showRoom() {
  rememberOpenSession();
  $("#lobby").hidden = true;
  $("#roomShell").hidden = false;
  document.body.classList.add("in-room");
  const dock = $("#liveDock");
  if (dock) dock.hidden = false;
  syncSessionButtons();
  renderRoomHero();
  if (window.SSDNSMapHost && window.SSDNSMapHost.syncRoom) window.SSDNSMapHost.syncRoom();
}

function hideRoom() {
  const stay = window.SSDNSApplied && window.SSDNSApplied.staysInRoom
    ? window.SSDNSApplied.staysInRoom(sessionOpen, lobbyReason)
    : (sessionOpen && lobbyReason !== "leave" && lobbyReason !== "end" && lobbyReason !== "new");
  if (stay) return;
  $("#lobby").hidden = false;
  $("#roomShell").hidden = true;
  document.body.classList.remove("in-room");
  const dock = $("#liveDock");
  if (dock) dock.hidden = true;
  clearUnsubs();
  state.roomCode = null;
  syncSessionButtons();
  if (window.SSDNSMapHost && window.SSDNSMapHost.syncRoom) window.SSDNSMapHost.syncRoom();
}
function leaveRoom(reason) {
  permitLobby(reason || "leave");
  releaseSession();
  const code = state.roomCode || (state.meta && state.meta.code) || "";
  const meta = state.meta;
  const demo = !!state.demo;
  clearUnsubs();
  hideRoom();
  if (code) {
    pendingResume = { code: code, meta: meta, demo: demo };
    showResumeChoice(code);
  } else {
    pendingResume = null;
    showResumeChoice("");
  }
  toast("Left this screen. The table is still live — resume it or start a new session.");
  paintSession("leave", { code: code, roomStatus: (meta && meta.status) || "", demo: demo });
}

function roomCodeString() {
  const raw = String(state.roomCode || (state.meta && state.meta.code) || "");
  const match = raw.toUpperCase().match(/[A-Z]+-\d+/);
  return match ? match[0] : "";
}
function roomCodeClickTarget(node) {
  const el = node && node.nodeType === 1 ? node : (node && node.parentElement);
  if (!el || !el.closest) return null;
  if (el.closest("#btnCopyLink")) return null;
  return el.closest("#roomCodeDisplay, #btnCopyCode, .room-code, .room-code-label");
}
async function writePlain(text) {
  const value = String(text == null ? "" : text);
  const clip = navigator.clipboard;
  if (clip && typeof ClipboardItem === "function" && clip.write) {
    try {
      await clip.write([new ClipboardItem({
        "text/plain": new Blob([value], { type: "text/plain" })
      })]);
      return true;
    } catch (e) {}
  }
  if (clip && clip.writeText) {
    try {
      await clip.writeText(value);
      return true;
    } catch (e) {}
  }
  try {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    ta.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;user-select:text;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
    return !!ok;
  } catch (err) {
    return false;
  }
}
async function copyText(text) {
  return writePlain(text);
}
function inviteHref(code) {
  if (window.SSDNSApplied && window.SSDNSApplied.sheetInviteUrl) {
    return window.SSDNSApplied.sheetInviteUrl(location.href, code);
  }
  return "";
}
async function copyRoomCode(ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  if (ev && ev.stopPropagation) ev.stopPropagation();
  const sel = window.getSelection && window.getSelection();
  if (sel && sel.removeAllRanges) sel.removeAllRanges();
  const code = roomCodeString();
  if (!code) { toast("Open a room first"); return; }
  const ok = await writePlain(code);
  toast(ok ? "Copied " + code : code);
}
async function copyInvite() {
  const code = roomCodeString();
  if (!code) { toast("Open a room first"); return; }
  const link = inviteHref(code);
  if (!link) { toast("Couldn't build the invite link"); return; }
  const ok = await writePlain(link);
  toast(ok ? "Invite link copied" : link);
}
function renderRoomHero() {
  if (!state.meta) return;
  $("#roomCodeDisplay").textContent = state.meta.code || state.roomCode;
  const online = Object.values(state.players).filter((p) => playerOnline(p)).length;
  const total = Object.keys(state.players).length;
  $("#roomMeta").textContent = (state.meta.name ? state.meta.name + " · " : "") +
    (state.demo ? "Demo" : "Live") + " · " + online + "/" + total + " online · DMCC " + VERSION;
  renderPresence();
}

function prettyCalling(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s !== s.toLowerCase() && s.indexOf("-") < 0) return s;
  return s.split("-").map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : "").filter(Boolean).join(" ");
}
function presenceExtra(s) {
  const calling = prettyCalling(s.calling);
  const level = s.level != null && s.level !== "" ? "L" + s.level : "";
  return [calling, level].filter(Boolean).join(" ");
}
function renderPresence() {
  const box = $("#presenceList");
  const list = Object.values(state.players);
  if (!list.length) {
    box.innerHTML = '<span class="pill">No players yet — share the code</span>';
    return;
  }
  box.innerHTML = Object.keys(state.players).map((id) => {
    const p = state.players[id] || {};
    const s = p.snapshot || {};
    const rawOn = playerOnline(p);
    const held = state.presenceHold && state.presenceHold[id];
    const on = window.SSDNSApplied && window.SSDNSApplied.presenceShownOnline
      ? window.SSDNSApplied.presenceShownOnline(rawOn, held)
      : rawOn;
    const extra = presenceExtra(s);
    const label = esc(s.name || id) + (extra ? " · " + esc(extra) : "");
    return `<span class="pill ${on ? "online" : "offline"}"><span class="dot"></span>${label}</span>`;
  }).join("");
}

function playerOptions(includeAll) {
  const opts = includeAll ? '<option value="all">Everyone</option>' : "";
  return opts + Object.keys(state.players).map((id) => {
    const s = state.players[id].snapshot || {};
    return `<option value="${esc(id)}">${esc(s.name || id)}</option>`;
  }).join("");
}

const UI_FIELDS = ["rewTarget", "rewType", "rewEs", "rewReason", "rewText", "rewQty", "msgTarget", "msgText", "hoName", "hoUrl", "hoText", "hoTarget", "inRoomName", "inDmName", "selForcePlayer"];
const uiMemory = {};
let uiTab = "tab-table";
try { uiTab = sessionStorage.getItem("ssdns.dm.uiTab") || uiTab; } catch (e) {}
function applyActiveTab() {
  const decided = window.SSDNSUiTab ? window.SSDNSUiTab.nextTab(uiTab, { type: "click", tab: uiTab }) : uiTab;
  uiTab = decided || "tab-table";
  const tab = document.getElementById(uiTab);
  if (!tab) return;
  $$(".tab").forEach((t) => t.setAttribute("aria-selected", t.id === uiTab ? "true" : "false"));
  $$(".panel").forEach((p) => { p.hidden = true; });
  const panel = document.getElementById(tab.getAttribute("aria-controls"));
  if (panel) panel.hidden = false;
  document.body.classList.toggle("store-tab-active", uiTab === "tab-store");
  document.body.classList.toggle("map-tab-active", uiTab === "tab-map");
}
function rememberUi() {
  UI_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) uiMemory[id] = el.value;
  });
}
function restoreUi() {
  applyActiveTab();
  UI_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    const value = uiMemory[id];
    if (!el || value == null) return;
    if (el.tagName === "SELECT") {
      if ([...el.options].some((o) => o.value === value)) el.value = value;
      return;
    }
    if (document.activeElement === el) return;
    if (el.value !== value) el.value = value;
  });
}
function holdUi(fn) {
  rememberUi();
  fn();
  restoreUi();
}
function fillTargetSelects() {
  const sig = Object.keys(state.players).map((id) => {
    const s = (state.players[id] && state.players[id].snapshot) || {};
    return id + ":" + (s.name || "");
  }).sort().join("|");
  ["#rewTarget", "#msgTarget", "#hoTarget", "#selForcePlayer"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    const remembered = uiMemory[el.id];
    const keep = (el.value && el.value !== "all" && el.value !== "") ? el.value : (remembered || el.value);
    if (el.dataset.sig === sig && el.options.length) {
      if (keep && [...el.options].some((o) => o.value === keep)) el.value = keep;
      return;
    }
    el.innerHTML = (sel === "#msgTarget" ? '<option value="">Select player…</option>' : "") +
      (sel === "#selForcePlayer" ? '<option value="all">Everyone</option>' : "") +
      playerOptions(sel === "#rewTarget" || sel === "#hoTarget" || sel === "#selForcePlayer");
    if (sel === "#rewTarget" || sel === "#hoTarget") {
      el.innerHTML = playerOptions(true);
    }
    el.dataset.sig = sig;
    const next = keep || remembered || "";
    if (next && [...el.options].some((o) => o.value === next)) el.value = next;
  });
  if (window.SSDNSItems && window.SSDNSItems.paintDm) window.SSDNSItems.paintDm();
}

/* ---------- render tabs ---------- */
function renderAll() {
  holdUi(() => {
    renderRoomHero();
    fillTargetSelects();
    renderPlayers();
    renderLedger();
    renderRolls();
    renderMessages();
    renderHandouts();
    loadNotes();
    if (window.DMCCEnhance && window.DMCCEnhance.afterRender) window.DMCCEnhance.afterRender();
  });
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
function playerOnline(p) {
  const pres = (p && p.presence) || {};
  const conns = pres.conns;
  if (conns && typeof conns === "object") {
    return Object.keys(conns).some((id) => conns[id] && conns[id].online !== false);
  }
  return !!pres.online;
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
  const save = !!(r && (r.save || (!attack && /\bsave\b/i.test(String((r && r.label) || "") + " " + String((r && r.detail) || "")))));
  const test = !!(r && (r.test || /\bTEST\b/.test(String((r && r.detail) || "") + " " + String((r && r.label) || ""))));
  const tag = (base) => (test ? (base ? "TEST · " + base : "TEST") : base);
  if (crit && save && !attack) return { cls: "roll-crit", tag: tag("natural 20"), attack: false, crit: true, test: test, save: true };
  if (crit) return { cls: "roll-crit", tag: tag("CRITICAL"), attack: true, crit: true, test: test };
  if (attack) return { cls: "roll-attack", tag: tag("ATTACK"), attack: true, crit: false, test: test };
  if (test) return { cls: "", tag: "TEST", attack: false, crit: false, test: true };
  return { cls: "", tag: "", attack: false, crit: false, test: false };
}
function rollAc(r) {
  const ac = r && r.ac;
  if (ac != null && ac !== "" && isFinite(Number(ac))) return Number(ac);
  if (window.DMCCEnhance && window.DMCCEnhance.acFor) {
    const found = window.DMCCEnhance.acFor(r);
    if (found != null && found !== "" && isFinite(Number(found))) return Number(found);
  }
  return null;
}
function rollDetail(r) {
  let detail = String((r && r.detail) || "");
  const heal = !!(r && (r.heal || r.type === "heal" || /\bheals\b/i.test(detail)));
  if (heal) return detail.replace(/\s*vs AC\s*\d+/gi, "");
  const ac = rollAc(r);
  const attack = !!(r && (r.attack || /→\s*(HIT|MISS)/.test(detail)));
  if (!attack || ac == null || detail.indexOf("vs AC") >= 0) return detail;
  if (/ → (HIT|MISS|CRIT)/.test(detail)) return detail.replace(/ → (HIT|MISS|CRIT)/, " vs AC " + ac + " → $1");
  return detail;
}
function paintWho(name) {
  if (window.SSDNSApplied && window.SSDNSApplied.whoHtml) return window.SSDNSApplied.whoHtml(name);
  return esc(name);
}
function paintText(text) {
  return paintLine(null, text);
}
function paintLine(entry, text) {
  const spoken = window.SSDNSApplied && window.SSDNSApplied.rewriteSpeaker
    ? window.SSDNSApplied.rewriteSpeaker(text || "", entry || {})
    : (text || "");
  const html = window.SSDNSApplied && window.SSDNSApplied.leadNameHtml
    ? window.SSDNSApplied.leadNameHtml(spoken)
    : esc(spoken);
  if (window.SSDNSDice && window.SSDNSDice.lead) return window.SSDNSDice.lead(entry || { formula: text }, html);
  if (window.SSDNSDice && window.SSDNSDice.decorate) return window.SSDNSDice.decorate(html);
  return html;
}
/* 0.2.91: one plain die with no modifier ("1d4", "d20") reads "1d4 = 4": no "d4 ·" label echo, no "(4)" repeat.
   Pools and modified rolls keep their breakdown, e.g. "2d6+1 = 9 (3, 5)". */
function singleDie(r) {
  const m = String((r && r.formula) || "").trim().match(/^(1?)d(4|6|8|10|12|20|50|100)$/i);
  if (!m) return null;
  const sides = Number(m[2]);
  const detail = String((r && r.detail) == null ? "" : r.detail).trim();
  const result = String((r && r.result) == null ? "" : r.result).trim();
  if (detail && detail !== result) return null;
  const label = String((r && r.label) || "").trim();
  const echo = !label || /^roll$/i.test(label) || label.toLowerCase() === "d" + sides || label.toLowerCase() === "1d" + sides;
  return { formula: "1d" + sides, text: (echo ? "" : label + " · ") + "1d" + sides + " = " + result };
}
function rollBody(r) {
  const detail = rollDetail(r);
  const one = !(r && (r.freeShot || r.heal || r.attack)) ? singleDie(r) : null;
  if (one && !/→/.test(detail)) return one.text;
  /* 0.2.80: a Free shot is one line, "<Name> shoots freely · 1d20+B = T" (no label + formula head) */
  if (r && r.freeShot && detail) return detail;
  if (detail && /\bd20\b/.test(detail) && detail.indexOf("=") >= 0 && !/→\s*(HIT|MISS|CRIT|misfire)/i.test(detail)) return detail;
  let out;
  if (r && (r.heal || /\bheals\b/i.test(detail))) out = detail;
  else if (detail && /→\s*(HIT|MISS|CRIT|misfire)/i.test(detail)) out = detail;
  else {
    const formula = r && r.formula ? String(r.formula) + " = " + (r.result ?? "") : "";
    const head = ((r && r.label) || "Roll") + (formula ? " · " + formula : "");
    out = detail ? head + " (" + detail + ")" : head;
  }
  if (/\btarget\b/i.test(out)) {
    const who = String((r && (r.characterName || r.who)) || "").trim() || "someone";
    const named = realTargetName(r);
    const repl = named || (/\bheals\b/i.test(out) ? who : "someone");
    out = out.replace(/\bno target\b/gi, repl).replace(/\btarget\b/gi, repl);
  }
  return out;
}
function realTargetName(r) {
  const raw = String((r && r.targetName) || "").trim();
  if (!raw || /^target$/i.test(raw) || /^no target$/i.test(raw)) return "";
  return raw;
}
function undoHitButton(rollId) {
  if (!rollId) return "";
  const applied = window.SSDNSApplied && window.SSDNSApplied.has && window.SSDNSApplied.has(state.roomCode, rollId);
  if (!applied) return "";
  return `<button type="button" class="btn sm" data-undo-hit="${esc(rollId)}">Undo</button>`;
}
function hitApplyButton(r) {
  const amt = Number(r && r.damage);
  if (!r || !r.id || !isFinite(amt) || amt <= 0) return "";
  const heal = !!(r.heal || /\bheals\b/i.test(String(r.detail || "")));
  if (!heal && (r.nat === 1 || /→\s*MISS/.test(String(r.detail || "")))) return "";
  const name = realTargetName(r);
  const roomCode = typeof state !== "undefined" && state ? state.roomCode : "";
  if (window.SSDNSApplied && window.SSDNSApplied.undone && window.SSDNSApplied.undone(roomCode, r.id)) {
    return `<span class="fine">Undone</span>`;
  }
  let outOfTurn = !!r.outOfTurn;
  const dmRoll = typeof state !== "undefined" && state && r.uid === state.uid;
  if (!outOfTurn && r.playerId && !dmRoll && window.DMCCEnhance && window.DMCCEnhance.currentTurn) {
    const cur = window.DMCCEnhance.currentTurn();
    outOfTurn = !!(cur && cur.playerId && r.playerId !== cur.playerId);
  }
  const gated = Object.assign({}, r, { outOfTurn: outOfTurn });
  if (window.SSDNSApplied && window.SSDNSApplied.showHitApply && !window.SSDNSApplied.showHitApply(gated)) return "";
  if (!window.SSDNSApplied && !heal && !r.targetId && !name) return "";
  const applied = !!(r.applied || (window.SSDNSApplied && window.SSDNSApplied.has && window.SSDNSApplied.has(state.roomCode, r.id)));
  if (applied) return `<span class="fine">Applied ${esc(amt)}${name ? " → " + esc(name) : ""}</span> ${undoHitButton(r.id)}`;
  const label = "Apply " + amt + (name ? " → " + name : "");
  return `<button type="button" class="btn sm" data-apply-hit="${esc(r.id)}">${esc(label)}</button>`;
}
async function markRollApplied(id, applied) {
  const row = (state.rolls || []).find((r) => r && r.id === id);
  if (row) row.applied = !!applied;
  renderRolls();
  if (state.demo || !state.db || !id) return;
  try { await state._fb.update(roomRef("rolls/" + id), { applied: !!applied }); }
  catch (e) { /* the roll row can already be gone */ }
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
    const on = playerOnline(p);
    const hpCur = Number(s.hpCurrent);
    const downed = isFinite(hpCur) && hpCur <= 0;
    const initials = String(s.name || "?").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";
    const portrait = s.portrait
      ? `<img class="portrait" src="${esc(s.portrait)}" alt="">`
      : `<span class="portrait initials" aria-hidden="true">${esc(initials)}</span>`;
    const seenCond = {};
    const conds = String(s.conditions || "").split(",").map((c) => c.trim()).filter((c) => {
      if (!c) return false;
      const key = c.replace(/\s+\d+r$/i, "").replace(/\s+\d+$/, "").toLowerCase();
      if (seenCond[key]) return false;
      seenCond[key] = 1;
      return true;
    });
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
        <span class="badge ${downed ? "danger" : (on ? "eld" : "")}">${downed ? "Unconscious" : (on ? "Online" : "Away")}</span>
        <span class="btn sm" data-kick="${esc(p.id)}" role="button">Kick</span>
      </div>
      ${condHtml ? `<div class="cond-row">${condHtml}</div>` : ""}
      <div class="stat-row">
        <div class="stat"><b>${esc(s.hpCurrent ?? "—")}<small style="font-size:12px;color:var(--muted)">/${esc(s.hpMax ?? "—")}</small></b><span>HP</span></div>
        <div class="stat"><b>${esc(s.ac ?? "—")}</b><span>AC</span></div>
        <div class="stat"><b>${s.initBonus == null || s.initBonus === "" ? "—" : esc((Number(s.initBonus) >= 0 ? "+" : "") + s.initBonus)}</b><span>Init</span></div>
        <div class="stat"><b>${Number(s.es || 0).toLocaleString()}</b><span>ES</span></div>
      </div>
      ${dsHtml}
      ${guns}
      ${window.SSDNSTrackers && window.SSDNSTrackers.dmHtml ? window.SSDNSTrackers.dmHtml(s) : ""}
      ${addictionLine(p.id)}
      ${slotLine(s) ? `<div class="slot-line">${esc(slotLine(s))}</div>` : ""}
    </button>`;
  }).join("");
  $$(".pcard", grid).forEach((btn) => btn.addEventListener("click", (ev) => {
    const kick = ev.target.closest && ev.target.closest("[data-kick]");
    if (kick) {
      ev.preventDefault();
      ev.stopPropagation();
      kickPlayer(kick.getAttribute("data-kick"));
      return;
    }
    openDetail(btn.dataset.pid);
  }));
  renderKicked();
}
function handoutAckLabel(h) {
  if (!h || !h.id) return " · sent";
  const ids = h.to && h.to !== "all" ? [h.to] : Object.keys(state.players || {});
  if (!ids.length) return " · sent";
  let seen = 0;
  let delivered = 0;
  ids.forEach((id) => {
    const ack = state.players[id] && state.players[id].handoutAck;
    if (!ack || ack.id !== h.id) return;
    if (ack.seen) seen += 1;
    else if (ack.delivered) delivered += 1;
  });
  if (seen >= ids.length) return " · seen";
  if (seen || delivered) return " · delivered";
  return " · sent";
}
function ledgerAck(e) {
  if (!e) return "";
  if (e.type === "turn" && e.playerId && e.playerId !== "all") {
    const ack = state.players[e.playerId] && state.players[e.playerId].turnAck;
    if (ack && ack.seen) return " · seen";
    if (ack && (ack.delivered || ack.seen === false)) return " · delivered";
    return " · sent";
  }
  if (e.type === "handout") return handoutAckLabel({ id: e.handoutId, to: e.playerId });
  return "";
}
function askText(title, message, withReason) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    dlg.innerHTML = `<form method="dialog"><h2></h2><p class="fine"></p>${withReason ? `<label>Reason <input id="askReason" type="text" placeholder="optional"></label>` : ""}<div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Confirm</button></div></form>`;
    dlg.querySelector("h2").textContent = title;
    dlg.querySelector("p").textContent = message;
    const finish = (ok) => {
      const reason = dlg.querySelector("#askReason");
      const value = ok ? { ok: true, reason: reason ? reason.value.trim() : "" } : null;
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      resolve(value);
    };
    dlg.querySelector("[value=no]").addEventListener("click", () => finish(false));
    dlg.querySelector("form").addEventListener("submit", (ev) => { ev.preventDefault(); finish(true); });
    dlg.addEventListener("cancel", (ev) => { ev.preventDefault(); finish(false); });
    document.body.appendChild(dlg);
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
    catch (err) { dlg.setAttribute("open", ""); }
  });
}
async function kickPlayer(pid) {
  const p = state.players && state.players[pid];
  if (!pid || !p) return;
  const s = p.snapshot || {};
  const label = s.name || s.player || pid;
  const ask = await askText("Kick " + label + "?", "They leave the table and cannot rejoin this code until you allow them back.", true);
  if (!ask) return;
  const reason = ask.reason || "";
  state.kicked = state.kicked || {};
  state.kicked[pid] = { uid: pid, name: label, reason: reason, ts: new Date().toISOString() };
  delete state.players[pid];
  if (window.DMCCEnhance && window.DMCCEnhance.enterRoom) {
    /* keep the current fight; removal is recorded below */
  }
  const line = "DM kicked " + label + (reason ? " · " + reason : "");
  await pushLedger({ who: "DM", playerId: pid, type: "kick", what: line, oldVal: null, newVal: "kicked", flag: false, characterName: label });
  await pushCommand({ type: "kicked", to: pid, payload: { reason: reason, name: label }, from: state.uid });
  if (!state.demo && state.db && state._fb) {
    const fb = state._fb;
    try {
      await fb.set(roomRef("kicked/" + pid), state.kicked[pid]);
      await fb.remove(roomRef("players/" + pid));
      const condSnap = await fb.get(roomRef("conditions"));
      const conds = condSnap.val() || {};
      for (const id of Object.keys(conds)) {
        if (conds[id] && conds[id].subjectId === pid) await fb.remove(roomRef("conditions/" + id));
      }
    } catch (e) { writeFailed(e, "Kick failed"); }
  }
  if (window.DMCCEnhance && window.DMCCEnhance.removeCombatant) window.DMCCEnhance.removeCombatant(pid);
  toast(label + " was removed from the table");
  renderPlayers();
  renderKicked();
  if (window.DMCCEnhance && window.DMCCEnhance.renderFight) window.DMCCEnhance.renderFight();
}
async function allowBack(uid) {
  if (!uid) return;
  const row = (state.kicked && state.kicked[uid]) || {};
  if (state.kicked) delete state.kicked[uid];
  const label = row.name || uid;
  await pushLedger({ who: "DM", playerId: uid, type: "kick", what: "DM allowed " + label + " back", oldVal: "kicked", newVal: "allowed", flag: false });
  if (!state.demo && state.db && state._fb) {
    try { await state._fb.remove(roomRef("kicked/" + uid)); }
    catch (e) { writeFailed(e, "Couldn't allow them back"); }
  }
  toast(label + " can join again");
  renderKicked();
}
async function copyRoomChildren(oldCode, newCode) {
  const fb = state._fb;
  const root = fb.ref(state.db, "rooms/" + oldCode);
  const snap = async (path) => (await fb.get(fb.ref(state.db, "rooms/" + oldCode + "/" + path))).val();
  const meta = (await snap("meta")) || {};
  const table = await snap("table");
  const encounter = {
    public: await snap("encounter/public"),
    hp: await snap("encounter/hp"),
    dm: await snap("encounter/dm"),
    requests: await snap("encounter/requests")
  };
  const players = (await snap("players")) || {};
  const handouts = await snap("handouts");
  const ledger = await snap("ledger");
  const conditions = (await snap("conditions")) || {};
  const chat = await snap("chat");
  const kicked = (await snap("kicked")) || {};
  const keptPlayers = {};
  Object.keys(players).forEach((id) => { if (!kicked[id]) keptPlayers[id] = players[id]; });
  const keptConds = {};
  Object.keys(conditions).forEach((id) => {
    const row = conditions[id];
    if (row && row.subjectId && kicked[row.subjectId]) return;
    keptConds[id] = row;
  });
  const nextMeta = Object.assign({}, meta, {
    code: newCode,
    dmUid: state.uid || meta.dmUid || "",
    status: "live",
    createdAt: new Date().toISOString(),
    movedFrom: oldCode
  });
  delete nextMeta.movedTo;
  const base = "rooms/" + newCode;
  const put = (path, value) => fb.set(fb.ref(state.db, base + "/" + path), value);
  await put("meta", nextMeta);
  const metaCheck = await fb.get(fb.ref(state.db, base + "/meta"));
  if (!metaCheck.exists() || (metaCheck.val() || {}).dmUid !== nextMeta.dmUid) {
    throw new Error("New room meta was not saved");
  }
  const tableKeys = ["initiative", "store", "packs", "updatedAt", "inspiration", "storeOpen", "damageMode"];
  if (table && typeof table === "object") {
    const tablePatch = {};
    tableKeys.forEach((key) => { if (table[key] != null) tablePatch[key] = table[key]; });
    if (tablePatch.initiative && Array.isArray(tablePatch.initiative.order)) {
      const ids = {};
      Object.keys(keptPlayers).forEach((id) => { ids[id] = 1; });
      const order = window.SSDNSApplied && window.SSDNSApplied.stripGhostCombatants
        ? window.SSDNSApplied.stripGhostCombatants(tablePatch.initiative.order, ids)
        : tablePatch.initiative.order.filter((row) => !row || row.kind !== "player" || ids[row.playerId || row.id]);
      tablePatch.initiative = Object.assign({}, tablePatch.initiative, { order: order });
    }
    if (Object.keys(tablePatch).length) await fb.update(fb.ref(state.db, base + "/table"), tablePatch);
  }
  if (encounter && encounter.public) await put("encounter/public", encounter.public);
  if (encounter && encounter.hp) await put("encounter/hp", encounter.hp);
  if (encounter && encounter.dm) await put("encounter/dm", encounter.dm);
  if (encounter && encounter.requests) {
    for (const id of Object.keys(encounter.requests)) await put("encounter/requests/" + id, encounter.requests[id]);
  }
  for (const id of Object.keys(keptPlayers)) await put("players/" + id, keptPlayers[id]);
  for (const id of Object.keys(handouts || {})) await put("handouts/" + id, handouts[id]);
  for (const id of Object.keys(ledger || {})) await put("ledger/" + id, ledger[id]);
  for (const id of Object.keys(keptConds)) await put("conditions/" + id, keptConds[id]);
  for (const id of Object.keys(chat || {})) await put("chat/" + id, chat[id]);
  for (const id of Object.keys(kicked)) await put("kicked/" + id, kicked[id]);
  await fb.update(fb.ref(state.db, "rooms/" + oldCode + "/meta"), { movedTo: newCode, status: "moved" });
  return nextMeta;
}
async function newRoomCode() {
  if (!state.roomCode) { toast("Open a room first"); return; }
  const ask = await askText("New room code?", "The table moves to a fresh code. Players follow. Kicked players stay out.");
  if (!ask) return;
  const oldCode = state.roomCode;
  const code = roomCode();
  if (state.demo || !state.db) {
    state.roomCode = code;
    state.meta = Object.assign({}, state.meta || {}, { code: code, status: "live" });
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code: code, demo: !!state.demo })); } catch (e) {}
    if (window.DMCCEnhance && window.DMCCEnhance.enterRoom) window.DMCCEnhance.enterRoom();
    showRoom();
    renderAll();
    toast("Table moved to " + code);
    paintSession("move", { code: code, roomStatus: "live", demo: !!state.demo });
    return;
  }
  try {
    await pushCommand({ type: "moved", to: "all", payload: { code: code }, from: state.uid });
    const meta = await copyRoomChildren(oldCode, code);
    clearUnsubs();
    state.roomCode = code;
    state.meta = meta;
    state._listenCode = "";
    try { localStorage.setItem(ROOM_KEY, JSON.stringify({ code: code, demo: false, uid: state.uid })); } catch (e) {}
    if (window.DMCCEnhance && window.DMCCEnhance.enterRoom) window.DMCCEnhance.enterRoom();
    attachLiveListeners();
    showRoom();
    renderAll();
    toast("Table moved to " + code);
    paintSession("move", { code: code, roomStatus: (state.meta && state.meta.status) || "live", demo: false });
  } catch (e) {
    writeFailed(e, "Couldn't move the table");
  }
}
function renderKicked() {
  let box = $("#kickedList");
  const grid = $("#playerGrid");
  if (!box && grid && grid.parentNode) {
    box = document.createElement("div");
    box.id = "kickedList";
    grid.parentNode.insertBefore(box, grid.nextSibling);
  }
  if (!box) return;
  const rows = Object.keys(state.kicked || {});
  if (!rows.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<p class="lede">Removed from this table</p>` + rows.map((uid) => {
    const row = state.kicked[uid] || {};
    const label = row.name || uid;
    return `<div class="feed-item"><span>${esc(label)}${row.reason ? " · " + esc(row.reason) : ""}</span> <button type="button" class="btn sm" data-allow="${esc(uid)}">Allow back</button></div>`;
  }).join("");
  $$("[data-allow]", box).forEach((btn) => btn.addEventListener("click", () => allowBack(btn.getAttribute("data-allow"))));
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
    <div class="detail-section"><h3>Badge</h3>
      <label>Lawman badge
        <select id="dmBadge" aria-label="Lawman badge">
          <option value="bright">Bright (sworn in)</option>
          <option value="dull">Dull</option>
          <option value="tarnished">Tarnished</option>
        </select>
      </label>
      <button type="button" class="btn sm" id="btnDmBadge">Set badge</button>
      <p class="fine">Mercy Hands stays off while the badge is Dull. Swearing in sets it Bright.</p>
    </div>
    <div class="detail-section"><h3>HP and guns</h3>
      <label>Set HP <input type="number" id="dmSetHp" value="${esc(s.hpCurrent)}" aria-label="Set player hit points"></label>
      <button type="button" class="btn sm" id="btnDmSetHp">Set HP</button>
      ${(s.guns || []).filter((g) => g && g.name).map((g, i) => {
        const sheetI = g.index != null && g.index !== "" ? g.index : i;
        const lockN = Array.isArray(g.lockedChambers) ? g.lockedChambers.length : 0;
        const crossed = !!(g.ruined || g.broken || g.exploded);
        return `<div class="gun-chip ${g.jammed ? "jammed" : ""}${crossed ? " gun-x" : ""}"><div>${esc(g.name)} — ${esc(g.loaded)}/${esc(g.capacity)} ${esc(g.load || "")}</div>${cylinderHtml(g)}
        ${gunStatusHtml(g)}
        <div class="gun-row gun-load-row">
          <button type="button" class="btn sm" data-gun-op="reload" data-gun-i="${sheetI}">Reload</button>
          <button type="button" class="btn sm" data-gun-op="unload" data-gun-i="${sheetI}">Unload</button>
          <button type="button" class="btn sm" data-gun-op="set" data-gun-i="${sheetI}">Set loaded</button>
          <input type="number" data-gun-loaded="${sheetI}" value="${esc(g.loaded)}" aria-label="Loaded chambers">
        </div>
        ${gunFixButtonsHtml(g, sheetI)}
        <details class="gun-overrides"><summary>DM overrides (testing)</summary>
          <div class="gun-row">
            <button type="button" class="btn sm" data-gun-op="misfire" data-mf="reset" data-gun-i="${sheetI}">Reset streak</button>
            <button type="button" class="btn sm" data-gun-op="dirty-d4" data-gun-i="${sheetI}">Dirty d4</button>
            <button type="button" class="btn sm" data-gun-op="misfire" data-mf="dirty" data-mf-on="${g.dirty ? "0" : "1"}" data-gun-i="${sheetI}">${g.dirty ? "Clear Dirty" : "Set Dirty"}</button>
            <button type="button" class="btn sm" data-gun-op="misfire" data-mf="fouled" data-mf-on="${g.fouled ? "0" : "1"}" data-gun-i="${sheetI}">${g.fouled ? "Clear Fouled" : "Set Fouled"}</button>
            <button type="button" class="btn sm" data-gun-op="misfire" data-mf="ruined" data-mf-on="${(g.ruined || g.broken) ? "0" : "1"}" data-gun-i="${sheetI}">${(g.ruined || g.broken) ? "Clear Ruined" : "Set Ruined"}</button>
          </div>
        </details>
        ${Array.isArray(g.rechamber) && g.rechamber.length ? `<span class="fine">Rechamber (DM, free)</span>
        <select data-gun-rechamber="${sheetI}" aria-label="New chambering">${g.rechamber.map((o) => `<option value="${esc(o.value)}">${esc(o.label)} · gunsmith ${esc(o.cost)} ES${o.allowed ? "" : " (off-path)"}</option>`).join("")}</select>
        <button type="button" class="btn sm" data-gun-op="rechamber" data-gun-i="${sheetI}">Rechamber</button>` : ""}
        <button type="button" class="btn sm" data-gun-op="equip" data-gun-on="${g.equipped === false ? "1" : "0"}" data-gun-kind="gun" data-gun-i="${sheetI}">${g.equipped === false ? "Equip" : "Unequip"}</button>
      </div>`;
      }).join("") || "<p>—</p>"}
      ${(s.melee || []).map((m) => `<div class="gun-chip"><div>${esc(relabel(m.name))} · melee</div><button type="button" class="btn sm" data-gun-op="equip" data-gun-on="${m.equipped === false ? "1" : "0"}" data-gun-kind="melee" data-gun-i="${m.index}">${m.equipped === false ? "Equip" : "Unequip"}</button></div>`).join("")}
      ${s.focus && s.focus.id ? `<div class="gun-chip"><div>Focus · ${esc(s.focus.id)}${s.focus.carry === "held" ? " · held" : (s.focus.carry === "free" ? " · strapped" : "")}</div><button type="button" class="btn sm" data-gun-op="equip" data-gun-on="${s.focus.equipped === false ? "1" : "0"}" data-gun-kind="focus" data-gun-i="0">${s.focus.equipped === false ? "Equip focus" : "Unequip focus"}</button></div>` : ""}
    </div>
    <div class="detail-section"><h3>Equipment</h3><pre>${esc(relabel(s.equipment) || "—")}</pre></div>
    <div class="detail-section"><h3>Features</h3><pre>${esc(relabel(s.features) || "—")}</pre></div>
    <div class="detail-section"><h3>Spells</h3><p>${esc(slotLine(s) || "No shell slots")}${s.spellAtk ? " · attack " + esc(s.spellAtk) : ""}${s.spellDC ? " · DC " + esc(s.spellDC) : ""}</p><pre>${esc(spellTxt)}</pre></div>
    <div class="detail-section"><h3>Personality</h3><p>${esc(s.personality || "—")}</p></div>
    <div class="detail-section"><h3>Eldorite addiction</h3>${addictionDetail(pid)}</div>
    <p class="lede" style="margin-top:12px">Snapshot · updated ${esc(fmtTime(s.updatedAt))}</p>
  `;
  const miss = $("#btnAddictMiss");
  if (miss) miss.addEventListener("click", () => missAddictionDay(pid));
  if (window.DMCCEnhance && window.DMCCEnhance.decorateDetail) window.DMCCEnhance.decorateDetail(pid);
  const setHpBtn = $("#btnDmSetHp");
  if (setHpBtn) setHpBtn.addEventListener("click", () => {
    const n = Number($("#dmSetHp") && $("#dmSetHp").value);
    if (!isFinite(n)) return;
    pushCommand({ type: "hp", to: pid, payload: { absolute: n, text: "DM set HP to " + n } });
    if (state.demo && state.players[pid] && state.players[pid].snapshot) {
      state.players[pid].snapshot.hpCurrent = n;
      renderPlayers();
    }
  });
  $("#detailBody").querySelectorAll("[data-gun-op]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.getAttribute("data-gun-i"));
      const op = btn.getAttribute("data-gun-op");
      const loadedEl = $("#detailBody").querySelector("[data-gun-loaded='" + index + "']");
      const payload = { index, op, loaded: loadedEl ? Number(loadedEl.value) : null, kind: btn.getAttribute("data-gun-kind") || "gun" };
      if (op === "misfire") {
        const key = btn.getAttribute("data-mf");
        if (key === "reset") payload.resetStreak = true;
        else if (key === "cancel") payload.cancelD4 = true;
        else if (key === "clean-dirt") { payload.dirty = false; payload.resetStreak = true; }
        else if (key === "clear-foul") { payload.fouled = false; payload.ruined = false; }
        else if (key) payload[key] = btn.getAttribute("data-mf-on") === "1";
      }
      if (op === "clear-locks") payload.mode = btn.getAttribute("data-lock-mode") === "one" ? "one" : "all";
      if (op === "clean") payload.optionId = btn.getAttribute("data-clean") || "unjam";
      if (op === "equip") payload.equipped = btn.getAttribute("data-gun-on") === "1";
      if (op === "rechamber") {
        const sel = $("#detailBody").querySelector("[data-gun-rechamber='" + index + "']");
        if (!sel || !sel.value) return;
        payload.chamber = sel.value;
        payload.label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text.split(" · ")[0] : sel.value;
      }
      const snapGuns = (state.players[pid] && state.players[pid].snapshot && state.players[pid].snapshot.guns) || [];
      const gun = snapGuns.find((g) => g && g.index != null && Number(g.index) === index) || snapGuns[index];
      const gunName = (gun && gun.name) || "gun";
      if (op === "repair") {
        payload.weapon = (gun && gun.weapon) || "";
        payload.name = gunName;
        const clears = gunRepairList(gun);
        const ask = "Repair " + gunName + "? This clears " + (clears.length ? clears.join(", ") : "every misfire state (nothing is wrong with it right now)") + ". Free, no gunsmith.";
        const ok = window.SSDNSAsk && window.SSDNSAsk.confirm ? await window.SSDNSAsk.confirm(ask) : window.confirm(ask);
        if (!ok) return;
      }
      const lockN = gun && Array.isArray(gun.lockedChambers) ? gun.lockedChambers.length : 0;
      if (op === "clear-locks" && !lockN) {
        /* 0.3.61: never a silent no-op. Locks are the only thing this button clears. */
        toast(gunName + " has no locked chambers." + ((gun && (gun.jammed || gun.dirty || gun.fouled || gun.ruined)) ? " Use Repair gun to clear the jam, dirt or fouling." : ""));
        return;
      }
      pushCommand({ type: "gun", to: pid, payload });
      if (op === "misfire") postDmAction("DM override on " + gunName + ": " + misfireOverrideWords(payload) + ".", pid);
      if (op === "clear-locks") {
        const which = payload.mode === "one" ? "one locked chamber" : "all locked chambers";
        postDmAction("DM reopened " + which + " on " + gunName + ".", pid);
      }
      if (op === "clean") postDmAction("DM unjammed " + gunName + ".", pid);
      if (op === "repair") postDmAction("DM repaired " + gunName + ".", pid);
      if (op === "rechamber") postDmAction("DM rechambered " + gunName + " to " + payload.label + " (free).", pid);
      if (op === "equip") {
        const which = payload.kind === "focus" ? "focus" : (payload.kind === "melee" ? ((s.melee || []).filter((m) => m && Number(m.index) === index)[0] || {}).name || "melee" : gunName);
        postDmAction("DM " + (payload.equipped ? "equipped" : "unequipped") + " " + which + ".", pid);
      }
      if (state.demo || op === "repair") applyDemoGun(pid, payload);
    });
  });
  const badgeSel = $("#dmBadge");
  if (badgeSel) badgeSel.value = s.badgeState || "dull";
  const badgeBtn = $("#btnDmBadge");
  if (badgeBtn) badgeBtn.addEventListener("click", () => {
    const stateName = (badgeSel && badgeSel.value) || "bright";
    pushCommand({ type: "badge", to: pid, payload: { state: stateName } });
    if (state.demo && state.players[pid] && state.players[pid].snapshot) {
      state.players[pid].snapshot.badgeState = stateName;
      renderPlayers();
    }
  });
  $("#detailOverlay").hidden = false;
}

function renderLedger() {
  const feed = $("#ledgerFeed");
  if (!state.ledger.length) {
    feed.innerHTML = '<div class="empty"><b>Ledger empty</b>ES changes and DM pushes show up here.</div>';
    renderLiveDock();
    return;
  }
  feed.innerHTML = dedupeById(state.ledger).filter((e) => e.type !== "addiction").map((e) => {
    const delta = (e.oldVal != null && e.newVal != null && typeof e.oldVal === "number" && typeof e.newVal === "number")
      ? `${e.oldVal} → ${e.newVal}` : (e.newVal != null ? String(e.newVal) : "");
    return `<div class="feed-item ${e.flag ? "flag" : ""}">
      <div class="feed-meta"><span>${esc(fmtTime(e.ts))}</span><span>${esc(ledgerNames(e))}</span><span class="badge">${esc(e.type)}</span>${e.flag ? '<span class="badge warn">Big jump</span>' : ""}</div>
      <div class="feed-what">${esc(e.what)}${esc(ledgerAck(e))}</div>
      ${delta ? `<div class="feed-delta">${esc(delta)}</div>` : ""}
      ${(e.type === "damage" || e.type === "heal") ? undoHitButton(e.rollId) : ""}
    </div>`;
  }).join("");
  renderLiveDock();
}

const MONEY_TYPES = /es|store|reward|shard/i;
const ALERT_TYPES = /jam|explode|death|condition|alert|undo/i;
let dockSeen = 0;

function dockItems() {
  const rows = [];
  const seenChat = new Set();
  (state.chat || []).forEach((c) => {
    if (c && c.id) {
      if (seenChat.has(c.id)) return;
      seenChat.add(c.id);
    }
    rows.push({
      id: c && c.id,
      ts: c.ts, kind: "chat",
      who: (c.fromName || "Table") + (c.to && c.to !== "all" ? " → " + (c.toName || "one player") : ""),
      characterName: (c && c.characterName) || "",
      playerName: (c && c.playerName) || "",
      text: c.text || ""
    });
  });
  dedupeById(state.ledger || []).forEach((e) => {
    if (e.type === "addiction") return;
    /* 0.2.81: a DM table alert (e.g. "DM override: advantage forced") is a chat line plus a ledger
       record; the feed shows it once (the chat line). The Ledger tab keeps the record. */
    if (e.chatId && seenChat.has(e.chatId)) return;
    const money = MONEY_TYPES.test(String(e.type || ""));
    const alert = ALERT_TYPES.test(String(e.type || "")) || !!e.flag;
    const rollIds = new Set((state.rolls || []).map((r) => r && r.id).filter(Boolean));
    if (e.id && rollIds.has(e.id)) return;
    if ((e.type === "damage" || e.type === "heal") && e.rollId && rollIds.has(e.rollId)) return;
    const resend = e.type === "turn" && e.playerId && e.playerId !== "all"
      ? `<button type="button" class="btn sm" data-resend-feed="${esc(e.playerId)}">Resend</button>`
      : "";
    const undo = (e.type === "damage" || e.type === "heal") ? undoHitButton(e.rollId) : "";
    rows.push({
      ts: e.ts,
      kind: money ? "money" : (alert ? "alerts" : "ledger"),
      who: ledgerNames(e) || e.who || "",
      text: e.what || e.type || "",
      applyHtml: resend + undo
    });
  });
  (state.rolls || []).forEach((r) => {
    const face = rollFace(r);
    rows.push({
      ts: r.ts,
      kind: (r.nat1 && r.isFirearm) ? "alerts" : "rolls",
      who: rollWho(r) || r.characterName || r.who || "",
      characterName: r.characterName || "",
      playerName: r.playerName || "",
      cls: (r.private ? "private " : "") + (face.cls || ""),
      tag: r.private ? "PRIVATE" : face.tag,
      text: rollBody(r),
      formula: r.formula || "",
      attack: !!r.attack,
      nat: r.nat,
      result: r.result,
      face: r.face,
      rolls: r.rolls,
      applyHtml: hitApplyButton(r)
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
function publishMapChat() {
  const items = [];
  const seen = new Set();
  (state.chat || []).forEach((c) => {
    if (!c) return;
    const id = c.id || "";
    if (id && seen.has(id)) return;
    if (id) seen.add(id);
    const who = (c.fromName || "Table") + (c.to && c.to !== "all" ? " → " + (c.toName || "one player") : "");
    items.push({ id: id, ts: c.ts, kind: "chat", who: who, characterName: c.characterName || "", playerName: c.playerName || "", text: c.text || "" });
  });
  (state.rolls || []).forEach((r) => {
    if (!r) return;
    const face = rollFace(r);
    items.push({
      id: r.id ? ("roll:" + r.id) : "",
      ts: r.ts,
      kind: "rolls",
      who: rollWho(r) || r.characterName || r.who || "",
      characterName: r.characterName || "",
      playerName: r.playerName || "",
      cls: (r.private ? "private " : "") + (face.cls || ""),
      tag: r.private ? "PRIVATE" : face.tag,
      text: rollBody(r),
      formula: r.formula || "",
      attack: !!r.attack,
      nat: r.nat,
      result: r.result,
      face: r.face
    });
  });
  (state.messages || []).forEach((m) => {
    items.push({
      id: m.id || "",
      ts: m.ts,
      kind: "alerts",
      who: "DM → " + (m.toName || m.to || "player"),
      text: m.text || ""
    });
  });
  items.sort((a, b) => String(a.ts || "").localeCompare(String(b.ts || "")));
  window.SSDNSChatDockItems = items;
  if (window.SSDNSMapChat) window.SSDNSMapChat.publish(items);
}
function renderLiveDock() {
  guardFocus(() => renderLiveDockNow());
}
function renderLiveDockNow() {
  const feed = $("#dockFeed");
  if (!feed) return;
  fillDockTargets();
  const filter = state.dockFilter || "all";
  const all = dockItems();
  const items = all.filter((row) => filter === "all" || row.kind === filter || (filter === "alerts" && row.kind === "alerts"));
  const stick = feed.dataset.stick !== "0";
  feed.innerHTML = items.slice(-80).map((row) =>
    `<div class="dock-item dock-${esc(row.kind)} ${esc(row.cls || "")}"><div class="dock-meta">${esc(fmtTime(row.ts))} · ${paintWho(row.who)}${row.tag ? ' · <span class="roll-tag">' + esc(row.tag) + "</span>" : ""}</div><div>${paintLine(row, row.text || "")}${row.applyHtml ? '<div class="dock-apply">' + row.applyHtml + "</div>" : ""}</div></div>`
  ).join("") || '<p class="lede">Nothing in this filter yet.</p>';
  if (stick) feed.scrollTop = feed.scrollHeight;
  publishMapChat();
  if (dockIsOpen()) dockSeen = all.length;
  const unread = Math.max(0, all.length - dockSeen);
  const badge = $("#dockBadge");
  if (badge) { badge.hidden = unread < 1; badge.textContent = String(unread); }
  const stripBadge = $("#dockStripBadge");
  if (stripBadge) { stripBadge.hidden = unread < 1; stripBadge.textContent = String(unread); }
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
  } catch (e) { writeFailed(e, "Chat failed"); }
}

function rollWho(r) {
  if (window.SSDNSApplied && window.SSDNSApplied.chosenName) {
    const picked = window.SSDNSApplied.chosenName(r || {});
    if (picked) return picked;
  }
  if (r && r.characterName) return r.characterName;
  return (r && r.who) || "";
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
        <span>${paintWho(rollWho(r))}</span>
        ${state.turnEngaged && r.playerId && r.uid !== state.uid && r.playerId !== state.turnPlayerId ? '<span class="badge">out of turn</span>' : ""}
        ${r.private ? '<span class="badge">Private</span>' : ""}${r.whisper ? '<span class="badge">Whisper</span>' : ""}
        ${face.tag ? '<span class="roll-tag">' + esc(face.tag) + "</span>" : ""}
        ${nat ? '<span class="badge danger">Nat 1 · firearm</span>' : ""}
      </div>
      <div class="feed-what">${paintLine(r, rollBody(r))} ${hitApplyButton(r)}</div>
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
  grid.innerHTML = state.handouts.map((h) => {
    const url = String(h.url || "").trim();
    const text = String(h.text || "").trim();
    const media = url
      ? `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none';if(!this.dataset.fell){this.dataset.fell='1';this.insertAdjacentHTML('afterend','<span>Image couldn\\'t load — open link</span>');}">`
      : `<div class="handout-text">${esc(text || "Text handout")}</div>`;
    const open = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Open link</a>` : "";
    return `
    <div class="handout-card ${url ? "" : "text-only"}">
      ${media}
      <div class="body">
        <h3>${esc(h.name)}</h3>
        <div class="feed-meta"><span>${esc(fmtTime(h.ts))}</span><span>→ ${esc(h.to === "all" ? "Table" : (h.toName || (state.players[h.to] && state.players[h.to].snapshot && state.players[h.to].snapshot.name) || h.to))}${esc(handoutAckLabel(h))}</span></div>
        ${text && url ? `<p class="lede">${esc(text)}</p>` : ""}
        ${open}
        <div class="toolbar" style="margin:8px 0 0">
          <button type="button" class="btn sm" data-resend="${esc(h.id)}">Send again</button>
        </div>
      </div>
    </div>`;
  }).join("");
  $$("[data-resend]", grid).forEach((btn) => btn.addEventListener("click", () => {
    const h = state.handouts.find((x) => x.id === btn.dataset.resend);
    if (h) sendHandoutCommand(h);
  }));
}

/* ---------- notes (local only) ---------- */
function loadNotes() {
  const el = $("#dmNotes");
  if (!el || document.activeElement === el) return;
  try {
    const key = NOTES_KEY + "." + (state.roomCode || "global");
    el.value = localStorage.getItem(key) || localStorage.getItem(NOTES_KEY) || "";
  } catch (e) { el.value = ""; }
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

let rewardBusy = false;
function dedupeById(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((e) => {
    if (e && e.id) {
      if (seen.has(e.id)) return;
      seen.add(e.id);
    }
    out.push(e);
  });
  return out;
}
/* 0.2.67: tell the sheet what kind of reward this is (instrument id + quality) so it
   never has to guess from the text. */
let rewTyped = null; /* 0.3.84 Give tab typed builder (SSDNSItems.typedGive) */
function rewardPayload(type, labeled, id, qty) {
  const payload = { text: labeled, grantId: id, qty: qty };
  if (type !== "item") return payload;
  const Items = window.SSDNSItems;
  const hit = Items && Items.classifyReward ? Items.classifyReward(labeled, "") : { kind: "" };
  if (hit && hit.kind) payload.kind = hit.kind;
  if (hit && hit.kind === "instrument") { payload.instrument = hit.id; payload.quality = hit.quality || "cheap"; }
  else if (hit && hit.id) payload.itemId = hit.id;
  const supply = rewardSupply();
  if (Object.keys(supply).length) payload.supply = supply;
  return payload;
}
/* L0188-L0190: the DM can make any reward food / water: tags, meals, water gal, container size.
   #107 merge: plus its weight in lb (required when the text matches no catalog item, like the typed builder). */
function rewardSupply() {
  const v = (id) => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
  const supply = {};
  if (v("rewTags")) supply.tags = v("rewTags").split(",").map((t) => t.trim()).filter(Boolean);
  if (Number(v("rewMeals")) > 0) supply.meals = Number(v("rewMeals"));
  if (Number(v("rewWater")) > 0) supply.water = Number(v("rewWater"));
  if (Number(v("rewCapacity")) > 0) supply.capacity = Number(v("rewCapacity"));
  if (supply.meals && !(supply.tags || []).includes("food")) supply.tags = (supply.tags || []).concat("food");
  if ((supply.water || supply.capacity) && !(supply.tags || []).includes("water")) supply.tags = (supply.tags || []).concat("water");
  if (supply.capacity && !(supply.tags || []).includes("container")) supply.tags = (supply.tags || []).concat("container");
  if (Object.keys(supply).length && v("rewWeight") !== "" && isFinite(Number(v("rewWeight"))) && Number(v("rewWeight")) >= 0) supply.weight = Number(v("rewWeight"));
  return supply;
}
if (typeof window !== "undefined") window.__ssdnsRewardPayload = rewardPayload;

async function doPushReward() {
  if (rewardBusy) return;
  rewardBusy = true;
  const btn = $("#btnPushReward");
  if (btn) btn.disabled = true;
  try {
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
      const id = uid("rew");
      await pushLedger({
        id: id,
        who: "DM", playerId: pid, playerName: snap.player || "", characterName: name, type: "dm_push",
        what: reason + " (" + (delta >= 0 ? "+" : "") + delta + " ES) → " + name,
        oldVal: old, newVal: neu, flag
      });
      await pushCommand({
        id: id,
        type: "reward_es", to: pid, payload: { delta, reason: reason, grantId: id },
        from: state.uid
      });
    }
    if (state.demo) renderPlayers();
    if (window.SSDNSAudio) window.SSDNSAudio.play("reward");
    toast("ES reward pushed");
  } else {
    const text = ($("#rewText").value || "").trim();
    if (!text) { toast("Enter item or note text"); return; }
    const qty = Math.max(1, parseInt(($("#rewQty") && $("#rewQty").value) || "1", 10) || 1);
    /* 0.3.86: typed builder / ammo pool / Dirty gun (default UI by type, C11), checked before anything is logged */
    let more = type === "item" && rewTyped ? rewTyped.extra(text, qty) : {};
    /* #105 + #107: a Food & water reward with no catalog match lands through the supplies path when its weight is
       set; with the typed builder filled too, the supplies numbers fold into that item. */
    const supNow = type === "item" ? rewardSupply() : {};
    const hasSup = Object.keys(supNow).length > 0;
    if (more.error && hasSup) {
      if (supNow.weight == null) { toast("Enter its weight in lb (0 is fine)."); return; }
      more = {};
    }
    if (more.item && hasSup) {
      const it = more.item;
      it.tags = Array.from(new Set([].concat(it.tags || [], supNow.tags || [])));
      ["meals", "water", "capacity"].forEach((k) => { if (supNow[k] && !it[k]) it[k] = supNow[k]; });
      if (supNow.weight != null && (it.weight == null || it.weight === "")) it.weight = supNow.weight;
    }
    if (more.error) { toast(more.error); return; }
    const labeled = type === "item" && qty > 1 && !/^\d+\s*x\b/i.test(text) ? (qty + "x " + text) : text;
    const to = target === "all" ? "all" : target;
    const id = uid("rew");
    await pushLedger({
      id: id,
      who: "DM", playerId: to, type: "dm_push",
      what: (type === "item" ? "Item: " : "Note: ") + labeled + (to === "all" ? " (everyone)" : ""),
      oldVal: null, newVal: labeled, flag: false
    });
    const payload = rewardPayload(type, labeled, id, qty);
    Object.assign(payload, more);
    await pushCommand({
      id: id,
      type: type === "item" ? "reward_item" : "reward_note",
      to, payload: payload, from: state.uid
    });
    const what = payload.kind === "instrument" ? "Instrument pushed" : (type === "item" ? "Item pushed" : "Note pushed");
    toast(state.demo ? what + " (Demo: not sent to players)" : what);
  }
  } finally {
    rewardBusy = false;
    if (btn) btn.disabled = false;
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
    const mode = ($("#rollMode") && $("#rollMode").value) || "";
    const extra = Number($("#rollMod") && $("#rollMod").value) || 0;
    const pub = $("#rollPublic") && $("#rollPublic").checked;
    const priv = pub ? false : ($("#rollPrivate") ? $("#rollPrivate").checked : true);
    const out = rollChecked(formula, mode, extra);
    const face = out.rolls && out.rolls.length === 1 ? out.rolls[0] : null;
    await pushRoll({
      who: "DM", playerId: null, uid: state.uid || "demo_dm",
      label, formula, result: out.total, detail: out.detail,
      nat1: out.nat1, isFirearm: false, private: priv,
      rolls: out.rolls, face: face
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
    oldVal: null, newVal: "sent", flag: false, handoutId: entry.id
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
    payload: { id: h.id || "", name: h.name, url: h.url || "", text: h.text || "" },
    from: state.uid
  });
  const who = h.to === "all" ? "table" : ((state.players[h.to] && state.players[h.to].snapshot && (state.players[h.to].snapshot.name || state.players[h.to].snapshot.player)) || "a player");
  toast("Handout sent to " + who);
}

/* 0.2.67: the map menu pushes World maps as handouts through the normal handout flow. */
window.SSDNSPushHandout = async function (entry, send) {
  const h = { name: String(entry.name || "Map"), url: String(entry.url || ""), text: String(entry.text || ""), to: entry.to || "all", sent: !!send };
  await pushHandout(h);
  await pushLedger({ who: "DM", playerId: h.to, type: "handout", what: "Handout: " + h.name + (h.to === "all" ? " (table)" : ""), oldVal: null, newVal: "sent", flag: false, handoutId: h.id });
  if (send) await sendHandoutCommand(h);
  if (state.demo) toast("Demo: not sent to players");
  return true;
};

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
  if (window.DMCCEnhance && window.DMCCEnhance.clearFight) window.DMCCEnhance.clearFight();
  permitLobby("end");
  releaseSession();
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
    try { localStorage.removeItem(ROOM_KEY); } catch (err) {}
    pendingResume = null;
    if (state.meta) state.meta.status = "ended";
    try {
      hideRoom();
      showResumeChoice("");
    } finally {
      paintSession("end", { code: codeName, roomStatus: "ended", demo: true });
    }
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
  pendingResume = null;
  if (state.meta) state.meta.status = "ended";
  try {
    hideRoom();
    showResumeChoice("");
  } finally {
    paintSession("end", { code: codeName, roomStatus: "ended", demo: false });
  }
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
      uiTab = window.SSDNSUiTab ? window.SSDNSUiTab.nextTab(uiTab, { type: "click", tab: tab.id }) : tab.id;
      try { sessionStorage.setItem("ssdns.dm.uiTab", uiTab); } catch (err) {}
      document.body.classList.toggle("store-tab-active", tab.id === "tab-store");
      document.body.classList.toggle("map-tab-active", tab.id === "tab-map");
      rememberUi();
    });
  });
  applyActiveTab();
}

/* ---------- boot ---------- */
function wire() {
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e && e.reason;
    const msg = String((reason && (reason.message || reason.code)) || reason || "");
    if (/CONNECTION_CLOSED|ERR_CONNECTION|unavailable|network-request-failed|Failed to fetch|client is offline|Auth timeout/i.test(msg)) {
      if (e.preventDefault) e.preventDefault();
      if (sessionOpen) setStatus("live", "Reconnecting…");
    }
  });
  wireTabs();
  const priv = $("#rollPrivate");
  const privState = $("#rollPrivateState");
  const pub = $("#rollPublic");
  if (priv && privState) {
    const paint = () => { privState.textContent = priv.checked ? "ON" : "OFF"; };
    priv.addEventListener("change", () => {
      if (priv.checked && pub) pub.checked = false;
      paint();
    });
    if (pub) pub.addEventListener("change", () => {
      if (pub.checked) priv.checked = false;
      paint();
    });
    paint();
  }
  const createRoom = async () => {
    const name = ($("#inRoomName").value || "").trim();
    state.demo = false;
    const demoBox = $("#chkDemo");
    if (demoBox) demoBox.checked = false;
    if (!state.firebaseReady) {
      setCreateBusy(true);
      setStatus("live", "Connecting…");
      const ok = await initFirebase();
      if (!ok) {
        setCreateBusy(false);
        toast("Firebase isn't ready yet. Use Load demo table to practice offline.");
        setStatus("offline", "Firebase isn't ready");
        return;
      }
    }
    if (document.body.classList.contains("in-room")) leaveRoom("new");
    setCreateBusy(true);
    setStatus("live", "Connecting…");
    try { await createLiveRoom(name); }
    finally { setCreateBusy(false); }
    if (name && state.meta && !state.demo) { state.meta.name = name; renderRoomHero(); }
  };
  $("#btnCreateRoom").addEventListener("click", createRoom);
  if (window.SSDNSDice) {
    window.SSDNSDice.onBarRoll = (rolled) => {
      const many = !!(rolled.pool && rolled.faces && (rolled.faces.length > 1 || rolled.mod));
      pushRoll({
        who: "DM",
        playerId: null,
        uid: state.uid || "demo_dm",
        label: many ? "Roll" : "d" + rolled.sides,
        formula: rolled.formula,
        result: rolled.result,
        face: rolled.face,
        rolls: rolled.faces || [rolled.face],
        dice: rolled.dice || null,
        detail: many ? rolled.detail : String(rolled.face),
        nat1: !many && rolled.sides === 20 && rolled.face === 1,
        isFirearm: false,
        private: false
      });
    };
  }
  const headerRoll = $("#headerRoll");
  if (headerRoll) headerRoll.addEventListener("submit", (e) => {
    e.preventDefault();
    const formula = (($("#headerFormula") && $("#headerFormula").value) || "1d20").trim() || "1d20";
    const box = $("#rollFormula");
    if (box) box.value = formula;
    const label = $("#rollLabel");
    if (label && !String(label.value || "").trim()) label.value = "Roll";
    doDmRoll();
  });
  const startSession = $("#btnStartSession");
  if (startSession) startSession.addEventListener("click", () => {
    const name = $("#inRoomName");
    if (!name) return;
    const typed = name.value;
    try { name.scrollIntoView({ block: "center" }); } catch (err) {}
    name.focus();
    if (name.value !== typed) name.value = typed;
  });
  const leaveBtn = $("#btnLeaveRoom");
  if (leaveBtn) leaveBtn.addEventListener("click", leaveRoom);
  const resumeBtn = $("#btnResumeRoom");
  if (resumeBtn) resumeBtn.addEventListener("click", () => {
    if (wantDemo() && pendingResume && pendingResume.demo) {
      loadDemo(false, pendingResume.code);
      return;
    }
    if (pendingResume) pendingResume.demo = false;
    resumeLiveRoom();
  });
  $("#btnLoadDemo").addEventListener("click", () => {
    const box = $("#chkDemo");
    if (box) box.checked = true;
    loadDemo(false);
  });
  $("#chkDemo").addEventListener("change", async () => {
    state.demo = $("#chkDemo").checked;
    if (state.demo) {
      setStatus("demo", "Demo mode · offline · use Load demo table");
      return;
    }
    if (!state.demo) {
      if (!state.firebaseReady) setCreateBusy(true);
      const ok = state.firebaseReady || await initFirebase();
      setCreateBusy(false);
      if (!ok) {
        $("#chkDemo").checked = true;
        state.demo = true;
        toast("Firebase is not ready, so Demo stays on. Use How to set this up.");
        setStatus("demo", "Demo mode · Firebase not ready");
        return;
      }
      setStatus("live", "Live mode ready · create or re-join a room");
      toast("Demo off · Create room to go live");
    } else {
      setStatus("demo", "Demo mode · offline");
    }
  });
  const newCodeBtn = $("#btnNewCode");
  if (newCodeBtn) newCodeBtn.addEventListener("click", () => newRoomCode());
  document.addEventListener("click", (e) => {
    if (!roomCodeClickTarget(e.target)) return;
    copyRoomCode(e);
  });
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection && window.getSelection();
    const anchor = sel && sel.anchorNode;
    if (!roomCodeClickTarget(e.target) && !roomCodeClickTarget(anchor)) return;
    const code = roomCodeString();
    if (!code || !e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", code);
  });
  const copyLink = $("#btnCopyLink");
  if (copyLink) copyLink.addEventListener("click", () => copyInvite());
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
    const qty = $("#rewQtyWrap");
    if (qty) qty.hidden = t !== "item";
    const sup = $("#rewSupplyWrap");
    if (sup) sup.hidden = t !== "item";
    const typed = $("#rewItemWrap");
    if (typed) typed.hidden = t !== "item";
    if (t === "item" && rewTyped) rewTyped.refresh();
  });
  if (window.SSDNSItems && window.SSDNSItems.typedGive && $("#rewItemWrap")) {
    rewTyped = window.SSDNSItems.typedGive({ text: $("#rewText"), match: $("#rewMatch"), builder: $("#rewItemBuilder"), dirty: $("#rewDirtyWrap") });
  }
  $("#btnPushReward").addEventListener("click", doPushReward);
  $("#btnSendMsg").addEventListener("click", doSendMsg);
  $("#btnDmRoll").addEventListener("click", doDmRoll);
  $("#btnSendHandout").addEventListener("click", () => doHandout(true));
  $("#btnSaveHandout").addEventListener("click", () => doHandout(false));
  $("#btnExportJson").addEventListener("click", () => exportLedger("json"));
  $("#btnExportCsv").addEventListener("click", () => exportLedger("csv"));
  $("#btnForceSaloon").addEventListener("click", () => doForce("saloon"));
  $("#btnForceStore").addEventListener("click", () => {
    if (window.DMCCEnhance && window.DMCCEnhance.openAllStores) window.DMCCEnhance.openAllStores();
    else doForce("store");
  });
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
  /* Desktop: the feed docks on the left and collapses to a slim strip.
     Default is open; the choice is remembered per browser. */
  const paintDockToggle = () => {
    const shut = document.body.classList.contains("dock-collapsed");
    if (collapse) {
      collapse.innerHTML = shut ? "&#8250;" : "&#8249;";
      collapse.setAttribute("aria-expanded", shut ? "false" : "true");
      collapse.setAttribute("aria-label", shut ? "Open the feed" : "Collapse the feed");
      collapse.title = shut ? "Open the feed" : "Collapse the feed";
    }
  };
  const setDockCollapsed = (shut) => {
    document.body.classList.toggle("dock-collapsed", !!shut);
    paintDockToggle();
    try { localStorage.setItem("ssdns.dm.dock", shut ? "closed" : "open"); } catch (err) {}
    if (!shut) dockSeen = dockItems().length;
    renderLiveDock();
    /* the map canvas measures its box, so let it reflow into the new width */
    try { window.dispatchEvent(new Event("resize")); } catch (err) {}
  };
  if (collapse) collapse.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 800px)").matches) {
      document.body.classList.remove("dock-open");
      renderLiveDock();
      return;
    }
    setDockCollapsed(!document.body.classList.contains("dock-collapsed"));
  });
  const strip = $("#btnDockStrip");
  if (strip) strip.addEventListener("click", () => setDockCollapsed(false));
  const fab = $("#btnDockFab");
  if (fab) fab.addEventListener("click", () => {
    document.body.classList.toggle("dock-open");
    if (document.body.classList.contains("dock-open")) dockSeen = dockItems().length;
    renderLiveDock();
  });
  (function watchKeyboard() {
    const rootEl = document.documentElement;
    const apply = () => {
      const vv = window.visualViewport;
      const inset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      rootEl.style.setProperty("--vv-bottom", inset + "px");
    };
    apply();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", apply);
      window.visualViewport.addEventListener("scroll", apply);
    }
    window.addEventListener("resize", apply);
    const chatting = (node) => !!(node && node.closest && node.closest("#dockChat, .dock-compose"));
    document.addEventListener("focusin", (e) => { if (chatting(e.target)) document.body.classList.add("chat-focus"); });
    document.addEventListener("focusout", () => {
      setTimeout(() => { if (!chatting(document.activeElement)) document.body.classList.remove("chat-focus"); }, 0);
    });
  })();
  const alertBar = $("#addictionAlert");
  if (alertBar) alertBar.addEventListener("click", () => { alertBar.hidden = true; });
  window.addEventListener("storage", (e) => {
    if ((e.key !== "ssdns.v1.consumePing" && e.key !== "ssdns.sheet.consumePing") || !e.newValue) return;
    try { takeConsumePing(JSON.parse(e.newValue)); } catch (err) { console.warn("[DMCC] consume", err); }
  });
  try {
    if ((localStorage.getItem("ssdns.dm.dock") || localStorage.getItem("ssdns.dmcc.dock")) === "closed") {
      document.body.classList.add("dock-collapsed");
    }
  } catch (err) {}
  paintDockToggle();
}

let pendingResume = null;
let lobbyReason = "";
function permitLobby(reason) {
  lobbyReason = reason || "";
}
function readSavedRoom() {
  try { return JSON.parse(localStorage.getItem(ROOM_KEY) || "null"); } catch (e) { return null; }
}
function showResumeChoice(code) {
  const stay = window.SSDNSApplied && window.SSDNSApplied.staysInRoom
    ? window.SSDNSApplied.staysInRoom(sessionOpen, lobbyReason)
    : (sessionOpen && lobbyReason !== "leave" && lobbyReason !== "end" && lobbyReason !== "new");
  if (stay) {
    console.warn("[DMCC] stayed in the room");
    return;
  }
  lobbyReason = "";
  const box = $("#resumeChoice");
  const btn = $("#btnResumeRoom");
  const prompt = $("#resumePrompt");
  if (code) {
    if (btn) {
      btn.hidden = false;
      btn.textContent = "Resume " + code;
    }
    if (prompt) prompt.textContent = "Resume " + code + ", or start a new session. Leaving a room does not end the table.";
  } else if (btn) {
    btn.hidden = true;
    if (prompt) prompt.textContent = "Start a new session. Leaving a room does not end the table.";
  }
  if (box) box.hidden = false;
  const lobby = $("#lobby");
  const shell = $("#roomShell");
  if (lobby) lobby.hidden = false;
  if (shell) shell.hidden = true;
  document.body.classList.remove("in-room");
  syncSessionButtons();
}
async function peekResume() {
  const saved = readSavedRoom();
  if (!saved || !saved.code) return false;
  if (!saved.uid || !state.uid) {
    pendingResume = { code: saved.code, demo: false };
    showResumeChoice(saved.code);
    setStatus("live", "Live · resume " + saved.code + " or start a new session");
    return true;
  }
  if (saved.uid !== state.uid) {
    pendingResume = { code: saved.code, demo: false };
    showResumeChoice(saved.code);
    setStatus("live", "Live · resume " + saved.code + " or start a new session");
    return true;
  }
  try {
    const snap = await state._fb.get(state._fb.ref(state.db, "rooms/" + saved.code + "/meta"));
    if (!snap.exists()) return false;
    const meta = snap.val();
    if (!meta || meta.status === "ended" || meta.dmUid !== state.uid) return false;
    pendingResume = { code: saved.code, meta: meta, demo: false };
    showResumeChoice(saved.code);
    setStatus("live", "Live · resume " + saved.code + " or start a new session");
    return true;
  } catch (e) {
    console.warn("[DMCC] resume", e);
    return false;
  }
}
async function resumeLiveRoom() {
  let pending = pendingResume;
  if (!pending || pending.demo) return false;
  if (!state.firebaseReady) {
    setCreateBusy(true);
    setStatus("live", "Connecting…");
    const ok = await initFirebase();
    setCreateBusy(false);
    if (!ok) { toast("Firebase isn't ready yet"); return false; }
  }
  if (!pending.meta) {
    try {
      const snap = await state._fb.get(state._fb.ref(state.db, "rooms/" + pending.code + "/meta"));
      const meta = snap.exists() ? snap.val() : null;
      if (!meta || meta.status === "ended" || (meta.dmUid && state.uid && meta.dmUid !== state.uid)) {
        toast("That session is not open to resume");
        pendingResume = null;
        showResumeChoice("");
        return false;
      }
      pending = { code: pending.code, meta: meta, demo: false };
      pendingResume = pending;
    } catch (e) {
      console.warn("[DMCC] resume", e);
      toast("Couldn't load " + pending.code);
      return false;
    }
  }
  state.demo = false;
  const demoBox = $("#chkDemo");
  if (demoBox) demoBox.checked = false;
  state.roomCode = pending.code;
  state.meta = pending.meta;
  state.players = {};
  state.ledger = [];
  state.rolls = [];
  state.messages = [];
  state.handouts = [];
  state.commands = [];
  const choice = $("#resumeChoice");
  if (choice) choice.hidden = true;
  setStatus("live", "Loading " + pending.code + "…");
  const loadingNote = "Loading " + pending.code + "…";
  toast(loadingNote);
  try {
    const fb = state._fb;
    const [playersSnap, tableSnap, ledgerSnap] = await Promise.all([
      fb.get(roomRef("players")),
      fb.get(roomRef("table")),
      fb.get(roomRef("ledger"))
    ]);
    state.players = playersSnap.val() || {};
    state.ledger = objToArr(ledgerSnap.val()).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    state.table = tableSnap.val() || {};
  } catch (e) {
    console.warn("[DMCC] resume load", e);
  }
  if (window.DMCCEnhance && window.DMCCEnhance.enterRoom) window.DMCCEnhance.enterRoom();
  if (state._listenCode !== pending.code || !state.unsubs.length) attachLiveListeners();
  if (window.DMCCEnhance && window.DMCCEnhance.onTable) window.DMCCEnhance.onTable(state.table || {});
  showRoom();
  renderAll();
  setStatus("live", "Live · " + pending.code + " · players stay connected");
  const loading = $("#toast");
  if (loading && loading.textContent === loadingNote) loading.hidden = true;
  return true;
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
  rollChecked: rollChecked,
  deepClone: deepClone,
  download: download,
  fmtTime: fmtTime,
  pushLedger: pushLedger,
  postDmAction: postDmAction,
  pushRoll: pushRoll,
  pushCommand: pushCommand,
  applyDemoGun: applyDemoGun,
  pushMessage: pushMessage,
  pushHandout: pushHandout,
  doDmRoll: doDmRoll,
  renderPlayers: renderPlayers,
  renderAll: renderAll,
  isFormField: isFormField,
  guardFocus: guardFocus,
  fieldSnap: fieldSnap,
  restoreField: restoreField,
  recordConsume: recordConsume,
  missAddictionDay: missAddictionDay,
  renderLedger: renderLedger,
  openDetail: openDetail,
  roomRef: roomRef,
  namesFor: namesFor,
  writeFailed: writeFailed,
  setCreateBusy: setCreateBusy,
  playerOnline: playerOnline,
  markRollApplied: markRollApplied
};

async function boot() {
  wire();
  const demoBox = $("#chkDemo");
  state.demo = wantDemo();
  if (demoBox) demoBox.checked = !!state.demo;
  setStatus(state.demo ? "demo" : "offline", "Starting…");
  const lobbyVer = $("#lobbyVersion");
  if (lobbyVer) lobbyVer.textContent = "DMCC " + VERSION;

  // Demo only from ?demo=1 or Load demo table. A saved demo flag never opens demo.
  const saved = readSavedRoom();
  const wasOpen = readOpenFlag();
  releaseSession();
  const autoResume = window.SSDNSApplied && window.SSDNSApplied.resumeInsteadOfLobby
    ? window.SSDNSApplied.resumeInsteadOfLobby(wasOpen)
    : !!(wasOpen && wasOpen.code);
  if (state.demo) {
    if (autoResume) {
      loadDemo(false, wasOpen.code);
      return;
    }
    setCreateBusy(false);
    if (saved && saved.code && saved.demo) {
      pendingResume = { code: saved.code, demo: true };
      showResumeChoice(saved.code);
    } else if (saved && saved.code) {
      pendingResume = { code: saved.code, demo: false };
      showResumeChoice(saved.code);
    } else {
      pendingResume = null;
      showResumeChoice("");
    }
    setStatus("demo", "Demo mode · offline · no Firebase loaded");
  } else {
    state.demo = false;
    if (demoBox) demoBox.checked = false;
    setCreateBusy(true);
    setStatus("live", "Connecting to Firebase…");
    const ok = await initFirebase();
    setCreateBusy(false);
    state.demo = false;
    if (demoBox) demoBox.checked = false;
    if (!ok) {
      pendingResume = null;
      showResumeChoice("");
      setStatus("offline", "Firebase isn't ready. Use Load demo table to practice offline.");
      toast("Firebase isn't ready yet. Use Load demo table to practice offline.");
    } else if (autoResume && wasOpen && wasOpen.code) {
      pendingResume = { code: wasOpen.code, demo: false };
      const resumed = await resumeLiveRoom();
      if (resumed) return;
      pendingResume = null;
      showResumeChoice("");
      setStatus("live", "Live · Firebase connected · start a new session");
    } else {
      const offered = await peekResume();
      if (!offered) {
        if (saved && saved.code) {
          pendingResume = { code: saved.code, demo: false };
          showResumeChoice(saved.code);
          setStatus("live", "Live · resume " + saved.code + " or start a new session");
        } else {
          pendingResume = null;
          showResumeChoice("");
          setStatus("live", "Live · Firebase connected · start a new session");
        }
      }
    }
  }
}

window.addEventListener("ssdns-name-mode", () => {
  try { renderRolls(); } catch (e) {}
  try { renderLiveDock(); } catch (e) {}
});

boot();

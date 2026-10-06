/**
 * SSDNS DM Command Center v0.1.0-draft
 * Demo mode (default / ?demo=1) is fully offline — no Firebase CDN load.
 * Live Firebase path dynamic-imports modular v10+ and degrades if RTDB/auth missing.
 */

const VERSION = "0.2.10"; // dmcc-round7-v0210
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
    state.db = fb.getDatabase(state.app);
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
  state._listenCode = state.roomCode;
  addictionReady = false;
  const bind = (path, handler) => listenRef(path, handler);
  bind("meta", (v) => { if (v) { state.meta = v; guardFocus(() => renderRoomHero()); } });
  const presenceWas = {};
  bind("players", (v) => {
    const prev = state.players || {};
    state.players = v || {};
    Object.keys(state.players).forEach((id) => {
      const p = state.players[id] || {};
      const on = playerOnline(p);
      const s = p.snapshot || {};
      const who = [s.player, s.name].filter(Boolean).join(" · ") || id;
      const was = presenceWas[id];
      if (!prev[id]) {
        const already = (state.ledger || []).some((e) => e && e.type === "join" && e.playerId === id);
        if (!already) {
          pushLedger({
            who: who, playerId: id, playerName: s.player || "", characterName: s.name || "",
            type: "join", what: who + " joined the table", oldVal: null, newVal: "joined", flag: false
          });
        }
      } else if (was === false && on) {
        pushLedger({
          who: who, playerId: id, playerName: s.player || "", characterName: s.name || "",
          type: "rejoin", what: who + " rejoined the table", oldVal: null, newVal: "rejoined", flag: false
        });
      } else if (was === true && !on) {
        pushLedger({
          who: who, playerId: id, playerName: s.player || "", characterName: s.name || "",
          type: "leave", what: who + " left the table", oldVal: null, newVal: "left", flag: false
        });
      }
      presenceWas[id] = on;
    });
    guardFocus(() => {
      holdUi(() => {
        renderPlayers();
        fillTargetSelects();
        renderPresence();
        renderRoomHero();
        if (window.DMCCEnhance && window.DMCCEnhance.fillAdds) window.DMCCEnhance.fillAdds();
        if (window.DMCCEnhance && window.DMCCEnhance.syncPlayers) window.DMCCEnhance.syncPlayers();
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

async function pushCommand(cmd) {
  cmd.id = cmd.id || uid("cmd");
  cmd.ts = cmd.ts || new Date().toISOString();
  if (cmd.payload && (cmd.type === "reward_es" || cmd.type === "reward_item" || cmd.type === "hp")) {
    if (!cmd.payload.grantId) cmd.payload.grantId = cmd.id;
  }
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
    catch (err) { writeFailed(err, "Couldn't sync to players"); }
    toast("Sent: " + cmd.type);
  } catch (e) { writeFailed(e, "Command failed"); }
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

function syncSessionButtons() {
  const inRoom = document.body.classList.contains("in-room");
  const leave = $("#btnLeaveRoom");
  if (leave) leave.hidden = !inRoom;
  const copy = $("#btnCopyCode");
  const end = $("#btnEndSession");
  if (copy) copy.hidden = !inRoom;
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
}

function hideRoom() {
  if (sessionOpen) return;
  $("#lobby").hidden = false;
  $("#roomShell").hidden = true;
  document.body.classList.remove("in-room");
  const dock = $("#liveDock");
  if (dock) dock.hidden = true;
  clearUnsubs();
  state.roomCode = null;
  syncSessionButtons();
}
function leaveRoom() {
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
  box.innerHTML = list.map((p) => {
    const s = p.snapshot || {};
    const on = playerOnline(p);
    const extra = presenceExtra(s);
    const label = esc(s.name || p.id) + (extra ? " · " + esc(extra) : "");
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
let uiTab = "";
function rememberUi() {
  const selected = document.querySelector(".tab[aria-selected='true']");
  if (selected && selected.id) uiTab = selected.id;
  UI_FIELDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) uiMemory[id] = el.value;
  });
}
function restoreUi() {
  if (uiTab) {
    const tab = document.getElementById(uiTab);
    if (tab && tab.getAttribute("aria-selected") !== "true") {
      $$(".tab").forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      $$(".panel").forEach((p) => { p.hidden = true; });
      const panel = $("#" + tab.getAttribute("aria-controls"));
      if (panel) panel.hidden = false;
    }
  }
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
  const test = !!(r && (r.test || /\bTEST\b/.test(String((r && r.detail) || "") + " " + String((r && r.label) || ""))));
  const tag = (base) => (test ? (base ? "TEST · " + base : "TEST") : base);
  if (crit) return { cls: "roll-crit", tag: tag("CRITICAL"), attack: true, crit: true, test: test };
  if (attack) return { cls: "roll-attack", tag: tag("ATTACK"), attack: true, crit: false, test: test };
  if (test) return { cls: "", tag: "TEST", attack: false, crit: false, test: true };
  return { cls: "", tag: "", attack: false, crit: false, test: false };
}
function rollDetail(r) {
  let detail = String((r && r.detail) || "");
  const ac = r && r.ac;
  if (ac == null || ac === "" || !isFinite(Number(ac)) || detail.indexOf("vs AC") >= 0) return detail;
  if (/ → (HIT|MISS)/.test(detail)) return detail.replace(/ → (HIT|MISS)/, " vs AC " + ac + " → $1");
  return detail ? detail + " vs AC " + ac : detail;
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
  feed.innerHTML = dedupeById(state.ledger).filter((e) => e.type !== "addiction").map((e) => {
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
  dedupeById(state.ledger || []).forEach((e) => {
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
  } catch (e) { writeFailed(e, "Chat failed"); }
}

function rollWho(r) {
  if (r && r.characterName && r.playerName) return r.characterName + " (" + r.playerName + ")";
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
        <span>${esc(rollWho(r))}</span>
        ${state.turnEngaged && r.playerId && r.uid !== state.uid && r.playerId !== state.turnPlayerId ? '<span class="badge">out of turn</span>' : ""}
        ${r.private ? '<span class="badge">Private</span>' : ""}${r.whisper ? '<span class="badge">Whisper</span>' : ""}
        ${face.tag ? '<span class="roll-tag">' + esc(face.tag) + "</span>" : ""}
        ${nat ? '<span class="badge danger">Nat 1 · firearm</span>' : ""}
      </div>
      <div class="feed-what"><b>${esc(r.label || "Roll")}</b> · ${esc(r.formula)} = <b style="color:var(--eld)">${esc(r.result)}</b> <span style="color:var(--muted)">(${esc(rollDetail(r))})</span></div>
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
        <div class="feed-meta"><span>${esc(fmtTime(h.ts))}</span><span>→ ${esc(h.to === "all" ? "Table" : h.to)}</span></div>
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
    const labeled = type === "item" && qty > 1 && !/^\d+\s*x\b/i.test(text) ? (qty + "x " + text) : text;
    const to = target === "all" ? "all" : target;
    const id = uid("rew");
    await pushLedger({
      id: id,
      who: "DM", playerId: to, type: "dm_push",
      what: (type === "item" ? "Item: " : "Note: ") + labeled + (to === "all" ? " (everyone)" : ""),
      oldVal: null, newVal: labeled, flag: false
    });
    await pushCommand({
      id: id,
      type: type === "item" ? "reward_item" : "reward_note",
      to, payload: { text: labeled, grantId: id, qty: qty }, from: state.uid
    });
    toast(type === "item" ? "Item pushed" : "Note pushed");
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
    hideRoom();
    showResumeChoice("");
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
  hideRoom();
  showResumeChoice("");
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
      uiTab = tab.id;
      rememberUi();
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
  const createRoom = async () => {
    const name = ($("#inRoomName").value || "").trim();
    if (!state.demo && !state.firebaseReady) {
      setCreateBusy(true);
      setStatus("live", "Connecting…");
      const ok = await initFirebase();
      if (!ok) {
        setCreateBusy(false);
        toast("Firebase isn't ready yet");
        return;
      }
    }
    if (document.body.classList.contains("in-room")) leaveRoom();
    if (state.demo) {
      loadDemo(true);
      if (name && state.meta) { state.meta.name = name; renderRoomHero(); }
      return;
    }
    setCreateBusy(true);
    setStatus("live", "Connecting…");
    try { await createLiveRoom(name); }
    finally { setCreateBusy(false); }
    if (name && state.meta) { state.meta.name = name; renderRoomHero(); }
  };
  $("#btnCreateRoom").addEventListener("click", createRoom);
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
    if (pendingResume && pendingResume.demo) {
      loadDemo(false, pendingResume.code);
      return;
    }
    resumeLiveRoom();
  });
  $("#btnLoadDemo").addEventListener("click", () => loadDemo(false));
  $("#chkDemo").addEventListener("change", async () => {
    state.demo = $("#chkDemo").checked;
    if (!state.demo) {
      if (!state.firebaseReady) setCreateBusy(true);
      const ok = state.firebaseReady || await initFirebase();
      setCreateBusy(false);
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
    const qty = $("#rewQtyWrap");
    if (qty) qty.hidden = t !== "item";
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
    try { localStorage.setItem("ssdns.dm.dock", document.body.classList.contains("dock-collapsed") ? "closed" : "open"); } catch (err) {}
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
    if ((e.key !== "ssdns.v1.consumePing" && e.key !== "ssdns.sheet.consumePing") || !e.newValue) return;
    try { takeConsumePing(JSON.parse(e.newValue)); } catch (err) { console.warn("[DMCC] consume", err); }
  });
  try {
    if ((localStorage.getItem("ssdns.dm.dock") || localStorage.getItem("ssdns.dmcc.dock")) === "closed") {
      document.body.classList.add("dock-collapsed");
      if (collapse) collapse.textContent = "Show";
    }
  } catch (err) {}
}

let pendingResume = null;
function readSavedRoom() {
  try { return JSON.parse(localStorage.getItem(ROOM_KEY) || "null"); } catch (e) { return null; }
}
function showResumeChoice(code) {
  if (sessionOpen) return;
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
  if (!saved || saved.demo || !saved.code) return false;
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
  toast("Loading " + pending.code + "…");
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
  if (state._listenCode !== pending.code || !state.unsubs.length) attachLiveListeners();
  if (window.DMCCEnhance && window.DMCCEnhance.onTable) window.DMCCEnhance.onTable(state.table || {});
  showRoom();
  renderAll();
  setStatus("live", "Live · " + pending.code + " · players stay connected");
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
  setCreateBusy: setCreateBusy
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
  const saved = readSavedRoom();
  const open = readOpenFlag();
  if (open && open.code && saved && String(saved.code).toUpperCase() === String(open.code).toUpperCase()) {
    if (open.demo || saved.demo) {
      loadDemo(false, open.code);
      return;
    }
    state.demo = false;
    $("#chkDemo").checked = false;
    state.roomCode = open.code;
    state.meta = state.meta || { code: open.code, name: "", status: "live", dmUid: state.uid || "" };
    showRoom();
    setCreateBusy(true);
    setStatus("live", "Connecting…");
    const resumedOk = await initFirebase();
    setCreateBusy(false);
    if (resumedOk) {
      pendingResume = { code: open.code, demo: false };
      const resumed = await resumeLiveRoom();
      if (resumed) return;
    }
    releaseSession();
  }
  if (state.demo) {
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
    setCreateBusy(true);
    setStatus("live", "Connecting to Firebase…");
    const ok = await initFirebase();
    setCreateBusy(false);
    if (!ok) {
      state.demo = true;
      $("#chkDemo").checked = true;
      if (saved && saved.code && saved.demo) {
        pendingResume = { code: saved.code, demo: true };
        showResumeChoice(saved.code);
      } else {
        pendingResume = null;
        showResumeChoice("");
      }
      setStatus("demo", "Demo mode · Firebase unavailable");
      toast("Firebase unavailable — Demo mode on. See DM-SETUP.md");
    } else {
      const offered = await peekResume();
      if (!offered) {
        if (saved && saved.code && !saved.demo) {
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

boot();

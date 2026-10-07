/**
 * DMCC v0.2 panels: fight tracker, damage/heal, store stock, bestiary,
 * PHB lookup, music, handout packs, conditions, undo, shortcuts.
 * Loaded after dmcc.js. Demo and live share this code.
 */
const DM = window.DMCC;
const $ = DM.$;
const $$ = DM.$$;
const esc = DM.esc;

const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion"];
const BESTIARY_KEY = "ssdns.dm.bestiary.v2";
const PACK_KEY = "ssdns.dm.packs";
const TABLE_KEY = "ssdns.dm.table";
function migrateLocal(next, prev) {
  try {
    if (localStorage.getItem(next) == null) {
      const old = localStorage.getItem(prev);
      if (old != null) localStorage.setItem(next, old);
    }
  } catch (e) {}
}
migrateLocal(PACK_KEY, "ssdns.dmcc.packs");

const fight = {
  round: 1,
  turn: 0,
  started: false,
  order: [],
  inspiration: 0,
  updatedAt: "",
  bestiary: [],
  packs: [],
  stock: [],
  damageMode: "auto",
  storeOpen: false,
  tracks: [],
  trackId: "",
  loop: false,
  toTable: false,
  playing: false,
  undo: null,
  undos: {},
  recruit: true,
  departed: {},
  removed: {},
  appliedHits: {},
  turnCmd: null,
  condMap: {}
};

function tableKey() {
  const next = TABLE_KEY + "." + (DM.state.roomCode || "demo");
  migrateLocal(next, "ssdns.dmcc.table." + (DM.state.roomCode || "demo"));
  return next;
}
function loadLocalTable() {
  try {
    const raw = JSON.parse(localStorage.getItem(tableKey()) || "null");
    if (!raw) return;
    fight.round = raw.round || 1;
    fight.turn = raw.turn || 0;
    fight.started = !!raw.started;
    if (raw.recruit != null) fight.recruit = !!raw.recruit;
    fight.order = raw.order || [];
    fight.inspiration = Number(raw.inspiration) || 0;
    fight.updatedAt = raw.updatedAt || "";
    fight.stock = raw.stock || [];
    fight.packs = raw.packs || fight.packs;
    if (raw.condMap && typeof raw.condMap === "object") fight.condMap = raw.condMap;
    if (raw.removed && typeof raw.removed === "object") fight.removed = raw.removed;
    if (raw.departed && typeof raw.departed === "object") fight.departed = raw.departed;
    const present = {};
    Object.keys(DM.state.players || {}).forEach((id) => { present[id] = 1; });
    fight.order = window.SSDNSApplied && window.SSDNSApplied.stripGhostCombatants
      ? window.SSDNSApplied.stripGhostCombatants(fight.order, DM.state.players && Object.keys(DM.state.players).length ? present : null)
      : (fight.order || []);
    fight.order = (fight.order || []).filter((row) => {
      if (!row || row.kind !== "player") return !!row;
      const id = row.playerId || row.id;
      return !(fight.departed && fight.departed[id]);
    });
    if (raw.undos && typeof raw.undos === "object") fight.undos = raw.undos;
    if (raw.damageMode === "approve" || raw.damageMode === "auto") fight.damageMode = raw.damageMode;
  } catch (e) {}
  try {
    const packs = JSON.parse(localStorage.getItem(PACK_KEY) || "null");
    if (Array.isArray(packs) && packs.length) fight.packs = packs;
  } catch (e) {}
}
function saveLocalTable() {
  try {
    localStorage.setItem(tableKey(), JSON.stringify({
      round: fight.round, turn: fight.turn, started: !!fight.started, recruit: fight.recruit !== false, order: fight.order, inspiration: fight.inspiration,
      stock: fight.stock, packs: fight.packs, condMap: fight.condMap || {}, removed: fight.removed || {}, departed: fight.departed || {}, undos: fight.undos || {}, damageMode: fight.damageMode === "approve" ? "approve" : "auto", updatedAt: fight.updatedAt
    }));
    localStorage.setItem(PACK_KEY, JSON.stringify(fight.packs));
  } catch (e) {}
}
function knownNumber(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function keepVital(remoteVal, localVal) {
  const remote = knownNumber(remoteVal);
  if (remote != null) return remote;
  const local = knownNumber(localVal);
  if (local != null) return local;
  return "";
}
function enemyFled(row) {
  return !!(row && row.kind === "enemy" && (row.fled || row.status === "Fled"));
}
function rowTactics(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.tacticsNote) return window.SSDNSApplied.tacticsNote(row || {});
  const card = row && row.card;
  return (card && card.tactics) || "";
}
function onDeck() {
  if (!fight.started || !fight.order.length) return null;
  const step = nextLivingIndex(fight.turn);
  if (!step || step.index === fight.turn) return null;
  return fight.order[step.index] || null;
}
function enemyStatus(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.coarseStatus) return window.SSDNSApplied.coarseStatus(row);
  if (!row || row.kind === "player") return row && row.status ? row.status : "";
  if (enemyFled(row)) return "Fled";
  const hp = knownNumber(row.hp);
  const max = knownNumber(row.maxHp);
  if (hp == null) return "";
  if (hp <= 0) return "Down";
  if (max == null || max <= 0) return "Hurt";
  if (hp >= max) return "Unhurt";
  if (hp * 2 <= max) return "Bloodied";
  return "Hurt";
}
function revealOf(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.revealFlags) return window.SSDNSApplied.revealFlags(row);
  const src = (row && row.reveal) || {};
  return { name: src.name !== false, ac: !!src.ac, hp: !!src.hp, block: !!src.block };
}
function captureSecrets() {
  fight.secrets = fight.secrets || {};
  (fight.order || []).forEach((row) => {
    if (!row || !row.id || row.kind === "player") return;
    const secret = window.SSDNSApplied && window.SSDNSApplied.secretEnemy
      ? window.SSDNSApplied.secretEnemy(Object.assign({}, row, { dcs: window.SSDNSApplied.dcLines ? window.SSDNSApplied.dcLines(row.card) : null }))
      : { name: row.name, ac: row.ac, hp: row.hp, maxHp: row.maxHp, reveal: revealOf(row) };
    fight.secrets[row.id] = secret;
  });
}
function restoreSecrets() {
  (fight.order || []).forEach((row) => {
    const secret = row && fight.secrets && fight.secrets[row.id];
    if (!secret || row.kind === "player") return;
    if (secret.name) row.name = secret.name;
    ["ac", "hp", "maxHp", "dex", "atkBonus"].forEach((key) => {
      if (secret[key] != null && secret[key] !== "") row[key] = secret[key];
    });
    if (secret.damage) row.damage = secret.damage;
    if (secret.reveal) row.reveal = secret.reveal;
    if (secret.side === "friendly" || secret.side === "enemy") row.side = secret.side;
    if (secret.card && typeof secret.card === "object") row.card = Object.assign({}, row.card || {}, secret.card);
  });
}
function playersSeeLine(row, i) {
  const shown = window.SSDNSApplied && window.SSDNSApplied.publicEnemy
    ? window.SSDNSApplied.publicEnemy(row, i, conditionsForRow(row))
    : { name: (row && row.name) || "Enemy", status: enemyStatus(row), conditions: [] };
  const bits = [shown.name || "Enemy"];
  if (shown.side === "friendly") bits.push("Friendly");
  if (shown.status) bits.push(shown.status);
  const rev = shown.revealed || {};
  if (rev.ac != null && rev.ac !== "") bits.push("AC " + rev.ac);
  if (rev.hp != null && rev.hp !== "") bits.push(String(rev.hp) + "/" + (rev.maxHp == null || rev.maxHp === "" ? "?" : rev.maxHp));
  if (rev.block) bits.push("stat block");
  const conds = (shown.conditions || []).filter(Boolean).join(", ");
  if (conds) bits.push(conds);
  return `<p class="fine players-see">Players see ${esc(bits.join(" · "))}</p>`;
}
function revealBar(row, i) {
  if (!row || row.kind !== "enemy") return "";
  const flags = revealOf(row);
  const box = (key, label) => `<label class="toggle"><input type="checkbox" data-reveal="${key}" data-reveal-i="${i}"${flags[key] ? " checked" : ""}> ${label}</label>`;
  return `<div class="reveal-bar">${box("name", "Reveal name")}${box("ac", "Reveal AC")}${box("hp", "Reveal HP")}${box("block", "Reveal stat block")}<button type="button" class="btn sm" data-hide-all="${i}">Hide all</button></div>${playersSeeLine(row, i)}`;
}
function d20() {
  const forced = window.SSDNSTestRoll && window.SSDNSTestRoll();
  if (forced) return forced;
  return 1 + Math.floor(Math.random() * 20);
}
function tieLabel(row) {
  if (!row) return "";
  const bits = [];
  const bonus = knownNumber(row.initBonus);
  if (row.kind !== "player" && bonus != null) bits.push("init " + (bonus >= 0 ? "+" : "") + bonus);
  const dex = knownNumber(row.dex);
  bits.push("DEX " + (dex == null ? "—" : dex));
  return bits.join(" ");
}
function dexModOf(snap) {
  const mods = (snap && snap.mods) || {};
  if (mods.DEX != null && mods.DEX !== "") return Number(mods.DEX) || 0;
  return 0;
}
function postedInit(pid) {
  const row = pid && DM.state.playerInit && DM.state.playerInit[pid];
  const n = knownNumber(row && row.init);
  return n;
}
function dexOf(row) {
  const n = knownNumber(row && row.dex);
  if (n == null) return 10;
  return n;
}
function dexFromSnapshot(s) {
  if (!s) return 0;
  const ab = s.abilities || {};
  if (ab.DEX != null && ab.DEX !== "") return Number(ab.DEX) || 0;
  const mods = s.mods || {};
  if (mods.DEX != null && mods.DEX !== "") return Number(mods.DEX) || 0;
  return 0;
}
function sortInitiative() {
  const cur = fight.order[fight.turn];
  const curId = cur && cur.id;
  if (window.SSDNSApplied && window.SSDNSApplied.sortInitiative) {
    fight.order = window.SSDNSApplied.sortInitiative(fight.order, dexOf);
  } else {
    const indexed = fight.order.map((row, i) => ({ row: row, i: i }));
    indexed.sort((a, b) => {
      const aOk = a.row.init !== "" && a.row.init != null && isFinite(Number(a.row.init));
      const bOk = b.row.init !== "" && b.row.init != null && isFinite(Number(b.row.init));
      const av = aOk ? Number(a.row.init) : -Infinity;
      const bv = bOk ? Number(b.row.init) : -Infinity;
      if (bv !== av) return bv - av;
      const dd = dexOf(b.row) - dexOf(a.row);
      if (dd) return dd;
      return a.i - b.i;
    });
    fight.order = indexed.map((x) => x.row);
    fight.order.forEach((row, i, arr) => {
      const prev = arr[i - 1];
      const next = arr[i + 1];
      const same = (other) => other && row.init !== "" && row.init != null && Number(other.init) === Number(row.init);
      row.tie = !!(same(prev) || same(next));
    });
  }
  if (curId) {
    const idx = fight.order.findIndex((r) => r.id === curId);
    if (idx >= 0) fight.turn = idx;
  } else if (fight.turn >= fight.order.length) fight.turn = 0;
}
function syncDamageMode() {
  const el = $("#damageMode");
  if (el && el.value === "approve") fight.damageMode = "approve";
  if (fight.damageMode !== "approve" && fight.damageMode !== "auto") fight.damageMode = "auto";
  if (el && el.value !== fight.damageMode) el.value = fight.damageMode;
}
function buildPublish() {
  captureSecrets();
  (fight.order || []).forEach((row) => {
    if (window.SSDNSApplied && window.SSDNSApplied.refreshCombatantStatus) window.SSDNSApplied.refreshCombatantStatus(row);
  });
    const order = (fight.order || []).map((row, index) => {
      const shown = window.SSDNSApplied && window.SSDNSApplied.publicEnemy
        ? window.SSDNSApplied.publicEnemy(row, index, conditionsForRow(row))
        : { name: row.name || "", status: enemyStatus(row) };
      return {
        id: row.id || "",
        name: shown.name || "",
        kind: row.kind || "",
        init: row.init == null ? "" : row.init,
        playerId: row.playerId || "",
        status: shown.status || "",
        slot: index,
        lastAttackerId: row.lastAttackerId || "",
        initFrom: row.initFrom || "",
        side: row.kind === "player" ? "" : (window.SSDNSApplied && window.SSDNSApplied.combatantSide ? window.SSDNSApplied.combatantSide(row) : (isFriendly(row) ? "friendly" : "enemy"))
      };
    });
    const hp = {};
    const pub = {};
    const secret = {};
    (fight.order || []).forEach((row, index) => {
      if (!row.id) return;
      const shown = window.SSDNSApplied && window.SSDNSApplied.publicEnemy
        ? window.SSDNSApplied.publicEnemy(row, index, conditionsForRow(row))
        : { name: row.name || "", status: enemyStatus(row), kind: row.kind || "", playerId: row.playerId || "", slot: index, conditions: [] };
      if (row.kind !== "player") {
        hp[row.id] = { hp: row.hp == null ? "" : row.hp, maxHp: row.maxHp == null ? "" : row.maxHp, ac: row.ac == null ? "" : row.ac };
        secret[row.id] = (fight.secrets && fight.secrets[row.id]) || { name: row.name || "", ac: row.ac, hp: row.hp, maxHp: row.maxHp };
      }
      pub[row.id] = shown;
    });
    fight.publicView = pub;
  return { order: order, hp: hp, pub: pub, secret: secret };
}
async function saveRemoteTable() {
  syncDamageMode();
  fight.updatedAt = new Date().toISOString();
  saveLocalTable();
  const published = buildPublish();
  if (DM.state.demo || !DM.state.db) return;
  try {
    const order = published.order;
    const hp = published.hp;
    const pub = published.pub;
    const secret = published.secret;
    await DM.state._fb.update(DM.roomRef("table"), {
      initiative: { round: fight.round, turn: fight.turn, started: !!fight.started, recruit: fight.recruit !== false, order: order },
      store: fight.stock,
      packs: fight.packs,
      storeOpen: !!fight.storeOpen,
      damageMode: fight.damageMode === "approve" ? "approve" : "auto",
      updatedAt: fight.updatedAt
    });
    try {
      await DM.state._fb.set(DM.roomRef("encounter/hp"), hp);
      await DM.state._fb.set(DM.roomRef("encounter/dm"), secret);
      await DM.state._fb.set(DM.roomRef("encounter/public"), pub);
    } catch (err) {
      if (DM.writeFailed) DM.writeFailed(err, "Couldn't sync to players");
      return;
    }
  } catch (e) {
    if (DM.writeFailed) DM.writeFailed(e, "Couldn't sync to players");
  }
}
let inspSeen = "";
let inspPrimed = false;
function readInspiration(v) {
  const insp = v && v.inspiration;
  if (insp && typeof insp === "object") return { count: Number(insp.count) || 0, last: insp.last || null };
  if (typeof insp === "number") return { count: insp, last: null };
  return { count: Number(fight.inspiration) || 0, last: null };
}
function applyRemoteTable(v) {
  if (!v) return;
  const remoteAt = Date.parse(v.updatedAt || "") || 0;
  const localAt = Date.parse(fight.updatedAt || "") || 0;
  const init = v.initiative || {};
  const stale = remoteAt && localAt && remoteAt + 1500 < localAt;
  if (!stale) {
    if (Array.isArray(init.order)) {
      if (!(init.order.length === 0 && fight.order.length && !v.updatedAt)) {
        const prev = {};
        fight.order.forEach((row) => { if (row && row.id) prev[row.id] = row; });
        fight.order = init.order.map((row) => {
          const old = prev[row.id] || {};
          return Object.assign({}, old, row, {
            hp: keepVital(row.hp, old.hp),
            maxHp: keepVital(row.maxHp, old.maxHp),
            ac: keepVital(row.ac, old.ac),
            dex: keepVital(row.dex, old.dex),
            initBonus: keepVital(row.initBonus, old.initBonus)
          });
        }).filter((row) => !isRemoved(row));
        restoreSecrets();
      }
    }
    if (v.damageMode === "approve" || v.damageMode === "auto") fight.damageMode = v.damageMode;
    syncDamageMode();
    if (v.storeOpen != null) fight.storeOpen = !!v.storeOpen;
    if (init.round) fight.round = init.round;
    if (init.turn != null) fight.turn = init.turn;
    if (init.started != null) fight.started = !!init.started;
    if (init.recruit != null) fight.recruit = !!init.recruit;
    if (Array.isArray(v.store)) fight.stock = v.store;
    if (Array.isArray(v.packs)) fight.packs = v.packs;
    if (v.updatedAt) fight.updatedAt = v.updatedAt;
  }
  const insp = readInspiration(v);
  if (v.inspiration != null) fight.inspiration = insp.count;
  renderInspiration();
  if (insp.last && insp.last.id && insp.last.id !== inspSeen) {
    inspSeen = insp.last.id;
    if (inspPrimed) DM.toast(insp.last.text || "Inspiration");
  }
  inspPrimed = true;
  renderFight();
  renderStock();
  renderPacks();
}

function namesFor(pid) {
  const p = pid && DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  return { playerName: s.player || "", characterName: s.name || "" };
}

function undoStorageKey() {
  return "ssdns.dm.undos." + (DM.state.roomCode || "demo");
}
function loadUndos() {
  try {
    const raw = JSON.parse(localStorage.getItem(undoStorageKey()) || "null");
    if (raw && typeof raw === "object") fight.undos = Object.assign({}, raw, fight.undos || {});
  } catch (e) {}
}
function saveUndos() {
  try { localStorage.setItem(undoStorageKey(), JSON.stringify(fight.undos || {})); } catch (e) {}
  saveLocalTable();
}
function rememberUndo(entry) {
  fight.undo = entry;
  fight.undos = fight.undos || {};
  if (entry && entry.rollId) fight.undos[entry.rollId] = entry;
  saveUndos();
  const btn = $("#btnUndo");
  if (btn) btn.disabled = !entry;
}
function ledgerUndo(rollId) {
  const led = (DM.state.ledger || []).find((e) => e && e.rollId === rollId && (e.type === "damage" || e.type === "heal") && e.oldVal != null && e.type !== "undo");
  if (!led) return null;
  const heal = led.type === "heal" || !!led.heal;
  const before = Number(led.oldVal);
  const after = Number(led.newVal);
  const amt = isFinite(before) && isFinite(after) ? Math.abs(after - before) : (Number(led.amount) || 0);
  const targetId = led.targetId || "";
  const pid = led.subjectId || "";
  return {
    type: "hit",
    rollId: rollId,
    label: led.what || "hit",
    playerId: pid,
    heal: heal,
    amount: amt,
    restoreHp: targetId ? { id: targetId, hp: before } : null,
    command: pid ? {
      type: "hp",
      to: pid,
      payload: { delta: heal ? -amt : amt, kind: heal ? "damage" : "heal", amount: amt, text: "Undo " + (led.what || "hit"), grantId: rollId + ":undo" },
      from: DM.state.uid
    } : null
  };
}
function undoRecord(rollId) {
  if (!rollId) return null;
  loadUndos();
  if (fight.undos && fight.undos[rollId]) return fight.undos[rollId];
  if (fight.undo && fight.undo.rollId === rollId) return fight.undo;
  const rebuilt = ledgerUndo(rollId);
  if (rebuilt) {
    fight.undos = fight.undos || {};
    fight.undos[rollId] = rebuilt;
    saveUndos();
  }
  return rebuilt;
}

async function undoEntry(u) {
  if (!u) { DM.toast("Nothing to undo"); return false; }
  const rollId = u.rollId || "";
  if (rollId && window.SSDNSApplied) {
    const marks = window.SSDNSApplied.load(DM.state.roomCode) || {};
    if (marks["undo:" + rollId]) { DM.toast("Already undone"); return false; }
    if (!marks[rollId]) window.SSDNSApplied.claim(DM.state.roomCode, rollId);
    if (!window.SSDNSApplied.takeUndo(DM.state.roomCode, rollId)) {
      DM.toast("Already undone");
      return false;
    }
  }
  if (fight.undo && (!rollId || fight.undo.rollId === rollId)) fight.undo = null;
  if (rollId && fight.undos) delete fight.undos[rollId];
  saveUndos();
  const btn = $("#btnUndo");
  if (btn) btn.disabled = !fight.undo;
  const names = namesFor(u.playerId);
  await DM.pushLedger(Object.assign({
    who: "DM", type: "undo", flag: false,
    what: "Undo: " + (u.label || u.type),
    oldVal: null, newVal: "undone"
  }, names, { playerId: u.playerId || "all" }));
  if (u.command) await DM.pushCommand(u.command);
  if (u.restoreHp) {
    const row = fight.order.find((r) => r && (r.id === u.restoreHp.id || r.playerId === u.restoreHp.id));
    if (row) {
      row.hp = u.restoreHp.hp;
      if (u.restoreHp.maxHp != null && u.restoreHp.maxHp !== "") row.maxHp = u.restoreHp.maxHp;
    }
    const snap = playerSnapshot(u.playerId || u.restoreHp.id);
    if (snap && u.restoreHp.hp != null) snap.hpCurrent = u.restoreHp.hp;
    if (u.rollId) {
      delete fight.appliedHits[u.rollId];
      if (window.SSDNSApplied) window.SSDNSApplied.release(DM.state.roomCode, u.rollId);
      if (DM.markRollApplied) DM.markRollApplied(u.rollId, false);
    }
    await saveRemoteTable();
    renderFight();
  }
  if (DM.state.demo && u.demo) u.demo();
  DM.renderPlayers();
  if (DM.renderLedger) DM.renderLedger();
  if (DM.renderRolls) DM.renderRolls();
  DM.toast("Undid last push");
  return true;
}
async function undoLast() {
  return undoEntry(fight.undo);
}
function undoByRoll(rollId) {
  const u = undoRecord(rollId);
  if (!u) { DM.toast("Nothing to undo"); return Promise.resolve(false); }
  return undoEntry(u);
}

function playerSelect(sel, includeAll) {
  const el = $(sel);
  if (!el) return;
  const keep = el.value;
  const opts = (includeAll ? '<option value="all">Everyone</option>' : "") +
    Object.keys(DM.state.players).map((id) => {
      const s = DM.state.players[id].snapshot || {};
      const label = [s.player, s.name].filter(Boolean).join(" · ") || id;
      return `<option value="${esc(id)}">${esc(label)}</option>`;
    }).join("");
  el.innerHTML = opts || '<option value="">No players</option>';
  if ([...el.options].some((o) => o.value === keep)) el.value = keep;
}

function renderInspiration() {
  const n = String(Number(fight.inspiration) || 0);
  const a = $("#inspCount");
  const b = $("#inspCountTable");
  if (a) a.textContent = n;
  if (b) b.textContent = n;
}
function initSourceLabel(row) {
  if (!row || row.kind !== "player") return tieLabel(row);
  const bits = [];
  const posted = postedInit(row.playerId || row.id);
  const from = row.initFrom || (posted != null && Number(row.init) === Number(posted) ? "sheet" : (row.init != null && row.init !== "" ? "rolled" : ""));
  if (row.init != null && row.init !== "" && from) bits.push("init " + row.init + " (" + from + ")");
  const dex = knownNumber(row.dex);
  bits.push("DEX " + (dex == null ? "—" : dex));
  return bits.join(" ");
}
function syncTurnState() {
  const cur = fight.started ? fight.order[fight.turn] : null;
  DM.state.turnEngaged = !!fight.started;
  DM.state.turnPlayerId = cur && cur.kind === "player" ? (cur.playerId || cur.id || "") : "";
}
function signed(n) {
  const v = Number(n) || 0;
  return (v >= 0 ? "+" : "") + v;
}
function cardMod(score) {
  if (window.SSDNSApplied && window.SSDNSApplied.abilityMod) return window.SSDNSApplied.abilityMod(score);
  const n = Number(score);
  return isFinite(n) ? Math.floor((n - 10) / 2) : 0;
}
function featureButtons(list, i, kind) {
  return (list || []).map((f, n) => {
    if (!f || typeof f !== "object") return "";
    const key = kind + ":" + n;
    const left = f.uses == null ? null : (f._left == null ? f.uses : f._left);
    const useAttr = i < 0
      ? `data-sheet-feat="use" data-feat-kind="${esc(kind)}" data-n="${n}"`
      : `data-feat-use="${i}" data-feat-kind="${esc(kind)}" data-feat-n="${n}"`;
    const rechargeAttr = i < 0
      ? `data-sheet-feat="recharge" data-feat-kind="${esc(kind)}" data-n="${n}"`
      : `data-feat-recharge="${i}" data-feat-kind="${esc(kind)}" data-feat-n="${n}"`;
    const use = f.uses != null
      ? `<button type="button" class="btn sm" ${useAttr}>Use ${esc(f.name || "feature")} (${left})</button>`
      : "";
    const recharge = f.recharge
      ? `<button type="button" class="btn sm" ${rechargeAttr}>Recharge ${esc(f.recharge)}</button>`
      : "";
    return use || recharge ? `<span data-feat-key="${esc(key)}">${use}${recharge}</span>` : "";
  }).join(" ");
}
function featureBlock(title, list, i, kind) {
  const items = Array.isArray(list) ? list : [];
  if (!items.length) return "";
  const paras = items.map((item) => {
    if (!item) return "";
    if (typeof item === "string") return `<p class="fine">${esc(item)}</p>`;
    const name = item.name || "";
    const text = item.text || "";
    return `<p class="fine">${name ? `<b>${esc(name)}.</b> ` : ""}${esc(text)}</p>`;
  }).join("");
  return `<div class="detail-section"><h3>${esc(title)}</h3>${paras}<p class="toolbar">${featureButtons(list, i, kind)}</p></div>`;
}
let enemySheetId = null;
const previewRows = {};
function sheetSaveMod(card, ability) {
  if (window.SSDNSApplied && window.SSDNSApplied.saveMod) return window.SSDNSApplied.saveMod(card, ability);
  return cardMod(card && card.scores && card.scores[ability]);
}
function enemyCardHtml(row, i) {
  const card = row.card;
  if (!card) return "";
  const scores = card.scores || {};
  const abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((key) => {
    const score = scores[key];
    const mod = cardMod(score);
    return `<button type="button" class="abil-cell" data-sheet-check="1" data-check-mod="${mod}" data-check-label="${esc(key)}"><b>${signed(mod)}</b><span>${key} ${score == null ? "—" : esc(score)}</span></button>`;
  }).join("");
  const saves = ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((key) => {
    const mod = sheetSaveMod(card, key);
    const listed = card.saves && card.saves[key] != null && card.saves[key] !== "";
    return `<button type="button" class="abil-cell" data-sheet-check="1" data-check-mod="${mod}" data-check-label="${esc(key)} save"><b>${signed(mod)}</b><span>${key}${listed ? "" : ""}</span></button>`;
  }).join("");
  const skillLine = Object.keys(card.skills || {}).map((name) => {
    const bonus = card.skills[name];
    const n = bonus && typeof bonus === "object" ? bonus.bonus : bonus;
    return `<button type="button" class="btn" data-sheet-check="1" data-check-mod="${Number(n) || 0}" data-check-label="${esc(name)}">${esc(name)} ${signed(n)}</button>`;
  }).join("");
  const dcLines = window.SSDNSApplied && window.SSDNSApplied.dcLines ? window.SSDNSApplied.dcLines(card) : [];
  const attacks = (card.attacks || []).map((atk, n) => {
    const call = (fn, value) => (window.SSDNSApplied && window.SSDNSApplied[fn] ? window.SSDNSApplied[fn](value) : "");
    const rider = call("riderText", atk.rider);
    const poison = call("saveDamageText", atk.saveDamage);
    const grip = call("grappleText", atk.grapple);
    const effect = call("saveEffectText", atk.saveEffect);
    const cap = atk.capacity == null ? "" : `${atk.loaded == null ? "?" : atk.loaded}/${atk.capacity}`;
    const extra = atk.extraDamage && atk.extraDamage.damage
      ? ("+" + atk.extraDamage.damage + (atk.extraDamage.damageType ? " " + atk.extraDamage.damageType : ""))
      : "";
    const bits = [
      atk.kind || "",
      signed(atk.toHit),
      [atk.damage || "", atk.damageType || ""].filter(Boolean).join(" "),
      extra,
      atk.versatile ? ("2H " + atk.versatile) : "",
      atk.range || "",
      cap,
      atk.misfire == null ? "" : ("MF " + atk.misfire)
    ].filter(Boolean);
    const jam = atk.jammed
      ? `<p class="fine">Jammed. <button type="button" class="btn sm" data-clear-jam="${i}" data-atk-n="${n}">Clear jam</button></p>`
      : "";
    const needsSave = !!(atk.rider || atk.saveDamage || atk.saveEffect);
    const riderBtns = needsSave
      ? `<button type="button" class="btn" data-sheet-save="prompt" data-n="${n}">Prompt player save</button>
         <button type="button" class="btn" data-sheet-save="auto" data-n="${n}">Auto-roll</button>`
      : "";
    const calls = [rider, poison, grip, effect].filter(Boolean).map((line) => `<p class="dc-call">${esc(line)}</p>`).join("");
    return `<article class="atk-row">
      <h3>${esc(atk.name || "Attack")}</h3>
      <p>${esc(bits.join(" · "))}</p>
      ${atk.notes ? `<p class="fine">${esc(atk.notes)}</p>` : ""}
      ${calls}
      ${jam}
      ${isFriendly(row) ? `<p class="fine">Friendly. This attack does not target the party.</p>` : `<div class="toolbar">
        <button type="button" class="btn btn-primary" data-sheet-roll="1" data-n="${n}">Roll</button>
        <button type="button" class="btn" data-sheet-apply="1" data-n="${n}">Apply</button>
        ${riderBtns}
      </div>`}
    </article>`;
  }).join("");
  const rider = row.pendingRider && row.pendingRider.condition
    ? `<p><button type="button" class="btn" data-apply-rider="${i}">Apply ${esc(row.pendingRider.condition)}${row.pendingRider.targetName ? " to " + esc(row.pendingRider.targetName) : ""}</button></p>`
    : "";
  const casting = card.spellcasting;
  let spells = "";
  if (casting) {
    const list = Array.isArray(casting.spells) ? casting.spells : [];
    const pips = Object.keys(card.slots || {}).map((lv) => {
      const slot = card.slots[lv];
      const dots = [];
      for (let p = 0; p < slot.max; p++) {
        const mark = p < slot.left ? "●" : "○";
        dots.push(i < 0
          ? `<button type="button" class="btn sm" data-sheet-slot="${esc(lv)}" aria-label="Level ${esc(lv)} slot">${mark}</button>`
          : `<button type="button" class="btn sm" data-slot-spend="${i}" data-slot-lv="${esc(lv)}" aria-label="Level ${esc(lv)} slot">${mark}</button>`);
      }
      return `<span class="fine">L${esc(lv)} ${dots.join("")}</span>`;
    }).join(" ");
    const buttons = list.map((spell, n) => {
      const raw = typeof spell === "string" ? spell : (spell && spell.name) || "Spell";
      const known = window.SSDNSSpellCast && window.SSDNSSpellCast.lookup ? window.SSDNSSpellCast.lookup(raw) : null;
      const name = (known && known.name) || raw;
      const blurb = window.SSDNSSpellCast && window.SSDNSSpellCast.blurb ? window.SSDNSSpellCast.blurb(name) : "";
      const kind = (known && known.kind) || (spell && spell.kind) || "";
      const level = spell && spell.level != null ? spell.level : (known && known.level != null ? known.level : "");
      const mode = kind === "save" ? "SAVE" : (kind === "attack" ? "ATTACK" : (kind ? String(kind).toUpperCase() : ""));
      const meta = [
        level !== "" && level != null ? "L" + level : "",
        mode,
        casting.dc != null ? "DC " + casting.dc : "",
        casting.attack != null ? "atk " + signed(casting.attack) : "",
        known && known.dice ? known.dice : "",
        known && known.range ? known.range : ""
      ].filter(Boolean).join(" · ");
      const castLabel = kind === "save" ? "Cast (save)" : (kind === "attack" ? "Cast (attack)" : "Cast");
      return `<article class="atk-row">
        <h3>${esc(name)}</h3>
        <p>${esc(meta)}</p>
        ${blurb ? `<p class="fine">${esc(blurb)}</p>` : ""}
        ${isFriendly(row) ? `<p class="fine">Friendly. This spell does not target the party.</p>` : `<button type="button" class="btn" data-sheet-cast="1" data-n="${n}">${esc(castLabel)}</button>`}
      </article>`;
    }).join("");
    const dc = casting.dc == null ? "—" : casting.dc;
    spells = `<div class="detail-section"><h3>Spells</h3>
      <p class="dc-call">Spell save DC ${esc(dc)}${casting.ability ? " (" + esc(casting.ability) + ")" : ""} · attack ${signed(casting.attack)}</p>
      ${pips ? `<p>${pips}</p>` : `<p class="fine">At will</p>`}
      ${buttons}</div>`;
  }
  const maxHp = row.maxHp == null || row.maxHp === "" ? row.hp : row.maxHp;
  const cur = Number(row.hp);
  const max = Number(maxHp);
  const pct = isFinite(cur) && isFinite(max) && max > 0 ? Math.max(0, Math.min(100, Math.round(cur / max * 100))) : 0;
  const hpFields = String(enemySheetId || "").indexOf("preview:") === 0
    ? `<label class="fine">HP <input type="number" data-preview-hp="${esc(row.beastId || "")}" value="${row.hp == null ? "" : esc(row.hp)}" aria-label="HP"></label>
       <label class="fine">Max <input type="number" data-preview-max="${esc(row.beastId || "")}" value="${maxHp == null ? "" : esc(maxHp)}" aria-label="Max HP"></label>`
    : `<label class="fine">HP <input type="number" data-hp-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.hp == null ? "" : esc(row.hp)}" aria-label="HP"></label>
       <label class="fine">Max <input type="number" data-max-val="${i}" data-row-id="${esc(row.id || "")}" value="${maxHp == null ? "" : esc(maxHp)}" aria-label="Max HP"></label>`;
  const loot = card.loot ? `<div class="detail-section"><h3>Loot</h3><p>${esc(card.loot)}</p>${card.esDrop != null ? `<p class="fine">Drops ${esc(card.esDrop)} ES</p>` : ""}</div>` : (card.esDrop != null ? `<div class="detail-section"><h3>Loot</h3><p>Drops ${esc(card.esDrop)} ES</p></div>` : "");
  const tactics = rowTactics(row);
  return `<div class="enemy-card">
    <div class="stat-row">
      <div class="stat"><b>${esc(row.ac == null ? "—" : row.ac)}</b><span>AC</span></div>
      <div class="stat"><b>${esc(row.hp == null ? "—" : row.hp)}/${esc(maxHp == null ? "—" : maxHp)}</b><span>HP</span></div>
      <div class="stat"><b>${esc(card.speed || "—")}</b><span>Speed</span></div>
      <div class="stat"><b>${esc(card.cr || "—")}</b><span>CR</span></div>
    </div>
    <div class="hp-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
    <div class="toolbar">${hpFields}</div>
    ${tactics ? `<p class="tactics-note">Tactics. ${esc(tactics)}</p>` : ""}
    ${revealBar(row, i)}
    ${card.senses ? `<p class="fine">${esc(card.senses)}</p>` : ""}
    ${card.description ? `<p>${esc(card.description)}</p>` : ""}
    ${conditionChips(row)}
    ${dcLines.length ? `<div class="detail-section"><h3>DCs</h3>${dcLines.map((line) => `<p class="dc-call">${esc(line)}</p>`).join("")}</div>` : ""}
    <div class="detail-section"><h3>Attacks</h3>${attacks || "<p class=\"fine\">No listed attacks.</p>"}</div>
    ${rider}
    <div class="detail-section"><h3>Abilities</h3><div class="abil-grid">${abilities}</div></div>
    <div class="detail-section"><h3>Saving throws</h3><div class="abil-grid">${saves}</div><p class="fine">Uses the advantage toggle in the dice box.</p></div>
    ${skillLine ? `<div class="detail-section"><h3>Skills</h3><div class="toolbar">${skillLine}</div></div>` : ""}
    ${featureBlock("Traits", card.traits, i, "traits")}
    ${featureBlock("Actions", card.actions, i, "actions")}
    ${featureBlock("Reactions", card.reactions, i, "reactions")}
    ${featureBlock("Legendary", card.legendary, i, "legendary")}
    ${spells}
    ${loot}
    <div class="toolbar sheet-dice">
      <input type="text" data-dice-formula="${i}" value="1d20" aria-label="Dice for ${esc(row.name || "enemy")}" placeholder="2d6+3">
      <select data-dice-mode="${i}" aria-label="Advantage for ${esc(row.name || "enemy")}">
        <option value="">Normal</option>
        <option value="adv">Advantage</option>
        <option value="dis">Disadvantage</option>
      </select>
      <input type="number" data-dice-mod="${i}" value="0" aria-label="Modifier for ${esc(row.name || "enemy")}">
      <label class="toggle"><input type="checkbox" data-card-public="${i}"${card.public ? " checked" : ""}> Public</label>
      <button type="button" class="btn" data-sheet-dice="1">Roll</button>
    </div>
  </div>`;
}
function isFriendly(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.combatantSide) return window.SSDNSApplied.combatantSide(row) === "friendly";
  const side = row && String(row.side || "").toLowerCase();
  return side === "friendly" || side === "ally" || !!(row && (row.ally === true || row.friendly === true));
}
function partyAttackBlocked(row) {
  if (!isFriendly(row)) return false;
  DM.toast((row && row.name ? row.name : "Ally") + " is friendly and does not attack the party");
  return true;
}
function compactAttackButtons(row, i) {
  const list = (row.card && row.card.attacks && row.card.attacks.length) ? row.card.attacks : (row.attackList || []);
  const open = `<button type="button" class="btn sm" data-open-enemy="${esc(row.id || "")}">Open sheet</button>`;
  if (!list.length) return `<button type="button" class="btn sm" data-init-strike="${i}">Attack player</button>${open}`;
  return list.map((atk, n) => {
    const label = window.SSDNSApplied && window.SSDNSApplied.attackButtonLabel
      ? window.SSDNSApplied.attackButtonLabel(atk)
      : ((atk && atk.name) || "Attack");
    return `<button type="button" class="btn sm" data-row-atk="${i}" data-atk-n="${n}">${esc(label)}</button>`;
  }).join("") + open;
}
function turnRowHtml(row, i) {
  const flash = fight.flash === i ? " flash" : "";
  const friendly = row.kind === "enemy" && isFriendly(row);
  const status = row.kind === "enemy" ? enemyStatus(row) : "";
  const current = fight.started && i === fight.turn ? " current" : "";
  const detail = row.kind === "player" ? initSourceLabel(row) : tieLabel(row);
  const fled = enemyFled(row);
  const downed = !fled && knownNumber(row.hp) === 0;
  const bloodied = !fled && !downed && enemyStatus(row) === "Bloodied";
  const downBadge = fled ? `<span class="badge">Fled</span>` : (downed ? `<span class="badge danger">Unconscious · Down</span>` : (bloodied ? `<span class="badge warn">Bloodied</span>` : ""));
  const sideBadge = friendly ? `<span class="badge eld">Friendly</span>` : "";
  const sideWord = row.kind === "enemy" ? (friendly ? "Friendly" : "Enemy") : (row.kind || "combatant");
  const tactics = row.kind === "enemy" ? rowTactics(row) : "";
  const enemyEdit = row.kind === "enemy"
    ? `<label class="fine">Atk <input type="number" data-atk-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.atkBonus == null ? "" : esc(row.atkBonus)}" aria-label="Attack bonus for ${esc(row.name || "enemy")}"></label>
      <label class="fine">Dmg <input class="cond-rounds" data-dmg-val="${i}" data-row-id="${esc(row.id || "")}" value="${esc(row.damage || "")}" placeholder="1d6+2" aria-label="Damage dice for ${esc(row.name || "enemy")}"></label>`
    : "";
  return `<div class="init-row${current}${flash}${fled ? " fled" : ""}${friendly ? " friendly" : ""}">
      <input class="init-score" type="number" data-init-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.init == null ? "" : esc(row.init)}" aria-label="Initiative for ${esc(row.name || "combatant")}">
      <span class="init-who" title="${esc(row.name || "Someone")}">        <span class="who-name">${row.kind === "enemy" ? `<button type="button" class="name-btn" data-open-enemy="${esc(row.id || "")}">${esc(row.name || "Someone")}</button>` : `<b>${esc(row.name || "Someone")}</b>`}${sideBadge}</span>
        <span class="fine">${esc(sideWord)}${row.tie ? " · tie" : ""}${status ? " · " + esc(status) : ""}${detail ? " · " + esc(detail) : ""}${esc(turnAckLabel(row))}</span>
        ${downBadge}
        ${conditionChips(row)}
        ${tactics ? `<span class="tactics-note">Tactics. ${esc(tactics)}</span>` : ""}
        ${revealBar(row, i)}
      </span>
      <label class="fine">AC <input type="number" data-ac-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.ac == null ? "" : esc(row.ac)}" aria-label="AC for ${esc(row.name || "combatant")}"></label>
      <label class="fine">HP <input type="number" data-hp-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.hp == null ? "" : esc(row.hp)}" aria-label="HP for ${esc(row.name || "combatant")}"></label>
      ${row.kind === "enemy" ? `<label class="fine">Max <input type="number" data-max-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.maxHp == null ? "" : esc(row.maxHp)}" aria-label="Max HP for ${esc(row.name || "enemy")}"></label>` : ""}
      ${enemyEdit}
      <span class="init-actions">
        ${row.kind === "enemy" ? `<button type="button" class="btn sm" data-side-toggle="${i}" aria-pressed="${friendly ? "true" : "false"}">${friendly ? "Mark enemy" : "Mark friendly"}</button>` : ""}
        ${row.kind === "enemy" ? (friendly ? `<button type="button" class="btn sm" data-open-enemy="${esc(row.id || "")}">Open sheet</button>` : compactAttackButtons(row, i)) : `<button type="button" class="btn sm" data-your-turn="${i}">Your turn</button>`}
        <button type="button" class="btn sm" data-init-cond="${i}">Conditions</button>
        <button type="button" class="btn sm" data-init-hit="${i}">${row.kind === "enemy" ? (friendly ? "Attack this creature" : "Attack this enemy") : "Attack this player"}</button>
        <button type="button" class="btn sm" data-init-dmg="${i}">Damage</button>
        <button type="button" class="btn sm" data-init-heal="${i}">Heal</button>
        <button type="button" class="btn sm" data-init-down="${i}">Down</button>
        ${row.kind === "enemy" ? `<button type="button" class="btn sm" data-init-fled="${i}">Fled</button>` : ""}
        ${current && row.kind === "player" ? `<button type="button" class="btn sm" data-resend-turn="${i}">Resend your-turn</button>` : ""}
        <button type="button" class="btn sm" data-init-up="${i}" aria-label="Move up">↑</button>
        <button type="button" class="btn sm" data-init-down-move="${i}" aria-label="Move down">↓</button>
        <button type="button" class="btn sm" data-init-del="${i}" aria-label="Remove">✕</button>
      </span>
    </div>`;
}
function fightRowFromField(el) {
  if (!el || !el.getAttribute) return null;
  const rowId = el.getAttribute("data-row-id");
  if (rowId) {
    const hit = fight.order.find((r) => r.id === rowId);
    if (hit) return hit;
  }
  const initI = el.getAttribute("data-init-val");
  const hpI = el.getAttribute("data-hp-val");
  const acI = el.getAttribute("data-ac-val");
  const atkI = el.getAttribute("data-atk-val");
  const dmgI = el.getAttribute("data-dmg-val");
  const i = parseInt(initI != null ? initI : (hpI != null ? hpI : (acI != null ? acI : (atkI != null ? atkI : dmgI))), 10);
  return isFinite(i) ? fight.order[i] : null;
}
function absorbFightInputs() {
  const active = document.activeElement;
  if (!active || !active.isConnected) return;
  const row = fightRowFromField(active);
  if (!row) return;
  const initI = active.getAttribute("data-init-val");
  const hpI = active.getAttribute("data-hp-val");
  const acI = active.getAttribute("data-ac-val");
  const atkI = active.getAttribute("data-atk-val");
  const dmgI = active.getAttribute("data-dmg-val");
  const n = active.value === "" ? "" : parseInt(active.value, 10);
  if (initI != null) row.init = n;
  if (hpI != null) row.hp = n;
  if (acI != null) row.ac = n;
  if (atkI != null) row.atkBonus = active.value === "" ? "" : Number(active.value);
  if (dmgI != null) row.damage = active.value;
}
function renderFight() {
  const run = () => {
    syncDamageMode();
    absorbFightInputs();
    const list = $("#initList");
    const strip = $("#turnStrip");
    const label = $("#initRound");
    if (label) {
      const deck = onDeck();
      const cur = fight.started ? fight.order[fight.turn] : null;
      label.textContent = fight.started && fight.order.length
        ? ("Round " + fight.round + (cur && cur.name ? " · " + cur.name : "") + (deck && deck.name ? " · On deck: " + deck.name : ""))
        : "";
    }
    renderInspiration();
    if (!fight.order.length) {
      const empty = '<div class="empty"><b>No turn order</b>Add a player or an example creature. Initiative rolls from joined sheets land here.</div>';
      if (list && !(document.activeElement && list.contains(document.activeElement))) list.innerHTML = empty;
      if (strip) strip.innerHTML = "";
      syncTurnState();
      return;
    }
    if (fight.turn >= fight.order.length) fight.turn = 0;
    const html = fight.order.map(turnRowHtml).join("");
    if (list) list.innerHTML = html;
    if (strip) {
      const deck = onDeck();
      strip.innerHTML = `<div class="turn-strip-label">Turn order</div>`
        + (deck && deck.name ? `<div class="ondeck-line">On deck: ${esc(deck.name)}</div>` : "")
        + fight.order.map((row, i) => {
        const current = fight.started && i === fight.turn ? " current" : "";
        const ondeck = deck && row.id === deck.id ? " ondeck" : "";
        const label = `<b>${esc(row.init == null || row.init === "" ? "—" : row.init)}</b> ${esc(row.name || "")}`;
        const friendlyChip = row.kind === "enemy" && isFriendly(row) ? " friendly" : "";
        if (row.kind === "enemy") return `<button type="button" class="turn-chip${current}${ondeck}${friendlyChip}" data-open-enemy="${esc(row.id || "")}">${label}</button>`;
        return `<span class="turn-chip${current}${ondeck}">${label}</span>`;
      }).join("");
    }
    syncTurnState();
    const sheet = $("#enemySheet");
    if (sheet && !sheet.hidden) renderEnemySheet();
  };
  if (DM.guardFocus) DM.guardFocus(run);
  else run();
}

function rewriteAnnounce(id, prev, next) {
  if (!id || !prev || prev === next) return;
  const entry = (DM.state.ledger || []).find((e) => e && e.id === id);
  if (!entry) return;
  entry.what = String(entry.what || "").split(prev).join(next);
  DM.pushLedger(Object.assign({}, entry, { id: id, what: entry.what }));
}
function uniqueName(name, opts) {
  opts = opts || {};
  const base = String(name || "Enemy").replace(/\s+\d+$/, "").trim() || "Enemy";
  const same = fight.order.filter((r) => r.kind === "enemy" && String(r.name || "").replace(/\s+\d+$/, "").trim() === base);
  if (!same.length && !opts.forceNumber) return base;
  same.forEach((r, i) => {
    const next = base + " " + (i + 1);
    if (r.name !== next) {
      const prev = r.name;
      r.name = next;
      rewriteAnnounce(r.announceId, prev, next);
    }
  });
  return base + " " + (same.length + 1);
}
function addCombatant(row) {
  const pid = row.playerId || (row.kind === "player" ? row.id : "");
  if (pid && row.kind === "player") {
    const snap = DM.state.players[pid] && DM.state.players[pid].snapshot;
    row.dex = dexFromSnapshot(snap);
    if (snap && snap.hpMax != null) row.maxHp = snap.hpMax;
  }
  if (pid && fight.removed && (fight.removed[pid] || fight.removed[row.id])) return null;
  if (pid) {
    const existing = fight.order.find((r) => r.id === pid || r.playerId === pid);
    if (existing) {
      existing.name = row.name || existing.name;
      existing.ac = row.ac != null ? row.ac : existing.ac;
      existing.hp = row.hp != null ? row.hp : existing.hp;
      if (row.init != null && row.init !== "") existing.init = row.init;
      if (row.dex != null) existing.dex = row.dex;
      existing.kind = row.kind || existing.kind;
      sortInitiative();
      saveRemoteTable();
      renderFight();
      return existing;
    }
  }
  if (row.kind === "enemy") {
    row.name = uniqueName(row.name, { forceNumber: !!row.forceNumber });
    if (row.initBonus === "" || row.initBonus == null) {
      const dex = knownNumber(row.dex);
      if (dex != null) row.initBonus = dexModFrom(dex);
    }
  }
  if (row.hp != null && (row.maxHp == null || row.maxHp === "")) row.maxHp = row.hp;
  fight.order.push(row);
  sortInitiative();
  saveRemoteTable();
  renderFight();
  if (row.kind === "enemy") ensurePlayers();
  return row;
}
function playerIsOnline(pid) {
  const p = DM.state.players && DM.state.players[pid];
  if (DM.playerOnline) return DM.playerOnline(p);
  return !!(p && p.presence && p.presence.online);
}
function turnAckLabel(row) {
  const cmd = fight.turnCmd;
  if (!cmd || !row || row.kind !== "player") return "";
  if ((row.playerId || row.id) !== cmd.playerId) return "";
  const p = DM.state.players && DM.state.players[cmd.playerId];
  const ack = p && p.turnAck;
  if (ack && ack.id === cmd.id && ack.seen) return " · seen";
  if (ack && ack.id === cmd.id && (ack.delivered || ack.seen === false)) return " · delivered";
  return " · sent";
}
function isRemoved(row) {
  if (!row) return false;
  const gone = fight.removed || {};
  return !!(gone[row.id] || (row.playerId && gone[row.playerId]));
}
function ensurePlayers() {
  if (fight.recruit === false) return;
  Object.keys(DM.state.players || {}).forEach((pid) => {
    if (fight.departed && fight.departed[pid]) return;
    if (fight.removed && fight.removed[pid]) return;
    const row = fight.order.find((r) => r && (r.id === pid || r.playerId === pid));
    const posted = postedInit(pid);
    if (row) {
      if (posted != null && (row.init === "" || row.init == null)) row.init = posted;
      return;
    }
    if (!playerIsOnline(pid)) return;
    const s = (DM.state.players[pid] && DM.state.players[pid].snapshot) || {};
    addCombatant({
      id: pid,
      playerId: pid,
      name: s.name || s.player || pid,
      kind: "player",
      ac: s.ac,
      hp: s.hpCurrent,
      maxHp: s.hpMax,
      dex: dexFromSnapshot(s),
      init: posted == null ? undefined : posted,
      initFrom: posted == null ? "" : "sheet"
    });
  });
}
function announce(line, type, row) {
  DM.toast(line);
  const id = DM.uid("led");
  if (row) row.announceId = id;
  DM.pushLedger({ id: id, who: "DM", playerId: "all", type: type || "combat", what: line, oldVal: null, newVal: "", flag: false });
}
function sendYourTurn(cur, resent) {
  const sent = $("#turnSent");
  if (!cur || cur.kind !== "player") {
    if (sent) sent.textContent = "";
    return;
  }
  const pid = cur.playerId || cur.id;
  const id = DM.uid("turn");
  fight.turnCmd = { id: id, playerId: pid, name: cur.name || "player" };
  if (sent) sent.textContent = (resent ? "↻ Your turn resent to " : "✔ Your turn sent to ") + (cur.name || "player");
  const line = "Your turn → " + (cur.name || "player") + (resent ? " · resent" : "");
  DM.pushCommand({
    id: id, type: "your_turn", to: pid, quiet: true,
    payload: { name: cur.name || "", round: fight.round },
    from: DM.state.uid
  });
  DM.pushLedger({
    who: "DM", playerId: pid, type: "turn",
    what: line, oldVal: null, newVal: resent ? "resent" : "sent", flag: false
  });
  renderFight();
}
function dedupeConditions(list) {
  const byName = {};
  (list || []).forEach((raw) => {
    if (!raw) return;
    const name = String(raw.name || raw || "").trim();
    const key = name.replace(/\s+\d+$/, "").replace(/\s+\d+r$/i, "").toLowerCase();
    if (!key) return;
    const row = typeof raw === "string" ? { name: name } : raw;
    const prev = byName[key];
    if (!prev) { byName[key] = row; return; }
    const prevDm = /^dm$/i.test(prev.byName || "") || prev.by === "dm";
    const nextDm = /^dm$/i.test(row.byName || "") || row.by === "dm";
    if (prevDm && !nextDm) byName[key] = row;
  });
  return Object.keys(byName).map((key) => byName[key]);
}
function conditionsForRow(row) {
  if (!row) return [];
  const subject = row.kind === "player" ? (row.playerId || row.id) : row.id;
  const fromMap = Object.keys(fight.condMap || {}).map((id) => Object.assign({ id: id }, fight.condMap[id])).filter((c) => c && c.subjectId === subject);
  const list = fromMap.length ? fromMap : (row.conditions || []);
  return dedupeConditions(list);
}
function conditionChips(row) {
  const Cond = window.SSDNSConditions;
  const list = conditionsForRow(row);
  if (!Cond || !list.length) return "";
  return `<span class="cond-row">${list.map((c) => `<span class="cond-chip">${esc(Cond.label(c))}</span>`).join("")}</span>`;
}
function openDialog(dlg) {
  try {
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute("open", "");
  } catch (e) {
    dlg.setAttribute("open", "");
  }
}
function askRowConditions(i) {
  const row = fight.order[i];
  const Cond = window.SSDNSConditions;
  if (!row || !Cond) return;
  const subjectId = row.kind === "player" ? (row.playerId || row.id) : row.id;
  const kind = row.kind === "enemy" ? "enemy" : "player";
  const current = conditionsForRow(row);
  const dlg = document.createElement("dialog");
  dlg.className = "dlg";
  const picks = Cond.catalog().map((item) => {
    const have = current.filter((c) => String(c.name || "").toLowerCase() === item.name.toLowerCase())[0];
    const rounds = have && have.rounds != null ? have.rounds : "";
    const level = have && have.level ? have.level : 1;
    return `<label class="toggle"><input type="checkbox" data-cond="${esc(item.name)}"${have ? " checked" : ""}> ${esc(item.name)}
      ${item.exhaustion ? `<input type="number" min="1" max="6" data-cond-level="${esc(item.name)}" value="${level}" aria-label="Exhaustion level">` : ""}
      <input class="cond-rounds" type="number" min="1" data-cond-rounds="${esc(item.name)}" placeholder="rounds" value="${esc(rounds)}" aria-label="Rounds for ${esc(item.name)}">
      <span class="fine">${esc(item.text)}</span></label>`;
  }).join("");
  dlg.innerHTML = `<form method="dialog"><h2>Conditions · ${esc(row.name || "")}</h2><div class="cond-picks">${picks}</div><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Save</button></div></form>`;
  const initialIds = current.map((c) => c && c.id).filter(Boolean);
  const finish = async (ok) => {
    const names = [];
    const roundsByName = {};
    let level = 1;
    if (ok) {
      dlg.querySelectorAll("[data-cond]").forEach((el) => {
        if (!el.checked) return;
        const condName = el.getAttribute("data-cond");
        names.push(condName);
        const lv = dlg.querySelector("[data-cond-level='" + condName + "']");
        if (lv) level = parseInt(lv.value, 10) || 1;
        const rounds = dlg.querySelector("[data-cond-rounds='" + condName + "']");
        if (rounds && String(rounds.value).trim() !== "") roundsByName[condName] = parseInt(rounds.value, 10);
      });
    }
    if (dlg.close) dlg.close();
    if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
    if (!ok) return;
    const removeIds = initialIds.filter((id) => {
      const had = current.filter((c) => c && c.id === id)[0];
      if (!had) return false;
      return names.every((n) => String(n).toLowerCase() !== String(had.name || "").toLowerCase());
    });
    await writeSubjectConditions(subjectId, kind, names, row.name || "", level, roundsByName, removeIds);
    DM.toast(names.length ? "Conditions set" : (removeIds.length ? "Conditions cleared" : "Conditions kept"));
  };
  dlg.querySelector("[value=no]").addEventListener("click", () => finish(false));
  dlg.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); finish(true); });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
  document.body.appendChild(dlg);
  openDialog(dlg);
}
async function writeSubjectConditions(subjectId, kind, names, label, exhLevel, roundsByName, removeIds) {
  const Cond = window.SSDNSConditions;
  if (!Cond || !subjectId) return;
  const existing = [];
  Object.keys(fight.condMap || {}).forEach((id) => {
    const row = fight.condMap[id];
    if (row && row.subjectId === subjectId) existing.push(Object.assign({ id: id }, row));
  });
  const snapNow = kind === "player" && DM.state.players[subjectId] && DM.state.players[subjectId].snapshot;
  (snapNow && snapNow.activeConditions || []).forEach((row) => {
    if (!row || !row.name) return;
    if (existing.some((have) => String(have.name || "").toLowerCase() === String(row.name).toLowerCase())) return;
    existing.push(row);
  });
  const wanted = {};
  const changed = {};
  const addedIds = [];
  (names || []).forEach((item) => {
    const entry = item && typeof item === "object" ? item : { name: item };
    const name = entry.name;
    const rounds = entry.rounds != null ? entry.rounds : (roundsByName && roundsByName[name] != null ? roundsByName[name] : null);
    const level = name === "Exhaustion" ? (entry.level || exhLevel || 1) : 0;
    const prior = existing.filter((row) => String(row.name || "").toLowerCase() === String(name || "").toLowerCase())[0];
    const id = (prior && prior.id) || Cond.idFor(subjectId, name);
    const sameRounds = prior && ((prior.rounds == null && (rounds == null || rounds === "")) || Number(prior.rounds) === Number(rounds));
    const sameLevel = !prior || name !== "Exhaustion" || Number(prior.level || 1) === Number(level);
    if (prior && sameRounds && sameLevel) return;
    const row = Cond.normalize({
      id: id, name: name, level: level, rounds: rounds,
      subjectId: subjectId, subjectKind: kind,
      by: prior && prior.by ? prior.by : (DM.state.uid || "dm"),
      byName: prior && prior.byName ? prior.byName : "DM",
      updatedAt: new Date().toISOString()
    });
    wanted[id] = row;
    if (prior) changed[id] = true;
    else addedIds.push(id);
  });
  const drop = {};
  (removeIds || []).forEach((id) => { if (id) drop[id] = 1; });
  const prev = existing.map((row) => row.id).filter(Boolean);
  fight.condMap = fight.condMap || {};
  const removedLabels = {};
  prev.forEach((id) => {
    if (!drop[id] || wanted[id]) return;
    const had = fight.condMap[id] || existing.filter((row) => row.id === id)[0];
    const still = Object.keys(wanted).some((wid) => String((wanted[wid] && wanted[wid].name) || "").toLowerCase() === String((had && had.name) || "").toLowerCase());
    if (still) return;
    removedLabels[id] = (had && had.name) || Cond.label(had);
    delete fight.condMap[id];
  });
  Object.keys(wanted).forEach((id) => { fight.condMap[id] = wanted[id]; });
  const added = addedIds;
  const removed = Object.keys(removedLabels);
  fight.order.forEach((row) => {
    if (!row) return;
    const sid = row.kind === "player" ? (row.playerId || row.id) : row.id;
    if (sid !== subjectId) return;
    row.conditions = Object.keys(fight.condMap).map((id) => fight.condMap[id]).filter((c) => c && c.subjectId === subjectId);
  });
  if (kind === "player" && DM.state.players[subjectId] && DM.state.players[subjectId].snapshot) {
    const snap = DM.state.players[subjectId].snapshot;
    snap.activeConditions = dedupeConditions(Cond.mergeById(snap.activeConditions || [], Object.keys(wanted).map((id) => wanted[id]), removed));
    snap.conditions = Cond.listText(snap.activeConditions);
  }
  saveLocalTable();
  DM.renderPlayers();
  renderFight();
  if (!DM.state.demo && DM.state.db && DM.state._fb) {
    const fb = DM.state._fb;
    for (const id of Object.keys(wanted)) await fb.set(DM.roomRef("conditions/" + id), wanted[id]);
    for (const id of removed) await fb.remove(DM.roomRef("conditions/" + id));
  }
  const who = label || subjectId;
  for (const id of added) {
    const line = "DM applied " + Cond.label(wanted[id]) + " to " + who;
    await DM.pushLedger({ who: "DM", playerId: kind === "player" ? subjectId : "all", type: "condition", what: line, oldVal: null, newVal: Cond.label(wanted[id]), flag: false });
    if (kind === "player") await DM.pushCommand({ type: "set_conditions", to: subjectId, payload: { merge: true, entries: [wanted[id]], quiet: true }, from: DM.state.uid });
  }
  for (const id of Object.keys(changed)) {
    const line = "DM updated " + Cond.label(wanted[id]) + " on " + who;
    await DM.pushLedger({ who: "DM", playerId: kind === "player" ? subjectId : "all", type: "condition", what: line, oldVal: null, newVal: Cond.label(wanted[id]), flag: false });
    if (kind === "player") await DM.pushCommand({ type: "set_conditions", to: subjectId, payload: { merge: true, entries: [wanted[id]], quiet: true }, from: DM.state.uid });
  }
  for (const id of removed) {
    const line = "DM removed " + (removedLabels[id] || "a condition") + " from " + who;
    await DM.pushLedger({ who: "DM", playerId: kind === "player" ? subjectId : "all", type: "condition", what: line, oldVal: removedLabels[id] || "", newVal: "cleared", flag: false });
  }
}
function tickConditions(row) {
  const Cond = window.SSDNSConditions;
  if (!row || !Cond) return;
  const subject = row.playerId || row.id;
  const source = Object.keys(fight.condMap || {}).map((id) => Object.assign({ id: id }, fight.condMap[id])).filter((c) => c.subjectId === subject);
  const ticked = Cond.tick(source.length ? source : (row.conditions || []), subject);
  row.conditions = ticked.list;
  ticked.ended.forEach((entry) => {
    if (entry.id && fight.condMap) delete fight.condMap[entry.id];
    DM.toast("Condition ended");
    DM.pushLedger({ who: "DM", playerId: subject || "all", type: "condition", what: "Condition ended · " + (entry.name || "") + " · " + (row.name || ""), oldVal: entry.name || "", newVal: "ended", flag: false });
    if (entry.id && !DM.state.demo && DM.state.db && DM.state._fb) DM.state._fb.remove(DM.roomRef("conditions/" + entry.id)).catch(() => {});
  });
  ticked.list.forEach((entry) => {
    if (entry.rounds == null || !entry.id) return;
    if (fight.condMap) fight.condMap[entry.id] = entry;
    if (!DM.state.demo && DM.state.db && DM.state._fb) {
      DM.state._fb.update(DM.roomRef("conditions/" + entry.id), { rounds: entry.rounds, updatedAt: new Date().toISOString(), by: DM.state.uid || "dm", byName: "DM" }).catch(() => {});
    }
  });
  if (row.kind === "player" && DM.state.players[subject] && DM.state.players[subject].snapshot && Cond) {
    const snap = DM.state.players[subject].snapshot;
    snap.activeConditions = ticked.list;
    snap.conditions = Cond.listText(ticked.list);
    DM.renderPlayers();
  }
  saveLocalTable();
  renderFight();
}
function watchConditions() {
  if (fight._condWatch || DM.state.demo || !DM.state.db || !DM.state._fb) return;
  fight._condWatch = true;
  const fb = DM.state._fb;
  const r = DM.roomRef("conditions");
  const cb = fb.onValue(r, (snap) => {
    fight.condMap = snap.val() || {};
    Object.keys(DM.state.players || {}).forEach((pid) => {
      const s = DM.state.players[pid] && DM.state.players[pid].snapshot;
      if (!s || !window.SSDNSConditions) return;
      const mine = Object.keys(fight.condMap).map((id) => Object.assign({ id: id }, fight.condMap[id])).filter((row) => row.subjectId === pid && row.subjectKind !== "enemy");
      s.activeConditions = mine;
      s.conditions = window.SSDNSConditions.listText(mine);
    });
    fight.order.forEach((row) => {
      if (!row || row.kind !== "enemy") return;
      row.conditions = Object.keys(fight.condMap).map((id) => Object.assign({ id: id }, fight.condMap[id])).filter((c) => c.subjectId === row.id);
    });
    DM.renderPlayers();
    renderFight();
  });
  if (typeof cb === "function") DM.state.unsubs.push(cb);
}
function nextLivingIndex(from) {
  const len = fight.order.length;
  let i = from;
  for (let n = 0; n < len; n++) {
    i = (i + 1) % len;
    if (!enemyFled(fight.order[i])) return { index: i, wrapped: i <= from };
  }
  const next = len ? (from + 1) % len : 0;
  return { index: next, wrapped: next <= from };
}
let turnGate = 0;
function nextTurn() {
  const now = Date.now();
  if (now - turnGate < 600) return;
  syncDamageMode();
  if (!fight.order.length) { DM.toast("Add someone to the turn order first"); return; }
  turnGate = now;
  fight.recruit = true;
  ensurePlayers();
  fight.turn = parseInt(fight.turn, 10);
  if (!isFinite(fight.turn) || fight.turn < 0) fight.turn = 0;
  if (!fight.started) {
    sortInitiative();
    fight.started = true;
    fight.round = 1;
    fight.turn = 0;
    let guard = 0;
    while (enemyFled(fight.order[fight.turn]) && guard++ < fight.order.length) {
      fight.turn = (fight.turn + 1) % fight.order.length;
    }
  } else {
    const step = nextLivingIndex(fight.turn);
    fight.turn = step.index;
    if (step.wrapped) fight.round += 1;
  }
  fight.flash = fight.turn;
  (fight.order || []).forEach((row) => {
    if (window.SSDNSApplied && window.SSDNSApplied.refreshCombatantStatus) window.SSDNSApplied.refreshCombatantStatus(row);
  });
  saveRemoteTable();
  renderFight();
  const cur = fight.order[fight.turn];
  const deck = onDeck();
  const turnLine = "Round " + fight.round + " · " + (cur && cur.name ? cur.name : "someone") + "'s turn" + (deck && deck.name ? " · On deck: " + deck.name : "");
  DM.toast(turnLine);
  DM.pushLedger({ who: "DM", playerId: (cur && (cur.playerId || cur.id)) || "all", type: "combat", what: turnLine, oldVal: null, newVal: "round " + fight.round, flag: false });
  sendYourTurn(cur, false);
  tickConditions(cur);
}

async function pushHp(kind) {
  const pid = $("#dmgTarget") && $("#dmgTarget").value;
  if (!pid) { DM.toast("Pick a player"); return; }
  const picked = damagePick();
  if (!picked) { DM.toast("Enter dice or a flat amount"); return; }
  const formula = picked.formula;
  const out = { total: picked.total, detail: picked.detail };
  const amount = picked.total;
  clearDamageDice();
  const sign = kind === "heal" ? 1 : -1;
  const names = namesFor(pid);
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const before = Number(s.hpCurrent) || 0;
  const row = fight.order.find((r) => r.playerId === pid || r.id === pid);
  let temp = Number(s.hpTemp) || 0;
  let after = before;
  if (kind === "damage") {
    const use = Math.min(temp, amount);
    temp -= use;
    after = Math.max(0, before - (amount - use));
  } else {
    const max = Number(s.hpMax) || Number(row && row.maxHp) || 0;
    after = max ? Math.min(max, before + amount) : before + amount;
  }
  if (row) {
    row.hp = after;
    renderFight();
  }
  if (DM.state.demo && p && p.snapshot) {
    let temp = Number(s.hpTemp) || 0;
    let cur = before;
    if (kind === "damage") {
      const use = Math.min(temp, amount);
      temp -= use;
      cur = Math.max(0, cur - (amount - use));
      s.hpTemp = temp;
    } else {
      const max = Number(s.hpMax) || cur;
      cur = Math.min(max || cur + amount, cur + amount);
    }
    s.hpCurrent = cur;
    DM.renderPlayers();
  }
  await DM.pushLedger(Object.assign({
    who: "DM", playerId: pid, type: kind === "heal" ? "heal" : "damage",
    what: `DM ${kind} ${amount} (${formula}: ${out.detail}) → ${names.characterName || pid}`,
    oldVal: before, newVal: after, flag: amount >= 20
  }, names));
  const cmd = {
    type: "hp", to: pid,
    payload: { delta: sign * amount, kind: kind, formula: formula, detail: out.detail, amount: amount },
    from: DM.state.uid
  };
  await DM.pushCommand(cmd);
  if (p && p.snapshot && !DM.state.demo) {
    s.hpCurrent = after;
    if (kind === "damage") s.hpTemp = temp;
    DM.renderPlayers();
  }
  if (row) {
    row.hp = after;
    await saveRemoteTable();
    renderFight();
  }
  rememberUndo({
    type: "hp", playerId: pid, label: kind + " " + amount,
    command: { type: "hp", to: pid, payload: { delta: -sign * amount, kind: kind === "heal" ? "damage" : "heal", formula: "undo", detail: "undo", amount: amount }, from: DM.state.uid },
    demo: function () {
      if (!p || !p.snapshot) return;
      const snap = p.snapshot;
      if (kind === "heal") snap.hpCurrent = before;
      else snap.hpCurrent = before;
      DM.renderPlayers();
    }
  });
  if (window.SSDNSAudio && kind === "heal") window.SSDNSAudio.play("reward");
  DM.toast(kind + " " + amount + " → " + (names.characterName || "player"));
}

async function rest(kind) {
  const ids = Object.keys(DM.state.players);
  for (let i = 0; i < ids.length; i++) {
    await DM.pushCommand({ type: "rest", to: ids[i], payload: { kind: kind }, from: DM.state.uid });
  }
  await DM.pushLedger({
    who: "DM", playerId: "all", playerName: "Party", characterName: "Everyone",
    type: "rest", what: (kind === "long" ? "Long" : "Short") + " rest for the table",
    oldVal: null, newVal: kind, flag: false
  });
  if (DM.state.demo) {
    ids.forEach((id) => {
      const s = DM.state.players[id] && DM.state.players[id].snapshot;
      if (!s) return;
        if (kind === "long") {
        s.hpCurrent = s.hpMax;
        s.hpTemp = 0;
        s.deathSaves = { success: [false, false, false], fail: [false, false, false] };
        if (s.spells) s.spells.spent = {};
      }
    });
    DM.renderPlayers();
  }
  DM.toast((kind === "long" ? "Long" : "Short") + " rest sent");
}

const STORE_PREVIEW_KEY = "ssdns.dm.storePreview";
let storeItems = [];
let storeTown = "camp";
const storeOn = { general: true, gun: false, music: false, traveling: false };
const storeDraft = {};
function loadStorePreview() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_PREVIEW_KEY) || "null");
    if (!raw) return;
    if (raw.town) storeTown = raw.town;
    if (raw.on) Object.keys(storeOn).forEach((id) => { if (raw.on[id] != null) storeOn[id] = !!raw.on[id]; });
    if (raw.draft) Object.keys(raw.draft).forEach((id) => { storeDraft[id] = raw.draft[id]; });
  } catch (e) {}
}
function saveStorePreview() {
  try {
    localStorage.setItem(STORE_PREVIEW_KEY, JSON.stringify({ town: storeTown, on: storeOn, draft: storeDraft }));
  } catch (e) {}
}
function parseCost(raw) {
  const s = String(raw == null ? "" : raw).replace(/,/g, "").trim();
  if (!s || !/\d/.test(s) || /tbd/i.test(s)) return null;
  const n = parseInt(s, 10);
  return isFinite(n) ? n : null;
}
function catalog() {
  if (catalog.cache) return catalog.cache;
  const R = window.SSDNS_RULES || {};
  const items = [];
  function add(name, cost, kind) {
    const label = String(name || "").trim();
    if (!label) return;
    items.push({ name: label, price: parseCost(cost), kind: kind });
  }
  (R.armor || []).forEach((a) => add(a.name, a.cost, "armor"));
  (R.firearms || []).forEach((g) => add(g.name, g.cost, "gun"));
  (R.melee || []).forEach((g) => add(g.name, g.cost, "melee"));
  (R.otherRanged || []).forEach((g) => add(g.name, g.cost, "ranged"));
  (R.ammo || []).forEach((a) => add(a.name, a.cost, "ammo"));
  (R.holsters || []).forEach((h) => add(h.name, h.cost, "holster"));
  (R.gear || []).forEach((g) => add(g.name, g.cost, "gear"));
  (R.frontierGear || []).forEach((g) => add(g.name, g.cost, "frontier"));
  (R.packs || []).forEach((p) => add(p.name, p.cost, "pack"));
  (R.mounts || []).forEach((m) => add(m.name, m.cost, "mount"));
  (R.tools || []).forEach((t) => add(t.phb5e || t.name, null, "tool"));
  ((R.gunsmithing && R.gunsmithing.mods) || []).forEach((m) => add(m.name, m.cost, "mod"));
  ((R.explosives && R.explosives.items) || []).forEach((e) => add(e.name, e.cost, "explosive"));
  const story = R.storytellerGear || {};
  (story.instruments || []).forEach((g) => add(g.name + " (quality)", g.costQuality || g.cost, "instrument"));
  (story.accessories || []).forEach((g) => add(g.name, g.cost, "focus"));
  catalog.cache = items;
  return items;
}
function fillCatalogCats() {
  const sel = $("#catalogCat");
  if (!sel || sel.dataset.filled) return;
  const kinds = [];
  catalog().forEach((item) => { if (kinds.indexOf(item.kind) < 0) kinds.push(item.kind); });
  kinds.sort();
  kinds.forEach((k) => {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = k;
    sel.appendChild(o);
  });
  sel.dataset.filled = "1";
}
function renderCatalog() {
  const box = $("#catalogList");
  if (!box) return;
  fillCatalogCats();
  const q = ($("#catalogQ") && $("#catalogQ").value || "").trim().toLowerCase();
  const cat = ($("#catalogCat") && $("#catalogCat").value) || "";
  const rows = catalog().filter((item) => {
    if (cat && item.kind !== cat) return false;
    if (q && item.name.toLowerCase().indexOf(q) < 0 && item.kind.indexOf(q) < 0) return false;
    return true;
  }).slice(0, 80);
  if (!window.SSDNS_RULES) {
    box.innerHTML = '<p class="lede">Rules data did not load, so the catalog is empty. You can still type an item below.</p>';
    return;
  }
  if (!rows.length) {
    box.innerHTML = '<p class="lede">No gear matches that.</p>';
    return;
  }
  box.innerHTML = `<table class="gear-table"><thead><tr><th>Name</th><th>Type</th><th>Price</th><th></th></tr></thead><tbody>`
    + rows.map((item) => {
      const price = item.price == null ? "—" : (item.price + " ES");
      return `<tr>
        <td data-label="Name">${esc(item.name)}</td>
        <td data-label="Type">${esc(item.kind)}</td>
        <td data-label="Price">${esc(price)}</td>
        <td><button type="button" class="btn sm" data-cat-add="1" data-cat-name="${esc(item.name)}" data-cat-price="${item.price == null ? "" : item.price}">Add</button></td>
      </tr>`;
    }).join("")
    + `</tbody></table>`;
}
function storeLabel(id) {
  const labels = window.SSDNSStore && window.SSDNSStore.STORE_LABEL;
  return (labels && labels[id]) || id || "Store";
}
function syncTownControls() {
  document.querySelectorAll('input[name="townSize"]').forEach((el) => { el.checked = el.value === storeTown; });
  document.querySelectorAll("[data-store-pick]").forEach((el) => {
    const id = el.getAttribute("data-store-pick");
    el.checked = !!storeOn[id];
  });
}
function ensureDraft(id) {
  if (!storeDraft[id]) storeDraft[id] = { mode: "default", phase: "preview", lines: [] };
  return storeDraft[id];
}
function previewStore(storeId, mode) {
  const Stock = window.SSDNSStore;
  if (!Stock) { DM.toast("Store data is not loaded"); return; }
  if (!storeItems.length) { DM.toast("Store list has not loaded"); return; }
  const draft = ensureDraft(storeId);
  let rows = [];
  if (storeId === "traveling" && (mode === "draw" || mode === "merchant")) {
    rows = Stock.merchantStock(storeItems, Math.random).map((it) => {
      const line = Stock.lineFromItem(it, "traveling", false);
      line.price = it.price;
      line.checked = it.price != null && it.price !== "";
      line.ref = it.price_es == null;
      return line;
    });
    draft.mode = "draw";
  } else if (mode === "random") {
    rows = Stock.randomStock(storeItems, storeId, storeTown, Math.random).map((it) => Stock.lineFromItem(it, storeId, false));
    draft.mode = "random";
  } else if (mode === "rare") {
    draft.lines = Stock.slipRare(draft.lines || [], storeItems, Math.random);
    draft.mode = draft.mode || "draw";
    draft.phase = "preview";
    saveStorePreview();
    renderStorePanel();
    return;
  } else {
    rows = Stock.stockableCommons(storeItems, storeId, storeTown).map((it) => Stock.lineFromItem(it, storeId, false));
    draft.mode = "default";
  }
  draft.lines = rows;
  draft.phase = "preview";
  saveStorePreview();
  renderStorePanel();
}
function liveLines(storeId) {
  return (fight.stock || []).filter((row) => row && (row.store || "general") === storeId);
}
async function openStoreCard(storeId) {
  const Stock = window.SSDNSStore;
  const draft = ensureDraft(storeId);
  const lines = Stock.pricedLines(draft.lines, storeId);
  if (!lines.length) { DM.toast(storeLabel(storeId) + " has no priced items checked"); return; }
  fight.stock = (fight.stock || []).filter((row) => row && (row.store || "general") !== storeId).concat(lines);
  fight.storeOpen = true;
  draft.phase = "live";
  saveStorePreview();
  await saveRemoteTable();
  await DM.pushCommand({
    type: "open_store", to: "all",
    payload: { store: storeId, stock: fight.stock.slice() },
    from: DM.state.uid
  });
  const what = storeLabel(storeId) + " opened (" + lines.length + " items)";
  await DM.pushLedger({ who: "DM", playerId: "all", type: "open_store", what: what, oldVal: null, newVal: "open", flag: false });
  DM.toast(what);
  renderStorePanel();
}
async function openAllStores() {
  const ids = Object.keys(storeOn).filter((id) => storeOn[id] && storeDraft[id] && (storeDraft[id].lines || []).length);
  if (!ids.length) { DM.toast("Check a store and load its stock first"); return; }
  for (let i = 0; i < ids.length; i++) await openStoreCard(ids[i]);
}
async function closeStoreCard(storeId) {
  fight.stock = (fight.stock || []).filter((row) => row && (row.store || "general") !== storeId);
  if (!fight.stock.length) fight.storeOpen = false;
  const draft = ensureDraft(storeId);
  draft.phase = "preview";
  saveStorePreview();
  await saveRemoteTable();
  DM.toast(storeLabel(storeId) + " closed");
  renderStorePanel();
}
async function closeAllStores() {
  fight.stock = [];
  fight.storeOpen = false;
  Object.keys(storeDraft).forEach((id) => { if (storeDraft[id]) storeDraft[id].phase = "preview"; });
  saveStorePreview();
  await saveRemoteTable();
  await DM.pushLedger({ who: "DM", playerId: "all", type: "open_store", what: "Stores closed", oldVal: null, newVal: "closed", flag: false });
  DM.toast("Stores closed");
  renderStorePanel();
}
function editStoreCard(storeId) {
  const draft = ensureDraft(storeId);
  const live = liveLines(storeId);
  if (live.length) {
    draft.lines = live.map((row) => ({
      id: row.id || "",
      name: row.name || "",
      rarity: row.rarity || "",
      notes: row.notes || "",
      bookLine: row.bookLine || "",
      price: row.price,
      checked: true,
      ref: !!row.ref,
      qty: row.qty || null,
      store: storeId
    }));
  }
  draft.phase = "preview";
  saveStorePreview();
  renderStorePanel();
}
async function toggleSoldOut(storeId, index) {
  const rows = (fight.stock || []).map((row, i) => ({ row: row, i: i })).filter((x) => x.row && (x.row.store || "general") === storeId);
  const hit = rows[index];
  if (!hit) return;
  hit.row.soldOut = !hit.row.soldOut;
  await saveRemoteTable();
  renderStorePanel();
}
function previewLineHtml(storeId, line, i) {
  const price = line.price === "" || line.price == null ? "" : line.price;
  const ref = line.ref ? '<span class="ref-tag">ref</span>' : "";
  return `<div class="store-line">
    <label class="store-line-name"><input type="checkbox" data-preview-check="${esc(storeId)}" data-line="${i}"${line.checked ? " checked" : ""}> <b>${esc(line.name || "Item")}</b> <span class="chip">${esc(line.rarity || "")}</span> ${ref}</label>
    <span class="store-line-meta">
      <input type="number" min="0" step="1" inputmode="numeric" data-preview-price="${esc(storeId)}" data-line="${i}" value="${esc(price)}" placeholder="${line.ref ? "ref" : "TBD"}" aria-label="Price for ${esc(line.name || "item")}">
      <button type="button" class="btn sm" data-line-info="${esc(storeId)}" data-line="${i}">Info</button>
    </span>
    <span class="fine store-line-notes" hidden>${esc(line.notes || "")}${line.bookLine ? " BOOK1 L" + esc(line.bookLine) : ""}</span>
  </div>`;
}
function renderStorePanel() {
  const box = $("#storeCards");
  if (!box) return;
  syncTownControls();
  const ids = ["general", "gun", "music", "traveling"].filter((id) => storeOn[id]);
  if (!ids.length) {
    box.innerHTML = '<p class="lede">Tick a store to stock it.</p>';
    return;
  }
  box.innerHTML = ids.map((id) => {
    const draft = ensureDraft(id);
    const live = draft.phase === "live";
    const lines = live ? liveLines(id) : (draft.lines || []);
    const priced = lines.filter((row) => row && row.checked !== false && row.price !== "" && row.price != null && isFinite(Number(row.price)));
    const unpriced = lines.length - priced.length;
    const head = lines.length + " items" + (unpriced ? " · " + unpriced + " unpriced (left off)" : "");
    const actions = live
      ? `<button type="button" class="btn" data-store-edit="${id}">Edit stock</button>
         <button type="button" class="btn" data-store-close="${id}">Close store</button>`
      : (id === "traveling"
        ? `<button type="button" class="btn" data-store-draw="${id}">Draw 6-10</button>
           <button type="button" class="btn" data-store-rare="${id}">+ Slip in a rare</button>`
        : `<button type="button" class="btn" data-store-default="${id}">Default stock</button>
           <button type="button" class="btn" data-store-random="${id}">Randomize</button>`)
        + `<button type="button" class="btn" data-store-reroll="${id}">Reroll</button>
           <button type="button" class="btn" data-store-refill="${id}">Fill blanks from ref</button>
           <button type="button" class="btn btn-primary" data-store-open="${id}">Open Store</button>`;
    const body = live
      ? lines.map((row, i) => `<div class="store-line${row.soldOut ? " sold" : ""}">
          <span class="store-line-name"><b>${esc(row.name || "Item")}</b>${row.ref ? ' <span class="ref-tag">ref</span>' : ""}</span>
          <span class="store-line-meta"><span class="fine">${esc(row.price)} ES</span>
          <button type="button" class="btn${row.soldOut ? " on" : ""}" data-sold-out="${id}" data-line="${i}">${row.soldOut ? "Sold out" : "Mark sold out"}</button></span>
        </div>`).join("")
      : lines.map((row, i) => previewLineHtml(id, row, i)).join("");
    return `<article class="store-card card">
      <h3>${esc(storeLabel(id))}</h3>
      <p class="fine">${esc(head)}${live ? " · live" : " · preview"}</p>
      <div class="store-lines">${body || '<p class="lede">No stock yet.</p>'}</div>
      <div class="store-actions">${actions}</div>
    </article>`;
  }).join("");
}
function addPreviewLine(storeId, name, price, extra) {
  if (!name) { DM.toast("Need an item name"); return; }
  const draft = ensureDraft(storeId);
  const n = price === "" || price == null || !isFinite(Number(price)) ? "" : Math.round(Number(price));
  draft.lines = draft.lines || [];
  draft.lines.push(Object.assign({
    id: (extra && extra.id) || "",
    name: name,
    rarity: (extra && extra.rarity) || "common",
    notes: (extra && extra.notes) || "",
    bookLine: (extra && extra.bookLine) || "",
    price: n,
    checked: n !== "",
    ref: !!(extra && extra.ref),
    qty: window.SSDNSStore ? window.SSDNSStore.trailingQty(name) : null,
    store: storeId
  }));
  draft.phase = "preview";
  storeOn[storeId] = true;
  saveStorePreview();
  renderStorePanel();
}
function addStock() {
  const name = ($("#stockName") && $("#stockName").value || "").trim();
  const price = parseInt($("#stockPrice") && $("#stockPrice").value, 10);
  const storeId = ($("#adhocStore") && $("#adhocStore").value) || "general";
  if (!name || !isFinite(price)) { DM.toast("Need a name and an ES price"); return; }
  if ($("#stockName")) $("#stockName").value = "";
  addPreviewLine(storeId, name, price);
  DM.toast("Added to the " + storeLabel(storeId) + " preview");
}
function renderStock() { renderStorePanel(); }
function onStoreCardClick(e) {
  const t = e.target.closest && e.target.closest("[data-store-default],[data-store-random],[data-store-draw],[data-store-rare],[data-store-reroll],[data-store-refill],[data-store-open],[data-store-edit],[data-store-close],[data-sold-out],[data-line-info]");
  if (!t) return;
  const id = t.getAttribute("data-store-default") || t.getAttribute("data-store-random") || t.getAttribute("data-store-draw") || t.getAttribute("data-store-rare") || t.getAttribute("data-store-reroll") || t.getAttribute("data-store-refill") || t.getAttribute("data-store-open") || t.getAttribute("data-store-edit") || t.getAttribute("data-store-close") || t.getAttribute("data-sold-out") || t.getAttribute("data-line-info");
  if (t.hasAttribute("data-store-default")) previewStore(id, "default");
  else if (t.hasAttribute("data-store-random")) previewStore(id, "random");
  else if (t.hasAttribute("data-store-draw")) previewStore(id, "draw");
  else if (t.hasAttribute("data-store-rare")) previewStore(id, "rare");
  else if (t.hasAttribute("data-store-reroll")) {
    const draft = ensureDraft(id);
    previewStore(id, draft.mode === "random" ? "random" : draft.mode === "draw" ? "draw" : (id === "traveling" ? "draw" : "default"));
  } else if (t.hasAttribute("data-store-refill")) fillBlanks(id);
  else if (t.hasAttribute("data-store-open")) openStoreCard(id);
  else if (t.hasAttribute("data-store-edit")) editStoreCard(id);
  else if (t.hasAttribute("data-store-close")) closeStoreCard(id);
  else if (t.hasAttribute("data-sold-out")) toggleSoldOut(id, parseInt(t.getAttribute("data-line"), 10));
  else if (t.hasAttribute("data-line-info")) {
    const line = t.closest(".store-line");
    const notes = line && line.querySelector(".store-line-notes");
    if (notes) notes.hidden = !notes.hidden;
  }
}
function onStoreDraftChange(e) {
  const t = e.target;
  if (!t || !t.getAttribute) return;
  const check = t.getAttribute("data-preview-check");
  const price = t.getAttribute("data-preview-price");
  if (!check && !price) return;
  const id = check || price;
  const i = parseInt(t.getAttribute("data-line"), 10);
  const draft = storeDraft[id];
  const line = draft && draft.lines && draft.lines[i];
  if (!line) return;
  if (check) line.checked = !!t.checked;
  else {
    line.price = t.value === "" ? "" : Math.round(Number(t.value));
    if (!isFinite(line.price)) line.price = "";
    line.ref = false;
  }
  saveStorePreview();
}
function fillBlanks(storeId) {
  const Stock = window.SSDNSStore;
  const draft = ensureDraft(storeId);
  const blanks = (draft.lines || []).filter((row) => row && (row.price === "" || row.price == null));
  if (!blanks.length) { DM.toast("No blank prices"); return; }
  if (!window.confirm("Fill " + blanks.length + " blank prices from the handbook reference?")) return;
  const byId = {};
  storeItems.forEach((it) => { if (it && it.id) byId[it.id] = it; });
  blanks.forEach((row) => {
    const src = byId[row.id];
    const ref = src && src.ref_price_es;
    if (ref == null || ref === "") return;
    row.price = storeId === "traveling" && Stock ? Stock.markup(ref) : Math.round(Number(ref));
    row.ref = true;
    row.checked = true;
  });
  saveStorePreview();
  renderStorePanel();
}

function renderPacks() {
  const box = $("#packList");
  if (!box) return;
  if (!fight.packs.length) {
    box.innerHTML = '<p class="lede">No packs saved yet.</p>';
    return;
  }
  box.innerHTML = fight.packs.map((p, i) =>
    `<div class="init-row"><b>${esc(p.name)}</b><span class="fine">${(p.items || []).length} links</span>
      <span class="init-actions">
        <button type="button" class="btn sm" data-pack-send="${i}">Send</button>
        <button type="button" class="btn sm" data-pack-del="${i}">Delete</button>
      </span></div>`
  ).join("");
}
function parsePackLines(text) {
  return String(text || "").split("\n").map((line) => {
    const parts = line.split("|");
    const name = (parts[0] || "").trim();
    const url = (parts[1] || parts[0] || "").trim();
    if (!name || !/^https?:\/\//i.test(url)) return null;
    return { name: name, url: url };
  }).filter(Boolean);
}
async function savePack() {
  const name = ($("#packName").value || "").trim();
  const items = parsePackLines($("#packLines").value);
  if (!name || !items.length) { DM.toast("Name the pack and add lines like Name | https://…"); return; }
  fight.packs.push({ id: DM.uid("pack"), name: name, items: items });
  $("#packName").value = "";
  $("#packLines").value = "";
  await saveRemoteTable();
  renderPacks();
}
async function sendPack(index) {
  const pack = fight.packs[index];
  if (!pack) return;
  const to = ($("#packTarget") && $("#packTarget").value) || "all";
  for (const item of pack.items) {
    await DM.pushHandout({ name: item.name, url: item.url, to: to, sent: true });
    await DM.pushCommand({ type: "handout", to: to, payload: { name: item.name, url: item.url }, from: DM.state.uid });
  }
  DM.toast("Sent " + pack.name);
}

const BEAST_GROUPS = [
  ["creature", "Creatures"],
  ["generic-folk", "Folk"],
  ["named", "Named"]
];
function beastQuery() {
  const el = $("#beastQ");
  return el && el.value ? String(el.value).trim().toLowerCase() : "";
}
function showParkedBeasts() {
  const el = $("#beastParked");
  return !!(el && el.checked);
}
function visibleBeasts() {
  const q = beastQuery();
  const parked = showParkedBeasts();
  return (fight.bestiary || []).filter((b) => {
    if (!b || b.template) return false;
    if (b.parked && !parked) return false;
    if (!q) return true;
    return [b.name, b.bookName, b.aka, b.id].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}
function mergeBestiary(fileList, saved) {
  const base = Array.isArray(fileList) ? fileList : [];
  const extra = {};
  (saved || []).forEach((b) => {
    if (!b || !b.id || b.example || b.template) return;
    extra[b.id] = b;
  });
  const out = base.map((b) => {
    const over = b && extra[b.id];
    if (!over) return b;
    return Object.assign({}, over, b, {
      name: over.name || b.name,
      attackList: b.attackList || [],
      attacks: b.attacks || ""
    });
  });
  const known = {};
  out.forEach((b) => { if (b && b.id) known[b.id] = 1; });
  Object.keys(extra).forEach((id) => { if (!known[id]) out.push(extra[id]); });
  return out;
}
function beastRow(b) {
  const stats = window.SSDNSApplied && window.SSDNSApplied.beastCombatant
    ? window.SSDNSApplied.beastCombatant(b)
    : { ac: b.ac, hp: b.hp, maxHp: b.hp, dex: b.dex, initBonus: b.initBonus, atkBonus: b.atkBonus, damage: b.damage || "", attacks: b.attacks || "" };
  return {
    id: DM.uid("en"),
    name: b.name,
    kind: "enemy",
    ac: stats.ac,
    hp: stats.hp,
    maxHp: stats.maxHp,
    dex: stats.dex,
    initBonus: stats.initBonus,
    atkBonus: stats.atkBonus,
    damage: stats.damage,
    attacks: stats.attacks || b.attacks || "",
    attackList: b.attackList || [],
    speed: b.speed,
    cr: b.cr,
    beastId: b.id || "",
    card: window.SSDNSApplied && window.SSDNSApplied.enemyCardModel ? window.SSDNSApplied.enemyCardModel(b) : null
  };
}
function beastCard(b) {
  const traitText = window.SSDNSApplied && window.SSDNSApplied.traitText
    ? window.SSDNSApplied.traitText
    : (traits) => (Array.isArray(traits) ? traits.map((t) => (t && t.name) || "").join(", ") : String(traits || ""));
  const tactics = window.SSDNSApplied && window.SSDNSApplied.tacticsNote ? window.SSDNSApplied.tacticsNote(b) : "";
  return `<article class="bestiary-card" data-beast-card="${esc(b.id)}">
      <h3><button type="button" class="name-btn" data-open-beast="${esc(b.id)}">${esc(b.name)}</button>${b.parked ? ' <span class="badge">Parked</span>' : ""}</h3>
      <p>AC ${esc(b.ac)} · HP ${esc(b.hp)}${b.cr ? " · CR " + esc(b.cr) : ""}</p>
      ${tactics ? `<p class="tactics-note">Tactics. ${esc(tactics)}</p>` : ""}
      <p>${esc(b.attacks || "")}</p>
      <p class="lede">${esc(traitText(b.traits))}</p>
      ${traitText(b.actions) ? `<p class="lede">${esc(traitText(b.actions))}</p>` : ""}
      <label class="fine">Name <input type="text" data-beast-name="${esc(b.id)}" value="${esc(b.name)}" aria-label="Rename ${esc(b.name)}"></label>
      <button type="button" class="btn sm" data-add-beast="${esc(b.id)}">Add to initiative</button>
    </article>`;
}
function renderBestiary() {
  const box = $("#bestiaryList");
  if (!box) return;
  const list = visibleBeasts();
  if (!list.length) {
    box.innerHTML = '<p class="lede">No matching enemies.</p>';
    return;
  }
  const buckets = {};
  list.forEach((b) => {
    const key = BEAST_GROUPS.some((pair) => pair[0] === b.group) ? b.group : "other";
    (buckets[key] || (buckets[key] = [])).push(b);
  });
  const order = BEAST_GROUPS.map((pair) => pair[0]).concat(buckets.other ? ["other"] : []);
  box.innerHTML = order.filter((key) => buckets[key] && buckets[key].length).map((key) => {
    const label = (BEAST_GROUPS.filter((pair) => pair[0] === key)[0] || ["", "Other"])[1];
    return `<section class="beast-group"><h3>${esc(label)}</h3><div class="bestiary-grid">${buckets[key].map(beastCard).join("")}</div></section>`;
  }).join("");
}
function beastById(id) {
  return visibleBeasts().filter((b) => b && b.id === id)[0] || null;
}
function showEnemySheet() {
  const sheet = $("#enemySheet");
  if (sheet) sheet.hidden = false;
}
function closeEnemySheet() {
  const sheet = $("#enemySheet");
  if (sheet) sheet.hidden = true;
  enemySheetId = null;
}
function openEnemyById(id) {
  if (!id) return;
  enemySheetId = id;
  showEnemySheet();
  renderEnemySheet();
}
function openEnemyBeast(id) {
  const live = fight.order.filter((r) => r && r.beastId === id).slice(-1)[0];
  if (live) return openEnemyById(live.id);
  enemySheetId = "preview:" + id;
  showEnemySheet();
  renderEnemySheet();
}
function renderEnemySheet() {
  const sheet = $("#enemySheet");
  const body = $("#enemySheetBody");
  const title = $("#enemySheetTitle");
  const sub = $("#enemySheetSub");
  if (!sheet || !body || sheet.hidden) return;
  const active = document.activeElement;
  if (active && body.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return;
  let row = null;
  let index = -1;
  if (String(enemySheetId || "").indexOf("preview:") === 0) {
    const id = String(enemySheetId).slice(8);
    const beast = beastById(id);
    if (!beast) { closeEnemySheet(); return; }
    row = previewRows[id] || beastRow(beast);
    row.beastId = beast.id;
    previewRows[id] = row;
  } else {
    index = fight.order.findIndex((r) => r && r.id === enemySheetId);
    row = index >= 0 ? fight.order[index] : null;
    if (!row) { closeEnemySheet(); return; }
    if (!row.card && window.SSDNSApplied && window.SSDNSApplied.enemyCardModel) {
      row.card = window.SSDNSApplied.enemyCardModel(row.attackList ? row : { attackList: [], abilities: {} });
    }
    const named = (row.atkBonus !== "" && row.atkBonus != null) || row.damage || row.attacks;
    if (row.card && !row.card.attacks.length && named) {
      row.card.attacks.push({
        id: "custom",
        name: row.attacks || "Attack",
        kind: "",
        toHit: row.atkBonus,
        damage: row.damage || "",
        damageType: "",
        range: "",
        capacity: null,
        loaded: null,
        misfire: null,
        jammed: false,
        notes: "",
        rider: null
      });
    }
  }
  if (title) title.textContent = row.name || "Enemy";
  if (sub) {
    const card = row.card || {};
    const sideWord = row.kind === "enemy" ? (isFriendly(row) ? "Friendly" : "Enemy") : "";
    const header = window.SSDNSApplied && window.SSDNSApplied.sheetHeader
      ? window.SSDNSApplied.sheetHeader({ size: card.size, type: card.type, cr: card.cr, side: sideWord, speed: card.speed })
      : [card.cr ? "CR " + card.cr : "", sideWord, card.speed ? "Speed " + card.speed : ""].filter(Boolean).join(" · ");
    sub.textContent = header;
  }
  const add = String(enemySheetId || "").indexOf("preview:") === 0
    ? `<p><button type="button" class="btn btn-primary" data-sheet-add="1">Add to the fight</button></p>`
    : "";
  body.innerHTML = add + enemyCardHtml(row, index);
}
async function withSheetRow() {
  if (String(enemySheetId || "").indexOf("preview:") === 0) {
    const id = String(enemySheetId).slice(8);
    const row = previewRows[id];
    if (!row) return null;
    enemySheetId = row.id;
    fight.recruit = true;
    addCombatant(row);
    delete previewRows[id];
    announce("Added " + (row.name || "an enemy") + " to the turn order", "combat", row);
  }
  const i = fight.order.findIndex((r) => r && r.id === enemySheetId);
  return i >= 0 ? i : null;
}
async function applyLastStrike(i, n) {
  const row = fight.order[i];
  const atk = row && row.card && row.card.attacks && row.card.attacks[n];
  const last = atk && atk.lastRoll;
  if (!last || !last.hit || !last.damage) { DM.toast("Roll a hit first"); return; }
  const room = DM.state.roomCode;
  if (last.id && window.SSDNSApplied && window.SSDNSApplied.settled && window.SSDNSApplied.settled(room, last.id)) {
    DM.toast("Already applied");
    return;
  }
  applyPlayerHit({
    rollId: last.id,
    targetId: last.targetId,
    targetName: last.targetName,
    amount: last.damage,
    from: row.id,
    characterName: row.name,
    weapon: atk.name,
    label: atk.name,
    type: "damage"
  });
}
function conditionName(rider) {
  if (window.SSDNSApplied && window.SSDNSApplied.namedCondition) return window.SSDNSApplied.namedCondition(rider);
  const name = rider && rider.condition != null ? String(rider.condition).trim() : "";
  if (!name || /^condition$/i.test(name)) return "";
  return name;
}
async function rememberCondition(row, target, name, rounds) {
  if (!name) return;
  row.pendingRider = { condition: name, rounds: rounds, targetId: target.id, targetName: target.name };
  try {
    await writeSubjectConditions(target.id, "player", [{ name: name, rounds: rounds }], target.name || "", 1, {}, []);
  } catch (err) {}
}
async function askAttackSave(row, atk, target, spec, mode) {
  const save = await requestPlayerSave({
    targetId: target.id,
    targetName: target.name,
    ability: (spec && spec.save) || "STR",
    dc: spec && spec.dc,
    label: (row.name || "Enemy") + " " + (atk.name || "attack"),
    rider: conditionName(spec),
    damage: spec && spec.damage ? (spec.damage + (spec.damageType ? " " + spec.damageType : "") + (spec.onSave === "half" ? " (half on a success)" : "")) : "",
    fromName: row.name || "",
    auto: mode === "auto"
  });
  if (DM.state.demo || mode === "auto") {
    await DM.pushRoll({
      who: target.name || row.name, label: (atk.name || "Save"), formula: "1d20" + signed(save.mod || 0),
      result: save.total, detail: save.line, private: !(row.card && row.card.public), nat: save.nat, save: true
    });
  }
  return save;
}
async function applySaveDamage(row, atk, target, mode) {
  const spec = atk && atk.saveDamage;
  if (!row || !spec) return "";
  const save = await askAttackSave(row, atk, target, spec, mode);
  const rolled = DM.parseDice(spec.damage || "");
  const full = rolled ? rolled.total : 0;
  const amount = !save.failed ? (spec.onSave === "half" && window.SSDNSApplied ? window.SSDNSApplied.halved(full) : (spec.onSave === "half" ? Math.floor(full / 2) : 0)) : full;
  const kind = spec.damageType || "damage";
  const line = save.line + " · " + (rolled ? rolled.detail + " = " + full : (spec.damage || "")) + " " + kind + (save.failed ? "" : (spec.onSave === "half" ? " · half " + amount : ""));
  if (amount > 0 && fight.damageMode !== "approve") {
    applyPlayerHit({
      rollId: (save.id || DM.uid("pois")) + ":saveDmg",
      targetId: target.id,
      targetName: target.name,
      amount: amount,
      from: row.id,
      characterName: row.name,
      weapon: atk.name,
      label: (atk.name || "Attack") + " " + kind,
      type: "damage"
    });
  }
  return line;
}
async function applySaveEffect(row, atk, target, mode) {
  const spec = atk && atk.saveEffect;
  if (!row || !spec) return "";
  const save = await askAttackSave(row, atk, target, spec, mode);
  const text = atk.notes || "The DM resolves this effect.";
  return save.line + " · " + text;
}
async function strikeTarget(row, atk) {
  let targetId = (atk.lastRoll && atk.lastRoll.targetId) || row.lastAttackerId;
  let targetName = (atk.lastRoll && atk.lastRoll.targetName) || "";
  const stored = playerTargets().filter((p) => p.id === targetId)[0];
  if (!targetId || !stored || !livingPlayer(stored)) {
    const picked = await askEnemyStrike(row, atk);
    if (!picked || !picked.targetId) return null;
    targetId = picked.targetId;
    targetName = "";
  }
  const next = playerTargets().filter((p) => p.id === targetId)[0];
  if (next && !livingPlayer(next)) return null;
  return next || { id: targetId, name: targetName || targetId };
}
async function runRider(i, n, mode) {
  const row = fight.order[i];
  const atk = row && row.card && row.card.attacks && row.card.attacks[n];
  if (!row || !atk) return;
  const target = await strikeTarget(row, atk);
  if (!target) return;
  const lines = [];
  if (atk.rider && (atk.rider.save || conditionName(atk.rider))) {
    const save = await askAttackSave(row, atk, target, atk.rider, mode);
    if (save.failed) await rememberCondition(row, target, conditionName(atk.rider), atk.rider.rounds);
    lines.push(save.line);
  }
  if (atk.saveDamage) lines.push(await applySaveDamage(row, atk, target, mode));
  if (atk.saveEffect) lines.push(await applySaveEffect(row, atk, target, mode));
  await saveRemoteTable();
  renderFight();
  DM.toast(lines.filter(Boolean).join(" · ") || "No save on that attack");
}
function onEnemySheetClick(e) {
  const t = e.target.closest && e.target.closest("[data-open-enemy],[data-open-beast],[data-beast-card],[data-sheet-roll],[data-sheet-apply],[data-sheet-save],[data-sheet-check],[data-sheet-cast],[data-sheet-dice],[data-sheet-add],[data-sheet-feat],[data-sheet-slot]");
  if (!t) return;
  if (t.hasAttribute("data-open-enemy")) {
    openEnemyById(t.getAttribute("data-open-enemy"));
    return;
  }
  if (t.hasAttribute("data-open-beast")) {
    openEnemyBeast(t.getAttribute("data-open-beast"));
    return;
  }
  if (t.hasAttribute("data-beast-card") && !e.target.closest("input, button, a, label")) {
    openEnemyBeast(t.getAttribute("data-beast-card"));
    return;
  }
  if (!t.hasAttribute("data-sheet-roll") && !t.hasAttribute("data-sheet-apply") && !t.hasAttribute("data-sheet-save") && !t.hasAttribute("data-sheet-check") && !t.hasAttribute("data-sheet-cast") && !t.hasAttribute("data-sheet-dice") && !t.hasAttribute("data-sheet-add") && !t.hasAttribute("data-sheet-feat") && !t.hasAttribute("data-sheet-slot")) return;
  e.preventDefault();
  const n = parseInt(t.getAttribute("data-n"), 10);
  withSheetRow().then((i) => {
    if (t.hasAttribute("data-sheet-add")) return;
    if (i == null) return;
    if (t.hasAttribute("data-sheet-roll")) return cardStrike(i, n, { skipRider: true });
    if (t.hasAttribute("data-sheet-apply")) return applyLastStrike(i, n);
    if (t.hasAttribute("data-sheet-save")) return runRider(i, n, t.getAttribute("data-sheet-save"));
    if (t.hasAttribute("data-sheet-check")) return cardCheck(i, t.getAttribute("data-check-mod"), t.getAttribute("data-check-label"));
    if (t.hasAttribute("data-sheet-cast")) return cardCast(i, n);
    if (t.hasAttribute("data-sheet-dice")) return cardDice(i);
    if (t.hasAttribute("data-sheet-slot")) {
      const row = fight.order[i];
      const lv = t.getAttribute("data-sheet-slot");
      const slot = row && row.card && row.card.slots && row.card.slots[lv];
      if (!slot) return;
      slot.left = slot.left > 0 ? slot.left - 1 : slot.max;
      renderEnemySheet();
      return;
    }
    if (t.hasAttribute("data-sheet-feat")) {
      const again = document.querySelector("#enemySheet [data-feat-" + (t.getAttribute("data-sheet-feat") === "recharge" ? "recharge" : "use") + "=\"" + i + "\"][data-feat-n=\"" + n + "\"]");
      if (again) again.click();
    }
  });
}

function tierLines(g) {
  if (!g || !g.tiers || typeof g.tiers !== "object") {
    return [g && g.damage, g && g.range && ("range " + g.range), g && g.properties].filter(Boolean).join(" · ");
  }
  return Object.keys(g.tiers).filter((k) => k !== "standard").map((k) => {
    const t = g.tiers[k] || {};
    if (t.buck || t.slug) {
      const buck = t.buck || {};
      const slug = t.slug || {};
      return k + ": buck " + (buck.damage || "—") + (buck.range ? " " + buck.range : "") + (slug.damage ? " / slug " + slug.damage + (slug.range ? " " + slug.range : "") + (slug.misfire ? " MF " + slug.misfire : "") : "");
    }
    return k + ": " + [t.damage, t.range && ("range " + t.range), t.misfire && ("MF " + t.misfire)].filter(Boolean).join(" ");
  }).concat(g.properties ? [g.properties] : []).join(" · ");
}

function lookup(q) {
  const box = $("#lookupResults");
  if (!box) return;
  try {
    const rules = window.SSDNS_RULES;
    if (!rules) {
      box.innerHTML = '<p class="lede">Rules data did not load. This page expects assets/data/rules.js.</p>';
      return;
    }
    const query = String(q || "").trim().toLowerCase();
    if (query.length < 2) {
      box.innerHTML = '<p class="lede">Type at least two letters. This searches guns, melee, spells (PHB name or frontier name), feats, armor, and the rules notes.</p>';
      return;
    }
    const hits = [];
    function push(title, line, src) {
      if (hits.length >= 20) return;
      hits.push(`<div class="feed-item"><b>${esc(title)}</b><div>${esc(line || "")}</div><div class="fine">${esc(src || "No printed page in the rules data")}</div></div>`);
    }
    function has(text) { return String(text || "").toLowerCase().indexOf(query) >= 0; }
    ["firearms", "casterGuns", "melee", "otherRanged"].forEach((key) => {
      (rules[key] || []).forEach((g) => {
        if (!has(g.name) && !has(g.properties) && !has(g.phb5e)) return;
        const line = tierLines(g);
        push(g.name, line, g.src);
      });
    });
    (rules.feats || []).forEach((f) => {
      if (!has(f.name) && !has(f.phb5e) && !has(f.gist)) return;
      push(f.name, f.gist || "", f.src);
    });
    (rules.armor || []).forEach((a) => {
      if (!has(a.name) && !has(a.phb5e)) return;
      push(a.name, [a.ac, a.cost && (a.cost + " ES")].filter(Boolean).join(" · "), a.src);
    });
    const lists = rules.spellLists || {};
    Object.keys(lists).forEach((key) => {
      const list = lists[key] || {};
      const levels = list.levels || {};
      Object.keys(levels).forEach((lvl) => {
        const spells = levels[lvl];
        if (!Array.isArray(spells)) return;
        spells.forEach((spell) => {
          const name = String(spell).replace(/\.$/, "");
          if (!has(name)) return;
          push(name, (list.title || key) + " · level " + lvl, "spellLists in rules.js");
        });
      });
    });
    (rules.spellAliases || []).forEach((a) => {
      if (!has(a.phb) && !has(a.alias) && !has(a.sketch)) return;
      push(a.phb + (a.alias && a.alias !== "—" ? " (" + a.alias + ")" : ""), a.sketch || "", "Level " + a.level);
    });
    const notes = rules.rulesText || {};
    Object.keys(notes).forEach((key) => {
      const text = String(notes[key] || "");
      if (!has(key) && !has(text.slice(0, 400))) return;
      push(key, text.slice(0, 220), "rulesText");
    });
    box.innerHTML = hits.join("") || '<p class="lede">Nothing in the rules data matches that.</p>';
  } catch (err) {
    box.innerHTML = '<p class="lede">Lookup failed: ' + esc(err && err.message) + "</p>";
    console.error(err);
  }
}

function renderTracks() {
  const sel = $("#musicTrack");
  if (!sel) return;
  const keep = sel.value || fight.trackId;
  sel.innerHTML = fight.tracks.map((t) => `<option value="${esc(t.id)}">${esc(t.title)}</option>`).join("")
    || '<option value="">No tracks in tracks.json</option>';
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
}
function currentTrack() {
  const id = $("#musicTrack") && $("#musicTrack").value;
  return fight.tracks.filter((t) => t.id === id)[0] || null;
}
async function playTrack() {
  const t = currentTrack();
  if (!t) { DM.toast("No track selected"); return; }
  fight.playing = true;
  fight.loop = $("#musicLoop") && $("#musicLoop").checked;
  fight.toTable = $("#musicTable") && $("#musicTable").checked;
  const status = $("#musicStatus");
  if (window.SSDNSAudio) {
    window.SSDNSAudio.playMusic({
      file: t.file,
      loop: fight.loop,
      onmissing: function () { if (status) status.textContent = "No file at assets/music/" + t.file + " yet"; },
      onplay: function () { if (status) status.textContent = "Playing " + t.title; },
      onblocked: function () { if (status) status.textContent = "Browser blocked autoplay — press play again"; }
    });
  }
  if (fight.toTable) {
    await DM.pushCommand({
      type: "music", to: "all",
      payload: { action: "play", file: t.file, title: t.title, loop: fight.loop },
      from: DM.state.uid
    });
  }
  if (status && !status.textContent) status.textContent = "Play requested · " + t.title;
}
async function stopTrack() {
  fight.playing = false;
  if (window.SSDNSAudio) window.SSDNSAudio.stopMusic();
  const status = $("#musicStatus");
  if (status) status.textContent = "Stopped";
  if ($("#musicTable") && $("#musicTable").checked) {
    await DM.pushCommand({ type: "music", to: "all", payload: { action: "stop" }, from: DM.state.uid });
  }
}

function decorateDetail(pid) {
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const body = $("#detailBody");
  if (!body) return;
  const guns = (s.guns || []).filter((g) => g && g.name);
  const conds = String(s.conditions || "").split(",").map((x) => x.trim()).filter(Boolean);
  const box = document.createElement("div");
  box.className = "detail-tools";
  box.innerHTML = `
    <div class="detail-section"><h3>Give equipment</h3>
      <div class="toolbar">
        <input type="text" id="detailItem" placeholder="Item that lands in their equipment">
        <button type="button" class="btn sm" id="btnDetailItem">Add to sheet</button>
      </div>
    </div>
    <div class="detail-section"><h3>Conditions</h3>
      <div class="cond-picks">${(window.SSDNSConditions ? window.SSDNSConditions.catalog() : CONDITIONS.filter((c) => c !== "Bleeding").map((c) => ({ name: c, text: "", exhaustion: c === "Exhaustion" }))).map((item) => {
        const on = conds.some((c) => c.toLowerCase() === item.name.toLowerCase() || c.toLowerCase().indexOf(item.name.toLowerCase()) === 0);
        return `<label class="toggle"><input type="checkbox" data-cond="${esc(item.name)}"${on ? " checked" : ""}> ${esc(item.name)} <input type="number" min="1" data-cond-rounds="${esc(item.name)}" placeholder="rounds" aria-label="Rounds for ${esc(item.name)}"><span class="fine">${esc(item.text || "")}</span></label>`;
      }).join("")}</div>
      <label class="fine">Exhaustion level <input id="exhLevel" type="number" min="1" max="6" value="1"></label>
      <button type="button" class="btn sm" id="btnSaveConds">Save conditions</button>
    </div>
    <div class="detail-section"><h3>Gun attack</h3>
      <div class="toolbar">
        <select id="detailGun">${guns.map((g, i) => `<option value="${i}">${esc(g.name)} · ${esc(g.loaded ?? "?")}/${esc(g.capacity ?? "?")} rounds${g.atk ? " · " + esc(g.atk) : ""}${g.misfire ? " · MF " + esc(g.misfire) : ""}</option>`).join("") || '<option value="">No guns</option>'}</select>
        <select id="detailAdv" aria-label="Advantage or disadvantage"><option value="">Straight</option><option value="adv">Advantage</option><option value="dis">Disadvantage</option></select>
        <button type="button" class="btn sm" id="btnDetailAttack">Roll weapon</button>
      </div>
      <p class="lede">Roll weapon is a plain attack. It never spends a spell slot.</p>
      <div class="toolbar">
        <select id="detailSpell" aria-label="Spell to cast">${spellOptions(s)}</select>
        <select id="detailSlot" aria-label="Shell or slot level">${slotOptions(s)}</select>
        <button type="button" class="btn sm" id="btnDetailSpell">Cast through gun</button>
      </div>
    </div>
    <div class="detail-section"><h3>Death saves</h3>
      <div class="toolbar" id="deathTools"></div>
    </div>`;
  body.appendChild(box);
  const ds = s.deathSaves || { success: [false, false, false], fail: [false, false, false] };
  const tools = $("#deathTools");
  ["success", "fail"].forEach((side) => {
    for (let i = 0; i < 3; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn sm" + (ds[side] && ds[side][i] ? " btn-primary" : "");
      b.textContent = (side === "success" ? "S" : "F") + (i + 1);
      b.addEventListener("click", async () => {
        const on = !(ds[side] && ds[side][i]);
        if (!ds[side]) ds[side] = [false, false, false];
        ds[side][i] = on;
        s.deathSaves = ds;
        b.classList.toggle("btn-primary", on);
        await DM.pushCommand({
          type: "death_save", to: pid,
          payload: { side: side, index: i, on: on },
          from: DM.state.uid
        });
        await DM.pushLedger(Object.assign({
          who: "DM", playerId: pid, type: "death_save",
          what: "Death save " + side + " " + (i + 1) + (on ? " marked" : " cleared") + " · " + (s.name || pid),
          oldVal: null, newVal: on, flag: side === "fail" && on
        }, namesFor(pid)));
      });
      tools.appendChild(b);
    }
  });
  $("#btnDetailItem").addEventListener("click", async () => {
    const text = ($("#detailItem").value || "").trim();
    if (!text) return;
    const names = namesFor(pid);
    if (DM.state.demo && s) s.equipment = (s.equipment ? s.equipment + "\n" : "") + "• " + text + " (from DM)";
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "dm_push",
      what: "Item: " + text, oldVal: null, newVal: text, flag: false
    }, names));
    const cmd = { type: "reward_item", to: pid, payload: { text: text }, from: DM.state.uid };
    await DM.pushCommand(cmd);
    rememberUndo({
      type: "item", playerId: pid, label: "item " + text,
      command: { type: "undo_item", to: pid, payload: { text: text }, from: DM.state.uid },
      demo: function () {
        if (!s.equipment) return;
        s.equipment = s.equipment.split("\n").filter((line) => line !== "• " + text + " (from DM)").join("\n");
      }
    });
    $("#detailItem").value = "";
    DM.toast("Item sent");
  });
  $("#btnSaveConds").addEventListener("click", async () => {
    const list = $$("[data-cond]", box).filter((el) => el.checked).map((el) => el.getAttribute("data-cond"));
    const level = parseInt($("#exhLevel") && $("#exhLevel").value, 10) || 1;
    const roundsByName = {};
    list.forEach((condName) => {
      const rounds = box.querySelector("[data-cond-rounds='" + condName + "']");
      if (rounds && String(rounds.value).trim() !== "") roundsByName[condName] = parseInt(rounds.value, 10);
    });
    await writeSubjectConditions(pid, "player", list, s.name || "", level, roundsByName);
    DM.toast(list.length ? "Conditions set" : "Conditions cleared");
  });
  $("#btnDetailAttack").addEventListener("click", () => rollGunAttack(pid));
  const spellBtn = $("#btnDetailSpell");
  const spellSel = $("#detailSpell");
  const slotSel = $("#detailSlot");
  function fillSlots() {
    if (!spellSel || !slotSel) return;
    const spellLv = parseInt(String(spellSel.value || "0").split(":")[0], 10) || 0;
    const keep = slotSel.value;
    slotSel.innerHTML = slotOptions(s, spellLv);
    slotSel.hidden = spellLv === 0;
    if (keep && [...slotSel.options].some((o) => o.value === keep)) slotSel.value = keep;
  }
  function syncCastBtn() {
    if (!spellBtn || !slotSel || !spellSel) return;
    if (!spellSel.value) { spellBtn.disabled = true; return; }
    const lv = parseInt(slotSel.value, 10) || 0;
    if (!lv) { spellBtn.disabled = false; return; }
    const isHex = s.callingId === "hexslinger" || /hexslinger/i.test(s.calling || "");
    if (isHex) {
      const gunsNow = (s.guns || []).filter((g) => g && g.name);
      const gi = parseInt($("#detailGun") && $("#detailGun").value, 10);
      spellBtn.disabled = !hexHeld(gunsNow[gi], lv);
      return;
    }
    const text = slotSel.selectedOptions && slotSel.selectedOptions[0] ? slotSel.selectedOptions[0].textContent : "";
    const m = String(text).match(/(\d+)\s*\/\s*(\d+)/);
    spellBtn.disabled = !!(m && Number(m[1]) <= 0);
  }
  if (spellSel) spellSel.addEventListener("change", () => { fillSlots(); syncCastBtn(); });
  if (spellBtn) spellBtn.addEventListener("click", () => { if (!spellBtn.disabled) rollSpell(pid); });
  if (slotSel) slotSel.addEventListener("change", syncCastBtn);
  fillSlots();
  syncCastBtn();
}

function spellOptions(s) {
  const spells = (s && s.spells) || {};
  const out = [];
  (spells.cantrips || []).forEach((name) => {
    if (name) out.push(`<option value="0:${esc(name)}">${esc(name)}</option>`);
  });
  (spells.prepared || []).forEach((name) => {
    if (!name) return;
    const row = window.SSDNSSpellCast && window.SSDNSSpellCast.lookup(name);
    const lv = row && typeof row.level === "number" ? row.level : 1;
    if (!lv) return;
    out.push(`<option value="${lv}:${esc(name)}">${esc(name)} · ${lv}</option>`);
  });
  return out.join("") || '<option value="">No spells on the sheet</option>';
}
function hexHeld(g, level) {
  if (!g) return false;
  const ch = g.chambers;
  if (Array.isArray(ch) && ch.length) {
    return ch.some((st) => {
      const s = String(st || "");
      if (s === String(level)) return true;
      return s.indexOf("k:hex:" + level + ":") === 0;
    });
  }
  return Number(g.hex) > 0;
}

function slotOptions(s, minLevel) {
  const slots = (s.spells && s.spells.slots) || {};
  const spent = (s.spells && s.spells.spent) || {};
  const floor = Math.max(1, parseInt(minLevel, 10) || 1);
  let html = "";
  for (let lv = floor; lv <= 9; lv++) {
    const total = Number(slots[lv] || 0);
    if (!total && lv !== floor) continue;
    const left = Math.max(0, total - Number(spent[lv] || 0));
    html += `<option value="${lv}">Level ${lv}${total ? " · " + left + "/" + total : ""}</option>`;
  }
  return html || `<option value="${floor}">Level ${floor}</option>`;
}

function atkNumber(text) {
  const m = String(text || "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : 0;
}
function rollDiceExpr(expr) {
  const f = String(expr || "").toLowerCase();
  const m = f.match(/(\d*)d(\d+)\s*([+-]\s*\d+)?/);
  if (!m) return null;
  const n = Math.max(1, parseInt(m[1] || "1", 10));
  const sides = parseInt(m[2], 10);
  const mod = m[3] ? parseInt(m[3].replace(/\s/g, ""), 10) : 0;
  if (!sides) return null;
  const count = crit ? n * 2 : n;
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * sides));
  const sum = rolls.reduce((a, b) => a + b, 0) + mod;
  const sign = mod >= 0 ? "+" + mod : String(mod);
  return { total: sum, detail: rolls.join("+") + (mod ? sign : ""), formula: count + "d" + sides + (mod ? sign : "") };
}
function misfireCeiling(text, dirty) {
  const s = String(text || "1");
  const m = s.match(/(\d+)\s*[–-]\s*(\d+)/);
  let hi = m ? parseInt(m[2], 10) : parseInt((s.match(/(\d+)/) || ["", "1"])[1], 10);
  if (!hi) hi = 1;
  if (dirty) hi = Math.max(hi, 2);
  return hi;
}
async function rollGunAttack(pid) {
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const guns = (s.guns || []).filter((g) => g && g.name);
  const idx = parseInt($("#detailGun") && $("#detailGun").value, 10);
  const g = guns[idx];
  if (!g) { DM.toast("No gun"); return; }
  if (g.jammed) { DM.toast(g.name + " is jammed"); return; }
  if (g.fouled) { DM.toast(g.name + " is fouled"); return; }
  const loaded = Number(g.loaded);
  if (g.caster && Number(g.plain) <= 0) {
    DM.toast(g.name + " has no plain cartridge. Cast through gun fires a hex shell. Roll weapon never spends a slot.");
    return;
  }
  if (!isFinite(loaded) || loaded <= 0) { DM.toast(g.name + " is empty"); return; }
  g.loaded = loaded - 1;
  if (g.plain > 0) g.plain -= 1;
  const bonus = atkNumber(g.atk);
  const mode = ($("#detailAdv") && $("#detailAdv").value) || "";
  const n1 = 1 + Math.floor(Math.random() * 20);
  let n2 = null;
  let nat = n1;
  if (mode === "adv" || mode === "dis") {
    n2 = 1 + Math.floor(Math.random() * 20);
    nat = mode === "adv" ? Math.max(n1, n2) : Math.min(n1, n2);
  }
  const hi = misfireCeiling(g.misfire, !!g.dirty);
  const inRange = (n) => n >= 1 && n <= hi;
  const both = n2 != null && inRange(n1) && inRange(n2) && !g.rugged;
  const misfire = both || inRange(nat);
  const total = nat + bonus;
  const dice = n2 == null ? String(nat) : (n1 + "/" + n2 + " → " + nat);
  if (window.SSDNSAudio) window.SSDNSAudio.play("attack");
  let dmg = null;
  if (!misfire) dmg = rollDiceExpr(g.damage, nat === 20);
  const whoName = namesFor(pid).characterName || s.name || "them";
  await DM.pushRoll({
    who: "DM",
    playerId: pid, uid: DM.state.uid,
    label: "DM rolled for " + whoName + " · " + g.name + (misfire ? " misfire" : " attack"),
    formula: (n2 == null ? "1d20" : "2d20") + (bonus ? (bonus >= 0 ? "+" : "") + bonus : "") + (dmg ? " · " + dmg.formula : ""),
    result: total, detail: dice + (bonus ? (bonus >= 0 ? "+" : "") + bonus : "") + (dmg ? " · dmg " + dmg.total + " (" + dmg.detail + ")" : "") + (misfire ? " misfire" : ""),
    nat1: false, isFirearm: true, attack: true, nat: nat, crit: nat === 20, private: false,
    damage: dmg ? dmg.total : null
  });
  const names = namesFor(pid);
  if (both) {
    g.fouled = true;
    g.condition = "fouled";
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "foul",
      what: g.name + " fouled (double misfire) · " + (names.characterName || ""),
      oldVal: null, newVal: "fouled", flag: false
    }, names));
    await DM.pushCommand({ type: "gun_event", to: pid, payload: { name: g.name, spend: 1, fouled: true }, from: DM.state.uid });
  } else if (misfire) {
    g.jammed = true;
    g.condition = "jammed";
    if (window.SSDNSAudio) window.SSDNSAudio.play("jam");
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "jam",
      what: g.name + " jammed (misfire) · " + (names.characterName || ""),
      oldVal: null, newVal: "jammed", flag: false
    }, names));
    await DM.pushCommand({ type: "gun_event", to: pid, payload: { name: g.name, spend: 1, jammed: true }, from: DM.state.uid });
  } else {
    await DM.pushCommand({ type: "gun_event", to: pid, payload: { name: g.name, spend: 1 }, from: DM.state.uid });
  }
  if (g.cracked || g.condition === "cracked") {
    const ex = 1 + Math.floor(Math.random() * 20);
    await DM.pushRoll({
      who: "DM", playerId: pid, uid: DM.state.uid,
      label: g.name + " · DM note", formula: "1d20", result: ex, detail: String(ex),
      nat1: ex === 1, isFirearm: true, private: true
    });
    if (ex === 1) DM.toast(g.name + " — DM note only");
  }
  DM.renderPlayers();
  DM.toast(g.name + " → " + total + (both ? " FOULED" : (misfire ? " misfire" : "")) + " · " + g.loaded + " left");
}
async function rollSpell(pid) {
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const raw = ($("#detailSpell") && $("#detailSpell").value) || "";
  const cut = raw.indexOf(":");
  const spellName = cut >= 0 ? raw.slice(cut + 1) : "";
  const spellLv = cut >= 0 ? (parseInt(raw.slice(0, cut), 10) || 0) : 0;
  if (!spellName) { DM.toast("Pick a spell from the sheet"); return; }
  const level = spellLv ? (parseInt($("#detailSlot") && $("#detailSlot").value, 10) || spellLv) : 0;
  s.spells = s.spells || {};
  s.spells.slots = s.spells.slots || {};
  s.spells.spent = s.spells.spent || {};
  const guns = (s.guns || []).filter((g) => g && g.name);
  const gi = parseInt($("#detailGun") && $("#detailGun").value, 10);
  const g = guns[gi];
  const isHex = s.callingId === "hexslinger" || /hexslinger/i.test(s.calling || "");
  if (level && isHex) {
    if (!hexHeld(g, level)) {
      DM.toast("Load a level-" + level + " hex shell first. Loading spends the slot. Cast through gun only fires it.");
      return;
    }
    if (Array.isArray(g.chambers)) {
      const idx = g.chambers.findIndex((st) => String(st) === String(level) || String(st || "").indexOf("k:hex:" + level + ":") === 0);
      if (idx >= 0) g.chambers[idx] = "";
    }
    if (Number(g.hex) > 0) g.hex = Number(g.hex) - 1;
    if (Number(g.loaded) > 0) g.loaded = Number(g.loaded) - 1;
    await DM.pushCommand({ type: "hex_fire", to: pid, payload: { level: level }, from: DM.state.uid });
  } else if (level) {
    const totalSlots = Number(s.spells.slots[level] || 0);
    const used = Number(s.spells.spent[level] || 0);
    if (!totalSlots || used >= totalSlots) { DM.toast("No level-" + level + " slot left"); return; }
    s.spells.spent[level] = used + 1;
    await DM.pushCommand({ type: "hex_spend", to: pid, payload: { level: level }, from: DM.state.uid });
  }
  const Cast = window.SSDNSSpellCast;
  if (!Cast || !Cast.rollCast) { DM.toast("Spell roller isn't loaded"); return; }
  const spellRow = Cast.lookup ? Cast.lookup(spellName) : null;
  const rolled = Cast.rollCast({
    spellName: spellName,
    slotLevel: level,
    characterLevel: s.level,
    attackBonus: atkNumber(s.spellAtk),
    spellMod: s.spellMod,
    dc: s.spellDC,
    weaponDamage: spellRow && spellRow.weapon ? (g && g.damage) : "",
    weaponAtk: g ? atkNumber(g.atk) : atkNumber(s.spellAtk),
    gunName: g && g.name,
    wildSpark: isHex && level > 0
  });
  if (window.SSDNSAudio) window.SSDNSAudio.play("spellcast");
  await DM.pushRoll({
    who: "DM",
    playerId: pid, uid: DM.state.uid,
    label: rolled.label,
    formula: rolled.formula,
    result: rolled.result,
    detail: rolled.detail,
    nat1: false, isFirearm: !!level, attack: rolled.attack, nat: rolled.nat, crit: rolled.crit, private: false
  });
  DM.renderPlayers();
  DM.toast(rolled.text);
}

function damagePick() {
  const formula = ($("#dmgFormula") && $("#dmgFormula").value || "").trim();
  const flatRaw = $("#dmgFlat") && String($("#dmgFlat").value || "").trim();
  const flat = flatRaw === "" ? 0 : (parseInt(flatRaw, 10) || 0);
  if (!formula && !flat) return null;
  let diceTotal = 0;
  let detail = "";
  if (formula) {
    const out = DM.parseDice(formula);
    diceTotal = out.total;
    detail = formula + " (" + (out.detail || out.total) + ")";
  }
  if (flat) detail = (detail ? detail + " + " : "") + String(flat);
  return { total: Math.max(0, diceTotal + flat), detail: detail || String(diceTotal + flat), formula: formula || String(flat) };
}
function clearDamageDice() {
  const el = $("#dmgFormula");
  if (el) el.value = "";
}
function applyEnemyHp(row, delta) {
  const before = knownNumber(row && row.hp);
  if (before == null) {
    DM.toast((row && row.name ? row.name : "Enemy") + " has no HP set, so it is not marked Down");
    return null;
  }
  if (delta > 0) {
    const max = knownNumber(row.maxHp);
    row.hp = max == null ? before + delta : Math.min(max, before + delta);
  } else row.hp = Math.max(0, before + delta);
  if (window.SSDNSApplied && window.SSDNSApplied.refreshCombatantStatus) window.SSDNSApplied.refreshCombatantStatus(row);
  return before;
}
function askAmount(sign) {
  const raw = window.prompt(sign < 0 ? "Damage amount" : "Heal amount", "");
  if (raw == null) return null;
  const amt = parseInt(String(raw).trim(), 10);
  if (!isFinite(amt) || amt === 0) { DM.toast("Enter an amount"); return null; }
  return Math.abs(amt);
}
async function rowHp(i, sign) {
  const row = fight.order[i];
  if (!row) return;
  const amt = askAmount(sign);
  if (amt == null) return;
  clearDamageDice();
  const flat = $("#dmgFlat");
  if (flat) flat.value = "";
  if (row.kind === "player" && row.playerId) {
    if (flat) flat.value = String(amt);
    const sel = $("#dmgTarget");
    if (sel) sel.value = row.playerId;
    const btn = sign < 0 ? $("#btnDmg") : $("#btnHeal");
    if (btn) btn.click();
    if (flat) flat.value = "";
    return;
  }
  const before = applyEnemyHp(row, sign * amt);
  if (before == null) return;
  clearDamageDice();
  await saveRemoteTable();
  renderFight();
  const line = (sign < 0 ? "Damage " : "Heal ") + amt + " → " + row.name + " (" + row.hp + " HP, " + enemyStatus(row) + ")";
  DM.toast(line);
  await DM.pushLedger({ who: "DM", playerId: "all", type: sign < 0 ? "damage" : "heal", what: line, oldVal: before, newVal: row.hp, flag: false });
}
function noteUnconscious(row) {
  if (!row) return;
  const hp = knownNumber(row.hp);
  if (hp != null && hp > 0) return;
  const Cond = window.SSDNSConditions;
  if (!Cond) return;
  const subjectId = row.kind === "player" ? (row.playerId || row.id) : row.id;
  if (!subjectId) return;
  const id = Cond.idFor(subjectId, "Unconscious");
  row.hp = 0;
  if (fight.condMap && fight.condMap[id]) {
    row.conditions = Cond.ensureUnconscious(conditionsForRow(row), 0, subjectId);
    return;
  }
  const entry = Cond.normalize({
    id: id, name: "Unconscious", subjectId: subjectId,
    subjectKind: row.kind === "enemy" ? "enemy" : "player",
    by: DM.state.uid || "dm", byName: "DM", updatedAt: new Date().toISOString(), active: true
  });
  fight.condMap = fight.condMap || {};
  fight.condMap[id] = entry;
  row.conditions = Cond.ensureUnconscious(row.conditions || [], 0, subjectId);
  if (row.kind === "player" && DM.state.players[subjectId] && DM.state.players[subjectId].snapshot) {
    const snap = DM.state.players[subjectId].snapshot;
    snap.activeConditions = Cond.mergeById(snap.activeConditions || [], [entry], []);
    snap.conditions = Cond.listText(snap.activeConditions);
    snap.hpCurrent = 0;
  }
  const line = (row.name || "Someone") + " is Unconscious";
  DM.pushLedger({ who: "DM", playerId: row.kind === "player" ? subjectId : "all", type: "condition", what: line, oldVal: null, newVal: "Unconscious", flag: false });
  if (!DM.state.demo && DM.state.db && DM.state._fb) DM.state._fb.set(DM.roomRef("conditions/" + id), entry).catch(() => {});
  if (row.kind === "player") {
    DM.pushCommand({ type: "set_conditions", to: subjectId, payload: { merge: true, entries: [entry], quiet: true }, from: DM.state.uid });
  }
}
async function markDown(i) {
  const row = fight.order[i];
  if (!row) return;
  row.hp = 0;
  row.status = "Down";
  noteUnconscious(row);
  await saveRemoteTable();
  renderFight();
  DM.toast((row.name || "Someone") + " is Unconscious · Down");
}
async function markFled(i) {
  const row = fight.order[i];
  if (!row || row.kind !== "enemy") return;
  row.status = "Fled";
  row.fled = true;
  const current = fight.started && fight.turn === i;
  await saveRemoteTable();
  renderFight();
  announce((row.name || "Enemy") + " fled", "combat", row);
  if (current) nextTurn();
}
function attackThis(i) { return attackRow(i); }
function dexModFrom(dex) {
  const n = Number(dex);
  if (!isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}
function livingPlayer(p) {
  if (!p) return false;
  if (window.SSDNSApplied && window.SSDNSApplied.isUnusableTarget) return !window.SSDNSApplied.isUnusableTarget(p);
  const hp = knownNumber(p.hp);
  if (hp != null && hp <= 0) return false;
  if (/^(down|dead|unconscious|fled|left)$/i.test(String(p.status || ""))) return false;
  return true;
}
function playerTargets() {
  const fromOrder = fight.order.filter((r) => r && r.kind === "player").map((r) => ({
    id: r.playerId || r.id,
    name: r.name || "Player",
    ac: r.ac,
    hp: r.hp,
    status: r.status || "",
    fled: !!r.fled
  }));
  Object.keys(DM.state.players || {}).forEach((pid) => {
    if (fromOrder.some((p) => p.id === pid)) return;
    if (fight.departed && fight.departed[pid]) return;
    const s = DM.state.players[pid].snapshot || {};
    fromOrder.push({ id: pid, name: s.name || pid, ac: s.ac, hp: s.hpCurrent, status: "" });
  });
  return fromOrder;
}
function askEnemyStrike(row, preset) {
  const players = playerTargets().filter(livingPlayer);
  const previous = row.lastAttackerId && players.some((p) => p.id === row.lastAttackerId) ? row.lastAttackerId : "";
  const def = previous || (players[0] && players[0].id) || "";
  const bonus = preset && preset.toHit != null && preset.toHit !== "" ? preset.toHit : row.atkBonus;
  const dice = preset && preset.damage ? preset.damage : (row.damage || "");
  const title = preset && preset.name ? preset.name : "Attack a player";
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const options = players.map((p) => `<option value="${esc(p.id)}"${p.id === def ? " selected" : ""}>${esc(p.name)} · AC ${esc(p.ac == null || p.ac === "" ? "?" : p.ac)}</option>`).join("");
    const grip = preset && preset.versatile
      ? `<label>Grip <select id="enemyGrip" aria-label="One or two hands"><option value="1">One-handed</option><option value="2">Two-handed</option></select></label>`
      : "";
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p class="fine">${esc(row.name || "Enemy")} attacks.</p><label>Target <select id="enemyTarget">${options || "<option value=''>No players</option>"}</select></label><label>Attack bonus <input id="enemyBonus" type="number" value="${bonus == null ? "" : esc(bonus)}" placeholder="blank asks"></label>${grip}<label>Damage <input id="enemyDice" value="${esc(dice)}" placeholder="1d6+2"></label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Roll</button></div></form>`;
    const gripSel = dlg.querySelector("#enemyGrip");
    const diceInput = dlg.querySelector("#enemyDice");
    if (gripSel && diceInput && preset && preset.versatile) {
      const oneHand = String(dice || "");
      const twoHand = String(preset.versatile);
      gripSel.addEventListener("change", () => { diceInput.value = gripSel.value === "2" ? twoHand : oneHand; });
    }
    const finish = (ok) => {
      const target = dlg.querySelector("#enemyTarget");
      const bonus = dlg.querySelector("#enemyBonus");
      const dice = dlg.querySelector("#enemyDice");
      const payload = ok ? {
        targetId: target && target.value,
        bonus: bonus && String(bonus.value).trim() === "" ? null : Number(bonus && bonus.value),
        dice: dice && dice.value.trim()
      } : null;
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      resolve(payload);
    };
    dlg.querySelector("[value=no]").addEventListener("click", () => finish(false));
    dlg.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); finish(true); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    document.body.appendChild(dlg);
    openDialog(dlg);
  });
}
async function enemyStrike(i, preset) {
  const row = fight.order[i];
  if (!row || partyAttackBlocked(row)) return;
  const picked = await askEnemyStrike(row, preset);
  if (!picked || !picked.targetId) { DM.toast("No player to attack"); return; }
  if (picked.bonus == null || !isFinite(picked.bonus) || !picked.dice) { DM.toast("Enter an attack bonus and damage"); return; }
  row.atkBonus = picked.bonus;
  row.damage = picked.dice;
  const target = playerTargets().filter((p) => p.id === picked.targetId)[0] || { id: picked.targetId, name: picked.targetId, ac: null };
  const nat = d20();
  const total = nat + picked.bonus;
  const ac = Number(target.ac);
  const miss = nat === 1 || (isFinite(ac) && total < ac);
  const hit = !miss;
  let dmg = null;
  if (hit) dmg = DM.parseDice(picked.dice);
  const bonusTxt = (picked.bonus >= 0 ? "+" : "") + picked.bonus;
  const attackName = (preset && preset.name) || String(row.attacks || "").trim();
  const weapon = attackName && attackName.toLowerCase() !== String(row.name || "").toLowerCase() ? attackName : "";
  const detail = row.name + " attacks " + (target.name || "someone") + ": " + nat + bonusTxt + " = " + total + (isFinite(ac) ? " vs AC " + ac : "") + (miss ? " → MISS" : " → HIT") + (dmg ? " · " + dmg.detail + " = " + dmg.total : "");
  const id = DM.uid("enatk");
  await DM.pushRoll({
    id: id, who: row.name, uid: DM.state.uid, label: row.name + " attacks " + (target.name || ""), formula: "1d20" + bonusTxt,
    result: total, detail: detail, private: false, attack: true, nat: nat, crit: nat === 20 && hit,
    targetId: target.id, targetName: target.name, damage: dmg ? dmg.total : null, ac: isFinite(ac) ? ac : null, weapon: weapon
  });
  if (hit && dmg && fight.damageMode !== "approve") {
    applyPlayerHit({
      rollId: id, targetId: target.id, targetName: target.name, amount: dmg.total,
      from: row.id, characterName: row.name, weapon: weapon, label: attackName || row.name, type: "damage"
    });
  }
  DM.toast(detail);
}
const pendingSaves = {};
function requestPlayerSave(opts) {
  const ability = String((opts && opts.ability) || "STR").toUpperCase();
  const dc = Number(opts && opts.dc);
  const target = playerTargets().filter((p) => p.id === opts.targetId)[0] || { id: opts.targetId, name: opts.targetName || opts.targetId };
  const id = DM.uid("save");
  const localRoll = (auto) => {
    const mod = targetMod(target.id, ability);
    const nat = d20();
    const total = nat + (Number(mod) || 0);
    const failed = isFinite(dc) ? total < dc : true;
    const who = target.name || "Target";
    const line = who + " " + ability + " save" + (auto ? " (no answer, DM rolled)" : "") + " " + nat + signed(mod) + " = " + total + (isFinite(dc) ? " vs DC " + dc : "") + (failed ? " FAIL" : " OK");
    return { id: id, nat: nat, total: total, failed: failed, auto: !!auto, line: line, mod: mod, target: target };
  };
  if (opts.auto) return Promise.resolve(localRoll(true));
  if (DM.state.demo || !DM.state.db) return Promise.resolve(localRoll(false));
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!pendingSaves[id]) return;
      delete pendingSaves[id];
      const rolled = localRoll(true);
      DM.pushRoll({
        who: target.name || "Player", label: (opts.label || "Save") + " · " + ability, formula: "1d20" + signed(rolled.mod),
        result: rolled.total, detail: rolled.line, private: true, nat: rolled.nat, save: true, saveRequestId: id
      });
      resolve(rolled);
    }, 60000);
    pendingSaves[id] = { resolve: resolve, timer: timer, opts: opts, target: target, ability: ability, dc: dc };
    DM.pushCommand({
      type: "save",
      to: target.id,
      quiet: true,
      payload: {
        id: id,
        ability: ability,
        dc: isFinite(dc) ? dc : null,
        label: opts.label || "Save",
        rider: opts.rider || "",
        damage: opts.damage || "",
        fromName: opts.fromName || ""
      },
      from: DM.state.uid
    });
  });
}
function noteSaveRoll(r) {
  const id = r && r.saveRequestId;
  const pending = id && pendingSaves[id];
  if (!pending || r.autoRolled) return;
  clearTimeout(pending.timer);
  delete pendingSaves[id];
  const total = Number(r.result);
  const failed = isFinite(pending.dc) ? total < pending.dc : true;
  pending.resolve({
    id: id,
    nat: r.nat,
    total: total,
    failed: failed,
    auto: false,
    line: r.detail || ((pending.target.name || "Target") + " " + pending.ability + " save = " + total),
    mod: r.mod,
    target: pending.target
  });
}
function targetMod(playerId, ability) {
  const snap = DM.state.players[playerId] && DM.state.players[playerId].snapshot;
  if (!snap) return 0;
  const key = String(ability || "STR").toUpperCase();
  if (snap.mods && snap.mods[key] != null && snap.mods[key] !== "") return Number(snap.mods[key]) || 0;
  const scores = snap.abilities || snap.scores || {};
  if (scores[key] != null) return cardMod(scores[key]);
  return 0;
}
async function publishCardRoll(row, detail, result, extra) {
  const pub = !!(row.card && row.card.public);
  const shown = window.SSDNSApplied && window.SSDNSApplied.publicDetail
    ? window.SSDNSApplied.publicDetail(detail)
    : detail;
  await DM.pushRoll(Object.assign({
    who: row.name || "Enemy",
    label: row.name || "Enemy",
    formula: "1d20",
    result: result,
    detail: pub ? shown : detail,
    private: !pub,
    nat: extra && extra.nat
  }, extra || {}));
}
async function cardStrike(i, n, opts) {
  const row = fight.order[i];
  if (partyAttackBlocked(row)) return;
  const atk = row && row.card && row.card.attacks && row.card.attacks[n];
  if (!row || !atk) {
    const listed = row && row.attackList && row.attackList[n];
    if (listed) return enemyStrike(i, listed);
    return;
  }
  if (atk.jammed) { DM.toast(atk.name + " is jammed"); return; }
  if (atk.capacity != null && Number(atk.loaded) <= 0) { DM.toast(atk.name + " is empty"); return; }
  const picked = await askEnemyStrike(row, atk);
  if (!picked || !picked.targetId) { DM.toast("No player to attack"); return; }
  const bonus = picked.bonus != null && isFinite(Number(picked.bonus)) ? Number(picked.bonus) : Number(atk.toHit);
  const dice = String((picked.dice || atk.damage || "")).trim();
  if (!isFinite(bonus) || !dice) { DM.toast("That attack has no bonus or damage"); return; }
  row.lastAttackerId = picked.targetId;
  const target = playerTargets().filter((p) => p.id === picked.targetId)[0] || { id: picked.targetId, name: picked.targetId, ac: null };
  const nat = d20();
  const misfire = window.SSDNSApplied && window.SSDNSApplied.isMisfire
    ? window.SSDNSApplied.isMisfire(nat, atk.misfire)
    : false;
  if (atk.capacity != null) atk.loaded = Math.max(0, Number(atk.loaded) - 1);
  if (misfire) {
    atk.jammed = true;
    const detail = row.name + " fires " + atk.name + ": natural " + nat + " misfire. The round is spent.";
    await publishCardRoll(row, detail, nat, { attack: true, nat: nat });
    await saveRemoteTable();
    renderFight();
    DM.toast(detail + (atk.capacity != null ? " · " + atk.loaded + " left" : ""));
    return;
  }
  const total = nat + bonus;
  const ac = Number(target.ac);
  const miss = nat === 1 || (isFinite(ac) && total < ac);
  const hit = !miss;
  let dmg = null;
  if (hit) dmg = DM.parseDice(dice);
  const bonusTxt = signed(bonus);
  let detail = row.name + " attacks " + (target.name || "someone") + " with " + atk.name + ": " + nat + bonusTxt + " = " + total + (isFinite(ac) ? " vs AC " + ac : "") + (miss ? " → MISS" : " → HIT") + (dmg ? " · " + dmg.detail + " = " + dmg.total : "");
  const id = DM.uid("enatk");
  atk.lastRoll = { id: id, damage: dmg ? dmg.total : null, targetId: target.id, targetName: target.name, hit: hit };
  await publishCardRoll(row, detail, total, {
    id: id, formula: "1d20" + bonusTxt, attack: true, nat: nat, crit: nat === 20 && hit,
    targetId: target.id, targetName: target.name, damage: dmg ? dmg.total : null, weapon: atk.name
  });
  if (hit && dmg && fight.damageMode !== "approve") {
    applyPlayerHit({
      rollId: id, targetId: target.id, targetName: target.name, amount: dmg.total,
      from: row.id, characterName: row.name, weapon: atk.name, label: atk.name, type: "damage"
    });
  }
  if (hit && atk.extraDamage && atk.extraDamage.damage) {
    const extra = DM.parseDice(atk.extraDamage.damage);
    if (extra) {
      detail += " · +" + extra.detail + (atk.extraDamage.damageType ? " " + atk.extraDamage.damageType : "") + " = " + extra.total;
      if (fight.damageMode !== "approve") {
        applyPlayerHit({
          rollId: id + ":extra", targetId: target.id, targetName: target.name, amount: extra.total,
          from: row.id, characterName: row.name, weapon: atk.name, label: (atk.name || "Attack") + " " + (atk.extraDamage.damageType || "extra"), type: "damage"
        });
      }
    }
  }
  if (hit && atk.grapple && atk.grapple.escapeDc != null && atk.grapple.escapeDc !== "") {
    const grip = "Grappled (escape DC " + atk.grapple.escapeDc + ")";
    detail += " · " + grip;
    await rememberCondition(row, target, "Grappled", null);
  }
  if (!(opts && opts.skipRider) && hit && atk.rider && (conditionName(atk.rider) || atk.rider.save)) {
    const save = await askAttackSave(row, atk, target, atk.rider, "");
    if (save.failed) await rememberCondition(row, target, conditionName(atk.rider), atk.rider.rounds);
    detail = save.line;
  }
  if (!(opts && opts.skipRider) && hit && atk.saveDamage) {
    detail = await applySaveDamage(row, atk, target, "");
  }
  if (!(opts && opts.skipRider) && hit && atk.saveEffect) {
    detail = await applySaveEffect(row, atk, target, "");
  }
  await saveRemoteTable();
  renderFight();
  DM.toast(detail + (atk.capacity != null && !atk.rider ? " · " + atk.loaded + " left" : ""));
}
function sheetDiceMode() {
  const el = document.querySelector("#enemySheet [data-dice-mode]");
  return (el && el.value) || "";
}
async function cardCheck(i, mod, label) {
  const row = fight.order[i];
  if (!row) return;
  const bonus = Number(mod) || 0;
  const mode = sheetDiceMode();
  const out = DM.rollChecked ? DM.rollChecked("1d20", mode, bonus) : { total: d20() + bonus, detail: "", nat1: false };
  const nat = out.rolls && out.rolls.length ? out.rolls[0] : null;
  const detail = (row.name || "Enemy") + " " + (label || "check") + " " + (out.detail || (nat + signed(bonus))) + " = " + out.total;
  await publishCardRoll(row, detail, out.total, { formula: "1d20" + signed(bonus), nat: nat });
  DM.toast(detail);
}
async function cardDice(i) {
  const row = fight.order[i];
  if (!row) return;
  const root = document.getElementById("enemySheet") || document;
  const formula = (root.querySelector("[data-dice-formula='" + i + "']") || {}).value || "1d20";
  const mode = (root.querySelector("[data-dice-mode='" + i + "']") || {}).value || "";
  const extra = Number((root.querySelector("[data-dice-mod='" + i + "']") || {}).value) || 0;
  const out = DM.rollChecked ? DM.rollChecked(String(formula).trim() || "1d20", mode, extra) : DM.parseDice(formula);
  const detail = (row.name || "Enemy") + " " + formula + " = " + out.total + (out.detail ? " (" + out.detail + ")" : "");
  await publishCardRoll(row, detail, out.total, { formula: formula, nat: out.nat1 ? 1 : null });
  DM.toast(detail);
}
function spellRider(name) {
  const key = String(name || "").toLowerCase();
  if (key.indexOf("vicious mockery") >= 0) return "disadvantage on the next attack";
  return "";
}
function askSaveSpell(row, name, known) {
  const players = playerTargets();
  const casting = (row.card && row.card.spellcasting) || {};
  const ability = (known && known.save) || "WIS";
  const dc = casting.dc == null ? "" : casting.dc;
  const dice = (known && known.dice) || "";
  const type = (known && known.type) || "";
  const rider = spellRider(name);
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const options = players.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
    dlg.innerHTML = `<form method="dialog"><h2>${esc(name)} save</h2><p class="fine">${esc(row.name || "Enemy")} casts a save spell.</p><label>Target <select id="saveTarget">${options || "<option value=''>No players</option>"}</select></label><label>Save <input id="saveAbility" value="${esc(ability)}" aria-label="Save ability"></label><label>DC <input id="saveDc" type="number" value="${esc(dc)}"></label><label>Damage on a fail <input id="saveDice" value="${esc(dice)}${type ? " " + esc(type) : ""}"></label><label>Rider on a fail <input id="saveRider" value="${esc(rider)}"></label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Ask for the save</button></div></form>`;
    const finish = (ok) => {
      const payload = ok ? {
        targetId: (dlg.querySelector("#saveTarget") || {}).value || "",
        ability: (dlg.querySelector("#saveAbility") || {}).value || ability,
        dc: (dlg.querySelector("#saveDc") || {}).value,
        damage: (dlg.querySelector("#saveDice") || {}).value || "",
        rider: (dlg.querySelector("#saveRider") || {}).value || ""
      } : null;
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      resolve(payload);
    };
    dlg.querySelector("[value=no]").addEventListener("click", () => finish(false));
    dlg.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); finish(true); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    document.body.appendChild(dlg);
    openDialog(dlg);
  });
}
async function cardCast(i, n) {
  const row = fight.order[i];
  if (partyAttackBlocked(row)) return;
  const card = row && row.card;
  const list = card && card.spellcasting && card.spellcasting.spells;
  const spell = list && list[n];
  if (!spell) return;
  const raw = typeof spell === "string" ? spell : (spell.name || "Spell");
  const level = typeof spell === "object" && spell.level ? Number(spell.level) : 0;
  if (level && card.slots && card.slots[level] && card.slots[level].left <= 0) {
    DM.toast("No level-" + level + " slot left");
    return;
  }
  const Cast = window.SSDNSSpellCast;
  const known = Cast && Cast.lookup ? Cast.lookup(raw) : null;
  const name = (known && known.name) || raw;
  const kind = known && known.kind;
  if (level && card.slots && card.slots[level]) card.slots[level].left -= 1;
  if (kind === "heal") {
    const dice = (known && known.dice) || "1d8";
    const out = DM.parseDice(dice);
    const detail = row.name + " casts " + name + " and heals " + out.total;
    await publishCardRoll(row, detail, out.total, { formula: dice, heal: true });
    DM.toast(detail);
    renderFight();
    return;
  }
  if (kind === "save") {
    const asked = await askSaveSpell(row, name, known);
    if (!asked || !asked.targetId) return;
    const target = playerTargets().filter((p) => p.id === asked.targetId)[0] || { id: asked.targetId, name: asked.targetId };
    const save = await requestPlayerSave({
      targetId: target.id,
      targetName: target.name,
      ability: asked.ability,
      dc: asked.dc,
      label: name,
      rider: asked.rider,
      damage: asked.damage,
      fromName: row.name || ""
    });
    let detail = row.name + " casts " + name + ". " + save.line;
    if (save.failed && asked.damage) {
      const expr = String(asked.damage).match(/\d*d\d+(?:\s*[+-]\s*\d+)?/i);
      const rolled = expr ? DM.parseDice(expr[0]) : null;
      if (rolled) {
        detail += " · " + rolled.total + " " + String(asked.damage).replace(expr[0], "").trim();
        applyPlayerHit({
          rollId: DM.uid("spell"),
          targetId: target.id,
          targetName: target.name,
          amount: rolled.total,
          from: row.id,
          characterName: row.name,
          label: name,
          weapon: name,
          type: "damage"
        });
      }
    }
    if (save.failed && asked.rider) {
      const cond = /prone/i.test(asked.rider) ? "Prone" : (/disadvantage/i.test(asked.rider) ? "Disadvantage" : asked.rider);
      row.pendingRider = { condition: cond, targetId: target.id, targetName: target.name };
      try {
        await writeSubjectConditions(target.id, "player", [{ name: cond }], target.name || "", 1, {}, []);
      } catch (err) {}
    }
    await publishCardRoll(row, detail, save.total, { nat: save.nat, save: true });
    DM.toast(detail);
    renderFight();
    return;
  }
  const picked = await askEnemyStrike(row, { name: name, toHit: card.spellcasting.attack, damage: (known && known.dice) || "" });
  if (!picked || !picked.targetId) return;
  const target = playerTargets().filter((p) => p.id === picked.targetId)[0] || { id: picked.targetId, name: picked.targetId, ac: null };
  const bonus = Number(card.spellcasting.attack) || 0;
  const nat = d20();
  const total = nat + bonus;
  const ac = Number(target.ac);
  const hit = nat !== 1 && (!isFinite(ac) || total >= ac);
  let dmg = null;
  if (hit && known && known.dice) dmg = DM.parseDice(known.dice);
  const detail = row.name + " casts " + name + " at " + (target.name || "someone") + ": " + nat + signed(bonus) + " = " + total + (isFinite(ac) ? " vs AC " + ac : "") + (hit ? " → HIT" : " → MISS") + (dmg ? " · " + dmg.total : "");
  await publishCardRoll(row, detail, total, { attack: true, nat: nat, damage: dmg ? dmg.total : null, targetId: target.id });
  DM.toast(detail);
  renderFight();
}
async function attackRow(i) {
  const row = fight.order[i];
  if (!row) return;
  const formula = ($("#dmgFormula") && $("#dmgFormula").value || "1d20").trim();
  const attackFormula = /d20/i.test(formula) ? formula : "1d20";
  const out = DM.parseDice(attackFormula);
  const ac = Number(row.ac);
  const hit = isFinite(ac) ? out.total >= ac : null;
  let dmg = null;
  if (hit) dmg = DM.parseDice(($("#dmgFormula") && /d20/i.test($("#dmgFormula").value) ? "1d8" : ($("#dmgFormula").value || "1d8")));
  const text = row.name + " AC " + (isFinite(ac) ? ac : "?") + " · " + attackFormula + " = " + out.total + (hit == null ? "" : hit ? " HIT" : " MISS") + (hit && dmg ? " · " + dmg.total + " damage" : "");
  await DM.pushRoll({
    who: "DM", uid: DM.state.uid, label: "Attack this " + (row.kind === "player" ? "player" : "enemy") + " · " + row.name, formula: attackFormula,
    result: out.total, detail: text, private: false, attack: true
  });
  if (hit && dmg && (fight.damageMode || "auto") !== "approve" && row.kind !== "player") {
    applyEnemyHp(row, -dmg.total);
    await saveRemoteTable();
    renderFight();
  }
  DM.toast(text);
}
function rollAllEnemies() {
  const cur = fight.order[fight.turn];
  const curId = cur && cur.id;
  fight.recruit = true;
  ensurePlayers();
  fight.order.forEach((row) => {
    if (row.kind === "player") {
      const posted = postedInit(row.playerId || row.id);
      if (posted != null) { row.init = posted; row.initFrom = "sheet"; return; }
      const snap = DM.state.players[row.playerId || row.id] && DM.state.players[row.playerId || row.id].snapshot;
      row.init = d20() + dexModOf(snap);
      row.initFrom = "rolled";
      return;
    }
    const bonus = Number(row.initBonus) || 0;
    row.init = d20() + bonus;
  });
  sortInitiative();
  if (curId) {
    const idx = fight.order.findIndex((r) => r.id === curId);
    if (idx >= 0) fight.turn = idx;
  }
  saveRemoteTable();
  renderFight();
  announce("Rolled initiative", "initiative");
}
function askEndCombat() {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg ssdns-ask";
    dlg.innerHTML = `<form method="dialog"><p>End combat and clear the turn order?</p><label class="toggle">Clear combat conditions <input type="checkbox" id="clearCombatConds" checked></label><p class="fine">Exhaustion stays.</p><div class="dlg-foot"><button class="btn" value="no" type="button">No</button><button class="btn btn-primary" value="yes" type="submit">Yes</button></div></form>`;
    const finish = (ok) => {
      const box = dlg.querySelector("#clearCombatConds");
      const clear = !!(box && box.checked);
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      resolve(ok ? { ok: true, clear: clear } : null);
    };
    dlg.querySelector("[value=no]").addEventListener("click", () => finish(false));
    dlg.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); finish(true); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    document.body.appendChild(dlg);
    openDialog(dlg);
  });
}
async function clearCombatConditions() {
  const remove = [];
  Object.keys(fight.condMap || {}).forEach((id) => {
    const row = fight.condMap[id];
    if (!row || /^exhaustion$/i.test(row.name || "")) return;
    remove.push(id);
    delete fight.condMap[id];
  });
  Object.keys(DM.state.players || {}).forEach((pid) => {
    const snap = DM.state.players[pid] && DM.state.players[pid].snapshot;
    if (!snap || !window.SSDNSConditions) return;
    snap.activeConditions = (snap.activeConditions || []).filter((c) => c && /^exhaustion$/i.test(c.name || ""));
    snap.conditions = window.SSDNSConditions.listText(snap.activeConditions);
  });
  if (!DM.state.demo && DM.state.db && DM.state._fb) {
    for (const id of remove) {
      try { await DM.state._fb.remove(DM.roomRef("conditions/" + id)); } catch (e) {}
    }
  }
  saveLocalTable();
}
async function endCombat() {
  const choice = await askEndCombat();
  if (!choice || !choice.ok) { DM.toast("Declined ending combat."); return; }
  fight.recruit = false;
  if (choice.clear) await clearCombatConditions();
  fight.order = [];
  fight.started = false;
  fight.turnCmd = null;
  fight.round = 1;
  fight.turn = 0;
  const sent = $("#turnSent");
  if (sent) sent.textContent = "";
  await saveRemoteTable();
  await DM.pushLedger({ who: "DM", playerId: "all", type: "combat", what: "Combat ended", oldVal: null, newVal: "ended", flag: false });
  renderFight();
  DM.renderPlayers();
  DM.toast("Combat ended");
}
function findCombatant(meta) {
  const id = meta && (meta.targetId || meta.id);
  const name = String((meta && (meta.targetName || meta.name)) || "").trim().toLowerCase();
  let row = null;
  if (id) row = fight.order.find((r) => r && (r.id === id || r.playerId === id));
  if (!row && name) row = fight.order.find((r) => String(r.name || "").trim().toLowerCase() === name);
  return row || null;
}
function claimApply(rollId) {
  if (!rollId) return true;
  if (fight.appliedHits[rollId]) return false;
  if (window.SSDNSApplied && !window.SSDNSApplied.claim(DM.state.roomCode, rollId)) return false;
  fight.appliedHits[rollId] = 1;
  return true;
}
function playerSnapshot(pid) {
  const p = pid && DM.state.players && DM.state.players[pid];
  return (p && p.snapshot) || null;
}
function blankLabel(name) {
  const s = String(name || "").trim();
  return !s || /^target$/i.test(s) || /^no target$/i.test(s);
}
function applyTargets() {
  const rows = [];
  (fight.order || []).forEach((r) => {
    if (!r) return;
    rows.push({ id: r.kind === "player" ? (r.playerId || r.id) : r.id, name: r.name || "Someone", kind: r.kind || "" });
  });
  Object.keys(DM.state.players || {}).forEach((pid) => {
    if (rows.some((r) => r.id === pid)) return;
    const s = DM.state.players[pid].snapshot || {};
    rows.push({ id: pid, name: s.name || "Someone", kind: "player" });
  });
  return rows.filter((r) => r.id);
}
function askApplyTarget(preferId) {
  const rows = applyTargets();
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const options = rows.map((p) => `<option value="${esc(p.id)}"${p.id === preferId ? " selected" : ""}>${esc(p.name)}</option>`).join("");
    dlg.innerHTML = `<form method="dialog"><h2>Choose a recipient</h2><label>Who <select id="applyWho">${options || "<option value=''>No one in the fight</option>"}</select></label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Apply</button></div></form>`;
    const finish = (ok) => {
      const sel = dlg.querySelector("#applyWho");
      const id = ok && sel ? sel.value : "";
      const hit = rows.filter((r) => r.id === id)[0];
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      resolve(hit || null);
    };
    dlg.querySelector("[value=no]").addEventListener("click", () => finish(false));
    dlg.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); finish(true); });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); finish(false); });
    document.body.appendChild(dlg);
    openDialog(dlg);
  });
}
function applyPlayerHit(meta) {
  if (!meta) return;
  const amt = Number(meta.amount != null ? meta.amount : meta.damage) || 0;
  const rollId = meta.rollId || "";
  if (amt <= 0) return;
  const heal = meta.kind === "heal" || meta.type === "heal" || meta.heal;
  const who = meta.characterName || "Someone";
  const row = findCombatant(meta);
  const snap = playerSnapshot((row && row.kind === "player" && (row.playerId || row.id)) || meta.targetId);
  if (!row && !snap) {
    DM.toast("Pick a target");
    return;
  }
  const name = (row && row.name) || (blankLabel(meta.targetName) ? "" : meta.targetName) || (snap && snap.name) || who;
  if (blankLabel(name)) {
    DM.toast("Pick a target");
    return;
  }
  if (rollId && !claimApply(rollId)) return;
  const weapon = (window.SSDNSApplied && window.SSDNSApplied.weaponName(meta.weapon || meta.label)) || "";
  let before = row ? knownNumber(row.hp) : knownNumber(snap && snap.hpCurrent);
  if (before == null) before = 0;
  let after = before;
  if (row) {
    const delta = heal ? amt : -amt;
    const next = applyEnemyHp(row, delta);
    if (next == null) {
      if (rollId) {
        delete fight.appliedHits[rollId];
        if (window.SSDNSApplied) window.SSDNSApplied.release(DM.state.roomCode, rollId);
      }
      return;
    }
    after = knownNumber(row.hp);
    if (after == null) after = before;
    if (row.kind === "player" && snap) snap.hpCurrent = after;
  } else if (snap) {
    const max = Number(snap.hpMax) || 0;
    after = heal ? (max ? Math.min(max, before + amt) : before + amt) : Math.max(0, before - amt);
    snap.hpCurrent = after;
  } else {
    DM.toast("Pick a target");
    return;
  }
  const applied = Math.abs(before - after);
  const dice = meta.dice || "";
  const line = heal
    ? (window.SSDNSApplied ? window.SSDNSApplied.healLine(who, name, amt, dice, before, after) : (who + " heals " + name + " " + amt + " · HP " + before + "→" + after))
    : ((window.SSDNSApplied ? window.SSDNSApplied.hitLine(who, name, weapon, amt) : (who + " hits " + name + " for " + amt)) + " · " + applied + " applied");
  const pid = (row && row.kind === "player" && (row.playerId || row.id)) || (snap && meta.targetId) || "";
  if (pid && (row ? row.kind === "player" : !!snap)) {
    DM.pushCommand({
      type: "hp", to: pid, quiet: true,
      payload: {
        delta: heal ? amt : -amt,
        kind: heal ? "heal" : "damage",
        amount: amt,
        text: line,
        grantId: rollId || DM.uid("hit")
      },
      from: DM.state.uid
    });
  }
  if (!heal && meta.from && row && row.kind === "enemy") row.lastAttackerId = meta.from;
  if (after <= 0) noteUnconscious(row || { kind: snap ? "player" : "enemy", playerId: meta.targetId, id: (row && row.id) || meta.targetId, name: name, hp: 0 });
  saveRemoteTable();
  renderFight();
  DM.renderPlayers();
  if (rollId && DM.markRollApplied) DM.markRollApplied(rollId, true);
  const roll = (DM.state.rolls || []).find((r) => r && r.id === rollId);
  if (roll && heal) roll.detail = line;
  const targetId = (row && row.id) || meta.targetId || pid || "";
  DM.pushLedger({
    who: who, playerId: meta.from || pid || "all", type: heal ? "heal" : "damage",
    what: line, oldVal: before, newVal: after, flag: false, characterName: who, rollId: rollId || "",
    targetId: targetId, subjectId: pid || "", heal: !!heal, amount: amt, prevHp: before
  });
  rememberUndo({
    type: "hit", rollId: rollId, label: line, playerId: pid, heal: !!heal, amount: amt,
    restoreHp: targetId ? { id: targetId, hp: before } : null,
    command: pid ? {
      type: "hp", to: pid,
      payload: { delta: heal ? -amt : amt, kind: heal ? "damage" : "heal", amount: amt, text: "Undo " + line, grantId: (rollId || "hit") + ":undo" },
      from: DM.state.uid
    } : null
  });
  DM.toast(line);
}
function verdictFeed(id, text, who) {
  if (DM.state.demo || !DM.state.db || !DM.state._fb) return;
  const speaker = who || "DM";
  const row = {
    id: id, ts: new Date().toISOString(), from: DM.state.uid || "dm",
    fromName: speaker, text: text, kind: "roll", who: speaker
  };
  DM.state._fb.set(DM.roomRef("tableFeed/" + id), row).catch((err) => {
    if (DM.writeFailed) DM.writeFailed(err, "Couldn't post the attack");
  });
}
function resolveIncomingAttack(req, reqId) {
  const rollId = req.rollId || reqId || "";
  const settled = rollId && window.SSDNSApplied && (window.SSDNSApplied.settled
    ? window.SSDNSApplied.settled(DM.state.roomCode, rollId)
    : window.SSDNSApplied.has(DM.state.roomCode, rollId));
  if (rollId && (fight.appliedHits[rollId] || settled)) {
    markRequestResolved(reqId);
    return;
  }
  const row = findCombatant(req);
  const ac = knownNumber(row && row.ac);
  const shown = window.SSDNSApplied && window.SSDNSApplied.publicEnemy
    ? window.SSDNSApplied.publicEnemy(row || { name: req.targetName, kind: "enemy" }, "", [])
    : { name: (row && row.name) || req.targetName || "enemy" };
  const shotList = req.shots && typeof req.shots === "object" ? req.shots : null;
  const shotCount = shotList ? (Array.isArray(shotList) ? shotList.length : Object.keys(shotList).length) : 0;
  let verdict;
  let line;
  let applyAmount = 0;
  if (shotCount && window.SSDNSApplied && window.SSDNSApplied.attackShots) {
    const packed = window.SSDNSApplied.attackShots({
      shots: shotList,
      ac: ac,
      sfx: req.sfx,
      who: req.characterName || "Someone",
      target: shown.name || req.targetName || "enemy"
    });
    verdict = packed;
    line = packed.line;
    applyAmount = Number(packed.amount) || 0;
  } else {
    verdict = window.SSDNSApplied && window.SSDNSApplied.attackVerdict
      ? window.SSDNSApplied.attackVerdict({ nat: req.nat, total: req.hitTotal, ac: ac, sfx: req.sfx })
      : { miss: Number(req.nat) === 1 || (ac != null && Number(req.hitTotal) < ac), crit: Number(req.nat) === 20, verdict: "HIT", sfx: req.sfx || "attack" };
    line = window.SSDNSApplied && window.SSDNSApplied.attackPublicLine
      ? window.SSDNSApplied.attackPublicLine({
        who: req.characterName || "Someone",
        target: shown.name || req.targetName || "enemy",
        nat: req.nat,
        total: req.hitTotal,
        dice: req.dice || "",
        amount: verdict.miss ? "" : req.amount
      }, verdict)
      : ((req.characterName || "Someone") + " → " + (shown.name || "enemy") + " → " + verdict.verdict);
    applyAmount = verdict.miss ? 0 : (Number(req.amount) || 0);
  }
  const feedId = rollId || reqId || DM.uid("hit");
  verdictFeed(feedId, line, req.characterName || shown.name || "");
  if (req.from) {
    DM.pushCommand({
      type: "attack_result",
      to: req.from,
      quiet: true,
      payload: {
        rollId: rollId,
        text: line,
        verdict: verdict.verdict,
        nat: req.nat,
        crit: !!verdict.crit,
        sfx: verdict.sfx || "",
        grantId: "atk:" + (rollId || reqId)
      },
      from: DM.state.uid
    });
  }
  DM.toast(line + (ac == null ? "" : " · AC " + ac));
  if (!verdict.miss && applyAmount > 0) {
    applyPlayerHit({
      rollId: rollId,
      targetId: req.targetId,
      targetName: (row && row.name) || req.targetName,
      amount: applyAmount,
      from: req.from,
      characterName: req.characterName || "Someone",
      label: req.label,
      weapon: req.weapon || req.label,
      dice: req.dice || "",
      type: "attack",
      heal: false
    });
  } else if (rollId) {
    fight.appliedHits[rollId] = 1;
    if (window.SSDNSApplied && window.SSDNSApplied.claim) window.SSDNSApplied.claim(DM.state.roomCode, rollId);
    if (DM.markRollApplied) DM.markRollApplied(rollId, true);
  }
  markRequestResolved(reqId);
}
function markRequestResolved(reqId) {
  if (!reqId || DM.state.demo || !DM.state.db || !DM.state._fb) return;
  DM.state._fb.update(DM.roomRef("encounter/requests/" + reqId), { resolved: true }).catch(() => {});
}
function applyRequest(req, reqId) {
  if (!req || req.resolved) return;
  const attack = req.type === "attack" || (req.hitTotal != null && req.hitTotal !== "" && req.type !== "heal");
  if (attack) {
    resolveIncomingAttack(req, reqId);
    return;
  }
  const rollId = req.rollId || "";
  if (rollId && fight.appliedHits[rollId]) return;
  const row = findCombatant(req);
  const who = req.characterName || "Someone";
  const name = (row && row.name) || (blankLabel(req.targetName) ? "" : req.targetName) || who;
  const amt = Number(req.amount) || 0;
  const heal = req.type === "heal" || req.kind === "heal";
  const line = heal
    ? (window.SSDNSApplied ? window.SSDNSApplied.healLine(who, name, amt, req.dice || "") : (who + " heals " + name + " " + amt))
    : (window.SSDNSApplied ? window.SSDNSApplied.hitLine(who, name, req.weapon || req.label, amt) : (who + " hits " + name + " for " + amt));
  if (!row && !req.targetId && blankLabel(req.targetName)) {
    DM.toast("Pick a target");
    return;
  }
  if (fight.damageMode === "approve") {
    DM.toast(line + " · waiting for you to apply");
    return;
  }
  applyPlayerHit({
    rollId: rollId,
    targetId: req.targetId,
    targetName: req.targetName || name,
    amount: amt,
    from: req.from,
    characterName: who,
    label: req.label,
    weapon: req.weapon || req.label,
    dice: req.dice || "",
    type: req.type || "",
    heal: heal
  });
}
function watchSecrets() {
  if (fight._sec || DM.state.demo || !DM.state.db || !DM.state.roomCode) return;
  fight._sec = true;
  const fb = DM.state._fb;
  const r = DM.roomRef("encounter/dm");
  const cb = fb.onValue(r, (snap) => {
    const val = snap.val();
    if (val && typeof val === "object") fight.secrets = Object.assign({}, fight.secrets || {}, val);
    restoreSecrets();
    let statusChanged = false;
    (fight.order || []).forEach((row) => {
      const before = row && row.status;
      if (window.SSDNSApplied && window.SSDNSApplied.refreshCombatantStatus) window.SSDNSApplied.refreshCombatantStatus(row);
      if (row && row.status !== before) statusChanged = true;
    });
    renderFight();
    if (statusChanged) saveRemoteTable();
    if (typeof renderEnemySheet === "function" && enemySheetId) renderEnemySheet();
  });
  if (typeof cb === "function") DM.state.unsubs.push(cb);
}
function watchRequests() {
  if (fight._req || DM.state.demo || !DM.state.db || !DM.state.roomCode) return;
  fight._req = true;
  fight.seenReq = fight.seenReq || {};
  const fb = DM.state._fb;
  const r = DM.roomRef("encounter/requests");
  const cb = fb.onValue(r, (snap) => {
    const val = snap.val() || {};
    Object.keys(val).forEach((id) => {
      if (fight.seenReq[id]) return;
      fight.seenReq[id] = 1;
      const req = val[id];
      const attack = req && (req.type === "attack" || (req.hitTotal != null && req.hitTotal !== "" && req.type !== "heal"));
      const fresh = req && req.ts && (Date.now() - Date.parse(req.ts) < 120000);
      if (req && req.resolved) return;
      if (!fight.reqPrimed && !fresh && !attack) return;
      applyRequest(req, id);
    });
    fight.reqPrimed = true;
  });
  if (typeof cb === "function") DM.state.unsubs.push(cb);
}
function paintReveal() {
  saveRemoteTable();
  renderFight();
  if (enemySheetId) renderEnemySheet();
}
function wireClicks() {
  document.addEventListener("change", (e) => {
    const box = e.target;
    const key = box && box.getAttribute && box.getAttribute("data-reveal");
    if (key) {
      const row = fight.order[parseInt(box.getAttribute("data-reveal-i"), 10)];
      if (!row || row.kind !== "enemy") return;
      row.reveal = revealOf(row);
      row.reveal[key] = !!box.checked;
      paintReveal();
      return;
    }
    if (!box || !box.getAttribute || !box.hasAttribute("data-card-public")) return;
    const row = fight.order[parseInt(box.getAttribute("data-card-public"), 10)];
    if (row && row.card) row.card.public = !!box.checked;
    else if (String(enemySheetId || "").indexOf("preview:") === 0) {
      const prev = previewRows[String(enemySheetId).slice(8)];
      if (prev && prev.card) prev.card.public = !!box.checked;
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-side-toggle],[data-init-up],[data-init-down-move],[data-init-del],[data-init-hit],[data-init-strike],[data-row-atk],[data-init-cond],[data-your-turn],[data-init-dmg],[data-init-heal],[data-init-down],[data-init-fled],[data-add-beast],[data-stock-del],[data-pack-send],[data-pack-del],[data-quick-roll],[data-cat-add],[data-apply-hit],[data-undo-hit],[data-resend-turn],[data-resend-feed],[data-card-atk],[data-card-check],[data-card-dice],[data-card-cast],[data-clear-jam],[data-apply-rider],[data-feat-use],[data-feat-recharge],[data-slot-spend],[data-hide-all]");
    if (!t) return;
    if (t.hasAttribute("data-side-toggle")) {
      const row = fight.order[parseInt(t.getAttribute("data-side-toggle"), 10)];
      if (!row || row.kind !== "enemy") return;
      row.side = isFriendly(row) ? "enemy" : "friendly";
      saveRemoteTable();
      renderFight();
      DM.toast((row.name || "Combatant") + (row.side === "friendly" ? " is friendly" : " is an enemy"));
      return;
    }
    if (t.hasAttribute("data-hide-all")) {
      const row = fight.order[parseInt(t.getAttribute("data-hide-all"), 10)];
      if (!row || row.kind !== "enemy") return;
      row.reveal = { name: false, ac: false, hp: false, block: false };
      paintReveal();
      return;
    }
    if (t.hasAttribute("data-undo-hit")) {
      undoByRoll(t.getAttribute("data-undo-hit"));
      return;
    }
    if (t.hasAttribute("data-apply-hit")) {
      const id = t.getAttribute("data-apply-hit");
      const roll = (DM.state.rolls || []).find((r) => r && r.id === id);
      if (!roll) return;
      const heal = !!(roll.heal || /\bheals\b/i.test(String(roll.detail || "")));
      const meta = {
        rollId: roll.id,
        targetId: roll.targetId,
        targetName: roll.targetName,
        amount: roll.damage,
        from: roll.playerId || roll.uid,
        characterName: roll.characterName || roll.who,
        label: roll.label,
        weapon: roll.weapon || roll.label,
        dice: roll.dice || "",
        type: heal ? "heal" : "",
        heal: heal
      };
      const named = !blankLabel(roll.targetName);
      if (!roll.targetId && !named) {
        const caster = roll.playerId || roll.uid || "";
        askApplyTarget(heal ? caster : "").then((picked) => {
          if (!picked) return;
          applyPlayerHit(Object.assign({}, meta, { targetId: picked.id, targetName: picked.name }));
        });
        return;
      }
      applyPlayerHit(meta);
      return;
    }
    if (t.hasAttribute("data-resend-turn")) {
      const i = parseInt(t.getAttribute("data-resend-turn"), 10);
      sendYourTurn(fight.order[i], true);
      return;
    }
    if (t.hasAttribute("data-init-hit")) { attackThis(parseInt(t.getAttribute("data-init-hit"), 10)); return; }
    if (t.hasAttribute("data-init-strike")) { enemyStrike(parseInt(t.getAttribute("data-init-strike"), 10)); return; }
    if (t.hasAttribute("data-row-atk")) { cardStrike(parseInt(t.getAttribute("data-row-atk"), 10), parseInt(t.getAttribute("data-atk-n"), 10)); return; }
    if (t.hasAttribute("data-card-atk")) { cardStrike(parseInt(t.getAttribute("data-card-atk"), 10), parseInt(t.getAttribute("data-atk-n"), 10)); return; }
    if (t.hasAttribute("data-card-check")) { cardCheck(parseInt(t.getAttribute("data-card-check"), 10), t.getAttribute("data-check-mod"), t.getAttribute("data-check-label")); return; }
    if (t.hasAttribute("data-card-dice")) { cardDice(parseInt(t.getAttribute("data-card-dice"), 10)); return; }
    if (t.hasAttribute("data-card-cast")) { cardCast(parseInt(t.getAttribute("data-card-cast"), 10), parseInt(t.getAttribute("data-spell-n"), 10)); return; }
    if (t.hasAttribute("data-clear-jam")) {
      const row = fight.order[parseInt(t.getAttribute("data-clear-jam"), 10)];
      const atk = row && row.card && row.card.attacks[parseInt(t.getAttribute("data-atk-n"), 10)];
      if (atk) {
        atk.jammed = false;
        const line = (row.name || "Enemy") + " cleared the jam on " + (atk.name || "the gun");
        saveRemoteTable();
        DM.pushLedger({ who: "DM", playerId: row.id || "all", type: "jam", what: line, oldVal: "jammed", newVal: "clear", flag: false, characterName: row.name || "" });
        renderFight();
        DM.toast(line);
      }
      return;
    }
    if (t.hasAttribute("data-apply-rider")) {
      const idx = parseInt(t.getAttribute("data-apply-rider"), 10);
      const row = fight.order[idx];
      const pending = row && row.pendingRider;
      if (pending && pending.targetId && pending.condition) {
        const names = [{ name: pending.condition, rounds: pending.rounds }];
        writeSubjectConditions(pending.targetId, "player", names, pending.targetName || "", 1, {}, []).then(() => {
          DM.toast("Applied " + names[0].name);
        });
        row.pendingRider = null;
        renderFight();
      }
      return;
    }
    if (t.hasAttribute("data-feat-use") || t.hasAttribute("data-feat-recharge")) {
      const idx = parseInt(t.getAttribute("data-feat-use") || t.getAttribute("data-feat-recharge"), 10);
      const row = fight.order[idx];
      const kind = t.getAttribute("data-feat-kind");
      const n = parseInt(t.getAttribute("data-feat-n"), 10);
      const list = row && row.card && row.card[kind];
      const feat = list && list[n];
      if (!feat) return;
      if (t.hasAttribute("data-feat-recharge")) {
        const die = 1 + Math.floor(Math.random() * 6);
        const band = String(feat.recharge || "");
        const nums = band.split(/[^0-9]+/).map((x) => parseInt(x, 10)).filter((x) => isFinite(x));
        const ok = nums.indexOf(die) >= 0 || (nums.length === 2 && die >= nums[0] && die <= nums[1]);
        if (ok) feat._left = feat.uses == null ? 1 : feat.uses;
        DM.toast((feat.name || "Feature") + " recharge " + die + (ok ? " restored" : " not yet"));
        renderFight();
        return;
      }
      const left = feat._left == null ? Number(feat.uses) : Number(feat._left);
      if (left <= 0) { DM.toast((feat.name || "Feature") + " has no uses left"); return; }
      feat._left = left - 1;
      renderFight();
      DM.toast("Used " + (feat.name || "feature"));
      return;
    }
    if (t.hasAttribute("data-slot-spend")) {
      const row = fight.order[parseInt(t.getAttribute("data-slot-spend"), 10)];
      const lv = t.getAttribute("data-slot-lv");
      const slot = row && row.card && row.card.slots && row.card.slots[lv];
      if (!slot) return;
      slot.left = slot.left > 0 ? slot.left - 1 : slot.max;
      renderFight();
      return;
    }
    if (t.hasAttribute("data-init-cond")) { askRowConditions(parseInt(t.getAttribute("data-init-cond"), 10)); return; }
    if (t.hasAttribute("data-your-turn")) { sendYourTurn(fight.order[parseInt(t.getAttribute("data-your-turn"), 10)], false); return; }
    if (t.hasAttribute("data-resend-feed")) {
      const pid = t.getAttribute("data-resend-feed");
      const row = fight.order.find((r) => r && (r.playerId === pid || r.id === pid));
      if (row) sendYourTurn(row, true);
      return;
    }
    if (t.hasAttribute("data-init-dmg")) { rowHp(parseInt(t.getAttribute("data-init-dmg"), 10), -1); return; }
    if (t.hasAttribute("data-init-heal")) { rowHp(parseInt(t.getAttribute("data-init-heal"), 10), 1); return; }
    if (t.hasAttribute("data-init-down")) { markDown(parseInt(t.getAttribute("data-init-down"), 10)); return; }
    if (t.hasAttribute("data-init-fled")) { markFled(parseInt(t.getAttribute("data-init-fled"), 10)); return; }
    if (t.hasAttribute("data-init-up") || t.hasAttribute("data-init-down-move") || t.hasAttribute("data-init-del")) {
      const i = parseInt(t.getAttribute("data-init-up") || t.getAttribute("data-init-down-move") || t.getAttribute("data-init-del"), 10);
      if (t.hasAttribute("data-init-del")) {
        const gone = fight.order[i];
        const name = (gone && gone.name) || "this combatant";
        if (!window.confirm("Remove " + name + " from the turn order?")) return;
        fight.removed = fight.removed || {};
        if (gone && gone.id) fight.removed[gone.id] = true;
        if (gone && gone.playerId) fight.removed[gone.playerId] = true;
        fight.order.splice(i, 1);
        announce("Removed " + name, "combat", gone);
      }
      else if (t.hasAttribute("data-init-up") && i > 0) {
        const row = fight.order.splice(i, 1)[0];
        fight.order.splice(i - 1, 0, row);
        if (fight.turn === i) fight.turn = i - 1;
      } else if (t.hasAttribute("data-init-down-move") && i < fight.order.length - 1) {
        const row = fight.order.splice(i, 1)[0];
        fight.order.splice(i + 1, 0, row);
        if (fight.turn === i) fight.turn = i + 1;
      }
      saveRemoteTable();
      renderFight();
    }
    if (t.hasAttribute("data-add-beast")) {
      const b = fight.bestiary.filter((x) => x.id === t.getAttribute("data-add-beast"))[0];
      if (b) addBeastToFight(b);
    }
    if (t.hasAttribute("data-cat-add")) {
      const raw = t.getAttribute("data-cat-price");
      const price = raw === "" || raw == null ? "" : parseInt(raw, 10);
      const storeId = ($("#adhocStore") && $("#adhocStore").value) || "general";
      addPreviewLine(storeId, t.getAttribute("data-cat-name"), price);
      DM.toast("Added " + (t.getAttribute("data-cat-name") || "item") + " to the preview");
    }
    if (t.hasAttribute("data-stock-del")) {
      fight.stock.splice(parseInt(t.getAttribute("data-stock-del"), 10), 1);
      saveRemoteTable();
      renderStorePanel();
    }
    if (t.hasAttribute("data-pack-del")) {
      fight.packs.splice(parseInt(t.getAttribute("data-pack-del"), 10), 1);
      saveRemoteTable();
      renderPacks();
    }
    if (t.hasAttribute("data-pack-send")) sendPack(parseInt(t.getAttribute("data-pack-send"), 10));
    if (t.hasAttribute("data-quick-roll")) {
      $("#rollLabel").value = t.getAttribute("data-quick-label") || "Roll";
      $("#rollFormula").value = t.getAttribute("data-quick-roll");
      if (DM.doDmRoll) DM.doDmRoll();
    }
  });
}

const enemyAddGate = { id: "", busy: false };
function claimEnemyAdd(beastId) {
  if (!beastId) return false;
  if (enemyAddGate.busy && enemyAddGate.id === beastId) return false;
  enemyAddGate.busy = true;
  enemyAddGate.id = beastId;
  return true;
}
function finishEnemyAdd() {
  enemyAddGate.busy = false;
}
function addBeastToFight(b) {
  if (!b) { DM.toast("Pick an enemy"); return null; }
  if (!claimEnemyAdd(b.id)) return null;
  try {
    fight.recruit = true;
    const row = addCombatant(beastRow(b));
    if (row) announce("Added " + row.name + " to the turn order", "combat", row);
    return row;
  } finally {
    setTimeout(finishEnemyAdd, 0);
  }
}
function enemyPickerQuery() {
  const el = $("#enemyQ");
  return el && el.value ? String(el.value).trim().toLowerCase() : "";
}
function enemyPickerList(list, query, parkedOn) {
  const q = String(query || "").trim().toLowerCase();
  return (list || []).filter((b) => {
    if (!b || b.template) return false;
    if (b.parked && !parkedOn) return false;
    if (!q) return true;
    return [b.name, b.bookName, b.aka, b.id].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}
function enemySelectHtml(list) {
  const buckets = {};
  (list || []).forEach((b) => {
    const key = BEAST_GROUPS.some((pair) => pair[0] === b.group) ? b.group : "other";
    (buckets[key] || (buckets[key] = [])).push(b);
  });
  const order = BEAST_GROUPS.map((pair) => pair[0]).concat(buckets.other ? ["other"] : []);
  return order.filter((key) => buckets[key] && buckets[key].length).map((key) => {
    const label = (BEAST_GROUPS.filter((pair) => pair[0] === key)[0] || ["", "Other"])[1];
    const opts = buckets[key].map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");
    return `<optgroup label="${esc(label)}">${opts}</optgroup>`;
  }).join("");
}
function fillAdds() {
  playerSelect("#dmgTarget", false);
  playerSelect("#packTarget", true);
  playerSelect("#initPlayer", false);
  const beast = $("#initEnemy");
  if (beast) {
    const keep = beast.value;
    const list = enemyPickerList(fight.bestiary, enemyPickerQuery(), showParkedBeasts());
    beast.innerHTML = list.length ? enemySelectHtml(list) : `<option value="">No match</option>`;
    if ([...beast.options].some((o) => o.value === keep)) beast.value = keep;
  }
}

function shortcuts(e) {
  if (e.isComposing || e.keyCode === 229) return;
  const field = (DM.isFormField && (DM.isFormField(e.target) || DM.isFormField(document.activeElement)))
    || (e.target && e.target.isContentEditable)
    || (document.activeElement && document.activeElement.isContentEditable && document.activeElement !== document.body);
  if (field) return;
  const k = String(e.key || "").toLowerCase();
  const chord = e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey;
  if (chord && k === "r") {
    e.preventDefault();
    const tab = $("#tab-rewards");
    if (tab) tab.click();
    const es = $("#rewEs");
    if (es) { es.focus(); try { es.select(); } catch (err) {} }
    DM.toast("Reward form ready — confirm before it sends");
    return;
  }
  if (chord && k === "s") {
    e.preventDefault();
    const key = "attack";
    if (window.SSDNSAudio) window.SSDNSAudio.play(key);
    DM.toast("♪ " + key);
    DM.pushLedger({ who: "DM", playerId: "all", type: "sfx", what: "♪ " + key, oldVal: null, newVal: key, flag: false });
    DM.pushCommand({ type: "sfx", to: "all", payload: { event: key }, from: DM.state.uid });
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (k === "n") { if (e.repeat) return; e.preventDefault(); nextTurn(); }
  else if (k === "m") {
    e.preventDefault();
    if (fight.playing) stopTrack(); else playTrack();
  }
}

const seenInit = {};
let rollsReady = false;
const seenDamage = {};
function noteDamageRolls(rows) {
  if (fight.damageMode === "approve") return;
  (rows || []).forEach((r) => {
    if (!r || !r.id || seenDamage[r.id] || r.applied || fight.appliedHits[r.id] || r.selfApplied || r.awaitDm) return;
    if (window.SSDNSApplied && (window.SSDNSApplied.settled ? window.SSDNSApplied.settled(DM.state.roomCode, r.id) : window.SSDNSApplied.has(DM.state.roomCode, r.id))) { seenDamage[r.id] = 1; return; }
    const amt = Number(r.damage) || 0;
    if (amt <= 0) return;
    if (r.nat === 1 || /→\s*MISS/.test(String(r.detail || ""))) return;
    if (!r.targetId && blankLabel(r.targetName)) { seenDamage[r.id] = 1; return; }
    const age = window.SSDNSClock ? window.SSDNSClock.stampAge(r.ts) : (Date.now() - Date.parse(r.ts));
    const fresh = isFinite(age) && age > -15000 && age < 120000;
    if (!rollsReady && (!isFinite(age) || age > 20000)) { seenDamage[r.id] = 1; return; }
    if (!fresh || !findCombatant({ targetId: r.targetId, targetName: r.targetName })) return;
    seenDamage[r.id] = 1;
    applyPlayerHit({
      rollId: r.id,
      targetId: r.targetId,
      targetName: r.targetName,
      amount: amt,
      from: r.playerId || r.uid,
      characterName: r.characterName || r.who,
      label: r.weapon || r.label,
      weapon: r.weapon || "",
      dice: r.dice || "",
      type: r.heal ? "heal" : (r.type || ""),
      heal: !!r.heal
    });
    if (fight.appliedHits[r.id]) seenDamage[r.id] = 1;
  });
}
function noteInitiativeRolls(rows) {
  noteDamageRolls(rows);
  let changed = false;
  (rows || []).forEach((r) => {
    if (!r || !r.id || seenInit[r.id]) return;
    const fresh = r.ts && (Date.now() - Date.parse(r.ts) < 20000);
    if (!rollsReady && !fresh) { seenInit[r.id] = 1; return; }
    seenInit[r.id] = 1;
    if (fight.recruit === false) return;
    if (!/initiative/i.test(String(r.label || ""))) return;
    const total = Number(r.result);
    if (!isFinite(total)) return;
    const pid = r.playerId || r.uid || "";
    const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
    addCombatant({
      id: pid || DM.uid("pc"),
      playerId: pid,
      name: (snap && snap.name) || r.who || "Player",
      kind: "player",
      ac: snap && snap.ac,
      hp: snap && snap.hpCurrent,
      init: total
    });
    changed = true;
  });
  rollsReady = true;
  if (!changed) return;
  sortInitiative();
  saveRemoteTable();
  renderFight();
}
function syncPlayerVitals() {
  let changed = false;
  (fight.order || []).forEach((row) => {
    if (!row || row.kind !== "player") return;
    const pid = row.playerId || row.id;
    const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
    if (!snap) return;
    const hpEl = document.querySelector('[data-hp-val][data-row-id="' + (window.CSS && CSS.escape ? CSS.escape(row.id || "") : (row.id || "")) + '"]');
    if (row.hpLockUntil && Date.now() < row.hpLockUntil) return;
    if (snap.hpCurrent != null && snap.hpCurrent !== "" && document.activeElement !== hpEl && Number(row.hp) !== Number(snap.hpCurrent)) {
      row.hp = snap.hpCurrent;
      changed = true;
    }
    if (snap.ac != null && snap.ac !== "" && Number(row.ac) !== Number(snap.ac)) {
      row.ac = snap.ac;
      changed = true;
    }
    const dex = dexFromSnapshot(snap);
    if (row.dex !== dex) { row.dex = dex; changed = true; }
    if (snap.hpMax != null && row.maxHp !== snap.hpMax) row.maxHp = snap.hpMax;
  });
  ensurePlayers();
  paintTurnAck();
  if (!changed) return;
  saveRemoteTable();
  renderFight();
}
function paintTurnAck() {
  const sent = $("#turnSent");
  const cmd = fight.turnCmd;
  if (!sent || !cmd) return;
  const p = DM.state.players && DM.state.players[cmd.playerId];
  const ack = p && p.turnAck;
  if (ack && ack.id === cmd.id && ack.seen && sent.textContent.indexOf("seen") < 0) sent.textContent += " · seen";
}
function notePresence(id, on) {
  if (!id) return;
  if (on) {
    if (fight.departed) delete fight.departed[id];
    return;
  }
  fight.departed[id] = true;
  const before = (fight.order || []).length;
  fight.order = (fight.order || []).filter((row) => !(row && row.kind === "player" && (row.playerId === id || row.id === id)));
  if (fight.turn >= fight.order.length) fight.turn = 0;
  if (fight.order.length !== before) {
    saveRemoteTable();
    renderFight();
  }
}
function clearFight() {
  fight.order = [];
  fight.departed = {};
  fight.started = false;
  fight.round = 1;
  fight.turn = 0;
  fight.turnCmd = null;
  saveLocalTable();
  saveRemoteTable();
  renderFight();
}
function acForRoll(r) {
  const row = findCombatant({ targetId: r && r.targetId, targetName: r && r.targetName });
  return row ? knownNumber(row.ac) : null;
}
function onPlayerInit(map) {
  DM.state.playerInit = map || {};
  if (fight.recruit === false) return;
  let changed = false;
  (fight.order || []).forEach((row) => {
    if (!row || row.kind !== "player") return;
    const n = postedInit(row.playerId || row.id);
    if (n == null || Number(row.init) === n) return;
    row.init = n;
    changed = true;
  });
  ensurePlayers();
  if (!changed) return;
  sortInitiative();
  saveRemoteTable();
  renderFight();
}
async function changeInspiration(delta) {
  const names = { playerName: "DM", characterName: "" };
  if (DM.state.demo || !DM.state.db) {
    const cur = Number(fight.inspiration) || 0;
    if (delta < 0 && cur < 1) { DM.toast("No Inspiration to spend"); return; }
    const next = Math.max(0, cur + delta);
    fight.inspiration = next;
    const text = delta > 0
      ? "DM granted 1 Inspiration (" + next + " in the pool)"
      : "DM spent 1 Inspiration (" + next + " left)";
    DM.state.ledger = DM.state.ledger || [];
    DM.state.ledger.unshift({
      id: DM.uid("led"), ts: new Date().toISOString(), type: "inspiration",
      who: "DM", playerName: "DM", characterName: "", what: text, flag: false
    });
    if (DM.renderLedger) DM.renderLedger();
    renderInspiration();
    saveLocalTable();
    DM.toast(text);
    return;
  }
  const fb = DM.state._fb;
  const id = "ins_" + Date.now().toString(36);
  try {
    const result = await fb.runTransaction(DM.roomRef("table/inspiration"), (cur) => {
      let count = 0;
      if (cur && typeof cur === "object") count = Number(cur.count) || 0;
      else if (typeof cur === "number") count = cur;
      if (delta < 0 && count < 1) return;
      const next = Math.max(0, count + delta);
      const text = delta > 0
        ? "DM granted 1 Inspiration (" + next + " in the pool)"
        : "DM spent 1 Inspiration (" + next + " left)";
      return {
        count: next,
        last: {
          id: id, ts: new Date().toISOString(), delta: delta, by: DM.state.uid,
          who: "DM", playerName: "DM", characterName: "", text: text
        }
      };
    });
    if (!result || result.committed === false) { DM.toast("No Inspiration to spend"); return; }
    const snap = result.snapshot && result.snapshot.val();
    const text = (snap && snap.last && snap.last.text) || "Inspiration";
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: "all", type: "inspiration",
      what: text, oldVal: null, newVal: snap && snap.count, flag: false
    }, names));
  } catch (e) {
    console.warn(e);
    DM.toast("Inspiration update failed");
  }
}
function removeCombatant(id) {
  if (!id) return;
  fight.removed = fight.removed || {};
  fight.removed[id] = true;
  fight.order = (fight.order || []).filter((row) => !(row && (row.id === id || row.playerId === id)));
  Object.keys(fight.condMap || {}).forEach((cid) => {
    const row = fight.condMap[cid];
    if (row && row.subjectId === id) delete fight.condMap[cid];
  });
  saveRemoteTable();
  renderFight();
}
function enterRoom() {
  const code = DM.state.roomCode || "";
  fight._room = code;
  fight._req = false;
  fight._sec = false;
  fight._stripped = false;
  fight.order = [];
  fight.round = 1;
  fight.turn = 0;
  fight.started = false;
  fight.removed = {};
  fight.departed = {};
  fight.undo = null;
  fight.undos = {};
  fight.condMap = {};
  fight.turnCmd = null;
  fight.updatedAt = "";
  fight.recruit = true;
  if (code) {
    loadLocalTable();
    loadUndos();
    fight.order = (fight.order || []).filter((row) => !isRemoved(row));
  }
  renderFight();
}
async function bootV2() {
  if (DM.state.roomCode) enterRoom();
  try {
    const res = await fetch("assets/data/bestiary.json");
    if (res.ok) fight.bestiary = await res.json();
    const saved = JSON.parse(localStorage.getItem(BESTIARY_KEY) || "null");
    fight.bestiary = mergeBestiary(fight.bestiary, Array.isArray(saved) ? saved : []);
  } catch (e) {}
  try {
    const res = await fetch("assets/data/store-items.json");
    if (res.ok) storeItems = await res.json();
    else DM.toast("Store list failed to load");
  } catch (e) {
    DM.toast("Store list failed to load");
  }
  loadStorePreview();
  try {
    const res = await fetch("../assets/music/tracks.json");
    if (res.ok) {
      const data = await res.json();
      fight.tracks = data.tracks || [];
    }
  } catch (e) {}
  renderTracks();
  renderBestiary();
  const beastQ = $("#beastQ");
  if (beastQ) beastQ.addEventListener("input", renderBestiary);
  const enemyQ = $("#enemyQ");
  if (enemyQ) {
    enemyQ.addEventListener("input", fillAdds);
    enemyQ.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  }
  const beastParked = $("#beastParked");
  if (beastParked) beastParked.addEventListener("change", () => { renderBestiary(); fillAdds(); });
  renderFight();
  renderStock();
  renderPacks();
  fillAdds();
  const undo = $("#btnUndo");
  if (undo) undo.disabled = true;
  $("#btnAddPlayer") && $("#btnAddPlayer").addEventListener("click", () => {
    const id = $("#initPlayer").value;
    const s = (DM.state.players[id] && DM.state.players[id].snapshot) || {};
    if (!id) { DM.toast("Pick a player"); return; }
    fight.recruit = true;
    const row = addCombatant({ id: id, playerId: id, name: s.name || s.player || id, kind: "player", ac: s.ac, hp: s.hpCurrent, dex: dexFromSnapshot(s), init: s.initiative != null && s.initiative !== "" ? s.initiative : s.initBonus, maxHp: s.hpMax });
    announce("Added " + (row.name || "a player") + " to the turn order", "combat", row);
  });
  const addEnemyBtn = $("#btnAddEnemy");
  if (addEnemyBtn) {
    let pressedOnButton = false;
    addEnemyBtn.addEventListener("pointerdown", (e) => { pressedOnButton = e.button === 0; });
    document.addEventListener("pointerup", (e) => {
      if (!addEnemyBtn.contains(e.target)) pressedOnButton = false;
    });
    addEnemyBtn.addEventListener("click", (e) => {
      // A mouse click has to start on this button. A select menu that closes onto it does not add.
      if (e.detail > 0 && !pressedOnButton) return;
      pressedOnButton = false;
      const b = fight.bestiary.filter((x) => x.id === $("#initEnemy").value)[0];
      addBeastToFight(b);
    });
  }
  $("#btnNextTurn") && $("#btnNextTurn").addEventListener("click", nextTurn);
  $("#btnPrevTurn") && $("#btnPrevTurn").addEventListener("click", () => {
    if (!fight.order.length) return;
    fight.turn -= 1;
    if (fight.turn < 0) { fight.turn = fight.order.length - 1; fight.round = Math.max(1, fight.round - 1); }
    saveRemoteTable();
    renderFight();
  });
  $("#btnDmg") && $("#btnDmg").addEventListener("click", () => pushHp("damage"));
  $("#btnHeal") && $("#btnHeal").addEventListener("click", () => pushHp("heal"));
  $("#btnShortRest") && $("#btnShortRest").addEventListener("click", () => rest("short"));
  $("#btnLongRest") && $("#btnLongRest").addEventListener("click", () => rest("long"));
  $("#btnUndo") && $("#btnUndo").addEventListener("click", undoLast);
  $("#btnAddStock") && $("#btnAddStock").addEventListener("click", addStock);
  document.addEventListener("click", onEnemySheetClick);
  $("#btnCloseEnemy") && $("#btnCloseEnemy").addEventListener("click", closeEnemySheet);
  $("#enemySheet") && $("#enemySheet").addEventListener("click", (e) => {
    if (e.target && e.target.id === "enemySheet") closeEnemySheet();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#enemySheet") && !$("#enemySheet").hidden) closeEnemySheet();
  });
  $("#btnOpenAllStores") && $("#btnOpenAllStores").addEventListener("click", openAllStores);
  $("#btnCloseAllStores") && $("#btnCloseAllStores").addEventListener("click", closeAllStores);
  document.querySelectorAll('input[name="townSize"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (!el.checked) return;
      storeTown = el.value;
      const next = window.SSDNSStore && window.SSDNSStore.townStores ? window.SSDNSStore.townStores(storeTown) : null;
      if (next) Object.keys(storeOn).forEach((id) => { storeOn[id] = !!next[id]; });
      saveStorePreview();
      renderStorePanel();
    });
  });
  document.querySelectorAll("[data-store-pick]").forEach((el) => {
    el.addEventListener("change", () => {
      storeOn[el.getAttribute("data-store-pick")] = el.checked;
      saveStorePreview();
      renderStorePanel();
    });
  });
  const cards = $("#storeCards");
  if (cards) cards.addEventListener("click", onStoreCardClick);
  document.addEventListener("change", onStoreDraftChange);
  $("#catalogQ") && $("#catalogQ").addEventListener("input", renderCatalog);
  $("#catalogCat") && $("#catalogCat").addEventListener("change", renderCatalog);
  $("#btnInspGrant") && $("#btnInspGrant").addEventListener("click", () => changeInspiration(1));
  $("#btnInspSpend") && $("#btnInspSpend").addEventListener("click", () => changeInspiration(-1));
  $("#btnInspGrantTable") && $("#btnInspGrantTable").addEventListener("click", () => changeInspiration(1));
  $("#btnInspSpendTable") && $("#btnInspSpendTable").addEventListener("click", () => changeInspiration(-1));
  renderCatalog();
  $("#btnSavePack") && $("#btnSavePack").addEventListener("click", savePack);
  $("#btnMusicPlay") && $("#btnMusicPlay").addEventListener("click", playTrack);
  $("#btnMusicStop") && $("#btnMusicStop").addEventListener("click", stopTrack);
  wireClicks();
  document.addEventListener("keydown", shortcuts);
  window.DMCCEnhance = {
    decorateDetail: decorateDetail,
    afterRender: fillAdds,
    fillAdds: fillAdds,
    onTable: function (v) {
      if (window.SSDNSApplied) fight.appliedHits = Object.assign(window.SSDNSApplied.load(DM.state.roomCode) || {}, fight.appliedHits || {});
      applyRemoteTable(v);
      const order = v && v.initiative && v.initiative.order;
      const leaked = Array.isArray(order) && order.some((row) => row && row.kind !== "player" && (
        row.ac != null || row.hp != null || row.maxHp != null || row.saves || row.attacks || row.traits || row.tactics || row.dcs || row.atkBonus != null || row.damage
      ));
      if (leaked && !fight._stripped) {
        fight._stripped = true;
        saveRemoteTable();
      }
      watchRequests();
      watchSecrets();
      watchConditions();
    },
    onRolls: function (rows) {
      (rows || []).forEach(noteSaveRoll);
      noteInitiativeRolls(rows);
    },
    currentTurn: function () {
      return fight.started ? (fight.order[fight.turn] || null) : null;
    },
    syncPlayers: syncPlayerVitals,
    onPlayerInit: onPlayerInit,
    notePresence: notePresence,
    clearFight: clearFight,
    acFor: acForRoll,
    enterRoom: enterRoom,
    renderFight: renderFight,
    removeCombatant: removeCombatant,
    openAllStores: openAllStores
  };
  const rollAll = $("#btnRollAll");
  if (rollAll) rollAll.addEventListener("click", rollAllEnemies);
  const endBtn = $("#btnEndCombat");
  if (endBtn) endBtn.addEventListener("click", endCombat);
  const addCustom = $("#btnAddCustom");
  if (addCustom) addCustom.addEventListener("click", () => {
    const name = ($("#customName") && $("#customName").value || "").trim();
    if (!name) { DM.toast("Name the enemy"); return; }
    fight.recruit = true;
    const qtyRaw = parseInt($("#customQty") && $("#customQty").value, 10);
    const qty = Math.max(1, Math.min(20, isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1));
    const initRaw = $("#customInit") && String($("#customInit").value).trim();
    const dexField = $("#customDex");
    const dexBlank = !dexField || String(dexField.value).trim() === "";
    const dexParsed = parseInt(dexField && dexField.value, 10);
    const dex = dexBlank ? "" : (isFinite(dexParsed) ? dexParsed : 0);
    const initBonus = initRaw === "" ? (dexBlank ? "" : dexModFrom(dex)) : (parseInt(initRaw, 10) || 0);
    const atkRaw = $("#customAtkBonus") && String($("#customAtkBonus").value).trim();
    const atkBonus = atkRaw === "" ? "" : (Number(atkRaw));
    const damageDice = ($("#customDmg") && $("#customDmg").value) || "";
    const formNum = (el) => {
      if (!el || String(el.value).trim() === "") return "";
      const n = parseInt(el.value, 10);
      return isFinite(n) ? n : "";
    };
    const rows = [];
    for (let n = 0; n < qty; n++) {
      rows.push(addCombatant({
        id: DM.uid("en"),
        name: name,
        kind: "enemy",
        forceNumber: qty > 1,
        ac: formNum($("#customAc")),
        hp: formNum($("#customHp")),
        maxHp: formNum($("#customHp")),
        initBonus: initBonus,
        dex: dex,
        atkBonus: atkBonus,
        damage: damageDice,
        attacks: ($("#customAtk") && $("#customAtk").value) || ""
      }));
    }
    ["customHp", "customAc", "customInit", "customDex", "customAtk", "customAtkBonus", "customDmg"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    if ($("#customQty")) $("#customQty").value = "1";
    rows.forEach((row) => announce("Added " + row.name + " to the turn order", "combat", row));
  });
  const mode = $("#damageMode");
  if (mode) mode.addEventListener("change", () => {
    fight.damageMode = mode.value || "auto";
    saveRemoteTable();
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.hasAttribute("data-preview-hp") || t.hasAttribute("data-preview-max")) {
      const id = t.getAttribute("data-preview-hp") || t.getAttribute("data-preview-max");
      const preview = previewRows[id];
      if (!preview) return;
      const next = t.value === "" ? "" : parseInt(t.value, 10);
      if (t.hasAttribute("data-preview-hp")) preview.hp = next;
      else preview.maxHp = next;
      renderEnemySheet();
      return;
    }
    const initI = t.getAttribute("data-init-val");
    const hpI = t.getAttribute("data-hp-val");
    const acI = t.getAttribute("data-ac-val");
    const atkI = t.getAttribute("data-atk-val");
    const dmgI = t.getAttribute("data-dmg-val");
    if (!t.isConnected) return;
    const row = fightRowFromField(t);
    if (!row) return;
    const maxI = t.getAttribute("data-max-val");
    const n = t.value === "" ? "" : parseInt(t.value, 10);
    if (initI != null) row.init = n;
    if (maxI != null) row.maxHp = n;
    if (hpI != null) {
      const before = row.hp;
      const oldMax = row.maxHp;
      row.hp = n;
      if (window.SSDNSApplied && window.SSDNSApplied.followMaxHp) {
        const max = window.SSDNSApplied.followMaxHp(n, row.maxHp);
        if (max != null) row.maxHp = max;
      }
      if (String(before) !== String(n)) {
        const line = window.SSDNSApplied && window.SSDNSApplied.hpEditLine
          ? window.SSDNSApplied.hpEditLine(row.name, before, n)
          : (row.name || "Enemy") + " HP " + before + " → " + n + " (DM edit)";
        const editId = DM.uid("hp");
        DM.pushLedger({ id: editId, who: "DM", playerId: row.playerId || "all", type: "hp", what: line, oldVal: before, newVal: n, flag: false });
        const undo = {
          type: "hp",
          label: line,
          playerId: row.playerId || row.id,
          restoreHp: { id: row.id, hp: before, maxHp: oldMax }
        };
        if (row.kind === "player" && row.playerId) {
          row.hpLockUntil = Date.now() + 8000;
          const payload = { absolute: n, maxHp: row.maxHp, text: line, grantId: editId };
          DM.pushCommand({ type: "hp", to: row.playerId, payload: payload, from: DM.state.uid });
          undo.command = { type: "hp", to: row.playerId, payload: { absolute: before, maxHp: oldMax, text: "Undo " + line, grantId: DM.uid("hp") }, from: DM.state.uid };
        }
        rememberUndo(undo);
      }
      if (n === 0) {
        noteUnconscious(row);
        DM.renderPlayers();
      }
    }
    if (acI != null) row.ac = n;
    if (atkI != null) row.atkBonus = t.value === "" ? "" : Number(t.value);
    if (dmgI != null) row.damage = t.value;
    if (initI != null) sortInitiative();
    saveRemoteTable();
    renderFight();
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target;
    if (!t || !t.getAttribute || !t.hasAttribute("data-beast-name")) return;
    const b = fight.bestiary.filter((x) => x.id === t.getAttribute("data-beast-name"))[0];
    if (!b) return;
    b.name = t.value.trim() || b.name;
    try { localStorage.setItem(BESTIARY_KEY, JSON.stringify(fight.bestiary.filter((b) => b && !b.template && !b.example))); } catch (err) {}
    fillAdds();
  });
  const origReward = document.getElementById("btnPushReward");
  if (origReward && !origReward.dataset.undoHook) {
    origReward.dataset.undoHook = "1";
    origReward.addEventListener("click", () => {
      const target = $("#rewTarget") && $("#rewTarget").value;
      const type = $("#rewType") && $("#rewType").value;
      if (type === "es") {
        const delta = parseInt($("#rewEs").value, 10) || 0;
        if (!delta) return;
        const pid = target === "all" ? Object.keys(DM.state.players)[0] : target;
        rememberUndo({
          type: "es", playerId: target, label: (delta >= 0 ? "+" : "") + delta + " ES",
          command: { type: "reward_es", to: target, payload: { delta: -delta, reason: "Undo DM reward" }, from: DM.state.uid },
          demo: function () {
            const ids = target === "all" ? Object.keys(DM.state.players) : [target];
            ids.forEach((id) => {
              const snap = DM.state.players[id] && DM.state.players[id].snapshot;
              if (snap) snap.es = Math.max(0, (snap.es || 0) - delta);
            });
            DM.renderPlayers();
          }
        });
      } else if (type === "item") {
        const text = ($("#rewText").value || "").trim();
        if (!text) return;
        rememberUndo({
          type: "item", playerId: target, label: "item " + text,
          command: { type: "undo_item", to: target, payload: { text: text }, from: DM.state.uid }
        });
      }
    }, true);
  }
}

function wireLookupNow() {
  const btn = document.getElementById("btnLookup");
  const q = document.getElementById("lookupQ");
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = "1";
  const run = () => lookup(q ? q.value : "");
  btn.addEventListener("click", run);
  if (q) {
    q.addEventListener("input", run);
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); run(); } });
  }
}
wireLookupNow();
bootV2();

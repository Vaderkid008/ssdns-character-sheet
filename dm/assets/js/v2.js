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
      stock: fight.stock, packs: fight.packs, condMap: fight.condMap || {}, removed: fight.removed || {}, undos: fight.undos || {}, damageMode: fight.damageMode === "approve" ? "approve" : "auto", updatedAt: fight.updatedAt
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
function enemyStatus(row) {
  if (!row || row.kind === "player") return row && row.status ? row.status : "";
  const hp = knownNumber(row.hp);
  const max = knownNumber(row.maxHp);
  if (hp == null) return "";
  if (hp <= 0) return "Down";
  if (max == null || max <= 0) return "Hurt";
  if (hp >= max) return "Unhurt";
  if (hp * 2 <= max) return "Bloodied";
  return "Hurt";
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
async function saveRemoteTable() {
  syncDamageMode();
  fight.updatedAt = new Date().toISOString();
  saveLocalTable();
  if (DM.state.demo || !DM.state.db) return;
  try {
    const order = (fight.order || []).map((row) => ({
      id: row.id || "",
      name: row.name || "",
      kind: row.kind || "",
      init: row.init == null ? "" : row.init,
      playerId: row.playerId || "",
      status: enemyStatus(row),
      hp: knownNumber(row.hp) == null ? "" : knownNumber(row.hp),
      maxHp: knownNumber(row.maxHp) == null ? "" : knownNumber(row.maxHp),
      ac: knownNumber(row.ac) == null ? "" : knownNumber(row.ac),
      dex: knownNumber(row.dex) == null ? "" : knownNumber(row.dex),
      initBonus: knownNumber(row.initBonus) == null ? "" : knownNumber(row.initBonus),
      atkBonus: row.atkBonus == null || row.atkBonus === "" ? "" : row.atkBonus,
      damage: row.damage || "",
      lastAttackerId: row.lastAttackerId || "",
      initFrom: row.initFrom || ""
    }));
    const hp = {};
    const pub = {};
    (fight.order || []).forEach((row) => {
      if (!row.id) return;
      hp[row.id] = { hp: row.hp == null ? "" : row.hp, maxHp: row.maxHp == null ? "" : row.maxHp, ac: row.ac == null ? "" : row.ac };
      pub[row.id] = {
        name: row.name || "",
        status: enemyStatus(row),
        kind: row.kind || "",
        playerId: row.playerId || "",
        ac: knownNumber(row.ac) == null ? "" : knownNumber(row.ac)
      };
    });
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
    if (row) row.hp = u.restoreHp.hp;
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
    const use = f.uses != null
      ? `<button type="button" class="btn sm" data-feat-use="${i}" data-feat-kind="${esc(kind)}" data-feat-n="${n}">Use ${esc(f.name || "feature")} (${left})</button>`
      : "";
    const recharge = f.recharge
      ? `<button type="button" class="btn sm" data-feat-recharge="${i}" data-feat-kind="${esc(kind)}" data-feat-n="${n}">Recharge ${esc(f.recharge)}</button>`
      : "";
    return use || recharge ? `<span data-feat-key="${esc(key)}">${use}${recharge}</span>` : "";
  }).join(" ");
}
function featureBlock(title, list, i, kind) {
  const text = window.SSDNSApplied && window.SSDNSApplied.traitText ? window.SSDNSApplied.traitText(list) : "";
  if (!text && !(list && list.length)) return "";
  return `<p class="fine"><b>${esc(title)}.</b> ${esc(text)}</p><p class="toolbar">${featureButtons(list, i, kind)}</p>`;
}
function enemyCardHtml(row, i) {
  const card = row.card;
  if (!card) return "";
  const scores = card.scores || {};
  const scoreLine = ["STR", "DEX", "CON", "INT", "WIS", "CHA"].map((key) => {
    const score = scores[key];
    const mod = cardMod(score);
    return `<button type="button" class="btn sm" data-card-check="${i}" data-check-mod="${mod}" data-check-label="${esc(key)}">${key} ${score == null ? "—" : esc(score)} (${signed(mod)})</button>`;
  }).join(" ");
  const saveLine = Object.keys(card.saves || {}).map((name) => {
    const bonus = card.saves[name];
    const n = bonus && typeof bonus === "object" ? bonus.bonus : bonus;
    return `<button type="button" class="btn sm" data-card-check="${i}" data-check-mod="${Number(n) || 0}" data-check-label="${esc(name)} save">${esc(name)} save ${signed(n)}</button>`;
  }).join(" ");
  const skillLine = Object.keys(card.skills || {}).map((name) => {
    const bonus = card.skills[name];
    const n = bonus && typeof bonus === "object" ? bonus.bonus : bonus;
    return `<button type="button" class="btn sm" data-card-check="${i}" data-check-mod="${Number(n) || 0}" data-check-label="${esc(name)}">${esc(name)} ${signed(n)}</button>`;
  }).join(" ");
  const attacks = (card.attacks || []).map((atk, n) => {
    const gun = atk.capacity == null ? "" : ` · ${atk.loaded == null ? "?" : atk.loaded}/${atk.capacity}`;
    const mf = atk.misfire == null ? "" : ` · MF ${atk.misfire}`;
    const jam = atk.jammed ? ` <button type="button" class="btn sm" data-clear-jam="${i}" data-atk-n="${n}">Clear jam</button>` : "";
    return `<p><button type="button" class="btn sm" data-card-atk="${i}" data-atk-n="${n}">${esc(atk.name)} ${signed(atk.toHit)}</button> <span class="fine">${esc(atk.damage || "")}${atk.damageType ? " " + esc(atk.damageType) : ""}${atk.range ? " · " + esc(atk.range) : ""}${gun}${mf}${atk.jammed ? " · jammed" : ""}</span>${jam}</p>`;
  }).join("");
  const rider = row.pendingRider
    ? `<p><button type="button" class="btn sm" data-apply-rider="${i}">Apply ${esc(row.pendingRider.condition || "condition")}${row.pendingRider.targetName ? " to " + esc(row.pendingRider.targetName) : ""}</button></p>`
    : "";
  const casting = card.spellcasting;
  let spells = "";
  if (casting) {
    const list = Array.isArray(casting.spells) ? casting.spells : [];
    const pips = Object.keys(card.slots || {}).map((lv) => {
      const slot = card.slots[lv];
      const dots = [];
      for (let p = 0; p < slot.max; p++) {
        dots.push(`<button type="button" class="btn sm" data-slot-spend="${i}" data-slot-lv="${esc(lv)}" aria-label="Level ${esc(lv)} slot">${p < slot.left ? "●" : "○"}</button>`);
      }
      return `<span class="fine">L${esc(lv)} ${dots.join("")}</span>`;
    }).join(" ");
    const buttons = list.map((spell, n) => {
      const name = typeof spell === "string" ? spell : (spell && spell.name) || "Spell";
      const blurb = window.SSDNSSpellCast && window.SSDNSSpellCast.blurb ? window.SSDNSSpellCast.blurb(name) : "";
      return `<p><button type="button" class="btn sm" data-card-cast="${i}" data-spell-n="${n}">Cast ${esc(name)}</button> <span class="fine">${esc(blurb)}</span></p>`;
    }).join("");
    spells = `<p class="fine"><b>Spellcasting.</b> DC ${esc(casting.dc == null ? "—" : casting.dc)} · attack ${signed(casting.attack)} ${pips}</p>${buttons}`;
  }
  return `<div class="enemy-card">
    <p class="fine">AC ${esc(row.ac)} · HP ${esc(row.hp)}${row.maxHp != null ? "/" + esc(row.maxHp) : ""} · Speed ${esc(card.speed || "—")}${card.cr ? " · CR " + esc(card.cr) : ""}${card.senses ? " · " + esc(card.senses) : ""}</p>
    <p class="toolbar">${scoreLine}</p>
    ${saveLine ? `<p class="toolbar">${saveLine}</p>` : ""}
    ${skillLine ? `<p class="toolbar">${skillLine}</p>` : ""}
    ${card.description ? `<p class="fine">${esc(card.description)}</p>` : ""}
    ${attacks}
    ${rider}
    ${featureBlock("Traits", card.traits, i, "traits")}
    ${featureBlock("Actions", card.actions, i, "actions")}
    ${featureBlock("Reactions", card.reactions, i, "reactions")}
    ${featureBlock("Legendary", card.legendary, i, "legendary")}
    ${spells}
    <div class="toolbar">
      <input type="text" data-dice-formula="${i}" value="1d20" aria-label="Dice for ${esc(row.name || "enemy")}" placeholder="2d6+3">
      <select data-dice-mode="${i}" aria-label="Advantage for ${esc(row.name || "enemy")}">
        <option value="">Normal</option>
        <option value="adv">Advantage</option>
        <option value="dis">Disadvantage</option>
      </select>
      <input type="number" data-dice-mod="${i}" value="0" aria-label="Modifier for ${esc(row.name || "enemy")}">
      <label class="toggle"><input type="checkbox" data-card-public="${i}"${card.public ? " checked" : ""}> Public</label>
      <button type="button" class="btn sm" data-card-dice="${i}">Roll</button>
    </div>
  </div>`;
}
function turnRowHtml(row, i) {
  const flash = fight.flash === i ? " flash" : "";
  const status = row.kind === "enemy" ? enemyStatus(row) : "";
  const current = fight.started && i === fight.turn ? " current" : "";
  const detail = row.kind === "player" ? initSourceLabel(row) : tieLabel(row);
  const downed = knownNumber(row.hp) === 0;
  const downBadge = downed ? `<span class="badge danger">Unconscious · Down</span>` : "";
  const enemyEdit = row.kind === "enemy"
    ? `<label class="fine">Atk <input type="number" data-atk-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.atkBonus == null ? "" : esc(row.atkBonus)}" aria-label="Attack bonus for ${esc(row.name || "enemy")}"></label>
      <label class="fine">Dmg <input class="cond-rounds" data-dmg-val="${i}" data-row-id="${esc(row.id || "")}" value="${esc(row.damage || "")}" placeholder="1d6+2" aria-label="Damage dice for ${esc(row.name || "enemy")}"></label>`
    : "";
  return `<div class="init-row${current}${flash}">
      <input class="init-score" type="number" data-init-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.init == null ? "" : esc(row.init)}" aria-label="Initiative for ${esc(row.name || "combatant")}">
      <span class="init-who" title="${esc(row.name || "Someone")}"><b>${esc(row.name || "Someone")}</b>
        <span class="fine">${esc(row.kind || "combatant")}${row.tie ? " · tie" : ""}${status ? " · " + esc(status) : ""}${detail ? " · " + esc(detail) : ""}${esc(turnAckLabel(row))}</span>
        ${downBadge}
        ${conditionChips(row)}
      </span>
      <label class="fine">AC <input type="number" data-ac-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.ac == null ? "" : esc(row.ac)}" aria-label="AC for ${esc(row.name || "combatant")}"></label>
      <label class="fine">HP <input type="number" data-hp-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.hp == null ? "" : esc(row.hp)}" aria-label="HP for ${esc(row.name || "combatant")}"></label>
      ${enemyEdit}
      <span class="init-actions">
        ${row.kind === "enemy" ? `<button type="button" class="btn sm" data-init-strike="${i}">Attack player</button>` : `<button type="button" class="btn sm" data-your-turn="${i}">Your turn</button>`}
        <button type="button" class="btn sm" data-init-cond="${i}">Conditions</button>
        <button type="button" class="btn sm" data-init-hit="${i}">${row.kind === "enemy" ? "Attack this enemy" : "Attack this player"}</button>
        <button type="button" class="btn sm" data-init-dmg="${i}">Damage</button>
        <button type="button" class="btn sm" data-init-heal="${i}">Heal</button>
        <button type="button" class="btn sm" data-init-down="${i}">Down</button>
        ${current && row.kind === "player" ? `<button type="button" class="btn sm" data-resend-turn="${i}">Resend your-turn</button>` : ""}
        <button type="button" class="btn sm" data-init-up="${i}" aria-label="Move up">↑</button>
        <button type="button" class="btn sm" data-init-down-move="${i}" aria-label="Move down">↓</button>
        <button type="button" class="btn sm" data-init-del="${i}" aria-label="Remove">✕</button>
      </span>
      ${row.kind === "enemy" && row.card ? enemyCardHtml(row, i) : ""}
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
    if (label) label.textContent = "Round " + fight.round;
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
      strip.innerHTML = `<div class="turn-strip-label">Turn order</div>` + fight.order.map((row, i) =>
        `<span class="turn-chip ${fight.started && i === fight.turn ? "current" : ""}"><b>${esc(row.init == null || row.init === "" ? "—" : row.init)}</b> ${esc(row.name || "")}</span>`
      ).join("");
    }
    syncTurnState();
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
function nextTurn() {
  syncDamageMode();
  if (!fight.order.length) { DM.toast("Add someone to the turn order first"); return; }
  fight.recruit = true;
  ensurePlayers();
  if (!fight.started) {
    sortInitiative();
    fight.started = true;
    fight.round = 1;
    fight.turn = 0;
  } else {
    fight.turn += 1;
    if (fight.turn >= fight.order.length) { fight.turn = 0; fight.round += 1; }
  }
  fight.flash = fight.turn;
  saveRemoteTable();
  renderFight();
  const cur = fight.order[fight.turn];
  const turnLine = "Round " + fight.round + " · " + (cur && cur.name ? cur.name : "someone") + "'s turn";
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
function vendorMatch(id, item) {
  const n = item.name.toLowerCase();
  if (id === "gunsmith") return /gun|ammo|holster|mod/.test(item.kind);
  if (id === "eldorite") return /eldorite|hex|charm|focus|instrument/.test(n) || item.kind === "instrument" || item.kind === "focus";
  if (id === "apothecary") return item.kind === "explosive" || /medic|tonic|poison|blessed|herb|vial|soap/.test(n);
  if (id === "general") return /armor|gear|pack|mount|tool|holster|ammo|frontier|melee|ranged/.test(item.kind);
  return true;
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
function renderStock() {
  const box = $("#storeList");
  if (!box) return;
  if (!fight.stock.length) {
    box.innerHTML = '<p class="lede">No session stock yet.</p>';
    return;
  }
  box.innerHTML = fight.stock.map((item, i) => {
    const shown = item.price === "" || item.price == null ? "" : Number(item.price).toLocaleString();
    return `<div class="init-row"><b>${esc(item.name)}</b>
      <input type="number" min="0" data-stock-price="${i}" value="${item.price === "" || item.price == null ? "" : esc(item.price)}" aria-label="Price for ${esc(item.name)}">
      <span>${shown ? esc(shown) + " ES" : "ES"}</span>
      <button type="button" class="btn sm" data-stock-del="${i}">Remove</button></div>`;
  }).join("");
}
async function addStockItem(name, price) {
  if (!name) { DM.toast("Need an item name"); return; }
  fight.stock.push({ name: name, price: price === "" || price == null || !isFinite(price) ? "" : price });
  await saveRemoteTable();
  renderStock();
}
async function addStock() {
  const name = ($("#stockName").value || "").trim();
  const price = parseInt($("#stockPrice").value, 10);
  if (!name || !isFinite(price)) { DM.toast("Need a name and an ES price"); return; }
  $("#stockName").value = "";
  await addStockItem(name, price);
  DM.toast("Stock saved");
}
async function loadVendor() {
  const id = ($("#vendorPreset") && $("#vendorPreset").value) || "general";
  const items = catalog().filter((item) => vendorMatch(id, item));
  fight.stock = items.map((item) => ({ name: item.name, price: item.price == null ? "" : item.price }));
  await saveRemoteTable();
  renderStock();
  DM.toast("Loaded " + fight.stock.length + " " + id + " items. Blank prices stay off the counter until you set them.");
}
async function forceStore() {
  const priced = fight.stock.filter((item) => isFinite(parseInt(item.price, 10)));
  const skipped = fight.stock.length - priced.length;
  fight.storeOpen = true;
  await saveRemoteTable();
  await DM.pushCommand({
    type: "open_store", to: "all",
    payload: { stock: priced.map((item) => ({ name: item.name, price: parseInt(item.price, 10) })) },
    from: DM.state.uid
  });
  await DM.pushLedger({
    who: "DM", playerId: "all", type: "open_store",
    what: "Store opened (" + priced.length + " items)",
    oldVal: null, newVal: "open", flag: false
  });
  DM.toast("Store opened" + (skipped ? " · " + skipped + " blank prices left off" : ""));
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

function visibleBeasts() {
  return (fight.bestiary || []).filter((b) => b && !b.template);
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
    return Object.assign({}, b, { name: over.name || b.name });
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
    card: window.SSDNSApplied && window.SSDNSApplied.enemyCardModel ? window.SSDNSApplied.enemyCardModel(b) : null
  };
}
function renderBestiary() {
  const box = $("#bestiaryList");
  if (!box) return;
  const traitText = window.SSDNSApplied && window.SSDNSApplied.traitText
    ? window.SSDNSApplied.traitText
    : (traits) => (Array.isArray(traits) ? traits.map((t) => (t && t.name) || "").join(", ") : String(traits || ""));
  box.innerHTML = visibleBeasts().map((b) => `
    <article class="bestiary-card">
      <h3>${esc(b.name)}</h3>
      <p>AC ${esc(b.ac)} · HP ${esc(b.hp)}${b.cr ? " · CR " + esc(b.cr) : ""}</p>
      <p>${esc(b.attacks || "")}</p>
      <p class="lede">${esc(traitText(b.traits))}</p>
      ${traitText(b.actions) ? `<p class="lede">${esc(traitText(b.actions))}</p>` : ""}
      <label class="fine">Name <input type="text" data-beast-name="${esc(b.id)}" value="${esc(b.name)}" aria-label="Rename ${esc(b.name)}"></label>
      <button type="button" class="btn sm" data-add-beast="${esc(b.id)}">Add to initiative</button>
    </article>`).join("") || '<p class="lede">No bestiary file.</p>';
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
  return before;
}
async function rowHp(i, sign) {
  const row = fight.order[i];
  if (!row) return;
  const picked = damagePick();
  if (!picked) { DM.toast("Enter dice or a flat amount"); return; }
  const amt = picked.total;
  if (row.kind === "player" && row.playerId) {
    const sel = $("#dmgTarget");
    if (sel) sel.value = row.playerId;
    const btn = sign < 0 ? $("#btnDmg") : $("#btnHeal");
    if (btn) btn.click();
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
function attackThis(i) { return attackRow(i); }
function dexModFrom(dex) {
  const n = Number(dex);
  if (!isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}
function playerTargets() {
  const fromOrder = fight.order.filter((r) => r && r.kind === "player").map((r) => ({
    id: r.playerId || r.id,
    name: r.name || "Player",
    ac: r.ac
  }));
  Object.keys(DM.state.players || {}).forEach((pid) => {
    if (fromOrder.some((p) => p.id === pid)) return;
    const s = DM.state.players[pid].snapshot || {};
    fromOrder.push({ id: pid, name: s.name || pid, ac: s.ac });
  });
  return fromOrder;
}
function askEnemyStrike(row, preset) {
  const players = playerTargets();
  const def = row.lastAttackerId || (players[0] && players[0].id) || "";
  const bonus = preset && preset.toHit != null && preset.toHit !== "" ? preset.toHit : row.atkBonus;
  const dice = preset && preset.damage ? preset.damage : (row.damage || "");
  const title = preset && preset.name ? preset.name : "Attack a player";
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const options = players.map((p) => `<option value="${esc(p.id)}"${p.id === def ? " selected" : ""}>${esc(p.name)} · AC ${esc(p.ac == null || p.ac === "" ? "?" : p.ac)}</option>`).join("");
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p class="fine">${esc(row.name || "Enemy")} attacks.</p><label>Target <select id="enemyTarget">${options || "<option value=''>No players</option>"}</select></label><label>Attack bonus <input id="enemyBonus" type="number" value="${bonus == null ? "" : esc(bonus)}" placeholder="blank asks"></label><label>Damage <input id="enemyDice" value="${esc(dice)}" placeholder="1d6+2"></label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Roll</button></div></form>`;
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
async function enemyStrike(i) {
  const row = fight.order[i];
  if (!row) return;
  const picked = await askEnemyStrike(row);
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
  const attackName = String(row.attacks || "").trim();
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
async function cardStrike(i, n) {
  const row = fight.order[i];
  const atk = row && row.card && row.card.attacks && row.card.attacks[n];
  if (!row || !atk) return;
  if (atk.jammed) { DM.toast(atk.name + " is jammed"); return; }
  if (atk.capacity != null && Number(atk.loaded) <= 0) { DM.toast(atk.name + " is empty"); return; }
  const picked = await askEnemyStrike(row, atk);
  if (!picked || !picked.targetId) { DM.toast("No player to attack"); return; }
  const bonus = Number(atk.toHit);
  const dice = String(atk.damage || "").trim();
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
  if (hit && atk.rider && atk.rider.condition) {
    const ability = atk.rider.save || "STR";
    const dc = Number(atk.rider.dc);
    const mod = targetMod(target.id, ability);
    const saveNat = d20();
    const saveTotal = saveNat + mod;
    const failed = isFinite(dc) ? saveTotal < dc : true;
    const saveLine = (target.name || "Target") + " " + ability + " save " + saveNat + signed(mod) + " = " + saveTotal + (isFinite(dc) ? " vs DC " + dc : "") + (failed ? " FAIL" : " OK");
    await DM.pushRoll({
      who: row.name, label: row.name, formula: "1d20" + signed(mod), result: saveTotal,
      detail: saveLine, private: true, nat: saveNat
    });
    if (failed) {
      row.pendingRider = {
        condition: atk.rider.condition,
        rounds: atk.rider.rounds,
        targetId: target.id,
        targetName: target.name
      };
    }
    detail = saveLine;
  }
  await saveRemoteTable();
  renderFight();
  DM.toast(detail + (atk.capacity != null && !atk.rider ? " · " + atk.loaded + " left" : ""));
}
async function cardCheck(i, mod, label) {
  const row = fight.order[i];
  if (!row) return;
  const bonus = Number(mod) || 0;
  const nat = d20();
  const total = nat + bonus;
  const detail = (row.name || "Enemy") + " " + (label || "check") + " " + nat + signed(bonus) + " = " + total;
  await publishCardRoll(row, detail, total, { formula: "1d20" + signed(bonus), nat: nat });
  DM.toast(detail);
}
async function cardDice(i) {
  const row = fight.order[i];
  if (!row) return;
  const formula = (document.querySelector("[data-dice-formula='" + i + "']") || {}).value || "1d20";
  const mode = (document.querySelector("[data-dice-mode='" + i + "']") || {}).value || "";
  const extra = Number((document.querySelector("[data-dice-mod='" + i + "']") || {}).value) || 0;
  const out = DM.rollChecked ? DM.rollChecked(String(formula).trim() || "1d20", mode, extra) : DM.parseDice(formula);
  const detail = (row.name || "Enemy") + " " + formula + " = " + out.total + (out.detail ? " (" + out.detail + ")" : "");
  await publishCardRoll(row, detail, out.total, { formula: formula, nat: out.nat1 ? 1 : null });
  DM.toast(detail);
}
async function cardCast(i, n) {
  const row = fight.order[i];
  const card = row && row.card;
  const list = card && card.spellcasting && card.spellcasting.spells;
  const spell = list && list[n];
  if (!spell) return;
  const name = typeof spell === "string" ? spell : (spell.name || "Spell");
  const level = typeof spell === "object" && spell.level ? Number(spell.level) : 0;
  if (level && card.slots && card.slots[level] && card.slots[level].left <= 0) {
    DM.toast("No level-" + level + " slot left");
    return;
  }
  const Cast = window.SSDNSSpellCast;
  const known = Cast && Cast.lookup ? Cast.lookup(name) : null;
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
  const picked = await askEnemyStrike(row, { name: name, toHit: card.spellcasting.attack, damage: (known && known.dice) || "" });
  if (!picked || !picked.targetId) return;
  const target = playerTargets().filter((p) => p.id === picked.targetId)[0] || { id: picked.targetId, name: picked.targetId, ac: null };
  if (kind === "save") {
    const ability = (known && known.save) || "DEX";
    const dc = Number(card.spellcasting.dc);
    const mod = targetMod(target.id, ability);
    const nat = d20();
    const total = nat + mod;
    const failed = isFinite(dc) ? total < dc : false;
    const detail = row.name + " casts " + name + ". " + (target.name || "Target") + " " + ability + " save " + nat + signed(mod) + " = " + total + (isFinite(dc) ? " vs DC " + dc : "") + (failed ? " FAIL" : " OK");
    await publishCardRoll(row, detail, total, { nat: nat });
    DM.toast(detail);
    renderFight();
    return;
  }
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
function applyRequest(req) {
  if (!req) return;
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
      const fresh = req && req.ts && (Date.now() - Date.parse(req.ts) < 120000);
      if (!fight.reqPrimed && !fresh) return;
      applyRequest(req);
    });
    fight.reqPrimed = true;
  });
  if (typeof cb === "function") DM.state.unsubs.push(cb);
}
function wireClicks() {
  document.addEventListener("change", (e) => {
    const box = e.target;
    if (!box || !box.getAttribute || !box.hasAttribute("data-card-public")) return;
    const row = fight.order[parseInt(box.getAttribute("data-card-public"), 10)];
    if (row && row.card) row.card.public = !!box.checked;
  });
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-init-up],[data-init-down-move],[data-init-del],[data-init-hit],[data-init-strike],[data-init-cond],[data-your-turn],[data-init-dmg],[data-init-heal],[data-init-down],[data-add-beast],[data-stock-del],[data-pack-send],[data-pack-del],[data-quick-roll],[data-cat-add],[data-apply-hit],[data-undo-hit],[data-resend-turn],[data-resend-feed],[data-card-atk],[data-card-check],[data-card-dice],[data-card-cast],[data-clear-jam],[data-apply-rider],[data-feat-use],[data-feat-recharge],[data-slot-spend]");
    if (!t) return;
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
    if (t.hasAttribute("data-card-atk")) { cardStrike(parseInt(t.getAttribute("data-card-atk"), 10), parseInt(t.getAttribute("data-atk-n"), 10)); return; }
    if (t.hasAttribute("data-card-check")) { cardCheck(parseInt(t.getAttribute("data-card-check"), 10), t.getAttribute("data-check-mod"), t.getAttribute("data-check-label")); return; }
    if (t.hasAttribute("data-card-dice")) { cardDice(parseInt(t.getAttribute("data-card-dice"), 10)); return; }
    if (t.hasAttribute("data-card-cast")) { cardCast(parseInt(t.getAttribute("data-card-cast"), 10), parseInt(t.getAttribute("data-spell-n"), 10)); return; }
    if (t.hasAttribute("data-clear-jam")) {
      const row = fight.order[parseInt(t.getAttribute("data-clear-jam"), 10)];
      const atk = row && row.card && row.card.attacks[parseInt(t.getAttribute("data-atk-n"), 10)];
      if (atk) { atk.jammed = false; renderFight(); DM.toast(atk.name + " cleared"); }
      return;
    }
    if (t.hasAttribute("data-apply-rider")) {
      const idx = parseInt(t.getAttribute("data-apply-rider"), 10);
      const row = fight.order[idx];
      const pending = row && row.pendingRider;
      if (pending && pending.targetId) {
        const names = [{ name: pending.condition || "Prone", rounds: pending.rounds }];
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
    if (t.hasAttribute("data-init-up") || t.hasAttribute("data-init-down-move") || t.hasAttribute("data-init-del")) {
      const i = parseInt(t.getAttribute("data-init-up") || t.getAttribute("data-init-down-move") || t.getAttribute("data-init-del"), 10);
      if (t.hasAttribute("data-init-del")) {
        const gone = fight.order[i];
        fight.removed = fight.removed || {};
        if (gone && gone.id) fight.removed[gone.id] = true;
        if (gone && gone.playerId) fight.removed[gone.playerId] = true;
        fight.order.splice(i, 1);
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
        if (b) {
        fight.recruit = true;
        const row = addCombatant(beastRow(b));
        announce("Added " + row.name + " to the turn order", "combat", row);
      }
    }
    if (t.hasAttribute("data-cat-add")) {
      const raw = t.getAttribute("data-cat-price");
      const price = raw === "" || raw == null ? "" : parseInt(raw, 10);
      addStockItem(t.getAttribute("data-cat-name"), price);
      DM.toast("Added " + (t.getAttribute("data-cat-name") || "item"));
    }
    if (t.hasAttribute("data-stock-del")) {
      fight.stock.splice(parseInt(t.getAttribute("data-stock-del"), 10), 1);
      saveRemoteTable();
      renderStock();
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

function fillAdds() {
  playerSelect("#dmgTarget", false);
  playerSelect("#packTarget", true);
  playerSelect("#initPlayer", false);
  const beast = $("#initEnemy");
  if (beast) {
    const keep = beast.value;
    beast.innerHTML = visibleBeasts().map((b) => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");
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
  if (k === "n") { e.preventDefault(); nextTurn(); }
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
    if (!r || !r.id || seenDamage[r.id] || r.applied || fight.appliedHits[r.id] || r.selfApplied) return;
    if (window.SSDNSApplied && window.SSDNSApplied.has(DM.state.roomCode, r.id)) { seenDamage[r.id] = 1; return; }
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
  if (!on) fight.departed[id] = true;
  else if (fight.departed) delete fight.departed[id];
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
    const res = await fetch("../assets/music/tracks.json");
    if (res.ok) {
      const data = await res.json();
      fight.tracks = data.tracks || [];
    }
  } catch (e) {}
  renderTracks();
  renderBestiary();
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
  $("#btnAddEnemy") && $("#btnAddEnemy").addEventListener("click", () => {
    const b = fight.bestiary.filter((x) => x.id === $("#initEnemy").value)[0];
    if (!b) { DM.toast("Pick an enemy"); return; }
    fight.recruit = true;
    const row = addCombatant(beastRow(b));
    announce("Added " + row.name + " to the turn order", "combat", row);
  });
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
  $("#btnLoadVendor") && $("#btnLoadVendor").addEventListener("click", loadVendor);
  $("#btnSaveStock") && $("#btnSaveStock").addEventListener("click", async () => { await saveRemoteTable(); DM.toast("Stock saved"); });
  $("#catalogQ") && $("#catalogQ").addEventListener("input", renderCatalog);
  $("#catalogCat") && $("#catalogCat").addEventListener("change", renderCatalog);
  $("#btnInspGrant") && $("#btnInspGrant").addEventListener("click", () => changeInspiration(1));
  $("#btnInspSpend") && $("#btnInspSpend").addEventListener("click", () => changeInspiration(-1));
  $("#btnInspGrantTable") && $("#btnInspGrantTable").addEventListener("click", () => changeInspiration(1));
  $("#btnInspSpendTable") && $("#btnInspSpendTable").addEventListener("click", () => changeInspiration(-1));
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute("data-stock-price")) return;
    const i = parseInt(t.getAttribute("data-stock-price"), 10);
    const n = parseInt(t.value, 10);
    if (fight.stock[i]) fight.stock[i].price = isFinite(n) ? n : "";
    saveRemoteTable();
  });
  renderCatalog();
  $("#btnOpenStoreNow") && $("#btnOpenStoreNow").addEventListener("click", forceStore);
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
      watchRequests();
      watchConditions();
    },
    onRolls: noteInitiativeRolls,
    syncPlayers: syncPlayerVitals,
    onPlayerInit: onPlayerInit,
    notePresence: notePresence,
    acFor: acForRoll,
    enterRoom: enterRoom,
    renderFight: renderFight,
    removeCombatant: removeCombatant
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
    const initI = t.getAttribute("data-init-val");
    const hpI = t.getAttribute("data-hp-val");
    const acI = t.getAttribute("data-ac-val");
    const atkI = t.getAttribute("data-atk-val");
    const dmgI = t.getAttribute("data-dmg-val");
    if (!t.isConnected) return;
    const row = fightRowFromField(t);
    if (!row) return;
    const n = t.value === "" ? "" : parseInt(t.value, 10);
    if (initI != null) row.init = n;
    if (hpI != null) {
      row.hp = n;
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

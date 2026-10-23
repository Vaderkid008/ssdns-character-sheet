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
  condMap: {},
  /* turn order PR 1 (T2): shared turn state on table/initiative, see assets/js/turn-rules.js */
  seq: 0,
  turnStarts: {},
  undo: [],
  markers: {},
  /* turn order PR 2: the DM's override (unlock { playerId: seq }) and opportunity attacks (oa { reqId: {...} }) ride on
     table/initiative too; held { rollId: meta } is out-of-turn damage / healing waiting for the DM's OK (DM-only, local) */
  unlock: {},
  oa: {},
  held: {},
  /* Dirty-gun tracker: room campaign day and the day each gun was last cleaned. Not combat Dirty. */
  campaignDay: 1,
  gunClean: {}
};
function turnFields(src) {
  const T = window.SSDNSTurn;
  if (!src || typeof src !== "object") return;
  const n = parseInt(src.seq, 10);
  if (isFinite(n)) {
    /* Firebase drops empty objects / lists, so a saved seq with no undo or turnStarts means they are empty */
    fight.seq = n;
    fight.turnStarts = {};
    fight.undo = [];
    fight.markers = {};
    fight.unlock = {};
    fight.oa = {};
  }
  if (src.turnStarts && typeof src.turnStarts === "object") fight.turnStarts = Object.assign({}, src.turnStarts);
  if (Array.isArray(src.undo)) fight.undo = src.undo.slice(0, (T && T.UNDO_MAX) || 5);
  else if (src.undo && typeof src.undo === "object") fight.undo = Object.keys(src.undo).sort().map((k) => src.undo[k]).slice(0, (T && T.UNDO_MAX) || 5);
  if (src.markers && typeof src.markers === "object") fight.markers = Object.assign({}, src.markers);
  if (src.unlock && typeof src.unlock === "object") fight.unlock = Object.assign({}, src.unlock);
  if (src.oa && typeof src.oa === "object") fight.oa = Object.assign({}, src.oa);
  const day = parseInt(src.campaignDay, 10);
  if (isFinite(day) && day > 0) fight.campaignDay = day;
  if (src.gunClean && typeof src.gunClean === "object") fight.gunClean = Object.assign({}, src.gunClean);
}
function turnState() {
  return { round: fight.round, turn: fight.turn, started: !!fight.started, order: fight.order, seq: fight.seq || 0, turnStarts: fight.turnStarts || {},
    unlock: fight.unlock || {}, oa: fight.oa || {} };
}

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
    turnFields(raw);
    if (raw.held && typeof raw.held === "object") fight.held = Object.assign({}, raw.held);
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
      stock: fight.stock, packs: fight.packs, condMap: fight.condMap || {}, removed: fight.removed || {}, departed: fight.departed || {}, undos: fight.undos || {}, damageMode: fight.damageMode === "approve" ? "approve" : "auto", updatedAt: fight.updatedAt,
      seq: fight.seq || 0, turnStarts: fight.turnStarts || {}, undo: fight.undo || [], markers: fight.markers || {},
      unlock: fight.unlock || {}, oa: fight.oa || {}, held: fight.held || {},
      campaignDay: fight.campaignDay || 1, gunClean: fight.gunClean || {}
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
/* 0.2.79: no hit-point pool (Spectral Horse) means never Down; see SSDNSApplied.noHpPool */
function noHpPoolRow(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.noHpPool) return window.SSDNSApplied.noHpPool(row);
  return !!(row && row.kind !== "player" && row.noHpPool === true);
}
function enemyStatus(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.coarseStatus) return window.SSDNSApplied.coarseStatus(row);
  if (!row || row.kind === "player") return row && row.status ? row.status : "";
  if (enemyFled(row)) return "Fled";
  if (noHpPoolRow(row)) return "";
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
    if (row.mapTokenId) secret.mapTokenId = String(row.mapTokenId);
    secret.mapHidden = !!row.mapHidden;
    /* map token guns: the token's last-used weapon rides in the DM-only encounter/dm copy (players never read it) */
    if (row.lastWeaponId) secret.lastWeaponId = String(row.lastWeaponId);
    fight.secrets[row.id] = secret;
  });
}
function restoreSecrets() {
  (fight.order || []).forEach((row) => {
    const secret = row && fight.secrets && fight.secrets[row.id];
    if (!secret || row.kind === "player") return;
    if (secret.name) row.name = secret.name;
    if (secret.mapTokenId) row.mapTokenId = secret.mapTokenId;
    ["ac", "hp", "maxHp", "dex", "atkBonus"].forEach((key) => {
      if (secret[key] != null && secret[key] !== "") row[key] = secret[key];
    });
    if (secret.damage) row.damage = secret.damage;
    if (secret.reveal) row.reveal = secret.reveal;
    if (secret.side === "friendly" || secret.side === "enemy") row.side = secret.side;
    if (secret.card && typeof secret.card === "object") row.card = Object.assign({}, row.card || {}, secret.card);
    row.mapHidden = !!secret.mapHidden;
    if (secret.lastWeaponId && !row.lastWeaponId) row.lastWeaponId = String(secret.lastWeaponId);
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
function cylinderTargetHtml(row) {
  const list = combatTargets(row);
  const hinted = row && row.lastAttackerId;
  const selected = hinted && list.some((p) => p.id === hinted) ? hinted : defaultCombatTarget(row, list);
  return `<select class="cyl-target" data-cyl-target="${esc(row && row.id || "")}" aria-label="Target">${targetMenu(list, selected)}</select>`;
}
function stripGuns(row, i) {
  if (!fight.started || i !== fight.turn) return "";
  function dots(count, loaded, attrs, flags, gun) {
    const n = Number(count) || 0;
    const fullN = Number(loaded) || 0;
    const graphic = window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.enabled();
    if (graphic && n) {
      return window.SSDNSAmmoDisplay.html({
        name: gun && gun.name,
        action: gun && gun.action,
        weapon: gun && gun.weapon,
        ammoDisplay: gun && gun.ammoDisplay,
        group: gun && gun.group,
        ammo: gun && gun.ammo,
        tier: gun && gun.tier,
        scatter: !!(gun && gun.scatter),
        cap: n,
        loaded: fullN,
        chambers: flags || undefined,
        jammed: !!(gun && gun.jammed),
        locked: (gun && gun.lockedChambers) || [],
        size: "strip",
        attr: attrs,
        attrs: function (k) { return { "data-gun-k": String(k), "data-k": String(k) }; }
      });
    }
    let html = "";
    const locks = (gun && gun.lockedChambers) || [];
    for (let k = 0; k < n; k++) {
      const locked = locks.some((ix) => Number(ix) === k);
      const full = !locked && (flags ? !!flags[k] : k < fullN);
      html += `<button type="button" class="chamber-dot${locked ? " locked" : (full ? " full" : "")}" ${attrs} data-gun-k="${k}" aria-label="${locked ? "Locked chamber" : "Chamber"} ${k + 1}">${locked ? "X" : ""}</button>`;
    }
    return html;
  }
  if (row.kind === "enemy") {
    const list = (row.card && row.card.attacks && row.card.attacks.length) ? row.card.attacks : (row.attackList || []);
    const target = cylinderTargetHtml(row);
    return list.map((atk, n) => {
      if (!atk || atk.capacity == null || atk.dropped === true || atk.equipped === false) return "";
      return `<span class="cylinder-row">${esc(atk.name || "Gun")} ${dots(atk.capacity, atk.loaded, `data-cyl-fire="${esc(row.id)}" data-atk-n="${n}"`, null, atk)} ${target}</span>`;
    }).join("");
  }
  return publicGuns(row).map((g, gi) => {
    const chambers = g.chambers || [];
    const cap = chambers.length || Number(g.capacity) || 0;
    const loaded = chambers.length ? chambers.filter(Boolean).length : (Number(g.loaded) || 0);
    const pid = esc(row.playerId || row.id || "");
    const sheetI = g.index != null && g.index !== "" ? g.index : gi;
    return `<span class="cylinder-row">${esc(g.name || "Gun")} ${dots(cap, loaded, `data-strip-fire="${pid}" data-gun-i="${sheetI}"`, chambers.length ? chambers : null, g)}</span>`;
  }).join("");
}
function chamberPicture(list) {
  if (!Array.isArray(list)) return null;
  if (window.SSDNSApplied && window.SSDNSApplied.chamberTokens) return window.SSDNSApplied.chamberTokens(list);
  return list.slice();
}
function publicGuns(row) {
  if (!row) return [];
  if (row.kind === "player" && row.playerId && DM.state.players[row.playerId]) {
    const snap = DM.state.players[row.playerId].snapshot || {};
    return (snap.guns || []).map((g, gi) => {
      if (!g || !g.name || g.dropped === true || g.equipped === false) return null;
      return {
        name: g.name,
        weapon: g.weapon || "",
        action: g.action || "",
        ammoDisplay: g.ammoDisplay || "",
        group: g.group || "",
        ammo: g.ammo || "",
        tier: g.tier || "",
        scatter: !!g.scatter,
        jammed: !!g.jammed,
        ruined: !!(g.ruined || g.broken),
        exploded: !!g.exploded,
        wrecked: !!g.wrecked,
        capacity: g.capacity || 0,
        loaded: g.loaded || 0,
        index: g.index != null && g.index !== "" ? g.index : gi,
        chambers: chamberPicture(g.chambers) || [],
        lockedChambers: Array.isArray(g.lockedChambers) ? g.lockedChambers.slice() : []
      };
    }).filter(Boolean);
  }
  const attacks = (row.attackList || row.card && row.card.attacks || []).filter((a) => a && a.capacity);
  return attacks.map((a) => ({
    name: a.name || "Gun",
    weapon: a.weapon || "",
    action: a.action || "",
    ammoDisplay: a.ammoDisplay || "",
    jammed: !!a.jammed,
    capacity: a.capacity,
    loaded: a.loaded || 0,
    chambers: Array.from({ length: Number(a.capacity) || 0 }, (_, i) => i < Number(a.loaded || 0) ? 1 : 0)
  }));
}
function buildPublish() {
  captureSecrets();
  (fight.order || []).forEach((row) => {
    if (window.SSDNSApplied && window.SSDNSApplied.refreshCombatantStatus) window.SSDNSApplied.refreshCombatantStatus(row);
  });
    const order = (fight.order || []).map((row, index) => {
      const hidden = !!(row && row.mapHidden && row.kind !== "player");
      const shown = window.SSDNSApplied && window.SSDNSApplied.publicEnemy
        ? window.SSDNSApplied.publicEnemy(row, index, conditionsForRow(row))
        : { name: row.name || "", status: enemyStatus(row) };
      const masked = (window.SSDNSApplied && window.SSDNSApplied.HIDDEN_ENEMY_NAME) || "Unknown gunman";
      return {
        id: row.id || "",
        name: hidden ? masked : (shown.name || ""),
        kind: row.kind || "",
        init: row.init == null ? "" : row.init,
        playerId: row.playerId || "",
        status: hidden ? "" : (shown.status || ""),
        slot: index,
        lastAttackerId: row.lastAttackerId || "",
        initFrom: row.initFrom || "",
        mapHidden: hidden,
        side: row.kind === "player" ? "" : (window.SSDNSApplied && window.SSDNSApplied.combatantSide ? window.SSDNSApplied.combatantSide(row) : (isFriendly(row) ? "friendly" : "enemy")),
        faction: hidden ? "" : (shown.faction || ""),
        conditions: hidden ? [] : (shown.conditions || []),
        guns: hidden ? [] : publicGuns(row)
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
        if (row.mapHidden) secret[row.id].mapHidden = true;
      }
      if (row.mapHidden && row.kind !== "player") return;
      pub[row.id] = shown;
    });
    fight.publicView = pub;
  return { order: order, hp: hp, pub: pub, secret: secret };
}
/* map blink fix (Jessey 2026-10-20 9:34 PM): saves used to run side by side, each holding the copy it built when it
   started. A slow earlier save then wrote its old encounter/dm copy after a newer shot; Firebase echoed it straight
   back to watchSecrets, restoreSecrets put the old HP and ammo on the row, the map redrew the old bar, and when that
   flipped Hurt/Bloodied the listener saved again and the two copies traded places. Now one save runs at a time, every
   write builds its copy at the moment it is sent, and calls made while a save is running fold into one more pass. */
let remoteSaveBusy = null;
let remoteSaveAgain = false;
async function writeRemoteTableOnce() {
  const fb = DM.state._fb;
  try {
    const first = buildPublish();
    await fb.update(DM.roomRef("table"), {
      initiative: { round: fight.round, turn: fight.turn, started: !!fight.started, recruit: fight.recruit !== false, order: first.order,
        seq: fight.seq || 0, turnStarts: fight.turnStarts || {}, undo: fight.undo || [], markers: fight.markers || {},
        unlock: fight.unlock || {}, oa: fight.oa || {},
        campaignDay: fight.campaignDay || 1, gunClean: fight.gunClean || {} },
      store: fight.stock,
      packs: fight.packs,
      storeOpen: !!fight.storeOpen,
      damageMode: fight.damageMode === "approve" ? "approve" : "auto",
      updatedAt: fight.updatedAt
    });
    try {
      await fb.set(DM.roomRef("encounter/hp"), buildPublish().hp);
      await fb.set(DM.roomRef("encounter/dm"), buildPublish().secret);
      await fb.set(DM.roomRef("encounter/public"), buildPublish().pub);
    } catch (err) {
      if (DM.writeFailed) DM.writeFailed(err, "Couldn't sync to players");
      return;
    }
  } catch (e) {
    if (DM.writeFailed) DM.writeFailed(e, "Couldn't sync to players");
  }
}
async function saveRemoteTable() {
  syncDamageMode();
  fight.updatedAt = new Date().toISOString();
  saveLocalTable();
  buildPublish(); /* demo and offline still build the public view (fight.publicView) */
  if (DM.state.demo || !DM.state.db) return;
  if (remoteSaveBusy) { remoteSaveAgain = true; return remoteSaveBusy; }
  remoteSaveBusy = (async () => {
    try {
      do {
        remoteSaveAgain = false;
        await writeRemoteTableOnce();
      } while (remoteSaveAgain);
    } finally {
      remoteSaveBusy = null;
    }
  })();
  return remoteSaveBusy;
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
    turnFields(init);
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
  refreshFightCards();
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
  /* Give tab rework (0.2.121): a give's undo is the recent-gives row's own Undo (give-tab.js), so the two never
     undo the same give twice */
  if (u.type === "give" && window.SSDNSGiveTab) {
    if (fight.undo === u) fight.undo = null;
    const ub = $("#btnUndo");
    if (ub) ub.disabled = !fight.undo;
    return window.SSDNSGiveTab.undo(u.give);
  }
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
  if (u.restoreConditions && u.restoreConditions.entries) {
    const pack = u.restoreConditions;
    fight.condMap = fight.condMap || {};
    pack.entries.forEach((entry) => { if (entry && entry.id) fight.condMap[entry.id] = entry; });
    (fight.order || []).forEach((row) => {
      if (!row) return;
      const sid = row.kind === "player" ? (row.playerId || row.id) : row.id;
      if (sid !== pack.subjectId) return;
      row.conditions = Object.keys(fight.condMap).map((id) => fight.condMap[id]).filter((c) => c && c.subjectId === pack.subjectId);
    });
    if (pack.kind === "player" && DM.state.players[pack.subjectId] && DM.state.players[pack.subjectId].snapshot && window.SSDNSConditions) {
      const snap = DM.state.players[pack.subjectId].snapshot;
      snap.activeConditions = window.SSDNSConditions.mergeById(snap.activeConditions || [], pack.entries, []);
      snap.conditions = window.SSDNSConditions.listText(snap.activeConditions);
      await DM.pushCommand({ type: "set_conditions", to: pack.subjectId, payload: { merge: true, entries: pack.entries, quiet: true }, from: DM.state.uid });
    }
    if (!DM.state.demo && DM.state.db && DM.state._fb) {
      for (const entry of pack.entries) {
        if (entry && entry.id) await DM.state._fb.set(DM.roomRef("conditions/" + entry.id), entry);
      }
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
function pushMapInitiative() {
  if (window.SSDNSMapHost && window.SSDNSMapHost.syncInitiative) window.SSDNSMapHost.syncInitiative();
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
    const lair = item.lair && !/^lair actions?$/i.test(String(name).trim()) ? " (lair)" : ""; /* L0195: lair actions stay text-only */
    return `<p class="fine">${name ? `<b>${esc(name)}${lair}.</b> ` : ""}${esc(text)}</p>`;
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
    const props = Array.isArray(atk.properties) ? atk.properties.filter(Boolean).join(", ") : (atk.properties || "");
    const bits = [
      atk.kind || "",
      signed(atk.toHit),
      [atk.damage || "", atk.damageType || ""].filter(Boolean).join(" "),
      extra,
      atk.versatile ? ("2H " + atk.versatile) : "",
      atk.range || "",
      cap,
      atk.misfire == null ? "" : ("MF " + atk.misfire),
      props
    ].filter(Boolean);
    const jam = atk.jammed
      ? `<p class="fine">Jammed. <button type="button" class="btn sm" data-clear-jam="${i}" data-atk-n="${n}">Clear jam</button></p>`
      : "";
    const gunLike = atk.misfire != null && atk.misfire !== "" || atk.capacity != null;
    /* M2 / M4: DM gun tools on enemy and NPC-ally guns (free; Add rounds is silent) */
    const enemyTools = gunLike && i >= 0 && row && row.kind !== "player" ? (() => {
      const M = window.SSDNSMisfire;
      const canClean = !!(M && M.cleanOptions && M.cleanOptions(atk).length) && !atk.pendingD4;
      const locks = enemyLocks(atk).length;
      return `<div class="enemy-gun-tools toolbar">
        ${canClean ? `<button type="button" class="btn sm" data-enemy-gun="clean" data-eg-row="${i}" data-atk-n="${n}">Clean</button>` : ""}
        ${locks ? `<button type="button" class="btn sm" data-enemy-gun="reopen" data-eg-row="${i}" data-atk-n="${n}">Reopen chamber (${locks} locked)</button>` : ""}
        ${atk.capacity != null ? `<button type="button" class="btn sm" data-enemy-gun="addrounds" data-eg-row="${i}" data-atk-n="${n}">Add rounds</button>` : ""}
      </div>`;
    })() : "";
    const mfOverride = gunLike ? `<div class="misfire-override">
      <p class="fine">Streak ${esc(atk.misStreak || 0)}${atk.pendingD4 ? " · d4 pending" : ""}${atk.dirty ? " · Dirty" : ""}${atk.fouled ? " · Fouled" : ""}${atk.ruined ? " · Ruined" : ""}</p>
      <button type="button" class="btn sm" data-mf-op="reset" data-mf-row="${i}" data-atk-n="${n}">Reset streak</button>
      <button type="button" class="btn sm" data-mf-op="dirty" data-mf-on="1" data-mf-row="${i}" data-atk-n="${n}">Set Dirty</button>
      <button type="button" class="btn sm" data-mf-op="dirty" data-mf-on="0" data-mf-row="${i}" data-atk-n="${n}">Clear Dirty</button>
      <button type="button" class="btn sm" data-mf-op="fouled" data-mf-on="1" data-mf-row="${i}" data-atk-n="${n}">Set Fouled</button>
      <button type="button" class="btn sm" data-mf-op="fouled" data-mf-on="0" data-mf-row="${i}" data-atk-n="${n}">Clear Fouled</button>
      <button type="button" class="btn sm" data-mf-op="ruined" data-mf-on="1" data-mf-row="${i}" data-atk-n="${n}">Set Ruined</button>
      <button type="button" class="btn sm" data-mf-op="ruined" data-mf-on="0" data-mf-row="${i}" data-atk-n="${n}">Clear Ruined</button>
      <button type="button" class="btn sm" data-mf-op="cancel" data-mf-row="${i}" data-atk-n="${n}">Cancel d4</button>
    </div>` : "";
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
      ${enemyTools}
      ${mfOverride}
      <div class="toolbar">
        <button type="button" class="btn btn-primary" data-sheet-roll="1" data-n="${n}">Roll</button>
        <button type="button" class="btn" data-sheet-apply="1" data-n="${n}">Apply</button>
        ${riderBtns}
      </div>
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
      const medium = window.SSDNSSpellCast && window.SSDNSSpellCast.describe
        ? window.SSDNSSpellCast.describe(name, { spellDC: casting.dc, spellAtk: casting.attack, ability: casting.ability, level: row.level || (card && card.level) || 1 })
        : "";
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
        ${medium ? `<details class="spell-more"><summary>About</summary><p class="spell-desc">${esc(medium)}</p></details>` : ""}
        <button type="button" class="btn" data-sheet-cast="1" data-n="${n}">${esc(castLabel)}</button>
      </article>`;
    }).join("");
    const dc = casting.dc == null ? "—" : casting.dc;
    spells = `<div class="detail-section"><h3>Spells</h3>
      <p class="dc-call">Spell save DC ${esc(dc)}${casting.ability ? " (" + esc(casting.ability) + ")" : ""} · attack ${signed(casting.attack)}</p>
      ${pips ? `<p>${pips}</p>` : `<p class="fine">At will</p>`}
      ${buttons}</div>`;
  }
  const maxHp = row.maxHp == null || row.maxHp === "" ? row.hp : row.maxHp;
  const noHp = noHpPoolRow(row);
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
      ${noHp ? `<div class="stat" title="No hit points to lose: it is never Down"><b>—</b><span>No HP pool</span></div>` : `<div class="stat"><b>${esc(row.hp == null ? "—" : row.hp)}/${esc(maxHp == null ? "—" : maxHp)}</b><span>HP</span></div>`}
      <div class="stat"><b>${esc(card.speed || "—")}</b><span>Speed</span></div>
      <div class="stat"><b>${esc(card.cr || "—")}</b><span>CR</span></div>
    </div>
    ${noHp ? "" : `<div class="hp-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>`}
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
function attackShown(atk) {
  if (!atk || atk.dropped === true || atk.equipped === false) return false;
  return true;
}
function compactAttackButtons(row, i) {
  const raw = (row.card && row.card.attacks && row.card.attacks.length) ? row.card.attacks : (row.attackList || []);
  const list = raw.filter(attackShown);
  const open = `<button type="button" class="btn sm" data-open-enemy="${esc(row.id || "")}">Open sheet</button>`;
  if (!list.length) return `<button type="button" class="btn sm" data-init-strike="${i}">Attack</button>${open}`;
  return raw.map((atk, n) => {
    if (!attackShown(atk)) return "";
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
  const downed = !fled && !noHpPoolRow(row) && knownNumber(row.hp) === 0; /* no HP pool is never Down */
  const bloodied = !fled && !downed && enemyStatus(row) === "Bloodied";
  const downBadge = fled ? `<span class="badge">Fled</span>` : (downed ? `<span class="badge danger">Unconscious · Down</span>` : (bloodied ? `<span class="badge warn">Bloodied</span>` : ""));
  const sideBadge = friendly ? `<span class="badge eld">Friendly</span>` : "";
  const sideWord = row.kind === "enemy" ? (friendly ? "Friendly" : "Enemy") : (row.kind || "combatant");
  const sideClass = row.kind === "player" ? " side-pc" : (friendly ? " side-ally" : (row.kind === "enemy" ? " side-enemy" : ""));
  const tactics = row.kind === "enemy" ? rowTactics(row) : "";
  const enemyEdit = row.kind === "enemy"
    ? `<label class="fine">Atk <input type="number" data-atk-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.atkBonus == null ? "" : esc(row.atkBonus)}" aria-label="Attack bonus for ${esc(row.name || "enemy")}"></label>
      <label class="fine">Dmg <input class="cond-rounds" data-dmg-val="${i}" data-row-id="${esc(row.id || "")}" value="${esc(row.damage || "")}" placeholder="1d6+2" aria-label="Damage dice for ${esc(row.name || "enemy")}"></label>`
    : "";
  return `<div class="init-row card-fight${current}${flash}${fled ? " fled" : ""}${friendly ? " friendly" : ""}${sideClass}" data-fight-card="${i}">
      <input class="init-score" type="number" data-init-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.init == null ? "" : esc(row.init)}" aria-label="Initiative for ${esc(row.name || "combatant")}">
      <span class="init-who" title="${esc(row.name || "Someone")}">        <span class="who-name">${row.kind === "enemy" ? `<button type="button" class="name-btn" data-open-enemy="${esc(row.id || "")}">${esc(row.name || "Someone")}</button>` : `<b>${esc(row.name || "Someone")}</b>`}${sideBadge}</span>
        <span class="fine">${esc(sideWord)}${row.tie ? " · tie" : ""}${status ? " · " + esc(status) : ""}${detail ? " · " + esc(detail) : ""}${esc(turnAckLabel(row))}</span>
        ${downBadge}
        ${statusChipsHtml(row)}
        ${window.SSDNSAmmoDisplay && window.SSDNSAmmoDisplay.enabled() ? stripGuns(row, i) : ""}
        ${conditionChips(row)}
        ${tactics ? `<span class="tactics-note">Tactics. ${esc(tactics)}</span>` : ""}
        ${revealBar(row, i)}
      </span>
      <label class="fine">AC <input type="number" data-ac-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.ac == null ? "" : esc(row.ac)}" aria-label="AC for ${esc(row.name || "combatant")}"></label>
      ${coverSelectHtml(i, row)}
      <label class="fine">HP <input type="number" data-hp-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.hp == null ? "" : esc(row.hp)}" aria-label="HP for ${esc(row.name || "combatant")}"></label>
      ${row.kind === "enemy" ? `<label class="fine">Max <input type="number" data-max-val="${i}" data-row-id="${esc(row.id || "")}" value="${row.maxHp == null ? "" : esc(row.maxHp)}" aria-label="Max HP for ${esc(row.name || "enemy")}"></label>` : ""}
      ${enemyEdit}
      <span class="init-actions">
        ${row.kind === "enemy" ? `<button type="button" class="btn sm" data-side-toggle="${i}" aria-pressed="${friendly ? "true" : "false"}">${friendly ? "Mark enemy" : "Mark friendly"}</button>` : ""}
        ${row.kind === "enemy" ? compactAttackButtons(row, i) : `<button type="button" class="btn sm" data-your-turn="${i}">Your turn</button>`}
        <button type="button" class="btn sm" data-init-cond="${i}">Conditions</button>
        <button type="button" class="btn sm" data-init-hit="${i}" title="Rolls against this row's AC using the Damage box dice">DM roll vs this AC</button>
        <button type="button" class="btn sm" data-grab="rob" data-grab-i="${i}" title="Robbing is frowned on in town and by lawmen and can lead to a confrontation. The DM decides whether it counts as a robbery or a disarm. No automatic reputation tracking.">Rob/Disarm</button>
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
  const coverI = el.getAttribute("data-cover-val");
  const lockI = el.getAttribute("data-cover-lock");
  const i = parseInt(initI != null ? initI : (hpI != null ? hpI : (acI != null ? acI : (atkI != null ? atkI : (dmgI != null ? dmgI : (coverI != null ? coverI : lockI))))), 10);
  return isFinite(i) ? fight.order[i] : null;
}
function applyCoverEdit(row, cover, lock) {
  if (!row) return;
  const Applied = window.SSDNSApplied;
  row.cover = Applied && Applied.coverKey ? Applied.coverKey(cover) : (cover || "");
  row.coverLock = !!lock;
  const pid = row.kind === "player" ? (row.playerId || row.id) : "";
  const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
  if (snap) {
    snap.cover = row.cover;
    snap.coverLock = row.coverLock;
  }
  saveRemoteTable();
  renderFight();
  if (pid) DM.pushCommand({ type: "cover", to: pid, payload: { cover: row.cover || "", lock: !!row.coverLock }, from: DM.state.uid });
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
function factionOf(row) {
  if (window.SSDNSApplied && window.SSDNSApplied.factionName) return window.SSDNSApplied.factionName(row);
  return String((row && (row.faction || (row.card && row.card.faction))) || "").trim();
}
function statusClass(label) {
  return "status-" + String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
function statusChipsHtml(row) {
  const bits = [];
  const faction = factionOf(row);
  if (faction) bits.push(`<span class="chip faction">${esc(faction)}</span>`);
  const status = row && row.kind === "enemy" ? enemyStatus(row) : ((row && row.status) || "");
  if (status) bits.push(`<span class="chip status ${statusClass(status)}">${esc(status)}</span>`);
  return bits.length ? `<span class="status-chips">${bits.join("")}</span>` : "";
}
/* UI fixes 1 / U8 (plan 2026-10-21): the fight portraits and the turn strip show the picture when there is one: a
   player's sheet portrait (the snapshot the player card already uses), an enemy's bestiary token art. Initials
   otherwise, and when a picture fails to load (the capture listener below fightOpen drops it). */
function faceArt(row) {
  if (!row) return "";
  if (row.kind === "player") {
    const snap = playerSnapshot(row.playerId || row.id);
    return String((snap && snap.portrait) || row.portrait || "");
  }
  const beast = beastTokenImage(row);
  return beast ? "../map/" + beast : "";
}
function faceHtml(row, cls, initials) {
  const src = faceArt(row);
  return `<span class="${cls}${src ? " has-art" : ""}">${src ? `<img class="face-art" src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ""}<span class="face-initials">${esc(initials)}</span></span>`;
}
function rowInitials(row) {
  const letters = String((row && row.name) || "?").replace(/[^A-Za-z]/g, "");
  return (letters.slice(0, 1) + (letters.length > 1 ? letters.slice(-1) : "")).toUpperCase() || "?";
}
/* UI fixes 1 / U9: once combat starts, each waiting combatant is one line (init, face, name, HP, status, conditions)
   that opens to its full card on tap. Open state is kept per row id across repaints (fightOpen). */
const fightOpen = {};
if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d && d.matches && d.matches("details[data-turn-fold]")) fightOpen[d.getAttribute("data-turn-fold")] = !!d.open;
  }, true);
  document.addEventListener("error", (e) => {
    const im = e.target;
    if (!im || !im.classList || !im.classList.contains("face-art")) return;
    if (im.parentNode && im.parentNode.classList) im.parentNode.classList.remove("has-art");
    if (im.parentNode) im.parentNode.removeChild(im);
  }, true);
}
function foldKey(row, i) { return String((row && row.id) || ("i" + i)); }
function turnLineHtml(row, i) {
  const friendly = row.kind === "enemy" && isFriendly(row);
  const side = row.kind === "player" ? "pc" : (friendly ? "ally" : "enemy");
  const max = row.maxHp != null && row.maxHp !== "" ? row.maxHp : "";
  const hp = row.hp == null || row.hp === "" ? "—" : row.hp;
  const conds = conditionsForRow(row);
  const condNames = conds.map((c) => String((c && (c.name || c)) || "").trim()).filter(Boolean);
  const Cond = window.SSDNSConditions;
  const icons = condNames.slice(0, 3).map((n) => `<span class="tl-cond" title="${esc(n)}">${esc(Cond && Cond.icon ? Cond.icon(n) : "\u25CF")}</span>`).join("") + (condNames.length > 3 ? `<span class="tl-more">+${condNames.length - 3}</span>` : "");
  return `<summary class="turn-line side-${side}" title="${esc((row.name || "") + (condNames.length ? " · " + condNames.join(", ") : ""))}">` +
    `<span class="tl-init">${esc(row.init == null || row.init === "" ? "—" : row.init)}</span>` +
    faceHtml(row, "tl-face", rowInitials(row)) +
    `<span class="tl-name">${esc(row.name || "Someone")}</span>` +
    `<span class="tl-hp">HP ${esc(hp)}${max !== "" ? "/" + esc(max) : ""}</span>` +
    statusChipsHtml(row) +
    (icons ? `<span class="tl-conds" aria-label="${esc(condNames.join(", "))}">${icons}</span>` : "") +
    `<span class="tl-caret" aria-hidden="true">▾</span></summary>`;
}
function foldRowHtml(row, i, full) {
  const key = foldKey(row, i);
  return `<details class="turn-fold" data-turn-fold="${esc(key)}" data-fold-i="${i}"${fightOpen[key] ? " open" : ""}>${turnLineHtml(row, i)}${full}</details>`;
}
function portraitHtml(row, i) {
  const len = fight.order.length || 1;
  const dist = fight.started ? (i - fight.turn + len) % len : 99;
  const current = fight.started && i === fight.turn;
  const ondeck = fight.started && dist > 0 && dist <= 2;
  const later = fight.started && dist > 2;
  const friendly = row.kind === "enemy" && isFriendly(row);
  const side = row.kind === "player" ? "pc" : (friendly ? "ally" : "enemy");
  const letters = String(row.name || "?").replace(/[^A-Za-z]/g, "");
  const initials = (letters.slice(0, 1) + (letters.length > 1 ? letters.slice(-1) : "")).toUpperCase() || "?";
  const cls = "fight-portrait side-" + side + (current ? " current" : "") + (ondeck ? " ondeck" : "") + (later ? " later" : "");
  return `<button type="button" class="${cls}" data-fight-portrait="${i}" title="${esc(row.name || "")}">${faceHtml(row, "portrait-face", initials)}<span class="portrait-name">${esc(row.name || "")}</span><span class="portrait-init">${esc(row.init == null || row.init === "" ? "—" : row.init)}</span>${statusChipsHtml(row)}</button>`;
}
function fightLogCards() {
  const box = $("#fightLog");
  if (!box) return;
  const rows = (DM.state.rolls || []).filter((r) => r && (r.attack || r.weapon || r.crit || /\b(HIT|MISS|CRIT)\b/.test(String(r.detail || "")))).slice(-8).reverse();
  if (!rows.length) {
    box.innerHTML = '<p class="fine fight-log-empty">No attacks yet.</p>';
    return;
  }
  box.innerHTML = rows.map((r) => {
    const rawWeapon = r.weapon || r.label || "";
    const named = window.SSDNSApplied && window.SSDNSApplied.weaponName ? window.SSDNSApplied.weaponName(rawWeapon) : "";
    const weapon = named || rawWeapon || "Attack";
    const who = r.characterName || r.who || "";
    const detail = String(r.detail || "").replace(/\s+/g, " ").trim();
    const tag = (r.crit || /\bCRIT\b/.test(detail)) ? "CRIT" : (/\bMISS\b/.test(detail) ? "MISS" : (/\bHIT\b/.test(detail) ? "HIT" : ""));
    return `<article class="roll-card${tag ? " " + tag.toLowerCase() : ""}"><b>${esc(who)}</b><span class="roll-weapon">${esc(weapon)}</span><span class="roll-detail">${esc(detail)}</span>${tag ? `<span class="roll-tag">${tag}</span>` : ""}</article>`;
  }).join("");
}
function renderFight() {
  const run = () => {
    syncDamageMode();
    absorbFightInputs();
    const list = $("#initList");
    const strip = $("#turnStrip");
    const portraits = $("#fightPortraits");
    const focus = $("#fightFocus");
    const label = $("#initRound");
    if (label) {
      const deck = onDeck();
      const cur = fight.started ? fight.order[fight.turn] : null;
      label.textContent = fight.started && fight.order.length
        ? ("Round " + fight.round + (cur && cur.name ? " · " + cur.name : "") + (deck && deck.name ? " · On deck: " + deck.name : ""))
        : (fight.order.length ? "Round " + fight.round : "");
    }
    renderInspiration();
    const rollAllBtn = $("#btnRollAll");
    if (rollAllBtn) rollAllBtn.hidden = !!fight.started;
    const rollInitBig = $("#btnRollInitAll");
    if (rollInitBig) rollInitBig.hidden = !!fight.started;
    const endHead = $("#btnEndCombatHead");
    if (endHead) endHead.hidden = !(fight.started || (fight.order && fight.order.length));
    if (!fight.order.length) {
      const empty = '<div class="empty"><b>No turn order</b>Add a player or an example creature. Initiative rolls from joined sheets land here.</div>';
      if (list && !(document.activeElement && list.contains(document.activeElement))) list.innerHTML = empty;
      if (strip) strip.innerHTML = "";
      if (portraits) portraits.innerHTML = "";
      if (focus) focus.innerHTML = '<p class="fight-focus-wait">Add a combatant, roll initiative, then Next.</p>';
      fightLogCards();
      paintTurnRules();
      syncTurnState();
      pushMapInitiative();
      return;
    }
    if (fight.turn >= fight.order.length) fight.turn = 0;
    if (portraits) portraits.innerHTML = fight.order.map(portraitHtml).join("");
    const parts = fight.order.map(turnRowHtml);
    const started = !!fight.started;
    if (started && focus) {
      focus.innerHTML = turnMarkersHtml(fight.order[fight.turn]) + (parts[fight.turn] || "");
      if (list) list.innerHTML = parts.map((html, i) => (i === fight.turn ? "" : foldRowHtml(fight.order[i], i, html))).join("") || '<p class="fine">No one else in the order.</p>';
    } else {
      if (focus) focus.innerHTML = '<p class="fight-focus-wait">Roll Initiative, then Next. The active turn lands here.</p>';
      if (list) list.innerHTML = parts.join("");
    }
    fightLogCards();
    paintTurnRules();
    if (strip) {
      const len = fight.order.length;
      const cur = fight.started ? fight.order[fight.turn] : null;
      const chips = fight.order.map((row, i) => {
        const dist = fight.started ? (i - fight.turn + len) % len : 99;
        const current = fight.started && i === fight.turn ? " current" : "";
        const ondeck = fight.started && dist > 0 && dist <= 2 ? " ondeck" : "";
        const later = fight.started && dist > 2 ? " later" : "";
        const friendly = row.kind === "enemy" && isFriendly(row);
        const side = row.kind === "player" ? " side-pc player" : (friendly ? " side-ally" : " side-enemy enemy");
        const letters = String(row.name || "?").replace(/[^A-Za-z]/g, "");
        const initials = (letters.slice(0, 1) + (letters.length > 1 ? letters.slice(-1) : "")).toUpperCase() || "?";
        const face = `${faceHtml(row, "chip-face", initials)}<span class="chip-name">${esc(row.name || "")}</span>${statusChipsHtml(row)}`;
        const guns = stripGuns(row, i);
        if (row.kind === "enemy") return `<div class="turn-chip${current}${ondeck}${later}${side}" role="listitem"><button type="button" class="chip-open" data-open-enemy="${esc(row.id || "")}">${face}</button>${guns}</div>`;
        return `<div class="turn-chip${current}${ondeck}${later}${side}" role="listitem">${face}${guns}</div>`;
      }).join("");
      /* T1 (turn order PR 1): one Next per surface. The Fight tab's Next is the DMCC's; this Table-tab strip shows the order only.
         0.2.132: the row matches the player strip (round, whose turn, pill chips, Action / Bonus / R, Move, Dash / Disengage / Dodge). */
      const badge = cur ? `<b class="dm-turn-now">${esc(cur.name || "Their turn")}</b>` : "";
      strip.innerHTML = `<b class="turn-round">Round ${esc(fight.round || 1)}</b>${badge}` +
        `<button type="button" class="turn-scroll" data-dm-scroll="-1" aria-label="Scroll the turn order left" hidden>\u2039</button>` +
        `<div class="turn-order-strip" id="dmTurnNames" role="list">${chips}</div>` +
        `<button type="button" class="turn-scroll" data-dm-scroll="1" aria-label="Scroll the turn order right" hidden>\u203a</button>` +
        `<span class="dm-strip-acts">${cur ? stripActsHtml(cur) : ""}</span>`;
      fitDmStripScroll();
    }
    syncTurnState();
    pushMapInitiative();
    const sheet = $("#enemySheet");
    if (sheet && !sheet.hidden) renderEnemySheet();
    syncGunClock();
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
let linkBusy = false;
function rowInOrder(row) {
  if (!row) return null;
  return (fight.order || []).find((r) => r && row.id && r.id === row.id) || row;
}
function claimTokenId(row, tokenId) {
  if (!row || !tokenId) return;
  const prev = row.mapTokenId && row.mapTokenId !== tokenId ? row.mapTokenId : "";
  (fight.order || []).forEach((other) => {
    if (other && other !== row && other.mapTokenId === tokenId) delete other.mapTokenId;
  });
  row.mapTokenId = tokenId;
  if (prev && window.SSDNSMapHost && typeof window.SSDNSMapHost.releaseToken === "function") window.SSDNSMapHost.releaseToken(prev);
}
function rememberPlayerToken(row) {
  if (!row || row.kind !== "player" || linkBusy) return;
  const pid = row.playerId || row.id;
  const host = window.SSDNSMapHost;
  const tokenId = host && typeof host.tokenForPlayer === "function" ? host.tokenForPlayer(pid) : "";
  if (!tokenId || row.mapTokenId === tokenId) return;
  claimTokenId(row, tokenId);
}
function addCombatant(row) {
  const pid = row.playerId || (row.kind === "player" ? row.id : "");
  if (pid && row.kind === "player") {
    const snap = DM.state.players[pid] && DM.state.players[pid].snapshot;
    row.dex = dexFromSnapshot(snap);
    if (snap && snap.hpMax != null) row.maxHp = snap.hpMax;
    if (snap && row.cover == null) row.cover = window.SSDNSApplied && window.SSDNSApplied.coverKey ? window.SSDNSApplied.coverKey(snap.cover) : (snap.cover || "");
    if (snap && row.coverLock == null) row.coverLock = !!snap.coverLock;
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
      const live = rowInOrder(existing);
      rememberPlayerToken(live);
      saveRemoteTable();
      renderFight();
      return live;
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
  let live = rowInOrder(row);
  if (live.kind === "player") rememberPlayerToken(live);
  saveRemoteTable();
  renderFight();
  if (live.kind === "enemy") ensurePlayers();
  live = rowInOrder(live);
  return live;
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
  const subject = row.kind === "player" ? (row.playerId || row.id) : row.id;
  const kind = row.kind === "enemy" ? "enemy" : "player";
  return `<span class="cond-row">${list.map((c) => {
    const name = String((c && (c.name || c)) || "").trim();
    const id = c && c.id ? String(c.id) : "";
    return `<span class="cond-chip">${esc(Cond.label(c))}<button type="button" class="cond-x" data-cond-drop="${esc(subject)}" data-cond-kind="${esc(kind)}" data-cond-name="${esc(name)}" data-cond-id="${esc(id)}" aria-label="Remove ${esc(name)}">×</button></span>`;
  }).join("")}</span>`;
}
function dropListedCondition(subjectId, kind, name, condId) {
  const row = (fight.order || []).find((r) => {
    const sid = r && (r.kind === "player" ? (r.playerId || r.id) : r.id);
    return sid === subjectId;
  });
  const current = conditionsForRow(row || { id: subjectId, kind: kind, playerId: kind === "player" ? subjectId : "" });
  const dropName = String(name || "").toLowerCase();
  const names = current.filter((c) => {
    if (condId && c && c.id === condId) return false;
    return String((c && c.name) || "").toLowerCase() !== dropName;
  }).map((c) => ({ name: c.name, rounds: c.rounds, level: c.level }));
  const removeIds = current.filter((c) => (condId && c && c.id === condId) || String((c && c.name) || "").toLowerCase() === dropName).map((c) => c && c.id).filter(Boolean);
  return writeSubjectConditions(subjectId, kind, names, (row && row.name) || "", 1, {}, removeIds);
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
  if (removed.length) {
    const entries = removed.map((id) => existing.filter((row) => row && row.id === id)[0]).filter(Boolean).map((row) => JSON.parse(JSON.stringify(row)));
    rememberUndo({
      type: "condition",
      label: "removed " + entries.map((row) => row.name || "a condition").join(", "),
      playerId: kind === "player" ? subjectId : "all",
      restoreConditions: { subjectId: subjectId, kind: kind, entries: entries }
    });
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
  const before = window.SSDNSTurn ? window.SSDNSTurn.snapshot(fight) : null;
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
  /* T2: stamp the new current combatant's own turn start; Undo last Next can put this back */
  if (window.SSDNSTurn) window.SSDNSTurn.beginTurn(fight, before);
  if (window.SSDNSTurn && window.SSDNSTurn.pruneOa) window.SSDNSTurn.pruneOa(fight);
  if (window.SSDNSAudio) window.SSDNSAudio.play("turn");
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

/**
 * Turn order PR 1 (ruling 3): Previous is the DM's "Undo last Next", behind a confirm. It puts back the round, turn
 * and turn-start stamps from before the last Next, so nobody gets a second set of fresh markers (the redo Next gives
 * the same combatant the same turn key). DM-only: the button lives on the DMCC and the DM map strip only.
 */
function undoLastNext(opts) {
  const T = window.SSDNSTurn;
  if (!fight.order.length || !T) return false;
  if (!T.canUndo(fight)) { DM.toast("Nothing to undo: no Next since the fight started or since the last undo"); return false; }
  const back = fight.undo[0] || {};
  const backRow = back.started ? fight.order[parseInt(back.turn, 10) || 0] : null;
  const ask = "Undo the last Next? The turn goes back to " + (back.started ? ((backRow && backRow.name) || "the previous combatant") + " (round " + (back.round || 1) + ")" : "before the fight started") +
    ". Nobody's action, bonus action or reaction is given back.";
  const yes = opts && opts.confirmed ? true : (typeof window.confirm === "function" ? window.confirm(ask) : false);
  if (!yes) { DM.toast("Kept the turn as it is"); return false; }
  T.undoNext(fight);
  turnGate = 0;
  if (window.SSDNSAudio) window.SSDNSAudio.play("ui-back");
  saveRemoteTable();
  renderFight();
  const cur = fight.started ? fight.order[fight.turn] : null;
  const line = "DM undid the last Next · " + (fight.started ? "Round " + fight.round + " · " + ((cur && cur.name) || "someone") + "'s turn" : "fight not started");
  DM.toast(line);
  DM.pushLedger({ who: "DM", playerId: (cur && (cur.playerId || cur.id)) || "all", type: "combat", what: line, oldVal: null, newVal: "undo", flag: false });
  return true;
}
/* T2 / ruling 10: the current combatant's markers on the DMCC focus card. A player's come from their sheet
   (players/{uid}/turnMarkers, read only here); an enemy's are the DM's own toggles, kept on table/initiative.
   Enemy markers never warn. */
function turnMarkersFor(row) {
  const T = window.SSDNSTurn;
  if (!T || !row) return null;
  const init = turnState();
  if (row.kind === "player") {
    const p = DM.state.players && DM.state.players[row.playerId || row.id];
    return { mine: false, m: T.markersFor(p && p.turnMarkers, init, row).markers };
  }
  return { mine: true, m: T.markersFor((fight.markers || {})[row.id], init, row).markers };
}
function turnMarkersHtml(row) {
  const got = turnMarkersFor(row);
  if (!got) return "";
  const m = got.m;
  /* turn order PR 2 (item 8): the DM taps a player's markers too; those edits go to the player's sheet */
  const pid = row.kind === "player" ? (row.playerId || row.id || "") : "";
  const pip = (k, label) => got.mine
    ? `<button type="button" class="pip pip-${k}${m[k] ? " used" : ""}" data-dm-pip="${k}" aria-pressed="${!!m[k]}" title="${label} ${m[k] ? "used" : "ready"} (click to mark ${m[k] ? "ready" : "used"})">${label}</button>`
    : `<button type="button" class="pip pip-${k}${m[k] ? " used" : ""}" data-dm-pip="${k}" data-pip-pid="${esc(pid)}" aria-pressed="${!!m[k]}" title="${label} ${m[k] ? "used" : "ready"} on the player's sheet (click to mark ${m[k] ? "ready" : "used"})">${label}</button>`;
  const extra = got.mine ? "" : markerExtrasHtml(row, m) + `<button type="button" class="btn xs" data-pip-reset="${esc(pid)}" title="Give back this player's action, bonus action, reaction and movement">Reset</button>`;
  return `<div class="dm-turn-markers act-pips" data-turn-markers="${esc(row.id || "")}"><span class="pip-label">${got.mine ? "This turn" : "Player's turn"}</span>${pip("action", "Action")}${pip("bonus", "Bonus")}${pip("reaction", "R")}${extra}</div>`;
}
/* ---- turn order PR 2 (Jessey's rulings 2026-10-21 / 2026-10-22 4:32 AM CT): DMCC side ----
   item 1  "Unlock this turn": fight.unlock[playerId] = seq; the sheet's off-turn lock opens until the DM's next Next
   item 4  opportunity attacks: a player's ask (encounter/requests type "oa") lands in fight.oa; Approve / Deny here
   item 7  out-of-turn damage / healing waits in fight.held for the DM's Apply instead of applying on its own
   items 8, 9  the DM edits or resets any player's Action / Bonus / R (players/{uid}/turnMarkers, by: "dm") */
function playerSpeed(pid) {
  const snap = playerSnapshot(pid) || {};
  const n = parseInt(snap.speed, 10);
  return isFinite(n) && n >= 0 ? n : 30;
}
function combatantSpeed(row) {
  if (!row) return 30;
  if (row.kind === "player") return playerSpeed(row.playerId || row.id);
  const raw = row.speed != null && row.speed !== "" ? row.speed : (row.card && row.card.speed);
  const n = parseInt(raw, 10);
  return isFinite(n) && n >= 0 ? n : 30;
}
function tokenIsRow(token, row) {
  if (!token || !row) return false;
  if (token.combatantId && token.combatantId === row.id) return true;
  if (token.id && (token.id === row.id || token.id === row.mapTokenId)) return true;
  if (row.playerId && token.ownerUid === row.playerId) return true;
  if (row.kind === "player" && row.id && token.ownerUid === row.id) return true;
  return false;
}
function markerExtrasHtml(row, m, opts) {
  const T = window.SSDNSTurn;
  if (!T || !row) return "";
  if (row.kind !== "player") {
    /* Enemy turn on the DM strip: the same Move feet and Dash the player strip uses, stored on fight.markers. */
    if (!(opts && opts.pills)) return "";
    const mvE = T.moveLeft(m, combatantSpeed(row));
    const moveE = `<span class="fine tr-move tl-move" data-tl-left="${mvE.left}" title="Movement left this turn">Move ${mvE.left}/${mvE.max} ft</span>`;
    const steps = `<button type="button" class="btn xs tl-step" data-dm-move="5" title="This enemy moved 5 ft">−</button><button type="button" class="btn xs tl-step" data-dm-move="-5" title="Give back 5 ft">+</button>`;
    const acts = ["dash", "disengage", "dodge"].map((k) => {
      const label = k === "dash" ? "Dash" : (k === "disengage" ? "Disengage" : "Dodge");
      return `<button type="button" class="btn xs tl-act${m[k] ? " on" : ""}" data-dm-act="${k}" aria-pressed="${!!m[k]}">${label}</button>`;
    }).join("");
    return moveE + steps + acts;
  }
  const mv = T.moveLeft(m, playerSpeed(row.playerId || row.id));
  /* Keep "Move N/N ft" as one text run. Tests match that string. */
  const move = `<span class="fine tr-move tl-move" title="Movement left this turn">Move ${mv.left}/${mv.max} ft</span>`;
  if (opts && opts.pills) {
    const pills = ["dash", "disengage", "dodge"].map((k) => {
      const label = k === "dash" ? "Dash" : (k === "disengage" ? "Disengage" : "Dodge");
      return `<span class="tl-act${m[k] ? " on" : ""}">${label}</span>`;
    }).join("");
    return move + pills;
  }
  const flags = ["dash", "disengage", "dodge"].filter((k) => m[k]).map((k) => `<span class="badge eld">${k === "dash" ? "Dash" : (k === "disengage" ? "Disengage" : "Dodge")}</span>`).join("");
  return move + flags;
}
/* DM strip (0.2.132): the same pills as the player strip. Action / Bonus / R stay the existing marker buttons.
   Dash / Disengage / Dodge are a read-out of flags the sheet already stores. Nothing new is spent from here. */
function stripActsHtml(row) {
  const got = turnMarkersFor(row);
  if (!got || !fight.started) return "";
  const m = got.m;
  const pid = row.kind === "player" ? (row.playerId || row.id || "") : "";
  const pip = (k, label) => {
    const who = got.mine ? "" : ` data-pip-pid="${esc(pid)}"`;
    return `<button type="button" class="pip pip-${k}${m[k] ? " used" : ""}" data-dm-pip="${k}"${who} aria-pressed="${!!m[k]}" title="${label} ${m[k] ? "used" : "ready"}">${label}</button>`;
  };
  return `<span class="tl-box dm-strip-acts-inner">${pip("action", "Action")}${pip("bonus", "Bonus")}${pip("reaction", "R")}${markerExtrasHtml(row, m, { pills: true })}</span>`;
}
function fitDmStripScroll() {
  const strip = $("#turnStrip");
  if (!strip) return;
  const lane = strip.querySelector(".turn-order-strip");
  const over = !!(lane && lane.scrollWidth > lane.clientWidth + 4);
  strip.querySelectorAll("[data-dm-scroll]").forEach((b) => { b.hidden = !over; });
}
function playerRowFor(pid) {
  return (fight.order || []).find((r) => r && r.kind === "player" && (r.playerId === pid || (!r.playerId && r.id === pid))) || null;
}
function playerMarkers(pid) {
  const T = window.SSDNSTurn;
  const row = playerRowFor(pid);
  if (!T || !row) return null;
  const p = DM.state.players && DM.state.players[pid];
  return T.markersFor(p && p.turnMarkers, turnState(), row).markers;
}
function writePlayerMarkers(pid, m, note) {
  const out = Object.assign({}, m, { by: "dm", dmAt: new Date().toISOString(), dmNote: note || "", updatedAt: new Date().toISOString() });
  DM.state.players = DM.state.players || {};
  if (DM.state.players[pid]) DM.state.players[pid].turnMarkers = out;
  if (!DM.state.demo && DM.state.db && DM.state._fb) {
    DM.state._fb.set(DM.roomRef("players/" + pid + "/turnMarkers"), out).catch((err) => { if (DM.writeFailed) DM.writeFailed(err, "Couldn't change the player's markers"); });
  }
  renderFight();
  /* the map's DM card shows the same markers: redraw it if it is open */
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshCard) { try { window.SSDNSMapHost.refreshCard(""); } catch (e) {} }
  return out;
}
const PIP_NAME = { action: "Action", bonus: "Bonus action", reaction: "Reaction" };
function editPlayerMarker(pid, kind) {
  const m = playerMarkers(pid);
  if (!m || !PIP_NAME[kind]) return null;
  m[kind] = !m[kind];
  if (kind === "action") { m.attacks = 0; m.actionBy = m.action ? "manual" : ""; }
  const who = (playerRowFor(pid) || {}).name || "the player";
  const note = "The DM marked your " + PIP_NAME[kind].toLowerCase() + " " + (m[kind] ? "used" : "ready") + ".";
  DM.toast(PIP_NAME[kind] + " marked " + (m[kind] ? "used" : "ready") + " for " + who);
  return writePlayerMarkers(pid, m, note);
}
function resetPlayerMarkers(pid) {
  const T = window.SSDNSTurn;
  const row = playerRowFor(pid);
  if (!T || !row) return null;
  const m = T.fresh(T.keyFor(turnState(), row) || ((playerMarkers(pid) || {}).turnKey || ""));
  DM.toast("Markers reset for " + (row.name || "the player"));
  DM.pushLedger({ who: "DM", playerId: pid, type: "combat", what: "DM reset " + (row.name || "a player") + "'s action, bonus action, reaction and movement", oldVal: null, newVal: "reset", flag: false });
  return writePlayerMarkers(pid, m, "The DM gave back your action, bonus action, reaction and movement.");
}
function toggleUnlock(pid) {
  const T = window.SSDNSTurn;
  if (!T || !pid) return false;
  const on = T.unlocked(turnState(), pid);
  fight.unlock = Object.assign({}, fight.unlock || {});
  if (on) delete fight.unlock[pid]; else fight.unlock[pid] = fight.seq || 0;
  const who = (playerRowFor(pid) || {}).name || "a player";
  const line = on ? "DM locked " + who + " to their own turn again" : "DM unlocked " + who + " for this turn";
  DM.toast(line);
  DM.pushLedger({ who: "DM", playerId: pid, type: "combat", what: line, oldVal: null, newVal: on ? "locked" : "unlocked", flag: false });
  saveRemoteTable();
  renderFight();
  return !on;
}
function noteOaRequest(req, id) {
  if (!req || !id || (fight.oa && fight.oa[id])) return false;
  const who = req.characterName || ((playerRowFor(req.from) || {}).name) || "A player";
  fight.oa = Object.assign({}, fight.oa || {});
  fight.oa[id] = { from: req.from || "", name: who, target: req.targetName || "", targetId: req.targetId || "", status: "ask", seq: fight.seq || 0, ts: req.ts || new Date().toISOString() };
  if (!DM.state.demo && DM.state._fb && DM.state.db) DM.state._fb.update(DM.roomRef("encounter/requests/" + id), { resolved: true }).catch(() => {});
  if (window.SSDNSAudio) window.SSDNSAudio.play("ui-tick");
  DM.toast(who + " asks for an opportunity attack" + (req.targetName ? " on " + req.targetName : ""));
  saveRemoteTable();
  renderFight();
  return true;
}
function answerOa(id, yes) {
  const e = fight.oa && fight.oa[id];
  if (!e || e.status !== "ask") return false;
  fight.oa = Object.assign({}, fight.oa, { [id]: Object.assign({}, e, { status: yes ? "approved" : "denied", at: new Date().toISOString() }) });
  const line = "DM " + (yes ? "approved" : "denied") + " " + (e.name || "a player") + "'s opportunity attack" + (e.target ? " on " + e.target : "");
  DM.toast(line);
  DM.pushLedger({ who: "DM", playerId: e.from || "all", type: "combat", what: line, oldVal: null, newVal: yes ? "approved" : "denied", flag: false });
  saveRemoteTable();
  renderFight();
  return true;
}
/* item 7: a hit / heal from someone acting out of turn waits for the DM instead of applying on its own */
function heldOutOfTurn(src) {
  const T = window.SSDNSTurn;
  if (!T || !src || !fight.started) return false;
  const from = src.from || src.playerId || src.uid || "";
  const roll = { playerId: from, uid: src.uid || from, oa: src.oa || "" };
  return T.outOfTurn(roll, { started: !!fight.started, current: fight.order[fight.turn] || null, dmUid: DM.state.uid, oa: fight.oa || {} });
}
function holdHit(meta, line) {
  const key = meta.rollId || DM.uid("held");
  if (fight.appliedHits[key]) return false;
  fight.held = Object.assign({}, fight.held || {});
  if (fight.held[key]) return false;
  fight.held[key] = Object.assign({}, meta, { rollId: meta.rollId || "", line: line || "", ts: new Date().toISOString() });
  DM.toast((line || "Out-of-turn hit") + " · out of turn: waiting for your OK");
  saveLocalTable();
  renderFight();
  return true;
}
function releaseHeld(key, apply) {
  const meta = fight.held && fight.held[key];
  if (!meta) return false;
  fight.held = Object.assign({}, fight.held);
  delete fight.held[key];
  saveLocalTable();
  if (apply) applyPlayerHit(meta);
  else DM.toast("Skipped: " + (meta.line || "out-of-turn hit"));
  renderFight();
  return true;
}
function turnRulesHtml() {
  const T = window.SSDNSTurn;
  if (!T || !fight.started || !fight.order.length) return "";
  const init = turnState();
  const asks = Object.keys(fight.oa || {}).map((id) => Object.assign({ id: id }, fight.oa[id])).filter((e) => e.status === "ask");
  const held = Object.keys(fight.held || {}).map((k) => Object.assign({ key: k }, fight.held[k]));
  let h = "";
  if (asks.length) {
    h += `<div class="tr-sec tr-oa"><b class="tr-head">Opportunity attacks to approve</b>` + asks.map((e) =>
      `<div class="tr-row" data-oa-row="${esc(e.id)}"><span><b>${esc(e.name || "A player")}</b> → ${esc(e.target || "no target picked")}</span>
        <button type="button" class="btn sm btn-primary" data-oa-ok="${esc(e.id)}">Approve</button>
        <button type="button" class="btn sm" data-oa-no="${esc(e.id)}">Deny</button></div>`).join("") + `</div>`;
  }
  if (held.length) {
    h += `<div class="tr-sec tr-held"><b class="tr-head">Out of turn, waiting for your OK</b>` + held.map((x) =>
      `<div class="tr-row" data-held-row="${esc(x.key)}"><span>${esc(x.line || ((x.characterName || "Someone") + (x.heal ? " heals " : " hits ") + (x.targetName || "a target") + " for " + x.amount))}</span>
        <button type="button" class="btn sm btn-primary" data-held-ok="${esc(x.key)}">Apply ${esc(x.amount)}</button>
        <button type="button" class="btn sm" data-held-no="${esc(x.key)}">Skip</button></div>`).join("") + `</div>`;
  }
  const players = fight.order.filter((r) => r && r.kind === "player");
  if (players.length) {
    h += `<div class="tr-sec tr-players"><b class="tr-head">Players' markers <span class="fine">(tap to change)</span></b>` + players.map((row) => {
      const pid = row.playerId || row.id || "";
      const m = playerMarkers(pid) || T.fresh("");
      const mine = T.isTurnOf(init, row);
      const open = T.unlocked(init, pid);
      return `<div class="tr-row act-pips${mine ? " is-turn" : ""}" data-tr-pid="${esc(pid)}" data-turn-markers="${esc(row.id || "")}">
        <span class="tr-name"><b>${esc(row.name || "Player")}</b> <span class="fine">${mine ? "their turn" : (open ? "unlocked this turn" : "waiting")}</span></span>
        ${["action", "bonus", "reaction"].map((k) => `<button type="button" class="pip pip-${k}${m[k] ? " used" : ""}" data-dm-pip="${k}" data-pip-pid="${esc(pid)}" aria-pressed="${!!m[k]}" title="${PIP_NAME[k]} ${m[k] ? "used" : "ready"} (click to mark ${m[k] ? "ready" : "used"})">${k === "action" ? "Action" : (k === "bonus" ? "Bonus" : "R")}</button>`).join("")}
        ${markerExtrasHtml(row, m)}
        <button type="button" class="btn xs" data-pip-reset="${esc(pid)}" title="Give back this player's action, bonus action, reaction and movement">Reset</button>
        ${mine ? "" : `<button type="button" class="btn xs${open ? " on" : ""}" data-turn-unlock="${esc(pid)}" aria-pressed="${open}" title="${open ? "Lock this player to their own turn again" : "Let this player use their attacks, spells and actions until your next Next"}">${open ? "Lock again" : "Unlock this turn"}</button>`}
      </div>`;
    }).join("") + `</div>`;
  }
  return h;
}
function paintTurnRules() {
  const box = $("#turnRules");
  if (!box) return;
  const html = turnRulesHtml();
  box.hidden = !html;
  if (box.innerHTML !== html) box.innerHTML = html;
  /* Turn UX on the map: the map's turn strip shows the current player's markers; keep it in step */
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshStrip) { try { window.SSDNSMapHost.refreshStrip(); } catch (e) {} }
}
/** Map DM drawer (item 8/9): the same markers + Reset for a player's token, by combatant id. */
function mapMarkersHtml(combatantId) {
  const row = (fight.order || []).find((r) => r && (r.id === combatantId || r.playerId === combatantId || r.mapTokenId === combatantId));
  if (!row || !fight.started || !window.SSDNSTurn) return "";
  /* Enemy turn on the DM map: the same Move feet and Dash / Disengage / Dodge as the fight strip. */
  if (row.kind !== "player") {
    const m = enemyMarkersNow(row) || window.SSDNSTurn.fresh("");
    return `<div class="ssm-markers act-pips tl-box" data-turn-markers="${esc(row.id || "")}">` +
      markerExtrasHtml(row, m, { pills: true }) + `</div>`;
  }
  const pid = row.playerId || row.id || "";
  const m = playerMarkers(pid) || window.SSDNSTurn.fresh("");
  return `<div class="ssm-markers act-pips tl-box" data-turn-markers="${esc(row.id || "")}" data-tr-pid="${esc(pid)}">` +
    ["action", "bonus", "reaction"].map((k) => `<button type="button" class="pip pip-${k}${m[k] ? " used" : ""}" data-dm-pip="${k}" data-pip-pid="${esc(pid)}" aria-pressed="${!!m[k]}" title="${PIP_NAME[k]} ${m[k] ? "used" : "ready"} (click to mark ${m[k] ? "ready" : "used"})">${k === "action" ? "Action" : (k === "bonus" ? "Bonus" : "R")}</button>`).join("") +
    markerExtrasHtml(row, m, { pills: true }) +
    `<button type="button" class="btn xs" data-pip-reset="${esc(pid)}" title="Give back this player's action, bonus action, reaction and movement">Reset</button></div>`;
}
function toggleEnemyMarker(kind) {
  const T = window.SSDNSTurn;
  const cur = fight.started ? fight.order[fight.turn] : null;
  if (!T || !cur || cur.kind === "player" || ["action", "bonus", "reaction"].indexOf(kind) < 0) return;
  const m = T.markersFor((fight.markers || {})[cur.id], turnState(), cur).markers;
  m[kind] = !m[kind];
  fight.markers = Object.assign({}, fight.markers || {}, { [cur.id]: m });
  saveRemoteTable();
  renderFight();
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshMove) { try { window.SSDNSMapHost.refreshMove(); } catch (e) {} }
}
function enemyMarkersNow(cur) {
  const T = window.SSDNSTurn;
  if (!T || !cur) return null;
  return T.markersFor((fight.markers || {})[cur.id], turnState(), cur).markers;
}
function adjustEnemyMove(delta) {
  const T = window.SSDNSTurn;
  const cur = fight.started ? fight.order[fight.turn] : null;
  if (!T || !cur || cur.kind === "player") return;
  const m = enemyMarkersNow(cur);
  const mv = T.moveLeft(m, combatantSpeed(cur));
  let d = parseInt(delta, 10) || 0;
  if (d > 0) d = Math.min(d, mv.left);
  if (d < 0) d = -Math.min(-d, mv.used);
  if (!d) { DM.toast(d === 0 && mv.left <= 0 && (parseInt(delta, 10) || 0) > 0 ? "No movement left this turn" : "Movement unchanged"); return; }
  m.moveUsed = Math.max(0, (parseInt(m.moveUsed, 10) || 0) + d);
  fight.markers = Object.assign({}, fight.markers || {}, { [cur.id]: m });
  saveRemoteTable();
  renderFight();
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshMove) { try { window.SSDNSMapHost.refreshMove(); } catch (e) {} }
}
function toggleEnemyAct(kind) {
  const T = window.SSDNSTurn;
  const cur = fight.started ? fight.order[fight.turn] : null;
  if (!T || !cur || cur.kind === "player" || ["dash", "disengage", "dodge"].indexOf(kind) < 0) return;
  const m = enemyMarkersNow(cur);
  const label = kind === "dash" ? "Dash" : (kind === "disengage" ? "Disengage" : "Dodge");
  if (m[kind]) {
    const sp = combatantSpeed(cur);
    if (kind === "dash" && (parseInt(m.moveUsed, 10) || 0) > sp) {
      DM.toast(cur.name + " has moved past " + sp + " ft, so Dash stays on until those feet are given back.");
      return;
    }
    m[kind] = false;
    if (m.actionBy === kind) { m.action = false; m.actionBy = ""; }
    DM.toast("Cancelled " + label + " for " + (cur.name || "the enemy"));
  } else if (m.action) {
    DM.toast(label + " needs the Action, and " + (cur.name || "this enemy") + " has already used it.");
    return;
  } else {
    m.action = true;
    m.actionBy = kind;
    m[kind] = true;
    const mv = T.moveLeft(m, combatantSpeed(cur));
    DM.toast(kind === "dash" ? (label + ": movement is " + mv.max + " ft this turn.") : (label + " for " + (cur.name || "the enemy") + "."));
  }
  fight.markers = Object.assign({}, fight.markers || {}, { [cur.id]: m });
  saveRemoteTable();
  renderFight();
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshMove) { try { window.SSDNSMapHost.refreshMove(); } catch (e) {} }
}
function movementBudgetForToken(token) {
  const T = window.SSDNSTurn;
  if (!T || !fight.started) return { free: true, active: false, left: 100000, max: 100000, speed: 0, dash: false, disengage: false };
  const cur = fight.order[fight.turn] || null;
  if (!cur || (token && !tokenIsRow(token, cur))) return { free: false, active: false, left: 0, max: 0, speed: 0, dash: false, disengage: false };
  const got = turnMarkersFor(cur);
  const sp = combatantSpeed(cur);
  const mv = T.moveLeft(got && got.m, sp);
  return { free: false, active: true, left: mv.left, max: mv.max, speed: sp, dash: !!(got && got.m && got.m.dash), disengage: !!(got && got.m && got.m.disengage), combatantId: cur.id, kind: cur.kind };
}
function spendMoveForToken(token, feet) {
  const T = window.SSDNSTurn;
  const n = parseInt(feet, 10) || 0;
  if (!T || !n || !fight.started) return false;
  const cur = fight.order[fight.turn] || null;
  if (!cur || (token && !tokenIsRow(token, cur))) return false;
  if (cur.kind === "player") {
    const pid = cur.playerId || cur.id;
    const m = playerMarkers(pid);
    if (!m) return false;
    m.moveUsed = Math.max(0, (parseInt(m.moveUsed, 10) || 0) + n);
    writePlayerMarkers(pid, m, "Moved " + n + " ft on the map.");
    if (window.SSDNSMapHost && window.SSDNSMapHost.refreshMove) { try { window.SSDNSMapHost.refreshMove(); } catch (e) {} }
    return true;
  }
  const m = enemyMarkersNow(cur);
  m.moveUsed = Math.max(0, (parseInt(m.moveUsed, 10) || 0) + n);
  fight.markers = Object.assign({}, fight.markers || {}, { [cur.id]: m });
  saveRemoteTable();
  renderFight();
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshMove) { try { window.SSDNSMapHost.refreshMove(); } catch (e) {} }
  return true;
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
    if (window.SSDNSApplied && window.SSDNSApplied.markHpExpect) window.SSDNSApplied.markHpExpect(row, after);
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
  if (window.SSDNSAudio && kind === "heal") window.SSDNSAudio.play("heal");
  DM.toast(kind + " " + amount + " → " + (names.characterName || "player"));
}

async function rest(kind) {
  const ids = Object.keys(DM.state.players);
  for (let i = 0; i < ids.length; i++) {
    await DM.pushCommand({ type: "rest", to: ids[i], payload: { kind: kind }, from: DM.state.uid });
  }
  /* L0188: when the DM picked "long rest" (or both) as the end of a day, the day passes for food & water */
  if (kind === "long" && window.SSDNSSuppliesDm && window.SSDNSSuppliesDm.onLongRest) {
    try { await window.SSDNSSuppliesDm.onLongRest(); } catch (e) { console.warn("[supplies] long rest", e); }
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
/* L0193: the campaign act the stores sell for. Room setting meta.act (missing = Act I). Before a room exists,
   the pick is kept on this device so the store preview still follows it. */
let localStoreAct = 1;
function storeAct() {
  const Stock = window.SSDNSStore;
  const raw = DM.state && DM.state.meta && DM.state.meta.act != null ? DM.state.meta.act : localStoreAct;
  return Stock && Stock.normAct ? Stock.normAct(raw) : 1;
}
function actItems() {
  const Stock = window.SSDNSStore;
  return Stock && Stock.forAct ? Stock.forAct(storeItems, storeAct()) : storeItems;
}
async function setStoreAct(act) {
  const Stock = window.SSDNSStore;
  const n = Stock.normAct(act);
  localStoreAct = n;
  if (DM.state.meta) {
    DM.state.meta = Object.assign({}, DM.state.meta, { act: n });
    if (!DM.state.demo && DM.state._fb && DM.state.db) {
      try { await DM.state._fb.update(DM.roomRef("meta"), { act: n }); } catch (e) { DM.toast("Act not saved to the room"); }
    }
  }
  Object.keys(storeDraft).forEach((id) => { if (storeDraft[id]) storeDraft[id].lines = Stock.gateLines(storeDraft[id].lines || [], n, storeItems); });
  const before = (fight.stock || []).length;
  fight.stock = Stock.gateLines(fight.stock || [], n, storeItems);
  saveStorePreview();
  if (fight.storeOpen || before) await saveRemoteTable();
  DM.toast("Stores sell for " + Stock.actLabel(n) + (n === 1 ? ": Light ChaosMaker only, 4,000 ES" : ""));
  renderStorePanel();
}
function loadStorePreview() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_PREVIEW_KEY) || "null");
    if (!raw) return;
    if (raw.town) storeTown = raw.town;
    if (raw.on) Object.keys(storeOn).forEach((id) => { if (raw.on[id] != null) storeOn[id] = !!raw.on[id]; });
    if (raw.draft) Object.keys(raw.draft).forEach((id) => { storeDraft[id] = raw.draft[id]; if (window.SSDNSRenames && raw.draft[id]) window.SSDNSRenames.lines(raw.draft[id].lines); });
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
  const jam = window.SSDNSTestJammer && window.SSDNSTestJammer.weapon ? window.SSDNSTestJammer.weapon() : null;
  if (jam && jam.name) add(jam.name, jam.cost || "0", "gun");
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
      const thumb = window.SSDNSItemArt && window.SSDNSItemArt.thumbHtml ? window.SSDNSItemArt.thumbHtml(item) : "";
      return `<tr>
        <td data-label="Name">${thumb}${esc(item.name)}</td>
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
  const actSel = $("#storeAct");
  if (actSel && document.activeElement !== actSel) actSel.value = String(storeAct());
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
    rows = Stock.merchantStock(actItems(), Math.random).map((it) => {
      const line = Stock.lineFromItem(it, "traveling", false);
      line.price = it.price;
      line.checked = it.price != null && it.price !== "";
      line.ref = it.price_es == null;
      return line;
    });
    draft.mode = "draw";
  } else if (mode === "random") {
    rows = Stock.randomStock(actItems(), storeId, storeTown, Math.random).map((it) => Stock.lineFromItem(it, storeId, false));
    draft.mode = "random";
  } else if (mode === "rare") {
    draft.lines = Stock.slipRare(draft.lines || [], actItems(), Math.random);
    draft.mode = draft.mode || "draw";
    draft.phase = "preview";
    saveStorePreview();
    renderStorePanel();
    return;
  } else {
    rows = Stock.stockableCommons(actItems(), storeId, storeTown).map((it) => Stock.lineFromItem(it, storeId, false));
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
  draft.lines = Stock.gateLines(draft.lines || [], storeAct(), storeItems);
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
    <label class="store-line-name"><input type="checkbox" data-preview-check="${esc(storeId)}" data-line="${i}"${line.checked ? " checked" : ""}> <b>${esc((window.SSDNSRenames ? window.SSDNSRenames.text(line.name) : line.name) || "Item")}</b> <span class="chip">${esc(line.rarity || "")}</span> ${ref}</label>
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
  const Gate = window.SSDNSStore;
  box.innerHTML = ids.map((id) => {
    const draft = ensureDraft(id);
    if (Gate && Gate.gateLines && draft.phase !== "live") draft.lines = Gate.gateLines(draft.lines || [], storeAct(), storeItems);
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
          <span class="store-line-name"><b>${esc((window.SSDNSRenames ? window.SSDNSRenames.text(row.name) : row.name) || "Item")}</b>${row.ref ? ' <span class="ref-tag">ref</span>' : ""}</span>
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
  actItems().forEach((it) => { if (it && it.id) byId[it.id] = it; });
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
/* L0195 (2026-10-20): a draft stat block (draft: true, e.g. the Elder Thunderbird until Act IV is scoped) is kept out of
   normal picking the same way a parked one is: hidden unless "Show parked & draft" is on, and badged "Draft". */
function isParkedBeast(b) { return !!(b && (b.parked || b.draft)); }
function showParkedBeasts() {
  const el = $("#beastParked");
  return !!(el && el.checked);
}
function visibleBeasts() {
  const q = beastQuery();
  const parked = showParkedBeasts();
  return (fight.bestiary || []).filter((b) => {
    if (!b || b.template) return false;
    if (isParkedBeast(b) && !parked) return false;
    if (!q) return true;
    return [b.name, b.bookName, b.aka, b.id].join(" ").toLowerCase().indexOf(q) >= 0;
  });
}
function mergeBestiary(fileList, saved) {
  const base = Array.isArray(fileList) ? fileList : [];
  const fileIds = {};
  base.forEach((b) => { if (b && b.id) fileIds[b.id] = 1; });
  const names = {};
  const custom = [];
  (saved || []).forEach((b) => {
    if (!b || !b.id || b.example || b.template) return;
    if (fileIds[b.id]) {
      if (b.name) names[b.id] = b.name;
      return;
    }
    // A saved id missing from the file is a leftover copy. Keep a true custom entry.
    if (b.custom === true || !b.source) custom.push(b);
  });
  const out = base.map((b) => {
    if (!b || !names[b.id] || names[b.id] === b.name) return b;
    return Object.assign({}, b, { name: names[b.id] });
  });
  custom.forEach((b) => out.push(b));
  return out;
}
function beastRecord(id) {
  if (!id) return null;
  return (fight.bestiary || []).filter((b) => b && b.id === id && !b.template)[0] || null;
}
function gunMemory(attacks) {
  return (attacks || []).map((atk) => atk && ({
    id: atk.id || "",
    name: atk.name || "",
    loaded: atk.loaded,
    jammed: !!atk.jammed,
    dirty: !!atk.dirty,
    fouled: !!atk.fouled,
    ruined: !!atk.ruined,
    misStreak: Number(atk.misStreak) || 0,
    pendingD4: !!atk.pendingD4,
    pendingD4Rolls: atk.pendingD4Rolls || null,
    lastRoll: atk.lastRoll || null,
    /* Mech PR A: a rebuilt card keeps the DM's added spare rounds and the chambers a 3rd misfire locked */
    spare: atk.spare,
    lockedChambers: Array.isArray(atk.lockedChambers) ? atk.lockedChambers.slice() : null
  })).filter(Boolean);
}
function restoreGuns(attacks, prev) {
  (attacks || []).forEach((atk, n) => {
    if (!atk) return;
    const old = (prev || []).filter((p) => (atk.id && p.id === atk.id) || (atk.name && p.name === atk.name))[0] || (prev || [])[n];
    if (!old) return;
    if (atk.capacity != null && old.loaded != null && old.loaded !== "" && isFinite(Number(old.loaded))) atk.loaded = Number(old.loaded);
    if (old.jammed) atk.jammed = true;
    if (old.dirty) atk.dirty = true;
    if (old.fouled) atk.fouled = true;
    if (old.ruined) atk.ruined = true;
    if (old.misStreak) atk.misStreak = old.misStreak;
    if (old.pendingD4) { atk.pendingD4 = true; atk.pendingD4Rolls = old.pendingD4Rolls; }
    if (old.lastRoll) atk.lastRoll = old.lastRoll;
    if (atk.capacity != null && old.spare != null && old.spare !== "" && isFinite(Number(old.spare))) atk.spare = Number(old.spare);
    if (atk.capacity != null && Array.isArray(old.lockedChambers) && old.lockedChambers.length) atk.lockedChambers = old.lockedChambers.slice();
  });
}
function normalizeAttackMisfires(attacks) {
  const num = window.SSDNSApplied && window.SSDNSApplied.misfireNumber;
  if (!num) return;
  (attacks || []).forEach((atk) => {
    if (!atk || atk.misfire == null || atk.misfire === "") return;
    const n = num(atk.misfire);
    if (n != null) atk.misfire = n;
  });
}
function ensureCombatantCard(row) {
  if (!row || row.kind === "player" || !window.SSDNSApplied || !window.SSDNSApplied.enemyCardModel) return;
  normalizeAttackMisfires(row.card && row.card.attacks);
  normalizeAttackMisfires(row.attackList);
  const beast = beastRecord(row.beastId);
  if (!beast) {
    const listed = row.attackList || [];
    if (!listed.length) return;
    if (row.card && row.card.attacks && row.card.attacks.length) return;
    const prev = gunMemory((row.card && row.card.attacks) || listed);
    const next = window.SSDNSApplied.enemyCardModel(row);
    restoreGuns(next.attacks, prev);
    row.card = next;
    return;
  }
  const stamp = (beast.id || "") + "|" + (beast.attacks || "");
  if (row._cardStamp === stamp && row.card && row.card.attacks && row.card.attacks.length) return;
  const prev = gunMemory((row.card && row.card.attacks) || row.attackList);
  const prevSlots = row.card && row.card.slots;
  const pub = !!(row.card && row.card.public);
  const next = window.SSDNSApplied.enemyCardModel(beast);
  restoreGuns(next.attacks, prev);
  if (prevSlots && next.slots) {
    Object.keys(next.slots).forEach((lv) => {
      if (prevSlots[lv] && prevSlots[lv].left != null) next.slots[lv].left = prevSlots[lv].left;
    });
  }
  if (pub) next.public = true;
  row.card = next;
  row.attackList = beast.attackList || [];
  row.attacks = beast.attacks || row.attacks || "";
  row._cardStamp = stamp;
}
function refreshFightCards() {
  (fight.order || []).forEach(ensureCombatantCard);
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
    noHpPool: !(Number(b.hp) > 0),
    dex: stats.dex,
    initBonus: stats.initBonus,
    atkBonus: stats.atkBonus,
    damage: stats.damage,
    attacks: stats.attacks || b.attacks || "",
    attackList: b.attackList || [],
    speed: b.speed,
    cr: b.cr,
    size: b.size || "Medium", /* token size: Large 2x2, Huge 3x3, Gargantuan 4x4 on the map */
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
      <h3><button type="button" class="name-btn" data-open-beast="${esc(b.id)}">${esc(b.name)}</button>${b.parked ? ' <span class="badge">Parked</span>' : ""}${b.draft ? ' <span class="badge" title="' + esc(b.draftNote || "Draft numbers") + '">Draft</span>' : ""}</h3>
      ${b.draft && b.draftNote ? `<p class="fine">${esc(b.draftNote)}</p>` : ""}
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
function subjectKindOf(target) {
  const row = findCombatant(target || {});
  const kind = (target && target.kind) || (row && row.kind) || "player";
  return kind === "player" ? "player" : kind;
}
async function rememberCondition(row, target, name, rounds) {
  if (!name || !target) return;
  row.pendingRider = { condition: name, rounds: rounds, targetId: target.id, targetName: target.name };
  try {
    await writeSubjectConditions(target.id, subjectKindOf(target), [{ name: name, rounds: rounds }], target.name || "", 1, {}, []);
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
  if ((DM.state.demo || mode === "auto") && !save.logged) {
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
  const stored = resolveStrikeTarget(targetId);
  if (!targetId || !stored || !livingPlayer(stored)) {
    const picked = await askEnemyStrike(row, atk);
    if (!picked || !picked.targetId) return null;
    targetId = picked.targetId;
  }
  const next = resolveStrikeTarget(targetId);
  if (!next || !livingPlayer(next)) return null;
  return next;
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
    const jamLookup = window.SSDNSTestJammer && window.SSDNSTestJammer.weapon ? window.SSDNSTestJammer.weapon() : null;
    if (jamLookup && (has(jamLookup.name) || has(jamLookup.id))) push(jamLookup.name, "Debug revolver. A straight shot always misfires.", "test-jammer.js");
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
  if (window.SSDNSMusicDM) { window.SSDNSMusicDM.fill(); return; }
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
  if (window.SSDNSMusicDM) { fight.playing = true; return; }
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
  if (window.SSDNSMusicDM) return;
  if (window.SSDNSAudio) window.SSDNSAudio.stopMusic();
  const status = $("#musicStatus");
  if (status) status.textContent = "Stopped";
  if ($("#musicTable") && $("#musicTable").checked) {
    await DM.pushCommand({ type: "music", to: "all", payload: { action: "stop" }, from: DM.state.uid });
  }
}

function testingSectionOpen() {
  try { return /(?:^|[?&])debug=1(?:&|$)/.test(String(location.search || "")); }
  catch (e) { return false; }
}
function testJammerOf(s) {
  const guns = (s && s.guns) || [];
  return guns.find((g) => g && (g.weapon === "test-jammer" || String(g.name || "") === "TEST Jammer")) || null;
}
function isTestJammerName(name) {
  if (window.SSDNSTestJammer && window.SSDNSTestJammer.matches) return window.SSDNSTestJammer.matches(name);
  const key = String(name || "").trim().toLowerCase();
  return key === "test-jammer" || key === "test jammer";
}
function grantWeaponOptions() {
  const rows = [];
  const seen = {};
  function add(id, name) {
    const label = String(name || "").trim();
    const key = String(id || label);
    if (!label || seen[key]) return;
    seen[key] = 1;
    rows.push(`<option value="${esc(key)}">${esc(label)}</option>`);
  }
  const R = window.SSDNS_RULES || {};
  ["firearms", "casterGuns", "otherRanged", "melee"].forEach((group) => {
    (R[group] || []).forEach((g) => { if (g) add(g.id || g.name, g.name); });
  });
  const jam = window.SSDNSTestJammer && window.SSDNSTestJammer.weapon ? window.SSDNSTestJammer.weapon() : null;
  if (jam) add(jam.id || "test-jammer", jam.name || "TEST Jammer");
  const peace = window.SSDNSPeaceMaker && window.SSDNSPeaceMaker.weapon ? window.SSDNSPeaceMaker.weapon() : null;
  if (peace) add(peace.id || "the-peace-maker", (peace.name || "The Peace Maker") + " · DM");
  return `<option value="">Pick a weapon</option>` + rows.join("");
}
async function giveTestJammer(pid, s) {
  const list = (s && s.guns) || [];
  const existing = testJammerOf(s);
  let index = 0;
  if (existing) {
    index = existing.index != null && existing.index !== "" ? Number(existing.index) : list.indexOf(existing);
  } else {
    const taken = {};
    list.forEach((g, n) => {
      if (!g || !(g.name || g.weapon)) return;
      const slot = g.index != null && g.index !== "" ? Number(g.index) : n;
      if (isFinite(slot)) taken[slot] = true;
    });
    for (let n = 0; n < 4; n++) if (!taken[n]) { index = n; break; }
  }
  const payload = { op: "test-gun", index: index, weapon: "test-jammer" };
  await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
  if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
  DM.toast("TEST Jammer sent");
}
function decorateDetail(pid) {
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const body = $("#detailBody");
  if (!body) return;
  const guns = (s.guns || []).filter((g) => g && g.name);
  const jammer = testJammerOf(s);
  const conds = String(s.conditions || "").split(",").map((x) => x.trim()).filter(Boolean);
  const box = document.createElement("div");
  box.className = "detail-tools";
  box.innerHTML = `
    <div class="detail-section"><h3>Give equipment</h3>
      <div class="toolbar">
        <label class="fine">Weapon <select id="detailGrantWeapon" aria-label="Weapon to give">${grantWeaponOptions()}</select></label>
        <label class="chk fine"><input type="checkbox" id="detailGrantDirty"> Dirty (loot gun)</label>
        <button type="button" class="btn sm" id="btnGrantWeapon">Give weapon</button>
      </div>
      <div class="toolbar">
        <input type="text" id="detailItem" placeholder="Item, ammo (Arrows (20)) or a new item name">
        <button type="button" class="btn sm" id="btnDetailItem">Add to sheet</button>
      </div>
      <p class="fine" id="detailItemMatch" aria-live="polite"></p>
      <label class="chk fine" id="detailItemDirtyWrap" hidden><input type="checkbox" id="detailItemDirty"> Arrives Dirty (loot gun)</label>
      <div id="detailItemBuilder" class="rew-typed" hidden></div>
      <div class="dm-only-art">
        <!-- 0.2.113: no fixed Hell Maker here. It is the Crossroads Note's Borrowed Iron, so it sat on every player's card
             (a Lass O' Lakes card showed it under the Butter Repeater). Each Pact Seeker's own iron is in the Borrowed Iron section. -->
        <figure>
          <img src="../assets/img/dm-only/the-peace-maker.webp" alt="The Peace Maker">
          <figcaption>The Peace Maker · DM give list</figcaption>
        </figure>
      </div>
      <p class="fine">The Peace Maker: +1 baseball bat, 1d6+1 bludgeoning, Str. Once per short rest after a hit: knockout (0 HP, stable). DM-place only. Lands in a melee slot.</p>
    </div>
    <details class="detail-section" id="detailTesting"${testingSectionOpen() ? " open" : ""}>
      <summary>Testing</summary>
      <div class="toolbar">
        <button type="button" class="btn sm" id="btnMakeDirty">${jammer && jammer.dirty ? "Clear Dirty" : "Make Dirty"}</button>
      </div>
      <p class="fine">Make Dirty flags the TEST Jammer after you give it. A straight shot always misfires.</p>
    </details>
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
        <label class="toggle" title="Bonus action after the Attack action: their sheet spends the Bonus pip and drops a positive ability mod from damage."><input type="checkbox" id="detailOffhand"> Off-hand</label>
        <label class="toggle" title="Pistolero: Fan the Hammer, one more pistol attack as a bonus action after the Attack action (ability mod added; no Tactical Reload this turn)."><input type="checkbox" id="detailFan"> Fan</label>
        ${(s.callingId === "gambler" || /gambler/i.test(s.calling || "")) ? '<label class="toggle" title="Arms Sneak Attack for this one attack. On a hit their sheet adds the dice and marks it used this turn; on a miss nothing is used. DM override: allowed even if already used."><input type="checkbox" id="detailSneak"> Sneak Attack</label>' : ""}
        ${(s.callingId === "lawman" || /lawman/i.test(s.calling || "")) ? '<label class="toggle" title="Arms Smite Lead for this one attack (lowest slot they have). On a hit their sheet spends the slot and adds the dice; on a miss nothing is spent. DM override: allowed with a Dull badge."><input type="checkbox" id="detailSmite"> Smite</label>' : ""}
        <button type="button" class="btn sm" id="btnDetailAttack">Roll weapon</button>
      </div>
      <p class="lede">Roll weapon is a plain attack. It never spends a spell slot unless Smite is ticked (then only on a hit).</p>
      <label class="toggle"><input type="checkbox" id="surpriseDraw"${s.surpriseDraw ? " checked" : ""}> Surprise draw +2</label>
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
  const grantWeapon = $("#btnGrantWeapon");
  if (grantWeapon) grantWeapon.addEventListener("click", async () => {
    const sel = $("#detailGrantWeapon");
    const id = sel && sel.value;
    if (!id) { DM.toast("Pick a weapon"); return; }
    if (isTestJammerName(id) || id === "test-jammer") {
      await giveTestJammer(pid, s);
      return;
    }
    const names = namesFor(pid);
    const label = (sel.selectedOptions && sel.selectedOptions[0] && sel.selectedOptions[0].textContent) || id;
    const dirtyBox = $("#detailGrantDirty");
    const wpay = { text: label, id: id };
    if (dirtyBox && dirtyBox.checked) wpay.dirty = true; /* 0.3.84 loot guns arrive Dirty */
    await DM.pushCommand({ type: "reward_item", to: pid, payload: wpay, from: DM.state.uid });
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "dm_push",
      what: "Item: " + label, oldVal: null, newVal: label, flag: false
    }, names));
    DM.toast("Sent " + label);
  });
  const detailTyped = window.SSDNSItems && window.SSDNSItems.typedGive
    ? window.SSDNSItems.typedGive({ text: $("#detailItem"), match: $("#detailItemMatch"), builder: $("#detailItemBuilder"), dirty: $("#detailItemDirtyWrap") })
    : null;
  const surprise = $("#surpriseDraw");
  if (surprise) surprise.addEventListener("change", async () => {
    await DM.pushCommand({ type: "surprise_draw", to: pid, payload: { on: !!surprise.checked }, from: DM.state.uid });
  });
  $("#btnDetailItem").addEventListener("click", async () => {
    const text = ($("#detailItem").value || "").trim();
    if (!text) return;
    if (isTestJammerName(text)) {
      await giveTestJammer(pid, s);
      $("#detailItem").value = "";
      return;
    }
    /* 0.3.84 default UI by type: ammo → pool, a catalog / rules match lands as itself, anything else needs a type + weight */
    const more = detailTyped ? detailTyped.extra(text, 1) : {};
    if (more.error) { DM.toast(more.error); return; }
    const grantId = "rew_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const names = namesFor(pid);
    if (DM.state.demo && s) s.equipment = (s.equipment ? s.equipment + "\n" : "") + "• " + text + " (from DM)";
    await DM.pushLedger(Object.assign({
      who: "DM", playerId: pid, type: "dm_push",
      what: "Item: " + text, oldVal: null, newVal: text, flag: false
    }, names));
    const cmd = { type: "reward_item", to: pid, payload: Object.assign({ text: text, grantId: grantId }, more), from: DM.state.uid };
    await DM.pushCommand(cmd);
    rememberUndo({
      type: "item", playerId: pid, label: "item " + text,
      command: { type: "undo_item", to: pid, payload: { text: text, grantId: grantId }, from: DM.state.uid },
      demo: function () {
        if (!s.equipment) return;
        s.equipment = s.equipment.split("\n").filter((line) => line !== "• " + text + " (from DM)").join("\n");
      }
    });
    $("#detailItem").value = "";
    if (detailTyped) detailTyped.refresh();
    DM.toast("Item sent");
  });
  const dirtyBtn = $("#btnMakeDirty");
  if (dirtyBtn) dirtyBtn.addEventListener("click", async () => {
    const gun = testJammerOf(s);
    if (!gun) { DM.toast("Give TEST Jammer first"); return; }
    const list = s.guns || [];
    const index = gun.index != null && gun.index !== "" ? Number(gun.index) : list.indexOf(gun);
    const payload = { op: "misfire", index: index, dirty: !gun.dirty };
    if (payload.dirty) payload.quiet = true;
    await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
    if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
    if (!payload.dirty) stampGunClean(playerGunKey(pid, index));
    DM.toast(payload.dirty ? "TEST Jammer is dirty" : "TEST Jammer is clean");
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
function strikeCue(info) {
  if (window.SSDNSAudio && window.SSDNSAudio.weaponCue) return window.SSDNSAudio.weaponCue(info || {});
  return "whoosh";
}
/* attack-fx: hand a resolved attack to the map (draws here, publishes a cleaned row for players). Visual only. */
function mapFx(spec) {
  const host = window.SSDNSMapHost;
  if (!host || typeof host.fx !== "function" || !spec) return null;
  try { return host.fx(spec); } catch (e) { return null; }
}
function fxArrowType(note) {
  const m = String(note || "").toLowerCase().match(/whistler|broadhead|blunt|fire|poison|dynamite/);
  return m ? m[0] : "";
}
function playTableSfx(eventName) {
  const name = window.SSDNSAudio && window.SSDNSAudio.sharedCue
    ? window.SSDNSAudio.sharedCue(eventName)
    : "";
  if (!name) return;
  if (window.SSDNSAudio) window.SSDNSAudio.play(name);
  if (DM.state.demo || !DM.state.db || !DM.state.roomCode) return;
  DM.pushCommand({
    type: "sfx",
    to: "all",
    quiet: true,
    payload: { event: name },
    from: DM.state.uid
  });
}
function watchTableSfx() {
  if (DM.state.demo || !DM.state.db || !DM.state.roomCode || !DM.state._fb) return;
  const room = DM.state.roomCode;
  if (fight._sfxRoom === room && fight._sfxUnsub && DM.state.unsubs.indexOf(fight._sfxUnsub) >= 0) return;
  if (fight._sfxUnsub) {
    const prev = DM.state.unsubs.indexOf(fight._sfxUnsub);
    if (prev >= 0) DM.state.unsubs.splice(prev, 1);
    try { fight._sfxUnsub(); } catch (e) {}
    fight._sfxUnsub = null;
  }
  const started = Date.now();
  const seen = {};
  const fb = DM.state._fb;
  const r = fb.ref(DM.state.db, "rooms/" + room + "/tableFeed");
  const cb = fb.onValue(r, (snap) => {
    if (DM.state.demo || DM.state.roomCode !== room) return;
    const val = snap.val() || {};
    Object.keys(val).forEach((id) => {
      if (seen[id]) return;
      seen[id] = 1;
      const row = val[id];
      if (!row || row.kind !== "sfx") return;
      const ts = Date.parse(row.ts);
      if (!ts || ts + 4000 < started) return;
      const heard = window.SSDNSAudio && window.SSDNSAudio.sharedCue
        ? window.SSDNSAudio.sharedCue(row.event || row.text, row.from, DM.state.uid)
        : "";
      if (heard) window.SSDNSAudio.play(heard);
    });
  });
  const unsub = typeof cb === "function" ? cb : function () {};
  fight._sfxUnsub = unsub;
  fight._sfxRoom = room;
  DM.state.unsubs.push(unsub);
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
  if (g.ruined) { DM.toast(g.name + " is ruined"); return; }
  if (g.pendingD4) { DM.toast("Roll the d4 first."); return; }
  const loaded = Number(g.loaded);
  if (g.caster && Number(g.plain) <= 0) {
    DM.toast(g.name + " has no plain cartridge. Cast through gun fires a hex shell. Roll weapon never spends a slot.");
    return;
  }
  if (!isFinite(loaded) || loaded <= 0) { DM.toast(g.name + " is empty"); return; }
  let mode = ($("#detailAdv") && $("#detailAdv").value) || "";
  const rings = window.SSDNSRangeRings;
  const mapHost = window.SSDNSMapHost;
  if (mapHost && typeof mapHost.armAttack === "function" && !(rings && rings.peek && rings.peek())) {
    mapHost.armAttack({
      id: g.weapon || g.name || "",
      weapon: g.weapon || "",
      name: g.name || "",
      group: g.group || "",
      action: g.action || "",
      tier: g.tier || "",
      range: g.range || "",
      properties: g.properties || "",
      sfx: g.sfx || ""
    }, "", pid);
  }
  const peeked = rings && rings.peek ? rings.peek() : null;
  if (peeked && peeked.apply && peeked.blocked) {
    if (rings.take) rings.take();
    DM.toast(peeked.button || "Out of range");
    return;
  }
  const rangeDis = !!(peeked && peeked.apply && peeked.disadvantage);
  if (rangeDis && mode !== "adv" && mode !== "dis") mode = "dis";
  if (mode === "adv" && rangeDis) mode = "";
  /* 0.3.68: DM "Force ADV" range override */
  if (window.SSDNSRangeRings && window.SSDNSRangeRings.modeWith) mode = window.SSDNSRangeRings.modeWith(mode, peeked);
  const willDis = mode === "dis";
  if (willDis) {
    const ask = rings && rings.confirmDisadvantage;
    const ok = ask ? await ask() : true;
    if (!ok) {
      if (rings && rings.clear) rings.clear();
      return;
    }
  }
  if (rings && rings.clear) rings.clear();
  const gi = g.index != null && g.index !== "" ? Number(g.index) : idx;
  const payload = { op: "fire", index: gi, dm: true };
  if (mode === "adv" || mode === "dis") payload.mode = mode;
  const ohBox = $("#detailOffhand");
  if (ohBox && ohBox.checked) { payload.offhand = true; ohBox.checked = false; } /* 0.2.85: off-hand, one shot */
  const fanBox = $("#detailFan");
  if (fanBox && fanBox.checked) { if (!payload.offhand) payload.fan = true; fanBox.checked = false; } /* 0.2.86: Fan the Hammer, one shot */
  /* SAMPLE trackers: arm-before-attack riders, one attack */
  const sneakBox = $("#detailSneak");
  if (sneakBox && sneakBox.checked) { payload.sneak = true; sneakBox.checked = false; }
  const smiteBox = $("#detailSmite");
  if (smiteBox && smiteBox.checked) { payload.smite = true; smiteBox.checked = false; }
  await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
  if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
  const whoName = namesFor(pid).characterName || s.name || "them";
  DM.toast("Asked " + whoName + " to fire " + g.name + (payload.offhand ? " (off-hand)" : (payload.fan ? " (fan the hammer)" : "")));
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
  const castCue = window.SSDNSAudio && window.SSDNSAudio.spellCue
    ? window.SSDNSAudio.spellCue({ name: spellName, kind: spellRow && spellRow.kind, attack: !!rolled.attack, calling: s.callingId || s.calling })
    : "spellcast";
  if (rolled.attack) playTableSfx(castCue);
  else if (window.SSDNSAudio) window.SSDNSAudio.play(castCue);
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
async function rollSpellAt(row, spellId, targetId) {
  const pid = row.playerId || row.id;
  const p = DM.state.players[pid];
  const s = (p && p.snapshot) || {};
  const Cast = window.SSDNSSpellCast;
  if (!Cast || !Cast.rollCast) { DM.toast("Spell roller isn't loaded"); return false; }
  const known = Cast.lookup ? Cast.lookup(spellId) : null;
  const name = (known && known.name) || String(spellId || "");
  if (!name) { DM.toast("Pick a spell from the sheet"); return false; }
  const earlyTarget = targetId ? resolveStrikeTarget(targetId) : null;
  if (earlyTarget && coverBlocked(earlyTarget)) {
    DM.toast("Total cover. You can't target " + (earlyTarget.name || "them") + ".");
    return false;
  }
  const level = known && typeof known.level === "number" ? known.level : 0;
  s.spells = s.spells || {};
  s.spells.slots = s.spells.slots || {};
  s.spells.spent = s.spells.spent || {};
  if (level) {
    const totalSlots = Number(s.spells.slots[level] || 0);
    const used = Number(s.spells.spent[level] || 0);
    if (!totalSlots || used >= totalSlots) { DM.toast("No level-" + level + " slot left"); return false; }
    s.spells.spent[level] = used + 1;
    await DM.pushCommand({ type: "hex_spend", to: pid, payload: { level: level }, from: DM.state.uid });
  }
  const rolled = Cast.rollCast({
    spellName: name,
    slotLevel: level,
    characterLevel: s.level,
    attackBonus: atkNumber(s.spellAtk),
    spellMod: s.spellMod,
    dc: s.spellDC
  });
  const target = targetId ? resolveStrikeTarget(targetId) : null;
  const id = DM.uid("spell");
  let detail = (row.name || "PC") + " casts " + rolled.text;
  const kind = listedKind({ name: name, kind: known && known.kind }, known);
  if (rolled.attack && target) {
    const spellRange = (known && known.range) || (Cast.rangeOf && Cast.rangeOf(name)) || "";
    const adj = acWithCover(target, attackerCoverOpts(row, { spell: true, ranged: !/touch/i.test(String(spellRange)) }));
    const ac = adj.ac;
    const total = Number(rolled.result);
    const nat = rolled.nat;
    const hit = ac != null && nat !== 1 && total >= ac;
    detail += " vs AC " + (ac == null ? "?" : ac) + (adj.note ? " (" + adj.note + ")" : "") + (hit ? " → HIT" : " → MISS");
    if (hit && rolled.damageTotal && fight.damageMode !== "approve") {
      applyPlayerHit({
        rollId: id, targetId: target.id, targetName: target.name, amount: rolled.damageTotal,
        from: row.id, characterName: row.name, weapon: name, label: name, type: "damage"
      });
    }
  } else if (kind === "save" && target) {
    const save = await requestPlayerSave({
      targetId: target.id, targetName: target.name, ability: (known && known.save) || "WIS",
      dc: s.spellDC, label: name, damage: (known && known.dice) || "", fromName: row.name || ""
    });
    detail += ". " + save.line;
    let amount = save.blocked ? 0 : (Number(rolled.result) || 0);
    if (!save.blocked && !save.failed && known && known.half) amount = Math.floor(amount / 2);
    if (!save.blocked && amount > 0 && (save.failed || (known && known.half)) && fight.damageMode !== "approve") {
      applyPlayerHit({
        rollId: id + ":dmg", targetId: target.id, targetName: target.name, amount: amount,
        from: row.id, characterName: row.name, label: name, weapon: name, type: "damage"
      });
    }
  } else if (kind === "heal" && target && fight.damageMode !== "approve") {
    applyPlayerHit({
      rollId: id, targetId: target.id, targetName: target.name, amount: rolled.result,
      from: row.id, characterName: row.name, label: name, weapon: name, type: "heal"
    });
  } else if (kind === "auto" && target && rolled.result && fight.damageMode !== "approve") {
    applyPlayerHit({
      rollId: id, targetId: target.id, targetName: target.name, amount: rolled.result,
      from: row.id, characterName: row.name, label: name, weapon: name, type: "damage"
    });
  }
  if (spellConcentrates({ name: name }, known)) detail += noteConcentration(row, name);
  detail = withDmActing(row, detail);
  const castCue = window.SSDNSAudio && window.SSDNSAudio.spellCue
    ? window.SSDNSAudio.spellCue({ name: name, kind: kind, attack: !!rolled.attack, calling: s.callingId || s.calling })
    : "spellcast";
  if (rolled.attack) playTableSfx(castCue);
  else if (window.SSDNSAudio) window.SSDNSAudio.play(castCue);
  await DM.pushRoll({
    id: id, who: "DM", playerId: pid, uid: DM.state.uid,
    label: rolled.label, formula: rolled.formula, result: rolled.result, detail: detail,
    nat1: false, isFirearm: !!level, attack: rolled.attack, nat: rolled.nat, crit: rolled.crit, private: false
  });
  await saveRemoteTable();
  DM.renderPlayers();
  renderFight();
  DM.toast(detail);
  return true;
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
  if (noHpPoolRow(row)) {
    DM.toast((row.name || "It") + " has no hit points to lose or gain");
    return null;
  }
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
  if (row.hp <= 0) noteUnconscious(row);
  else await clearDown(row);
  clearDamageDice();
  await saveRemoteTable();
  renderFight();
  const line = (sign < 0 ? "Damage " : "Heal ") + amt + " → " + row.name + " (" + row.hp + " HP, " + enemyStatus(row) + ")";
  DM.toast(line);
  await DM.pushLedger({ who: "DM", playerId: "all", type: sign < 0 ? "damage" : "heal", what: line, oldVal: before, newVal: row.hp, flag: false });
}
const downCued = new Set();
function noteUnconscious(row) {
  if (!row || noHpPoolRow(row)) return;
  const hp = knownNumber(row.hp);
  if (hp != null && hp > 0) { downCued.delete(row.id); return; }
  /* 0.3.56 SFX: an enemy dropping to 0, once per drop (not saved anywhere). */
  if (row.kind === "enemy" && row.id && !downCued.has(row.id) && window.SSDNSAudio) { downCued.add(row.id); window.SSDNSAudio.play("enemy-downed"); }
  const Cond = window.SSDNSConditions;
  const subjectId = row.kind === "player" ? (row.playerId || row.id) : row.id;
  if (!subjectId) return;
  const idEarly = Cond && Cond.idFor(subjectId, "Unconscious");
  if (String(row.status || "") === "Down" && knownNumber(row.hp) === 0 && idEarly && fight.condMap && fight.condMap[idEarly]) return;
  const alreadyDown = String(row.status || "") === "Down" && knownNumber(row.hp) === 0;
  row.hp = 0;
  if (window.SSDNSApplied && window.SSDNSApplied.markHpExpect && row.kind === "player") {
    window.SSDNSApplied.markHpExpect(row, 0);
  }
  if (!alreadyDown) {
    row.status = "Down";
    mirrorMapStatus(row, "down");
  } else row.status = "Down";
  if (!row.deathSaves) row.deathSaves = { success: [false, false, false], fail: [false, false, false] };
  if (!Cond) return;
  const id = Cond.idFor(subjectId, "Unconscious");
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
  const pid = row.kind === "player" ? (row.playerId || row.id) : "";
  if (pid) await DM.pushCommand({ type: "hp", to: pid, payload: { absolute: 0, text: (row.name || "Someone") + " is Down" }, from: DM.state.uid });
  await saveRemoteTable();
  renderFight();
  DM.toast((row.name || "Someone") + " is Unconscious · Down");
}
async function clearDown(row) {
  if (!row) return;
  const hp = knownNumber(row.hp);
  if (hp == null || hp <= 0) return;
  const subjectId = row.kind === "player" ? (row.playerId || row.id) : row.id;
  const current = conditionsForRow(row);
  const have = current.filter((c) => String((c && c.name) || c || "").toLowerCase() === "unconscious")[0];
  const hadDown = /^down$/i.test(String(row.status || ""));
  const ds = row.deathSaves;
  const marked = ds && ((ds.success || []).some(Boolean) || (ds.fail || []).some(Boolean));
  if (!have && !hadDown && !ds) return;
  if (hadDown) row.status = "";
  const pid = row.kind === "player" ? subjectId : "";
  if (pid && ds) {
    for (const side of ["success", "fail"]) {
      const arr = ds[side] || [];
      for (let n = 0; n < 3; n++) {
        if (!arr[n]) continue;
        await DM.pushCommand({ type: "death_save", to: pid, payload: { side: side, index: n, on: false }, from: DM.state.uid });
      }
    }
  }
  row.deathSaves = null;
  const snap = pid ? playerSnapshot(pid) : null;
  if (snap) snap.deathSaves = null;
  mirrorMapStatus(row, "");
  if (have && subjectId) {
    const Cond = window.SSDNSConditions;
    const removeIds = [];
    if (have.id) removeIds.push(have.id);
    else if (Cond && Cond.idFor) removeIds.push(Cond.idFor(subjectId, "Unconscious"));
    await writeSubjectConditions(subjectId, row.kind === "enemy" ? "enemy" : "player", [], row.name || "", 1, {}, removeIds);
  }
  if (have || hadDown || marked) {
    const line = "Unconscious and Down cleared · " + (row.name || "Someone");
    await DM.pushLedger({ who: "DM", playerId: pid || "all", type: "condition", what: line, oldVal: "Down", newVal: "up", flag: false });
  }
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
  return combatTargets(null).filter((p) => p.kind === "player");
}
function combatantKey(row) {
  if (!row) return "";
  return row.kind === "player" ? (row.playerId || row.id || "") : (row.id || "");
}
function targetGroup(row) {
  if (!row) return "Enemies";
  if (row.kind === "player") return "Party";
  if (isFriendly(row)) return "Allies";
  return "Enemies";
}
function combatTargets(attacker) {
  const skip = {};
  if (attacker) {
    if (attacker.id) skip[attacker.id] = 1;
    const key = combatantKey(attacker);
    if (key) skip[key] = 1;
  }
  const rows = [];
  const seen = {};
  function push(entry) {
    if (!entry || !entry.id || seen[entry.id] || skip[entry.id]) return;
    if (!livingPlayer(entry)) return;
    seen[entry.id] = 1;
    rows.push(entry);
  }
  (fight.order || []).forEach((row) => {
    if (!row) return;
    const id = combatantKey(row);
    push({
      id: id,
      name: row.name || (row.kind === "player" ? "Player" : "Creature"),
      ac: row.ac,
      hp: row.hp,
      status: row.status || "",
      fled: !!row.fled,
      kind: row.kind || "enemy",
      group: targetGroup(row),
      card: row.card || null,
      conditions: row.conditions || [],
      takingCover: !!row.takingCover,
      cover: row.cover || ""
    });
  });
  Object.keys(DM.state.players || {}).forEach((pid) => {
    if (fight.departed && fight.departed[pid]) return;
    const s = (DM.state.players[pid] && DM.state.players[pid].snapshot) || {};
    push({
      id: pid,
      name: s.name || pid,
      ac: s.ac,
      hp: s.hpCurrent,
      status: s.hpCurrent === 0 ? "Down" : "",
      kind: "player",
      group: "Party",
      card: null,
      takingCover: !!s.takingCover,
      cover: s.cover || ""
    });
  });
  const groupRank = { Party: 0, Allies: 1, Enemies: 2 };
  rows.sort((a, b) => (groupRank[a.group] == null ? 9 : groupRank[a.group]) - (groupRank[b.group] == null ? 9 : groupRank[b.group]));
  return rows;
}
function defaultCombatTarget(attacker, list) {
  const last = attacker && attacker.lastAttackerId;
  if (last && (list || []).some((p) => p.id === last)) return last;
  const strikesHostiles = !attacker || attacker.kind === "player" || isFriendly(attacker);
  const want = strikesHostiles ? "Enemies" : "Party";
  const first = (list || []).filter((p) => p.group === want)[0];
  if (first) return first.id;
  if (!strikesHostiles) {
    const ally = (list || []).filter((p) => p.group === "Allies")[0];
    if (ally) return ally.id;
  }
  return (list && list[0] && list[0].id) || "";
}
function targetMenu(list, selected) {
  const groups = ["Party", "Allies", "Enemies"];
  const html = groups.map((label) => {
    const items = (list || []).filter((p) => p.group === label);
    if (!items.length) return "";
    const opts = items.map((p) => {
      const ac = p.ac == null || p.ac === "" ? "?" : p.ac;
      return `<option value="${esc(p.id)}"${p.id === selected ? " selected" : ""}>${esc(p.name)} · AC ${esc(ac)}</option>`;
    }).join("");
    return `<optgroup label="${label}">${opts}</optgroup>`;
  }).join("");
  return html || `<option value="">No targets</option>`;
}
function numericAc(ac) {
  if (ac == null || ac === "") return null;
  const n = Number(ac);
  return isFinite(n) ? n : null;
}
function coverValue(target) {
  const row = target && findCombatant(target);
  if (row && row.coverLock) return row.cover || "";
  if (row && row.cover) return row.cover;
  const pid = (target && (target.playerId || target.id)) || (row && (row.playerId || row.id)) || "";
  const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
  if (snap && snap.cover) return snap.cover;
  return (target && target.cover) || "";
}
function attackerCoverOpts(attacker, spec) {
  spec = spec || {};
  const pid = attacker && attacker.kind === "player" ? (attacker.playerId || attacker.id) : "";
  const snap = pid ? playerSnapshot(pid) : null;
  return {
    ranged: !!spec.ranged,
    spell: !!spec.spell,
    sharpshooter: !!(snap && snap.sharpshooter),
    spellSniper: !!(snap && snap.longRangeHex),
    noCover: !!spec.noCover
  };
}
function acWithCover(target, opts) {
  const Applied = window.SSDNSApplied;
  const base = numericAc(target && target.ac);
  if (!Applied || !Applied.coverAdjust) return { ac: base, have: base != null, blocked: false, note: "", bonus: 0, title: "", key: "" };
  return Applied.coverAdjust(base, coverValue(target), opts || {});
}
function coverBlocked(target) {
  return !!acWithCover(target, {}).blocked;
}
function coverSelectHtml(i, row) {
  const key = window.SSDNSApplied && window.SSDNSApplied.coverKey ? window.SSDNSApplied.coverKey(row && row.cover) : "";
  const title = "Half cover +2 to AC and Dexterity saves. Three-quarters +5. Total cover can't be targeted.";
  const opt = (val, label) => `<option value="${val}"${key === val ? " selected" : ""}>${label}</option>`;
  const id = esc(row && row.id || "");
  const name = esc(row && row.name || "combatant");
  return `<label class="fine" title="${esc(title)}">Cover <select data-cover-val="${i}" data-row-id="${id}" aria-label="Cover for ${name}" title="${esc(title)}">${opt("", "None")}${opt("half", "Half +2")}${opt("three", "3/4 +5")}${opt("full", "Total")}</select></label><label class="fine" title="Lock cover so the player can't change it."><input type="checkbox" data-cover-lock="${i}" data-row-id="${id}"${row && row.coverLock ? " checked" : ""}> Lock</label>`;
}
function resolveStrikeTarget(targetId) {
  if (!targetId) return null;
  const row = findCombatant({ targetId: targetId, id: targetId });
  if (row) {
    const pid = row.playerId || (row.kind === "player" ? row.id : "");
    const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
    return {
      id: combatantKey(row),
      name: row.name || "Someone",
      ac: row.ac,
      hp: row.hp,
      kind: row.kind || "enemy",
      status: row.status || "",
      fled: !!row.fled,
      group: targetGroup(row),
      card: row.card || null,
      conditions: row.conditions || [],
      takingCover: !!(row.takingCover || (snap && snap.takingCover)),
      cover: row.cover || (snap && snap.cover) || ""
    };
  }
  return combatTargets(null).filter((p) => p.id === targetId)[0] || null;
}
function askEnemyStrike(row, preset) {
  const players = combatTargets(row);
  const def = defaultCombatTarget(row, players);
  const bonus = preset && preset.toHit != null && preset.toHit !== "" ? preset.toHit : row.atkBonus;
  const dice = preset && preset.damage ? preset.damage : (row.damage || "");
  const title = preset && preset.name ? preset.name : "Attack a target";
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const options = (freeShotGun(preset) ? `<option value="${FREE_SHOT_ID}">Free shot</option>` : "") + targetMenu(players, def);
    const grip = preset && preset.versatile
      ? `<label>Grip <select id="enemyGrip" aria-label="One or two hands"><option value="1">One-handed</option><option value="2">Two-handed</option></select></label>`
      : "";
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p class="fine">${esc(row.name || "Enemy")} attacks.</p><label>Target <select id="enemyTarget">${options}</select></label><label>Attack bonus <input id="enemyBonus" type="number" value="${bonus == null ? "" : esc(bonus)}" placeholder="blank asks"></label>${grip}<label>Damage <input id="enemyDice" value="${esc(dice)}" placeholder="1d6+2"></label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Roll</button></div></form>`;
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
  if (!row) return;
  ensureCombatantCard(row);
  const picked = await askEnemyStrike(row, preset);
  if (!picked || !picked.targetId) { DM.toast("No targets"); return; }
  if (picked.bonus == null || !isFinite(picked.bonus) || !picked.dice) { DM.toast("Enter an attack bonus and damage"); return; }
  row.atkBonus = picked.bonus;
  row.damage = picked.dice;
  row.lastAttackerId = picked.targetId;
  const target = resolveStrikeTarget(picked.targetId);
  if (!target) { DM.toast("No targets"); return; }
  const rangedPreset = !!(preset && preset.range && /\d+\s*\/\s*\d+/.test(String(preset.range)));
  const adj = acWithCover(target, attackerCoverOpts(row, { ranged: rangedPreset }));
  if (adj.blocked) { DM.toast("Total cover. You can't target " + (target.name || "them") + "."); return; }
  const nat = d20();
  const total = nat + picked.bonus;
  const ac = adj.ac;
  if (ac == null) { DM.toast((target.name || "Target") + " has no AC"); return; }
  const miss = nat === 1 || total < ac;
  const hit = !miss;
  let dmg = null;
  if (hit) dmg = DM.parseDice(picked.dice);
  const bonusTxt = (picked.bonus >= 0 ? "+" : "") + picked.bonus;
  const attackName = (preset && preset.name) || String(row.attacks || "").trim();
  const weapon = attackName && attackName.toLowerCase() !== String(row.name || "").toLowerCase() ? attackName : "";
  const detail = row.name + " attacks " + (target.name || "someone") + ": " + nat + bonusTxt + " = " + total + " vs AC " + ac + (adj.note ? " (" + adj.note + ")" : "") + (miss ? " → MISS" : " → HIT") + (dmg ? " · " + dmg.detail + " = " + dmg.total : "");
  const id = DM.uid("enatk");
  playTableSfx(strikeCue(preset || { name: attackName }));
  mapFx({ id: id, shooter: row.id, target: target.id, result: miss ? "miss" : (nat === 20 ? "crit" : "hit"), nat: nat, crit: nat === 20 && hit,
    weapon: attackName || row.name || "", sfx: strikeCue(preset || { name: attackName }), group: (preset && preset.group) || "",
    gun: !!(preset && (preset.capacity != null || /\d+\s*\/\s*\d+/.test(String(preset.range || "")))), heard: [] });
  await DM.pushRoll({
    id: id, who: row.name, uid: DM.state.uid, label: row.name + " attacks " + (target.name || ""), formula: "1d20" + bonusTxt,
    result: total, detail: detail, private: false, attack: true, nat: nat, crit: nat === 20 && hit,
    targetId: target.id, targetName: target.name, damage: dmg ? dmg.total : null, ac: ac, weapon: weapon
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
  opts = opts || {};
  const ability = String(opts.ability || "STR").toUpperCase();
  const dc = Number(opts.dc);
  const found = resolveStrikeTarget(opts.targetId);
  const target = found || { id: opts.targetId, name: opts.targetName || opts.targetId || "Target", kind: opts.kind || "" };
  const npc = subjectKindOf(target) !== "player";
  const id = DM.uid("save");
  const cov = window.SSDNSApplied && window.SSDNSApplied.coverSaveBonus
    ? window.SSDNSApplied.coverSaveBonus(coverValue(target), ability, { noCover: /sacred flame/i.test(opts.label || "") })
    : { bonus: 0, blocked: false, note: "", title: "" };
  if (cov.blocked) {
    const line = (target.name || "Target") + " has total cover and can't be targeted.";
    DM.toast(line);
    return Promise.resolve({ id: id, blocked: true, failed: false, line: line, total: 0, nat: 0, mod: 0, target: target });
  }
  const modFor = () => {
    if (!npc) return targetMod(target.id, ability);
    const row = findCombatant(target);
    const card = (row && row.card) || target.card || null;
    return Number(sheetSaveMod(card, ability)) || 0;
  };
  const localRoll = (auto) => {
    const mod = (Number(modFor()) || 0) + (cov.bonus || 0);
    const nat = d20();
    const total = nat + mod;
    const failed = isFinite(dc) ? total < dc : true;
    const who = target.name || "Target";
    const line = who + " " + ability + " save" + (auto ? " (no answer, DM rolled)" : "") + " " + nat + signed(mod) + " = " + total + (isFinite(dc) ? " vs DC " + dc : "") + (cov.note ? " · " + cov.note : "") + (failed ? " FAIL" : " OK");
    return { id: id, nat: nat, total: total, failed: failed, auto: !!auto, line: line, mod: mod, target: target };
  };
  if (npc) {
    const rolled = localRoll(!!opts.auto);
    rolled.logged = true;
    DM.pushRoll({
      who: target.name || "Target", label: (opts.label || "Save") + " · " + ability, formula: "1d20" + signed(rolled.mod),
      result: rolled.total, detail: rolled.line, private: true, nat: rolled.nat, save: true, saveRequestId: id
    });
    return Promise.resolve(rolled);
  }
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
        fromName: opts.fromName || "",
        coverBonus: cov.bonus || 0,
        coverTitle: cov.title || ""
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
function logTableAlert(text) {
  DM.toast(text);
  const row = {
    id: "alert_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    ts: new Date().toISOString(),
    from: DM.state.uid || "dm",
    fromName: "DM",
    text: text,
    to: "all"
  };
  if (DM.state.demo || !DM.state.db) {
    DM.state.chat = DM.state.chat || [];
    DM.state.chat.push(row);
    if (DM.renderLiveDock) DM.renderLiveDock();
  } else if (DM.state._fb && DM.roomRef) {
    DM.state._fb.set(DM.roomRef("chat/" + row.id), row).catch(() => {});
  }
  DM.pushLedger({ who: "DM", playerId: "all", type: "alert", what: text, oldVal: null, newVal: text, flag: false, chatId: row.id });
}
function withDmActing(row, detail) {
  if (!row || row.kind !== "player" || !row.dmActsAs) return detail;
  const line = "DM acting for " + (row.name || "a player");
  if (String(detail || "").indexOf(line) === 0) return detail;
  return detail ? line + " — " + detail : line;
}
function mirrorMapStatus(row, status) {
  const host = window.SSDNSMapHost;
  if (!host || typeof host.patchToken !== "function" || !row || !row.mapTokenId) return;
  try { host.patchToken(row.mapTokenId, { status: status || "" }); } catch (e) {}
}
async function publishCardRoll(row, detail, result, extra) {
  detail = withDmActing(row, detail);
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
/* 0.2.80: Free shot. The gun just fires at nothing in particular: round spent, misfire rules,
   sound, ammo update. No target, range, AC, hit/miss or damage. Chat: "<Name> shoots freely · 1d20+B = T". */
const FREE_SHOT_ID = "__free";
function freeShotGun(atk) {
  return !!(atk && (atk.capacity != null || /\d+\s*\/\s*\d+/.test(String(atk.range || "")) || /pistol|rifle|shotgun|carbine|bow/i.test(String(atk.group || ""))));
}
async function cardFreeShot(row, atk, bonusIn) {
  if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
  const bonus = bonusIn != null && isFinite(Number(bonusIn)) ? Number(bonusIn) : (isFinite(Number(atk.toHit)) ? Number(atk.toHit) : 0);
  const nat = d20();
  const ceiling = window.SSDNSApplied && window.SSDNSApplied.misfireNumber
    ? window.SSDNSApplied.misfireNumber(atk.misfire)
    : null;
  const resolved = (atk.misfire != null && atk.misfire !== "" && window.SSDNSMisfire)
    ? window.SSDNSMisfire.resolveShot(atk, { n1: nat, nat: nat, ceiling: ceiling || 1, spark: false })
    : null;
  const misfire = resolved ? resolved.misfire : (window.SSDNSApplied && window.SSDNSApplied.isMisfire
    ? window.SSDNSApplied.isMisfire(nat, atk.misfire)
    : false);
  if (resolved) {
    atk.misStreak = resolved.misStreak;
    atk.fouled = !!resolved.fouled;
    atk.jammed = !!resolved.jammed;
    atk.ruined = !!resolved.ruined;
    if (resolved.armD4) atk.pendingD4 = true;
    enemyKeepLocks(atk, resolved);
  }
  if (atk.capacity != null) atk.loaded = Math.max(0, Math.min(Number(atk.loaded) - 1, enemyOpenChambers(atk)));
  const total = nat + bonus;
  let detail = (row.name || "Someone") + " shoots freely · 1d20" + signed(bonus) + " = " + total;
  if (misfire) {
    if (!resolved) atk.jammed = true;
    detail += " · natural " + nat + " misfire, the round is spent";
    if (!resolved || resolved.jammed) playTableSfx("misfire");
  } else {
    playTableSfx(strikeCue(atk));
    mapFx({ type: "free", shooter: row.id, weapon: atk.name || "", weaponId: atk.weapon || atk.id || "", sfx: strikeCue(atk), nat: nat, heard: [] });
  }
  await publishCardRoll(row, detail, total, { formula: "1d20" + signed(bonus), nat: nat, attack: false, freeShot: true, weapon: atk.name });
  await saveRemoteTable();
  renderFight();
  DM.toast(detail + (atk.capacity != null ? " · " + atk.loaded + " left" : ""));
}
async function cardStrike(i, n, opts) {
  const row = fight.order[i];
  if (!row) return;
  ensureCombatantCard(row);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) return;
  rememberWeapon(row, atk);
  if (atk.jammed) { DM.toast(atk.name + " is jammed"); return; }
  if (atk.fouled) { DM.toast(atk.name + " is fouled"); return; }
  if (atk.ruined) { DM.toast(atk.name + " is ruined"); return; }
  if (atk.pendingD4) { DM.toast("Roll the d4 first."); return; }
  if (atk.capacity != null && Number(atk.loaded) <= 0) {
    const emptyText = window.SSDNSApplied && window.SSDNSApplied.emptyShotText
      ? window.SSDNSApplied.emptyShotText(row.name, atk)
      : (row.name || "Someone") + ": " + (atk.name || "gun") + " empty, reload first";
    logTableAlert(emptyText);
    return;
  }
  if (opts && opts.free) return cardFreeShot(row, atk);
  let picked;
  if (opts && opts.targetId) {
    const want = String(opts.targetId);
    const selfId = combatantKey(row);
    if (want === String(row.id || "") || want === String(selfId || "") || (row.playerId && want === String(row.playerId))) {
      DM.toast("Pick a different token");
      return;
    }
    const bonus = atk.toHit != null && atk.toHit !== "" ? Number(atk.toHit) : null;
    picked = { targetId: want, bonus: bonus, dice: String(atk.damage || "").trim() };
  } else {
    picked = await askEnemyStrike(row, atk);
  }
  if (picked && picked.targetId === FREE_SHOT_ID) return cardFreeShot(row, atk, picked.bonus);
  if (!picked || !picked.targetId) { DM.toast("No targets"); return; }
  const bonus = picked.bonus != null && isFinite(Number(picked.bonus)) ? Number(picked.bonus) : Number(atk.toHit);
  const dice = String((picked.dice || atk.damage || "")).trim();
  if (!isFinite(bonus) || !dice) { DM.toast("That attack has no bonus or damage"); return; }
  row.lastAttackerId = picked.targetId;
  const target = resolveStrikeTarget(picked.targetId);
  if (!target) { DM.toast("No targets"); return; }
  const rangedGun = !!(atk && (/\d+\s*\/\s*\d+/.test(String(atk.range || "")) || /pistol|rifle|shotgun|carbine|bow/i.test(String(atk.group || ""))));
  const adj = acWithCover(target, attackerCoverOpts(row, { ranged: rangedGun }));
  if (adj.blocked) { DM.toast("Total cover. You can't target " + (target.name || "them") + "."); return; }
  const ac = adj.ac;
  if (ac == null) { DM.toast((target.name || "Target") + " has no AC"); return; }
  if (!(opts && opts._rangeReady)) {
    const rings = window.SSDNSRangeRings;
    const host = window.SSDNSMapHost;
    const aimRef = (target && (target.mapTokenId || target.id)) || picked.targetId;
    const kept = rings ? (rings.peekFor ? rings.peekFor(aimRef) : (rings.peek ? rings.peek() : null)) : null;
    if (host && typeof host.armAttack === "function" && !kept) {
      host.armAttack({
        id: atk.id || atk.name || "",
        weapon: atk.weapon || atk.id || "",
        name: atk.name || "",
        group: atk.group || "",
        action: atk.action || "",
        tier: atk.tier || "",
        range: atk.range || "",
        properties: atk.properties || "",
        scatter: !!atk.scatter,
        kind: atk.kind || ""
      }, (target && (target.mapTokenId || target.id)) || picked.targetId, row.mapTokenId || "");
    }
    const peeked = rings && rings.peek ? rings.peek() : null;
    if (peeked && peeked.apply && peeked.blocked) {
      if (rings.take) rings.take();
      logTableAlert((row.name || "Someone") + ": " + (peeked.button || "Out of range"));
      return;
    }
    const willDis = !!(peeked && peeked.apply && peeked.disadvantage) && !(peeked.advantage);
    if (willDis) {
      const ask = rings && rings.confirmDisadvantage;
      const ok = ask ? await ask() : true;
      if (!ok) {
        if (rings && rings.clear) rings.clear();
        return;
      }
    }
  }
  const rangeShot = window.SSDNSRangeRings && window.SSDNSRangeRings.take ? window.SSDNSRangeRings.take() : null;
  if (rangeShot && rangeShot.apply && rangeShot.blocked) {
    logTableAlert((row.name || "Someone") + ": " + (rangeShot.button || "Out of range"));
    return;
  }
  if (rangeShot && rangeShot.log) logTableAlert(rangeShot.log);
  const coverDis = !!(rangedGun && window.SSDNSApplied && window.SSDNSApplied.takeCoverDisadvantage
    && window.SSDNSApplied.takeCoverDisadvantage(target && target.takingCover, coverValue(target)));
  let n1 = d20();
  let n2 = null;
  let nat = n1;
  const rangeDis = !!(rangeShot && rangeShot.apply && rangeShot.disadvantage);
  /* 0.3.68: DM "Force ADV" rolls two and keeps the higher; Take Cover disadvantage cancels it to one die */
  const rangeAdv = !!(rangeShot && rangeShot.apply && !rangeShot.blocked && rangeShot.advantage);
  /* map token guns: the card's ADV / DIS tick (same ticks as the player gun card). No tick = the old rule exactly. */
  const tickAdv = atk.attackMode === "adv";
  const tickDis = atk.attackMode === "dis";
  if (!tickAdv && !tickDis) {
    if (rangeAdv && !coverDis) {
      n2 = d20();
      nat = Math.max(n1, n2);
    } else if (!rangeAdv && (rangeDis || coverDis)) {
      n2 = d20();
      nat = Math.min(n1, n2);
    }
  } else {
    const anyAdv = rangeAdv || tickAdv;
    const anyDis = (!rangeAdv && rangeDis) || coverDis || tickDis;
    if (anyAdv && !anyDis) { n2 = d20(); nat = Math.max(n1, n2); }
    else if (anyDis && !anyAdv) { n2 = d20(); nat = Math.min(n1, n2); }
  }
  const ceiling = window.SSDNSApplied && window.SSDNSApplied.misfireNumber
    ? window.SSDNSApplied.misfireNumber(atk.misfire)
    : null;
  const resolved = (atk.misfire != null && atk.misfire !== "" && window.SSDNSMisfire)
    ? window.SSDNSMisfire.resolveShot(atk, { n1: nat, nat: nat, ceiling: ceiling || 1, spark: false })
    : null;
  const misfire = resolved ? resolved.misfire : (window.SSDNSApplied && window.SSDNSApplied.isMisfire
    ? window.SSDNSApplied.isMisfire(nat, atk.misfire)
    : false);
  if (resolved) {
    atk.misStreak = resolved.misStreak;
    atk.fouled = !!resolved.fouled;
    atk.jammed = !!resolved.jammed;
    atk.ruined = !!resolved.ruined;
    if (resolved.armD4) atk.pendingD4 = true;
    enemyKeepLocks(atk, resolved);
  }
  if (atk.capacity != null) atk.loaded = Math.max(0, Math.min(Number(atk.loaded) - 1, enemyOpenChambers(atk)));
  if (misfire) {
    if (!resolved) atk.jammed = true;
    const detail = row.name + " fires " + atk.name + ": natural " + nat + " misfire. The round is spent.";
    if (!resolved || resolved.jammed) playTableSfx("misfire");
    await publishCardRoll(row, detail, nat, { attack: true, nat: nat });
    await saveRemoteTable();
    renderFight();
    DM.toast(detail + (atk.capacity != null ? " · " + atk.loaded + " left" : ""));
    return;
  }
  const total = nat + bonus;
  const miss = nat === 1 || total < ac;
  const hit = !miss;
  let dmg = null;
  if (hit) dmg = DM.parseDice(dice);
  const bonusTxt = signed(bonus);
  const strikeCard = window.SSDNSApplied && window.SSDNSApplied.attackBreakdown
    ? window.SSDNSApplied.attackBreakdown({
      who: row.name || "Someone",
      target: target.name || "someone",
      weapon: atk.name || "",
      nat: nat,
      n1: n1,
      n2: n2,
      parts: [{ label: "bonus", value: bonus }],
      total: total,
      ac: ac,
      coverNote: adj.note,
      revealAc: true,
      misfire: false,
      miss: miss,
      crit: nat === 20 && hit,
      damage: dmg ? { faces: dmg.rolls, formula: dice, parts: [], total: dmg.total, dice: dmg.detail, type: atk.damageType || "" } : null
    })
    : null;
  let detail = strikeCard ? strikeCard.dmText : (row.name + " attacks " + (target.name || "someone") + " with " + atk.name + ": " + nat + bonusTxt + " = " + total + " vs AC " + ac + (miss ? " → MISS" : (nat === 20 ? " → CRIT" : " → HIT")) + (dmg ? " · " + dmg.detail + " = " + dmg.total : ""));
  if (rangeShot && rangeShot.note && rangeShot.disadvantage) detail += "\n" + rangeShot.note;
  if (rangeAdv) detail += "\n" + (coverDis ? "ADV (DM forced) cancels Take Cover disadvantage" : (rangeShot.note || "ADV: DM forced advantage"));
  else if (coverDis) detail += "\ndisadvantage: Take Cover";
  const id = DM.uid("enatk");
  atk.lastRoll = { id: id, damage: dmg ? dmg.total : null, targetId: target.id, targetName: target.name, hit: hit };
  playTableSfx(strikeCue(atk));
  mapFx({ id: id, shooter: row.id, target: target.id, result: miss ? "miss" : (nat === 20 ? "crit" : "hit"), nat: nat, crit: nat === 20 && hit,
    weapon: atk.name || "", weaponId: atk.weapon || atk.id || "", group: atk.group || "", scatter: !!atk.scatter, properties: atk.properties || "",
    gun: atk.capacity != null, kind: atk.kind || "", dmgType: atk.damageType || "", sfx: strikeCue(atk), heard: [DM.state.uid] });
  /* 0.3.58: the strike cue opens the anchor first; the result follows it. */
  if (window.SSDNSAudio && window.SSDNSAudio.playOutcome) {
    window.SSDNSAudio.playOutcome({
      id: atk.weapon || atk.id || "",
      name: atk.name || "",
      gun: !!(atk.capacity != null || atk.group),
      group: atk.group || "",
      properties: atk.properties || "",
      kind: atk.kind || ""
    }, miss ? "miss" : (nat === 20 && hit ? "crit" : "hit"));
  }
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
function listedKind(spell, known) {
  const fromCard = spell && typeof spell === "object" && spell.kind ? String(spell.kind) : "";
  if (fromCard && fromCard !== "none") return fromCard;
  const fromRules = known && known.kind ? String(known.kind) : "";
  if (fromRules && fromRules !== "none") return fromRules;
  return fromCard || "none";
}
function spellConcentrates(spell, known) {
  if (spell && typeof spell === "object" && (spell.concentration || spell.conc)) return true;
  const summary = spell && typeof spell === "object" ? String(spell.summary || spell.note || "") : "";
  if (/\bconcentration\b/i.test(summary)) return true;
  const Cast = window.SSDNSSpellCast;
  const label = (known && known.name) || (spell && spell.name) || (typeof spell === "string" ? spell : "");
  if (Cast && Cast.blurb && /\bconcentration\b/i.test(Cast.blurb(label) || "")) return true;
  return false;
}
function spellConditionName(spell) {
  if (spell && typeof spell === "object" && spell.condition) {
    const named = String(spell.condition).trim();
    if (named) return named;
  }
  const rider = spellRider(spell && (spell.name || spell.id));
  if (/disadvantage/i.test(rider)) return "Disadvantage";
  const summary = spell && typeof spell === "object" ? String(spell.summary || "") : "";
  const hit = CONDITIONS.filter((name) => new RegExp("\\b" + name + "\\b", "i").test(summary));
  return hit.length === 1 ? hit[0] : "";
}
function noteConcentration(row, name) {
  const prev = row && row.concentration ? String(row.concentration) : "";
  if (row) row.concentration = name;
  if (prev && prev !== name) return " Concentration moves from " + prev + " to " + name + ".";
  return " (concentration)";
}
function spendSpellSlot(card, level) {
  if (level && card && card.slots && card.slots[level]) card.slots[level].left -= 1;
}
function askSaveSpell(row, name, known) {
  const players = combatTargets(row);
  const casting = (row.card && row.card.spellcasting) || {};
  const ability = (known && known.save) || "WIS";
  const dc = casting.dc == null ? "" : casting.dc;
  const dice = (known && known.dice) || "";
  const type = (known && known.type) || "";
  const rider = spellRider(name);
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const options = targetMenu(players, defaultCombatTarget(row, players));
    dlg.innerHTML = `<form method="dialog"><h2>${esc(name)} save</h2><p class="fine">${esc(row.name || "Enemy")} casts a save spell.</p><label>Target <select id="saveTarget">${options}</select></label><label>Save <input id="saveAbility" value="${esc(ability)}" aria-label="Save ability"></label><label>DC <input id="saveDc" type="number" value="${esc(dc)}"></label><label>Damage on a fail <input id="saveDice" value="${esc(dice)}${type ? " " + esc(type) : ""}"></label><label>Rider on a fail <input id="saveRider" value="${esc(rider)}"></label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit">Ask for the save</button></div></form>`;
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
async function cardCast(i, n, opts) {
  const row = fight.order[i];
  if (!row) return;
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
  const kind = listedKind(spell, known);
  const casting = card.spellcasting || {};
  const direct = opts && opts.targetId ? String(opts.targetId) : "";
  const castCue = window.SSDNSAudio && window.SSDNSAudio.spellCue
    ? window.SSDNSAudio.spellCue({ name: name, kind: kind, attack: kind === "attack" })
    : "spellcast";
  const playCue = () => {
    if (castCue !== "spellcast") playTableSfx(castCue);
    else if (window.SSDNSAudio) window.SSDNSAudio.play(castCue);
    else playTableSfx("spellcast");
  };
  const diceOf = () => (known && known.dice) || (spell && spell.damage) || "";
  if (kind === "utility" || kind === "reaction" || kind === "none" || kind === "rider") {
    spendSpellSlot(card, level);
    let detail = row.name + " casts " + name;
    if (spellConcentrates(spell, known)) detail += noteConcentration(row, name);
    await publishCardRoll(row, detail, 0, { formula: "—", spell: true });
    playCue();
    await saveRemoteTable();
    renderFight();
    DM.toast(detail);
    return;
  }
  if (kind === "heal") {
    const dice = diceOf() || "1d8";
    const out = DM.parseDice(dice);
    spendSpellSlot(card, level);
    let detail = row.name + " casts " + name + " and heals " + out.total;
    if (spellConcentrates(spell, known)) detail += noteConcentration(row, name);
    const target = direct ? resolveStrikeTarget(direct) : null;
    if (target && out && fight.damageMode !== "approve") {
      applyPlayerHit({
        rollId: DM.uid("spell"),
        targetId: target.id,
        targetName: target.name,
        amount: out.total,
        from: row.id,
        characterName: row.name,
        label: name,
        weapon: name,
        type: "heal"
      });
    }
    await publishCardRoll(row, detail, out.total, { formula: dice, heal: true, spell: true, targetId: target && target.id });
    playCue();
    await saveRemoteTable();
    renderFight();
    DM.toast(detail);
    return;
  }
  if (kind === "save" || kind === "auto") {
    let asked = null;
    if (direct) {
      asked = {
        targetId: direct,
        ability: (spell && spell.save) || (known && known.save) || "WIS",
        dc: casting.dc,
        damage: diceOf(),
        rider: spellConditionName(spell) || spellRider(name)
      };
    } else if (kind === "save") {
      asked = await askSaveSpell(row, name, known);
    } else {
      const picked = await askEnemyStrike(row, { name: name, toHit: "", damage: diceOf() });
      asked = picked && picked.targetId ? { targetId: picked.targetId, ability: "", dc: "", damage: diceOf(), rider: "" } : null;
    }
    if (!asked || !asked.targetId) { DM.toast("No targets"); return; }
    const target = resolveStrikeTarget(asked.targetId);
    if (!target) { DM.toast("No targets"); return; }
    if (coverBlocked(target)) { DM.toast("Total cover. You can't target " + (target.name || "them") + "."); return; }
    spendSpellSlot(card, level);
    let detail = row.name + " casts " + name;
    let save = null;
    if (kind === "save") {
      save = await requestPlayerSave({
        targetId: target.id,
        targetName: target.name,
        ability: asked.ability,
        dc: asked.dc,
        label: name,
        rider: asked.rider,
        damage: asked.damage,
        fromName: row.name || ""
      });
      detail += ". " + save.line;
    } else {
      detail += " at " + (target.name || "someone");
    }
    const expr = asked.damage ? String(asked.damage).match(/\d*d\d+(?:\s*[+-]\s*\d+)?/i) : null;
    const rolled = expr ? DM.parseDice(expr[0]) : null;
    const blockedSave = !!(save && save.blocked);
    const failed = !blockedSave && (!save || save.failed);
    let amount = blockedSave ? 0 : (rolled ? rolled.total : 0);
    if (!blockedSave && save && !save.failed && known && known.half) amount = Math.floor(amount / 2);
    if (!blockedSave && rolled && amount > 0 && (failed || (known && known.half)) && fight.damageMode !== "approve") {
      detail += " · " + amount + " " + String(asked.damage).replace(expr[0], "").trim();
      applyPlayerHit({
        rollId: DM.uid("spell"),
        targetId: target.id,
        targetName: target.name,
        amount: amount,
        from: row.id,
        characterName: row.name,
        label: name,
        weapon: name,
        type: "damage"
      });
    }
    const cond = asked.rider || spellConditionName(spell);
    if (failed && cond) {
      const named = /prone/i.test(cond) ? "Prone" : (/disadvantage/i.test(cond) ? "Disadvantage" : cond);
      if (CONDITIONS.indexOf(named) >= 0 || named === "Disadvantage") {
        await rememberCondition(row, target, named, null);
        detail += " · " + named;
      }
    }
    if (spellConcentrates(spell, known)) detail += noteConcentration(row, name);
    await publishCardRoll(row, detail, save ? save.total : (rolled ? rolled.total : 0), {
      nat: save && save.nat, save: kind === "save", spell: true, targetId: target.id, damage: amount || null
    });
    playCue();
    await saveRemoteTable();
    renderFight();
    DM.toast(detail);
    return;
  }
  let targetId = direct;
  if (!targetId) {
    const picked = await askEnemyStrike(row, { name: name, toHit: casting.attack, damage: diceOf() });
    targetId = picked && picked.targetId;
  }
  if (!targetId) { DM.toast("No targets"); return; }
  const target = resolveStrikeTarget(targetId);
  if (!target) { DM.toast("No targets"); return; }
  const spellRange = (known && known.range) || "";
  const adj = acWithCover(target, attackerCoverOpts(row, { spell: true, ranged: !/touch/i.test(spellRange) }));
  if (adj.blocked) { DM.toast("Total cover. You can't target " + (target.name || "them") + "."); return; }
  const bonus = Number(casting.attack) || 0;
  const ac = adj.ac;
  if (ac == null) { DM.toast((target.name || "Target") + " has no AC"); return; }
  spendSpellSlot(card, level);
  row.lastAttackerId = targetId;
  const nat = d20();
  const total = nat + bonus;
  const hit = nat !== 1 && total >= ac;
  let dmg = null;
  if (hit && diceOf()) dmg = DM.parseDice(diceOf());
  let detail = row.name + " casts " + name + " at " + (target.name || "someone") + ": " + nat + signed(bonus) + " = " + total + " vs AC " + ac + (adj.note ? " (" + adj.note + ")" : "") + (hit ? " → HIT" : " → MISS") + (dmg ? " · " + dmg.total : "");
  const rollId = DM.uid("spell");
  if (hit && dmg && fight.damageMode !== "approve") {
    applyPlayerHit({
      rollId: rollId,
      targetId: target.id,
      targetName: target.name,
      amount: dmg.total,
      from: row.id,
      characterName: row.name,
      label: name,
      weapon: name,
      type: "damage"
    });
  }
  const cond = spellConditionName(spell);
  if (hit && cond) {
    let apply = true;
    if (spell && spell.save) {
      const riderSave = await requestPlayerSave({
        targetId: target.id,
        targetName: target.name,
        ability: spell.save,
        dc: casting.dc,
        label: name,
        rider: cond,
        fromName: row.name || ""
      });
      detail += ". " + riderSave.line;
      apply = !!riderSave.failed;
    }
    if (apply) {
      await rememberCondition(row, target, cond, null);
      detail += " · " + cond;
    }
  }
  if (spellConcentrates(spell, known)) detail += noteConcentration(row, name);
  playCue();
  mapFx({ id: rollId, type: "spell", shooter: row.id, target: target.id, result: hit ? (nat === 20 ? "crit" : "hit") : "miss", nat: nat, crit: nat === 20 && hit,
    weapon: name, spell: true, heard: [] });
  await publishCardRoll(row, detail, total, { id: rollId, attack: true, nat: nat, damage: dmg ? dmg.total : null, targetId: target.id, spell: true, formula: "1d20" + signed(bonus) });
  await saveRemoteTable();
  renderFight();
  DM.toast(detail);
}
async function attackRow(i) {
  const row = fight.order[i];
  if (!row) return;
  const formula = ($("#dmgFormula") && $("#dmgFormula").value || "1d20").trim();
  const attackFormula = /d20/i.test(formula) ? formula : "1d20";
  const adj = acWithCover(row, {});
  if (adj.blocked) { DM.toast("Total cover. You can't target " + (row.name || "them") + "."); return; }
  const out = DM.parseDice(attackFormula);
  const ac = adj.have ? adj.ac : Number(row.ac);
  const hit = isFinite(ac) ? out.total >= ac : null;
  let dmg = null;
  if (hit) dmg = DM.parseDice(($("#dmgFormula") && /d20/i.test($("#dmgFormula").value) ? "1d8" : ($("#dmgFormula").value || "1d8")));
  const text = row.name + " AC " + (isFinite(ac) ? ac : "?") + (adj.note ? " (" + adj.note + ")" : "") + " · " + attackFormula + " = " + out.total + (hit == null ? "" : hit ? " HIT" : " MISS") + (hit && dmg ? " · " + dmg.total + " damage" : "");
  playTableSfx(strikeCue({ name: row.name, sfx: row.sfx }));
  await DM.pushRoll({
    who: "DM", uid: DM.state.uid, label: "DM roll vs this AC · " + row.name, formula: attackFormula,
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
/* 0.2.67: one big Roll Initiative. Enemies roll now; players get a prompt and
   anyone who hasn't rolled in INIT_WAIT_MS (or is offline) is auto-rolled with
   their own init bonus. Each player gets a fading "Initiative: N" toast. */
const INIT_WAIT_MS = 8000;
function playerInitBonus(snap) {
  const n = knownNumber(snap && snap.initBonus);
  if (n != null) return n;
  return dexModOf(snap);
}
function freshInit(pid, since) {
  const row = pid && DM.state.playerInit && DM.state.playerInit[pid];
  const n = knownNumber(row && row.init);
  if (n == null) return null;
  if (since && row.ts && Date.parse(row.ts) && Date.parse(row.ts) < since - 1000) return null;
  return n;
}
function rollInitiativeForAll(opts) {
  opts = opts || {};
  const wait = opts.wait != null ? opts.wait : INIT_WAIT_MS;
  const since = Date.now();
  fight.recruit = true;
  ensurePlayers();
  const status = $("#rollInitStatus");
  const btn = $("#btnRollInitAll");
  fight.order.forEach((row) => {
    if (row.kind === "player") return;
    row.init = d20() + (Number(row.initBonus) || 0);
  });
  const players = fight.order.filter((r) => r && r.kind === "player");
  players.forEach((row) => {
    const pid = row.playerId || row.id;
    if (!playerIsOnline(pid)) return;
    DM.pushCommand({ type: "init_prompt", to: pid, quiet: true, payload: { round: fight.round, wait: wait }, from: DM.state.uid });
  });
  if (status) status.textContent = players.length ? "Waiting for players to roll…" : "";
  if (btn) btn.disabled = true;
  saveRemoteTable();
  renderFight();
  const finish = () => {
    const auto = [];
    players.forEach((row) => {
      const pid = row.playerId || row.id;
      const posted = freshInit(pid, since);
      if (posted != null) {
        row.init = posted;
        row.initFrom = "sheet";
        return;
      }
      const snap = DM.state.players[pid] && DM.state.players[pid].snapshot;
      row.init = d20() + playerInitBonus(snap);
      row.initFrom = "auto";
      auto.push(row.name || pid);
      DM.pushCommand({ type: "init_set", to: pid, quiet: true, payload: { init: row.init, auto: true, name: row.name || "" }, from: DM.state.uid });
    });
    sortInitiative();
    saveRemoteTable();
    renderFight();
    if (btn) btn.disabled = false;
    if (status) status.textContent = auto.length ? "Auto-rolled: " + auto.join(", ") : "";
    announce("Rolled initiative" + (auto.length ? " (auto: " + auto.join(", ") + ")" : ""), "initiative");
    return auto;
  };
  if (!players.length || wait <= 0) return Promise.resolve(finish());
  return new Promise((resolve) => setTimeout(() => resolve(finish()), wait));
}
/* 0.2.67 Give tab: one recipient picker, type chips, handouts folded in. */
function wireGiveTab() {
  const panel = $("#panel-rewards");
  if (!panel || panel.getAttribute("data-give")) return;
  panel.setAttribute("data-give", "1");
  const who = $("#rewTarget");
  const mirror = () => {
    if (!who) return;
    ["#hoTarget", "#itemGiveTarget", "#packTarget", "#msgTarget"].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      const has = [...el.options].some((o) => o.value === who.value);
      if (has) el.value = who.value;
    });
  };
  if (who) who.addEventListener("change", mirror);
  panel.addEventListener("click", (e) => {
    const chip = e.target && e.target.closest ? e.target.closest("[data-give]") : null;
    /* 0.2.121: the What row is give-tab.js (data-give-mode); the panel's own data-give marker is not a chip */
    if (!chip || chip === panel) return;
    const kind = chip.getAttribute("data-give");
    panel.querySelectorAll("[data-give]").forEach((b) => b.classList.toggle("btn-primary", b === chip));
    mirror();
    const type = $("#rewType");
    let focus = null;
    if (kind === "es" || kind === "item" || kind === "note") {
      if (type) { type.value = kind; type.dispatchEvent(new Event("change", { bubbles: true })); }
      focus = kind === "es" ? $("#rewEs") : $("#rewText");
    } else if (kind === "handout") {
      focus = $("#hoName");
    } else if (kind === "weapon") {
      const form = $("#dmItemForm");
      const t = form && form.querySelector("[data-item-type]");
      if (t) { t.value = "weapon"; t.dispatchEvent(new Event("change", { bubbles: true })); }
      focus = form && form.querySelector("[data-item-name]");
    }
    if (focus) {
      try { focus.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (err) {}
      focus.focus();
    }
  });
}
function openAddEnemy() {
  const menu = $("#combatantMenu");
  if (menu) menu.open = true;
  const q = $("#enemyQ") || $("#customName");
  if (menu && menu.scrollIntoView) { try { menu.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }
  if (q && q.focus) q.focus();
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
  if (window.SSDNSTurn) window.SSDNSTurn.clearTurnState(fight);
  fight.held = {};
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
  const playerRow = !!(row && row.kind === "player");
  const snap = playerRow
    ? playerSnapshot(row.playerId || row.id)
    : (row ? null : playerSnapshot(meta.targetId));
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
    if (playerRow && window.SSDNSApplied && window.SSDNSApplied.markHpExpect) window.SSDNSApplied.markHpExpect(row, after);
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
  const pid = playerRow ? (row.playerId || row.id) : (!row && snap ? (meta.targetId || "") : "");
  if (pid && (playerRow || (!row && snap))) {
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
  else if (row && after > 0) clearDown(row);
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
  const fromId = req.from || "";
  const fromSnap = fromId && DM.state.players[fromId] && DM.state.players[fromId].snapshot;
  const rawCover = (row && row.coverLock) ? (row.cover || "") : (req.coverSet ? (req.cover || "") : coverValue(row || { id: req.targetId }));
  const coverAdj = window.SSDNSApplied && window.SSDNSApplied.coverAdjust
    ? window.SSDNSApplied.coverAdjust(knownNumber(row && row.ac), rawCover, {
      ranged: !!req.gun || !!req.spell,
      spell: !!req.spell,
      sharpshooter: !!(fromSnap && fromSnap.sharpshooter),
      spellSniper: !!(fromSnap && fromSnap.longRangeHex)
    })
    : { ac: knownNumber(row && row.ac), blocked: false, note: "" };
  if (coverAdj.blocked) {
    const who = req.characterName || "Someone";
    const name = (row && row.name) || req.targetName || "enemy";
    const line = who + " → " + name + ": total cover, can't be targeted.";
    markRequestResolved(reqId);
    DM.toast(line);
    return;
  }
  /* fog-aware targeting (Jessey 2026-10-20 9:52 PM): the DM's map checks the shot too, so a hand-made request
     can't hit a token the shooter can't see. The map answers null when it can't tell (no token, no map). */
  const host = window.SSDNSMapHost;
  const tgtKey = String(req.targetId || "");
  const seen = fromId && tgtKey && tgtKey !== FREE_SHOT_ID && host && typeof host.playerCanSee === "function"
    ? host.playerCanSee(fromId, tgtKey) : null;
  if (seen === false) {
    const who = req.characterName || "Someone";
    const name = (row && row.name) || req.targetName || "that target";
    const line = who + " → " + name + ": can't see that target (fog). Shot refused.";
    markRequestResolved(reqId);
    DM.toast(line);
    DM.pushLedger({ who: who, playerId: fromId, type: "alert", what: line, oldVal: null, newVal: "refused", flag: true, characterName: who });
    return;
  }
  const ac = coverAdj.ac != null ? coverAdj.ac : knownNumber(row && row.ac);
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
      target: shown.name || req.targetName || "enemy",
      weapon: req.spell ? "" : (req.weapon || ""),
      spell: req.spellName || (req.spell ? (req.weapon || "") : "")
    });
    verdict = packed;
    line = packed.line;
    applyAmount = Number(packed.amount) || 0;
  } else {
    verdict = window.SSDNSApplied && window.SSDNSApplied.attackVerdict
      ? window.SSDNSApplied.attackVerdict({ nat: req.nat, total: req.hitTotal, ac: ac, sfx: req.sfx, critMin: req.critMin })
      : { miss: Number(req.nat) === 1 || (ac != null && Number(req.hitTotal) < ac), crit: Number(req.nat) >= (Number(req.critMin) || 20), verdict: "HIT", sfx: req.sfx || "attack" };
    const card = window.SSDNSApplied && window.SSDNSApplied.attackBreakdown
      ? window.SSDNSApplied.attackBreakdown({
        who: req.characterName || "Someone",
        target: shown.name || req.targetName || "enemy",
        weapon: req.spell ? "" : (req.weapon || ""),
        spell: req.spellName || (req.spell ? (req.weapon || "") : ""),
        nat: req.nat,
        n1: req.n1,
        n2: req.n2,
        parts: req.parts,
        total: req.hitTotal,
        ac: ac,
        revealAc: true,
        critMin: req.critMin,
        misfire: !!req.misfire,
        damage: verdict.miss ? null : {
          faces: req.dmgFaces,
          parts: req.dmgParts,
          total: req.amount,
          type: req.dmgType || "",
          formula: req.dmgFormula || "",
          dice: req.dice || ""
        }
      })
      : null;
    line = card ? card.publicText : (window.SSDNSApplied && window.SSDNSApplied.attackPublicLine
      ? window.SSDNSApplied.attackPublicLine({
        who: req.characterName || "Someone",
        target: shown.name || req.targetName || "enemy",
        weapon: req.spell ? "" : (req.weapon || ""),
        spell: req.spellName || (req.spell ? (req.weapon || "") : ""),
        nat: req.nat,
        total: req.hitTotal,
        dice: req.dice || "",
        amount: verdict.miss ? "" : req.amount
      }, verdict)
      : ((req.characterName || "Someone") + " → " + (shown.name || "enemy") + " → " + verdict.verdict));
    if (card) verdict.dmText = card.dmText;
    applyAmount = verdict.miss ? 0 : (Number(req.amount) || 0);
  }
  const feedId = rollId || reqId || DM.uid("hit");
  verdictFeed(feedId, line, req.characterName || shown.name || "");
  if (req.from) {
    mapFx({ id: feedId, shooter: req.from, target: req.targetId, result: verdict.miss ? "miss" : (verdict.crit ? "crit" : "hit"),
      nat: req.nat, crit: !!verdict.crit, critMin: req.critMin, weapon: req.spell ? (req.spellName || req.weapon || "") : (req.weapon || ""),
      weaponId: req.weaponId || "", gun: !!req.gun, spell: !!req.spell, sfx: req.sfx || "", arrow: fxArrowType(req.arrow),
      dmgType: req.dmgType || "", heard: [DM.state.uid] });
  }
  if (window.SSDNSAudio && window.SSDNSAudio.playOutcome) {
    const outcome = verdict.miss ? "miss" : (verdict.crit ? "crit" : "hit");
    window.SSDNSAudio.playOutcome({
      id: req.weaponId || "",
      name: req.weapon || "",
      gun: !!req.gun,
      spell: !!req.spell,
      kind: req.spell ? "spell" : ""
    }, outcome);
  }
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
  DM.toast((verdict.dmText || line) + (verdict.dmText ? "" : (ac == null ? "" : " · AC " + ac)));
  if (!verdict.miss && applyAmount > 0 && heldOutOfTurn(req)) {
    holdHit({ rollId: rollId, targetId: req.targetId, targetName: (row && row.name) || req.targetName, amount: applyAmount, from: req.from,
      characterName: req.characterName || "Someone", label: req.label, weapon: req.weapon || req.label, dice: req.dice || "", type: "attack", heal: false },
      (req.characterName || "Someone") + " → " + ((row && row.name) || req.targetName || "target") + " for " + applyAmount);
  } else if (!verdict.miss && applyAmount > 0) {
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
  if (!req || req.resolved || req.type === "bank") return;
  /* turn order PR 2 (item 6): Mercy Hands rows belong to dmcc.js (it heals, or holds an out-of-turn cast); this path read them as damage */
  if (req.type === "mercy") return;
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
  if (heldOutOfTurn(req)) {
    holdHit({ rollId: rollId, targetId: req.targetId, targetName: req.targetName || name, amount: amt, from: req.from, characterName: who, label: req.label,
      weapon: req.weapon || req.label, dice: req.dice || "", type: req.type || "", heal: heal }, line);
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
/**
 * 0.2.68: a player's End turn button. Runs the DM's own Next only when the request names the turn
 * that is current right now and the current row belongs to that player; a stale or doubled click
 * does nothing. The DM's Next button is unchanged.
 */
function endTurnCheck(req) {
  if (!req || !fight.started || !fight.order.length) return "no fight";
  const turn = parseInt(fight.turn, 10) || 0;
  const cur = fight.order[turn] || {};
  if (Number(req.round) !== Number(fight.round) || Number(req.turn) !== turn) return "stale";
  if (!cur.playerId || cur.playerId !== req.from) return "not their turn";
  return "";
}
function endTurnRequest(req, id) {
  const why = endTurnCheck(req);
  if (DM.state._fb && DM.state.db) DM.state._fb.update(DM.roomRef("encounter/requests/" + id), { resolved: true, approved: !why }).catch(() => {});
  if (why) return;
  turnGate = 0;
  nextTurn();
  DM.toast((req.characterName || "A player") + " ended their turn");
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
      if (req && req.type === "bank") return;
      if (req && req.type === "endTurn") { if (fresh) endTurnRequest(req, id); return; }
      if (req && req.type === "oa") { if (fresh) noteOaRequest(req, id); return; }
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
    const t = e.target.closest && e.target.closest("[data-dm-scroll],[data-strip-next],[data-dm-pip],[data-dm-move],[data-dm-act],[data-pip-reset],[data-turn-unlock],[data-oa-ok],[data-oa-no],[data-held-ok],[data-held-no],[data-side-toggle],[data-init-up],[data-init-down-move],[data-init-del],[data-init-hit],[data-init-strike],[data-cyl-fire],[data-row-atk],[data-strip-fire],[data-init-cond],[data-your-turn],[data-init-dmg],[data-init-heal],[data-init-down],[data-init-fled],[data-add-beast],[data-stock-del],[data-pack-send],[data-pack-del],[data-quick-roll],[data-cat-add],[data-apply-hit],[data-undo-hit],[data-resend-turn],[data-resend-feed],[data-card-atk],[data-card-check],[data-card-dice],[data-card-cast],[data-clear-jam],[data-enemy-gun],[data-mf-op],[data-apply-rider],[data-feat-use],[data-feat-recharge],[data-slot-spend],[data-hide-all],[data-grab],[data-cond-drop],[data-fight-portrait]");
    if (!t) return;
    if (t.hasAttribute("data-dm-scroll")) {
      const lane = document.getElementById("dmTurnNames");
      const by = Math.round((lane ? lane.clientWidth : 160) * 0.6) * Number(t.getAttribute("data-dm-scroll"));
      if (lane) { if (lane.scrollBy) lane.scrollBy({ left: by, behavior: "smooth" }); else lane.scrollLeft += by; }
      return;
    }
    if (t.hasAttribute("data-strip-next")) { nextTurn(); return; }
    if (t.hasAttribute("data-dm-move")) { adjustEnemyMove(t.getAttribute("data-dm-move")); return; }
    if (t.hasAttribute("data-dm-act")) { toggleEnemyAct(t.getAttribute("data-dm-act")); return; }
    if (t.hasAttribute("data-dm-pip")) {
      if (t.hasAttribute("data-pip-pid")) { editPlayerMarker(t.getAttribute("data-pip-pid"), t.getAttribute("data-dm-pip")); return; }
      toggleEnemyMarker(t.getAttribute("data-dm-pip")); return;
    }
    if (t.hasAttribute("data-pip-reset")) { resetPlayerMarkers(t.getAttribute("data-pip-reset")); return; }
    if (t.hasAttribute("data-turn-unlock")) { toggleUnlock(t.getAttribute("data-turn-unlock")); return; }
    if (t.hasAttribute("data-oa-ok")) { answerOa(t.getAttribute("data-oa-ok"), true); return; }
    if (t.hasAttribute("data-oa-no")) { answerOa(t.getAttribute("data-oa-no"), false); return; }
    if (t.hasAttribute("data-held-ok")) { releaseHeld(t.getAttribute("data-held-ok"), true); return; }
    if (t.hasAttribute("data-held-no")) { releaseHeld(t.getAttribute("data-held-no"), false); return; }
    if (t.hasAttribute("data-fight-portrait")) {
      const pi = t.getAttribute("data-fight-portrait");
      const fold = document.querySelector('[data-turn-fold][data-fold-i="' + pi + '"]');
      if (fold && !fold.open) { fold.open = true; fightOpen[fold.getAttribute("data-turn-fold")] = true; }
      const card = document.querySelector('[data-fight-card="' + pi + '"]');
      if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest" });
      return;
    }
    if (t.hasAttribute("data-cond-drop")) {
      dropListedCondition(t.getAttribute("data-cond-drop"), t.getAttribute("data-cond-kind") || "enemy", t.getAttribute("data-cond-name") || "", t.getAttribute("data-cond-id") || "");
      return;
    }
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
    if (t.hasAttribute("data-grab")) {
      const i = parseInt(t.getAttribute("data-grab-i"), 10);
      runGrab(fight.order[i], "rob", {});
      return;
    }
    if (t.hasAttribute("data-init-strike")) { enemyStrike(parseInt(t.getAttribute("data-init-strike"), 10)); return; }
    if (t.hasAttribute("data-cyl-fire")) {
      const rowId = t.getAttribute("data-cyl-fire");
      const row = (fight.order || []).find((r) => r && r.id === rowId);
      if (!row) return;
      const n = parseInt(t.getAttribute("data-atk-n"), 10);
      const atk = row.card && row.card.attacks && row.card.attacks[n];
      const wrap = t.closest(".cylinder-row");
      const sel = wrap && wrap.querySelector("[data-cyl-target]");
      const targetId = (sel && sel.value) || (row.lastAttackerId || "");
      SSDNSMapFight.attack({
        combatantId: row.id,
        tokenId: row.mapTokenId || "",
        weaponId: atk && (atk.id || atk.name),
        targetCombatantId: targetId
      });
      return;
    }
    if (t.hasAttribute("data-strip-fire")) {
      const pid = t.getAttribute("data-strip-fire");
      const payload = { op: "fire", index: Number(t.getAttribute("data-gun-i")), chamber: Number(t.getAttribute("data-gun-k")), dm: true };
      const snapG = ((playerSnapshot(pid) || {}).guns || []).find((g) => g && Number(g.index) === payload.index) || {};
      dmFireMode(pid, snapG).then((picked) => {
        if (picked == null) return;
        if (picked) payload.mode = picked;
        DM.pushCommand({ type: "gun", to: pid, payload: payload });
        if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
      });
      return;
    }
    if (t.hasAttribute("data-row-atk")) { cardStrike(parseInt(t.getAttribute("data-row-atk"), 10), parseInt(t.getAttribute("data-atk-n"), 10)); return; }
    if (t.hasAttribute("data-card-atk")) { cardStrike(parseInt(t.getAttribute("data-card-atk"), 10), parseInt(t.getAttribute("data-atk-n"), 10)); return; }
    if (t.hasAttribute("data-card-check")) { cardCheck(parseInt(t.getAttribute("data-card-check"), 10), t.getAttribute("data-check-mod"), t.getAttribute("data-check-label")); return; }
    if (t.hasAttribute("data-card-dice")) { cardDice(parseInt(t.getAttribute("data-card-dice"), 10)); return; }
    if (t.hasAttribute("data-card-cast")) { cardCast(parseInt(t.getAttribute("data-card-cast"), 10), parseInt(t.getAttribute("data-spell-n"), 10)); return; }
    if (t.hasAttribute("data-enemy-gun")) {
      const hit = enemyGunRow(parseInt(t.getAttribute("data-eg-row"), 10), parseInt(t.getAttribute("data-atk-n"), 10));
      if (!hit) return;
      const op = t.getAttribute("data-enemy-gun");
      if (op === "clean") enemyGunClean(hit.row, hit.atk);
      else if (op === "reopen") enemyGunReopen(hit.row, hit.atk);
      else if (op === "addrounds") askEnemyRounds(hit.row, hit.atk).then((pick) => enemyAddRounds(hit.row, hit.atk, pick));
      return;
    }
    if (t.hasAttribute("data-mf-op")) {
      const row = fight.order[parseInt(t.getAttribute("data-mf-row"), 10)];
      const atk = row && row.card && row.card.attacks && row.card.attacks[parseInt(t.getAttribute("data-atk-n"), 10)];
      if (!atk || !window.SSDNSMisfire) return;
      const op = t.getAttribute("data-mf-op");
      const atkN = parseInt(t.getAttribute("data-atk-n"), 10);
      const override = {};
      if (op === "reset") override.resetStreak = true;
      else if (op === "cancel") override.cancelD4 = true;
      else override[op] = t.getAttribute("data-mf-on") === "1";
      /* Set Dirty is silent to the player: DM toast only, same as enemy Add rounds. Clear Dirty stays visible. */
      const settingDirty = op === "dirty" && t.getAttribute("data-mf-on") === "1";
      const applied = window.SSDNSMisfire.applyOverride(atk, override);
      Object.assign(atk, applied.gun);
      /* 0.3.61: on a PC row the sheet owns the gun; send the override or the next snapshot undoes it. */
      if (row.kind === "player") {
        const pidO = row.playerId || row.id;
        const payloadO = Object.assign({ op: "misfire", index: sheetSlot(atk, atkN) }, override);
        if (settingDirty) payloadO.quiet = true;
        DM.pushCommand({ type: "gun", to: pidO, payload: payloadO, from: DM.state.uid });
        if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pidO, payloadO);
      }
      if (op === "dirty" && !settingDirty) stampGunClean(row.kind === "player" ? playerGunKey(row.playerId || row.id, sheetSlot(atk, atkN)) : enemyGunKey(row, atkN));
      const line = "DM override on " + (row.name || "combatant") + " · " + (atk.name || "gun") + ": " + (applied.notes || []).join(", ") + ".";
      saveRemoteTable();
      if (!settingDirty) {
        if (DM.postDmAction) DM.postDmAction(line, row.id || "all");
        else DM.pushLedger({ who: "DM", playerId: row.id || "all", type: "dm", what: line, oldVal: null, newVal: line, flag: false, characterName: row.name || "" });
      }
      renderFight();
      DM.toast(line);
      return;
    }
    if (t.hasAttribute("data-clear-jam")) {
      const row = fight.order[parseInt(t.getAttribute("data-clear-jam"), 10)];
      const atk = row && row.card && row.card.attacks[parseInt(t.getAttribute("data-atk-n"), 10)];
      if (atk) {
        atk.jammed = false;
        if (row.kind === "player") {
          const pidJ = row.playerId || row.id;
          const payloadJ = { op: "clean", index: sheetSlot(atk, parseInt(t.getAttribute("data-atk-n"), 10)), optionId: "unjam" };
          DM.pushCommand({ type: "gun", to: pidJ, payload: payloadJ, from: DM.state.uid });
          if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pidJ, payloadJ);
        }
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
        releaseFightToken(gone);
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
function publicTokenName(row) {
  if (!row) return "Enemy";
  if (row.kind !== "player" && row.reveal && row.reveal.name === false) {
    return (window.SSDNSApplied && window.SSDNSApplied.HIDDEN_ENEMY_NAME) || "Unknown gunman";
  }
  return row.name || (row.kind === "player" ? "Player" : "Enemy");
}
/* Bestiary token art (Jessey 2026-10-20 10:30 AM CT): bestiary.json "token" is a file in map/tokenImages/bestiary/.
   The map loads "tokenImages/..." paths as they are (no crop). No token, or a custom enemy: the old default. */
const BEAST_TOKEN_DIR = "tokenImages/bestiary/";
function beastTokenFile(b) {
  const f = b && typeof b.token === "string" ? b.token.trim() : "";
  return /^(_alts\/)?[a-z0-9][a-z0-9_.-]*\.(webp|png)$/i.test(f) && f.indexOf("..") < 0 ? f : "";
}
function beastTokenImage(row) {
  const id = row && row.beastId;
  if (!id) return "";
  const b = (fight.bestiary || []).filter((x) => x && x.id === id)[0];
  const f = beastTokenFile(b);
  return f ? BEAST_TOKEN_DIR + f : "";
}
/* Token size (2026-10-20): the row's size field, else its bestiary entry's, else its card's; PCs are Medium. */
function rowSize(row) {
  if (!row) return "Medium";
  if (row.size) return row.size;
  const b = row.beastId ? (fight.bestiary || []).filter((x) => x && x.id === row.beastId)[0] : null;
  if (b && b.size) return b.size;
  return (row.card && row.card.size) || "Medium";
}
/* 16-char token label that keeps a trailing number: "Thunderbird Hatchling 2" -> "Thunderbird Ha 2" */
function tokenLabel(name) {
  const text = String(name || "");
  if (text.length <= 16) return text;
  const m = text.match(/^(.*?)(\s+\d+)$/);
  if (!m) return text.slice(0, 16);
  return (m[1].slice(0, 16 - m[2].length).trim() + m[2]).slice(0, 16);
}
/* map bestiary: when a second copy joins, uniqueName renames the first ("Bandit" -> "Bandit 1"); relabel their tokens */
function relabelSiblings(row) {
  const host = window.SSDNSMapHost;
  if (!row || !host || typeof host.patchToken !== "function") return;
  const base = String(row.name || "").replace(/\s+\d+$/, "").trim();
  (fight.order || []).forEach((r) => {
    if (!r || r.kind !== "enemy" || !r.mapTokenId) return;
    if (String(r.name || "").replace(/\s+\d+$/, "").trim() !== base) return;
    const name = publicTokenName(r);
    try { host.patchToken(r.mapTokenId, { label: tokenLabel(name), name: name }); } catch (e) {}
  });
}
function mapPlaceBeast(detail) {
  detail = detail || {};
  const beast = (fight.bestiary || []).find((b) => b && b.id === detail.beastId && !b.template);
  if (!beast) { DM.toast("Pick a creature"); return null; }
  const at = detail.at && isFinite(Number(detail.at.x)) && isFinite(Number(detail.at.y)) ? { x: Number(detail.at.x), y: Number(detail.at.y) } : null;
  const row = addBeastToFight(beast, { at: at });
  if (!row) return null;
  relabelSiblings(row);
  saveRemoteTable();
  renderFight();
  return row.mapTokenId || null;
}
function tokenPatchForRow(row) {
  const name = publicTokenName(row);
  const player = !!(row && row.kind === "player");
  const who = player ? ((row && (row.playerId || row.id)) || "") : ((row && row.id) || "");
  const patch = {
    combatantId: who,
    sheetId: player ? who : "",
    label: tokenLabel(name),
    name: name,
    kind: player ? "player" : "npc",
    ownerUid: player ? who : "",
    color: player ? "#4a90d9" : "#a33b3b",
    ownerCanMove: player,
    size: player ? "Medium" : rowSize(row) /* token size: footprint from the bestiary / enemy size field */
  };
  const beastArt = player ? "" : beastTokenImage(row);
  const preset = window.SSDNSTokenCrop && window.SSDNSTokenCrop.preset
    ? window.SSDNSTokenCrop.preset((row && (row.beastId || row.name)) || "")
    : "";
  if (beastArt) patch.image = beastArt; /* bestiary token art (map/tokenImages/bestiary/<token>) */
  else if (preset) patch.image = preset;
  else if (player) {
    const snap = playerSnapshot(who);
    if (snap && snap.portrait) patch.portrait = snap.portrait;
  }
  return patch;
}
function assignMapToken(row, tokenId) {
  const live = rowInOrder(row);
  claimTokenId(live, tokenId);
  saveRemoteTable();
  pushMapInitiative();
}
function tokenStillThere(tokenId) {
  const host = window.SSDNSMapHost;
  if (!tokenId || !host || typeof host.hasToken !== "function") return !!tokenId;
  return !!host.hasToken(tokenId);
}
function bindNewToken(row, at) {
  if (!row || row.kind === "player" || linkBusy) return;
  if (row.mapTokenId && tokenStillThere(row.mapTokenId)) return;
  const host = window.SSDNSMapHost;
  if (!host || typeof host.placeToken !== "function") return;
  /* 0.3.59: never stack a second token before the room's tokens have loaded */
  if (typeof host.tokensLoaded === "function" && !host.tokensLoaded()) return;
  const had = typeof host.tokenForCombatant === "function" ? host.tokenForCombatant(row.id) : "";
  if (had) { assignMapToken(row, had); return; }
  const patch = tokenPatchForRow(row);
  const tokenId = host.placeToken(Object.assign({ combatantId: row.id }, patch, at ? { at: at } : {}));
  if (tokenId) assignMapToken(row, tokenId);
}
function dropMapToken(row) {
  const tokenId = row && row.mapTokenId;
  if (row && row.mapTokenId) delete row.mapTokenId;
  if (!tokenId || linkBusy) return;
  const host = window.SSDNSMapHost;
  if (!host || typeof host.removeToken !== "function") return;
  linkBusy = true;
  try { host.removeToken(tokenId); }
  finally { linkBusy = false; }
}
function releaseFightToken(row) {
  if (!row) return;
  if (row.kind === "player") {
    if (row.mapTokenId) delete row.mapTokenId;
    return;
  }
  dropMapToken(row);
}
function addBeastToFight(b, opts) {
  if (!b) { DM.toast("Pick an enemy"); return null; }
  if (!claimEnemyAdd(b.id)) return null;
  try {
    fight.recruit = true;
    const row = addCombatant(beastRow(b));
    if (row) {
      announce("Added " + row.name + " to the turn order", "combat", row);
      if (opts && opts.tokenId) assignMapToken(row, opts.tokenId);
      else bindNewToken(row, opts && opts.at);
    }
    return row;
  } finally {
    setTimeout(finishEnemyAdd, 0);
  }
}
function addCustomEnemy(opts) {
  opts = opts || {};
  const fromMap = !!opts.tokenId;
  const name = (opts.name || ($("#customName") && $("#customName").value || "")).trim() || "Bandit";
  fight.recruit = true;
  const qtyRaw = parseInt($("#customQty") && $("#customQty").value, 10);
  const qty = fromMap ? 1 : Math.max(1, Math.min(20, isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1));
  const initRaw = $("#customInit") && String($("#customInit").value).trim();
  const dexField = $("#customDex");
  const dexBlank = !dexField || String(dexField.value).trim() === "";
  const dexParsed = parseInt(dexField && dexField.value, 10);
  const dex = dexBlank ? "" : (isFinite(dexParsed) ? dexParsed : 0);
  const initBonus = initRaw === "" || initRaw == null ? (dexBlank ? "" : dexModFrom(dex)) : (parseInt(initRaw, 10) || 0);
  const atkRaw = $("#customAtkBonus") && String($("#customAtkBonus").value).trim();
  const atkBonus = atkRaw === "" || atkRaw == null ? "" : (Number(atkRaw));
  const damageDice = ($("#customDmg") && $("#customDmg").value) || "";
  const formNum = (el) => {
    if (!el || String(el.value).trim() === "") return "";
    const n = parseInt(el.value, 10);
    return isFinite(n) ? n : "";
  };
  const customText = (($("#customAtk") && $("#customAtk").value) || "").trim();
  const rows = [];
  for (let n = 0; n < qty; n++) {
    const spec = {
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
      attacks: customText || "Ball n Cap Revolver +3, range 20/60, 1d8+1 piercing, capacity 6, misfire 4, slow load",
      attackList: [customText ? attackFromLine(customText, atkBonus, damageDice) : banditGun()],
      size: "Medium",
      speed: 30,
      cr: "1/8"
    };
    ensureCombatantCard(spec);
    const row = addCombatant(spec);
    if (row) rows.push(row);
  }
  if (!fromMap) {
    ["customHp", "customAc", "customInit", "customDex", "customAtk", "customAtkBonus", "customDmg"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    if ($("#customQty")) $("#customQty").value = "1";
  }
  rows.forEach((row, n) => {
    announce("Added " + row.name + " to the turn order", "combat", row);
    if (fromMap && n === 0) assignMapToken(row, opts.tokenId);
    else bindNewToken(row);
  });
  return rows[0] || null;
}
function enemyPickerQuery() {
  const el = $("#enemyQ");
  return el && el.value ? String(el.value).trim().toLowerCase() : "";
}
function enemyPickerList(list, query, parkedOn) {
  const q = String(query || "").trim().toLowerCase();
  return (list || []).filter((b) => {
    if (!b || b.template) return false;
    if (isParkedBeast(b) && !parkedOn) return false;
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
    if (window.SSDNSMusicDM) window.SSDNSMusicDM.toggle();
    else if (fight.playing) stopTrack(); else playTrack();
  }
}

const seenInit = {};
let rollsReady = false;
const seenDamage = {};
function noteDamageRolls(rows) {
  /* turn order PR 2 (item 7): with Approve first, out-of-turn hits still go to the waiting list (their feed Apply is hidden) */
  const approve = fight.damageMode === "approve";
  (rows || []).forEach((r) => {
    if (approve && !(r && r.id && !seenDamage[r.id] && !r.applied && !fight.appliedHits[r.id] && !r.awaitDm && heldOutOfTurn(r))) return;
    if (!r || !r.id || seenDamage[r.id] || r.applied || fight.appliedHits[r.id] || r.selfApplied || r.awaitDm) return;
    if (fight.held && fight.held[r.id]) { seenDamage[r.id] = 1; return; }
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
    if (heldOutOfTurn(r)) {
      holdHit({ rollId: r.id, targetId: r.targetId, targetName: r.targetName, amount: amt, from: r.playerId || r.uid, characterName: r.characterName || r.who,
        label: r.weapon || r.label, weapon: r.weapon || "", dice: r.dice || "", type: r.heal ? "heal" : (r.type || ""), heal: !!r.heal },
        (r.characterName || r.who || "Someone") + (r.heal ? " heals " : " → ") + (r.targetName || "target") + " for " + amt);
      return;
    }
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
let playerCardSig = "";
function snapshotCardSig() {
  const Applied = window.SSDNSApplied;
  return Object.keys((DM.state && DM.state.players) || {}).map((id) => {
    const s = (DM.state.players[id] && DM.state.players[id].snapshot) || {};
    const guns = Applied && Applied.gunsSignature ? Applied.gunsSignature(s.guns) : "";
    const melee = (s.melee || []).map((m) => (m && (m.weapon || m.name) || "") + (m && m.equipped === false ? ":0" : ":1")).join(",");
    return id + "=" + [s.hpCurrent, s.hpMax, s.hpTemp, s.ac, s.cover, guns, melee].join(":");
  }).join("|");
}
function refreshOpenCard() {
  if (window.SSDNSMapHost && window.SSDNSMapHost.refreshCard) {
    try { window.SSDNSMapHost.refreshCard(); } catch (e) {}
  }
}
function syncPlayerVitals() {
  let tableChanged = false;
  let gunsChanged = false;
  const Applied = window.SSDNSApplied;
  (fight.order || []).forEach((row) => {
    if (!row || row.kind !== "player") return;
    const pid = row.playerId || row.id;
    const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
    if (!snap) return;
    const hpEl = document.querySelector('[data-hp-val][data-row-id="' + (window.CSS && CSS.escape ? CSS.escape(row.id || "") : (row.id || "")) + '"]');
    if (document.activeElement === hpEl) return;
    if (Applied && Applied.acceptPlayerHp) {
      if (Applied.acceptPlayerHp(row, snap.hpCurrent, Date.now())) {
        const status = Applied.syncDownStatus ? Applied.syncDownStatus(row) : "";
        if (status === "Down") mirrorMapStatus(row, "down");
        else if (status === "") mirrorMapStatus(row, "");
        tableChanged = true;
      }
    } else if (!(row.hpLockUntil && Date.now() < row.hpLockUntil) && snap.hpCurrent != null && snap.hpCurrent !== "" && Number(row.hp) !== Number(snap.hpCurrent)) {
      row.hp = snap.hpCurrent;
      tableChanged = true;
    }
    if (snap.ac != null && snap.ac !== "" && Number(row.ac) !== Number(snap.ac)) {
      row.ac = snap.ac;
      tableChanged = true;
    }
    if (!row.coverLock) {
      const nextCover = window.SSDNSApplied && window.SSDNSApplied.coverKey ? window.SSDNSApplied.coverKey(snap.cover) : (snap.cover || "");
      const curCover = window.SSDNSApplied && window.SSDNSApplied.coverKey ? window.SSDNSApplied.coverKey(row.cover) : (row.cover || "");
      if (nextCover !== curCover) { row.cover = nextCover; tableChanged = true; }
    }
    const dex = dexFromSnapshot(snap);
    if (row.dex !== dex) { row.dex = dex; tableChanged = true; }
    if (snap.hpMax != null && row.maxHp !== snap.hpMax) row.maxHp = snap.hpMax;
    row.card = row.card || {};
    row.card.items = Array.isArray(snap.items) ? snap.items : [];
    row.inventoryLocked = !!snap.inventoryLocked;
    if (Applied && Applied.gunsSignature) {
      const sig = Applied.gunsSignature(snap.guns);
      if (row._gunSig !== sig) {
        row._gunSig = sig;
        ensurePlayerAttacks(row);
        gunsChanged = true;
      }
    }
  });
  ensurePlayers();
  paintTurnAck();
  paintTurnRules();
  const nextCard = snapshotCardSig();
  const cardChanged = nextCard !== playerCardSig;
  playerCardSig = nextCard;
  if (gunsChanged || cardChanged) refreshOpenCard();
  if (gunsChanged) renderFight();
  if (!tableChanged) return;
  saveRemoteTable();
  renderFight();
  if (!gunsChanged && !cardChanged) refreshOpenCard();
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
  if (window.SSDNSTurn) window.SSDNSTurn.clearTurnState(fight);
  fight.held = {};
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
  (fight.order || []).forEach((row) => {
    if (row && (row.id === id || row.playerId === id)) releaseFightToken(row);
  });
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
  watchTableSfx();
}
function banditGun() {
  return {
    id: "ball-n-cap",
    name: "Ball n Cap Revolver",
    kind: "ranged",
    toHit: 3,
    bonus: 3,
    damage: "1d8+1",
    damageType: "piercing",
    range: "20/60",
    capacity: 6,
    loaded: 6,
    misfire: 4,
    weapon: "Navy / Army Ball n Cap Revolver",
    properties: ["close quarters", "slow load (a full turn)", "simple"],
    notes: "Navy / Army Ball n Cap Revolver. Simple. Close quarters: no disadvantage with a hostile within 5 ft. Misfire on a natural 1–4: miss, jam, and the round is spent. Slow load: reloading takes a full turn (action, bonus action, and movement)."
  };
}
function attackFromLine(text, bonus, damage) {
  const raw = String(text || "").trim();
  if (!raw) return banditGun();
  const mf = raw.match(/(?:misfire|MF)\s*(\d+)(?:\s*[–-]\s*(\d+))?/i);
  const cap = raw.match(/(?:capacity|cap)\s*(\d+)|\b(\d+)\s*rds?\b/i);
  const dmg = raw.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i);
  const range = raw.match(/(\d+\s*\/\s*\d+)/);
  const signedBonus = raw.match(/([+-]\d+)/);
  const name = raw.split(/[,.(]/)[0].replace(/\s*[+-]\d+\s*$/, "").trim() || "Attack";
  const capacity = cap ? Number(cap[1] || cap[2]) : null;
  const hit = bonus === "" || bonus == null ? (signedBonus ? Number(signedBonus[1]) : "") : bonus;
  const gun = /ball|revolver|rifle|gun|pistol|cap/i.test(raw);
  return {
    id: "custom-atk",
    name: name,
    kind: gun ? "ranged" : "",
    toHit: hit,
    bonus: hit,
    damage: (damage && String(damage).trim()) || (dmg ? dmg[1].replace(/\s+/g, "") : ""),
    damageType: /piercing/i.test(raw) ? "piercing" : (/slashing/i.test(raw) ? "slashing" : (/bludgeoning/i.test(raw) ? "bludgeoning" : "")),
    range: range ? range[1].replace(/\s+/g, "") : "",
    capacity: isFinite(capacity) ? capacity : null,
    loaded: isFinite(capacity) ? capacity : null,
    misfire: mf ? Number(mf[2] || mf[1]) : null,
    weapon: name,
    properties: /slow/i.test(raw) ? ["slow load (a full turn)"] : []
  };
}
async function bootV2() {
  if (DM.state.roomCode) enterRoom();
  try {
    const res = await fetch("assets/data/bestiary.json?v=0.2.132-thunderbirds");
    if (res.ok) fight.bestiary = await res.json();
    const saved = JSON.parse(localStorage.getItem(BESTIARY_KEY) || "null");
    fight.bestiary = mergeBestiary(fight.bestiary, Array.isArray(saved) ? saved : []);
    refreshFightCards();
  } catch (e) {}
  try {
    const res = await fetch("assets/data/store-items.json?v=0.2.132-act1");
    if (res.ok) {
      storeItems = await res.json();
      if (window.SSDNSItems && window.SSDNSItems.setStore) window.SSDNSItems.setStore(storeItems);
    } else DM.toast("Store list failed to load");
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
  $("#btnClearStale") && $("#btnClearStale").addEventListener("click", () => { clearStaleTokens(); });
  $("#btnPrevTurn") && $("#btnPrevTurn").addEventListener("click", () => { undoLastNext(); });
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
  $("#storeAct") && $("#storeAct").addEventListener("change", (e) => { setStoreAct(e.target.value); });
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
  $("#btnCampaignDay") && $("#btnCampaignDay").addEventListener("click", () => advanceCampaignDay());
  $("#btnInspGrantTable") && $("#btnInspGrantTable").addEventListener("click", () => changeInspiration(1));
  $("#btnInspSpendTable") && $("#btnInspSpendTable").addEventListener("click", () => changeInspiration(-1));
  renderCatalog();
  $("#btnSavePack") && $("#btnSavePack").addEventListener("click", savePack);
  $("#btnMusicPlay") && $("#btnMusicPlay").addEventListener("click", playTrack);
  $("#btnMusicStop") && $("#btnMusicStop").addEventListener("click", stopTrack);
  wireClicks();
  document.addEventListener("keydown", shortcuts);
  window.DMCCEnhance = {
    rememberGiveUndo(id, label) { rememberUndo({ type: "give", give: id, label: label || "give" }); },
    /* L0188 food & water: the Supplies panel sets exhaustion through the same condition path */
    writeSubjectConditions: writeSubjectConditions,
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
      watchTableSfx();
    },
    onRolls: function (rows) {
      (rows || []).forEach(noteSaveRoll);
      noteInitiativeRolls(rows);
      fightLogCards();
    },
    currentTurn: function () {
      return fight.started ? (fight.order[fight.turn] || null) : null;
    },
    turnState: turnState,
    undoLastNext: undoLastNext,
    nextTurn: nextTurn,
    turnMarkersFor: turnMarkersFor,
    /* turn order PR 2 */
    editPlayerMarker: editPlayerMarker,
    resetPlayerMarkers: resetPlayerMarkers,
    playerMarkers: playerMarkers,
    toggleUnlock: toggleUnlock,
    noteOaRequest: noteOaRequest,
    answerOa: answerOa,
    holdHit: holdHit,
    releaseHeld: releaseHeld,
    heldOutOfTurn: heldOutOfTurn,
    heldHits: function () { return Object.assign({}, fight.held || {}); },
    mapMarkersHtml: mapMarkersHtml,
    movementBudget: movementBudgetForToken,
    spendMove: spendMoveForToken,
    paintTurnRules: paintTurnRules,
    syncPlayers: syncPlayerVitals,
    onPlayerInit: onPlayerInit,
    notePresence: notePresence,
    clearFight: clearFight,
    acFor: acForRoll,
    enterRoom: enterRoom,
    renderFight: renderFight,
    removeCombatant: removeCombatant,
    rollInitiativeForAll: rollInitiativeForAll,
    openAddEnemy: openAddEnemy,
    openAllStores: openAllStores
  };
  const rollAll = $("#btnRollAll");
  if (rollAll) rollAll.addEventListener("click", rollAllEnemies);
  wireGiveTab();
  const rollInitAll = $("#btnRollInitAll");
  if (rollInitAll) rollInitAll.addEventListener("click", () => { rollInitiativeForAll(); });
  const plusEnemy = $("#btnPlusEnemy");
  if (plusEnemy) plusEnemy.addEventListener("click", openAddEnemy);
  const endBtn = $("#btnEndCombat");
  if (endBtn) endBtn.addEventListener("click", endCombat);
  const endHead = $("#btnEndCombatHead");
  if (endHead) endHead.addEventListener("click", endCombat);
  const addCustom = $("#btnAddCustom");
  if (addCustom) addCustom.addEventListener("click", () => { addCustomEnemy({ clear: true }); });
  const mode = $("#damageMode");
  if (mode) mode.addEventListener("change", () => {
    fight.damageMode = mode.value || "auto";
    saveRemoteTable();
  });
  bindFightRangeOverride();
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
    if (t.hasAttribute("data-cover-val") || t.hasAttribute("data-cover-lock")) {
      const coverRow = fightRowFromField(t);
      if (!coverRow) return;
      const nextKey = t.hasAttribute("data-cover-val") ? t.value : coverRow.cover;
      const nextLock = t.hasAttribute("data-cover-lock") ? !!t.checked : !!coverRow.coverLock;
      applyCoverEdit(coverRow, nextKey, nextLock);
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
      if (!ev.isTrusted) return;
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
          if (window.SSDNSApplied && window.SSDNSApplied.markHpExpect) window.SSDNSApplied.markHpExpect(row, n);
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
      if (window.SSDNSGiveTab) return; /* 0.2.121: give-tab.js records each give with its own undo */
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
function mapDrawerSpells(row) {
  const card = (row && row.card) || {};
  const casting = card.spellcasting || {};
  let list = Array.isArray(casting.spells) ? casting.spells : (Array.isArray(card.spells) ? card.spells : []);
  if (!list.length && row && row.kind === "player") {
    const snap = playerSnapshot(row.playerId || row.id) || {};
    const book = snap.spells || {};
    list = [];
    (book.cantrips || []).forEach((name) => { if (name) list.push({ id: name, name: name, level: 0 }); });
    (book.prepared || []).forEach((name) => {
      if (!name) return;
      const known = window.SSDNSSpellCast && window.SSDNSSpellCast.lookup ? window.SSDNSSpellCast.lookup(name) : null;
      const lv = known && typeof known.level === "number" ? known.level : 1;
      list.push({ id: name, name: name, level: lv });
    });
  }
  return list.filter(Boolean).map((s, n) => {
    const raw = typeof s === "string" ? s : (s.name || s.id || "Spell");
    const known = window.SSDNSSpellCast && window.SSDNSSpellCast.lookup ? window.SSDNSSpellCast.lookup(raw) : null;
    const name = (known && known.name) || raw;
    const kind = listedKind(typeof s === "string" ? { name: name } : s, known);
    return {
      id: (typeof s === "object" && (s.id || s.name)) || name || ("spell-" + n),
      name: name,
      level: typeof s === "object" && s.level != null ? s.level : (known && known.level != null ? known.level : 0),
      kind: kind,
      range: (typeof s === "object" && s.range) || (window.SSDNSSpellCast && window.SSDNSSpellCast.rangeOf && window.SSDNSSpellCast.rangeOf(name)) || "",
      save: (typeof s === "object" && s.save) || (known && known.save) || "",
      dc: casting.dc != null ? casting.dc : "",
      toHit: casting.attack != null ? casting.attack : "",
      damage: (known && known.dice) || (typeof s === "object" && s.damage) || "",
      concentration: spellConcentrates(typeof s === "string" ? { name: name } : s, known),
      note: (typeof s === "object" && (s.summary || s.note)) || ""
    };
  });
}
function mapDrawerCard(row) {
  if (!row) return null;
  const rawAttacks = (row.card && row.card.attacks && row.card.attacks.length) ? row.card.attacks : (row.attackList || []);
  const guns = row.kind === "player" ? publicGuns(row) : [];
  const attacks = (rawAttacks.length ? rawAttacks : guns).filter(Boolean).map((a, n) => {
    const cap = a.capacity != null && a.capacity !== "" ? Number(a.capacity) : (a.ammo && a.ammo.cap != null ? Number(a.ammo.cap) : null);
    const loaded = a.loaded != null && a.loaded !== "" ? Number(a.loaded) : (a.ammo && a.ammo.loaded != null ? Number(a.ammo.loaded) : null);
    const attack = {
      id: a.id || a.name || ("atk-" + n),
      name: a.name || "Attack",
      toHit: a.toHit != null && a.toHit !== "" ? a.toHit : (a.bonus != null ? a.bonus : (row.atkBonus != null ? row.atkBonus : 0)),
      range: a.range || "",
      damage: a.damage || a.dice || row.damage || "",
      weapon: a.weapon || "",
      properties: Array.isArray(a.properties) ? a.properties.join(", ") : (a.properties || ""),
      group: a.group || "",
      action: a.action || "",
      mod: a.mod || "",
      tier: a.tier || "",
      unwieldy: !!a.unwieldy,
      scatter: !!a.scatter,
      load: a.load || "",
      kind: a.kind || "",
      scope: !!(a.scope || /scope/i.test(a.mod || "")),
      dirty: !!a.dirty,
      fouled: !!a.fouled,
      ruined: !!(a.ruined || a.broken),
      broken: !!a.broken,
      exploded: !!a.exploded,
      jammed: !!a.jammed,
      misStreak: Number(a.misStreak) || 0,
      misfire: a.misfire == null ? "" : a.misfire,
      pendingD4: !!a.pendingD4,
      gunIndex: a.gunIndex,
      sheetIndex: a.sheetIndex != null ? a.sheetIndex : a.gunIndex,
      ammoName: typeof a.ammoName === "string" ? a.ammoName : (typeof a.ammo === "string" ? a.ammo : ""),
      ammoDisplay: a.ammoDisplay || "",
      tr: !!a.tr,
      caster: !!a.caster,
      calling: a.calling || "",
      ammoPool: a.ammoPool == null ? "" : String(a.ammoPool),
      attackMode: a.attackMode === "adv" || a.attackMode === "dis" ? a.attackMode : "",
      pools: Array.isArray(a.pools) ? a.pools : [],
      castSpells: Array.isArray(a.castSpells) ? a.castSpells : []
    };
    if (cap != null && isFinite(cap)) {
      const chambers = Array.isArray(a.chambers) && a.chambers.length
        ? chamberPicture(a.chambers)
        : (a.ammo && Array.isArray(a.ammo.chambers) ? chamberPicture(a.ammo.chambers) : null);
      attack.ammo = {
        loaded: isFinite(loaded) ? loaded : 0,
        cap: cap,
        spare: a.spare != null ? a.spare : (a.ammo && a.ammo.spare),
        chambers: chambers,
        locked: Array.isArray(a.lockedChambers) ? a.lockedChambers.slice() : (a.ammo && Array.isArray(a.ammo.locked) ? a.ammo.locked.slice() : [])
      };
    }
    return attack;
  });
  const spells = mapDrawerSpells(row);
  const snapFeats = row.kind === "player" ? (playerSnapshot(row.playerId || row.id) || {}) : {};
  const conds = conditionsForRow(row).map((c) => {
    const Cond = window.SSDNSConditions;
    if (Cond && Cond.label) return Cond.label(c);
    return typeof c === "string" ? c : (c && (c.name || c.label)) || "";
  }).filter(Boolean);
  const speed = row.speed != null && row.speed !== "" ? row.speed : (row.card && row.card.speed);
  return {
    tokenId: row.id,
    kind: row.kind === "player" ? "pc" : "enemy",
    name: row.name || "Combatant",
    owner: row.playerId || "",
    hidden: !!(row.hidden || (row.reveal && row.reveal.name === false)),
    ac: row.ac,
    cover: window.SSDNSApplied && window.SSDNSApplied.coverKey ? window.SSDNSApplied.coverKey(row.cover) : (row.cover || ""),
    coverLock: !!row.coverLock,
    hp: { cur: row.hp, max: row.maxHp, temp: row.tempHp || row.hpTemp || 0 },
    speed: speed == null || speed === "" ? 30 : speed,
    conditions: conds,
    portrait: row.portrait || null,
    noHpPool: noHpPoolRow(row), /* 0.2.101: no HP pool (Spectral Horse): the map draws no down X / HP bar */
    attacks: attacks,
    spells: spells,
    longRangeHex: !!snapFeats.longRangeHex,
    sharpshooter: !!snapFeats.sharpshooter,
      tactics: (window.SSDNSApplied && window.SSDNSApplied.tacticsNote) ? (window.SSDNSApplied.tacticsNote(row) || "") : (row.tactics || ""),
      deathSaves: row.deathSaves || null,
      dmActsAs: row.kind === "player" ? !!row.dmActsAs : false,
      lastWeaponId: row.lastWeaponId || "",
      calling: snapFeats.calling || snapFeats.callingId || ""
    };
}
function findFightRow(tokenId) {
  if (!tokenId) return null;
  return (fight.order || []).find((row) => row && (row.id === tokenId || row.playerId === tokenId || row.mapTokenId === tokenId)) || null;
}
function rosterCard(pid) {
  const p = pid && DM.state.players && DM.state.players[pid];
  if (!p) return null;
  const s = p.snapshot || {};
  const shadow = {
    id: pid,
    playerId: pid,
    kind: "player",
    name: s.name || s.player || pid,
    ac: s.ac,
    cover: s.cover || "",
    coverLock: !!s.coverLock,
    hp: s.hpCurrent,
    maxHp: s.hpMax,
    dex: dexFromSnapshot(s)
  };
  ensurePlayerAttacks(shadow);
  return mapDrawerCard(shadow);
}
function linkChoiceList() {
  const players = Object.keys(DM.state.players || {}).map((id) => {
    const s = (DM.state.players[id] && DM.state.players[id].snapshot) || {};
    return { id: id, label: s.name || s.player || id };
  });
  const enemies = (fight.order || []).filter((row) => row && row.kind !== "player" && !row.mapTokenId).map((row) => ({
    id: row.id,
    label: row.name || "Enemy"
  }));
  const buckets = {};
  (fight.bestiary || []).forEach((b) => {
    if (!b || b.template || isParkedBeast(b)) return;
    const key = BEAST_GROUPS.some((pair) => pair[0] === b.group) ? b.group : "other";
    const art = beastTokenFile(b);
    (buckets[key] || (buckets[key] = [])).push({ id: b.id, name: b.name || b.id, token: art ? BEAST_TOKEN_DIR + art : "", size: b.size || "", cr: b.cr == null ? "" : b.cr });
  });
  const order = BEAST_GROUPS.map((pair) => pair[0]).concat(buckets.other ? ["other"] : []);
  const bestiary = order.filter((key) => buckets[key] && buckets[key].length).map((key) => ({
    label: (BEAST_GROUPS.filter((pair) => pair[0] === key)[0] || ["", "Other"])[1],
    options: buckets[key]
  }));
  return { players: players, enemies: enemies, bestiary: bestiary, customLabel: "New custom enemy (Bandit)" };
}
window.SSDNSMapCards = {
  get(tokenId) {
    const row = findFightRow(tokenId);
    if (row) return mapDrawerCard(row);
    return rosterCard(tokenId);
  },
  choices() {
    return linkChoiceList();
  },
  initiative() {
    return {
      round: fight.round || 1,
      turn: fight.started ? (fight.turn || 0) : -1,
      started: !!fight.started,
      order: (fight.order || []).filter(Boolean).map((row) => ({
        id: row.id || "",
        name: row.name || "",
        kind: row.kind || "",
        playerId: row.playerId || "",
        /* map condition badges (DM map only; players read the masked table/initiative copy) */
        conditions: conditionNamesForMap(row)
      }))
    };
  }
};

/* map token guns (Jessey 2026-10-20 9:21 PM): each token remembers the weapon it last used or the DM last picked.
   Lives on the fight row (local table) and, for NPCs, in the DM-only encounter/dm secret. No new database path. */
function rememberWeapon(row, atk) {
  if (!row || !atk) return;
  const id = String(atk.id || atk.name || "");
  if (id) row.lastWeaponId = id;
}
function conditionNamesForMap(row) {
  const Cond = window.SSDNSConditions;
  let list = conditionsForRow(row);
  if (!list.length && row && row.kind === "player") {
    const snap = playerSnapshot(row.playerId || row.id);
    list = (snap && snap.activeConditions) || [];
  }
  return list.map((c) => String((c && (c.name || c.label)) || c || "").trim() + (c && c.name === "Exhaustion" && c.level ? " " + c.level : "")).filter(Boolean);
}
async function mapPickWeapon(detail) {
  detail = detail || {};
  const i = mapFightIndex(detail);
  if (i < 0) return false;
  const row = fight.order[i];
  if (row.kind === "player") ensurePlayerAttacks(row);
  else ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) return false;
  rememberWeapon(row, atk);
  await saveRemoteTable();
  return true;
}
function mapFightIndex(detail) {
  const keys = [];
  if (detail && detail.combatantId) keys.push(detail.combatantId);
  if (detail && detail.tokenId) keys.push(detail.tokenId);
  for (let n = 0; n < keys.length; n++) {
    const key = keys[n];
    const found = (fight.order || []).findIndex((row) => row && (row.id === key || row.playerId === key || row.mapTokenId === key));
    if (found >= 0) return found;
  }
  return -1;
}
function ensurePlayerAttacks(row) {
  if (!row || row.kind !== "player") return;
  const pid = row.playerId || row.id;
  const snap = playerSnapshot(pid);
  /* SAMPLE trackers: quiver / loaded / thrown rows for the DM map token badge */
  if (snap && snap.trackers) { row.card = row.card || {}; row.card.trackRows = snap.trackers.tokenRows || []; }
  const named = ((snap && snap.guns) || []).filter((g) => g && (g.name || g.weapon));
  const guns = named.filter((g) => g.equipped !== false);
  if (!named.length) return;
  if (!guns.length) {
    row.card = row.card || {};
    row.card.attacks = [];
    return;
  }
  const prev = (row.card && row.card.attacks) || [];
  row.card = row.card || {};
  row.card.pistolero = !!(snap && snap.pistolero); /* 0.2.86: the drawer offers Fan the Hammer */
  row.card.attacks = guns.map((g) => {
    const n = Math.max(0, named.indexOf(g));
    const id = g.id || ("gun-" + n);
    const name = g.name || g.weapon || ("Gun " + (n + 1));
    const old = prev.filter((a) => a && (a.id === id || a.name === name))[0] || {};
    const cap = g.capacity != null && g.capacity !== "" ? Number(g.capacity) : (Array.isArray(g.chambers) ? g.chambers.length : null);
    const loaded = g.loaded != null && g.loaded !== "" ? Number(g.loaded) : (Array.isArray(g.chambers) ? g.chambers.filter((st) => !!st).length : 0);
    return {
      id: id,
      name: name,
      toHit: g.toHit != null && g.toHit !== "" ? g.toHit : atkNumber(g.atk != null ? g.atk : old.toHit),
      damage: g.damage || old.damage || "",
      capacity: typeof cap === "number" && isFinite(cap) ? cap : null,
      loaded: typeof loaded === "number" && isFinite(loaded) ? loaded : 0,
      misfire: g.misfire != null ? g.misfire : old.misfire,
      jammed: !!g.jammed,
      fouled: !!g.fouled,
      ruined: !!(g.ruined || g.broken),
      broken: !!g.broken,
      exploded: !!g.exploded,
      pendingD4: !!g.pendingD4,
      dirty: !!g.dirty,
      misStreak: Number(g.misStreak) || 0,
      chambers: chamberPicture(g.chambers),
      lockedChambers: Array.isArray(g.lockedChambers) ? g.lockedChambers.slice() : [],
      ammoName: typeof g.ammo === "string" ? g.ammo : "",
      ammoDisplay: g.ammoDisplay || "",
      spare: window.SSDNSApplied && window.SSDNSApplied.spareCount ? window.SSDNSApplied.spareCount(Object.assign({}, g, { caliber: g.caliber || g.ammo }), (snap && snap.ammo) || []) : (g.spare || 0),
      gunIndex: n,
      sheetIndex: g.index != null && g.index !== "" ? g.index : n,
      weapon: g.weapon || "",
      tr: !!g.tr,
      caster: !!g.caster,
      calling: (snap && (snap.calling || snap.callingId)) || "",
      ammoPool: g.ammoPool == null ? "" : String(g.ammoPool),
      attackMode: g.attackMode === "adv" || g.attackMode === "dis" ? g.attackMode : "",
      pools: Array.isArray(g.pools) ? g.pools : [],
      castSpells: Array.isArray(snap && snap.castSpells) ? snap.castSpells : [],
      range: g.range || "",
      properties: g.properties || "",
      group: g.group || "",
      equipped: true,
      action: g.action || "",
      mod: g.mod || "",
      tier: g.tier || "",
      unwieldy: !!g.unwieldy,
      scatter: !!g.scatter,
      load: g.load || "",
      scope: /scope/i.test(g.mod || "")
    };
  });
}
function mapAttackIndex(row, weaponId) {
  const list = (row.card && row.card.attacks) || [];
  const wid = weaponId == null ? "" : String(weaponId);
  let n = list.findIndex((a) => a && (String(a.id) === wid || String(a.name) === wid));
  if (n < 0 && list.length === 1 && !wid) n = 0;
  return n;
}
async function mapAssignHp(row, next) {
  const before = knownNumber(row.hp);
  const start = before == null ? 0 : before;
  const max = knownNumber(row.maxHp);
  let hp = Math.max(0, Math.round(Number(next)));
  if (max != null) hp = Math.min(max, hp);
  row.hp = hp;
  const pid = row.kind === "player" ? (row.playerId || row.id) : "";
  const snap = pid ? playerSnapshot(pid) : null;
  if (pid && window.SSDNSApplied && window.SSDNSApplied.markHpExpect) window.SSDNSApplied.markHpExpect(row, hp);
  if (pid) {
    await DM.pushCommand({ type: "hp", to: pid, payload: { absolute: hp, text: "DM set HP to " + hp }, from: DM.state.uid });
  }
  if (hp <= 0) noteUnconscious(row);
  else await clearDown(row);
  const line = "Set HP " + hp + " → " + (row.name || "combatant");
  await DM.pushLedger({ who: "DM", playerId: pid || "all", type: "hp", what: line, oldVal: start, newVal: hp, flag: false });
  rememberUndo({
    type: "hit",
    label: line,
    playerId: pid,
    amount: Math.abs(start - hp),
    restoreHp: { id: row.id, hp: start },
    command: pid ? { type: "hp", to: pid, payload: { absolute: start, text: "Undo set HP" }, from: DM.state.uid } : null
  });
  await saveRemoteTable();
  renderFight();
  DM.toast(line);
}
async function mapDeltaHp(row, delta) {
  const amt = Math.abs(Number(delta));
  if (!isFinite(amt) || amt === 0) { DM.toast("Enter an amount"); return; }
  const sign = delta < 0 ? -1 : 1;
  if (row.kind === "player") {
    const pid = row.playerId || row.id;
    const snap = playerSnapshot(pid);
    const before = knownNumber(row.hp);
    const start = before == null ? (knownNumber(snap && snap.hpCurrent) || 0) : before;
    const max = knownNumber(row.maxHp) != null ? knownNumber(row.maxHp) : knownNumber(snap && snap.hpMax);
    const after = sign < 0 ? Math.max(0, start - amt) : (max != null ? Math.min(max, start + amt) : start + amt);
    row.hp = after;
    if (window.SSDNSApplied && window.SSDNSApplied.markHpExpect) window.SSDNSApplied.markHpExpect(row, after);
    if (after <= 0) noteUnconscious(row);
    else await clearDown(row);
    const kind = sign < 0 ? "damage" : "heal";
    const line = (sign < 0 ? "Damage " : "Heal ") + amt + " → " + (row.name || pid) + " (" + after + " HP)";
    await DM.pushCommand({
      type: "hp", to: pid, quiet: true,
      payload: { delta: sign * amt, kind: kind, amount: amt, text: line },
      from: DM.state.uid
    });
    await DM.pushLedger({ who: "DM", playerId: pid, type: kind, what: line, oldVal: start, newVal: after, flag: false });
    rememberUndo({
      type: "hit",
      label: line,
      playerId: pid,
      heal: sign > 0,
      amount: amt,
      restoreHp: { id: row.id, hp: start },
      command: { type: "hp", to: pid, payload: { delta: -sign * amt, kind: sign < 0 ? "heal" : "damage", amount: amt, text: "Undo " + line }, from: DM.state.uid }
    });
    await saveRemoteTable();
    renderFight();
    DM.toast(line);
    return;
  }
  const before = applyEnemyHp(row, sign * amt);
  if (before == null) return;
  if (row.hp <= 0) noteUnconscious(row);
  else await clearDown(row);
  const line = (sign < 0 ? "Damage " : "Heal ") + amt + " → " + (row.name || "enemy") + " (" + row.hp + " HP)";
  await DM.pushLedger({ who: "DM", playerId: "all", type: sign < 0 ? "damage" : "heal", what: line, oldVal: before, newVal: row.hp, flag: false });
  rememberUndo({
    type: "hit",
    label: line,
    heal: sign > 0,
    amount: amt,
    restoreHp: { id: row.id, hp: before }
  });
  await saveRemoteTable();
  renderFight();
  DM.toast(line);
}
async function mapGunLoad(detail, unload) {
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return false; }
  const row = fight.order[i];
  if (row.kind === "player") ensurePlayerAttacks(row);
  else ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  rememberWeapon(row, atk);
  if (row.kind === "player") {
    const pid = row.playerId || row.id;
    const snap = playerSnapshot(pid);
    if (!unload) {
      const cap = Number(atk.capacity) || 0;
      const loaded = Number(atk.loaded) || 0;
      const spare = window.SSDNSApplied && window.SSDNSApplied.spareCount
        ? window.SSDNSApplied.spareCount(atk, (snap && snap.ammo) || [])
        : Number(atk.spare) || 0;
      if (cap && loaded >= cap) { DM.toast((atk.name || "Gun") + " is already full."); return false; }
      if (spare <= 0) {
        const fail = window.SSDNSApplied && window.SSDNSApplied.ammoFailText
          ? window.SSDNSApplied.ammoFailText(row.name, atk)
          : (row.name || "Player") + ": no rounds left to reload";
        logTableAlert(fail);
        return false;
      }
    }
    const payload = { op: unload ? "unload" : "reload", index: sheetSlot(atk, n) };
    await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
    if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
    ensurePlayerAttacks(row);
    await saveRemoteTable();
    renderFight();
    DM.toast((unload ? "Unloaded " : "Reloaded ") + (atk.name || "weapon"));
    return true;
  }
  if (atk.capacity == null) { DM.toast("That weapon doesn't load"); return false; }
  if (unload) {
    const held = Number(atk.loaded) || 0;
    atk.spare = (Number(atk.spare) || 0) + held;
    atk.loaded = 0;
  } else {
    const cap = enemyOpenChambers(atk); /* M2: a locked chamber can't be loaded (same rule as the sheet) */
    const need = Math.max(0, cap - (Number(atk.loaded) || 0));
    const spare = Number(atk.spare);
    const take = isFinite(spare) ? Math.min(need, Math.max(0, spare)) : need;
    atk.loaded = (Number(atk.loaded) || 0) + take;
    if (isFinite(spare)) atk.spare = spare - take;
  }
  await saveRemoteTable();
  renderFight();
  DM.toast((unload ? "Unloaded " : "Reloaded ") + (atk.name || "weapon"));
  return true;
}
/* 0.3.61: the sheet slot a DM gun command must hit. gunIndex is only the position among named guns. */
function sheetSlot(atk, n) {
  if (atk && atk.sheetIndex != null && atk.sheetIndex !== "") return Number(atk.sheetIndex);
  if (atk && atk.gunIndex != null) return Number(atk.gunIndex);
  return n;
}
/* 0.3.61: the DM picks Adv/Dis and answers the disadvantage confirm on the DM screen; the player's sheet
   never prompts for a DM-sent shot. Returns "adv" / "dis" / "" (straight), or null when the DM cancels. */
/* 0.3.68: Fight tab "Range:" picker. Same per-session setting as the map drawer's Range select
   (SSDNSRangeRings keeps it in sessionStorage), so the two always match. */
function bindFightRangeOverride() {
  const sel = $("#fightRangeOverride");
  const R = window.SSDNSRangeRings;
  if (!sel || !R || !R.getOverride) return;
  const paint = (v) => {
    if (sel.value !== v) sel.value = v;
    sel.classList.toggle("is-override", v !== "auto");
  };
  paint(R.getOverride());
  sel.addEventListener("change", () => { paint(R.setOverride(sel.value || "auto")); });
  if (R.onOverride) R.onOverride(paint);
}

async function dmFireMode(pid, atk) {
  const snap = playerSnapshot(pid);
  const chosen = atk && (atk.attackMode === "adv" || atk.attackMode === "dis") ? atk.attackMode : "";
  const rings = window.SSDNSRangeRings;
  const peeked = rings && rings.peek ? rings.peek() : null;
  if (peeked && peeked.apply && peeked.blocked) {
    if (rings.take) rings.take();
    DM.toast(peeked.button || "Out of range");
    return null;
  }
  const rangeNote = peeked && peeked.apply && peeked.disadvantage ? (peeked.note || "disadvantage: range") : "";
  const Cond = window.SSDNSConditions;
  /* 0.3.68: the DM's "Force ADV" override reaches the PC roll the DM fires (payload.mode "adv") */
  const chosenNow = window.SSDNSRangeRings && window.SSDNSRangeRings.modeWith ? window.SSDNSRangeRings.modeWith(chosen, peeked) : chosen;
  const mode = Cond && Cond.attackMode
    ? Cond.attackMode((snap && snap.activeConditions) || [], chosenNow, rangeNote)
    : (chosenNow === "adv" && rangeNote ? "" : (rangeNote ? "dis" : chosenNow));
  if (mode === "dis") {
    const ask = rings && rings.confirmDisadvantage;
    const ok = ask ? await ask() : true;
    if (!ok) { if (rings && rings.clear) rings.clear(); return null; }
  }
  return mode;
}
async function mapGunChoice(detail, op, extra) {
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return false; }
  const row = fight.order[i];
  if (!row || row.kind !== "player" || !row.dmActsAs) { DM.toast("The player acts for themselves"); return false; }
  ensurePlayerAttacks(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  const pid = row.playerId || row.id;
  const snap = playerSnapshot(pid);
  const calling = (snap && (snap.calling || snap.callingId)) || atk.calling || "";
  if ((op === "hex" || op === "cast") && (calling !== "hexslinger" || !atk.caster)) {
    DM.toast("Hex shells are only for a Hexslinger's caster gun.");
    return false;
  }
  if (op === "tr" && !atk.tr) { DM.toast("This gun can't Tactical Reload (TR —)."); return false; }
  if (op === "pool" && extra && extra.pool !== "" && extra.pool != null) {
    const piles = atk.pools || [];
    if (piles.length && !piles.some((p) => String(p.idx) === String(extra.pool))) {
      DM.toast("That pile doesn't fit this gun.");
      return false;
    }
  }
  const gi = sheetSlot(atk, n);
  const payload = Object.assign({ op: op, index: gi }, extra || {});
  await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
  if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
  ensurePlayerAttacks(row);
  await saveRemoteTable();
  renderFight();
  return true;
}
async function mapGunClean(detail) {
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return false; }
  const row = fight.order[i];
  if (row && row.kind !== "player") return mapEnemyGunTool(detail, "clean"); /* M2 */
  if (!row || row.kind !== "player" || !row.dmActsAs) { DM.toast("The player acts for themselves"); return false; }
  ensurePlayerAttacks(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  const pid = row.playerId || row.id;
  const snap = playerSnapshot(pid);
  const gi = atk.gunIndex != null ? atk.gunIndex : n;
  const g = snap && snap.guns && snap.guns[gi];
  if (!g) { DM.toast("No weapon"); return false; }
  if (g.pendingD4) { DM.toast("Roll the d4 first."); return false; }
  const M = window.SSDNSMisfire;
  const opts = M && M.cleanOptions ? M.cleanOptions(g) : [];
  if (!opts.length) {
    DM.toast((g.fouled || g.ruined || g.broken) ? (g.name || atk.name || "Gun") + " is Fouled. It needs a gunsmith or a DM Repair." : "This gun isn't jammed or dirty.");
    return false;
  }
  const pick = M.pickClean ? await M.pickClean(g.name || atk.name || "gun", opts) : null;
  if (!pick) return false;
  const payload = { op: "clean", index: sheetSlot(atk, n), optionId: pick.id };
  await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
  if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
  ensurePlayerAttacks(row);
  await saveRemoteTable();
  renderFight();
  if (!pick.check) DM.toast((g.name || atk.name || "Gun") + ": " + pick.label + ".");
  return true;
}
/* 0.3.61: map drawer Unjam / Reopen chamber while the DM acts for a player (they were never routed). */
async function mapGunFix(detail, op) {
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return false; }
  const row = fight.order[i];
  if (row && row.kind !== "player" && op === "unjam") return mapEnemyUnjam(row, detail);
  if (row && row.kind !== "player" && op === "reopen") return mapEnemyGunTool(detail, "reopen"); /* M2 */
  if (!row || row.kind !== "player" || !row.dmActsAs) { DM.toast("The player acts for themselves"); return false; }
  ensurePlayerAttacks(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  const pid = row.playerId || row.id;
  const snap = playerSnapshot(pid);
  const g = snap && snap.guns && snap.guns[atk.gunIndex != null ? atk.gunIndex : n];
  if (!g) { DM.toast("No weapon"); return false; }
  const name = g.name || atk.name || "Gun";
  if (op === "unjam") {
    if (!g.jammed) { DM.toast(name + " isn't jammed."); return false; }
    if (g.fouled || g.ruined || g.broken) { DM.toast(name + " is Fouled. It needs a gunsmith or a DM Repair."); return false; }
    if (g.pendingD4) { DM.toast("Roll the d4 first."); return false; }
  } else if (!(Array.isArray(g.lockedChambers) && g.lockedChambers.length)) {
    DM.toast(name + " has no locked chamber."); return false;
  }
  const payload = op === "unjam" ? { op: "clean", index: sheetSlot(atk, n), optionId: "unjam" } : { op: "reopen", index: sheetSlot(atk, n) };
  await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
  if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
  if (op === "unjam") { g.jammed = false; atk.jammed = false; }
  ensurePlayerAttacks(row);
  await saveRemoteTable();
  renderFight();
  DM.toast(op === "unjam" ? name + ": unjammed." : name + ": reopen chamber sent.");
  return true;
}
/* ---- Mech PR A (M2 / M4): DM gun tools on enemy and NPC-ally guns ----
   M2: the 3rd-misfire chamber lock (assets/js/misfire.js) now sticks on enemy guns too, so Reopen has something to open.
   Clean and Reopen are free for the DM (like DM Unjam), with the same ledger line style as "cleared the jam".
   M4: Add rounds puts rounds in the enemy gun or its spare. No chat line, no ledger line, no feed: the players never hear of it. */
function enemyLocks(atk) {
  const cap = Number(atk && atk.capacity) || 0;
  return (Array.isArray(atk && atk.lockedChambers) ? atk.lockedChambers : [])
    .map(Number).filter((n, k, a) => isFinite(n) && n >= 0 && (!cap || n < cap) && a.indexOf(n) === k);
}
function enemyOpenChambers(atk) {
  const cap = Number(atk && atk.capacity) || 0;
  return Math.max(0, cap - enemyLocks(atk).length);
}
function enemyKeepLocks(atk, resolved) {
  if (!atk || !resolved || !Array.isArray(resolved.lockedChambers)) return;
  if (!resolved.lockedChambers.length && !(Array.isArray(atk.lockedChambers) && atk.lockedChambers.length)) return;
  atk.lockedChambers = resolved.lockedChambers.slice();
}
function enemyGunRow(i, n) {
  const row = fight.order[i];
  if (!row || row.kind === "player") return null;
  ensureCombatantCard(row);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  return atk ? { row: row, atk: atk } : null;
}
async function enemyGunClean(row, atk) {
  const M = window.SSDNSMisfire;
  const name = atk.name || "Gun";
  if (!M || !M.cleanOptions) return false;
  if (atk.pendingD4) { DM.toast("Roll the d4 first."); return false; }
  const opts = M.cleanOptions(atk);
  if (!opts.length) {
    DM.toast((atk.fouled || atk.ruined || atk.broken) ? name + " is Fouled. It needs a gunsmith or a DM Repair." : name + " isn't jammed or dirty.");
    return false;
  }
  /* the DM's unjam is free, so the label says so (the player picker shows the bonus-action cost) */
  const shown = opts.map((o) => o.id === "unjam" ? Object.assign({}, o, { label: "Unjam (free · DM)" }) : o);
  const pick = M.pickClean ? await M.pickClean(name, shown) : shown[0];
  if (!pick) return false;
  const wasDirty = !!atk.dirty;
  const done = M.commitClean(atk, pick.id);
  if (!done || !done.ok) { DM.toast((done && done.reason) || "That clean isn't available."); return false; }
  if (wasDirty && !atk.dirty) stampGunClean(enemyGunKey(row, (row.card.attacks || []).indexOf(atk)));
  rememberWeapon(row, atk);
  const line = (row.name || "Enemy") + " cleaned " + name + (pick.id === "unjam" ? " (jam cleared)" : " (Dirty gone, streak reset)");
  await DM.pushLedger({ who: "DM", playerId: row.id || "all", type: "jam", what: line, oldVal: pick.id === "unjam" ? "jammed" : "dirty", newVal: "clean", flag: false, characterName: row.name || "" });
  await saveRemoteTable();
  renderFight();
  DM.toast(line);
  return true;
}
async function enemyGunReopen(row, atk) {
  const name = atk.name || "Gun";
  const locks = enemyLocks(atk);
  if (!locks.length) { DM.toast(name + " has no locked chamber."); return false; }
  const M = window.SSDNSMisfire;
  const idx = M && M.reopenIndex ? M.reopenIndex(Object.assign({}, atk, { lockedChambers: locks })) : locks[0];
  const open = idx == null ? locks[0] : idx;
  atk.lockedChambers = locks.filter((n) => n !== open);
  /* reopening a Fouled-by-locks gun leaves Fouled alone: that still needs a DM Repair */
  rememberWeapon(row, atk);
  const line = (row.name || "Enemy") + " reopened chamber " + (open + 1) + " on " + name;
  await DM.pushLedger({ who: "DM", playerId: row.id || "all", type: "jam", what: line, oldVal: "locked", newVal: "open", flag: false, characterName: row.name || "" });
  await saveRemoteTable();
  renderFight();
  DM.toast(line);
  return true;
}
/* M4: the DM's Add rounds box. Resolves { n, into: "gun" | "spare" } or null. */
function askEnemyRounds(row, atk) {
  return new Promise((resolve) => {
    const cap = Number(atk.capacity) || 0;
    const loaded = Number(atk.loaded) || 0;
    const open = Math.max(0, enemyOpenChambers(atk) - loaded);
    const spareN = Number(atk.spare);
    const unlimited = atk.spare == null || atk.spare === "" || !isFinite(spareN);
    const dlg = document.createElement("dialog");
    dlg.className = "dlg add-rounds-dlg";
    dlg.innerHTML = `<form method="dialog"><h2>Add rounds</h2>
      <p class="fine" data-ar-who></p>
      <p class="fine" data-ar-now></p>
      <label>Rounds <input type="number" min="1" max="999" step="1" data-ar-n></label>
      <p class="fine">Only you see this. Nothing goes to chat or the log.</p>
      <div class="dlg-foot"><button class="btn" type="button" value="no">Cancel</button>
      <button class="btn" type="button" value="spare" data-ar-spare>Add to spare</button>
      <button class="btn btn-primary" type="submit" value="gun" data-ar-gun>Load the gun</button></div></form>`;
    dlg.querySelector("[data-ar-who]").textContent = (row.name || "Enemy") + " · " + (atk.name || "Gun");
    dlg.querySelector("[data-ar-now]").textContent = "Loaded " + loaded + "/" + cap + (enemyLocks(atk).length ? " (" + enemyLocks(atk).length + " locked)" : "") + " · Spare " + (unlimited ? "unlimited" : spareN);
    const input = dlg.querySelector("[data-ar-n]");
    input.value = String(open || cap || 1);
    const spareBtn = dlg.querySelector("[data-ar-spare]");
    if (unlimited) { spareBtn.disabled = true; spareBtn.title = "This gun's spare is unlimited"; }
    const gunBtn = dlg.querySelector("[data-ar-gun]");
    if (!open) { gunBtn.disabled = true; gunBtn.title = "The gun is full"; }
    const finish = (into) => {
      const n = Math.floor(Number(input.value));
      if (dlg.close) dlg.close();
      if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      resolve(into && isFinite(n) && n > 0 ? { n: n, into: into } : null);
    };
    dlg.querySelector("[value=no]").addEventListener("click", () => finish(null));
    spareBtn.addEventListener("click", () => finish("spare"));
    dlg.querySelector("form").addEventListener("submit", (ev) => { ev.preventDefault(); finish(gunBtn.disabled ? null : "gun"); });
    dlg.addEventListener("cancel", (ev) => { ev.preventDefault(); finish(null); });
    document.body.appendChild(dlg);
    try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); } catch (err) { dlg.setAttribute("open", ""); }
    try { input.focus(); input.select(); } catch (e) {}
  });
}
/** M4: add n rounds to an enemy gun. into "gun": fill open chambers first, any extra goes to the spare (if it counts);
    into "spare": all n to the spare. Silent: saves the table and toasts the DM only. Returns { loaded, spare } or null. */
async function enemyAddRounds(row, atk, pick) {
  if (!row || !atk || atk.capacity == null || !pick) return null;
  const n = Math.max(0, Math.floor(Number(pick.n) || 0));
  if (!n) return null;
  const loaded = Number(atk.loaded) || 0;
  const spareN = Number(atk.spare);
  const counted = atk.spare != null && atk.spare !== "" && isFinite(spareN);
  let toGun = 0;
  let toSpare = 0;
  if (pick.into === "gun") {
    toGun = Math.min(n, Math.max(0, enemyOpenChambers(atk) - loaded));
    toSpare = counted ? n - toGun : 0;
  } else if (counted) toSpare = n;
  if (!toGun && !toSpare) { DM.toast(counted ? "Nothing added." : (atk.name || "Gun") + ": the gun is full and its spare is unlimited."); return null; }
  atk.loaded = loaded + toGun;
  if (counted) atk.spare = spareN + toSpare;
  rememberWeapon(row, atk);
  await saveRemoteTable();
  renderFight();
  DM.toast((row.name || "Enemy") + " · " + (atk.name || "Gun") + ": +" + (toGun + toSpare) + " rounds (loaded " + atk.loaded + "/" + atk.capacity + (counted ? ", spare " + atk.spare : "") + ")");
  return { loaded: atk.loaded, spare: counted ? atk.spare : null };
}
async function mapEnemyGunTool(detail, op) {
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return false; }
  const row = fight.order[i];
  if (!row || row.kind === "player") { DM.toast("Only for enemy and NPC guns"); return false; }
  ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  if (op === "clean") return enemyGunClean(row, atk);
  if (op === "reopen") return enemyGunReopen(row, atk);
  if (op === "addrounds") {
    if (atk.capacity == null) { DM.toast("That weapon doesn't load"); return false; }
    const pick = detail && detail.rounds != null ? { n: detail.rounds, into: detail.into === "spare" ? "spare" : "gun" } : await askEnemyRounds(row, atk);
    return !!(await enemyAddRounds(row, atk, pick));
  }
  return false;
}
/* map token guns: DM Unjam on an NPC token. Free (same ruling as DM unjam for players); same state and
   ledger line as the Fight tab's "Clear jam", so both views stay in sync. */
async function mapEnemyUnjam(row, detail) {
  ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  const name = atk.name || "Gun";
  if (!atk.jammed) { DM.toast(name + " isn't jammed."); return false; }
  if (atk.fouled || atk.ruined || atk.broken) { DM.toast(name + " is Fouled. It needs a gunsmith or a DM Repair."); return false; }
  if (atk.pendingD4) { DM.toast("Roll the d4 first."); return false; }
  atk.jammed = false;
  rememberWeapon(row, atk);
  const line = (row.name || "Enemy") + " cleared the jam on " + name;
  await DM.pushLedger({ who: "DM", playerId: row.id || "all", type: "jam", what: line, oldVal: "jammed", newVal: "clear", flag: false, characterName: row.name || "" });
  await saveRemoteTable();
  renderFight();
  DM.toast(line);
  return true;
}
/* map token guns: ADV / DIS tick on an NPC gun (the player card's ticks). Read by cardStrike. */
async function mapEnemyMode(row, detail, mode) {
  ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk) { DM.toast("No weapon"); return false; }
  atk.attackMode = mode;
  rememberWeapon(row, atk);
  await saveRemoteTable();
  renderFight();
  return true;
}
function mapSpellIndex(row, spellId) {
  const list = (row && row.card && row.card.spellcasting && row.card.spellcasting.spells) || [];
  const wid = spellId == null ? "" : String(spellId);
  return list.findIndex((s) => {
    if (!s) return false;
    if (typeof s === "string") return s === wid;
    return String(s.id || "") === wid || String(s.name || "") === wid;
  });
}
async function mapGunChamber(detail) {
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return false; }
  const row = fight.order[i];
  const k = Number(detail && detail.chamber);
  if (!isFinite(k) || k < 0) return false;
  if (row.kind === "player") {
    ensurePlayerAttacks(row);
    const n = mapAttackIndex(row, detail && detail.weaponId);
    const atk = row.card && row.card.attacks && row.card.attacks[n];
    if (!atk) { DM.toast("No weapon"); return false; }
    const pid = row.playerId || row.id;
    const snap = playerSnapshot(pid);
    const g = snap && snap.guns && snap.guns[atk.gunIndex != null ? atk.gunIndex : n];
    if (!g) { DM.toast("No weapon"); return false; }
    const cap = Number(g.capacity) || Number(atk.capacity) || 0;
    const chambers = Array.isArray(g.chambers) && g.chambers.length
      ? g.chambers.slice()
      : Array.from({ length: cap }, (_, idx) => (idx < (Number(g.loaded) || 0) ? "round" : ""));
    if (k >= chambers.length) return false;
    if (chambers[k]) {
      chambers[k] = "";
      const payload = { op: "set", index: atk.sheetIndex != null ? atk.sheetIndex : (atk.gunIndex != null ? atk.gunIndex : n), loaded: chambers.filter(Boolean).length, chambers: chambers };
      await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
      if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
      ensurePlayerAttacks(row);
      renderFight();
      DM.toast("Unloaded a chamber · " + payload.loaded + "/" + cap);
      return true;
    }
    const payload = { op: "reload", index: atk.sheetIndex != null ? atk.sheetIndex : (atk.gunIndex != null ? atk.gunIndex : n), max: 1 };
    await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
    if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
    ensurePlayerAttacks(row);
    await saveRemoteTable();
    renderFight();
    DM.toast("Loaded a chamber");
    return true;
  }
  ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail && detail.weaponId);
  const atk = row.card && row.card.attacks && row.card.attacks[n];
  if (!atk || atk.capacity == null) { DM.toast("That weapon doesn't load"); return false; }
  const cap = Number(atk.capacity) || 0;
  const loaded = Number(atk.loaded) || 0;
  if (k < loaded) {
    atk.loaded = loaded - 1;
    if (isFinite(Number(atk.spare))) atk.spare = Number(atk.spare) + 1;
  } else if (k < cap && loaded < cap) {
    const spare = Number(atk.spare);
    if (isFinite(spare) && spare <= 0) { DM.toast("No ammo left"); return false; }
    atk.loaded = loaded + 1;
    if (isFinite(spare)) atk.spare = spare - 1;
  }
  await saveRemoteTable();
  renderFight();
  DM.toast((atk.name || "Gun") + " · " + atk.loaded + "/" + cap);
  return true;
}
function markDeath(row, side, index) {
  if (!row.deathSaves) row.deathSaves = { success: [false, false, false], fail: [false, false, false] };
  if (!row.deathSaves[side]) row.deathSaves[side] = [false, false, false];
  row.deathSaves[side][index] = true;
  const pid = row.kind === "player" ? (row.playerId || row.id) : "";
  if (!pid) return Promise.resolve();
  return DM.pushCommand({
    type: "death_save", to: pid,
    payload: { side: side, index: index, on: true },
    from: DM.state.uid
  });
}
function playerLinkPatch(pid) {
  const p = pid && DM.state.players && DM.state.players[pid];
  if (!p) return null;
  const s = p.snapshot || {};
  const name = s.name || s.player || pid;
  return {
    combatantId: pid,
    sheetId: pid,
    ownerUid: pid,
    kind: "player",
    label: String(name).slice(0, 16),
    name: name,
    color: "#4a90d9",
    ownerCanMove: true
  };
}
function linkMapToken(detail) {
  detail = detail || {};
  const tokenId = detail.tokenId;
  const raw = String(detail.link || "");
  const split = raw.indexOf(":");
  const kind = split < 0 ? raw : raw.slice(0, split);
  const id = split < 0 ? "" : raw.slice(split + 1);
  if (!tokenId || !kind) return null;
  if (kind === "player") {
    const patch = playerLinkPatch(id);
    if (!patch) return null;
    const row = (fight.order || []).find((r) => r && (r.id === id || r.playerId === id));
    if (row) assignMapToken(row, tokenId);
    return patch;
  }
  if (kind === "enemy") {
    const row = (fight.order || []).find((r) => r && r.id === id && r.kind !== "player" && !r.mapTokenId);
    if (!row) { DM.toast("That enemy is already linked"); return null; }
    assignMapToken(row, tokenId);
    return tokenPatchForRow(row);
  }
  if (kind === "beast") {
    const beast = (fight.bestiary || []).find((b) => b && b.id === id);
    const row = addBeastToFight(beast, { tokenId: tokenId });
    return row ? tokenPatchForRow(row) : null;
  }
  if (kind === "custom") {
    const row = addCustomEnemy({ tokenId: tokenId });
    return row ? tokenPatchForRow(row) : null;
  }
  return null;
}
function unlinkMapToken(detail) {
  if (linkBusy) return;
  const tokenId = detail && detail.tokenId;
  if (!tokenId) return;
  const cid = detail.combatantId || "";
  /* 0.3.59: also match by combatantId, but only when that row has no other live token */
  const row = (fight.order || []).find((r) => r && r.mapTokenId === tokenId)
    || (cid ? (fight.order || []).find((r) => r && r.id === cid && (!r.mapTokenId || !tokenStillThere(r.mapTokenId))) : null);
  if (!row) return;
  delete row.mapTokenId;
  if (row.kind === "player") {
    saveRemoteTable();
    renderFight();
    return;
  }
  linkBusy = true;
  try { removeCombatant(row.id); }
  finally { linkBusy = false; }
}
function linkedTokenIds() {
  const keep = {};
  (fight.order || []).forEach((r) => { if (r && r.kind !== "player" && r.mapTokenId) keep[r.id] = r.mapTokenId; });
  return keep;
}
/* 0.3.59: DM "Clear stale tokens": duplicate copies of one combatant, and linked tokens whose combatant left the fight. */
async function clearStaleTokens() {
  const host = window.SSDNSMapHost;
  if (!host || typeof host.staleTokenIds !== "function") { DM.toast("Open the map first"); return 0; }
  const live = (fight.order || []).filter((r) => r && r.kind !== "player").map((r) => r.id);
  const ids = host.staleTokenIds(live, linkedTokenIds());
  if (!ids.length) { DM.toast("No stale tokens"); return 0; }
  const msg = "Clear " + ids.length + " stale token" + (ids.length === 1 ? "" : "s") + " from the map? Duplicates and tokens for combatants no longer in the fight are removed. Players and current enemies stay.";
  const ok = window.SSDNSAsk && window.SSDNSAsk.confirm ? await window.SSDNSAsk.confirm(msg) : window.confirm(msg);
  if (!ok) return 0;
  const n = host.clearStaleTokens(live, linkedTokenIds());
  DM.toast("Cleared " + n + " stale token" + (n === 1 ? "" : "s"));
  return n;
}
function syncMapTokens() {
  if (linkBusy) return;
  const hostNow = window.SSDNSMapHost;
  if (hostNow && typeof hostNow.tokensLoaded === "function" && !hostNow.tokensLoaded()) return;
  let dirty = false;
  (fight.order || []).slice().forEach((row) => {
    if (!row) return;
    if (row.kind === "player") {
      if (row.mapTokenId) return;
      rememberPlayerToken(row);
      if (row.mapTokenId) dirty = true;
      return;
    }
    bindNewToken(row);
  });
  if (dirty) {
    saveRemoteTable();
    pushMapInitiative();
  }
}
function copyConditions(sourceId, nextId) {
  if (!sourceId || !nextId || sourceId === nextId) return;
  fight.condMap = fight.condMap || {};
  Object.keys(fight.condMap).forEach((id) => {
    const row = fight.condMap[id];
    if (!row || row.subjectId !== sourceId) return;
    let copy;
    try { copy = JSON.parse(JSON.stringify(row)); } catch (e) { return; }
    copy.subjectId = nextId;
    copy.id = DM.uid("cond");
    fight.condMap[copy.id] = copy;
  });
}
function duplicateCombatant(detail) {
  detail = detail || {};
  if (!detail.duplicate) return null;
  const source = (fight.order || []).find((row) => row && (
    (detail.sourceCombatantId && (row.id === detail.sourceCombatantId || row.mapTokenId === detail.sourceCombatantId)) ||
    (detail.sourceId && (row.mapTokenId === detail.sourceId || row.id === detail.sourceId))
  ));
  if (!source || source.kind === "player") return null;
  let copy;
  try { copy = JSON.parse(JSON.stringify(source)); } catch (e) { return null; }
  copy.id = DM.uid("en");
  copy.kind = "enemy";
  copy.name = source.name || detail.name || "Enemy";
  copy.init = source.init;
  delete copy.mapTokenId;
  delete copy.announceId;
  delete copy.playerId;
  delete copy.lastAttackerId;
  delete copy._gunSig;
  if (detail.hidden) copy.mapHidden = true;
  else delete copy.mapHidden;
  copyConditions(source.id, copy.id);
  const row = addCombatant(copy);
  if (!row) return null;
  if (detail.tokenId) claimTokenId(row, detail.tokenId);
  const host = window.SSDNSMapHost;
  if (detail.tokenId && host && typeof host.patchToken === "function") {
    host.patchToken(detail.tokenId, {
      name: row.name,
      label: String(row.name || "").slice(0, 16),
      combatantId: row.id
    });
  }
  announce("Added " + row.name + " to the turn order", "combat", row);
  saveRemoteTable();
  renderFight();
  return row;
}
function setTokenHidden(detail) {
  detail = detail || {};
  const tokenId = detail.tokenId || "";
  const combatantId = detail.combatantId || "";
  const row = (fight.order || []).find((r) => r && (
    (combatantId && (r.id === combatantId || r.mapTokenId === combatantId)) ||
    (tokenId && r.mapTokenId === tokenId)
  ));
  if (!row || row.kind === "player") return false;
  row.mapHidden = !!detail.hidden;
  saveRemoteTable();
  renderFight();
  return true;
}
function grabView(row) {
  if (!row) return { weapons: [], gear: [], es: 0 };
  if (row.kind === "player") {
    const s = playerSnapshot(row.playerId || row.id) || {};
    const guns = (s.guns || []).filter((g) => g && (g.weapon || g.name) && g.equipped !== false).map((g) => ({
      take: "weapon", kind: "gun", index: g.index, name: g.name || g.weapon, weaponId: g.weapon || "",
      group: g.group || "", properties: g.properties || "", toHit: g.atk
    }));
    const melee = (s.melee || []).filter((m) => m && m.weapon && m.equipped !== false).map((m) => ({
      take: "weapon", kind: "melee", index: m.index, name: m.name || m.weapon, weaponId: m.weapon,
      group: "melee", properties: "", toHit: ""
    }));
    const gear = String(s.equipment || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const items = (s.items || []).map((item) => item).filter(Boolean);
    return {
      weapons: guns.concat(melee), gear: gear, items: items, es: Number(s.es) || 0, calling: s.calling || s.callingId || "",
      skills: s.skills || {}, mods: s.mods || {}, abilities: s.abilities || {},
      inventoryLocked: !!s.inventoryLocked
    };
  }
  const attacks = ((row.card && row.card.attacks) || []).filter((a) => a && a.dropped !== true && a.equipped !== false);
  return {
    weapons: attacks.map((a, n) => ({
      take: "weapon", kind: "attack", index: n, id: a.id || a.name || ("atk-" + n), name: a.name || "Attack",
      weaponId: a.weapon || "", group: a.group || "", properties: a.properties || "", toHit: a.toHit, damage: a.damage || ""
    })),
    gear: [], es: 0, calling: "", skills: (row.card && row.card.skills) || {}, scores: (row.card && row.card.scores) || {},
    mods: {}
  };
}
function grabAttackMod(view, row) {
  const weapon = (view.weapons || [])[0];
  if (weapon && weapon.toHit != null && weapon.toHit !== "") {
    const m = String(weapon.toHit).match(/-?\d+/);
    if (m) return Number(m[0]);
  }
  if (row && row.atkBonus != null && row.atkBonus !== "" && isFinite(Number(row.atkBonus))) return Number(row.atkBonus);
  const mods = view.mods || {};
  if (mods.STR != null && mods.STR !== "") return Number(mods.STR) || 0;
  return 0;
}
function grabFeet(actor, target, hinted) {
  if (hinted != null && hinted !== "" && isFinite(Number(hinted))) return Number(hinted);
  const host = window.SSDNSMapHost;
  if (!host || typeof host.feetBetween !== "function" || !actor || !target) return null;
  const a = actor.mapTokenId || actor.playerId || actor.id;
  const b = target.mapTokenId || target.playerId || target.id;
  const n = host.feetBetween(a, b);
  return n == null || n === "" || !isFinite(Number(n)) ? null : Number(n);
}
function grabDowned(row) {
  if (!row || noHpPoolRow(row)) return false;
  const hp = knownNumber(row.hp);
  if (hp != null && hp <= 0) return true;
  return /down|unconscious|dying/i.test(String(row.status || ""));
}
function grabSlotFree(actor, weapon) {
  const Equip = window.SSDNSEquip;
  if (!Equip || !actor || actor.kind !== "player") return true;
  const snap = playerSnapshot(actor.playerId || actor.id) || {};
  const character = { guns: snap.guns || [], melee: snap.melee || [], holster: snap.holster || "", holsterR: snap.holsterR || "", belt: snap.belt || "", dollWeapons: snap.dollWeapons || {}, instrument: "", focusEquipped: false };
  const kind = weapon && weapon.kind === "melee" ? "melee" : "gun";
  const lookup = function (id) { return Equip.lookupWeapon ? Equip.lookupWeapon(id) : null; };
  const slot = kind === "melee" ? "melee" : (Equip.slotOf ? Equip.slotOf(lookup(weapon && weapon.weaponId) || { group: weapon && weapon.group }) : "");
  if (!slot || !Equip.countSlots || !Equip.LIMITS) return true;
  const used = Equip.countSlots(character, lookup);
  return (used[slot] || 0) < Equip.LIMITS[slot];
}
function applyEnemyGrab(actor, target, plan) {
  const enemy = (plan && plan.enemy) || {};
  if (target && target.kind === "enemy" && target.card && Array.isArray(target.card.attacks)) {
    const dropId = enemy.dropAttackId || enemy.removeAttackId || "";
    if (dropId) {
      const atk = target.card.attacks.find((a) => a && (a.id === dropId || a.name === dropId));
      if (atk && enemy.dropAttackId) { atk.equipped = false; atk.dropped = true; }
      if (atk && enemy.removeAttackId) target.card.attacks = target.card.attacks.filter((a) => a !== atk);
    }
  }
  if (actor && actor.kind === "enemy" && enemy.give) {
    actor.card = actor.card || {};
    actor.card.attacks = actor.card.attacks || [];
    actor.card.attacks.push(Object.assign({ id: DM.uid("atk"), equipped: false }, enemy.give));
  }
  if (actor && actor.kind === "enemy" && enemy.gear) {
    actor.card = actor.card || {};
    actor.card.gear = actor.card.gear || [];
    actor.card.gear.push(enemy.gear);
  }
}
async function sendGrabCommand(cmd) {
  if (!cmd) return;
  if (DM.state && DM.state.demo && cmd.type === "gun" && DM.applyDemoGun) DM.applyDemoGun(cmd.to, cmd.payload || {});
  if (DM.state && DM.state.demo && cmd.type === "reward_es") {
    const p = DM.state.players && DM.state.players[cmd.to];
    const delta = Number(cmd.payload && cmd.payload.delta) || 0;
    if (p && p.snapshot) p.snapshot.es = Math.max(0, (Number(p.snapshot.es) || 0) + delta);
  }
  if (DM.state && DM.state.demo && cmd.type === "take_gear") {
    const p = DM.state.players && DM.state.players[cmd.to];
    if (p && p.snapshot) {
      const needle = String((cmd.payload && cmd.payload.text) || "");
      const lines = String(p.snapshot.equipment || "").split("\n");
      const idx = lines.findIndex((line) => needle && line.indexOf(needle) >= 0);
      if (idx >= 0) lines.splice(idx, 1);
      p.snapshot.equipment = lines.join("\n");
    }
  }
  if (DM.state && DM.state.demo && cmd.type === "reward_item") {
    const p = DM.state.players && DM.state.players[cmd.to];
    if (p && p.snapshot) {
      const line = "• " + String((cmd.payload && cmd.payload.text) || "");
      p.snapshot.equipment = (p.snapshot.equipment ? p.snapshot.equipment + "\n" : "") + line;
    }
  }
  if (DM.pushCommand) await DM.pushCommand(Object.assign({ from: DM.state && DM.state.uid, quiet: true }, cmd));
}
function askGrab(actor, mode, preset) {
  preset = preset || {};
  const Grab = window.SSDNSGrab;
  return new Promise((resolve) => {
    const targets = combatTargets(actor);
    const dlg = document.createElement("dialog");
    dlg.className = "dlg";
    const title = "Rob/Disarm";
    const tip = "Robbing is frowned on in town and by lawmen and can lead to a confrontation. The DM decides whether it counts as a robbery or a disarm. No automatic reputation tracking.";
    dlg.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2><p class="fine">${esc(actor.name || "Someone")} · ${esc(tip)}</p><label>Target <select id="grabTarget">${targetMenu(targets, preset.targetId || "")}</select></label><div id="grabBody"></div><label class="toggle"><input type="checkbox" id="grabOverride"> DM override (skip the roll)</label><div class="dlg-foot"><button class="btn" value="no" type="button">Cancel</button><button class="btn btn-primary" value="yes" type="submit" id="grabGo">Rob/Disarm</button></div></form>`;
    const body = dlg.querySelector("#grabBody");
    const targetSel = dlg.querySelector("#grabTarget");
    const go = dlg.querySelector("#grabGo");
    const paint = () => {
      const target = resolveStrikeTarget(targetSel.value);
      const view = grabView(target);
      const feet = grabFeet(actor, target, preset.feet);
      const far = feet != null && Grab && !Grab.inReach(feet).ok;
      const weapons = view.weapons.map((w, n) => `<option value="weapon:${n}">${esc(w.name || "Weapon")} (held)</option>`).join("");
      const gear = (view.gear || []).map((line, n) => `<option value="gear:${n}">${esc(line.replace(/^•\s*/, ""))} (holstered)</option>`).join("");
      const items = (view.items || []).map((item, n) => `<option value="item:${n}">${esc(item.name || "Item")}${item.type === "quest" ? " (quest)" : ""}</option>`).join("");
      const es = `<option value="es">ES${view.es ? " (" + esc(view.es) + " on hand)" : ""}</option>`;
      const reach = feet == null ? "Range not measured." : (far ? ("Out of reach (" + feet + " ft).") : (feet + " ft."));
      body.innerHTML = `<p class="fine" id="grabReach">${esc(reach)} Held weapon: Athletics vs Athletics or Acrobatics, replaces one attack. Holstered: Sleight of Hand vs passive Perception.</p><label>Take <select id="grabWhat">${weapons}${gear}${items}${es}${weapons || gear || items || es ? "" : "<option value=\"\">Nothing to take</option>"}</select></label><label>Target defends with <select id="grabDef"><option value="">Their choice</option><option value="Athletics">Athletics</option><option value="Acrobatics">Acrobatics</option></select></label><label id="grabEsWrap" hidden>ES <input id="grabEs" type="number" min="0" value="0"></label>`;
      const what = body.querySelector("#grabWhat");
      const esWrap = body.querySelector("#grabEsWrap");
      const sync = () => { if (esWrap) esWrap.hidden = !what || what.value !== "es"; };
      if (what) what.addEventListener("change", sync);
      sync();
      const overrideOn = !!dlg.querySelector("#grabOverride").checked;
      if (go) go.disabled = !!(far && !overrideOn);
    };
    targetSel.addEventListener("change", paint);
    dlg.querySelector("#grabOverride").addEventListener("change", paint);
    paint();
    const finish = (ok) => {
      const target = resolveStrikeTarget(targetSel.value);
      const view = grabView(target);
      const what = body.querySelector("#grabWhat");
      const choice = what ? what.value : "";
      let picked = null;
      const defSel = body.querySelector("#grabDef");
      if (choice.indexOf("weapon:") === 0) picked = { take: "weapon", weapon: view.weapons[Number(choice.slice(7))] || null };
      else if (choice.indexOf("gear:") === 0) picked = { take: "gear", gearText: view.gear[Number(choice.slice(5))] || "" };
      else if (choice.indexOf("item:") === 0) picked = { take: "item", item: (view.items || [])[Number(choice.slice(5))] || null };
      else if (choice === "es") picked = { take: "es", es: Number(body.querySelector("#grabEs") && body.querySelector("#grabEs").value) || 0 };
      const payload = ok && target && picked ? {
        target: target,
        take: picked.take,
        weapon: picked.weapon || null,
        item: picked.item || null,
        gearText: picked.gearText || (picked.item && picked.item.name) || "",
        es: picked.es || 0,
        defenseSkill: defSel ? defSel.value : "",
        override: !!dlg.querySelector("#grabOverride").checked,
        feet: grabFeet(actor, target, preset.feet)
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
async function runGrab(actor, mode, preset) {
  const Grab = window.SSDNSGrab;
  if (!Grab) { DM.toast("Disarm isn't loaded"); return false; }
  if (!actor) { DM.toast("No creature"); return false; }
  const picked = await askGrab(actor, mode, preset || {});
  if (!picked || !picked.target) { DM.toast("No target"); return false; }
  if (picked.take === "weapon" && !picked.weapon) { DM.toast("Nothing equipped to take"); return false; }
  if (picked.take === "gear" && !String(picked.gearText || "").trim()) { DM.toast("Pick an item"); return false; }
  if (picked.take === "item" && !picked.item) { DM.toast("Pick an item"); return false; }
  if (picked.take === "es" && !(Number(picked.es) > 0)) { DM.toast("Enter an ES amount"); return false; }
  if (picked.target.id === actor.id || (actor.playerId && picked.target.id === actor.playerId)) { DM.toast("Pick a different creature"); return false; }
  const downed = grabDowned(picked.target);
  if (downed && actor._grabRound === fight.round) { DM.toast("One item from a downed target this turn"); return false; }
  const actorView = grabView(actor);
  const targetView = grabView(picked.target);
  const Items = window.SSDNSItems;
  if (picked.item && Items && Items.canRob && !Items.canRob(picked.item, { override: picked.override, inventoryLocked: !!targetView.inventoryLocked, dmAllow: !!picked.item.dmAllowRob })) {
    DM.toast(Items.soulBound && Items.soulBound(picked.item) ? Items.soulBoundReason(picked.item) : (picked.item.type === "quest" ? "Quest items stay unless you allow the rob" : "Inventory is locked"));
    return false;
  }
  const contestMode = mode === "disarm" || picked.take === "weapon" ? "disarm" : (picked.take === "es" ? "rob-es" : "rob-pocket");
  const rolled = Grab.contest({
    mode: contestMode,
    actor: actorView,
    target: targetView,
    weapon: picked.weapon || {},
    defenseSkill: picked.defenseSkill || "",
    feet: picked.feet,
    downed: downed,
    downedTaken: !!(downed && actor._grabRound === fight.round),
    override: picked.override,
    twoHanded: picked.weapon ? Grab.twoHanded(picked.weapon) : false
  });
  if (!rolled.ok) {
    logTableAlert((actor.name || "Someone") + " · " + rolled.line);
    return false;
  }
  const moved = Grab.plan({
    mode: mode,
    take: picked.take,
    success: true,
    override: !!rolled.override,
    downed: downed,
    contestLine: rolled.line,
    combat: !!(fight.started && (fight.order || []).length),
    slotFree: grabSlotFree(actor, picked.weapon),
    actor: { id: actor.kind === "player" ? (actor.playerId || actor.id) : actor.id, kind: actor.kind === "player" ? "player" : "enemy", name: actor.name || "", calling: actorView.calling || "" },
    target: { id: picked.target.kind === "player" ? (picked.target.playerId || picked.target.id) : picked.target.id, kind: picked.target.kind === "player" ? "player" : "enemy", name: picked.target.name || "" },
    weapon: picked.weapon || {},
    gearText: picked.gearText || "",
    es: picked.es || 0,
    item: picked.item || null,
    itemUid: picked.item && picked.item.uid,
    quest: !!(picked.item && (picked.item.type === "quest" || picked.item.dmOnly)),
    dmAllowRob: !!(picked.item && picked.item.dmAllowRob),
    inventoryLocked: !!targetView.inventoryLocked
  });
  for (let n = 0; n < moved.commands.length; n++) await sendGrabCommand(moved.commands[n]);
  applyEnemyGrab(actor, picked.target, moved);
  if (downed) actor._grabRound = fight.round;
  logTableAlert(moved.chat);
  saveRemoteTable();
  renderFight();
  refreshOpenCard();
  return true;
}
function runGrabFromMap(detail, mode) {
  detail = detail || {};
  const i = mapFightIndex(detail);
  if (i < 0) { DM.toast("No card linked"); return Promise.resolve(false); }
  const actor = fight.order[i];
  const targetIndex = mapFightIndex({ combatantId: detail.targetCombatantId, tokenId: detail.targetTokenId });
  const target = targetIndex >= 0 ? fight.order[targetIndex] : null;
  const targetId = target ? combatantKey(target) : (detail.targetCombatantId || detail.targetTokenId || "");
  return runGrab(actor, mode, { targetId: targetId, feet: detail.feet });
}
/* 0.2.80: map Free shot. A PC the DM acts for fires through their own sheet (round, misfire, sound,
   Action pip all happen there); an NPC fires off its card. Neither picks a target. */
async function mapFreeShot(i, row, detail) {
  if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
  if (row.kind === "player") {
    if (!row.dmActsAs) { DM.toast("The player acts for themselves"); return false; }
    ensurePlayerAttacks(row);
    const n = mapAttackIndex(row, detail.weaponId);
    if (n < 0) { DM.toast("No attack"); return false; }
    const atk = row.card && row.card.attacks && row.card.attacks[n];
    if (!atk) { DM.toast("No attack"); return false; }
    const pid = row.playerId || row.id;
    const payload = { op: "fire", index: sheetSlot(atk, n), dm: true, free: true };
    if (detail.offhand) payload.offhand = true; /* 0.2.85: off-hand (bonus action) shot */
    else if (detail.fan) payload.fan = true; /* 0.2.86: Pistolero Fan the Hammer (bonus action) */
    if (detail.chamber != null && detail.chamber !== "" && isFinite(Number(detail.chamber))) payload.chamber = Number(detail.chamber);
    await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
    if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
    ensurePlayerAttacks(row);
    return true;
  }
  ensureCombatantCard(row);
  const n = mapAttackIndex(row, detail.weaponId);
  if (n < 0) { DM.toast("No attack"); return false; }
  await cardStrike(i, n, { free: true });
  return true;
}
window.SSDNSMapFight = {
  linkedTokenIds() { return linkedTokenIds(); },
  clearStale() { return clearStaleTokens(); },
  duplicate(detail) { return duplicateCombatant(detail); },
  hidden(detail) { return setTokenHidden(detail); },
  async attack(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    if (i < 0) { DM.toast("No card linked"); return false; }
    const row = fight.order[i];
    if (detail.free || detail.targetCombatantId === FREE_SHOT_ID) return mapFreeShot(i, row, detail);
    const targetIndex = mapFightIndex({ combatantId: detail.targetCombatantId, tokenId: detail.targetTokenId });
    const target = targetIndex >= 0 ? fight.order[targetIndex] : null;
    const targetId = target ? combatantKey(target) : (detail.targetCombatantId || detail.targetTokenId || "");
    if (!targetId || targetId === combatantKey(row) || (target && target.id === row.id)) {
      DM.toast("Pick a different token");
      return false;
    }
    if (row.kind === "player") {
      if (!row.dmActsAs) { DM.toast("The player acts for themselves"); return false; }
      ensurePlayerAttacks(row);
      const n = mapAttackIndex(row, detail.weaponId);
      if (n < 0) { DM.toast("No attack"); return false; }
      const atk = row.card && row.card.attacks && row.card.attacks[n];
      if (!atk) { DM.toast("No attack"); return false; }
      const pid = row.playerId || row.id;
      const gi = sheetSlot(atk, n);
      /* 0.2.80: a cancelled shot must not leave its range verdict armed for the next one */
      const picked = await dmFireMode(pid, atk);
      if (picked == null) { if (window.SSDNSRangeRings) window.SSDNSRangeRings.clear(); return false; }
      const payload = { op: "fire", index: gi, dm: true };
      if (detail.offhand) payload.offhand = true; /* 0.2.85: off-hand (bonus action) shot */
      if (detail.sneak) payload.sneak = true; /* SAMPLE trackers: DM-armed riders */
      if (detail.smite) payload.smite = true;
      else if (detail.fan) payload.fan = true; /* 0.2.86: Pistolero Fan the Hammer (bonus action) */
      if (picked) payload.mode = picked;
      if (detail.chamber != null && detail.chamber !== "" && isFinite(Number(detail.chamber))) payload.chamber = Number(detail.chamber);
      if (targetId) payload.targetId = targetId;
      await DM.pushCommand({ type: "gun", to: pid, payload: payload, from: DM.state.uid });
      if (DM.state.demo && DM.applyDemoGun) DM.applyDemoGun(pid, payload);
      if (window.SSDNSRangeRings && window.SSDNSRangeRings.clear) window.SSDNSRangeRings.clear();
      ensurePlayerAttacks(row);
      return true;
    }
    ensureCombatantCard(row);
    const n = mapAttackIndex(row, detail.weaponId);
    if (n < 0) { DM.toast("No attack"); return false; }
    await cardStrike(i, n, { targetId: targetId });
    return true;
  },
  async cast(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    if (i < 0) { DM.toast("No card linked"); return false; }
    const row = fight.order[i];
    const targetIndex = mapFightIndex({ combatantId: detail.targetCombatantId, tokenId: detail.targetTokenId });
    const target = targetIndex >= 0 ? fight.order[targetIndex] : null;
    const targetId = target ? combatantKey(target) : (detail.targetCombatantId || detail.targetTokenId || "");
    if (!targetId) { DM.toast("No targets"); return false; }
    if (row.kind === "player") {
      if (!row.dmActsAs) { DM.toast("The player casts their own spells"); return false; }
      const self = targetId === combatantKey(row) || targetId === String(row.id || "") || (row.playerId && targetId === String(row.playerId));
      const known = window.SSDNSSpellCast && window.SSDNSSpellCast.lookup ? window.SSDNSSpellCast.lookup(detail.spellId) : null;
      if (self && listedKind({ kind: known && known.kind }, known) !== "heal") { DM.toast("Pick a different token"); return false; }
      return rollSpellAt(row, detail.spellId, targetId);
    }
    ensureCombatantCard(row);
    const n = mapSpellIndex(row, detail.spellId);
    if (n < 0) { DM.toast("No spell"); return false; }
    const spell = row.card.spellcasting.spells[n];
    const known = window.SSDNSSpellCast && window.SSDNSSpellCast.lookup ? window.SSDNSSpellCast.lookup(typeof spell === "string" ? spell : spell.name) : null;
    const self = targetId === String(row.id || "") || targetId === combatantKey(row);
    if (self && listedKind(typeof spell === "string" ? {} : spell, known) !== "heal") { DM.toast("Pick a different token"); return false; }
    await cardCast(i, n, { targetId: targetId });
    return true;
  },
  chamber(detail) { return mapGunChamber(detail); },
  targets(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    const row = i >= 0 ? fight.order[i] : null;
    const list = combatTargets(row);
    let selected = "";
    const hinted = detail.selectedCombatantId || detail.selectedTokenId || "";
    if (hinted && list.some((p) => p.id === hinted)) selected = hinted;
    if (!selected && row && row.lastAttackerId && list.some((p) => p.id === row.lastAttackerId)) selected = row.lastAttackerId;
    if (!selected) selected = defaultCombatTarget(row, list);
    return {
      selected: selected,
      options: list.map((p) => ({
        id: p.id,
        name: p.name,
        group: p.group,
        label: (p.name || "Target") + " · AC " + (p.ac == null || p.ac === "" ? "?" : p.ac)
      }))
    };
  },
  async hp(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    if (i < 0) { DM.toast("No card linked"); return false; }
    const row = fight.order[i];
    if (detail.set != null && detail.set !== "" && isFinite(Number(detail.set))) {
      await mapAssignHp(row, Number(detail.set));
      return true;
    }
    const delta = Number(detail.delta);
    if (!isFinite(delta) || delta === 0) { DM.toast("Enter an amount"); return false; }
    await mapDeltaHp(row, delta);
    return true;
  },
  async condition(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    if (i < 0) { DM.toast("No card linked"); return false; }
    const row = fight.order[i];
    if (!detail.condition) {
      askRowConditions(i);
      return true;
    }
    const subjectId = row.kind === "player" ? (row.playerId || row.id) : row.id;
    const kind = row.kind === "enemy" ? "enemy" : "player";
    const name = String(detail.condition);
    const current = conditionsForRow(row);
    const have = current.filter((c) => String((c && c.name) || c || "").toLowerCase() === name.toLowerCase())[0];
    const turningOff = detail.on === false || (detail.on == null && !!have);
    if (turningOff) {
      const removeIds = [];
      if (have && have.id) removeIds.push(have.id);
      else if (window.SSDNSConditions && window.SSDNSConditions.idFor) removeIds.push(window.SSDNSConditions.idFor(subjectId, name));
      await writeSubjectConditions(subjectId, kind, [], row.name || "", 1, {}, removeIds);
    } else {
      await writeSubjectConditions(subjectId, kind, [name], row.name || "", 1, {}, []);
    }
    renderFight();
    return true;
  },
  reload(detail) { return mapGunLoad(detail, false); },
  unload(detail) { return mapGunLoad(detail, true); },
  clean(detail) { return mapGunClean(detail); },
  unjam(detail) { return mapGunFix(detail, "unjam"); },
  reopen(detail) { return mapGunFix(detail, "reopen"); },
  addrounds(detail) { return mapEnemyGunTool(detail, "addrounds"); }, /* M4 */
  pool(detail) { return mapGunChoice(detail, "pool", { pool: detail && detail.pool != null ? detail.pool : "" }); },
  tr(detail) { return mapGunChoice(detail, "tr", {}); },
  hex(detail) { return mapGunChoice(detail, "hex", { level: detail && detail.level }); },
  castgun(detail) { return mapGunChoice(detail, "cast", { spell: detail && detail.spell, slot: detail && detail.slot }); },
  mode(detail) {
    const mode = detail && (detail.mode === "adv" || detail.mode === "dis") ? detail.mode : "";
    const i = mapFightIndex(detail || {});
    const row = i >= 0 ? fight.order[i] : null;
    if (row && row.kind !== "player") return mapEnemyMode(row, detail, mode);
    return mapGunChoice(detail, "mode", { mode: mode });
  },
  weapon(detail) { return mapPickWeapon(detail); },
  disarm(detail) { return runGrabFromMap(detail, "rob"); },
  rob(detail) { return runGrabFromMap(detail, "rob"); },
  useitem(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    const row = i >= 0 ? fight.order[i] : null;
    const pid = row && row.kind === "player" ? (row.playerId || row.id) : "";
    if (!pid || !detail.itemUid) { DM.toast("No item"); return Promise.resolve(false); }
    return DM.pushCommand({ type: "item_use", to: pid, payload: { uid: detail.itemUid }, from: DM.state.uid });
  },
  async deathsave(detail) {
    const i = mapFightIndex(detail || {});
    if (i < 0) { DM.toast("No card linked"); return false; }
    const row = fight.order[i];
    const hp = knownNumber(row.hp);
    if (hp != null && hp > 0) { DM.toast("They're on their feet."); return false; }
    const nat = d20();
    const pid = row.kind === "player" ? (row.playerId || row.id) : "";
    let line = (row.name || "Someone") + " death save: " + nat;
    if (nat === 20) {
      row.hp = 1;
      const snap = pid ? playerSnapshot(pid) : null;
      if (snap) snap.hpCurrent = 1;
      if (pid) await DM.pushCommand({ type: "hp", to: pid, payload: { absolute: 1, text: line + " — natural 20, back to 1 HP" }, from: DM.state.uid });
      await clearDown(row);
      line += " — natural 20, back to 1 HP";
    } else if (nat >= 10) {
      const si = ((row.deathSaves && row.deathSaves.success) || [false, false, false]).indexOf(false);
      if (si >= 0) await markDeath(row, "success", si);
      line += " — success";
    } else {
      let marks = nat === 1 ? 2 : 1;
      line += nat === 1 ? " — two failures" : " — failure";
      while (marks > 0) {
        const fi = ((row.deathSaves && row.deathSaves.fail) || [false, false, false]).indexOf(false);
        if (fi < 0) break;
        await markDeath(row, "fail", fi);
        marks -= 1;
      }
    }
    const successes = ((row.deathSaves && row.deathSaves.success) || []).filter(Boolean).length;
    const fails = ((row.deathSaves && row.deathSaves.fail) || []).filter(Boolean).length;
    if (fails >= 3) line += " · dead";
    else if (successes >= 3) line += " · stable";
    await DM.pushLedger({ who: "DM", playerId: pid || "all", type: "death_save", what: line, oldVal: null, newVal: nat, flag: nat === 1 });
    await DM.pushRoll({ who: row.name || "DM", label: "Death save", formula: "1d20", result: nat, detail: line, nat: nat, private: false });
    await saveRemoteTable();
    renderFight();
    DM.toast(line);
    return true;
  },
  undo() { return undoLast(); },
  async down(detail) {
    const i = mapFightIndex(detail || {});
    if (i < 0) { DM.toast("No card linked"); return false; }
    await markDown(i);
    return true;
  },
  cover(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    const Applied = window.SSDNSApplied;
    const keyOf = (value) => Applied && Applied.coverKey ? Applied.coverKey(value) : (value || "");
    if (i >= 0) {
      const row = fight.order[i];
      const key = detail.cover != null ? keyOf(detail.cover) : keyOf(row.cover);
      const lock = detail.lock != null ? !!detail.lock : !!row.coverLock;
      applyCoverEdit(row, key, lock);
      return true;
    }
    const pid = detail.combatantId || detail.tokenId || "";
    const snap = pid && DM.state.players[pid] && DM.state.players[pid].snapshot;
    if (!snap) { DM.toast("No card linked"); return false; }
    snap.cover = detail.cover != null ? keyOf(detail.cover) : keyOf(snap.cover);
    snap.coverLock = detail.lock != null ? !!detail.lock : !!snap.coverLock;
    DM.pushCommand({ type: "cover", to: pid, payload: { cover: snap.cover || "", lock: !!snap.coverLock }, from: DM.state.uid });
    return true;
  },
  async act(detail) {
    detail = detail || {};
    const i = mapFightIndex(detail);
    if (i < 0) { DM.toast("No card linked"); return false; }
    const row = fight.order[i];
    if (!row || row.kind !== "player") return false;
    row.dmActsAs = !!detail.on;
    if (row.dmActsAs) {
      const line = "DM acting for " + (row.name || "a player");
      await DM.pushLedger({ who: "DM", playerId: row.playerId || row.id, type: "dm_act", what: line, oldVal: null, newVal: "acting", flag: false });
      DM.toast(line);
    }
    await saveRemoteTable();
    renderFight();
    return true;
  },
  link(detail) { return linkMapToken(detail); },
  placeBeast(detail) { return mapPlaceBeast(detail); },
  onTokenRemoved(detail) { unlinkMapToken(detail); },
  syncMap() { syncMapTokens(); }
};

/* Dirty-gun tracker (sheet 0.3.119 / DMCC 0.2.132). The DM advances a room campaign day.
   A gun not cleaned in 2 campaign days is listed here. Nothing auto-dirties the gun, and the list is DM-only. */
function campaignDayNow() {
  const n = parseInt(fight.campaignDay, 10);
  return isFinite(n) && n > 0 ? n : 1;
}
function playerGunKey(pid, index) { return "p:" + pid + ":" + index; }
function enemyGunKey(row, n) { return "e:" + ((row && row.id) || "row") + ":" + n; }
function trackedGuns() {
  const out = [];
  Object.keys(DM.state.players || {}).forEach((pid) => {
    const snap = playerSnapshot(pid) || {};
    const who = snap.name || pid;
    (snap.guns || []).forEach((g, i) => {
      if (!g || !(Number(g.capacity) > 0)) return;
      const index = g.index != null && g.index !== "" ? g.index : i;
      out.push({ key: playerGunKey(pid, index), who: who, gun: g.name || g.weapon || "Gun", dirty: !!g.dirty });
    });
  });
  (fight.order || []).forEach((row) => {
    if (!row || row.kind === "player") return;
    ((row.card && row.card.attacks) || []).forEach((atk, n) => {
      if (!atk || !(Number(atk.capacity) > 0)) return;
      out.push({ key: enemyGunKey(row, n), who: row.name || "Enemy", gun: atk.name || "Gun", dirty: !!atk.dirty });
    });
  });
  return out;
}
function stampGunClean(key) {
  if (!key) return;
  fight.gunClean = fight.gunClean || {};
  fight.gunClean[key] = campaignDayNow();
  if (fight._gunDirty) fight._gunDirty[key] = false;
}
function noteGunCleans() {
  fight.gunClean = fight.gunClean || {};
  fight._gunDirty = fight._gunDirty || {};
  const day = campaignDayNow();
  let changed = false;
  trackedGuns().forEach((g) => {
    if (fight.gunClean[g.key] == null || fight.gunClean[g.key] === "") {
      fight.gunClean[g.key] = day;
      changed = true;
    } else if (fight._gunDirty[g.key] === true && !g.dirty) {
      fight.gunClean[g.key] = day;
      changed = true;
    }
    fight._gunDirty[g.key] = !!g.dirty;
  });
  return changed;
}
function gunOverdueList() {
  const day = campaignDayNow();
  return trackedGuns().filter((g) => {
    const cleaned = parseInt(fight.gunClean && fight.gunClean[g.key], 10);
    if (!isFinite(cleaned)) return false;
    g.days = day - cleaned;
    return g.days >= 2;
  });
}
function paintGunClock(list) {
  const dayEl = $("#gunClockDay");
  const ul = $("#gunClockList");
  if (dayEl) dayEl.textContent = "Campaign day " + campaignDayNow();
  if (!ul) return;
  const rows = list || gunOverdueList();
  ul.innerHTML = rows.length
    ? rows.map((r) => `<li><b>${esc(r.who)}</b> · ${esc(r.gun)} · ${r.days} days since last clean — still not Dirty unless you Set Dirty</li>`).join("")
    : '<li class="fine">None overdue. The clock does not set Dirty.</li>';
}
let gunClockBusy = false;
function syncGunClock() {
  if (gunClockBusy) { paintGunClock(); return; }
  gunClockBusy = true;
  try {
    const changed = noteGunCleans();
    paintGunClock();
    if (changed) saveRemoteTable();
  } finally { gunClockBusy = false; }
}
function advanceCampaignDay() {
  const before = {};
  gunOverdueList().forEach((g) => { before[g.key] = true; });
  fight.campaignDay = campaignDayNow() + 1;
  noteGunCleans();
  const now = gunOverdueList();
  const fresh = now.filter((g) => !before[g.key]);
  saveRemoteTable();
  paintGunClock(now);
  if (fresh.length === 1) DM.toast(fresh[0].who + " · " + fresh[0].gun + " · " + fresh[0].days + " days since last clean — still not Dirty unless you Set Dirty");
  else if (fresh.length) DM.toast(fresh.length + " guns are 2 days since last clean — still not Dirty unless you Set Dirty");
  else DM.toast("Campaign day " + fight.campaignDay);
}
window.SSDNSGunClock = {
  day: campaignDayNow,
  advance: advanceCampaignDay,
  overdue: gunOverdueList,
  note: noteGunCleans,
  stamp: stampGunClean,
  playerKey: playerGunKey,
  enemyKey: enemyGunKey,
  sync: syncGunClock
};

wireLookupNow();
bootV2();

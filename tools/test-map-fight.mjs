/**
 * Drawer events call the existing fight resolve path.
 *   node tools/test-map-fight.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const commands = [];
const rolls = [];
const ledger = [];
const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
const stored = {};
sandbox.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null; },
  setItem(k, v) { stored[k] = String(v); }
};
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return {
      className: "", innerHTML: "", dataset: {},
      addEventListener() {},
      querySelector() { return { addEventListener() {} }; },
      querySelectorAll() { return []; },
      setAttribute() {}
    };
  },
  body: { appendChild() {}, classList: { contains() { return false; } } },
  activeElement: null
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let seq = 0;
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { seq += 1; return (p || "id") + seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice(formula) {
    const text = String(formula || "");
    const flat = text.match(/^(\d+)$/);
    if (flat) return { total: Number(flat[1]), detail: text };
    return { total: 4, detail: "4" };
  },
  pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
  pushRoll(roll) { rolls.push(roll); return Promise.resolve(); },
  pushLedger(row) { ledger.push(row); return Promise.resolve(); },
  renderPlayers() {}
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
const v2 = read("dm/assets/js/v2.js").replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__fight = { setOrder: function (rows) { fight.order = rows || []; }, undo: function () { return fight.undo; } };\n"
);
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const bandit = {
  id: "en_bandit1",
  name: "Bandit",
  kind: "enemy",
  ac: 12,
  hp: 11,
  maxHp: 11,
  card: {
    attacks: [{ id: "ballncap", name: "Ball n Cap", toHit: 3, damage: "1d8+1", capacity: 6, loaded: 6, misfire: 4 }]
  }
};
const jolene = {
  id: "p_jolene",
  playerId: "p_jolene",
  kind: "player",
  name: "Jolene",
  ac: 13,
  hp: 20,
  maxHp: 20
};
sandbox.__fight.setOrder([jolene, bandit]);
sandbox.SSDNSTestRoll = () => 20;

const self = await sandbox.SSDNSMapFight.attack({
  tokenId: "tok_bandit1",
  combatantId: "en_bandit1",
  weaponId: "ballncap",
  targetTokenId: "tok_bandit1",
  targetCombatantId: "en_bandit1"
});
check("fight.self", self === false && jolene.hp === 20 && bandit.card.attacks[0].loaded === 6 && rolls.length === 0);

const hit = await sandbox.SSDNSMapFight.attack({
  tokenId: "tok_bandit1",
  combatantId: "en_bandit1",
  weaponId: "ballncap",
  targetTokenId: "tok_jolene",
  targetCombatantId: "p_jolene"
});
check("fight.hit", hit === true && jolene.hp === 16, "hp " + jolene.hp);
check("fight.roll", rolls.some((r) => r && r.attack && r.damage === 4 && /Jolene/.test(r.detail || "")), JSON.stringify(rolls[0] && { attack: rolls[0].attack, damage: rolls[0].damage, detail: rolls[0].detail }));
check("fight.ammo", bandit.card.attacks[0].loaded === 5, "loaded " + bandit.card.attacks[0].loaded);
check("fight.undoReady", !!(sandbox.__fight.undo() && sandbox.__fight.undo().restoreHp && sandbox.__fight.undo().restoreHp.hp === 20));
await sandbox.SSDNSMapFight.undo();
check("fight.undo", jolene.hp === 20, "hp " + jolene.hp);

const rustler = {
  id: "en_rustler",
  name: "Rustler",
  kind: "enemy",
  ac: 12,
  hp: 11,
  maxHp: 11,
  card: {
    attacks: [{
      id: "chaosmaker-revolver",
      name: "ChaosMaker Revolver",
      weapon: "Pony Arms ChaosMaker, Medium (.44-40)",
      toHit: 3,
      damage: "4",
      capacity: 6,
      loaded: 6,
      misfire: 1
    }]
  }
};
const other = {
  id: "p_other",
  playerId: "p_other",
  kind: "player",
  name: "Wade",
  ac: 14,
  hp: 18,
  maxHp: 18
};
sandbox.__fight.setOrder([other, jolene, bandit, rustler]);
const played = [];
sandbox.SSDNSAudio = {
  weaponCue(info) {
    const slug = String((info && info.weapon) || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug === "pony-arms-chaosmaker-medium") return "revolver";
    return "attack";
  },
  sharedCue(name) { return name || ""; },
  play(name) { played.push(name); }
};
rolls.length = 0;
sandbox.SSDNSTestRoll = () => 15;
const fired = await sandbox.SSDNSMapFight.attack({
  tokenId: "tok_rustler",
  combatantId: "en_rustler",
  weaponId: "chaosmaker-revolver",
  targetCombatantId: "p_jolene"
});
const rustlerRoll = rolls[rolls.length - 1] || {};
check("chamber.fire", fired === true && jolene.hp === 16 && rustler.card.attacks[0].loaded === 5, "hp " + jolene.hp + " loaded " + rustler.card.attacks[0].loaded);
check("chamber.actor", rustlerRoll.who === "Rustler" && /Rustler → Jolene/.test(rustlerRoll.detail || "") && /→ HIT/.test(rustlerRoll.detail || "") && !/Wade attacks/.test(rustlerRoll.detail || ""), rustlerRoll.detail);
check("chamber.sfx", played[played.length - 1] === "revolver", played.join(","));
{
  const sfxDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
  sfxDom.window.fetch = async () => ({ ok: true, json: async () => JSON.parse(read("assets/sfx/sfx.json")) });
  sfxDom.window.Audio = function () { return { addEventListener() {}, play() { return Promise.resolve(); } }; };
  const sfxTag = sfxDom.window.document.createElement("script");
  sfxTag.textContent = read("assets/js/sfx.js");
  sfxDom.window.document.body.appendChild(sfxTag);
  await flush(40);
  const cue = sfxDom.window.SSDNSAudio.weaponCue({ weapon: "Pony Arms ChaosMaker, Medium (.44-40)" });
  check("chamber.sfxFile", cue === "revolver", cue);
}
const targets = sandbox.SSDNSMapFight.targets({ combatantId: "en_rustler", tokenId: "tok_rustler", selectedCombatantId: "p_other" });
check("chamber.targets", targets && targets.selected === "p_other" && targets.options.some((o) => o.id === "p_jolene") && !targets.options.some((o) => o.id === "en_rustler"), JSON.stringify(targets && { selected: targets.selected, ids: (targets.options || []).map((o) => o.id) }));
const lastTargets = sandbox.SSDNSMapFight.targets({ combatantId: "en_rustler" });
check("chamber.lastTarget", lastTargets && lastTargets.selected === "p_jolene", lastTargets && lastTargets.selected);

await sandbox.SSDNSMapFight.hp({ combatantId: "en_bandit1", set: 7 });
check("fight.hpSet", bandit.hp === 7, "hp " + bandit.hp);
await sandbox.SSDNSMapFight.hp({ combatantId: "en_bandit1", delta: -2 });
check("fight.hpDelta", bandit.hp === 5, "hp " + bandit.hp);
await sandbox.SSDNSMapFight.undo();
check("fight.hpUndo", bandit.hp === 7, "hp " + bandit.hp);

await sandbox.SSDNSMapFight.condition({ combatantId: "en_bandit1", condition: "Prone", on: true });
check("fight.condition", (bandit.conditions || []).some((c) => c && c.name === "Prone"));
await sandbox.SSDNSMapFight.reload({ combatantId: "en_bandit1", weaponId: "ballncap" });
check("fight.reload", bandit.card.attacks[0].loaded === 6, "loaded " + bandit.card.attacks[0].loaded);

jolene.hp = 0;
commands.length = 0;
sandbox.SSDNSTestRoll = () => 15;
await sandbox.SSDNSMapFight.deathsave({ combatantId: "p_jolene", tokenId: "tok_jolene" });
check("fight.death", commands.some((c) => c && c.type === "death_save" && c.payload && c.payload.side === "success") && jolene.deathSaves && jolene.deathSaves.success[0] === true, JSON.stringify(commands));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body class=\"in-room\"><div id=\"mapIdle\"></div><div id=\"mapMount\" data-map-role=\"dm\" data-asset-base=\"\" data-scene=\"scene.json\" data-tokens=\"tokens.json\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function pointer(w, el, type, x, y, extra) {
  const init = Object.assign({
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1
  }, extra || {});
  const Ev = type === "wheel" ? w.WheelEvent : (w.PointerEvent || w.MouseEvent);
  const ev = new Ev(type, init);
  if (ev.pointerId == null) {
    try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {}
  }
  el.dispatchEvent(ev);
}
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = JSON.parse(read("map/tokens.json"));
const w = makeWindow();
const card = {
  kind: "enemy",
  name: "Bandit",
  ac: 12,
  hp: { cur: 11, max: 11 },
  attacks: [{ id: "ballncap", name: "Ball n Cap", toHit: 3, damage: "1d8+1", ammo: { loaded: 6, cap: 6, chambers: [1, 1, 1, 1, 1, 1] } }]
};
const fightCalls = [];
w.DMCC = {
  state: {
    roomCode: "DUST",
    demo: true,
    db: null,
    uid: "dm",
    meta: { dmUid: "dm" },
    players: {},
    table: { initiative: { order: [], turn: 0 } }
  }
};
w.SSDNSMapCards = {
  get() { return card; },
  initiative() {
    return {
      round: 1, turn: 1, started: true,
      order: [{ id: "p_jolene", name: "Jolene", kind: "player" }, { id: "en_bandit1", name: "Bandit", kind: "enemy" }]
    };
  }
};
w.SSDNSMapFight = {
  attack(detail) {
    fightCalls.push(detail);
    card.attacks[0].ammo.loaded = Math.max(0, card.attacks[0].ammo.loaded - 1);
    return Promise.resolve(true);
  },
  targets() {
    return {
      selected: "p_jolene",
      options: [
        { id: "p_jolene", name: "Jolene", label: "Jolene · AC 13" },
        { id: "en_bandit1", name: "Bandit", label: "Bandit · AC 12" }
      ]
    };
  }
};
w.fetch = async (url) => {
  const name = String(url);
  if (name.includes("tokens")) return { ok: true, json: async () => tokens };
  if (name.includes("scene")) return { ok: true, json: async () => scene };
  return { ok: false, json: async () => ({}) };
};
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
addScript(w, "map/ssdns-map-host.js");
await flush(80);
const mount = w.document.getElementById("mapMount");
const strip = mount.querySelector("[data-act=turnStrip]");
const banditChip = strip && [...strip.querySelectorAll("span")].find((s) => s.textContent.includes("Bandit"));
const joleneChip = strip && [...strip.querySelectorAll("span")].find((s) => s.textContent.includes("Jolene"));
if (banditChip) banditChip.click();
await flush(20);
const atk = mount.querySelector(".ssm-atk");
if (atk) atk.click();
await flush(10);
if (joleneChip) joleneChip.click();
await flush(30);
const drawer = mount.querySelector("[data-act=drawer]");
check("drawer.wired", fightCalls.length === 1 && fightCalls[0].weaponId === "ballncap" && fightCalls[0].targetCombatantId === "p_jolene" && fightCalls[0].combatantId === "en_bandit1", JSON.stringify(fightCalls[0]));
check("drawer.refresh", !!(drawer && drawer.textContent.includes("5/6")), drawer && drawer.textContent.slice(0, 240));
const cylTarget = drawer && drawer.querySelector('[data-act="cylTarget"]');
check("drawer.cylTarget", !!(cylTarget && cylTarget.value === "p_jolene"), cylTarget && cylTarget.outerHTML);
const chamber = drawer && drawer.querySelector('[data-act="chamber"]');
if (chamber) chamber.click();
await flush(30);
const chamberCall = fightCalls[fightCalls.length - 1];
check("drawer.chamberFires", fightCalls.length === 2 && chamberCall && chamberCall.weaponId === "ballncap" && chamberCall.targetCombatantId === "p_jolene" && chamberCall.combatantId === "en_bandit1" && !chamberCall.spellId, JSON.stringify(chamberCall));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap fight ok");

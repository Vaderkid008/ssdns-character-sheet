/**
 * N87 Interact + Turn# timers / doors (sheet 0.3.175 / DMCC 0.2.188).
 *   node tools/test-n87-interact-timers.mjs
 * rules.js is not edited. N86 Asset Library is not rebuilt.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 500) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 500) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.180" && version.sheetBuild === "sheet-playtest-v03180", JSON.stringify(version));
check("ver.dmcc", version.dmcc === "0.2.193" && version.dmccBuild === "dmcc-playtest-v02193");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.180"') && read("assets/js/app.js").includes("sheet-playtest-v03180"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.193"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02193"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);
check("rules.no174", !read("assets/data/rules.js").includes("0.3.174") && !read("assets/data/rules.js").includes("0.2.187"));

const mapSrc = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
check("src.ajarSight", mapSrc.includes("if (w.ajar) continue;") && mapSrc.includes("if (!w || w.open) return false"));
check("src.noBleedKept", mapSrc.includes("if (w.open || (w.window && !w.shut)) continue;"));
check("src.doorMenu", mapSrc.includes('data-act="doorMenu"') && mapSrc.includes("doorInteract: function") && mapSrc.includes("tryDoorClick"));
check("src.clock", v2.includes("SSDNSAssets.onRound") && v2.includes("SSDNSInteract.onCombatStart"));
check("src.hooks", read("map/interact-timers.js").includes("SSDNSAssets.registerAction") && read("map/asset-library.js").includes('handlers["door:" + doorAct]'));
check("src.cache", read("index.html").includes("interact-timers.js?v=0.3.175-n87") && read("dm/index.html").includes("interact-timers.js?v=0.2.188-n87"));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  encodeURIComponent, decodeURIComponent
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/loot.js"), context);
vm.runInContext(read("map/ssdns-map-move.js"), context);
vm.runInContext(read("map/asset-library.js"), context);
vm.runInContext(read("map/interact-timers.js"), context);
const I = context.SSDNSInteract;
const Move = context.SSDNSMapMove;
const Assets = context.SSDNSAssets;
check("boot.hooked", I.pendingN86() === false && Assets && Assets.__n87Round === true);

const beside = { pos: { x: 6, y: 6 }, size: 1 };
const door = { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false };
check("reach.adjacent", I.feetToWall(beside, door) === 5, I.feetToWall(beside, door));
check("reach.touch", I.feetToWall({ pos: { x: 6, y: 5 }, size: 1 }, door) === 0);
check("reach.far", I.feetToWall({ pos: { x: 6, y: 8 }, size: 1 }, door) === 15);
const vert = { x1: 5, y1: 6, x2: 5, y2: 7, door: true };
check("reach.largeTouch", I.feetToWall({ pos: { x: 5, y: 6 }, size: 2 }, vert) === 0);
check("reach.oneOff", I.feetToWall({ pos: { x: 6, y: 6 }, size: 1 }, vert) === 5);
check("reach.twoOff", I.feetToWall({ pos: { x: 7, y: 6 }, size: 1 }, vert) === 10);
check("reach.menuFar", I.doorMenu(door, { token: { pos: { x: 6, y: 8 }, size: 1 }, dm: false }).reach === false);
check("reach.menuNear", I.doorMenu(door, { token: beside, dm: false }).actions.map((a) => a.id).join(",") === "open,peek");

const locked = { door: true, locked: true, open: false, lockDc: 15, ajar: false };
const refused = I.applyDoor(locked, "open", { dm: true });
check("open.locked", refused.ok === false && refused.toast === "Locked" && locked.open === false && locked.locked === true);

const sheetFail = { mods: { DEX: 0 }, prof: 2, thievesTools: true };
const failWall = { door: true, locked: true, open: false, lockDc: 15, trapOnFail: true };
const fail = I.applyDoor(failWall, "lockpick", { dm: true, sheet: sheetFail, rng: function () { return 0; } });
check("lock.fail", fail.success === false && fail.total === 3 && failWall.locked === true && fail.trap === false && !failWall.trapTripped, JSON.stringify(fail));
const okWall = { door: true, locked: true, open: false, lockDc: 10, trapOnFail: true };
const sheetOk = { mods: { DEX: 5 }, prof: 2, thievesTools: true };
const ok = I.applyDoor(okWall, "lockpick", { dm: true, sheet: sheetOk, rng: function () { return 0.95; } });
check("lock.ok", ok.success === true && ok.nat === 20 && okWall.locked === false, JSON.stringify(ok));

const peekWall = { door: true, locked: false, open: false, ajar: false };
I.applyDoor(peekWall, "peek", { dm: true });
const los = I.peekRule(peekWall);
check("peek.ajar", peekWall.ajar === true && los.blocksSight === false && los.blocksMove === true, JSON.stringify(los));
check("peek.move", Move.segmentBlocks(5.5, 5.5, 6.5, 5.5, { x1: 6, y1: 0, x2: 6, y2: 20, door: true, ajar: true, open: false }) === true);
check("peek.openMove", Move.segmentBlocks(5.5, 5.5, 6.5, 5.5, { x1: 6, y1: 0, x2: 6, y2: 20, door: true, open: true }) === false);
I.applyDoor(peekWall, "peek", { dm: true });
check("peek.again", peekWall.ajar === false && I.peekRule(peekWall).blocksSight === true);
I.applyDoor(peekWall, "close", { dm: true });
check("peek.close", peekWall.open === false && peekWall.ajar === false);
const secret = { door: true, secret: true, open: false };
check("secret.menu", I.doorMenu(secret, { token: beside, dm: false }).hidden === true && I.doorMenu(secret, { token: beside, dm: false }).actions.length === 0);
check("secret.dm", I.doorMenu(secret, { dm: true }).actions.some((a) => a.id === "open"));

const fuse = { props: { timer: { mode: "fuse", fuseRounds: 2 } }, state: {}, effects: [{ type: "sfx", ref: "boom" }] };
const armed = I.arm(fuse, { round: 2, started: true, mode: "fuse", fuseRounds: 2 });
check("timer.arm", armed.fireNow === false && fuse.state.armedAtRound === 2 && fuse.state.firesAtRound === 4, JSON.stringify(fuse.state));
check("timer.notYet", I.due(fuse, 3) === false && I.onRound(3, [{ id: "b", asset: fuse }]).length === 0);
const once = I.onRound(4, [{ id: "b", asset: fuse }]);
check("timer.once", once.length === 1 && fuse.state.fired === true && fuse.state.firesAtRound == null);
check("timer.twice", I.onRound(4, [{ id: "b", asset: fuse }]).length === 0 && I.onRound(5, [{ id: "b", asset: fuse }]).length === 0);

const wait = { props: { timer: {} }, state: {} };
const held = I.arm(wait, { round: 1, started: false, mode: "timer", fuseRounds: 3 });
check("timer.wait", held.waiting === true && wait.state.firesAtRound == null && I.chipText({ asset: wait }, 1, "dm") === "Wait");
I.onCombatStart(1, [{ id: "w", asset: wait }]);
check("timer.start", wait.state.armedAtRound === 1 && wait.state.firesAtRound === 4 && wait.state.waiting === false, JSON.stringify(wait.state));

const live = { props: { timer: {} }, state: {}, effects: [{ type: "sfx", ref: "x" }] };
I.arm(live, { round: 1, started: true, mode: "fuse", fuseRounds: 1 });
I.defuse(live);
check("timer.defuse", live.state.firesAtRound == null && I.onRound(2, [{ id: "d", asset: live }]).length === 0);

const instant = { props: { timer: {} }, state: {}, effects: [{ type: "clear" }] };
const now = I.arm(instant, { round: 0, started: false, mode: "instant" });
check("timer.instant", now.fireNow === true && instant.state.waiting === false);

const keg = {
  id: "keg", x: 0, y: 0, size: 1, pos: { x: 0, y: 0 }, name: "Keg",
  asset: { effects: [] }
};
const victim = { id: "v", x: 1, y: 1, size: 1, pos: { x: 1, y: 1 }, name: "Bo" };
const far = { id: "far", x: 8, y: 8, size: 1, pos: { x: 8, y: 8 }, name: "Ada" };
const gate = { id: "gate", x: 3, y: 3, size: 1, asset: { state: { open: false, locked: true } } };
const walls = [{ x1: 0, y1: 0, x2: 1, y2: 0, door: true, locked: true, open: false }];
const effects = [
  { type: "explosion", radiusFt: 10, damage: 8, damageType: "fire", save: "DEX", dc: 15, halfOnSave: true },
  { type: "unlock", targets: [{ x1: 0, y1: 0, x2: 1, y2: 0 }] },
  { type: "open", targets: ["gate"] },
  { type: "condition", condition: "Prone", radiusFt: 10 },
  { type: "sfx", ref: I.BOOM_SFX },
  { type: "clear" }
];
const plan = I.dispatch(effects, { tokens: [keg, victim, far, gate], walls: walls }, keg);
check("fx.blast", plan.explosions.length === 1 && plan.explosions[0].targets.some((t) => t.id === "v") && !plan.explosions[0].targets.some((t) => t.id === "far"), JSON.stringify(plan.explosions[0].targets.map((t) => t.id)));
check("fx.unlock", walls[0].locked === false && walls[0].open !== true);
check("fx.open", gate.asset.state.open === true && plan.opens.length === 1);
check("fx.cond", plan.conditions[0].effect.condition === "Prone" && plan.conditions[0].targets.some((t) => t.id === "v"));
check("fx.sfx", plan.sfx[0] === I.BOOM_SFX && plan.clears.length === 1);

function walk(value, keys, pathName) {
  if (!value || typeof value !== "object") return;
  Object.keys(value).forEach((key) => {
    keys.push(pathName + key);
    walk(value[key], keys, pathName + key + ".");
  });
}
const nasty = {
  id: "bomb", hidden: false, kind: "asset", name: "Keg",
  asset: {
    name: "Keg", notes: "under the bar", immunities: ["fire"],
    hiddenFromPlayers: false,
    effects: [{ type: "explosion", damage: "99d6-secret", dc: 18, radiusFt: 20 }],
    props: { trap: { dc: 18, attack: 6, damage: "4d6" }, timer: { mode: "fuse", fuseRounds: 3 }, health: { max: 13 } },
    state: { hp: 7, on: false, open: false, armedAtRound: 2, firesAtRound: 5, countdownVisible: false }
  }
};
let pub = I.publicAsset(nasty, { round: 3 });
let blob = JSON.stringify(pub);
let keys = [];
walk(pub, keys, "");
check("pub.strip", !/firesAtRound|effects|notes|immunities|99d6-secret|4d6|armedAtRound|lockDc/.test(blob) && !keys.some((k) => /hp$|dc$|damage|firesAtRound|effects|notes|immunities/.test(k)), blob + " keys " + keys.join(","));
check("pub.noChip", pub.turnsLeft == null && pub.hpPct === 54, blob);
nasty.asset.state.countdownVisible = true;
pub = I.publicAsset(nasty, { round: 3 });
blob = JSON.stringify(pub);
check("pub.chip", pub.turnsLeft === 2 && !/firesAtRound|99d6-secret/.test(blob), blob);
check("pub.hiddenToken", I.publicAsset(Object.assign({}, nasty, { hidden: true }), { round: 3 }) == null);
nasty.hidden = false;
nasty.asset.hiddenFromPlayers = true;
nasty.asset.state.countdownVisible = true;
check("pub.hiddenBomb", I.publicAsset(nasty, { round: 3 }) == null);
check("chip.playerHidden", I.chipText({ hidden: true, asset: { state: { firesAtRound: 5, countdownVisible: true } } }, 3, "player") === "");
check("chip.playerShown", I.chipText({ asset: { state: { firesAtRound: 5, countdownVisible: true } } }, 3, "player") === "2");
check("chip.dm", I.chipText({ asset: { state: { firesAtRound: 5, countdownVisible: false } } }, 3, "dm") === "2");

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
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
    bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y,
    pointerId: 1, button: 0, buttons: 1, detail: 1
  }, extra || {});
  const Ev = w.PointerEvent || w.MouseEvent;
  el.dispatchEvent(new Ev(type, init));
}
function screenOf(gx, gy) { return { x: gx * 70 - 650, y: gy * 70 - 400 }; }
/* The player map centers on their token (6,6), not the saloon middle the DM uses. */
function playerScreen(gx, gy) {
  return { x: gx * 70 - 6.5 * 70 + 400, y: gy * 70 - 6.5 * 70 + 300 };
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map-move.js");
addScript(w, "assets/js/loot.js");
addScript(w, "map/asset-library.js");
addScript(w, "map/interact-timers.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
delete scene.walls;
delete scene.fogRects;
delete scene.fogPolys;
delete scene.fogShapes;
const store = { pub: {}, dm: {} };
const bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const dmEl = w.document.createElement("div");
dmEl.id = "dm";
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd,
  host: { on() {}, players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
await flush(40);
const near = [
  { x1: 0, y1: 5, x2: 6, y2: 5 },
  { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false, locked: true, lockDc: 15 },
  { x1: 7, y1: 5, x2: 12, y2: 5 }
];
dmAd.write("map/public/scenes/scn_dustyspur01", { walls: near, ambient: "bright", visionMode: "own", fogShapes: [], fogRevealed: false }, { seq: Date.now() });
dmAd.write("map/public/tokens/ada", {
  id: "ada", name: "Ada", label: "Ada", kind: "player", size: 1, sceneId: "scn_dustyspur01",
  pos: { x: 6, y: 6 }, ownerUid: "ada"
}, { seq: Date.now() });
const playerAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const playerEl = w.document.createElement("div");
playerEl.id = "player";
w.document.body.appendChild(playerEl);
const player = w.SSDNSMap.create({
  el: playerEl, role: "player", uid: "ada", adapter: playerAd, host: { on() {} },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
const canvas = playerEl.querySelector("canvas");
const at = playerScreen(6.5, 5);
pointer(w, canvas, "pointerdown", at.x, at.y);
pointer(w, canvas, "pointerup", at.x, at.y, { buttons: 0 });
const menu = act(playerEl, "doorMenu");
const labels = menu ? Array.prototype.map.call(menu.querySelectorAll("[data-door]"), (b) => b.getAttribute("data-door")).join(",") : "";
check("ui.menu", menu && !menu.hidden && labels === "open,lockpick,peek", labels);
const openBtn = menu && menu.querySelector('[data-door="open"]');
if (openBtn) openBtn.click();
await flush(30);
const wallsNow = ((store.pub["map/public/scenes/scn_dustyspur01"] || {}).value || {}).walls || [];
const still = wallsNow.find((wall) => wall.door && wall.x1 === 6);
check("ui.locked", still && still.locked === true && still.open !== true, JSON.stringify(still));
check("ui.toast", act(playerEl, "toast") && act(playerEl, "toast").textContent === "Locked");

dmAd.write("map/public/tokens/ada", {
  id: "ada", name: "Ada", label: "Ada", kind: "player", size: 1, sceneId: "scn_dustyspur01",
  pos: { x: 6, y: 8 }, ownerUid: "ada"
}, { seq: Date.now() + 2 });
await flush(30);
pointer(w, canvas, "pointerdown", at.x, at.y);
const farMenu = act(playerEl, "doorMenu");
check("ui.far", (!farMenu || farMenu.hidden) && act(playerEl, "toast") && /Out of reach \(15 ft\)/.test(act(playerEl, "toast").textContent), act(playerEl, "toast") && act(playerEl, "toast").textContent);

dmAd.write("map/public/scenes/scn_dustyspur01", {
  walls: [
    { x1: 0, y1: 5, x2: 6, y2: 5 },
    { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false, secret: true },
    { x1: 7, y1: 5, x2: 12, y2: 5 }
  ],
  ambient: "bright", visionMode: "own", fogShapes: [], fogRevealed: false
}, { seq: Date.now() + 3 });
dmAd.write("map/public/tokens/ada", {
  id: "ada", name: "Ada", label: "Ada", kind: "player", size: 1, sceneId: "scn_dustyspur01",
  pos: { x: 6, y: 6 }, ownerUid: "ada"
}, { seq: Date.now() + 4 });
await flush(30);
if (farMenu) farMenu.hidden = true;
pointer(w, canvas, "pointerdown", at.x, at.y);
const secretMenu = act(playerEl, "doorMenu");
check("ui.secret", !secretMenu || secretMenu.hidden, secretMenu && secretMenu.innerHTML);

dm.destroy();
player.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " FAILED\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nall n87 interact / timer checks passed");

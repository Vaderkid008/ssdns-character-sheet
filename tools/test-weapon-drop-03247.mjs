/**
 * Weapon-drop indicators and Interact collect (sheet 0.3.266 / DMCC 0.2.279).
 * A dropped weapon is a map token. Interact within 5 ft opens the existing
 * chest menu and Take all collects it. Nothing in reach stays dim.
 *   node tools/test-weapon-drop-03247.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.266" && version.sheetBuild === "sheet-playtest-v03266");
check("ver.dmcc", version.dmcc === "0.2.279" && version.dmccBuild === "dmcc-playtest-v02279");
check("rules.untouched", !read("database.rules.json").includes("weaponDrop") && !read("assets/data/rules.js").includes("pinWeaponDrop"));

const v2 = read("dm/assets/js/v2.js");
check("steal.pins", v2.includes("host.pinWeaponDrop") && v2.includes("enemy.dropAttackId"));
check("heat.pins", v2.includes("function dropHeldWeapon") && v2.includes("dropHeldWeapon(one.id, one.name)") && v2.includes("dropHeldWeapon(req.targetId, name)"));
const grab = v2.slice(v2.indexOf("function applyEnemyGrab"), v2.indexOf("async function sendGrabCommand"));
check("steal.instance", grab.includes("atk.dropped = true") && !grab.includes("beast.attacks"));
const bulk = v2.slice(v2.indexOf("async function randomizeMapLoot"), v2.indexOf("window.SSDNSMapFight = {"));
check("randomize.noChest", !bulk.includes("pinLootChest") && !bulk.includes("pinWeaponDrop"));

const lootCtx = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, encodeURIComponent, document: { getElementById() { return null; }, addEventListener() {} } };
lootCtx.globalThis = lootCtx;
lootCtx.window = lootCtx;
vm.createContext(lootCtx);
vm.runInContext(read("assets/js/loot.js"), lootCtx, { filename: "loot.js" });
const clean = lootCtx.SSDNSLoot.takeAll({
  id: "drop1", opener: "p", shared: true, reveal: "everyone", boxType: "enemy-drop",
  contents: [{ id: "navy-army-ball-n-cap-revolver", qty: 1, name: "Navy", dirty: false }],
  cash: { es: 0, black: 0, branch: "none" }, lock: { dc: 0, unlocked: true }
}, "p", {});
const issued = lootCtx.SSDNSLoot.takeAll({
  id: "drop2", opener: "p", shared: true, reveal: "everyone", boxType: "enemy-drop",
  contents: [{ id: "navy-army-ball-n-cap-revolver", qty: 1, name: "Navy" }],
  cash: { es: 0, black: 0, branch: "none" }, lock: { dc: 0, unlocked: true }
}, "p", {});
const cleanLeg = clean.xfer.legs[0];
const issuedLeg = issued.xfer.legs[0];
check("dirty.keptClean", clean.ok && cleanLeg.payload.dirty === false);
check("dirty.issuedStays", issued.ok && issuedLeg.payload.dirty === true);

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const proto = w.HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
function addScript(rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function pointer(el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  el.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
}
addScript("assets/js/loot.js");
addScript("map/ssdns-map-move.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const screenOf = (gx, gy) => ({ x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    on() {},
    getCard() { return { kind: "pc", name: "Dust", ac: 13, hp: { cur: 9, max: 9 }, attacks: [] }; },
    combatTargets() { return { selected: "", options: [] }; },
    actions: { get() { return []; }, run() { return Promise.resolve(); } },
    players() { return []; }
  },
  options: {
    scene,
    tokens: { tokens: {
      tok_me: { id: "tok_me", kind: "player", name: "Dust", ownerUid: "p_t", size: 1, pos: { x: 15, y: 8 } },
      tok_far: { id: "tok_far", kind: "player", name: "Far", ownerUid: "p_far", size: 1, pos: { x: 2, y: 2 } }
    } },
    assetBase: "",
    players: () => [],
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(80);
const beast = { id: "bandit", ac: 12, hp: 11, attacks: "Scimitar" };
const drop = map.pinWeaponDrop({ name: "Scimitar", itemId: "scimitar", dirty: false, at: { x: 16, y: 8 }, fromId: "en1", reason: "Stolen" });
check("drop.token", !!(drop && drop.weaponDrop && drop.lootBoxId && drop.kind === "drop"), drop && drop.kind);
check("catalog.untouched", beast.ac === 12 && beast.hp === 11 && beast.attacks === "Scimitar");
const canvas = el.querySelector("canvas");
const at = screenOf(15, 8);
pointer(canvas, "pointerdown", at.x, at.y);
pointer(canvas, "pointerup", at.x, at.y);
await flush(40);
const interact = el.querySelector('[data-act="tokenCmdInteract"]');
check("near.lit", !!(interact && !interact.disabled));
if (interact) interact.click();
await flush(20);
const menu = el.querySelector('[data-act="chestMenu"]');
const take = menu && menu.querySelector('[data-chest="take-all"]');
check("menu.take", !!(menu && take), menu && menu.textContent);
if (take) take.click();
await flush(20);
check("collected", !!(drop.loot && drop.loot.taken) && drop.weaponDrop.taken === true);
const far = screenOf(2, 2);
pointer(canvas, "pointerdown", far.x, far.y);
pointer(canvas, "pointerup", far.x, far.y);
await flush(30);
const farBtn = el.querySelector('[data-act="tokenCmdInteract"]');
check("far.dim", !!(farBtn && farBtn.disabled));

const chest = map.pinLootChest({
  id: "box_test", name: "Bandit loot", boxType: "enemy-drop", shared: true, reveal: "everyone",
  rolled: true, opened: true, contents: [{ id: "lamp-oil", qty: 1, name: "Lamp oil", dirty: false }],
  cash: { es: 0, black: 0, branch: "none" }, lock: { dc: 0, unlocked: true, method: [], jammed: false }, log: []
}, { x: 3, y: 2 });
pointer(canvas, "pointerdown", far.x, far.y);
pointer(canvas, "pointerup", far.x, far.y);
await flush(30);
const chestBtn = el.querySelector('[data-act="tokenCmdInteract"]');
check("chest.lit", !!(chest && chestBtn && !chestBtn.disabled));

if (failures.length) {
  console.log("FAILED " + failures.length);
  process.exit(1);
}
console.log("passed");
process.exit(0);

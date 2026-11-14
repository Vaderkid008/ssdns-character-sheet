/**
 * Edit tokens moves creatures only. The DM repositions a prop from its card.
 * A player Shove uses Strength (Athletics) and the DM applies the move.
 * Sheet 0.3.310 / DMCC 0.2.323.
 *   node tools/test-prop-reposition-03286.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.310" && ver.dmcc === "0.2.323" && ver.sheetBuild === "sheet-playtest-v03310" && ver.dmccBuild === "dmcc-playtest-v02323");
check("rules.clean", !read("assets/data/rules.js").includes("shoveCheck") && !read("database.rules.json").includes("prop-shove"));

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const style = w.document.createElement("style");
style.textContent = read("map/ssdns-map.css");
w.document.head.appendChild(style);
Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
w.HTMLElement.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
};
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = { addColorStop() {} };
  return new Proxy(bag, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; },
    set(t, p, v) { t[p] = v; return true; }
  });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
function addScript(rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
["map/interact-timers.js", "map/asset-library.js", "assets/js/loot.js", "map/ssdns-map-move.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"].forEach(addScript);

function pointer(node, type, x, y, extra) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 }, extra || {}));
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  if (extra && extra.shiftKey) { try { Object.defineProperty(ev, "shiftKey", { value: true }); } catch (e2) {} }
  node.dispatchEvent(ev);
}
function clickAt(canvas, x, y, extra) {
  pointer(canvas, "pointerdown", x, y, extra);
  pointer(canvas, "pointerup", x, y, extra);
}
function drag(canvas, a, b, extra) {
  pointer(canvas, "pointerdown", a.x, a.y, extra);
  pointer(canvas, "pointermove", b.x, b.y, extra);
  pointer(canvas, "pointerup", b.x, b.y, extra);
}
function tap(node) {
  if (!node) return;
  node.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
}
function openMenu(rootEl, act) {
  const menu = rootEl.querySelector('[data-act="' + act + '"]');
  return menu && !menu.hidden ? menu : null;
}
function dmAt(gx, gy) { return { x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 }; }
function plAt(origin, gx, gy) { return { x: (gx - origin.x) * 70 + 400, y: (gy - origin.y) * 70 + 300 }; }
function posOf(id) {
  const row = store.dm["map/dm/tokens/" + id] && store.dm["map/dm/tokens/" + id].value;
  return row && row.pos;
}
function pubPos(id) {
  const row = store.pub["map/public/tokens/" + id] && store.pub["map/public/tokens/" + id].value;
  return row && row.pos;
}

function barrel(id, x, y) {
  return {
    id, kind: "asset", name: "Powder Barrel", size: 1, pos: { x, y },
    asset: { name: "Powder Barrel", props: { timer: { mode: "fuse", fuseRounds: 2 } }, state: {}, effects: [], interact: { actions: ["light-fuse"], reachFt: 5 } }
  };
}
function chest(id, name, x, y, container) {
  return {
    id, kind: "chest", name, size: 1, pos: { x, y }, lootBoxId: id,
    loot: {
      id, name, boxType: container || "chest", container: container || "chest", opened: false,
      contents: [{ id: "rope", name: "Rope", qty: 1 }],
      cash: { es: 0 },
      lock: { dc: 0, unlocked: true, attempts: {}, forceAttempts: {}, forceDc: 15, allowRetries: false }
    }
  };
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = { tokens: {
  tok_ada: { id: "tok_ada", kind: "player", name: "Ada", ownerUid: "p_a", size: 1, pos: { x: 15, y: 10 } },
  tok_ned: { id: "tok_ned", kind: "enemy", name: "Ned", size: 1, pos: { x: 12, y: 10 } },
  tok_keg: barrel("tok_keg", 14, 10),
  tok_box: chest("tok_box", "Oak Chest", 16, 10),
  tok_far: chest("tok_far", "Far Chest", 19, 8),
  tok_strong: chest("tok_strong", "Iron Strongbox", 15, 11, "strongbox"),
  tok_drop: { id: "tok_drop", kind: "drop", name: "Rope", size: 1, pos: { x: 18, y: 10 }, weaponDrop: { name: "Rope", itemId: "rope", taken: false } }
}};
const sheet = { name: "Ada", abilities: { STR: 16 }, mods: { STR: 3 }, prof: 2, skillProf: { Athletics: 1 }, items: [] };
w.SSDNSApp = { doc() { return { character: sheet }; } };
const store = { pub: {}, dm: {} };
const bus = [];
const host = { on() {}, players() { return []; }, getCard() { return null; }, actions: { get() { return []; }, run() { return Promise.resolve(); } } };
function boot(el, role, uid) {
  el.className = "ssdns-map";
  w.SSDNSMap.create({
    el, role, uid,
    adapter: w.SSDNSMapFirebase.memory({ role, uid, store, bus }),
    host,
    options: { scene, tokens: role === "dm" ? tokens : { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
}

const dm = w.document.createElement("div");
w.document.body.appendChild(dm);
boot(dm, "dm", "dm");
await flush(80);
const dmCanvas = dm.querySelector("canvas");
const edit = dm.querySelector('[data-act="dmEditBtn"]');
tap(edit);
await flush(10);
drag(dmCanvas, dmAt(12, 10), dmAt(12, 12));
await flush(30);
check("edit.creature", posOf("tok_ned") && posOf("tok_ned").y !== 10, JSON.stringify(posOf("tok_ned")));
const chestBefore = JSON.stringify(posOf("tok_box"));
const kegBefore = JSON.stringify(posOf("tok_keg"));
drag(dmCanvas, dmAt(16, 10), dmAt(19, 10));
drag(dmCanvas, dmAt(14, 10), dmAt(14, 13));
await flush(30);
check("edit.chestStays", JSON.stringify(posOf("tok_box")) === chestBefore, JSON.stringify(posOf("tok_box")));
check("edit.barrelStays", JSON.stringify(posOf("tok_keg")) === kegBefore, JSON.stringify(posOf("tok_keg")));
tap(edit);
await flush(10);
drag(dmCanvas, dmAt(16, 10), dmAt(19, 10), { shiftKey: true });
await flush(20);
check("shift.chestStays", JSON.stringify(posOf("tok_box")) === chestBefore, JSON.stringify(posOf("tok_box")));

clickAt(dmCanvas, dmAt(19, 8).x, dmAt(19, 8).y);
await flush(20);
let pop = openMenu(dm, "dmChest");
check("dm.repositionBtn", !!(pop && pop.querySelector('[data-dm="reposition"]') && pop.querySelector('[data-dm="shove"]')));
tap(pop.querySelector('[data-dm="reposition"]'));
await flush(10);
clickAt(dmCanvas, dmAt(21, 9).x, dmAt(21, 9).y);
await flush(30);
check("dm.moved", !!(posOf("tok_far") && posOf("tok_far").x === 21 && posOf("tok_far").y === 9), JSON.stringify(posOf("tok_far")));
check("dm.synced", !!(pubPos("tok_far") && pubPos("tok_far").x === 21 && pubPos("tok_far").y === 9), JSON.stringify(pubPos("tok_far")));

clickAt(dmCanvas, dmAt(18, 10).x, dmAt(18, 10).y);
await flush(20);
const dropMenu = openMenu(dm, "chestMenu");
check("dm.dropBtn", !!(dropMenu && dropMenu.querySelector('[data-chest="reposition"]') && !dropMenu.querySelector('[data-chest="shove"]')));
tap(dropMenu.querySelector('[data-chest="reposition"]'));
await flush(10);
const canvas = dm.querySelector("canvas");
canvas.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await flush(10);
clickAt(dmCanvas, dmAt(19, 12).x, dmAt(19, 12).y);
await flush(20);
check("dm.esc", !posOf("tok_drop") || posOf("tok_drop").x === 18, JSON.stringify(posOf("tok_drop")));

const pl = w.document.createElement("div");
w.document.body.appendChild(pl);
boot(pl, "player", "p_a");
await flush(120);
const plCanvas = pl.querySelector("canvas");
const origin = { x: 15, y: 10 };
w.Math.random = () => 0.99;
clickAt(plCanvas, plAt(origin, 14, 10).x, plAt(origin, 14, 10).y);
await flush(20);
const asset = openMenu(pl, "assetMenu");
check("pl.shoveBtn", !!(asset && asset.querySelector('[data-prop="shove"]')));
tap(asset.querySelector('[data-prop="shove"]'));
await flush(80);
w.Math.random = Math.random;
check("shove.barrel", !!(posOf("tok_keg") && posOf("tok_keg").x === 13 && posOf("tok_keg").y === 10), JSON.stringify(posOf("tok_keg")));

w.Math.random = () => 0;
clickAt(plCanvas, plAt(origin, 15, 11).x, plAt(origin, 15, 11).y);
await flush(20);
let boxMenu = openMenu(pl, "chestMenu");
const strongText = ((boxMenu && boxMenu.textContent) || "");
check("pl.strongBtn", !!(boxMenu && boxMenu.querySelector('[data-chest="shove"]')), strongText.replace(/\s+/g, " ").slice(0, 120));
tap(boxMenu.querySelector('[data-chest="shove"]'));
await flush(80);
const failLine = ((openMenu(pl, "chestMenu") && openMenu(pl, "chestMenu").textContent) || "").replace(/\s+/g, " ");
check("shove.fail", posOf("tok_strong") && posOf("tok_strong").x === 15 && posOf("tok_strong").y === 11 && /doesn't budge/.test(failLine) && /DC 15/.test(failLine), failLine.slice(0, 180) + " " + JSON.stringify(posOf("tok_strong")));
boxMenu = openMenu(pl, "chestMenu");
check("shove.once", !!(boxMenu && !boxMenu.querySelector('[data-chest="shove"]') && posOf("tok_strong").x === 15), ((boxMenu && boxMenu.textContent) || "").replace(/\s+/g, " ").slice(0, 160));

dm.querySelector('[data-act="wallBtn"]').click();
pointer(dmCanvas, "pointerdown", 17 * 70 - 650, 10 * 70 - 400);
pointer(dmCanvas, "pointerup", 17 * 70 - 650, 11 * 70 - 400);
await flush(20);
dm.querySelector('[data-act="wallBtn"]').click();
w.Math.random = () => 0.99;
clickAt(plCanvas, plAt(origin, 16, 10).x, plAt(origin, 16, 10).y);
await flush(20);
const oak = openMenu(pl, "chestMenu");
tap(oak && oak.querySelector('[data-chest="shove"]'));
await flush(80);
w.Math.random = Math.random;
check("shove.wall", !!(posOf("tok_box") && posOf("tok_box").x === 16 && posOf("tok_box").y === 10), JSON.stringify(posOf("tok_box")));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nprop reposition ok");
process.exit(0);

/**
 * The token card X and the door card X cancel an armed command.
 * Clicking the map after X does not move the token.
 * Sheet 0.3.331 / DMCC 0.2.344.
 *   node tools/test-x-cancel-03330.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.331" && version.sheetBuild === "sheet-playtest-v03331");
check("ver.dmcc", version.dmcc === "0.2.344" && version.dmccBuild === "dmcc-playtest-v02344");
const mapSrc = read("map/ssdns-map.js");
check("src.tokenX", mapSrc.includes("bindFloatingMenu(menu, dismissTokenCommand)") && mapSrc.includes('cancelTokenCommand("menu-x")'));
check("src.doorX", mapSrc.includes("bindFloatingMenu(menu, dismissDoorCard)") && mapSrc.includes('cancelTokenCommand("door-x")'));
check("src.escDoor", mapSrc.includes("dismissDoorCard()"));
check("rules.untouched", !read("assets/data/rules.js").includes("dismissTokenCommand") && !read("database.rules.json").includes("dismissDoorCard"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const proto = w.HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
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
function pointer(el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerdown" ? 1 : 0 });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  el.dispatchEvent(ev);
}
addScript("map/interact-timers.js");
addScript("map/asset-library.js");
addScript("map/ssdns-map-move.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
scene.walls = [{ x1: 20, y1: 8, x2: 22, y2: 8, door: true, open: false, locked: false }];
const screenOf = (gx, gy) => ({ x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 });
const tokens = { tokens: {
  tok_t: { id: "tok_t", kind: "player", name: "Dust", combatantId: "p_t", ownerUid: "p_t", size: 1, pos: { x: 15, y: 8 }, sceneId: "scn_dustyspur01" }
} };
const host = {
  on() {},
  getCard() { return { kind: "pc", name: "Dust", ac: 13, hp: { cur: 9, max: 9 }, attacks: [] }; },
  combatTargets() { return { selected: "", options: [] }; },
  actions: { get() { return []; }, run() { return Promise.resolve(); } },
  players() { return []; }
};
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host,
  options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
const canvas = el.querySelector("canvas");
const at = screenOf(15, 8);
pointer(canvas, "pointerdown", at.x, at.y);
pointer(canvas, "pointerup", at.x, at.y);
await flush(40);
const moveBtn = el.querySelector('[data-act="tokenCmdMove"]');
check("menu.move", !!(moveBtn && moveBtn.textContent === "Move"));
moveBtn.click();
await flush(20);
check("move.armed", el.dataset.moveArmed === "1");
const before = map.tokenBoxes().find((b) => b.id === "ply_p_t");
el.querySelector('[data-act="tokenCmd"] [data-menu-close]').click();
await flush(20);
check("x.disarms", el.dataset.moveArmed !== "1" && !el.querySelector('[data-act="tokenCmd"]'), "armed=" + el.dataset.moveArmed);
const ground = screenOf(12, 12);
pointer(canvas, "pointerdown", ground.x, ground.y);
pointer(canvas, "pointerup", ground.x, ground.y);
await flush(80);
const after = map.tokenBoxes().find((b) => b.id === "ply_p_t");
check("x.thenMap.stays", after && before && after.x === before.x && after.y === before.y, (before && (before.x + "," + before.y)) + " -> " + (after && (after.x + "," + after.y)));
check("x.thenMap.stillOff", el.dataset.moveArmed !== "1");

map.setTool("wall");
const wa = screenOf(18, 10);
const wb = screenOf(21, 10);
pointer(canvas, "pointerdown", wa.x, wa.y);
pointer(canvas, "pointerup", wb.x, wb.y);
await flush(20);
map.setTool("door");
pointer(canvas, "pointerdown", screenOf(19, 10).x, screenOf(19, 10).y);
pointer(canvas, "pointerup", screenOf(19, 10).x, screenOf(19, 10).y);
await flush(20);
map.setTool("door");
const line = { x: 19.5 * 70 - 650, y: 11 * 70 - 400 };
pointer(canvas, "pointerdown", line.x, line.y);
pointer(canvas, "pointerup", line.x, line.y);
await flush(40);
pointer(canvas, "pointerdown", at.x, at.y);
pointer(canvas, "pointerup", at.x, at.y);
await flush(20);
el.querySelector('[data-act="tokenCmdMove"]').click();
await flush(10);
check("door.before.armed", el.dataset.moveArmed === "1");
pointer(canvas, "pointerdown", line.x, line.y);
pointer(canvas, "pointerup", line.x, line.y);
await flush(40);
const door = el.querySelector('[data-act="doorMenu"]');
check("door.menu", !!(door && !door.hidden && door.querySelector('[data-door="open"]')));
check("door.keepsMove", el.dataset.moveArmed === "1");
if (door && !door.hidden) {
  const spot = map.tokenBoxes().find((b) => b.id === "ply_p_t");
  door.querySelector("[data-menu-close]").click();
  await flush(20);
  const doorAfter = el.querySelector('[data-act="doorMenu"]');
  const glyphs = map.doorGlyphs();
  check("door.x.hides", !doorAfter || doorAfter.hidden);
  check("door.x.staysShut", glyphs.length === 1 && glyphs[0].open === false, JSON.stringify(glyphs));
  check("door.x.moveOff", el.dataset.moveArmed !== "1");
  pointer(canvas, "pointerdown", ground.x, ground.y);
  pointer(canvas, "pointerup", ground.x, ground.y);
  await flush(40);
  const stayed = map.tokenBoxes().find((b) => b.id === "ply_p_t");
  check("door.x.thenMap.stays", stayed && spot && stayed.x === spot.x && stayed.y === spot.y, (spot && (spot.x + "," + spot.y)) + " -> " + (stayed && (stayed.x + "," + stayed.y)));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nx cancel 0.3.331 ok");

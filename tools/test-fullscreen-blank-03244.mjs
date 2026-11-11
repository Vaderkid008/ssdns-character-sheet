/**
 * Full screen must not leave the map canvas at 0×0 or unpainted (sheet 0.3.285 / DMCC 0.2.298).
 * A 0×0 observation while the grid settles used to wipe the bitmap. One relayout, the same
 * path as the FULL SCREEN button, restores a positive size and a paint. Player and DM share it.
 *   node tools/test-fullscreen-blank-03244.mjs
 */
import fs from "node:fs";
import path from "node:path";
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
check("ver.sheet", version.sheet === "0.3.285" && version.sheetBuild === "sheet-playtest-v03285");
check("ver.dmcc", version.dmcc === "0.2.298" && version.dmccBuild === "dmcc-playtest-v02298");
const host = read("map/ssdns-map-host.js");
const clickAt = host.indexOf('full.addEventListener("click"');
check("host.relayout", clickAt > 0 && host.slice(clickAt, clickAt + 700).includes("map.relayout"));
check("n71.chrome", read("map/ssdns-map.css").includes("body.map-fullscreen .appbar") && read("map/ssdns-map.css").includes("display: none"));
check("rules.untouched", !read("assets/data/rules.js").includes("relayout") && !read("database.rules.json").includes("layoutBox"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const sizes = new WeakMap();
const proto = w.HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get() { const s = sizes.get(this); return s ? s.w : 800; } });
Object.defineProperty(proto, "clientHeight", { configurable: true, get() { const s = sizes.get(this); return s ? s.h : 600; } });
proto.getBoundingClientRect = function () {
  const s = sizes.get(this) || { w: 800, h: 600 };
  return { x: 0, y: 0, left: 0, top: 0, right: s.w, bottom: s.h, width: s.w, height: s.h, toJSON() { return {}; } };
};
w.__paint = 0;
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p !== "string") return undefined;
      if (p === "clearRect" || p === "fillRect" || p === "drawImage") return function () { w.__paint += 1; return bag; };
      return function () { return bag; };
    },
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
addScript("map/ssdns-map-move.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = { tokens: {
  tok_t: { id: "tok_t", kind: "player", name: "Dust", combatantId: "p_t", ownerUid: "p_t", size: 1, pos: { x: 15, y: 8 } }
} };
const cardHost = {
  on() {},
  getCard() { return { kind: "pc", name: "Dust", ac: 13, hp: { cur: 9, max: 9 }, attacks: [] }; },
  combatTargets() { return { selected: "", options: [] }; },
  actions: { get() { return []; }, run() { return Promise.resolve(); } },
  players() { return []; }
};
function boot(role, uid) {
  const el = w.document.createElement("div");
  el.id = "mapMount";
  w.document.body.appendChild(el);
  const map = w.SSDNSMap.create({
    el, role, uid,
    adapter: w.SSDNSMapFirebase.memory({ role }),
    host: cardHost,
    options: { scene, tokens: role === "dm" ? tokens : { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
  return { el, map };
}
function canvasOf(el) {
  return el.querySelector("canvas:not(.ssm-fx)");
}

const dm = boot("dm", "dm");
await flush(80);
const dmCanvas = canvasOf(dm.el);
dm.map.relayout();
await flush(30);
const painted = dmCanvas.width;
const paintedH = dmCanvas.height;
check("dm.ready", painted > 2 && paintedH > 2, painted + "x" + paintedH);

sizes.set(dmCanvas, { w: 0, h: 0 });
w.document.body.classList.add("map-fullscreen");
dm.map.relayout();
check("dm.zeroKeeps", dmCanvas.width === painted && dmCanvas.height === paintedH, dmCanvas.width + "x" + dmCanvas.height);

sizes.set(dmCanvas, { w: 900, h: 500 });
const before = w.__paint;
dm.map.relayout();
await flush(40);
check("dm.oneToggle", dmCanvas.width === 900 && dmCanvas.height === 500, dmCanvas.width + "x" + dmCanvas.height);
check("dm.painted", w.__paint > before, "paint " + w.__paint);

w.document.body.classList.remove("map-fullscreen");
sizes.set(dmCanvas, { w: 640, h: 400 });
const beforeExit = w.__paint;
dm.map.relayout();
await flush(20);
check("dm.exit", dmCanvas.width === 640 && dmCanvas.height === 400 && w.__paint > beforeExit, dmCanvas.width + "x" + dmCanvas.height);

const player = boot("player", "p_t");
await flush(80);
const pCanvas = canvasOf(player.el);
sizes.set(pCanvas, { w: 700, h: 420 });
player.map.relayout();
await flush(20);
const pBefore = pCanvas.width;
sizes.set(pCanvas, { w: 0, h: 0 });
w.document.body.classList.add("map-fullscreen");
player.map.relayout();
check("player.zeroKeeps", pCanvas.width === pBefore && pCanvas.width > 2, String(pCanvas.width));
sizes.set(pCanvas, { w: 880, h: 460 });
const pPaint = w.__paint;
player.map.relayout();
await flush(20);
check("player.oneToggle", pCanvas.width === 880 && pCanvas.height === 460 && w.__paint > pPaint, pCanvas.width + "x" + pCanvas.height);
w.document.body.classList.remove("map-fullscreen");
sizes.set(pCanvas, { w: 600, h: 360 });
player.map.relayout();
await flush(20);
check("player.exit", pCanvas.width === 600 && pCanvas.height === 360, pCanvas.width + "x" + pCanvas.height);

if (failures.length) {
  console.log("FAILED " + failures.length);
  process.exit(1);
}
console.log("passed");
process.exit(0);

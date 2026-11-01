/**
 * N59 — players see a closed-door glyph on a Door-tool segment they can see.
 * Secret / hidden doors draw nothing until the DM reveals them.
 * Opening a door still opens sight. Closed doors do not bleed light.
 *   node tools/test-n59-door-glyph.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
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
  w.__calls = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) {
        t[p] = v;
        if (p === "strokeStyle" || p === "fillStyle") w.__calls.push([p, v]);
        return true;
      }
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
    pointerId: 1, button: 0, buttons: 1, detail: 1, altKey: false, ctrlKey: false, shiftKey: false
  }, extra || {});
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, init);
  if (ev.pointerId == null) {
    try { Object.defineProperty(ev, "pointerId", { value: init.pointerId }); } catch (e) {}
  }
  if (extra && extra.button != null && ev.button !== extra.button) {
    try { Object.defineProperty(ev, "button", { value: extra.button }); } catch (e) {}
  }
  if (extra && extra.shiftKey != null && ev.shiftKey !== extra.shiftKey) {
    try { Object.defineProperty(ev, "shiftKey", { value: extra.shiftKey }); } catch (e) {}
  }
  el.dispatchEvent(ev);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }
function screenOf(gx, gy) { return { x: gx * 70 - 650, y: gy * 70 - 400 }; }
function sameSeg(g, x1, y1, x2, y2) {
  if (!g) return false;
  const a = Math.hypot(g.x1 - x1, g.y1 - y1) < 0.08 && Math.hypot(g.x2 - x2, g.y2 - y2) < 0.08;
  const b = Math.hypot(g.x1 - x2, g.y1 - y2) < 0.08 && Math.hypot(g.x2 - x1, g.y2 - y1) < 0.08;
  return a || b;
}
function glyph(list, x1, y1, x2, y2) {
  return (list || []).find((g) => sameSeg(g, x1, y1, x2, y2)) || null;
}

const src = read("map/ssdns-map.js");
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.195" && ver.dmcc === "0.2.208" && ver.sheetBuild === "sheet-playtest-v03195" && ver.dmccBuild === "dmcc-playtest-v02208", JSON.stringify(ver));
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.195"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.208"'));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("0.3.169") && !read("database.rules.json").includes("0.2.182") && !read("assets/data/rules.js").includes("doorGlyph"));
check("src.dmWalls", src.includes("sceneData().walls.length && role === 'dm' && state.showWalls"));
check("src.noBleed", src.includes("if (w.open || (w.window && !w.shut)) continue;") && src.includes("if (!w || w.open) return false"));
check("src.raycastIgnoresSecret", !/function raycastVisible[\s\S]{0,900}secret/.test(src) && !/function segmentBlocks[\s\S]{0,500}secret/.test(src));
check("src.glyph", src.includes("DOOR_GLYPH_SLAB") && src.includes("DOOR_GLYPH_ARCH") && src.includes("DOOR_GLYPH_GAP") && src.includes("function paintClosedDoorGlyphs"));
check("src.secretBtn", src.includes('data-act="secretDoorBtn"') && src.includes("Secret: OFF") && src.includes("Secret door — hidden from players"));

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
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
await flush(60);
const canvas = dmEl.querySelector("canvas");
check("ui.secret", act(dmEl, "secretDoorBtn") && act(dmEl, "secretDoorBtn").textContent === "Secret: OFF");

function publish(walls, extra) {
  dmAd.write("map/public/scenes/scn_dustyspur01", Object.assign({
    walls: walls,
    ambient: "bright",
    visionMode: "party",
    fogShapes: [],
    fogRevealed: false
  }, extra || {}), { seq: Date.now() });
}
function token(id, fields) {
  dmAd.write("map/public/tokens/" + id, Object.assign({
    id: id, name: id, label: id, kind: "player", size: 1, sceneId: "scn_dustyspur01",
    pos: { x: 6, y: 8 }, ownerUid: id
  }, fields || {}), { seq: Date.now() });
}
function nearWalls(extra) {
  return [
    { x1: 0, y1: 5, x2: 6, y2: 5 },
    Object.assign({ x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false }, extra || {}),
    { x1: 7, y1: 5, x2: 12, y2: 5 }
  ];
}

publish([
  { x1: 2, y1: 5, x2: 12, y2: 5 }
]);
act(dmEl, "secretDoorBtn").click();
check("ui.secretOn", act(dmEl, "secretDoorBtn").textContent === "Secret: ON" && act(dmEl, "secretDoorBtn").classList.contains("active") && act(dmEl, "doorBtn").classList.contains("active"));
const cutAt = screenOf(7.2, 5);
pointer(w, canvas, "pointerdown", cutAt.x, cutAt.y);
pointer(w, canvas, "pointerup", cutAt.x, cutAt.y, { buttons: 0 });
let walls = ((store.pub["map/public/scenes/scn_dustyspur01"] || {}).value || {}).walls || [];
let secretSeg = walls.find((wall) => wall.secret && wall.door && !wall.open);
check("dm.cutSecret", !!secretSeg && Math.abs(secretSeg.x2 - secretSeg.x1) <= 1.05, JSON.stringify(walls));
const revealAt = secretSeg ? screenOf((secretSeg.x1 + secretSeg.x2) / 2, (secretSeg.y1 + secretSeg.y2) / 2) : cutAt;
pointer(w, canvas, "pointerdown", revealAt.x, revealAt.y);
pointer(w, canvas, "pointerup", revealAt.x, revealAt.y, { buttons: 0 });
walls = ((store.pub["map/public/scenes/scn_dustyspur01"] || {}).value || {}).walls || [];
const revealed = walls.find((wall) => wall.door && !wall.secret && !wall.hidden);
check("dm.reveal", !!revealed && revealed.open !== true, JSON.stringify(walls));
check("dm.toastReveal", act(dmEl, "toast") && act(dmEl, "toast").textContent === "Door revealed");
act(dmEl, "secretDoorBtn").click();
check("ui.secretOff", act(dmEl, "secretDoorBtn").textContent === "Secret: OFF" && act(dmEl, "doorBtn").classList.contains("active"));
const openAt = revealed ? screenOf((revealed.x1 + revealed.x2) / 2, (revealed.y1 + revealed.y2) / 2) : revealAt;
pointer(w, canvas, "pointerdown", openAt.x, openAt.y);
pointer(w, canvas, "pointerup", openAt.x, openAt.y, { buttons: 0 });
walls = ((store.pub["map/public/scenes/scn_dustyspur01"] || {}).value || {}).walls || [];
const opened = walls.find((wall) => wall.door && wall.open);
check("dm.open", !!opened, JSON.stringify(walls));
check("dm.toastOpen", act(dmEl, "toast") && act(dmEl, "toast").textContent === "Door opened");

publish(nearWalls({ secret: true }));
if (!act(dmEl, "doorBtn").classList.contains("active")) act(dmEl, "doorBtn").click();
const shiftAt = screenOf(6.5, 5);
pointer(w, canvas, "pointerdown", shiftAt.x, shiftAt.y, { shiftKey: true });
pointer(w, canvas, "pointerup", shiftAt.x, shiftAt.y, { shiftKey: true, buttons: 0 });
walls = ((store.pub["map/public/scenes/scn_dustyspur01"] || {}).value || {}).walls || [];
const shiftDoor = walls.find((wall) => wall.door && wall.x1 === 6 && wall.x2 === 7);
check("dm.shiftReveal", !!shiftDoor && shiftDoor.secret === false && !shiftDoor.hidden && shiftDoor.open !== true, JSON.stringify(shiftDoor));

token("ada", { ownerUid: "ada", pos: { x: 6, y: 8 }, kind: "player" });
token("bo", { ownerUid: "bo", pos: { x: 6, y: 6 }, kind: "player" });
const playerAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const playerEl = w.document.createElement("div");
playerEl.id = "player";
w.document.body.appendChild(playerEl);
w.__calls = [];
const player = w.SSDNSMap.create({
  el: playerEl, role: "player", uid: "ada", adapter: playerAd, host: { on() {} },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);

function show(extra) {
  const list = player.doorGlyphs();
  return glyph(list, 6, 5, 7, 5) || Object.assign({ missing: true, all: list }, extra || {});
}

act(dmEl, "wallsVisBtn").click();
w.__calls = [];
publish(nearWalls(), { ambient: "bright", visionMode: "own" });
await flush(40);
let g = show();
check("see.bright", g.shown === true && g.secret === false && g.ny > 0, JSON.stringify(g));
check("paint.slab", w.__calls.some((c) => c[0] === "fillStyle" && c[1] === "#8d5a32"));
check("paint.arch", w.__calls.some((c) => c[0] === "strokeStyle" && c[1] === "#f3e6c8"));
check("paint.gap", w.__calls.some((c) => c[0] === "strokeStyle" && c[1] === "#140e0a"));
check("paint.notEditor", !w.__calls.some((c) => c[1] === "rgba(220,60,60,0.95)"));

publish(nearWalls(), { ambient: "dim", visionMode: "own" });
await flush(20);
g = show();
check("see.dim", g.shown === true && g.ny > 0, JSON.stringify(g));

publish(nearWalls(), { ambient: "dark", visionMode: "own" });
await flush(20);
g = show();
check("see.darkFar", g.shown === false, JSON.stringify(g));

publish(nearWalls(), { ambient: "dark", visionMode: "party" });
await flush(20);
g = show();
check("see.partyBubble", g.shown === true && g.ny > 0, JSON.stringify(g));

publish(nearWalls(), { ambient: "dark", visionMode: "own" });
token("ada", { ownerUid: "ada", pos: { x: 6, y: 3 }, kind: "player", darkvision: 0, torch: false, lights: [] });
await flush(20);
g = show();
check("see.nearFace", g.shown === true && g.ny < 0, JSON.stringify(g));

publish(nearWalls().concat([{ x1: 0, y1: 7, x2: 12, y2: 7 }]), { ambient: "bright", visionMode: "own" });
token("ada", { ownerUid: "ada", pos: { x: 6, y: 9 }, kind: "player" });
await flush(20);
g = show();
check("see.blocked", g.shown === false, JSON.stringify(g));

publish([
  { x1: 0, y1: 5, x2: 6, y2: 5 },
  { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: true },
  { x1: 7, y1: 5, x2: 12, y2: 5 },
  { x1: 6, y1: 2, x2: 7, y2: 2, door: true, open: false }
], { ambient: "bright", visionMode: "own" });
token("ada", { ownerUid: "ada", pos: { x: 6, y: 8 }, kind: "player" });
await flush(20);
const openList = player.doorGlyphs();
const openDoor = glyph(openList, 6, 5, 7, 5);
const farDoor = glyph(openList, 6, 2, 7, 2);
check("see.openNoGlyph", openDoor && openDoor.shown === false && openDoor.open === true, JSON.stringify(openDoor));
check("see.openLos", farDoor && farDoor.shown === true, JSON.stringify(farDoor));

publish([
  { x1: 0, y1: 5, x2: 6, y2: 5 },
  { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false },
  { x1: 7, y1: 5, x2: 12, y2: 5 },
  { x1: 6, y1: 2, x2: 7, y2: 2, door: true, open: false }
], { ambient: "bright", visionMode: "own" });
await flush(20);
const shutList = player.doorGlyphs();
check("see.closedBlocks", glyph(shutList, 6, 5, 7, 5).shown === true && glyph(shutList, 6, 2, 7, 2).shown === false, JSON.stringify(shutList));

publish(nearWalls({ secret: true }), { ambient: "bright", visionMode: "own" });
await flush(20);
g = show();
check("see.secret", g.shown === false && g.secret === true, JSON.stringify(g));
w.__calls = [];
player.requestDraw();
await flush(40);
check("paint.secretHidden", !w.__calls.some((c) => c[1] === "#8d5a32" || c[1] === "#f3e6c8"));

publish(nearWalls({ hidden: true }), { ambient: "bright", visionMode: "own" });
await flush(20);
g = show();
check("see.hiddenAlias", g.shown === false && g.secret === true, JSON.stringify(g));

publish(nearWalls(), {
  ambient: "bright",
  visionMode: "own",
  fogShapes: [{ id: "fg_hide", op: "hide", kind: "box", x: 4, y: 4, w: 5, h: 4 }]
});
token("ada", { ownerUid: "ada", pos: { x: 6, y: 8 }, kind: "player", torch: false, lights: [] });
await flush(20);
g = show();
check("see.hideShape", g.shown === false, JSON.stringify(g));

publish(nearWalls(), { ambient: "dark", visionMode: "own" });
token("ada", { ownerUid: "ada", pos: { x: 6, y: 0 }, kind: "player", torch: false, lights: [], darkvision: 0 });
token("lantern", {
  id: "lantern", ownerUid: "", kind: "enemy", name: "Lantern", label: "Lantern",
  pos: { x: 6, y: 7 }, torch: true, lights: [], sceneId: "scn_dustyspur01"
});
await flush(20);
g = show();
check("see.lightSide", g.shown === true && g.ny > 0, JSON.stringify(g));
token("lantern", {
  id: "lantern", ownerUid: "", kind: "enemy", name: "Lantern", label: "Lantern",
  pos: { x: 6, y: 7 }, torch: false, lights: [], hidden: true, sceneId: "scn_dustyspur01"
});
await flush(20);
g = show();
check("see.noBleed", g.shown === false, JSON.stringify(g));

dm.destroy();
player.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " FAILED\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nall n59 door-glyph checks passed");

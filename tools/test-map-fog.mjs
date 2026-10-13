/**
 * Fog tools: Reveal and Hide, discrete shapes, erase, and multi-step history.
 *   node tools/test-map-fog.mjs
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

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function flush(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        return function (...args) {
          w.__calls.push([p, args]);
          return bag;
        };
      },
      set(t, p, v) {
        t[p] = v;
        if (p === "strokeStyle" || p === "fillStyle") w.__calls.push([p, [v]]);
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
  if (extra && extra.detail != null && ev.detail !== extra.detail) {
    try { Object.defineProperty(ev, "detail", { value: extra.detail }); } catch (e) {}
  }
  el.dispatchEvent(ev);
  return ev;
}

function key(w, el, name) {
  const ev = new w.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
}

function act(el, name) {
  return el.querySelector('[data-act="' + name + '"]');
}

function sceneValue(store) {
  const row = store.pub["map/public/scenes/scn_dustyspur01"];
  return row && row.value;
}

function shapesOf(store) {
  const scene = sceneValue(store);
  return (scene && scene.fogShapes) || [];
}

function screenOf(gx, gy) {
  return { x: gx * 70 - 650, y: gy * 70 - 400 };
}

function texts(w) {
  return w.__calls.filter((c) => c[0] === "fillText").map((c) => String(c[1][0]));
}

const src = read("map/ssdns-map.js");
check("src.names", src.includes("Reveal: Box") && src.includes("Hide: Box") && src.includes("Delete selection"));
check("src.tokenButtons", src.includes('data-act="hideBtn">Hide') && src.includes('data-act="hideAllBtn">Hide All') && src.includes('data-act="revealAllBtn">Reveal All'));
check("src.shapes", src.includes("fogShapes") && src.includes("function commitFog"));
check("src.rulesUntouched", !read("database.rules.json").includes("fogShapes"));

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
delete scene.fogRects;
delete scene.fogPolys;
delete scene.fogShapes;
delete scene.walls;
const store = { pub: {}, dm: {} };
const bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });

const dmEl = w.document.createElement("div");
dmEl.id = "dm";
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd, host: { on() {}, players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
const canvas = dmEl.querySelector("canvas");
check("empty.mounted", !!canvas && act(dmEl, "revealFogBtn").textContent === "Reveal: Box" && act(dmEl, "hideFogBtn").textContent === "Hide: Box");
check("empty.tokenButtons", act(dmEl, "hideBtn").textContent === "Hide" && act(dmEl, "hideAllBtn").textContent === "Hide All" && act(dmEl, "revealAllBtn").textContent === "Reveal All");
check("empty.noTokens", !Object.keys(store.pub).some((k) => k.indexOf("map/public/tokens/") === 0));

act(dmEl, "revealShape").value = "square";
act(dmEl, "revealFogBtn").click();
check("square.armed", act(dmEl, "revealFogBtn").textContent === "Reveal: Square" && act(dmEl, "revealFogBtn").classList.contains("active"));
const squareAt = screenOf(8.5, 6.5);
clickAt(squareAt.x, squareAt.y, { detail: 1 });
const oneSq = shapesOf(store)[0];
check("square.click", shapesOf(store).length === 1 && oneSq && oneSq.kind === "square" && oneSq.op === "reveal" && oneSq.w === 1 && oneSq.h === 1 && oneSq.x === 8 && oneSq.y === 6, JSON.stringify(oneSq));
check("square.history", act(dmEl, "fogHistory").textContent.indexOf("Reveal square") >= 0);
const pubScene = sceneValue(store);
check("square.synced", !!(pubScene && pubScene.fogShapes && pubScene.fogShapes.length === 1 && (pubScene.fogRects || []).some((r) => r.w === 1 && r.h === 1 && r.x === 8 && r.y === 6)));
store.pub["map/public/tokens/tok_sq"] = {
  value: { id: "tok_sq", name: "Squared", label: "Squared", kind: "enemy", pos: { x: 8, y: 6 }, size: 1, sceneId: "scn_dustyspur01" },
  seq: 1
};
store.pub["map/public/tokens/tok_far"] = {
  value: { id: "tok_far", name: "Far", label: "Far", kind: "enemy", pos: { x: 1, y: 1 }, size: 1, sceneId: "scn_dustyspur01" },
  seq: 1
};
const sqAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const sqEl = w.document.createElement("div");
w.document.body.appendChild(sqEl);
w.__calls = [];
const sqPlayer = w.SSDNSMap.create({
  el: sqEl, role: "player", uid: "p_sq", adapter: sqAd, host: { on() {} },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
let sqSeen = texts(w);
check("square.player", sqSeen.includes("Squared") && !sqSeen.includes("Far"), sqSeen.filter((t) => t === "Squared" || t === "Far").join(","));
sqPlayer.destroy();
delete store.pub["map/public/tokens/tok_sq"];
delete store.pub["map/public/tokens/tok_far"];

const dragCells = [screenOf(10.2, 6.2), screenOf(11.2, 6.2), screenOf(12.2, 6.2)];
pointer(w, canvas, "pointerdown", dragCells[0].x, dragCells[0].y, { detail: 1 });
pointer(w, canvas, "pointermove", dragCells[1].x, dragCells[1].y, { detail: 1 });
pointer(w, canvas, "pointermove", dragCells[2].x, dragCells[2].y, { detail: 1 });
pointer(w, canvas, "pointerup", dragCells[2].x, dragCells[2].y, { detail: 1, buttons: 0 });
const dragged = shapesOf(store).filter((s) => s.kind === "square");
check("square.drag", dragged.length === 4 && dragged.filter((s) => s.y === 6 && s.x >= 10 && s.x <= 12).length === 3, JSON.stringify(dragged.map((s) => s.x + "," + s.y)));
check("square.oneStep", (act(dmEl, "fogHistory").textContent.match(/Reveal square/g) || []).length === 2);
act(dmEl, "fogUndoBtn").click();
check("square.undoDrag", shapesOf(store).length === 1 && shapesOf(store)[0].x === 8 && shapesOf(store)[0].y === 6);
act(dmEl, "eraseFogBtn").click();
clickAt(squareAt.x, squareAt.y, { detail: 1 });
check("square.erase", shapesOf(store).length === 0, JSON.stringify(shapesOf(store)));

w.document.body.classList.add("map-fullscreen");
act(dmEl, "hideShape").value = "square";
act(dmEl, "hideFogBtn").click();
check("square.hideArmed", act(dmEl, "hideFogBtn").textContent === "Hide: Square");
clickAt(screenOf(4.5, 4.5).x, screenOf(4.5, 4.5).y, { detail: 1 });
const hidSq = shapesOf(store).find((s) => s.op === "hide" && s.kind === "square");
check("square.fullscreen", !!(hidSq && hidSq.w === 1 && hidSq.h === 1), JSON.stringify(shapesOf(store)));
w.document.body.classList.remove("map-fullscreen");
act(dmEl, "fogUndoBtn").click();
check("square.cleared", shapesOf(store).length === 0);

act(dmEl, "revealShape").value = "poly";
act(dmEl, "revealFogBtn").click();
check("reveal.armed", act(dmEl, "revealFogBtn").textContent === "Reveal: Poly" && act(dmEl, "revealFogBtn").classList.contains("active"));

const corners = [[200, 200], [520, 200], [520, 480]];
function clickAt(x, y, extra) {
  pointer(w, canvas, "pointerdown", x, y, extra);
  pointer(w, canvas, "pointerup", x, y, Object.assign({ buttons: 0 }, extra || {}));
}
corners.forEach((p) => clickAt(p[0], p[1], { detail: 1 }));
check("poly.open", shapesOf(store).length === 0, JSON.stringify(shapesOf(store)));
check("poly.drew", w.__calls.some((c) => c[0] === "strokeStyle" && String(c[1][0]).indexOf("255,220,120") >= 0));
clickAt(200, 200, { detail: 1 });
const poly = shapesOf(store)[0];
check("poly.closed", shapesOf(store).length === 1 && poly && poly.op === "reveal" && poly.kind === "poly" && poly.points.length >= 3, JSON.stringify(poly));
check("poly.history", act(dmEl, "fogHistory").textContent.indexOf("Reveal poly") >= 0, act(dmEl, "fogHistory").textContent);
check("poly.synced", !!(store.dm["map/dm/scenes/scn_dustyspur01"] && store.dm["map/dm/scenes/scn_dustyspur01"].value.fogShapes.length === 1));

act(dmEl, "fogUndoBtn").click();
check("history.undo", shapesOf(store).length === 0, JSON.stringify(shapesOf(store)));
act(dmEl, "fogRedoBtn").click();
check("history.redo", shapesOf(store).length === 1 && shapesOf(store)[0].kind === "poly");

const pent = [screenOf(4, 4), screenOf(9, 4), screenOf(11, 8), screenOf(7, 12), screenOf(3, 8)];
pent.forEach((p) => clickAt(p.x, p.y, { detail: 1 }));
check("poly.notTriangle", shapesOf(store).length === 1, "a fourth and fifth corner must stay open");
key(w, canvas, "Enter");
const five = shapesOf(store).filter((s) => s.kind === "poly").pop();
check("poly.five", !!(five && five.points.length === 5 && five.op === "reveal"), JSON.stringify(five && five.points));
act(dmEl, "fogUndoBtn").click();
check("poly.fiveUndone", shapesOf(store).length === 1 && shapesOf(store)[0].points.length === 3);
const quad = [screenOf(20, 2), screenOf(24, 2), screenOf(24, 6), screenOf(20, 6)];
quad.forEach((p) => clickAt(p.x, p.y, { detail: 1 }));
check("poly.fourOpen", shapesOf(store).length === 1);
clickAt(quad[0].x, quad[0].y, { detail: 1 });
const four = shapesOf(store).filter((s) => s.kind === "poly").pop();
check("poly.four", !!(four && four.points.length === 4), JSON.stringify(four && four.points));
act(dmEl, "fogUndoBtn").click();
check("poly.backToTriangle", shapesOf(store).length === 1 && shapesOf(store)[0].points.length === 3);

act(dmEl, "hideShape").value = "box";
act(dmEl, "hideFogBtn").click();
check("hide.armed", act(dmEl, "hideFogBtn").textContent === "Hide: Box" && act(dmEl, "hideFogBtn").classList.contains("active"));
const pts = shapesOf(store)[0].points;
const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
const cell = screenOf(Math.floor(cx), Math.floor(cy));
const cell2 = screenOf(Math.floor(cx) + 1, Math.floor(cy) + 1);
pointer(w, canvas, "pointerdown", cell.x + 4, cell.y + 4, { detail: 1 });
pointer(w, canvas, "pointermove", cell2.x - 4, cell2.y - 4, { detail: 1 });
pointer(w, canvas, "pointerup", cell2.x - 4, cell2.y - 4, { detail: 1, buttons: 0 });
check("hide.box", shapesOf(store).some((s) => s.op === "hide" && s.kind === "box") && shapesOf(store).length === 2, JSON.stringify(shapesOf(store).map((s) => s.op + " " + s.kind)));

act(dmEl, "fogUndoBtn").click();
check("history.undoHide", shapesOf(store).length === 1 && shapesOf(store)[0].op === "reveal");
act(dmEl, "fogUndoBtn").click();
check("history.undoBoth", shapesOf(store).length === 0);
act(dmEl, "fogRedoBtn").click();
act(dmEl, "fogRedoBtn").click();
check("history.redoBoth", shapesOf(store).length === 2, JSON.stringify(shapesOf(store).map((s) => s.op)));

const hideShape = shapesOf(store).find((s) => s.op === "hide");
const mid = screenOf(hideShape.x + hideShape.w / 2, hideShape.y + hideShape.h / 2);
act(dmEl, "eraseFogBtn").click();
check("erase.armed", act(dmEl, "eraseFogBtn").classList.contains("active"));
clickAt(mid.x, mid.y, { detail: 1 });
check("erase.click", !shapesOf(store).some((s) => s.op === "hide") && shapesOf(store).length === 1, JSON.stringify(shapesOf(store).map((s) => s.op)));

act(dmEl, "fogUndoBtn").click();
check("erase.undo", shapesOf(store).length === 2);
const again = shapesOf(store);
const polyHit = again.find((s) => s.kind === "poly");
const hideHit = again.find((s) => s.op === "hide");
const polyPt = screenOf(16.5, 11.5);
const hidePt = screenOf(hideHit.x + 0.5, hideHit.y + 0.5);
clickAt(polyPt.x, polyPt.y, { shiftKey: true, detail: 1 });
clickAt(hidePt.x, hidePt.y, { shiftKey: true, detail: 1 });
check("erase.shiftKeeps", shapesOf(store).length === 2);
act(dmEl, "deleteFogBtn").click();
check("erase.selection", shapesOf(store).length === 0, JSON.stringify(shapesOf(store)));
act(dmEl, "fogUndoBtn").click();
check("erase.selectionUndo", shapesOf(store).length === 2, "one undo should restore both shapes");

store.pub["map/public/tokens/tok_in"] = {
  value: { id: "tok_in", name: "Inside", label: "Inside", kind: "enemy", pos: { x: Math.floor(cx), y: Math.floor(cy) }, size: 1, sceneId: "scn_dustyspur01" },
  seq: 1
};
store.pub["map/public/tokens/tok_out"] = {
  value: { id: "tok_out", name: "Outside", label: "Outside", kind: "enemy", pos: { x: 0, y: 0 }, size: 1, sceneId: "scn_dustyspur01" },
  seq: 1
};
const plAd = w.SSDNSMapFirebase.memory({ role: "player", store, bus });
const plEl = w.document.createElement("div");
plEl.id = "player";
w.document.body.appendChild(plEl);
w.__calls = [];
const player = w.SSDNSMap.create({
  el: plEl, role: "player", uid: "p_watch", adapter: plAd, host: { on() {} },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
let seen = texts(w);
check("player.hiddenByHide", !seen.includes("Inside") && !seen.includes("Outside"), seen.filter((t) => t === "Inside" || t === "Outside").join(","));
w.__calls = [];
act(dmEl, "fogUndoBtn").click();
await flush(40);
seen = texts(w);
check("player.inside", seen.includes("Inside"), seen.filter((t) => t === "Inside" || t === "Outside").join(",") + " shapes " + JSON.stringify(shapesOf(store).map((s) => s.op)));
check("player.outsideHidden", !seen.includes("Outside"), seen.filter((t) => t === "Inside" || t === "Outside").join(","));

act(dmEl, "revealShape").value = "brush";
act(dmEl, "revealFogBtn").click();
pointer(w, canvas, "pointerdown", 240, 240, { detail: 1 });
pointer(w, canvas, "pointermove", 320, 240, { detail: 1 });
pointer(w, canvas, "pointerup", 320, 240, { detail: 1, buttons: 0 });
const brush = shapesOf(store).filter((s) => s.kind === "brush");
check("brush.stroke", brush.length === 1 && brush[0].op === "reveal" && brush[0].cells.length >= 2, JSON.stringify(brush));

w.document.body.classList.add("map-fullscreen");
act(dmEl, "hideShape").value = "poly";
act(dmEl, "hideFogBtn").click();
[[180, 360], [420, 360], [420, 520]].forEach((p) => clickAt(p[0], p[1], { detail: 1 }));
key(w, canvas, "Enter");
check("hide.fullscreen", shapesOf(store).some((s) => s.op === "hide" && s.kind === "poly"), JSON.stringify(shapesOf(store).map((s) => s.op + " " + s.kind)));
w.document.body.classList.remove("map-fullscreen");

check("names.stay", act(dmEl, "hideBtn").textContent === "Hide" && act(dmEl, "hideAllBtn").textContent === "Hide All" && act(dmEl, "revealAllBtn").textContent === "Reveal All");

dm.destroy();
player.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nfog tools ok");

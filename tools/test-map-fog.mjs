/**
 * Fog polygon regression. Live 0.3.21 closed only on pointerdown detail === 2
 * and never painted the vertices, so the tool looked dead.
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

function polysOf(store) {
  const scene = sceneValue(store);
  return (scene && scene.fogPolys) || [];
}

function texts(w) {
  return w.__calls.filter((c) => c[0] === "fillText").map((c) => String(c[1][0]));
}

const src = read("map/ssdns-map.js");
check("src.noDetailOnly", !/polyPoints\.length >= 3 && e\.detail === 2/.test(src), "close still requires a double-click count");
check("src.paints", src.includes("rgba(255,220,120,0.95)") && src.includes("function paintFogPolys"));
check("src.syncField", src.includes("if (!Array.isArray(scene.fogPolys)) scene.fogPolys = []"));
check("src.rulesUntouched", !read("database.rules.json").includes("fogPolys"));

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
delete scene.fogRects;
delete scene.fogPolys;
delete scene.walls;
const store = { pub: {}, dm: {} };
const bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const empty = { tokens: {} };

const dmEl = w.document.createElement("div");
dmEl.id = "dm";
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd, host: { on() {}, players() { return []; } },
  options: { scene, tokens: empty, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
const canvas = dmEl.querySelector("canvas");
check("empty.mounted", !!canvas && act(dmEl, "fogRectBtn").textContent === "Fog", "map did not boot");

act(dmEl, "addTokenBtn").click();
await flush(10);
const tokenPath = Object.keys(store.dm).find((k) => k.indexOf("map/dm/tokens/") === 0);
check("empty.token", !!tokenPath, Object.keys(store.dm).join(","));

act(dmEl, "fogRectBtn").click();
check("poly.armed", act(dmEl, "fogRectBtn").textContent === "Fog: Poly" && act(dmEl, "fogRectBtn").classList.contains("active"));

const corners = [[200, 200], [520, 200], [520, 480]];
corners.forEach((p) => {
  pointer(w, canvas, "pointerdown", p[0], p[1], { detail: 1 });
  pointer(w, canvas, "pointerup", p[0], p[1], { detail: 1, buttons: 0 });
});
check("poly.open", polysOf(store).length === 0, JSON.stringify(polysOf(store)));
check("poly.drew", w.__calls.some((c) => c[0] === "strokeStyle" && String(c[1][0]).indexOf("255,220,120") >= 0));

key(w, canvas, "Backspace");
check("poly.backspaceKeepsToken", !!store.dm[tokenPath], "backspace removed the selected token");
pointer(w, canvas, "pointerdown", 200, 200, { detail: 1 });
pointer(w, canvas, "pointerup", 200, 200, { detail: 1, buttons: 0 });
check("poly.backspaceNoClose", polysOf(store).length === 0, "two points closed");
pointer(w, canvas, "pointerdown", 520, 480, { detail: 1 });
pointer(w, canvas, "pointerup", 520, 480, { detail: 1, buttons: 0 });

pointer(w, canvas, "pointerdown", 200, 200, { detail: 1 });
pointer(w, canvas, "pointerup", 200, 200, { detail: 1, buttons: 0 });
const closed = polysOf(store);
const pts = closed[0] && closed[0].points;
check("poly.closed", closed.length === 1 && pts && pts.length >= 3, JSON.stringify(closed));
check("poly.notBoundingRect", !(closed[0] && closed[0].w != null && closed[0].h != null), JSON.stringify(closed[0]));
check("poly.buttonStays", act(dmEl, "fogRectBtn").textContent === "Fog: Poly");
check("poly.publicAndDm", !!(store.dm["map/dm/scenes/scn_dustyspur01"] && store.dm["map/dm/scenes/scn_dustyspur01"].value.fogPolys && store.dm["map/dm/scenes/scn_dustyspur01"].value.fogPolys.length === 1));
check("poly.distinct", pts && (pts[0].x !== pts[1].x || pts[0].y !== pts[1].y) && (pts[1].x !== pts[2].x || pts[1].y !== pts[2].y), JSON.stringify(pts));

act(dmEl, "undoFogBtn").click();
check("poly.undo", polysOf(store).length === 0, JSON.stringify(polysOf(store)));

corners.forEach((p, i) => {
  const detail = i === corners.length - 1 ? 1 : 1;
  pointer(w, canvas, "pointerdown", p[0], p[1], { detail });
  pointer(w, canvas, "pointerup", p[0], p[1], { detail, buttons: 0 });
});
pointer(w, canvas, "pointerdown", 360, 360, { detail: 2 });
pointer(w, canvas, "pointerup", 360, 360, { detail: 2, buttons: 0 });
check("poly.doubleClick", polysOf(store).length === 1 && polysOf(store)[0].points.length >= 3, JSON.stringify(polysOf(store)));
act(dmEl, "undoFogBtn").click();

corners.forEach((p) => {
  pointer(w, canvas, "pointerdown", p[0], p[1], { detail: 1 });
  pointer(w, canvas, "pointerup", p[0], p[1], { detail: 1, buttons: 0 });
});
key(w, canvas, "Enter");
check("poly.enter", polysOf(store).length === 1, JSON.stringify(polysOf(store)));
act(dmEl, "undoFogBtn").click();

corners.forEach((p) => {
  pointer(w, canvas, "pointerdown", p[0], p[1], { detail: 1 });
  pointer(w, canvas, "pointerup", p[0], p[1], { detail: 1, buttons: 0 });
});
pointer(w, canvas, "pointerdown", 300, 300, { button: 2, buttons: 2, detail: 1 });
pointer(w, canvas, "pointerup", 300, 300, { button: 2, buttons: 0, detail: 1 });
check("poly.rightClick", polysOf(store).length === 1, JSON.stringify(polysOf(store)));

const kept = JSON.stringify(polysOf(store));
act(dmEl, "fogBtn").click();
check("fog.reveal", sceneValue(store).fogRevealed === true && JSON.stringify(polysOf(store)) === kept, JSON.stringify(sceneValue(store) && sceneValue(store).fogRevealed));
act(dmEl, "fogBtn").click();
check("fog.hide", sceneValue(store).fogRevealed === false && JSON.stringify(polysOf(store)) === kept);

const polyPts = polysOf(store)[0].points;
const cx = polyPts.reduce((s, p) => s + p.x, 0) / polyPts.length;
const cy = polyPts.reduce((s, p) => s + p.y, 0) / polyPts.length;
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
const seen = texts(w);
check("player.inside", seen.includes("Inside"), seen.filter((t) => t === "Inside" || t === "Outside").join(","));
check("player.outsideHidden", !seen.includes("Outside"), seen.filter((t) => t === "Inside" || t === "Outside").join(","));
check("player.clip", w.__calls.some((c) => c[0] === "clip"));

w.__calls = [];
act(dmEl, "fogBtn").click();
await flush(30);
const revealed = texts(w);
check("player.revealBoth", revealed.includes("Inside") && revealed.includes("Outside"), revealed.filter((t) => t === "Inside" || t === "Outside").join(","));
act(dmEl, "fogBtn").click();
await flush(20);

w.document.body.classList.add("map-fullscreen");
pointer(w, canvas, "pointerdown", 180, 360, { detail: 1 });
pointer(w, canvas, "pointerup", 180, 360, { detail: 1, buttons: 0 });
pointer(w, canvas, "pointerdown", 420, 360, { detail: 1 });
pointer(w, canvas, "pointerup", 420, 360, { detail: 1, buttons: 0 });
pointer(w, canvas, "pointerdown", 420, 520, { detail: 1 });
pointer(w, canvas, "pointerup", 420, 520, { detail: 1, buttons: 0 });
key(w, canvas, "Enter");
check("poly.fullscreen", polysOf(store).length === 2, JSON.stringify(polysOf(store).map((p) => p.points)));
w.document.body.classList.remove("map-fullscreen");

act(dmEl, "hideAllBtn").click();
check("fog.hideAll", polysOf(store).length === 0 && sceneValue(store).fogRevealed === false && (sceneValue(store).fogRects || []).length === 0);

act(dmEl, "fogRectBtn").click();
check("rect.armed", act(dmEl, "fogRectBtn").textContent === "Fog: Rect", act(dmEl, "fogRectBtn").textContent);
pointer(w, canvas, "pointerdown", 220, 220, { detail: 1 });
pointer(w, canvas, "pointermove", 400, 400, { detail: 1 });
pointer(w, canvas, "pointerup", 400, 400, { detail: 1, buttons: 0 });
const rects = (sceneValue(store) && sceneValue(store).fogRects) || [];
check("rect.drew", rects.length === 1 && rects[0].w >= 1 && rects[0].h >= 1, JSON.stringify(rects));

dm.setTool("brush");
const beforeBrush = rects.length;
pointer(w, canvas, "pointerdown", 300, 300, { detail: 1 });
pointer(w, canvas, "pointerup", 300, 300, { detail: 1, buttons: 0 });
const brushed = (sceneValue(store) && sceneValue(store).fogRects) || [];
check("brush.cell", brushed.length === beforeBrush + 1 && brushed[brushed.length - 1].w === 1 && brushed[brushed.length - 1].h === 1, JSON.stringify(brushed));

act(dmEl, "pingBtn").click();
pointer(w, canvas, "pointerdown", 300, 280, { detail: 1 });
pointer(w, canvas, "pointerup", 300, 280, { detail: 1, buttons: 0 });
check("ping.sent", !!(store.pub["map/public/events/ping"] && store.pub["map/public/events/ping"].value), JSON.stringify(store.pub["map/public/events/ping"]));

w.__calls = [];
act(dmEl, "rulerBtn").click();
pointer(w, canvas, "pointerdown", 240, 240, { detail: 1 });
pointer(w, canvas, "pointermove", 400, 240, { detail: 1 });
pointer(w, canvas, "pointerup", 400, 240, { detail: 1, buttons: 0 });
check("ruler.drew", texts(w).some((t) => t.indexOf("sq") >= 0), texts(w).join(" | "));

const wallsBefore = ((sceneValue(store) && sceneValue(store).walls) || []).length;
act(dmEl, "wallBtn").click();
pointer(w, canvas, "pointerdown", 200, 300, { detail: 1 });
pointer(w, canvas, "pointerup", 460, 300, { detail: 1, buttons: 0 });
const wallsAfter = ((sceneValue(store) && sceneValue(store).walls) || []).length;
check("wall.drew", wallsAfter === wallsBefore + 1, wallsBefore + " -> " + wallsAfter);

act(dmEl, "roomBtn").click();
pointer(w, canvas, "pointerdown", 200, 320, { detail: 1 });
pointer(w, canvas, "pointerup", 480, 500, { detail: 1, buttons: 0 });
const wallsRoom = ((sceneValue(store) && sceneValue(store).walls) || []).length;
check("room.drew", wallsRoom > wallsAfter, wallsAfter + " -> " + wallsRoom);

dm.destroy();
player.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nfog poly ok");

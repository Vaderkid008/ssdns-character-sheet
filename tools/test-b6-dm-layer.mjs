/**
 * B6: DM map draws, hits, and occupies only the viewed floor.
 * Nudge moves a token to the nearest open square. Players stay filtered.
 *   node tools/test-b6-dm-layer.mjs
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
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }
function idsOf(map) { return map.tokenBoxes().map((b) => b.id).sort(); }
function box(map, id) { return map.tokenBoxes().find((b) => b.id === id); }

const mapSrc = read("map/ssdns-map.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");
const version = JSON.parse(read("version.json"));
const drawLoop = mapSrc.slice(mapSrc.indexOf("// tokens — this floor only"), mapSrc.indexOf("const size = t.size || 1;"));
const hitFn = mapSrc.slice(mapSrc.indexOf("function hitTest"), mapSrc.indexOf("function swallowMiddle"));
const cellFn = mapSrc.slice(mapSrc.indexOf("function cellTaken"), mapSrc.indexOf("function tokSquares"));
const areaFn = mapSrc.slice(mapSrc.indexOf("function areaTaken"), mapSrc.indexOf("function nextFreeSpot"));
const marque = mapSrc.slice(mapSrc.indexOf("state.selectedIds = state.tokens.filter"), mapSrc.indexOf("}).map(t => t.id);"));
const fxFn = mapSrc.slice(mapSrc.indexOf("function fxSceneOk"), mapSrc.indexOf("function playerSees"));

check("src.versions", version.sheet === "0.3.152" && version.dmcc === "0.2.165" && version.sheetBuild === "sheet-playtest-v03152" && version.dmccBuild === "dmcc-playtest-v02165");
check("src.rulesUntouched", !rulesJs.includes("0.3.152") && !rulesJs.includes("onViewedScene") && !rules.includes("onViewedScene") && !rules.includes("nudgeOpen"));
check("src.helper", /function onViewedScene\(t\) \{\n  return !!t && sceneKey\(t\) === activeSceneId\(\);\n\}/.test(mapSrc));
check("src.sceneKey", mapSrc.includes("return (t && t.sceneId) || 'scn_dustyspur01';"));
check("src.draw", drawLoop.includes("if (!onViewedScene(t)) continue;") && drawLoop.indexOf("if (!onViewedScene(t)) continue;") < drawLoop.indexOf("if (role === 'player')"));
check("src.playerSightStays", mapSrc.includes("if (role === 'player')") && mapSrc.includes("if (!tokenSeenBy(t, sight)) continue;"));
check("src.hit", hitFn.includes("if (!onViewedScene(t)) continue;"));
check("src.cell", cellFn.includes("if (!onViewedScene(t)) return false;"));
check("src.area", areaFn.includes("blockingTokens(ignore).filter(onViewedScene)"));
check("src.spot", mapSrc.includes("blockingTokens().filter(onViewedScene)"));
check("src.marquee", marque.includes("if (!t || !t.pos || !onViewedScene(t)) return false;"));
check("src.fx", fxFn.includes("return onViewedScene(t);"));
check("src.nudge", mapSrc.includes(">Nudge to open square</button>") && mapSrc.includes("function nudgeToOpen") && mapSrc.includes("spotNear(from, token.size || 1"));
check("src.floorNote", mapSrc.includes("setAttribute('data-act', 'floorNote')") && mapSrc.includes("note.textContent = 'on ' + floorName(away.sceneId);"));
check("src.unstickKept", mapSrc.includes("t >= 1e-6") && mapSrc.includes("Ignore a hit at the start"));
check("src.noPhase5", !mapSrc.includes("Set default layer") && !mapSrc.includes("Set current layer live") && !mapSrc.includes("Follow turn") && !mapSrc.includes("Show other floors"));
check("src.stamp", mapSrc.includes("function stampScene") && mapSrc.includes("function adoptSharedTokens"));

function memoryAdapter() {
  const subs = [];
  const store = {};
  function deliver(p, value) {
    subs.forEach((s) => {
      if (p === s.path || p.startsWith(s.path + "/")) s.cb(value, { path: p, seq: Date.now(), by: "dm" });
    });
  }
  return {
    store,
    write(p, value) {
      store[p] = JSON.parse(JSON.stringify(value));
      deliver(p, store[p]);
      return Promise.resolve();
    },
    remove(p) {
      delete store[p];
      deliver(p, null);
    },
    subscribe(p, cb) {
      const entry = { path: p, cb };
      subs.push(entry);
      Object.keys(store).forEach((k) => {
        if (k === p || k.startsWith(p + "/")) cb(store[k], { path: k, seq: 1, by: "dm" });
      });
      if (p === "map/public/tokens") cb(null, { path: p, ready: true });
      return () => {
        const i = subs.indexOf(entry);
        if (i >= 0) subs.splice(i, 1);
      };
    }
  };
}

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
    const texts = [];
    this.__texts = texts;
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p === "fillText") return (text) => { texts.push(String(text)); };
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  let rafN = 0;
  w.requestAnimationFrame = (fn) => { rafN += 1; const id = rafN; queueMicrotask(() => fn(id)); return id; };
  w.cancelAnimationFrame = () => {};
  return w;
}

function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function pointer(w, el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  el.dispatchEvent(ev);
}
function clickToken(w, el, map, id) {
  const b = box(map, id);
  if (!b) return false;
  const canvas = el.querySelector("canvas");
  const x = (b.screen.x1 + b.screen.x2) / 2;
  const y = (b.screen.y1 + b.screen.y2) / 2;
  pointer(w, canvas, "pointerdown", x, y);
  pointer(w, canvas, "pointerup", x, y);
  return true;
}
function texts(el) { return (el.querySelector("canvas").__texts || []).join(" "); }

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = {
  tokens: {
    sal: { id: "sal", name: "Saloon", label: "Sal", kind: "enemy", pos: { x: 6, y: 6 }, size: 1, sceneId: "scn_dustyspur01", color: "#8b3a3a" },
    up: { id: "up", name: "Upstairs", label: "Up", kind: "enemy", pos: { x: 4, y: 4 }, size: 1, sceneId: "scn_upstairs", color: "#2a9d8f" },
    bare: { id: "bare", name: "Bare", label: "Bare", kind: "npc", pos: { x: 8, y: 8 }, size: 1, color: "#c9a227" },
    hid: { id: "hid", name: "Hidden", label: "Hid", kind: "enemy", pos: { x: 2, y: 2 }, size: 1, sceneId: "scn_dustyspur01", hidden: true },
    big: { id: "big", name: "Big", label: "Big", kind: "enemy", pos: { x: 12, y: 12 }, size: 2, sceneId: "scn_upstairs", color: "#888" },
    grounds: { id: "grounds", name: "Grounds", label: "Grd", kind: "enemy", pos: { x: 1, y: 1 }, size: 1, sceneId: "scn_ellen_grounds" },
    cellar: { id: "cellar", name: "Cellar", label: "Cel", kind: "enemy", pos: { x: 1, y: 1 }, size: 1, sceneId: "scn_ellen_cellar" },
    floor2: { id: "floor2", name: "Second", label: "2F", kind: "enemy", pos: { x: 1, y: 1 }, size: 1, sceneId: "scn_ellen_2f" },
    floor3: { id: "floor3", name: "Third", label: "3F", kind: "enemy", pos: { x: 1, y: 1 }, size: 1, sceneId: "scn_ellen_3f" }
  }
};

const w = makeWindow();
addScript(w, "map/token-size.js");
addScript(w, "map/map-packs.js");
addScript(w, "assets/js/turn-rules.js");
addScript(w, "map/ssdns-map.js");
const adapter = memoryAdapter();
const dmEl = w.document.createElement("div");
dmEl.id = "dmMap";
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl,
  role: "dm",
  uid: "dm",
  adapter,
  host: {},
  options: { scene, tokens, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);

check("boot.saloon", dm.viewedScene() === "scn_dustyspur01");
check("boot.visible", JSON.stringify(idsOf(dm)) === JSON.stringify(["bare", "hid", "sal"]), idsOf(dm).join(","));
check("boot.bareStamped", box(dm, "bare") && box(dm, "bare").sceneId === "scn_dustyspur01", JSON.stringify(box(dm, "bare")));
check("boot.upHidden", !box(dm, "up") && !texts(dmEl).includes("Up"));
check("boot.salDrawn", texts(dmEl).includes("Sal") && texts(dmEl).includes("Bare"));
check("occ.upDoesNotBlock", dm.squareTaken(4, 4) === false && dm.squareTaken(12, 12) === false && dm.squareTaken(13, 13) === false);
check("occ.saloonTaken", dm.squareTaken(6, 6) === true && dm.squareTaken(8, 8) === true);
check("hit.saloon", dm.hitToken(6.5 * 70, 6.5 * 70) === "sal" && dm.hitToken(4.5 * 70, 4.5 * 70) === "");
check("hit.hiddenDm", dm.hitToken(2.5 * 70, 2.5 * 70) === "hid");

check("swap.up", dm.maps().swap("scn_upstairs") === true && dm.viewedScene() === "scn_upstairs");
await flush(20);
check("swap.visible", JSON.stringify(idsOf(dm)) === JSON.stringify(["big", "up"]), idsOf(dm).join(","));
dmEl.querySelector("canvas").__texts.length = 0;
dm.requestDraw();
await flush(20);
check("swap.drawn", texts(dmEl).includes("Up") && texts(dmEl).includes("Big") && !texts(dmEl).includes("Sal") && !texts(dmEl).includes("Bare"), texts(dmEl));
check("occ.upstairs", dm.squareTaken(4, 4) === true && dm.squareTaken(12, 12) === true && dm.squareTaken(13, 13) === true && dm.squareTaken(6, 6) === false);
check("hit.upstairs", dm.hitToken(4.5 * 70, 4.5 * 70) === "up" && dm.hitToken(6.5 * 70, 6.5 * 70) === "");

adapter.write("map/public/tokens/late", { id: "late", name: "Late", label: "Late", kind: "npc", pos: { x: 10, y: 10 }, size: 1 });
await flush(20);
const late = box(dm, "late");
check("untagged.landsHere", !!(late && late.sceneId === "scn_upstairs"), JSON.stringify(late));
check("swap.back", dm.maps().swap("scn_dustyspur01") === true);
await flush(10);
check("untagged.notOnSaloon", !box(dm, "late") && !box(dm, "up"));

const ellen = [
  ["scn_ellen_grounds", "grounds"],
  ["scn_ellen_cellar", "cellar"],
  ["scn_ellen_2f", "floor2"],
  ["scn_ellen_3f", "floor3"]
];
ellen.forEach(([sid, id]) => {
  const ok = dm.maps().swap(sid) === true;
  const seen = idsOf(dm);
  check("ellen." + id, ok && seen.length === 1 && seen[0] === id, seen.join(","));
});
check("ellen.back", dm.maps().swap("scn_dustyspur01") === true);
await flush(10);

dm.syncCombatants({ started: true, round: 1, turn: 0, order: [{ id: "up", name: "Upstairs", kind: "enemy" }] });
await flush(10);
const note = act(dmEl, "floorNote");
check("note.otherFloor", !!(note && note.textContent === "on Dusty Spur · Upstairs"), note && note.textContent);
check("note.dmOnlyMarkup", dmEl.querySelectorAll("[data-act='floorNote']").length === 1);
dm.maps().swap("scn_upstairs");
await flush(10);
check("note.sameFloor", !act(dmEl, "floorNote"));
dm.maps().swap("scn_dustyspur01");
await flush(10);

check("click.sal", clickToken(w, dmEl, dm, "sal"));
await flush(10);
const nudge = act(dmEl, "nudgeOpen");
check("nudge.button", !!(nudge && nudge.textContent === "Nudge to open square"));
const before = box(dm, "sal");
nudge.click();
await flush(20);
const after = box(dm, "sal");
check("nudge.moved", !!(before && after && (after.x !== before.x || after.y !== before.y)), JSON.stringify(after && { x: after.x, y: after.y }));
check("nudge.near", !!(after && Math.max(Math.abs(after.x - 6), Math.abs(after.y - 6)) <= 3), JSON.stringify(after && { x: after.x, y: after.y }));
check("nudge.oldFree", dm.squareTaken(6, 6) === false);
check("nudge.upIgnored", dm.squareTaken(4, 4) === (after.x === 4 && after.y === 4), JSON.stringify(after && { x: after.x, y: after.y }));

check("click.bare", clickToken(w, dmEl, dm, "bare"));
await flush(10);
check("setFloor.swap", dm.maps().swap("scn_upstairs") === true);
act(dmEl, "setFloorBtn").click();
await flush(20);
const moved = box(dm, "bare");
check("setFloor.appears", !!(moved && moved.sceneId === "scn_upstairs"), JSON.stringify(moved));

const playerEl = w.document.createElement("div");
playerEl.id = "plMap";
w.document.body.appendChild(playerEl);
const player = w.SSDNSMap.create({
  el: playerEl,
  role: "player",
  uid: "p_jolene",
  adapter,
  host: {},
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
player.syncCombatants({ started: true, round: 1, turn: 0, order: [{ id: "up", name: "Upstairs", kind: "enemy" }] });
await flush(10);
const playerIds = idsOf(player);
check("player.filtered", playerIds.includes("sal") && !playerIds.includes("up") && !playerIds.includes("hid") && !playerIds.includes("big"), playerIds.join(","));
check("player.noUpDraw", !texts(playerEl).includes("Up") && !texts(playerEl).includes("Hid") && !texts(playerEl).includes("Big"));
check("player.noNudge", !act(playerEl, "nudgeOpen"));
check("player.noNote", !act(playerEl, "floorNote"));
check("player.noUpBlock", player.squareTaken(4, 4) === false && player.hitToken(4.5 * 70, 4.5 * 70) === "");
check("player.seesSal", player.hitToken(6.5 * 70, 6.5 * 70) === "sal" || playerIds.includes("sal"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

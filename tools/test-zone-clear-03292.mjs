/**
 * Player maps drop spell zones when the DM removes them.
 * An empty list must survive the way Firebase drops empty arrays.
 *   node tools/test-zone-clear-03292.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), "package.json"));
const { JSDOM } = require("jsdom");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.300" && ver.dmcc === "0.2.313");

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const frames = [];
  w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  w.__pump = () => {
    let n = 0;
    while (frames.length && n < 8) {
      const batch = frames.splice(0);
      n += 1;
      batch.forEach((fn) => { try { fn(n); } catch (e) {} });
    }
  };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  for (const Ctor of [w.HTMLElement, w.HTMLCanvasElement]) {
    Object.defineProperty(Ctor.prototype, "clientWidth", { configurable: true, get() { return 1000; } });
    Object.defineProperty(Ctor.prototype, "clientHeight", { configurable: true, get() { return 700; } });
  }
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({ setTransform() {}, measureText: () => ({ width: 8 }) }, { get(t, p) { if (p in t) return t[p]; return () => ({}); } });
  };
  return w;
}
function boot() {
  const w = makeWindow();
  ["assets/js/spell-zones.js", "map/ssdns-map-move.js", "map/ssdns-map-firebase.js", "map/zone-art.js", "map/ssdns-map.js"].forEach((rel) => {
    const s = w.document.createElement("script");
    s.textContent = read(rel);
    w.document.body.appendChild(s);
  });
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  scene.walls = [];
  const store = { pub: {}, dm: {} };
  const bus = [];
  const dmEl = w.document.createElement("div");
  const pcEl = w.document.createElement("div");
  w.document.body.appendChild(dmEl);
  w.document.body.appendChild(pcEl);
  const opts = { assetBase: "", room: { table: { initiative: { started: false, order: [], turn: 0 } } } };
  const dm = w.SSDNSMap.create({
    el: dmEl, role: "dm", uid: "dm",
    adapter: w.SSDNSMapFirebase.memory({ role: "dm", store, bus }),
    options: Object.assign({ scene }, opts)
  });
  const pc = w.SSDNSMap.create({
    el: pcEl, role: "player", uid: "p_jolene",
    adapter: w.SSDNSMapFirebase.memory({ role: "player", store, bus }),
    options: Object.assign({ scene: JSON.parse(JSON.stringify(scene)) }, opts)
  });
  return { w, dm, pc, dmEl, store, bus, scene };
}
function zone(id, extra) {
  return Object.assign({
    id, key: "fog cloud", spell: "Fog Cloud", shape: "sphere", radius: 20,
    origin: { x: 6, y: 6 }, rounds: 10, roundsLeft: 10, conc: true,
    casterId: "p_jolene", casterUid: "p_jolene"
  }, extra || {});
}
function ids(api) { return (api.spellZones() || []).map((z) => z.id).sort(); }
const sid = "scn_dustyspur01";

const pair = boot();
pair.dm.setSpellZones([zone("fog1"), zone("web1", { key: "web", spell: "Web" })], {});
await new Promise((r) => setTimeout(r, 30));
pair.w.__pump();
check("place.both", ids(pair.dm).join(",") === "fog1,web1" && ids(pair.pc).join(",") === "fog1,web1", ids(pair.pc).join(","));

pair.dm.setSpellZones([zone("web1", { key: "web", spell: "Web" })], {});
await new Promise((r) => setTimeout(r, 30));
pair.w.__pump();
check("delete.one", ids(pair.dm).join(",") === "web1" && ids(pair.pc).join(",") === "web1", ids(pair.pc).join(","));

pair.w.confirm = () => true;
pair.dmEl.querySelector('[data-act="clearAllZonesBtn"]').click();
await new Promise((r) => setTimeout(r, 30));
pair.w.__pump();
check("clear.all", ids(pair.dm).length === 0 && ids(pair.pc).length === 0, ids(pair.pc).join(","));
check("clear.flag", pair.store.pub["map/public/scenes/" + sid].value.zoneCleared === true);

pair.dm.setSpellZones([zone("fog2")], {});
await new Promise((r) => setTimeout(r, 20));
pair.w.__pump();
const sceneRow = JSON.parse(JSON.stringify(pair.store.pub["map/public/scenes/" + sid].value));
delete sceneRow.spellZones;
sceneRow.zoneCleared = true;
sceneRow.zoneSeq = Date.now() + 5;
pair.store.pub["map/public/scenes/" + sid] = { value: sceneRow, seq: sceneRow.zoneSeq, by: "dm" };
const echo = pair.w.SSDNSMapFirebase.memory({ role: "dm", store: pair.store, bus: pair.bus });
echo.write("map/public/scenes/" + sid, sceneRow, { seq: sceneRow.zoneSeq, by: "dm" });
await new Promise((r) => setTimeout(r, 20));
check("firebase.empty", ids(pair.pc).length === 0, ids(pair.pc).join(","));

pair.dm.setSpellZones([zone("fog3")], {});
await new Promise((r) => setTimeout(r, 20));
pair.w.__pump();
const stripped = {
  id: "zone_stripped", ts: new Date().toISOString(), from: "dm", fromName: "DM",
  text: "zone", kind: "sfx", event: "zone", cleared: true, full: true, zoneSeq: Date.now() + 20
};
echo.write("tableFeed/zone_stripped", stripped, { by: "dm" });
await new Promise((r) => setTimeout(r, 20));
check("firebase.feed", ids(pair.pc).length === 0, ids(pair.pc).join(","));

pair.dm.setSpellZones([zone("conc1")], {});
await new Promise((r) => setTimeout(r, 20));
pair.w.__pump();
check("conc.seen", ids(pair.pc).indexOf("conc1") >= 0);
pair.dm.setSpellZones([], {});
await new Promise((r) => setTimeout(r, 20));
pair.w.__pump();
check("conc.gone", ids(pair.dm).length === 0 && ids(pair.pc).length === 0, ids(pair.pc).join(","));

echo.write("map/public/scenes/" + sid, null, { removed: true, by: "dm" });
await new Promise((r) => setTimeout(r, 20));
check("scene.removed", ids(pair.pc).length === 0);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nzone clear ok");

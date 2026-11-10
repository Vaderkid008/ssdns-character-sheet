/**
 * Hunger of Hadar stays on the player map (sheet 0.3.278 / DMCC 0.2.291).
 * The cast FX fades. The lasting sphere has to be the same zone the DM saved,
 * still there after the player map is opened again, and painted as ink on top
 * of the player's fog (the same disc Darkness uses).
 *
 *   node tools/test-hadar-sphere-03234.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.278" && version.sheetBuild === "sheet-playtest-v03278");
check("ver.dmcc", version.dmcc === "0.2.291" && version.dmccBuild === "dmcc-playtest-v02291");

function makeWindow(fills) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
  });
  const w = dom.window;
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = { fillStyle: "", strokeStyle: "", globalAlpha: 1 };
    const ctx = new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        if (p === "fill") return function () {
          fills.push({ fillStyle: String(t.fillStyle || ""), alpha: t.globalAlpha });
        };
        if (p === "measureText") return function () { return { width: 24 }; };
        if (p === "createLinearGradient" || p === "createRadialGradient") {
          return function () { return { addColorStop() {} }; };
        }
        return function () {};
      },
      set(t, p, v) { t[p] = v; return true; }
    });
    return ctx;
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}

function boot(w) {
  w.addEventListener("error", (ev) => {
    console.log("script error", ev.message, ev.filename, ev.lineno, ev.error && ev.error.stack);
  });
  function add(rel) {
    const s = w.document.createElement("script");
    s.textContent = read(rel);
    w.document.body.appendChild(s);
  }
  add("assets/js/spell-zones.js");
  add("assets/js/lighting.js");
  add("map/ssdns-map-firebase.js");
  add("map/ssdns-map-fx.js");
  add("map/ssdns-map.js");
}

function hungerZone(w) {
  return w.SSDNSSpellZones.buildZone("Hunger of Hadar", {
    origin: { x: 10, y: 8 },
    area: { shape: "sphere", radius: 20 }
  }, { slot: 3, casterId: "p1", dc: 15, id: "zone-hadar", casterName: "TEST All-Spells" });
}

function hadarOf(list) {
  return (list || []).find((z) => z && z.key === "hunger of hadar");
}

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const bus = [];
const playerFills = [];
const dmFills = [];
const pw = makeWindow(playerFills);
const dw = makeWindow(dmFills);
boot(pw);
boot(dw);
const playerAd = pw.SSDNSMapFirebase.memory({ role: "player", store: store, bus: bus });
const dmAd = dw.SSDNSMapFirebase.memory({ role: "dm", store: store, bus: bus });
const playerEl = pw.document.createElement("div");
const dmEl = dw.document.createElement("div");
pw.document.body.appendChild(playerEl);
dw.document.body.appendChild(dmEl);
const room = { table: { initiative: { order: [], turn: 0 } } };
const playerMap = pw.SSDNSMap.create({
  el: playerEl, role: "player", uid: "p1", adapter: playerAd,
  host: { players() { return []; } },
  options: { scene: scene, assetBase: "", room: room }
});
const dmMap = dw.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd,
  host: { players() { return [{ uid: "p1", name: "TEST" }]; } },
  options: { scene: JSON.parse(JSON.stringify(scene)), assetBase: "", room: room }
});
await flush(40);

await dmAd.write("map/public/tokens/tok-pc", {
  id: "tok-pc", name: "TEST All-Spells", ownerUid: "p1", kind: "player",
  pos: { x: 2, y: 2 }, size: 1, sceneId: "scn_dustyspur01"
}, { by: "dm" });
await flush(30);

const zone = hungerZone(pw);
check("built", zone && zone.key === "hunger of hadar" && zone.radius === 20 && zone.origin.x === 10 && zone.origin.y === 8, JSON.stringify(zone && { key: zone.key, radius: zone.radius }));
playerMap.setSpellZones([zone], { casterId: "p1" });
await flush(80);

const onPlayer = hadarOf(playerMap.spellZones());
const onDm = hadarOf(dmMap.spellZones());
check("player.keeps", onPlayer && onPlayer.origin.x === 10 && onPlayer.origin.y === 8 && onPlayer.radius === 20, JSON.stringify(onPlayer && onPlayer.origin));
check("dm.samePlace", onDm && onDm.id === onPlayer.id && onDm.origin.x === 10 && onDm.origin.y === 8, JSON.stringify(onDm && onDm.origin));
const saved = store.pub["map/public/scenes/scn_dustyspur01"];
const savedZone = saved && hadarOf(saved.value && saved.value.spellZones);
check("scene.saved", savedZone && savedZone.origin.x === 10 && savedZone.origin.y === 8, saved ? JSON.stringify(saved.value && saved.value.spellZones && saved.value.spellZones.map((z) => z && z.key)) : "no scene");

const ink = "rgba(46, 12, 84, 0.94)";
check("player.ink", playerFills.some((f) => f.fillStyle === ink), playerFills.map((f) => f.fillStyle).filter((s) => /46,\s*12,\s*84/.test(s)).join(" | ") || "no hunger fill");
check("dm.ink", dmFills.some((f) => f.fillStyle === ink));

const againFills = [];
const rw = makeWindow(againFills);
boot(rw);
const reopenAd = rw.SSDNSMapFirebase.memory({ role: "player", store: store, bus: bus });
const reopenEl = rw.document.createElement("div");
rw.document.body.appendChild(reopenEl);
const reopened = rw.SSDNSMap.create({
  el: reopenEl, role: "player", uid: "p1", adapter: reopenAd,
  host: { players() { return []; } },
  options: { scene: JSON.parse(JSON.stringify(scene)), assetBase: "", room: room }
});
await flush(80);
const again = hadarOf(reopened.spellZones());
check("reopen.keeps", again && again.origin.x === 10 && again.origin.y === 8 && again.radius === 20, JSON.stringify(again && again.origin));
check("reopen.ink", againFills.some((f) => f.fillStyle === ink), againFills.map((f) => f.fillStyle).slice(0, 8).join(" | "));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nhadar sphere ok");
process.exit(0);

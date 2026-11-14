/**
 * Light rings are a DM guide. Warm glow fades on bright ground.
 * Flaming Sphere's light follows the token, not the cast point.
 *   node tools/test-light-rings-03275.mjs
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
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.308" && ver.dmcc === "0.2.321");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.308") && !read("database.rules.json").includes("0.3.308"));

const src = read("map/ssdns-map.js");
check("rings.gate", /function paintZoneLightRings[\s\S]{0,320}if \(role !== 'dm' \|\| !state\.showLightRings\) return/.test(src));
check("rings.label", src.includes('data-act="showLightRings"> Light rings (DM guide)'));
check("rings.store", src.includes("ssdns.map.lightRings") && src.includes("localStorage.setItem('ssdns.map.lightRings'"));
check("wash.stays", src.includes("function paintLightGlow") && src.includes("function paintDarkDimVeil") && src.includes("function paintMagicalDarknessLayer") && src.includes("for (const ls of lightSources) drawVisible"));
const halo = src.slice(src.indexOf("function haloTint"), src.indexOf("function normalizeLightRegions"));
check("glow.dim", halo.includes("hot: 0.5, dimA: 0.34"));
check("glow.dark", halo.includes("hot: 0.5, dimA: 0.42"));
check("glow.bright", halo.includes("hot: 0.02, dimA: 0.02") && !halo.includes("0.28") && !halo.includes("0.12"));
check("glow.cuts", halo.includes("function paintHaloCuts") && halo.includes("heavilyObscured"));
check("sphere.lightFromToken", src.includes("t.spellPiece === 'flaming sphere'") && src.includes("bright: 20, dim: 20, radius: 8"));
check("sphere.skipZoneLight", src.includes("if (sphereTokenForZone(z)) return"));
check("sphere.auraFollows", src.includes("row.key === 'flaming sphere'") && src.includes("sphereTokenForZone(zone)"));
check("fireball.kept", src.includes("function paintFireballScar") && src.includes('zone.key === "fireball"'));
check("sphere.moveKept", src.includes('t.spellPiece === "flaming sphere"') && src.includes("noteSphereRam"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
  });
  const w = dom.window;
  const frames = [];
  w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  w.cancelAnimationFrame = () => {};
  w.__pump = () => {
    let n = 0;
    while (frames.length && n < 8) {
      const batch = frames.splice(0);
      n += 1;
      batch.forEach((fn) => { try { fn(n); } catch (e) {} });
    }
  };
  w.__stops = [];
  w.__marks = [];
  for (const Ctor of [w.HTMLElement, w.HTMLCanvasElement]) {
    Object.defineProperty(Ctor.prototype, "clientWidth", { configurable: true, get() { return 1000; } });
    Object.defineProperty(Ctor.prototype, "clientHeight", { configurable: true, get() { return 700; } });
  }
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    const api = {
      canvas: this,
      measureText: () => ({ width: 8 }),
      setTransform() {},
      createRadialGradient() {
        return { addColorStop(off, color) { w.__stops.push(String(color)); } };
      },
      createLinearGradient() { return { addColorStop() {} }; }
    };
    return new Proxy(api, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return () => {
          if (p === "fill" || p === "stroke") w.__marks.push((bag.fillStyle || "") + "|" + (bag.strokeStyle || ""));
        };
      },
      set(t, p, v) { bag[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  try {
    w.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
    w.HTMLMediaElement.prototype.pause = function () {};
  } catch (e) {}
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  if (typeof w.PointerEvent !== "function") {
    w.PointerEvent = class PointerEvent extends w.MouseEvent {
      constructor(type, init) { super(type, init || {}); this.pointerId = (init && init.pointerId) || 1; }
    };
  }
  if (!w.HTMLCanvasElement.prototype.setPointerCapture) w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
async function boot(role, store) {
  const w = makeWindow();
  if (store) w.localStorage.setItem("ssdns.map.lightRings", store);
  addScript(w, "assets/js/spell-tokens.js");
  addScript(w, "map/ssdns-map-move.js");
  addScript(w, "map/ssdns-map-firebase.js");
  addScript(w, "map/zone-art.js");
  addScript(w, "map/ssdns-map.js");
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  if (!Array.isArray(scene.walls)) scene.walls = [];
  const api = w.SSDNSMap.create({
    el, role, uid: role === "dm" ? "dm" : "p_jolene",
    adapter: w.SSDNSMapFirebase.memory({ role }),
    options: { scene, assetBase: "", room: { table: { initiative: { started: false, order: [], turn: 0 } } } }
  });
  for (let i = 0; i < 8; i++) {
    await flush();
    w.__pump();
    if (api.tokensLoaded && api.tokensLoaded()) break;
  }
  return { w, el, api };
}
function ringMarks(w) {
  return w.__marks.filter(s => s.includes("255,206,80") || s.includes("160,190,255"));
}
function warmStops(w) {
  return w.__stops.filter(s => s.includes("255, 214, 120") || s.includes("255, 206, 130") || s.includes("255, 170, 60"));
}
function setAmbient(el, w, value) {
  w.__stops.length = 0;
  w.__marks.length = 0;
  const sel = el.querySelector('[data-act="ambientSel"]');
  sel.value = value;
  sel.dispatchEvent(new w.Event("change", { bubbles: true }));
}
function placeLights(api) {
  api.setSpellZones([
    { id: "lite", key: "light", spell: "Light", shape: "sphere", radius: 20, origin: { x: 8, y: 6 }, facing: 0, light: { bright: 20, dim: 20 } },
    { id: "day", key: "daylight", spell: "Daylight", shape: "sphere", radius: 60, origin: { x: 16, y: 10 }, facing: 0, light: { bright: 60, dim: 60 } }
  ], {});
}
function dragToken(view, id, cellsX) {
  const canvas = view.el.querySelector("canvas");
  const tok = view.api.tokenBoxes().find(t => t.id === id);
  const cell = (tok.screen.x2 - tok.screen.x1) / (tok.size || 1);
  const x = (tok.screen.x1 + tok.screen.x2) / 2;
  const y = (tok.screen.y1 + tok.screen.y2) / 2;
  const end = x + cell * cellsX;
  const Ev = view.w.PointerEvent;
  canvas.dispatchEvent(new Ev("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1 }));
  for (let i = 1; i <= 8; i++) {
    canvas.dispatchEvent(new Ev("pointermove", {
      bubbles: true, clientX: x + (end - x) * (i / 8), clientY: y, pointerId: 1, button: 0, buttons: 1
    }));
  }
  canvas.dispatchEvent(new Ev("pointerup", { bubbles: true, clientX: end, clientY: y, pointerId: 1, button: 0, buttons: 0 }));
  view.w.__pump();
}

const dm = await boot("dm", "0");
check("ui.off", dm.el.querySelector('[data-act="showLightRings"]') && dm.el.querySelector('[data-act="showLightRings"]').checked === false);
check("map.ready", !!(dm.api.tokensLoaded && dm.api.tokensLoaded()));
placeLights(dm.api);
dm.w.__pump();
setAmbient(dm.el, dm.w, "dark");
check("rings.off", ringMarks(dm.w).length === 0);
const darkWarm = warmStops(dm.w);
check("glow.darkOn", darkWarm.some(s => s.includes("0.5")) && !darkWarm.some(s => s.includes("0.02")), darkWarm.slice(0, 3).join(" / "));
setAmbient(dm.el, dm.w, "dim");
const dimWarm = warmStops(dm.w);
check("glow.dimOn", dimWarm.some(s => s.includes("0.5")) && !dimWarm.some(s => s.includes("0.02")), dimWarm.slice(0, 3).join(" / "));
setAmbient(dm.el, dm.w, "bright");
const brightWarm = warmStops(dm.w);
check("glow.brightOff", brightWarm.some(s => s.includes("rgba(255, 214, 120, 0.02)")) && !brightWarm.some(s => s.includes("0.5)")) && !brightWarm.some(s => s.includes("0.28")), brightWarm.slice(0, 3).join(" / "));

const box = dm.el.querySelector('[data-act="showLightRings"]');
box.checked = true;
box.dispatchEvent(new dm.w.Event("change", { bubbles: true }));
check("rings.on", ringMarks(dm.w).length > 0, String(ringMarks(dm.w).length));
check("rings.saved", dm.w.localStorage.getItem("ssdns.map.lightRings") === "1");
box.checked = false;
box.dispatchEvent(new dm.w.Event("change", { bubbles: true }));
check("rings.savedOff", dm.w.localStorage.getItem("ssdns.map.lightRings") === "0");

const again = await boot("dm", "1");
check("rings.restored", again.el.querySelector('[data-act="showLightRings"]').checked === true);

const player = await boot("player", "1");
check("player.noBox", !player.el.querySelector('[data-act="showLightRings"]'));
placeLights(player.api);
player.w.__pump();
check("player.noRings", ringMarks(player.w).length === 0, ringMarks(player.w).slice(0, 2).join(";"));

async function bootSphere(role) {
  const view = await boot(role, "0");
  const edit = view.el.querySelector('[data-act="dmEditBtn"]');
  if (edit) edit.click();
  view.api.setSpellZones([{
    id: "sph-live", key: "flaming sphere", spell: "Flaming Sphere", shape: "sphere", radius: 5,
    origin: { x: 3, y: 4 }, facing: 0, createToken: true,
    light: { bright: 20, dim: 20, spellLevel: 2, magical: true },
    casterId: role === "player" ? "p_jolene" : ""
  }], {});
  view.w.__pump();
  return view;
}
const sphereDm = await bootSphere("dm");
const sphereTok = sphereDm.api.tokenBoxes().find(t => t.id === "spell_sph-live");
check("sphere.token", !!(sphereTok && sphereTok.x === 3 && sphereTok.y === 4), sphereDm.api.tokenBoxes().map(t => t.id).join(","));
check("sphere.here", sphereDm.api.lightAt(3, 4) !== "dark");
check("sphere.far", sphereDm.api.lightAt(22, 16) === "dark");
if (sphereTok) {
  dragToken(sphereDm, sphereTok.id, 14);
  const moved = sphereDm.api.tokenBoxes().find(t => t.id === sphereTok.id);
  check("sphere.moved", moved && moved.x === 9, moved && String(moved.x));
  check("sphere.follows", moved && sphereDm.api.lightAt(moved.x, moved.y) !== "dark");
  check("sphere.noResidual", sphereDm.api.lightAt(0, 4) === "dark", sphereDm.api.lightAt(0, 4));
}

const spherePc = await bootSphere("player");
const pcTok = spherePc.api.tokenBoxes().find(t => t.id === "spell_sph-live");
check("sphere.playerToken", !!pcTok, spherePc.api.tokenBoxes().map(t => t.id).join(","));
if (pcTok) {
  const canvas = spherePc.el.querySelector("canvas");
  const x = (pcTok.screen.x1 + pcTok.screen.x2) / 2;
  const y = (pcTok.screen.y1 + pcTok.screen.y2) / 2;
  canvas.dispatchEvent(new spherePc.w.PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1 }));
  const moveBtn = spherePc.el.querySelector('[data-act="tokenCmdMove"]');
  if (moveBtn) moveBtn.click();
  dragToken(spherePc, pcTok.id, 14);
  const pcMoved = spherePc.api.tokenBoxes().find(t => t.id === pcTok.id);
  check("sphere.playerMoved", pcMoved && pcMoved.x === 9, pcMoved && String(pcMoved.x));
  check("sphere.playerFollows", pcMoved && spherePc.api.lightAt(pcMoved.x, pcMoved.y) !== "dark");
  check("sphere.playerClear", spherePc.api.lightAt(0, 4) === "dark", spherePc.api.lightAt(0, 4));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nlight rings ok");

/**
 * Fireball aftermath plate: the existing 20-ft burn scar, not the cast burst.
 * Sheet 0.3.301 / DMCC 0.2.314.
 *   node tools/test-fireball-aftermath-03272.mjs
 * The 1d6 start tick, 2-round clock, and radius stay. rules.js is not edited.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function near(a, b, slop) { return Math.abs(a - b) <= (slop == null ? 0.75 : slop); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.301" && ver.dmcc === "0.2.314" && ver.sheetBuild === "sheet-playtest-v03301" && ver.dmccBuild === "dmcc-playtest-v02314");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.301") && !read("database.rules.json").includes("0.3.301"));

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("assets/js/spell-zones.js"), sandbox);
const built = sandbox.SSDNSSpellZones.buildZone("Fireball", { origin: { x: 4, y: 5 }, facing: 0 }, { id: "scar-mech" });
check("mech.radius", built && built.radius === 20 && built.shape === "sphere" && built.key === "fireball");
check("mech.clock", built && built.rounds === 2 && built.roundsLeft === 2 && built.dur === "2 rounds" && built.conc === false);
check("mech.tick", built && built.tag === "burn-scar" && built.ticks.length === 1 && built.ticks[0].when === "start" && built.ticks[0].dice === "1d6" && built.ticks[0].type === "fire" && !built.ticks[0].save);
const bugs = sandbox.SSDNSSpellZones.buildZone("Insect Plague", { origin: { x: 1, y: 1 } }, {});
const knives = sandbox.SSDNSSpellZones.buildZone("Cloud of Daggers", { origin: { x: 1, y: 1 } }, {});
check("others.kept", bugs && bugs.key === "insect plague" && bugs.radius === 20 && knives && knives.key === "cloud of daggers" && knives.side === 5);

const mapSrc = read("map/ssdns-map.js");
const fxSrc = read("map/ssdns-map-fx.js");
check("paint.branch", mapSrc.includes('zone.key === "fireball"') && mapSrc.includes("paintFireballScar"));
check("paint.ring", mapSrc.includes("cx: 505, cy: 516, r: 289") && mapSrc.includes("idle-overlay.webm") && mapSrc.includes("char-decal.png") && mapSrc.includes("overlay.png"));
check("paint.others", mapSrc.includes('k === "insect plague"') && mapSrc.includes('k === "cloud of daggers"') && mapSrc.includes("paintLastingZoneDisc"));
check("burst.untouched", fxSrc.includes('fireball:') && !fxSrc.includes("fireball-aftermath") && !fxSrc.includes("paintFireballScar"));
const char = fs.readFileSync(path.join(root, "map/fx/fireball-aftermath/char-decal.png"));
const still = fs.readFileSync(path.join(root, "map/fx/fireball-aftermath/overlay.png"));
const loop = fs.readFileSync(path.join(root, "map/fx/fireball-aftermath/idle-overlay.webm"));
check("art.char", char.slice(0, 8).toString("hex") === "89504e470d0a1a0a" && char.length > 10000);
check("art.still", still.slice(0, 8).toString("hex") === "89504e470d0a1a0a" && still.length > 10000);
let probe = "";
try {
  probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-show_streams", path.join(root, "map/fx/fireball-aftermath/idle-overlay.webm")], { encoding: "utf8" });
} catch (e) { probe = ""; }
check("art.loop", loop.slice(0, 4).toString("hex") === "1a45dfa3" && loop.includes(Buffer.from("V_VP9")) && /width=480/.test(probe) && /alpha_mode=1/.test(probe));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/map/demo.html", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1200; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON() { return {}; } };
  };
  const frames = [];
  w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  w.cancelAnimationFrame = () => {};
  w.confirm = () => true;
  w.matchMedia = () => ({ matches: !!w.__reduce, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const Orig = w.Image;
  w.Image = function Image() {
    const img = new Orig();
    const listeners = {};
    let src = "";
    img.addEventListener = (type, fn) => { (listeners[type] || (listeners[type] = [])).push(fn); };
    Object.defineProperty(img, "src", {
      configurable: true,
      get() { return src; },
      set(v) { src = String(v || ""); }
    });
    Object.defineProperty(img, "complete", { configurable: true, get() { return !!src && !img._scarDead; } });
    Object.defineProperty(img, "naturalWidth", { configurable: true, get() { return src ? 1024 : 0; } });
    Object.defineProperty(img, "naturalHeight", { configurable: true, get() { return src ? 1024 : 0; } });
    img._listeners = listeners;
    return img;
  };
  const vp = w.HTMLVideoElement.prototype;
  vp.play = function () {
    this._paused = false;
    this._ready = 2;
    this._vw = 480;
    w.__plays = (w.__plays || 0) + 1;
    return Promise.resolve();
  };
  vp.pause = function () {
    this._paused = true;
    w.__pauses = (w.__pauses || 0) + 1;
  };
  Object.defineProperty(vp, "paused", { configurable: true, get() { return this._paused !== false; } });
  Object.defineProperty(vp, "readyState", { configurable: true, get() { return this._ready || 0; } });
  Object.defineProperty(vp, "videoWidth", { configurable: true, get() { return this._vw || 0; } });
  Object.defineProperty(vp, "videoHeight", { configurable: true, get() { return this._vw || 0; } });
  w.__frames = frames;
  w.HTMLCanvasElement.prototype.getContext = function () {
    if (this.__ctx) return this.__ctx;
    const bag = {};
    const ops = [];
    this.__ops = ops;
    let path = null;
    const ctx = new Proxy(bag, {
      get(t, p) {
        if (p === "canvas") return this;
        if (typeof p !== "string") return undefined;
        if (p === "measureText") return () => ({ width: 12 });
        return (...args) => {
          if (p === "beginPath") path = { kind: "empty" };
          else if (p === "arc") path = { kind: "arc", x: args[0], y: args[1], r: args[2] };
          else if (p === "clip" || p === "fill" || p === "stroke") ops.push({ op: p, path: path ? { x: path.x, y: path.y, r: path.r, kind: path.kind } : null, fillStyle: t.fillStyle || "", strokeStyle: t.strokeStyle || "" });
          else if (p === "drawImage") {
            const img = args[0];
            ops.push({
              op: "drawImage",
              name: img && img.nodeName || "",
              src: img && img.src || "",
              x: args[1], y: args[2], w: args[3], h: args[4]
            });
          } else if (p === "save" || p === "restore") ops.push({ op: p });
          else if (p === "createRadialGradient" || p === "createLinearGradient" || p === "createPattern") return { addColorStop() {} };
          return bag;
        };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
    this.__ctx = ctx;
    return ctx;
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  const origCreate = w.document.createElement.bind(w.document);
  w.document.createElement = function (tag) {
    const el = origCreate(tag);
    if (String(tag).toLowerCase() !== "video") return el;
    el.play = function () {
      this._paused = false;
      this._ready = 2;
      this._vw = 480;
      w.__plays = (w.__plays || 0) + 1;
      return Promise.resolve();
    };
    el.pause = function () {
      this._paused = true;
      w.__pauses = (w.__pauses || 0) + 1;
    };
    Object.defineProperty(el, "paused", { configurable: true, get() { return this._paused !== false; } });
    Object.defineProperty(el, "readyState", { configurable: true, get() { return this._ready || 0; } });
    Object.defineProperty(el, "videoWidth", { configurable: true, get() { return this._vw || 0; } });
    Object.defineProperty(el, "videoHeight", { configurable: true, get() { return this._vw || 0; } });
    return el;
  };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function pump(w, max) {
  let n = 0;
  while (w.__frames.length && n < max) {
    const batch = w.__frames.splice(0, w.__frames.length);
    n += 1;
    batch.forEach((fn) => { if (fn) fn(n); });
  }
  return n;
}
async function tick(w) {
  pump(w, 8);
  await new Promise((resolve) => setTimeout(resolve, 0));
  pump(w, 8);
}
function scarOps(canvas) {
  return (canvas.__ops || []).filter((op) => op.op === "drawImage" && (String(op.src).indexOf("fireball-aftermath") >= 0 || op.name === "VIDEO"));
}
function clips(canvas) {
  return (canvas.__ops || []).filter((op) => op.op === "clip" && op.path && op.path.kind === "arc");
}

const scene = {
  id: "scn_scar",
  name: "Scar ground",
  grid: { cols: 30, rows: 20, px: 70 },
  walls: [],
  ambient: "bright",
  fogRevealed: true
};
function zone(id, key, x, y, extra) {
  return Object.assign({
    id: id, key: key, spell: key, shape: "sphere", radius: 20,
    origin: { x: x, y: y }, rounds: 2, roundsLeft: 2, conc: false, ticks: []
  }, extra || {});
}
const w = makeWindow();
const script = w.document.createElement("script");
script.textContent = read("map/ssdns-map-firebase.js") + "\n" + read("map/ssdns-map.js");
w.document.body.appendChild(script);
const dmEl = w.document.createElement("div");
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  options: { scene: scene, tokens: { tokens: {} }, assetBase: "map/" }
});
await tick(w);
const canvas = dmEl.querySelector("canvas");
canvas.__ops.length = 0;
dm.setSpellZones([
  zone("fb1", "fireball", 8, 6, { tag: "burn-scar", ticks: [{ when: "start", dice: "1d6", type: "fire" }] }),
  zone("fb2", "fireball", 18, 14, { tag: "burn-scar", ticks: [{ when: "start", dice: "1d6", type: "fire" }] })
]);
pump(w, 1);
const stillPass = scarOps(canvas);
const charPass = stillPass.filter((op) => String(op.src).indexOf("char-decal.png") >= 0);
const overlayPass = stillPass.filter((op) => String(op.src).indexOf("overlay.png") >= 0);
check("dm.twoChars", charPass.length === 2, String(charPass.length));
check("dm.stillFirst", overlayPass.length === 2, String(overlayPass.length));
const firstClips = clips(canvas).filter((op) => near(op.path.r, 280));
check("dm.clip", firstClips.length >= 2, firstClips.map((op) => op.path.r).join(","));
const arc = firstClips[0] && firstClips[0].path;
const scale = arc ? arc.r / 289 : 0;
check("dm.align", !!arc && charPass.length && near(charPass[0].x + 505 * scale, arc.x) && near(charPass[0].y + 516 * scale, arc.y) && near(charPass[0].w, 1024 * scale, 1.5), charPass[0] ? [charPass[0].w, arc && arc.r].join(" ") : "none");
check("dm.noGold", !(canvas.__ops || []).some((op) => op.op === "fill" && op.path && op.path.kind === "arc" && near(op.path.r, 280) && String(op.fillStyle).indexOf("200,180,80") >= 0));
canvas.__ops.length = 0;
await tick(w);
const videoPass = scarOps(canvas).filter((op) => op.name === "VIDEO");
const charAgain = scarOps(canvas).filter((op) => String(op.src).indexOf("char-decal.png") >= 0);
check("dm.video", videoPass.length >= 2 && (w.__plays || 0) >= 1, "videos " + videoPass.length + " plays " + (w.__plays || 0));
check("dm.videoScale", videoPass.length >= 1 && near(videoPass[0].w, charAgain[0] ? charAgain[0].w : -1, 1.5), videoPass[0] ? String(videoPass[0].w) : "none");
const before = clips(canvas).filter((op) => op.path && op.path.r > 100).map((op) => op.path.r);
canvas.dispatchEvent(new w.WheelEvent("wheel", { deltaY: -100, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
await tick(w);
const after = clips(canvas).filter((op) => op.path && op.path.r > 100);
check("dm.zoom", before.length > 0 && after.some((op) => near(op.path.r, before[0] * 1.1, 1.5)), "before " + before[0] + " after " + (after[0] && after[0].path.r));

w.__reduce = true;
canvas.__ops.length = 0;
const pausesBefore = w.__pauses || 0;
dm.setSpellZones([
  zone("fb1", "fireball", 8, 6, { tag: "burn-scar" }),
  zone("fb2", "fireball", 18, 14, { tag: "burn-scar" })
]);
await tick(w);
const reducedOps = scarOps(canvas);
check("dm.reduced", reducedOps.some((op) => String(op.src).indexOf("overlay.png") >= 0) && !reducedOps.some((op) => op.name === "VIDEO") && (w.__pauses || 0) > pausesBefore, reducedOps.map((op) => op.name + ":" + op.src).join("|"));

w.__reduce = false;
w.localStorage.setItem("ssdns.map.fx", "0");
canvas.__ops.length = 0;
dm.setSpellZones([zone("fb1", "fireball", 8, 6, { tag: "burn-scar" })]);
await tick(w);
const offOps = scarOps(canvas);
check("dm.fxOff", offOps.some((op) => String(op.src).indexOf("char-decal.png") >= 0) && offOps.some((op) => String(op.src).indexOf("overlay.png") >= 0) && !offOps.some((op) => op.name === "VIDEO"));

w.localStorage.removeItem("ssdns.map.fx");
canvas.__ops.length = 0;
dm.setSpellZones([]);
await tick(w);
check("dm.cleared", scarOps(canvas).length === 0, String(scarOps(canvas).length));

canvas.__ops.length = 0;
dm.setSpellZones([
  zone("bugs", "insect plague", 10, 10),
  zone("knives", "cloud of daggers", 12, 8, { shape: "cube", side: 5, radius: 2.5 }),
  zone("slick", "grease", 6, 6, { shape: "square", side: 10, radius: 5, tag: "grease" })
]);
await tick(w);
check("others.noScar", scarOps(canvas).length === 0, scarOps(canvas).map((op) => op.src).join(","));
check("grease.disc", (canvas.__ops || []).some((op) => op.op === "fill" && String(op.fillStyle).indexOf("200,180,80") >= 0));

const playerEl = w.document.createElement("div");
w.document.body.appendChild(playerEl);
const player = w.SSDNSMap.create({
  el: playerEl,
  role: "player",
  uid: "ada",
  adapter: w.SSDNSMapFirebase.memory({ role: "player" }),
  options: { scene: scene, assetBase: "map/" }
});
await tick(w);
const playerCanvas = playerEl.querySelector("canvas");
playerCanvas.__ops.length = 0;
player.setSpellZones([zone("fbP", "fireball", 9, 7, { tag: "burn-scar", ticks: [{ when: "start", dice: "1d6", type: "fire" }] })]);
await tick(w);
const playerScar = scarOps(playerCanvas);
check("player.plate", playerScar.some((op) => String(op.src).indexOf("char-decal.png") >= 0) && (playerScar.some((op) => op.name === "VIDEO") || playerScar.some((op) => String(op.src).indexOf("overlay.png") >= 0)));
check("player.clip", clips(playerCanvas).some((op) => near(op.path.r, 280) || near(op.path.r, 280 * 1.1, 2)));
check("player.kept", (player.spellZones() || []).some((z) => z && z.key === "fireball" && z.radius === 20 && z.roundsLeft === 2 && z.ticks && z.ticks[0] && z.ticks[0].dice === "1d6"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nfireball aftermath ok");

/**
 * The 18 lasting-zone plates. Art only: footprints follow the zone record.
 *   node tools/test-zone-art-03274.mjs
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
function near(a, b, slop) { return Math.abs(a - b) <= (slop == null ? 0.6 : slop); }

const KEYS = [
  ["grease", "square", 10],
  ["entangle", "square", 20],
  ["web", "square", 20],
  ["fog cloud", "circle", 20],
  ["cloudkill", "circle", 20],
  ["stinking cloud", "circle", 20],
  ["wall of thorns", "wall", 60],
  ["blade barrier", "wall", 100],
  ["wind wall", "wall", 50],
  ["light", "circle", 20],
  ["darkness", "circle", 15],
  ["daylight", "circle", 60],
  ["moonbeam", "circle", 5],
  ["silence", "circle", 20],
  ["call lightning", "circle", 5],
  ["spike growth", "circle", 20],
  ["hypnotic pattern", "square", 30],
  ["black tentacles", "square", 20]
];

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.279" && ver.dmcc === "0.2.292" && ver.sheetBuild === "sheet-playtest-v03279" && ver.dmccBuild === "dmcc-playtest-v02292");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.279") && !read("database.rules.json").includes("0.3.279"));

const mapSrc = read("map/ssdns-map.js");
check("wire.paint", mapSrc.includes("Art.paint(ctx, zone, zoneArtEnv())"));
check("wire.sync", mapSrc.includes("Art.sync"));
check("wire.rings", mapSrc.includes("function paintZoneLightRings"));
check("kept.fireball", mapSrc.includes("paintFireballScar") && mapSrc.includes('zone.key === "fireball"'));
check("kept.plague", mapSrc.includes('k === "insect plague"') && mapSrc.includes('k === "cloud of daggers"'));
check("kept.drag", mapSrc.includes("deferDrawer") && mapSrc.includes("clickOnly"));
check("kept.wallfire", mapSrc.includes("function paintWallOfFire"));

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("assets/js/spell-zones.js"), sandbox);
const Z = sandbox.SSDNSSpellZones;

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/map/demo.html", pretendToBeVisual: true });
const w = dom.window;
w.Image = function Image() {
  this.complete = false;
  this.naturalWidth = 0;
  this.listeners = {};
};
w.Image.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] || (this.listeners[type] = [])).push(fn);
};
w.Image.prototype.setSrc = function (v) { this.src = v; };
Object.defineProperty(w.Image.prototype, "src", {
  set(v) {
    this._src = v;
    if (String(v).indexOf("boom-still") >= 0) {
      (this.listeners.error || []).forEach(fn => fn());
      return;
    }
    if (String(v).indexOf("hang-still") >= 0) return;
    this.complete = true;
    this.naturalWidth = 512;
    (this.listeners.load || []).forEach(fn => fn());
  },
  get() { return this._src || ""; }
});
w.HTMLVideoElement.prototype.play = function () {
  return Promise.resolve();
};
w.HTMLVideoElement.prototype.pause = function () {};
sandbox.Image = w.Image;
sandbox.document = w.document;
sandbox.HTMLVideoElement = w.HTMLVideoElement;
vm.runInContext(read("map/zone-art.js"), sandbox);
const Art = sandbox.SSDNSZoneArt;

check("book.18", KEYS.every(([key]) => Art.owns(key)) && !Art.owns("fireball") && !Art.owns("insect plague") && !Art.owns("cloud of daggers") && !Art.owns("wall of fire") && !Art.owns("wall of ice"));

function pngColor(buf) {
  return buf.length > 26 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a" ? buf[25] : -1;
}
function videoAlpha(file) {
  const png = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-c:v", "libvpx-vp9", "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]);
  return { color: pngColor(png), corner: png.length > 30 ? png[png.length - 1] : 255, bytes: png.length };
}
KEYS.forEach(([key, kind]) => {
  const paths = Art.paths(key);
  const stillPath = path.join(root, "map", paths.still);
  const loopPath = path.join(root, "map", paths.loop);
  const still = fs.readFileSync(stillPath);
  const loop = fs.readFileSync(loopPath);
  let probe = "";
  try {
    probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", loopPath], { encoding: "utf8" });
  } catch (e) { probe = ""; }
  const frame = videoAlpha(loopPath);
  const id = key.replace(/\s+/g, "-");
  check("asset." + id, paths.kind === kind && pngColor(still) === 6 && still.length > 8000 && loop.slice(0, 4).toString("hex") === "1a45dfa3" && /vp9/.test(probe) && /512/.test(probe) && frame.color === 6 && frame.bytes > 1000, probe.trim() + " ct=" + frame.color);
});

const px = 70;
function zoneOf(name, extra) {
  const built = Z.buildZone(name, { origin: { x: 10, y: 8 }, facing: 0 }, extra || {});
  return built;
}

KEYS.forEach(([key, kind, size]) => {
  const names = {
    "grease": "Grease", "entangle": "Entangle", "web": "Web", "fog cloud": "Fog Cloud",
    "cloudkill": "Cloudkill", "stinking cloud": "Stinking Cloud", "wall of thorns": "Wall of Thorns",
    "blade barrier": "Blade Barrier", "wind wall": "Wind Wall", "light": "Light", "darkness": "Darkness",
    "daylight": "Daylight", "moonbeam": "Moonbeam", "silence": "Silence", "call lightning": "Call Lightning",
    "spike growth": "Spike Growth", "hypnotic pattern": "Hypnotic Pattern", "black tentacles": "Black Tentacles"
  };
  const zone = zoneOf(names[key]);
  const lay = Art.layout(zone, px);
  const id = "fit." + key.replace(/\s+/g, "-");
  if (kind === "circle") {
    check(id, lay && lay.kind === "circle" && near(lay.r, (size / 5) * px) && near(lay.cx, 10 * px) && near(lay.cy, 8 * px) && lay.radiusFt === size, lay && String(lay.r));
  } else if (kind === "square") {
    check(id, lay && lay.kind === "square" && near(lay.size, (size / 5) * px) && near(lay.x, 10 * px - lay.size / 2) && near(lay.y, 8 * px - lay.size / 2) && lay.sideFt === size, lay && String(lay.size));
  } else {
    const n = size / 5;
    check(id, lay && lay.kind === "wall" && lay.count === n && lay.tiles.length === n && near(lay.lengthFt, size) && near(lay.widthFt, 5), lay && (lay.count + " " + lay.widthFt));
  }
});

const fog1 = zoneOf("Fog Cloud", { slot: 1 });
const fog2 = zoneOf("Fog Cloud", { slot: 2 });
const fog3 = zoneOf("Fog Cloud", { slot: 3 });
check("fog.base", fog1.radius === 20 && near(Art.layout(fog1, px).r, 4 * px));
check("fog.up2", fog2.radius === 40 && fog2.shape === "sphere" && near(Art.layout(fog2, px).r, 8 * px));
check("fog.up3", fog3.radius === 60 && near(Art.layout(fog3, px).r, 12 * px));
check("fog.ticks", Array.isArray(fog1.ticks) && fog1.ticks.length === 0 && fog1.heavilyObscured === true && fog1.radius === 20);

const thorn = zoneOf("Wall of Thorns");
thorn.facing = Math.PI / 2;
const spun = Art.layout(thorn, px);
const along = (0.5 - spun.count / 2) * 5;
check("wall.spin", spun.tiles.length === 12 && near(spun.tiles[0].x, 10 * px) && near(spun.tiles[0].y, 8 * px + along * (px / 5)) && near(spun.facing, Math.PI / 2));
const end = (spun.count - 0.5 - spun.count / 2) * 5;
check("wall.end", near(spun.tiles[11].y, 8 * px + end * (px / 5)) && near(spun.tiles[11].x, 10 * px));
check("wall.clip", spun.corners.length === 4 && near(spun.widthFt, 5) && near(spun.lengthFt, 60));
check("mech.thorn", thorn.ticks && thorn.ticks.some(t => t.when === "through" && t.dice === "7d8") && thorn.length === 60 && thorn.width === 5);

const blade = zoneOf("Blade Barrier");
const wind = zoneOf("Wind Wall");
check("mech.walls", blade.length === 100 && blade.width === 5 && wind.length === 50 && wind.width === 5 && wind.thickness === 1 && Art.layout(blade, px).count === 20 && Art.layout(wind, px).count === 10);

function recorder() {
  const ops = [];
  const ctx = {
    save() { ops.push("save"); },
    restore() { ops.push("restore"); },
    beginPath() { ops.push("begin"); },
    arc(x, y, r) { ops.push(["arc", x, y, r]); },
    rect(x, y, w, h) { ops.push(["rect", x, y, w, h]); },
    moveTo() { ops.push("move"); },
    lineTo() { ops.push("line"); },
    closePath() { ops.push("close"); },
    clip() { ops.push("clip"); },
    stroke() { ops.push("stroke"); },
    translate(x, y) { ops.push(["tr", x, y]); },
    rotate(a) { ops.push(["rot", a]); },
    drawImage(img, x, y, w, h) { ops.push(["img", x, y, w, h]); },
    set globalCompositeOperation(v) {},
    set strokeStyle(v) {},
    set lineWidth(v) {}
  };
  return { ctx, ops };
}
const env = {
  asset: (src) => "http://local/" + src,
  worldToScreen: (x, y) => ({ x: x, y: y }),
  px: px,
  zoom: 1,
  fxOn: () => false,
  requestDraw() {}
};
const painted = recorder();
const fogLay = Art.paint(painted.ctx, fog2, env);
const fogImg = painted.ops.filter(op => op[0] === "img")[0];
const fogArc = painted.ops.find(op => op[0] === "arc");
const fogClip = painted.ops.indexOf("clip");
const fogDraw = painted.ops.findIndex(op => op[0] === "img");
check("paint.fog", fogLay === "art" && fogClip >= 0 && fogClip < fogDraw && fogArc && near(fogArc[3], 8 * px) && fogImg && near(fogImg[3], (8 * px) / 256 * 512));

const square = recorder();
const hyp = zoneOf("Hypnotic Pattern");
check("paint.square", Art.paint(square.ctx, hyp, env) === "art" && square.ops.some(op => op[0] === "rect" && near(op[3], 6 * px) && near(op[4], 6 * px)) && square.ops.filter(op => op[0] === "img").length === 1);

const wallOps = recorder();
check("paint.wall", Art.paint(wallOps.ctx, thorn, env) === "art");
check("paint.tiles", wallOps.ops.filter(op => op[0] === "img").length === 12 && wallOps.ops.filter(op => op[0] === "rot").every(op => near(op[1], Math.PI / 2)) && wallOps.ops.indexOf("clip") < wallOps.ops.findIndex(op => op[0] === "img"));

const deadEnv = Object.assign({}, env, { asset: (src) => "http://local/boom-still/" + src });
const dead = recorder();
check("fallback.miss", Art.paint(dead.ctx, zoneOf("Silence"), deadEnv) === "miss" && !dead.ops.some(op => op[0] === "img"));
const hangEnv = Object.assign({}, env, { asset: (src) => "http://local/hang-still/" + src });
const hang = recorder();
check("fallback.wait", Art.paint(hang.ctx, zoneOf("Daylight"), hangEnv) === "wait" && hang.ops.includes("stroke"));

const origCreate = w.document.createElement.bind(w.document);
w.document.createElement = function (name) {
  const el = origCreate(name);
  if (String(name).toLowerCase() === "video") {
    const add = el.addEventListener.bind(el);
    el.addEventListener = (type, fn, opt) => {
      if (type === "error") return;
      return add(type, fn, opt);
    };
  }
  return el;
};
const fxEnv = Object.assign({}, env, { fxOn: () => true, asset: (src) => "http://local/" + src });
const a = zoneOf("Grease", { id: "g1" });
const b = zoneOf("Grease", { id: "g2" });
const syncOn = Art.sync([a, b], fxEnv);
check("sync.on", syncOn === true, "state=" + (Art.media().grease && Art.media().grease.videoState) + " paused=" + (Art.media().grease && Art.media().grease.video && Art.media().grease.video.paused));
const media = Art.media();
check("sync.share", media.grease && media.grease.video && w.document.querySelectorAll("video").length === 1);
check("sync.clear", Art.sync([], fxEnv) === false && media.grease.kicked === false);
check("sync.fxoff", Art.sync([zoneOf("Web")], Object.assign({}, env, { fxOn: () => false })) === false);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nzone art ok");

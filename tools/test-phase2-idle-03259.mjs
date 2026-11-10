/**
 * Phase 2 idle spice (sheet 0.3.282 / DMCC 0.2.295).
 * Call Lightning keeps a storm and a lingering bolt. Branding Smite stays marked.
 * Hunger of Hadar whispers inside the locked sphere. Blade Barrier kicks a little grit while it idles.
 *   node tools/test-phase2-idle-03259.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.282" && ver.dmcc === "0.2.295" && ver.sheetBuild === "sheet-playtest-v03282" && ver.dmccBuild === "dmcc-playtest-v02295");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.282") && !read("database.rules.json").includes("0.3.282"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));

const fxSrc = read("map/ssdns-map-fx.js");
const hh = fxSrc.slice(fxSrc.indexOf("function hhR"), fxSrc.indexOf("function hhR") + 280);
check("hunger.radius", /G\.cell \* \(G\.zr \|\| 4\)/.test(hh) && hh.includes('G.mode === "idle"'));
check("strike.kept", /function callLightning\(/.test(fxSrc) && /skyStrike\(ctx, C, B, lt - CL\.drop/.test(fxSrc));
check("map.storm", read("map/ssdns-map.js").includes('zone.key === "call lightning"') && read("map/ssdns-map.js").includes("stormIdle"));

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise, performance: { now: () => 1800 } };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const FX = context.SSDNSMapFx;

function ctxOf() {
  const ops = [];
  let fillStyle = "";
  let strokeStyle = "";
  let composite = "";
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "arc") ops.push({ op: "arc", r: args[2], fillStyle, composite });
        else if (p === "stroke") ops.push({ op: "stroke", stroke: strokeStyle, composite });
        else if (p === "fillText") ops.push({ op: "fillText", text: args[0], fillStyle });
        else if (p === "fillRect") ops.push({ op: "fillRect", fillStyle, composite });
        else if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : "";
      if (p === "globalCompositeOperation") composite = String(v || "");
      return true;
    }
  });
  return { ctx, ops };
}

const storm = ctxOf();
FX.stormIdle(storm.ctx, { x: 200, y: 220 }, 70, "storm");
check("storm.cloud", storm.ops.some((op) => op.op === "arc" && op.composite === "source-over"));
check("storm.bolt", storm.ops.some((op) => op.op === "stroke" && /180,210,255/.test(op.stroke || "")));
check("storm.grit", storm.ops.some((op) => op.op === "fillRect" && op.composite === "source-over" && /95,80,60/.test(op.fillStyle || "")));

const brand = ctxOf();
FX.paintRider(brand.ctx, "brand", 320, 240, 22, 500);
check("brand.mark", brand.ops.some((op) => op.op === "arc" || op.op === "fillRect"));
check("brand.grit", brand.ops.some((op) => op.op === "fillRect" && op.composite === "source-over" && (/95,80,60/.test(op.fillStyle || "") || /255,232,170/.test(op.fillStyle || ""))));

const g = { A: { x: 180, y: 180 }, S: { x: 180, y: 180 }, T: { x: 180, y: 180 }, Z: { x: 180, y: 180 }, cell: 70, rT: 18, rS: 18, zr: 4 };
const hunger = ctxOf();
FX.zoneLayer(hunger.ctx, { type: "spell", spell: "Hunger of Hadar", result: "hit" }, 2400, g, "over");
check("hunger.whisper", hunger.ops.some((op) => op.op === "fillText" && (op.text === "\u2026" || op.text === "\u00b7")));
check("look.hunger", FX.lookOf({ type: "spell", spell: "Hunger of Hadar" }) === "void");

const wall = {
  A: { x: 40, y: 200 }, S: { x: 40, y: 200 }, T: { x: 400, y: 200 }, Z: { x: 220, y: 200 },
  cell: 70, rT: 18, facing: 0,
  W: [{ A: { x: 40, y: 200 }, B: { x: 400, y: 200 }, skin: "blades" }]
};
const blade = ctxOf();
FX.zoneLayer(blade.ctx, { type: "spell", spell: "Blade Barrier", result: "hit" }, 900, wall, "under");
check("blade.grit", blade.ops.some((op) => op.op === "fillRect" && op.composite === "source-over" && /95,80,60|90,95,105/.test(op.fillStyle || "")));
check("look.kept", FX.lookOf({ type: "spell", spell: "Call Lightning" }) === "skybolt"
  && FX.lookOf({ type: "spell", spell: "Branding Smite" }) === "brand"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Sacred Flame" }) === "sacred-flame");

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("phase2 idle ok");

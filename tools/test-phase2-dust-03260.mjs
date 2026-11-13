/**
 * Phase 2 next grit cut (sheet 0.3.305 / DMCC 0.2.318).
 * Fire Bolt, Ray of Frost, and Acid Splash kick grit when they land.
 * Misty Step, Wind Wall, and Spike Growth pick up dust on the shapes they already have.
 *   node tools/test-phase2-dust-03260.mjs
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
check("ver", ver.sheet === "0.3.305" && ver.dmcc === "0.2.318" && ver.sheetBuild === "sheet-playtest-v03305" && ver.dmccBuild === "dmcc-playtest-v02318");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.305") && !read("database.rules.json").includes("0.3.305"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));
check("idle.kept", read("map/ssdns-map-fx.js").includes("function stormIdle") && read("map/ssdns-map-fx.js").includes("function hungerWhispers"));

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const FX = context.SSDNSMapFx;

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  let composite = "";
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function () {
        if (p === "fillRect") ops.push({ op: "fillRect", fillStyle, composite });
        else if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      if (p === "globalCompositeOperation") composite = String(v || "");
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}
function grit(ops, rgb) {
  return ops.some((op) => op.op === "fillRect" && op.composite === "source-over" && (op.fillStyle || "").includes(rgb));
}

const cell = 70;
const g = { A: { x: 80, y: 280 }, B: { x: 460, y: 200 }, S: { x: 80, y: 280 }, T: { x: 460, y: 200 }, rS: 22, rT: 18, cell, facing: 0 };
check("look.kept", FX.lookOf({ type: "spell", spell: "Fire Bolt" }) === "fire"
  && FX.lookOf({ type: "spell", spell: "Ray of Frost" }) === "cold"
  && FX.lookOf({ type: "spell", spell: "Acid Splash" }) === "acid"
  && FX.lookOf({ type: "spell", spell: "Misty Step" }) === "dustpop"
  && FX.lookOf({ type: "spell", spell: "Wind Wall" }) === "gale"
  && FX.lookOf({ type: "spell", spell: "Spike Growth" }) === "cholla"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Ice Storm" }) === "hailstorm"
  && FX.lookOf({ type: "spell", spell: "Sacred Flame" }) === "sacred-flame");

const boltEarly = trace({ spell: "Fire Bolt", dmg: "fire" }, 120, g);
const bolt = trace({ spell: "Fire Bolt", dmg: "fire" }, 400, g);
check("bolt.travel", !grit(boltEarly, "45,28,20"));
check("bolt.ash", grit(bolt, "45,28,20") || grit(bolt, "95,80,60"));

const frostEarly = trace({ spell: "Ray of Frost", dmg: "cold" }, 40, g);
const frost = trace({ spell: "Ray of Frost", dmg: "cold" }, 200, g);
check("frost.travel", !grit(frostEarly, "200,225,250"));
check("frost.rime", grit(frost, "200,225,250"));

const splashEarly = trace({ spell: "Acid Splash", dmg: "acid" }, 120, g);
const splash = trace({ spell: "Acid Splash", dmg: "acid" }, 420, g);
check("acid.travel", !grit(splashEarly, "125,180,40"));
check("acid.grit", grit(splash, "125,180,40"));

const step = trace({ spell: "Misty Step" }, 80, g);
check("step.dust", grit(step, "178,168,150") || grit(step, "95,80,60"));
const wall = trace({ spell: "Wind Wall" }, 160, g);
check("wall.dust", grit(wall, "200,185,160") || grit(wall, "95,80,60"));
const spikes = trace({ spell: "Spike Growth" }, 160, g);
check("spikes.grit", grit(spikes, "215,190,130") || grit(spikes, "95,80,60"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("phase2 next grit ok");

/**
 * Phase 2 dust/grit remainder (sheet 0.3.293 / DMCC 0.2.306).
 * Banishing Smite and Staggering Smite leave the generic traveling dot.
 * Produce Flame ash, wall-raise dust, and Entangle grit stay on the existing shapes.
 *   node tools/test-phase2-dust-03255.mjs
 * rules.js is not regenerated.
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
check("ver", ver.sheet === "0.3.293" && ver.dmcc === "0.2.306" && ver.sheetBuild === "sheet-playtest-v03293" && ver.dmccBuild === "dmcc-playtest-v02306");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.293") && !read("database.rules.json").includes("0.3.293"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));

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
      return function (...args) {
        if (p === "fillRect") ops.push({ op: "fillRect", fillStyle, composite });
        else if (p === "arc") ops.push({ op: "arc", r: args[2], fillStyle });
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
const g = { A: { x: 80, y: 300 }, B: { x: 480, y: 220 }, S: { x: 80, y: 300 }, T: { x: 480, y: 220 }, rS: 22, rT: 18, cell, facing: 0 };
check("look.kept", FX.lookOf({ type: "spell", spell: "Banishing Smite" }) === "banish"
  && FX.lookOf({ type: "spell", spell: "Staggering Smite" }) === "stagger"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Hunger of Hadar" }) === "void"
  && FX.lookOf({ type: "spell", spell: "Sacred Flame" }) === "sacred-flame"
  && FX.lookOf({ type: "spell", spell: "Shocking Grasp" }) === "shocking-grasp");

const ban = trace({ spell: "Banishing Smite", dmg: "force" }, 320, g);
check("banish.grit", grit(ban, "95,80,60") || grit(ban, "200,220,210"));
check("banish.notDot", FX.plan("spell", "hit", { spell: "Banishing Smite" }).duration > 700);
const stag = trace({ spell: "Staggering Smite", dmg: "psychic" }, 320, g);
check("stagger.grit", grit(stag, "95,80,60"));
const flame = trace({ spell: "Produce Flame", dmg: "fire" }, 520, g);
check("flame.ash", grit(flame, "45,28,20"));
const early = trace({ spell: "Produce Flame", dmg: "fire" }, 120, g);
check("flame.travel", !grit(early, "45,28,20"));
const ice = trace({ spell: "Wall of Ice", dmg: "cold" }, 180, g);
check("wall.ice", grit(ice, "95,80,60") || grit(ice, "200,225,250"));
const thorn = trace({ spell: "Wall of Thorns" }, 180, g);
check("wall.thorn", grit(thorn, "70,62,38"));
const briar = trace({ spell: "Entangle" }, 240, g);
check("briar.grit", grit(briar, "70,62,38") && briar.some((op) => op.op === "arc"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nphase2 dust ok");

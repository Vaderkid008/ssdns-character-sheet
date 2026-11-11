/**
 * Phase 2 leftover zones (sheet 0.3.283 / DMCC 0.2.296).
 * Armor of Agathys dusts its ring. Sleep and Counterspell dust on arrival.
 * Darkness, Web, Silence, Hypnotic Pattern, Stinking Cloud, and Black Tentacles
 * dust the discs they already draw.
 *   node tools/test-phase2-dust-03263.mjs
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
check("ver", ver.sheet === "0.3.283" && ver.dmcc === "0.2.296" && ver.sheetBuild === "sheet-playtest-v03283" && ver.dmccBuild === "dmcc-playtest-v02296");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.283") && !read("database.rules.json").includes("0.3.283"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));
check("prior.kept", read("map/ssdns-map-fx.js").includes('jinx: ["120,30,30"') && read("map/ssdns-map-fx.js").includes("function stormIdle"));

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

const g = { A: { x: 80, y: 280 }, B: { x: 420, y: 200 }, S: { x: 80, y: 280 }, T: { x: 420, y: 200 }, rS: 22, rT: 18, cell: 70, facing: 0.3 };
check("look.kept", FX.lookOf({ type: "spell", spell: "Armor of Agathys" }) === "agathys"
  && FX.lookOf({ type: "spell", spell: "Sleep" }) === "chloroform"
  && FX.lookOf({ type: "spell", spell: "Counterspell" }) === "snap"
  && FX.lookOf({ type: "spell", spell: "Darkness" }) === "darkvoid"
  && FX.lookOf({ type: "spell", spell: "Web" }) === "silk"
  && FX.lookOf({ type: "spell", spell: "Silence" }) === "hush"
  && FX.lookOf({ type: "spell", spell: "Hypnotic Pattern" }) === "mesmer"
  && FX.lookOf({ type: "spell", spell: "Stinking Cloud" }) === "gutfog"
  && FX.lookOf({ type: "spell", spell: "Black Tentacles" }) === "tentacles"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Bane" }) === "jinx");

check("held.agathys", grit(trace({ spell: "Armor of Agathys" }, 160, g), "200,225,250"));
const sleepEarly = trace({ spell: "Sleep" }, 60, g);
const sleep = trace({ spell: "Sleep" }, 260, g);
check("sleep.travel", !grit(sleepEarly, "190,175,210"));
check("sleep.grit", grit(sleep, "190,175,210"));
const snapEarly = trace({ spell: "Counterspell" }, 60, g);
const snap = trace({ spell: "Counterspell" }, 260, g);
check("snap.travel", !grit(snapEarly, "95,220,205"));
check("snap.grit", grit(snap, "95,220,205"));
check("zone.dark", grit(trace({ spell: "Darkness" }, 160, g), "95,80,60"));
check("zone.web", grit(trace({ spell: "Web" }, 160, g), "220,215,200"));
check("zone.silence", grit(trace({ spell: "Silence" }, 160, g), "190,190,180"));
check("zone.pattern", grit(trace({ spell: "Hypnotic Pattern" }, 160, g), "210,150,170"));
check("zone.stink", grit(trace({ spell: "Stinking Cloud" }, 160, g), "120,105,60"));
check("zone.tentacles", grit(trace({ spell: "Black Tentacles" }, 160, g), "95,220,205"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("phase2 zones ok");

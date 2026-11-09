/**
 * Phase 2 last generic casts (sheet 0.3.270 / DMCC 0.2.283).
 * Bless, Fog Cloud, and Mage Hand dust the circles they already draw.
 * Polymorph and Banishment dust when the shot arrives.
 * Healing Word, Invisibility, and Pass Without Trace share that same plain circle, so they get a puff too.
 *   node tools/test-phase2-dust-03264.mjs
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
check("ver", ver.sheet === "0.3.270" && ver.dmcc === "0.2.283" && ver.sheetBuild === "sheet-playtest-v03270" && ver.dmccBuild === "dmcc-playtest-v02283");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.270") && !read("database.rules.json").includes("0.3.270"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));
check("prior.kept", read("map/ssdns-map-fx.js").includes("darkvoid:") && read("map/ssdns-map-fx.js").includes("function stormIdle"));

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

const g = { A: { x: 80, y: 280 }, B: { x: 420, y: 200 }, S: { x: 80, y: 280 }, T: { x: 420, y: 200 }, rS: 22, rT: 18, cell: 70, facing: 0.2 };
check("look.kept", FX.lookOf({ type: "spell", spell: "Bless" }) === "bless"
  && FX.lookOf({ type: "spell", spell: "Fog Cloud" }) === "fog"
  && FX.lookOf({ type: "spell", spell: "Mage Hand" }) === "hand"
  && FX.lookOf({ type: "spell", spell: "Polymorph" }) === "morph"
  && FX.lookOf({ type: "spell", spell: "Banishment" }) === "rift"
  && FX.lookOf({ type: "spell", spell: "Healing Word" }) === "heal"
  && FX.lookOf({ type: "spell", spell: "Invisibility" }) === "invis"
  && FX.lookOf({ type: "spell", spell: "Pass Without Trace" }) === "pwt"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Grease" }) === "");

check("bless.grit", grit(trace({ spell: "Bless" }, 160, g), "240,205,120"));
check("fog.grit", grit(trace({ spell: "Fog Cloud" }, 160, g), "150,150,148"));
const handEarly = trace({ spell: "Mage Hand" }, 80, g);
const hand = trace({ spell: "Mage Hand" }, 360, g);
check("hand.travel", !grit(handEarly, "120,230,215"));
check("hand.grit", grit(hand, "120,230,215"));
const morphEarly = trace({ spell: "Polymorph" }, 60, g);
const morph = trace({ spell: "Polymorph" }, 260, g);
check("morph.travel", !grit(morphEarly, "170,200,110"));
check("morph.grit", grit(morph, "170,200,110"));
const riftEarly = trace({ spell: "Banishment" }, 60, g);
const rift = trace({ spell: "Banishment" }, 260, g);
check("rift.travel", !grit(riftEarly, "95,220,205"));
check("rift.grit", grit(rift, "95,220,205"));
check("heal.grit", grit(trace({ spell: "Healing Word" }, 160, g), "140,195,95"));
check("invis.grit", grit(trace({ spell: "Invisibility" }, 160, g), "190,215,225"));
check("pwt.grit", grit(trace({ spell: "Pass Without Trace" }, 160, g), "150,150,148"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("phase2 last casts ok");

/**
 * Phase 2 leftover wraps and cones (sheet 0.3.279 / DMCC 0.2.292).
 * Bane, Fly, Blur, and Mirror Image dust the ring they already draw.
 * Fear and Color Spray dust the cone they already draw.
 *   node tools/test-phase2-dust-03262.mjs
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
check("ver", ver.sheet === "0.3.279" && ver.dmcc === "0.2.292" && ver.sheetBuild === "sheet-playtest-v03279" && ver.dmccBuild === "dmcc-playtest-v02292");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.279") && !read("database.rules.json").includes("0.3.279"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));
check("prior.kept", read("map/ssdns-map-fx.js").includes("function stormIdle") && read("map/ssdns-map-fx.js").includes('["155,65,240", "60,215,195"]'));

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
const g = { A: { x: 80, y: 280 }, B: { x: 460, y: 200 }, S: { x: 80, y: 280 }, T: { x: 460, y: 200 }, rS: 22, rT: 18, cell, facing: 0.4 };
check("look.kept", FX.lookOf({ type: "spell", spell: "Bane" }) === "jinx"
  && FX.lookOf({ type: "spell", spell: "Fly" }) === "flight"
  && FX.lookOf({ type: "spell", spell: "Blur" }) === "haze"
  && FX.lookOf({ type: "spell", spell: "Mirror Image" }) === "tintype"
  && FX.lookOf({ type: "spell", spell: "Fear" }) === "terror"
  && FX.lookOf({ type: "spell", spell: "Color Spray" }) === "limelight"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Faerie Fire" }) === "foxfire");

check("wrap.bane", grit(trace({ spell: "Bane" }, 160, g), "120,30,30"));
check("wrap.fly", grit(trace({ spell: "Fly" }, 160, g), "200,185,160"));
check("wrap.blur", grit(trace({ spell: "Blur" }, 160, g), "230,180,110"));
check("wrap.mirror", grit(trace({ spell: "Mirror Image" }, 160, g), "200,205,205"));
check("cone.fear", grit(trace({ spell: "Fear" }, 160, g), "150,70,170"));
check("cone.spray", grit(trace({ spell: "Color Spray" }, 160, g), "220,170,90"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("phase2 cones ok");

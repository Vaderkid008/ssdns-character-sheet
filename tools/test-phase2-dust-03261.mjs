/**
 * Phase 2 missiles, beams, and wraps (sheet 0.3.290 / DMCC 0.2.303).
 * Magic Missile, Eldritch Blast, Moonbeam, Spirit Guardians, Cloudkill, and Inflict Wounds
 * throw grit when they land. Faerie Fire, Haste, Slow, and Hold Person dust the ring they already draw.
 *   node tools/test-phase2-dust-03261.mjs
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
check("ver", ver.sheet === "0.3.290" && ver.dmcc === "0.2.303" && ver.sheetBuild === "sheet-playtest-v03290" && ver.dmccBuild === "dmcc-playtest-v02303");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.290") && !read("database.rules.json").includes("0.3.290"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));
check("fullscreen.guard", read("map/ssdns-map.js").includes("A 0×0 read during fullscreen must not replace it."));
check("prior.kept", read("map/ssdns-map-fx.js").includes("function stormIdle") && read("map/ssdns-map-fx.js").includes('["45,28,20", "95,80,60"]'));

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
check("look.kept", FX.lookOf({ type: "spell", spell: "Magic Missile" }) === "beads"
  && FX.lookOf({ type: "spell", spell: "Eldritch Blast" }) === "bullet"
  && FX.lookOf({ type: "spell", spell: "Moonbeam" }) === "radiant"
  && FX.lookOf({ type: "spell", spell: "Spirit Guardians" }) === "radiant"
  && FX.lookOf({ type: "spell", spell: "Cloudkill" }) === "poison"
  && FX.lookOf({ type: "spell", spell: "Inflict Wounds" }) === "necrotic"
  && FX.lookOf({ type: "spell", spell: "Faerie Fire" }) === "foxfire"
  && FX.lookOf({ type: "spell", spell: "Haste" }) === "brass"
  && FX.lookOf({ type: "spell", spell: "Slow" }) === "molasses"
  && FX.lookOf({ type: "spell", spell: "Hold Person" }) === "lasso"
  && FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball"
  && FX.lookOf({ type: "spell", spell: "Ice Storm" }) === "hailstorm");

const missileEarly = trace({ spell: "Magic Missile", dmg: "force" }, 80, g);
const missile = trace({ spell: "Magic Missile", dmg: "force" }, 320, g);
check("missile.travel", !grit(missileEarly, "155,65,240"));
check("missile.grit", grit(missile, "155,65,240") || grit(missile, "60,215,195"));

const blastEarly = trace({ spell: "Eldritch Blast", dmg: "force" }, 60, g);
const blast = trace({ spell: "Eldritch Blast", dmg: "force" }, 220, g);
check("blast.travel", !grit(blastEarly, "205,175,255"));
check("blast.grit", grit(blast, "205,175,255") || grit(blast, "150,110,240"));

const beamEarly = trace({ spell: "Moonbeam", dmg: "radiant" }, 100, g);
const beam = trace({ spell: "Moonbeam", dmg: "radiant" }, 360, g);
const guards = trace({ spell: "Spirit Guardians", dmg: "radiant" }, 360, g);
check("beam.travel", !grit(beamEarly, "255,232,170"));
check("beam.grit", grit(beam, "255,232,170") && grit(guards, "255,232,170"));

const cloudEarly = trace({ spell: "Cloudkill", dmg: "poison" }, 150, g);
const cloud = trace({ spell: "Cloudkill", dmg: "poison" }, 520, g);
check("cloud.travel", !grit(cloudEarly, "150,140,70"));
check("cloud.grit", grit(cloud, "150,140,70") || grit(cloud, "40,42,18"));

const woundEarly = trace({ spell: "Inflict Wounds", dmg: "necrotic" }, 100, g);
const wound = trace({ spell: "Inflict Wounds", dmg: "necrotic" }, 360, g);
check("wound.travel", !grit(woundEarly, "185,170,180"));
check("wound.grit", grit(wound, "185,170,180") || grit(wound, "95,80,60"));

check("wrap.faerie", grit(trace({ spell: "Faerie Fire" }, 160, g), "150,120,170"));
check("wrap.haste", grit(trace({ spell: "Haste" }, 160, g), "220,180,90"));
check("wrap.slow", grit(trace({ spell: "Slow" }, 160, g), "225,160,60"));
check("wrap.hold", grit(trace({ spell: "Hold Person" }, 160, g), "95,220,205"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("phase2 wraps ok");

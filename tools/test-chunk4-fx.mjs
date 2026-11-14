/**
 * Chunk 4 Phase 1 map FX. Real SSDNSMapFx.paint only (the tip overlay painter).
 *   node tools/test-chunk4-fx.mjs
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

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("map/ssdns-map-fx.js"), sandbox);
const FX = sandbox.SSDNSMapFx;

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  let strokeStyle = "";
  let lineWidth = 0;
  let composite = "";
  let cur = [];
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") cur = [];
        else if (p === "moveTo" || p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "fillRect" || p === "strokeRect") ops.push({ op: p, x: args[0], y: args[1], w: args[2], h: args[3], fillStyle, strokeStyle, composite });
        else if (p === "fill" || p === "fillText") ops.push({ op: p, pts: cur.slice(), fillStyle, text: args[0], composite, lineWidth });
        else if (p === "stroke") ops.push({ op: "stroke", pts: cur.slice(), strokeStyle, composite, lineWidth });
        else if (p === "arc") ops.push({ op: "arc", x: args[0], y: args[1], r: args[2], strokeStyle, fillStyle });
        else if (p === "createRadialGradient" || p === "createLinearGradient") {
          const grad = { colors: [], addColorStop(_at, color) { this.colors.push(String(color || "")); } };
          return grad;
        }
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : (v && v.colors ? v.colors.join(" ") : "");
      if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : "";
      if (p === "lineWidth") lineWidth = Number(v) || 0;
      if (p === "globalCompositeOperation") composite = String(v || "");
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 3 }, spec), lt, g);
  return ops;
}
function hasColor(ops, rgb) {
  return ops.some((op) => (op.strokeStyle && op.strokeStyle.indexOf(rgb) >= 0) || (op.fillStyle && op.fillStyle.indexOf(rgb) >= 0));
}
function span(ops) {
  let max = 0;
  ops.forEach((op) => {
    const pts = op.pts || [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        max = Math.max(max, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
      }
    }
  });
  return max;
}
function maxArc(ops) {
  return ops.reduce((m, op) => (op.op === "arc" && op.r > m ? op.r : m), 0);
}
function highPoint(ops, y) {
  return ops.some((op) => (op.pts || []).some((p) => p[1] < y) || (op.op === "arc" && op.y < y));
}

const cell = 70;
const A = { x: 90, y: 240 };
const S = { x: 64, y: 240 };
const T = { x: 430, y: 250 };
const g = { A: A, B: { x: T.x - 12, y: T.y }, S: S, T: T, rS: 22, rT: 22, cell: cell, dir: { x: 1, y: 0.02 } };
function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }

check("look.walls", look("Wall of Ice") === "wallice" && look("Wall of Thorns") === "wallthorn" && look("Blade Barrier") === "wallblade");
check("look.hadar", look("Hunger of Hadar") === "void" && look("Arms of Hadar") === "void" && look("Darkness") === "darkvoid");
check("look.zones", look("Cloud of Daggers") === "daggers" && look("Insect Plague") === "swarm" && look("Incendiary Cloud") === "furnace");
check("look.sky", look("Flame Strike") === "skypillar" && look("Fire Storm") === "skypillar" && look("Sacred Flame") === "sacred-flame");
check("look.bombs", look("Freezing Sphere") === "icebomb" && look("Sunburst") === "sunburst" && look("Circle of Death") === "deathring" && look("Delayed Blast Fireball") === "bead");
check("look.kept", look("Wall of Fire") === "" && look("Cloudkill") === "poison" && look("Fireball", "fire") === "fireball" && look("Meteor Swarm", "fire") === "meteors");
check("look.thorn", look("Hail of Thorns") === "thorn" && look("Thorn Whip") === "thorn");

const ice = trace({ spell: "Wall of Ice" }, 400, g);
const thorn = trace({ spell: "Wall of Thorns" }, 400, g);
const blade = trace({ spell: "Blade Barrier" }, 400, g);
check("paint.ice", hasColor(ice, "200,225,250") && hasColor(ice, "80,125,185") && span(ice) > 400, "span " + Math.round(span(ice)));
check("paint.thorn", hasColor(thorn, "70,62,38") && span(thorn) > 300, "span " + Math.round(span(thorn)));
check("paint.blade", hasColor(blade, "90,95,105") && hasColor(blade, "220,225,235"));
check("paint.ice.tick", hasColor(trace({ spell: "Wall of Ice", pulse: true }, 80, g), "250,252,255") || hasColor(trace({ spell: "Wall of Ice", pulse: true }, 80, g), "200,225,250"));

const hunger = trace({ spell: "Hunger of Hadar" }, 500, g);
check("paint.hunger", hasColor(hunger, "6,3,8") && (hasColor(hunger, "200,225,250") || hasColor(hunger, "175,210,55")) && maxArc(hunger) > 180, "r " + Math.round(maxArc(hunger)));
check("paint.hunger.acid", hasColor(trace({ spell: "Hunger of Hadar", pulse: true, dmg: "acid" }, 80, g), "125,180,40"));
check("paint.hunger.clear", hasColor(trace({ spell: "Hunger of Hadar", garnish: "clear" }, 120, g), "150,140,125"));

const arms = trace({ spell: "Arms of Hadar" }, 300, Object.assign({}, g, { hops: [{ x: 220, y: 180 }, { x: 200, y: 320 }] }));
check("paint.arms", hasColor(arms, "6,3,8") && span(arms) > 40 && maxArc(arms) < 200, "r " + Math.round(maxArc(arms)) + " span " + Math.round(span(arms)));

const knives = trace({ spell: "Cloud of Daggers" }, 500, g);
check("paint.daggers", (hasColor(knives, "90,95,105") || hasColor(knives, "220,225,235")) && knives.some((op) => op.op === "fillRect"));
check("paint.daggers.tick", hasColor(trace({ spell: "Cloud of Daggers", pulse: true }, 80, g), "255,190,110"));

const bugs = trace({ spell: "Insect Plague" }, 600, g);
check("paint.swarm", hasColor(bugs, "70,50,30") || hasColor(bugs, "26,17,8"));
check("paint.swarm.tick", hasColor(trace({ spell: "Insect Plague", pulse: true }, 80, g), "200,60,40"));

const smoke = trace({ spell: "Incendiary Cloud" }, 400, g);
const drifted = trace({ spell: "Incendiary Cloud", quiet: true }, 3000, Object.assign({}, g, { age: 3000, drift: { x: 1, y: 0 }, quiet: true }));
check("paint.furnace", hasColor(smoke, "40,34,30") && (hasColor(smoke, "255,125,35") || hasColor(smoke, "200,60,15")));
check("paint.furnace.drift", drifted.some((op) => op.op === "arc" && op.x > T.x + 10), "idle drifts off the aim square");
check("paint.furnace.tick", hasColor(trace({ spell: "Incendiary Cloud", pulse: true }, 80, g), "255,125,35") || hasColor(trace({ spell: "Incendiary Cloud", pulse: true }, 80, g), "255,242,205"));

const strike = trace({ spell: "Flame Strike", dmg: "fire" }, 400, g);
const storm = trace({ spell: "Fire Storm", dmg: "fire" }, 280, Object.assign({}, g, { hops: [{ x: 560, y: 180 }, { x: 300, y: 400 }] }));
check("paint.strike", (hasColor(strike, "255,125,35") || hasColor(strike, "255,242,205")) && (hasColor(strike, "230,175,70") || hasColor(strike, "255,232,170")) && highPoint(strike, T.y - cell));
check("paint.storm", (hasColor(storm, "255,125,35") || hasColor(storm, "200,60,15")) && !hasColor(storm, "230,175,70"));
check("paint.sacred.kept", look("Sacred Flame") === "sacred-flame");

const lob = trace({ spell: "Freezing Sphere" }, 160, g);
const boom = trace({ spell: "Freezing Sphere" }, 1000, g);
check("paint.freeze.lob", hasColor(lob, "200,225,250") || hasColor(lob, "250,252,255"));
check("paint.freeze.bead", maxArc(lob) < 80, "bead r " + Math.round(maxArc(lob)));
check("paint.freeze.rules", maxArc(boom) > cell * 6, "detonation r " + Math.round(maxArc(boom)));

const sun = trace({ spell: "Sunburst" }, 400, g);
const grave = trace({ spell: "Circle of Death" }, 500, g);
check("paint.sunburst", (hasColor(sun, "255,250,235") || hasColor(sun, "255,250,230")) && maxArc(sun) > cell * 6, "r " + Math.round(maxArc(sun)));
check("paint.circle", (hasColor(grave, "6,3,8") || hasColor(grave, "95,45,100")) && hasColor(grave, "185,170,180") && maxArc(grave) > cell * 4, "r " + Math.round(maxArc(grave)));

const bead = trace({ spell: "Delayed Blast Fireball" }, 120, g);
const blast = trace({ spell: "Delayed Blast Fireball", garnish: "detonate" }, 240, g);
check("paint.bead", hasColor(bead, "255,242,205") || hasColor(bead, "255,125,35"));
check("paint.bead.small", maxArc(bead) < cell * 2, "r " + Math.round(maxArc(bead)));
check("paint.bead.boom", (hasColor(blast, "255,125,35") || hasColor(blast, "255,242,205")) && maxArc(blast) > cell * 2, "r " + Math.round(maxArc(blast)));

const ball = trace({ spell: "Fireball", dmg: "fire" }, 200, g);
check("paint.fireball.kept", look("Fireball") === "fireball" && !highPoint(ball, -10));
const whip = trace({ spell: "Thorn Whip" }, 400, g);
const hail = trace({ spell: "Hail of Thorns" }, 160, g);
check("paint.whip.kept", whip.length > 0 && hasColor(whip, "40,38,18") || span(whip) > 20);
check("paint.hail.burst", hasColor(hail, "40,38,18") || hasColor(hail, "150,175,80"));
const hailNudge = FX.nudge({ type: "spell", spell: "Hail of Thorns", result: "hit" }, 400, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
check("paint.hail.noyank", hailNudge.dx === 0 && hailNudge.dy === 0, JSON.stringify(hailNudge));
check("paint.whip.yank", FX.nudge({ type: "spell", spell: "Thorn Whip", result: "hit" }, 640, Object.assign({}, g, { yank: { x: -140, y: 0 } })).dx < -30);

check("shake.arms", Math.hypot(FX.shakeOf({ spell: "Arms of Hadar" }, 280).x, FX.shakeOf({ spell: "Arms of Hadar" }, 280).y) > 0.4);
check("shake.strike", Math.hypot(FX.shakeOf({ spell: "Flame Strike" }, 160).x, FX.shakeOf({ spell: "Flame Strike" }, 160).y) > 0.4);
check("shake.freeze", Math.hypot(FX.shakeOf({ spell: "Freezing Sphere" }, 860).x, FX.shakeOf({ spell: "Freezing Sphere" }, 860).y) > 0.4);
check("shake.freeze.early", Math.hypot(FX.shakeOf({ spell: "Freezing Sphere" }, 100).x, FX.shakeOf({ spell: "Freezing Sphere" }, 100).y) < 0.05);
check("shake.bead", Math.hypot(FX.shakeOf({ spell: "Delayed Blast Fireball", garnish: "detonate" }, 80).x, FX.shakeOf({ spell: "Delayed Blast Fireball", garnish: "detonate" }, 80).y) > 0.4);
check("shake.bead.idle", Math.hypot(FX.shakeOf({ spell: "Delayed Blast Fireball" }, 200).x, FX.shakeOf({ spell: "Delayed Blast Fireball" }, 200).y) < 0.05);
check("time.freeze", FX.lookTime("icebomb").grow === 820 && FX.plan("spell", "hit", { spell: "Freezing Sphere" }).duration > 2000);
check("time.wall", FX.lookTime("wallice").grow === 360);
check("plan.tick", FX.plan("spell", "hit", { spell: "Hunger of Hadar", pulse: true }).duration < 900);

const kept = FX.sanitize({ type: "spell", spell: "Fire Storm", dmg: "fire", garnish: "detonate", facing: 1.2, hops: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }, { x: 7, y: 8 }, { x: 9, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 5 }] });
check("sanitize.storm", kept && kept.garnish === "detonate" && kept.facing === 1.2 && kept.hops && kept.hops.length === 7, JSON.stringify(kept && { n: kept.hops && kept.hops.length, garnish: kept.garnish }));

check("zone.layer", typeof FX.zoneLayer === "function");
const idle = [];
{
  const ops = trace({ spell: "Cloud of Daggers", quiet: true }, 4000, Object.assign({}, g, { quiet: true }));
  check("paint.daggers.idle", ops.some((op) => op.op === "fillRect") && (hasColor(ops, "90,95,105") || hasColor(ops, "220,225,235")));
  idle.push(ops.length);
}

vm.runInContext(read("assets/js/spell-tokens.js"), sandbox);
const Tok = sandbox.SSDNSSpellTokens;
check("token.none", Tok.isToken("Freezing Sphere") === false && Tok.isToken("Delayed Blast Fireball") === false && Tok.isToken("Guardian of Faith") === true && Tok.isToken("Flaming Sphere") === true);

const map = read("map/ssdns-map.js");
check("map.zone", map.includes("chunk4ZoneKey") && map.includes("paintChunk4Zone") && map.includes("noteChunk4ZoneGone") && map.includes("hungerVoidTint"));
check("map.wallfire", map.includes("paintWallOfFire"));
const sheet = read("assets/js/sheet-extras.js");
const dm = read("dm/assets/js/v2.js");
check("wire.firestorm", sheet.includes("postPlacedLooks") && dm.includes("fire storm") && sheet.includes("garnish: \"detonate\"") && dm.includes("garnish: \"detonate\""));
check("src.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.312-p1c") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.325-p1c"));
check("ver", JSON.parse(read("version.json")).sheet === "0.3.312" && JSON.parse(read("version.json")).dmcc === "0.2.325");

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall chunk4 fx checks passed");
process.exit(failures.length ? 1 : 0);

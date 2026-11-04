/**
 * Chunk 3 Phase 1 map FX. Real SSDNSMapFx.paint only (the tip overlay painter).
 *   node tools/test-chunk3-fx.mjs
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
        else if (p === "fillRect") ops.push({ op: "fillRect", x: args[0], y: args[1], fillStyle, composite });
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
function hasText(ops, text) {
  return ops.some((op) => op.op === "fillText" && String(op.text) === text);
}
function thick(ops, min) {
  return ops.some((op) => op.op === "stroke" && op.lineWidth >= min);
}
function lineFromTo(ops, A, B, slack) {
  return ops.some((op) => op.op === "stroke" && op.pts && op.pts.length >= 2
    && Math.hypot(op.pts[0][0] - A.x, op.pts[0][1] - A.y) < slack
    && Math.hypot(op.pts[op.pts.length - 1][0] - B.x, op.pts[op.pts.length - 1][1] - B.y) < slack);
}

const cell = 70;
const A = { x: 90, y: 240 };
const S = { x: 64, y: 240 };
const T = { x: 430, y: 250 };
const g = { A: A, B: { x: T.x - 12, y: T.y }, S: S, T: T, rS: 22, rT: 22, cell: cell, dir: { x: 1, y: 0.02 } };
function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }

check("look.sky", look("Call Lightning", "lightning") === "skybolt" && look("Lightning Bolt", "lightning") === "lightning" && look("Chain Lightning", "lightning") === "chain-lightning");
check("look.sun", look("Sunbeam", "radiant") === "sunshaft" && look("Sacred Flame") === "sacred-flame");
check("look.death", look("Finger of Death", "necrotic") === "deathray" && look("Harm", "necrotic") === "deathray");
check("look.prism", look("Prismatic Spray") === "prism");
check("look.meteor", look("Meteor Swarm", "fire") === "meteors" && look("Fireball", "fire") === "fireball");
check("look.guard", look("Guardian of Faith") === "token");
check("look.orb", look("Chromatic Orb", "cold") === "orb" && look("Chromatic Orb", "fire") === "orb");
check("look.flame", look("Produce Flame", "fire") === "produceflame" && look("Flame Blade", "fire") === "flameblade");
check("look.frost", look("Ray of Frost", "cold") === "cold" && look("Ray of Frost Shell") === "cold");
check("look.ice", look("Ice Storm", "bludgeoning and cold") === "hailstorm" && look("Hailstorm") === "hailstorm" && look("Freezing Sphere") === "icebomb");
check("look.sick", look("Ray of Sickness", "poison") === "sickray" && look("Poison Spray") === "poison-spray");
check("look.smites", look("Searing Smite", "fire") === "smitefire" && look("Branding Smite") === "brand" && look("Hunter's Mark") === "brand" && look("Thunderous Smite") === "thunder" && look("Wrathful Smite") === "fear" && look("Blinding Smite") === "blind");
check("look.deferred", look("Banishing Smite") === "banish" && look("Staggering Smite") === "stagger");
check("look.hail", look("Hail of Thorns") === "thorn" && look("Thorn Whip") === "thorn");
check("sticky.frost", FX.stickyLook("Speed −10") === "frostray" && FX.stickyLook("Produce flame") === "produceflame" && FX.stickyLook("Poisoned") === "sickray");
check("sticky.brand", FX.stickyLook("Branded") === "brand" && FX.stickyLook("Marked") === "brand");

const sky = trace({ spell: "Call Lightning", dmg: "lightning" }, 560, g);
check("paint.sky", hasColor(sky, "85,120,240") && hasColor(sky, "232,236,255") && !lineFromTo(sky, A, T, 30));
const bolt = trace({ spell: "Lightning Bolt", dmg: "lightning" }, 40, g);
check("paint.bolt.line", lineFromTo(bolt, A, g.B, 40) || bolt.length > 0);

const sun = trace({ spell: "Sunbeam", dmg: "radiant" }, 200, Object.assign({}, g, { hops: [{ x: 260, y: 244 }, { x: 400, y: 248 }] }));
check("paint.sun", hasColor(sun, "255,232,170") || hasColor(sun, "255,250,230"));
check("paint.sun.blind", hasColor(sun, "255,250,235"));

const death = trace({ spell: "Finger of Death", dmg: "necrotic" }, 180, g);
const harm = trace({ spell: "Harm", dmg: "necrotic" }, 180, g);
check("paint.death", thick(death, 18) && hasColor(death, "6,3,8") && hasColor(death, "185,170,180"));
check("paint.harm.pulse", (hasColor(harm, "6,3,8") || hasColor(harm, "95,45,100")) && !thick(harm, 18) && !lineFromTo(harm, A, T, 40));
const rise = trace({ spell: "Finger of Death", dmg: "necrotic", rise: true }, 400, g);
check("paint.rise", hasColor(rise, "140,160,130"));
const grey = FX.nudge({ type: "spell", spell: "Finger of Death", rise: true }, 500, g);
const live = FX.nudge({ type: "spell", spell: "Finger of Death" }, 500, g);
check("grey.kill", grey.grey > 0.5 && live.grey === 0, JSON.stringify({ grey: grey, live: live }));

const fan = trace({ spell: "Prismatic Spray" }, 200, Object.assign({}, g, { facing: 0, hops: [{ x: 300, y: 220, kind: "fire" }, { x: 340, y: 280, kind: "cold" }] }));
check("paint.prism", hasColor(fan, "140,40,35") && hasColor(fan, "190,95,40") && hasColor(fan, "230,225,210"));
check("paint.prism.blend", fan.some((op) => op.composite !== "lighter" && (op.fillStyle || "").indexOf("140,40,35") >= 0));

const rock = trace({ spell: "Meteor Swarm", dmg: "fire", beat: 1 }, 200, g);
check("paint.meteor", hasColor(rock, "255,125,35") || hasColor(rock, "255,242,205"));
check("paint.meteor.sky", rock.some((op) => op.op === "arc" && op.y < g.B.y - cell));
const ball = trace({ spell: "Fireball", dmg: "fire" }, 200, g);
check("paint.fireball.notSky", !ball.some((op) => op.op === "arc" && op.y < 0));

const guard = trace({ spell: "Guardian of Faith", garnish: "place" }, 80, g);
check("paint.guard.puff", look("Guardian of Faith") === "token" && (hasColor(guard, "255,250,230") || hasColor(guard, "255,232,170")));
const swipe = trace({ spell: "Guardian of Faith", garnish: "swipe" }, 80, g);
check("paint.guard.swipe", hasColor(swipe, "255,232,170") || hasColor(swipe, "230,175,70"));

["fire", "cold", "lightning", "acid", "poison", "thunder"].forEach((type) => {
  const ops = trace({ spell: "Chromatic Orb", dmg: type }, 80, g);
  const core = {
    fire: "255,125,35", cold: "200,225,250", lightning: "85,120,240",
    acid: "125,180,40", poison: "195,185,110", thunder: "235,215,170"
  }[type];
  check("paint.orb." + type, hasColor(ops, core));
});

const held = trace({ spell: "Produce Flame", self: true }, 200, Object.assign({}, g, { T: S, B: S }));
check("paint.held", hasColor(held, "255,242,205") || hasColor(held, "255,125,35"));
const thrown = trace({ spell: "Produce Flame", dmg: "fire" }, 160, g);
check("paint.throw", hasColor(thrown, "255,125,35") || hasColor(thrown, "255,140,45"));

const frost = trace({ spell: "Ray of Frost", dmg: "cold" }, 200, g);
const ice = trace({ spell: "Ice Storm", dmg: "cold" }, 200, g);
check("paint.frost", (hasColor(frost, "250,252,255") || hasColor(frost, "200,225,250")) && hasText(frost, "SPD −10"));
check("paint.ice.notChip", !hasText(ice, "SPD −10"));
const sick = trace({ spell: "Ray of Sickness", dmg: "poison" }, 220, g);
check("paint.sick", hasColor(sick, "195,185,110") && hasText(sick, "POISONED"));

const sear = trace({ spell: "Searing Smite", dmg: "fire" }, 200, g);
check("paint.searing", hasColor(sear, "255,125,35") || hasColor(sear, "255,242,205"));
const brand = trace({ spell: "Branding Smite" }, 240, g);
const mark = trace({ spell: "Hunter's Mark" }, 240, g);
check("paint.branding", hasColor(brand, "255,232,170") || hasColor(brand, "255,250,230"));
check("paint.mark.kept", hasColor(mark, "255,232,170") || hasColor(mark, "230,175,70"));
const boom = trace({ spell: "Thunderous Smite", dmg: "thunder" }, 240, g);
const wedge = trace({ dmg: "thunder" }, 80, g);
check("paint.thunderous", hasColor(boom, "235,215,170") || hasColor(boom, "95,80,60"));
check("paint.thunder.wedge", wedge.length > 0 && !hasText(wedge, "POISONED"));
const wrath = trace({ spell: "Wrathful Smite" }, 280, g);
check("paint.wrath", hasColor(wrath, "170,90,190") || hasColor(wrath, "95,45,100"));
const blind = trace({ spell: "Blinding Smite" }, 220, g);
check("paint.blind", hasColor(blind, "255,250,235"));
const hail = trace({ spell: "Hail of Thorns" }, 160, g);
check("paint.hail.burst", hasColor(hail, "40,38,18") || hasColor(hail, "150,175,80"));
const hailNudge = FX.nudge({ type: "spell", spell: "Hail of Thorns", result: "hit" }, 400, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
check("paint.hail.noyank", hailNudge.dx === 0 && hailNudge.dy === 0, JSON.stringify(hailNudge));

check("shake.sky", Math.hypot(FX.shakeOf({ spell: "Call Lightning" }, 610).x, FX.shakeOf({ spell: "Call Lightning" }, 610).y) > 0.4);
check("shake.meteor", Math.hypot(FX.shakeOf({ spell: "Meteor Swarm", beat: 0 }, 430).x, FX.shakeOf({ spell: "Meteor Swarm" }, 430).y) > 0.4);
check("shake.smite.early", Math.hypot(FX.shakeOf({ spell: "Thunderous Smite" }, 40).x || 0, FX.shakeOf({ spell: "Thunderous Smite" }, 40).y || 0) < 0.05);
check("time.thunder", FX.lookTime("thunder").grow === 110);
check("plan.meteor", FX.plan("spell", "hit", { spell: "Meteor Swarm", beat: 2 }).impactAt > FX.plan("spell", "hit", { spell: "Meteor Swarm" }).impactAt);

const kept = FX.sanitize({ type: "spell", spell: "Chromatic Orb", dmg: "poison", beat: 2, garnish: "swipe", rise: true });
check("sanitize.orb", kept && kept.dmg === "poison" && kept.beat === 2 && kept.garnish === "swipe" && kept.rise === true, JSON.stringify(kept));

vm.runInContext(read("assets/js/spell-tokens.js"), sandbox);
const Tok = sandbox.SSDNSSpellTokens;
check("held.flame", Tok.isHeld("Produce Flame") === true && Tok.isToken("Produce Flame") === false && Tok.isToken("Guardian of Faith") === true);
check("src.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.223-p2a") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.236-p2a"));
check("ver", JSON.parse(read("version.json")).sheet === "0.3.229" && JSON.parse(read("version.json")).dmcc === "0.2.242");

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall chunk3 fx checks passed");
process.exit(failures.length ? 1 : 0);

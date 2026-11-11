/**
 * Phase 2 spice first cut (sheet 0.3.223 / DMCC 0.2.236).
 * Ice Storm is a 20-ft hail cylinder on the live painter. Ray of Frost stays the needle.
 * Freezing Sphere stays the lobbed icebomb. Slick ice and the damage row stay.
 * rules.js is not edited.
 *   node tools/test-phase2-spice.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.294" && version.sheetBuild === "sheet-playtest-v03294");
check("ver.dmcc", version.dmcc === "0.2.307" && version.dmccBuild === "dmcc-playtest-v02307");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.294"') && read("assets/js/app.js").includes("sheet-playtest-v03294"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.307"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02307"));
check("html.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.294-p1c") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.307-p1c"));
const rulesDiff = execSync("git diff --name-only HEAD -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const fxSrc = read("map/ssdns-map-fx.js");
const mapSrc = read("map/ssdns-map.js");
check("gate.fxOn", mapSrc.includes("function fxOn()") && mapSrc.includes("if (!FXA || !spec || !fxOn() || !state.scene) return null"));
check("gate.frame", mapSrc.includes("if (dead || !fxOn()) return false"));
check("no.mock", fxSrc.includes("function hailstormPaint") && fxSrc.includes("function gritBurst") && !read("index.html").includes("hailstormOver") && !read("dm/index.html").includes("hailstormOver"));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
vm.runInContext(fxSrc, context);
const Cast = context.SSDNSSpellCast;
const R = context.SSDNSSpellRiders;
const Z = context.SSDNSSpellZones;
const FX = context.SSDNSMapFx;

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  let strokeStyle = "";
  let lineWidth = 0;
  let composite = "";
  let cur = [];
  let lastArc = null;
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") { cur = []; lastArc = null; }
        else if (p === "moveTo" || p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "fillRect") ops.push({ op: "fillRect", x: args[0], y: args[1], fillStyle, composite });
        else if (p === "arc") {
          lastArc = { x: args[0], y: args[1], r: args[2] };
          ops.push({ op: "arc", x: args[0], y: args[1], r: args[2], fillStyle, strokeStyle });
        }
        else if (p === "fill") ops.push({ op: "fill", fillStyle, composite, n: cur.length, arc: lastArc });
        else if (p === "stroke") ops.push({ op: "stroke", strokeStyle, composite, lineWidth, n: cur.length, arc: lastArc, pts: cur.slice() });
        else if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : "";
      if (p === "lineWidth") lineWidth = Number(v) || 0;
      if (p === "globalCompositeOperation") composite = String(v || "");
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}
function hasColor(ops, rgb) {
  return ops.some((op) => (op.fillStyle && op.fillStyle.indexOf(rgb) >= 0) || (op.strokeStyle && op.strokeStyle.indexOf(rgb) >= 0));
}
function hasText(ops, text) {
  return ops.some((op) => op.text === text);
}
function maxArc(ops) {
  return ops.reduce((m, op) => (op.op === "arc" || (op.arc && op.arc.r)) ? Math.max(m, (op.r || (op.arc && op.arc.r) || 0)) : m, 0);
}
function lineFromTo(ops, A, B, slack) {
  return ops.some((op) => op.op === "stroke" && op.pts && op.pts.length >= 2
    && Math.hypot(op.pts[0][0] - A.x, op.pts[0][1] - A.y) < slack
    && Math.hypot(op.pts[op.pts.length - 1][0] - B.x, op.pts[op.pts.length - 1][1] - B.y) < slack);
}

const cell = 70;
const A = { x: 120, y: 360 };
const T = { x: 520, y: 250 };
const g = { A: A, B: T, S: A, T: T, rS: 22, rT: 18, cell: cell, dir: { x: 1, y: 0 } };

check("look.hail", FX.lookOf({ type: "spell", spell: "Ice Storm", dmg: "bludgeoning and cold" }) === "hailstorm");
check("look.alias", FX.lookOf({ type: "spell", spell: "Ice Storm (Hailstorm)" }) === "hailstorm" && FX.lookOf({ type: "spell", spell: "Hailstorm" }) === "hailstorm");
check("look.kept", FX.lookOf({ type: "spell", spell: "Ray of Frost", dmg: "cold" }) === "cold"
  && FX.lookOf({ type: "spell", spell: "Freezing Sphere" }) === "icebomb"
  && FX.lookOf({ type: "spell", spell: "Cone of Cold", dmg: "cold" }) === "coldcone"
  && FX.lookOf({ type: "spell", spell: "Sleet Storm", dmg: "cold" }) === "cold");

const fall = trace({ spell: "Ice Storm", dmg: "bludgeoning and cold" }, 200, g);
check("ice.cloud", fall.some((op) => op.op === "arc" && op.y < T.y - cell && op.r < cell * 3), JSON.stringify(fall.filter((op) => op.op === "arc").map((op) => [Math.round(op.y), Math.round(op.r)])));
check("ice.shards", hasColor(fall, "200,225,250") && hasColor(fall, "95,80,60"));
check("ice.nobeam", !lineFromTo(fall, A, T, 40));
check("ice.notChip", !hasText(fall, "SPD −10") && !hasText(fall, "SPD -10"));

const boom = trace({ spell: "Ice Storm", dmg: "cold" }, 800, g);
const iceR = maxArc(boom);
check("ice.cylinder", iceR > cell * 3 && iceR <= cell * 4.05, "r " + Math.round(iceR));
check("ice.grit", boom.some((op) => op.op === "fillRect" && op.composite === "source-over" && /95,\s*80,\s*60|200,\s*225,\s*250/.test(op.fillStyle || "")));
const gone = trace({ spell: "Ice Storm" }, 2100, g);
check("ice.ends", gone.length === 0, "ops " + gone.length);
const plan = FX.plan("spell", "hit", { spell: "Ice Storm", dmg: "bludgeoning and cold" });
check("ice.plan", plan.look === "hailstorm" && plan.impactAt === 520 && plan.duration > 1900 && plan.duration < 2300, JSON.stringify(plan));
check("ice.shake", Math.hypot(FX.shakeOf({ spell: "Ice Storm" }, 200).x, FX.shakeOf({ spell: "Ice Storm" }, 200).y) < 0.05
  && Math.hypot(FX.shakeOf({ spell: "Ice Storm" }, 620).x, FX.shakeOf({ spell: "Ice Storm" }, 620).y) > 0.4);

const frost = trace({ spell: "Ray of Frost", dmg: "cold" }, 200, g);
check("frost.needle", hasColor(frost, "250,252,255") || hasColor(frost, "200,225,250"));
check("frost.chip", frost.some((op) => op.op === "fill" && /SPD/.test(op.fillStyle || "")) || fxSrc.includes("SPD \\u221210"));
const bomb = trace({ spell: "Freezing Sphere" }, 1000, g);
check("bomb.wider", maxArc(bomb) > cell * 6 && maxArc(bomb) > iceR + cell, "bomb " + Math.round(maxArc(bomb)));

const iceRow = R.patchRow(Cast.lookup("Ice Storm"));
const slick = Z.buildZone("Ice Storm", { origin: { x: 6, y: 6 } }, { slot: 4, casterId: "ada" });
check("ice.dice", iceRow.dice === "2d8+4d6" && iceRow.save === "DEX" && iceRow.half === true);
check("ice.zone", slick && slick.tag === "slick-ice" && slick.difficult && slick.rounds === 2 && !slick.deferCast);

const thorn = trace({ spell: "Thorn Whip" }, 220, Object.assign({}, g, { yank: { x: -80, y: 0 } }));
check("spice.thorn", thorn.some((op) => op.op === "fillRect" && /95,\s*80,\s*60|120,\s*100,\s*75/.test(op.fillStyle || "")));
const fan = trace({ spell: "Prismatic Spray" }, 200, Object.assign({}, g, { facing: 0 }));
check("spice.prism", fan.some((op) => op.op === "fillRect" && op.composite === "source-over" && /95,\s*80,\s*60/.test(op.fillStyle || "")));
const sun = trace({ spell: "Sunbeam", dmg: "radiant" }, 200, g);
check("spice.sun", sun.some((op) => op.op === "fillRect" && /178,\s*168,\s*150|120,\s*100,\s*75/.test(op.fillStyle || "")));
const rock = trace({ spell: "Meteor Swarm", dmg: "fire", beat: 0 }, 700, g);
check("spice.meteor", rock.some((op) => op.op === "fillRect" && /45,\s*28,\s*20|95,\s*80,\s*60/.test(op.fillStyle || "")));
const skyRock = trace({ spell: "Meteor Swarm", dmg: "fire", beat: 1 }, 200, g);
check("spice.meteor.travel", skyRock.some((op) => op.op === "arc" && op.y < g.B.y - cell) && !skyRock.some((op) => op.op === "fillRect" && /45,\s*28,\s*20/.test(op.fillStyle || "")));
const boomSmite = trace({ spell: "Thunderous Smite", dmg: "thunder" }, 280, g);
check("spice.thunder", boomSmite.some((op) => op.op === "fillRect" && /95,\s*80,\s*60/.test(op.fillStyle || "")));
const strike = trace({ spell: "Flame Strike", dmg: "fire" }, 400, g);
check("spice.strike", strike.some((op) => op.op === "fillRect" && /95,\s*80,\s*60/.test(op.fillStyle || "")));
const storm = trace({ spell: "Fire Storm", dmg: "fire" }, 400, Object.assign({}, g, { hops: [{ x: 600, y: 180 }] }));
check("spice.firestorm", storm.some((op) => op.op === "fillRect" && /95,\s*80,\s*60|45,\s*28,\s*20/.test(op.fillStyle || "")) && !hasColor(storm, "230,175,70"));
const burst = trace({ spell: "Sunburst" }, 400, g);
check("spice.sunburst", burst.some((op) => op.op === "fillRect" && /178,\s*168,\s*150/.test(op.fillStyle || "")) && maxArc(burst) > cell * 6);
const debris = trace({ spell: "Freezing Sphere" }, 1100, g);
const lob = trace({ spell: "Freezing Sphere" }, 160, g);
check("spice.freeze", debris.some((op) => op.op === "fillRect" && /200,\s*225,\s*250|95,\s*80,\s*60/.test(op.fillStyle || "")) && maxArc(lob) < 80);
const cone = trace({ spell: "Cone of Cold", dmg: "cold" }, 400, Object.assign({}, g, { facing: 0 }));
check("spice.snow", cone.some((op) => op.op === "fillRect" && /250,\s*252,\s*255/.test(op.fillStyle || "")));
const volley = trace({ spell: "Conjure Volley" }, 400, g);
check("spice.volley", volley.some((op) => op.op === "fillRect" && /120,\s*95,\s*70|95,\s*80,\s*60/.test(op.fillStyle || "")));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("phase2 spice ok");

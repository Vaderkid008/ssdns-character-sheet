/**
 * Chunk 2 Phase 1 map FX. Real SSDNSMapFx.paint only (the tip overlay painter).
 *   node tools/test-chunk2-fx.mjs
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
  let cur = [];
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") cur = [];
        else if (p === "moveTo" || p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "fillRect") ops.push({ op: "fillRect", x: args[0], y: args[1], fillStyle });
        else if (p === "fill" || p === "fillText") ops.push({ op: p, pts: cur.slice(), fillStyle, text: args[0] });
        else if (p === "stroke") ops.push({ op: "stroke", pts: cur.slice(), strokeStyle });
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

const cell = 70;
const A = { x: 90, y: 240 };
const S = { x: 64, y: 240 };
const T = { x: 430, y: 250 };
const g = { A: A, B: { x: T.x - 12, y: T.y }, S: S, T: T, rS: 22, rT: 22, cell: cell, dir: { x: 1, y: 0.02 } };
function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }

check("look.hex", look("Hex") === "hex" && look("Hex", "necrotic") === "hex" && FX.stickyLook("Hexed (WIS)") === "hex");
check("look.mark", look("Hunter's Mark") === "brand" && FX.stickyLook("Marked") === "brand");
check("look.grasp", look("Shocking Grasp") === "shocking-grasp" && look("Shocking Grasp", "lightning") === "shocking-grasp" && look("Shocking Grasp Shell") === "shocking-grasp");
check("look.grasp.notBolt", look("Lightning Bolt", "lightning") === "lightning" && look("Chain Lightning", "lightning") === "chain-lightning" && look("Fire Bolt", "fire") === "fire");
check("look.thorn", look("Thorn Whip") === "thorn" && look("Hail of Thorns") === "thorn");
check("look.rest", look("Hellish Rebuke", "fire") === "rebuke" && look("Flame Blade", "fire") === "flameblade" && look("Heat Metal", "fire") === "heat");
check("look.shield", look("Fire Shield") === "fireshield" && FX.stickyLook("Fire Shield (Chill: resist fire)") === "rime" && FX.stickyLook("Fire Shield (Warm: resist cold)") === "fireshield");
check("look.touch", look("Vampiric Touch") === "siphon" && look("Ray of Enfeeblement") === "enfeeble" && FX.stickyLook("Enfeebled (½ STR weapon dmg)") === "enfeeble");
check("look.sphere", look("Flaming Sphere", "fire") === "token" && look("Spiritual Weapon", "force") === "token");
check("look.cage", FX.stickyLook("No reactions") === "cage");

const graspPlan = FX.plan("spell", "hit", { spell: "Shocking Grasp" });
const boltPlan = FX.plan("spell", "hit", { spell: "Lightning Bolt", dmg: "lightning" });
check("time.grasp", graspPlan.look === "shocking-grasp" && graspPlan.duration > 2500, String(graspPlan.duration));
check("time.bolt", boltPlan.look === "lightning" && boltPlan.duration < 800, String(boltPlan.duration));
check("time.pulse", FX.plan("spell", "hit", { spell: "Hex", pulse: true }).duration < 1000);
check("shake.grasp", Math.hypot(FX.shakeOf({ spell: "Shocking Grasp" }, 90).x, FX.shakeOf({ spell: "Shocking Grasp" }, 90).y) > 0.4);
check("shake.rebuke", Math.hypot(FX.shakeOf({ spell: "Hellish Rebuke" }, 460).x, FX.shakeOf({ spell: "Hellish Rebuke" }, 460).y) > 0.4);
check("shake.bolt", Math.hypot(FX.shakeOf({ spell: "Lightning Bolt", dmg: "lightning" }, 40).x || 0, 0) === 0);

const hex = trace({ spell: "Hex" }, 900, g);
check("paint.hex", hasColor(hex, "170,90,190") && hasColor(hex, "95,45,100"));
const brand = trace({ spell: "Hunter's Mark" }, 800, g);
check("paint.brand", hasColor(brand, "255,232,170") || hasColor(brand, "230,175,70"));
const grasp = trace({ spell: "Shocking Grasp", dmg: "lightning" }, 140, g);
check("paint.grasp", hasColor(grasp, "85,120,240") && hasColor(grasp, "232,236,255"));
const vine = trace({ spell: "Thorn Whip" }, 160, Object.assign({}, g, { yank: { x: -140, y: 0 }, ghost: { x: T.x, y: T.y } }));
check("paint.thorn", hasColor(vine, "40,38,18") && hasColor(vine, "90,95,45"));
const hail = trace({ spell: "Hail of Thorns" }, 160, g);
check("paint.hail.burst", hasColor(hail, "40,38,18") || hasColor(hail, "150,175,80"));
const hailNudge = FX.nudge({ type: "spell", spell: "Hail of Thorns", result: "hit" }, 400, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
check("paint.hail.noyank", hailNudge.dx === 0 && hailNudge.dy === 0, JSON.stringify(hailNudge));
const rebuke = trace({ spell: "Hellish Rebuke", dmg: "fire" }, 520, g);
check("paint.rebuke", hasColor(rebuke, "255,125,35") || hasColor(rebuke, "200,60,15"));
const blade = trace({ spell: "Flame Blade", self: true }, 500, Object.assign({}, g, { T: S, B: S }));
check("paint.blade.hold", hasColor(blade, "255,125,35") && hasColor(blade, "40,24,12"));
const swing = trace({ spell: "Flame Blade" }, 180, g);
check("paint.blade.swing", hasColor(swing, "255,225,160") || hasColor(swing, "255,242,205"));
const heat = trace({ spell: "Heat Metal", dmg: "fire" }, 900, g);
check("paint.heat", hasColor(heat, "255,150,50") || hasColor(heat, "255,245,220"));
const warm = trace({ spell: "Fire Shield", mode: "warm", self: true }, 600, Object.assign({}, g, { T: S, B: S }));
const chill = trace({ spell: "Fire Shield", mode: "chill", self: true }, 600, Object.assign({}, g, { T: S, B: S }));
check("paint.shield.warm", hasColor(warm, "255,125,35") || hasColor(warm, "200,60,15"));
check("paint.shield.chill", hasColor(chill, "200,225,250") || hasColor(chill, "250,252,255"));
const siphon = trace({ spell: "Vampiric Touch" }, 400, g);
check("paint.siphon", hasColor(siphon, "185,170,180") && hasColor(siphon, "6,3,8"));
const ribbon = trace({ spell: "Vampiric Touch" }, 1100, g);
check("paint.siphon.ribbon", hasColor(ribbon, "225,70,80") || hasColor(ribbon, "255,150,160"));
const ray = trace({ spell: "Ray of Enfeeblement" }, 700, g);
check("paint.enfeeble", (hasColor(ray, "120,95,120") || hasColor(ray, "190,178,190")) && hasText(ray, "STR"));
const sphere = trace({ spell: "Flaming Sphere", dmg: "fire" }, 80, g);
check("paint.sphere.token", look("Flaming Sphere") === "token" && (hasColor(sphere, "255,125,35") || hasColor(sphere, "255,242,205")));
check("paint.sphere.notSaber", !hasColor(sphere, "40,24,12"));

const yank = FX.nudge({ type: "spell", spell: "Thorn Whip", result: "hit" }, 640, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
const yankEarly = FX.nudge({ type: "spell", spell: "Thorn Whip", result: "hit" }, 80, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
check("yank.moves", yank.dx < -30 && yankEarly.dx === 0, JSON.stringify({ yank: yank, early: yankEarly }));
const grey = FX.nudge({ type: "spell", spell: "Ray of Enfeeblement", result: "hit" }, 700, g);
const greyEarly = FX.nudge({ type: "spell", spell: "Ray of Enfeeblement", result: "hit" }, 40, g);
const greySave = FX.nudge({ type: "spell", spell: "Ray of Enfeeblement", saved: true }, 300, g);
check("grey.holds", grey.grey > 0.8 && greyEarly.grey === 0 && greySave.grey === 0, JSON.stringify({ grey: grey, early: greyEarly, save: greySave }));

const kept = FX.sanitize({ type: "spell", spell: "Fire Shield", result: "hit", mode: "chill", self: true });
check("sanitize.mode", kept && kept.mode === "chill" && kept.spell === "Fire Shield", JSON.stringify(kept));
const req = FX.request({ type: "spell", spell: "Ray of Enfeeblement", saved: true, mode: "warm" });
check("request.saved", req.saved === true && req.mode === "warm" && req.spell === "Ray of Enfeeblement", JSON.stringify(req));

check("src.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.309-p1c") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.322-p1c"));
check("src.map", read("map/ssdns-map.js").includes("fxBodyNudge") && read("map/ssdns-map.js").includes("tokenIsEnfeebled") && read("map/ssdns-map.js").includes("yankOrigin"));
check("ver", JSON.parse(read("version.json")).sheet === "0.3.309" && JSON.parse(read("version.json")).dmcc === "0.2.322");

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall chunk2 fx checks passed");
process.exit(failures.length ? 1 : 0);

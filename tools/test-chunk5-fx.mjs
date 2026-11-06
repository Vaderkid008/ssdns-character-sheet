/**
 * Chunk 5 Phase 1 map FX. Real SSDNSMapFx.paint only (the tip overlay painter).
 *   node tools/test-chunk5-fx.mjs
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
function maxArc(ops) {
  return ops.reduce((m, op) => (op.op === "arc" && op.r > m ? op.r : m), 0);
}
function highPoint(ops, y) {
  return ops.some((op) => (op.pts || []).some((p) => p[1] < y) || (op.op === "arc" && op.y < y));
}
function hasText(ops, text) {
  return ops.some((op) => op.op === "fillText" && String(op.text || "").indexOf(text) >= 0);
}

const cell = 70;
const A = { x: 90, y: 240 };
const S = { x: 64, y: 240 };
const T = { x: 430, y: 250 };
const g = { A: A, B: { x: T.x - 12, y: T.y }, S: S, T: T, rS: 22, rT: 22, cell: cell, dir: { x: 1, y: 0.02 }, facing: 0.02 };
const near = { x: 470, y: 300 };
const crowd = Object.assign({}, g, { hops: [near] });
function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }

check("look.ammo", look("Conjure Barrage") === "volley" && look("Conjure Volley") === "volley");
check("look.arrow", look("Lightning Arrow", "lightning") === "charged" && look("Lightning Bolt", "lightning") === "lightning");
check("look.hail", look("Hail of Thorns") === "thorn" && look("Thorn Whip") === "thorn");
check("look.wraps", look("Ensnaring Strike") === "ensnare" && look("Contagion") === "fever" && look("Phantasmal Killer") === "specter");
check("look.harm", look("Harm", "necrotic") === "deathray" && look("Finger of Death", "necrotic") === "deathray");
check("look.rest", look("Destructive Wave") === "stomp" && look("Cone of Cold", "cold") === "coldcone");
check("look.verbal", look("Vicious Mockery") === "mockery" && look("Dissonant Whispers") === "whispers");
check("wrap.spell", FX.wrapLook("Restrained", "Ensnaring Strike") === "ensnare" && FX.wrapLook("Restrained", "") === "");
check("wrap.fear", FX.wrapLook("Frightened", "Phantasmal Killer") === "specter" && FX.wrapLook("Frightened", "Fear") === "");
check("wrap.fever", FX.wrapLook("Contagion S○○○ F○○○", "Contagion") === "fever" && FX.wrapLook("Poisoned", "Contagion") === "fever" && FX.wrapLook("Poisoned", "") === "");

const barrage = trace({ spell: "Conjure Barrage" }, 140, g);
check("paint.barrage", hasColor(barrage, "90,95,105") && hasColor(barrage, "95,220,205") && maxArc(barrage) > cell * 6, "r " + Math.round(maxArc(barrage)));
const volley = trace({ spell: "Conjure Volley" }, 240, g);
check("paint.volley", (hasColor(volley, "90,95,105") || hasColor(volley, "255,190,110")) && highPoint(volley, T.y - 60));
check("paint.volley.patch", volley.some((op) => op.op === "arc" && op.r > cell * 4 && Math.abs(op.x - T.x) < 40));
check("paint.barrage.origin", barrage.some((op) => op.op === "arc" && op.r > cell * 6 && Math.abs(op.x - S.x) < 80));

const charged = trace({ spell: "Lightning Arrow", dmg: "lightning" }, 280, crowd);
check("paint.charged", hasColor(charged, "85,120,240") && hasColor(charged, "232,236,255"));
check("shake.charged", Math.hypot(FX.shakeOf({ spell: "Lightning Arrow" }, 230).x, FX.shakeOf({ spell: "Lightning Arrow" }, 230).y) > 0.4);
check("shake.charged.early", Math.hypot(FX.shakeOf({ spell: "Lightning Arrow" }, 40).x, FX.shakeOf({ spell: "Lightning Arrow" }, 40).y) < 0.05);

const hail = trace({ spell: "Hail of Thorns" }, 180, crowd);
const whip = trace({ spell: "Thorn Whip" }, 180, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
check("paint.hail", hasColor(hail, "40,38,18") && (hasColor(hail, "150,175,80") || hasColor(hail, "220,235,170")));
check("paint.whip.kept", whip.length > 0 && (hasColor(whip, "40,38,18") || hasColor(whip, "90,95,45")));
const hailN = FX.nudge({ type: "spell", spell: "Hail of Thorns", result: "hit" }, 400, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
const whipN = FX.nudge({ type: "spell", spell: "Thorn Whip", result: "hit" }, 640, Object.assign({}, g, { yank: { x: -140, y: 0 } }));
check("hail.noyank", hailN.dx === 0 && hailN.dy === 0, JSON.stringify(hailN));
check("whip.yank", whipN.dx < -30, JSON.stringify(whipN));

const vines = trace({ spell: "Ensnaring Strike" }, 360, g);
check("paint.ensnare", hasColor(vines, "40,38,18") && hasColor(vines, "90,95,45"));
const cleared = trace({ spell: "Ensnaring Strike", garnish: "clear" }, 140, g);
check("paint.ensnare.clear", hasColor(cleared, "150,140,125"));
const brand = trace({ spell: "Contagion" }, 520, g);
check("paint.contagion", hasColor(brand, "200,170,70") || hasColor(brand, "195,185,110"));
const gone = trace({ spell: "Phantasmal Killer", garnish: "clear" }, 120, g);
check("paint.specter.clear", hasColor(gone, "150,140,125"));
const ghost = trace({ spell: "Phantasmal Killer" }, 640, g);
check("paint.specter", hasColor(ghost, "128,122,134") || hasColor(ghost, "215,125,170"));

const harm = trace({ spell: "Harm", dmg: "necrotic" }, 200, g);
const death = trace({ spell: "Finger of Death", dmg: "necrotic" }, 200, g);
check("paint.harm", hasColor(harm, "6,3,8") && (hasColor(harm, "95,45,100") || hasColor(harm, "185,170,180")));
check("paint.harm.notRay", harm.every((op) => !(op.op === "stroke" && op.lineWidth >= 18)));
check("paint.death.kept", death.some((op) => op.op === "stroke" && op.lineWidth >= 18));
const grey = FX.nudge({ type: "spell", spell: "Harm", dmg: "necrotic" }, 800, g);
const greyEarly = FX.nudge({ type: "spell", spell: "Harm" }, 80, g);
check("harm.grey", grey.grey > 0.4 && greyEarly.grey === 0, JSON.stringify({ grey: grey.grey, early: greyEarly.grey }));

const stomp = trace({ spell: "Destructive Wave" }, 280, crowd);
const radiant = trace({ spell: "Destructive Wave", mode: "radiant" }, 280, crowd);
check("paint.stomp", (hasColor(stomp, "235,215,170") || hasColor(stomp, "200,170,110")) && (hasColor(stomp, "170,90,190") || hasColor(stomp, "6,3,8")) && maxArc(stomp) > cell * 3, "r " + Math.round(maxArc(stomp)));
check("paint.stomp.radiant", (hasColor(radiant, "230,175,70") || hasColor(radiant, "255,232,170")) && !hasColor(radiant, "170,90,190"));
check("shake.stomp", Math.hypot(FX.shakeOf({ spell: "Destructive Wave" }, 80).x, FX.shakeOf({ spell: "Destructive Wave" }, 80).y) > 0.4);

const cone = trace({ spell: "Cone of Cold", dmg: "cold", facing: 0 }, 400, crowd);
check("paint.cone", (hasColor(cone, "200,225,250") || hasColor(cone, "250,252,255")) && maxArc(cone) > cell * 8, "r " + Math.round(maxArc(cone)));
const ray = trace({ spell: "Ray of Frost", dmg: "cold" }, 200, g);
check("paint.frost.kept", ray.length > 0 && maxArc(cone) > maxArc(ray) + cell);

const mock = trace({ spell: "Vicious Mockery" }, 280, g);
check("paint.mockery", hasColor(mock, "205,188,150") && (hasColor(mock, "215,125,170") || hasColor(mock, "60,62,70")));
check("paint.mockery.noballoon", !hasText(mock, "VICIOUS"));
const whisper = trace({ spell: "Dissonant Whispers" }, 240, g);
check("paint.whispers", hasColor(whisper, "190,170,225"));
const flee = FX.nudge({ type: "spell", spell: "Dissonant Whispers", result: "hit" }, 860, g);
const fleeEarly = FX.nudge({ type: "spell", spell: "Dissonant Whispers" }, 80, g);
check("whispers.flee", flee.dx > cell * 0.4 && fleeEarly.dx === 0, JSON.stringify({ flee: flee, early: fleeEarly }));

const kept = FX.sanitize({ type: "spell", spell: "Destructive Wave", mode: "radiant", garnish: "clear", facing: 1.2 });
check("sanitize.skin", kept && kept.mode === "radiant" && kept.garnish === "clear" && kept.facing === 1.2, JSON.stringify(kept));
check("time.volley", FX.plan("spell", "hit", { spell: "Conjure Volley" }).duration > FX.plan("spell", "hit", { spell: "Conjure Barrage" }).duration);
check("time.clear", FX.plan("spell", "hit", { spell: "Ensnaring Strike", garnish: "clear" }).duration < 1000);

vm.runInContext(read("assets/js/spell-tokens.js"), sandbox);
const Tok = sandbox.SSDNSSpellTokens;
["Conjure Barrage", "Conjure Volley", "Lightning Arrow", "Hail of Thorns", "Ensnaring Strike", "Contagion", "Phantasmal Killer", "Harm", "Destructive Wave", "Cone of Cold", "Vicious Mockery", "Dissonant Whispers"].forEach((name) => {
  check("token.none." + name, Tok.isToken(name) === false);
});
check("token.kept", Tok.isToken("Guardian of Faith") === true && Tok.isToken("Flaming Sphere") === true);

const map = read("map/ssdns-map.js");
check("map.wrap", map.includes("watchWraps") && map.includes("wrapLook") && map.includes("conditionSpells") && map.includes("fxNeighbors"));
check("map.noyank", map.includes("hail of thorns") && map.includes("yankOrigin"));
const sheet = read("assets/js/sheet-extras.js");
const dm = read("dm/assets/js/v2.js");
check("wire.hops", sheet.includes("conjure barrage|conjure volley|cone of cold|destructive wave") && dm.includes("cone of cold|destructive wave"));
check("wire.skin", sheet.includes('pickedMode === "radiant"') && dm.includes('mode === "radiant"'));
check("src.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.233-p1c") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.246-p1c"));
check("ver", JSON.parse(read("version.json")).sheet === "0.3.233" && JSON.parse(read("version.json")).dmcc === "0.2.246");

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall chunk5 fx checks passed");
process.exit(failures.length ? 1 : 0);

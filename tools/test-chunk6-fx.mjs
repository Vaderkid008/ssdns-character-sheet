/**
 * Chunk 6 Phase 1 map FX. Real SSDNSMapFx.paint only (the tip overlay painter).
 *   node tools/test-chunk6-fx.mjs
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
function near(ops, x, y, rad) {
  return ops.some((op) => {
    if (op.op === "arc" && Math.hypot(op.x - x, op.y - y) < rad) return true;
    if ((op.op === "fillRect" || op.op === "strokeRect") && Math.hypot((op.x + (op.w || 0) / 2) - x, (op.y + (op.h || 0) / 2) - y) < rad) return true;
    return (op.pts || []).some((p) => Math.hypot(p[0] - x, p[1] - y) < rad);
  });
}
function shake(spell, lt, extra) {
  const s = FX.shakeOf(Object.assign({ type: "spell", spell: spell }, extra || {}), lt);
  return Math.hypot(s.x, s.y);
}

const cell = 70;
const A = { x: 90, y: 240 };
const S = { x: 64, y: 240 };
const T = { x: 430, y: 250 };
const ally2 = { x: 200, y: 80 };
const ally3 = { x: 700, y: 400 };
const g = { A: A, B: { x: T.x - 12, y: T.y }, S: S, T: T, rS: 22, rT: 22, cell: cell, dir: { x: 1, y: 0.02 } };
const multi = Object.assign({}, g, { hops: [ally2, ally3] });
function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }

check("look.heals", look("Mass Healing Word") === "massword" && look("Mass Cure Wounds") === "masscure" && look("Heal") === "healcolumn");
check("look.kept", look("Healing Word") === "heal" && look("Cure Wounds") === "heal" && look("Sacred Flame") === "sacred-flame");
check("look.fireball", look("Fireball", "fire") === "fireball");

const wordEarly = trace({ spell: "Mass Healing Word" }, 200, multi);
const wordMid = trace({ spell: "Mass Healing Word" }, 500, multi);
const wordLate = trace({ spell: "Mass Healing Word" }, 900, multi);
check("paint.word.pulse", hasColor(wordEarly, "230,175,70") && hasColor(wordEarly, "255,232,170") && maxArc(wordEarly) > cell, "r " + Math.round(maxArc(wordEarly)));
check("paint.word.stagger", near(wordMid, T.x, T.y, 48) && !near(wordEarly, ally3.x, ally3.y, 36) && near(wordLate, ally3.x, ally3.y, 56));
check("paint.word.mote", hasColor(wordMid, "140,195,95") && hasColor(wordMid, "230,215,130"));

const cure = trace({ spell: "Mass Cure Wounds" }, 450, multi);
check("paint.cure.wash", hasColor(cure, "235,160,70") && hasColor(cure, "255,215,150") && near(cure, ally2.x, ally2.y, 70));
check("paint.cure.heavier", maxArc(cure) > 30 && !hasColor(cure, "220,120,80"));

const thread = trace({ spell: "Heal" }, 160, g);
const column = trace({ spell: "Heal" }, 520, g);
const panes = trace({ spell: "Heal" }, 800, g);
const quiet = trace({ spell: "Heal" }, 1200, g);
const cleared = trace({ spell: "Heal", cleared: true }, 1200, g);
check("paint.heal.thread", hasColor(thread, "230,175,70") && !thread.some((op) => op.op === "fillRect"));
check("paint.heal.column", column.some((op) => op.op === "fillRect" && op.y < T.y - cell && op.h > cell) && (hasColor(column, "255,250,230") || hasColor(column, "255,232,170")));
check("paint.heal.panes", hasColor(panes, "220,120,80") && (hasColor(panes, "225,150,55") || hasColor(panes, "245,200,105")));
check("paint.heal.sparkles.off", !hasColor(quiet, "95,220,205"));
check("paint.heal.sparkles.on", hasColor(cleared, "95,220,205"));
check("paint.heal.scale", maxArc(column) > 40 && maxArc(column) < cell * 4, "r " + Math.round(maxArc(column)));

const wordOne = trace({ spell: "Healing Word" }, 240, g);
const sacred = trace({ spell: "Sacred Flame" }, 800, g);
check("paint.word.single", look("Healing Word") === "heal" && hasColor(wordOne, "140,195,95") && maxArc(wordOne) < 50 && !hasColor(wordOne, "220,120,80"));
check("paint.sacred.kept", !hasColor(sacred, "220,120,80") && !sacred.some((op) => op.op === "fillRect" && op.h > cell * 2));

check("shake.none", shake("Heal", 500) < 0.05 && shake("Mass Healing Word", 200) < 0.05 && shake("Mass Cure Wounds", 400) < 0.05 && shake("Heal", 500, { cleared: true }) < 0.05);
check("shake.strike.kept", shake("Flame Strike", 160) > 0.4);

const one = FX.plan("spell", "hit", { spell: "Mass Healing Word" });
const many = FX.plan("spell", "hit", { spell: "Mass Healing Word", hops: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] });
check("time.word", FX.lookTime("massword").grow === 380 && many.duration - one.duration === 800, JSON.stringify({ one: one.duration, many: many.duration }));
check("time.cure", FX.lookTime("masscure").grow === 300);
check("time.heal", FX.lookTime("healcolumn").grow === 410 && FX.plan("spell", "hit", { spell: "Heal" }).duration > 2000);

const tint0 = FX.nudge({ type: "spell", spell: "Mass Healing Word", result: "hit" }, 500, Object.assign({}, multi, { healIndex: 0 }));
const tintLate = FX.nudge({ type: "spell", spell: "Mass Healing Word", result: "hit" }, 500, Object.assign({}, multi, { healIndex: 2 }));
const tintHeal = FX.nudge({ type: "spell", spell: "Heal", result: "hit" }, 500, g);
check("tint.word", tint0 && tint0.tint && tint0.tint.col === "205,220,140" && tint0.tint.a > 0);
check("tint.wait", !tintLate || !tintLate.tint || !(tintLate.tint.a > 0));
check("tint.heal", tintHeal && tintHeal.tint && tintHeal.tint.col === "255,232,170" && tintHeal.dx === 0 && tintHeal.dy === 0);

const kept = FX.sanitize({ type: "spell", spell: "Heal", cleared: true, hops: [{ id: "ally1" }, { id: "ally2" }] });
const plain = FX.sanitize({ type: "spell", spell: "Heal", hops: [{ id: "ally1" }] });
const req = FX.request({ type: "spell", spell: "Mass Cure Wounds", cleared: true, hops: [{ id: "a" }, { id: "b" }] });
check("sanitize.cleared", kept && kept.cleared === true && kept.hops && kept.hops.length === 2 && plain && !plain.cleared);
check("request.cleared", req && req.cleared === true && req.hops && req.hops.length === 2 && req.spell === "Mass Cure Wounds");

const map = read("map/ssdns-map.js");
const dm = read("dm/assets/js/v2.js");
const sheet = read("assets/js/sheet-extras.js");
check("map.tint", map.includes("fxHealSlot") && map.includes("healIndex") && map.includes('look === "massword"'));
check("wire.dm", dm.includes("function chipsPresent") && dm.includes("fxExtra.cleared") && dm.includes("healed.slice(1)"));
check("wire.sheet", sheet.includes("function healFxExtra") && sheet.includes("extra.cleared"));
check("src.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.305-p1c") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.318-p1c"));
check("ver", JSON.parse(read("version.json")).sheet === "0.3.305" && JSON.parse(read("version.json")).dmcc === "0.2.318");

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall chunk6 fx checks passed");
process.exit(failures.length ? 1 : 0);

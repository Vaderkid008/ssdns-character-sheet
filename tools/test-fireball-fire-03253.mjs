/**
 * Fireball burst fills the 20-ft sphere with flames, not a clean disk
 * (sheet 0.3.284 / DMCC 0.2.297).
 *   node tools/test-fireball-fire-03253.mjs
 * The comet is unchanged. rules.js is not regenerated.
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
vm.runInContext(read("assets/data/rules.js"), sandbox);
vm.runInContext(read("map/ssdns-map-fx.js"), sandbox);
const FX = sandbox.SSDNSMapFx;

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  let lastArc = null;
  let cur = [];
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") { cur = []; lastArc = null; }
        else if (p === "moveTo") cur = [[args[0], args[1]]];
        else if (p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "arc") lastArc = { x: args[0], y: args[1], r: args[2] };
        else if (p === "fill") ops.push({ op: "fill", pts: cur.map((q) => [q[0], q[1]]), arc: lastArc, fillStyle });
        else if (p === "stroke") ops.push({ op: "stroke", pts: cur.map((q) => [q[0], q[1]]) });
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}

const cell = 70;
const from = { x: 40, y: 520 };
const boom = { x: 640, y: 160 };
const geo = { A: from, B: boom, S: from, T: boom, rS: 22, rT: 18, cell, dir: { x: 1, y: 0 } };
const flight = FX.lookTime("fireball").grow;
const travel = trace({ spell: "Fireball", dmg: "fire" }, flight * 0.5, geo);
const burst = trace({ spell: "Fireball", dmg: "fire" }, flight + 340, geo);
check("comet", !travel.some((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2));
const cookie = burst.filter((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2.5 && Math.hypot(op.arc.x - boom.x, op.arc.y - boom.y) < 8);
let edge = 0;
burst.forEach((op) => {
  (op.pts || []).forEach((p) => {
    const d = Math.hypot(p[0] - boom.x, p[1] - boom.y);
    if (d > cell * 3.1 && d < cell * 4.6) edge += 1;
  });
});
check("reach", edge >= 8, String(edge));
check("notCookie", cookie.length === 0, String(cookie.length));
check("flames", burst.some((op) => /255,\s*140,\s*45|200,\s*60,\s*15|255,\s*225,\s*160/.test(op.fillStyle || "")));
check("core", burst.some((op) => op.op === "fill" && op.arc && op.arc.r > 8 && op.arc.r < cell * 1.5 && Math.hypot(op.arc.x - boom.x, op.arc.y - boom.y) < 8));
check("look", FX.lookOf({ type: "spell", spell: "Fireball" }) === "fireball" && FX.lookOf({ type: "spell", spell: "Ice Storm" }) === "hailstorm");

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.284" && ver.dmcc === "0.2.297" && ver.sheetBuild === "sheet-playtest-v03284" && ver.dmccBuild === "dmcc-playtest-v02297");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.284") && !read("database.rules.json").includes("0.3.284"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nfireball fire ok");

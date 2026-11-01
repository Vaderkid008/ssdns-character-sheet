/**
 * Burning Hands and Shatter paint the locked Love-it blasts from SSDNSMapFx.paint.
 * Color Spray and Fear stay on the short chunk cone. Thunderwave stays a cube.
 * Fireball, Wall of Fire, and a plain thunder wedge do not move.
 *   node tools/test-bh-shatter-fx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

function loadFx() {
  const sandbox = {
    console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("assets/data/rules.js"), sandbox);
  vm.runInContext(read("map/ssdns-map-fx.js"), sandbox);
  return sandbox.SSDNSMapFx;
}

function trace(FX, spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  let strokeStyle = "";
  let cur = [];
  let lastArc = null;
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") { cur = []; lastArc = null; }
        else if (p === "moveTo") cur = [[args[0], args[1]]];
        else if (p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "arc") lastArc = { x: args[0], y: args[1], r: args[2] };
        else if (p === "fill") ops.push({ op: "fill", n: cur.length, pts: cur.map((q) => [q[0], q[1]]), arc: lastArc, fillStyle });
        else if (p === "stroke") ops.push({ op: "stroke", n: cur.length, pts: cur.map((q) => [q[0], q[1]]), arc: lastArc, strokeStyle });
        else if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : "";
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}

function uniq(pts) {
  const u = [];
  pts.forEach((p) => {
    const last = u[u.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.5) u.push(p);
  });
  if (u.length >= 2 && Math.hypot(u[0][0] - u[u.length - 1][0], u[0][1] - u[u.length - 1][1]) < 1.5) u.pop();
  return u;
}

function classify(pts) {
  const u = uniq(pts);
  if (u.length === 3) return { kind: "wedge", n: 3 };
  if (u.length !== 4) return { kind: "other", n: u.length };
  const sides = [0, 1, 2, 3].map((i) => Math.hypot(u[(i + 1) % 4][0] - u[i][0], u[(i + 1) % 4][1] - u[i][1]));
  const side = sides.reduce((s, v) => s + v, 0) / 4;
  const square = side > 1 && sides.every((s) => Math.abs(s - side) < side * 0.12);
  return { kind: square ? "square" : "quad", n: 4, side };
}

/* Largest triangle whose apex sits on the palm. ray is the mean side, base the far edge. */
function coneOf(ops, A) {
  let best = null;
  ops.forEach((op) => {
    if (op.op !== "fill" || op.n < 3) return;
    const u = uniq(op.pts);
    if (u.length !== 3) return;
    let apex = 0, ad = Infinity;
    u.forEach((p, i) => {
      const d = Math.hypot(p[0] - A.x, p[1] - A.y);
      if (d < ad) { ad = d; apex = i; }
    });
    if (ad > 8) return;
    const b = u[(apex + 1) % 3], c = u[(apex + 2) % 3];
    const ray = (Math.hypot(b[0] - A.x, b[1] - A.y) + Math.hypot(c[0] - A.x, c[1] - A.y)) / 2;
    const base = Math.hypot(b[0] - c[0], b[1] - c[1]);
    const mid = { x: (b[0] + c[0]) / 2, y: (b[1] + c[1]) / 2 };
    if (!best || ray > best.ray) best = { ray, base, ratio: ray ? base / ray : 0, mid };
  });
  return best;
}

function mag(FX, spec, lt) {
  const s = FX.shakeOf(Object.assign({ type: "spell" }, spec), lt) || { x: 0, y: 0 };
  return Math.hypot(s.x || 0, s.y || 0);
}
function peakShake(FX, spec, from, to) {
  let peak = 0;
  for (let t = from; t <= to; t += 8) peak = Math.max(peak, mag(FX, spec, t));
  return peak;
}

const FX = loadFx();
const cell = 70;
const palm = { x: 220, y: 280 };
const east = { x: palm.x + cell * 3, y: palm.y };
const aim = { x: 1, y: 0 };
function geo(B, extra) {
  return Object.assign({ A: palm, B, S: palm, T: B, rS: 22, rT: 18, cell, dir: aim }, extra || {});
}

const handsTime = FX.lookTime("firecone");
const shatterTime = FX.lookTime("shatter");
const chip = FX.lookTime("limelight");
check("time.hands", handsTime.grow === 160 && handsTime.hold === 380 && handsTime.fade === 900, JSON.stringify(handsTime));
check("time.shatter", shatterTime.grow === 180 && shatterTime.hold === 260 && shatterTime.fade === 1100, JSON.stringify(shatterTime));
check("time.chip", chip.grow === 90 && chip.hold === 50 && chip.fade === 180 && FX.lookTime("terror").grow === 90, JSON.stringify(chip));
check("time.kept", FX.lookTime("fireball").grow === 380 && FX.lookTime("thundercube").fade === 1700 && FX.lookTime("thunder").grow === 110);

const handsPlan = FX.plan("spell", "hit", { spell: "Burning Hands" });
const fanPlan = FX.plan("spell", "hit", { spell: "Powder Fan" });
const shatterPlan = FX.plan("spell", "hit", { spell: "Shatter" });
const sprayPlan = FX.plan("spell", "hit", { spell: "Color Spray" });
check("plan.hands", handsPlan.look === "firecone" && handsPlan.impactAt === 160 && handsPlan.duration === 1620, JSON.stringify(handsPlan));
check("plan.fan", fanPlan.look === "firecone" && fanPlan.duration === 1620, JSON.stringify(fanPlan));
check("plan.shatter", shatterPlan.look === "shatter" && shatterPlan.impactAt === 180 && shatterPlan.duration === 1720, JSON.stringify(shatterPlan));
check("plan.spray", sprayPlan.look === "limelight" && sprayPlan.duration === 500, JSON.stringify(sprayPlan));
check("look.names", FX.lookOf({ type: "spell", spell: "Burning Hands", dmg: "fire" }) === "firecone"
  && FX.lookOf({ type: "spell", spell: "Burning Hands (Powder Fan)" }) === "firecone"
  && FX.lookOf({ type: "spell", spell: "Shatter (Resonance)", dmg: "thunder" }) === "shatter"
  && FX.lookOf({ type: "spell", spell: "Thunderous Smite" }) === "thunder"
  && FX.lookOf({ type: "spell", spell: "Fear" }) === "terror"
  && FX.lookOf({ type: "spell", spell: "Color Spray" }) === "limelight");

const hands = trace(FX, { spell: "Burning Hands", dmg: "fire" }, 300, geo(east));
const cone = coneOf(hands, palm);
check("hands.shape", !!(cone && cone.ray > cell * 2.5 && cone.ray < cell * 3.2 && cone.ratio > 0.86 && cone.ratio < 0.94), JSON.stringify(cone));
check("hands.east", !!(cone && cone.mid.x > palm.x + cell * 2.4 && Math.abs(cone.mid.y - palm.y) < cell * 0.45), JSON.stringify(cone && cone.mid));
check("hands.hot", hands.some((op) => /255,\s*125,\s*35|255,\s*140,\s*45|255,\s*200,\s*120|200,\s*60,\s*15/.test(op.fillStyle + op.strokeStyle)));
check("hands.sparks", hands.filter((op) => op.op === "stroke" && op.n >= 2).length >= 8, String(hands.filter((op) => op.op === "stroke").length));
check("hands.notBeam", !hands.some((op) => op.op === "stroke" && op.pts && op.pts.length >= 2 && op.pts[0] && op.pts[op.pts.length - 1]
  && Math.hypot(op.pts[0][0] - palm.x, op.pts[0][1] - palm.y) < 12
  && Math.hypot(op.pts[op.pts.length - 1][0] - east.x, op.pts[op.pts.length - 1][1] - east.y) < 12));

const up = trace(FX, { spell: "Burning Hands", facing: -Math.PI / 2 }, 300, geo({ x: palm.x + 4, y: palm.y }));
const upCone = coneOf(up, palm);
check("hands.facing", !!(upCone && upCone.mid.y < palm.y - cell * 2.4 && Math.abs(upCone.mid.x - palm.x) < cell * 0.45), JSON.stringify(upCone && upCone.mid));

const spray = trace(FX, { spell: "Color Spray" }, 300, geo(east));
const fear = trace(FX, { spell: "Fear" }, 300, geo(east));
const sprayCone = coneOf(spray, palm);
const fearCone = coneOf(fear, palm);
check("chip.spray", !!(sprayCone && sprayCone.ray < cell * 1.3 && sprayCone.ray > 20), JSON.stringify(sprayCone));
check("chip.fear", !!(fearCone && fearCone.ray < cell * 1.3), JSON.stringify(fearCone));

const point = { x: palm.x + 280, y: palm.y - 40 };
const early = trace(FX, { spell: "Shatter", dmg: "thunder" }, 80, geo(point));
const burst = trace(FX, { spell: "Shatter", dmg: "thunder" }, 400, geo(point));
check("shatter.earlyWedge", coneOf(early, palm) && !early.some((op) => op.arc && Math.hypot(op.arc.x - point.x, op.arc.y - point.y) < 20 && op.arc.r > cell));
const rings = burst.filter((op) => op.op === "stroke" && op.arc && Math.hypot(op.arc.x - point.x, op.arc.y - point.y) < 8 && op.arc.r > cell * 1.4);
const edge = rings.some((op) => Math.abs(op.arc.r - cell * 2) < 2);
const squares = burst.map((op) => (op.op === "fill" && op.n >= 3 ? classify(op.pts) : null)).filter((row) => row && row.kind === "square");
check("shatter.rings", rings.length >= 2 && edge, JSON.stringify(rings.map((op) => Math.round(op.arc.r))));
check("shatter.glass", burst.some((op) => /200,\s*225,\s*250|245,\s*250,\s*255/.test(op.fillStyle)));
check("shatter.notSquare", squares.length === 0, JSON.stringify(squares));
check("shatter.wedgeStays", !!coneOf(burst, palm));
check("shatter.clears", trace(FX, { spell: "Shatter" }, 2000, geo(point)).length === 0);
check("hands.clears", trace(FX, { spell: "Burning Hands" }, 2000, geo(east)).length === 0);

const smite = trace(FX, { spell: "Thunderous Smite", dmg: "thunder" }, 80, geo(point));
check("thunder.stays", FX.lookOf({ type: "spell", spell: "Thunderous Smite" }) === "thunder" && !!coneOf(smite, palm) && !smite.some((op) => /200,\s*225,\s*250/.test(op.fillStyle)));

const porch = trace(FX, { spell: "Porch Boom", dmg: "thunder", facing: 0 }, 220, geo(east));
const porchSquare = porch.map((op) => (op.op === "fill" ? classify(op.pts) : null)).filter((row) => row && row.kind === "square")
  .sort((a, b) => b.side - a.side)[0];
check("porch.square", !!(porchSquare && porchSquare.side > cell * 2.4 && porchSquare.side < cell * 3.3), JSON.stringify(porchSquare));

const from = { x: 40, y: 520 };
const boomAt = { x: 640, y: 140 };
const ballGeo = { A: from, B: boomAt, S: from, T: boomAt, rS: 22, rT: 18, cell, dir: aim };
const flight = FX.lookTime("fireball").grow;
const travel = trace(FX, { spell: "Fireball", dmg: "fire" }, flight * 0.45, ballGeo);
const ball = trace(FX, { spell: "Fireball", dmg: "fire" }, flight + 340, ballGeo);
check("fireball.comet", !travel.some((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2));
check("fireball.disc", ball.some((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2.5 && Math.hypot(op.arc.x - boomAt.x, op.arc.y - boomAt.y) < 8));
check("wall.blank", FX.lookOf({ type: "spell", spell: "Wall of Fire", dmg: "fire" }) === "" && trace(FX, { spell: "Wall of Fire", dmg: "fire" }, 240, ballGeo).length === 0);

const handsShake = peakShake(FX, { spell: "Burning Hands" }, 0, 400);
const shatterShake = peakShake(FX, { spell: "Shatter" }, 180, 700);
check("shake.hands", handsShake > 2.2 && handsShake < 8 && mag(FX, { spell: "Burning Hands" }, 900) < 0.01, String(handsShake));
check("shake.shatter", mag(FX, { spell: "Shatter" }, 80) < 0.01 && shatterShake > 4 && shatterShake < 12 && mag(FX, { spell: "Shatter" }, 180 + 700) < 0.01, String(shatterShake));
check("shake.others", mag(FX, { spell: "Color Spray" }, 40) < 0.01 && mag(FX, { spell: "Thunderous Smite" }, 40) < 0.01 && mag(FX, { spell: "Wall of Fire" }, 80) < 0.01);

const ver = JSON.parse(read("version.json"));
check("ver.tip", ver.sheet === "0.3.199" && ver.dmcc === "0.2.212" && ver.sheetBuild === "sheet-playtest-v03199" && ver.dmccBuild === "dmcc-playtest-v02212", JSON.stringify(ver));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = function () {
  const canvas = this;
  const bag = {};
  let cur = [];
  let lastArc = null;
  return new Proxy(bag, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p !== "string") return undefined;
      return function (...args) {
        const fx = String(canvas.className || "").includes("fx");
        if (p === "beginPath") { cur = []; lastArc = null; }
        else if (p === "moveTo") cur = [[args[0], args[1]]];
        else if (p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "arc") lastArc = { x: args[0], y: args[1], r: args[2] };
        else if (p === "fill" && fx && cur.length >= 3) {
          w.__fills = w.__fills || [];
          w.__fills.push(cur.map((q) => [q[0], q[1]]));
        } else if (p === "stroke" && fx && lastArc && lastArc.r > 8) {
          w.__arcs = w.__arcs || [];
          w.__arcs.push(lastArc.r);
        }
        return bag;
      };
    },
    set(t, p, v) { t[p] = v; return true; }
  });
};
w.HTMLImageElement.prototype.decode = () => Promise.resolve();
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
try {
  Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 700; } });
} catch (e) {}
for (const rel of ["assets/data/rules.js", "map/ssdns-map-fx.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"]) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
scene.fogRevealed = true;
const store = { pub: {}, dm: {} };
const bus = [];
const dmAd = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const tok = { id: "ply", name: "Jolene", kind: "player", ownerUid: "p1", pos: { x: 10, y: 8 }, size: 1, sceneId: "scn_dustyspur01" };
store.dm["map/dm/tokens/ply"] = { value: tok, seq: 1 };
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const dm = w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: dmAd, host: { on() {}, players() { return []; } },
  options: { scene, tokens: { tokens: { ply: JSON.parse(JSON.stringify(tok)) } }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await new Promise((r) => setTimeout(r, 60));
function longestSide(fills) {
  let ray = 0;
  (fills || []).forEach((pts) => {
    const u = uniq(pts);
    if (u.length !== 3) return;
    for (let i = 0; i < 3; i++) {
      const a = u[i], b = u[(i + 1) % 3];
      ray = Math.max(ray, Math.hypot(a[0] - b[0], a[1] - b[1]));
    }
  });
  return ray;
}
w.__fills = [];
w.__arcs = [];
dm.fx({
  id: "spray_live", type: "spell", shooter: "p1",
  spell: "Color Spray", weapon: "Color Spray",
  at: { x: 13, y: 8 }, facing: 0, result: "hit", heard: ["dm"]
});
await new Promise((r) => setTimeout(r, 200));
const sprayRay = longestSide(w.__fills);
w.__fills = [];
w.__arcs = [];
dm.fx({
  id: "bh_live", type: "spell", shooter: "p1",
  spell: "Burning Hands", weapon: "Powder Fan",
  dmg: "fire", at: { x: 13, y: 8 }, facing: 0, result: "hit", heard: ["dm"]
});
await new Promise((r) => setTimeout(r, 360));
const liveRay = longestSide(w.__fills);
check("live.hands", w.SSDNSMapFx.lookOf({ type: "spell", spell: "Burning Hands" }) === "firecone" && sprayRay > 20 && liveRay > sprayRay * 1.45, JSON.stringify({ sprayRay: Math.round(sprayRay), liveRay: Math.round(liveRay) }));
w.__fills = [];
w.__arcs = [];
dm.fx({
  id: "sh_live", type: "spell", shooter: "p1",
  spell: "Shatter", weapon: "Shatter",
  dmg: "thunder", at: { x: 14, y: 6 }, facing: 0, result: "hit", heard: ["dm"]
});
await new Promise((r) => setTimeout(r, 460));
const liveSquares = (w.__fills || []).map(classify).filter((row) => row.kind === "square" && row.side > 40);
const liveRings = (w.__arcs || []).filter((r) => r > 30);
check("live.shatter", w.SSDNSMapFx.lookOf({ type: "spell", spell: "Shatter" }) === "shatter" && liveSquares.length === 0 && liveRings.length >= 1, JSON.stringify({ squares: liveSquares.length, rings: liveRings.slice(0, 6).map((r) => Math.round(r)) }));
dm.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nburning hands + shatter ok");

/**
 * Porch Boom and Fireball paint the demo's dust and blast, not a bare outline.
 * Shatter keeps the thunder wedge, then bursts at the point. Wall of Fire is not tipped here.
 *   node tools/test-concept-blast.mjs
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
  let comp = "source-over";
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
        else if (p === "fill") ops.push({ op: "fill", n: cur.length, pts: cur.map((q) => [q[0], q[1]]), arc: lastArc, fillStyle, comp });
        else if (p === "stroke") ops.push({ op: "stroke", pts: cur.map((q) => [q[0], q[1]]), arc: lastArc, strokeStyle, comp });
        else if (p === "fillRect") ops.push({ op: "fillRect", fillStyle, w: args[2], h: args[3] });
        else if (p === "strokeRect") ops.push({ op: "strokeRect", strokeStyle });
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : "";
      if (p === "globalCompositeOperation") comp = String(v);
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}

function classify(pts) {
  const u = [];
  pts.forEach((p) => {
    const last = u[u.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.5) u.push(p);
  });
  if (u.length >= 2 && Math.hypot(u[0][0] - u[u.length - 1][0], u[0][1] - u[u.length - 1][1]) < 1.5) u.pop();
  if (u.length === 3) return { kind: "wedge", n: 3, side: 0 };
  if (u.length !== 4) return { kind: "other", n: u.length, side: 0 };
  const sides = [0, 1, 2, 3].map((i) => Math.hypot(u[(i + 1) % 4][0] - u[i][0], u[(i + 1) % 4][1] - u[i][1]));
  const side = sides.reduce((s, v) => s + v, 0) / 4;
  const square = side > 1 && sides.every((s) => Math.abs(s - side) < side * 0.12);
  return { kind: square ? "square" : "quad", n: 4, side };
}

function biggestSquare(ops) {
  let best = null;
  ops.forEach((op) => {
    if (op.op !== "fill" || op.n < 3) return;
    const row = classify(op.pts);
    if (row.kind === "square" && (!best || row.side > best.side)) best = row;
  });
  return best;
}

function segLen(op) {
  if (!op.pts || op.pts.length < 2) return 0;
  const a = op.pts[0], b = op.pts[op.pts.length - 1];
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function spans(ops, A, B) {
  const near = (p, q) => Math.hypot(p[0] - q.x, p[1] - q.y) < 40;
  return ops.some((op) => {
    if (op.op !== "stroke" || !op.pts || op.pts.length < 2) return false;
    const a = op.pts[0], b = op.pts[op.pts.length - 1];
    return (near(a, A) && near(b, B)) || (near(b, A) && near(a, B));
  });
}

const FX = loadFx();
const cell = 70;
const palm = { x: 180, y: 300 };
const stub = { x: palm.x + cell * 1.35, y: palm.y };
const aim = { x: 1, y: 0 };
const geo = { A: palm, B: stub, S: palm, T: stub, rS: 22, rT: 18, cell, dir: aim };
const porch = trace(FX, { spell: "Porch Boom", weapon: "Porch Boom", dmg: "thunder", facing: 0 }, 420, geo);
const square = biggestSquare(porch);
const porchArcs = porch.filter((op) => op.op === "fill" && op.arc && op.arc.r >= 4);
const porchGrit = porch.filter((op) => op.op === "fillRect");
const porchStreaks = porch.filter((op) => op.op === "stroke" && segLen(op) > 6);
const porchFrames = porch.filter((op) => op.op === "strokeRect");
check("porch.look", FX.lookOf({ type: "spell", spell: "Porch Boom", dmg: "thunder" }) === "thundercube");
check("porch.square", !!(square && square.side > cell * 2.4 && square.side < cell * 3.3), JSON.stringify(square));
check("porch.gold", porch.some((op) => op.op === "fill" && /255,\s*206,\s*110/.test(op.fillStyle)));
check("porch.churn", porchArcs.length >= 40, String(porchArcs.length));
check("porch.grit", porchGrit.length >= 100, String(porchGrit.length));
check("porch.blast", porchStreaks.length >= 40, String(porchStreaks.length));
check("porch.frames", porchFrames.length >= 2, String(porchFrames.length));

const boomAt = { x: 720, y: 160 };
const from = { x: 40, y: 560 };
const ballGeo = { A: from, B: boomAt, S: from, T: boomAt, rS: 22, rT: 18, cell, dir: { x: 1, y: 0 } };
const flight = FX.lookTime("fireball").grow;
const travel = trace(FX, { spell: "Fireball", dmg: "fire" }, flight * 0.5, ballGeo);
const head = { x: (from.x + boomAt.x) / 2, y: (from.y + boomAt.y) / 2 };
const tail = travel.filter((op) => op.op === "stroke" && segLen(op) > 40 && segLen(op) < Math.hypot(boomAt.x - from.x, boomAt.y - from.y) * 0.45);
check("fireball.travel", flight >= 300 && travel.some((op) => op.op === "fill" && op.arc && op.arc.r > 8 && op.arc.r < cell && Math.hypot(op.arc.x - head.x, op.arc.y - head.y) < 36) && tail.length >= 1, JSON.stringify({ flight, tails: tail.length }));
check("fireball.travelNotSphere", !travel.some((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2) && !spans(travel, from, boomAt));
const ball = trace(FX, { spell: "Fireball", dmg: "fire" }, flight + 340, ballGeo);
const disc = ball.filter((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2.5);
const ballStreaks = ball.filter((op) => op.op === "stroke" && segLen(op) > 4);
const ballLobes = ball.filter((op) => op.op === "fill" && op.arc && op.arc.r > 8);
check("fireball.look", FX.lookOf({ type: "spell", spell: "Fireball", dmg: "fire" }) === "fireball");
check("fireball.disc", disc.length >= 1 && disc.some((op) => Math.hypot(op.arc.x - boomAt.x, op.arc.y - boomAt.y) < 8), JSON.stringify(disc.map((op) => Math.round(op.arc.r))));
check("fireball.solid", ball.some((op) => op.op === "fill" && /180,\s*48,\s*12/.test(op.fillStyle)));
check("fireball.embers", ballStreaks.length >= 40, String(ballStreaks.length));
check("fireball.lobes", ballLobes.length >= 20, String(ballLobes.length));
check("fireball.notBeam", !spans(ball, from, boomAt) && ballStreaks.every((op) => {
  const a = op.pts[0], b = op.pts[op.pts.length - 1];
  return Math.hypot(a[0] - from.x, a[1] - from.y) > 80 && Math.hypot(b[0] - from.x, b[1] - from.y) > 80;
}));
const bolt = trace(FX, { spell: "Fire Bolt", dmg: "fire" }, 80, ballGeo);
const boltHead = {
  x: from.x + (boomAt.x - from.x) * (1 - Math.pow(1 - Math.min(1, 80 / 300), 3)),
  y: from.y + (boomAt.y - from.y) * (1 - Math.pow(1 - Math.min(1, 80 / 300), 3))
};
check("firebolt.stillBeam", FX.lookOf({ type: "spell", spell: "Fire Bolt", dmg: "fire" }) === "fire" && bolt.some((op) => op.op === "fill" && op.arc && Math.hypot(op.arc.x - boltHead.x, op.arc.y - boltHead.y) < 24) && !bolt.some((op) => op.op === "fill" && op.arc && op.arc.r > cell * 2));

const shatterGeo = { A: palm, B: { x: palm.x + 160, y: palm.y - 20 }, S: palm, T: { x: palm.x + 160, y: palm.y - 20 }, cell, rS: 18, rT: 18, dir: aim };
const shatter = trace(FX, { spell: "Shatter", dmg: "thunder" }, 80, shatterGeo);
const shatterBig = shatter.map((op) => (op.op === "fill" && op.n >= 3 ? classify(op.pts) : null)).filter(Boolean);
check("shatter.wedge", FX.lookOf({ type: "spell", spell: "Shatter" }) === "shatter" && shatterBig.some((row) => row.kind === "wedge"));
check("wall.untouched", FX.lookOf({ type: "spell", spell: "Wall of Fire", dmg: "fire" }) === "" && trace(FX, { spell: "Wall of Fire", dmg: "fire" }, 200, ballGeo).length === 0);

function mag(spec, lt) {
  const s = FX.shakeOf(spec, lt) || { x: 0, y: 0 };
  return Math.hypot(s.x || 0, s.y || 0);
}
check("shake.porch", mag({ type: "spell", spell: "Porch Boom", dmg: "thunder" }, 90) > 3);
check("shake.fireball", mag({ type: "spell", spell: "Fireball" }, flight * 0.5) < 0.01 && mag({ type: "spell", spell: "Fireball" }, flight + 120) > 4);
check("shake.shatter", mag({ type: "spell", spell: "Shatter" }, 80) < 0.01);
check("shake.wall", mag({ type: "spell", spell: "Wall of Fire", dmg: "fire" }, 80) < 0.01);
check("shake.done", mag({ type: "spell", spell: "Fireball" }, 4000) < 0.01);

const ver = JSON.parse(read("version.json"));
check("ver.tip", ver.sheet === "0.3.197" && ver.dmcc === "0.2.210" && ver.sheetBuild === "sheet-playtest-v03197" && ver.dmccBuild === "dmcc-playtest-v02210", JSON.stringify(ver));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = function () {
  const canvas = this;
  const bag = {};
  let cur = [];
  return new Proxy(bag, {
    get(t, p) {
      if (p in t) return t[p];
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") cur = [];
        else if (p === "moveTo") cur = [[args[0], args[1]]];
        else if (p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "arc" && String(canvas.className || "").includes("fx")) {
          w.__arcs = w.__arcs || [];
          w.__arcs.push(args[2] || 0);
        } else if (p === "fill" && cur.length >= 3 && String(canvas.className || "").includes("fx")) {
          w.__fills = w.__fills || [];
          w.__fills.push(cur.map((q) => [q[0], q[1]]));
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
const tok = { id: "ply", name: "Caleb", kind: "player", ownerUid: "p1", pos: { x: 10, y: 8 }, size: 1, sceneId: "scn_dustyspur01" };
store.dm["map/dm/tokens/ply"] = { value: tok, seq: 1 };
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const dm = w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: dmAd, host: { on() {}, players() { return []; } },
  options: { scene, tokens: { tokens: { ply: JSON.parse(JSON.stringify(tok)) } }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await new Promise((r) => setTimeout(r, 60));
w.__arcs = [];
w.__fills = [];
dm.fx({
  id: "tw_concept", type: "spell", shooter: "p1",
  spell: "Thunderwave (Porch Boom)", weapon: "Thunderwave (Porch Boom)",
  dmg: "thunder", at: { x: 11.4, y: 8 }, facing: 0, result: "hit", heard: ["dm"]
});
await new Promise((r) => setTimeout(r, 180));
const liveSquares = (w.__fills || []).map((pts) => classify(pts)).filter((row) => row.kind === "square");
const liveWedges = (w.__fills || []).map((pts) => classify(pts)).filter((row) => row.kind === "wedge");
check("live.porchArcs", (w.__arcs || []).filter((r) => r >= 4).length >= 8, String((w.__arcs || []).length));
check("live.porchSquare", liveSquares.some((row) => row.side > 40));
check("live.porchNoWedge", liveWedges.length === 0, String(liveWedges.length));
w.__arcs = [];
dm.fx({
  id: "fb_concept", type: "spell", shooter: "p1",
  spell: "Fireball", weapon: "Fireball",
  dmg: "fire", at: { x: 16, y: 9 }, result: "hit", heard: ["dm"]
});
await new Promise((r) => setTimeout(r, 560));
check("live.fireballDisc", (w.__arcs || []).some((r) => r > 40), JSON.stringify((w.__arcs || []).slice(0, 8).map((r) => Math.round(r))));
dm.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nconcept blast ok");

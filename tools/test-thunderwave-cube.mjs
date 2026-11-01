/**
 * Thunderwave must paint a 15-ft square, not the old 3-point thunder wedge.
 * The #210 check only counted fill/stroke calls. The wedge fills and strokes too,
 * so that test stayed green while Porch Boom (no alias table) still drew the cone.
 *   node tools/test-thunderwave-cube.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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

function loadFx(aliases) {
  const sandbox = {
    console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read("assets/data/rules.js"), sandbox);
  if (aliases === false) sandbox.SSDNS_RULES.spellAliases = [];
  vm.runInContext(read("map/ssdns-map-fx.js"), sandbox);
  return sandbox.SSDNSMapFx;
}

function fillsOf(FX, spec, A, B, lt) {
  const fills = [];
  let cur = [];
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      if (p === "beginPath") return () => { cur = []; };
      if (p === "moveTo") return (x, y) => { cur = [[x, y]]; };
      if (p === "lineTo") return (x, y) => { cur.push([x, y]); };
      if (p === "closePath") return () => {};
      if (p === "fill") return () => { if (cur.length >= 3) fills.push(cur.map((q) => [q[0], q[1]])); };
      return () => ctx;
    },
    set() { return true; }
  });
  const g = { A, B, S: A, T: B, rS: 18, rT: 18, cell: 70, dir: { x: 1, y: 0 } };
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4, dmg: "thunder" }, spec), lt == null ? 160 : lt, g);
  return fills;
}

function classify(pts) {
  const u = [];
  pts.forEach((p) => {
    const last = u[u.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1.5) u.push(p);
  });
  if (u.length >= 2 && Math.hypot(u[0][0] - u[u.length - 1][0], u[0][1] - u[u.length - 1][1]) < 1.5) u.pop();
  if (u.length === 3) return { kind: "wedge", n: 3, side: 0, pts: u };
  if (u.length !== 4) return { kind: "other", n: u.length, side: 0, pts: u };
  const sides = [0, 1, 2, 3].map((i) => {
    const a = u[i], b = u[(i + 1) % 4];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const side = sides.reduce((s, v) => s + v, 0) / 4;
  const square = side > 1 && sides.every((s) => Math.abs(s - side) < side * 0.12);
  let right = square;
  for (let i = 0; i < 4; i++) {
    const a = u[i], b = u[(i + 1) % 4], c = u[(i + 2) % 4];
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(dot) > side * side * 0.2) right = false;
  }
  return { kind: square && right ? "square" : "quad", n: 4, side, pts: u };
}

function biggest(fills) {
  let best = null;
  fills.forEach((pts) => {
    const row = classify(pts);
    if (!best || row.side > best.side) best = row;
  });
  return best || { kind: "none", n: 0, side: 0, pts: [] };
}

const cell = 70;
const palm = { x: 220, y: 260 };
/* Sheet aim stub: about 1.35 squares in front of the caster. The old wedge used this as its length. */
const stub = { x: palm.x + cell * 1.35, y: palm.y };

const bare = loadFx(false);
const porch = biggest(fillsOf(bare, { spell: "Porch Boom", weapon: "Porch Boom" }, palm, stub, 160));
check("porch.noAlias.look", bare.lookOf({ type: "spell", spell: "Porch Boom", dmg: "thunder" }) === "thundercube", bare.lookOf({ type: "spell", spell: "Porch Boom", dmg: "thunder" }));
check("porch.noAlias.square", porch.kind === "square" && porch.n === 4 && porch.side > cell * 2.4 && porch.side < cell * 3.3, JSON.stringify(porch));
check("porch.noAlias.notWedge", porch.kind !== "wedge");

const labeled = loadFx(true);
for (const name of ["Thunderwave", "Thunderwave (Porch Boom)", "Thunderwave Shell", "Porch Boom Shell"]) {
  const row = biggest(fillsOf(labeled, { spell: name, weapon: name }, palm, stub, 160));
  check("cube." + name, labeled.lookOf({ type: "spell", spell: name, dmg: "thunder" }) === "thundercube" && row.kind === "square" && row.side > cell * 2.4, JSON.stringify(row));
}
const shatter = biggest(fillsOf(labeled, { spell: "Shatter", weapon: "Shatter" }, palm, stub, 80));
check("shatter.staysWedge", labeled.lookOf({ type: "spell", spell: "Shatter" }) === "shatter" && shatter.kind === "wedge", JSON.stringify(shatter));

const up = biggest(fillsOf(labeled, { spell: "Thunderwave", facing: -Math.PI / 2 }, palm, palm, 160));
const midY = up.pts.reduce((s, p) => s + p[1], 0) / (up.pts.length || 1);
const midX = up.pts.reduce((s, p) => s + p[0], 0) / (up.pts.length || 1);
check("facing.up", up.kind === "square" && midY < palm.y - cell && Math.abs(midX - palm.x) < cell, JSON.stringify({ kind: up.kind, midX, midY, side: up.side }));

const clean = labeled.sanitize({ type: "spell", spell: "Thunderwave (Porch Boom)", dmg: "thunder", facing: -Math.PI / 2, result: "hit" });
check("sanitize.facing", clean && clean.spell === "Thunderwave (Porch Boom)" && Math.abs(clean.facing - (-1.571)) < 0.01, JSON.stringify(clean));
const req = labeled.request({ type: "spell", spell: "Porch Boom", dmg: "thunder", facing: 0.4, at: { x: 3, y: 4 } });
check("request.facing", req.spell === "Porch Boom" && req.facing === 0.4 && labeled.lookOf(req) === "thundercube", JSON.stringify(req));

check("dm.cubeAim", /cubeReach/.test(read("dm/assets/js/v2.js")) && /facing: face/.test(read("dm/assets/js/v2.js")));

function pngRGBA(w, h, draw) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * (w * 4 + 1) + 1 + x * 4;
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
  };
  draw(px);
  const scan = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    scan[y * (w * 4 + 1)] = 0;
    raw.copy(scan, y * (w * 4 + 1) + 1, y * (w * 4 + 1) + 1, y * (w * 4 + 1) + 1 + w * 4);
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(scan)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
function fillPoly(px, pts, rgba) {
  const ys = pts.map((p) => p[1]);
  const y0 = Math.floor(Math.min(...ys));
  const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const t = (y - a[1]) / (b[1] - a[1]);
        xs.push(a[0] + t * (b[0] - a[0]));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x++) px(x, y, rgba[0], rgba[1], rgba[2], rgba[3]);
    }
  }
}
if (porch.kind === "square") {
  const W = 520, H = 420;
  const buf = pngRGBA(W, H, (px) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, 42, 32, 24, 255);
    fillPoly(px, porch.pts, [95, 80, 60, 255]);
    const edge = fillsOf(bare, { spell: "Porch Boom" }, palm, stub, 160)[1];
    if (edge) fillPoly(px, edge, [215, 185, 125, 255]);
  });
  const out = "/opt/cursor/artifacts/thunderwave-cube.png";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  check("frame.wrote", fs.statSync(out).size > 500, String(fs.statSync(out).size));
}

/* Live map cast: the fx canvas must not contain the 3-point wedge. */
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
        else if (p === "fill" && cur.length >= 3 && String(canvas.className || "").includes("fx")) {
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
await new Promise((r) => setTimeout(r, 80));
w.__fills = [];
const pub = dm.fx({
  id: "tw_cube", type: "spell", shooter: "p1",
  spell: "Thunderwave (Porch Boom)", weapon: "Thunderwave (Porch Boom)",
  dmg: "thunder", at: { x: 11.4, y: 8 }, facing: 0, result: "hit", heard: ["dm"]
});
await new Promise((r) => setTimeout(r, 180));
const mapFills = (w.__fills || []).map(classify);
const wedges = mapFills.filter((row) => row.kind === "wedge");
const squares = mapFills.filter((row) => row.kind === "square");
const largest = squares.reduce((b, row) => (!b || row.side > b.side ? row : b), null);
check("map.look", w.SSDNSMapFx.lookOf(pub || {}) === "thundercube", JSON.stringify(pub && { spell: pub.spell }));
check("map.noWedge", wedges.length === 0, String(wedges.length));
check("map.square", !!(largest && largest.side > 40), JSON.stringify(largest && { side: Math.round(largest.side), n: largest.n }));
dm.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nthunderwave cube ok");

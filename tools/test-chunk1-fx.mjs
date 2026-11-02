/**
 * Chunk 1 Phase 1 map FX. Real SSDNSMapFx.paint only (the tip overlay painter).
 *   node tools/test-chunk1-fx.mjs
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
        else if (p === "fill") ops.push({ op: "fill", pts: cur.slice(), fillStyle });
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
function ptsOf(ops) {
  const all = [];
  ops.forEach((op) => (op.pts || []).forEach((p) => { if (isFinite(p[0]) && isFinite(p[1])) all.push(p); }));
  return all;
}
function near(ops, x, y, rad) {
  return ptsOf(ops).some((p) => Math.hypot(p[0] - x, p[1] - y) < rad) || ops.some((op) => op.op === "arc" && Math.hypot(op.x - x, op.y - y) < rad);
}

const cell = 70;
const A = { x: 90, y: 240 };
const T = { x: 430, y: 250 };
const g = {
  A: A, B: { x: T.x - 12, y: T.y }, S: { x: 64, y: 240 }, T: T,
  rS: 22, rT: 22, cell: cell, dir: { x: 1, y: 0.02 }
};
const hops = [{ x: 560, y: 160 }, { x: 500, y: 360 }];
function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }

check("look.witch", look("Witch Bolt") === "witch-bolt" && look("Witch Bolt (Wire Lash)") === "witch-bolt");
check("look.scorch", look("Scorching Ray") === "scorching-ray" && look("Fire Bolt", "fire") === "fire");
check("look.guide", look("Guiding Bolt") === "guiding-bolt" && look("Sacred Flame") === "sacred-flame" && look("Moonbeam") === "radiant");
check("look.chill", look("Chill Touch") === "chill-touch" && look("Chill Touch (Cold Hand)") === "chill-touch" && look("Inflict Wounds") === "necrotic" && look("Blight") === "necrotic");
check("look.acid", look("Acid Arrow") === "acid-arrow" && look("Acid Splash") === "acid");
check("look.poison", look("Poison Spray") === "poison-spray" && look("Poison Spray (Viper Puff)") === "poison-spray" && look("Cloudkill", "poison") === "poison");
check("look.chain", look("Chain Lightning", "lightning") === "chain-lightning" && look("Lightning Bolt", "lightning") === "lightning" && look("Shocking Grasp") === "lightning");
check("look.dust", look("Disintegrate", "force") === "disintegrate" && look("Spiritual Weapon", "force") === "token");
check("named.witch", FX.namedLook("Witch Bolt") === "witch-bolt" && FX.namedLook("Disintegrate") === "disintegrate");
check("sticky.marks", FX.stickyLook("Guided") === "guiding-bolt" && FX.stickyLook("No healing") === "chill-touch");

const boltPlan = FX.plan("spell", "hit", { spell: "Witch Bolt" });
const jagPlan = FX.plan("spell", "hit", { spell: "Lightning Bolt", dmg: "lightning" });
check("time.witch", boltPlan.duration > 3500 && boltPlan.look === "witch-bolt", String(boltPlan.duration));
check("time.jag", jagPlan.duration < 800 && jagPlan.look === "lightning", String(jagPlan.duration));
check("time.pulse", FX.plan("spell", "hit", { spell: "Witch Bolt", pulse: true }).duration < 900);
check("shake.witch", Math.hypot(FX.shakeOf({ spell: "Witch Bolt" }, 90).x, FX.shakeOf({ spell: "Witch Bolt" }, 90).y) > 1);
check("shake.chain", Math.hypot(FX.shakeOf({ spell: "Chain Lightning" }, 100).x, FX.shakeOf({ spell: "Chain Lightning" }, 100).y) > 1);
check("shake.bolt", Math.hypot(FX.shakeOf({ spell: "Lightning Bolt", dmg: "lightning" }, 40).x || 0, 0) === 0);

const witch = trace({ spell: "Witch Bolt" }, 420, g);
check("paint.witch.teal", hasColor(witch, "95,220,205") && hasColor(witch, "232,236,255"));
check("paint.witch.ring", near(witch, g.S.x, g.S.y, 40));
check("paint.witch.tether", near(witch, (A.x + T.x) / 2, (A.y + T.y) / 2, 80));
const snapped = trace({ spell: "Witch Bolt" }, 3200, g);
check("paint.witch.snap", snapped.some((op) => op.op === "fill") && !hasColor(snapped, "200,60,15"));

const early = trace({ spell: "Scorching Ray" }, 40, g);
const late = trace({ spell: "Scorching Ray" }, 260, g);
check("paint.scorch.stagger", late.filter((op) => op.op === "stroke").length > early.filter((op) => op.op === "stroke").length + 2);
check("paint.scorch.fire", hasColor(late, "255,125,35") && hasColor(late, "255,225,160"));
const miss = trace({ spell: "Scorching Ray", result: "miss" }, 420, g);
check("paint.scorch.fizzle", ptsOf(miss).some((p) => p[0] > T.x + 30), "ray should pass the token");
const split = trace({ spell: "Scorching Ray" }, 260, Object.assign({}, g, { rays: [{ x: 400, y: 140, miss: false }, { x: 470, y: 320, miss: true }, { x: 360, y: 260, miss: false }] }));
check("paint.scorch.rays", near(split, 400, 140, 50) && near(split, 470, 320, 70));

const guide = trace({ spell: "Guiding Bolt" }, 90, g);
const lineDev = ptsOf(guide).reduce((m, p) => {
  const u = (p[0] - A.x) / (T.x - A.x);
  const y = A.y + (T.y - A.y) * u;
  return Math.max(m, Math.abs(p[1] - y));
}, 0);
check("paint.guide.arc", lineDev > 8, String(Math.round(lineDev)));
check("paint.guide.gold", hasColor(guide, "255,232,170") || hasColor(guide, "255,250,230"));
const mark = trace({ spell: "Guiding Bolt" }, 900, g);
check("paint.guide.mark", near(mark, T.x, T.y, 50) && hasColor(mark, "255,232,170"));
const riderOps = [];
{
  let fillStyle = "", strokeStyle = "", cur = [];
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") cur = [];
        else if (p === "moveTo" || p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "stroke") riderOps.push({ op: "stroke", pts: cur.slice(), strokeStyle });
        else if (p === "fill") riderOps.push({ op: "fill", pts: cur.slice(), fillStyle });
        else if (p === "arc") riderOps.push({ op: "arc", x: args[0], y: args[1], r: args[2] });
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
  FX.paintRider(ctx, "guiding-bolt", T.x, T.y, 22, 1000);
  FX.paintRider(ctx, "chill-touch", T.x, T.y, 22, 1000);
}
check("paint.rider", riderOps.length > 4 && near(riderOps, T.x, T.y, 40));
const popOps = [];
{
  let strokeStyle = "", cur = [];
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") cur = [];
        else if (p === "moveTo" || p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "stroke") popOps.push({ op: "stroke", pts: cur.slice(), strokeStyle });
        else if (p === "arc") popOps.push({ op: "arc", x: args[0], y: args[1], r: args[2] });
        else if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) { if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : ""; return true; }
  });
  FX.paintGuidePop(ctx, { type: "spell", spell: "Fire Bolt", result: "hit" }, 80, Object.assign({}, g, { pop: true }));
}
check("paint.guide.pop", popOps.some((op) => op.op === "arc" || op.op === "stroke"));

const flame = trace({ spell: "Sacred Flame" }, 520, g);
const column = flame.filter((op) => op.op === "stroke" && op.pts.length >= 2 && Math.abs(op.pts[0][0] - T.x) < 3 && Math.abs(op.pts[op.pts.length - 1][0] - T.x) < 3 && Math.abs(op.pts[0][1] - op.pts[op.pts.length - 1][1]) > 80);
check("paint.flame.column", column.length > 0 && hasColor(flame, "255,232,170"));
check("paint.flame.pool", trace({ spell: "Sacred Flame" }, 700, g).some((op) => op.op === "arc" && Math.hypot(op.x - T.x, op.y - T.y) < 8));

const chill = trace({ spell: "Chill Touch" }, 700, g);
check("paint.chill", hasColor(chill, "6,3,8") && hasColor(chill, "95,45,100") && hasColor(chill, "185,170,180"));

const acid = trace({ spell: "Acid Arrow" }, 160, g);
const straightY = A.y + (T.y - A.y) * 0.4;
check("paint.acid.lob", ptsOf(acid).some((p) => p[1] < straightY - 12) && hasColor(acid, "125,180,40"));
const cling = trace({ spell: "Acid Arrow" }, 900, g);
check("paint.acid.cling", hasColor(cling, "125,180,40") || hasColor(cling, "80,135,25"));
const flare = trace({ spell: "Acid Arrow" }, 2620, g);
check("paint.acid.flare", hasColor(flare, "200,240,120"));

const far = Object.assign({}, g, { T: { x: A.x + cell * 8, y: A.y }, B: { x: A.x + cell * 8, y: A.y } });
const puff = trace({ spell: "Poison Spray" }, 80, far);
check("paint.poison.short", puff.filter((op) => op.op === "arc").every((op) => Math.hypot(op.x - A.x, op.y - A.y) < cell * 3.2) && hasColor(puff, "150,140,70"));
const swallow = trace({ spell: "Poison Spray" }, 400, g);
check("paint.poison.soft", hasColor(swallow, "195,185,110") && hasColor(swallow, "150,140,70"));

const chain = trace({ spell: "Chain Lightning" }, 220, Object.assign({}, g, { hops: hops }));
check("paint.chain.primary", hasColor(chain, "85,120,240") && hasColor(chain, "232,236,255"));
check("paint.chain.hop", near(chain, hops[0].x, hops[0].y, 36), "hop arc should reach the next target");

const needle = trace({ spell: "Disintegrate", dmg: "force" }, 30, g);
check("paint.dust.needle", hasColor(needle, "60,200,90") && hasColor(needle, "200,255,200"));
const kill = trace({ spell: "Disintegrate", dust: true }, 1000, g);
const live = trace({ spell: "Disintegrate" }, 1000, g);
check("paint.dust.ash", kill.some((op) => op.op === "fillRect" && String(op.fillStyle).indexOf("120,115,105") >= 0));
check("paint.dust.live", !live.some((op) => op.op === "fillRect" && String(op.fillStyle).indexOf("120,115,105") >= 0));
check("paint.dust.front", FX.erodeFront(800) > 0.2 && FX.erodeFront(100) === 0);
let crumbs = 0;
const oc = new Proxy({}, {
  get(_t, p) {
    if (typeof p !== "string") return undefined;
    return function () { if (p === "fillRect") crumbs += 1; return oc; };
  },
  set() { return true; }
});
FX.erodeToken(oc, 800, 40, 40, 22, A, T);
check("paint.dust.erode", crumbs > 8, String(crumbs));

const kept = FX.sanitize({
  type: "spell", spell: "Chain Lightning", result: "hit",
  hops: [{ id: "tok_b" }, { id: "tok_c" }, "nope id"],
  dust: true
});
check("sanitize.hops", kept && kept.hops && kept.hops.length === 2 && kept.hops[0].id === "tok_b" && kept.dust === true, JSON.stringify(kept && kept.hops));
const req = FX.request({ type: "spell", spell: "Scorching Ray", rays: [{ id: "a", result: "hit" }, { id: "b", result: "miss" }] });
check("request.rays", req.rays && req.rays.length === 2 && req.rays[1].miss === true && req.spell === "Scorching Ray", JSON.stringify(req.rays));

check("src.fx", read("index.html").includes("map/ssdns-map-fx.js?v=0.3.202-c1") && read("dm/index.html").includes("../map/ssdns-map-fx.js?v=0.2.215-c1"));
check("src.map", read("map/ssdns-map.js").includes("fxListScreens") && read("map/ssdns-map.js").includes("paintGuidePop") && read("map/ssdns-map.js").includes("erodeToken"));
check("src.dm", read("dm/assets/js/v2.js").includes("chainIds") && read("dm/assets/js/v2.js").includes("crumbOnly") && read("dm/assets/js/v2.js").includes("pulse: true"));
check("ver", JSON.parse(read("version.json")).sheet === "0.3.202" && JSON.parse(read("version.json")).dmcc === "0.2.215");

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall chunk1 fx checks passed");
process.exit(failures.length ? 1 : 0);

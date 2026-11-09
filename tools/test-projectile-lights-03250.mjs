/**
 * COA #15 — fire and lightning projectiles carry a short fog-cutting light
 * (sheet 0.3.252 / DMCC 0.2.265).
 *   node tools/test-projectile-lights-03250.mjs
 * rules.js is not regenerated. Fireball stays a comet, then the burst.
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

const context = { console, Math, Date, performance: { now() { return 0; } }, localStorage: { getItem() { return null; }, setItem() {} }, dispatchEvent() {} };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const FX = context.SSDNSMapFx;

const bolt = { type: "spell", spell: "Fire Bolt", dmg: "fire" };
const ball = { type: "spell", spell: "Fireball", dmg: "fire" };
const jag = { type: "spell", spell: "Lightning Bolt", dmg: "lightning" };
const midBolt = FX.projectileLight(bolt, 80);
const ease = 1 - Math.pow(1 - 80 / 300, 3);
check("bolt.flight", midBolt && midBolt.phase === "flight" && midBolt.feet === 5 && Math.abs(midBolt.u - ease) < 0.001, JSON.stringify(midBolt));
check("bolt.flash", FX.projectileLight(bolt, 320) && FX.projectileLight(bolt, 320).phase === "flash" && FX.projectileLight(bolt, 320).feet === 15 && FX.projectileLight(bolt, 320).u === 1);
check("bolt.out", FX.projectileLight(bolt, 700) === null);

const comet = FX.projectileLight(ball, 190);
check("ball.comet", comet && comet.phase === "flight" && comet.feet === 5 && comet.look === "fireball" && comet.u > 0.2 && comet.u < 0.8, JSON.stringify(comet));
check("ball.burst", FX.projectileLight(ball, 460) && FX.projectileLight(ball, 460).phase === "flash" && FX.projectileLight(ball, 460).feet === 20);
check("ball.embers", FX.projectileLight(ball, 900) === null);
check("ball.notBeam", FX.lookOf(ball) === "fireball" && read("map/ssdns-map-fx.js").includes("function fireballComet") && read("map/ssdns-map-fx.js").includes("function fireballPaint"));

const jagMid = FX.projectileLight(jag, 30);
check("jag.flight", jagMid && jagMid.phase === "flight" && jagMid.feet === 5 && jagMid.u > 0 && jagMid.u < 1, JSON.stringify(jagMid));
check("jag.flash", FX.projectileLight(jag, 120) && FX.projectileLight(jag, 120).phase === "flash" && FX.projectileLight(jag, 120).feet === 15);
check("jag.out", FX.projectileLight(jag, 500) === null);

check("skip.cold", FX.projectileLight({ type: "spell", spell: "Ray of Frost", dmg: "cold" }, 80) === null);
check("skip.grasp", FX.projectileLight({ type: "spell", spell: "Shocking Grasp", dmg: "lightning" }, 40) === null);
check("skip.cone", FX.projectileLight({ type: "spell", spell: "Burning Hands", dmg: "fire" }, 40) === null);
check("skip.hunger", FX.projectileLight({ type: "spell", spell: "Hunger of Hadar" }, 40) === null);
const scorch = FX.projectileLight({ type: "spell", spell: "Scorching Ray", dmg: "fire" }, 40);
check("scorch.fallsOut", scorch && scorch.phase === "flight" && scorch.feet === 5);

const map = read("map/ssdns-map.js");
check("wire.sight", map.includes("fxBoltLights.forEach") && map.includes("if (fxOn()) fxBoltLights"));
check("wire.hidden", map.includes("tok.hidden") && map.includes("edge.at < 1") && map.includes("srcHidden"));
check("wire.stop", map.includes("fxBoltLights = []") && map.includes("hadLight"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const queue = [];
  let clock = 1000;
  w.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  w.cancelAnimationFrame = () => {};
  w.performance.now = () => clock;
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, { get(t, p) { if (p === "canvas") return {}; if (typeof p !== "string") return undefined; return function () { return t; }; } });
  };
  w.flushFx = function (ms) {
    clock += ms || 0;
    const batch = queue.splice(0);
    batch.forEach((fn) => { try { fn(clock); } catch (e) {} });
    return batch.length;
  };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}

const w = makeWindow();
addScript(w, "assets/js/lighting.js");
addScript(w, "map/ssdns-map-fx.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
scene.ambient = "dark";
scene.fogRevealed = false;
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const api = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: { players() { return [{ uid: "p1", name: "Jolene" }]; } },
  options: { scene, assetBase: "", tokens: { tokens: {} }, room: { table: { initiative: { order: [], turn: 0 } } } }
});
for (let i = 0; i < 20 && !api.tokenPos("tok_me"); i++) {
  await new Promise((r) => setTimeout(r, 0));
  api.placeLinkedToken({ id: "tok_me", kind: "player", name: "Jolene", label: "Jolene", ownerUid: "p1", at: { x: 4, y: 8 } });
  api.placeLinkedToken({ id: "tok_mob", kind: "enemy", name: "Bandit", label: "Bandit", at: { x: 16, y: 8 } });
}
const from = api.tokenPos("tok_me");
const to = api.tokenPos("tok_mob");
check("placed", !!(from && to), JSON.stringify({ from, to }));
const ax = from.x + 0.5, ay = from.y + 0.5, bx = to.x + 0.5, by = to.y + 0.5;
check("dark.before", api.lightAt(bx, by, "p1") === "dark" || Math.hypot(bx - ax, by - ay) > 3, api.lightAt((ax + bx) / 2, (ay + by) / 2, "p1"));
const started = api.fx({ id: "fxbolt", type: "spell", spell: "Fire Bolt", dmg: "fire", result: "hit", shooter: "tok_me", target: "tok_mob" });
await Promise.resolve();
await Promise.resolve();
w.flushFx(0);
for (let i = 0; i < 5; i++) w.flushFx(16);
const head = w.SSDNSMapFx.projectileLight(bolt, 80);
const hx = ax + (bx - ax) * head.u;
const hy = ay + (by - ay) * head.u;
check("cast.started", !!started && api.fxActive() > 0, "active " + api.fxActive());
check("path.lit", api.lightAt(hx, hy, "p1") === "bright", "head " + hx.toFixed(2) + "," + hy.toFixed(2) + " " + api.lightAt(hx, hy, "p1"));
check("path.darkBeside", api.lightAt(hx, hy + 6, "p1") === "dark", api.lightAt(hx, hy + 6, "p1"));
w.SSDNSMapFx.setEnabled(false);
w.flushFx(16);
check("effects.off", api.lightAt(hx, hy, "p1") === "dark", api.lightAt(hx, hy, "p1"));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.252" && ver.dmcc === "0.2.265" && ver.sheetBuild === "sheet-playtest-v03252" && ver.dmccBuild === "dmcc-playtest-v02265");
const rules = read("assets/data/rules.js");
check("rules.clean", !rules.includes("0.3.252") && !rules.includes("0.2.265") && !read("database.rules.json").includes("0.3.252"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nprojectile lights ok");

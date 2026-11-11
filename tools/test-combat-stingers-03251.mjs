/**
 * Combat stingers: ROLL INITIATIVE then ROUND 1 at the start,
 * and ROUND n only when the round increments (sheet 0.3.292 / DMCC 0.2.305).
 *   node tools/test-combat-stingers-03251.mjs
 * rules.js is not regenerated. No sting sound.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const mapSrc = read("map/ssdns-map.js");
const css = read("map/ssdns-map.css");
check("src.plan", mapSrc.includes('kind: "init"') && mapSrc.includes("round > prevRound"));
check("src.silent", !mapSrc.slice(mapSrc.indexOf("function pumpStinger"), mapSrc.indexOf("function playStingers")).includes("SSDNSAudio"));
check("css.slam", css.includes("ssm-stinger-slam") && css.includes("scale(1.35)") && css.includes("ssm-stinger-num"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({}, { get(t, p) { if (typeof p !== "string") return undefined; return function () { return t; }; } });
  };
  const queue = [];
  w.requestAnimationFrame = (fn) => { queue.push(fn); return queue.length; };
  w.cancelAnimationFrame = () => {};
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function boot(w, role) {
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  return w.SSDNSMap.create({
    el, role: role || "dm", uid: role === "player" ? "p1" : "dm",
    adapter: w.SSDNSMapFirebase.memory({ role: role || "dm" }),
    host: { players() { return []; } },
    options: { scene, assetBase: "", tokens: { tokens: {} }, room: { table: { initiative: { order: [], turn: 0 } } } }
  });
}

const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const api = boot(w);
for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
const order = [{ id: "a", name: "Jolene", kind: "player" }];
const idle = { started: false, round: 1, turn: 0, order: order };
const start = { started: true, round: 1, turn: 0, order: order };
const mid = { started: true, round: 1, turn: 1, order: order.concat([{ id: "b", name: "Bandit", kind: "enemy" }]) };
const nextRound = { started: true, round: 2, turn: 0, order: order };

check("plan.start", JSON.stringify(api.combatStingerPlan(idle, start)) === JSON.stringify([{ kind: "init" }, { kind: "round", n: 1 }]));
check("plan.mid", api.combatStingerPlan(start, mid).length === 0);
check("plan.round", JSON.stringify(api.combatStingerPlan(start, nextRound)) === JSON.stringify([{ kind: "round", n: 2 }]));
check("plan.join", api.combatStingerPlan(null, start).length === 2);

api.syncCombatants(start);
const early = w.document.querySelector('[data-act="combatStinger"]');
check("join.quiet", !early || !early.classList.contains("is-on"));

api.syncCombatants(idle);
api.syncCombatants(start);
const live = w.document.querySelector('[data-act="combatStinger"]');
const words = live ? live.textContent.replace(/\s+/g, " ") : "";
check("start.copy", !!(live && live.classList.contains("is-on") && words.includes("ROLL") && words.includes("INITIATIVE")), words);
api.syncCombatants(mid);
check("mid.stays", live.textContent.includes("ROLL") && !live.textContent.includes("ROUND"));

const w2 = makeWindow();
addScript(w2, "map/ssdns-map-firebase.js");
addScript(w2, "map/ssdns-map.js");
const player = boot(w2, "player");
player.syncCombatants(start);
player.syncCombatants(nextRound);
const shown = w2.document.querySelector('[data-act="combatStinger"]');
check("player.round", !!(shown && shown.classList.contains("is-on") && shown.textContent.includes("ROUND") && shown.textContent.includes("2")), shown && shown.textContent);

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.292" && ver.dmcc === "0.2.305" && ver.sheetBuild === "sheet-playtest-v03292" && ver.dmccBuild === "dmcc-playtest-v02305");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.292") && !read("database.rules.json").includes("0.3.292"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ncombat stingers ok");

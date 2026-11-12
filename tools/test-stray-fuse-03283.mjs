/**
 * Bomb / timer stays on assets. Creature drawers do not show it or write token.asset.
 * Sheet 0.3.300 / DMCC 0.2.313.
 *   node tools/test-stray-fuse-03283.mjs
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
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.300" && ver.dmcc === "0.2.313" && ver.sheetBuild === "sheet-playtest-v03300" && ver.dmccBuild === "dmcc-playtest-v02313");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.300") && !read("database.rules.json").includes("0.3.300"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
w.HTMLElement.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
};
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = { addColorStop() {} };
  return new Proxy(bag, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; },
    set(t, p, v) { t[p] = v; return true; }
  });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
function addScript(rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
["map/interact-timers.js", "map/asset-library.js", "assets/js/loot.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"].forEach(addScript);

const stray = { props: { timer: { mode: "fuse", fuseRounds: 1 } }, state: { countdownVisible: false }, effects: [] };
const tokens = { tokens: {
  tok_ada: {
    id: "tok_ada", kind: "player", name: "Ada", ownerUid: "p_a", combatantId: "tok_ada", size: 1, pos: { x: 15, y: 10 },
    asset: JSON.parse(JSON.stringify(stray))
  },
  tok_bandit: { id: "tok_bandit", kind: "enemy", name: "Bandit", combatantId: "tok_bandit", size: 1, pos: { x: 18, y: 10 } },
  tok_keg: {
    id: "tok_keg", kind: "asset", name: "Powder Barrel", size: 1, pos: { x: 16, y: 10 },
    asset: {
      name: "Powder Barrel", notes: "Powder keg.",
      props: { timer: { mode: "fuse", fuseRounds: 2 } },
      state: {}, effects: [], interact: { actions: ["light-fuse"], reachFt: 5 }
    }
  }
}};
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const writes = [];
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const host = {
  on() {},
  players() { return []; },
  rounds() { return []; },
  getCard(id) {
    if (id === "tok_ada") return { kind: "pc", name: "Ada", ac: 14, hp: { cur: 10, max: 10 }, speed: 30, attacks: [], spells: [], conditions: [], items: [] };
    if (id === "tok_bandit") return { kind: "enemy", name: "Bandit", ac: 12, hp: { cur: 8, max: 8 }, speed: 30, attacks: [], spells: [], conditions: [] };
    return null;
  },
  actions: { get() { return []; }, run() { return Promise.resolve(); } }
};
w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm", uid: "dm", store, onWrite(path, value) { writes.push({ path, kind: value && value.kind, asset: value && value.asset }); } }),
  host,
  options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(120);

function pointer(node, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  node.dispatchEvent(ev);
}
function clickAt(x, y) {
  const canvas = el.querySelector("canvas");
  pointer(canvas, "pointerdown", x, y);
  pointer(canvas, "pointerup", x, y);
}
function at(gx, gy) { return { x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 }; }
function drawer() { return el.querySelector("[data-act='drawer']"); }
function text() { return ((drawer() && drawer().textContent) || "").replace(/\s+/g, " "); }
function savedTokens() {
  return Object.keys(store.dm).filter(k => k.indexOf("map/dm/tokens/") === 0).map(k => store.dm[k].value).filter(Boolean);
}

clickAt(at(15, 10).x, at(15, 10).y);
await flush(40);
check("pc.noBomb", !/Bomb \/ timer/.test(text()) && !drawer().querySelector("[data-act='bombPanel']"), text().slice(0, 180));
check("pc.strayButton", !!drawer().querySelector("[data-act='clearStrayFuse']"));
const mark = writes.length;
const dv = drawer().querySelector("[data-act='dmDarkvision']");
if (dv) { dv.value = "30"; dv.dispatchEvent(new w.Event("change", { bubbles: true })); }
await flush(20);
check("pc.changeNoBomb", !drawer().querySelector("[data-act='bombPanel']") && !!drawer().querySelector("[data-act='clearStrayFuse']"));
const playerWrites = writes.slice(mark).filter(row => row.path.indexOf("tokens/") >= 0 && row.kind === "player");
const dmWrite = playerWrites.find(row => row.path.indexOf("map/dm/") === 0);
check("pc.changeKeepsAsset", !!(dmWrite && dmWrite.asset && dmWrite.asset.props && dmWrite.asset.props.timer && dmWrite.asset.props.timer.mode === "fuse" && dmWrite.asset.props.timer.fuseRounds === 1 && dmWrite.asset.state && dmWrite.asset.state.countdownVisible === false), JSON.stringify(playerWrites));

drawer().querySelector("[data-act='clearStrayFuse']").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(40);
const adaAfter = savedTokens().find(t => t.kind === "player");
check("pc.cleared", !!(adaAfter && !(adaAfter.asset && adaAfter.asset.props && adaAfter.asset.props.timer)), JSON.stringify(adaAfter && { id: adaAfter.id, asset: adaAfter.asset }));
check("pc.buttonGone", !el.querySelector("[data-act='clearStrayFuse']"));
check("pc.stillNoBomb", !/Bomb \/ timer/.test(text()));
check("chip.ignoresCreature", w.SSDNSInteract.chipText({ kind: "player", asset: JSON.parse(JSON.stringify(stray)) }, 1, "dm") === "");

clickAt(at(18, 10).x, at(18, 10).y);
await flush(40);
check("enemy.noBomb", !/Bomb \/ timer/.test(text()) && !drawer().querySelector("[data-act='bombPanel']"), text().slice(0, 140));
check("enemy.noStray", !drawer().querySelector("[data-act='clearStrayFuse']"));
const ac = drawer().querySelector("[data-act='enemyAc']");
if (ac) { ac.value = "15"; ac.dispatchEvent(new w.Event("change", { bubbles: true })); }
await flush(20);
const bandit = savedTokens().find(t => t.kind === "enemy");
check("enemy.noAssetWrite", !!(bandit && !bandit.asset), JSON.stringify(bandit && { id: bandit.id, asset: bandit.asset }));

clickAt(at(16, 10).x, at(16, 10).y);
await flush(40);
check("barrel.panel", /Bomb \/ timer/.test(text()) && drawer().querySelector("[data-act='bombMode']") && drawer().querySelector("[data-act='bombMode']").value === "fuse");
check("barrel.rounds", drawer().querySelector("[data-act='bombN']") && drawer().querySelector("[data-act='bombN']").value === "2");
drawer().querySelector("[data-act='bombArm']").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(30);
const keg = savedTokens().find(t => t.kind === "asset");
check("barrel.armed", !!(keg && keg.kind === "asset" && keg.asset && keg.asset.props.timer.mode === "fuse" && keg.asset.state && keg.asset.state.waiting), JSON.stringify(keg && keg.asset && keg.asset.state));
check("barrel.chip", w.SSDNSInteract.chipText(keg, 1, "dm") === "Wait", w.SSDNSInteract.chipText(keg, 1, "dm"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nstray fuse ok");
process.exit(0);

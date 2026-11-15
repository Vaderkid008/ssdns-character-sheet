/**
 * Combat stays off until the DM rolls initiative.
 * Sheet 0.3.327 / DMCC 0.2.340.
 *   node tools/test-combat-default-03327.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.327" && ver.dmcc === "0.2.340" && ver.sheetBuild === "sheet-playtest-v03327" && ver.dmccBuild === "dmcc-playtest-v02340");
check("rules.clean", !read("assets/data/rules.js").includes("fight.started") && !read("database.rules.json").includes("rollInitiative"));
const demo = read("map/demo.html");
check("demo.gated", demo.includes("if (params.get('fight') === '1')") && !demo.includes("if (role === 'dm' || params.get('fight') === '1')"));
const v2 = read("dm/assets/js/v2.js");
check("next.waits", v2.includes('DM.toast("Roll initiative first")') && !/if \(!fight\.started\) \{\n    sortInitiative\(\);\n    fight\.started = true/.test(v2));

function idle(win, role) {
  const strip = win.document.querySelector("[data-act='turnStrip']");
  const text = strip ? strip.textContent : "";
  if (role === "player") return !!(strip && strip.hidden);
  return !!(strip && !strip.hidden && /No fight running/.test(text) && strip.querySelector("[data-act='stripRollInit']") && !strip.querySelector(".turn-round"));
}

function makeWindow() {
  const box = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const win = box.window;
  const proto = win.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(win.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(win.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
  win.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === "createLinearGradient" || p === "createRadialGradient") return function () { return { addColorStop() {} }; };
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  win.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  win.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return win;
}
function addScript(win, rel) {
  const s = win.document.createElement("script");
  s.textContent = read(rel);
  win.document.body.appendChild(s);
}
const sceneJson = JSON.parse(read("map/scene-dusty-spur.json"));
function boot(win, role) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
  const el = win.document.createElement("div");
  win.document.body.appendChild(el);
  const store = { pub: {}, dm: {} };
  return win.SSDNSMap.create({
    el,
    role,
    uid: role === "dm" ? "dm" : "ada",
    adapter: win.SSDNSMapFirebase.memory({ role, store, bus: [] }),
    host: { players: () => [{ uid: "ada", name: "Jolene" }] },
    options: {
      scene: JSON.parse(JSON.stringify(sceneJson)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => [{ uid: "ada", name: "Jolene" }],
      ensureScene: role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}

const dmW = makeWindow();
const dm = boot(dmW, "dm");
await new Promise((r) => setTimeout(r, 120));
check("fresh.dm", idle(dmW, "dm") && dm.syncCombatants && !dmW.document.querySelector(".turn-chip"));
const plW = makeWindow();
boot(plW, "player");
await new Promise((r) => setTimeout(r, 80));
check("fresh.player", idle(plW, "player"));

const pack = JSON.parse(read("showcase/bitter-spring-relay/bitter-spring-relay.ssdns-pack.json"));
pack.maps.forEach((m) => { m.src = "http://127.0.0.1:8765/showcase/bitter-spring-relay/" + String(m.src || "").split("/").pop(); });
const imported = dmW.SSDNSSceneBuilder.importScenePack(JSON.stringify(pack), { store: dmW.localStorage, maps: {} });
(imported.maps || []).forEach((m) => {
  dm.maps().save({ id: m.id, name: m.name, src: m.src, thumb: m.thumb || m.src, grid: m.grid || { cols: 32, rows: 26, px: 70 }, walls: m.walls || [], notes: "" });
});
dmW.document.querySelector("[data-act='sceneBuilderBtn']").click();
dmW.document.querySelector("[data-act='sceneStep'][data-step='4']").click();
const load = dmW.document.querySelector("[data-act='sceneLoad'][data-id='scn_bitter_spring']");
check("pack.btn", !!load && imported.ok);
if (load) load.click();
if (dmW.SSDNSSceneBuilder.close) dmW.SSDNSSceneBuilder.close();
const drop = dmW.document.querySelector("[data-act='sceneLeaveDrop']");
if (drop) drop.click();
check("pack.quiet", idle(dmW, "dm") && dm.viewedScene() === "bitter-spring-relay-ground");

const commands = [];
const sb = { console, localStorage: { getItem() { return null; }, setItem() {} }, addEventListener() {}, removeEventListener() {} };
sb.window = sb;
sb.globalThis = sb;
sb.document = { body: { appendChild() {} }, activeElement: null, addEventListener() {}, removeEventListener() {} };
let seq = 0;
sb.DMCC = {
  $: () => null, $$: () => [], esc: (s) => String(s == null ? "" : s),
  state: {
    players: { ada: { id: "ada", presence: { online: true }, snapshot: { name: "Jolene", abilities: { DEX: 14 } } } },
    ledger: [], rolls: [], chat: [], demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: []
  },
  toast() {},
  uid(p) { seq += 1; return (p || "id") + seq; },
  guardFocus(fn) { if (fn) fn(); },
  pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {},
  roomRef(p) { return { path: p }; }
};
vm.createContext(sb);
vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
const src = v2.replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__fight = { fight: fight, rollInitiativeForAll: rollInitiativeForAll, nextTurn: nextTurn };\n");
vm.runInContext(src, sb, { filename: "v2.js" });
const fight = sb.__fight.fight;
fight.order = [
  { id: "ada", playerId: "ada", name: "Jolene", kind: "player" },
  { id: "en1", name: "Pick-Handle", kind: "enemy", initBonus: 1 }
];
check("roll.before", fight.started === false);
const prompted = commands.length;
await sb.__fight.rollInitiativeForAll({ wait: 0 });
check("roll.on", fight.started === true && fight.round === 1 && commands.length > prompted && commands.some((c) => c && c.type === "init_prompt" && c.to === "ada"), JSON.stringify(commands.map((c) => c && c.type)));
fight.started = false;
sb.__fight.nextTurn();
check("next.blocked", fight.started === false);

dm.syncCombatants({ started: true, round: 1, turn: 0, order: [{ id: "ada", name: "Jolene", kind: "player" }, { id: "en1", name: "Pick-Handle", kind: "enemy" }] });
const live = dmW.document.querySelector("[data-act='turnStrip']");
check("strip.live", live && !live.hidden && /Round 1/.test(live.textContent) && !/No fight running/.test(live.textContent));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("\ncombat default 0.3.327 ok");
setTimeout(() => process.exit(0), 50);

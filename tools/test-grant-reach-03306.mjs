/**
 * A granted creature attacks from its own square and size.
 * Dust Devil Bite vs an adjacent Large Giant Scorpion, and vs a 1x1, is in reach.
 * The same bite is out of range across the room. Initiative order stays hidden until the DM starts it.
 * Sheet 0.3.307 / DMCC 0.2.320.
 *   node tools/test-grant-reach-03306.mjs
 */
import fs from "node:fs";
import path from "node:path";
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
check("ver", ver.sheet === "0.3.307" && ver.dmcc === "0.2.320" && ver.sheetBuild === "sheet-playtest-v03307" && ver.dmccBuild === "dmcc-playtest-v02320");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.307") && !read("database.rules.json").includes("0.3.307"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
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
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const own = { name: "Ada", ac: 14, hp: { cur: 18, max: 27, temp: 0 }, speed: 30, attacks: [{ id: "gunroll:0", name: "Revolver", toHit: "+5", damage: "1d8+3", range: "40/120" }], spells: [] };
const bite = { id: "bite", name: "Bite", kind: "melee", toHit: "+4", damage: "2d4+2 piercing", range: "5 ft" };
function boot(w, opts) {
  ["assets/js/range-rings.js", "assets/js/turn-rules.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  return w.SSDNSMap.create({
    el, role: opts.role, uid: opts.uid,
    adapter: opts.adapter,
    host: { players: () => [{ uid: "ada", name: "Ada" }], ownCard: opts.role === "player" ? () => own : null },
    options: {
      scene: JSON.parse(JSON.stringify(scene)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => [{ uid: "ada", name: "Ada" }],
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { pub: {}, dm: {} };
const bus = [];
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { role: "dm", uid: "dm", adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }) });
await flush(80);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(80);

const adaId = dm.layers().activeId("ada");
dm.patchToken(adaId, { pos: { x: 0, y: 0 }, size: 1 });
function addNpc(name) {
  const before = new Set(dm.tokenBoxes().map((t) => t.id));
  dmW.document.querySelector("[data-act='addTokenBtn']").click();
  return dm.tokenBoxes().find((t) => !before.has(t.id) && (t.kind === "npc" || t.kind === "enemy"));
}
const devil = addNpc("devil");
const scor = addNpc("scorp");
const rat = addNpc("rat");
dm.patchToken(devil.id, {
  name: "Dust Devil", size: 1, pos: { x: 5, y: 5 }, ac: 13, hp: 11, maxHp: 11, speed: 40, initBonus: 2,
  attacks: [bite]
});
dm.patchToken(scor.id, { name: "Giant Scorpion", size: 2, pos: { x: 6, y: 5 }, ac: 15, hp: 52, maxHp: 52 });
dm.patchToken(rat.id, { name: "Rat", size: 1, pos: { x: 5, y: 6 }, ac: 10, hp: 1, maxHp: 1 });
dm.focusToken(devil.id);
dmW.document.querySelector("[data-act='grantUid']").value = "ada";
dmW.document.querySelector("[data-act='grantBtn']").click();
await flush(40);

player.useGrant(devil.id);
const nearLarge = player.aim(scor.id);
check("bite.large", nearLarge && !nearLarge.disabled && nearLarge.text.indexOf("Out of range") < 0 && nearLarge.text.indexOf("Bite") >= 0, JSON.stringify(nearLarge));
const nearSmall = player.aim(rat.id);
check("bite.small", nearSmall && !nearSmall.disabled && nearSmall.text.indexOf("Out of range") < 0, JSON.stringify(nearSmall));
dm.patchToken(rat.id, { pos: { x: 5, y: 12 } });
await flush(30);
const far = player.aim(rat.id);
check("bite.far", far && (far.disabled || far.text.indexOf("Out of range") >= 0), JSON.stringify(far));

const waiting = { started: false, turn: 0, order: [
  { id: "ada-row", kind: "player", playerId: "ada", name: "Ada" },
  { id: "devil-row", kind: "enemy", name: "Dust Devil", mapTokenId: devil.id, initBonus: 2 }
]};
player.syncCombatants(waiting);
const strip = plW.document.querySelector("[data-act='turnStrip']");
check("init.hidden", !!(strip && strip.hidden), strip && String(strip.hidden));
player.syncCombatants(Object.assign({}, waiting, { started: true, turn: 1 }));
check("init.shown", strip && strip.hidden === false);
check("init.moveDevil", player.mayDrag(devil.id) === true);
check("init.moveOwnLocked", player.mayDrag(adaId) === false);

const promptW = makeWindow();
promptW.addEventListener("error", (e) => console.log("prompt err", e.message));
addScript(promptW, "assets/js/dm-join.js");
if (!promptW.SSDNSDmJoin) promptW.document.dispatchEvent(new promptW.Event("DOMContentLoaded"));
promptW.SSDNSDmJoin._handle({ type: "init_prompt", payload: { name: "Dust Devil", tokenId: devil.id, bonus: 2, wait: 8000 } });
const dlg = promptW.document.getElementById("ssdnsInitPrompt");
const title = promptW.document.querySelector("[data-act='initPromptTitle']");
check("init.prompt", !!dlg && title && title.textContent.indexOf("Dust Devil") >= 0 && !!promptW.document.querySelector("[data-act='initPromptRoll']"), title && title.textContent);

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("grant reach 0.3.307 ok");
process.exit(0);

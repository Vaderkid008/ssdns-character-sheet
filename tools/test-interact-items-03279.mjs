/**
 * Interact collects into the sheet, drops back onto the map, and lockpicks a DM DC.
 * Sheet 0.3.279 / DMCC 0.2.292.
 *   node tools/test-interact-items-03279.mjs
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
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.279" && ver.dmcc === "0.2.292" && ver.sheetBuild === "sheet-playtest-v03279" && ver.dmccBuild === "dmcc-playtest-v02292");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.279") && !read("database.rules.json").includes("0.3.279"));
check("rules.toolsUse", /thieves' tools to disarm a trap or open a lock/.test(read("assets/data/rules.js")));
check("heat.line", read("assets/js/spell-riders.js").includes("leaves inventory") && !read("assets/js/spell-riders.js").includes("Nothing leaves inventory"));
check("heat.command", read("dm/assets/js/v2.js").includes('type: "take_gear"') && read("dm/assets/js/v2.js").includes("function dropHeldWeapon"));
check("race.taken", read("dm/assets/js/loot-give.js").includes('if (box.taken) { toast("Already taken."); return; }'));
check("map.collect", read("map/ssdns-map.js").includes("function collectMapLoot") && read("map/ssdns-map.js").includes("Already taken.") && read("map/ssdns-map.js").includes("function placeLockedChest") && read("map/ssdns-map.js").includes("function dropCarriedItem"));

const sb = { console }; sb.window = sb; vm.createContext(sb);
vm.runInContext(read("assets/js/loot.js"), sb);
const L = sb.SSDNSLoot;
const sheet = { abilities: { DEX: 14 }, prof: 2, thievesTools: true, items: [] };
const locked = { id: "box1", name: "Chest", contents: [{ id: "trail-rations", name: "Trail rations", qty: 1 }], cash: { es: 0, black: 0 }, lock: { dc: 15, unlocked: false, jammed: false, jamOnFail: false }, log: [] };
const fail = L.resolve(locked, "lockpick-yes", sheet, () => 1, { nat: 10 });
check("lock.fail", fail.success === false && locked.lock.unlocked === false && fail.total === 14 && /Still locked/.test((locked.log || []).join(" ")), JSON.stringify(fail));
const okPick = L.resolve(locked, "lockpick-yes", sheet, () => 1, { nat: 12 });
check("lock.ok", okPick.success === true && locked.lock.unlocked === true && okPick.total === 16);
const bare = { abilities: { DEX: 14 }, prof: 2, items: [] };
const gate = { lock: { dc: 15, unlocked: false, attempts: {} }, log: [] };
const noTools = L.pickLock(gate, bare, "ada", () => 0.5);
check("pick.needsTools", noTools.noTools === true && gate.lock.unlocked === false && !gate.lock.attempts.ada);
const once = { lock: { dc: 15, unlocked: false, attempts: {}, allowRetries: false }, log: [] };
const first = L.pickLock(once, sheet, "ada", () => 0, { nat: 10 });
const second = L.pickLock(once, sheet, "ada", () => 0, { nat: 20 });
check("pick.once", first.success === false && first.total === 14 && second.already === true && once.lock.unlocked === false);
once.lock.allowRetries = true;
const third = L.pickLock(once, sheet, "ada", () => 0, { nat: 20 });
check("pick.retry", third.success === true && once.lock.unlocked === true && third.total === 24);
const untrained = { abilities: { DEX: 16 }, prof: 3, thievesTools: false, items: [{ catalogId: "thieves-tools-lock-picks", name: "Thieves' tools", count: 1 }] };
const held = { lock: { dc: 10, unlocked: false, attempts: {} }, log: [] };
const heldRoll = L.pickLock(held, untrained, "bev", () => 0, { nat: 8 });
check("pick.toolsNoProf", heldRoll.success === true && heldRoll.total === 11 && !/tools/.test(heldRoll.line));
L.resetLockAttempts(once);
check("pick.reset", once.lock.attempts && !once.lock.attempts.ada);

const box = { id: "box2", name: "Saddlebag", taken: false, opener: "", contents: [{ id: "trail-rations", name: "Trail rations", qty: 1, taken: false }], cash: { es: 0, black: 0 }, lock: { dc: 0, unlocked: true }, log: [], reveal: "everyone", shared: true };
const who = { items: [], ammo: [], guns: [], es: 0 };
const took = L.takeAll(box, "ada", who);
L.applyTake(who, took);
check("take.lands", took.ok === true && box.taken === true && who.items.some((it) => it.name === "Trail rations"));
const again = L.takeAll(box, "ada", who);
check("take.once", again.ok === false && again.reason === "Already taken." && who.items.length === 1);

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.SSDNSApp = { doc() { return { character: { items: [{ catalogId: "trail-rations", name: "Trail rations", count: 1 }], ammo: [], guns: [], es: 0 } }; } };
  return w;
}
const w = makeWindow();
["assets/js/loot.js", "assets/js/items.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} }, bus = [];
const ad = w.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: ad, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
el.querySelector('[data-act="doorLockDc"]').value = "15";
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(20);
const chests = Object.keys(store.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => store.pub[k].value).filter((t) => t && t.kind === "chest");
const lock = chests[0] && chests[0].lootLock && chests[0].lootLock.lock;
check("chest.placed", chests.length === 1 && lock && lock.dc === 15 && lock.unlocked === false, JSON.stringify(chests[0] && chests[0].lootLock));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");
process.exit(0);

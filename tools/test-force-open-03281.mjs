/**
 * Strongbox Force open. Chests have no button. Sheet 0.3.287 / DMCC 0.2.300.
 *   node tools/test-force-open-03281.mjs
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

const mapSrc = read("map/ssdns-map.js");
const forceFn = mapSrc.split("function showForceDie")[1].split("function noteForceNoise")[0];
check("src.noLockpickSound", forceFn.includes("challenge: true") && !forceFn.includes("lockpick"));
check("src.chestGate", mapSrc.includes('data-chest="force"') && mapSrc.includes("Force open"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = { addColorStop() {} };
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.Image = function () { return { set src(v) {}, decode() { return Promise.resolve(); } }; };
  return w;
}
const w = makeWindow();
w.SSDNSApp = { doc() { return { character: { name: "Jolene", abilities: { STR: 16, DEX: 16 }, prof: 3, thievesTools: true } }; } };
["assets/js/loot.js", "assets/js/items.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
const Loot = w.SSDNSLoot;
const iron = { id: "sb", name: "Strongbox", container: "strongbox", boxType: "strongbox", lock: { dc: 15, unlocked: false, allowRetries: false, attempts: {}, forceDc: 25, forceAttempts: {}, jammed: false } };
const skilled = Loot.forceOpen(iron, { abilities: { STR: 16 }, prof: 3, skillProf: { Athletics: 1 } }, "p1", () => 0.5);
check("math.athletics", skilled.nat === 11 && skilled.total === 17 && /Athletics/.test(skilled.line) && skilled.success === false && skilled.noise === true && iron.lock.jammed === false, skilled.line);
const plain = { id: "sb2", name: "Strongbox", container: "strongbox", lock: { dc: 15, unlocked: false, allowRetries: false, forceDc: 25, forceAttempts: {} } };
const bare = Loot.forceOpen(plain, { abilities: { STR: 16 }, prof: 3 }, "p1", () => 0.5);
check("math.noProf", bare.total === 14 && !/Athletics/.test(bare.line), bare.line);
const wood = { id: "ch", name: "Chest", container: "chest", boxType: "chest", lock: { dc: 15, unlocked: false, forceAttempts: {} } };
const chestForce = Loot.forceOpen(wood, { abilities: { STR: 10 }, prof: 2 }, "p1", () => 0.99);
check("chest.api", chestForce.notStrongbox !== true && chestForce.dc === 15 && chestForce.nat === 20, chestForce.line);

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const ad = w.SSDNSMapFirebase.memory({ role: "dm", store, bus: [] });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: ad, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(60);
function boxes() {
  return Object.keys(store.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => store.pub[k].value).filter((t) => t && t.kind === "chest");
}
function menuText() {
  const menu = el.querySelector('[data-act="dmChest"]') || el.querySelector('[data-act="chestMenu"]');
  return menu ? (menu.textContent || "").replace(/\s+/g, " ") : "";
}
el.querySelector('[data-act="chestKind"]').value = "chest";
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(30);
check("chest.forceButton", menuText().indexOf("Force open") >= 0, menuText());

el.querySelector('[data-act="chestKind"]').value = "strongbox";
el.querySelector('[data-act="forceDc"]').value = "25";
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(30);
const before = menuText();
check("strongbox.button", before.indexOf("Force open") >= 0 && !/DC\s*25/.test(before), before);
const placed = boxes().find((t) => t.loot && t.loot.container === "strongbox");
check("strongbox.dc", placed && placed.loot.lock.forceDc === 25 && placed.loot.opened === false, JSON.stringify(placed && placed.loot && placed.loot.lock));

w.Math.random = () => 0;
el.querySelector('[data-chest="force"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(40);
const failed = boxes().find((t) => t.loot && t.loot.container === "strongbox");
const chat = (el.querySelector('[data-act="chatlog"]') || {}).textContent || "";
check("fail.shut", failed && failed.loot.opened === false && failed.loot.lock.unlocked === false && failed.loot.lock.jammed === false, JSON.stringify(failed && failed.loot && { opened: failed.loot.opened, unlocked: failed.loot.lock.unlocked, jammed: failed.loot.lock.jammed }));
check("fail.playerLine", menuText().indexOf("It holds. That was loud.") >= 0, menuText());
const feeds = Object.keys(store.pub).filter((k) => k.indexOf("tableFeed/force_") === 0).map((k) => store.pub[k].value);
check("fail.noise", chat.indexOf("Loud noise: Jolene tried to force the strongbox at") >= 0 && !!el.querySelector(".noise-alert"), chat.slice(0, 240));
check("fail.dmOnly", feeds.some((r) => r && r.noise && r.to === "dm" && String(r.text).indexOf("Loud noise:") === 0), JSON.stringify(feeds.map((r) => r && { to: r.to, text: r.text })));
check("fail.pulse", Number(el.dataset.noisePulses) === 1, el.dataset.noisePulses);
const pulses = Number(el.dataset.noisePulses);

check("once.hidden", menuText().indexOf("Force open") < 0, menuText());
const again = Loot.forceOpen(failed.loot, w.SSDNSApp.doc().character, "dm", () => 0.99);
check("once.gate", again.already === true && failed.loot.opened === false, again.reason);
check("once.noSecondNoise", Number(el.dataset.noisePulses) === pulses);

el.querySelector('[data-act="lockAllowRetries"]').checked = true;
el.querySelector('[data-act="lockAllowRetries"]').dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
check("retry.button", menuText().indexOf("Force open") >= 0, menuText());
const dies = [];
w.SSDNSD20Zoom = {
  play(ev) { dies.push(ev); return Promise.resolve(); },
  pack() { return null; },
  pose() { return { id: "pose" }; }
};
el.querySelector('[data-act="forceDc"]').value = "10";
el.querySelector('[data-act="forceDc"]').dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(20);
w.Math.random = () => 0.99;
el.querySelector('[data-chest="force"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(40);
const opened = boxes().find((t) => t.loot && t.loot.container === "strongbox");
check("success.open", opened && opened.loot.opened === true && opened.loot.lock.unlocked === true && menuText().indexOf("Take") >= 0, menuText());
check("success.die", dies.length === 1 && dies[0].challenge === true && dies[0].fancy === true && dies[0].nat === 20 && dies[0].lockpick !== true && dies[0].label === "Force open", JSON.stringify(dies[0]));

el.querySelector('[data-act="resetLockBtn"]').click();
await flush(20);
const reset = boxes().find((t) => t.loot && t.loot.container === "strongbox");
check("reset.both", reset && Object.keys(reset.loot.lock.attempts || {}).length === 0 && Object.keys(reset.loot.lock.forceAttempts || {}).length === 0);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nforce open ok");
process.exit(0);

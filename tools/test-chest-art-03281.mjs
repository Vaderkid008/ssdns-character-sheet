/**
 * Map chests use the closed and open plates, and the open state is published.
 * Sheet 0.3.301 / DMCC 0.2.314.
 *   node tools/test-chest-art-03281.mjs
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
check("ver", ver.sheet === "0.3.301" && ver.dmcc === "0.2.314" && ver.sheetBuild === "sheet-playtest-v03301" && ver.dmccBuild === "dmcc-playtest-v02314");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.301") && !read("database.rules.json").includes("0.3.301"));
["chest-closed.webp", "chest-closed.png", "chest-open.webp", "chest-open.png"].forEach((name) => {
  check("art." + name, fs.existsSync(path.join(root, "map/props", name)));
});
const map = read("map/ssdns-map.js");
check("src.art", map.includes("props/chest-closed.webp") && map.includes("props/chest-open.webp") && map.includes("props/strongbox-closed.webp") && map.includes("props/strongbox-open.webp"));
["strongbox-closed.webp", "strongbox-closed.png", "strongbox-open.webp", "strongbox-open.png"].forEach((name) => {
  check("art." + name, fs.existsSync(path.join(root, "map/props", name)));
});
check("src.square", map.includes("function paintChestProp") && map.includes("function isChestProp") && map.includes("function chestShowsOpen"));
const paint = map.split("function paintChestProp")[1].split("function loadTokenImage")[0];
check("src.noRing", !paint.includes("fillText('🔒'") && !paint.includes("ctx.arc("));

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
  const srcs = [];
  const Orig = w.Image;
  w.Image = function () {
    const im = new Orig();
    const protoSrc = Object.getOwnPropertyDescriptor(Orig.prototype, "src");
    Object.defineProperty(im, "src", {
      configurable: true,
      get() { return protoSrc.get.call(im); },
      set(v) { srcs.push(String(v)); protoSrc.set.call(im, v); }
    });
    return im;
  };
  w.__srcs = srcs;
  return w;
}
const w = makeWindow();
["assets/js/loot.js", "assets/js/items.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const ad = w.SSDNSMapFirebase.memory({ role: "dm", store, bus: [] });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: ad, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
function chests() {
  return Object.keys(store.pub).filter((k) => k.indexOf("map/public/tokens/") === 0).map((k) => store.pub[k].value).filter((t) => t && t.kind === "chest");
}
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(40);
const closed = chests()[0];
check("placed.closed", closed && closed.loot && closed.loot.opened === false, JSON.stringify(closed && closed.loot && { opened: closed.loot.opened, dc: closed.loot.lock && closed.loot.lock.dc }));
check("art.requested", w.__srcs.some((src) => src.indexOf("props/chest-closed.webp") >= 0) && w.__srcs.some((src) => src.indexOf("props/strongbox-closed.webp") >= 0), w.__srcs.filter((s) => s.indexOf("props/") >= 0).join(" "));

el.querySelector('[data-act="chestLockDc"]').value = "0";
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(30);
const menu = w.document.querySelector('[data-act="dmChest"]') || w.document.querySelector('[data-act="chestMenu"]');
console.log("menu", menu && menu.getAttribute("data-act"), (menu && menu.textContent || "").replace(/\s+/g, " ").slice(0, 180));
const openBtn = menu && (menu.querySelector('[data-dm="open"]') || menu.querySelector('[data-chest="open"]'));
if (openBtn) openBtn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
await flush(40);
const opened = chests().filter((t) => t.loot && t.loot.lock && !(Number(t.loot.lock.dc) > 0));
console.log("unlocked", opened.map((t) => ({ id: t.loot.id, opened: t.loot.opened, dc: t.loot.lock.dc })));
check("open.persisted", opened[0] && opened[0].loot.opened === true && opened[0].lootState && opened[0].lootState.opened === true, JSON.stringify(opened[0] && opened[0].loot && { opened: opened[0].loot.opened, state: opened[0].lootState && opened[0].lootState.opened }));

const locked = chests().find((t) => t.loot && t.loot.lock && Number(t.loot.lock.dc) > 0);
await ad.write("tableFeed/lockopen_test", {
  id: "lockopen_test", ts: new Date().toISOString(), from: "p_jolene", fromName: "Jolene",
  text: "Chest opened", kind: "note", lockBox: locked.loot.id, lockOpen: true
}, { by: "p_jolene" });
await flush(40);
const after = chests().find((t) => t.loot && t.loot.id === locked.loot.id);
check("open.synced", after && after.loot.opened === true && after.lootState.opened === true);
el.querySelector('[data-act="chestKind"]').value = "strongbox";
el.querySelector('[data-act="chestLockDc"]').value = "15";
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(30);
const iron = chests().find((t) => t.loot && t.loot.container === "strongbox");
check("strongbox.placed", iron && iron.loot.opened === false && iron.loot.container === "strongbox" && iron.name === "Strongbox", JSON.stringify(iron && iron.loot && { name: iron.name, container: iron.loot.container, opened: iron.loot.opened }));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nchest art ok");
process.exit(0);

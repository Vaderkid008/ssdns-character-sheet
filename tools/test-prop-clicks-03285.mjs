/**
 * Prop clicks stay on the prop card (sheet 0.3.299 / DMCC 0.2.312).
 * A barrel has no Move menu. A chest has no "Link to…".
 * A shared square lists every prop plus any creature.
 * Edit tokens can still drag an asset.
 *   node tools/test-prop-clicks-03285.mjs
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
check("ver", ver.sheet === "0.3.299" && ver.dmcc === "0.2.312" && ver.sheetBuild === "sheet-playtest-v03299" && ver.dmccBuild === "dmcc-playtest-v02312");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.299") && !read("database.rules.json").includes("0.3.299"));

const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const style = w.document.createElement("style");
style.textContent = read("map/ssdns-map.css");
w.document.head.appendChild(style);
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
["map/interact-timers.js", "map/asset-library.js", "assets/js/loot.js", "map/ssdns-map-move.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"].forEach(addScript);

function pointer(node, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1 });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  node.dispatchEvent(ev);
}
function clickAt(canvas, x, y) {
  pointer(canvas, "pointerdown", x, y);
  pointer(canvas, "pointerup", x, y);
}
function tap(node) {
  if (!node) return;
  node.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
}
function openMenu(rootEl, act) {
  const menu = rootEl.querySelector('[data-act="' + act + '"]');
  return menu && !menu.hidden ? menu : null;
}
function dmAt(gx, gy) { return { x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 }; }
function plAt(origin, gx, gy) { return { x: (gx - origin.x) * 70 + 400, y: (gy - origin.y) * 70 + 300 }; }

function barrel(id, x, y) {
  return {
    id, kind: "asset", name: "Powder Barrel", size: 1, pos: { x, y },
    asset: {
      name: "Powder Barrel",
      props: { timer: { mode: "fuse", fuseRounds: 2 } },
      state: {}, effects: [],
      interact: { actions: ["light-fuse"], reachFt: 5 }
    }
  };
}
function chest(id, x, y) {
  return {
    id, kind: "chest", name: "Oak Chest", size: 1, pos: { x, y }, lootBoxId: id,
    loot: {
      id, name: "Oak Chest", boxType: "chest", container: "chest", opened: false, taken: false,
      contents: [{ id: "rope", name: "Rope", qty: 1 }],
      cash: { es: 0, black: 0, blackId: "", branch: "none" },
      lock: { dc: 15, difficulty: "medium", unlocked: false, attempts: {}, forceAttempts: {}, forceDc: 15, allowRetries: false }
    }
  };
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = { tokens: {
  tok_ada: { id: "tok_ada", kind: "player", name: "Ada", ownerUid: "p_a", size: 1, pos: { x: 15, y: 10 } },
  tok_keg: barrel("tok_keg", 16, 10),
  tok_box: chest("tok_box", 17, 10),
  tok_ned: { id: "tok_ned", kind: "enemy", name: "Ned", size: 1, pos: { x: 14, y: 12 } },
  tok_pile_keg: barrel("tok_pile_keg", 14, 12),
  tok_pile_box: chest("tok_pile_box", 14, 12)
}};
const store = { pub: {}, dm: {} };
const bus = [];
const host = {
  on() {},
  players() { return []; },
  getCard(id) {
    if (id === "tok_ada") return { kind: "pc", name: "Ada", ac: 14, hp: { cur: 10, max: 10 }, speed: 30, attacks: [], spells: [], conditions: [], items: [] };
    if (id === "tok_ned") return { kind: "enemy", name: "Ned", ac: 12, hp: { cur: 8, max: 8 }, speed: 30, attacks: [], spells: [], conditions: [] };
    return null;
  },
  actions: { get() { return []; }, run() { return Promise.resolve(); } }
};
function boot(el, role, uid) {
  el.className = "ssdns-map";
  w.SSDNSMap.create({
    el, role, uid,
    adapter: w.SSDNSMapFirebase.memory({ role, uid, store, bus }),
    host,
    options: { scene, tokens: role === "dm" ? tokens : { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
}
function drawerText(el) {
  const d = el.querySelector("[data-act='drawer']");
  return ((d && d.textContent) || "").replace(/\s+/g, " ");
}

const dm = w.document.createElement("div");
w.document.body.appendChild(dm);
boot(dm, "dm", "dm");
await flush(80);
const dmCanvas = dm.querySelector("canvas");

clickAt(dmCanvas, dmAt(16, 10).x, dmAt(16, 10).y);
await flush(30);
const kegMenu = openMenu(dm, "assetMenu");
const kegText = ((kegMenu && kegMenu.textContent) || "").replace(/\s+/g, " ");
check("dm.barrel.noMove", !openMenu(dm, "tokenCmd") && !/Move/.test(kegText), kegText);
check("dm.barrel.fuse", /Bomb \/ timer/.test(drawerText(dm)) && /Light fuse/.test(kegText) && !/Link to/.test(drawerText(dm)), drawerText(dm).slice(0, 160) + " | " + kegText);

clickAt(dmCanvas, dmAt(17, 10).x, dmAt(17, 10).y);
await flush(30);
const boxMenu = openMenu(dm, "dmChest");
check("dm.chest.card", !!(boxMenu && /Oak Chest/.test(boxMenu.textContent)));
check("dm.chest.noLink", !/Link to/.test(drawerText(dm)) && !openMenu(dm, "tokenCmd"), drawerText(dm).slice(0, 120));

clickAt(dmCanvas, dmAt(14, 12).x, dmAt(14, 12).y);
await flush(30);
const chooser = openMenu(dm, "chooseMenu");
const names = chooser ? Array.from(chooser.querySelectorAll("[data-choose]")).map(b => b.textContent.trim()) : [];
check("dm.chooser", names.indexOf("Powder Barrel") >= 0 && names.indexOf("Oak Chest") >= 0 && names.indexOf("Ned") >= 0 && !openMenu(dm, "tokenCmd") && !openMenu(dm, "dmChest"), names.join(" | "));
const chestBtn = chooser && Array.from(chooser.querySelectorAll("[data-choose]")).find(b => b.textContent === "Oak Chest");
tap(chestBtn);
await flush(20);
check("dm.chooser.chest", !!(openMenu(dm, "dmChest") && !/Link to/.test(drawerText(dm)) && !openMenu(dm, "tokenCmd")));

clickAt(dmCanvas, dmAt(15, 10).x, dmAt(15, 10).y);
await flush(20);
check("dm.creature.menu", !!(openMenu(dm, "tokenCmd") && openMenu(dm, "tokenCmd").querySelector('[data-act="tokenCmdMove"]')));

const pl = w.document.createElement("div");
w.document.body.appendChild(pl);
boot(pl, "player", "p_a");
await flush(120);
const plCanvas = pl.querySelector("canvas");
const origin = { x: 15, y: 10 };
clickAt(plCanvas, plAt(origin, 16, 10).x, plAt(origin, 16, 10).y);
await flush(40);
const pMenu = openMenu(pl, "assetMenu");
const pText = ((pMenu && pMenu.textContent) || "").replace(/\s+/g, " ");
check("pl.barrel.menu", !!(pMenu && /Powder Barrel/.test(pText) && /Light fuse/.test(pText)), pText);
check("pl.barrel.noMove", !openMenu(pl, "tokenCmd") && !pl.querySelector("[data-act='drawer']"), pText);
clickAt(plCanvas, plAt(origin, 14, 12).x, plAt(origin, 14, 12).y);
await flush(30);
const pChoose = openMenu(pl, "chooseMenu");
const pNames = pChoose ? Array.from(pChoose.querySelectorAll("[data-choose]")).map(b => b.textContent.trim()) : [];
check("pl.chooser", pNames.indexOf("Powder Barrel") >= 0 && pNames.indexOf("Oak Chest") >= 0 && pNames.indexOf("Ned") >= 0, pNames.join(" | "));

const edit = dm.querySelector('[data-act="dmEditBtn"]');
tap(edit);
await flush(10);
const from = dmAt(16, 10);
const to = dmAt(18, 10);
pointer(dmCanvas, "pointerdown", from.x, from.y);
pointer(dmCanvas, "pointermove", to.x, to.y);
pointer(dmCanvas, "pointerup", to.x, to.y);
await flush(30);
const saved = store.dm["map/dm/tokens/tok_keg"] && store.dm["map/dm/tokens/tok_keg"].value;
check("dm.editStays", !saved || saved.pos.x === 16, JSON.stringify(saved && saved.pos));
tap(edit);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nprop clicks ok");
process.exit(0);

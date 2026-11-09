/**
 * Token click menu (sheet 0.3.255 / DMCC 0.2.268).
 * Selecting a token shows Move / Interact and does not paint reach or path arrows.
 * Move reveals the existing indicators. Escape or empty ground hides them again.
 * Interact stays disabled when nothing already in reach can be used.
 *   node tools/test-token-click-menu-03243.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.255" && version.sheetBuild === "sheet-playtest-v03255");
check("ver.dmcc", version.dmcc === "0.2.268" && version.dmccBuild === "dmcc-playtest-v02268");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.255"') && read("assets/js/app.js").includes("sheet-playtest-v03255"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.268"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02268"));

const mapSrc = read("map/ssdns-map.js");
const css = read("map/ssdns-map.css");
check("src.gateHover", mapSrc.includes("if (dmEditing() || !state.moveArmed)"));
check("src.gateWalk", mapSrc.includes("if (!state.moveArmed) return false;"));
check("src.gateReach", mapSrc.includes("if (dmEditing() || !state.moveArmed) return;"));
check("src.menu", mapSrc.includes('data-act="tokenCmd"') && mapSrc.includes("tokenCmdMove") && mapSrc.includes("tokenCmdInteract"));
check("src.drawerStays", mapSrc.includes("showCommandMenu(hit)") && mapSrc.includes("openDrawer(hit.id)"));
check("src.esc", mapSrc.includes("if (e.key === 'Escape' && state.moveArmed)"));
check("src.ground", mapSrc.includes("cancelTokenCommand('ground')"));
check("css.menu", css.includes(".ssm-token-cmd") && css.includes(".ssm-token-cmd button:disabled"));
check("rules.untouched", !read("assets/data/rules.js").includes("tokenCmd") && !read("database.rules.json").includes("tokenCmd"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const proto = w.HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
w.__arrows = 0;
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; },
    set(t, p, v) {
      t[p] = v;
      if (p === "fillStyle" && (String(v).indexOf("210, 184, 90") >= 0 || String(v).indexOf("64, 168, 96") >= 0 || String(v).indexOf("176, 48, 48") >= 0)) w.__arrows += 1;
      return true;
    }
  });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
function addScript(rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function pointer(el, type, x, y, button) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const buttons = type === "pointermove" || type === "pointerup" ? 0 : 1;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: button || 0, buttons: buttons });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  el.dispatchEvent(ev);
}
addScript("map/ssdns-map-move.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const screenOf = (gx, gy) => ({ x: (gx + 0.5) * 70 - 650, y: (gy + 0.5) * 70 - 400 });
const tokens = { tokens: {
  tok_t: { id: "tok_t", kind: "player", name: "Dust", combatantId: "p_t", ownerUid: "p_t", size: 1, pos: { x: 15, y: 8 } }
} };
const host = {
  on() {},
  getCard() { return { kind: "pc", name: "Dust", ac: 13, hp: { cur: 9, max: 9 }, attacks: [{ id: "knife", name: "Knife", toHit: 3, damage: "1d4" }] }; },
  combatTargets() { return { selected: "", options: [] }; },
  actions: { get() { return []; }, run() { return Promise.resolve(); } },
  players() { return []; }
};
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host,
  options: { scene, tokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
const canvas = el.querySelector("canvas");
const at = screenOf(15, 8);
pointer(canvas, "pointerdown", at.x, at.y);
pointer(canvas, "pointerup", at.x, at.y);
await flush(40);
const menu = el.querySelector('[data-act="tokenCmd"]');
const moveBtn = menu && menu.querySelector('[data-act="tokenCmdMove"]');
const interactBtn = menu && menu.querySelector('[data-act="tokenCmdInteract"]');
check("select.menu", !!(menu && moveBtn && interactBtn && moveBtn.textContent === "Move" && interactBtn.textContent === "Interact"));
check("select.noArrows", el.dataset.moveArmed !== "1" && w.__arrows === 0, "armed=" + el.dataset.moveArmed + " arrows=" + w.__arrows);
check("select.interactOff", !!(interactBtn && interactBtn.disabled));
check("select.drawer", !!el.querySelector('[data-act="drawer"]'));
pointer(canvas, "pointermove", screenOf(16, 8).x, screenOf(16, 8).y);
await flush(40);
check("hover.stillHidden", w.__arrows === 0, "arrows=" + w.__arrows);

moveBtn.click();
await flush(40);
check("move.armed", el.dataset.moveArmed === "1" && moveBtn.classList.contains("is-on"));
const before = w.__arrows;
pointer(canvas, "pointermove", screenOf(16, 8).x, screenOf(16, 8).y);
await flush(40);
check("move.arrows", w.__arrows > before, "before=" + before + " after=" + w.__arrows);

w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await flush(40);
check("esc.hides", el.dataset.moveArmed !== "1" && !el.querySelector('[data-act="tokenCmd"]'), "armed=" + el.dataset.moveArmed);

pointer(canvas, "pointerdown", at.x, at.y);
pointer(canvas, "pointerup", at.x, at.y);
await flush(20);
el.querySelector('[data-act="tokenCmdMove"]').click();
await flush(20);
check("move.again", el.dataset.moveArmed === "1");
const ground = screenOf(12, 12);
pointer(canvas, "pointerdown", ground.x, ground.y);
pointer(canvas, "pointerup", ground.x, ground.y);
await flush(40);
check("ground.hides", el.dataset.moveArmed !== "1", "armed=" + el.dataset.moveArmed);

const chestTokens = { tokens: {
  tok_t: { id: "tok_t", kind: "player", name: "Dust", combatantId: "p_t", ownerUid: "p_t", size: 1, pos: { x: 15, y: 8 } },
  tok_box: { id: "tok_box", kind: "chest", name: "Crate", lootBoxId: "box1", size: 1, pos: { x: 16, y: 8 } }
} };
const store = { pub: {}, dm: {} };
const elDm = w.document.createElement("div");
w.document.body.appendChild(elDm);
w.SSDNSMap.create({
  el: elDm, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm", store: store }),
  host,
  options: { scene, tokens: chestTokens, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
const el2 = w.document.createElement("div");
w.document.body.appendChild(el2);
w.SSDNSMap.create({
  el: el2, role: "player", uid: "p_t",
  adapter: w.SSDNSMapFirebase.memory({ role: "player", store: store }),
  host,
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(120);
const canvas2 = el2.querySelector("canvas");
function clickAt(x, y) {
  pointer(canvas2, "pointerdown", x, y);
  pointer(canvas2, "pointerup", x, y);
}
clickAt(400, 300);
await flush(30);
if (!el2.querySelector('[data-act="tokenCmd"]')) clickAt(at.x, at.y);
await flush(40);
const menu2 = el2.querySelector('[data-act="tokenCmd"]');
const interact2 = menu2 && menu2.querySelector('[data-act="tokenCmdInteract"]');
check("player.menu", !!(menu2 && menu2.querySelector('[data-act="tokenCmdMove"]') && interact2));
check("player.noDrawer", !el2.querySelector('[data-act="drawer"]'));
check("player.interactOn", !!(interact2 && !interact2.disabled));
check("player.noArrows", el2.dataset.moveArmed !== "1");
if (interact2) interact2.click();
await flush(20);
check("player.chestMenu", !!el2.querySelector('[data-act="chestMenu"]'));

if (failures.length) {
  console.log("FAILED " + failures.length);
  process.exit(1);
}
console.log("passed");
process.exit(0);

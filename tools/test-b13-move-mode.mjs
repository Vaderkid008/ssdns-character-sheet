/**
 * B13 Move mode. In a fight the strip Move chip opts into green reach and click-to-walk.
 * Outside a fight, click-to-move stays free. Edit tokens still bypasses the mode.
 *   node tools/test-b13-move-mode.mjs
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
const lockSrc = read("assets/js/turn-lock.js");
const dmSrc = read("dm/assets/js/v2.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");
const sheetCss = read("assets/css/sheet.css");
const dmCss = read("dm/assets/css/dmcc.css");

check("src.defaultOff", mapSrc.includes("moveMode: false") && mapSrc.includes("var on = false"));
check("src.noCheckbox", !mapSrc.includes("showMoveReach") && !mapSrc.includes("Show move reach"));
check("src.gate", mapSrc.includes("if (fightOn() && !state.moveMode) return false"));
check("src.green", mapSrc.includes("if (!state.moveMode) return;"));
check("src.hoverOff", mapSrc.includes("fightOn() && !state.moveMode"));
check("src.stay", mapSrc.includes("spentOut") && mapSrc.includes("No movement left."));
check("src.autoExit", mapSrc.includes("exitMoveMode('feet')") && mapSrc.includes("toast('No movement left')"));
check("src.esc", mapSrc.includes("window.SSDNSMoveMode.set(false, 'esc')"));
check("src.rightClick", mapSrc.includes("function cancelMoveGesture()"));
check("src.turnExit", mapSrc.includes("exitMoveMode('turn')") && mapSrc.includes("hadTurn"));
check("src.editBypass", mapSrc.includes("if (dmEditing()) return false") && mapSrc.includes("Edit tokens still drags any token and ignores Move mode."));
check("src.outsideFree", mapSrc.includes("Outside a fight, click a square to walk."));
check("src.playerChip", lockSrc.includes('data-tl-movemode') && lockSrc.includes(">Move <b>'") && lockSrc.includes("button[data-tl-movemode]"));
check("src.dmChip", dmSrc.includes("function moveFeetHtml") && dmSrc.includes("data-tl-movemode") && dmSrc.includes("Move ${left}/${max} ft"));
check("src.active", sheetCss.includes("button.tl-move.is-on") && dmCss.includes("button.tl-move.is-on"));
check("rules.untouched", !rules.includes("moveMode") && !rulesJs.includes("moveMode") && !rulesJs.includes("data-tl-movemode"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const fills = [];
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) {
        t[p] = v;
        if (p === "fillStyle") fills.push(String(v));
        return true;
      }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  const rafs = [];
  w.requestAnimationFrame = function (fn) { rafs.push(fn); return rafs.length; };
  w.cancelAnimationFrame = function () {};
  w.fetch = async function () { return { ok: false, status: 404, json: async () => ({}) }; };
  w.__fills = fills;
  w.__pump = async function () {
    for (let i = 0; i < 8; i++) {
      const batch = rafs.splice(0, rafs.length);
      batch.forEach((fn) => { try { fn(Date.now()); } catch (e) {} });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const GREEN = "rgba(64, 168, 96, 0.34)";

const w = makeWindow();
addScript(w, "assets/js/turn-rules.js");
addScript(w, "map/ssdns-map-move.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");

check("bus.off", w.SSDNSMoveMode && w.SSDNSMoveMode.isOn() === false);
const chip = w.document.createElement("button");
chip.type = "button";
chip.setAttribute("data-tl-movemode", "");
chip.textContent = "Move 30/30 ft";
w.document.body.appendChild(chip);
chip.click();
check("bus.on", w.SSDNSMoveMode.isOn() === true && chip.classList.contains("is-on") && chip.getAttribute("aria-pressed") === "true");
chip.click();
check("bus.toggleOff", w.SSDNSMoveMode.isOn() === false && !chip.classList.contains("is-on"));
const locked = w.document.createElement("button");
locked.type = "button";
locked.setAttribute("data-tl-movemode", "");
locked.className = "turn-locked";
locked.setAttribute("aria-disabled", "true");
w.document.body.appendChild(locked);
locked.click();
check("bus.locked", w.SSDNSMoveMode.isOn() === false);

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
scene.walls = [];
let feet = 30;
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el: el,
  role: "dm",
  uid: "dm1",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    movementBudget() {
      return { free: false, active: true, left: feet, max: 30, speed: 30, dash: false };
    },
    players() { return []; }
  },
  options: {
    scene: scene,
    assetBase: "",
    tokens: {
      tokens: {
        tok1: { id: "tok1", name: "Jolene", kind: "player", ownerUid: "p1", ownerCanMove: true, pos: { x: 4, y: 4 }, size: 1, sceneId: "scn_dustyspur01" }
      }
    },
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await w.__pump();
await new Promise((resolve) => setTimeout(resolve, 30));
await w.__pump();
const toast = () => (el.querySelector('[data-act="toast"]') || {}).textContent || "";
map.syncCombatants({
  started: true,
  round: 1,
  turn: 0,
  order: [{ id: "p1", playerId: "p1", kind: "player", name: "Jolene", speed: 30 }],
  markers: {}
});
await w.__pump();
w.__fills.length = 0;
map.requestDraw();
await w.__pump();
check("fight.offNoGreen", !w.__fills.includes(GREEN), w.__fills.filter((c) => c.indexOf("64, 168") >= 0).join("|"));
chip.click();
await w.__pump();
w.__fills.length = 0;
map.requestDraw();
await w.__pump();
check("fight.onGreen", w.SSDNSMoveMode.isOn() === true && w.__fills.includes(GREEN));
feet = 15;
map.refreshMove();
await w.__pump();
check("fight.stays", w.SSDNSMoveMode.isOn() === true, "mode " + w.SSDNSMoveMode.isOn());
feet = 0;
map.refreshMove();
await w.__pump();
check("fight.zeroExits", w.SSDNSMoveMode.isOn() === false && toast() === "No movement left", toast());
w.__fills.length = 0;
map.requestDraw();
await w.__pump();
check("fight.zeroNoGreen", !w.__fills.includes(GREEN));
feet = 30;
chip.click();
await w.__pump();
check("fight.reenter", w.SSDNSMoveMode.isOn() === true);
const edit = el.querySelector('[data-act="dmEditBtn"]');
edit.click();
await w.__pump();
w.__fills.length = 0;
map.requestDraw();
await w.__pump();
check("edit.bypass", w.SSDNSMoveMode.isOn() === true && edit.getAttribute("aria-pressed") === "true" && !w.__fills.includes(GREEN));
edit.click();
await w.__pump();
w.__fills.length = 0;
map.requestDraw();
await w.__pump();
check("edit.offGreenReturns", edit.getAttribute("aria-pressed") === "false" && w.__fills.includes(GREEN));
map.syncCombatants({
  started: true,
  round: 1,
  turn: 1,
  order: [
    { id: "p1", playerId: "p1", kind: "player", name: "Jolene", speed: 30 },
    { id: "e1", kind: "enemy", name: "Bandit", speed: 30 }
  ],
  markers: {}
});
await w.__pump();
check("turn.exits", w.SSDNSMoveMode.isOn() === false);
chip.click();
check("outside.prep", w.SSDNSMoveMode.isOn() === true);
map.syncCombatants({ started: false, round: 1, turn: 0, order: [], markers: {} });
await w.__pump();
check("fight.endExits", w.SSDNSMoveMode.isOn() === false);
chip.click();
await w.__pump();
w.__fills.length = 0;
map.requestDraw();
await w.__pump();
check("outside.noGreen", w.SSDNSMoveMode.isOn() === true && !w.__fills.includes(GREEN));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("b13 move mode ok");

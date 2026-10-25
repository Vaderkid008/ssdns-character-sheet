/**
 * B14: map token drawer docks like chat. Player default left, DM default right.
 * Drag floats it; dropping the pointer on a side edge docks again. Open/collapsed,
 * side, and float position stay in localStorage. Same card body as before.
 *   node tools/test-b14-token-dock.mjs
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
check("src.playerDefault", mapSrc.includes("return role === 'player' ? 'left' : 'right'"));
check("src.keys", mapSrc.includes("'ssdns.dmCard'") && mapSrc.includes("'ssdns.playerCard'"));
check("src.collapse", mapSrc.includes('data-act="drawerCollapse"') && mapSrc.includes('data-act="playerCardMin"') && mapSrc.includes('data-act="drawerDock"') && mapSrc.includes('data-act="playerDock"'));
check("src.float", mapSrc.includes("mode: 'float'") && mapSrc.includes("mode: 'dock'"));
check("css.playerLeft", css.includes('"token strip dock"') && css.includes("320px minmax(0, 1fr) 320px") && css.includes("48px minmax(0, 1fr) 320px"));
check("css.dmRight", css.includes('"left stage right token"') && css.includes("max-content minmax(0, 1fr) max-content 320px") && css.includes("max-content minmax(0, 1fr) max-content 48px"));
check("css.playerRight", css.includes('"strip dock token"'));
check("css.placed", css.includes(".ssm-drawer.placed") && css.includes(".ssm-drawer.min .ssm-drawer-body"));
check("rules.untouched", !read("database.rules.json").includes("ssm-token-dock") && !read("assets/data/rules.js").includes("ssm-token-dock"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    const s = this.style || {};
    const map = this.classList && (this.classList.contains("ssdns-map") || this.classList.contains("ssdns-role-dm") || this.classList.contains("ssdns-role-player"));
    const drawer = this.classList && this.classList.contains("ssm-drawer");
    const left = parseFloat(s.left) || 0;
    const top = parseFloat(s.top) || 0;
    const boxW = parseFloat(s.width) || (map ? 800 : (drawer ? 260 : 280));
    const boxH = parseFloat(s.height) || (map ? 600 : (drawer ? 320 : 200));
    return { x: left, y: top, left, top, right: left + boxW, bottom: top + boxH, width: boxW, height: boxH, toJSON() { return {}; } };
  };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }
function pointer(w, el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  el.dispatchEvent(new Ev(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0,
    buttons: type === "pointerup" ? 0 : 1
  }));
}
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const el = w.document.createElement("div");
el.className = "ssdns-map";
el.style.width = "800px";
el.style.height = "600px";
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    on() {},
    getCard(id) {
      if (id === "bandit") return { name: "Bandit", kind: "enemy", ac: 12, hp: { cur: 9, max: 11 }, speed: 30, attacks: [{ id: "ball", name: "Ball" }], conditions: [] };
      return null;
    }
  },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
act(el, "addTokenBtn").click();
await flush(20);
const drawer = act(el, "drawer");
check("dm.defaultRight", el.classList.contains("ssm-token-dock") && el.classList.contains("ssm-token-right") && !el.classList.contains("ssm-token-left") && drawer && !drawer.classList.contains("placed") && drawer.style.left === "", drawer && drawer.className + " " + el.className);
check("dm.body", drawer && drawer.textContent.includes("No card linked") && !!act(el, "drawerCollapse") && !!act(el, "drawerReset"));
act(el, "drawerCollapse").click();
const shut = JSON.parse(w.localStorage.getItem("ssdns.dmCard") || "null");
check("dm.collapsed", el.classList.contains("ssm-token-shut") && drawer.classList.contains("min") && shut && shut.mode === "dock" && shut.side === "right" && shut.open === false, JSON.stringify(shut));
act(el, "drawerCollapse").click();
check("dm.expanded", !el.classList.contains("ssm-token-shut") && !drawer.classList.contains("min"));
const head = el.querySelector(".ssm-drawer-head");
pointer(w, head.querySelector("b"), "pointerdown", 400, 40);
pointer(w, head, "pointermove", 500, 80);
pointer(w, head, "pointerup", 500, 80);
const floated = JSON.parse(w.localStorage.getItem("ssdns.dmCard") || "null");
check("dm.float", drawer.classList.contains("placed") && !el.classList.contains("ssm-token-dock") && floated && floated.mode === "float" && isFinite(floated.x) && isFinite(floated.y), JSON.stringify(floated) + " left=" + drawer.style.left);
pointer(w, head.querySelector("b"), "pointerdown", 200, 40);
pointer(w, head, "pointermove", 12, 80);
pointer(w, head, "pointerup", 12, 80);
const leftDock = JSON.parse(w.localStorage.getItem("ssdns.dmCard") || "null");
check("dm.redockLeft", el.classList.contains("ssm-token-left") && !drawer.classList.contains("placed") && leftDock && leftDock.mode === "dock" && leftDock.side === "left", JSON.stringify(leftDock) + " class=" + el.className);
act(el, "drawerReset").click();
check("dm.reset", !drawer.classList.contains("placed") && el.classList.contains("ssm-token-right") && !el.classList.contains("ssm-token-shut") && drawer.style.left === "" && w.localStorage.getItem("ssdns.dmCard") == null);
act(el, "drawerClose").click();
check("dm.closedClearsColumn", !el.classList.contains("ssm-token-dock") && !act(el, "drawer"));

const pw = makeWindow();
addScript(pw, "map/ssdns-map-firebase.js");
addScript(pw, "map/ssdns-map.js");
const pel = pw.document.createElement("div");
pel.className = "ssdns-map";
pel.style.width = "800px";
pel.style.height = "600px";
pw.document.body.appendChild(pel);
pw.SSDNSMap.create({
  el: pel, role: "player", uid: "ada",
  adapter: pw.SSDNSMapFirebase.memory({ role: "player" }),
  host: { on() {} },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
const card = act(pel, "playerCard");
check("player.defaultLeft", !!card && pel.classList.contains("ssm-token-left") && pel.classList.contains("ssm-token-dock") && !card.classList.contains("ssm-float") && card.style.left === "" && !!act(pel, "playerPingBtn") && !!act(pel, "actionSlot"));
act(pel, "playerCardMin").click();
const pShut = JSON.parse(pw.localStorage.getItem("ssdns.playerCard") || "null");
check("player.collapsed", pel.classList.contains("ssm-token-shut") && card.classList.contains("min") && pShut && pShut.mode === "dock" && pShut.side === "left" && pShut.open === false, JSON.stringify(pShut));
act(pel, "playerCardMin").click();
const pHead = act(pel, "playerCardHead");
pointer(pw, pHead, "pointerdown", 200, 40);
pointer(pw, pHead, "pointermove", 360, 120);
pointer(pw, pHead, "pointerup", 360, 120);
const pFloat = JSON.parse(pw.localStorage.getItem("ssdns.playerCard") || "null");
check("player.float", card.classList.contains("ssm-float") && card.style.left !== "" && card.style.top !== "" && pFloat && pFloat.mode === "float" && isFinite(pFloat.x), JSON.stringify(pFloat));
act(pel, "playerDock").click();
const pDock = JSON.parse(pw.localStorage.getItem("ssdns.playerCard") || "null");
check("player.redock", pel.classList.contains("ssm-token-dock") && !card.classList.contains("ssm-float") && pDock && pDock.mode === "dock", JSON.stringify(pDock) + " side=" + (pDock && pDock.side));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("\ntoken dock checks passed");

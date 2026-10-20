/**
 * Sheet 0.3.54 / DMCC 0.2.67 UI cleanup.
 * Toolbar move buttons, docked chat tuck, draggable DM card, gun melee order.
 *   node tools/test-ui-cleanup.mjs
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
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const version = JSON.parse(read("version.json"));
const app = read("assets/js/app.js");
const mapSrc = read("map/ssdns-map.js");
const css = read("map/ssdns-map.css");
const sheetCss = read("assets/css/sheet.css");
check("ver.sheet", version.sheet === "0.3.78" && version.sheetBuild === "sheet-playtest-v0378");
check("ver.dmcc", version.dmcc === "0.2.91" && version.dmccBuild === "dmcc-playtest-v0291");
check("ver.app", app.includes('APP_VERSION = "0.3.78"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.91"'));
check("rules.untouched", !read("database.rules.json").includes("ssdns.dmCard") && !read("assets/data/rules.js").includes("g-gunmelee"));

const toolbar = mapSrc.slice(mapSrc.indexOf("toolbar.innerHTML"), mapSrc.indexOf("el.appendChild(toolbar)"));
const leftbar = mapSrc.slice(mapSrc.indexOf("leftbar.innerHTML"), mapSrc.indexOf("el.appendChild(leftbar)"));
const rightSrc = mapSrc.slice(mapSrc.indexOf("rightbar.innerHTML"), mapSrc.indexOf("el.appendChild(rightbar)"));
check("toolbar.moves", !toolbar.includes('data-act="lockBtn"') && rightSrc.includes('class="ssm-move-tools"') && rightSrc.indexOf('data-act="lockBtn"') < rightSrc.indexOf('data-act="undoBtn"') && rightSrc.indexOf('data-act="undoBtn"') < rightSrc.indexOf('data-act="redoBtn"'));
check("toolbar.notLeft", !leftbar.includes('data-act="lockBtn"') && !leftbar.includes("Undo Move") && !leftbar.includes("Redo Move"));
check("chat.toggle", mapSrc.includes('data-act="chatToggle"') && mapSrc.includes("ssdns.map.chatOpen") && mapSrc.includes('data-act="chatPop">Pop out') && mapSrc.includes('data-act="chatWindow"'));
check("card.drag", mapSrc.includes("ssdns.dmCard") && mapSrc.includes('data-act="drawerReset"') && css.includes(".ssm-drawer.placed"));
check("chat.tuck", css.includes(".ssdns-chatdock.ssm-chat-shut") && css.includes("148px") && css.includes(".ssm-move-tools"));

const gun = app.slice(app.indexOf('data-gunroll'), app.indexOf('data-gunroll') + 700);
check("melee.order", gun.indexOf("data-gunroll") >= 0 && gun.indexOf("data-gunroll") < gun.indexOf("data-gunmelee") && gun.indexOf("data-gunmelee") < gun.indexOf('data-out": "gmelee.'));
check("melee.space", sheetCss.includes(".g-actions .g-gunmelee") && sheetCss.includes("margin-left: 8px") && sheetCss.includes(".g-actions .g-gunmelee:empty") && sheetCss.includes("flex-wrap: wrap"));
check("melee.labels", app.includes("Melee: Pistol Whip, 5 ft") && app.includes("Melee: Rifle Butt, 5 ft"));

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
    const boxW = parseFloat(s.width) || (map ? 800 : (drawer ? 260 : 120));
    const boxH = parseFloat(s.height) || (map ? 600 : (drawer ? 320 : 32));
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

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const w = makeWindow();
addScript(w, "assets/js/apply-guard.js");
addScript(w, "map/ssdns-map-chat.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const el = w.document.createElement("div");
el.className = "ssdns-map";
el.style.width = "800px";
el.style.height = "600px";
w.document.body.appendChild(el);
const api = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: { on() {} },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);

const bar = el.querySelector(".ssdns-toolbar");
const left = el.querySelector(".ssdns-leftbar");
const right = el.querySelector(".ssdns-rightbar");
const moves = right && right.querySelector(".ssm-move-tools");
const moveActs = moves ? [...moves.querySelectorAll("button")].map((b) => b.getAttribute("data-act")) : [];
check("dm.right", moveActs.join(",") === "lockBtn,undoBtn,redoBtn" && right.contains(act(el, "lockBtn")) && !bar.contains(act(el, "lockBtn")) && !left.contains(act(el, "lockBtn")), moveActs.join(","));
act(el, "lockBtn").click();
check("lock.needsToken", act(el, "toast") && act(el, "toast").textContent === "Select a token first");
act(el, "addTokenBtn").click();
await flush(20);
act(el, "lockBtn").click();
check("lock.still", act(el, "toast") && act(el, "toast").textContent === "Locked", act(el, "toast") && act(el, "toast").textContent);
act(el, "undoBtn").click();
act(el, "redoBtn").click();
check("undo.wired", !!act(el, "undoBtn") && !!act(el, "redoBtn"));

const dock = el.querySelector(".ssdns-chatdock");
check("chat.open", dock && !dock.classList.contains("ssm-chat-shut") && act(el, "chatCaret").textContent === "▾" && w.localStorage.getItem("ssdns.map.chatOpen.dm") === "1");
act(el, "chatToggle").click();
check("chat.tucked", dock.classList.contains("ssm-chat-shut") && act(el, "chatToggle").getAttribute("aria-expanded") === "false" && act(el, "chatCaret").textContent === "▲" && w.localStorage.getItem("ssdns.map.chatOpen.dm") === "0");
check("chat.popStays", act(el, "chatPop") && act(el, "chatPop").hidden === false && act(el, "chatWindow") && act(el, "chatWindow").hidden === false);
act(el, "chatPop").click();
const float = el.querySelector("[data-act=chatFloat]");
check("chat.popped", !!float && el.classList.contains("ssdns-chat-popped") && dock.classList.contains("ssm-chat-shut"));
float.querySelector("[data-act=floatDock]").click();
check("chat.dockedShut", !el.querySelector("[data-act=chatFloat]") && !el.classList.contains("ssdns-chat-popped") && dock.classList.contains("ssm-chat-shut") && w.localStorage.getItem("ssdns.map.chatOpen.dm") === "0");
const opened = [];
w.open = function (url, name, features) {
  opened.push({ url: String(url), name: name, features: String(features || "") });
  return { closed: false, postMessage() {}, close() {}, focus() {} };
};
act(el, "chatWindow").click();
check("chat.tab", opened.length === 1 && opened[0].name === "ssdns-map-chat" && opened[0].url.indexOf("chat-pop.html") >= 0, JSON.stringify(opened));
check("chat.tabStillShut", dock.classList.contains("ssm-chat-shut") && w.localStorage.getItem("ssdns.map.chatOpen.dm") === "0");
act(el, "chatToggle").click();
check("chat.restored", !dock.classList.contains("ssm-chat-shut") && act(el, "chatToggle").title === "Minimize chat" && w.localStorage.getItem("ssdns.map.chatOpen.dm") === "1");

const head = el.querySelector(".ssm-drawer-head");
check("card.reset", !!act(el, "drawerReset") && head && head.textContent.includes("No card linked"));
pointer(w, head.querySelector("b"), "pointerdown", 40, 40);
pointer(w, head, "pointermove", 160, 90);
pointer(w, head, "pointerup", 160, 90);
const drawer = act(el, "drawer");
const saved = JSON.parse(w.localStorage.getItem("ssdns.dmCard") || "null");
check("card.moved", drawer.classList.contains("placed") && parseFloat(drawer.style.left) === 120 && parseFloat(drawer.style.top) === 50 && saved && saved.x === 120 && saved.y === 50, JSON.stringify(saved) + " left=" + drawer.style.left);
act(el, "drawerClose").click();
act(el, "addTokenBtn").click();
await flush(20);
const again = act(el, "drawer");
check("card.remembered", again && again.classList.contains("placed") && parseFloat(again.style.left) === 120 && parseFloat(again.style.top) === 50, again && again.style.left + "," + again.style.top);
act(el, "drawerClose").click();
w.localStorage.setItem("ssdns.dmCard", JSON.stringify({ x: 9000, y: 9000 }));
act(el, "addTokenBtn").click();
await flush(20);
const clamped = act(el, "drawer");
check("card.onscreen", clamped && parseFloat(clamped.style.left) === 540 && parseFloat(clamped.style.top) === 280, clamped && clamped.style.left + "," + clamped.style.top);
act(el, "drawerReset").click();
check("card.resetClears", !clamped.classList.contains("placed") && clamped.style.left === "" && clamped.style.top === "" && w.localStorage.getItem("ssdns.dmCard") == null);
check("card.staysOpen", !!act(el, "drawer") && act(el, "drawer").textContent.includes("No card linked"));
api.destroy();

const pw = makeWindow();
pw.localStorage.setItem("ssdns.map.chatOpen", "0");
addScript(pw, "assets/js/apply-guard.js");
addScript(pw, "map/ssdns-map-chat.js");
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
const pdock = pel.querySelector(".ssdns-chatdock");
check("player.noMoves", !pel.querySelector(".ssm-move-tools") && !act(pel, "lockBtn"));
check("player.rememberedShut", pdock && pdock.classList.contains("ssm-chat-shut") && act(pel, "chatPop") && act(pel, "chatWindow"));
act(pel, "chatToggle").click();
check("player.restored", !pdock.classList.contains("ssm-chat-shut") && pw.localStorage.getItem("ssdns.map.chatOpen.player") === "1" && pw.localStorage.getItem("ssdns.map.chatOpen") === "0");
act(pel, "chatToggle").click();
check("player.tucked", pdock.classList.contains("ssm-chat-shut") && pw.localStorage.getItem("ssdns.map.chatOpen.player") === "0");

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("ui cleanup ok");

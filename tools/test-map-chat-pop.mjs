/**
 * Map chat pop-out. Desktop and tablet float a panel. Open in new tab keeps the window.
 * A phone under 600px uses the full-screen overlay. Sends go through the map chat once.
 *
 *   node tools/test-map-chat-pop.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
}
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function flush(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.126" && version.sheetBuild === "sheet-playtest-v03126");
check("ver.dmcc", version.dmcc === "0.2.139" && version.dmccBuild === "dmcc-playtest-v02139");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.126"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.139"'));

const mapSrc = read("map/ssdns-map.js");
const chatSrc = read("map/ssdns-map-chat.js");
const sheetSrc = read("assets/js/sheet-extras.js");
const dmSrc = read("dm/assets/js/dmcc.js");
check("src.pop", mapSrc.includes('data-act="chatPop">Pop out') && mapSrc.includes('data-act="chatDock"'));
check("src.chatlog", mapSrc.includes('data-act="chatlog"') && mapSrc.includes('data-act="chatInput"') && mapSrc.includes('data-act="chatSend"'));
check("src.once", mapSrc.includes("emit('chat:send'") && !mapSrc.includes("postChat"));
check("src.publish.sheet", sheetSrc.includes("SSDNSMapChat.publish"));
check("src.publish.dm", dmSrc.includes("SSDNSMapChat.publish") && dmSrc.includes("publishMapChat"));
check("src.window", chatSrc.includes("root.open(") && chatSrc.includes("chat-pop.html") && chatSrc.includes("max-width: 599px") && !chatSrc.includes("max-width: 800px"));
check("src.float", chatSrc.includes("ssdns-chat-float") && chatSrc.includes("ssdns.map.chatFloat") && mapSrc.includes('data-act="chatWindow"'));
check("src.color", chatSrc.includes("tokenColorFor") && chatSrc.includes("leadNameHtml"));
check("src.rules", !read("map/ssdns-map-chat.js").includes("database.rules") && !mapSrc.includes("database.rules"));
check("html.player", read("index.html").includes("map/ssdns-map-chat.js?v=0.3.126-float"));
check("html.dm", read("dm/index.html").includes("ssdns-map-chat.js?v=0.2.139-float"));
check("html.pop", read("map/chat-pop.html").includes('id="popDock"') && read("map/chat-pop.html").includes("bootPopup") && read("map/chat-pop.html").includes("data-chat-filter") && read("map/chat-pop.html").includes("apply-guard.js"));

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
  w.fetch = async function (url) {
    const name = String(url).split("/").pop();
    const file = path.join(root, "map", name);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => { throw new Error("missing"); } };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}

const w = makeWindow();
let width = 400;
const opened = [];
w.matchMedia = function (q) {
  const m = String(q).match(/max-width:\s*(\d+)/);
  const max = m ? Number(m[1]) : 0;
  return { matches: width <= max, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
};
w.HTMLElement.prototype.getBoundingClientRect = function () {
  const s = this.style || {};
  const wide = this.classList && this.classList.contains("ssdns-map");
  const left = parseFloat(s.left) || 0;
  const top = parseFloat(s.top) || 0;
  const boxW = parseFloat(s.width) || (wide ? 1000 : 340);
  const boxH = parseFloat(s.height) || (wide ? 700 : 420);
  return { x: left, y: top, left, top, right: left + boxW, bottom: top + boxH, width: boxW, height: boxH, toJSON() { return {}; } };
};
function pointer(el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  el.dispatchEvent(new Ev(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0,
    buttons: type === "pointerup" ? 0 : 1
  }));
}
const fakeWin = {
  closed: false,
  messages: [],
  postMessage(data) { this.messages.push(data); },
  close() { this.closed = true; },
  focus() {}
};
w.open = function (url, name, features) {
  opened.push({ url: String(url), name: name, features: String(features || "") });
  fakeWin.closed = false;
  fakeWin.messages = [];
  return fakeWin;
};

addScript(w, "assets/js/apply-guard.js");
addScript(w, "map/ssdns-map-chat.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const events = [];
const el = w.document.createElement("div");
el.id = "map";
el.className = "ssdns-map";
el.style.width = "1000px";
el.style.height = "700px";
w.document.body.appendChild(el);
const api = w.SSDNSMap.create({
  el,
  role: "player",
  uid: "p_jolene",
  adapter: w.SSDNSMapFirebase.memory({ role: "player" }),
  host: { on(name, detail) { events.push(name + ":" + ((detail && detail.text) || "")); } },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);

const popBtn = el.querySelector("[data-act=chatPop]");
const dockBtn = el.querySelector("[data-act=chatDock]");
check("btn.pop", popBtn && popBtn.textContent === "Pop out");
check("btn.dockHidden", dockBtn && dockBtn.hidden === true);
api.setChat([{ id: "c1", from: "p_mira", fromName: "Mira", text: "Ready", ts: "2026-10-14T00:00:00.000Z" }]);
api.pushFeed({ id: "f1", from: "dm", text: "Initiative = 14", ts: "2026-10-14T00:00:01.000Z" });
check("dock.chatlog", el.querySelector("[data-act=chatlog]").textContent.indexOf("Mira: Ready") >= 0);

popBtn.click();
check("phone.noWindow", opened.length === 0, String(opened.length));
const overlay = w.document.querySelector("[data-act=chatOverlay]");
check("phone.overlay", !!overlay);
check("phone.note", el.classList.contains("ssdns-chat-popped") && el.querySelector("[data-act=chatPop]").hidden === true);
const feedText = overlay.querySelector("[data-act=popFeed]").textContent;
const readyCount = feedText.split("Mira: Ready").length - 1;
const initCount = feedText.split("Initiative = 14").length - 1;
check("phone.once", readyCount === 1 && initCount === 1, feedText);
check("phone.items", overlay.querySelectorAll(".dock-item").length === 2, String(overlay.querySelectorAll(".dock-item").length));

w.SSDNSMapChat.publish([
  { id: "roll:r1", kind: "roll", who: "Jolene", text: "Attack 1d20+5 → 18 — HIT", ts: "2026-10-14T00:00:02.000Z", tag: "ATTACK", cls: "roll-attack" }
]);
w.SSDNSMapChat.publish([
  { id: "c1", kind: "chat", who: "Mira", text: "Mira: Ready", ts: "2026-10-14T00:00:00.000Z" },
  { id: "roll:r1", kind: "roll", who: "Jolene", text: "Attack 1d20+5 → 18 — HIT", ts: "2026-10-14T00:00:02.000Z", tag: "ATTACK", cls: "roll-attack" },
  { id: "chat:c1", kind: "chat", who: "Mira", text: "Mira: Ready", ts: "2026-10-14T00:00:00.000Z" }
]);
const cards = overlay.querySelectorAll(".roll-attack");
const ids = [...overlay.querySelectorAll(".dock-item")].map((n) => n.getAttribute("data-id"));
check("roll.card", cards.length === 1 && cards[0].textContent.indexOf("ATTACK") >= 0 && cards[0].textContent.indexOf("HIT") >= 0, overlay.querySelector("[data-act=popFeed]").textContent);
check("dedupe", ids.filter((id) => id === "c1").length === 1 && ids.filter((id) => id === "r1").length === 1, ids.join(","));

const input = overlay.querySelector("[data-act=popInput]");
input.value = "On me";
overlay.querySelector("[data-act=popForm]").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const sends = events.filter((e) => e.indexOf("chat:send:On me") === 0);
check("send.once", sends.length === 1, events.join(","));

overlay.querySelector("[data-act=overlayDock]").click();
check("dock.back", !w.document.querySelector("[data-act=chatOverlay]") && !el.classList.contains("ssdns-chat-popped"));
check("dock.composer", el.querySelector("[data-act=chatPop]").hidden === false && el.querySelector("[data-act=chatrow]"));

width = 800;
el.querySelector("[data-act=chatPop]").click();
const float = el.querySelector("[data-act=chatFloat]");
check("float.panel", !!float && !w.document.querySelector("[data-act=chatOverlay]") && opened.length === 0, float && float.className);
check("float.popped", el.classList.contains("ssdns-chat-popped") && el.querySelector("[data-act=chatDock]").hidden === false);
check("float.tab", float && float.querySelector("[data-act=chatWindow]") && float.querySelector("[data-act=chatWindow]").textContent === "Open in new tab");
const head = float.querySelector("[data-act=chatFloatHead]");
const before = float.style.left;
pointer(head, "pointerdown", 30, 80);
pointer(head, "pointermove", 120, 140);
pointer(head, "pointerup", 120, 140);
const geom = JSON.parse(w.localStorage.getItem("ssdns.map.chatFloat") || "null");
check("float.drag", float.style.left !== before && geom && geom.x > 16 && geom.w >= 220 && geom.h >= 160, JSON.stringify(geom) + " left=" + float.style.left);
const wideBefore = parseFloat(float.style.width);
const handle = float.querySelector("[data-act=chatResize]");
pointer(handle, "pointerdown", 400, 500);
pointer(handle, "pointermove", 480, 560);
pointer(handle, "pointerup", 480, 560);
const geom2 = JSON.parse(w.localStorage.getItem("ssdns.map.chatFloat") || "null");
check("float.resize", parseFloat(float.style.width) > wideBefore && geom2.w > geom.w, float.style.width + " " + JSON.stringify(geom2));

const breakdown = "Jolene → Bandit:\nd20 (14) + DEX +3 + proficiency +2 = 19\nDamage: 1d8 (5) = 5";
w.SSDNSTokenColors = { jolene: "#112233" };
w.SSDNSMapChat.publish([
  { id: "c1", kind: "chat", who: "Mira", text: "Mira: Ready", ts: "2026-10-14T00:00:00.000Z" },
  { id: "roll:pend", kind: "roll", who: "Jolene", text: breakdown, ts: "2026-10-14T00:00:03.000Z", tag: "ATTACK", cls: "roll-attack" }
]);
const color = w.SSDNSApplied.tokenColorFor("Jolene");
const feed = float.querySelector("[data-act=popFeed]");
const who = feed.querySelector(".ssm-who");
check("float.color", !!(who && (who.getAttribute("style") || "").toLowerCase().indexOf(color.toLowerCase()) >= 0), who && who.outerHTML);
check("float.math", feed.textContent.indexOf("d20") >= 0 && feed.textContent.indexOf("DEX +3") >= 0 && feed.textContent.indexOf("= 19") >= 0 && feed.textContent.indexOf("Damage") >= 0 && feed.textContent.indexOf("Waiting on DM") < 0 && feed.textContent.indexOf("vs AC") < 0, feed.textContent);
float.querySelector('[data-chat-filter="rolls"]').click();
check("float.rolls", feed.textContent.indexOf("d20") >= 0 && feed.textContent.indexOf("Ready") < 0, feed.textContent);
float.querySelector('[data-chat-filter="all"]').click();
check("float.all", feed.textContent.indexOf("Ready") >= 0 && feed.textContent.indexOf("d20") >= 0);

w.SSDNSTokenColors = { jolene: "#112233" };
float.querySelector("[data-act=chatWindow]").click();
check("window.opened", opened.length === 1 && opened[0].url.indexOf("chat-pop.html") >= 0 && opened[0].features.indexOf("resizable") >= 0, JSON.stringify(opened));
check("window.keepsFloat", !!el.querySelector("[data-act=chatFloat]") && el.classList.contains("ssdns-chat-popped"));
const pushed = fakeWin.messages.filter((m) => m && m.op === "items");
const lastPush = pushed[pushed.length - 1];
check("window.items", lastPush && lastPush.items.some((row) => String(row.text).indexOf("d20") >= 0) && lastPush.colors && lastPush.colors.jolene, JSON.stringify(lastPush && { filter: lastPush.filter, colors: lastPush.colors }));
const popFeed = w.document.createElement("div");
w.SSDNSMapChat.render(popFeed, lastPush.items, "all");
check("window.render", popFeed.textContent.indexOf("d20") >= 0 && popFeed.querySelector(".ssm-who") && (popFeed.querySelector(".ssm-who").getAttribute("style") || "").toLowerCase().indexOf(color.toLowerCase()) >= 0, popFeed.innerHTML);

w.dispatchEvent(new w.MessageEvent("message", {
  data: { type: "ssdns-map-chat", op: "send", text: "From the window" },
  origin: w.location.origin,
  source: fakeWin
}));
check("window.send", events.filter((e) => e === "chat:send:From the window").length === 1, events.join(","));

w.dispatchEvent(new w.MessageEvent("message", {
  data: { type: "ssdns-map-chat", op: "dock" },
  origin: w.location.origin,
  source: fakeWin
}));
check("window.dock", fakeWin.closed === true && el.classList.contains("ssdns-chat-popped") && !!el.querySelector("[data-act=chatFloat]"));
el.querySelector("[data-act=chatDock]").click();
check("float.dock", !el.querySelector("[data-act=chatFloat]") && !el.classList.contains("ssdns-chat-popped"));

w.open = function () { opened.push({ url: "blocked" }); return null; };
el.querySelector("[data-act=chatWindow]").click();
check("blocked.noOverlay", !w.document.querySelector("[data-act=chatOverlay]") && opened[opened.length - 1].url === "blocked" && el.querySelector("[data-act=chatPopNote]").textContent.indexOf("blocked") >= 0);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("map chat pop-out ok");

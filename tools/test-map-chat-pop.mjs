/**
 * Map chat pop-out. Same feed in a window, or a full-screen overlay on a phone.
 * Sends go through the map chat once.
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
check("ver.sheet", version.sheet === "0.3.30" && version.sheetBuild === "sheet-playtest-v0330");
check("ver.dmcc", version.dmcc === "0.2.43" && version.dmccBuild === "dmcc-playtest-v0243");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.30"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.43"'));

const mapSrc = read("map/ssdns-map.js");
const chatSrc = read("map/ssdns-map-chat.js");
const sheetSrc = read("assets/js/sheet-extras.js");
const dmSrc = read("dm/assets/js/dmcc.js");
check("src.pop", mapSrc.includes('data-act="chatPop">Pop out') && mapSrc.includes('data-act="chatDock"'));
check("src.chatlog", mapSrc.includes('data-act="chatlog"') && mapSrc.includes('data-act="chatInput"') && mapSrc.includes('data-act="chatSend"'));
check("src.once", mapSrc.includes("emit('chat:send'") && !mapSrc.includes("postChat"));
check("src.publish.sheet", sheetSrc.includes("SSDNSMapChat.publish"));
check("src.publish.dm", dmSrc.includes("SSDNSMapChat.publish") && dmSrc.includes("publishMapChat"));
check("src.window", chatSrc.includes("root.open(") && chatSrc.includes("chat-pop.html") && chatSrc.includes("max-width: 800px"));
check("src.rules", !read("map/ssdns-map-chat.js").includes("database.rules") && !mapSrc.includes("database.rules"));
check("html.player", read("index.html").includes("map/ssdns-map-chat.js?v=0.3.30-chat"));
check("html.dm", read("dm/index.html").includes("ssdns-map-chat.js?v=0.2.43-chat"));
check("html.pop", read("map/chat-pop.html").includes('id="popDock"') && read("map/chat-pop.html").includes("bootPopup"));

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
let narrow = true;
const opened = [];
w.matchMedia = function (q) {
  return { matches: narrow && String(q).indexOf("800") >= 0, addListener() {}, removeListener() {} };
};
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

addScript(w, "map/ssdns-map-chat.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const events = [];
const el = w.document.createElement("div");
el.id = "map";
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

narrow = false;
el.querySelector("[data-act=chatPop]").click();
check("window.opened", opened.length === 1 && opened[0].url.indexOf("chat-pop.html") >= 0 && opened[0].features.indexOf("resizable") >= 0, JSON.stringify(opened));
check("window.popped", el.classList.contains("ssdns-chat-popped") && el.querySelector("[data-act=chatDock]").hidden === false);
api.setChat([{ id: "c1", from: "p_mira", fromName: "Mira", text: "Ready", ts: "2026-10-14T00:00:00.000Z" }]);
const pushed = fakeWin.messages.filter((m) => m && m.op === "items");
check("window.items", pushed.length >= 1 && pushed[pushed.length - 1].items.some((row) => String(row.text).indexOf("Ready") >= 0 || String(row.who) === "Mira"), JSON.stringify(pushed));

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
check("window.dock", !el.classList.contains("ssdns-chat-popped"));

w.open = function () { opened.push({ url: "blocked" }); return null; };
el.querySelector("[data-act=chatPop]").click();
check("blocked.overlay", !!w.document.querySelector("[data-act=chatOverlay]") && opened[opened.length - 1].url === "blocked");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("map chat pop-out ok");

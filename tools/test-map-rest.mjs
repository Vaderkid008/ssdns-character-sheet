/**
 * Map toolbar Short / Long rest (sheet 0.3.200 / DMCC 0.2.213).
 * Player buttons call SSDNSSheet.applyRest. DM buttons call the same rest as the Fight tab.
 *   node tools/test-map-rest.mjs
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
check("ver.sheet", version.sheet === "0.3.200" && version.sheetBuild === "sheet-playtest-v03200");
check("ver.dmcc", version.dmcc === "0.2.213" && version.dmccBuild === "dmcc-playtest-v02213");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.200"') && read("assets/js/app.js").includes("sheet-playtest-v03200"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.213"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02213"));
check("html.sheet", read("index.html").includes("map/ssdns-map.js?v=0.3.200-snake") && read("index.html").includes("assets/js/app.js?v=0.3.200-snake"));
check("html.dm", read("dm/index.html").includes("../map/ssdns-map.js?v=0.2.213-snake") && read("dm/index.html").includes("assets/js/v2.js?v=0.2.213-snake") && read("dm/index.html").includes("assets/js/dmcc.js?v=0.2.213-snake"));

const mapSrc = read("map/ssdns-map.js");
const toolbar = mapSrc.slice(mapSrc.indexOf("toolbar.innerHTML"), mapSrc.indexOf("el.appendChild(toolbar)"));
const playerArm = toolbar.slice(toolbar.indexOf("role === 'dm'"));
check("toolbar.player", playerArm.includes(">Short rest</button>") && playerArm.includes(">Long rest</button>") && playerArm.includes('data-act="shortRestBtn"') && playerArm.includes('data-act="longRestBtn"'));
check("toolbar.dm", playerArm.includes(">Short rest (party)</button>") && playerArm.includes(">Long rest (party)</button>") && playerArm.indexOf("challengeBtn") < playerArm.indexOf("shortRestBtn"));
check("toolbar.near", toolbar.indexOf('data-act="fxBtn"') < toolbar.indexOf("shortRestBtn") && toolbar.indexOf("shortRestBtn") < toolbar.indexOf('data-act="fogBtn"'));
check("map.calls", mapSrc.includes("window.SSDNSSheet") && mapSrc.includes("sheet.applyRest(kind)") && mapSrc.includes("window.SSDNSPartyRest") && !mapSrc.includes("applyRest(kind, { prompted: true })"));
check("map.noSecondRest", !mapSrc.includes("function applyRest") && !mapSrc.includes('type: "rest"'));

const v2 = read("dm/assets/js/v2.js");
const restAt = v2.indexOf("async function rest(kind)");
const restFn = v2.slice(restAt, v2.indexOf("window.SSDNSPartyRest = rest"));
check("v2.export", restAt > 0 && v2.includes("window.SSDNSPartyRest = rest;"));
check("v2.same", restFn.includes('type: "rest"') && restFn.includes("payload: { kind: kind }") && restFn.includes("SSDNSSuppliesDm.onLongRest") && restFn.includes('type: "rest", what:'));
check("v2.buttons", v2.includes('$("#btnShortRest") && $("#btnShortRest").addEventListener("click", () => rest("short"))') && v2.includes('$("#btnLongRest") && $("#btnLongRest").addEventListener("click", () => rest("long"))'));
const dmHtml = read("dm/index.html");
check("dmcc.buttons", dmHtml.includes('id="btnShortRest"') && dmHtml.includes("Short rest (party)") && dmHtml.includes('id="btnLongRest"') && dmHtml.includes("Long rest (party)"));

const extras = read("assets/js/sheet-extras.js");
check("sheet.prompt", extras.includes('kind === "short" && !opts.prompted') && extras.includes("promptShortRestTools"));

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
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
function mount(role) {
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
  w.SSDNSMap.create({
    el, role, uid: role === "dm" ? "dm" : "ada",
    adapter: w.SSDNSMapFirebase.memory({ role }),
    host: { on() {} },
    options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
  });
  return { w, el };
}

const player = mount("player");
await flush(20);
const pShort = act(player.el, "shortRestBtn");
const pLong = act(player.el, "longRestBtn");
check("player.labels", pShort && pShort.textContent === "Short rest" && pLong && pLong.textContent === "Long rest" && !act(player.el, "challengeBtn"));
check("player.order", player.el.querySelector(".ssm-toolbar-main") && [...player.el.querySelector(".ssm-toolbar-main").querySelectorAll("[data-act]")].map((n) => n.getAttribute("data-act")).join(",").includes("reset,fxBtn,shortRestBtn,longRestBtn"));
pShort.click();
check("player.missing", act(player.el, "toast") && act(player.el, "toast").textContent === "Character sheet rest is not loaded. Open the sheet to take a rest.");
const calls = [];
player.w.SSDNSSheet = { applyRest(kind, opts) { calls.push([kind, opts]); } };
pShort.click();
pLong.click();
check("player.short", calls.length === 2 && calls[0][0] === "short" && calls[0][1] === undefined, JSON.stringify(calls));
check("player.long", calls[1] && calls[1][0] === "long" && calls[1][1] === undefined, JSON.stringify(calls));

const dm = mount("dm");
await flush(20);
const dShort = act(dm.el, "shortRestBtn");
const dLong = act(dm.el, "longRestBtn");
check("dm.labels", dShort && dShort.textContent === "Short rest (party)" && dLong && dLong.textContent === "Long rest (party)" && !!act(dm.el, "challengeBtn"));
const dmOrder = [...dm.el.querySelector(".ssm-toolbar-main").querySelectorAll("[data-act]")].map((n) => n.getAttribute("data-act")).join(",");
check("dm.order", dmOrder.includes("fxBtn,challengeBtn,shortRestBtn,longRestBtn,fogBtn"), dmOrder);
dShort.click();
check("dm.missing", act(dm.el, "toast") && act(dm.el, "toast").textContent === "Party rest is not loaded. Use Short rest or Long rest on the Fight tab.");
const party = [];
dm.w.SSDNSPartyRest = function (kind) { party.push(kind); return Promise.resolve("sent"); };
dShort.click();
dLong.click();
check("dm.sent", party.join(",") === "short,long", party.join(","));
dm.w.SSDNSPartyRest = function () { return Promise.reject(new Error("offline")); };
dLong.click();
await flush(0);
check("dm.fail", act(dm.el, "toast") && act(dm.el, "toast").textContent === "Party rest did not send.");

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("map rest ok");

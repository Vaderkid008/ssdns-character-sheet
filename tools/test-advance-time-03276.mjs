/**
 * Advance time counts zone clocks down outside initiative.
 *   node tools/test-advance-time-03276.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush() { return new Promise((resolve) => setTimeout(resolve, 0)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.314" && ver.dmcc === "0.2.327");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.314") && !read("database.rules.json").includes("0.3.314"));

const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
check("ui.steps", ["1", "10", "100", "600"].every(n => map.includes('data-act="timeSkipBtn" data-steps="' + n + '"')));
check("ui.labels", map.includes(">+1 round<") && map.includes(">+1 min<") && map.includes(">+10 min<") && map.includes(">+1 hour<"));
check("ui.dmOnly", map.indexOf("timeSkipBtn") < map.indexOf("ssdns-playercard"));
check("clock.shared", v2.includes("function tickZoneClock(steps)") && v2.includes("function expireSpellZones() {\n  tickZoneClock(1);") && v2.includes("function advanceSpellZones(steps)") && v2.includes("if (fight.started) return;"));
check("clock.effects", /function tickZoneClock[\s\S]{0,700}writeZoneList\(ticked\.zones\)[\s\S]{0,200}endRemovedZones\(ticked\.removed\)[\s\S]{0,300}DM\.toast\(line\)[\s\S]{0,200}DM\.pushLedger/.test(v2));
check("clock.event", v2.includes('addEventListener("ssdns-advance-time"'));
check("clock.noPhase", !/function tickZoneClock[\s\S]{0,900}zonePhase\(/.test(v2));

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("assets/js/spell-zones.js"), sandbox);
const Z = sandbox.SSDNSSpellZones;
const zone = Z.buildZone("Fog Cloud", { origin: { x: 4, y: 4 }, facing: 0 }, { id: "fog1", slot: 1 });
check("tick.built", zone && zone.rounds === 600 && zone.roundsLeft === 600);
const step = Z.tickRounds([zone], 1);
check("tick.one", step.zones.length === 1 && step.zones[0].roundsLeft === 599 && step.removed.length === 0);
const minute = Z.tickRounds(step.zones, 10);
check("tick.min", minute.zones[0].roundsLeft === 589);
const almost = Object.assign({}, minute.zones[0], { roundsLeft: 3 });
const gone = Z.tickRounds([almost], 10);
check("tick.expire", gone.zones.length === 0 && gone.removed.length === 1 && gone.removed[0].roundsLeft === 0 && /Fog Cloud expires/.test(gone.logs[0] || ""));
const quiet = Z.tickRounds([Object.assign({}, zone, { rounds: 0, roundsLeft: 0, dur: "" })], 10);
check("tick.untimed", quiet.zones.length === 1 && quiet.removed.length === 0);

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
  });
  const w = dom.window;
  const frames = [];
  w.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  w.cancelAnimationFrame = () => {};
  w.__pump = () => {
    let n = 0;
    while (frames.length && n < 6) {
      const batch = frames.splice(0);
      n += 1;
      batch.forEach((fn) => { try { fn(n); } catch (e) {} });
    }
  };
  for (const Ctor of [w.HTMLElement, w.HTMLCanvasElement]) {
    Object.defineProperty(Ctor.prototype, "clientWidth", { configurable: true, get() { return 1000; } });
    Object.defineProperty(Ctor.prototype, "clientHeight", { configurable: true, get() { return 700; } });
  }
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy({ canvas: this, measureText: () => ({ width: 8 }), setTransform() {}, createRadialGradient() { return { addColorStop() {} }; }, createLinearGradient() { return { addColorStop() {} }; } }, {
      get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return () => bag; },
      set(t, p, v) { bag[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
async function boot(role, initiative, adapter) {
  const w = makeWindow();
  addScript(w, "assets/js/spell-zones.js");
  addScript(w, "map/ssdns-map-move.js");
  addScript(w, "map/ssdns-map-firebase.js");
  addScript(w, "map/ssdns-map.js");
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  if (!Array.isArray(scene.walls)) scene.walls = [];
  const api = w.SSDNSMap.create({
    el, role, uid: role === "dm" ? "dm" : "p_jolene",
    adapter: adapter || w.SSDNSMapFirebase.memory({ role }),
    options: {
      scene, assetBase: "",
      room: { table: { initiative: initiative || { started: false, order: [], turn: 0 } } }
    }
  });
  for (let i = 0; i < 8; i++) {
    await flush();
    w.__pump();
    if (api.tokensLoaded && api.tokensLoaded()) break;
  }
  return { w, el, api };
}
function buttons(el) { return [...el.querySelectorAll('[data-act="timeSkipBtn"]')]; }
function badgeText(el) {
  const n = el.querySelector(".ssm-zb .n");
  return n ? n.textContent : "";
}

const idle = await boot("dm", { started: false, order: [{ id: "a", name: "A" }], turn: 0, round: 1 });
const btns = buttons(idle.el);
check("ui.count", btns.length === 4 && btns.map(b => b.getAttribute("data-steps")).join(",") === "1,10,100,600");
check("ui.enabled", btns.every(b => !b.disabled));
const heard = [];
idle.w.addEventListener("ssdns-advance-time", (ev) => heard.push(ev.detail && ev.detail.steps));
btns[1].click();
check("ui.click", heard.length === 1 && heard[0] === 10);

const live = await boot("dm", { started: true, order: [{ id: "a", name: "A" }], turn: 0, round: 2 });
const locked = buttons(live.el);
check("ui.disabled", locked.length === 4 && locked.every(b => b.disabled), locked.map(b => b.disabled + ":" + (b.title || "").slice(0, 24)).join(" | "));
const blocked = [];
live.w.addEventListener("ssdns-advance-time", (ev) => blocked.push(ev.detail.steps));
locked[0].click();
check("ui.noClick", blocked.length === 0);

const player = await boot("player");
check("ui.player", buttons(player.el).length === 0);

const store = { pub: {}, dm: {} };
const bus = [];
const w = makeWindow();
addScript(w, "assets/js/spell-zones.js");
addScript(w, "map/ssdns-map-move.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
scene.walls = [];
const dmEl = w.document.createElement("div");
const pcEl = w.document.createElement("div");
w.document.body.appendChild(dmEl);
w.document.body.appendChild(pcEl);
const dmApi = w.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm", store, bus }),
  options: { scene, assetBase: "", room: { table: { initiative: { started: false, order: [], turn: 0 } } } }
});
const pcApi = w.SSDNSMap.create({
  el: pcEl, role: "player", uid: "p_jolene",
  adapter: w.SSDNSMapFirebase.memory({ role: "player", store, bus }),
  options: { scene: JSON.parse(JSON.stringify(scene)), assetBase: "", room: { table: { initiative: { started: false, order: [], turn: 0 } } } }
});
for (let i = 0; i < 8; i++) { await flush(); w.__pump(); }
const fog = {
  id: "fog-badge", key: "fog cloud", spell: "Fog Cloud", shape: "sphere", radius: 20,
  origin: { x: 6, y: 6 }, facing: 0, rounds: 10, roundsLeft: 10, dur: "1 min"
};
dmApi.setSpellZones([fog], {});
w.__pump();
check("badge.dm", badgeText(dmEl) === "10 rd", badgeText(dmEl));
const fed = (pcApi.spellZones() || []).find(z => z && z.id === "fog-badge");
check("badge.playerData", !!(fed && fed.roundsLeft === 10), fed && String(fed.roundsLeft));
dmApi.setSpellZones([Object.assign({}, fog, { roundsLeft: 9 })], {});
w.__pump();
check("badge.dmNext", badgeText(dmEl) === "9 rd", badgeText(dmEl));
const fed2 = (pcApi.spellZones() || []).find(z => z && z.id === "fog-badge");
check("badge.playerNext", !!(fed2 && fed2.roundsLeft === 9), fed2 && String(fed2.roundsLeft));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nadvance time ok");

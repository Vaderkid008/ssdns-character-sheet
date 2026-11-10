/**
 * Pick lock throws the Challenge d20 and plays the lockpick sound once.
 * Sheet 0.3.280 / DMCC 0.2.293.
 *   node tools/test-lockpick-d20-03280.mjs
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

const mapDom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/map/demo.html", runScripts: "dangerously" });
const mapWin = mapDom.window;
for (const rel of ["assets/js/dice-art.js", "assets/js/d20-plain.js"]) {
  const s = mapWin.document.createElement("script");
  s.textContent = read(rel);
  mapWin.document.body.appendChild(s);
}
const played = mapWin.SSDNSPlainRoll.play({ nat: 12, fancy: true, challenge: true, label: "Pick lock", id: "path" });
const dieImg = mapWin.document.querySelector(".d20-plain-spin img");
check("die.mapPath", dieImg && dieImg.getAttribute("src") === "../assets/img/dice/d20.webp", dieImg && dieImg.getAttribute("src"));
played.then(() => {}).catch(() => {});

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.280" && ver.dmcc === "0.2.293");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.280") && !read("database.rules.json").includes("0.3.280"));
check("sound.file", fs.existsSync(path.join(root, "assets/sfx/lockpick-attempt.mp3")));
const sfxMap = JSON.parse(read("assets/sfx/sfx.json"));
check("sound.mapped", sfxMap.events["lockpick-attempt"] === "lockpick-attempt.mp3");

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {} }; };
  w.localStorage.setItem("ssdns.map.fx", "0");
  const plays = [];
  w.Audio = function (url) {
    this.volume = 1;
    this.readyState = 1;
    this.addEventListener = function () {};
    this.pause = function () {};
    this.play = function () { plays.push(String(url)); return Promise.resolve(); };
  };
  w.__plays = plays;
  return w;
}
function lockpickPlays(w) {
  return w.__plays.filter((url) => url.indexOf("lockpick-attempt.mp3") >= 0).length;
}
function packPlayed(w, file) {
  return w.SSDNSChallengeSfx.trace().some((row) => row.kind === "play" && String(row.file).indexOf(file) >= 0);
}

const w = makeWindow();
["assets/js/dice-art.js", "assets/js/challenge-sfx.js", "assets/js/d20-plain.js", "assets/js/d20-zoom.js", "assets/js/loot.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});

w.SSDNSChallengeSfx.lockpick();
check("sound.once", lockpickPlays(w) === 1);
w.SSDNSAudio = { isMuted: function () { return true; }, volume: function () { return 1; } };
w.SSDNSChallengeSfx.lockpick();
check("sound.muted", lockpickPlays(w) === 1);
w.SSDNSAudio = { isMuted: function () { return false; }, volume: function () { return 0.5; } };

async function dismiss(ev) {
  const p = w.SSDNSD20Zoom.play(ev);
  await flush(30);
  const layer = w.document.querySelector(".d20-zoom, .d20-plain");
  if (layer) layer.click();
  await Promise.race([p, flush(200)]);
}
const before = lockpickPlays(w);
await dismiss({ nat: 20, fancy: true, challenge: true, lockpick: true, id: "lp20" });
check("die.nat20", lockpickPlays(w) === before + 1 && packPlayed(w, "challenge-nat20-crit.wav"));
await dismiss({ nat: 20, fancy: true, challenge: true, lockpick: true, id: "lp20" });
check("die.nat20.once", lockpickPlays(w) === before + 1);
w.SSDNSChallengeSfx.resetTrace();
await dismiss({ nat: 1, fancy: true, challenge: true, lockpick: true, id: "lp1" });
check("die.nat1", packPlayed(w, "challenge-fail.wav") && lockpickPlays(w) === before + 2);
const packed = w.SSDNSD20Zoom.pack({ id: "lp20" });
check("die.packed", packed && packed.lockpick === true && packed.fancy === true && packed.nat === 20);

["assets/js/items.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
w.SSDNSApp = { doc() { return { character: { name: "Jolene", abilities: { DEX: 16 }, prof: 3, thievesTools: true, items: [] } }; } };
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const ad = w.SSDNSMapFirebase.memory({ role: "dm", store: { pub: {}, dm: {} }, bus: [] });
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm", adapter: ad, host: { players() { return []; } },
  options: { scene, tokens: { tokens: {} }, assetBase: "../map/", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
el.querySelector('[data-act="lockAllowRetries"]').checked = true;
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(30);
const menu = () => w.document.querySelector('[data-act="chestMenu"]');
const menuText = () => (menu() && menu().textContent) || "";
w.document.querySelectorAll(".d20-zoom, .d20-plain").forEach((node) => node.remove());
w.Math.random = () => 0;
menu().querySelector('[data-chest="pick"]').click();
await flush(200);
check("map.fail", lockpickPlays(w) === before + 3 && /Failed/.test(menuText()) && /vs DC 15/.test(menuText()), menuText());
const held = lockpickPlays(w);
menu().querySelector('[data-chest="pick"]') && menu().querySelector('[data-chest="pick"]').click();
await flush(80);
check("map.retry", lockpickPlays(w) === held + 1 && /vs DC 15/.test(menuText()), menuText());
w.Math.random = () => 0.99;
const again = lockpickPlays(w);
menu().querySelector('[data-chest="pick"]').click();
await flush(120);
check("map.success", lockpickPlays(w) === again + 1 && /Unlocked/.test(menuText()) && /Take all/.test(menuText()), menuText());
const openPlays = lockpickPlays(w);
const openBtn = menu().querySelector('[data-chest="open"]');
if (openBtn) openBtn.click();
await flush(40);
check("map.openQuiet", lockpickPlays(w) === openPlays);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nlockpick d20 ok");
process.exit(0);

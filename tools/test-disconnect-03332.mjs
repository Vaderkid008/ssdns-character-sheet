/**
 * A disconnect keeps the token, dims it, and holds the turn.
 * Sheet 0.3.340 / DMCC 0.2.353.
 *   node tools/test-disconnect-03332.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.340" && version.sheetBuild === "sheet-playtest-v03340");
check("ver.dmcc", version.dmcc === "0.2.353" && version.dmccBuild === "dmcc-playtest-v02353");
const v2 = read("dm/assets/js/v2.js");
const dmcc = read("dm/assets/js/dmcc.js");
const note = v2.slice(v2.indexOf("function notePresence"), v2.indexOf("function clearFight"));
check("src.keepsRow", note.includes("fight.away[id] = true") && !note.includes("fight.order ="));
check("src.alert", dmcc.includes('data-away="skip"') && dmcc.includes('data-away="control"') && dmcc.includes('data-away="hand"') && dmcc.includes('data-away="remove"') && dmcc.includes('data-away="dismiss"'));
const awayCss = read("dm/assets/css/dmcc.css");
check("src.place", awayCss.includes("#awayAlert") && awayCss.includes("z-index: 90") && awayCss.includes("var(--dock-w") && !dmcc.includes("left:12px;right:12px;bottom:12px"));
check("src.dim", read("map/ssdns-map.js").includes('fillText("Away"'));
check("rules.untouched", !read("assets/data/rules.js").includes("awayAlert") && !read("database.rules.json").includes("awayAlert"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const proto = w.HTMLElement.prototype;
Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
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
addScript("map/ssdns-map-move.js");
addScript("map/ssdns-map-firebase.js");
addScript("map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
let online = false;
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: { on() {}, getCard() { return null; }, players() { return [{ uid: "p_t", id: "p_t", name: "Dust", online: online }]; } },
  options: {
    scene,
    tokens: { tokens: { tok_t: { id: "tok_t", kind: "player", name: "Dust", ownerUid: "p_t", combatantId: "p_t", size: 1, pos: { x: 15, y: 8 }, sceneId: scene.id } } },
    assetBase: "",
    players: () => [{ uid: "p_t", id: "p_t", name: "Dust", online: online }],
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(80);
const box = () => map.tokenBoxes().find((b) => b.ownerUid === "p_t");
check("away.dim", box() && box().away === true, JSON.stringify(box()));
online = true;
map.refreshPlayers();
check("away.clears", box() && box().away === false, JSON.stringify(box()));
const held = map.holdOwner("p_t");
check("take.control", !!held && map.tokenForPlayer("p_t"));
const handed = map.handOwner("p_t", "p_other");
check("hand.control", handed === held);
map.removeToken(held);
check("remove.gone", !map.tokenBoxes().some((b) => b.ownerUid === "p_t"));
map.refreshPlayers();
check("rejoin.noDuplicate", map.tokenBoxes().filter((b) => b.ownerUid === "p_t").length === 0);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndisconnect 0.3.340 ok");

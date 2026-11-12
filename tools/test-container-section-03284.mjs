/**
 * Container controls sit in their own section, ahead of Fog.
 * Sheet 0.3.299 / DMCC 0.2.312. Layout only.
 *   node tools/test-container-section-03284.mjs
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.299" && ver.dmcc === "0.2.312" && ver.sheetBuild === "sheet-playtest-v03299" && ver.dmccBuild === "dmcc-playtest-v02312");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.299") && !read("database.rules.json").includes("0.3.299"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
Object.defineProperty(w.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 800; } });
Object.defineProperty(w.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
w.HTMLElement.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
};
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = { addColorStop() {} };
  return new Proxy(bag, {
    get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; },
    set(t, p, v) { t[p] = v; return true; }
  });
};
w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
["assets/js/loot.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"].forEach((rel) => {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
});
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const el = w.document.createElement("div");
w.document.body.appendChild(el);
w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm", uid: "dm" }),
  host: { on() {}, players() { return []; }, getCard() { return null; }, actions: { get() { return []; }, run() { return Promise.resolve(); } } },
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);

const bar = el.querySelector(".ssdns-leftbar");
const text = (bar.textContent || "").replace(/\s+/g, " ");
function at(label) { return text.indexOf(label); }
const order = ["Containers", "Place", "Easy", "Medium", "Hard", "Lock DC", "Force DC", "Allow retries", "Allow improvised lockpicking", "Reset attempts", "Fog", "Reveal: Box", "Hide: Box", "Erase", "Delete selection", "Undo", "Redo", "Hide/Reveal", "Hide All", "Reveal All", "Wall"];
let prev = -1;
order.forEach((label) => {
  const pos = at(label);
  check("order." + label, pos > prev, "at " + pos + " after " + prev);
  prev = pos;
});

function sectionActs(title, stopAct) {
  const heading = Array.from(bar.querySelectorAll(".panel-title")).find((n) => n.textContent === title);
  const acts = [];
  let node = heading && heading.nextElementSibling;
  while (node && !(node.classList && node.classList.contains("panel-title"))) {
    if (stopAct && node.getAttribute && node.getAttribute("data-act") === stopAct) break;
    if (node.getAttribute && node.getAttribute("data-act")) acts.push(node.getAttribute("data-act"));
    node.querySelectorAll("[data-act]").forEach((child) => acts.push(child.getAttribute("data-act")));
    node = node.nextElementSibling;
  }
  return acts;
}
const containers = sectionActs("Containers");
const fog = sectionActs("Fog", "wallBtn");
check("containers.place", containers.indexOf("placeChestBtn") >= 0 && containers.indexOf("chestKind") >= 0 && containers.indexOf("chestLockDc") >= 0 && containers.indexOf("forceDc") >= 0 && containers.indexOf("lockAllowRetries") >= 0 && containers.indexOf("improviseLocks") >= 0 && containers.indexOf("resetLockBtn") >= 0, containers.join(","));
check("containers.beforePresets", containers.indexOf("placeChestBtn") < containers.indexOf("chestLockDc"));
check("fog.tools", fog.indexOf("revealFogBtn") >= 0 && fog.indexOf("hideFogBtn") >= 0 && fog.indexOf("eraseFogBtn") >= 0 && fog.indexOf("deleteFogBtn") >= 0 && fog.indexOf("fogUndoBtn") >= 0 && fog.indexOf("fogRedoBtn") >= 0 && fog.indexOf("hideBtn") >= 0 && fog.indexOf("hideAllBtn") >= 0 && fog.indexOf("revealAllBtn") >= 0, fog.join(","));
check("fog.noContainers", !fog.some((act) => /chest|lock|force|improvise|placeChest|resetLock/.test(act)), fog.join(","));

el.querySelector('[data-lock-preset="easy"]').click();
check("easy.stillSetsDc", el.querySelector('[data-act="chestLockDc"]').value === "10");
el.querySelector('[data-act="placeChestBtn"]').click();
await flush(30);
check("place.stillWorks", /Chest placed/.test((el.querySelector('[data-act="toast"]') || {}).textContent || ""));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ncontainer section ok");
process.exit(0);

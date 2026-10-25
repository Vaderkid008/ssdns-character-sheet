/**
 * B1: DM "Edit tokens" toggle. Default off, localStorage ssdns.map.dmEdit, DM maps only.
 *   node tools/test-dm-edit-tokens.mjs
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

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const w = dom.window;
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
      set(t, p, v) { t[p] = v; return true; }
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
async function boot(w, opts) {
  const el = w.document.createElement("div");
  el.id = opts.id;
  w.document.body.appendChild(el);
  const api = w.SSDNSMap.create({
    el, role: opts.role, uid: opts.uid, adapter: opts.adapter, host: opts.host || {}, options: opts.options
  });
  await flush(40);
  return { el, api };
}

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = JSON.parse(read("map/tokens.json"));
const w = makeWindow();
addScript(w, "map/ssdns-map-move.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
w.localStorage.removeItem("ssdns.map.dmEdit");

const room = { table: { initiative: { order: [], turn: 0 } } };
const dm = await boot(w, {
  id: "dm", role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  options: { scene, tokens, assetBase: "", room }
});
const btn = dm.el.querySelector('[data-act="dmEditBtn"]');
check("dm.button", !!btn && btn.textContent === "Edit tokens" && btn.getAttribute("aria-pressed") === "false" && !btn.classList.contains("active"));
check("dm.storedOff", w.localStorage.getItem("ssdns.map.dmEdit") == null);
btn.click();
await flush(10);
check("dm.on", btn.textContent === "Edit tokens: ON" && btn.getAttribute("aria-pressed") === "true" && btn.classList.contains("active") && w.localStorage.getItem("ssdns.map.dmEdit") === "1");
btn.click();
await flush(10);
check("dm.offAgain", btn.textContent === "Edit tokens" && btn.getAttribute("aria-pressed") === "false" && w.localStorage.getItem("ssdns.map.dmEdit") === "0");
btn.click();
dm.api.destroy();

const dm2 = await boot(w, {
  id: "dm2", role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  options: { scene, tokens, assetBase: "", room }
});
const btn2 = dm2.el.querySelector('[data-act="dmEditBtn"]');
check("dm.persists", btn2 && btn2.textContent === "Edit tokens: ON" && btn2.getAttribute("aria-pressed") === "true");
dm2.api.destroy();

const player = await boot(w, {
  id: "player", role: "player", uid: "p_jolene",
  adapter: w.SSDNSMapFirebase.memory({ role: "player" }),
  options: { scene, tokens, assetBase: "", room }
});
check("player.noToggle", !player.el.querySelector('[data-act="dmEditBtn"]') && !player.el.textContent.includes("Edit tokens") && !player.el.textContent.includes("Swap to Edit map tokens"));
player.api.destroy();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("dm edit tokens ok");

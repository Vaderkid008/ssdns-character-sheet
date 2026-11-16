/**
 * Floor buttons and Scenes sit on the map bar. The bar does not scroll.
 * Sheet 0.3.330 / DMCC 0.2.343.
 *   node tools/test-floor-bar-inline-03328.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.330" && ver.dmcc === "0.2.343" && ver.sheetBuild === "sheet-playtest-v03330" && ver.dmccBuild === "dmcc-playtest-v02343");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.330") && !read("database.rules.json").includes("0.3.330"));

const css = read("map/ssdns-map.css");
const stripRule = css.slice(css.indexOf(".ssdns-map .ssm-floor-strip {"), css.indexOf(".ssdns-map .ssm-floor-strip:empty"));
check("css.row", /flex-direction:\s*row/.test(stripRule) && /flex-wrap:\s*wrap/.test(stripRule) && /overflow:\s*visible/.test(stripRule), stripRule.slice(0, 240));
check("css.noheight", !/max-height:\s*\d/.test(stripRule) && /height:\s*auto/.test(stripRule));
const mainRule = css.slice(css.indexOf(".ssdns-map .ssdns-toolbar .ssm-toolbar-main {"), css.indexOf(".ssdns-map .ssdns-toolbar .ssm-toolbar-main >"));
check("css.main", /overflow:\s*visible/.test(mainRule) && /flex-wrap:\s*wrap/.test(mainRule) && !/overflow-x:\s*auto/.test(mainRule));
check("css.phone", !/\.ssm-toolbar-main \{ overflow-x:\s*auto/.test(css));

const mapSrc = read("map/ssdns-map.js");
const left = mapSrc.slice(mapSrc.indexOf('data-act="barLeft"'), mapSrc.indexOf('data-act="barRight"'));
check("bar.pair", left.indexOf('data-act="mapsBtn"') >= 0 && left.indexOf('data-act="mapsBtn"') < left.indexOf('data-act="dmEditBtn"') && left.indexOf("ssm-bar-pair") < left.indexOf('data-act="dmEditBtn"'));
check("src.strip", mapSrc.includes("toolbarMain.appendChild(row)") && !mapSrc.includes('dataset.sig !== "dm-readout"'));
check("src.nopop", !mapSrc.includes('aria-haspopup="listbox"') && mapSrc.includes("pop.hidden = true"));

function makeWindow() {
  const box = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const win = box.window;
  const proto = win.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  win.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === "createLinearGradient" || p === "createRadialGradient") return function () { return { addColorStop() {} }; };
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  win.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  win.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return win;
}
function addScript(win, rel) {
  const s = win.document.createElement("script");
  s.textContent = read(rel);
  win.document.body.appendChild(s);
}
const sceneJson = JSON.parse(read("map/scene-dusty-spur.json"));
const win = makeWindow();
["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
const el = win.document.createElement("div");
win.document.body.appendChild(el);
const map = win.SSDNSMap.create({
  el,
  role: "dm",
  uid: "dm",
  adapter: win.SSDNSMapFirebase.memory({ role: "dm" }),
  host: { players: () => [] },
  options: { scene: sceneJson, tokens: { tokens: {} }, assetBase: "../map/", ensureScene: true, room: { table: { initiative: { order: [], turn: 0 } } } }
});
await new Promise((r) => setTimeout(r, 200));
map.maps().swap("scn_upstairs");
await new Promise((r) => setTimeout(r, 80));
const floors = [].slice.call(win.document.querySelectorAll("[data-act='floorStrip'] [data-floor]"));
const labels = floors.map((b) => b.textContent.replace(/\s+/g, " ").trim());
check("floors.inline", labels.some((t) => t.indexOf("▲") === 0 && /Upstairs/.test(t)) && labels.some((t) => t.indexOf("▼") === 0 && /Saloon/.test(t)), labels.join(" | "));
check("floors.badge", floors.length >= 2 && floors.every((b) => b.querySelector("[data-act='floorCount']")));
const pop = win.document.querySelector("[data-act='sceneFloorPop']");
check("pop.closed", pop && pop.hidden && !pop.querySelector("[data-floor]"));
const row = win.document.querySelector("[data-act='floorRow']");
const main = win.document.querySelector(".ssm-toolbar-main");
check("row.inline", !!(row && main && main.contains(row) && row.querySelector("[data-act='scenesBtn']") && row.querySelector("[data-act='floorStrip']")));
const pair = win.document.querySelector("[data-act='barPair']");
check("pair.order", pair && pair.querySelector("[data-act='mapsBtn']") && pair.querySelector("[data-act='dmEditBtn']") && pair.innerHTML.indexOf("mapsBtn") < pair.innerHTML.indexOf("dmEditBtn"));
win.document.querySelector("[data-floor='scn_dustyspur01']").click();
await new Promise((r) => setTimeout(r, 30));
check("switch", /Saloon/.test(win.document.querySelector("[data-act='sceneReadout']").textContent));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("floor bar inline 0.3.330 ok");

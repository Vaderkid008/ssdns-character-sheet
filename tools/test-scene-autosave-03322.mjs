/**
 * Scene builder autosave (sheet 0.3.322 / DMCC 0.2.335).
 * A draft is written on each change. Close, New, and refresh keep it.
 * A full disk shows a red notice and does not close over the unsaved draft.
 *   node tools/test-scene-autosave-03322.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function mem() {
  const bag = {};
  return { bag, getItem: (k) => (k in bag ? bag[k] : null), setItem: (k, v) => { bag[k] = String(v); } };
}
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.322" && ver.dmcc === "0.2.335" && ver.sheetBuild === "sheet-playtest-v03322" && ver.dmccBuild === "dmcc-playtest-v02335");
check("rules.clean", !read("assets/data/rules.js").includes("sceneLibrary") && !read("database.rules.json").includes("sceneLibrary"));
check("save.copy", read("map/scene-builder.js").includes("Saving…") && read("map/scene-builder.js").includes("Export scene to keep a copy."));

const store = mem();
const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const ui = { window: w, document: w.document, localStorage: store };
vm.runInNewContext(read("map/scene-builder.js"), ui);
const B = w.SSDNSSceneBuilder;
const host = w.document.getElementById("host");
const maps = [
  { id: "scn_loft", name: "Loft", source: "library" },
  { id: "scn_yard", name: "Yard", source: "library" }
];
const older = B.saveScene(store, B.addFloor(B.blank("Alpha camp"), maps[1]));
B.open(host, { role: "dm", maps: () => maps, store: store });
let panel = host.querySelector("[data-act='sceneBuilder']");
check("open.unsaved", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Not saved");
const name = panel.querySelector("[data-act='sceneName']");
name.value = "Zebra fork";
name.dispatchEvent(new w.Event("input", { bubbles: true }));
check("typing.saving", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Saving…");
panel.querySelector("[data-act='floorPick']").value = "scn_loft";
panel.querySelector("[data-act='floorAdd']").click();
check("floor.added", panel.querySelectorAll("[data-act='floorName']").length === 1);
await wait(500);
check("debounced.saved", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Saved");
let lib = B.readLibrary(store);
let zebra = Object.values(lib.scenes).filter((s) => s.name === "Zebra fork")[0];
check("debounced.stored", !!zebra && zebra.floors.length === 1 && zebra.floors[0].mapId === "scn_loft" && zebra.editedAt > older.editedAt);
check("library.top", panel.querySelector("[data-act='sceneLibrary'] b").textContent === "Zebra fork");
panel.querySelector("[data-act='sceneClose']").click();
check("closed", !host.querySelector("[data-act='sceneBuilder']"));
lib = B.readLibrary(store);
zebra = lib.scenes[zebra.id];
check("close.kept", !!zebra && zebra.floors.length === 1 && zebra.name === "Zebra fork");
B.open(host, { role: "dm", maps: () => maps, store: store });
panel = host.querySelector("[data-act='sceneBuilder']");
const names = [...panel.querySelectorAll("[data-act='sceneLibrary'] b")].map((n) => n.textContent);
check("reopen.top", names[0] === "Zebra fork" && names.indexOf("Alpha camp") === 1, names.join(","));
panel.querySelector("[data-act='sceneClose']").click();

const full = mem();
full.setItem = () => { const err = new Error("QuotaExceededError"); err.name = "QuotaExceededError"; throw err; };
let exported = "";
B.open(host, {
  role: "dm",
  maps: () => maps,
  store: full,
  onExport: (text) => { exported = String(text || ""); }
});
panel = host.querySelector("[data-act='sceneBuilder']");
const fullName = panel.querySelector("[data-act='sceneName']");
fullName.value = "Unsaved ridge";
fullName.dispatchEvent(new w.Event("input", { bubbles: true }));
panel.querySelector("[data-act='floorPick']").value = "scn_yard";
panel.querySelector("[data-act='floorAdd']").click();
panel.querySelector("[data-act='sceneClose']").click();
check("full.stays", !!host.querySelector("[data-act='sceneBuilder']"));
check("full.status", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Not saved");
let notice = panel.querySelector("[data-act='scenePackNotice']");
check("full.notice", !!notice && notice.classList.contains("is-err") && /could not be saved/i.test(notice.textContent) && /Export scene/i.test(notice.textContent), notice && notice.textContent);
check("full.empty", !Object.keys(B.readLibrary(full).scenes).length);
panel.querySelector("[data-act='sceneExportDraft']").click();
check("full.export", exported.includes("Unsaved ridge") && exported.includes("scn_yard"));
B.close();

const silent = { bag: {}, getItem: () => null, setItem: () => {} };
B.open(host, { role: "dm", maps: () => maps, store: silent });
panel = host.querySelector("[data-act='sceneBuilder']");
panel.querySelector("[data-act='floorPick']").value = "scn_loft";
panel.querySelector("[data-act='floorAdd']").click();
panel.querySelector("[data-act='sceneSave']").click();
notice = panel.querySelector("[data-act='scenePackNotice']");
check("private.notice", !!notice && notice.classList.contains("is-err") && /could not be saved/i.test(notice.textContent));
check("private.status", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Not saved");
B.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed before the screenshot");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}

const OUT = "/opt/cursor/artifacts/scene-autosave";
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=scene-autosave", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.SSDNSSceneBuilder && document.querySelector("[data-act='sceneBuilderBtn']"));
await page.evaluate(() => localStorage.removeItem("ssdns.sceneLibrary.v1"));
const olderId = await page.evaluate(() => {
  const B = window.SSDNSSceneBuilder;
  const scene = B.addFloor(B.blank("Alpha camp"), { id: "scn_dustyspur01", name: "Saloon", source: "pack" });
  return B.saveScene(localStorage, scene).id;
});
await page.click("[data-act='mapsBtn']");
await page.click("[data-act='sceneBuilderBtn']");
await page.waitForSelector("[data-act='sceneBuilder']");
await page.fill("[data-act='sceneName']", "Dry camp");
await page.selectOption("[data-act='floorPick']", "scn_dustyspur01");
await page.click("[data-act='floorAdd']");
await page.waitForFunction(() => {
  const node = document.querySelector("[data-act='sceneSaveStatus']");
  return node && node.textContent === "Saved";
});
await page.evaluate(() => {
  const panel = document.querySelector("[data-act='sceneBuilder']");
  panel.style.position = "fixed";
  panel.style.top = "16px";
  panel.style.right = "16px";
  panel.style.width = "380px";
  panel.style.maxHeight = "760px";
  panel.style.zIndex = "80";
});
await page.locator("[data-act='sceneBuilder']").screenshot({ path: path.join(OUT, "status-saved.png") });
await page.click("[data-act='sceneClose']");
await page.waitForFunction(() => !document.querySelector("[data-act='sceneBuilder']"));
const kept = await page.evaluate((id) => {
  const scene = window.SSDNSSceneBuilder.readLibrary(localStorage).scenes[id];
  const names = Object.values(window.SSDNSSceneBuilder.readLibrary(localStorage).scenes).map((s) => s.name);
  return { gone: !document.querySelector("[data-act='sceneBuilder']"), alpha: !!scene, names };
}, olderId);
check("shot.closed", kept.gone && kept.alpha);
await page.click("[data-act='mapsBtn']");
await page.click("[data-act='sceneBuilderBtn']");
await page.waitForSelector("[data-act='sceneLibrary'] b");
await page.evaluate(() => {
  const panel = document.querySelector("[data-act='sceneBuilder']");
  panel.style.position = "fixed";
  panel.style.top = "16px";
  panel.style.right = "16px";
  panel.style.width = "380px";
  panel.style.maxHeight = "760px";
  panel.style.zIndex = "80";
});
const shown = await page.locator("[data-act='sceneLibrary'] b").allTextContents();
check("shot.order", shown[0] === "Dry camp" && shown.indexOf("Alpha camp") > 0, shown.join(","));
await page.locator("[data-act='sceneBuilder']").screenshot({ path: path.join(OUT, "library-reopen.png") });
await page.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  setTimeout(() => process.exit(1), 200);
} else {
  console.log("scene autosave 0.3.322 ok");
  setTimeout(() => process.exit(0), 200);
}

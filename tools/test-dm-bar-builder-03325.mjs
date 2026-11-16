/**
 * Map bar order, Scene Builder autosave, and the unsaved-close warning.
 * Sheet 0.3.328 / DMCC 0.2.341.
 *   node tools/test-dm-bar-builder-03325.mjs
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
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function mem() {
  const bag = {};
  return { bag, getItem: (k) => (k in bag ? bag[k] : null), setItem: (k, v) => { bag[k] = String(v); } };
}

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.328" && ver.dmcc === "0.2.341" && ver.sheetBuild === "sheet-playtest-v03328" && ver.dmccBuild === "dmcc-playtest-v02341");
check("rules.clean", !read("assets/data/rules.js").includes("sceneReadout") && !read("database.rules.json").includes("sceneReadout"));

const mapSrc = read("map/ssdns-map.js");
const left = mapSrc.slice(mapSrc.indexOf('data-act="barLeft"'), mapSrc.indexOf('data-act="barRight"'));
const at = (id) => left.indexOf('data-act="' + id + '"');
check("bar.order", at("sceneReadout") >= 0 && at("sceneReadout") < at("mapsBtn") && at("mapsBtn") < at("dmEditBtn") && at("dmEditBtn") < at("showSceneBtn"), [at("sceneReadout"), at("mapsBtn"), at("dmEditBtn"), at("showSceneBtn")].join(","));
const menu = left.slice(at("mapsMenu"), at("dmEditBtn"));
check("bar.moveOut", menu.indexOf('data-act="showSceneBtn"') < 0 && menu.indexOf("sceneBuilderBtn") >= 0 && at("showSceneBtn") > at("dmEditBtn"));
const right = mapSrc.slice(mapSrc.indexOf('data-act="barRight"'), mapSrc.indexOf('data-act="barRight"') + 900);
check("bar.right", right.indexOf("helpBtn") >= 0 && right.indexOf('data-act="reset"') > right.indexOf("helpBtn") && right.indexOf("zoomLabel") >= 0 && right.indexOf("strength") >= 0);
check("bar.editMoved", mapSrc.indexOf('class="ssm-edit-tokens"') >= 0 && mapSrc.indexOf('data-act="viewFog"') >= 0 && mapSrc.slice(mapSrc.indexOf('data-act="viewFog"'), mapSrc.indexOf('data-act="viewFog"') + 800).indexOf("dmEditBtn") < 0);

const store = mem();
const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
vm.runInNewContext(read("map/scene-builder.js"), { window: w, document: w.document, localStorage: store });
const B = w.SSDNSSceneBuilder;
const host = w.document.getElementById("host");
const maps = [{ id: "scn_loft", name: "Loft", source: "library" }];
B.open(host, { role: "dm", maps: () => maps, store: store, inRoom: (id) => id === "in-room" });
let panel = host.querySelector("[data-act='sceneBuilder']");
const name = panel.querySelector("[data-act='sceneName']");
name.value = "Dry Fork";
name.dispatchEvent(new w.Event("input", { bubbles: true }));
check("save.pending", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Saving…");
panel.querySelector("[data-act='sceneClose']").click();
const ask = panel.querySelector("[data-act='sceneLeaveAsk']");
check("warn.ask", !!ask && /Leave without the latest change\?/.test(ask.textContent) && !!panel.querySelector("[data-act='sceneLeaveStay']") && !!panel.querySelector("[data-act='sceneLeaveDrop']"));
check("warn.stay", !!host.querySelector("[data-act='sceneBuilder']"));
panel.querySelector("[data-act='sceneLeaveStay']").click();
check("warn.stayed", !!host.querySelector("[data-act='sceneBuilder']") && !host.querySelector("[data-act='sceneLeaveAsk']"));
let blocked = false;
w.dispatchEvent(new w.Event("beforeunload", { cancelable: true }));
w.addEventListener("beforeunload", (ev) => { if (ev.defaultPrevented) blocked = true; });
const ev = new w.Event("beforeunload", { cancelable: true });
w.dispatchEvent(ev);
check("warn.refresh", ev.defaultPrevented === true);
panel.querySelector("[data-act='floorPick']").value = "scn_loft";
panel.querySelector("[data-act='floorAdd']").click();
await wait(500);
check("save.saved", panel.querySelector("[data-act='sceneSaveStatus']").textContent === "Saved" && /is-saved/.test(panel.querySelector("[data-act='sceneSaveStatus']").className));
const kept = Object.values(B.readLibrary(store).scenes).filter((s) => s.name === "Dry Fork");
check("save.stored", kept.length === 1 && kept[0].floors.length === 1 && kept[0].floors[0].mapId === "scn_loft");
panel.querySelector("[data-act='sceneClose']").click();
check("save.close", !host.querySelector("[data-act='sceneBuilder']"));

const full = mem();
full.setItem = () => { const err = new Error("QuotaExceededError"); err.name = "QuotaExceededError"; throw err; };
B.open(host, { role: "dm", maps: () => maps, store: full });
panel = host.querySelector("[data-act='sceneBuilder']");
panel.querySelector("[data-act='floorPick']").value = "scn_loft";
panel.querySelector("[data-act='floorAdd']").click();
panel.querySelector("[data-act='sceneClose']").click();
check("full.ask", !!panel.querySelector("[data-act='sceneLeaveAsk']"));
panel.querySelector("[data-act='sceneLeaveDrop']").click();
check("full.left", !host.querySelector("[data-act='sceneBuilder']") && !Object.keys(B.readLibrary(full).scenes).length);

B.open(host, {
  role: "dm",
  maps: () => maps,
  store: store,
  inRoom: (id) => id === kept[0].id
});
panel = host.querySelector("[data-act='sceneBuilder']");
panel.querySelector("[data-act='sceneStep'][data-step='4']").click();
const card = panel.querySelector(".ssm-lib-card.is-active");
check("lib.card", !!card && /In this room/.test(card.textContent) && !!card.querySelector("[data-act='sceneLoad']") && !!card.querySelector("[data-act='sceneOpen']") && !!card.querySelector("[data-act='sceneExportOne']") && !!card.querySelector("[data-act='sceneDelete']"));
check("lib.note", /this browser only/i.test(panel.querySelector("[data-act='sceneStoreNote']").textContent));
check("lib.steps", panel.querySelectorAll("[data-act='sceneStep']").length === 5 && /Add the maps this place uses/.test(panel.textContent) === false && /already in this browser/.test(panel.textContent));
B.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("dm bar builder 0.3.328 ok");

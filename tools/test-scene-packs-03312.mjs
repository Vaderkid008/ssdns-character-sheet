/**
 * Scene packs: export and import scenes in the map-pack format.
 * Sheet 0.3.313 / DMCC 0.2.326.
 *   node tools/test-scene-packs-03312.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.313" && ver.dmcc === "0.2.326" && ver.sheetBuild === "sheet-playtest-v03313" && ver.dmccBuild === "dmcc-playtest-v02326");
check("rules.clean", !read("assets/data/rules.js").includes("ssdns-map-pack") && !read("database.rules.json").includes("importScenePack"));

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
vm.runInNewContext(read("map/places.js") + "\n" + read("map/scene-builder.js"), sandbox);
const B = sandbox.SSDNSSceneBuilder;

function mem() {
  const bag = {};
  return { bag, getItem: (k) => (k in bag ? bag[k] : null), setItem: (k, v) => { bag[k] = String(v); } };
}
function known(ids) {
  const o = {};
  ids.forEach((id) => { o[id] = 1; });
  return o;
}

let scene = B.addFloor(B.addFloor(B.blank("House"), { id: "scn_cellar", name: "Cellar" }), { id: "scn_loft", name: "Loft" });
scene = B.addSpawn(scene, scene.floors[0].id, { x: 2, y: 4 });
scene = B.addLink(scene, scene.floors[0].id, { x: 3, y: 5, kind: "up" });
scene = B.setLink(scene, scene.floors[0].id, scene.floors[0].stairs[0].id, { destFloorId: scene.floors[1].id, landX: 8, landY: 2, twoWay: true });
const store = mem();
scene = B.saveScene(store, scene);
const lookup = (id) => ({ id, name: id, img: "packs/" + id + ".webp", grid: { cols: 20, rows: 12, px: 70 }, pack: true });
const exp = B.exportScenePack([scene], lookup);
check("export.format", exp.pack.format === "ssdns-map-pack" && exp.pack.version === 2 && exp.pack.encounters == null && exp.pack.scenes.length === 1 && exp.pack.scenes[0].encounters == null);
check("export.maps", exp.pack.maps.map((m) => m.id).sort().join(",") === "scn_cellar,scn_loft" && exp.pack.maps.every((m) => m.pack === true && m.img));
check("export.links", exp.pack.scenes[0].floors[0].stairs[0].twoWay === true && exp.pack.scenes[0].floors[1].stairs.some((s) => s.kind === "down" && s.x === 8));
check("export.spawns", exp.pack.scenes[0].floors[0].spawns[0].x === 2 && exp.pack.scenes[0].floors[0].spawns[0].y === 4);

const fresh = mem();
const back = B.importScenePack(exp.text, { store: fresh, knownMaps: known(["scn_cellar", "scn_loft"]) });
const restored = back.scenes[scene.id];
check("round.ok", back.ok && back.added === 1 && restored && restored.floors.length === 2 && restored.encounters == null, back.error || back.message);
check("round.links", restored.floors[0].stairs[0].landX === 8 && restored.floors[1].stairs.some((s) => s.pairId === restored.floors[0].stairs[0].id));
check("round.spawn", restored.floors[0].spawns[0].x === 2 && restored.floors[0].groups.some((g) => g.isDefault));
const keep = B.importScenePack(exp.text, { store: fresh, knownMaps: known(["scn_cellar", "scn_loft"]) });
check("round.same", keep.kept === 1 && keep.added === 0 && Object.keys(B.readLibrary(fresh).scenes).length === 1, keep.message);

const changed = B.readLibrary(fresh).scenes[scene.id];
changed.floors[0].spawns[0].x = 99;
B.saveScene(fresh, changed);
const clash = B.importScenePack(exp.text, { store: fresh, knownMaps: known(["scn_cellar", "scn_loft"]) });
const values = Object.values(B.readLibrary(fresh).scenes);
const copy = values.filter((s) => /\(imported\)$/.test(s.name))[0];
check("clash.copy", clash.copied === 1 && copy && copy.id !== scene.id && copy.floors[0].spawns[0].x === 2, clash.message);
check("clash.kept", B.readLibrary(fresh).scenes[scene.id].floors[0].spawns[0].x === 99 && values.length === 2);

const other = B.saveScene(fresh, B.addFloor(B.blank("Keep me"), { id: "scn_keep", name: "Keep" }));
const old = { format: "ssdns-map-pack", version: 1, maps: [{ id: "my_picture", name: "Picture map", src: "https://example.com/room.webp", grid: { cols: 10, rows: 8, px: 70 } }] };
const pictured = B.importScenePack(JSON.stringify(old), { store: fresh });
const pictureScene = Object.values(pictured.scenes).filter((s) => s.floors && s.floors[0] && s.floors[0].mapId === "my_picture")[0];
check("old.scene", pictured.ok && pictureScene && pictureScene.floors.length === 1 && pictureScene.floors[0].stairs.length === 0 && pictureScene.encounters == null && pictured.maps[0].id === "my_picture", pictured.error || pictured.message);
check("old.kept", B.readLibrary(fresh).scenes[other.id] && B.readLibrary(fresh).scenes[other.id].name === "Keep me");

const gone = B.importScenePack(JSON.stringify({ format: "ssdns-map-pack", version: 2, maps: [], scenes: [{ id: "scene_gap", name: "Gap", floors: [{ id: "floor_gap", mapId: "scn_gone", name: "Gone", spawns: [], groups: [], stairs: [] }] }] }), { store: mem() });
check("missing", gone.ok && gone.added === 1 && gone.warnings.some((w) => /Missing map/.test(w)), gone.message);

check("bad.json", B.importScenePack("nope", {}).ok === false && /JSON/.test(B.importScenePack("nope", {}).error));
check("bad.file", B.importScenePack({ hello: 1 }, {}).ok === false && /isn't an SSDNS map pack/.test(B.importScenePack({ hello: 1 }, {}).error));
check("bad.library", B.importScenePack({ format: B.KEY, scenes: {} }, {}).ok === false && /Import library/.test(B.importScenePack({ format: B.KEY, scenes: {} }, {}).error));
check("bad.empty", B.importScenePack({ format: "ssdns-map-pack", maps: [], scenes: [] }, {}).ok === false);
check("bad.big", B.importScenePack("{}", { maxBytes: 1 }).ok === false && /too big/.test(B.importScenePack("{}", { maxBytes: 1 }).error));
const large = B.importScenePack(exp.text, { store: mem(), knownMaps: known(["scn_cellar", "scn_loft"]), warnBytes: 10 });
check("warn.large", large.ok && large.large && /large/.test(large.message), large.message);
check("bad.null", B.importScenePack(null, {}).ok === false && B.importScenePack(3, {}).ok === false);

const OUT = "/opt/cursor/artifacts/scene-packs";
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=scene-packs-312", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.map && window.SSDNSSceneBuilder);
await page.evaluate(() => document.querySelector("[data-act='mapsBtn']").click());
await page.waitForTimeout(50);
await page.evaluate(() => document.querySelector("[data-act='sceneBuilderBtn']").click());
await page.waitForSelector("[data-act='sceneBuilder']");
await page.evaluate(() => {
  const panel = () => document.querySelector("[data-act='sceneBuilder']");
  const add = (id) => {
    const pick = panel().querySelector("[data-act='floorPick']");
    pick.value = id;
    panel().querySelector("[data-act='floorAdd']").click();
  };
  add("scn_dustyspur01");
  add("scn_upstairs");
  const name = panel().querySelector("[data-act='sceneName']");
  name.value = "Pack house";
  name.dispatchEvent(new Event("input", { bubbles: true }));
  panel().querySelector("[data-act='sceneSave']").click();
});
await page.waitForTimeout(200);
check("ui.export", !!(await page.$("[data-act='sceneExportPack']")) && !!(await page.$("[data-act='sceneExportOne']")) && !!(await page.$("[data-act='sceneImportPack']")));
await page.evaluate(() => {
  const panel = document.querySelector("[data-act='sceneBuilder']");
  const host = document.createElement("div");
  host.className = "ssdns-map";
  host.style.cssText = "position:relative;width:440px;height:auto;overflow:visible;background:#14110e;";
  document.body.appendChild(host);
  host.appendChild(panel);
  panel.style.position = "relative";
  panel.style.top = "0";
  panel.style.right = "auto";
  panel.style.width = "420px";
  panel.style.maxHeight = "none";
  panel.style.height = "auto";
  panel.style.overflow = "visible";
});
await page.locator("[data-act='sceneBuilder']").screenshot({ path: path.join(OUT, "export-buttons.png"), timeout: 20000 });

const badPath = path.join(OUT, "not-a-pack.json");
fs.writeFileSync(badPath, JSON.stringify({ hello: "world" }));
await page.setInputFiles("[data-act='scenePackFile']", badPath);
await page.waitForTimeout(300);
const err = await page.locator("[data-act='scenePackNotice']").innerText();
check("ui.error", /isn't an SSDNS map pack/.test(err), err);
await page.locator("[data-act='sceneBuilder']").screenshot({ path: path.join(OUT, "import-error.png"), timeout: 20000 });

const good = await page.evaluate(() => {
  const scene = window.SSDNSSceneBuilder.addFloor(window.SSDNSSceneBuilder.blank("Night annex"), { id: "scn_street", name: "Street" });
  return window.SSDNSSceneBuilder.exportScenePack([scene], (id) => ({ id, name: "Street", img: "packs/scn_street.webp", grid: { cols: 30, rows: 20, px: 70 }, pack: true })).text;
});
const goodPath = path.join(OUT, "annex-pack.json");
fs.writeFileSync(goodPath, good);
await page.setInputFiles("[data-act='scenePackFile']", goodPath);
await page.waitForTimeout(400);
const okText = await page.locator("[data-act='scenePackNotice']").innerText();
const listed = await page.locator("[data-act='sceneLibrary']").innerText();
check("ui.imported", /Imported 1 scene/.test(okText) && /Night annex/.test(listed), okText + " || " + listed);
await page.locator("[data-act='sceneBuilder']").screenshot({ path: path.join(OUT, "import-success.png"), timeout: 20000 });
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("scene packs 0.3.313 ok");

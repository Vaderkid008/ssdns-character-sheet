/**
 * DM Scene Builder: save a scene, reload it, and load it into a room
 * without touching pack maps, room maps, or tokens.
 * Sheet 0.3.309 / DMCC 0.2.322.
 *   node tools/test-scene-builder-03309.mjs
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
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.309" && ver.dmcc === "0.2.322" && ver.sheetBuild === "sheet-playtest-v03309" && ver.dmccBuild === "dmcc-playtest-v02322");
check("rules.clean", !read("assets/data/rules.js").includes("sceneLibrary") && !read("database.rules.json").includes("sceneLibrary"));

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
vm.runInNewContext(read("map/places.js") + "\n" + read("map/map-packs.js") + "\n" + read("map/scene-builder.js"), sandbox);
const B = sandbox.SSDNSSceneBuilder;
const packIds = sandbox.SSDNS_MAP_PACKS.scenes.map((s) => s.id).concat((sandbox.SSDNS_MAP_PACKS.world || []).map((s) => s.id));
const packBefore = packIds.join(",");

const mem = { bag: {} };
mem.getItem = (k) => (k in mem.bag ? mem.bag[k] : null);
mem.setItem = (k, v) => { mem.bag[k] = String(v); };

let scene = B.blank("Night at the Spur");
scene = B.addFloor(scene, { id: "scn_custom_mine", name: "Mine shaft", source: "library" });
scene = B.addFloor(scene, { id: "scn_loft", name: "Loft", source: "library" });
scene = B.renameFloor(scene, scene.floors[0].id, "Shaft");
scene = B.moveFloor(scene, scene.floors[1].id, -1);
scene = B.setStart(scene, scene.floors[0].id);
scene = B.addSpawn(scene, scene.floors[0].id, { name: "Party", x: 2, y: 4 });
check("build.order", scene.floors.map((f) => f.name).join(",") === "Loft,Shaft", scene.floors.map((f) => f.name).join(","));
check("build.start", scene.startFloorId === scene.floors[0].id && scene.floors[0].name === "Loft");
check("build.spawn", scene.floors[0].spawns[0].x === 2 && scene.floors[0].spawns[0].y === 4);
check("build.stairs", scene.floors.every((f) => Array.isArray(f.stairs) && f.stairs.length === 0) && scene.encounters == null);

scene = B.saveScene(mem, scene);
const again = B.readLibrary(mem).scenes[scene.id];
check("save.reload", again && again.name === "Night at the Spur" && again.floors.length === 2 && again.floors[0].spawns[0].name === "Party");
const copy = B.duplicateScene(mem, scene.id);
check("dup", copy && copy.id !== scene.id && copy.name === "Night at the Spur copy" && B.readLibrary(mem).scenes[copy.id]);
check("delete.confirm", B.deleteScene(mem, copy.id, false).needConfirm === true && B.readLibrary(mem).scenes[copy.id]);
check("delete.done", B.deleteScene(mem, copy.id, true).ok === true && !B.readLibrary(mem).scenes[copy.id] && B.readLibrary(mem).scenes[scene.id]);

const room = {
  places: {
    place_dusty_spur: {
      id: "place_dusty_spur",
      name: "Dusty Spur",
      floors: [
        { id: "scn_dustyspur01", mapId: "scn_dustyspur01", name: "Saloon", order: 0 },
        { id: "scn_upstairs", mapId: "scn_upstairs", name: "Upstairs", order: 1 }
      ]
    }
  },
  tokens: [{ id: "ply_ada", sceneId: "scn_street", x: 3, y: 4, hp: 18 }],
  scenes: { scn_street: { walls: [{ x1: 1, y1: 1, x2: 2, y2: 1 }], meta: { name: "Main Street" } } },
  preps: { scn_street: { ada: { x: 1, y: 1, name: "Ada" } } },
  packIds: packIds.slice()
};
const roomBefore = JSON.stringify({ tokens: room.tokens, scenes: room.scenes, pack: room.packIds, streetPrep: room.preps.scn_street });
const mixed = B.addFloor(B.addFloor(B.blank("Custom plus saloon"), { id: "scn_dustyspur01", name: "Saloon" }), { id: "scn_custom_mine", name: "Mine shaft" });
mixed.floors[1].stairs = [];
const loaded = B.loadIntoRoom(mixed, room);
check("load.tokens", loaded.tokensSame && loaded.tokens[0].sceneId === "scn_street" && loaded.tokens[0].hp === 18);
check("load.scenes", loaded.scenesSame && loaded.scenes.scn_street.walls.length === 1);
check("load.pack", loaded.packSame && loaded.packIds.join(",") === packBefore);
check("load.place", loaded.addedPlace === mixed.id && loaded.places[mixed.id].floors.map((f) => f.mapId).join(",") === "scn_custom_mine");
check("load.kept", loaded.keptFloors.indexOf("scn_dustyspur01") >= 0 && loaded.places.place_dusty_spur.floors.length === 2);
check("load.preps", loaded.preps.scn_street.ada.name === "Ada" && Object.keys(loaded.preps.scn_custom_mine || {}).length === 0);
const withSpawn = B.addSpawn(mixed, mixed.floors.filter((f) => f.mapId === "scn_custom_mine")[0].id, { name: "Party", x: 3, y: 5 });
const spawned = B.loadIntoRoom(withSpawn, room);
const spawnBag = spawned.preps.scn_custom_mine || {};
check("load.spawn", Object.keys(spawnBag).some((k) => spawnBag[k].x === 3 && spawnBag[k].y === 5 && spawnBag[k].prep === true));
check("load.roomUntouched", JSON.stringify({ tokens: room.tokens, scenes: room.scenes, pack: room.packIds, streetPrep: room.preps.scn_street }) === roomBefore);

const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const ui = { window: w, document: w.document, localStorage: mem };
vm.runInNewContext(read("map/scene-builder.js"), ui);
const host = w.document.getElementById("host");
const maps = [
  { id: "scn_custom_mine", name: "Mine shaft", source: "library" },
  { id: "scn_loft", name: "Loft", source: "library" }
];
w.SSDNSSceneBuilder.open(host, { role: "dm", maps: () => maps, store: mem });
const panel = host.querySelector("[data-act='sceneBuilder']");
check("ui.open", !!panel);
const name = panel.querySelector("[data-act='sceneName']");
name.value = "Typed";
name.dispatchEvent(new w.Event("input", { bubbles: true }));
const back = new w.KeyboardEvent("keydown", { key: "Backspace", bubbles: true });
name.dispatchEvent(back);
check("ui.backspace", panel.querySelectorAll("[data-floor]").length === 0 && name.value === "Typed");
panel.querySelector("[data-act='floorPick']").value = "scn_loft";
panel.querySelector("[data-act='floorAdd']").click();
panel.querySelector("[data-act='floorPick']").value = "scn_custom_mine";
panel.querySelector("[data-act='floorAdd']").click();
check("ui.floors", panel.querySelectorAll("[data-act='floorName']").length === 2);
const sx = panel.querySelector("[data-act='spawnX']");
if (!sx) panel.querySelector("[data-act='spawnAdd']").click();
const box = panel.querySelector("[data-act='spawnX']");
box.value = "12";
box.dispatchEvent(new w.Event("input", { bubbles: true }));
check("ui.number", box.value === "12");
panel.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("ui.esc", !host.querySelector("[data-act='sceneBuilder']"));
check("ui.player", w.SSDNSSceneBuilder.open(host, { role: "player", maps: () => maps, store: mem }) == null);

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("scene builder 0.3.309 ok");

/**
 * Showcase packs ship example links the table can try.
 * Sheet 0.3.335 / DMCC 0.2.348.
 *   node tools/test-showcase-links-03326.mjs
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
check("ver", ver.sheet === "0.3.335" && ver.dmcc === "0.2.348" && ver.sheetBuild === "sheet-playtest-v03335" && ver.dmccBuild === "dmcc-playtest-v02348");
check("rules.clean", !read("assets/data/rules.js").includes("lnk_inside_up") && !read("database.rules.json").includes("playersCanUse"));
check("publish.room", read("map/ssdns-map.js").includes("function roomLinks()") && /function publishShownLinks\(\) \{\n  if \(role !== "dm"\) return;\n  const byMap = \{\};\n  roomLinks\(\)\.forEach/.test(read("map/ssdns-map.js")));

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
vm.runInNewContext(read("map/places.js") + "\n" + read("map/scene-builder.js"), sandbox);
const B = sandbox.SSDNSSceneBuilder;

function packsUnder(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) packsUnder(abs, out);
    else if (ent.name.endsWith(".ssdns-pack.json")) out.push(abs);
  });
  return out;
}

const packs = packsUnder(path.join(root, "showcase"), []);
check("packs.found", packs.length >= 1, String(packs.length));

const text = read("showcase/bitter-spring-relay/bitter-spring-relay.ssdns-pack.json");
const mem = { bag: {}, getItem(k) { return k in this.bag ? this.bag[k] : null; }, setItem(k, v) { this.bag[k] = String(v); } };
const imported = B.importScenePack(text, { store: mem, maps: {} });
check("import.ok", imported.ok && imported.added === 1, imported.error || imported.message);
const scene = B.readLibrary(mem).scenes.scn_bitter_spring;
const ground = scene.floors.find((f) => f.mapId === "bitter-spring-relay-ground");
const up = scene.floors.find((f) => f.mapId === "bitter-spring-relay-upstairs");
function at(floor, id) {
  return (floor.stairs || []).find((s) => s.id === id);
}
const stairs = at(ground, "lnk_inside_up");
const stairsDown = at(up, "lnk_inside_down");
const hidden = at(ground, "lnk_outside_up");
const ladder = at(ground, "lnk_loft_up");
const door = at(ground, "lnk_haydoor_up");
const doorDown = at(up, "lnk_haydoor_down");
check("stairs.use", stairs && stairs.name === "Stairs up to Upstairs" && stairs.kind === "up" && stairs.twoWay && stairs.visible === true && stairs.playersCanUse === true && stairs.x === 14 && stairs.y === 22 && stairs.landX === 14 && stairs.landY === 17 && stairs.pairId === "lnk_inside_down", JSON.stringify(stairs));
check("stairs.back", stairsDown && stairsDown.name === "Stairs down to the ground" && stairsDown.kind === "down" && stairsDown.visible === true && stairsDown.playersCanUse === true && stairsDown.x === 14 && stairsDown.y === 17 && stairsDown.landX === 14 && stairsDown.landY === 22);
check("hidden.dm", hidden && hidden.visible === false && hidden.playersCanUse === false && hidden.twoWay && hidden.name === "Outside stairs (DM only)" && hidden.landX === 23 && hidden.landY === 12);
check("ladder", ladder && ladder.kind === "ladder" && ladder.visible === true && ladder.playersCanUse === true && ladder.name === "Ladder up to the hayloft" && ladder.x === 30 && ladder.y === 13 && ladder.landX === 30 && ladder.landY === 13);
check("door", door && door.kind === "door" && door.visible === true && door.playersCanUse === true && door.twoWay && door.name === "Hay door up to the loft" && door.x === 29 && door.y === 8 && door.landX === 29 && door.landY === 12 && doorDown && doorDown.kind === "door" && doorDown.x === 29 && doorDown.y === 12 && doorDown.landX === 29 && doorDown.landY === 8, JSON.stringify(door));

const room = B.loadIntoRoom(scene, { places: {}, tokens: [], scenes: {}, preps: {}, packIds: imported.maps.map((m) => m.id) });
const placed = room.places.scn_bitter_spring.floors.find((f) => f.mapId === "bitter-spring-relay-ground");
const loaded = (placed.stairs || []).find((s) => s.id === "lnk_inside_up");
check("room.stairs", loaded && loaded.name === "Stairs up to Upstairs" && loaded.visible === true && loaded.playersCanUse === true && loaded.destMapId === "bitter-spring-relay-upstairs" && loaded.landX === 14 && loaded.landY === 17, JSON.stringify(loaded));
const loadedHidden = (placed.stairs || []).find((s) => s.id === "lnk_outside_up");
check("room.hidden", loadedHidden && loadedHidden.visible === false && loadedHidden.playersCanUse === false);

packs.forEach((file) => {
  const pack = JSON.parse(fs.readFileSync(file, "utf8"));
  const scene = (pack.scenes || [])[0];
  const floors = (scene && scene.floors) || [];
  if (floors.length < 2) return;
  const stairs = floors.flatMap((f) => f.stairs || []);
  const visibleUse = stairs.filter((s) => s.visible && s.playersCanUse !== false && s.kind === "up");
  const hiddenOnly = stairs.filter((s) => s.visible === false && s.playersCanUse === false);
  check("pack." + path.basename(file), visibleUse.length >= 1 && hiddenOnly.length >= 1 && stairs.some((s) => s.kind === "ladder" || s.kind === "door"), path.basename(file));
});

check("docs.load", /Stairs up to Upstairs/.test(read("showcase/bitter-spring-relay/HOW-TO-LOAD.md")) && /DM-only|hidden/.test(read("showcase/bitter-spring-relay/HOW-TO-LOAD.md")));
check("docs.run", /Stairs up to Upstairs/.test(read("showcase/bitter-spring-relay/RUN-SHEET.md")) && /Hay door/.test(read("showcase/bitter-spring-relay/RUN-SHEET.md")));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nshowcase links 0.3.335 ok");

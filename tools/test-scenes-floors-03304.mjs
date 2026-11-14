/**
 * Phase 1: every current map is a floor. Dusty Spur and Ellen Manor are multi-floor scenes.
 * Old scene ids still open. The character sheet link survives a floor change.
 * Sheet 0.3.315 / DMCC 0.2.328.
 *   node tools/test-scenes-floors-03304.mjs
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
check("ver", ver.sheet === "0.3.315" && ver.dmcc === "0.2.328" && ver.sheetBuild === "sheet-playtest-v03315" && ver.dmccBuild === "dmcc-playtest-v02328");
check("rules.clean", !read("database.rules.json").includes("place_dusty_spur") && !read("assets/data/rules.js").includes("place_ellen"));

function loadPack() {
  const sandbox = { window: {}, globalThis: {} };
  sandbox.window = sandbox;
  vm.runInNewContext(read("map/places.js") + "\n" + read("map/map-packs.js"), sandbox);
  return { places: sandbox.SSDNSPlaces, pack: sandbox.SSDNS_MAP_PACKS };
}
const loaded = loadPack();
const Places = loaded.places;
const pack = loaded.pack;

const catalog = pack.scenes.map((s) => ({ id: s.id, name: s.name, group: s.group }));
const world = (pack.world || []).map((w) => ({ id: w.id, name: w.name }));
const room = {
  scn_street: { walls: [{ x1: 1, y1: 1, x2: 2, y2: 1 }], fogRevealed: false },
  scn_custom_mine: { meta: { name: "Mine shaft", src: "upload.png" }, walls: [] }
};
const roomBefore = JSON.stringify(room);
const packBefore = JSON.stringify(pack.scenes.map((s) => s.id));
let migrated = Places.migrate({ scenes: catalog, world: world, scenesRoom: room, ids: Object.keys(room) });
/* room keys are passed as ids; the scene dict itself is not an argument the migrator writes. */
migrated = Places.migrate({ scenes: catalog.concat(Object.keys(room).map((id) => ({ id: id, name: (room[id].meta && room[id].meta.name) || id }))), world: world });
const again = Places.migrate({ scenes: catalog.concat([{ id: "scn_custom_mine", name: "Mine shaft" }]), world: world, places: migrated.places });
check("migrate.idempotent", JSON.stringify(migrated.places) === JSON.stringify(again.places));
check("migrate.packUntouched", JSON.stringify(pack.scenes.map((s) => s.id)) === packBefore);
check("migrate.roomUntouched", JSON.stringify(room) === roomBefore && room.scn_street.walls.length === 1);

function placeOf(mapId) {
  return Places.resolve(migrated.places, mapId);
}
const dusty = placeOf("scn_dustyspur01");
const up = placeOf("scn_upstairs");
check("dusty.same", dusty && up && dusty.place.id === up.place.id && dusty.place.name === "Dusty Spur");
check("dusty.floors", dusty.place.floors.map((f) => f.mapId).join(",") === "scn_dustyspur01,scn_upstairs", dusty.place.floors.map((f) => f.name).join(","));
check("dusty.names", dusty.floor.name === "Saloon" && up.floor.name === "Upstairs");

const ellen = placeOf("scn_ellen_grounds");
check("ellen.floors", ellen && ellen.place.name === "Ellen Manor" && ellen.place.floors.map((f) => f.mapId).join(",") === "scn_ellen_cellar,scn_ellen_grounds,scn_ellen_2f,scn_ellen_3f");
check("ellen.names", ellen.place.floors.map((f) => f.name).join(",") === "Cellar,Grounds,2nd floor,3rd floor");
check("street.own", placeOf("scn_street").place.floors.length === 1 && placeOf("scn_street").place.id !== dusty.place.id);
check("plains.split", placeOf("scn_plains_day").place.id !== placeOf("scn_plains_night").place.id);
check("between.own", placeOf("scn_between").place.floors.length === 1);
check("dry.own", placeOf("scn_dry_fork").place.floors.length === 1 && placeOf("scn_dry_fork").mapId === "scn_dry_fork");
check("world.own", placeOf("world_deadwood").mapId === "world_deadwood" && placeOf("world_new_eldorado").place.id !== placeOf("world_deadwood").place.id);
check("custom.own", placeOf("scn_custom_mine").floor.name === "Mine shaft");
check("resolve.place", Places.resolve(migrated.places, "place_dusty_spur").mapId === "scn_dustyspur01");

pack.scenes.concat(pack.world || []).forEach((row) => {
  const hit = placeOf(row.id);
  check("pack." + row.id, !!(hit && hit.mapId === row.id), row.id);
});

const savedExtra = JSON.parse(JSON.stringify(migrated.places));
savedExtra.place_dusty_spur.floors.push({ id: "scn_loft", mapId: "scn_loft", name: "Loft", order: 5 });
const kept = Places.migrate({ scenes: catalog, world: world, places: savedExtra });
check("keep.extra", kept.places.place_dusty_spur.floors.some((f) => f.mapId === "scn_loft"));
check("keep.old", JSON.stringify(room) === roomBefore);

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
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
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const bus = [];
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(w, opts) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  return w.SSDNSMap.create({
    el,
    role: opts.role,
    uid: opts.uid,
    adapter: opts.adapter,
    host: { players: () => [{ uid: "ada", name: "Ada" }] },
    options: {
      scene: JSON.parse(JSON.stringify(scene)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => [{ uid: "ada", name: "Ada" }],
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { role: "dm", uid: "dm", adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }) });
await flush(140);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(140);
const adaId = dm.layers().activeId("ada");
dm.patchToken(adaId, { sheetId: "ada", combatantId: "ada", hp: 18, maxHp: 27, tempHp: 2, conditions: ["prone"] });
await flush(40);
const places = dm.maps().places();
check("live.dusty", dm.maps().placeOf("scn_upstairs").place.id === "place_dusty_spur");
check("live.ellen", places.place_ellen.floors.length === 4);
dm.maps().swap("scn_dustyspur01");
await flush(30);
dm.layers().moveParty(null);
await flush(80);
const onSaloon = dm.layers().tokens().find((t) => t.id === adaId);
check("move.floor", player.viewedScene() === "scn_dustyspur01" && onSaloon.sceneId === "scn_dustyspur01" && onSaloon.sheetId === "ada" && onSaloon.hp === 18, JSON.stringify(onSaloon));
const chip = [].find.call(dmW.document.querySelectorAll("[data-floor]"), (b) => b.getAttribute("data-floor") === "scn_upstairs");
check("floor.chip", !!chip, dm.layers().strip());
if (chip) chip.click();
await flush(40);
check("floor.switch", dm.viewedScene() === "scn_upstairs" && player.viewedScene() === "scn_dustyspur01");
dm.layers().send(adaId, "scn_upstairs");
await flush(80);
const upstairs = dm.layers().tokens().find((t) => t.id === adaId);
check("send.floor", player.viewedScene() === "scn_upstairs" && upstairs.sheetId === "ada" && upstairs.combatantId === "ada" && upstairs.tempHp === 2 && upstairs.conditions.indexOf("prone") >= 0 && upstairs.hp === 18);
const pub = store.pub["map/public/tokens/" + adaId];
check("send.public", pub && pub.value && pub.value.hp == null && pub.value.sheetId === "ada");
const dup = dm.layers().duplicate(adaId);
await flush(40);
const twins = dm.layers().tokens().filter((t) => t.ownerUid === "ada");
check("dup.link", twins.length === 2 && twins.every((t) => t.sheetId === "ada"));
dm.layers().remove ? null : null;
check("maps.menu", !!dmW.document.querySelector("[data-act='mapsBtn']") && dm.maps().list().some((s) => s.id === "scn_street") && dm.maps().list().some((s) => s.id === "scn_dustyspur01"));
check("second.pass", JSON.stringify(dm.maps().places()) === JSON.stringify(dm.maps().places()));

const OUT = "/opt/cursor/artifacts/scenes-floors";
fs.mkdirSync(OUT, { recursive: true });
try {
  const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
  const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=placeshot", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ url: "http://127.0.0.1:8765/map/places.js" });
  await page.waitForFunction(() => window.map && window.map.viewedScene);
  await page.evaluate(() => window.map.maps().swap("scn_dustyspur01"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, "dusty-saloon.png"), timeout: 20000 });
  await page.evaluate(() => window.map.maps().swap("scn_upstairs"));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, "dusty-upstairs.png"), timeout: 20000 });
  await page.evaluate(() => window.map.maps().swap("scn_ellen_grounds"));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, "ellen-grounds.png"), timeout: 20000 });
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll("[data-floor]")).map((b) => b.getAttribute("data-floor")));
  check("shot.ellen", chips.indexOf("scn_ellen_cellar") >= 0 && chips.indexOf("scn_ellen_3f") >= 0, chips.join(","));
  await browser.close();
} catch (err) {
  check("shot.run", false, err && err.message);
}

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((f) => console.log(" - " + f));
  process.exit(1);
}
console.log("scenes and floors 0.3.315 ok");

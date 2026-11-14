/**
 * Scene links: place, move, remove, two-way, save/reload, export/import,
 * load into a room, Take link landing + overflow, hidden from players.
 * Sheet 0.3.314 / DMCC 0.2.327.
 *   node tools/test-scene-links-03310.mjs
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
check("ver", ver.sheet === "0.3.314" && ver.dmcc === "0.2.327" && ver.sheetBuild === "sheet-playtest-v03314" && ver.dmccBuild === "dmcc-playtest-v02327");
check("rules.clean", !read("assets/data/rules.js").includes("floor.stairs") && !read("database.rules.json").includes("shownLinks"));

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
vm.runInNewContext(read("map/places.js") + "\n" + read("map/map-packs.js") + "\n" + read("map/scene-builder.js"), sandbox);
const B = sandbox.SSDNSSceneBuilder;
const Places = sandbox.SSDNSPlaces;

let scene = B.addFloor(B.addFloor(B.blank("House"), { id: "scn_cellar", name: "Cellar", source: "library" }), { id: "scn_loft", name: "Loft", source: "library" });
const cellar = scene.floors[0];
const loft = scene.floors[1];
scene = B.addLink(scene, cellar.id, { x: 4, y: 6, kind: "up" });
let link = scene.floors[0].stairs[0];
check("place", link && link.kind === "up" && link.x === 4 && link.y === 6 && link.visible === false && link.twoWay === false);
scene = B.setLink(scene, cellar.id, link.id, { destFloorId: loft.id, kind: "door" });
link = scene.floors[0].stairs[0];
check("dest", link.kind === "door" && link.destFloorId === loft.id && link.destMapId === "scn_loft");
scene = B.setLink(scene, cellar.id, link.id, { twoWay: true });
check("twoWay.wait", scene.floors[0].stairs[0].twoWay === true && scene.floors[1].stairs.length === 0);
scene = B.setLink(scene, cellar.id, link.id, { landX: 8, landY: 3 });
link = scene.floors[0].stairs[0];
const back = scene.floors[1].stairs[0];
check("landing", link.landX === 8 && link.landY === 3 && back && back.kind === "door" && back.x === 8 && back.y === 3 && back.landX === 4 && back.landY === 6 && back.pairId === link.id && link.pairId === back.id && back.visible === false);
scene = B.setLink(scene, cellar.id, link.id, { x: 5, y: 7 });
check("move", scene.floors[0].stairs[0].x === 5 && scene.floors[0].stairs[0].y === 7 && scene.floors[1].stairs[0].landX === 5 && scene.floors[1].stairs[0].landY === 7 && scene.floors[1].stairs[0].x === 8);
scene = B.setLink(scene, cellar.id, link.id, { kind: "ladder" });
check("kind", scene.floors[0].stairs[0].kind === "ladder" && scene.floors[1].stairs[0].kind === "ladder");
const keptId = scene.floors[1].stairs[0].id;
scene = B.removeLink(scene, cellar.id, link.id);
check("remove", scene.floors[0].stairs.length === 0 && scene.floors[1].stairs.length === 1 && scene.floors[1].stairs[0].id === keptId && scene.floors[1].stairs[0].twoWay === false);
scene = B.addLink(scene, scene.floors[0].id, { x: 2, y: 2, kind: "down" });
link = scene.floors[0].stairs[0];
scene = B.setLink(scene, scene.floors[0].id, link.id, { destFloorId: scene.floors[1].id, landX: 9, landY: 1, twoWay: true, visible: false });
check("again", scene.floors[0].stairs[0].kind === "down" && scene.floors[1].stairs.some((s) => s.kind === "up" && s.x === 9 && s.y === 1));

const mem = { bag: {} };
mem.getItem = (k) => (k in mem.bag ? mem.bag[k] : null);
mem.setItem = (k, v) => { mem.bag[k] = String(v); };
scene = B.saveScene(mem, scene);
const again = B.readLibrary(mem).scenes[scene.id];
check("save.reload", again && again.floors[0].stairs[0].x === 2 && again.floors[0].stairs[0].destMapId === "scn_loft" && again.floors[1].stairs.some((s) => s.kind === "up"));
const dumped = B.exportLibrary(mem);
const other = { bag: {} };
other.getItem = (k) => (k in other.bag ? other.bag[k] : null);
other.setItem = (k, v) => { other.bag[k] = String(v); };
const keep = B.saveScene(other, B.addFloor(B.blank("Keep me"), { id: "scn_keep", name: "Keep" }));
const imported = B.importLibrary(other, dumped);
check("import.merge", imported.added >= 1 && B.readLibrary(other).scenes[scene.id].floors[0].stairs[0].landX === 9 && B.readLibrary(other).scenes[keep.id].floors[0].mapId === "scn_keep");
const round = JSON.parse(dumped);
check("import.stairs", round.scenes[scene.id].floors[0].stairs[0].destMapId === "scn_loft" && round.scenes[scene.id].floors[1].stairs.some((s) => s.pairId));

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
  scenes: { scn_street: { walls: [{ x1: 1, y1: 1, x2: 2, y2: 1 }] } },
  preps: { scn_street: { ada: { x: 1, y: 1, name: "Ada" } } },
  packIds: ["scn_dustyspur01"]
};
const fresh = B.addFloor(B.addFloor(B.blank("Annex"), { id: "scn_annex", name: "Annex" }), { id: "scn_roof", name: "Roof" });
let annex = fresh;
annex = B.addLink(annex, annex.floors[0].id, { x: 3, y: 3, kind: "up" });
annex = B.setLink(annex, annex.floors[0].id, annex.floors[0].stairs[0].id, { destFloorId: annex.floors[1].id, landX: 6, landY: 2, twoWay: true });
const loaded = B.loadIntoRoom(annex, room);
check("load.tokens", loaded.tokensSame && loaded.tokens[0].hp === 18 && loaded.tokens[0].sceneId === "scn_street");
check("load.place", loaded.places[annex.id].floors.map((f) => f.mapId).join(",") === "scn_annex,scn_roof");
const annexStairs = loaded.places[annex.id].floors[0].stairs[0];
const roofStairs = loaded.places[annex.id].floors[1].stairs.find((s) => s.pairId === annexStairs.id);
check("load.stairs", annexStairs && annexStairs.destMapId === "scn_roof" && annexStairs.landX === 6 && roofStairs && roofStairs.destMapId === "scn_annex" && roofStairs.x === 6);
check("load.preps", loaded.preps.scn_street.ada.name === "Ada");
const migrated = Places.migrate({ places: loaded.places, ids: ["scn_annex", "scn_roof", "scn_street"] });
check("migrate.keeps", migrated.places[annex.id].floors[0].stairs[0].landY === 2 && migrated.places[annex.id].floors[0].stairs[0].visible === false);

const dom = new JSDOM("<!doctype html><html><body><div id='host'></div></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
const ui = { window: w, document: w.document, localStorage: mem };
vm.runInNewContext(read("map/scene-builder.js"), ui);
const host = w.document.getElementById("host");
w.SSDNSSceneBuilder.open(host, { role: "dm", maps: () => [{ id: "scn_cellar", name: "Cellar" }, { id: "scn_loft", name: "Loft" }], store: mem });
const panel = host.querySelector("[data-act='sceneBuilder']");
panel.querySelector("[data-act='floorPick']").value = "scn_cellar";
panel.querySelector("[data-act='floorAdd']").click();
panel.querySelector("[data-act='floorPick']").value = "scn_loft";
panel.querySelector("[data-act='floorAdd']").click();
const placeBtn = panel.querySelector("[data-act='linkPlace']");
placeBtn.click();
check("ui.arm", w.SSDNSSceneBuilder.arming() && w.SSDNSSceneBuilder.arming().mode === "marker");
const dropped = w.SSDNSSceneBuilder.dropLink(4, 6);
check("ui.drop", dropped && dropped.x === 4 && dropped.y === 6 && !w.SSDNSSceneBuilder.arming());
const kind = host.querySelector("[data-act='linkKind']");
kind.value = "down";
kind.dispatchEvent(new w.Event("change", { bubbles: true }));
const dest = host.querySelector("[data-act='linkDest']");
dest.value = w.SSDNSSceneBuilder.draft().floors[1].id;
dest.dispatchEvent(new w.Event("change", { bubbles: true }));
host.querySelector("[data-act='linkLand']").click();
check("ui.landArm", w.SSDNSSceneBuilder.arming() && w.SSDNSSceneBuilder.arming().mode === "landing");
const landed = w.SSDNSSceneBuilder.dropLink(8, 2);
check("ui.land", landed && landed.landX === 8 && landed.landY === 2);
const two = host.querySelector("[data-act='linkTwoWay']");
two.checked = true;
two.dispatchEvent(new w.Event("change", { bubbles: true }));
const draft = w.SSDNSSceneBuilder.draft();
check("ui.twoWay", draft.floors[0].stairs[0].twoWay === true && draft.floors[1].stairs.some((s) => s.kind === "up" && s.x === 8 && s.y === 2));
const moved = w.SSDNSSceneBuilder.moveLink(draft.floors[0].stairs[0].id, 3, 5);
check("ui.move", moved.floors[0].stairs[0].x === 3 && moved.floors[0].stairs[0].y === 5 && moved.floors[1].stairs.find((s) => s.kind === "up").landX === 3);
const name = host.querySelector("[data-act='sceneName']");
name.focus();
name.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
check("ui.backspace", w.SSDNSSceneBuilder.draft().floors[0].stairs.length === 1 && w.SSDNSSceneBuilder.draft().floors[1].stairs.length >= 1);
host.querySelector("[data-act='linkPlace']").click();
host.querySelector("[data-act='sceneBuilder']").dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("ui.esc", !w.SSDNSSceneBuilder.arming() && !!host.querySelector("[data-act='sceneBuilder']"));
const removeId = w.SSDNSSceneBuilder.draft().floors[0].stairs[0].id;
w.SSDNSSceneBuilder.removeLinkMark(removeId);
check("ui.remove", w.SSDNSSceneBuilder.draft().floors[0].stairs.length === 0 && w.SSDNSSceneBuilder.draft().floors[1].stairs.every((s) => s.twoWay === false));
check("ui.cards", host.querySelectorAll(".ssm-scene-links").length === 2 && host.querySelector("[data-act='linkPlace']"));

function makeWindow() {
  const box = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const win = box.window;
  const proto = win.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(win.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(win.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
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
const store = { pub: {}, dm: {} };
const bus = [];
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
const players = [{ uid: "ada", name: "Ada" }, { uid: "bo", name: "Bo" }, { uid: "cy", name: "Cy" }];
function boot(win, opts) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
  const el = win.document.createElement("div");
  win.document.body.appendChild(el);
  return win.SSDNSMap.create({
    el,
    role: opts.role,
    uid: opts.uid,
    adapter: opts.adapter,
    host: { players: () => players },
    options: {
      scene: JSON.parse(JSON.stringify(sceneJson)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => players,
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { role: "dm", uid: "dm", adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }) });
await flush(160);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(160);

dmW.document.querySelector("[data-act='sceneBuilderBtn']").click();
const builder = dmW.document.querySelector("[data-act='sceneBuilder']");
check("live.open", !!builder);
builder.querySelector("[data-act='floorPick']").value = "scn_dustyspur01";
builder.querySelector("[data-act='floorAdd']").click();
builder.querySelector("[data-act='floorPick']").value = "scn_upstairs";
builder.querySelector("[data-act='floorAdd']").click();
const buttons = [].slice.call(builder.querySelectorAll("[data-act='linkPlace']"));
buttons[0].click();
const stair = dmW.SSDNSSceneBuilder.dropLink(6, 8);
const destFloor = dmW.SSDNSSceneBuilder.draft().floors[1];
const destSel = dmW.document.querySelector("[data-act='linkDest']");
destSel.value = destFloor.id;
destSel.dispatchEvent(new dmW.Event("change", { bubbles: true }));
dmW.document.querySelector("[data-act='linkLand']").click();
const withLand = dmW.SSDNSSceneBuilder.dropLink(11, 5);
check("live.land", withLand && withLand.landX === 11 && withLand.landY === 5 && withLand.destMapId === "scn_upstairs" && withLand.visible === false);
builder.querySelector("[data-act='sceneSave']").click();
builder.querySelector("[data-act='sceneLoad']").click();
await flush(40);
const places = dm.maps().places();
const saloon = places.place_dusty_spur.floors.find((f) => f.mapId === "scn_dustyspur01");
const upFloor = places.place_dusty_spur.floors.find((f) => f.mapId === "scn_upstairs");
check("live.load", !!(saloon && saloon.stairs && saloon.stairs.some((s) => s.x === 6 && s.y === 8 && s.destMapId === "scn_upstairs" && s.landX === 11 && s.visible === false)), JSON.stringify(saloon && saloon.stairs));
const ada = dm.addPlayerTokenFor("ada");
const bo = dm.addPlayerTokenFor("bo");
const cy = dm.addPlayerTokenFor("cy");
dm.layers().setActive(ada.id);
dm.layers().send(ada.id, "scn_dustyspur01");
dm.layers().send(bo.id, "scn_dustyspur01");
dm.layers().send(cy.id, "scn_dustyspur01");
dm.patchToken(ada.id, { pos: { x: 6, y: 8 }, sheetId: "ada", hp: 18, maxHp: 27 });
dm.patchToken(bo.id, { pos: { x: 2, y: 2 } });
dm.patchToken(cy.id, { pos: { x: 4, y: 4 } });
await flush(40);
check("live.hidden", player.links().drawn().markers.length === 0 && player.viewedScene() === "scn_dustyspur01", player.viewedScene() + " " + JSON.stringify(player.links().drawn()));
const pubKey = Object.keys(store.pub).find((k) => k.indexOf("map/public/scenes/scn_dustyspur01") === 0);
const pubScene = pubKey && store.pub[pubKey] && (store.pub[pubKey].value || store.pub[pubKey]);
check("live.publicHidden", !!pubScene && !JSON.stringify(pubScene.shownLinks || []).includes('"x":6'), JSON.stringify(pubScene && pubScene.shownLinks));

dmW.SSDNSSceneBuilder.setLinkMark(withLand.id, { visible: true });
await flush(40);
check("live.visible", player.viewedScene() === "scn_dustyspur01" && player.links().drawn().markers.some((s) => s.x === 6 && s.y === 8 && s.kind === "up"), player.viewedScene() + " " + JSON.stringify(player.links().drawn()));
dmW.SSDNSSceneBuilder.setLinkMark(withLand.id, { visible: false });
await flush(40);
check("live.hiddenAgain", player.links().drawn().markers.length === 0);

const dupId = dm.layers().duplicate(ada.id);
dm.maps().swap("scn_dustyspur01");
const party = dm.placePartyToken({ pos: { x: 1, y: 1 }, label: "Party" });
const beforeParty = party && party.sceneId + "@" + party.pos.x + "," + party.pos.y;
const dupOnly = dm.links().take(dmW.SSDNSSceneBuilder.draft().floors[0].stairs[0], [dupId]);
await flush(40);
const dupTok = dm.layers().tokens().find((t) => t.id === dupId);
const adaStill = dm.layers().tokens().find((t) => t.id === ada.id);
check("take.dupOnly", dupOnly.length === 1 && dupOnly[0].x === 11 && dupOnly[0].y === 5 && dupOnly[0].overflow === false && dupTok.sceneId === "scn_upstairs" && adaStill.sceneId === "scn_dustyspur01" && adaStill.x === 6 && player.viewedScene() === "scn_dustyspur01", JSON.stringify(dupOnly) + " ada " + adaStill.sceneId + " view " + player.viewedScene());
dm.layers().send(dupId, "scn_dustyspur01");
dm.patchToken(dupId, { pos: { x: 14, y: 14 } });
const linkRow = dmW.SSDNSSceneBuilder.draft().floors[0].stairs[0];
const stood = dm.links().under(ada);
check("menu.under", !!(stood && stood.id === linkRow.id && stood.mapId === "scn_dustyspur01"), JSON.stringify(stood) + " ada " + (ada.sceneId || "") + "@" + (ada.pos && ada.pos.x) + "," + (ada.pos && ada.pos.y));
const menuBtn = dmW.document.querySelector("[data-act='tokenCmdLink']");
check("menu.button", !menuBtn || menuBtn.textContent === "Take link");
const took = dm.links().take(linkRow, [ada.id, bo.id, cy.id, party && party.id, dupId].filter(Boolean).filter((id) => id !== dupId));
await flush(60);
const byId = {};
dm.layers().tokens().forEach((t) => { byId[t.id] = t; });
check("take.land", took[0].id === ada.id && took[0].x === 11 && took[0].y === 5 && took[0].overflow === false && byId[ada.id].sceneId === "scn_upstairs" && byId[ada.id].hp === 18, JSON.stringify(took[0]));
check("take.overflow", took.length === 3 && took.slice(1).every((row) => row.overflow && !(row.x === 11 && row.y === 5)) && new Set(took.map((row) => row.x + "," + row.y)).size === 3, JSON.stringify(took));
check("take.player", player.viewedScene() === "scn_upstairs");
check("take.dupStays", byId[dupId].sceneId === "scn_dustyspur01" && byId[dupId].x === 14 && byId[dupId].y === 14, JSON.stringify(byId[dupId]));
check("take.party", (party.sceneId + "@" + party.pos.x + "," + party.pos.y) === beforeParty, party.sceneId + "@" + party.pos.x + "," + party.pos.y);
check("take.view", dm.viewedScene() === "scn_upstairs");
const upBlocked = dm.layers().tokens().find((t) => t.id === cy.id);
dm.layers().send(cy.id, "scn_upstairs");
dm.patchToken(cy.id, { pos: { x: 11, y: 5 } });
dm.layers().send(ada.id, "scn_dustyspur01");
dm.patchToken(ada.id, { pos: { x: 6, y: 8 } });
const blocked = dm.links().take(linkRow, [ada.id]);
await flush(30);
check("take.blocked", blocked.length === 1 && blocked[0].overflow === true && !(blocked[0].x === 11 && blocked[0].y === 5) && upBlocked, JSON.stringify(blocked));
void upFloor;

const OUT = "/opt/cursor/artifacts/scene-links";
fs.mkdirSync(OUT, { recursive: true });
try {
  const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
  const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=scene-links-310", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.map && window.map.lookAt && window.map.links);
  await page.evaluate(() => {
    const panel = () => document.querySelector("[data-act='sceneBuilder']");
    document.querySelector("[data-act='sceneBuilderBtn']").click();
    const addFloor = (id) => {
      const pick = panel().querySelector("[data-act='floorPick']");
      pick.value = id;
      panel().querySelector("[data-act='floorAdd']").click();
    };
    addFloor("scn_dustyspur01");
    addFloor("scn_upstairs");
    panel().querySelector("[data-act='linkPlace']").click();
    window.SSDNSSceneBuilder.dropLink(8, 8);
    const dest = window.SSDNSSceneBuilder.draft().floors[1];
    const sel = panel().querySelector("[data-act='linkDest']");
    sel.value = dest.id;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    panel().querySelector("[data-act='linkLand']").click();
    window.SSDNSSceneBuilder.dropLink(12, 8);
  });
  await page.evaluate(() => {
    document.querySelectorAll(".ssdns-leftbar,.ssdns-rightbar,.ssdns-chatdock").forEach((n) => { n.style.display = "none"; });
    const b = document.querySelector("[data-act='sceneBuilder']");
    if (b) b.style.visibility = "hidden";
    const toast = document.querySelector("[data-act='toast']");
    if (toast) toast.style.display = "none";
    window.map.maps().swap("scn_dustyspur01");
    window.map.lookAt(8, 8, 1.8);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, "link-marker.png"), timeout: 20000 });
  await page.evaluate(() => {
    const toast = document.querySelector("[data-act='toast']");
    if (toast) toast.style.display = "none";
    window.map.maps().swap("scn_upstairs");
    window.map.lookAt(12, 8, 1.8);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, "landing.png"), timeout: 20000 });
  await page.evaluate(() => {
    const panel = document.querySelector("[data-act='sceneBuilder']");
    const two = panel.querySelector("[data-act='linkTwoWay']");
    two.checked = true;
    two.dispatchEvent(new Event("change", { bubbles: true }));
    const host = document.createElement("div");
    host.className = "ssdns-map";
    host.style.cssText = "position:relative;width:330px;height:auto;overflow:visible;background:#14110e;";
    document.body.appendChild(host);
    host.appendChild(panel);
    panel.style.visibility = "visible";
    panel.style.display = "block";
    panel.style.position = "relative";
    panel.style.top = "0";
    panel.style.right = "auto";
    panel.style.left = "auto";
    panel.style.width = "330px";
    panel.style.maxHeight = "none";
    panel.style.height = "auto";
    panel.style.overflow = "visible";
  });
  await page.locator("[data-act='sceneBuilder']").screenshot({ path: path.join(OUT, "cards.png"), timeout: 20000 });
  const rows = await page.evaluate(() => {
    const links = [].slice.call(document.querySelectorAll(".ssm-scene-link"));
    return links.map((line) => {
      const kind = line.querySelector("[data-act='linkKind']").getBoundingClientRect();
      const ex = line.querySelector("[data-act='linkRemove']").getBoundingClientRect();
      const bar = line.querySelector(".ssm-scene-linkbar").getBoundingClientRect();
      const kids = [].slice.call(line.querySelectorAll(".ssm-scene-linkbar > *")).map((n) => n.getBoundingClientRect());
      const alone = kids.filter((r, i) => !kids.some((o, j) => j !== i && Math.abs(o.top - r.top) < 6));
      return { same: Math.abs(kind.top - ex.top) < 8 && ex.left >= kind.right - 2, below: ex.top > bar.top - 4, orphans: alone.length };
    });
  });
  check("ui.linkRow", rows.length === 2 && rows.every((r) => r.same && !r.below && r.orphans === 0), JSON.stringify(rows));
  await page.evaluate(() => {
    window.map.maps().swap("scn_dustyspur01");
    const fog = document.querySelector("[data-act='fogBtn']");
    if (fog && fog.textContent.indexOf("ON") >= 0) fog.click();
    const amb = document.querySelector("[data-act='ambientSel']");
    if (amb) { amb.value = "bright"; amb.dispatchEvent(new Event("change", { bubbles: true })); }
    window.map.layers().send("tok_jolene", "scn_dustyspur01");
    window.map.patchToken("tok_jolene", { pos: { x: 11, y: 10 } });
  });
  const playerPage = await context.newPage();
  await playerPage.goto("http://127.0.0.1:8765/map/demo.html?role=player&uid=p_jolene&room=scene-links-310", { waitUntil: "domcontentloaded" });
  await playerPage.waitForFunction(() => window.map && window.map.lookAt && window.map.viewedScene && window.map.viewedScene() === "scn_dustyspur01");
  await playerPage.evaluate(() => {
    document.querySelectorAll(".ssdns-leftbar,.ssdns-rightbar,.ssdns-chatdock").forEach((n) => { n.style.display = "none"; });
    window.map.lookAt(8, 8, 1.8);
  });
  const hidden = await playerPage.evaluate(() => window.map.links().drawn());
  check("shot.playerHidden", hidden.markers.length === 0 && hidden.landings.length === 0, JSON.stringify(hidden));
  await playerPage.screenshot({ path: path.join(OUT, "player-hidden.png"), timeout: 20000 });
  await page.evaluate(() => {
    const panel = document.querySelector("[data-act='sceneBuilder']");
    if (panel) panel.style.display = "none";
    document.querySelectorAll(".ssdns-toolbar").forEach((n) => { n.style.display = ""; });
    const ids = ["tok_jolene", "tok_caleb", "tok_mira", "tok_wes"];
    window.map.layers().send("tok_jolene", "scn_dustyspur01");
    window.map.patchToken("tok_jolene", { pos: { x: 8, y: 8 } });
    const link = window.SSDNSSceneBuilder.draft().floors[0].stairs[0];
    window.map.links().take(link, ids);
    window.map.lookAt(12, 8, 1.5);
  });
  await page.waitForTimeout(300);
  const arrived = await page.evaluate(() => window.map.layers().tokens().filter((t) => ["tok_jolene", "tok_caleb", "tok_mira", "tok_wes"].includes(t.id)).map((t) => t.id + "@" + t.sceneId + ":" + t.x + "," + t.y));
  check("shot.arrived", arrived.some((row) => row.indexOf("tok_jolene@scn_upstairs:12,8") === 0) && arrived.length === 4, arrived.join(" | "));
  await page.screenshot({ path: path.join(OUT, "take-link.png"), timeout: 20000 });
  await browser.close();
} catch (err) {
  check("shot.run", false, err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : String(err));
}

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("scene links 0.3.314 ok");

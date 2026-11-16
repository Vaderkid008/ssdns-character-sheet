/**
 * DM floor moves land off the centre (Slice 5, sheet 0.3.328 / DMCC 0.2.341).
 * Order: the link under the token, then the spawn group, then scene spawns or
 * the other floor's landing, then a square near the entry. Nobody stacks.
 *   node tools/test-floor-landing-03322.mjs
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
check("ver", ver.sheet === "0.3.328" && ver.dmcc === "0.2.341" && ver.sheetBuild === "sheet-playtest-v03328" && ver.dmccBuild === "dmcc-playtest-v02341");
check("rules.clean", !read("assets/data/rules.js").includes("floorLandingPlan") && !read("database.rules.json").includes("floorLandingPlan"));
const mapSrc = read("map/ssdns-map.js");
check("src.order", mapSrc.includes("Standing on a link uses that landing") && mapSrc.includes("never the dead centre") && mapSrc.includes("function setFloor"));

const GROUND = "bitter-spring-relay-ground";
const UP = "bitter-spring-relay-upstairs";
const CENTRE = "16,13";
const UP_LINKS = ["14,17", "23,12", "30,13"];
const GROUND_SPAWNS = ["0,1", "1,1", "0,2"];

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
const pack = JSON.parse(read("showcase/bitter-spring-relay/bitter-spring-relay.ssdns-pack.json"));
const players = [
  { uid: "ada", name: "Ada" },
  { uid: "bo", name: "Bo" },
  { uid: "cal", name: "Cal" },
  { uid: "dee", name: "Dee" }
];
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
function boot(win) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
  const el = win.document.createElement("div");
  win.document.body.appendChild(el);
  return win.SSDNSMap.create({
    el, role: "dm", uid: "dm",
    adapter: win.SSDNSMapFirebase.memory({ role: "dm", store: { pub: {}, dm: {} }, bus: [] }),
    host: { players: () => players },
    options: {
      scene: JSON.parse(JSON.stringify(sceneJson)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => players,
      ensureScene: true,
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
function at(t) { return t.x + "," + t.y; }
function unique(rows) { return new Set(rows.map(at)).size === rows.length; }
function loadBitterSpring(win, map) {
  const imported = win.SSDNSSceneBuilder.importScenePack(JSON.stringify(pack), { store: win.localStorage, maps: {} });
  check("import", imported.ok && imported.added === 1, imported.error || imported.message);
  imported.maps.forEach((m) => {
    map.maps().save({
      id: m.id, name: m.name,
      src: "http://127.0.0.1:8765/showcase/bitter-spring-relay/" + String(m.src || "").split("/").pop(),
      thumb: m.thumb || m.src,
      grid: m.grid || { cols: 32, rows: 26, px: 70 },
      notes: "", walls: m.walls || []
    });
  });
  win.document.querySelector("[data-act='sceneBuilderBtn']").click();
  const step = win.document.querySelector("[data-act='sceneStep'][data-step='4']");
  if (step) step.click();
  const load = win.document.querySelector("[data-act='sceneLoad'][data-id='scn_bitter_spring']");
  check("load.btn", !!load);
  if (load) load.click();
  if (win.SSDNSSceneBuilder.close) win.SSDNSSceneBuilder.close();
  const drop = win.document.querySelector("[data-act='sceneLeaveDrop']");
  if (drop) drop.click();
  map.maps().swap("bitter-spring-relay-ground");
  const label = win.document.querySelector("[data-act='sceneReadout']").textContent;
  check("readout.scene", /Bitter Spring/.test(label) && /ground/i.test(label), label);
}
function here(dm, sceneId, tokenIds) {
  return tokenIds.map((id) => dm.layers().tokens().find((t) => t.id === id)).filter((t) => t && t.sceneId === sceneId);
}

const win = makeWindow();
addScript(win, "map/ssdns-map-firebase.js");
const dm = boot(win);
await flush(80);
loadBitterSpring(win, dm);
const ids = players.slice(0, 3).map((p) => dm.addPlayerTokenFor(p.uid, { name: p.name, quiet: true }).id);
const four = dm.addPlayerTokenFor("dee", { name: "Dee" }).id;

ids.forEach((id) => dm.layers().send(id, UP));
const sentUp = here(dm, UP, ids);
check("send.up", sentUp.map(at).join(" ") === UP_LINKS.join(" ") && unique(sentUp) && sentUp.every((t) => at(t) !== CENTRE), sentUp.map(at).join(" "));

ids.forEach((id) => dm.layers().send(id, GROUND));
const downStairs = here(dm, GROUND, ids);
check("send.stair", downStairs.map(at).join(" ") === "14,22 23,19 30,13" && unique(downStairs), downStairs.map(at).join(" "));
ids.forEach((id, i) => dm.patchToken(id, { pos: { x: 5, y: 5 + i } }));
ids.forEach((id) => dm.layers().send(id, GROUND));
const sentGround = here(dm, GROUND, ids);
check("send.ground", sentGround.map(at).join(" ") === GROUND_SPAWNS.join(" ") && unique(sentGround) && sentGround.every((t) => at(t) !== CENTRE), sentGround.map(at).join(" "));

dm.maps().swap(UP);
dm.layers().moveParty(null);
const partyUp = here(dm, UP, ids);
check("party.up", partyUp.map(at).join(" ") === UP_LINKS.join(" ") && unique(partyUp), partyUp.map(at).join(" "));

ids.forEach((id, i) => dm.patchToken(id, { pos: { x: 5, y: 5 + i } }));
dm.maps().swap(GROUND);
dm.layers().moveParty(null, "grp_party");
const partyGround = here(dm, GROUND, ids);
check("party.ground", partyGround.map(at).join(" ") === GROUND_SPAWNS.join(" ") && unique(partyGround), partyGround.map(at).join(" "));

const setUp = dm.layers().setFloor(UP, ids.concat(four));
const setRows = here(dm, UP, ids.concat(four));
check("set.up", setUp.length === 4 && setRows.map(at).slice(0, 3).join(" ") === UP_LINKS.join(" ") && unique(setRows) && setRows.every((t) => at(t) !== CENTRE), setRows.map(at).join(" "));
const fourth = setRows.find((t) => t.id === four);
check("set.near", fourth && Math.max(Math.abs(fourth.x - 14), Math.abs(fourth.y - 17)) === 1, fourth && at(fourth));

dm.patchToken(ids[0], { hp: 18, maxHp: 27, sheetId: "ada", pos: { x: 14, y: 17 } });
dm.layers().tokens();
const stood = dm.layers().setFloor(GROUND, [ids[0]]);
const kept = dm.layers().tokens().find((t) => t.id === ids[0]);
check("stair.down", stood.length === 1 && kept.x === 14 && kept.y === 22 && kept.hp === 18 && kept.sheetId === "ada", kept && at(kept));
dm.layers().setFloor(UP, [ids[0]]);
const backUp = dm.layers().tokens().find((t) => t.id === ids[0]);
check("stair.up", backUp && backUp.x === 14 && backUp.y === 17 && backUp.sceneId === UP, backUp && at(backUp));

dm.focusToken(four);
dm.patchToken(four, { pos: { x: 16, y: 13 } });
const arrow = win.document.querySelector("[data-floor='" + GROUND + "']");
check("arrow.btn", !!arrow);
if (arrow) arrow.click();
const arrowed = dm.layers().tokens().find((t) => t.id === four);
check("arrow.land", arrowed && arrowed.sceneId === GROUND && at(arrowed) === "0,1" && dm.viewedScene() === GROUND, arrowed && at(arrowed) + " view " + dm.viewedScene());

if (failures.length) {
  console.error("\n" + failures.length + " failed before screenshots");
  process.exit(1);
}

const OUT = "/opt/cursor/artifacts/floor-landing";
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=slice5-landing-322", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.map && window.SSDNSSceneBuilder);
const shot = await page.evaluate(async (payload) => {
  payload.maps.forEach((m) => {
    m.src = "http://127.0.0.1:8765/showcase/bitter-spring-relay/" + String(m.src || "").split("/").pop();
  });
  const imported = window.SSDNSSceneBuilder.importScenePack(JSON.stringify(payload), { store: localStorage, maps: {} });
  (imported.maps || []).forEach((m) => {
    window.map.maps().save({
      id: m.id, name: m.name, src: m.src, thumb: m.thumb || m.src,
      grid: m.grid || { cols: 32, rows: 26, px: 70 }, walls: m.walls || [], notes: ""
    });
  });
  document.querySelector("[data-act='sceneBuilderBtn']").click();
  const step = document.querySelector("[data-act='sceneStep'][data-step='4']");
  if (step) step.click();
  const load = document.querySelector("[data-act='sceneLoad'][data-id='scn_bitter_spring']");
  if (load) load.click();
  if (window.SSDNSSceneBuilder.close) window.SSDNSSceneBuilder.close();
  const drop = document.querySelector("[data-act='sceneLeaveDrop']");
  if (drop) drop.click();
  const ids = ["p_ada", "p_bo", "p_cal"].map((uid, i) => window.map.addPlayerTokenFor(uid, { name: ["Ada", "Bo", "Cal"][i], quiet: true }).id);
  function pile(sceneId) {
    ids.forEach((id, i) => {
      window.map.layers().send(id, sceneId);
      window.map.patchToken(id, { pos: { x: 15 + i, y: 13 } });
    });
    window.map.maps().swap(sceneId);
  }
  function frame() {
    const fog = document.querySelector("[data-act='fogBtn']");
    if (fog && fog.textContent.indexOf("ON") >= 0) fog.click();
    const amb = document.querySelector("[data-act='ambientSel']");
    if (amb) { amb.value = "bright"; amb.dispatchEvent(new Event("change", { bubbles: true })); }
    document.querySelectorAll(".ssdns-leftbar,.ssdns-rightbar,.ssdns-chatdock,.ssm-scene-builder").forEach((n) => { n.style.display = "none"; });
    return window.map.layers().tokens().filter((t) => ids.indexOf(t.id) >= 0).map((t) => t.x + "," + t.y);
  }
  function park(sceneId) {
    ids.forEach((id, i) => {
      window.map.layers().send(id, sceneId);
      window.map.patchToken(id, { pos: { x: 15 + i, y: 13 } });
    });
  }
  park("bitter-spring-relay-ground");
  const beforeGround = frame();
  window.map.layers().setFloor("bitter-spring-relay-upstairs", ids);
  const afterUp = frame();
  park("bitter-spring-relay-upstairs");
  const beforeUp = frame();
  window.map.layers().setFloor("bitter-spring-relay-ground", ids);
  const afterGround = frame();
  return { imported: imported.ok, beforeUp, afterUp, beforeGround, afterGround };
}, pack);
check("shot.up", shot.imported && shot.beforeUp.join(" ") === "15,13 16,13 17,13" && shot.afterUp.join(" ") === "14,17 23,12 30,13", JSON.stringify(shot));
check("shot.ground", shot.beforeGround.join(" ") === "15,13 16,13 17,13" && new Set(shot.afterGround).size === 3 && shot.afterGround.every((p) => {
  const xy = p.split(",").map(Number);
  return xy[0] <= 2 && xy[1] <= 4 && p !== "16,13";
}), JSON.stringify(shot.afterGround));

async function show(sceneId, zoomAt) {
  await page.evaluate((arg) => {
    window.map.maps().swap(arg.sceneId);
    const fog = document.querySelector("[data-act='fogBtn']");
    if (fog && fog.textContent.indexOf("ON") >= 0) fog.click();
    document.querySelectorAll(".ssdns-leftbar,.ssdns-rightbar,.ssdns-chatdock,.ssm-scene-builder").forEach((n) => { n.style.display = "none"; });
    window.map.lookAt(arg.x, arg.y, arg.zoom);
  }, { sceneId, x: zoomAt[0], y: zoomAt[1], zoom: zoomAt[2] });
  await page.waitForTimeout(250);
  await page.locator("#mount canvas").first().screenshot({ path: path.join(OUT, zoomAt[3]), timeout: 20000 });
}
await page.evaluate(() => {
  const ids = ["p_ada", "p_bo", "p_cal"].map((uid) => window.map.layers().tokens().find((t) => t.ownerUid === uid).id);
  ids.forEach((id, i) => {
    window.map.layers().send(id, "bitter-spring-relay-upstairs");
    window.map.patchToken(id, { pos: { x: 15 + i, y: 13 } });
  });
});
await show(UP, [16, 13, 0.55, "upstairs-before.png"]);
await page.evaluate(() => {
  const ids = ["p_ada", "p_bo", "p_cal"].map((uid) => window.map.layers().tokens().find((t) => t.ownerUid === uid).id);
  window.map.layers().setFloor("bitter-spring-relay-ground", ids);
});
await show(GROUND, [3, 3, 0.75, "ground-after.png"]);
await page.evaluate(() => {
  const ids = ["p_ada", "p_bo", "p_cal"].map((uid) => window.map.layers().tokens().find((t) => t.ownerUid === uid).id);
  ids.forEach((id, i) => window.map.patchToken(id, { pos: { x: 15 + i, y: 13 } }));
});
await show(GROUND, [16, 13, 0.55, "ground-before.png"]);
await page.evaluate(() => {
  const ids = ["p_ada", "p_bo", "p_cal"].map((uid) => window.map.layers().tokens().find((t) => t.ownerUid === uid).id);
  window.map.layers().setFloor("bitter-spring-relay-upstairs", ids);
});
await show(UP, [22, 15, 0.55, "upstairs-after.png"]);
await page.close();
setTimeout(() => process.exit(failures.length ? 1 : 0), 200);
console.log(failures.length ? "floor landing failed" : "floor landing 0.3.328 ok");

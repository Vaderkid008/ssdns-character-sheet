/**
 * Set floor, Send to, and Move party here land off the centre.
 * Order: link landing, default spawn group, other scene spawns, then near the entry.
 * Nobody stacks. Sheet 0.3.338 / DMCC 0.2.351.
 *   node tools/test-floor-landing-03321.mjs
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
check("ver", ver.sheet === "0.3.338" && ver.dmcc === "0.2.351" && ver.sheetBuild === "sheet-playtest-v03338" && ver.dmccBuild === "dmcc-playtest-v02351");
check("rules.clean", !read("assets/data/rules.js").includes("floorLandingPlan") && !read("database.rules.json").includes("floorLandingPlan"));
const mapSrc = read("map/ssdns-map.js");
check("src.order", mapSrc.includes("link landing, default spawn group") && mapSrc.includes("function floorLandingPlan") && mapSrc.includes("function setFloor"));

const GROUND = "bitter-spring-relay-ground";
const UP = "bitter-spring-relay-upstairs";
const CENTRE = "16,13";
const UP_LINKS = ["14,17", "23,12", "30,13"];
const GROUND_LINKS = ["14,22", "23,19", "30,13"];

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
function boot(win) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
  const el = win.document.createElement("div");
  win.document.body.appendChild(el);
  return win.SSDNSMap.create({
    el,
    role: "dm",
    uid: "dm",
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
function unique(rows) {
  return new Set(rows.map(at)).size === rows.length;
}
function loadBitterSpring(win, map) {
  const imported = win.SSDNSSceneBuilder.importScenePack(JSON.stringify(pack), { store: win.localStorage, maps: {} });
  check("import", imported.ok && imported.added === 1, imported.error || imported.message);
  imported.maps.forEach((m) => {
    map.maps().save({
      id: m.id,
      name: m.name,
      src: "http://127.0.0.1:8765/showcase/bitter-spring-relay/" + String(m.src || "").split("/").pop(),
      thumb: m.thumb || m.src,
      grid: m.grid || { cols: 32, rows: 26, px: 70 },
      notes: m.notes || "",
      walls: m.walls || []
    });
  });
  win.document.querySelector("[data-act='sceneBuilderBtn']").click();
  const load = win.document.querySelector("[data-act='sceneLoad'][data-id='scn_bitter_spring']");
  check("load.btn", !!load);
  if (load) load.click();
  if (win.SSDNSSceneBuilder.close) win.SSDNSSceneBuilder.close();
}

const flush = (ms) => new Promise((r) => setTimeout(r, ms));
const win = makeWindow();
addScript(win, "map/ssdns-map-firebase.js");
const dm = boot(win);
await flush(80);
loadBitterSpring(win, dm);
const ids = players.slice(0, 3).map((p) => {
  const tok = dm.addPlayerTokenFor(p.uid, { name: p.name });
  if (!tok) throw new Error("no token for " + p.uid + " " + (win.document.querySelector("[data-act='toast']") || {}).textContent);
  return tok.id;
});
const four = dm.addPlayerTokenFor("dee").id;

function place(sceneId, tokenIds) {
  return tokenIds.map((id) => dm.layers().tokens().find((t) => t.id === id)).filter((t) => t && t.sceneId === sceneId);
}

ids.forEach((id) => dm.layers().send(id, UP));
const sentUp = place(UP, ids);
check("send.up", sentUp.map(at).join(" ") === UP_LINKS.join(" ") && unique(sentUp) && sentUp.every((t) => at(t) !== CENTRE), sentUp.map(at).join(" "));

ids.forEach((id) => dm.layers().send(id, GROUND));
const sentGround = place(GROUND, ids);
check("send.ground", sentGround.map(at).join(" ") === GROUND_LINKS.join(" ") && unique(sentGround) && sentGround.every((t) => at(t) !== CENTRE), sentGround.map(at).join(" "));

dm.maps().swap(UP);
dm.layers().moveParty(null);
const partyUp = place(UP, ids);
check("party.up", partyUp.map(at).join(" ") === UP_LINKS.join(" ") && unique(partyUp), partyUp.map(at).join(" "));

dm.maps().swap(GROUND);
dm.layers().moveParty(null);
const partyGround = place(GROUND, ids);
check("party.ground", partyGround.map(at).join(" ") === GROUND_LINKS.join(" ") && unique(partyGround), partyGround.map(at).join(" "));

const setUp = dm.layers().setFloor(UP, ids.concat(four));
const setRows = place(UP, ids.concat(four));
check("set.up", setUp.length === 4 && setRows.map(at).slice(0, 3).join(" ") === UP_LINKS.join(" ") && unique(setRows) && setRows.every((t) => at(t) !== CENTRE), setRows.map(at).join(" "));
const fourth = setRows.find((t) => t.id === four);
const near = fourth && Math.max(Math.abs(fourth.x - 14), Math.abs(fourth.y - 17)) === 1;
check("set.near", !!near, fourth && at(fourth));

const hpBefore = 18;
dm.patchToken(ids[0], { hp: hpBefore, maxHp: 27, sheetId: "ada" });
dm.layers().setFloor(GROUND, [ids[0]]);
const kept = dm.layers().tokens().find((t) => t.id === ids[0]);
check("set.keeps", kept && kept.sceneId === GROUND && kept.hp === hpBefore && kept.sheetId === "ada" && at(kept) === GROUND_LINKS[0], kept && at(kept));

if (failures.length) {
  console.error("\n" + failures.length + " failed before screenshots");
  process.exit(1);
}

const OUT = "/opt/cursor/artifacts/floor-landing";
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=floor-landing-321", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.map && window.SSDNSSceneBuilder);
const shot = await page.evaluate(async (payload) => {
  const pack = payload;
  pack.maps.forEach((m) => {
    const file = String(m.src || "").split("/").pop();
    m.src = "http://127.0.0.1:8765/showcase/bitter-spring-relay/" + file;
  });
  const imported = window.SSDNSSceneBuilder.importScenePack(JSON.stringify(pack), { store: localStorage, maps: window.map.maps().library() });
  (imported.maps || []).forEach((m) => {
    window.map.maps().save({
      id: m.id, name: m.name, src: m.src, thumb: m.thumb || m.src,
      grid: m.grid || { cols: 32, rows: 26, px: 70 }, walls: m.walls || [], notes: ""
    });
  });
  document.querySelector("[data-act='sceneBuilderBtn']").click();
  const load = document.querySelector("[data-act='sceneLoad'][data-id='scn_bitter_spring']");
  if (load) load.click();
  if (window.SSDNSSceneBuilder.close) window.SSDNSSceneBuilder.close();
  const names = ["Ada", "Bo", "Cal"];
  const uids = ["p_ada", "p_bo", "p_cal"];
  const ids = uids.map((uid, i) => window.map.addPlayerTokenFor(uid, { name: names[i] }).id);
  function pile(sceneId) {
    ids.forEach((id, i) => {
      window.map.layers().send(id, sceneId);
      window.map.patchToken(id, { pos: { x: 15 + i, y: 13 }, label: names[i] });
    });
    window.map.maps().swap(sceneId);
  }
  function frame(sceneId) {
    const fog = document.querySelector("[data-act='fogBtn']");
    if (fog && fog.textContent.indexOf("ON") >= 0) fog.click();
    const amb = document.querySelector("[data-act='ambientSel']");
    if (amb) { amb.value = "bright"; amb.dispatchEvent(new Event("change", { bubbles: true })); }
    document.querySelectorAll(".ssdns-leftbar,.ssdns-rightbar,.ssdns-chatdock,.ssm-scene-builder").forEach((n) => { n.style.display = "none"; });
    const canvas = document.querySelector("#mount canvas");
    const zoom = Math.min(canvas.clientWidth / 2240, canvas.clientHeight / 1820) * 0.92;
    window.map.lookAt(16, 13, zoom);
    return window.map.layers().tokens().filter((t) => ids.indexOf(t.id) >= 0).map((t) => t.label + "@" + t.x + "," + t.y);
  }
  pile("bitter-spring-relay-upstairs");
  const beforeUp = frame("bitter-spring-relay-upstairs");
  ids.forEach((id) => window.map.layers().send(id, "bitter-spring-relay-upstairs"));
  const afterUp = frame("bitter-spring-relay-upstairs");
  return { beforeUp: beforeUp, afterUp: afterUp, imported: imported.ok };
}, pack);
check("shot.import", shot.imported);
check("shot.before", shot.beforeUp.map((row) => row.split("@")[1]).join(" ") === "15,13 16,13 17,13", shot.beforeUp.join(" "));
check("shot.after", shot.afterUp.map((row) => row.split("@")[1]).join(" ") === "14,17 23,12 30,13", shot.afterUp.join(" "));

async function snap(name) {
  await page.locator("#mount canvas").first().screenshot({ path: path.join(OUT, name), timeout: 20000 });
}
await page.evaluate(() => {
  ["p_ada", "p_bo", "p_cal"].forEach((uid, i) => {
    const id = window.map.layers().tokens().find((t) => t.ownerUid === uid).id;
    window.map.layers().send(id, "bitter-spring-relay-upstairs");
    window.map.patchToken(id, { pos: { x: 15 + i, y: 13 } });
  });
  window.map.maps().swap("bitter-spring-relay-upstairs");
  window.map.lookAt(16, 13, 0.55);
});
await page.waitForTimeout(300);
await snap("upstairs-before.png");
await page.evaluate(() => {
  ["p_ada", "p_bo", "p_cal"].forEach((uid) => {
    const id = window.map.layers().tokens().find((t) => t.ownerUid === uid).id;
    window.map.layers().send(id, "bitter-spring-relay-upstairs");
  });
  window.map.maps().swap("bitter-spring-relay-upstairs");
  window.map.lookAt(22, 15, 0.55);
});
await page.waitForTimeout(300);
await snap("upstairs-after.png");
await page.evaluate(() => {
  ["p_ada", "p_bo", "p_cal"].forEach((uid, i) => {
    const id = window.map.layers().tokens().find((t) => t.ownerUid === uid).id;
    window.map.layers().send(id, "bitter-spring-relay-ground");
    window.map.patchToken(id, { pos: { x: 15 + i, y: 13 } });
  });
  window.map.maps().swap("bitter-spring-relay-ground");
  window.map.lookAt(16, 13, 0.55);
});
await page.waitForTimeout(300);
await snap("ground-before.png");
await page.evaluate(() => {
  ["p_ada", "p_bo", "p_cal"].forEach((uid) => {
    const id = window.map.layers().tokens().find((t) => t.ownerUid === uid).id;
    window.map.layers().send(id, "bitter-spring-relay-ground");
  });
  window.map.maps().swap("bitter-spring-relay-ground");
  window.map.lookAt(20, 16, 0.55);
});
await page.waitForTimeout(300);
await snap("ground-after.png");
await page.close();
setTimeout(() => process.exit(failures.length ? 1 : 0), 200);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("floor landing 0.3.338 ok");

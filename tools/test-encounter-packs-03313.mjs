/**
 * Encounter packs: containers, hidden enemies, spawns, two-way stairs,
 * export/import, load into a room, player view, chest interact.
 * Sheet 0.3.313 / DMCC 0.2.326.
 *   node tools/test-encounter-packs-03313.mjs
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
check("ver", ver.sheet === "0.3.313" && ver.dmcc === "0.2.326" && ver.sheetBuild === "sheet-playtest-v03313" && ver.dmccBuild === "dmcc-playtest-v02326");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.313") && !read("database.rules.json").includes("0.3.313") && !read("docs/encounter-pack.md").includes("rules.js"));
check("doc", /floors/.test(read("docs/encounter-pack.md")) && /allowRetries/.test(read("docs/encounter-pack.md")) && /hidden/.test(read("docs/encounter-pack.md")));

const sandbox = { window: {}, globalThis: {} };
sandbox.window = sandbox;
vm.runInNewContext(read("map/places.js") + "\n" + read("map/map-packs.js") + "\n" + read("map/scene-builder.js"), sandbox);
const B = sandbox.SSDNSSceneBuilder;

let scene = B.addFloor(B.addFloor(B.blank("Cellar job"), { id: "scn_dustyspur01", name: "Saloon", source: "pack" }), { id: "scn_upstairs", name: "Upstairs", source: "pack" });
const saloon = scene.floors[0].id;
const up = scene.floors[1].id;
scene = B.addSpawn(scene, saloon, { x: 9, y: 5 });
scene = B.addSpawn(scene, up, { x: 3, y: 3 });
scene = B.addLink(scene, saloon, { x: 2, y: 2, kind: "up" });
let stair = scene.floors[0].stairs[0];
scene = B.setLink(scene, saloon, stair.id, { destFloorId: up, landX: 4, landY: 4, twoWay: true });
scene = B.addContainer(scene, saloon, {
  kind: "chest", name: "Lockbox", x: 8, y: 5,
  items: ["Gold bar x2", { name: "Key", qty: 1, catalogId: "iron-key" }],
  lockDc: 15, forceDc: 18, unlocked: false, allowRetries: false, improvise: false
});
scene = B.addContainer(scene, up, { kind: "strongbox", name: "Strongbox", x: 6, y: 4, items: ["Deed"], lockDc: 20, unlocked: true, allowRetries: false });
scene = B.addEnemy(scene, saloon, { bestiaryId: "outlaw", name: "Outlaw", x: 10, y: 5, hidden: true, initGroup: "Saloon", xp: 25, hp: 11 });
scene = B.addEnemy(scene, saloon, { bestiaryId: "outlaw", name: "Lookout", x: 11, y: 6, hidden: true, initGroup: "Saloon", xp: 25, hp: 11 });
const chest = scene.floors[0].encounters.containers[0];
const box = scene.floors[1].encounters.containers[0];
const foes = scene.floors[0].encounters.enemies;
check("authored", chest.kind === "chest" && chest.lockDc === 15 && chest.forceDc === 18 && chest.allowRetries === false && chest.items[0].name === "Gold bar" && chest.items[0].qty === 2 && chest.items[1].catalogId === "iron-key" && box.kind === "strongbox" && box.forceDc === 25 && box.unlocked === true && foes.length === 2 && foes.every((e) => e.hidden && e.initGroup === "Saloon"));
check("summary", scene.encounters && scene.encounters.xp === 50 && scene.encounters.containers === 2 && scene.encounters.enemies === 2 && scene.encounters.hidden === 2, JSON.stringify(scene.encounters));
const loot = B.lootFromContainer(chest);
check("loot.lock", loot.lock.dc === 15 && loot.lock.forceDc === 18 && loot.lock.allowRetries === false && loot.lock.unlocked === false && loot.lock.attempts && loot.contents[0].qty === 2 && loot.boxType === "chest");
check("stairs", scene.floors[0].stairs[0].twoWay === true && scene.floors[1].stairs.some((s) => s.kind === "down" && s.x === 4 && s.y === 4));

const known = { scn_dustyspur01: { id: "scn_dustyspur01", name: "Saloon", img: "packs/scn_dustyspur01.webp", grid: { cols: 30, rows: 20, px: 70 }, pack: true }, scn_upstairs: { id: "scn_upstairs", name: "Upstairs", img: "packs/scn_upstairs.webp", grid: { cols: 30, rows: 20, px: 70 }, pack: true } };
const exp = B.exportScenePack([scene], (id) => known[id]);
check("export", exp.pack.format === "ssdns-map-pack" && exp.pack.version === 2 && exp.pack.encounters == null && exp.pack.scenes[0].floors[0].encounters.containers[0].name === "Lockbox" && exp.pack.scenes[0].encounters.xp === 50);
const mem = { bag: {} };
mem.getItem = (k) => (k in mem.bag ? mem.bag[k] : null);
mem.setItem = (k, v) => { mem.bag[k] = String(v); };
const back = B.importScenePack(exp.text, { store: mem, knownMaps: { scn_dustyspur01: 1, scn_upstairs: 1 } });
const restored = B.readLibrary(mem).scenes[scene.id];
check("round", back.ok && restored && restored.floors[0].encounters.enemies.length === 2 && restored.floors[1].encounters.containers[0].kind === "strongbox" && restored.floors[0].stairs[0].twoWay === true && restored.encounters.xp === 50, back.error || "");
const again = B.importScenePack(exp.text, { store: mem, knownMaps: { scn_dustyspur01: 1, scn_upstairs: 1 } });
check("round.same", again.ok && again.kept === 1 && again.added === 0, again.message);

const loaded = B.loadIntoRoom(scene, {
  places: {},
  tokens: [{ id: "tok_ada", sceneId: "scn_street", x: 1, y: 1, hp: 18 }],
  scenes: {},
  preps: {},
  packIds: []
});
check("load.keep", loaded.tokensSame && loaded.tokens[0].hp === 18 && loaded.tokens.length === 1);
check("load.pieces", loaded.encounterPieces.length === 2 && loaded.encounterPieces[0].containers[0].name === "Lockbox" && loaded.encounterPieces[0].enemies.length === 2 && loaded.encounterPieces[1].containers[0].kind === "strongbox");

const blank = B.tidy(B.blank("Empty"));
check("blank.null", blank.encounters == null);

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
const players = [{ uid: "ada", name: "Ada" }];
function boot(win, opts) {
  ["map/places.js", "map/map-packs.js", "map/ssdns-map-firebase.js", "map/map-library.js", "map/scene-builder.js", "map/ssdns-map.js"].forEach((f) => addScript(win, f));
  const el = win.document.createElement("div");
  el.className = "ssdns-map";
  win.document.body.appendChild(el);
  return win.SSDNSMap.create({
    el, role: opts.role, uid: opts.uid,
    adapter: win.SSDNSMapFirebase.memory({ role: opts.role, store, bus }),
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
function pointer(win, node, type, x, y) {
  const Ev = win.PointerEvent || win.MouseEvent;
  const ev = new Ev(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1 });
  if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
  node.dispatchEvent(ev);
}

const dmW = makeWindow();
const dm = boot(dmW, { role: "dm", uid: "dm" });
await flush(80);
const plW = makeWindow();
const player = boot(plW, { role: "player", uid: "ada" });
await flush(80);
const ada = dm.addPlayerTokenFor("ada");
dm.patchToken(ada.id, { hp: 18, maxHp: 27, pos: { x: 1, y: 1 } });
dm.layers().setActive(ada.id);
dmW.SSDNSSceneBuilder.saveScene(dmW.localStorage, scene);
dmW.document.querySelector("[data-act='sceneBuilderBtn']").click();
const builder = dmW.document.querySelector("[data-act='sceneBuilder']");
check("ui.open", !!builder && !!dmW.SSDNSSceneBuilder.isOpen());
builder.querySelector("[data-act='sceneOpen'][data-id='" + scene.id + "']").click();
check("ui.cards", !!builder.querySelector("[data-box]") && builder.querySelectorAll("[data-foe]").length === 2 && /50 XP/.test(builder.querySelector("[data-act='encounterSummary']").textContent));
const name = builder.querySelector("[data-act='boxName']");
name.focus();
name.dispatchEvent(new dmW.KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
check("ui.backspace", builder.querySelectorAll("[data-box]").length === 2);
builder.querySelector("[data-act='sceneLoad'][data-id='" + scene.id + "']").click();
await flush(80);
const dmNames = dm.tokenBoxes().map((t) => t.label || "");
const allDm = dm.layers().tokens();
const adaAfter = allDm.filter((t) => t.ownerUid === "ada")[0];
check("load.land", adaAfter && adaAfter.x === 9 && adaAfter.y === 5 && adaAfter.sceneId === "scn_dustyspur01" && adaAfter.hp === 18, JSON.stringify(adaAfter));
const liveChest = dm.tokenBoxes().find((t) => t.kind === "chest");
const liveFoes = dm.tokenBoxes().filter((t) => t.kind === "enemy");
check("dm.sees", !!liveChest && liveFoes.length === 2 && liveFoes.every((t) => t.hidden), dmNames.join(","));
check("hp.untouched", dm.layers().tokens().filter((t) => t.id === ada.id && t.hp === 18).length === 1);
await flush(40);
dmW.document.querySelector("[data-floor='scn_upstairs']").click();
await flush(30);
const upBoxes = dm.tokenBoxes();
check("dm.strongbox", upBoxes.some((t) => t.kind === "chest" && t.y === 4), upBoxes.map((t) => t.kind + "@" + t.x + "," + t.y).join(" "));
dmW.document.querySelector("[data-floor='scn_dustyspur01']").click();
await flush(30);
const playerBoxes = player.tokenBoxes();
check("player.hides", playerBoxes.some((t) => t.kind === "chest") && !playerBoxes.some((t) => t.kind === "enemy") && !playerBoxes.some((t) => /Outlaw|Lookout/.test(t.label)), playerBoxes.map((t) => t.kind + ":" + t.label).join(" "));
check("player.prep", !plW.document.querySelector("[data-act='placeBanner']") && !plW.document.querySelector("[data-act='sceneBuilder']"));
const foeBtn = builder.querySelector("[data-act='foeReveal']");
foeBtn.click();
await flush(40);
const dmAfter = dm.tokenBoxes().filter((t) => t.kind === "enemy").map((t) => (t.label || "") + (t.hidden ? ":hid" : ":show"));
const afterReveal = player.tokenBoxes().filter((t) => t.kind === "enemy");
check("reveal.one", afterReveal.length === 1 && dmAfter.filter((n) => n.endsWith(":show")).length === 1, "player=" + afterReveal.map((t) => t.label).join(",") + " dm=" + dmAfter.join(","));

const pCanvas = plW.document.querySelector("canvas");
const mine = player.tokenBoxes().find((t) => t.ownerUid === "ada");
if (mine && pCanvas) {
  const cx = (mine.screen.x1 + mine.screen.x2) / 2;
  const cy = (mine.screen.y1 + mine.screen.y2) / 2;
  pointer(plW, pCanvas, "pointerdown", cx, cy);
  pointer(plW, pCanvas, "pointerup", cx, cy);
  await flush(30);
  const interact = plW.document.querySelector("[data-act='tokenCmdInteract']");
  if (interact) interact.click();
  await flush(30);
}
const menu = plW.document.querySelector("[data-act='chestMenu']");
const lootBtn = menu && menu.querySelector("[data-chest='loot']");
check("chest.menu", !!menu && !!menu.querySelector("[data-chest='pick']") && !!menu.querySelector("[data-chest='force']") && !!lootBtn && lootBtn.disabled, menu ? menu.textContent : "no menu");

const OUT = "/opt/cursor/artifacts/encounter-packs";
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "cellar-job.json"), exp.text);
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=encounter-packs-313", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.map && window.SSDNSSceneBuilder);
await page.evaluate((packText) => {
  const pack = JSON.parse(packText);
  const scene = pack.scenes[0];
  window.SSDNSSceneBuilder.saveScene(localStorage, scene);
  document.querySelector("[data-act='mapsBtn']").click();
  document.querySelector("[data-act='sceneBuilderBtn']").click();
  const open = document.querySelector("[data-act='sceneOpen'][data-id='" + scene.id + "']");
  if (open) open.click();
}, exp.text);
await page.waitForTimeout(250);
check("shot.cards", (await page.locator("[data-foe]").count()) === 2 && (await page.locator("[data-box]").count()) === 2);
await page.evaluate(() => {
  const panel = document.querySelector("[data-act='sceneBuilder']");
  const host = document.createElement("div");
  host.className = "ssdns-map";
  host.style.cssText = "position:relative;display:block;width:480px;height:auto;max-height:none;overflow:visible;background:#14110e;";
  document.body.appendChild(host);
  const shot = document.createElement("div");
  shot.setAttribute("data-act", "encounterShot");
  shot.style.cssText = "display:block;width:440px;height:auto;overflow:visible;background:#14110e;color:#f0e4cf;padding:12px;";
  panel.querySelectorAll("[data-act='encounterFloor'], [data-act='encounterSummary']").forEach((node) => shot.appendChild(node));
  const sum = shot.querySelector("[data-act='encounterSummary']");
  if (sum) sum.style.cssText = "display:block;white-space:normal;overflow:visible;height:auto;max-height:none;line-height:1.4;margin:8px 0 0;";
  host.appendChild(shot);
});
await page.locator("[data-act='encounterShot']").screenshot({ path: path.join(OUT, "builder.png"), timeout: 20000 });
await page.evaluate(() => {
  const scene = window.SSDNSSceneBuilder.draft();
  document.querySelector("[data-act='sceneLoad']").click();
  window.SSDNSSceneBuilder.close();
  const chest = window.map.tokenBoxes().find((t) => t.kind === "chest");
  const ada = window.map.tokenBoxes().find((t) => t.ownerUid === "p_jolene" || /jolene/i.test(t.label || ""));
  if (ada && chest) window.map.patchToken(ada.id, { pos: { x: chest.x + 1, y: chest.y } });
  const root = document.querySelector("#mount");
  if (root) {
    root.style.gridTemplateColumns = "1fr";
    root.style.gridTemplateAreas = '"stage"';
  }
  document.querySelectorAll(".ssdns-leftbar, .ssdns-rightbar, .ssm-toolbar, .ssm-toolbar-main, .ssm-floor-strip, .dice-bar, .ssdns-chatdock").forEach((node) => { node.style.display = "none"; });
  const dmCard = document.querySelector("[data-act='dmChest']");
  if (dmCard) dmCard.style.display = "none";
  if (chest) window.map.lookAt(chest.x + 1, chest.y, 1.15);
  window.__shot = { chest: chest && { x: chest.x, y: chest.y }, foes: window.map.tokenBoxes().filter((t) => t.kind === "enemy").map((t) => t.label) };
});
await page.waitForTimeout(200);
const shot = await page.evaluate(() => window.__shot);
check("shot.dm", shot && shot.chest && shot.foes.includes("OU") && shot.foes.includes("LO"), JSON.stringify(shot));
await page.locator("#mount canvas").first().screenshot({ path: path.join(OUT, "dm-loaded.png"), timeout: 20000 });

const playerPage = await context.newPage();
await playerPage.goto("http://127.0.0.1:8765/map/demo.html?role=player&uid=p_jolene&room=encounter-packs-313", { waitUntil: "domcontentloaded" });
await playerPage.waitForFunction(() => window.map && window.map.tokenBoxes);
await playerPage.waitForTimeout(300);
const seen = await playerPage.evaluate(() => {
  const boxes = window.map.tokenBoxes();
  const chest = boxes.find((t) => t.kind === "chest");
  if (chest) window.map.lookAt(chest.x, chest.y, 1.4);
  return { enemies: boxes.filter((t) => t.kind === "enemy").length, chest: !!chest, labels: boxes.map((t) => t.label) };
});
check("shot.player", seen.chest && !seen.labels.includes("OU") && !seen.labels.includes("LO"), JSON.stringify(seen));
await playerPage.locator("#mount").screenshot({ path: path.join(OUT, "player-hidden.png"), timeout: 20000 });
await playerPage.evaluate(() => {
  const mine = window.map.tokenBoxes().find((t) => t.ownerUid === "p_jolene");
  const canvas = document.querySelector("canvas");
  if (!mine || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = rect.left + (mine.screen.x1 + mine.screen.x2) / 2;
  const y = rect.top + (mine.screen.y1 + mine.screen.y2) / 2;
  const down = new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1 });
  const up = new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, buttons: 0 });
  canvas.dispatchEvent(down);
  canvas.dispatchEvent(up);
  const btn = document.querySelector("[data-act='tokenCmdInteract']");
  if (btn) btn.click();
});
await playerPage.waitForTimeout(200);
const chestText = await playerPage.locator("[data-act='chestMenu']").innerText().catch(() => "");
check("shot.chest", /Lockbox/.test(chestText) && /Pick lock/.test(chestText) && /Force open/.test(chestText) && /Loot/.test(chestText), chestText);
if (chestText) await playerPage.locator("[data-act='chestMenu']").screenshot({ path: path.join(OUT, "chest-loot.png"), timeout: 20000 });
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("encounter packs 0.3.313 ok");
process.exit(0);

/**
 * Doors, empty chests, and map cards (sheet 0.3.314 / DMCC 0.2.327).
 * A closed door blocks a crossing and not the squares on either side.
 * New chests start empty. Pick lock unlocks; Open reveals the loot.
 * Dragging the Token card does not drop movement waypoints.
 *   node tools/test-door-chest-03292.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import puppeteer from "/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.314" && ver.dmcc === "0.2.327");

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Map, Set };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("map/ssdns-map-move.js"), context);
const Move = context.SSDNSMapMove;
const door = { x1: 8, y1: 9, x2: 9, y2: 9, door: true, open: false };
const flank = [
  { x1: 4, y1: 9, x2: 8, y2: 9 },
  door,
  { x1: 9, y1: 9, x2: 14, y2: 9 }
];
function crosses(a, b) {
  return flank.some((wall) => Move.segmentBlocks(a.x, a.y, b.x, b.y, wall));
}
const ctx = { moverSize: 1, occupants: [], crosses, grid: { cols: 30, rows: 20 } };
const south = Move.computeReach({ x: 8, y: 6 }, 40, ctx);
const north = Move.computeReach({ x: 8, y: 11 }, 40, ctx);
check("stand.south", !!south.get("8,8") && Move.canEndOn(8, 8, ctx));
check("stand.north", !!north.get("8,9") && Move.canEndOn(8, 9, ctx));
check("closed.blocks", Move.segmentBlocks(8.5, 8.5, 8.5, 9.5, door) === true);
check("no.cross.south", !south.get("8,9"));
check("no.cross.north", !north.get("8,8"));
door.open = true;
check("open.cross", Move.segmentBlocks(8.5, 8.5, 8.5, 9.5, door) === false);
door.open = false;

const mapSrc = read("map/ssdns-map.js");
check("src.empty", mapSrc.includes("contents: []") && !mapSrc.includes('name: "Trail rations"') && !mapSrc.includes('name: "Waterskin"'));
check("src.lock", mapSrc.includes('data-door="lock"') || mapSrc.includes('id: "lock"') || read("map/interact-timers.js").includes('id: "lock"'));
check("src.ui", mapSrc.includes("function pointerOverMapUi"));

const browser = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.goto("http://127.0.0.1:8765/dm/?demo=1", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#btnLoadDemo");
await page.click("#btnLoadDemo");
await page.click("#tab-map");
await page.waitForSelector("#mapMount canvas");
await page.evaluate(() => document.querySelector("#mapMount").scrollIntoView({ block: "start" }));
await new Promise((r) => setTimeout(r, 400));

const placed = await page.evaluate(() => {
  const host = window.SSDNSMapHost;
  const chest = host.pinLootChest({
    id: "empty-chest",
    name: "Chest",
    boxType: "chest",
    contents: [],
    cash: { es: 0 },
    lock: { dc: 15, unlocked: false, attempts: {}, forceAttempts: {}, allowRetries: true }
  }, { x: 12, y: 8 });
  const menu = document.querySelector('[data-act="dmChest"]');
  return { id: chest && chest.id, text: menu ? menu.textContent.replace(/\s+/g, " ") : "" };
});
check("chest.empty", placed.id && /ContentsEmpty/.test(placed.text) && !/Trail rations/.test(placed.text) && !/Waterskin/.test(placed.text), placed.text.slice(0, 180));
await page.screenshot({ path: "/opt/cursor/artifacts/chest-empty-1280.png" });

const search = await page.$('[data-dm="search"]');
await search.evaluate((el) => el.scrollIntoView({ block: "center" }));
const sb = await search.boundingBox();
await page.mouse.click(sb.x + 12, sb.y + sb.height / 2);
await page.keyboard.type("healing");
await new Promise((r) => setTimeout(r, 80));
await page.screenshot({ path: "/opt/cursor/artifacts/chest-add-item-1280.png" });
const added = await page.evaluate(() => {
  const hit = document.querySelector('[data-dm="add-cat"]');
  if (hit) hit.click();
  const menu = document.querySelector('[data-act="dmChest"]');
  return menu ? menu.textContent.replace(/\s+/g, " ") : "";
});
check("chest.added", /healing/i.test(added) && !/ContentsEmpty/.test(added), added.slice(0, 180));

const southId = await page.evaluate(() => window.SSDNSMapHost.placeToken({ name: "South", label: "South", kind: "npc", at: { x: 8, y: 8 } }));
const southAt = await page.evaluate((id) => ({ pos: window.SSDNSMapHost.tokenPos(id), screen: window.SSDNSMapHost.tokenScreen(id) }), southId);
const marker = await page.evaluate(() => {
  const id = window.SSDNSMapHost.placeToken({ name: "Mark", label: "Mark", kind: "npc", at: { x: 8, y: 11 } });
  return { id, pos: window.SSDNSMapHost.tokenPos(id), screen: window.SSDNSMapHost.tokenScreen(id) };
});
const cell = (marker.screen.y - southAt.screen.y) / (marker.pos.y - southAt.pos.y);
const gridPoint = (gx, gy) => ({
  x: southAt.screen.x + (gx - (southAt.pos.x + 0.5)) * cell,
  y: southAt.screen.y + (gy - (southAt.pos.y + 0.5)) * cell
});
const southScreen = southAt.screen;
await page.click('[data-act="wallBtn"]');
const edgeY = southAt.pos.y + 1;
const w1 = gridPoint(southAt.pos.x - 2, edgeY);
const w2 = gridPoint(southAt.pos.x + 4, edgeY);
await page.mouse.move(w1.x, w1.y);
await page.mouse.down();
await page.mouse.move(w2.x, w2.y, { steps: 4 });
await page.mouse.up();
await page.click('[data-act="doorBtn"]');
const cut = gridPoint(southAt.pos.x + 0.5, edgeY);
await page.mouse.click(cut.x, cut.y);
await page.click('[data-act="doorBtn"]');
const menuClick = gridPoint(southAt.pos.x + 0.5, edgeY + 0.12);
await page.mouse.click(menuClick.x, menuClick.y);
await new Promise((r) => setTimeout(r, 200));
const doorMenu = await page.evaluate(() => {
  const menu = document.querySelector('[data-act="doorMenu"]');
  if (!menu || menu.hidden) return "";
  return menu.textContent.replace(/\s+/g, " ");
});
check("door.menu", /Lock DC/.test(doorMenu) && /Lock/.test(doorMenu) && /Unlock|Open/.test(doorMenu), doorMenu.slice(0, 180));
const dc = await page.$('[data-door="lock-dc"]');
if (dc) {
  const box = await dc.boundingBox();
  await page.mouse.click(box.x + 8, box.y + box.height / 2, { clickCount: 3 });
  await page.keyboard.type("15");
}
const lockBtn = await page.$('[data-door="lock"]');
if (lockBtn) await lockBtn.click();
await new Promise((r) => setTimeout(r, 150));
await page.evaluate((id) => window.SSDNSMapHost.removeToken(id), marker.id);
const northId = await page.evaluate((at) => window.SSDNSMapHost.placeToken({ name: "North", label: "North", kind: "npc", at: at }), { x: southAt.pos.x, y: southAt.pos.y + 1 });
const northScreen = await page.evaluate((id) => window.SSDNSMapHost.tokenScreen(id), northId);
await page.evaluate(() => {
  const t = document.querySelector('[data-act="toast"]');
  if (t) t.style.display = "none";
});
await page.screenshot({ path: "/opt/cursor/artifacts/door-lock-both-sides-1280.png" });

const before = await page.evaluate((id) => ({
  pos: window.SSDNSMapHost.tokenPos(id),
  marks: document.querySelector("#mapMount").dataset.moveMarks || "0"
}), southId);
await page.mouse.click(southScreen.x, southScreen.y);
await new Promise((r) => setTimeout(r, 150));
const move = await page.$('[data-act="tokenCmdMove"]');
if (move) await move.click();
await page.mouse.click(northScreen.x, northScreen.y);
await new Promise((r) => setTimeout(r, 200));
const afterCross = await page.evaluate((id) => window.SSDNSMapHost.tokenPos(id), southId);
check("door.nocross", afterCross && before.pos && afterCross.x === before.pos.x && afterCross.y === before.pos.y, JSON.stringify({ before: before.pos, after: afterCross }));
const both = await page.evaluate(() => window.SSDNSMapHost.tokenBoxes().filter((b) => b.label === "South" || b.label === "North").map((b) => b.label + "@" + b.x + "," + b.y));
check("door.both", both.some((row) => row.indexOf("South@") === 0) && both.some((row) => row.indexOf("North@") === 0), both.join(" "));

await page.mouse.click(southScreen.x, southScreen.y);
await new Promise((r) => setTimeout(r, 150));
const move2 = await page.$('[data-act="tokenCmdMove"]');
if (move2) await move2.click();
const bar = await page.$('[data-act="tokenCmd"] [data-float-drag]');
const marks0 = await page.evaluate(() => document.querySelector("#mapMount").dataset.moveMarks || "0");
const pos0 = await page.evaluate((id) => window.SSDNSMapHost.tokenPos(id), southId);
if (bar) {
  for (let i = 0; i < 3; i++) {
    const live = await page.$('[data-act="tokenCmd"] [data-float-drag]');
    const box = live && await live.boundingBox();
    if (!box) break;
    await page.mouse.move(box.x + 30, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 78, box.y + 30, { steps: 4 });
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 40));
  }
  const endBar = await page.$('[data-act="tokenCmd"] [data-float-drag]');
  const endBox = endBar && await endBar.boundingBox();
  if (endBox) await page.mouse.move(endBox.x + 24, endBox.y + 8);
  await new Promise((r) => setTimeout(r, 80));
}
const card = await page.evaluate((id) => ({
  marks: document.querySelector("#mapMount").dataset.moveMarks || "0",
  cell: document.querySelector("#mapMount").dataset.moveCell || "",
  pos: window.SSDNSMapHost.tokenPos(id)
}), southId);
check("card.waypoints", card.marks === marks0 && card.pos && pos0 && card.pos.x === pos0.x && card.pos.y === pos0.y, JSON.stringify({ marks0, card }));
check("card.preview", card.cell === "" || card.cell === (pos0.x + "," + pos0.y), card.cell);

const player = await browser.newPage();
await player.setViewport({ width: 1280, height: 1100 });
await player.goto("http://127.0.0.1:8765/map/demo.html?role=player&room=doorchest5", { waitUntil: "domcontentloaded" });
await player.addScriptTag({ path: path.join(root, "assets/js/loot.js") });
await player.waitForFunction(() => window.map && window.map.tokenScreen, { timeout: 10000 }).catch(() => {});
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=doorchest5", { waitUntil: "networkidle0" });
await page.waitForFunction(() => window.map && window.map.pinLootChest, { timeout: 10000 });
await page.evaluate(() => {
  window.map.pinLootChest({
    id: "loot-chest",
    name: "Chest",
    boxType: "chest",
    contents: [{ id: "rope", name: "Rope", qty: 1, taken: false }],
    cash: { es: 0 },
    lock: { dc: 10, unlocked: false, attempts: {}, forceAttempts: {}, allowRetries: true, forceDc: 15 }
  }, { x: 10, y: 1 });
});
await new Promise((r) => setTimeout(r, 300));
await player.evaluate(() => {
  Object.keys(localStorage).forEach((key) => {
    if (key.indexOf("ssdns.map.grid") === 0) localStorage.removeItem(key);
  });
});
await player.reload({ waitUntil: "networkidle0" });
await player.addScriptTag({ path: path.join(root, "assets/js/loot.js") });
await player.waitForFunction(() => window.map && window.map.tokenBoxes && window.map.tokenBoxes().some((b) => b.kind === "chest"), { timeout: 10000 });
let picked = await player.evaluate(() => {
  const canvas = document.querySelectorAll("canvas")[0].getBoundingClientRect();
  const chest = window.map.tokenBoxes().find((b) => b.kind === "chest");
  if (!chest) return { id: "" };
  const s = window.map.tokenScreen(chest.id);
  const inside = s.x > canvas.left + 8 && s.x < canvas.right - 8 && s.y > canvas.top + 8 && s.y < canvas.bottom - 8;
  return { id: chest.id, screen: s, inside };
});
console.log("chest screen", JSON.stringify(picked));
if (picked && picked.inside && picked.screen) {
  await player.evaluate(() => { Math.random = () => 0.99; });
  await player.mouse.click(picked.screen.x, picked.screen.y);
  await new Promise((r) => setTimeout(r, 250));
  const openedMenu = await player.evaluate(() => !!document.querySelector('[data-chest="pick"]'));
  if (!openedMenu) await player.evaluate((id) => window.map.focusLootChest(id), picked.id);
  await player.waitForSelector('[data-chest="pick"]', { timeout: 4000 });
  const pickBtn = await player.$('[data-chest="pick"]');
  const pickBox = await pickBtn.boundingBox();
  if (pickBox) await player.mouse.click(pickBox.x + pickBox.width / 2, pickBox.y + pickBox.height / 2);
  else await pickBtn.click();
  const lockedText = await player.waitForFunction(() => {
    const menu = document.querySelector('[data-act="chestMenu"]');
    const text = menu ? menu.textContent.replace(/\s+/g, " ") : "";
    return /Unlocked|Needs thieves|Failed|Still locked/.test(text) ? text : false;
  }, { timeout: 9000 }).then((handle) => handle.jsonValue());
  check("pick.closed", /Unlocked/.test(lockedText) && /Open/.test(lockedText) && !/Rope/.test(lockedText), lockedText.slice(0, 220) || JSON.stringify(picked));
  await player.evaluate(() => {
    document.querySelectorAll(".d20-zoom, .d20-plain").forEach((node) => node.remove());
  });
  await player.screenshot({ path: "/opt/cursor/artifacts/chest-unlocked-not-open.png" });
  const openBtn = await player.$('[data-chest="open"]');
  const openBox = openBtn && await openBtn.boundingBox();
  if (openBox) await player.mouse.click(openBox.x + Math.min(24, openBox.width / 2), openBox.y + openBox.height / 2);
  else if (openBtn) await openBtn.click();
  const openText = await player.waitForFunction(() => {
    const menu = document.querySelector('[data-act="chestMenu"]');
    const text = menu ? menu.textContent.replace(/\s+/g, " ") : "";
    return /Rope|It's locked|Still locked|Open it first/.test(text) ? text : false;
  }, { timeout: 4000 }).then((handle) => handle.jsonValue()).catch(async () => player.evaluate(() => {
    const menu = document.querySelector('[data-act="chestMenu"]');
    return (menu ? menu.textContent.replace(/\s+/g, " ") : "NO MENU").slice(0, 240);
  }));
  check("pick.opened", /Rope/.test(openText) && !/It's locked/.test(openText), openText.slice(0, 180));
  await player.screenshot({ path: "/opt/cursor/artifacts/chest-opened-loot.png" });
} else {
  check("pick.closed", false, JSON.stringify(picked));
}

await browser.close();
if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndoor chest ok");

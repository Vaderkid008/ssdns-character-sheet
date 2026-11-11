/**
 * DM prop menu: real mouse and keyboard (sheet 0.3.290 / DMCC 0.2.303).
 * Backspace in a field must not delete the chest. The DM can drag a prop
 * without Edit tokens. Catalog pick works from the keyboard. The menu stays put.
 *   node tools/test-prop-menu-03290.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
check("ver", ver.sheet === "0.3.290" && ver.dmcc === "0.2.303");
const map = fs.readFileSync(path.join(root, "map/ssdns-map.js"), "utf8");
check("src.typing", map.includes("function typingInField") && map.includes("typingInField(e.target)"));
check("src.drag", map.includes("isPropTok(hit) && e.button === 0 && !state.tool && role !== 'dm'"));
check("src.dock", map.includes("function dockDmPropMenu"));
check("player.card", map.includes('else anchorChestMenu(menu, token)'));

const browser = await puppeteer.launch({ executablePath: "/usr/local/bin/google-chrome", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
await page.goto("http://127.0.0.1:8765/dm/?demo=1", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForSelector("#btnLoadDemo");
await page.click("#btnLoadDemo");
await page.click("#tab-map");
await page.waitForSelector("#mapMount canvas");
await new Promise((r) => setTimeout(r, 500));

const id = await page.evaluate(() => {
  const tok = window.SSDNSMapHost.pinLootChest({
    id: "menu-chest",
    name: "Menu Chest",
    boxType: "strongbox",
    contents: [{ id: "hardtack", name: "Hardtack", qty: 2, weight: 1, notes: "", taken: false }],
    cash: { es: 0, black: 0, blackId: "", branch: "none" },
    lock: { dc: 15, unlocked: false, attempts: {}, forceAttempts: {}, allowRetries: false }
  }, { x: 4, y: 4 });
  const menu = document.querySelector('[data-act="dmChest"]');
  return { id: tok && tok.id, dock: menu && menu.className, grid: menu && getComputedStyle(menu).gridArea };
});
check("docked", id && id.id && String(id.dock).indexOf("ssm-prop-dock") >= 0, JSON.stringify(id));
await page.screenshot({ path: "/opt/cursor/artifacts/menu-after-dock.png" });

const qty = await page.$('[data-dm="qty"]');
await qty.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
const box = await qty.boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.press("Backspace");
await page.keyboard.type("4");
await new Promise((r) => setTimeout(r, 80));
const typed = await page.evaluate((tid) => {
  const field = document.querySelector('[data-dm="qty"]');
  const menu = document.querySelector('[data-act="dmChest"]');
  return {
    focus: document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-dm"),
    value: field && field.value,
    pos: window.SSDNSMapHost.tokenPos(tid),
    open: !!(menu && !menu.hidden)
  };
}, id.id);
check("backspace.keeps", typed.focus === "qty" && typed.value === "4" && typed.pos && typed.pos.x === 4 && typed.open, JSON.stringify(typed));

const search = await page.$('[data-dm="search"]');
await search.evaluate((el) => el.scrollIntoView({ block: "center", inline: "center" }));
const sb = await search.boundingBox();
const before = await page.evaluate(() => {
  const m = document.querySelector('[data-act="dmChest"]');
  const r = m.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y) };
});
await page.mouse.click(sb.x + 12, sb.y + sb.height / 2);
await page.keyboard.type("bow");
await new Promise((r) => setTimeout(r, 60));
const filtering = await page.evaluate(() => ({
  value: document.querySelector('[data-dm="search"]').value,
  hits: document.querySelectorAll('[data-dm="add-cat"]').length,
  focus: document.activeElement && document.activeElement.getAttribute("data-dm")
}));
check("catalog.filter", filtering.focus === "search" && filtering.value === "bow" && filtering.hits > 0, JSON.stringify(filtering));
await page.keyboard.press("ArrowDown");
await page.keyboard.press("Enter");
await new Promise((r) => setTimeout(r, 80));
const added = await page.evaluate(() => document.querySelector('[data-act="dmChest"]').innerText);
check("catalog.pick", /bow|fiddle/i.test(added), added.slice(0, 180));
const after = await page.evaluate(() => {
  const m = document.querySelector('[data-act="dmChest"]');
  const r = m.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y) };
});
check("menu.stays", before.x === after.x && before.y === after.y, JSON.stringify({ before, after }));

const start = await page.evaluate((tid) => {
  const screen = window.SSDNSMapHost.tokenScreen(tid);
  const canvas = document.querySelector("#mapMount canvas");
  const r = canvas.getBoundingClientRect();
  return Object.assign({}, screen, { canvas: { l: r.left, t: r.top, r: r.right, b: r.bottom } });
}, id.id);
await page.mouse.move(start.x, start.y);
await page.mouse.down();
await page.mouse.move(start.x + 90, start.y + 20, { steps: 6 });
await page.mouse.up();
await new Promise((r) => setTimeout(r, 80));
const moved = await page.evaluate((tid) => window.SSDNSMapHost.tokenPos(tid), id.id);
check("dm.drag", moved && (moved.x !== 10 || moved.y !== 6), JSON.stringify({ start, moved }));

await page.screenshot({ path: "/opt/cursor/artifacts/menu-after-edit.png" });
await browser.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nprop menu ok");
process.exit(0);

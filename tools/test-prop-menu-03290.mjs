/**
 * DM prop menu: real mouse and keyboard (sheet 0.3.306 / DMCC 0.2.319).
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
check("ver", ver.sheet === "0.3.306" && ver.dmcc === "0.2.319");
const map = fs.readFileSync(path.join(root, "map/ssdns-map.js"), "utf8");
check("src.typing", map.includes("function typingInField") && map.includes("typingInField(e.target)"));
check("src.drag", map.includes("isPropTok(hit) && e.button === 0 && !state.tool && role !== 'dm'"));
check("src.dock", map.includes("function dockDmPropMenu"));
check("player.card", map.includes('else anchorChestMenu(menu, token)'));

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

async function zoomChest(tid) {
  for (let i = 0; i < 16; i++) {
    const p = await page.evaluate((id) => window.SSDNSMapHost.tokenScreen(id), tid);
    if (!p) break;
    await page.evaluate((pt) => {
      const canvas = document.querySelector("#mapMount canvas");
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, clientX: pt.x, clientY: pt.y, bubbles: true, cancelable: true }));
    }, p);
  }
}
async function measure() {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el || el.hidden) return 0;
      return Math.round(el.getBoundingClientRect().width);
    };
    const drawer = document.querySelector("#mapMount > .ssm-drawer");
    const prop = document.querySelector("#mapMount > .ssm-prop-dock:not([hidden])");
    const canvas = document.querySelector("#mapMount canvas");
    const overflow = [...document.querySelectorAll(".ssm-prop-dock button, .ssm-prop-dock label.ssm-line")].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim());
    return { drawer: rect(drawer), prop: rect(prop), canvas: rect(canvas), overflow };
  });
}
const opened = await page.evaluate(() => {
  const host = window.SSDNSMapHost;
  return host.placeToken({ name: "Jolene", label: "Jolene", kind: "npc", at: { x: 6, y: 4 } });
});
const jolene = opened ? await page.evaluate((tid) => window.SSDNSMapHost.tokenScreen(tid), opened) : null;
if (jolene) {
  await page.mouse.click(jolene.x, jolene.y);
  await new Promise((r) => setTimeout(r, 300));
}
const drawerAt = await measure();
check("drawer.open", drawerAt.drawer > 200 && drawerAt.canvas > 200, JSON.stringify(drawerAt));
if (opened) await page.evaluate((tid) => window.SSDNSMapHost.removeToken(tid), opened);

const id = await page.evaluate(() => {
  const tok = window.SSDNSMapHost.pinLootChest({
    id: "menu-chest",
    name: "Chest",
    boxType: "strongbox",
    contents: [{ id: "hardtack", name: "Hardtack", qty: 2, weight: 1, notes: "", taken: false }],
    cash: { es: 0, black: 0, blackId: "", branch: "none" },
    lock: { dc: 15, unlocked: false, attempts: {}, forceAttempts: {}, allowRetries: false }
  }, { x: 12, y: 8 });
  const menu = document.querySelector('[data-act="dmChest"]');
  return { id: tok && tok.id, dock: menu && menu.className, grid: menu && getComputedStyle(menu).gridArea };
});
check("docked", id && id.id && String(id.dock).indexOf("ssm-prop-dock") >= 0, JSON.stringify(id));
const propAt = await measure();
check("width.match", Math.abs(propAt.prop - drawerAt.drawer) <= 2 && propAt.canvas > 200, JSON.stringify({ drawer: drawerAt.drawer, prop: propAt.prop, canvas: propAt.canvas }));
check("no.overflow", propAt.overflow.length === 0, propAt.overflow.join(" | "));
await page.evaluate(() => {
  const t = document.querySelector('[data-act="toast"]');
  if (t) t.style.display = "none";
  const body = document.querySelector(".ssm-prop-dock .ssm-card-body");
  if (body) body.scrollTop = 0;
});
await zoomChest(id.id);
await page.screenshot({ path: "/opt/cursor/artifacts/menu-dock-1280.png" });

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
check("backspace.keeps", typed.focus === "qty" && typed.value === "4" && typed.pos && typed.pos.x === 12 && typed.open, JSON.stringify(typed));

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

const searchField = await page.$(".ssm-prop-dock [data-dm='search']");
if (searchField) await searchField.evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.screenshot({ path: "/opt/cursor/artifacts/menu-catalog-1280.png" });
await page.setViewport({ width: 1600, height: 900 });
await page.evaluate(() => {
  document.querySelector("#mapMount").scrollIntoView({ block: "start" });
  const t = document.querySelector('[data-act="toast"]');
  if (t) t.style.display = "none";
  const body = document.querySelector(".ssm-prop-dock .ssm-card-body");
  if (body) body.scrollTop = 0;
});
await new Promise((r) => setTimeout(r, 200));
const wide = await measure();
check("width.match.1600", Math.abs(wide.prop - drawerAt.drawer) <= 2 && wide.canvas > 200 && wide.overflow.length === 0, JSON.stringify(wide));
await zoomChest(id.id);
await page.screenshot({ path: "/opt/cursor/artifacts/menu-dock-1600.png" });
if (searchField) await searchField.evaluate((el) => el.scrollIntoView({ block: "center" }));
await page.screenshot({ path: "/opt/cursor/artifacts/menu-catalog-1600.png" });
await browser.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nprop menu ok");
process.exit(0);

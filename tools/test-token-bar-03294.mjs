/**
 * The token card stays put while a token is dragged, and a party lantern
 * shows the dark map to a player. Sheet 0.3.311 / DMCC 0.2.324.
 *   node tools/test-token-bar-03294.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = "/opt/cursor/artifacts";
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
check("ver", ver.sheet === "0.3.311" && ver.dmcc === "0.2.324");

const room = "barlight" + Date.now().toString(36);
const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 30000,
  args: ["--no-sandbox"]
});

function rectOf(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);
}
function sameBar(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2;
}
async function boot(page, role) {
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:8765/map/demo.html?role=" + role + "&room=" + room, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.map && window.map.tokenScreen, { timeout: 15000 });
}
async function nudge(page, id) {
  await page.evaluate((id) => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const p = window.map.tokenScreen(id);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const fire = (type, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, button: 1, buttons, bubbles: true, pointerId: 1
    }));
    fire("pointerdown", cx, cy, 4);
    fire("pointermove", cx + (cx - p.x), cy + (cy - p.y), 4);
    fire("pointerup", cx + (cx - p.x), cy + (cy - p.y), 0);
  }, id);
}

const dm = await browser.newPage();
await boot(dm, "dm");
await dm.select('[data-act="ambientSel"]', "dark");
await dm.evaluate(() => window.map.placePartyToken({ pos: { x: 14, y: 8 }, label: "Camp" }));
await new Promise((r) => setTimeout(r, 50));
const dmToast = await dm.evaluate(() => {
  const t = document.querySelector('[data-act="toast"]');
  if (!t || t.style.display === "none") return "";
  return t.textContent || "";
});
check("dm.toast", !/carrying a light/.test(dmToast), dmToast);
const party = await dm.evaluate(() => {
  const t = window.map.tokenBoxes().find((b) => b.kind === "party" || b.label === "Camp");
  return t ? { id: t.id, x: t.x, y: t.y } : null;
});
check("party.placed", !!party, JSON.stringify(party));
const jp = await dm.evaluate(() => window.map.tokenBoxes().find((b) => b.label === "JP").id);
await nudge(dm, jp);
const screen = await dm.evaluate((id) => window.map.tokenScreen(id), jp);
await dm.mouse.click(screen.x, screen.y);
await dm.waitForSelector('[data-act="drawer"]', { timeout: 4000 });
const before = await rectOf(dm, '[data-act="drawer"]');
await dm.click('[data-act="dmEditBtn"]');
const live = await dm.evaluate((id) => window.map.tokenScreen(id), jp);
await dm.mouse.move(live.x, live.y);
await dm.mouse.down();
const during = [];
for (const step of [40, 80, 120]) {
  await dm.mouse.move(live.x + step, live.y + 10, { steps: 4 });
  during.push(await rectOf(dm, '[data-act="drawer"]'));
}
await dm.screenshot({ path: path.join(out, "token-bar-drag-1280.png") });
await dm.mouse.up();
await new Promise((r) => setTimeout(r, 200));
const after = await rectOf(dm, '[data-act="drawer"]');
const moved = await dm.evaluate((id) => window.map.tokenPos(id), jp);
check("dm.bar.before", !!before && before.w > 40, JSON.stringify(before));
check("dm.bar.during", during.every((row) => sameBar(before, row)), JSON.stringify({ before, during }));
check("dm.bar.after", sameBar(before, after), JSON.stringify({ before, after }));
check("dm.moved", moved && (moved.x !== 11 || moved.y !== 1), JSON.stringify(moved));

const player = await browser.newPage();
await boot(player, "player");
await nudge(player, jp);
const pScreen = await player.evaluate((id) => window.map.tokenScreen(id), jp);
const pBefore = await rectOf(player, ".ssdns-playercard");
const moveBtn = await player.$('[data-act="tokenCmdMove"]');
if (!moveBtn) {
  await player.mouse.click(pScreen.x, pScreen.y);
  await new Promise((r) => setTimeout(r, 150));
}
const move = await player.$('[data-act="tokenCmdMove"]');
if (move) await move.click();
await player.mouse.move(pScreen.x, pScreen.y);
await player.mouse.down();
await player.mouse.move(pScreen.x + 70, pScreen.y, { steps: 4 });
const pDuring = await rectOf(player, ".ssdns-playercard");
await player.mouse.up();
await new Promise((r) => setTimeout(r, 200));
const pAfter = await rectOf(player, ".ssdns-playercard");
check("player.bar", !!pBefore && sameBar(pBefore, pDuring) && sameBar(pBefore, pAfter), JSON.stringify({ pBefore, pDuring, pAfter }));

const seen = await player.evaluate(() => {
  const camp = window.map.tokenBoxes().find((b) => b.label === "Camp" || b.kind === "party");
  if (!camp) return { camp: null };
  return {
    camp: { x: camp.x, y: camp.y },
    here: window.map.squareShown(camp.x, camp.y, "p_jolene"),
    near: window.map.squareShown(camp.x + 1, camp.y, "p_jolene"),
    far: window.map.squareShown(camp.x, camp.y + 20, "p_jolene")
  };
});
check("player.sees", !!(seen.camp && seen.here && seen.near && !seen.far), JSON.stringify(seen));
const playerToast = await player.evaluate(() => {
  const t = document.querySelector('[data-act="toast"]');
  if (!t || t.style.display === "none") return "";
  return t.textContent || "";
});
check("player.toast", !/carrying a light/.test(playerToast), playerToast);
if (seen.camp) {
  const id = await player.evaluate(() => window.map.tokenBoxes().find((b) => b.label === "Camp" || b.kind === "party").id);
  await nudge(player, id);
  const at = await player.evaluate((id) => window.map.tokenScreen(id), id);
  await player.evaluate((x, y) => {
    const canvas = document.querySelector("canvas");
    for (let i = 0; i < 5; i++) {
      canvas.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY: 240, bubbles: true, cancelable: true }));
    }
  }, at.x, at.y);
}
await player.screenshot({ path: path.join(out, "party-light-player-1280.png") });

await browser.close();
if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ntoken bar ok");

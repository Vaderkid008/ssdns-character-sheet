/**
 * A drag ends when the button comes up, wherever the pointer is.
 * Real mouse. Sheet 0.3.297 / DMCC 0.2.310.
 *   node tools/test-drag-release-03296.mjs
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
check("ver", ver.sheet === "0.3.297" && ver.dmcc === "0.2.310");

function samePos(a, b) {
  return !!(a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
}
async function rect(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);
}
async function boot(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { window.confirm = () => false; });
  await page.waitForFunction(() => window.map && window.map.tokenScreen, { timeout: 20000 });
}
async function centerToken(page, id) {
  for (let i = 0; i < 6; i++) {
    const spot = await page.evaluate((id) => {
      const p = window.map.tokenScreen(id);
      const top = document.elementFromPoint(p.x, p.y);
      return { x: p.x, y: p.y, canvas: !!(top && top.tagName === "CANVAS") };
    }, id);
    if (spot.canvas && spot.y > 80 && spot.x > 40) return spot;
    await page.evaluate((id) => {
      const canvas = document.querySelector("canvas");
      const box = canvas.getBoundingClientRect();
      const p = window.map.tokenScreen(id);
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const fire = (type, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
        clientX: x, clientY: y, button: 1, buttons, bubbles: true, pointerId: 1
      }));
      fire("pointerdown", cx, cy, 4);
      fire("pointermove", cx + (cx - p.x), cy + (cy - p.y), 4);
      fire("pointerup", cx + (cx - p.x), cy + (cy - p.y), 0);
    }, id);
  }
  return page.evaluate((id) => window.map.tokenScreen(id), id);
}
async function barPoint(page, sel) {
  return page.evaluate((sel) => {
    const bar = document.querySelector(sel + " [data-float-drag]");
    if (!bar) return null;
    const r = bar.getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  }, sel);
}
/** Drag, release, then move again. The rect at release must match the rect after the extra move. */
async function releaseThenMove(page, from, to, extra) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 40));
  const dropped = await rect(page, from.sel);
  await page.mouse.move(extra.x, extra.y, { steps: 5 });
  await new Promise((r) => setTimeout(r, 40));
  const later = await rect(page, from.sel);
  return { dropped, later };
}

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 40000,
  args: ["--no-sandbox"]
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  const tag = viewport.width + "x" + viewport.height;
  const room = "dragrel" + tag + Date.now().toString(36);
  const dm = await browser.newPage();
  await dm.setViewport(viewport);
  dm.on("pageerror", (err) => console.log("pageerror", err.message));
  await boot(dm, "http://127.0.0.1:8765/map/demo.html?role=dm&room=" + room);
  const jp = await dm.evaluate(() => window.map.tokenBoxes().find((b) => b.label === "JP").id);
  const at = await centerToken(dm, jp);
  await dm.mouse.click(at.x, at.y);
  await dm.waitForSelector('[data-act="tokenCmd"]', { timeout: 4000 });
  const bar = await barPoint(dm, '[data-act="tokenCmd"]');
  const opened = await rect(dm, '[data-act="tokenCmd"]');
  if (tag === "1280x800") await dm.screenshot({ path: "/opt/cursor/artifacts/drag-release-before-1280.png" });

  await dm.mouse.move(bar.x, bar.y);
  await dm.mouse.down();
  await dm.mouse.up();
  await dm.mouse.move(bar.x + 90, bar.y + 40, { steps: 4 });
  const afterClick = await rect(dm, '[data-act="tokenCmd"]');
  check("dm.menu.click." + tag, samePos(opened, afterClick), JSON.stringify({ opened, afterClick }));

  const overMenu = await releaseThenMove(
    dm,
    { x: bar.x, y: bar.y, sel: '[data-act="tokenCmd"]' },
    { x: bar.x + 24, y: bar.y + 8 },
    { x: bar.x + 160, y: bar.y + 80 }
  );
  check("dm.menu.upOnMenu." + tag, samePos(overMenu.dropped, overMenu.later), JSON.stringify(overMenu));

  const bar2 = await barPoint(dm, '[data-act="tokenCmd"]');
  const overMap = await releaseThenMove(
    dm,
    { x: bar2.x, y: bar2.y, sel: '[data-act="tokenCmd"]' },
    { x: Math.max(80, bar2.x - 180), y: bar2.y + 30 },
    { x: 200, y: 200 }
  );
  check("dm.menu.upOnMap." + tag, samePos(overMap.dropped, overMap.later), JSON.stringify(overMap));

  const bar3 = await barPoint(dm, '[data-act="tokenCmd"]');
  const outside = await releaseThenMove(
    dm,
    { x: bar3.x, y: bar3.y, sel: '[data-act="tokenCmd"]' },
    { x: 8, y: 8 },
    { x: 240, y: 280 }
  );
  check("dm.menu.upOutside." + tag, samePos(outside.dropped, outside.later), JSON.stringify(outside));
  if (tag === "1280x800") await dm.screenshot({ path: "/opt/cursor/artifacts/drag-release-after-1280.png" });

  await dm.evaluate(() => window.map.pinLootChest({
    id: "rel-chest", name: "Chest", boxType: "chest", contents: [], cash: { es: 0 },
    lock: { dc: 15, unlocked: true, attempts: {}, forceAttempts: {}, allowRetries: true }
  }, { x: 14, y: 8 }));
  await dm.waitForSelector('[data-act="dmChest"] [data-float-drag]', { timeout: 4000 });
  const chestBar = await barPoint(dm, '[data-act="dmChest"]');
  const chestDrag = await releaseThenMove(
    dm,
    { x: chestBar.x, y: chestBar.y, sel: '[data-act="dmChest"]' },
    { x: chestBar.x - 30, y: chestBar.y + 16 },
    { x: chestBar.x + 120, y: chestBar.y + 90 }
  );
  check("dm.chestMenu." + tag, samePos(chestDrag.dropped, chestDrag.later), JSON.stringify(chestDrag));

  const chestId = await dm.evaluate(() => window.map.tokenBoxes().find((b) => b.kind === "chest").id);
  const chestAt = await centerToken(dm, chestId);
  const before = await dm.evaluate((id) => window.map.tokenPos(id), chestId);
  await dm.mouse.move(chestAt.x, chestAt.y);
  await dm.mouse.down();
  await dm.mouse.move(chestAt.x + 90, chestAt.y + 20, { steps: 6 });
  await dm.mouse.up();
  await new Promise((r) => setTimeout(r, 50));
  const droppedTok = await dm.evaluate((id) => window.map.tokenPos(id), chestId);
  await dm.mouse.move(chestAt.x + 220, chestAt.y + 140, { steps: 5 });
  await new Promise((r) => setTimeout(r, 40));
  const laterTok = await dm.evaluate((id) => window.map.tokenPos(id), chestId);
  check("dm.chestToken." + tag, droppedTok && laterTok && droppedTok.x === laterTok.x && droppedTok.y === laterTok.y && (droppedTok.x !== before.x || droppedTok.y !== before.y), JSON.stringify({ before, droppedTok, laterTok }));
  await dm.close();

  const player = await browser.newPage();
  await player.setViewport(viewport);
  player.on("pageerror", (err) => console.log("player", err.message));
  await boot(player, "http://127.0.0.1:8765/map/demo.html?role=player&room=" + room);
  const pid = await player.evaluate(() => {
    const boxes = window.map.tokenBoxes();
    const own = boxes.find((b) => b.ownerUid === "p_jolene") || boxes.find((b) => b.label === "JP");
    return own.id;
  });
  const ps = await centerToken(player, pid);
  await player.mouse.click(ps.x, ps.y);
  await player.waitForSelector('[data-act="tokenCmd"]', { timeout: 4000 }).catch(() => {});
  const pBar = await barPoint(player, '[data-act="tokenCmd"]');
  if (pBar) {
    const pMenu = await releaseThenMove(
      player,
      { x: pBar.x, y: pBar.y, sel: '[data-act="tokenCmd"]' },
      { x: pBar.x + 20, y: pBar.y + 6 },
      { x: pBar.x + 140, y: pBar.y + 70 }
    );
    check("player.menu." + tag, samePos(pMenu.dropped, pMenu.later), JSON.stringify(pMenu));
  } else check("player.menu." + tag, false, "no token menu");
  const move = await player.$('[data-act="tokenCmdMove"]');
  if (move) await move.click();
  const origin = await player.evaluate((id) => window.map.tokenPos(id), pid);
  const live = await centerToken(player, pid);
  await player.mouse.move(live.x, live.y);
  await player.mouse.down();
  await player.mouse.move(live.x + 70, live.y + 36, { steps: 5 });
  await player.mouse.up();
  await new Promise((r) => setTimeout(r, 50));
  const walked = await player.evaluate((id) => window.map.tokenPos(id), pid);
  await player.mouse.move(live.x + 180, live.y + 120, { steps: 4 });
  const stayed = await player.evaluate((id) => window.map.tokenPos(id), pid);
  check("player.move." + tag, walked && stayed && walked.x === stayed.x && walked.y === stayed.y, JSON.stringify({ origin, walked, stayed }));
  await player.close();
}

await browser.close();
if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndrag release ok");

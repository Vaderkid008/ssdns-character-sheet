/**
 * Clean 1280px shots for the door and chest review.
 *   node tools/shot-door-review-03293.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = "/opt/cursor/artifacts";
const room = "doorreview" + Date.now().toString(36);
const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 20000,
  args: ["--no-sandbox"]
});

async function boot(page, role) {
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:8765/map/demo.html?role=" + role + "&room=" + room, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.map && window.map.tokenScreen, { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 200));
}
function geom(page, south, north) {
  return page.evaluate((south, north) => {
    const a = window.map.tokenPos(south);
    const b = window.map.tokenPos(north);
    const as = window.map.tokenScreen(south);
    const bs = window.map.tokenScreen(north);
    const gx = Math.abs(b.x - a.x);
    const gy = Math.abs(b.y - a.y);
    const cell = gx ? Math.abs(bs.x - as.x) / gx : Math.abs(bs.y - as.y) / Math.max(1, gy);
    return { a, b, as, bs, cell };
  }, south, north);
}
function nudge(page, id) {
  return page.evaluate((id) => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const p = window.map.tokenScreen(id);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - p.x;
    const dy = cy - p.y;
    const down = (x, y, button, buttons) => canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: x, clientY: y, button, buttons, bubbles: true, pointerId: 1 }));
    const move = (x, y, buttons) => canvas.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, button: 1, buttons, bubbles: true, pointerId: 1 }));
    const up = (x, y) => canvas.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y, button: 1, buttons: 0, bubbles: true, pointerId: 1 }));
    down(cx, cy, 1, 4);
    move(cx + dx, cy + dy, 4);
    up(cx + dx, cy + dy);
    const next = window.map.tokenScreen(id);
    return { before: p, after: next };
  }, id);
}
function zoomAt(page, x, y, times) {
  return page.evaluate((x, y, times) => {
    const canvas = document.querySelector("canvas");
    for (let i = 0; i < times; i++) {
      canvas.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY: -180, bubbles: true, cancelable: true }));
    }
    return document.querySelector('[data-act="zoomLabel"]').textContent;
  }, x, y, times);
}
function stroke(page, points) {
  return page.evaluate((points) => {
    const canvas = document.querySelector("canvas");
    const fire = (type, p, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
      clientX: p.x, clientY: p.y, button: 0, buttons, bubbles: true, pointerId: 1
    }));
    fire("pointerdown", points[0], 1);
    points.slice(1).forEach((p) => fire("pointermove", p, 1));
    fire("pointerup", points[points.length - 1], 0);
  }, points);
}

const dm = await browser.newPage();
await boot(dm, "dm");
const ids = await dm.evaluate(() => {
  const south = window.map.placeLinkedToken({ name: "South", label: "South", kind: "npc", at: { x: 10, y: 8 } });
  const spos = window.map.tokenPos(south.id);
  const north = window.map.placeLinkedToken({ name: "North", label: "North", kind: "npc", at: { x: spos.x, y: spos.y + 1 } });
  return { south: south.id, north: north.id };
});
let g = await geom(dm, ids.south, ids.north);
console.log("placed", JSON.stringify(g));
for (let i = 0; i < 4; i++) {
  const moved = await nudge(dm, ids.south);
  console.log("nudge", i, JSON.stringify(moved));
  g = await geom(dm, ids.south, ids.north);
  if (g.as.x > 200 && g.as.x < 1000 && g.as.y > 120 && g.as.y < 640) break;
}
if (g.cell < 50 && g.cell > 5) {
  console.log("zoom", await zoomAt(dm, (g.as.x + g.bs.x) / 2, (g.as.y + g.bs.y) / 2, 3));
  g = await geom(dm, ids.south, ids.north);
}
console.log("on screen", JSON.stringify(g));
if (g.b.y === g.a.y) {
  await dm.click('[data-act="dmEditBtn"]');
  await stroke(dm, [
    g.bs,
    { x: g.as.x, y: g.as.y + g.cell },
    { x: g.as.x, y: g.as.y + g.cell }
  ]);
  await dm.click('[data-act="dmEditBtn"]');
  g = await geom(dm, ids.south, ids.north);
  console.log("dragged", JSON.stringify(g));
}
const point = (gx, gy) => ({
  x: g.as.x + (gx - (g.a.x + 0.5)) * g.cell,
  y: g.as.y + (gy - (g.a.y + 0.5)) * g.cell
});
const edgeY = Math.min(g.a.y, g.b.y) + 1;
await dm.click('[data-act="wallBtn"]');
await stroke(dm, [point(g.a.x - 1, edgeY), point(g.a.x + 2, edgeY)]);
await dm.click('[data-act="doorBtn"]');
await stroke(dm, [point(g.a.x + 0.5, edgeY)]);
await dm.click('[data-act="doorBtn"]');
const mid = { x: (g.as.x + g.bs.x) / 2, y: (g.as.y + g.bs.y) / 2 };
let gap = "";
console.log("tool", await dm.$eval('[data-act="doorBtn"]', (el) => el.className));
let found = false;
for (const dx of [0, 15, 30, -15, -30]) {
  for (const dy of [0, -10, 10]) {
    await dm.mouse.click(mid.x + dx, mid.y + dy);
    await new Promise((r) => setTimeout(r, 40));
    gap = await dm.evaluate(() => {
      const menu = document.querySelector('[data-act="doorMenu"]');
      const cmd = document.querySelector('[data-act="tokenCmd"]');
      if (menu && !menu.hidden) {
        const lock = menu.querySelector('[data-door="lock"]');
        if (lock) lock.click();
        return "DOOR " + menu.textContent.replace(/\s+/g, " ").slice(0, 120);
      }
      return "cmd=" + !!(cmd && !cmd.hidden);
    });
    if (gap.indexOf("DOOR") === 0) { console.log("gap", dx, dy, gap); found = true; break; }
    await dm.evaluate(() => {
      const cmd = document.querySelector('[data-act="tokenCmd"]');
      if (cmd) cmd.remove();
    });
  }
  if (found) break;
}
await dm.evaluate(() => {
  const menu = document.querySelector('[data-act="doorMenu"]');
  if (menu) menu.hidden = true;
});
await dm.screenshot({ path: "/tmp/door-gap.png" });
await browser.close();
process.exit(0);

const player = await browser.newPage();
await boot(player, "player");
await player.addScriptTag({ path: path.join(root, "assets/js/loot.js") });
const who = await player.evaluate(() => {
  const boxes = window.map.tokenBoxes().map((b) => b.label + "@" + b.x + "," + b.y);
  const t = window.map.tokenBoxes().find((b) => b.label === "JP" || b.kind === "player");
  return { boxes, token: t ? { id: t.id, x: t.x, y: t.y } : null };
});
console.log("player", JSON.stringify(who));
if (!who.token) throw new Error("no JP");
for (let i = 0; i < 4; i++) await nudge(player, who.token.id);
const mine = await player.evaluate((id) => window.map.tokenScreen(id), who.token.id);
if (mine.y < 80 || mine.y > 700) await zoomAt(player, mine.x, Math.min(700, Math.max(80, mine.y)), 2);
const jp = await player.evaluate((id) => {
  const pos = window.map.tokenPos(id);
  const screen = window.map.tokenScreen(id);
  const other = window.map.tokenBoxes().find((b) => b.id !== id);
  const os = window.map.tokenScreen(other.id);
  const cell = Math.hypot(os.x - screen.x, os.y - screen.y) / Math.max(1, Math.hypot(other.x - pos.x, other.y - pos.y));
  return { pos, screen, cell };
}, who.token.id);
console.log("jp", JSON.stringify(jp));
const jpoint = (gx, gy) => ({
  x: jp.screen.x + (gx - (jp.pos.x + 0.5)) * jp.cell,
  y: jp.screen.y + (gy - (jp.pos.y + 0.5)) * jp.cell
});
await dm.evaluate(() => {});
const dmJp = await dm.evaluate((at) => {
  const hit = window.map.tokenBoxes().find((b) => b.label === "JP") || window.map.tokenBoxes().find((b) => b.x === at.x && b.y === at.y);
  if (!hit) return null;
  const pos = window.map.tokenPos(hit.id);
  const screen = window.map.tokenScreen(hit.id);
  const other = window.map.tokenBoxes().find((b) => b.id !== hit.id);
  const os = window.map.tokenScreen(other.id);
  const cell = Math.hypot(os.x - screen.x, os.y - screen.y) / Math.max(1, Math.hypot(other.x - pos.x, other.y - pos.y));
  return { id: hit.id, pos, screen, cell };
}, who.token);
console.log("dmJp", JSON.stringify(dmJp));
for (let i = 0; i < 4; i++) await nudge(dm, dmJp.id);
const dmJp2 = await dm.evaluate((id) => {
  const pos = window.map.tokenPos(id);
  const screen = window.map.tokenScreen(id);
  const other = window.map.tokenBoxes().find((b) => b.id !== id);
  const os = window.map.tokenScreen(other.id);
  const cell = Math.hypot(os.x - screen.x, os.y - screen.y) / Math.max(1, Math.hypot(other.x - pos.x, other.y - pos.y));
  return { pos, screen, cell };
}, dmJp.id);
const dp = (gx, gy) => ({
  x: dmJp2.screen.x + (gx - (dmJp2.pos.x + 0.5)) * dmJp2.cell,
  y: dmJp2.screen.y + (gy - (dmJp2.pos.y + 0.5)) * dmJp2.cell
});
await dm.click('[data-act="wallBtn"]');
await stroke(dm, [dp(dmJp2.pos.x - 1, dmJp2.pos.y), dp(dmJp2.pos.x + 2, dmJp2.pos.y)]);
await dm.click('[data-act="doorBtn"]');
await stroke(dm, [dp(dmJp2.pos.x + 0.5, dmJp2.pos.y)]);
await dm.click('[data-act="doorBtn"]');
await stroke(dm, [dp(dmJp2.pos.x + 0.5, dmJp2.pos.y - 0.12)]);
await new Promise((r) => setTimeout(r, 200));
const locked = await dm.evaluate(() => {
  const btn = document.querySelector('[data-door="lock"]');
  if (btn) btn.click();
  return !!btn;
});
console.log("locked", locked);
await new Promise((r) => setTimeout(r, 250));
await stroke(player, [jpoint(jp.pos.x + 0.5, jp.pos.y - 0.12)]);
await new Promise((r) => setTimeout(r, 200));
const doorText = await player.evaluate(() => {
  const menu = document.querySelector('[data-act="doorMenu"]');
  return menu && !menu.hidden ? menu.textContent.replace(/\s+/g, " ") : "";
});
console.log("door", doorText.slice(0, 180));
await player.screenshot({ path: path.join(out, "door-player-lock-1280.png") });

await dm.evaluate((at) => {
  window.map.pinLootChest({
    id: "loot-chest", name: "Chest", boxType: "chest",
    contents: [{ id: "rope", name: "Rope", qty: 1, taken: false }],
    cash: { es: 0 },
    lock: { dc: 10, unlocked: false, attempts: {}, forceAttempts: {}, allowRetries: true, forceDc: 15 }
  }, { x: at.x + 1, y: at.y });
}, who.token);
await player.waitForFunction(() => window.map.tokenBoxes().some((b) => b.kind === "chest"), { timeout: 8000 });
const chestId = await player.evaluate(() => window.map.tokenBoxes().find((b) => b.kind === "chest").id);
await player.evaluate(() => {
  const menu = document.querySelector('[data-act="doorMenu"]');
  if (menu) menu.hidden = true;
  Math.random = () => 0.99;
});
for (let i = 0; i < 3; i++) await nudge(player, chestId);
const chest = await player.evaluate((id) => window.map.tokenScreen(id), chestId);
await player.mouse.click(chest.x, chest.y);
await player.waitForSelector('[data-chest="pick"]', { timeout: 4000 });
const pickBox = await (await player.$('[data-chest="pick"]')).boundingBox();
await player.mouse.click(pickBox.x + pickBox.width / 2, pickBox.y + pickBox.height / 2);
await player.waitForFunction(() => /Unlocked/.test((document.querySelector('[data-act="chestMenu"]') || {}).textContent || ""), { timeout: 9000 });
await player.evaluate(() => document.querySelectorAll(".d20-zoom, .d20-plain").forEach((node) => node.remove()));
const unlocked = await player.$eval('[data-act="chestMenu"]', (el) => {
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight, text: el.textContent.replace(/\s+/g, " ").slice(0, 160) };
});
console.log("unlocked", JSON.stringify(unlocked));
await player.screenshot({ path: path.join(out, "chest-unlocked-not-open.png") });
const openBox = await (await player.$('[data-chest="open"]')).boundingBox();
await player.mouse.click(openBox.x + 16, openBox.y + openBox.height / 2);
await player.waitForFunction(() => /Take Rope/.test((document.querySelector('[data-act="chestMenu"]') || {}).textContent || ""), { timeout: 4000 });
await player.screenshot({ path: path.join(out, "chest-opened-loot.png") });
await browser.close();
console.log("shots written");

/** Player Pick lock / Force. node tools/shot-player-door-03293.mjs */
import puppeteer from "/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";

const room = "jpdoor" + Date.now().toString(36);
const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox"]
});
async function boot(page, role) {
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:8765/map/demo.html?role=" + role + "&room=" + room, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.map && window.map.tokenPos, { timeout: 15000 });
}
async function drag(page, a, b) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
}
const dm = await browser.newPage();
await boot(dm, "dm");
const south = await dm.evaluate(() => {
  const tok = window.map.placeLinkedToken({ name: "South", label: "South", kind: "npc", at: { x: 10, y: 8 } });
  const pos = window.map.tokenPos(tok.id);
  const screen = window.map.tokenScreen(tok.id);
  const other = window.map.tokenBoxes().find((b) => b.id !== tok.id);
  const os = window.map.tokenScreen(other.id);
  const cell = Math.hypot(os.x - screen.x, os.y - screen.y) / Math.max(1, Math.hypot(other.x - pos.x, other.y - pos.y));
  return { id: tok.id, pos, screen, cell };
});
console.log("south", JSON.stringify(south));
await dm.evaluate((id) => {
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const p = window.map.tokenScreen(id);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const fire = (type, x, y, buttons) => canvas.dispatchEvent(new PointerEvent(type, {
    clientX: x, clientY: y, button: 1, buttons, bubbles: true, pointerId: 1
  }));
  fire("pointerdown", cx, cy, 4);
  fire("pointermove", cx + (cx - p.x) * 0.8, cy + (cy - p.y) * 0.8, 4);
  fire("pointerup", cx + (cx - p.x) * 0.8, cy + (cy - p.y) * 0.8, 0);
}, south.id);
south.screen = await dm.evaluate((id) => window.map.tokenScreen(id), south.id);
console.log("south moved", south.screen);
const pt = (gx, gy) => ({
  x: south.screen.x + (gx - (south.pos.x + 0.5)) * south.cell,
  y: south.screen.y + (gy - (south.pos.y + 0.5)) * south.cell
});
const lineY = south.screen.y + south.cell;
await dm.click('[data-act="wallBtn"]');
await drag(dm, { x: south.screen.x - south.cell, y: lineY }, { x: south.screen.x + south.cell * 2, y: lineY });
await dm.click('[data-act="doorBtn"]');
await dm.mouse.click(south.screen.x, lineY);
await dm.click('[data-act="doorBtn"]');
let dmText = "";
for (const dy of [8, 14, 22, 30]) {
  await dm.mouse.click(south.screen.x, lineY + dy);
  await new Promise((r) => setTimeout(r, 50));
  dmText = await dm.evaluate(() => {
    const menu = document.querySelector('[data-act="doorMenu"]');
    if (!menu || menu.hidden) return "";
    const lock = menu.querySelector('[data-door="lock"]');
    if (lock) lock.click();
    return menu.textContent.replace(/\s+/g, " ").slice(0, 120);
  });
  console.log("dy", dy, dmText);
  if (/Lock/.test(dmText)) break;
}
console.log("dm", dmText);
await dm.evaluate(() => {
  const jp = window.map.tokenBoxes().find((b) => b.label === "JP");
  if (!jp) return;
  const btn = document.querySelector('[data-act="dmEditBtn"]');
  if (btn) btn.click();
});
const jp = await dm.evaluate(() => {
  const t = window.map.tokenBoxes().find((b) => b.label === "JP");
  return { id: t.id, screen: window.map.tokenScreen(t.id), pos: window.map.tokenPos(t.id) };
});
const dest = pt(south.pos.x, south.pos.y);
await drag(dm, jp.screen, dest);
await dm.click('[data-act="dmEditBtn"]');
const jpPos = await dm.evaluate((id) => window.map.tokenPos(id), jp.id);
console.log("jp moved", jpPos);

const player = await browser.newPage();
await boot(player, "player");
const click = await player.evaluate((id) => {
  const me = window.map.tokenBoxes().find((b) => b.id === id) || window.map.tokenBoxes().find((b) => b.label === "JP");
  const s = window.map.tokenScreen(me.id);
  const other = window.map.tokenBoxes().find((b) => b.label === "CM");
  const o = window.map.tokenScreen(other.id);
  const cell = Math.abs(o.x - s.x) / Math.max(1, Math.abs(other.x - me.x)) || 40;
  return { x: s.x, y: s.y - cell * 0.62, sx: s.x, sy: s.y, cell, pos: { x: me.x, y: me.y } };
}, jp.id);
console.log("click", click);
if (click.x > 40 && click.x < 1240 && click.y > 40 && click.y < 760) await player.mouse.click(click.x, click.y);
await new Promise((r) => setTimeout(r, 250));
const text = await player.evaluate(() => {
  const menu = document.querySelector('[data-act="doorMenu"]');
  if (!menu || menu.hidden) {
    const t = document.querySelector('[data-act="toast"]');
    return "TOAST " + (t ? t.textContent.replace(/\s+/g, " ").slice(0, 120) : "");
  }
  return menu.textContent.replace(/\s+/g, " ").slice(0, 180);
});
console.log(text);
await player.screenshot({ path: "/opt/cursor/artifacts/door-player-lock-1280.png" });
await browser.close();

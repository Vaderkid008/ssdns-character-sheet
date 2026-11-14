/**
 * Open menus stay where they opened.
 * Real mouse, 1280x800 and 1600x900. Sheet 0.3.308 / DMCC 0.2.321.
 *   node tools/test-menu-stability-03295.mjs
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
check("ver", ver.sheet === "0.3.308" && ver.dmcc === "0.2.321");

function samePos(a, b) {
  return !!(a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1);
}
function sameBox(a, b) {
  return samePos(a, b) && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2;
}
async function rect(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, sel);
}
async function mark(page, sel) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.dataset.probe = "stay";
  }, sel);
}
async function stayed(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return !!(el && !el.hidden && el.dataset.probe === "stay");
  }, sel);
}
async function boot(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { window.confirm = () => false; window.alert = () => {}; });
  await page.waitForFunction(() => window.map && window.map.tokenScreen, { timeout: 20000 });
}
async function centerToken(page, id) {
  for (let i = 0; i < 6; i++) {
    const spot = await page.evaluate((id) => {
      const p = window.map.tokenScreen(id);
      const top = document.elementFromPoint(p.x, p.y);
      return { x: p.x, y: p.y, canvas: !!(top && (top.tagName === "CANVAS" || (top.closest && top.closest("canvas")))) };
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
async function zoomAt(page, x, y) {
  await page.evaluate((x, y) => {
    const canvas = document.querySelector("canvas");
    canvas.dispatchEvent(new WheelEvent("wheel", { clientX: x, clientY: y, deltaY: -180, bubbles: true, cancelable: true }));
  }, x, y);
  await new Promise((r) => setTimeout(r, 40));
}

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 40000,
  args: ["--no-sandbox"]
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 1600, height: 900 }]) {
  const tag = viewport.width + "x" + viewport.height;
  const room = "menustable" + tag + Date.now().toString(36);
  const dm = await browser.newPage();
  await dm.setViewport(viewport);
  dm.on("pageerror", (err) => console.log("pageerror", (err.stack || err.message).split("\n").slice(0, 4).join(" | ")));
  await boot(dm, "http://127.0.0.1:8765/map/demo.html?role=dm&room=" + room);
  const jp = await dm.evaluate(() => window.map.tokenBoxes().find((b) => b.label === "JP").id);
  const at = await centerToken(dm, jp);
  const dmHit = await dm.evaluate((p) => {
    const top = document.elementFromPoint(p.x, p.y);
    return top ? top.tagName + "." + (top.getAttribute && (top.getAttribute("data-act") || top.className) || "") : "none";
  }, at);
  console.log("dm click", tag, JSON.stringify({ at, dmHit }));
  await dm.mouse.click(at.x, at.y);
  if (!await dm.$('[data-act="tokenCmd"]')) await dm.mouse.click(at.x, at.y + 8);
  await dm.waitForSelector('[data-act="tokenCmd"]', { timeout: 2000 }).catch(() => {});
  await mark(dm, '[data-act="tokenCmd"]');
  const opened = await rect(dm, '[data-act="tokenCmd"]');
  if (tag === "1280x800" && opened) await dm.screenshot({ path: "/opt/cursor/artifacts/menu-stable-before-1280.png" });
  const move = await dm.$('[data-act="tokenCmdMove"]');
  if (move) await move.click();
  await zoomAt(dm, at.x, at.y);
  const dragged = await dm.evaluate((id) => window.map.tokenScreen(id), jp);
  await dm.mouse.move(dragged.x + 24, dragged.y);
  await dm.mouse.move(dragged.x, dragged.y);
  await dm.mouse.down();
  await dm.mouse.move(dragged.x + 64, dragged.y + 36, { steps: 5 });
  await dm.mouse.up();
  await new Promise((r) => setTimeout(r, 80));
  const after = await rect(dm, '[data-act="tokenCmd"]');
  check("dm.token." + tag, sameBox(opened, after) && await stayed(dm, '[data-act="tokenCmd"]'), JSON.stringify({ opened, after }));
  if (tag === "1280x800") await dm.screenshot({ path: "/opt/cursor/artifacts/menu-stable-after-1280.png" });

  const drawer = await rect(dm, '[data-act="drawer"]');
  await mark(dm, '[data-act="drawer"]');
  const name = await dm.$('[data-act="drawer"] input');
  if (name) {
    await name.click();
    await dm.keyboard.type("a");
  }
  const drawerAfter = await rect(dm, '[data-act="drawer"]');
  check("dm.drawer." + tag, drawer && samePos(drawer, drawerAfter) && await stayed(dm, '[data-act="drawer"]'), JSON.stringify({ drawer, drawerAfter }));

  const zone = await rect(dm, '[data-act="zonePlace"]');
  const zoneSel = await dm.$('[data-act="zoneSpell"]');
  if (zoneSel) await zoneSel.select("wall").catch(async () => { await zoneSel.press("ArrowDown"); });
  const zoneAfter = await rect(dm, '[data-act="zonePlace"]');
  check("dm.zone." + tag, !zone || samePos(zone, zoneAfter), JSON.stringify({ zone, zoneAfter }));

  const strip = await rect(dm, ".ssm-turnstrip");
  const challenge = await dm.$('[data-act="stripChallenge"]');
  if (challenge) await challenge.click();
  const stripAfter = await rect(dm, ".ssm-turnstrip");
  check("dm.initiative." + tag, !strip || samePos(strip, stripAfter), JSON.stringify({ strip, stripAfter }));

  await dm.evaluate(() => window.map.pinLootChest({
    id: "stable-chest", name: "Chest", boxType: "chest", contents: [], cash: { es: 0 },
    lock: { dc: 15, unlocked: true, attempts: {}, forceAttempts: {}, allowRetries: false }
  }, { x: 12, y: 6 }));
  await dm.waitForSelector('[data-act="dmChest"]', { timeout: 4000 });
  await mark(dm, '[data-act="dmChest"]');
  const chest = await rect(dm, '[data-act="dmChest"]');
  const search = await dm.$('[data-dm="search"]');
  if (search) {
    await search.click();
    await dm.keyboard.type("rope");
  }
  const chestFocus = await dm.evaluate(() => {
    const el = document.activeElement;
    return !!(el && el.getAttribute && el.getAttribute("data-dm") === "search");
  });
  const retry = await dm.$('[data-dm="retry"]');
  if (retry) await retry.click();
  const chestAfter = await rect(dm, '[data-act="dmChest"]');
  check("dm.chest." + tag, sameBox(chest, chestAfter) && chestFocus && await stayed(dm, '[data-act="dmChest"]'), JSON.stringify({ chest, chestAfter, chestFocus }));

  const doorHit = await dm.evaluate(() => {
    const glyphs = window.map.doorGlyphs ? window.map.doorGlyphs() : [];
    const boxes = window.map.tokenBoxes().filter((b) => b.screen);
    const ref = boxes[0];
    if (!ref || !glyphs.length) return null;
    const canvas = document.querySelector("canvas");
    const box = canvas.getBoundingClientRect();
    const cell = (ref.screen.x2 - ref.screen.x1) / (ref.size || 1);
    for (const g of glyphs) {
      const gx = (Number(g.x1) + Number(g.x2)) / 2;
      const gy = (Number(g.y1) + Number(g.y2)) / 2;
      const x = box.left + ref.screen.x1 + (gx - ref.x) * cell;
      const y = box.top + ref.screen.y1 + (gy - ref.y) * cell;
      if (x < 80 || y < 80 || x > window.innerWidth - 80 || y > window.innerHeight - 80) continue;
      const top = document.elementFromPoint(x, y);
      if (top && top.tagName === "CANVAS") return { x, y };
    }
    return null;
  });
  if (doorHit) {
    await dm.mouse.click(doorHit.x, doorHit.y);
    await dm.waitForSelector('[data-act="doorMenu"]', { timeout: 2000 }).catch(() => {});
  }
  const door = await rect(dm, '[data-act="doorMenu"]');
  if (door) {
    await mark(dm, '[data-act="doorMenu"]');
    const dc = await dm.$('[data-door="lock-dc"]');
    if (dc) {
      await dc.click();
      await dm.keyboard.type("6");
    }
    const doorRetry = await dm.$('[data-door="retry"]');
    if (doorRetry) await doorRetry.click();
    await zoomAt(dm, doorHit.x, doorHit.y);
  }
  const doorAfter = await rect(dm, '[data-act="doorMenu"]');
  check("dm.door." + tag, !doorHit || (door && sameBox(door, doorAfter) && await stayed(dm, '[data-act="doorMenu"]')), JSON.stringify({ doorHit, door, doorAfter }));

  const jpBox = await dm.evaluate(() => window.map.tokenBoxes().find((b) => b.label === "JP"));
  await dm.evaluate((pos) => window.map.pinLootChest({
    id: "stable-choose", name: "Crate", boxType: "chest", contents: [], cash: { es: 0 },
    lock: { dc: 0, unlocked: true, attempts: {}, forceAttempts: {} }
  }, pos), { x: jpBox.x, y: jpBox.y });
  const again = await centerToken(dm, jp);
  await dm.mouse.click(again.x, again.y);
  await dm.waitForSelector('[data-act="chooseMenu"]', { timeout: 2000 }).catch(() => {});
  await mark(dm, '[data-act="chooseMenu"]');
  const choose = await rect(dm, '[data-act="chooseMenu"]');
  if (choose) {
    await dm.mouse.move(choose.x + 20, choose.y + 30);
    await zoomAt(dm, again.x, again.y);
  }
  const chooseAfter = await rect(dm, '[data-act="chooseMenu"]');
  check("dm.chooser." + tag, choose && sameBox(choose, chooseAfter) && await stayed(dm, '[data-act="chooseMenu"]'), JSON.stringify({ choose, chooseAfter }));

  await dm.addScriptTag({ path: path.join(root, "assets/js/roll-card.js") });
  await dm.evaluate(() => {
    window.SSDNSRollCard.setTiming({ spinMs: 40, holdMs: 8000 });
    window.SSDNSRollCard.setAudience("dm");
    window.SSDNSRollCard.show({ id: "stable-roll", name: "Jolene", label: "Lockpick", nat: 14, total: 18, dc: 15, success: true });
  });
  await new Promise((r) => setTimeout(r, 30));
  const roll = await rect(dm, '[data-roll-card="stable-roll"]');
  await new Promise((r) => setTimeout(r, 80));
  await dm.evaluate(() => window.SSDNSRollCard.show({ id: "stable-roll-2", name: "Marshal", label: "Force", nat: 8, total: 10, dc: 15, success: false }));
  const rollAfter = await rect(dm, '[data-roll-card="stable-roll"]');
  check("dm.roll." + tag, sameBox(roll, rollAfter), JSON.stringify({ roll, rollAfter }));
  await dm.evaluate(() => window.map.tokenBoxes().filter((b) => b.kind === "chest" || b.kind === "drop").forEach((b) => window.map.removeToken(b.id)));
  await dm.close();

  const player = await browser.newPage();
  await player.setViewport(viewport);
  player.on("pageerror", (err) => console.log("player pageerror", err.message));
  await boot(player, "http://127.0.0.1:8765/map/demo.html?role=player&room=" + room);
  const pid = await player.evaluate(() => {
    const boxes = window.map.tokenBoxes();
    const own = boxes.find((b) => b.ownerUid === "p_jolene") || boxes.find((b) => b.label === "JP");
    return own ? own.id : "";
  });
  const ps = pid ? await centerToken(player, pid) : null;
  if (ps) {
    const hit = await player.evaluate((p) => {
      const top = document.elementFromPoint(p.x, p.y);
      return top ? top.tagName + "." + (top.getAttribute && (top.getAttribute("data-act") || top.className) || "") : "none";
    }, ps);
    console.log("player click", tag, JSON.stringify({ ps, hit }));
    await player.mouse.click(ps.x, ps.y);
    if (!await player.$('[data-act="tokenCmd"]')) await player.mouse.click(ps.x, ps.y + 10);
  }
  await player.waitForSelector('[data-act="tokenCmd"]', { timeout: 4000 }).catch(() => {});
  await mark(player, '[data-act="tokenCmd"]');
  const pOpen = await rect(player, '[data-act="tokenCmd"]');
  const pMove = await player.$('[data-act="tokenCmdMove"]');
  if (pMove) await pMove.click();
  if (ps) {
    await player.mouse.move(ps.x + 50, ps.y + 20);
    await zoomAt(player, ps.x, ps.y);
  }
  const pAfter = await rect(player, '[data-act="tokenCmd"]');
  check("player.token." + tag, sameBox(pOpen, pAfter) && await stayed(player, '[data-act="tokenCmd"]'), JSON.stringify({ ps, pOpen, pAfter }));

  const card = await rect(player, '[data-act="playerCard"]');
  await mark(player, '[data-act="playerCard"]');
  const settings = await player.$('[data-act="playerSettings"] > summary');
  if (settings) await settings.click().catch(() => {});
  const label = await player.$('[data-act="playerLabel"]');
  if (label) {
    await label.click({ offset: { x: 8, y: 8 } }).catch(() => {});
    await player.keyboard.type("x");
  }
  const color = await player.$('[data-act="playerColorBtn"]');
  if (color) await color.evaluate((el) => { if (el.options && el.options[1]) el.value = el.options[1].value; el.dispatchEvent(new Event("change", { bubbles: true })); }).catch(() => {});
  const attack = await player.$('[data-act="playerAttack"]');
  if (attack) await attack.click().catch(() => {});
  const cardAfter = await rect(player, '[data-act="playerCard"]');
  const labelFocus = await player.evaluate(() => {
    const el = document.activeElement;
    return !!(el && el.getAttribute && el.getAttribute("data-act") === "playerLabel");
  });
  check("player.card." + tag, card && samePos(card, cardAfter) && await stayed(player, '[data-act="playerCard"]'), JSON.stringify({ card, cardAfter, labelFocus }));

  const pip = await player.$('[data-pip="reaction"]');
  if (pip) {
    await pip.click();
    const menu = await rect(player, "[data-pip-react-menu]");
    await player.mouse.move(10, 10);
    const menuAfter = await rect(player, "[data-pip-react-menu]");
    check("player.reaction." + tag, sameBox(menu, menuAfter), JSON.stringify({ menu, menuAfter }));
  } else check("player.reaction." + tag, true, "no reaction pip on the map demo");
  await player.close();
}

const dmPage = await browser.newPage();
await dmPage.setViewport({ width: 1280, height: 800 });
dmPage.on("pageerror", (err) => console.log("dmcc pageerror", err.message));
let dmReady = false;
try {
  await dmPage.goto("http://127.0.0.1:8765/dm/?demo=1", { waitUntil: "domcontentloaded", timeout: 20000 });
  await dmPage.waitForSelector("#btnLoadDemo", { timeout: 20000 });
  const entered = await dmPage.$("#mapMount canvas");
  if (!entered) {
    await dmPage.evaluate(() => { const b = document.querySelector("#btnLoadDemo"); if (b) b.click(); });
    await dmPage.waitForSelector("#mapMount canvas", { timeout: 20000 });
  }
  dmReady = true;
} catch (e) {
  check("dmcc.give", false, e.message);
}
if (dmReady) {
  await dmPage.evaluate(() => { const tab = document.querySelector("#tab-rewards"); if (tab) tab.click(); });
  await dmPage.waitForFunction(() => {
    const panel = document.querySelector("#panel-rewards");
    return panel && !panel.hidden;
  }, { timeout: 8000 }).catch(() => {});
  await dmPage.evaluate(() => {
    const mode = document.querySelector('[data-give-mode="item"]');
    if (mode) mode.click();
  });
  await dmPage.evaluate(() => {
    const field = document.querySelector("#giveCatalogSearch");
    if (field) field.scrollIntoView({ block: "center" });
  });
  const give = await rect(dmPage, "#panel-rewards");
  const wrap = await rect(dmPage, "#giveCatalogWrap");
  await dmPage.evaluate(() => {
    const field = document.querySelector("#giveCatalogSearch");
    if (field) field.focus();
  });
  await dmPage.keyboard.type("rope");
  const giveAfter = await rect(dmPage, "#panel-rewards");
  const wrapAfter = await rect(dmPage, "#giveCatalogWrap");
  const giveFocus = await dmPage.evaluate(() => document.activeElement && document.activeElement.id === "giveCatalogSearch");
  check("dmcc.give", give && samePos(give, giveAfter) && giveFocus, JSON.stringify({ give, giveAfter, giveFocus }));
  check("dmcc.give.catalog", wrap && samePos(wrap, wrapAfter), JSON.stringify({ wrap, wrapAfter }));
}
await dmPage.close();
await browser.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmenu stability ok");

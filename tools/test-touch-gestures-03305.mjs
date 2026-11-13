/**
 * Touch map gestures (sheet 0.3.306 / DMCC 0.2.319).
 * One finger pans, even on a token. A quick tap opens the token menu.
 * A press-and-hold then a drag moves a token the user controls.
 * Pinch zooms. A mouse drag on the desktop still selects instead of panning.
 *   node tools/test-touch-gestures-03305.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/usr/local/bin/google-chrome";
const OUT = "/opt/cursor/artifacts/touch-gestures";
const BASE = "http://127.0.0.1:8765";
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}

const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
check("ver.sheet", version.sheet === "0.3.306" && version.sheetBuild === "sheet-playtest-v03306");
check("ver.dmcc", version.dmcc === "0.2.319" && version.dmccBuild === "dmcc-playtest-v02319");
check("rules.clean", !fs.readFileSync(path.join(root, "assets/data/rules.js"), "utf8").includes("0.3.306") && !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("0.3.306"));
const css = fs.readFileSync(path.join(root, "map/ssdns-map.css"), "utf8");
check("css.callout", css.includes("-webkit-touch-callout: none") && css.includes("user-select: none"));

const seed = {
  "map/public/tokens/ply_ada": {
    value: { id: "ply_ada", kind: "player", name: "Ada", ownerUid: "ada", ownerCanMove: true, playerActive: true, sceneId: "scn_dustyspur01", size: 1, pos: { x: 10, y: 8 }, color: "#c9a227" },
    seq: 1, by: "test"
  },
  "map/public/tokens/foe1": {
    value: { id: "foe1", kind: "enemy", name: "Bandit", sceneId: "scn_dustyspur01", size: 1, pos: { x: 13, y: 8 }, color: "#8b3a3a" },
    seq: 1, by: "test"
  }
};

function near(a, b, slop) {
  return Math.abs(a - b) <= (slop == null ? 0.01 : slop);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + ".png"), timeout: 20000 });
}

async function cam(page) {
  return page.evaluate(() => window.SSDNSMapHost.camera());
}
async function pos(page, id) {
  return page.evaluate((tokenId) => window.SSDNSMapHost.tokenPos(tokenId), id);
}
async function center(page, id) {
  return page.evaluate((tokenId) => window.SSDNSMapHost.tokenScreen(tokenId), id);
}

function trail(x1, y1, x2, y2, steps) {
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    pts.push([{ x: Math.round(x1 + (x2 - x1) * i / steps), y: Math.round(y1 + (y2 - y1) * i / steps), id: 1 }]);
  }
  return pts;
}

async function oneFinger(page, x1, y1, x2, y2, hold, shotHold) {
  const moves = trail(x1, y1, x2, y2, 8).map((pts) => ({ pts }));
  const seq = [{ pts: [{ x: Math.round(x1), y: Math.round(y1), id: 1 }] }];
  if (hold) seq.push({ hold: true });
  seq.push(...moves, { end: true });
  const c = await page.context().newCDPSession(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: seq[0].pts });
  let sample = null;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i].hold) {
      const start = Date.now();
      while (Date.now() - start < hold) {
        await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(x1), y: Math.round(y1), id: 1 }] });
        await page.waitForTimeout(40);
      }
      sample = await page.evaluate(() => {
        const canvas = document.querySelector("#mapMount canvas");
        const style = canvas ? getComputedStyle(canvas) : null;
        return {
          kind: (document.querySelector("#mapMount") || {}).dataset.dragKind || "",
          lift: canvas && canvas.dataset.touchLift || "",
          sel: String(window.getSelection() || ""),
          userSelect: style ? style.userSelect : "",
          callout: style ? style.getPropertyValue("-webkit-touch-callout") : ""
        };
      });
      if (shotHold && sample.lift) await shot(page, shotHold);
    } else if (seq[i].end) {
      await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else {
      await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: seq[i].pts });
      await page.waitForTimeout(16);
      if (!sample && i === 3) {
        sample = await page.evaluate(() => {
          const canvas = document.querySelector("#mapMount canvas");
          const style = canvas ? getComputedStyle(canvas) : null;
          return {
            kind: (document.querySelector("#mapMount") || {}).dataset.dragKind || "",
            lift: canvas && canvas.dataset.touchLift || "",
            sel: String(window.getSelection() || ""),
            userSelect: style ? style.userSelect : "",
            callout: style ? style.getPropertyValue("-webkit-touch-callout") : ""
          };
        });
      }
    }
  }
  await c.detach();
  await page.waitForTimeout(80);
  return sample || {};
}

async function pinch(page, x, y, spread, gap) {
  const g0 = gap || 30;
  const c = await page.context().newCDPSession(page);
  const left = (d) => ({ x: Math.round(x - d), y: Math.round(y), id: 1 });
  const right = (d) => ({ x: Math.round(x + d), y: Math.round(y), id: 2 });
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [left(g0), right(g0)] });
  for (let i = 1; i <= 5; i++) {
    const d = g0 + spread * i / 5;
    await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [left(d), right(d)] });
    await page.waitForTimeout(20);
  }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  await page.waitForTimeout(80);
}

async function twoPan(page, x, y, dy) {
  const c = await page.context().newCDPSession(page);
  const pair = (ox, oy) => [
    { x: Math.round(x - 36 + ox), y: Math.round(y + oy), id: 1 },
    { x: Math.round(x + 36 + ox), y: Math.round(y + oy), id: 2 }
  ];
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pair(0, 0) });
  for (let i = 1; i <= 6; i++) {
    await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pair(0, dy * i / 6) });
    await page.waitForTimeout(16);
  }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  await page.waitForTimeout(80);
}

async function openPlayer(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((n) => n.close()));
  await page.evaluate((bag) => {
    window.SSDNSDmJoin = {
      isJoined: function () { return true; },
      live: function () { return { joined: true, roomCode: "LOCAL", uid: "ada", local: true, seed: bag }; }
    };
    window.SSDNSMapHost.syncRoom();
  }, seed);
  await page.waitForFunction(() => {
    const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes && window.SSDNSMapHost.tokenBoxes();
    return document.querySelector("#mapMount canvas") && boxes && boxes.some((t) => t.id === "ply_ada");
  }, null, { timeout: 8000 });
  await page.evaluate(() => document.querySelector("#tab-map").scrollIntoView({ inline: "center", block: "nearest" }));
  await page.locator("#tab-map").tap();
  await page.waitForFunction(() => document.body.classList.contains("map-phone"), null, { timeout: 4000 });
  await page.waitForTimeout(200);
}

async function openDm(page) {
  await page.goto(BASE + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await page.locator("#btnLoadDemo").click();
  await page.waitForFunction(() => document.body.classList.contains("in-room"), null, { timeout: 8000 });
  await page.locator("#tab-map").click();
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#mapMount canvas");
    return canvas && canvas.getBoundingClientRect().height > 80 && window.SSDNSMapHost;
  }, null, { timeout: 10000 });
  await page.evaluate(() => {
    const host = window.SSDNSMapHost;
    if (!host.tokenBoxes().some((t) => t && !t.story)) {
      host.placeToken({ name: "Ada", kind: "player", label: "Ada", size: 1, at: { x: 8, y: 6 }, ownerCanMove: true });
    }
    document.querySelector("#mapMount canvas").scrollIntoView({ block: "center", inline: "nearest" });
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#mapMount canvas");
    const r = canvas.getBoundingClientRect();
    const boxes = window.SSDNSMapHost.tokenBoxes().filter((t) => t && !t.story);
    return r.top >= 0 && r.bottom <= window.innerHeight && r.height > 80 && boxes.length > 0;
  }, null, { timeout: 8000 });
  await page.waitForTimeout(200);
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });

const iphone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
});
const player = await iphone.newPage();
player.on("pageerror", (err) => console.log("pageerror player", err.message));
await openPlayer(player);

const ada0 = await center(player, "ply_ada");
const foe0 = await center(player, "foe1");
const cam0 = await cam(player);
const blank = await player.evaluate(() => {
  const r = document.querySelector("#mapMount canvas").getBoundingClientRect();
  return { x: r.left + r.width * 0.5, y: r.top + 70 };
});
check("player.tokens", !!(ada0 && foe0 && ada0.x > 0), JSON.stringify({ ada0, foe0, blank }));

const empty = await oneFinger(player, blank.x, blank.y, blank.x, blank.y + 140, 0);
const camPan = await cam(player);
check("player.pan", Math.abs(camPan.y - cam0.y) > 8, "dy " + (camPan.y - cam0.y));
check("player.panKind", empty.kind === "pan", empty.kind);
check("player.noSelect", empty.sel === "" && empty.userSelect === "none" && (empty.callout === "none" || empty.callout === ""), JSON.stringify(empty));
await shot(player, "player-iphone-pan");

const adaPos0 = await pos(player, "ply_ada");
const short = await oneFinger(player, ada0.x, ada0.y, ada0.x + 48, ada0.y, 0);
const adaPos1 = await pos(player, "ply_ada");
const camShort = await cam(player);
check("player.shortKind", short.kind === "pan", short.kind);
check("player.shortStays", near(adaPos1.x, adaPos0.x) && near(adaPos1.y, adaPos0.y), JSON.stringify(adaPos1));
check("player.shortPans", Math.hypot(camShort.x - camPan.x, camShort.y - camPan.y) > 4);
check("player.shortNoMenu", await player.evaluate(() => !document.querySelector('[data-act="tokenCmd"]')));

const foePos0 = await pos(player, "foe1");
const foeNow = await center(player, "foe1");
await oneFinger(player, foeNow.x, foeNow.y, foeNow.x, foeNow.y + 70, 420);
const foePos1 = await pos(player, "foe1");
check("player.foeStays", near(foePos1.x, foePos0.x) && near(foePos1.y, foePos0.y), JSON.stringify({ foePos0, foePos1 }));

const adaNow = await center(player, "ply_ada");
await oneFinger(player, adaNow.x, adaNow.y, adaNow.x, adaNow.y, 0);
await player.waitForTimeout(80);
const menu = await player.evaluate(() => {
  const node = document.querySelector('[data-act="tokenCmd"]');
  return node ? node.textContent.replace(/\s+/g, " ").trim() : "";
});
check("player.tapMenu", menu.includes("Move") && menu.includes("Interact"), menu);
await shot(player, "player-iphone-card");

const away = await player.evaluate(() => {
  const r = document.querySelector("#mapMount canvas").getBoundingClientRect();
  return { x: r.left + 28, y: r.top + 96 };
});
await oneFinger(player, away.x, away.y, away.x, away.y, 0);
const adaPos2 = await pos(player, "ply_ada");
const adaHold = await center(player, "ply_ada");
const held = await oneFinger(player, adaHold.x, adaHold.y, adaHold.x + 150, adaHold.y, 480, "player-iphone-lift");
const adaPos3 = await pos(player, "ply_ada");
check("player.lift", held.lift === "1" && held.kind === "token", JSON.stringify(held));
check("player.longMoves", adaPos3.x !== adaPos2.x || adaPos3.y !== adaPos2.y, JSON.stringify({ adaPos2, adaPos3 }));
await shot(player, "player-iphone-moved");

const beforeZoom = await cam(player);
const spot = await player.evaluate(() => {
  const r = document.querySelector("#mapMount canvas").getBoundingClientRect();
  return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45 };
});
await pinch(player, spot.x, spot.y, 70);
const afterZoom = await cam(player);
const pinchFlag = await player.evaluate(() => document.querySelector("#mapMount").dataset.pinch || "");
check("player.pinch", afterZoom.zoom > beforeZoom.zoom + 0.05, JSON.stringify({ before: beforeZoom.zoom, after: afterZoom.zoom, pinchFlag }));
await shot(player, "player-iphone-pinch");

const beforeTwo = await cam(player);
await twoPan(player, spot.x, spot.y, 90);
const afterTwo = await cam(player);
check("player.twoPan", Math.hypot(afterTwo.x - beforeTwo.x, afterTwo.y - beforeTwo.y) > 4, JSON.stringify({ beforeTwo, afterTwo }));

await pageBack(player);
const tabs = await player.evaluate(() => {
  const main = document.querySelector("#tab-main");
  const map = document.querySelector("#tab-map");
  const phone = document.body.classList.contains("map-phone");
  return {
    phone,
    main: main && main.getBoundingClientRect().width > 20,
    map: map && map.getBoundingClientRect().width > 20
  };
});
check("player.tabs", !tabs.phone && tabs.main && tabs.map, JSON.stringify(tabs));
await iphone.close();

async function pageBack(page) {
  await page.waitForTimeout(400);
  await page.locator("#mapPhoneBack").tap();
  await page.waitForFunction(() => !document.body.classList.contains("map-phone"), null, { timeout: 4000 });
}

const pixel = await browser.newContext({
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.6,
  isMobile: true,
  hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
});
const dm = await pixel.newPage();
dm.on("pageerror", (err) => console.log("pageerror dm", err.message));
await openDm(dm);
const dmCam0 = await cam(dm);
const dmSpot = await dm.evaluate(() => {
  const canvas = document.querySelector("#mapMount canvas");
  const r = canvas.getBoundingClientRect();
  const boxes = window.SSDNSMapHost.tokenBoxes().filter((t) => t && !t.story);
  const onCanvas = (x, y) => document.elementFromPoint(x, y) === canvas;
  let token = null;
  for (const t of boxes) {
    const s = window.SSDNSMapHost.tokenScreen(t.id);
    if (s && onCanvas(s.x, s.y)) { token = { id: t.id, x: s.x, y: s.y }; break; }
  }
  let empty = null;
  for (let y = r.top + 24; y < r.bottom - 16 && !empty; y += 18) {
    for (let x = r.left + 24; x < r.right - 16; x += 22) {
      if (!onCanvas(x, y)) continue;
      const busy = boxes.some((t) => {
        const s = window.SSDNSMapHost.tokenScreen(t.id);
        return s && Math.hypot(s.x - x, s.y - y) < 42;
      });
      if (!busy) { empty = { x, y }; break; }
    }
  }
  return { token, empty, canvas: { x: r.x, y: r.y, w: r.width, h: r.height } };
});
check("dm.spots", !!(dmSpot.token && dmSpot.empty), JSON.stringify(dmSpot));
const dmEmpty = await oneFinger(dm, dmSpot.empty.x, dmSpot.empty.y, dmSpot.empty.x + 20, dmSpot.empty.y + 80, 0);
const dmCam1 = await cam(dm);
check("dm.panKind", dmEmpty.kind === "pan", dmEmpty.kind);
check("dm.pan", Math.hypot(dmCam1.x - dmCam0.x, dmCam1.y - dmCam0.y) > 8);
check("dm.noSelect", dmEmpty.sel === "" && dmEmpty.kind !== "select");
await shot(dm, "dm-pixel-pan");

const dmPos0 = await pos(dm, dmSpot.token.id);
const dmAt = dmSpot.token;
const dmShort = await oneFinger(dm, dmAt.x, dmAt.y, dmAt.x + 40, dmAt.y + 10, 0);
const dmPos1 = await pos(dm, dmSpot.token.id);
check("dm.shortKind", dmShort.kind === "pan", dmShort.kind);
check("dm.shortStays", near(dmPos1.x, dmPos0.x) && near(dmPos1.y, dmPos0.y), JSON.stringify({ dmPos0, dmPos1 }));

const dmTap = await center(dm, dmSpot.token.id);
await oneFinger(dm, dmTap.x, dmTap.y, dmTap.x, dmTap.y, 0);
const dmMenu = await dm.evaluate(() => {
  const node = document.querySelector('[data-act="tokenCmd"]');
  return {
    menu: node ? node.textContent.replace(/\s+/g, " ").trim() : "",
    drawer: window.SSDNSMapHost.drawerTokenId()
  };
});
check("dm.tapMenu", (dmMenu.menu.includes("Move") && dmMenu.menu.includes("Interact")) || !!dmMenu.drawer, JSON.stringify(dmMenu));

const dmAt2 = await center(dm, dmSpot.token.id);
const dmHeld = await oneFinger(dm, dmAt2.x, dmAt2.y, dmAt2.x + 140, dmAt2.y, 450);
const dmPos2 = await pos(dm, dmSpot.token.id);
check("dm.lift", dmHeld.lift === "1" && dmHeld.kind === "token", JSON.stringify(dmHeld));
check("dm.longMoves", dmPos2.x !== dmPos0.x || dmPos2.y !== dmPos0.y, JSON.stringify({ dmPos0, dmPos2 }));
await shot(dm, "dm-pixel-moved");

await dm.evaluate(() => document.querySelector('[data-act="rulerBtn"]').click());
const rulerCam0 = await cam(dm);
const rulerAt = await dm.evaluate(() => {
  const r = document.querySelector("#mapMount canvas").getBoundingClientRect();
  return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.35 };
});
const ruled = await oneFinger(dm, dmSpot.empty.x, dmSpot.empty.y, dmSpot.empty.x + 70, dmSpot.empty.y + 24, 0);
const rulerCam1 = await cam(dm);
check("dm.rulerKind", ruled.kind === "ruler", ruled.kind);
check("dm.rulerStays", Math.hypot(rulerCam1.x - rulerCam0.x, rulerCam1.y - rulerCam0.y) < 2, JSON.stringify({ rulerCam0, rulerCam1 }));
await dm.evaluate(() => document.querySelector('[data-act="rulerBtn"]').click());

const dmZoom0 = await cam(dm);
const dmPinchAt = await dm.evaluate((id) => {
  const canvas = document.querySelector("#mapMount canvas");
  const r = canvas.getBoundingClientRect();
  const s = window.SSDNSMapHost.tokenScreen(id);
  for (let y = r.top + 28; y < r.bottom - 28; y += 12) {
    for (let x = r.left + 48; x < r.right - 48; x += 16) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      if (document.elementFromPoint(x - 16, y) !== canvas || document.elementFromPoint(x + 16, y) !== canvas) continue;
      if (s && Math.hypot(s.x - x, s.y - y) < 30) continue;
      return { x, y, hit: true };
    }
  }
  return { x: r.left + 40, y: r.top + 40, hit: false };
}, dmSpot.token.id);
await pinch(dm, dmPinchAt.x, dmPinchAt.y, 24, 12);
const dmZoom1 = await cam(dm);
const dmPinch = await dm.evaluate(() => document.querySelector("#mapMount").dataset.pinch || "");
check("dm.pinch", dmZoom1.zoom > dmZoom0.zoom + 0.02, JSON.stringify({ before: dmZoom0.zoom, after: dmZoom1.zoom, dmPinch, dmPinchAt }));

const fight = await dm.evaluate(() => {
  const tab = document.querySelector("#tab-fight");
  const map = document.querySelector("#tab-map");
  tab.scrollIntoView({ block: "center", inline: "center" });
  const box = tab.getBoundingClientRect();
  const reachable = box.width > 20 && box.top >= 0 && box.bottom <= window.innerHeight;
  tab.click();
  return { fight: tab.getAttribute("aria-selected") === "true", map: !!(map && map.getBoundingClientRect().width > 20), reachable };
});
check("dm.tabs", fight.fight && fight.map && fight.reachable, JSON.stringify(fight));
await pixel.close();

const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
const mouse = await desk.newPage();
mouse.on("pageerror", (err) => console.log("pageerror mouse", err.message));
await openDm(mouse);
const mouseCam0 = await cam(mouse);
const mouseAt = await mouse.evaluate(() => {
  const canvas = document.querySelector("#mapMount canvas");
  const r = canvas.getBoundingClientRect();
  const boxes = window.SSDNSMapHost.tokenBoxes();
  for (let y = r.top + 30; y < r.bottom - 20; y += 16) {
    for (let x = r.left + 30; x < r.right - 20; x += 20) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      const busy = boxes.some((t) => {
        const s = window.SSDNSMapHost.tokenScreen(t.id);
        return s && Math.hypot(s.x - x, s.y - y) < 48;
      });
      if (!busy) return { x, y };
    }
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await mouse.mouse.move(mouseAt.x, mouseAt.y);
await mouse.mouse.down();
const mouseKind = await mouse.evaluate(() => document.querySelector("#mapMount").dataset.dragKind || "");
await mouse.mouse.move(mouseAt.x + 90, mouseAt.y + 40, { steps: 6 });
await shot(mouse, "dm-desktop-select");
await mouse.mouse.up();
const mouseCam1 = await cam(mouse);
check("dm.mouseSelect", mouseKind === "select", mouseKind || "no-drag");
check("dm.mouseStill", Math.hypot(mouseCam1.x - mouseCam0.x, mouseCam1.y - mouseCam0.y) < 1.5, JSON.stringify({ mouseCam0, mouseCam1 }));
await desk.close();

await browser.close();
if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("touch gestures 0.3.306 ok");

/**
 * Phone map (sheet 0.3.302 / DMCC 0.2.315).
 * Opening Map on a phone is a full-screen map. Back returns to the sheet.
 * My token recenters. The token card is a bottom drawer. Pan stays on the map.
 * Move and Interact stay one-finger. Desktop does not enter this mode.
 *   node tools/test-mobile-map-03302.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "/tmp/pw/node_modules/playwright-core/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = "/usr/local/bin/google-chrome";
const OUT = "/opt/cursor/artifacts/phone-map";
const BASE = "http://127.0.0.1:8765";
fs.mkdirSync(OUT, { recursive: true });

const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}

const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
check("ver.sheet", version.sheet === "0.3.302" && version.sheetBuild === "sheet-playtest-v03302");
check("ver.dmcc", version.dmcc === "0.2.315" && version.dmccBuild === "dmcc-playtest-v02315");
const demo = fs.readFileSync(path.join(root, "map/demo.html"), "utf8");
check("demo.viewport", demo.includes('name="viewport"') && demo.includes("width=device-width"));
check("rules.clean", !fs.readFileSync(path.join(root, "assets/data/rules.js"), "utf8").includes("0.3.302") && !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("0.3.302"));

const seed = {
  "map/public/tokens/ply_ada": {
    value: { id: "ply_ada", kind: "player", name: "Ada", ownerUid: "ada", playerActive: true, sceneId: "scn_dustyspur01", size: 1, pos: { x: 14, y: 9 }, color: "#c9a227" },
    seq: 1, by: "test"
  },
  "map/public/tokens/chest1": {
    value: { id: "chest1", kind: "chest", name: "Chest", sceneId: "scn_dustyspur01", size: 1, pos: { x: 15, y: 9 } },
    seq: 1, by: "test"
  }
};

const uaI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const uaA = "Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

async function swipe(page, x, y1, y2) {
  const c = await page.context().newCDPSession(page);
  await c.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(x), y: Math.round(y1), id: 1 }] });
  const steps = Math.abs(y2 - y1) < 4 ? 1 : 10;
  for (let i = 1; i <= steps; i++) {
    await c.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(x), y: Math.round(y1 + (y2 - y1) * i / steps), id: 1 }] });
    await page.waitForTimeout(16);
  }
  await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await c.detach();
  await page.waitForTimeout(80);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name + ".png"), timeout: 20000 });
}

function inView(box, w, h) {
  return box && box.width >= 28 && box.height >= 28 && box.x >= -2 && box.y >= -2 && box.x + box.width <= w + 2 && box.y + box.height <= h + 2;
}

async function openPhoneMap(page) {
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((n) => n.close()));
  await page.evaluate(() => window.scrollTo(0, 480));
  await page.evaluate((seed) => {
    window.SSDNSDmJoin = {
      isJoined: function () { return true; },
      live: function () { return { joined: true, roomCode: "LOCAL", uid: "ada", local: true, seed: seed }; }
    };
    window.SSDNSMapHost.syncRoom();
  }, seed);
  await page.waitForFunction(() => {
    const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes && window.SSDNSMapHost.tokenBoxes();
    return document.querySelector("#mapMount canvas") && boxes && boxes.some((t) => t.id === "ply_ada");
  }, null, { timeout: 8000 });
  const before = await page.evaluate(() => Math.round(window.scrollY));
  await page.evaluate(() => document.querySelector("#tab-map").scrollIntoView({ inline: "center", block: "nearest" }));
  await page.locator("#tab-map").tap();
  await page.waitForFunction(() => document.body.classList.contains("map-phone"), null, { timeout: 4000 });
  return before;
}

async function phone(browser, name, width, height, ua) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua });
  const page = await ctx.newPage();
  page.on("pageerror", (err) => console.log("pageerror", name, err.message));
  const saved = await openPhoneMap(page);
  const open = await page.evaluate(() => {
    const bar = document.querySelector("#mapPhoneBar");
    const back = document.querySelector("#mapPhoneBack");
    const me = document.querySelector("#mapPhoneMe");
    const card = document.querySelector(".ssdns-playercard");
    const canvas = document.querySelector("#mapMount canvas");
    const cr = canvas.getBoundingClientRect();
    const br = back.getBoundingClientRect();
    const mr = me.getBoundingClientRect();
    const hitB = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
    const hitM = document.elementFromPoint(mr.left + mr.width / 2, mr.top + mr.height / 2);
    return {
      phone: document.body.classList.contains("map-phone"),
      back: back.textContent,
      me: me.textContent,
      barHidden: bar.hidden,
      hitBack: hitB && (hitB.id === "mapPhoneBack" || (hitB.closest && !!hitB.closest("#mapPhoneBack"))),
      hitMe: hitM && (hitM.id === "mapPhoneMe" || (hitM.closest && !!hitM.closest("#mapPhoneMe"))),
      backBox: { x: br.x, y: br.y, width: br.width, height: br.height },
      meBox: { x: mr.x, y: mr.y, width: mr.width, height: mr.height },
      shut: card.classList.contains("min"),
      canvasH: cr.height,
      canvasTop: cr.top,
      scroll: Math.round(window.scrollY)
    };
  });
  check(name + ".fullscreen", open.phone && open.back === "Back" && open.me === "My token" && !open.barHidden);
  check(name + ".exit", open.hitBack && open.hitMe && inView(open.backBox, width, height) && inView(open.meBox, width, height), JSON.stringify(open.backBox));
  check(name + ".drawerShut", open.shut);
  check(name + ".grid", open.canvasH > height * 0.35, "canvas " + Math.round(open.canvasH));
  await shot(page, name + "-grid");

  const head = await page.locator(".ssdns-playercard .ssm-card-head").boundingBox();
  await page.touchscreen.tap(head.x + 30, head.y + head.height / 2);
  await page.waitForTimeout(150);
  const expanded = await page.evaluate(() => !document.querySelector(".ssdns-playercard").classList.contains("min"));
  check(name + ".drawerOpen", expanded);
  await shot(page, name + "-drawer");
  const head2 = await page.locator(".ssdns-playercard .ssm-card-head").boundingBox();
  await swipe(page, head2.x + head2.width / 2, head2.y + 20, head2.y + 120);
  await page.waitForTimeout(120);
  const shutAgain = await page.evaluate(() => document.querySelector(".ssdns-playercard").classList.contains("min"));
  check(name + ".drawerSwipe", shutAgain);

  const spot = await page.evaluate(() => {
    const canvas = document.querySelector("#mapMount canvas");
    const r = canvas.getBoundingClientRect();
    for (let y = r.bottom - 24; y > r.top + 16; y -= 18) {
      const x = r.left + 28;
      if (document.elementFromPoint(x, y) === canvas) return { x: Math.round(x), y: Math.round(y) };
    }
    return { x: Math.round(r.left + 20), y: Math.round(r.top + r.height / 2) };
  });
  const beforeCam = await page.evaluate(() => window.SSDNSMapHost.camera());
  await swipe(page, spot.x, spot.y, spot.y - 140);
  const panned = await page.evaluate(() => window.SSDNSMapHost.camera());
  check(name + ".panned", Math.abs(panned.y - beforeCam.y) > 20, JSON.stringify(panned));
  for (let i = 0; i < 8; i++) await swipe(page, spot.x, spot.y, Math.max(spot.y - 160, 80));
  const clamped = await page.evaluate(() => {
    const cam = window.SSDNSMapHost.camera();
    const canvas = document.querySelector("#mapMount canvas");
    const r = canvas.getBoundingClientRect();
    const worldW = 30 * 70;
    const worldH = 20 * 70;
    const viewW = r.width / (cam.zoom || 1);
    const viewH = r.height / (cam.zoom || 1);
    const minX = viewW >= worldW ? worldW / 2 : viewW / 2;
    const maxX = viewW >= worldW ? worldW / 2 : worldW - viewW / 2;
    const minY = viewH >= worldH ? worldH / 2 : viewH / 2;
    const maxY = viewH >= worldH ? worldH / 2 : worldH - viewH / 2;
    return { cam, minX, maxX, minY, maxY, scroll: Math.round(window.scrollY), phone: document.body.classList.contains("map-phone") };
  });
  check(name + ".clamp", clamped.cam.x >= clamped.minX - 1 && clamped.cam.x <= clamped.maxX + 1 && clamped.cam.y >= clamped.minY - 1 && clamped.cam.y <= clamped.maxY + 1, JSON.stringify(clamped));
  check(name + ".noPageScroll", clamped.scroll === open.scroll && clamped.phone);

  /* A pan calls preventDefault, and Chrome drops a click that arrives in the same beat. */
  await page.waitForTimeout(400);
  await page.locator("#mapPhoneMe").tap();
  await page.waitForTimeout(150);
  const recent = await page.evaluate(() => {
    const cam = window.SSDNSMapHost.camera();
    const tok = window.SSDNSMapHost.tokenBoxes().find((t) => t.id === "ply_ada");
    return { cam, tx: (tok.x + 0.5) * 70, ty: (tok.y + 0.5) * 70, taps: window.__phoneMe || 0 };
  });
  const dist = Math.hypot(recent.cam.x - recent.tx, recent.cam.y - recent.ty);
  check(name + ".myToken", dist < 80, "dist " + Math.round(dist) + " taps " + recent.taps + " cam " + Math.round(recent.cam.y));
  await shot(page, name + "-token");

  const tapAt = await page.evaluate(() => {
    const boxes = window.SSDNSMapHost.tokenBoxes();
    const me = boxes.find((t) => t.id === "ply_ada");
    const canvas = document.querySelector("#mapMount canvas");
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (me.screen.x1 + me.screen.x2) / 2, y: r.top + (me.screen.y1 + me.screen.y2) / 2 };
  });
  await swipe(page, tapAt.x, tapAt.y, tapAt.y + 2);
  await page.waitForTimeout(200);
  const menu = await page.evaluate(() => {
    const move = document.querySelector("[data-act='tokenCmdMove']");
    const act = document.querySelector("[data-act='tokenCmdInteract']");
    if (!move || !act) return null;
    const mb = move.getBoundingClientRect();
    const ab = act.getBoundingClientRect();
    const hm = document.elementFromPoint(mb.left + mb.width / 2, mb.top + mb.height / 2);
    const ha = document.elementFromPoint(ab.left + ab.width / 2, ab.top + ab.height / 2);
    return {
      move: { x: mb.x, y: mb.y, width: mb.width, height: mb.height },
      act: { x: ab.x, y: ab.y, width: ab.width, height: ab.height },
      hitMove: hm && hm.getAttribute && hm.getAttribute("data-act") === "tokenCmdMove",
      hitAct: ha && ha.getAttribute && ha.getAttribute("data-act") === "tokenCmdInteract",
      actOff: act.disabled
    };
  });
  check(name + ".move", !!menu && menu.hitMove && inView(menu.move, width, height), menu ? JSON.stringify(menu.move) : "no menu");
  check(name + ".interact", !!menu && menu.hitAct && inView(menu.act, width, height) && !menu.actOff, menu ? JSON.stringify(menu.act) : "no menu");
  if (menu && menu.hitMove) {
    await page.locator("[data-act='tokenCmdMove']").tap();
    await page.waitForTimeout(100);
    const armed = await page.evaluate(() => {
      const btn = document.querySelector("[data-act='tokenCmdMove']");
      return !!(btn && btn.classList.contains("is-on"));
    });
    check(name + ".moveTap", armed);
  }
  await shot(page, name + "-menu");

  await page.locator("#mapPhoneBack").tap();
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => {
    const tab = document.querySelector("#tab-main");
    const tabs = document.querySelector(".tabs");
    const tr = tabs.getBoundingClientRect();
    const mr = tab.getBoundingClientRect();
    return {
      phone: document.body.classList.contains("map-phone"),
      selected: tab.getAttribute("aria-selected"),
      scroll: Math.round(window.scrollY),
      tabTop: Math.round(mr.top),
      tabBottom: Math.round(mr.bottom),
      tabsTop: Math.round(tr.top),
      tabsBottom: Math.round(tr.bottom),
      overflow: getComputedStyle(document.documentElement).overflow
    };
  });
  check(name + ".back", !back.phone && back.selected === "true" && back.overflow !== "hidden", JSON.stringify(back));
  const tabsSeen = back.tabBottom > 8 && back.tabTop >= 0 && back.tabTop < height;
  check(name + ".tabs", tabsSeen, JSON.stringify(back));
  const restored = Math.abs(back.scroll - saved) < 80 || (tabsSeen && back.scroll > 0);
  check(name + ".scrollRestored", restored, "saved " + saved + " now " + back.scroll);
  await shot(page, name + "-back");
  const y0 = back.scroll;
  await swipe(page, width / 2, Math.min(height - 80, 520), 160);
  const y1 = await page.evaluate(() => Math.round(window.scrollY));
  check(name + ".pageScrolls", y1 !== y0, y0 + " -> " + y1);
  await ctx.close();
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false });
  const page = await ctx.newPage();
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((n) => n.close()));
  await page.evaluate((seed) => {
    window.SSDNSDmJoin = {
      isJoined: function () { return true; },
      live: function () { return { joined: true, roomCode: "LOCAL", uid: "ada", local: true, seed: seed }; }
    };
    window.SSDNSMapHost.syncRoom();
  }, seed);
  await page.waitForFunction(() => document.querySelector("#mapMount canvas"), null, { timeout: 8000 });
  await page.click("#tab-map");
  await page.waitForTimeout(300);
  const desk = await page.evaluate(() => ({
    phone: document.body.classList.contains("map-phone"),
    klass: document.querySelector("#mapMount").classList.contains("ssm-phone"),
    bar: !!document.querySelector("#mapPhoneBar") && !document.querySelector("#mapPhoneBar").hidden,
    mode: window.SSDNSMapHost.phoneMap()
  }));
  check("desktop.unchanged", !desk.phone && !desk.klass && !desk.bar && desk.mode === false, JSON.stringify(desk));
  await shot(page, "desktop-map");
  await ctx.close();
}

async function playerDemo(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: uaI });
  const page = await ctx.newPage();
  await page.goto(BASE + "/map/demo.html?role=player&room=phonemap", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.map && document.querySelector(".ssdns-map canvas"), null, { timeout: 8000 });
  const info = await page.evaluate(() => ({
    inner: window.innerWidth,
    phone: document.querySelector(".ssdns-map").classList.contains("ssm-phone"),
    card: !!document.querySelector(".ssdns-playercard"),
    shut: document.querySelector(".ssdns-playercard") && document.querySelector(".ssdns-playercard").classList.contains("min")
  }));
  check("demo.phoneWidth", info.inner === 390, JSON.stringify(info));
  check("demo.drawer", info.phone && info.card && info.shut, JSON.stringify(info));
  await shot(page, "demo-player");
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
await phone(browser, "iphone14", 390, 844, uaI);
await phone(browser, "iphone14-land", 844, 390, uaI);
await phone(browser, "android360", 360, 800, uaA);
await desktop(browser);
await playerDemo(browser);
await browser.close();

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((f) => console.log(" - " + f));
  process.exit(1);
}
console.log("mobile map 0.3.302 ok");

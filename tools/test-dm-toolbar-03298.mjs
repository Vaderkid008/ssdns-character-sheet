/**
 * DM map toolbar cleanup. Moved controls keep their actions.
 * Real mouse, DM demo table. Sheet 0.3.301 / DMCC 0.2.314.
 *   node tools/test-dm-toolbar-03298.mjs
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
check("ver", ver.sheet === "0.3.301" && ver.dmcc === "0.2.314");

const browser = await puppeteer.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: "new",
  protocolTimeout: 40000,
  args: ["--no-sandbox"]
});

async function boot(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://127.0.0.1:8765/dm/?demo=1", { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForSelector("#btnLoadDemo", { timeout: 15000 });
  if (!await page.$("#mapMount canvas")) {
    await page.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await page.waitForSelector("#mapMount canvas", { timeout: 20000 });
  }
  await page.evaluate(() => { const tab = document.querySelector("#tab-map"); if (tab) tab.click(); });
  await page.waitForSelector("#panel-map:not([hidden]) [data-act='mapsBtn']", { timeout: 10000 });
  return errs;
}

function stripClear(page) {
  return page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const hit = (a, b) => !!(a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t);
    const strip = rect("[data-act='floorStrip']");
    return {
      has: !!strip,
      hitReset: hit(strip, rect("[data-act='reset']")),
      hitMaps: hit(strip, rect("[data-act='mapsBtn']")),
      hitGrid: hit(strip, rect("[data-act='strength']")),
      hitZoom: hit(strip, rect("[data-act='zoomLabel']")),
      hitNext: hit(strip, rect(".ssm-turnstrip .btn-next"))
    };
  });
}
function homeOf(page, act) {
  return page.evaluate((act) => {
    const el = document.querySelector('[data-act="' + act + '"]');
    if (!el) return "";
    const home = el.closest("[data-act='viewFog'], [data-act='partyRest'], [data-act='mapsMenu'], .ssdns-leftbar, .ssdns-rightbar, .ssm-toolbar-main");
    return home ? (home.getAttribute("data-act") || home.className) : "loose";
  }, act);
}

for (const width of [1280, 1600]) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  const errs = await boot(page);
  await page.waitForSelector("[data-act='floorStrip'] [data-floor]", { timeout: 8000 });
  const before = await stripClear(page);
  check("strip.clear." + width, before.has && !before.hitReset && !before.hitMaps && !before.hitGrid && !before.hitZoom && !before.hitNext, JSON.stringify(before));
  await page.evaluate(() => { const b = document.querySelector("#btnMapFull"); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 300));
  const tag = String(width);
  const full = await stripClear(page);
  check("strip.clear." + tag + ".full", full.has && !full.hitReset && !full.hitMaps && !full.hitGrid && !full.hitZoom && !full.hitNext, JSON.stringify(full));

  const bar = await page.evaluate(() => {
    const el = document.querySelector(".ssm-toolbar-main") || document.querySelector(".ssdns-toolbar");
    if (!el) return null;
    return { sw: el.scrollWidth, cw: el.clientWidth };
  });
  check("bar.fit." + tag, !!(bar && bar.sw <= bar.cw + 2), JSON.stringify(bar));

  const homes = {
    fxBtn: "viewFog",
    condPillBtn: "viewFog",
    showDownedBtn: "viewFog",
    fogBtn: "viewFog",
    showFovBtn: "viewFog",
    dmEditBtn: "viewFog",
    shortRestBtn: "partyRest",
    longRestBtn: "partyRest",
    betweenBtn: "mapsMenu",
    assetsBtn: "mapsMenu",
    myViewBtn: "mapsMenu",
    setFloorBtn: "mapsMenu",
    showSceneBtn: "mapsMenu",
    mapsLibraryBtn: "mapsMenu",
    importWallsBtn: "ssdns-leftbar",
    reset: "ssm-toolbar-main",
    mapsBtn: "ssm-toolbar-main",
    challengeBtn: "ssm-toolbar-main"
  };
  for (const [act, home] of Object.entries(homes)) {
    const got = await homeOf(page, act);
    check("home." + act + "." + tag, got === home, got);
  }
  const wallsOrder = await page.evaluate(() => {
    const left = document.querySelector(".ssdns-leftbar");
    if (!left) return false;
    const nodes = [...left.querySelectorAll("[data-act]")];
    const a = nodes.findIndex((n) => n.getAttribute("data-act") === "importWallsBtn");
    const b = nodes.findIndex((n) => n.getAttribute("data-act") === "wallsVisBtn");
    return a >= 0 && b === a + 1;
  });
  check("home.importWalls.nextToWalls." + tag, wallsOrder);

  if (width === 1280) {
    await page.screenshot({ path: "/opt/cursor/artifacts/dm-toolbar-after-1280.png" });
    await page.click("#panel-map [data-act='mapsBtn']");
    await page.waitForSelector('[data-act="mapsMenu"]:not([hidden])', { timeout: 2000 });
    await page.screenshot({ path: "/opt/cursor/artifacts/dm-toolbar-maps-1280.png" });

    const toast = () => page.evaluate(() => (document.querySelector('[data-act="toast"]') || {}).textContent || "");
    async function openMaps() {
      const open = await page.$('[data-act="mapsMenu"]:not([hidden])');
      if (open) return;
      await page.click("#panel-map [data-act='mapsBtn']");
      await page.waitForSelector('[data-act="mapsMenu"]:not([hidden])', { timeout: 2000 });
    }
    async function clickMenu(act) {
      await openMaps();
      const hit = await page.evaluate((act) => {
        const el = document.querySelector('[data-act="' + act + '"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      }, act);
      if (hit && hit.w > 2 && hit.h > 2 && hit.y > 0 && hit.y < 780) await page.mouse.click(hit.x, hit.y);
      else await page.evaluate((act) => document.querySelector('[data-act="' + act + '"]').click(), act);
    }
    await page.click('[data-act="fxBtn"]');
    check("act.effects", /OFF/.test(await page.$eval('[data-act="fxBtn"]', (b) => b.textContent)));
    await page.click('[data-act="condPillBtn"]');
    check("act.pills", /Compact|Normal/.test(await page.$eval('[data-act="condPillBtn"]', (b) => b.textContent)));
    await page.click('[data-act="showDownedBtn"]');
    check("act.downed", /ON/.test(await page.$eval('[data-act="showDownedBtn"]', (b) => b.textContent)));
    await page.click('[data-act="fogBtn"]');
    check("act.fog", /OFF|ON/.test(await page.$eval('[data-act="fogBtn"]', (b) => b.textContent)));
    await page.click('[data-act="showFovBtn"]');
    check("act.fov", /OFF|ON/.test(await page.$eval('[data-act="showFovBtn"]', (b) => b.textContent)));
    await page.click('[data-act="dmEditBtn"]');
    check("act.edit", (await page.$eval('[data-act="dmEditBtn"]', (b) => b.getAttribute("aria-pressed"))) === "true");

    await page.evaluate(() => {
      window.__rest = [];
      const orig = window.SSDNSPartyRest;
      window.SSDNSPartyRest = (kind) => { window.__rest.push(kind); return orig ? orig(kind) : null; };
    });
    await page.click('[data-act="shortRestBtn"]');
    await page.click('[data-act="longRestBtn"]');
    check("act.rest", await page.evaluate(() => window.__rest.join(",") === "short,long"));

    await clickMenu("assetsBtn");
    await new Promise((r) => setTimeout(r, 80));
    check("act.assets", !!(await page.$(".al-dialog, .ml-dialog")));
    await page.evaluate(() => { document.querySelectorAll(".ml-dialog, .al-dialog").forEach((n) => n.remove()); });
    await clickMenu("myViewBtn");
    await new Promise((r) => setTimeout(r, 40));
    check("act.myView", /My view/i.test(await toast()));
    await clickMenu("setFloorBtn");
    await new Promise((r) => setTimeout(r, 40));
    check("act.floor", /Select a token/i.test(await toast()));
    await clickMenu("showSceneBtn");
    await new Promise((r) => setTimeout(r, 40));
    check("act.show", /Showing /i.test(await toast()));
    await page.evaluate(() => { window.prompt = () => '[{"x1":0,"y1":0,"x2":1,"y2":0}]'; });
    await page.click('[data-act="importWallsBtn"]');
    await new Promise((r) => setTimeout(r, 40));
    check("act.import", /Imported/.test(await toast()));
    await page.click('[data-act="mapsBtn"]');
    await page.click('[data-act="betweenBtn"]');
    await new Promise((r) => setTimeout(r, 200));
    check("act.between", /Between encounters/i.test(await toast()));
    await page.click('[data-act="mapsBtn"]');
    await page.click('[data-act="mapsLibraryBtn"]');
    await new Promise((r) => setTimeout(r, 100));
    check("act.library", !!(await page.$(".ml-dialog")));
    check("page.clean", errs.length === 0, errs.join(" | "));
  }
  await page.close();
}

const player = await browser.newPage();
await player.setViewport({ width: 1280, height: 800 });
await player.goto("http://127.0.0.1:8765/map/demo.html?role=player&room=toolbarplayer" + Date.now().toString(36), { waitUntil: "domcontentloaded" });
await player.waitForSelector('[data-act="shortRestBtn"]', { timeout: 15000 });
const playerHome = await player.evaluate(() => {
  const rest = document.querySelector('[data-act="shortRestBtn"]');
  const fx = document.querySelector('[data-act="fxBtn"]');
  const between = document.querySelector('[data-act="betweenBtn"]');
  return {
    rest: !!(rest && rest.closest(".ssm-toolbar-main")),
    fx: !!(fx && fx.closest(".ssm-toolbar-main")),
    between: !!between
  };
});
check("player.unchanged", playerHome.rest && playerHome.fx && !playerHome.between, JSON.stringify(playerHome));
await player.close();
await browser.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndm toolbar ok");

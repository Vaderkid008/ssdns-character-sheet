/**
 * 0.3.74 / DMCC 0.2.87: DMCC table feed docks on the LEFT beside the map's left tool bar,
 * starts open, collapses to a slim strip (remembered per browser in localStorage "ssdns.dm.dock"),
 * and the page / map reflow into the freed space. Phones keep the bottom-sheet + Feed button.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-dm-chat-dock.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* static wiring */
{
  const html = read("dm/index.html"), css = read("dm/assets/css/dmcc.css"), js = read("dm/assets/js/dmcc.js");
  check("wire.oneDock", (html.match(/id="liveDock"/g) || []).length === 1, "the existing dock is reused, not duplicated");
  check("wire.chevron", /id="btnDockCollapse"[^>]*aria-expanded="true"/.test(html));
  check("wire.strip", /id="btnDockStrip"/.test(html) && /id="dockStripBadge"/.test(html));
  check("wire.leftCss", /\.live-dock \{\s*position: fixed; top: 0; left: 0;/.test(css));
  check("wire.storageKey", /localStorage\.setItem\("ssdns\.dm\.dock"/.test(js));
  check("wire.playerSheetUntouched", !/btnDockStrip|dock-strip/.test(read("index.html")));
}

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const overlapX = (a, b) => a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5;
async function openDemo(page, clear) {
  await page.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  if (clear) { await page.evaluate(() => { localStorage.removeItem("ssdns.dm.dock"); localStorage.removeItem("ssdns.dmcc.dock"); }); await page.reload({ waitUntil: "domcontentloaded" }); }
  await page.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await page.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await page.waitForFunction(() => window.DMCC.state.demo && window.SSDNSMapFight, { timeout: 20000 });
  await sleep(800);
}
try {
  const dm = await browser.newPage();
  const errs = [];
  dm.on("pageerror", (e) => errs.push(String(e)));
  await dm.setViewport({ width: 1440, height: 900 });
  await openDemo(dm, true);

  /* default: open, docked left, page shifted right of it */
  check("default.open", await dm.evaluate(() => !document.body.classList.contains("dock-collapsed") && !document.querySelector("#liveDock").hidden));
  const dock = await box(dm, "#liveDock");
  check("dock.left", dock && dock.x === 0 && Math.round(dock.w) === 320, JSON.stringify(dock));
  const shell = await box(dm, "#roomShell"), dice = await box(dm, "#diceBar"), app = await box(dm, "#appbar");
  check("reflow.open", shell.x >= 320 && dice.x >= 320 && app.x >= 320, JSON.stringify({ shell, dice, app }));
  check("feed.hasRolls", await dm.evaluate(() => document.querySelectorAll("#dockFeed .dock-item").length > 0 && !!document.querySelector("#dockFeed .roll-crit, #dockFeed .roll-attack")));

  /* Map tab: the dock sits right next to the map's left tool bar without covering it */
  await dm.evaluate(() => document.querySelector("#tab-map").click());
  await sleep(1000);
  check("map.tabClass", await dm.evaluate(() => document.body.classList.contains("map-tab-active")));
  const left = await box(dm, "#mapMount .ssdns-leftbar"), mount = await box(dm, "#mapMount"), tool = await box(dm, "#mapMount .ssdns-toolbar"), right = await box(dm, "#mapMount .ssdns-rightbar");
  check("map.leftbarBeside", left && left.x >= dock.r && left.x - dock.r < 60, JSON.stringify({ left, dock }));
  check("map.noOverlap", !overlapX(dock, mount) && !overlapX(dock, tool) && !overlapX(dock, right), JSON.stringify({ mount, tool }));
  const openW = mount.w;

  /* collapse: slim strip, remembered, map grows */
  await dm.click("#btnDockCollapse");
  await sleep(500);
  const shut = await box(dm, "#liveDock");
  check("collapse.strip", Math.round(shut.w) === 48, JSON.stringify(shut));
  check("collapse.stored", await dm.evaluate(() => localStorage.getItem("ssdns.dm.dock") === "closed"));
  check("collapse.aria", await dm.evaluate(() => document.querySelector("#btnDockCollapse").getAttribute("aria-expanded") === "false"));
  check("collapse.stripVisible", await dm.evaluate(() => { const s = document.querySelector("#btnDockStrip"); return getComputedStyle(s).display !== "none" && getComputedStyle(document.querySelector("#dockFeed")).display === "none"; }));
  const mount2 = await box(dm, "#mapMount"), left2 = await box(dm, "#mapMount .ssdns-leftbar");
  check("collapse.mapGrows", mount2.w > openW + 200 && mount2.x >= 48 && mount2.x < 120, JSON.stringify({ openW, mount2 }));
  check("collapse.noOverlap", left2.x >= shut.r, JSON.stringify(left2));

  /* reload keeps it collapsed; strip reopens */
  await openDemo(dm, false);
  check("reload.staysCollapsed", await dm.evaluate(() => document.body.classList.contains("dock-collapsed")));
  await dm.click("#btnDockStrip");
  await sleep(400);
  check("strip.reopens", await dm.evaluate(() => !document.body.classList.contains("dock-collapsed") && localStorage.getItem("ssdns.dm.dock") === "open"));
  check("strip.width", Math.round((await box(dm, "#liveDock")).w) === 320);

  /* map full screen keeps the feed docked and the map starts after it */
  await dm.evaluate(() => document.querySelector("#tab-map").click());
  await sleep(600);
  await dm.evaluate(() => document.querySelector("#btnMapFull").click());
  await sleep(800);
  const fsMount = await box(dm, "#mapMount"), fsLeft = await box(dm, "#mapMount .ssdns-leftbar");
  check("fullscreen.besideDock", Math.round(fsMount.x) === 320 && fsLeft.x >= 320, JSON.stringify({ fsMount, fsLeft }));
  await dm.evaluate(() => document.querySelector("#btnMapFull").click());
  await sleep(300);
  check("desktop.noPageErrors", errs.length === 0, errs.join(" | "));

  /* phone: unchanged bottom sheet + Feed button, no left margin */
  const ph = await browser.newPage();
  const perrs = [];
  ph.on("pageerror", (e) => perrs.push(String(e)));
  await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await openDemo(ph, true);
  const pshell = await box(ph, "#roomShell"), pdock = await box(ph, "#liveDock");
  check("phone.noMargin", pshell.x < 2, JSON.stringify(pshell));
  check("phone.sheetHidden", pdock.y >= 844 - 1, JSON.stringify(pdock));
  check("phone.fab", await ph.evaluate(() => getComputedStyle(document.querySelector("#btnDockFab")).display !== "none"));
  await ph.evaluate(() => document.querySelector("#btnDockFab").click());
  await sleep(400);
  const pdock2 = await box(ph, "#liveDock");
  check("phone.sheetOpens", pdock2.b <= 845 && pdock2.y < 844, JSON.stringify(pdock2));
  check("phone.noPageErrors", perrs.length === 0, perrs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed: " + failures.join(", ")); process.exit(1); }
console.log("\nall DM chat dock checks passed");

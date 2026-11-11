/**
 * Dashboard initiative strip matches the centered panel.
 * The map bar (.ssm-turnstrip) stays full width.
 * Sheet 0.3.293 / DMCC 0.2.306.
 *   node tools/test-dash-strip-03287.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.293" && ver.dmcc === "0.2.306" && ver.sheetBuild === "sheet-playtest-v03293" && ver.dmccBuild === "dmcc-playtest-v02306");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.293") && !read("database.rules.json").includes("0.2.306"));

const css = read("dm/assets/css/dmcc.css");
const mapCss = read("map/ssdns-map.css");
check("css.width", css.includes("width: min(var(--max), calc(100% - 24px))") && css.includes("#roomShell > #turnStrip.turn-strip"));
check("css.card", css.includes("#roomShell > #turnStrip.turn-strip") && /#roomShell > #turnStrip\.turn-strip \{[^}]*background: var\(--bg-3\)/.test(css) && /#roomShell > #turnStrip\.turn-strip \{[^}]*border: 1px solid var\(--line\)/.test(css) && /#roomShell > #turnStrip\.turn-strip \{[^}]*border-radius: var\(--radius\)/.test(css));
check("css.scroll", css.includes("#turnStrip .turn-order-strip") && css.includes("overflow-x: auto"));
check("map.untouched", mapCss.includes("background: #12100e") && mapCss.includes("max-width: 100%") && mapCss.includes(".ssm-turnstrip {") && !mapCss.includes("#roomShell > #turnStrip"));
check("pin.kept", read("dm/index.html").includes("dmcc.css?v=0.2.214-encounter"));

const names = ["Marshal Ada", "Deputy Bea", "Outlaw Cal", "Bandit Ned", "Oracle Ora", "Pistol Pia", "Quartermaster Quin", "Ranger Rex", "Sheriff Sol", "Tracker Tess", "Undertaker Uma", "Vaquero Vic", "Warden Wynn", "Hexer Xan", "Yokel Yve", "Zealot Zed", "Apache Ann", "Black Bart", "Cimarron Cole", "Dusty Dee"];
const chips = names.map((n, i) => `<div class="turn-chip side-pc${i === 0 ? " current" : ""}" role="listitem"><span class="chip-face">${n[0]}</span><span class="chip-name">${n}</span></div>`).join("");
const dmHtml = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(root, "dm/assets/css/dmcc.css"))}">
<link rel="stylesheet" href="${pathToFileURL(path.join(root, "map/ssdns-map.css"))}">
<style>body{margin:0}.map-stage{width:100%;background:#1a1612;padding:8px;box-sizing:border-box}</style>
</head><body>
<div id="roomShell">
  <div id="turnStrip" class="turn-strip is-condensed"><b class="turn-round">Round 1</b><div class="turn-order-strip">${chips}</div></div>
  <main>
    <section class="panel" id="panel-table"><h2>Table</h2></section>
    <section class="panel" id="panel-rewards" hidden><h2>Give</h2></section>
    <section class="panel" id="panel-fight" hidden><h2>Fight</h2></section>
    <section class="panel" id="panel-notes" hidden><h2>Notes</h2></section>
    <section class="panel" id="panel-map" hidden><h2>Map</h2></section>
  </main>
</div>
<div class="map-stage"><div class="ssm-turnstrip"><b class="turn-round">Round 1</b><div class="ssm-strip-chips">${chips}</div></div></div>
</body></html>`;
const sheetHtml = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(root, "assets/css/sheet.css"))}">
<link rel="stylesheet" href="${pathToFileURL(path.join(root, "map/ssdns-map.css"))}">
<style>.ssdns-map{width:100%;background:#1a1612;padding:8px;box-sizing:border-box}</style>
</head><body>
<div id="turnPanel" class="turn-panel is-condensed"><b class="turn-round">Round 1</b><div class="turn-order-strip" id="turnNames">${chips}</div></div>
<main id="sheet">
  <section class="page" id="page-main"><h2>Main</h2></section>
  <section class="page" id="page-equip"><h2>Gear</h2></section>
  <section class="page" id="page-log"><h2>Log</h2></section>
</main>
<div class="ssdns-map" id="mapMount"><div class="ssm-turnhost" id="host"></div><div class="ssm-turnstrip"><b class="turn-round">Round 1</b><div class="ssm-strip-chips">${chips}</div></div></div>
</body></html>`;
const dmPath = path.join(root, "tools/_dash-strip-page.html");
const sheetPath = path.join(root, "tools/_sheet-strip-page.html");
fs.writeFileSync(dmPath, dmHtml);
fs.writeFileSync(sheetPath, sheetHtml);

let puppeteer;
try {
  puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
} catch (e) {
  check("layout.browser", false, "puppeteer-core missing");
}
const chrome = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
if (puppeteer && chrome) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
  const tabs = ["panel-table", "panel-rewards", "panel-fight", "panel-notes"];
  for (const width of [1024, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(dmPath).href, { waitUntil: "networkidle0" });
    const box = await page.evaluate((ids) => {
      const strip = document.getElementById("turnStrip");
      const lane = strip.querySelector(".turn-order-strip");
      const s = strip.getBoundingClientRect();
      const cs = getComputedStyle(strip);
      const bg = cs.backgroundColor;
      const radius = cs.borderRadius;
      const panels = ids.map((id) => {
        const el = document.getElementById(id);
        el.hidden = false;
        const r = el.getBoundingClientRect();
        return { id, w: Math.round(r.width), left: Math.round(r.left) };
      });
      const before = lane.scrollLeft;
      lane.scrollLeft = 160;
      const scrolled = lane.scrollLeft > before;
      const overflow = lane.scrollWidth > lane.clientWidth + 2;
      const map = document.querySelector(".ssm-turnstrip").getBoundingClientRect();
      document.body.classList.add("map-tab-active");
      const onMap = document.getElementById("turnStrip").getBoundingClientRect();
      const mapCs = getComputedStyle(document.getElementById("turnStrip"));
      return {
        sw: Math.round(s.width), left: Math.round(s.left), panels, bg, radius, overflow, scrolled,
        mw: Math.round(map.width),
        mapW: Math.round(onMap.width), mapBg: mapCs.backgroundColor, mapRadius: mapCs.borderRadius
      };
    }, tabs);
    box.panels.forEach((p) => {
      check("width." + width + "." + p.id, Math.abs(box.sw - p.w) <= 1 && Math.abs(box.left - p.left) <= 1, JSON.stringify({ sw: box.sw, panel: p }));
    });
    check("card." + width, box.bg === "rgb(42, 49, 54)" && box.radius === "4px", JSON.stringify(box));
    if (width === 1440) {
      check("scroll", box.overflow && box.scrolled, JSON.stringify(box));
      check("map.wide", box.mw > 1200 && box.mw > box.sw, JSON.stringify(box));
      check("maptab.full", box.mapW > box.sw + 40 && box.mapBg === "rgb(18, 16, 14)" && box.mapRadius === "8px", JSON.stringify(box));
    }
    await page.close();
  }
  const sheet = await browser.newPage();
  await sheet.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await sheet.goto(pathToFileURL(sheetPath).href, { waitUntil: "networkidle0" });
  const sheetBox = await sheet.evaluate(() => {
    const strip = document.getElementById("turnPanel");
    const s = strip.getBoundingClientRect();
    const cs = getComputedStyle(strip);
    const bg = cs.backgroundColor;
    const radius = cs.borderRadius;
    const border = cs.borderTopWidth;
    const pages = ["page-main", "page-equip", "page-log"].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, w: Math.round(r.width), left: Math.round(r.left) };
    });
    const lane = strip.querySelector(".turn-order-strip");
    const before = lane.scrollLeft;
    lane.style.scrollBehavior = "auto";
    lane.scrollLeft = 160;
    const scrolled = lane.scrollLeft > before;
    const overflow = lane.scrollWidth > lane.clientWidth + 2;
    const host = document.getElementById("host");
    host.appendChild(strip);
    const docked = strip.getBoundingClientRect();
    const dockCs = getComputedStyle(strip);
    const mount = document.getElementById("mapMount").getBoundingClientRect();
    const mapBar = document.querySelector(".ssm-turnstrip").getBoundingClientRect();
    return {
      sw: Math.round(s.width), left: Math.round(s.left), pages,
      bg, radius, border, overflow, scrolled,
      dockW: Math.round(docked.width), dockBg: dockCs.backgroundColor, dockBorder: dockCs.borderTopWidth, dockRadius: dockCs.borderRadius,
      mountW: Math.round(mount.width), mapW: Math.round(mapBar.width)
    };
  });
  sheetBox.pages.forEach((p) => {
    check("sheet." + p.id, Math.abs(sheetBox.sw - p.w) <= 1 && Math.abs(sheetBox.left - p.left) <= 1, JSON.stringify({ sw: sheetBox.sw, page: p, bg: sheetBox.bg, radius: sheetBox.radius }));
  });
  check("sheet.card", sheetBox.bg === "rgb(230, 215, 184)" && sheetBox.radius === "4px" && sheetBox.border === "1px", JSON.stringify(sheetBox));
  check("sheet.scroll", sheetBox.overflow && sheetBox.scrolled, JSON.stringify(sheetBox));
  check("sheet.mapDock", sheetBox.dockW > sheetBox.sw && sheetBox.dockBg === "rgb(22, 19, 15)" && sheetBox.dockBorder === "2px" && sheetBox.dockRadius === "10px" && sheetBox.mapW > 1200, JSON.stringify(sheetBox));
  await browser.close();
} else {
  check("layout.browser", false, "chrome missing");
}
fs.unlinkSync(dmPath);
fs.unlinkSync(sheetPath);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndash strip ok");
process.exit(0);

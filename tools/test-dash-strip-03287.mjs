/**
 * Dashboard initiative strip matches the centered panel.
 * The map bar (.ssm-turnstrip) stays full width.
 * Sheet 0.3.287 / DMCC 0.2.300.
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
check("ver", ver.sheet === "0.3.287" && ver.dmcc === "0.2.300" && ver.sheetBuild === "sheet-playtest-v03287" && ver.dmccBuild === "dmcc-playtest-v02300");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.287") && !read("database.rules.json").includes("0.2.300"));

const css = read("dm/assets/css/dmcc.css");
const mapCss = read("map/ssdns-map.css");
check("css.width", css.includes("width: min(var(--max), calc(100% - 24px))") && css.includes("#roomShell > #turnStrip.turn-strip"));
check("css.card", css.includes("#roomShell > #turnStrip.turn-strip") && /#roomShell > #turnStrip\.turn-strip \{[^}]*background: var\(--bg-3\)/.test(css) && /#roomShell > #turnStrip\.turn-strip \{[^}]*border: 1px solid var\(--line\)/.test(css) && /#roomShell > #turnStrip\.turn-strip \{[^}]*border-radius: var\(--radius\)/.test(css));
check("css.scroll", css.includes("#turnStrip .turn-order-strip") && css.includes("overflow-x: auto"));
check("map.untouched", mapCss.includes("background: #12100e") && mapCss.includes("max-width: 100%") && mapCss.includes(".ssm-turnstrip {") && !mapCss.includes("#roomShell > #turnStrip"));
check("pin.kept", read("dm/index.html").includes("dmcc.css?v=0.2.214-encounter"));

const names = ["Marshal Ada", "Deputy Bea", "Outlaw Cal", "Bandit Ned", "Oracle Ora", "Pistol Pia", "Quartermaster Quin", "Ranger Rex", "Sheriff Sol", "Tracker Tess", "Undertaker Uma", "Vaquero Vic", "Warden Wynn", "Hexer Xan", "Yokel Yve", "Zealot Zed", "Apache Ann", "Black Bart", "Cimarron Cole", "Dusty Dee"];
const chips = names.map((n, i) => `<div class="turn-chip side-pc${i === 0 ? " current" : ""}" role="listitem"><span class="chip-face">${n[0]}</span><span class="chip-name">${n}</span></div>`).join("");
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${pathToFileURL(path.join(root, "dm/assets/css/dmcc.css"))}">
<link rel="stylesheet" href="${pathToFileURL(path.join(root, "map/ssdns-map.css"))}">
<style>body{margin:0}.map-stage{width:100%;background:#1a1612;padding:8px;box-sizing:border-box}</style>
</head><body>
<div id="roomShell">
  <div id="turnStrip" class="turn-strip is-condensed"><b class="turn-round">Round 1</b><div class="turn-order-strip">${chips}</div></div>
  <main><section class="panel" id="panel-table"><h2>Table</h2><p class="lede">Centered DM panel.</p></section></main>
</div>
<div class="map-stage"><div class="ssm-turnstrip"><b class="turn-round">Round 1</b><div class="ssm-strip-chips">${chips}</div></div></div>
</body></html>`;
const pagePath = path.join(root, "tools/_dash-strip-page.html");
fs.writeFileSync(pagePath, html);

let puppeteer;
try {
  puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
} catch (e) {
  check("layout.browser", false, "puppeteer-core missing");
}
const chrome = ["/usr/local/bin/google-chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
if (puppeteer && chrome) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
  for (const width of [1024, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(pagePath).href, { waitUntil: "networkidle0" });
    const box = await page.evaluate(() => {
      const strip = document.getElementById("turnStrip");
      const panel = document.querySelector(".panel");
      const lane = strip.querySelector(".turn-order-strip");
      const map = document.querySelector(".ssm-turnstrip");
      const s = strip.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      const m = map.getBoundingClientRect();
      const cs = getComputedStyle(strip);
      const before = lane.scrollLeft;
      lane.scrollLeft = 120;
      return {
        sw: Math.round(s.width), pw: Math.round(p.width), mw: Math.round(m.width),
        left: Math.round(s.left), pleft: Math.round(p.left),
        bg: cs.backgroundColor, radius: cs.borderRadius, border: cs.borderTopWidth + " " + cs.borderTopStyle,
        overflow: lane.scrollWidth > lane.clientWidth + 2,
        scrolled: lane.scrollLeft > before
      };
    });
    check("width." + width, Math.abs(box.sw - box.pw) <= 1 && Math.abs(box.left - box.pleft) <= 1, JSON.stringify(box));
    check("card." + width, box.bg === "rgb(42, 49, 54)" && box.radius === "4px" && box.border.indexOf("1px") === 0, JSON.stringify(box));
    if (width === 1440) {
      check("scroll", box.overflow && box.scrolled, JSON.stringify(box));
      check("map.wide", box.mw > 1200 && box.mw > box.sw, JSON.stringify(box));
    }
    await page.close();
  }
  await browser.close();
} else {
  check("layout.browser", false, "chrome missing");
}
fs.unlinkSync(pagePath);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndash strip ok");
process.exit(0);

/**
 * N71 (sheet 0.3.166 / DMCC 0.2.179): full-screen map hides sheet chrome.
 * The sticky app bar (z-index 320) and teal join/audio bar (310) painted over
 * the board (z-index 80), Exit full screen, and the turn strip. Hide
 * .appbar / .savebar / .dm-join-bar / .tabs only. The strip stays at z-index 4
 * and Exit full screen stays at z-index 90.
 *
 *   node tools/test-n71-fullscreen-chrome.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = JSON.parse(read("version.json"));
const css = read("map/ssdns-map.css");
const app = read("assets/js/app.js");
const host = read("map/ssdns-map-host.js");
const rules = read("assets/data/rules.js");
const rulesDb = read("database.rules.json");
check("ver.sheet", ver.sheet === "0.3.166" && ver.sheetBuild === "sheet-playtest-v03166", JSON.stringify(ver));
check("ver.dmcc", ver.dmcc === "0.2.179" && ver.dmccBuild === "dmcc-playtest-v02179");
check("ver.app", app.includes('APP_VERSION = "0.3.166"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.179"'));
check("src.rulesUntouched", !rules.includes("0.3.166") && !rules.includes("0.2.179") && !rulesDb.includes("0.3.166") && !rulesDb.includes("0.2.179"));
check("src.playerCss", read("index.html").includes("map/ssdns-map.css?v=0.3.166-maps"));
check("src.dmCss", read("dm/index.html").includes("../map/ssdns-map.css?v=0.2.179-maps"));
check("src.hideChrome", /body\.map-fullscreen \.appbar,\s*body\.map-fullscreen \.savebar,\s*body\.map-fullscreen \.dm-join-bar,\s*body\.map-fullscreen \.tabs \{\s*display: none;\s*\}/.test(css));
check("src.stripZ", /body\.map-fullscreen #mapMount \.ssm-turnstrip \{\s*z-index: 4;/.test(css));
check("src.exitZ", /body\.map-fullscreen #btnMapFull \{[^}]*z-index:\s*90;/.test(css));
check("src.stripNotHidden", !/body\.map-fullscreen[^{]*\.ssm-turnstrip[^{]*\{\s*display:\s*none/.test(css));
check("src.barH", app.includes('if (document.body.classList.contains("map-fullscreen")) return;'));
check("src.exitRestoresBar", host.includes('document.documentElement.style.setProperty("--appbar-h"'));

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".ttf")) return "font/ttf";
  return "application/octet-stream";
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("missing"); return;
  }
  res.writeHead(200, { "content-type": contentType(file), "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(8791, "127.0.0.1", resolve));
const ORIGIN = "http://127.0.0.1:8791";
const shotDir = process.env.N71_SHOTS || "/tmp/n71-shots";
fs.mkdirSync(shotDir, { recursive: true });

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

function paintBoard() {
  document.querySelectorAll("main .page, #roomShell .panel").forEach((p) => {
    if (p.id !== "page-map" && p.id !== "panel-map") p.hidden = true;
  });
  const pageMap = document.getElementById("page-map");
  const panel = document.getElementById("panel-map");
  if (pageMap) pageMap.hidden = false;
  if (panel) panel.hidden = false;
  const shell = document.getElementById("roomShell");
  if (shell) shell.hidden = false;
  const lobby = document.getElementById("lobby");
  if (lobby) lobby.hidden = true;
  const mount = document.getElementById("mapMount");
  mount.hidden = false;
  mount.classList.remove("hidden");
  if (mount.getAttribute("data-map-role") === "dm") mount.classList.add("ssdns-role-dm");
  else mount.classList.add("ssdns-role-player");
  mount.replaceChildren();
  const strip = document.createElement("div");
  strip.className = "ssm-turnstrip";
  strip.innerHTML = '<span class="ssm-strip-idle">No fight running</span>'
    + '<button type="button" class="btn btn-primary btn-roll-init" id="n71Roll">Roll Initiative</button>'
    + '<button type="button" class="turn-chip" id="n71Chip">Ada</button>'
    + '<button type="button" class="btn btn-end-combat" id="n71End">End combat</button>';
  const bar = document.createElement("div");
  bar.className = "ssdns-toolbar";
  bar.innerHTML = '<button type="button" id="n71Ping">Ping</button><button type="button" id="n71Ruler">Ruler</button>';
  const canvas = document.createElement("canvas");
  mount.append(strip, bar, canvas);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(2, Math.floor(rect.width));
  canvas.height = Math.max(2, Math.floor(rect.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#6b4a2e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#3a2616";
  ctx.lineWidth = 2;
  const step = 48;
  for (let x = 0; x < canvas.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  window.__n71 = { roll: 0, end: 0, chip: 0, ping: 0 };
  document.getElementById("n71Roll").addEventListener("click", () => { window.__n71.roll += 1; });
  document.getElementById("n71End").addEventListener("click", () => { window.__n71.end += 1; });
  document.getElementById("n71Chip").addEventListener("click", () => { window.__n71.chip += 1; });
  document.getElementById("n71Ping").addEventListener("click", () => { window.__n71.ping += 1; });
  const exit = document.getElementById("btnMapFull");
  exit.textContent = "Exit full screen";
  document.body.classList.add("map-fullscreen");
}

async function hitClick(page, id) {
  const point = await page.evaluate((elId) => {
    const el = document.getElementById(elId);
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const cs = getComputedStyle(el);
    return {
      x, y, w: r.width, h: r.height, top: r.top,
      display: cs.display, visibility: cs.visibility, z: cs.zIndex,
      hit: top && (top === el || el.contains(top)),
      hitTag: top ? (top.id || top.className || top.tagName) : ""
    };
  }, id);
  if (point.missing || !point.hit || point.w < 2 || point.h < 2) return point;
  await page.mouse.click(point.x, point.y);
  return point;
}

async function scene(page, name, which) {
  if (which === "dm-desktop") {
    await page.evaluate(() => {
      document.body.classList.add("in-room");
      const dock = document.getElementById("liveDock");
      if (dock) dock.hidden = false;
    });
  }
  await page.evaluate(paintBoard);
  await sleep(80);
  const chrome = await page.evaluate(() => {
    const disp = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).display : "absent";
    };
    const strip = document.querySelector("#mapMount .ssm-turnstrip");
    const exit = document.getElementById("btnMapFull");
    return {
      appbar: disp(".appbar"),
      savebar: disp(".savebar"),
      join: disp(".dm-join-bar"),
      tabs: disp(".tabs"),
      status: disp(".statusbar"),
      stripDisplay: strip ? getComputedStyle(strip).display : "",
      stripZ: strip ? getComputedStyle(strip).zIndex : "",
      exitZ: exit ? getComputedStyle(exit).zIndex : "",
      exitText: exit ? exit.textContent : "",
      full: document.body.classList.contains("map-fullscreen")
    };
  });
  check(name + ".chromeHidden", chrome.full && chrome.appbar === "none" && chrome.tabs === "none" && chrome.stripDisplay !== "none" && chrome.exitText === "Exit full screen", JSON.stringify(chrome));
  if (which.startsWith("player")) {
    check(name + ".playerBars", chrome.savebar === "none" && chrome.join === "none", JSON.stringify(chrome));
  } else {
    check(name + ".dmStatusStays", chrome.status !== "none" && chrome.savebar === "absent" && chrome.join === "absent", JSON.stringify(chrome));
  }
  check(name + ".stripZ", chrome.stripZ === "4", JSON.stringify(chrome));
  check(name + ".exitZ", chrome.exitZ === "90" || chrome.exitZ === "98", JSON.stringify(chrome));

  const roll = await hitClick(page, "n71Roll");
  const end = await hitClick(page, "n71End");
  const chip = await hitClick(page, "n71Chip");
  const ping = await hitClick(page, "n71Ping");
  const counts = await page.evaluate(() => window.__n71);
  check(name + ".roll", roll.hit && counts.roll === 1, JSON.stringify({ roll, counts }));
  check(name + ".end", end.hit && counts.end === 1, JSON.stringify({ end, counts }));
  check(name + ".chip", chip.hit && counts.chip === 1, JSON.stringify({ chip, counts }));
  check(name + ".ping", ping.hit && counts.ping === 1, JSON.stringify({ ping, counts }));
  check(name + ".stripNearTop", roll.top >= 0 && roll.top < 80, JSON.stringify(roll));

  if (which === "player-desktop") {
    const dock = await page.evaluate(() => {
      const el = document.querySelector("#sheetDock .dock-head");
      const r = el.getBoundingClientRect();
      const x = r.left + 24;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, w: r.width, hit: !!(top && el.contains(top)), hitTag: top ? (top.id || top.className || top.tagName) : "" };
    });
    check(name + ".dock", dock.hit && dock.w > 200, JSON.stringify(dock));
  }
  if (which === "dm-desktop") {
    const dock = await page.evaluate(() => {
      const el = document.querySelector("#liveDock .dock-head");
      const r = el.getBoundingClientRect();
      const x = r.left + 24;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, w: r.width, hit: !!(top && el.contains(top)), hitTag: top ? (top.id || top.className || top.tagName) : "" };
    });
    check(name + ".feed", dock.hit && dock.w > 200, JSON.stringify(dock));
  }

  await page.screenshot({ path: path.join(shotDir, name + ".png") });

  const exit = await hitClick(page, "btnMapFull");
  const after = await page.evaluate(() => ({
    full: document.body.classList.contains("map-fullscreen"),
    appbar: getComputedStyle(document.querySelector(".appbar")).display,
    text: document.getElementById("btnMapFull").textContent
  }));
  check(name + ".exit", exit.hit && !after.full && after.appbar === "flex" && after.text === "Full screen", JSON.stringify({ exit, after }));
}

try {
  const desktop = { width: 1280, height: 800 };
  const phone = { width: 390, height: 844, isMobile: true, hasTouch: true };
  const playerDesk = await browser.newPage();
  await playerDesk.setViewport(desktop);
  await playerDesk.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await playerDesk.waitForSelector("#btnMapFull");
  const before = await playerDesk.evaluate(() => getComputedStyle(document.querySelector(".appbar")).display);
  check("player.chromeShownBefore", before === "flex", before);
  await scene(playerDesk, "player-desktop", "player-desktop");

  const playerPhone = await browser.newPage();
  await playerPhone.setViewport(phone);
  await playerPhone.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await playerPhone.waitForSelector("#btnMapFull");
  await scene(playerPhone, "player-phone", "player-phone");

  const dmDesk = await browser.newPage();
  await dmDesk.setViewport(desktop);
  await dmDesk.goto(ORIGIN + "/dm/index.html", { waitUntil: "domcontentloaded" });
  await dmDesk.waitForSelector("#btnMapFull");
  await scene(dmDesk, "dm-desktop", "dm-desktop");

  const dmPhone = await browser.newPage();
  await dmPhone.setViewport(phone);
  await dmPhone.goto(ORIGIN + "/dm/index.html", { waitUntil: "domcontentloaded" });
  await dmPhone.waitForSelector("#btnMapFull");
  await scene(dmPhone, "dm-phone", "dm-phone");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn71 fullscreen chrome ok");

/**
 * N57 (sheet 0.3.168 / DMCC 0.2.181): the player Map tab uses the sheet Table log,
 * the same room feed as Fight / Table. The map's own chat dock stays mounted and
 * hidden, matching the DM page. Sending from the map lands in that log.
 *
 *   node tools/test-n57-player-table-log.mjs
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
const sheetCss = read("assets/css/sheet.css");
const host = read("map/ssdns-map-host.js");
const dmCss = read("dm/assets/css/dmcc.css");
const dmJs = read("dm/assets/js/dmcc.js");
check("ver.sheet", ver.sheet === "0.3.185" && ver.sheetBuild === "sheet-playtest-v03185", JSON.stringify(ver));
check("ver.dmcc", ver.dmcc === "0.2.198" && ver.dmccBuild === "dmcc-playtest-v02198");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.185"'));
check("ver.dmjs", dmJs.includes('VERSION = "0.2.198"'));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("0.3.169") && !read("database.rules.json").includes("0.2.182") && !read("assets/data/rules.js").includes("sheetDockText"));
check("src.playerSend", host.includes('input = $("sheetDockText") || $("logChatText")') && host.includes('form = $("sheetDockChat") || $("logChat")'));
check("src.dmSend", host.includes('input = $("dockText")') && host.includes('form = $("dockChat")') && !dmJs.includes("sheetDockText"));
check("src.hidePlayerMapChat", /body:has\(#sheetDock\) #mapMount \.ssdns-chatdock/.test(sheetCss) && /display: none !important/.test(sheetCss));
check("src.dmHideUnchanged", /#mapMount \.ssdns-chatdock,\s*\.ssdns-chat-float,\s*\.ssdns-chat-overlay \{ display: none !important; \}/.test(dmCss));
check("src.sheetChrome", read("index.html").includes('id="sheetDock"') && read("index.html").includes('id="sheetJoinCode"') && read("index.html").includes('id="btnSheetDockCollapse"') && read("index.html").includes('data-sheet-filter="rolls"'));

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".svg")) return "image/svg+xml";
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
await new Promise((resolve) => server.listen(8773, "127.0.0.1", resolve));
const ORIGIN = "http://127.0.0.1:8773";

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});

async function bootPlayer(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SSDNSSheet && window.SSDNSMapHost && document.querySelector("#sheetDockFeed"), { timeout: 20000 });
  return errs;
}

try {
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1440, height: 900 });
  const errs = await bootPlayer(desktop);
  await desktop.evaluate(() => {
    window.SSDNSSheet.addLog({ id: "chat:n57a", kind: "chat", text: "Ada: hold the door", ts: "2026-10-26T01:00:00.000Z" });
    window.SSDNSSheet.addLog({ id: "roll:n57a", kind: "roll", text: "Ada\n1d20 = 15", attack: true, nat: 15, formula: "1d20", ts: "2026-10-26T01:00:01.000Z" });
  });
  const shared = await desktop.evaluate(() => {
    const dock = document.querySelector("#sheetDockFeed").textContent || "";
    const log = document.querySelector("#logFeed").textContent || "";
    return {
      dockChat: dock.indexOf("Ada: hold the door") >= 0,
      dockRoll: dock.indexOf("1d20 = 15") >= 0,
      logChat: log.indexOf("Ada: hold the door") >= 0,
      logRoll: log.indexOf("1d20 = 15") >= 0,
      filters: !!document.querySelector('#sheetDock [data-sheet-filter="rolls"]'),
      chip: !!document.querySelector("#sheetJoinCode"),
      collapse: !!document.querySelector("#btnSheetDockCollapse")
    };
  });
  check("log.sharedBeforeMap", shared.dockChat && shared.dockRoll && shared.logChat && shared.logRoll && shared.filters && shared.chip && shared.collapse, JSON.stringify(shared));

  await desktop.evaluate(() => {
    const posted = [];
    window.__posted = posted;
    const Join = window.SSDNSDmJoin;
    Join.isJoined = function () { return true; };
    Join.roomCode = function () { return "https://table.example/sheet/?room=rust-77"; };
    Join.uid = function () { return "p1"; };
    Join.postChat = function (entry) { posted.push(entry); return Promise.resolve({ ok: true }); };
    Join.live = function () {
      return {
        joined: true,
        roomCode: "RUST-77",
        uid: "p1",
        dmUid: "dm",
        db: {},
        fb: {
          ref: function () { return {}; },
          onValue: function (_ref, cb) { cb({ val: function () { return null; } }); return function () {}; },
          set: function () { return Promise.resolve(); },
          remove: function () { return Promise.resolve(); }
        }
      };
    };
    if (window.SSDNSJoinCode) window.SSDNSJoinCode.sync();
    window.SSDNSMapHost.syncRoom();
  });
  await desktop.waitForFunction(() => document.querySelector("#mapMount [data-act=chatInput]"), { timeout: 20000 });
  await desktop.click("#tab-map");
  await sleep(200);
  const mapUi = await desktop.evaluate(() => {
    const dock = document.querySelector("#mapMount .ssdns-chatdock");
    const feed = document.querySelector("#sheetDockFeed").textContent || "";
    const map = document.querySelector("#mapMount");
    const cs = getComputedStyle(map);
    return {
      display: dock ? getComputedStyle(dock).display : "",
      inDom: !!dock,
      stillThere: feed.indexOf("Ada: hold the door") >= 0 && feed.indexOf("1d20 = 15") >= 0,
      areas: cs.gridTemplateAreas,
      cols: cs.gridTemplateColumns
    };
  });
  check("map.chatHidden", mapUi.inDom && mapUi.display === "none" && mapUi.stillThere, JSON.stringify(mapUi));
  check("map.columnReclaimed", !/"dock"/.test(mapUi.areas) && !/\b320px 320px\b/.test(mapUi.cols), JSON.stringify(mapUi));

  await desktop.evaluate(() => {
    const input = document.querySelector("#mapMount [data-act=chatInput]");
    input.value = "from the map";
    document.querySelector("#mapMount [data-act=chatSend]").click();
  });
  await sleep(200);
  await desktop.evaluate(() => {
    const input = document.querySelector("#logChatText");
    input.value = "from the table page";
    document.querySelector("#logChat").requestSubmit();
  });
  await sleep(200);
  const sent = await desktop.evaluate(() => {
    const dock = document.querySelector("#sheetDockFeed").textContent || "";
    const log = document.querySelector("#logFeed").textContent || "";
    const texts = (window.__posted || []).map((row) => row && row.text);
    return {
      dockMap: dock.indexOf("from the map") >= 0,
      dockTable: dock.indexOf("from the table page") >= 0,
      logMap: log.indexOf("from the map") >= 0,
      logTable: log.indexOf("from the table page") >= 0,
      posted: texts
    };
  });
  check("send.sameLog", sent.dockMap && sent.dockTable && sent.logMap && sent.logTable && sent.posted.indexOf("from the map") >= 0 && sent.posted.indexOf("from the table page") >= 0, JSON.stringify(sent));

  await desktop.evaluate(() => document.body.classList.add("map-fullscreen"));
  await sleep(300);
  const full = await desktop.evaluate(() => {
    const map = document.querySelector("#mapMount").getBoundingClientRect();
    const dock = document.querySelector("#sheetDock").getBoundingClientRect();
    const exit = document.querySelector("#btnMapFull").getBoundingClientRect();
    return {
      mapRight: Math.round(map.right),
      dockLeft: Math.round(dock.left),
      dockW: Math.round(dock.width),
      exitRight: Math.round(exit.right),
      dockShown: getComputedStyle(document.querySelector("#sheetDockFeed")).display !== "none"
    };
  });
  check("full.besideLog", full.dockW === 300 && full.mapRight <= full.dockLeft + 2 && full.exitRight <= full.dockLeft + 2 && full.dockShown, JSON.stringify(full));
  check("desktop.noPageError", errs.filter((e) => !/Firebase|firestore/i.test(e)).length === 0, errs.join(" | "));

  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const perrs = await bootPlayer(phone);
  await phone.evaluate(() => {
    window.SSDNSSheet.addLog({ id: "chat:n57p", kind: "chat", text: "Ada: phone line", ts: "2026-10-26T01:02:00.000Z" });
    const Join = window.SSDNSDmJoin;
    Join.isJoined = function () { return true; };
    Join.roomCode = function () { return "RUST-77"; };
    Join.uid = function () { return "p1"; };
    Join.live = function () {
      return {
        joined: true, roomCode: "RUST-77", uid: "p1", db: {},
        fb: {
          ref: function () { return {}; },
          onValue: function (_ref, cb) { cb({ val: function () { return null; } }); return function () {}; }
        }
      };
    };
    window.SSDNSMapHost.syncRoom();
  });
  await phone.waitForFunction(() => document.querySelector("#mapMount .ssdns-chatdock"), { timeout: 20000 });
  await sleep(200);
  const phoneClosed = await phone.evaluate(() => {
    const dock = document.querySelector("#mapMount .ssdns-chatdock");
    const fab = document.querySelector("#btnSheetDockFab");
    const sheet = document.querySelector("#sheetDock").getBoundingClientRect();
    const areas = getComputedStyle(document.querySelector("#mapMount")).gridTemplateAreas;
    return {
      mapChat: dock ? getComputedStyle(dock).display : "",
      fab: fab ? getComputedStyle(fab).display : "",
      sheetTop: Math.round(sheet.top),
      areas: areas
    };
  });
  check("phone.mapChatHidden", phoneClosed.mapChat === "none" && phoneClosed.fab !== "none" && phoneClosed.sheetTop >= 844 && !/"dock"/.test(phoneClosed.areas), JSON.stringify(phoneClosed));
  await phone.click("#btnSheetDockFab");
  await sleep(300);
  const phoneOpen = await phone.evaluate(() => {
    const sheet = document.querySelector("#sheetDock").getBoundingClientRect();
    const text = document.querySelector("#sheetDockFeed").textContent || "";
    const input = document.querySelector("#sheetDockText");
    return {
      open: document.body.classList.contains("dock-open"),
      top: Math.round(sheet.top),
      bottom: Math.round(sheet.bottom),
      hasLine: text.indexOf("Ada: phone line") >= 0,
      input: !!(input && getComputedStyle(input).display !== "none")
    };
  });
  check("phone.logOpens", phoneOpen.open && phoneOpen.top < 844 && phoneOpen.bottom <= 860 && phoneOpen.hasLine && phoneOpen.input, JSON.stringify(phoneOpen));
  await phone.evaluate(() => document.querySelector("#tab-map").click());
  await phone.evaluate(() => {
    document.body.classList.remove("dock-open");
    document.body.classList.add("map-fullscreen");
  });
  await sleep(250);
  const phoneFull = await phone.evaluate(() => {
    const fab = document.querySelector("#btnSheetDockFab");
    const exit = document.querySelector("#btnMapFull");
    const fr = fab.getBoundingClientRect();
    const er = exit.getBoundingClientRect();
    const fabHit = document.elementFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2);
    const exitHit = document.elementFromPoint(er.left + Math.min(8, er.width / 2), er.top + er.height / 2);
    return {
      fabHit: !!(fabHit && (fabHit === fab || fab.contains(fabHit))),
      exitHit: !!(exitHit && (exitHit === exit || exit.contains(exitHit))),
      line: (document.querySelector("#sheetDockFeed").textContent || "").indexOf("Ada: phone line") >= 0
    };
  });
  check("phone.fullscreenUsable", phoneFull.fabHit && phoneFull.exitHit && phoneFull.line, JSON.stringify(phoneFull));
  check("phone.noPageError", perrs.filter((e) => !/Firebase|firestore/i.test(e)).length === 0, perrs.join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn57 player table log ok");

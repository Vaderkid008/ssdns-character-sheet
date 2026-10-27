/**
 * B15: a joined table shows a clickable room-code chip on the Table log
 * (player sheet and DM feed) and on the docked map chat. The tap copies the
 * join code only. The DM hero code (#roomCodeDisplay) stays the big code.
 *
 *   node tools/test-b15-join-code.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const shots = path.join("/opt/cursor/artifacts");
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = JSON.parse(read("version.json"));
check("ver.sheet", ver.sheet === "0.3.161" && ver.sheetBuild === "sheet-playtest-v03161", JSON.stringify(ver));
check("ver.dmcc", ver.dmcc === "0.2.174" && ver.dmccBuild === "dmcc-playtest-v02174");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.161"'));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.174"'));

const sheetHtml = read("index.html");
const dmHtml = read("dm/index.html");
const chatSrc = read("map/ssdns-map-chat.js");
const dmSrc = read("dm/assets/js/dmcc.js");
const joinSrc = read("assets/js/dm-join.js");
const mapSrc = read("map/ssdns-map.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");

check("html.sheetChip", /id="sheetDock"[\s\S]*id="sheetJoinCode"[\s\S]*id="btnSheetDockCollapse"/.test(sheetHtml));
check("html.dmChip", /id="liveDock"[\s\S]*id="dockJoinCode"[\s\S]*id="btnDockCollapse"/.test(dmHtml));
check("html.hero", dmHtml.includes('class="room-code" id="roomCodeDisplay"') && !/id="roomCodeDisplay"[^>]*join-code-chip/.test(dmHtml));
check("html.invite", dmHtml.includes('id="btnCopyLink"') && dmHtml.includes('id="btnCopyCode"'));
check("src.helper", chatSrc.includes("root.SSDNSJoinCode") && chatSrc.includes("mountMap") && dmSrc.includes("copyRoomCode: copyRoomCode"));
check("src.playerSync", joinSrc.includes("SSDNSJoinCode.sync"));
check("src.dmSync", dmSrc.includes("SSDNSJoinCode.sync"));
check("src.mapUntouched", !mapSrc.includes("join-code-chip"));
check("src.rules", !rules.includes("join-code-chip") && !rulesJs.includes("join-code-chip") && !rulesJs.includes("sheetJoinCode"));

function makeWindow() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button type="button" class="join-code-chip" id="sheetJoinCode" hidden></button>
    <div class="ssdns-map" id="map"><div class="ssdns-chatdock"><div class="ssdns-chathead">
      <button type="button" data-act="chatToggle">Chat</button>
    </div></div></div>
    <div id="toast" hidden><span id="toastText"></span></div>
  </body></html>`, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const copied = [];
  w.navigator.clipboard = {
    writeText(text) { copied.push(String(text)); return Promise.resolve(); }
  };
  w.__copied = copied;
  const s = w.document.createElement("script");
  s.textContent = chatSrc;
  w.document.body.appendChild(s);
  return w;
}

const w = makeWindow();
const doc = w.document;
check("boot.api", !!(w.SSDNSJoinCode && w.SSDNSJoinCode.sync && w.SSDNSJoinCode.mountMap));
w.SSDNSJoinCode.sync();
check("idle.hidden", doc.getElementById("sheetJoinCode").hidden === true && doc.getElementById("sheetJoinCode").textContent === "");

w.SSDNSDmJoin = {
  isJoined() { return true; },
  roomCode() { return "https://table.example/sheet/?room=rust-77"; },
  live() { return { joined: true, roomCode: "https://table.example/sheet/?room=rust-77", db: {}, fb: {}, uid: "p1" }; }
};
w.SSDNSJoinCode.sync();
const sheetChip = doc.getElementById("sheetJoinCode");
check("player.showsCode", sheetChip.hidden === false && sheetChip.textContent === "RUST-77", sheetChip.textContent);
w.SSDNSJoinCode.mountMap(doc.getElementById("map"));
const mapChip = doc.querySelector("#map .join-code-chip");
check("map.chip", !!mapChip && mapChip.getAttribute("data-act") === "joinCode" && mapChip.textContent === "RUST-77" && mapChip.hidden === false);
check("map.nearToggle", mapChip.previousElementSibling && mapChip.previousElementSibling.getAttribute("data-act") === "chatToggle");

sheetChip.click();
await sleep(30);
check("player.copy", w.__copied[w.__copied.length - 1] === "RUST-77" && !/https?:/i.test(w.__copied.join(" ")), JSON.stringify(w.__copied));
check("player.toast", doc.getElementById("toastText").textContent === "Copied RUST-77", doc.getElementById("toastText").textContent);

doc.getElementById("map").classList.add("ssdns-chat-popped");
w.SSDNSJoinCode.sync();
check("map.hiddenWhenPopped", mapChip.hidden === true);
doc.getElementById("map").classList.remove("ssdns-chat-popped");
w.SSDNSJoinCode.sync();
check("map.backWhenDocked", mapChip.hidden === false && mapChip.textContent === "RUST-77");

w.SSDNSDmJoin.isJoined = () => false;
w.SSDNSJoinCode.sync();
check("player.left", sheetChip.hidden === true && mapChip.hidden === true);

let dmCalled = 0;
w.document.body.classList.add("in-room");
w.DMCC = {
  state: { roomCode: "https://dm.example/?room=DUST-4821", meta: { code: "DUST-4821" } },
  copyRoomCode() { dmCalled += 1; }
};
w.SSDNSDmJoin.isJoined = () => true;
w.SSDNSJoinCode.sync();
check("dm.showsCode", sheetChip.textContent === "DUST-4821", sheetChip.textContent);
const before = w.__copied.length;
sheetChip.click();
await sleep(20);
check("dm.usesHelper", dmCalled === 1 && w.__copied.length === before, String(dmCalled));

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".mp3")) return "audio/mpeg";
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
await new Promise((resolve) => server.listen(8771, "127.0.0.1", resolve));
const ORIGIN = "http://127.0.0.1:8771";

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
fs.mkdirSync(shots, { recursive: true });
try {
  const context = browser.defaultBrowserContext();
  await context.overridePermissions(ORIGIN, ["clipboard-read", "clipboard-write"]);

  const dm = await browser.newPage();
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.setViewport({ width: 1440, height: 900 });
  await dm.goto(ORIGIN + dmccUrl("/dm/index.html"), { waitUntil: "domcontentloaded" });
  await dmccOffline(dm);
  await dm.waitForSelector("#btnLoadDemo");
  check("dm.chipHiddenInLobby", await dm.$eval("#dockJoinCode", (el) => el.hidden === true));
  await dm.click("#btnLoadDemo");
  await dm.waitForFunction(() => {
    const chip = document.querySelector("#dockJoinCode");
    const hero = document.querySelector("#roomCodeDisplay");
    return chip && !chip.hidden && chip.textContent === "DUST-4821" && hero && hero.textContent.indexOf("DUST-4821") >= 0;
  }, { timeout: 20000 });
  await dm.screenshot({ path: path.join(shots, "b15-dm-hero-and-log.png") });
  const heroBox = await dm.$("#roomCodeDisplay");
  if (heroBox) await heroBox.screenshot({ path: path.join(shots, "b15-dm-hero.png") });
  const dockBox = await dm.$("#liveDock .dock-head");
  if (dockBox) await dockBox.screenshot({ path: path.join(shots, "b15-dm-table-log.png") });

  async function clip(page) {
    return page.evaluate(async () => {
      const text = await navigator.clipboard.readText();
      return String(text == null ? "" : text);
    });
  }
  await dm.evaluate(() => { const t = document.querySelector("#toast"); if (t) t.textContent = ""; });
  await dm.click("#dockJoinCode");
  await sleep(200);
  const chipClip = await clip(dm);
  const chipToast = await dm.$eval("#toast", (el) => el.textContent || "");
  check("dm.chipCopiesCode", chipClip === "DUST-4821" && chipToast === "Copied DUST-4821", JSON.stringify({ chipClip, chipToast }));
  await dm.click("#roomCodeDisplay");
  await sleep(200);
  const heroClip = await clip(dm);
  check("dm.heroStillCopiesCode", heroClip === "DUST-4821", heroClip);
  await dm.click("#btnCopyLink");
  await sleep(250);
  const invite = await clip(dm);
  check("dm.inviteStillUrl", /https?:/i.test(invite) && invite.indexOf("room=DUST-4821") >= 0 && invite !== "DUST-4821", invite);

  await dm.click("#tab-map");
  await dm.waitForFunction(() => document.querySelector("#mapMount .ssdns-chathead .join-code-chip"), { timeout: 20000 });
  const dmMap = await dm.evaluate(() => {
    const btn = document.querySelector("#mapMount .join-code-chip");
    const dock = document.querySelector("#mapMount .ssdns-chatdock");
    return {
      text: btn ? btn.textContent : "",
      hidden: !!(btn && btn.hidden),
      dockDisplay: dock ? getComputedStyle(dock).display : ""
    };
  });
  check("dm.mapChip", dmMap.text === "DUST-4821" && dmMap.hidden === false, JSON.stringify(dmMap));
  check("dm.mapChatStillHidden", dmMap.dockDisplay === "none", dmMap.dockDisplay);
  check("dm.noPageError", dmErrs.length === 0, dmErrs.join(" | "));

  const player = await browser.newPage();
  const plErrs = [];
  player.on("pageerror", (e) => plErrs.push(String(e)));
  await player.setViewport({ width: 1440, height: 900 });
  await player.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await player.waitForFunction(() => window.SSDNSDmJoin && window.SSDNSJoinCode && document.querySelector("#sheetJoinCode"), { timeout: 20000 });
  check("player.hiddenUntilJoin", await player.$eval("#sheetJoinCode", (el) => el.hidden === true && el.textContent === ""));
  await player.evaluate(() => {
    const Join = window.SSDNSDmJoin;
    Join.isJoined = function () { return true; };
    Join.roomCode = function () { return "https://table.example/sheet/?room=rust-77"; };
    Join.live = function () { return { joined: true, roomCode: "https://table.example/sheet/?room=rust-77", db: {}, fb: {}, uid: "p1" }; };
    window.SSDNSJoinCode.sync();
  });
  await player.waitForFunction(() => {
    const el = document.querySelector("#sheetJoinCode");
    return el && !el.hidden && el.textContent === "RUST-77";
  });
  const logHead = await player.$("#sheetDock .dock-head");
  if (logHead) await logHead.screenshot({ path: path.join(shots, "b15-player-table-log.png") });
  await player.click("#sheetJoinCode");
  await sleep(250);
  const playerClip = await clip(player);
  const playerToast = await player.$eval("#toastText", (el) => el.textContent || "");
  check("player.browserCopy", playerClip === "RUST-77" && playerToast === "Copied RUST-77", JSON.stringify({ playerClip, playerToast }));

  await player.click("#tab-map");
  await player.evaluate(async () => {
    const scene = await fetch("map/scene-dusty-spur.json").then((r) => r.json());
    const el = document.querySelector("#mapMount");
    el.hidden = false;
    document.querySelector("#mapIdle").hidden = true;
    window.SSDNSMap.create({
      el: el,
      role: "player",
      uid: "p1",
      adapter: window.SSDNSMapFirebase.memory({ role: "player" }),
      host: { on() {} },
      options: { scene: scene, assetBase: "map/" }
    });
  });
  await player.waitForFunction(() => {
    const el = document.querySelector("#mapMount .join-code-chip");
    return el && !el.hidden && el.textContent === "RUST-77";
  }, { timeout: 20000 });
  /* N57: the map chat dock stays mounted (B15 chip included) but is not the feed.
     The visible room code on the Map tab is the Table log chip. */
  const mapState = await player.evaluate(() => {
    const dock = document.querySelector("#mapMount .ssdns-chatdock");
    const chip = document.querySelector("#mapMount .join-code-chip");
    const sheet = document.querySelector("#sheetJoinCode");
    const sheetCs = sheet ? getComputedStyle(sheet) : null;
    return {
      dockDisplay: dock ? getComputedStyle(dock).display : "",
      chipText: chip ? chip.textContent : "",
      chipHidden: !!(chip && chip.hidden),
      sheetText: sheet ? sheet.textContent : "",
      sheetShown: !!(sheet && !sheet.hidden && sheetCs && sheetCs.display !== "none")
    };
  });
  check("player.mapChatHidden", mapState.dockDisplay === "none", JSON.stringify(mapState));
  check("player.mapChipMounted", mapState.chipText === "RUST-77" && mapState.chipHidden === false, JSON.stringify(mapState));
  check("player.tableLogChipOnMap", mapState.sheetShown && mapState.sheetText === "RUST-77", JSON.stringify(mapState));
  const mapBox = await player.$("#mapMount");
  if (mapBox) await mapBox.screenshot({ path: path.join(shots, "b15-player-map-dock.png") });
  const logHeadMap = await player.$("#sheetDock .dock-head");
  if (logHeadMap) await logHeadMap.screenshot({ path: path.join(shots, "b15-player-map-chip.png") });
  await player.click("#sheetJoinCode");
  await sleep(200);
  const mapClip = await clip(player);
  check("player.mapCopy", mapClip === "RUST-77", mapClip);

  const popped = await player.evaluate(() => {
    const btn = document.querySelector("#mapMount [data-act=chatPop]");
    btn.click();
    const map = document.querySelector("#mapMount");
    const chip = map.querySelector(".join-code-chip");
    const sheet = document.querySelector("#sheetJoinCode");
    return {
      popped: map.classList.contains("ssdns-chat-popped"),
      hidden: !!(chip && chip.hidden),
      sheetShown: !!(sheet && !sheet.hidden)
    };
  });
  check("player.mapHiddenWhenPopped", popped.popped === true && popped.hidden === true && popped.sheetShown === true, JSON.stringify(popped));
  await player.evaluate(() => {
    const dock = document.querySelector("[data-act=floatDock]");
    if (dock) dock.click();
  });
  await sleep(200);
  const docked = await player.evaluate(() => {
    const map = document.querySelector("#mapMount");
    const chip = map.querySelector(".join-code-chip");
    const sheet = document.querySelector("#sheetJoinCode");
    return {
      popped: map.classList.contains("ssdns-chat-popped"),
      hidden: chip.hidden,
      text: chip.textContent,
      sheetText: sheet ? sheet.textContent : "",
      sheetShown: !!(sheet && !sheet.hidden && getComputedStyle(sheet).display !== "none")
    };
  });
  check("player.mapChipDocked", docked.popped === false && docked.hidden === false && docked.text === "RUST-77" && docked.sheetShown && docked.sheetText === "RUST-77", JSON.stringify(docked));
  check("player.noPageError", plErrs.filter((e) => !/Firebase|firestore|net::/i.test(e)).length === 0, plErrs.join(" | "));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nb15 join-code chip ok");

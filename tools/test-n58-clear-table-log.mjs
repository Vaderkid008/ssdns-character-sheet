/**
 * N58: DM clear TABLE LOG (sheet 0.3.174 / DMCC 0.2.187).
 * Cleared-at watermark. Chat, rolls, and table-feed lines drop out of every
 * table-log renderer. Ledger rows, roll history, tokens, initiative, and HP stay.
 *
 *   node tools/test-n58-clear-table-log.mjs
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = JSON.parse(read("version.json"));
const rules = read("database.rules.json");
const dmHtml = read("dm/index.html");
const playerHtml = read("index.html");
const dmJs = read("dm/assets/js/dmcc.js");
const sheetJs = read("assets/js/sheet-extras.js");
const mapJs = read("map/ssdns-map.js");
const chatJs = read("map/ssdns-map-chat.js");
const rulesJs = read("assets/data/rules.js");

check("ver.sheet", ver.sheet === "0.3.180" && ver.sheetBuild === "sheet-playtest-v03180", JSON.stringify(ver));
check("ver.dmcc", ver.dmcc === "0.2.193" && ver.dmccBuild === "dmcc-playtest-v02193");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.180"') && read("assets/js/app.js").includes("sheet-playtest-v03180"));
check("ver.dmjs", dmJs.includes('VERSION = "0.2.193"') && dmJs.includes("dmcc-playtest-v02193"));
check("src.rulesJsUntouched", !rulesJs.includes("logClearedAt") && !rulesJs.includes("0.3.174") && !rulesJs.includes("Clear log"));
check("src.playerHasNoButton", !playerHtml.includes("btnClearLog") && !playerHtml.includes(">Clear log<"));
check("src.dmButton", dmHtml.includes('id="btnClearLog"') && dmHtml.includes(">Clear log<") && dmHtml.indexOf("btnClearLog") < dmHtml.indexOf("btnDockPop"));
check("src.confirmCopy", dmJs.includes("Clear the table log for everyone in this room?") && dmJs.includes("Chat history disappears from all screens. Tokens, initiative, HP and money are not touched.") && dmJs.includes('"Clear log"') && dmJs.includes("DM cleared the table log"));
check("src.watermarkNotDelete", dmJs.includes('roomRef("table/logClearedAt")') && !dmJs.includes("remove(roomRef(\"ledger") && !dmJs.includes("remove(roomRef(\"rolls") && !dmJs.includes("remove(roomRef(\"chat"));
check("src.playerHides", sheetJs.includes("logHidden") && read("assets/js/dm-join.js").includes("setClearedAt"));
check("src.mapStillFeeds", mapJs.indexOf("fxFromFeed") < mapJs.indexOf("function mapChatItems") && mapJs.includes("logRowHidden") && mapJs.includes('dm: role === "dm"'));
check("src.popClear", chatJs.includes('data-act="clearLog"') && chatJs.includes('data.op === "clear"') && chatJs.includes('post("clear")') && chatJs.includes("popClear") && read("map/chat-pop.html").includes('id="popClear" hidden'));
check("rules.dmOnly", /"logClearedAt":\s*\{\s*"\.write":\s*"auth != null && root\.child\('rooms\/'\+\$roomCode\+'\/meta\/dmUid'\)\.val\(\) === auth\.uid"/.test(rules) && rules.includes('"logClearedAt"') && rules.includes("newData.isNumber()"));

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
await new Promise((resolve) => server.listen(8788, "127.0.0.1", resolve));
const ORIGIN = "http://127.0.0.1:8788";

const CUT = Date.parse("2026-06-01T00:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const NEW = "2026-12-01T00:00:00.000Z";

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
    runScripts: "dangerously"
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.matchMedia = function () {
    return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
  };
  w.fetch = async function (url) {
    const name = String(url).split("/").pop();
    const file = path.join(root, "map", name);
    if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => { throw new Error("missing"); } };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}

const mapWin = makeWindow();
addScript(mapWin, "assets/js/apply-guard.js");
addScript(mapWin, "map/ssdns-map-chat.js");
addScript(mapWin, "map/ssdns-map-firebase.js");
addScript(mapWin, "map/ssdns-map.js");
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const mapEl = mapWin.document.createElement("div");
mapEl.className = "ssdns-map";
mapEl.style.width = "1000px";
mapEl.style.height = "700px";
mapWin.document.body.appendChild(mapEl);
const mapApi = mapWin.SSDNSMap.create({
  el: mapEl,
  role: "player",
  uid: "p_jolene",
  adapter: mapWin.SSDNSMapFirebase.memory({ role: "player" }),
  host: { on() {} },
  options: { scene, assetBase: "", room: { table: { initiative: { round: 2, turn: 1, order: [{ id: "p1", kind: "player", name: "Ada" }] } } } }
});
await sleep(60);
const tokensBefore = mapEl.querySelectorAll("canvas").length;
mapWin.SSDNSTableLog.setClearedAt(CUT);
mapApi.pushFeed({ id: "old-feed", from: "dm", fromName: "DM", kind: "chat", text: "old table line", ts: OLD });
mapApi.pushFeed({ id: "sfx-old", from: "dm", kind: "sfx", event: "click", text: "click", ts: OLD });
mapApi.pushFeed({ id: "new-feed", from: "p_jolene", fromName: "Ada", kind: "chat", text: "new table line", ts: NEW });
mapApi.pushFeed({ id: "req-after", from: "p_jolene", kind: "chat", text: "asset request after clear", ts: NEW, fxReq: { name: "spark" } });
const mapLog = mapEl.querySelector("[data-act=chatlog]").textContent || "";
check("map.hidesOld", mapLog.indexOf("old table line") < 0 && mapLog.indexOf("new table line") >= 0 && mapLog.indexOf("asset request after clear") >= 0, mapLog);
check("map.sfxSkipped", mapLog.indexOf("click") < 0, mapLog);
check("map.canvasUntouched", mapEl.querySelectorAll("canvas").length === tokensBefore);
const late = mapWin.document.createElement("div");
mapWin.SSDNSMapChat.render(late, [
  { id: "a", kind: "chat", who: "Ada", text: "before", ts: OLD },
  { id: "b", kind: "chat", who: "Ada", text: "DM cleared the table log", ts: new Date(CUT + 1).toISOString() },
  { id: "c", kind: "roll", who: "Ada", text: "1d20 = 18", ts: NEW }
], "all");
check("pop.renderHides", late.textContent.indexOf("before") < 0 && late.textContent.indexOf("DM cleared the table log") >= 0 && late.textContent.indexOf("1d20 = 18") >= 0, late.textContent);
mapApi.destroy();
mapWin.matchMedia = function (q) {
  const m = String(q).match(/max-width:\s*(\d+)/);
  const max = m ? Number(m[1]) : 0;
  return { matches: max >= 599, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
};
const phoneHost = mapWin.document.createElement("div");
mapWin.document.body.appendChild(phoneHost);
const phoneUi = mapWin.SSDNSMapChat.attach({ root: phoneHost, dm: false });
mapWin.SSDNSMapChat.publish([
  { id: "old", kind: "chat", who: "Ada", text: "hold the door", ts: OLD },
  { id: "new", kind: "chat", who: "Ada", text: "after the clear", ts: NEW }
]);
phoneUi.pop();
const phoneOverlay = mapWin.document.querySelector("[data-act=chatOverlay]");
const phoneText = phoneOverlay ? phoneOverlay.textContent : "";
const phoneClears = phoneOverlay ? [...phoneOverlay.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "Clear log") : [];
check("phone.overlay", !!phoneOverlay && phoneText.indexOf("hold the door") < 0 && phoneText.indexOf("after the clear") >= 0 && phoneClears.length === 0, phoneText);
const dmHost = mapWin.document.createElement("div");
mapWin.document.body.appendChild(dmHost);
let dmClears = 0;
const dmUi = mapWin.SSDNSMapChat.attach({ root: dmHost, dm: true, onClear: function () { dmClears += 1; } });
dmUi.pop();
const dmOverlay = [...mapWin.document.querySelectorAll("[data-act=chatOverlay]")].pop();
const dmClearBtn = dmOverlay && dmOverlay.querySelector("[data-act=clearLog]");
if (dmClearBtn) dmClearBtn.click();
check("phone.dmClear", !!dmClearBtn && dmClears === 1, String(dmClears));

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
  await page.waitForFunction(() => window.SSDNSSheet && window.SSDNSTableLog && document.querySelector("#sheetDockFeed"), { timeout: 20000 });
  return errs;
}

try {
  const player = await browser.newPage();
  await player.setViewport({ width: 1440, height: 900 });
  const playerErrs = await bootPlayer(player);
  check("player.noControl", await player.evaluate(() => !document.querySelector("#btnClearLog") && ![...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Clear log")));
  await player.evaluate((oldTs, cut) => {
    window.SSDNSSheet.addLog({ id: "chat:old", kind: "chat", text: "Ada: hold the door", ts: oldTs });
    window.SSDNSSheet.addLog({ id: "roll:old", kind: "roll", text: "Ada\n1d20 = 15", attack: true, nat: 15, formula: "1d20", ts: oldTs });
    window.SSDNSSheet.addLog({ id: "hp:old", kind: "hp", text: "HP 17 → 12", ts: oldTs });
    const hp = document.querySelector("#inHPCur");
    window.__hp = hp ? hp.value : "";
    window.SSDNSTableLog.setClearedAt(cut);
  }, OLD, CUT);
  await sleep(50);
  const cleared = await player.evaluate(() => {
    const dock = document.querySelector("#sheetDockFeed").textContent || "";
    const log = document.querySelector("#logFeed").textContent || "";
    const hp = document.querySelector("#inHPCur");
    return {
      dockOld: dock.indexOf("hold the door") >= 0 || dock.indexOf("1d20 = 15") >= 0 || dock.indexOf("HP 17") >= 0,
      logOld: log.indexOf("hold the door") >= 0 || log.indexOf("1d20 = 15") >= 0 || log.indexOf("HP 17") >= 0,
      hp: hp ? hp.value : "",
      hpBefore: window.__hp
    };
  });
  check("player.hidesPreClear", !cleared.dockOld && !cleared.logOld, JSON.stringify(cleared));
  check("player.hpUntouched", cleared.hp === cleared.hpBefore, JSON.stringify(cleared));
  await player.evaluate((cut) => {
    window.SSDNSSheet.addLog({ id: "chat:notice", kind: "chat", text: "DM cleared the table log", ts: new Date(cut + 1).toISOString() });
    window.SSDNSSheet.addLog({ id: "chat:new", kind: "chat", text: "Ada: after the clear", ts: "2026-12-01T00:00:02.000Z" });
    window.SSDNSSheet.addLog({ id: "roll:new", kind: "roll", text: "Ada\n1d20 = 19", attack: true, nat: 19, formula: "1d20", ts: "2026-12-01T00:00:03.000Z" });
  }, CUT);
  await sleep(40);
  const after = await player.evaluate(() => {
    const dock = document.querySelector("#sheetDockFeed").textContent || "";
    const log = document.querySelector("#logFeed").textContent || "";
    const popped = (window.SSDNSChatDockItems || []).map((row) => row.text || "").join("\n");
    return {
      notice: dock.indexOf("DM cleared the table log") >= 0 && log.indexOf("DM cleared the table log") >= 0,
      fresh: dock.indexOf("after the clear") >= 0 && dock.indexOf("1d20 = 19") >= 0 && log.indexOf("after the clear") >= 0,
      oldGone: dock.indexOf("hold the door") < 0 && log.indexOf("hold the door") < 0,
      pop: popped.indexOf("after the clear") >= 0 && popped.indexOf("hold the door") < 0
    };
  });
  check("player.showsNew", after.notice && after.fresh && after.oldGone && after.pop, JSON.stringify(after));

  await player.evaluate(() => {
    const Join = window.SSDNSDmJoin;
    Join.isJoined = function () { return true; };
    Join.roomCode = function () { return "RUST-77"; };
    Join.uid = function () { return "p1"; };
    Join.live = function () {
      return {
        joined: true, roomCode: "RUST-77", uid: "p1", dmUid: "dm", db: {},
        fb: { ref: function () { return {}; }, onValue: function (_r, cb) { cb({ val: function () { return null; } }); return function () {}; }, set: function () { return Promise.resolve(); }, remove: function () { return Promise.resolve(); } }
      };
    };
    window.SSDNSMapHost.syncRoom();
  });
  await player.waitForSelector("#mapMount .ssdns-chatdock", { timeout: 20000 });
  await player.click("#tab-map");
  await sleep(200);
  const onMap = await player.evaluate(() => {
    const dock = document.querySelector("#sheetDockFeed").textContent || "";
    const mapChat = document.querySelector("#mapMount .ssdns-chatdock");
    return {
      shared: dock.indexOf("after the clear") >= 0 && dock.indexOf("hold the door") < 0,
      mapHidden: !!(mapChat && getComputedStyle(mapChat).display === "none"),
      noClear: ![...document.querySelectorAll("button")].some((b) => (b.textContent || "").trim() === "Clear log" && b.offsetParent)
    };
  });
  check("player.mapTab", onMap.shared && onMap.mapHidden && onMap.noClear, JSON.stringify(onMap));
  check("player.quiet", playerErrs.length === 0, playerErrs.join(" | "));

  const dm = await browser.newPage();
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.setViewport({ width: 1440, height: 900 });
  await dm.goto(ORIGIN + dmccUrl("/dm/index.html"), { waitUntil: "domcontentloaded" });
  await dmccOffline(dm);
  await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await dm.waitForFunction(() => window.DMCC.state.demo && document.querySelector("#btnClearLog"), { timeout: 20000 });
  await sleep(400);
  const armed = await dm.evaluate(() => {
    const st = window.DMCC.state;
    st.table = { initiative: { round: 3, turn: 1, order: [{ id: "p_jolene", kind: "player", name: "Jolene" }] } };
    const feed = document.querySelector("#dockFeed").textContent || "";
    return {
      button: document.querySelector("#btnClearLog").textContent.trim(),
      oldChat: feed.indexOf("I check under the bar") >= 0,
      players: JSON.stringify(st.players),
      ledger: st.ledger.map((e) => e.id).join(","),
      rolls: st.rolls.map((r) => r.id).join(","),
      chat: st.chat.map((c) => c.id).join(","),
      hp: st.players.p_jolene.snapshot.hpCurrent,
      init: JSON.stringify(st.table.initiative),
      strip: (document.querySelector("#mapMount .ssm-turnstrip") || {}).textContent || ""
    };
  });
  check("dm.button", armed.button === "Clear log" && armed.oldChat, JSON.stringify({ button: armed.button, oldChat: armed.oldChat }));

  await dm.click("#btnClearLog");
  await dm.waitForSelector("dialog.dlg", { timeout: 4000 });
  const dialog = await dm.evaluate(() => {
    const dlg = document.querySelector("dialog.dlg");
    return {
      title: dlg.querySelector("h2").textContent,
      body: dlg.querySelector("p").textContent,
      yes: dlg.querySelector("[value=yes]").textContent.trim(),
      no: dlg.querySelector("[value=no]").textContent.trim()
    };
  });
  check("dm.confirm", dialog.title === "Clear the table log for everyone in this room?" && dialog.body === "Chat history disappears from all screens. Tokens, initiative, HP and money are not touched." && dialog.yes === "Clear log" && dialog.no === "Cancel", JSON.stringify(dialog));
  await dm.click("dialog.dlg [value=no]");
  await sleep(80);
  const cancelled = await dm.evaluate(() => ({
    dialogs: document.querySelectorAll("dialog.dlg").length,
    oldChat: (document.querySelector("#dockFeed").textContent || "").indexOf("I check under the bar") >= 0,
    marked: window.DMCC.state.logClearedAt
  }));
  check("dm.cancel", cancelled.dialogs === 0 && cancelled.oldChat && !cancelled.marked, JSON.stringify(cancelled));

  await dm.click("#btnClearLog");
  await dm.waitForSelector("dialog.dlg [value=yes]", { timeout: 4000 });
  await dm.click("dialog.dlg [value=yes]");
  await sleep(120);
  const wiped = await dm.evaluate((before) => {
    const st = window.DMCC.state;
    const feed = document.querySelector("#dockFeed").textContent || "";
    const rolls = document.querySelector("#rollsFeed").textContent || "";
    const ledger = document.querySelector("#ledgerFeed").textContent || "";
    const badge = document.querySelector("#dockStripBadge");
    return {
      oldHidden: feed.indexOf("I check under the bar") < 0 && feed.indexOf("Blacksnake") < 0,
      notice: feed.indexOf("DM cleared the table log") >= 0,
      chatKept: before.chat.split(",").every((id) => st.chat.some((c) => c.id === id)) && st.chat.some((c) => c.text === "DM cleared the table log"),
      ledgerSame: st.ledger.map((e) => e.id).join(",") === before.ledger,
      rollsSame: st.rolls.map((r) => r.id).join(",") === before.rolls,
      playersSame: JSON.stringify(st.players) === before.players,
      hp: st.players.p_jolene.snapshot.hpCurrent === before.hp,
      init: JSON.stringify(st.table.initiative) === before.init,
      rollsPanel: rolls.indexOf("Blacksnake") >= 0,
      ledgerPanel: ledger.indexOf("Saloon") >= 0 || ledger.indexOf("ES") >= 0 || ledger.length > 20,
      badgeHidden: !!(badge && badge.hidden),
      mark: typeof st.logClearedAt === "number" && st.logClearedAt > 0
    };
  }, armed);
  check("dm.cleared", wiped.oldHidden && wiped.notice && wiped.chatKept && wiped.mark, JSON.stringify(wiped));
  check("dm.ledgerUntouched", wiped.ledgerSame && wiped.rollsSame && wiped.playersSame && wiped.hp && wiped.init && wiped.rollsPanel && wiped.ledgerPanel, JSON.stringify(wiped));
  check("dm.badgeReset", wiped.badgeHidden, JSON.stringify(wiped));

  await dm.click("#btnDockCollapse");
  await sleep(200);
  await dm.evaluate(() => {
    const input = document.querySelector("#dockText");
    input.value = "after the wipe";
    document.querySelector("#dockChat").requestSubmit();
  });
  await sleep(80);
  const badge = await dm.evaluate(() => {
    const el = document.querySelector("#dockStripBadge");
    const feed = document.querySelector("#dockFeed").textContent || "";
    return { hidden: el.hidden, text: el.textContent, fresh: feed.indexOf("after the wipe") >= 0, old: feed.indexOf("I check under the bar") >= 0 };
  });
  check("dm.unreadAfter", badge.hidden === false && badge.text === "1" && badge.fresh && !badge.old, JSON.stringify(badge));

  await dm.evaluate(() => {
    window.__pop = null;
    window.open = (url) => {
      const fake = { closed: false, messages: [], postMessage(data) { this.messages.push(data); }, close() { this.closed = true; }, focus() {} };
      window.__pop = fake;
      return fake;
    };
  });
  await dm.evaluate(() => document.querySelector("#btnDockPop").click());
  await sleep(150);
  const popped = await dm.evaluate(() => {
    const pop = window.__pop;
    const items = pop && pop.messages ? pop.messages.filter((m) => m && m.op === "items") : [];
    const last = items[items.length - 1] || {};
    const texts = (last.items || []).map((row) => row.text || "").join("\n");
    return { dm: last.dm === true, old: texts.indexOf("I check under the bar") >= 0, notice: texts.indexOf("DM cleared the table log") >= 0, fresh: texts.indexOf("after the wipe") >= 0 };
  });
  check("dm.popFiltered", popped.dm && !popped.old && popped.notice && popped.fresh, JSON.stringify(popped));
  check("dm.quiet", dmErrs.length === 0, dmErrs.join(" | "));
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error("\n" + failures.length + " failed\n" + failures.join("\n"));
  process.exit(1);
}
console.log("n58 clear table log ok");

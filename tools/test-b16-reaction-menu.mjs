/**
 * B16: a ready Reaction pip opens the reaction picker.
 *   Opportunity attack reuses the DM ask. Approved OA still spends Reaction, not Action.
 *   Reaction spells are the prepared/known list whose casting time is a reaction.
 *   Mark used confirms, like Action and Bonus.
 *   A spent Reaction is a fading player toast only: no sheet log and no table chat.
 *   The same R button is the one in the sheet turn strip and the map player strip.
 *   node tools/test-b16-reaction-menu.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dom = new JSDOM('<div class="firearms"><div class="box-head"><h2>Guns</h2></div></div><div id="turnSlot"></div>', { url: "http://127.0.0.1/", runScripts: "dangerously" });
const w = dom.window;
const fades = [], chats = [], logs = [], asked = [], toasts = [];
let answer = null;
let oaCalls = 0;
const character = {
  name: "Caleb",
  calling: "frontier-preacher",
  level: 5,
  cantrips: ["Sacred Flame"],
  spells: {
    1: [
      { name: "Shield", prepared: true },
      { name: "Hellish Rebuke", prepared: true },
      { name: "Healing Word", prepared: true },
      { name: "Cure Wounds", prepared: false }
    ],
    3: [{ name: "Counterspell", prepared: true }, { name: "Fireball", prepared: true }]
  }
};
w.SSDNSToast = (m) => toasts.push(String(m));
w.SSDNSSheet = { addLog: (e) => logs.push(e) };
w.SSDNSDmJoin = {
  uid: () => "u1",
  pushTurnMarkers: () => {},
  fadeToast: (m) => fades.push(String(m)),
  postChat: (m) => chats.push({ chat: m }),
  postLedger: (m) => chats.push({ ledger: m })
};
w.SSDNSAsk = { confirm: (msg) => new Promise((res) => { asked.push(msg); answer = res; }) };
w.SSDNSTurnLock = { askOa: () => { oaCalls += 1; } };
w.SSDNS_SPELL_FX = { "warding flash": { does: "You cast this as a reaction when you are hit." }, "shocking grasp": { does: "On a hit it cannot take reactions until the start of its next turn." } };
w.SSDNSApp = { doc: () => ({ character: character }) };
vm.runInContext(read("assets/js/action-pips.js"), dom.getInternalVMContext(), { filename: "action-pips.js" });
const P = w.SSDNSActionPips;
const $ = (s, r) => (r || w.document).querySelector(s);
const $$ = (s, r) => [...(r || w.document).querySelectorAll(s)];
P.reset(true);

check("list.prepared", P.reactionChoices().map((s) => s.name).join(",") === "Hellish Rebuke,Shield,Counterspell", P.reactionChoices().map((s) => s.name).join(","));
character.spells[1].push({ name: "Warding Flash", prepared: true });
check("list.castingText", P.reactionChoices().some((s) => s.name === "Warding Flash") && P.spellCost("Warding Flash") === "reaction");
check("list.notTakeReactions", P.spellCost("Shocking Grasp") === "action" && !P.reactionChoices().some((s) => /shocking grasp/i.test(s.name)));
const only = [{ level: 1, name: "Shield", value: "1:Shield" }, { level: 1, name: "Healing Word", value: "1:Healing Word" }];
w.SSDNSApp.castChoices = () => only;
check("list.castChoices", P.reactionChoices().map((s) => s.name).join(",") === "Shield");
delete w.SSDNSApp.castChoices;

function pip(where) { return $((where ? where + " " : "") + "[data-pip=reaction]"); }
function openFrom(el) { el.click(); return $("[data-pip-react-menu]"); }
function labels(menu) { return $$( "button", menu).map((b) => b.querySelector("b").textContent); }

const sheetMenu = openFrom(pip());
check("menu.weapons", !!sheetMenu && labels(sheetMenu).join("|") === "Opportunity attack|Hellish Rebuke|Shield|Warding Flash|Counterspell|Mark used", labels(sheetMenu || { querySelectorAll: () => [] }).join("|"));
pip().click();
check("menu.toggleClosed", !$("[data-pip-react-menu]") && P.state().reaction === false);

$("#turnSlot").innerHTML = P.html().replace('class="act-pips"', 'class="act-pips tl-pips"');
const stripMenu = openFrom($("#turnSlot [data-pip=reaction]"));
check("menu.turnStrip", !!stripMenu && stripMenu.querySelector("[data-pip-react=oa] b").textContent === "Opportunity attack" && !!stripMenu.querySelector('[data-pip-spell="Shield"]'));
w.document.body.click();
check("menu.outsideCloses", !$("[data-pip-react-menu]"));

openFrom(pip());
$("[data-pip-react=mark]").click();
check("mark.asked", asked[0] === "Are you sure you want to use your Reaction?" && P.state().reaction === false, asked.join(" | "));
answer(false);
await Promise.resolve();
check("mark.cancel", P.state().reaction === false);
openFrom(pip());
$("[data-pip-react=mark]").click();
answer(true);
await Promise.resolve();
check("mark.spends", P.state().reaction === true && logs.some((e) => /Reaction marked used/.test(e.text)) && !chats.length, JSON.stringify(logs));

P.reset(true);
logs.length = 0;
openFrom($("#turnSlot [data-pip=reaction]"));
$("[data-pip-react=oa]").click();
check("oa.asks", oaCalls === 1 && P.state().reaction === false && P.state().oaReq === "", JSON.stringify(P.state()));
P.setOa("oaArmed", "oa_ok");
openFrom(pip());
const beforeOa = oaCalls;
$("[data-pip-react=oa]").click();
check("oa.armedNoSecondAsk", oaCalls === beforeOa && /approved/i.test(toasts.at(-1) || ""));
const atk = P.attack("Peacemaker");
check("oa.spendsReaction", atk.oa === "oa_ok" && P.state().reaction === true && P.state().action === false, JSON.stringify(P.state()));

P.reset(true);
fades.length = 0; toasts.length = 0; chats.length = 0; logs.length = 0;
P.spend("reaction", "Shield");
const nLog = logs.length;
pip().click();
check("spent.toastOnly", toasts[0] === "Reaction already used." && !fades.length && !chats.length && logs.length === nLog && !$("[data-pip-react-menu]") && P.state().reaction === true, JSON.stringify({ toasts, fades, chats, logs: logs.slice(nLog) }));
$("#turnSlot").innerHTML = P.html();
$("#turnSlot [data-pip=reaction]").click();
check("spent.stripToastOnly", toasts.length === 2 && toasts[1] === "Reaction already used." && !fades.length && !chats.length);
const nBlock = chats.length;
check("spent.blockMap", P.blockMap("reaction", "Shield") === "Reaction already used." && chats.length === nBlock && toasts.at(-1) === "Reaction already used." && !fades.length);
P.setOa("oaArmed", "oa_late");
check("spent.oaRoll", P.blockMap("attack", "Opportunity attack") === "Reaction already used." && chats.length === nBlock && !fades.length);

P.reset(true);
let castKey = "";
w.document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest && e.target.closest("[data-spell-cast]");
  if (b) castKey = b.getAttribute("data-spell-cast") || "";
}, true);
openFrom(pip());
$('[data-pip-spell="Hellish Rebuke"]').click();
check("spell.opensCast", castKey === "1:Hellish Rebuke" && P.state().reaction === false, castKey);
P.spell("Hellish Rebuke");
check("spell.castSpends", P.state().reaction === true && P.state().action === false);

const dm = w.document.createElement("button");
dm.setAttribute("data-dm-pip", "reaction");
dm.textContent = "R";
w.document.body.appendChild(dm);
P.reset(true);
dm.click();
check("dm.pipIgnored", P.state().reaction === false && !$("[data-pip-react-menu]"));

const ver = JSON.parse(read("version.json"));
const pips = read("assets/js/action-pips.js");
const css = read("assets/css/sheet.css");
check("src.menuCss", /\.pip-react-menu/.test(css) && /data-pip-react-menu/.test(pips));
check("src.noAutoPrompt", !/leaveReach|onHit/.test(pips.slice(pips.indexOf("function openReactionMenu"))));
check("src.versions", ver.sheet === "0.3.164" && ver.dmcc === "0.2.177" && ver.sheetBuild === "sheet-playtest-v03164" && ver.dmccBuild === "dmcc-playtest-v02177");
check("src.rulesUntouched", !read("assets/data/rules.js").includes("0.3.164") && !read("database.rules.json").includes("0.3.164") && !read("assets/data/rules.js").includes("pip-react-menu"));

/* ---------- browser: the real sheet, screenshots of the R menu ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8771";
function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); res(true); });
    s.on("error", () => res(false));
  });
}
let server = null;
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port)))) {
  const http = await import("node:http");
  server = http.createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/") rel = "/index.html";
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end("no"); return;
    }
    const ext = path.extname(file);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webm": "video/webm", ".mp3": "audio/mpeg" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((res) => server.listen(Number(u.port), "127.0.0.1", res));
}

const art = "/opt/cursor/artifacts";
fs.mkdirSync(art, { recursive: true });
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.setViewport({ width: 1280, height: 800 });
await page.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => window.SSDNSActionPips && window.SSDNSPlaytest && window.SSDNSPlaytest.showTurn && window.SSDNSApp && window.SSDNSApp.doc, { timeout: 30000 });

const seeded = await page.evaluate(() => {
  const c = window.SSDNSApp.doc().character;
  c.name = "Caleb";
  c.calling = "frontier-preacher";
  c.level = 5;
  c.abilities = c.abilities || {};
  c.abilities.WIS = 16;
  c.overrides = c.overrides || {};
  c.overrides["hex.1"] = 4;
  c.spells[1] = [
    { name: "Shield", prepared: true },
    { name: "Hellish Rebuke", prepared: true },
    { name: "Healing Word", prepared: true },
    { name: "Cure Wounds", prepared: false }
  ];
  c.spells[3] = [{ name: "Counterspell", prepared: true }];
  c.cantrips = ["Sacred Flame"];
  const uid = window.SSDNSDmJoin && window.SSDNSDmJoin.uid && window.SSDNSDmJoin.uid();
  const row = { id: "p1", name: "Caleb", kind: "player" };
  if (uid) row.playerId = uid;
  window.SSDNSPlaytest.showTurn({
    round: 1, turn: 0, started: true, seq: 3,
    order: [row, { id: "e1", name: "Outlaw", kind: "enemy" }],
    turnStarts: { p1: 3 }
  });
  const names = window.SSDNSActionPips.reactionChoices().map((s) => s.name);
  const v = window.SSDNSApp.compute();
  return {
    names, inFight: window.SSDNSActionPips.inFight(),
    strip: !!document.querySelector("#turnSlot [data-pip=reaction]"),
    spellDC: v.spellDC, hex1: v.hex && v.hex[1], uid: uid || ""
  };
});
check("live.seed", seeded.strip && seeded.inFight && seeded.names.indexOf("Shield") >= 0 && seeded.names.indexOf("Hellish Rebuke") >= 0 && seeded.names.indexOf("Healing Word") < 0 && seeded.names.indexOf("Cure Wounds") < 0, JSON.stringify(seeded));

await page.evaluate(() => document.getElementById("turnPanel").scrollIntoView({ block: "center" }));
await page.click("#turnSlot [data-pip=reaction]");
await page.waitForSelector("[data-pip-react-menu]");
await page.screenshot({ path: path.join(art, "b16-reaction-menu-sheet.png") });
const menuText = await page.$eval("[data-pip-react-menu]", (el) => el.innerText);
check("live.menu", /Opportunity attack/.test(menuText) && /Shield/.test(menuText) && /Hellish Rebuke/.test(menuText) && /Counterspell/.test(menuText) && /Mark used/.test(menuText) && !/Healing Word/.test(menuText), menuText);

await page.evaluate(() => {
  window.__oa = null;
  window.SSDNSDmJoin.isJoined = () => true;
  window.SSDNSDmJoin.postOaRequest = (body) => { window.__oa = body || {}; return Promise.resolve({ ok: true, id: "oa_menu" }); };
});
await page.click('[data-pip-react="oa"]');
await sleep(200);
const oa = await page.evaluate(() => ({ oa: window.__oa, st: window.SSDNSActionPips.state() }));
check("live.oa", oa.oa && oa.st.oaReq === "oa_menu" && oa.st.reaction === false && oa.st.action === false, JSON.stringify(oa));
const armed = await page.evaluate(() => {
  const P = window.SSDNSActionPips;
  P.setOa("oaReq", "");
  P.setOa("oaArmed", "oa_menu");
  const r = P.attack("Peacemaker");
  return { oa: r.oa, st: P.state() };
});
check("live.oaSpendsR", armed.oa === "oa_menu" && armed.st.reaction === true && armed.st.action === false, JSON.stringify(armed));

await page.evaluate(() => window.SSDNSActionPips.reset(true));
await page.evaluate(() => window.SSDNSPlaytest.showTurn(window.SSDNSActionPips.lastInit()));
await page.click("#turnSlot [data-pip=reaction]");
await page.waitForSelector('[data-pip-spell="Hellish Rebuke"]');
await page.click('[data-pip-spell="Hellish Rebuke"]');
await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /No target/.test(b.textContent)), { timeout: 8000 });
await page.screenshot({ path: path.join(art, "b16-reaction-spell.png") });
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /No target/.test(b.textContent)).click());
await page.waitForFunction(() => window.SSDNSActionPips.state().reaction === true, { timeout: 8000 }).catch(() => {});
const cast = await page.evaluate(() => {
  const t = document.getElementById("toastText");
  return { st: window.SSDNSActionPips.state(), toast: t ? t.textContent : "", dialog: (document.querySelector("dialog[open]") || {}).innerText || "" };
});
check("live.spellSpendsR", cast.st.reaction === true && cast.st.action === false, JSON.stringify(cast));

await page.evaluate(() => {
  window.__chats = [];
  window.__logs = [];
  const J = window.SSDNSDmJoin;
  const origChat = J.postChat;
  J.postChat = (body) => { window.__chats.push(body); return origChat ? origChat(body) : { ok: true }; };
  const origLog = window.SSDNSSheet.addLog;
  window.SSDNSSheet.addLog = (e) => { window.__logs.push(e); return origLog(e); };
});
await page.evaluate(() => {
  for (let i = 0; i < 8; i++) {
    const box = document.getElementById("toast");
    const el = document.getElementById("toastText");
    if (!box || box.hidden || !el || !window.SSDNSToast || !window.SSDNSToast.dismissSticky) break;
    window.SSDNSToast.dismissSticky(el.textContent || "");
  }
});
await page.click("#turnSlot [data-pip=reaction]");
await page.waitForFunction(() => {
  const el = document.getElementById("toastText");
  const box = document.getElementById("toast");
  return !!(el && box && !box.hidden && el.textContent === "Reaction already used.");
}, { timeout: 8000 });
const spent = await page.evaluate(() => ({
  menu: !!document.querySelector("[data-pip-react-menu]"),
  toast: (document.getElementById("toastText") || {}).textContent || "",
  hidden: !!(document.getElementById("toast") || {}).hidden,
  fade: (document.querySelector(".fade-toast") || {}).textContent || "",
  chats: window.__chats,
  logs: (window.__logs || []).map((e) => e && e.text),
  st: window.SSDNSActionPips.state()
}));
await page.screenshot({ path: path.join(art, "b16-reaction-spent-toast.png") });
check("live.spentToastOnly", spent.toast === "Reaction already used." && !spent.hidden && spent.fade !== "Reaction already used." && !spent.menu && !spent.chats.length && !spent.logs.some((t) => /Reaction already used/.test(t || "")) && spent.st.reaction === true, JSON.stringify(spent));

await page.evaluate(() => window.SSDNSActionPips.reset(true));
await page.evaluate(() => window.SSDNSPlaytest.showTurn(window.SSDNSActionPips.lastInit()));
await page.click("#tab-map");
await page.evaluate(() => {
  const Join = window.SSDNSDmJoin;
  const uid = Join.uid();
  Join.isJoined = () => true;
  Join.live = () => ({
    joined: true, roomCode: "DEMO", uid: uid || "player1", dmUid: "dm",
    db: {}, fb: { ref: () => ({}), get: () => Promise.resolve({ exists: () => true, val: () => ({}) }) }
  });
  const Fire = window.SSDNSMapFirebase;
  if (Fire && Fire.memory) Fire.create = () => Fire.memory({ role: "player" });
  if (window.SSDNSMapHost && window.SSDNSMapHost.syncRoom) window.SSDNSMapHost.syncRoom();
});
await page.waitForFunction(() => document.body.classList.contains("map-turn-docked") && !!document.querySelector("#mapMount #turnSlot [data-pip=reaction]"), { timeout: 15000 });
const mapClick = await page.evaluate(() => {
  const btn = document.querySelector("#mapMount #turnSlot [data-pip=reaction]");
  if (btn) btn.click();
  return {
    clicked: !!btn,
    used: !!(btn && btn.classList.contains("used")),
    reaction: window.SSDNSActionPips.state().reaction,
    menu: !!document.querySelector("[data-pip-react-menu]"),
    parent: btn && btn.closest("#mapMount") ? "map" : ""
  };
});
check("live.mapClick", mapClick.menu, JSON.stringify(mapClick));
if (mapClick.menu) await page.screenshot({ path: path.join(art, "b16-reaction-menu-map.png") });
const mapMenu = mapClick.menu ? await page.$eval("[data-pip-react-menu]", (el) => el.innerText) : "";
check("live.mapMenu", /Opportunity attack/.test(mapMenu) && /Shield/.test(mapMenu) && /Mark used/.test(mapMenu), mapMenu || JSON.stringify(mapClick));

if (errs.length) console.log("pageerrors " + errs.slice(0, 4).join(" | "));
await browser.close();
if (server) await new Promise((res) => server.close(res));

if (failures.length) {
  console.log("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nb16 ok");

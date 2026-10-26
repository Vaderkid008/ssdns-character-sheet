/**
 * N55: DM fight-strip R for a token the DM is running opens the reaction menu.
 *   Ready R (map strip + DMCC strip): Opportunity attack, that token's reaction spells, Mark used.
 *   OA does not ask the DM to approve themselves. The next attack spends Reaction, not Action.
 *   A reaction spell uses the normal cast and spends Reaction.
 *   Mark used confirms, then spends R.
 *   Spent R still opens the menu and toasts (N60 warn-and-allow): no chat line and no ledger entry.
 *   A player acting for themselves still toggles the pip. Player B16 hard-block is unchanged.
 *   Enemies still warn and allow.
 *   node tools/test-b16-dm-reaction.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 500) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 500) : ""));
}
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

{
  const v2 = read("dm/assets/js/v2.js");
  const join = read("assets/js/dm-join.js");
  const pips = read("assets/js/action-pips.js");
  const css = read("dm/assets/css/dmcc.css");
  const ver = JSON.parse(read("version.json"));
  check("src.menuHook", /function onDmReactionPip/.test(v2) && /data-dm-react/.test(v2) && /function openDmReactionMenu/.test(v2));
  check("src.stripAndMap", /function stripActsHtml/.test(v2) && /dmReactionAttrs\(row\)/.test(v2) && /function mapMarkersHtml/.test(v2));
  const rulesList = v2.slice(v2.indexOf("function turnRulesHtml"), v2.indexOf("function paintTurnRules"));
  const focus = v2.slice(v2.indexOf("function turnMarkersHtml"), v2.indexOf("function playerSpeed"));
  check("src.overrideStaysToggle", !/data-dm-react/.test(rulesList) && !/data-dm-react/.test(focus));
  check("src.noSelfApprove", /function armDmOpportunity/.test(v2) && !/noteOaRequest\(/.test(v2.slice(v2.indexOf("function armDmOpportunity"), v2.indexOf("async function markDmReaction"))));
  check("src.oaSpendsReaction", /use === "attack" && \(oa \|\| armed\)\) use = "reaction"/.test(v2));
  check("src.sheetOaFlag", /payload\.oa && !payload\.offhand/.test(join) && /setOa\("oaArmed"/.test(join));
  check("src.menuCss", /\.pip-react-menu/.test(css));
  check("src.playerMenuIntact", /function openReactionMenu/.test(pips) && /data-pip-react-menu/.test(pips) && /DM pip buttons are data-dm-pip/.test(pips));
  check("src.versions", ver.sheet === "0.3.146" && ver.dmcc === "0.2.159" && ver.sheetBuild === "sheet-playtest-v03146" && ver.dmccBuild === "dmcc-playtest-v02159");
  check("src.rulesUntouched", !read("assets/data/rules.js").includes("0.3.146") && !read("database.rules.json").includes("0.3.146") && !read("assets/data/rules.js").includes("data-dm-react"));

  const store = {};
  const sb = { console, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  sb.SSDNSDmJoin = { uid: () => "u1", pushTurnMarkers: () => {}, postChat: () => {}, postLedger: () => {} };
  sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb", calling: "frontier-preacher", level: 5, cantrips: ["Sacred Flame"], spells: { 1: [{ name: "Shield", prepared: true }, { name: "Healing Word", prepared: true }] } } }) };
  const toasts = [];
  const chats = [];
  sb.SSDNSToast = (m) => toasts.push(String(m));
  sb.SSDNSDmJoin.postChat = (m) => chats.push(m);
  sb.SSDNSDmJoin.postLedger = (m) => chats.push(m);
  sb.document = { readyState: "complete", addEventListener() {}, querySelector: () => null, createElement: () => ({ innerHTML: "" }) };
  vm.createContext(sb);
  vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
  vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
  const P = sb.SSDNSActionPips;
  P.reset(true);
  P.spend("reaction", "Shield");
  const n = chats.length;
  check("player.stillBlocks", P.blockMap("reaction", "Shield") === "Reaction already used." && chats.length === n && toasts.at(-1) === "Reaction already used.");
  P.reset(true);
  P.setOa("oaArmed", "oa_ok");
  const atk = P.attack("Peacemaker");
  check("player.oaStillReaction", atk.oa === "oa_ok" && P.state().reaction === true && P.state().action === false, J(P.state()));
}

const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8772";
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
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".webm": "video/webm", ".mp3": "audio/mpeg" };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((res) => server.listen(Number(u.port), "127.0.0.1", res));
}

const art = "/opt/cursor/artifacts";
fs.mkdirSync(art, { recursive: true });
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const ctx = await browser.createBrowserContext();
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e)));
await pg.setViewport({ width: 1440, height: 900 });
await pg.goto(ORIGIN + dmccUrl("/dm/index.html?fresh=" + Date.now()), { waitUntil: "domcontentloaded", timeout: 60000 });
await dmccOffline(pg);
await pg.waitForFunction(() => window.DMCCEnhance && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 1, { timeout: 25000 });
await dmccOffline(pg);
await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab")].find((t) => t.textContent.trim() === "Fight").click());
await sleep(300);
await pg.evaluate(() => { const m = document.querySelector("#combatantMenu"); if (m) m.open = true; });
const addId = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean)[0]);
await pg.select("#initPlayer", addId);
await pg.click("#btnAddPlayer");
await sleep(250);
await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click());
await sleep(300);
await pg.evaluate(() => { const m = document.querySelector("#combatantMenu"); if (m) m.open = false; });
await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
await sleep(400);
for (let i = 0; i < 8 && (await pg.evaluate(() => { const c = window.DMCCEnhance.currentTurn(); return c && c.kind; })) !== "player"; i++) {
  await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
  await sleep(300);
}
/* Demo already has combatants. The strip is whoever's turn it is, not the player just added. */
const pid = await pg.evaluate(() => {
  const c = window.DMCCEnhance.currentTurn();
  return (c && (c.playerId || c.id)) || "";
});

const seeded = await pg.evaluate((playerId) => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  cur.dmActsAs = false;
  E.renderFight();
  const btn = document.querySelector('#turnStrip [data-dm-pip="reaction"]');
  const before = !!(E.playerMarkers(playerId) || {}).reaction;
  if (btn) btn.click();
  const after = !!(E.playerMarkers(playerId) || {}).reaction;
  const menu = !!document.querySelector("[data-dm-react-menu]");
  const hooked = !!(document.querySelector('#turnStrip [data-dm-pip="reaction"]') || {}).hasAttribute && document.querySelector('#turnStrip [data-dm-pip="reaction"]').hasAttribute("data-dm-react");
  if (after && !before) document.querySelector('#turnStrip [data-dm-pip="reaction"]').click();
  cur.dmActsAs = true;
  const p = window.DMCC.state.players[playerId];
  p.snapshot = p.snapshot || {};
  p.snapshot.spells = { cantrips: ["Sacred Flame"], prepared: ["Shield", "Hellish Rebuke", "Healing Word"], slots: { 1: 3 }, spent: {} };
  E.renderFight();
  const pip = document.querySelector('#turnStrip [data-dm-pip="reaction"]');
  const focus = document.querySelector('#fightFocus [data-dm-pip="reaction"]');
  const list = document.querySelector('#turnRules [data-dm-pip="reaction"]');
  const mapHtml = E.mapMarkersHtml(cur.id) || "";
  return {
    kind: cur.kind,
    name: cur.name,
    toggled: after !== before,
    menu,
    hooked,
    readyMenu: !!(pip && pip.hasAttribute("data-dm-react")),
    focusToggle: !!(focus && !focus.hasAttribute("data-dm-react")),
    listToggle: !!(list && !list.hasAttribute("data-dm-react")),
    mapHook: /data-dm-react/.test(mapHtml),
    reaction: !!(E.playerMarkers(playerId) || {}).reaction
  };
}, pid);
check("dm.selfRunToggles", seeded.kind === "player" && seeded.toggled && !seeded.menu && !seeded.hooked && seeded.reaction === false, J(seeded));
check("dm.readyOpensMenuHook", seeded.readyMenu && seeded.mapHook && seeded.focusToggle && seeded.listToggle, J(seeded));

await pg.evaluate(() => document.querySelector("#tab-table").click());
await sleep(200);
await pg.evaluate(() => { const s = document.querySelector("#turnStrip"); if (s && s.scrollIntoView) s.scrollIntoView({ block: "center" }); });
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector("[data-dm-react-menu]");
const pcMenu = await pg.$eval("[data-dm-react-menu]", (el) => el.innerText);
check("dm.pcMenu", /Opportunity attack/.test(pcMenu) && /Shield/.test(pcMenu) && /Hellish Rebuke/.test(pcMenu) && /Mark used/.test(pcMenu) && !/Healing Word/.test(pcMenu) && !/Sacred Flame/.test(pcMenu), pcMenu);
await pg.screenshot({ path: path.join(art, "b16-dm-reaction-pc.png") });

const ledgerBeforeOa = await pg.evaluate(() => (window.DMCC.state.ledger || []).length);
await pg.click('[data-dm-react-item="oa"]');
await sleep(250);
const oa = await pg.evaluate((playerId) => {
  const E = window.DMCCEnhance;
  const m = E.playerMarkers(playerId) || {};
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  return {
    reaction: !!m.reaction,
    action: !!m.action,
    oaArmed: m.oaArmed || "",
    asks: Object.keys(saved.oa || {}).length,
    menu: !!document.querySelector("[data-dm-react-menu]"),
    ledger: (window.DMCC.state.ledger || []).length,
    toast: (document.querySelector("#toast") || {}).textContent || ""
  };
}, pid);
check("dm.pcOaNoGate", oa.reaction === false && oa.action === false && /^dm_oa_/.test(oa.oaArmed) && oa.asks === 0 && !oa.menu && oa.ledger === ledgerBeforeOa && /reaction, not their action/i.test(oa.toast), J(oa));

await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector("[data-dm-react-menu]");
await pg.click('[data-dm-react-item="oa"]');
await sleep(200);
const oaAgain = await pg.evaluate((playerId) => {
  const m = window.DMCCEnhance.playerMarkers(playerId) || {};
  return { oaArmed: m.oaArmed || "", reaction: !!m.reaction, toast: (document.querySelector("#toast") || {}).textContent || "" };
}, pid);
check("dm.pcOaStaysArmed", oaAgain.oaArmed === oa.oaArmed && oaAgain.reaction === false && /ready/i.test(oaAgain.toast), J(oaAgain));

await pg.evaluate((playerId) => {
  const m = window.DMCCEnhance.playerMarkers(playerId);
  m.oaArmed = "";
  m.oaReq = "";
  const p = window.DMCC.state.players[playerId];
  p.turnMarkers = Object.assign({}, p.turnMarkers, { oaArmed: "", oaReq: "" });
  window.DMCCEnhance.renderFight();
}, pid);
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector('[data-dm-react-item="mark"]');
const ledgerBeforeMark = await pg.evaluate(() => (window.DMCC.state.ledger || []).length);
await pg.click('[data-dm-react-item="mark"]');
await pg.waitForSelector("dialog.ssdns-ask");
await pg.click("dialog.ssdns-ask button[value=no]");
await sleep(150);
const cancelled = await pg.evaluate((playerId) => !!(window.DMCCEnhance.playerMarkers(playerId) || {}).reaction, pid);
check("dm.markCancel", cancelled === false);
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector('[data-dm-react-item="mark"]');
await pg.click('[data-dm-react-item="mark"]');
await pg.waitForSelector("dialog.ssdns-ask");
const askText = await pg.$eval("dialog.ssdns-ask", (el) => el.innerText);
await pg.click("dialog.ssdns-ask button[value=yes]");
await sleep(250);
const marked = await pg.evaluate((playerId) => {
  const m = window.DMCCEnhance.playerMarkers(playerId) || {};
  return {
    reaction: !!m.reaction,
    action: !!m.action,
    ledger: (window.DMCC.state.ledger || []).length,
    toast: (document.querySelector("#toast") || {}).textContent || "",
    menu: !!document.querySelector("[data-dm-react-menu]")
  };
}, pid);
check("dm.markSpends", /Reaction\?/.test(askText) && marked.reaction === true && marked.action === false && marked.ledger === ledgerBeforeMark && /Reaction marked used/.test(marked.toast) && !marked.menu, J({ askText, marked }));

const rollsBefore = await pg.evaluate(() => (window.DMCC.state.rolls || []).length);
const ledgerBeforeSpent = await pg.evaluate(() => (window.DMCC.state.ledger || []).length);
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await sleep(200);
const spent = await pg.evaluate(() => ({
  menu: !!document.querySelector("[data-dm-react-menu]"),
  toast: (document.querySelector("#toast") || {}).textContent || "",
  hidden: !!(document.querySelector("#toast") || {}).hidden,
  ledger: (window.DMCC.state.ledger || []).length,
  rolls: (window.DMCC.state.rolls || []).length,
  reaction: !!((window.DMCCEnhance.playerMarkers(window.DMCCEnhance.currentTurn().playerId || window.DMCCEnhance.currentTurn().id) || {}).reaction)
}));
check("dm.spentToastOnly", spent.toast === "Reaction already used." && !spent.hidden && spent.menu && spent.ledger === ledgerBeforeSpent && spent.rolls === rollsBefore && spent.reaction === true, J(spent));

await pg.evaluate((playerId) => {
  const E = window.DMCCEnhance;
  const m = E.playerMarkers(playerId);
  m.reaction = false;
  const p = window.DMCC.state.players[playerId];
  p.turnMarkers = Object.assign({}, p.turnMarkers, { reaction: false });
  E.renderFight();
}, pid);
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector('[data-dm-spell="Shield"]');
await pg.click('[data-dm-spell="Shield"]');
await sleep(400);
const cast = await pg.evaluate((playerId) => {
  const m = window.DMCCEnhance.playerMarkers(playerId) || {};
  const snap = (window.DMCC.state.players[playerId].snapshot.spells || {});
  return { reaction: !!m.reaction, action: !!m.action, spent: (snap.spent || {})[1] || 0, toast: (document.querySelector("#toast") || {}).textContent || "" };
}, pid);
check("dm.pcSpellSpendsReaction", cast.reaction === true && cast.action === false && cast.spent === 1 && /Shield/i.test(cast.toast), J(cast));

for (let i = 0; i < 6 && (await pg.evaluate(() => { const c = window.DMCCEnhance.currentTurn(); return c && c.kind; })) !== "enemy"; i++) {
  await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
  await sleep(300);
}
await pg.evaluate(() => {
  const cur = window.DMCCEnhance.currentTurn();
  cur.card = cur.card || {};
  cur.card.spellcasting = {
    dc: 13,
    attack: 5,
    spells: [
      { name: "Shield", level: 1, kind: "none" },
      { name: "Counterspell", level: 3, kind: "none" },
      { name: "Fireball", level: 3, kind: "save" }
    ]
  };
  window.DMCCEnhance.renderFight();
});
await pg.evaluate(() => document.querySelector("#tab-table").click());
await sleep(150);
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector("[data-dm-react-menu]");
const enemyMenu = await pg.$eval("[data-dm-react-menu]", (el) => el.innerText);
check("dm.enemyMenu", /Opportunity attack/.test(enemyMenu) && /Shield/.test(enemyMenu) && /Counterspell/.test(enemyMenu) && /Mark used/.test(enemyMenu) && !/Fireball/.test(enemyMenu), enemyMenu);
await pg.screenshot({ path: path.join(art, "b16-dm-reaction-enemy.png") });

const enemyOaLedger = await pg.evaluate(() => (window.DMCC.state.ledger || []).length);
await pg.click('[data-dm-react-item="oa"]');
await sleep(250);
const enemyArmed = await pg.evaluate(async () => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const before = (saved.markers || {})[cur.id] || {};
  const spent = await E.spendEnemyPip(cur, "attack", "Bowie");
  const again = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (again.markers || {})[cur.id] || {};
  return {
    kind: cur.kind,
    armedBefore: before.oaArmed || "",
    asks: Object.keys(again.oa || {}).length,
    action: !!m.action,
    reaction: !!m.reaction,
    oaArmed: m.oaArmed || "",
    cost: spent && spent.cost,
    ledger: (window.DMCC.state.ledger || []).length
  };
});
check("dm.enemyOaSpendsReaction", enemyArmed.kind === "enemy" && /^dm_oa_/.test(enemyArmed.armedBefore) && enemyArmed.asks === 0 && enemyArmed.reaction === true && enemyArmed.action === false && enemyArmed.oaArmed === "" && enemyArmed.cost === "reaction" && enemyArmed.ledger === enemyOaLedger, J(enemyArmed));

const warned = await pg.evaluate(async () => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const again = await E.spendEnemyPip(cur, "reaction", "Shield");
  return { reaction: again && again.reaction, action: again && again.action, warn: again && again.warn, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.enemyWarns", warned.reaction === true && warned.action === false && /already used/i.test(warned.warn || "") && /Done anyway/i.test(warned.toast), J(warned));

const ledgerBeforeEnemySpent = await pg.evaluate(() => (window.DMCC.state.ledger || []).length);
const rollsBeforeEnemy = await pg.evaluate(() => (window.DMCC.state.rolls || []).length);
await pg.evaluate(() => document.querySelector("#tab-table").click());
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await sleep(200);
const enemySpent = await pg.evaluate(() => ({
  menu: !!document.querySelector("[data-dm-react-menu]"),
  toast: (document.querySelector("#toast") || {}).textContent || "",
  ledger: (window.DMCC.state.ledger || []).length,
  rolls: (window.DMCC.state.rolls || []).length
}));
check("dm.enemySpentToast", enemySpent.toast === "Reaction already used." && enemySpent.menu && enemySpent.ledger === ledgerBeforeEnemySpent && enemySpent.rolls === rollsBeforeEnemy, J(enemySpent));

await pg.evaluate(() => window.DMCCEnhance.resetEnemyMarkers());
await sleep(200);
await pg.click('#turnStrip [data-dm-pip="reaction"]');
await pg.waitForSelector('[data-dm-spell="Shield"]');
await pg.click('[data-dm-spell="Shield"]');
await sleep(400);
const enemyCast = await pg.evaluate(() => {
  const cur = window.DMCCEnhance.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (saved.markers || {})[cur.id] || {};
  return { reaction: !!m.reaction, action: !!m.action, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.enemySpellSpendsReaction", enemyCast.reaction === true && enemyCast.action === false && /Shield/i.test(enemyCast.toast), J(enemyCast));

await pg.evaluate(() => window.DMCCEnhance.resetEnemyMarkers());
await sleep(200);
await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab")].find((t) => t.textContent.trim() === "Map").click());
await pg.waitForFunction(() => {
  const slot = document.querySelector('#mapMount [data-act="stripMarkers"]');
  return !!(slot && slot.querySelector('[data-dm-pip="reaction"]'));
}, { timeout: 20000 }).catch(() => null);
await sleep(400);
const mapShot = await pg.evaluate(() => {
  const btn = document.querySelector('#mapMount [data-act="stripMarkers"] [data-dm-pip="reaction"]');
  if (btn) btn.click();
  const menu = document.querySelector("[data-dm-react-menu]");
  return { clicked: !!btn, text: menu ? menu.innerText : "", hook: !!(btn && btn.hasAttribute("data-dm-react")) };
});
if (mapShot.clicked && mapShot.text) {
  await pg.screenshot({ path: path.join(art, "b16-dm-reaction-map.png") });
  check("dm.mapStripMenu", /Opportunity attack/.test(mapShot.text) && /Mark used/.test(mapShot.text), mapShot.text);
} else {
  check("dm.mapStripMenu", false, J(mapShot));
}

if (errs.length) console.log("pageerrors " + errs.slice(0, 6).join(" | "));
check("dm.noPageErrors", errs.length === 0, errs.slice(0, 4).join(" | "));

await browser.close();
if (server) await new Promise((res) => server.close(res));
if (failures.length) {
  console.log("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ndm reaction menu ok");

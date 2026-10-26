/**
 * B4: map attacks, spells, and items spend Action / Bonus / Reaction.
 *   Enemies: cardStrike marks Action when the attack roll is published (before a Bite save).
 *   Multiattack is free up to the stat block; past that the DM is warned and the roll still happens.
 *   An off-turn opportunity attack spends Reaction. Players are not spent on the enemy path.
 *   Players: a map attack / spell / item / Reload hard-blocks when its pip is already spent, and a spent
 *   Action, Bonus, or Reaction blocks the roll. The player sees a fading toast only.
 *   No table-log row, no chat line, and no DM ledger pipBlock. A ready R opens the reaction menu.
 *   A player click that marks Action or Bonus used confirms first. Drawer Reload spends the sheet's cost.
 *   A DM move writes only moveUsed (dmFields), so a live adopt cannot clear a pip the sheet just spent.
 *   node tools/test-b4-map-pips.mjs   (browser part needs a static server on 127.0.0.1:8765)
 * DMCC pages open through tools/dmcc-offline.mjs so they never hit the live database.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 500) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 500) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node: a live DM patch applies only the named fields ---------- */
{
  const store = {};
  const sb = { console, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  sb.SSDNSDmJoin = { uid: () => "u1", pushTurnMarkers: () => {} };
  sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb", calling: "gunslinger", level: 5 } }) };
  sb.SSDNSToast = () => {};
  vm.createContext(sb);
  vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
  vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
  const P = sb.SSDNSActionPips;
  const order = [{ id: "p1", name: "Caleb", kind: "player", playerId: "u1" }];
  P.onTurn({ round: 1, turn: 0, started: true, order, seq: 1, turnStarts: { p1: 1 } });
  P.attack("Peacemaker");
  const key = P.state().turnKey;
  check("node.spent", P.state().action === true && P.state().attacks === 1, J(P.state()));
  const live = P.adopt({
    by: "dm", dmFields: { moveUsed: true }, moveUsed: 15,
    action: false, bonus: true, reaction: true, attacks: 0, actionBy: "", turnKey: "s999"
  }, { live: true });
  const after = P.state();
  check("node.liveMoveKeepsAction", live && after.action === true && after.attacks === 1 && after.moveUsed === 15 && after.bonus === false && after.turnKey === key, J(after));
  /* no dmFields: a live flag still full-replaces, same as a pull-on-join */
  P.adopt({ by: "dm", action: false, bonus: true, reaction: false, attacks: 0, actionBy: "", turnKey: key }, { live: true });
  check("node.liveWithoutFieldsReplaces", P.state().action === false && P.state().bonus === true, J(P.state()));
  P.attack("Peacemaker");
  P.adopt({
    by: "dm",
    dmFields: { action: true, bonus: true, reaction: true, attacks: true, actionBy: true, moveUsed: true, actUndo: true },
    action: false, bonus: false, reaction: false, attacks: 0, actionBy: "", moveUsed: 0, actUndo: ""
  }, { live: true });
  check("node.liveResetClears", P.state().action === false && P.state().attacks === 0 && P.state().moveUsed === 0, J(P.state()));
  /* the old call shape (no opts) still full-replaces */
  P.attack("Peacemaker");
  P.adopt({ action: false, bonus: false, reaction: true, attacks: 0, actionBy: "", turnKey: key });
  check("node.bareAdoptReplaces", P.state().action === false && P.state().reaction === true, J(P.state()));
  sb.SSDNS_RULES = { callings: [{ id: "gunslinger", features: [{ name: "Extra Attack (5th level)", text: "You can attack twice per Attack action (3 times at 11th, 4 times at 20th)." }] }] };
  const notes = [];
  const toasts = [];
  const logs = [];
  sb.SSDNSToast = (msg) => { toasts.push(String(msg || "")); };
  sb.SSDNSSheet = { addLog: (e) => { logs.push(e); } };
  sb.SSDNSDmJoin.postLedger = (e) => { notes.push(e); };
  sb.SSDNSDmJoin.postChat = (e) => { notes.push({ chat: true, text: e && e.text }); };
  P.reset(true);
  P.attack("Peacemaker");
  check("node.extraAllowsSecond", P.blockMap("attack", "Peacemaker") === "" && P.state().attacks === 1, J(P.state()));
  P.attack("Peacemaker");
  const third = P.blockMap("attack", "Peacemaker");
  check("node.thirdAttackBlocks", third === "Action already used." && P.state().attacks === 2, third + " " + J(P.state()));
  check("node.blockToastOnly", toasts.indexOf("Action already used.") >= 0 && notes.length === 0 && logs.length === 0, J({ toasts: toasts, notes: notes, logs: logs }));
  P.reset(true);
  P.spend("action", "Dash");
  check("node.actionBlocks", P.blockMap("action", "Dash") === "Action already used." && P.blockMap("bonus", "Healing Word") === "", J(P.state()));
  P.reset(true);
  P.spend("bonus", "Healing Word");
  const nBonus = notes.length;
  const logsBonus = logs.length;
  check("node.bonusToastOnly", P.blockMap("bonus", "Healing Word") === "Bonus action already used." && notes.length === nBonus && logs.length === logsBonus && toasts.at(-1) === "Bonus action already used.", J({ toasts: toasts, notes: notes, logs: logs }));
  P.reset(true);
  P.spend("reaction", "Shield");
  const nReact = notes.length;
  const logsReact = logs.length;
  check("node.reactionBlocks", P.blockMap("reaction", "Shield") === "Reaction already used." && notes.length === nReact && logs.length === logsReact && toasts.at(-1) === "Reaction already used.", J({ state: P.state(), notes: notes.length, toasts: toasts }));
  P.reset(true);
  P.setOa("oaArmed", "oa_x");
  check("node.oaRollAllowed", P.blockMap("attack", "Opportunity attack") === "" && P.state().reaction === false, J(P.state()));
  P.spend("reaction", "Shield");
  const nOa = notes.length;
  check("node.oaRollBlockedWhenSpent", P.blockMap("attack", "Opportunity attack") === "Reaction already used." && P.state().oaArmed === "oa_x" && notes.length === nOa, J(P.state()));
}

/* ---------- node: player Action / Bonus confirm, only when marking used ---------- */
{
  const store = {};
  const listeners = [];
  const sb = { console, setTimeout, clearTimeout, Date, Promise };
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  sb.document = {
    readyState: "complete",
    addEventListener: (ev, fn) => { listeners.push({ ev: ev, fn: fn }); },
    querySelector: () => null,
    createElement: () => ({ innerHTML: "" })
  };
  sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb" } }) };
  sb.SSDNSToast = () => {};
  sb.SSDNSDmJoin = { uid: () => "u1", pushTurnMarkers: () => {} };
  const asked = [];
  let answer = null;
  sb.SSDNSAsk = { confirm: (msg) => new Promise((res) => { asked.push(msg); answer = res; }) };
  vm.createContext(sb);
  vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
  const P = sb.SSDNSActionPips;
  P.reset(true);
  const click = listeners.filter((l) => l.ev === "click").pop();
  const fire = (kind) => {
    const pip = { getAttribute: () => kind };
    click.fn({ target: { closest: (sel) => (sel === "[data-pip]" ? pip : null) } });
  };
  fire("action");
  check("node.confirmActionAsked", asked[0] === "Are you sure you want to use your Action?" && P.state().action === false, asked.join(" | ") + " " + J(P.state()));
  answer(false);
  await Promise.resolve();
  check("node.confirmCancel", P.state().action === false, J(P.state()));
  fire("bonus");
  check("node.confirmBonusAsked", asked[1] === "Are you sure you want to use your Bonus action?" && P.state().bonus === false, asked.join(" | "));
  answer(true);
  await Promise.resolve();
  check("node.confirmBonusOk", P.state().bonus === true && P.state().action === false, J(P.state()));
  const n = asked.length;
  fire("bonus");
  check("node.confirmSkipClear", asked.length === n && P.state().bonus === false, J(P.state()));
  fire("reaction");
  check("node.confirmSkipReaction", asked.length === n && P.state().reaction === false, J(P.state()));
  P.toggle("action");
  check("node.toggleSkipsConfirm", asked.length === n && P.state().action === true && P.state().actionBy === "manual", J(P.state()));
}

/* ---------- source wiring ---------- */
{
  const v2 = read("dm/assets/js/v2.js");
  const pips = read("assets/js/action-pips.js");
  const join = read("assets/js/dm-join.js");
  const mapJs = read("map/ssdns-map.js");
  const lock = read("assets/js/turn-lock.js");
  const dmcc = read("dm/assets/js/dmcc.js");
  const ver = JSON.parse(read("version.json"));
  const attackFn = v2.slice(v2.indexOf("async attack(detail)"), v2.indexOf("async cast(detail)"));
  const castFn = v2.slice(v2.indexOf("async cast(detail)"), v2.indexOf("chamber(detail)"));
  const useFn = v2.slice(v2.indexOf("useitem(detail)"), v2.indexOf("async deathsave(detail)"));
  const playerAttack = attackFn.slice(0, attackFn.indexOf("ensureCombatantCard(row)"));
  const strikeFn = v2.slice(v2.indexOf("async function cardStrike"), v2.indexOf("function sheetDiceMode"));
  const published = strikeFn.lastIndexOf("await publishCardRoll(row, detail, total");
  const committed = strikeFn.indexOf("await commitEnemyAttack(row, atk, opts)", published);
  const rider = strikeFn.indexOf("askAttackSave", committed);
  check("src.enemyAttackSpends", /await commitEnemyAttack\(row, atk, opts\)/.test(strikeFn) && !/spendEnemyPip\(row, "attack"/.test(attackFn) && !/spendEnemyPip/.test(playerAttack));
  check("src.biteSpendsBeforeSave", published >= 0 && committed > published && rider > committed, "pub " + published + " commit " + committed + " rider " + rider);
  check("src.rowAtkUsesCardStrike", /data-row-atk/.test(v2) && /cardStrike\(parseInt\(t\.getAttribute\("data-row-atk"\)/.test(v2));
  check("src.enemyCastSpends", /enemySpellCost\(raw\)/.test(castFn) && /spendEnemyPip\(row, cost/.test(castFn) && castFn.indexOf('kind === "player"') < castFn.indexOf("spendEnemyPip"));
  check("src.enemyItemSpends", /enemyItemById\(/.test(useFn) && /spendEnemyPip\(row, cost/.test(useFn) && /kind !== "player"/.test(useFn));
  check("src.playerItemDoesNotSpend", useFn.indexOf("item_use") > useFn.indexOf("spendEnemyPip"));
  check("src.moveWritesFeetOnly", /writePlayerMarkers\(pid, m, "Moved " \+ n \+ " ft on the map\.", \["moveUsed"\]\)/.test(v2));
  check("src.dmFieldsUpdate", /dmFields: dmFields/.test(v2) && /_fb\.update\(DM\.roomRef\("players\/" \+ pid \+ "\/turnMarkers"\)/.test(v2) && !/turnMarkers"\), m\)/.test(v2));
  check("src.enemyReset", /data-pip-reset="enemy"/.test(v2) && /function resetEnemyMarkers\(/.test(v2));
  check("src.adoptLive", /opts\.live && v\.by === "dm"/.test(pips) && /P\.adopt\(val, \{ live: true \}\)/.test(join));
  check("src.pushRereads", /if \(Pnow && Pnow\.state\) v = Pnow\.state\(\)/.test(join));
  check("src.mapRepaint", /ssdns:pips-change/.test(mapJs) && /paintPlayerFight\(\)/.test(mapJs.slice(mapJs.indexOf("ssdns:pips-change"))));
  check("src.rulesUntouched", !read("assets/data/rules.js").includes(ver.sheet) && !/actUndo|dmFields/.test(read("database.rules.json")));
  check("src.versions", ver.sheet === "0.3.144" && ver.dmcc === "0.2.157" && ver.sheetBuild === "sheet-playtest-v03144" && ver.dmccBuild === "dmcc-playtest-v02157");
  check("src.noDoubleSpendHelper", /row\.kind === "player" \|\| !row\.id/.test(v2.slice(v2.indexOf("async function spendEnemyPip"), v2.indexOf("function commitEnemyAttack"))));
  const runP = mapJs.slice(mapJs.indexOf("function runPlayer"), mapJs.indexOf("function cleanActId"));
  check("src.playerMapBlocks", /playerMapGate\(/.test(runP) && runP.indexOf("playerMapGate") < runP.indexOf("actions.run") && /blockMap\(/.test(pips));
  check("src.playerItemBlocks", /function playerUseItem\(/.test(mapJs) && /blockMap\(cost, label\)/.test(mapJs));
  check("src.reactionHardBlock", /blockMap\("reaction", "Opportunity attack"\)/.test(lock) && /spellCost\(spellName\) === "reaction"/.test(read("assets/js/sheet-extras.js")));
  const blockFn = pips.slice(pips.indexOf("function blockMap"), pips.indexOf("function featureCost"));
  check("src.pipBlockNoChat", !/function notePipBlocks\(/.test(dmcc) && !/pipBlock/.test(pips) && !/postChat/.test(blockFn) && !/postLedger/.test(blockFn) && !/addLog/.test(blockFn) && /toast\(reason\)/.test(blockFn));
  check("src.reactionMenu", /data-pip-react-menu/.test(pips) && /Opportunity attack/.test(pips) && /function reactionChoices\(/.test(pips) && /Are you sure you want to use your Reaction\?/.test(pips));
  const appSrc = read("assets/js/app.js");
  const toggleSrc = pips.slice(pips.indexOf("function toggle(kind)"), pips.indexOf("function reset(quiet)"));
  check("src.pipConfirm", /Are you sure you want to use your Action\?/.test(pips) && /Are you sure you want to use your Bonus action\?/.test(pips) && !/Are you sure/.test(toggleSrc));
  check("src.confirmOnlyWhenMarking", /kind === "action" \|\| kind === "bonus"/.test(pips) && /!st\[kind\]/.test(pips) && /Ask\.confirm\(msg\)/.test(pips));
  const costSrc = mapJs.slice(mapJs.indexOf("function mapActionCost"), mapJs.indexOf("function playerMapGate"));
  check("src.reloadMapCost", /reloadCost/.test(costSrc) && /gun\[1\] === 'tr'\) return 'bonus'/.test(costSrc) && /gun\[1\] === 'unload' \|\| gun\[1\] === 'reopen'/.test(costSrc));
  check("src.reloadNotOpportunity", /!gear && st\.oaArmed/.test(mapJs));
  check("src.reloadGunSpends", /reloadGun: function \(i, max\)/.test(appSrc) && /withCost\(i, reloadCost/.test(appSrc) && /unloadGunIndex: function \(i\) \{ return withCost/.test(appSrc) && /tacticalReload: function \(i\) \{ return withCost/.test(appSrc));
  check("src.gunCommandAllowsDm", /function gunCommandPip/.test(join) && /_dmAllow/.test(join) && !/blockMap\(pip\.cost, pip\.what\)/.test(join));
  const drawerBlock = v2.slice(v2.indexOf("function drawerPipBlock"), v2.indexOf("async function mapGunLoad"));
  check("src.drawerReloadBlocks", /drawerPipBlock\(row, atk, "reload"/.test(v2) && /row\.kind !== "player"\) return ""/.test(drawerBlock) && /op === "tr" && drawerPipBlock/.test(v2) && /op === "reopen" && drawerPipBlock/.test(v2));
}

/* ---------- browser: demo DMCC, never the live database ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
function portOpen(port, hostName) {
  return new Promise((res) => {
    const s = net.connect({ port, host: hostName || "127.0.0.1" }, () => { s.end(); res(true); });
    s.on("error", () => res(false));
  });
}
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) {
  console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)");
  process.exit(failures.length ? 1 : 1);
}
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

const ctx = await browser.createBrowserContext();
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e)));
pg.on("dialog", (d) => d.accept());
await pg.setViewport({ width: 1400, height: 900 });
await pg.goto(ORIGIN + dmccUrl("/dm/index.html?fresh=" + Date.now()), { waitUntil: "domcontentloaded" });
await dmccOffline(pg);
await pg.waitForFunction(() => window.DMCCEnhance && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 1, { timeout: 25000 });
await dmccOffline(pg);
await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab")].find((t) => t.textContent.trim() === "Fight").click());
await sleep(300);
await pg.evaluate(() => { document.querySelector("#combatantMenu").open = true; });
const pid = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean)[0]);
await pg.select("#initPlayer", pid);
await pg.click("#btnAddPlayer");
await sleep(250);
await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click());
await sleep(300);
await pg.evaluate(() => { document.querySelector("#combatantMenu").open = false; });
await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
await sleep(400);
for (let i = 0; i < 4 && (await pg.evaluate(() => window.DMCCEnhance.currentTurn().kind)) !== "enemy"; i++) {
  await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
  await sleep(350);
}

const prep = await pg.evaluate(() => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  return { curKind: cur && cur.kind, curId: cur && cur.id, curName: cur && cur.name, limit: E.enemyAttackLimit(cur), heal: E.enemySpellCost("Healing Word"), shield: E.enemySpellCost("Shield"), fireball: E.enemySpellCost("Fireball") };
});
check("dm.enemyTurn", prep.curKind === "enemy" && prep.limit === 1, J(prep));
check("dm.spellCosts", prep.heal === "bonus" && prep.shield === "reaction" && prep.fireball === "action", J(prep));

await pg.evaluate(() => {
  if (window.SSDNSRangeRings) {
    window.SSDNSRangeRings.peek = () => null;
    window.SSDNSRangeRings.peekFor = () => null;
    window.SSDNSRangeRings.take = () => null;
    window.SSDNSRangeRings.confirmDisadvantage = () => Promise.resolve(true);
  }
  if (window.SSDNSMapHost) window.SSDNSMapHost.armAttack = () => null;
});

const first = await pg.evaluate(async () => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  document.querySelectorAll("[data-ac-val]").forEach((el) => {
    if (el.value === "" || el.value == null) {
      el.value = "12";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const foe = (saved.order || []).find((r) => r && r.kind === "player");
  const rolled = await window.SSDNSMapFight.attack({ combatantId: cur.id, weaponId: "bowie", targetCombatantId: foe && foe.id });
  const again = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (again.markers || {})[cur.id] || null;
  return { rolled, action: m && m.action, attacks: m && m.attacks, bonus: m && m.bonus, foe: foe && foe.id, name: cur.name, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.bowieSpendsAction", first.rolled === true && first.action === true && first.attacks === 1 && first.bonus === false, J(first));

const second = await pg.evaluate(async () => {
  const cur = window.DMCCEnhance.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const foe = (saved.order || []).find((r) => r && r.kind === "player");
  const rolled = await window.SSDNSMapFight.attack({ combatantId: cur.id, weaponId: "bowie", targetCombatantId: foe && foe.id });
  const again = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (again.markers || {})[cur.id] || {};
  return { rolled, action: m.action, attacks: m.attacks, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.secondWarns", second.rolled === true && second.action === true && second.attacks === 2 && /attack 2/.test(second.toast) && /allows 1/.test(second.toast), J(second));

await pg.evaluate(() => window.DMCCEnhance.resetEnemyMarkers());
await sleep(200);
const reset = await pg.evaluate(() => {
  const cur = window.DMCCEnhance.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (saved.markers || {})[cur.id] || {};
  return { action: !!m.action, attacks: m.attacks || 0, bonus: !!m.bonus, reaction: !!m.reaction };
});
check("dm.reset", reset.action === false && reset.attacks === 0 && reset.bonus === false && reset.reaction === false, J(reset));

const multi = await pg.evaluate(async () => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  cur.card = cur.card || {};
  cur.card.actions = [{ name: "Multiattack", text: "The outlaw makes two attacks: one with its revolver and one with its bowie." }];
  const limit = E.enemyAttackLimit(cur);
  const a = await E.spendEnemyPip(cur, "attack", "Bowie");
  const b = await E.spendEnemyPip(cur, "attack", "Bowie");
  const c = await E.spendEnemyPip(cur, "attack", "Bowie");
  return { limit, aOver: a && a.over, bOver: b && b.over, cOver: c && c.over, attacks: c && c.attacks, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.multiattack", multi.limit === 2 && multi.aOver === false && multi.bOver === false && multi.cOver === true && multi.attacks === 3 && /attack 3/.test(multi.toast) && /allows 2/.test(multi.toast), J(multi));

await pg.evaluate(() => window.DMCCEnhance.resetEnemyMarkers());
await sleep(200);

const cast = await pg.evaluate(async () => {
  const cur = window.DMCCEnhance.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const foe = (saved.order || []).find((r) => r && r.kind === "player");
  cur.card.spellcasting = { dc: 12, attack: 4, spells: [{ name: "Healing Word", kind: "heal", level: 1 }] };
  cur.card.slots = { 1: { left: 1, max: 1 } };
  const rolled = await window.SSDNSMapFight.cast({ combatantId: cur.id, spellId: "Healing Word", targetCombatantId: foe && foe.id });
  const again = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (again.markers || {})[cur.id] || {};
  return { rolled, foe: foe && foe.id, action: !!m.action, bonus: !!m.bonus, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.healingWordBonus", cast.rolled === true && cast.bonus === true && cast.action === false, J(cast));

const item = await pg.evaluate(async () => {
  const cur = window.DMCCEnhance.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  cur.inventory = [{ uid: "potion-1", name: "Healing potion", actionCost: "action" }];
  const ok = await window.SSDNSMapFight.useitem({ combatantId: cur.id, itemUid: "potion-1" });
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const m = (saved.markers || {})[cur.id] || {};
  const missing = await window.SSDNSMapFight.useitem({ combatantId: cur.id, itemUid: "nope" });
  return { ok, action: !!m.action, bonus: !!m.bonus, missing, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.itemSpendsAction", item.ok === true && item.action === true && item.bonus === true && item.missing === false && /No item/.test(item.toast), J(item));

const jammed = await pg.evaluate(async () => {
  const cur = window.DMCCEnhance.currentTurn();
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const beforeSaved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const before = ((beforeSaved.markers || {})[cur.id] || {}).attacks || 0;
  const atk = cur.card.attacks.find((a) => a && /revolver/i.test(a.name));
  atk.jammed = true;
  const foe = (beforeSaved.order || []).find((r) => r && r.kind === "player");
  const rolled = await window.SSDNSMapFight.attack({ combatantId: cur.id, weaponId: atk.id || atk.name, targetCombatantId: foe && foe.id });
  const again = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const attacks = ((again.markers || {})[cur.id] || {}).attacks || 0;
  atk.jammed = false;
  return { rolled, attacks, before, toast: (document.querySelector("#toast") || {}).textContent || "" };
});
check("dm.jamDoesNotSpend", jammed.rolled === false && jammed.attacks === jammed.before && /jammed/.test(jammed.toast), J(jammed));

/* off the outlaw's turn: an attack does not spend Action; an OA spends Reaction */
await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
await sleep(300);
const off = await pg.evaluate(async () => {
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const enemy = (saved.order || []).find((r) => r && r.kind === "enemy");
  const before = !!((saved.markers || {})[enemy.id] || {}).action;
  const skipped = await window.DMCCEnhance.spendEnemyPip(enemy, "attack", "Bowie");
  const oa = await window.DMCCEnhance.spendEnemyPip(enemy, "attack", "Bowie", { oa: true });
  return {
    turn: window.DMCCEnhance.currentTurn().kind,
    skipped,
    before,
    action: oa && oa.action,
    reaction: oa && oa.reaction
  };
});
check("dm.offTurn", off.turn !== "enemy" && off.skipped == null && off.reaction === true && off.action === off.before, J(off));

/* back to a player turn if we aren't already, then a move must not clear Action */
for (let i = 0; i < 4 && (await pg.evaluate(() => window.DMCCEnhance.currentTurn().kind)) !== "player"; i++) {
  await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
  await sleep(300);
}
const moved = await pg.evaluate(() => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const pidNow = cur.playerId || cur.id;
  const T = window.SSDNSTurn;
  const key = T.keyFor(E.turnState(), cur);
  const p = window.DMCC.state.players[pidNow];
  p.turnMarkers = Object.assign(T.fresh(key), { action: true, actionBy: "attack", attacks: 1, bonus: false, reaction: false });
  const ok = E.spendMove({ combatantId: cur.id }, 5);
  const stored = p.turnMarkers;
  const seen = E.playerMarkers(pidNow);
  return {
    ok,
    action: seen && seen.action,
    attacks: seen && seen.attacks,
    moveUsed: seen && seen.moveUsed,
    fields: stored && stored.dmFields,
    by: stored && stored.by
  };
});
check("dm.moveKeepsAction", moved.ok === true && moved.action === true && moved.attacks === 1 && moved.moveUsed === 5 && moved.by === "dm" && moved.fields && moved.fields.moveUsed === true && !moved.fields.action, J(moved));

const playerFire = await pg.evaluate(async () => {
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  const pidNow = cur.playerId || cur.id;
  const before = E.playerMarkers(pidNow).action;
  cur.dmActsAs = true;
  const p = window.DMCC.state.players[pidNow];
  p.snapshot = p.snapshot || {};
  p.snapshot.guns = [{ id: "test-gun", name: "Peacemaker", weapon: "peacemaker", equipped: true, loaded: 6, capacity: 6, toHit: 5, damage: "1d10", group: "pistol" }];
  const code = (window.DMCC.state && window.DMCC.state.roomCode) || "demo";
  const saved = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
  const foe = (saved.order || []).find((r) => r && r.kind === "enemy");
  await window.SSDNSMapFight.attack({
    combatantId: cur.id,
    weaponId: "test-gun",
    targetCombatantId: foe && foe.id
  });
  const queued = (window.DMCC.state.commands || [])[0] || null;
  return {
    before,
    after: E.playerMarkers(pidNow).action,
    attacks: E.playerMarkers(pidNow).attacks,
    cmd: queued && queued.type,
    dm: queued && queued.payload && queued.payload.dm,
    toast: (document.querySelector("#toast") || {}).textContent || ""
  };
});
check("dm.playerFireNoDoubleSpend", playerFire.before === true && playerFire.after === true && playerFire.attacks === 1 && playerFire.cmd === "gun" && playerFire.dm === true, J(playerFire));

/* map strip shows the enemy's spent Action and Reset once it is their turn again */
await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
await sleep(300);
for (let i = 0; i < 4 && (await pg.evaluate(() => window.DMCCEnhance.currentTurn().kind)) !== "enemy"; i++) {
  await pg.evaluate(() => document.querySelector("#btnNextTurn").click());
  await sleep(300);
}
await pg.evaluate(async () => {
  const cur = window.DMCCEnhance.currentTurn();
  if (cur && cur.kind !== "player") await window.DMCCEnhance.spendEnemyPip(cur, "attack", "Bowie");
});
await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab")].find((t) => t.textContent.trim() === "Map").click());
await pg.waitForFunction(() => document.querySelector("#mapMount .ssm-turnstrip"), { timeout: 20000 });
await sleep(600);
const strip = await pg.evaluate(() => {
  const slot = document.querySelector('#mapMount [data-act="stripMarkers"]');
  const action = slot && slot.querySelector('[data-dm-pip="action"]');
  const reset = slot && slot.querySelector('[data-pip-reset="enemy"]');
  return { text: slot ? slot.textContent : "", used: !!(action && action.classList.contains("used")), reset: !!reset };
});
check("dm.stripShowsSpent", strip.used && strip.reset && /Action/.test(strip.text) && /Reset/.test(strip.text), J(strip));

/* Dust Devil Bite waits on the target's Strength save after the roll. Action has to be marked
   while that save is still pending, or a second Bite can start with the pip still ready. */
const bite = await pg.evaluate(async () => {
  const DM = window.DMCC;
  const wasDemo = DM.state.demo;
  const wasDb = DM.state.db;
  const origPush = DM.pushRoll.bind(DM);
  DM.pushRoll = (row) => {
    DM.state.rolls = DM.state.rolls || [];
    DM.state.rolls.unshift(row);
    return Promise.resolve(row);
  };
  DM.state.demo = false;
  DM.state.db = { fake: 1 };
  const E = window.DMCCEnhance;
  const cur = E.currentTurn();
  if (!cur || cur.kind === "player") {
    DM.state.demo = wasDemo;
    DM.state.db = wasDb;
    DM.pushRoll = origPush;
    return { skip: true, kind: cur && cur.kind };
  }
  cur.card = cur.card || {};
  cur.card.attacks = (cur.card.attacks || []).concat([{
    id: "bite", name: "Bite", toHit: 8, damage: "1d4+2",
    rider: { save: "STR", dc: 11, condition: "Prone", onSave: "none" }
  }]);
  document.querySelectorAll("[data-ac-val]").forEach((el) => {
    el.value = "1";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const code = (DM.state && DM.state.roomCode) || "demo";
  const foe = (JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}").order || []).find((r) => r && r.kind === "player");
  let hit = null;
  for (let n = 0; n < 12 && !hit; n++) {
    E.resetEnemyMarkers();
    let settled = false;
    const pending = window.SSDNSMapFight.attack({ combatantId: cur.id, weaponId: "bite", targetCombatantId: foe && foe.id });
    Promise.resolve(pending).then(() => { settled = true; }, () => { settled = true; });
    await new Promise((r) => setTimeout(r, 280));
    const again = JSON.parse(localStorage.getItem("ssdns.dm.table." + code) || "{}");
    const m = (again.markers || {})[cur.id] || {};
    const detail = String((DM.state.rolls && DM.state.rolls[0] && DM.state.rolls[0].detail) || "");
    if (/→ (?:HIT|CRIT)/.test(detail) && !/→ MISS/.test(detail)) {
      hit = { action: !!m.action, attacks: m.attacks || 0, settled: settled, detail: detail.slice(0, 240), n: n };
      break;
    }
    try { await pending; } catch (e) {}
  }
  DM.state.demo = wasDemo;
  DM.state.db = wasDb;
  DM.pushRoll = origPush;
  return hit || { action: false, attacks: 0, settled: true, detail: "no hit" };
});
check("dm.biteSpendsBeforeSave", bite.action === true && bite.attacks === 1 && bite.settled === false, J(bite));

try {
  const shotDir = "/opt/cursor/artifacts/screenshots";
  fs.mkdirSync(shotDir, { recursive: true });
  const stripBox = await pg.evaluate(() => {
    const el = document.querySelector("#mapMount .ssm-turnstrip");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (stripBox && stripBox.width > 2) {
    await pg.screenshot({ path: path.join(shotDir, "b4-enemy-action-map.png"), clip: { x: stripBox.x, y: Math.max(0, stripBox.y), width: stripBox.width, height: Math.min(stripBox.height + 8, 160) } });
  } else await pg.screenshot({ path: path.join(shotDir, "b4-enemy-action-map.png") });
  const box = await pg.evaluate(() => {
    const canvas = document.querySelector("#mapMount canvas");
    const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    const boxes = window.SSDNSMapHost && window.SSDNSMapHost.tokenBoxes ? window.SSDNSMapHost.tokenBoxes() : [];
    const hit = boxes.find((t) => /outlaw/i.test(t.label || "")) || boxes.find((t) => t.kind === "enemy");
    if (!hit || !hit.screen) return null;
    return { x: rect.left + (hit.screen.x1 + hit.screen.x2) / 2, y: rect.top + (hit.screen.y1 + hit.screen.y2) / 2 };
  });
  if (box && box.y > (stripBox ? stripBox.y + stripBox.height : 80)) {
    await pg.mouse.click(box.x, box.y);
    await sleep(500);
    const still = await pg.evaluate(() => {
      const action = document.querySelector('#mapMount [data-act="stripMarkers"] [data-dm-pip="action"]');
      return !!(action && action.classList.contains("used"));
    });
    if (still) await pg.screenshot({ path: path.join(shotDir, "b4-enemy-drawer-map.png") });
  }
} catch (e) {
  console.log("screenshot enemy skipped: " + e);
}
check("dm.noPageErrors", errs.length === 0, errs.join(" | "));
await ctx.close();

/* player sheet: a map Fight-card click is the sheet button, which already spends. Repaint listens for pips-change. */
{
  const ctx2 = await browser.createBrowserContext();
  const pg2 = await ctx2.newPage();
  const errs2 = [];
  pg2.on("pageerror", (e) => errs2.push(String(e)));
  await pg2.setViewport({ width: 1280, height: 900 });
  await pg2.goto(ORIGIN + "/index.html?nowizard=1&fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg2.waitForFunction(() => window.SSDNSApp && window.SSDNSActionPips && window.SSDNSTurnLock, { timeout: 25000 });
  await sleep(400);
  await pg2.evaluate(() => {
    const gr = (id, n) => ({ weapon: id, equipped: true, proficient: true, loaded: n, chambers: Array(n).fill("c"), misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
    window.SSDNSApp.applyPatch((d) => {
      const c = d.character;
      c.name = "Caleb"; c.calling = "gunslinger"; c.level = 5; c.speed = 30;
      c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns = [gr("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }];
    });
    const order = [{ id: "p1", name: "Caleb", kind: "player", playerId: "local" }, { id: "e1", name: "Outlaw", kind: "enemy" }];
    if (window.SSDNSDmJoin) window.SSDNSDmJoin.uid = () => "local";
    window.SSDNSPlaytest.showTurn({ round: 1, turn: 0, started: true, order, seq: 1, turnStarts: { p1: 1, e1: 1 } });
  });
  await sleep(300);
  const clicked = await pg2.evaluate(() => {
    const btn = document.querySelector("[data-gunroll]");
    if (btn) btn.click();
    return !!btn;
  });
  try {
    await pg2.waitForFunction(() => window.SSDNSActionPips && window.SSDNSActionPips.state().action === true, { timeout: 8000 });
  } catch (e) { /* the assertion below reports the pip */ }
  const spent = await pg2.evaluate(() => {
    const st = window.SSDNSActionPips.state();
    const pip = document.querySelector("#turnSlot .pip-action");
    return { action: st.action, attacks: st.attacks, pip: pip ? pip.textContent : "", used: !!(pip && pip.classList.contains("used")) };
  });
  check("sheet.clickSpends", clicked && spent.action === true && spent.used, J(spent));
  await pg2.evaluate(() => [...document.querySelectorAll("[role=tab],.tab")].find((t) => t.textContent.trim() === "Map").click());
  await sleep(800);
  try {
    await pg2.waitForFunction(() => document.querySelector("#mapMount") && !document.querySelector("#mapMount").hidden, { timeout: 15000 });
  } catch (e) { /* map may stay hidden without a room; the strip is still the sheet's */ }
  await pg2.evaluate(() => {
    const el = document.getElementById("mapMount");
    if (!el) return;
    el.hidden = false;
    el.classList.remove("hidden");
    let slot = el.querySelector(":scope > .ssm-turnhost");
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "ssm-turnhost";
      el.insertBefore(slot, el.firstChild);
    }
    const panel = document.getElementById("turnPanel");
    if (panel) slot.appendChild(panel);
  });
  await sleep(300);
  const card = await pg2.evaluate(() => {
    const pip = document.querySelector("#turnSlot .pip-action");
    const fight = document.querySelector("#mapMount [data-act='actionSlot'], #mapMount .ssm-fight, #mapMount .ssm-actions");
    return { used: !!(pip && pip.classList.contains("used")), text: pip ? pip.textContent : "", fight: fight ? fight.textContent.slice(0, 180) : "" };
  });
  check("sheet.mapStripStaysUsed", card.used && /Action/.test(card.text), J(card));
  try {
    fs.mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });
    const panel = await pg2.evaluate(() => {
      const el = document.querySelector("#mapMount .ssm-turnhost") || document.getElementById("turnPanel");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (panel && panel.width > 2 && panel.height > 2) {
      await pg2.screenshot({
        path: "/opt/cursor/artifacts/screenshots/b4-player-action-map.png",
        clip: { x: Math.max(0, panel.x), y: Math.max(0, panel.y), width: Math.min(panel.width, 1200), height: Math.min(panel.height, 220) }
      });
    } else await pg2.screenshot({ path: "/opt/cursor/artifacts/screenshots/b4-player-action-map.png" });
  } catch (e) {
    console.log("screenshot player skipped: " + e);
  }
  check("sheet.noPageErrors", errs2.length === 0, errs2.join(" | "));
  await ctx2.close();
}

await browser.close();
if (failures.length) {
  console.log("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall b4 checks passed");

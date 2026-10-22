/**
 * Turn order PR 1 (T1 + T2 + T6; Jessey's rulings 2026-10-21 9:07 PM CT, sheet 0.3.104 / DMCC 0.2.117):
 *   T1 one Next / Roll Initiative / End combat per surface (DMCC Fight tab, map strip); the sheet only has End turn
 *   T2 turn state on table/initiative (seq, turnStarts, undo); a player's markers on players/{uid}/turnMarkers.
 *      Markers come back only at the start of that combatant's OWN turn (reaction too, ruling 5).
 *      Previous is the DM's "Undo last Next" behind a confirm and restores, never refreshes (ruling 3).
 *      DM's Next works any time; a player's End turn only on their own turn (ruling 2).
 *   T6 one out-of-turn rule for the DMCC badge and Apply; enemy turns show markers and never warn the DM (ruling 10).
 *   node tools/test-turnorder-pr1.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node part: the shared rules + the sheet's markers ---------- */
const store = {};
const pushed = [];
const sb = { console, setTimeout, clearTimeout };
sb.window = sb; sb.globalThis = sb;
sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
sb.SSDNSDmJoin = { uid: () => "u1", pushTurnMarkers: (m) => pushed.push(m) };
sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb", calling: "gunslinger", level: 1 } }) };
sb.SSDNSToast = () => {};
vm.createContext(sb);
vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
const T = sb.SSDNSTurn, P = sb.SSDNSActionPips;
const order = [
  { id: "p1", name: "Caleb", kind: "player", playerId: "u1", init: 20 },
  { id: "e1", name: "Outlaw", kind: "enemy", init: 15 },
  { id: "p2", name: "Jolene", kind: "player", playerId: "u2", init: 10 }
];
/* a DM table driven only through the shared helpers, the way the DMCC's Next / Undo use them */
const table = { round: 1, turn: 0, started: false, order, seq: 0, turnStarts: {}, undo: [] };
function next() {
  const before = T.snapshot(table);
  if (!table.started) { table.started = true; table.round = 1; table.turn = 0; }
  else { table.turn = (table.turn + 1) % order.length; if (table.turn === 0) table.round += 1; }
  T.beginTurn(table, before);
  P.onTurn(JSON.parse(JSON.stringify(table)));
}
function undo() { const ok = T.undoNext(table); P.onTurn(JSON.parse(JSON.stringify(table))); return ok; }
const used = () => { const s = P.state(); return [s.action, s.bonus, s.reaction].map((x) => (x ? 1 : 0)).join(""); };

next(); /* round 1, my turn */
check("node.myTurnFresh", used() === "000" && P.state().turnKey === "s1", J(P.state()));
P.spend("action", "Shot"); P.spend("reaction", "Shield");
check("node.spent", used() === "101");
next(); /* Outlaw */
check("node.enemyTurnKeeps", used() === "101", J(P.state()));
next(); /* Jolene */
check("node.otherPlayerKeeps", used() === "101" && P.state().reaction === true, J(P.state()));
next(); /* round 2, my turn again */
check("node.ownTurnResets", used() === "000" && P.state().turnKey === "s4", J(P.state()));
check("node.reactionBackOnlyOnOwnTurn", P.state().reaction === false);
P.spend("action", "Shot"); P.spend("bonus", "Reload");
next(); /* Outlaw */
check("node.undo.ok", !!undo() && table.turn === 0 && table.round === 2 && table.seq === 4, J([table.turn, table.round, table.seq]));
check("node.undo.restoresNotRefreshes", used() === "110", J(P.state()));
next(); /* Outlaw again (redo) */
next(); next(); /* Jolene, then my next turn */
check("node.redoSameKeyNoExtraSet", table.turnStarts.p1 === 7 && used() === "000", J([table.turnStarts, P.state()]));
/* Undo from my turn back to Jolene, then Next into my turn: same key, no second fresh set */
P.spend("action", "Shot");
undo(); check("node.undoOffMyTurnKeeps", used() === "100", J(P.state()));
next(); check("node.redoIntoMyTurnKeeps", used() === "100" && P.state().turnKey === "s7", J(P.state()));
/* undo stack: at most UNDO_MAX, and empty means nothing to undo */
const t2 = { round: 1, turn: 0, started: false, order, seq: 0, turnStarts: {}, undo: [] };
for (let i = 0; i < 9; i++) { const b = T.snapshot(t2); if (!t2.started) t2.started = true; else t2.turn = (t2.turn + 1) % 3; T.beginTurn(t2, b); }
check("node.undoCapped", t2.undo.length === T.UNDO_MAX);
let n = 0; while (T.undoNext(t2)) n++;
check("node.undoEmpty", n === T.UNDO_MAX && !T.canUndo(t2));
/* old rooms (no seq / turnStarts): own-turn key is round:turn; Previous then Next keeps the key */
const old = { round: 3, turn: 0, started: true, order };
check("node.legacyKey", T.keyFor(old, order[0]) === "r3:0" && T.keyFor(old, order[1]) === "");
/* the room copy: every change goes to players/{uid}/turnMarkers via SSDNSDmJoin.pushTurnMarkers */
check("node.pushedToRoom", pushed.length > 5 && "turnKey" in pushed[pushed.length - 1] && pushed[pushed.length - 1].action === true, J(pushed[pushed.length - 1]));
P.adopt({ action: false, bonus: true, reaction: true, turnKey: "s7" });
check("node.adoptRoomCopy", used() === "011", J(P.state()));
/* ruling 2: End turn only on your own turn */
const live = { round: 1, turn: 0, started: true, order };
check("node.endTurnOwn", T.canEndTurn(live, "u1") && !T.canEndTurn(live, "u2") && !T.canEndTurn(Object.assign({}, live, { turn: 1 }), "u1") && !T.canEndTurn(Object.assign({}, live, { started: false }), "u1"));
/* T6: one out-of-turn rule */
const ctx = (turn) => ({ started: true, current: order[turn], dmUid: "dm" });
check("node.oot.ownTurn", !T.outOfTurn({ playerId: "u1", uid: "u1" }, ctx(0)));
check("node.oot.otherPlayersTurn", T.outOfTurn({ playerId: "u1", uid: "u1" }, ctx(2)));
check("node.oot.enemyTurn", T.outOfTurn({ playerId: "u1", uid: "u1" }, ctx(1)));
check("node.oot.dmNeverWarned", !T.outOfTurn({ playerId: "u1", uid: "dm" }, ctx(1)) && !T.outOfTurn({ uid: "dm" }, ctx(1)));
check("node.oot.noFight", !T.outOfTurn({ playerId: "u1", uid: "u1" }, { started: false, current: order[2], dmUid: "dm" }));

/* source wiring */
const v2 = read("dm/assets/js/v2.js"), dmcc = read("dm/assets/js/dmcc.js"), dmHtml = read("dm/index.html"), sheetHtml = read("index.html");
const mapJs = read("map/ssdns-map.js"), host = read("map/ssdns-map-host.js"), join = read("assets/js/dm-join.js"), pt = read("assets/js/sheet-playtest.js");
check("src.badgeAndApplyShareRule", (dmcc.match(/rollOutOfTurn\(r\)/g) || []).length >= 2 && /SSDNSTurn\.outOfTurn/.test(dmcc) && !/r\.playerId !== state\.turnPlayerId/.test(dmcc));
check("src.oneNextPerDmccSurface", (dmHtml.match(/id="btnNextTurn"/g) || []).length === 1 && !/data-strip-next="1">Next<\/button>/.test(v2));
check("src.oneRollInit", (dmHtml.match(/id="btnRollInitAll"/g) || []).length === 1 && !/id="btnRollAll"/.test(dmHtml));
check("src.oneEndCombat", (dmHtml.match(/id="btnEndCombatHead"/g) || []).length === 1 && !/id="btnEndCombat"/.test(dmHtml) && /\$\("btnEndCombatHead"\)/.test(host));
check("src.prevIsUndo", />Undo last Next</.test(dmHtml) && /addEventListener\("click", \(\) => \{ undoLastNext\(\); \}\)/.test(v2) && /window\.confirm\(ask\)/.test(v2));
check("src.mapUndoDmOnly", /if \(role === 'dm'\) \{[\s\S]{0,600}'Undo last Next'/.test(mapJs) && /initiative:prev[\s\S]{0,120}btnPrevTurn/.test(host) && /if \(!isDmPage\(\)\) return;[\s\S]{0,200}initiative:next/.test(host));
check("src.sheetHasNoDmTurnButtons", !/id="btnPrevTurn"|id="btnNextTurn"|id="btnRollInitAll"|id="btnEndCombat/.test(sheetHtml));
check("src.markersOnPlayerRow", /roomPath\("players\/" \+ state\.uid\)\), \{\s*turnMarkers:/.test(join) && /pullTurnMarkers\(\);/.test(join));
check("src.endTurnSharedRule", /SSDNSTurn\.canEndTurn/.test(pt) && /endBtn\.hidden = !endTurnAt/.test(pt));
check("src.turnStateOnInitiative", /seq: fight\.seq \|\| 0, turnStarts: fight\.turnStarts \|\| \{\}, undo: fight\.undo \|\| \[\], markers: fight\.markers \|\| \{\}/.test(v2));
check("src.noRulesChange", !/turnMarkers|turnStarts/.test(read("database.rules.json")));
check("src.v2TailIntact", /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/.test(v2));

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
function portOpen(port, hostName) { return new Promise((r) => { const s = net.connect({ port, host: hostName }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function page(url, vp) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport(vp || { width: 1400, height: 1000 });
  await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
  return { pg, errs, ctx };
}
const visible = (sel, re) => [...document.querySelectorAll(sel)].filter((b) => b.offsetParent !== null && re.test(b.textContent.trim())).length;
try {
  /* DMCC: a demo fight with two players and an enemy */
  for (const [vp, sfx] of [[{ width: 1400, height: 1000 }, "desktop"], [{ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "phone"]]) {
    const { pg, errs, ctx } = await page("/dm/index.html?fresh=" + Date.now(), vp);
    let answer = false; const asked = [];
    pg.on("dialog", (d) => { asked.push(d.message()); if (answer) d.accept(); else d.dismiss(); });
    await pg.waitForFunction(() => window.DMCC && window.DMCCEnhance && window.SSDNSTurn && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 2, { timeout: 20000 });
    await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === "Fight").click()); await sleep(300);
    await pg.evaluate(() => { document.querySelector("#combatantMenu").open = true; });
    const players = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean));
    for (const v of players.slice(0, 2)) { await pg.select("#initPlayer", v); await pg.click("#btnAddPlayer"); await sleep(250); }
    await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click()); await sleep(300);
    await pg.evaluate(() => { document.querySelector("#combatantMenu").open = false; });
    const pre = await pg.evaluate((v) => ({ roll: eval(v)("#panel-fight button", /^Roll Init/i), end: eval(v)("#panel-fight button", /^End combat$/i), next: eval(v)("#panel-fight button", /^Next$/i) }), visible.toString());
    check("dm." + sfx + ".preFightOneEach", pre.roll === 1 && pre.next === 1 && pre.end <= 1, J(pre));
    const nxt = async () => { await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(700); };
    const st = () => pg.evaluate(() => { const s = window.DMCCEnhance.turnState(); return { round: s.round, turn: s.turn, seq: s.seq, starts: s.turnStarts, cur: window.DMCCEnhance.currentTurn() }; });
    await nxt();
    const live = await pg.evaluate((v) => ({ roll: eval(v)("#panel-fight button", /^Roll Init/i), end: eval(v)("#panel-fight button", /^End combat$/i), next: eval(v)("#panel-fight button", /^Next$/i), undo: eval(v)("#panel-fight button", /^Undo last Next$/i) }), visible.toString());
    check("dm." + sfx + ".fightOneEach", live.roll === 0 && live.end === 1 && live.next === 1 && live.undo === 1, J(live));
    await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === "Table").click()); await sleep(300);
    const tableNext = await pg.evaluate((v) => eval(v)("#panel-table button, #turnStrip button", /^Next$/i), visible.toString());
    check("dm." + sfx + ".tableStripNoSecondNext", tableNext === 0, String(tableNext));
    await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === "Fight").click()); await sleep(300);
    await nxt(); await nxt(); /* Jolene? then Outlaw: order is sorted by init */
    const a = await st();
    check("dm." + sfx + ".seqStamps", a.seq === 3 && Object.keys(a.starts).length === 3 && a.starts[a.cur.id] === 3, J(a));
    /* enemy turn markers: shown, DM toggles, no warning */
    const curKind = a.cur.kind;
    if (curKind !== "player") {
      const m0 = await pg.evaluate(() => [...document.querySelectorAll(".dm-turn-markers [data-dm-pip]")].map((b) => b.getAttribute("aria-pressed")));
      await pg.evaluate(() => document.querySelector('.dm-turn-markers [data-dm-pip="action"]').click()); await sleep(300);
      const m1 = await pg.evaluate(() => ({ p: document.querySelector('.dm-turn-markers [data-dm-pip="action"]').getAttribute("aria-pressed"), toast: (document.querySelector(".toast") || {}).textContent || "" }));
      check("dm." + sfx + ".enemyMarkers", J(m0) === J(["false", "false", "false"]) && m1.p === "true" && !/already used/i.test(m1.toast), J([m0, m1]));
    } else {
      check("dm." + sfx + ".playerMarkersShown", await pg.evaluate(() => /Player's turn/.test((document.querySelector(".dm-turn-markers") || {}).textContent || "")));
    }
    /* Previous = Undo last Next: asks first; Cancel keeps the turn; OK restores round / turn / seq */
    answer = false;
    await pg.evaluate(() => document.querySelector("#btnPrevTurn").click()); await sleep(300);
    const kept = await st();
    check("dm." + sfx + ".undoAsksFirst", asked.length === 1 && /Undo the last Next/.test(asked[0]) && kept.turn === a.turn && kept.seq === a.seq, J([asked, kept.turn]));
    answer = true;
    await pg.evaluate(() => document.querySelector("#btnPrevTurn").click()); await sleep(400);
    const back = await st();
    check("dm." + sfx + ".undoRestores", back.seq === 2 && back.turn === a.turn - 1 && back.starts[a.cur.id] == null, J(back));
    await nxt();
    const redo = await st();
    check("dm." + sfx + ".redoSameStamp", redo.seq === 3 && redo.starts[a.cur.id] === 3 && redo.turn === a.turn, J(redo));
    /* T6: badge and Apply agree */
    const t6 = await pg.evaluate(() => {
      const D = window.DMCC, E = window.DMCCEnhance;
      const cur = E.currentTurn();
      const order = E.turnState().order;
      const pc = order.filter((r) => r.kind === "player");
      const mk = (pid, uid) => ({ id: "r_" + pid + "_" + uid, playerId: pid, uid: uid, damage: 5, targetId: (order.find((r) => r.kind === "enemy") || {}).id, targetName: "Outlaw", detail: "hit", nat: 12 });
      const rows = [mk(pc[0].playerId || pc[0].id, "x1"), mk(pc[1].playerId || pc[1].id, "x2"), mk(pc[0].playerId || pc[0].id, D.state.uid)];
      return { curKind: cur.kind, out: rows.map((r) => [D.rollOutOfTurn(r), D.hitApplyButton(r) === "" || /Apply/.test(D.hitApplyButton(r)) ? (/data-apply-hit/.test(D.hitApplyButton(r)) ? "apply" : "none") : "?"]) };
    });
    const agree = t6.out.every(([oot, ap]) => (oot ? ap === "none" : true));
    check("dm." + sfx + ".badgeApplyAgree", agree && (t6.curKind === "player" ? true : t6.out[0][0] === true && t6.out[1][0] === true) && t6.out[2][0] === false, J(t6));
    check("dm." + sfx + ".noPageErrors", errs.length === 0, errs.join(" | "));
    /* map strip: one Next, one Undo last Next, one End combat */
    await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === "Map").click()); await sleep(1500);
    const ms = await pg.evaluate(() => { const s = document.querySelector(".ssm-turnstrip"); if (!s) return null; const b = [...s.querySelectorAll("button")].map((x) => x.textContent.trim()); return b; });
    check("map." + sfx + ".oneEach", !!ms && ms.filter((t) => t === "Next").length === 1 && ms.filter((t) => t === "Undo last Next").length === 1 && ms.filter((t) => t === "End combat").length === 1 && !ms.includes("Previous"), J(ms));
    const before = await st();
    answer = true; asked.length = 0;
    await pg.evaluate(() => [...document.querySelectorAll(".ssm-turnstrip button")].find((x) => x.textContent.trim() === "Undo last Next").click()); await sleep(500);
    const after = await st();
    check("map." + sfx + ".undoGoesThroughDmcc", asked.length === 1 && after.seq === before.seq - 1, J([asked.length, before.seq, after.seq]));
    await ctx.close();
  }
  /* sheet: End turn only on my own turn; no DM turn buttons; markers keep across others' turns */
  {
    const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now(), { width: 1280, height: 900 });
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSPlaytest && window.SSDNSActionPips && window.SSDNSTurn && window.SSDNSDmJoin, { timeout: 25000 });
    await sleep(800);
    await pg.evaluate(() => { window.SSDNSDmJoin.uid = () => "u1"; window.SSDNSApp.applyPatch((d) => { d.character.name = "Caleb"; }); });
    const O = order;
    const show = (turn, round, extra) => pg.evaluate((o) => window.SSDNSPlaytest.showTurn(o), Object.assign({ round: round || 1, turn, started: true, order: O }, extra || {}));
    const endShown = () => pg.evaluate(() => { const b = document.querySelector("#btnEndTurn"); return !!b && !b.hidden && b.offsetParent !== null; });
    await show(0, 1, { seq: 1, turnStarts: { p1: 1 } }); await sleep(200);
    check("sheet.endTurnOnMyTurn", await endShown());
    await pg.evaluate(() => { window.SSDNSActionPips.spend("action", "Shot"); window.SSDNSActionPips.spend("reaction", "Shield"); });
    await show(1, 1, { seq: 2, turnStarts: { p1: 1, e1: 2 } }); await sleep(200);
    check("sheet.noEndTurnOffTurn", !(await endShown()));
    const s1 = await pg.evaluate(() => window.SSDNSActionPips.state());
    check("sheet.markersKeptOffTurn", s1.action && s1.reaction, J(s1));
    await show(2, 1, { seq: 3, turnStarts: { p1: 1, e1: 2, p2: 3 } });
    await show(0, 2, { seq: 4, turnStarts: { p1: 4, e1: 2, p2: 3 } }); await sleep(200);
    const s2 = await pg.evaluate(() => window.SSDNSActionPips.state());
    check("sheet.markersBackOnOwnTurn", !s2.action && !s2.reaction && s2.turnKey === "s4", J(s2));
    const btns = await pg.evaluate(() => [...document.querySelectorAll("button")].filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()));
    check("sheet.noDmTurnButtons", !btns.some((t) => /^(Next|Previous|Undo last Next|Roll Init(iative)?|End combat)$/i.test(t)) && btns.filter((t) => /^End turn$/i.test(t)).length === 1, J(btns.filter((t) => /next|init|end|prev/i.test(t))));
    check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall turn order PR 1 checks passed");
process.exit(failures.length ? 1 : 0);

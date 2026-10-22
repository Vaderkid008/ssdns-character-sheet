/**
 * Turn UX on the map (Jessey's notes 2026-10-22 2:28 PM CT, sheet 0.3.108 / DMCC 0.2.121).
 *   1 Dash / Disengage / Dodge can be cancelled during the turn: tapping it again ("✕ Cancel Dash") gives the Action
 *     back (when it paid for it) and Dash's extra feet go away; feet already walked past normal speed block the
 *     cancel. Anything that spends the Action afterwards closes the cancel. Off turn it stays locked (PR 2 rules).
 *   2 The map shows the sheet's own turn strip (#turnPanel, now with Action / Bonus / R) at the TOP of the map, the
 *     same element moved there while the Map tab is open, in normal and full-screen mode; the DM's map strip is at
 *     the top too and shows the current player's markers (the DM card's marker row).
 *   node tools/test-map-turn-ux.mjs   (browser part needs a static server, SSDNS_ORIGIN or 127.0.0.1:8765; the live
 *   part needs ssdns-test-all's emulators on :9000 / :9099 and is skipped without them or with SKIP_LIVE=1)
 * DMCC pages open through tools/dmcc-offline.mjs (dmccUrl adds ?demo=1, dmccOffline checks) (no database) before anything runs; the live part uses ?emu=1.
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
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node part: the markers ---------- */
{
  const store = {}; const toasts = [];
  const sb = { console, setTimeout, clearTimeout, Date };
  sb.window = sb; sb.globalThis = sb;
  sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const pushed = [];
  sb.SSDNSDmJoin = { uid: () => "u1", pushTurnMarkers: (m) => pushed.push(m) };
  sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb", calling: "gunslinger", level: 1 } }) };
  sb.SSDNSToast = (m) => toasts.push(m);
  vm.createContext(sb);
  vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
  vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
  const T = sb.SSDNSTurn, P = sb.SSDNSActionPips;
  const order = [{ id: "p1", name: "Caleb", kind: "player", playerId: "u1" }, { id: "e1", name: "Outlaw", kind: "enemy" }];
  let seq = 1;
  const myTurn = () => { seq += 2; P.onTurn({ round: seq, turn: 0, started: true, order, seq, turnStarts: { p1: seq, e1: seq - 1 } }); };
  myTurn();
  check("node.fresh.hasActUndo", T.fresh("k").actUndo === "" && P.state().actUndo === "");
  P.takeAct("dash", "Dash");
  check("node.dash.takes", P.state().action && P.state().dash && P.state().actionBy === "dash" && P.state().actUndo === "dash" && T.moveLeft(P.state(), 30).max === 60, J(P.state()));
  check("node.dash.pushedToRoom", pushed.length && pushed[pushed.length - 1].actUndo === "dash");
  check("node.dash.canCancel", P.canCancelAct("dash") && !P.canCancelAct("dodge"));
  const r = P.cancelAct("dash");
  check("node.dash.cancelRefunds", r && r.refunded && !P.state().action && !P.state().dash && P.state().actionBy === "" && P.state().actUndo === "" && T.moveLeft(P.state(), 30).max === 30, J(P.state()));
  check("node.dash.cancelTwiceNoop", P.cancelAct("dash") === null);
  /* an attack after Dash closes the cancel */
  P.takeAct("dash", "Dash"); P.attack("Peacemaker");
  check("node.attackClosesCancel", !P.canCancelAct("dash") && P.state().dash && P.state().action, J(P.state()));
  /* Dodge on an Action already spent: cancel turns it off, nothing to give back */
  myTurn();
  P.spend("action", "Reload");
  P.takeAct("dodge", "Dodge");
  check("node.dodge.overspendStillCancels", P.canCancelAct("dodge") && P.state().actionBy !== "dodge");
  const r2 = P.cancelAct("dodge");
  check("node.dodge.cancelNoRefund", r2 && !r2.refunded && P.state().action && !P.state().dodge, J(P.state()));
  /* a spell / reload after Disengage closes it; so does a manual Action toggle */
  myTurn();
  P.takeAct("disengage", "Disengage"); P.spend("action", "Casting Hex");
  check("node.spendClosesCancel", !P.canCancelAct("disengage"));
  myTurn();
  P.takeAct("disengage", "Disengage"); P.toggle("bonus");
  check("node.bonusLeavesCancel", P.canCancelAct("disengage"));
  /* the window rides on the room copy (reload / DM edit keep it) and a new own turn clears it */
  P.adopt(Object.assign({}, P.state(), { by: "dm" }));
  check("node.adoptKeeps", P.canCancelAct("disengage"));
  myTurn();
  check("node.newTurnClears", !P.state().disengage && P.state().actUndo === "" && !P.state().action);
  /* a DM Reset (fresh markers) clears it */
  P.takeAct("dash", "Dash"); P.adopt(Object.assign(T.fresh(P.state().turnKey), { by: "dm" }));
  check("node.dmResetClears", !P.canCancelAct("dash") && !P.state().dash);
  check("node.badValueIgnored", (P.adopt({ actUndo: "fireball", dash: true }), P.state().actUndo === ""));
}

/* ---------- source wiring ---------- */
{
  const host = read("map/ssdns-map-host.js"), mapJs = read("map/ssdns-map.js"), css = read("map/ssdns-map.css"), v2 = read("dm/assets/js/v2.js"), lock = read("assets/js/turn-lock.js");
  check("src.hostDocksSamePanel", /function dockTurnPanel\(\)/.test(host) && /slot\.appendChild\(panel\)/.test(host) && /undockTurnPanel\(\); \/\* map\.destroy\(\)/.test(host));
  check("src.noSecondCopy", !/turnPanel\.cloneNode|cloneNode\(true\)/.test(host + lock));
  check("src.stripTopRow", /grid-template-areas:\s*\n\s*"strip strip strip"\s*\n\s*"bar bar bar"/.test(css) && !/"dock"\s*\n\s*"strip";/.test(css) && !/"strip strip strip";/.test(css));
  check("src.dmStripMarkers", /data-act', 'stripMarkers'/.test(mapJs) && /host\.turnMarkers\(state\.currentTurnId\)/.test(mapJs) && /mapMarkersHtml\(cid\)/.test(host));
  check("src.dmRepaint", /SSDNSMapHost\.refreshStrip\(\)/.test(v2));
  check("src.noRulesChange", !/actUndo/.test(read("database.rules.json")));
  check("src.v2TailIntact", /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/.test(v2));
}

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
function portOpen(port, hostName) { return new Promise((res) => { const s = net.connect({ port, host: hostName || "127.0.0.1" }, () => { s.end(); res(true); }); s.on("error", () => res(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function page(url, vp) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  pg.on("dialog", (d) => d.accept());
  await pg.setViewport(vp || { width: 1280, height: 900 });
  await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
  return { pg, errs, ctx };
}
async function waitFor(fn, ms, label) {
  const t0 = Date.now(); let last = "";
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; last = J(v); } catch (e) { last = e.message; } await sleep(200); }
  throw new Error("timeout: " + label + " (" + last + ")");
}
const tab = (pg, name) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab")].find((t) => t.textContent.trim() === n).click(), name);
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const order = [
  { id: "p1", name: "Caleb", kind: "player", playerId: "u1", init: 20 },
  { id: "e1", name: "Outlaw", kind: "enemy", init: 15 },
  { id: "p2", name: "Jolene", kind: "player", playerId: "u2", init: 10 }
];
try {
  /* ---- sheet (no room): item 1 on the strip ---- */
  for (const [vp, sfx] of [[{ width: 1280, height: 900 }, "desktop"], [PHONE, "phone"]]) {
    const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now(), vp);
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSPlaytest && window.SSDNSActionPips && window.SSDNSTurnLock && window.SSDNSDmJoin, { timeout: 25000 });
    await sleep(700);
    await pg.evaluate(() => {
      window.__toasts = []; const t0 = window.SSDNSToast; window.SSDNSToast = function (m) { window.__toasts.push(String(m)); return t0 && t0.apply(this, arguments); };
      window.SSDNSDmJoin.uid = () => "u1";
      const gr = (id, n) => ({ weapon: id, equipped: true, proficient: true, loaded: n, chambers: Array(n).fill("c"), misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
      window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Caleb"; c.calling = "gunslinger"; c.level = 5; c.speed = 30; c.ammo = [{ type: "cartridge", caliber: "", count: 50 }]; c.guns = [gr("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }]; });
    });
    await sleep(300);
    let seq = 1;
    const own = () => { seq += 3; return pg.evaluate((o) => window.SSDNSPlaytest.showTurn(o), { round: seq, turn: 0, started: true, order, seq, turnStarts: { p1: seq, e1: seq - 2, p2: seq - 1 } }); };
    const off = (extra) => { seq += 1; return pg.evaluate((o) => window.SSDNSPlaytest.showTurn(o), Object.assign({ round: seq, turn: 1, started: true, order, seq, turnStarts: { p1: seq - 1, e1: seq, p2: seq - 2 } }, extra || {})); };
    const slot = () => pg.evaluate(() => {
      const s = document.querySelector("#turnSlot"); const b = (k) => s.querySelector(`[data-tl-act="${k}"]`);
      const st = window.SSDNSActionPips.state();
      return { text: s.textContent, st, dash: b("dash") && b("dash").textContent.trim(), dashUndo: !!(b("dash") && b("dash").hasAttribute("data-tl-undo")), dodge: b("dodge") && b("dodge").textContent.trim(), dis: b("disengage") && b("disengage").textContent.trim(), pips: [...s.querySelectorAll("[data-act-pips] [data-pip]")].map((x) => x.getAttribute("data-pip") + (x.classList.contains("used") ? ":used" : "")) };
    });
    const click = (k) => pg.evaluate((kk) => document.querySelector(`#turnSlot [data-tl-act="${kk}"]`).click(), k);
    await own(); await sleep(250);
    let s = await slot();
    check(sfx + ".strip.hasMarkers", J(s.pips) === J(["action", "bonus", "reaction"]) && /Move 30\/30 ft/.test(s.text), J(s));
    await click("dash"); await sleep(150); s = await slot();
    check(sfx + ".1.dashShowsCancel", s.st.action && s.st.dash && s.dashUndo && /Cancel Dash/.test(s.dash) && /Move 60\/60 ft/.test(s.text) && s.pips.includes("action:used"), J(s));
    await click("dash"); await sleep(150); s = await slot();
    check(sfx + ".1.cancelRefundsAction", !s.st.action && !s.st.dash && s.dash === "Dash" && /Move 30\/30 ft/.test(s.text) && s.pips.includes("action"), J(s));
    /* moved 10, Dash (50 left of 60), cancel: 20 left of 30 (only the unused extra goes) */
    await pg.evaluate(() => { document.querySelector('#turnSlot [data-tl-move="5"]').click(); document.querySelector('#turnSlot [data-tl-move="5"]').click(); });
    await click("dash"); await sleep(120); s = await slot();
    check(sfx + ".1.dashAfterMoving", /Move 50\/60 ft/.test(s.text), s.text);
    await click("dash"); await sleep(120); s = await slot();
    check(sfx + ".1.cancelKeepsWalkedFeet", /Move 20\/30 ft/.test(s.text) && !s.st.action, s.text);
    /* walked into the Dash feet: the cancel is refused until the extra feet are given back */
    await click("dash"); await sleep(100);
    for (let i = 0; i < 5; i++) await pg.evaluate(() => document.querySelector('#turnSlot [data-tl-move="5"]').click());
    await sleep(120); s = await slot();
    check(sfx + ".1.walkedPastSpeed", /Move 25\/60 ft/.test(s.text), s.text);
    await click("dash"); await sleep(150); s = await slot();
    const refused = await pg.evaluate(() => window.__toasts.slice(-2).join(" | "));
    check(sfx + ".1.cancelRefusedPastSpeed", s.st.dash && s.st.action && /can't be cancelled/.test(refused), J([s.st, refused]));
    await pg.evaluate(() => document.querySelector('#turnSlot [data-tl-move="-5"]').click()); await sleep(100);
    await click("dash"); await sleep(150); s = await slot();
    check(sfx + ".1.cancelAfterGivingBack", !s.st.dash && !s.st.action && /Move 0\/30 ft/.test(s.text), J([s.st, s.text]));
    /* an attack after Dash closes the cancel */
    await own(); await sleep(200);
    await click("dash"); await sleep(120);
    await pg.evaluate(() => window.SSDNSActionPips.attack("Peacemaker")); await sleep(150); s = await slot();
    check(sfx + ".1.attackClosesCancel", s.st.dash && !s.dashUndo && s.dash === "Dash", J(s));
    await click("dash"); await sleep(120);
    check(sfx + ".1.closedStaysOn", (await slot()).st.dash);
    /* Dodge and Disengage cancel the same way */
    await own(); await sleep(200);
    await click("dodge"); await sleep(120); s = await slot();
    check(sfx + ".1.dodgeCancelButton", /Cancel Dodge/.test(s.dodge) && s.st.action, J(s));
    await click("dodge"); await sleep(120); s = await slot();
    check(sfx + ".1.dodgeCancelled", !s.st.dodge && !s.st.action && s.dodge === "Dodge", J(s));
    await click("disengage"); await sleep(120); await click("disengage"); await sleep(120); s = await slot();
    check(sfx + ".1.disengageCancelled", !s.st.disengage && !s.st.action, J(s));
    /* off turn: Dodge stays on, its button is locked (PR 2), no cancel; the DM's unlock opens the cancel again */
    await click("dodge"); await sleep(120);
    await off(); await sleep(250);
    s = await slot();
    const lockedDodge = await pg.evaluate(() => document.querySelector('#turnSlot [data-tl-act="dodge"]').classList.contains("turn-locked"));
    check(sfx + ".1.offTurnNoCancel", s.st.dodge && !/Cancel/.test(s.dodge) && lockedDodge, J([s, lockedDodge]));
    await off({ unlock: { u1: seq + 1 } }); await sleep(250);
    s = await slot();
    check(sfx + ".1.dmUnlockAllowsCancel", /Cancel Dodge/.test(s.dodge), J(s));
    /* the Weapons box keeps its own marker row */
    check(sfx + ".weaponsPipsKept", await pg.evaluate(() => !!document.querySelector(".firearms .box-head [data-act-pips]")));
    if (sfx === "phone") {
      const fit = await pg.evaluate(() => { const r = [...document.querySelectorAll("#turnPanel button")].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()); return { right: Math.max(...r.map((x) => x.right)), vw: window.innerWidth, over: document.documentElement.scrollWidth - window.innerWidth }; });
      check("phone.stripFits", fit.right <= fit.vw + 1 && fit.over <= 2, J(fit));
    }
    check(sfx + ".sheet.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  /* ---- DMCC demo: the map strip sits at the top and shows the current player's markers ---- */
  for (const [vp, sfx] of [[{ width: 1400, height: 950 }, "desktop"], [PHONE, "phone"]]) {
    const { pg, errs, ctx } = await page(dmccUrl("/dm/index.html?fresh=" + Date.now()), vp);
    await dmccOffline(pg);
    await pg.waitForFunction(() => window.DMCCEnhance && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 2, { timeout: 25000 });
    await dmccOffline(pg);
    await tab(pg, "Fight"); await sleep(300);
    await pg.evaluate(() => { document.querySelector("#combatantMenu").open = true; });
    const pids = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean));
    for (const v of pids.slice(0, 2)) { await pg.select("#initPlayer", v); await pg.click("#btnAddPlayer"); await sleep(250); }
    await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click()); await sleep(300);
    await pg.evaluate(() => { document.querySelector("#combatantMenu").open = false; });
    await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(500);
    for (let i = 0; i < 3 && (await pg.evaluate(() => window.DMCCEnhance.currentTurn().kind)) !== "player"; i++) { await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(500); }
    const curPid = await pg.evaluate(() => { const c = window.DMCCEnhance.currentTurn(); return c.playerId || c.id; });
    await tab(pg, "Map");
    await waitFor(() => pg.evaluate(() => !!document.querySelector("#mapMount canvas") && !!document.querySelector("#mapMount .ssm-turnstrip")), 20000, "dm map");
    await sleep(800);
    const geo = () => pg.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e || !e.offsetParent && getComputedStyle(e).position !== "fixed") return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
      return { strip: r("#mapMount .ssm-turnstrip"), bar: r("#mapMount .ssdns-toolbar"), canvas: r("#mapMount > canvas"), full: r("#btnMapFull"), marks: (document.querySelector('#mapMount [data-act="stripMarkers"]') || {}).textContent || "", vw: innerWidth, vh: innerHeight };
    });
    let g = await geo();
    check("dm." + sfx + ".stripOnTop", g.strip && g.bar && g.canvas && g.strip.bottom <= g.bar.top + 1 && g.strip.bottom <= g.canvas.top, J(g));
    check("dm." + sfx + ".stripMarkers", /Action/.test(g.marks) && /Bonus/.test(g.marks) && /Move \d+\/\d+ ft/.test(g.marks), J(g.marks));
    /* the DM taps a marker on the strip: the player's markers change and the strip repaints */
    await pg.evaluate(() => document.querySelector('#mapMount [data-act="stripMarkers"] [data-dm-pip="bonus"]').click()); await sleep(300);
    const ed = await pg.evaluate((pid) => ({ m: window.DMCCEnhance.playerMarkers(pid), used: !!document.querySelector('#mapMount [data-act="stripMarkers"] [data-dm-pip="bonus"].used') }), curPid);
    check("dm." + sfx + ".stripEditsMarker", ed.m && ed.m.bonus && ed.used, J(ed));
    await pg.evaluate((pid) => document.querySelector(`#mapMount [data-act="stripMarkers"] [data-pip-reset="${pid}"]`).click(), curPid); await sleep(300);
    check("dm." + sfx + ".stripReset", !(await pg.evaluate((pid) => window.DMCCEnhance.playerMarkers(pid).bonus, curPid)));
    /* a player's Dash shows on the strip (as on the Fight tab) */
    await pg.evaluate((pid) => { const p = window.DMCC.state.players[pid]; const m = window.DMCCEnhance.playerMarkers(pid); p.turnMarkers = Object.assign({}, m, { action: true, dash: true, actionBy: "dash", actUndo: "dash" }); window.DMCCEnhance.syncPlayers(); }, curPid); await sleep(300);
    check("dm." + sfx + ".stripShowsDash", /Dash/.test((await geo()).marks) && /Move \d+\/60 ft/.test((await geo()).marks), (await geo()).marks);
    /* enemy turn: no markers on the strip */
    await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(400);
    for (let i = 0; i < 3 && (await pg.evaluate(() => window.DMCCEnhance.currentTurn().kind)) === "player"; i++) { await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(400); }
    check("dm." + sfx + ".enemyTurnNoMarkers", (await geo()).marks === "");
    await pg.evaluate(() => document.querySelector("#btnMapFull").click()); await sleep(500);
    g = await geo();
    check("dm." + sfx + ".fullStripOnTop", g.strip && g.bar && g.strip.top >= 0 && g.strip.bottom <= g.bar.top + 1 && g.strip.top < 80, J(g));
    check("dm." + sfx + ".fullButtonClear", g.full && (g.strip.right <= g.full.left + 2 || g.strip.top >= g.full.bottom), J(g));
    await pg.evaluate(() => document.querySelector("#btnMapFull").click());
    check("dm." + sfx + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  /* ---- live room (emulators): the sheet's strip on the player's map ---- */
  if (!process.env.SKIP_LIVE && (await portOpen(9000)) && (await portOpen(9099))) {
    if (!/^http:\/\/127\.0\.0\.1:/.test(ORIGIN)) throw new Error("live part only runs against a local origin");
    for (const [vp, sfx] of [[{ width: 1280, height: 900 }, "desktop"], [PHONE, "phone"]]) {
      const dmP = await page("/dm/?emu=1", { width: 1400, height: 950 });
      const dm = dmP.pg;
      await waitFor(async () => /Firebase connected/i.test(await dm.$eval("#statusText", (el) => el.textContent || "")), 25000, "dm firebase");
      await dm.$eval("#btnCreateRoom", (el) => el.click());
      const code = await waitFor(() => dm.evaluate(() => { const st = window.DMCC.state; return document.body.classList.contains("in-room") && st.roomCode && !st.demo ? st.roomCode : ""; }), 20000, "room");
      const A = await page("/", vp);
      await A.pg.evaluate((w) => {
        const doc = { id: w.id, version: 1, createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z", shards: { white: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
          character: { name: w.name, player: w.name + "'s player", wizardDone: true, calling: "gunslinger", level: 5, speed: 30, hpMax: 30, hpCurrent: 20, abilities: { STR: 12, DEX: 16, CON: 12, INT: 10, WIS: 10, CHA: 10 } } };
        localStorage.setItem("ssdns.sheet.char." + w.id, JSON.stringify(doc)); localStorage.setItem("ssdns.sheet.last", JSON.stringify(w.id));
        localStorage.setItem("ssdns.sheet.index", JSON.stringify([{ id: w.id, name: w.name, calling: "gunslinger", level: 5, updatedAt: doc.updatedAt }]));
      }, { id: "char-wade", name: "Wade" });
      await A.pg.goto(ORIGIN + "/?emu=1&room=" + encodeURIComponent(code), { waitUntil: "domcontentloaded" });
      const pl = A.pg;
      await waitFor(() => pl.evaluate(() => !!(window.SSDNSApp && window.SSDNSDmJoin && window.SSDNSTurnLock)), 20000, "sheet boot");
      await waitFor(async () => ((await pl.$eval("#btnDmJoin", (el) => el.textContent || "")).indexOf(code) >= 0), 20000, "join button");
      await pl.$eval("#btnDmJoin", (el) => el.click());
      await waitFor(async () => /Joined /i.test(await pl.$eval("#dmJoinStatus", (el) => el.textContent || "")), 25000, "joined");
      await waitFor(() => dm.evaluate(() => Object.keys(window.DMCC.state.players || {}).length >= 1), 20000, "dm sees player");
      const uid = await pl.evaluate(() => window.SSDNSDmJoin.uid());
      await tab(dm, "Fight"); await sleep(300);
      await dm.evaluate(() => { document.querySelector("#combatantMenu").open = true; });
      await dm.select("#initPlayer", uid); await dm.click("#btnAddPlayer"); await sleep(300);
      await dm.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click()); await sleep(300);
      await dm.evaluate(() => { document.querySelector("#combatantMenu").open = false; });
      await dm.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(600);
      for (let i = 0; i < 3 && (await dm.evaluate(() => window.DMCCEnhance.currentTurn().kind)) !== "player"; i++) { await dm.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(600); }
      await waitFor(() => pl.evaluate(() => window.SSDNSTurnLock.myTurn()), 15000, "player's turn");
      const home = await pl.evaluate(() => { const p = document.getElementById("turnPanel"); return !!p && !p.closest("#mapMount") && !p.hidden; });
      check("live." + sfx + ".stripHomeOnSheet", home);
      await tab(pl, "Map");
      await waitFor(() => pl.evaluate(() => !!document.querySelector("#mapMount canvas") && !document.querySelector("#mapMount").hidden), 20000, "player map");
      await sleep(900);
      const pgeo = () => pl.evaluate(() => {
        const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
        const panel = document.getElementById("turnPanel");
        const own = document.querySelector("#mapMount > .ssm-turnstrip");
        return { inMap: !!(panel && panel.closest("#mapMount > .ssm-turnhost")), panel: r(panel), bar: r(document.querySelector("#mapMount .ssdns-toolbar")), canvas: r(document.querySelector("#mapMount > canvas")),
          ownStripShown: !!(own && getComputedStyle(own).display !== "none"), count: document.querySelectorAll("#turnPanel").length, full: r(document.getElementById("btnMapFull")),
          pips: document.querySelectorAll("#mapMount #turnSlot [data-pip]").length, move: ((document.querySelector("#mapMount #turnSlot .tl-move") || {}).textContent || ""), vw: innerWidth };
      });
      let g = await pgeo();
      check("live." + sfx + ".samePanelInMap", g.inMap && g.count === 1, J(g));
      check("live." + sfx + ".mapStripOnTop", g.panel && g.bar && g.canvas && g.panel.h > 0 && g.panel.bottom <= g.bar.top + 1 && g.panel.bottom <= g.canvas.top, J(g));
      check("live." + sfx + ".mapShowsMarkersMove", g.pips === 3 && /Move 30\/30 ft/.test(g.move), J(g));
      check("live." + sfx + ".noDoubleStrip", !g.ownStripShown, J(g));
      check("live." + sfx + ".fitsWidth", g.panel.right <= g.vw + 1, J(g));
      /* Dash on the map and cancel it; the DM sees both */
      await pl.evaluate(() => document.querySelector('#mapMount [data-tl-act="dash"]').click()); await sleep(200);
      const d1 = await pl.evaluate(() => ({ st: window.SSDNSActionPips.state(), btn: document.querySelector('#mapMount [data-tl-act="dash"]').textContent }));
      check("live." + sfx + ".mapDash", d1.st.dash && d1.st.action && /Cancel Dash/.test(d1.btn), J(d1));
      check("live." + sfx + ".dmSeesDash", !!(await waitFor(() => dm.evaluate((pid) => { const r = document.querySelector(`#turnRules [data-tr-pid="${pid}"]`); return r && /Dash/.test(r.textContent) && /Move 60\/60 ft/.test(r.textContent); }, uid), 15000, "dm dash").catch(() => false)));
      await pl.evaluate(() => document.querySelector('#mapMount [data-tl-act="dash"]').click()); await sleep(200);
      const d2 = await pl.evaluate(() => ({ st: window.SSDNSActionPips.state(), btn: document.querySelector('#mapMount [data-tl-act="dash"]').textContent }));
      check("live." + sfx + ".mapCancel", !d2.st.dash && !d2.st.action && d2.btn.trim() === "Dash", J(d2));
      check("live." + sfx + ".dmSeesCancel", !!(await waitFor(() => dm.evaluate((pid) => { const r = document.querySelector(`#turnRules [data-tr-pid="${pid}"]`); return r && !/Dash/.test(r.textContent) && /Move 30\/30 ft/.test(r.textContent); }, uid), 15000, "dm cancel").catch(() => false)));
      /* the player card's action list still offers Dash (same button) */
      const cardGeo = () => pl.evaluate(() => { const c = document.querySelector("#mapMount .ssdns-playercard"); const p = document.getElementById("turnPanel"); const b = document.getElementById("yourTurnBanner"); const r = (e) => e && e.getBoundingClientRect(); const cr = r(c), pr = r(p);
        return { card: !!c, cardTop: cr && cr.top, panelBottom: pr && pr.bottom, bannerShown: !!(b && getComputedStyle(b).display !== "none" && b.getBoundingClientRect().height > 0), badge: p ? getComputedStyle(p.querySelector(".turn-round"), "::after").content : "" }; });
      let cg = await cardGeo();
      check("live." + sfx + ".cardBelowStrip", cg.card && cg.cardTop >= cg.panelBottom - 1, J(cg));
      check("live." + sfx + ".bannerHiddenWhileDocked", !cg.bannerShown && /Your turn/.test(cg.badge), J(cg));
      /* full screen: the strip stays on top, clear of the Exit button */
      await pl.evaluate(() => document.querySelector("#btnMapFull").click()); await sleep(500);
      g = await pgeo();
      check("live." + sfx + ".fullStripOnTop", g.inMap && g.panel.top >= 0 && g.panel.top < 60 && g.panel.bottom <= g.bar.top + 1, J(g));
      check("live." + sfx + ".fullClearOfExit", g.full && (g.panel.right <= g.full.left + 2 || g.panel.top >= g.full.bottom), J(g));
      cg = await cardGeo();
      check("live." + sfx + ".fullCardBelowStrip", cg.card && cg.cardTop >= cg.panelBottom - 1 && !cg.bannerShown, J(cg));
      await pl.evaluate(() => document.querySelector("#btnMapFull").click()); await sleep(300);
      /* back to another tab: the strip goes home, still one element */
      await tab(pl, "Main"); await sleep(400);
      const back = await pl.evaluate(() => { const p = document.getElementById("turnPanel"); const bar = document.getElementById("dmJoinBar"); return { home: !!p && !p.closest("#mapMount"), afterBar: !!(bar && p && bar.nextSibling === p), count: document.querySelectorAll("#turnPanel").length, has: document.querySelector("#mapMount").classList.contains("has-sheet-turn") }; });
      check("live." + sfx + ".stripGoesHome", back.home && back.afterBar && back.count === 1 && !back.has, J(back));
      /* the DM map: strip on top with the player's markers; a DM tap reaches the sheet */
      await tab(dm, "Map");
      await waitFor(() => dm.evaluate(() => !!document.querySelector("#mapMount canvas") && /Action/.test((document.querySelector('#mapMount [data-act="stripMarkers"]') || {}).textContent || "")), 20000, "dm map markers");
      await dm.evaluate(() => document.querySelector('#mapMount [data-act="stripMarkers"] [data-dm-pip="reaction"]').click());
      check("live." + sfx + ".dmStripTapReachesSheet", !!(await waitFor(() => pl.evaluate(() => window.SSDNSActionPips.state().reaction), 15000, "dm strip tap").catch(() => false)));
      await tab(pl, "Map"); await sleep(500);
      check("live." + sfx + ".mapStripShowsDmEdit", await pl.evaluate(() => !!document.querySelector("#mapMount #turnSlot [data-pip=reaction].used")));
      /* leaving the room puts the strip home before the map empties */
      check("live." + sfx + ".noPageErrors", dmP.errs.length === 0 && A.errs.length === 0, [...dmP.errs, ...A.errs].join(" | "));
      await dmP.ctx.close(); await A.ctx.close();
    }
  } else {
    console.log("(live part skipped: no emulators on :9000 / :9099, or SKIP_LIVE)");
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall map turn UX checks passed");
process.exit(failures.length ? 1 : 0);

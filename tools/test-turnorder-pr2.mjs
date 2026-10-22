/**
 * Turn order PR 2 (Jessey's rulings 2026-10-22, sheet 0.3.107 / DMCC 0.2.120). Builds on PR 1's turn state.
 *   1 off-turn lock: during initiative a player's attack / spell / action buttons are greyed out when it isn't their
 *     turn; the DM's "Unlock this turn" (table/initiative/unlock {uid: seq}) opens them until the next Next
 *   2 movement tracker: feet left this turn (− / +), refilled from Speed at the start of your own turn
 *   3 Dash / Disengage / Dodge: each uses the Action; Dash doubles this turn's movement
 *   4 opportunity attacks: the DM approves each one (table/initiative/oa); it uses the Reaction, which comes back
 *     at the start of your own turn; an approved OA's rolls are never "out of turn"
 *   5 token moves: players drag only their own token, only on their turn in a fight; the DM always; free outside combat
 *   6 Mercy Hands and death saves follow the turn: Mercy uses the Action and is locked off turn; a death save rolls
 *     by itself at the start of your own turn
 *   7 out-of-turn damage / healing waits on the DMCC for the DM's Apply instead of applying on its own
 *   8 the DM taps any player's Action / Bonus / R to change it (DMCC Fight tab and map card)
 *   9 Reset is DM-only: no player Reset; the DM resets any player's markers (DMCC and map)
 *   and the DMCC Table tab strip still has no Next.
 *   node tools/test-turnorder-pr2.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765;
 *   the live part also needs its emulators on :9000 / :9099 and is skipped without them)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
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

/* ---------- node part: shared rules + the sheet's markers ---------- */
const store = {};
const toasts = [];
const sb = { console, setTimeout, clearTimeout, Date };
sb.window = sb; sb.globalThis = sb;
sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
sb.SSDNSDmJoin = { uid: () => "u1", pushTurnMarkers: () => {} };
sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb", calling: "gunslinger", level: 1 } }) };
sb.SSDNSToast = (m) => toasts.push(m);
vm.createContext(sb);
vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
const T = sb.SSDNSTurn, P = sb.SSDNSActionPips;
const order = [
  { id: "p1", name: "Caleb", kind: "player", playerId: "u1", init: 20 },
  { id: "e1", name: "Outlaw", kind: "enemy", init: 15 },
  { id: "p2", name: "Jolene", kind: "player", playerId: "u2", init: 10 }
];
const at = (turn, seq, extra) => Object.assign({ round: 1, turn, started: true, order, seq, turnStarts: { p1: 1, e1: 2, p2: 3 } }, extra || {});

/* item 1: the lock and the DM's override */
check("node.1.ownTurnOpen", !T.lockedFor(at(0, 1), "u1", "Caleb"));
check("node.1.offTurnLocked", T.lockedFor(at(1, 2), "u1", "Caleb") && T.lockedFor(at(2, 3), "u1", "Caleb"));
check("node.1.noFightOpen", !T.lockedFor(Object.assign(at(1, 2), { started: false }), "u1", "Caleb") && !T.lockedFor(null, "u1", "Caleb"));
check("node.1.notInOrderOpen", !T.lockedFor(at(1, 2), "u9", "Nobody"));
check("node.1.dmUnlock", !T.lockedFor(at(1, 2, { unlock: { u1: 2 } }), "u1", "Caleb") && T.unlocked(at(1, 2, { unlock: { u1: 2 } }), "u1"));
check("node.1.unlockEndsAtNext", T.lockedFor(at(2, 3, { unlock: { u1: 2 } }), "u1", "Caleb"));
check("node.1.unlockOnlyThatPlayer", T.lockedFor(at(1, 2, { unlock: { u2: 2 } }), "u1", "Caleb"));
check("node.1.legacyRoomTrue", T.unlocked({ round: 1, turn: 1, started: true, order, unlock: { u1: true } }, "u1") && !T.unlocked(at(1, 2, { unlock: { u1: true } }), "u1"));
const cleared = at(1, 2, { unlock: { u1: 2 }, oa: { x: { status: "ask" } } }); T.clearTurnState(cleared);
check("node.1.endCombatClears", !Object.keys(cleared.unlock || {}).length && !Object.keys(cleared.oa || {}).length, J(cleared));

/* item 2 + 3: movement and Dash */
P.onTurn(at(0, 1));
check("node.2.fresh", J(T.moveLeft(P.state(), 30)) === J({ max: 30, used: 0, left: 30 }), J(T.moveLeft(P.state(), 30)));
P.move(10);
check("node.2.used", T.moveLeft(P.state(), 30).left === 20);
P.move(-5);
check("node.2.giveBack", T.moveLeft(P.state(), 30).left === 25);
P.spend("action", "Dash"); P.setFlag("dash", true);
check("node.3.dashDoubles", T.moveLeft(P.state(), 30).max === 60 && T.moveLeft(P.state(), 30).left === 55 && P.state().action, J(P.state()));
P.setFlag("dodge", true); P.setFlag("disengage", true);
P.onTurn(at(1, 2)); P.onTurn(at(2, 3));
check("node.2.keptOffTurn", P.state().moveUsed === 5 && P.state().dash && P.state().dodge, J(P.state()));
P.onTurn(at(0, 4, { round: 2, turnStarts: { p1: 4, e1: 2, p2: 3 } }));
check("node.2.refillOwnTurn", P.state().moveUsed === 0 && !P.state().dash && !P.state().dodge && !P.state().disengage && !P.state().action, J(P.state()));
check("node.2.legacyMarkersLoad", J(T.moveLeft({ action: true }, 30)) === J({ max: 30, used: 0, left: 30 }) && T.moveLeft({}, null).max === 30);

/* item 4: opportunity attacks */
const oaInit = at(1, 5, { oa: { oa_1: { from: "u1", status: "approved", seq: 5 }, oa_2: { from: "u1", status: "ask" }, oa_3: { from: "u1", status: "denied" } } });
check("node.4.approvedNotOutOfTurn", !T.outOfTurn({ playerId: "u1", uid: "u1", oa: "oa_1" }, { started: true, current: order[1], dmUid: "dm", oa: oaInit.oa }) && !T.outOfTurn({ playerId: "u1", uid: "u1", oa: "oa_1" }, { init: oaInit }));
check("node.4.askedOrDeniedStillOut", T.outOfTurn({ playerId: "u1", uid: "u1", oa: "oa_2" }, { init: oaInit }) && T.outOfTurn({ playerId: "u1", uid: "u1", oa: "oa_3" }, { init: oaInit }) && T.outOfTurn({ playerId: "u1", uid: "u1" }, { init: oaInit }));
check("node.4.pr1RuleKept", !T.outOfTurn({ playerId: "u1", uid: "u1" }, { started: true, current: order[0], dmUid: "dm" }) && !T.outOfTurn({ playerId: "u1", uid: "dm" }, { started: true, current: order[1], dmUid: "dm" }));
P.onTurn(at(1, 5));
const actionBefore = P.state().action;
P.setOa("oaArmed", "oa_1");
const r = P.attack("Peacemaker");
check("node.4.armedUsesReaction", r.oa === "oa_1" && P.state().reaction && P.state().action === actionBefore && !P.state().oaArmed && P.state().oaUsed === "oa_1", J(P.state()));
check("node.4.rollsTaggedBriefly", P.oaTag() === "oa_1");
P.attack("Peacemaker");
check("node.4.oneAttackOnly", P.state().action === true, J(P.state()));
P.onTurn(at(2, 6));
check("node.4.reactionStaysUsedOffTurn", P.state().reaction);
P.onTurn(at(0, 7, { round: 2, turnStarts: { p1: 7, e1: 5, p2: 6 } }));
check("node.4.reactionBackOwnTurn", !P.state().reaction && !P.state().oaUsed && !P.state().oaArmed, J(P.state()));
const pr = { seq: 20, oa: {} };
for (let i = 0; i < 9; i++) pr.oa["o" + i] = { status: i % 2 ? "approved" : "denied", seq: 10 + i };
T.pruneOa(pr);
check("node.4.pruneOldOnly", !pr.oa.o0 && !pr.oa.o3 && pr.oa.o4 && pr.oa.o8, J(Object.keys(pr.oa)));

/* item 5: token rule */
check("node.5.tokenRule", T.canMoveToken(at(0, 1), "u1", "") && !T.canMoveToken(at(1, 2), "u1", "") && T.canMoveToken(at(1, 2, { unlock: { u1: 2 } }), "u1", "") && T.canMoveToken(Object.assign(at(1, 2), { started: false }), "u1", ""));

/* item 9: the player can mark a pip used but not give one back during a fight; free outside combat */
P.onTurn(at(0, 8, { round: 3, turnStarts: { p1: 8, e1: 5, p2: 6 } }));
toasts.length = 0;
P.toggle("bonus");
check("node.9.markUsedOk", P.state().bonus);
P.toggle("bonus");
check("node.9.noGiveBackInFight", P.state().bonus && toasts.some((t) => /Only the DM can give back your bonus action/.test(t)), J(toasts));
P.onTurn({ round: 3, turn: 0, started: false, order });
P.toggle("bonus");
check("node.9.freeOutsideFight", !P.state().bonus, J(P.state()));
P.adopt({ action: true, bonus: false, reaction: true, turnKey: "s8", moveUsed: 15, dash: true, by: "dm" });
check("node.8.adoptDmEdit", P.state().action && P.state().reaction && P.state().moveUsed === 15 && P.state().dash, J(P.state()));

/* source wiring */
const v2 = read("dm/assets/js/v2.js"), dmcc = read("dm/assets/js/dmcc.js"), dmHtml = read("dm/index.html"), sheetHtml = read("index.html");
const mapJs = read("map/ssdns-map.js"), host = read("map/ssdns-map-host.js"), join = read("assets/js/dm-join.js"), lock = read("assets/js/turn-lock.js"), ux = read("assets/js/table-ux.js");
check("src.lockLoaded", /<script src="assets\/js\/turn-lock\.js\?v=[^"]+"><\/script>/.test(sheetHtml) && sheetHtml.indexOf("turn-lock.js") > sheetHtml.indexOf("action-pips.js"));
check("src.1.lockCoversButtons", ["button[data-fire]", "[data-gunroll]", "[data-melee-roll]", "[data-cast]", "#btnMercy", "#btnDeathSave", "[data-reload]", "#btnTakeCover", "[data-fan]"].every((s) => lock.includes(s)));
check("src.1.unlockOnInitiative", /unlock: fight\.unlock \|\| \{\}/.test(v2) && /oa: fight\.oa \|\| \{\}/.test(v2));
check("src.4.badgeKnowsOa", /oa: \(ts && ts\.oa\) \|\| \{\}/.test(dmcc));
check("src.4.oaRequest", /type: "oa"/.test(join) && /req\.type === "oa"/.test(v2) && /oaTagOn\(row, entry\)/.test(join));
check("src.5.mapLock", /function turnBlocksMove\(\)/.test(mapJs) && /if \(turnBlocksMove\(\)\) return false;/.test(mapJs) && /Your token moves on your turn/.test(mapJs));
check("src.6.mercyUsesAction", /spend\("action", "Mercy Hands"\)/.test(ux));
check("src.6.mercyHeldOutOfTurn", /E\.heldOutOfTurn\(row\)/.test(dmcc) && /if \(req\.type === "mercy"\) return;/.test(v2));
check("src.7.holds", (v2.match(/heldOutOfTurn\(/g) || []).length >= 5 && /data-held-ok/.test(v2));
check("src.8.mapDrawerMarkers", /mapMarkersHtml\(tokenCombatant\(/.test(mapJs));
check("src.9.noPlayerResetHandler", !/data-pips-reset/.test(read("assets/js/action-pips.js")));
check("src.hostUsesLock", /blockedAction/.test(host) && /function usable\(/.test(host));
check("src.noRulesChange", !/unlock|turnMarkers|"oa"/.test(read("database.rules.json")));
check("src.tableTabStillNoNext", !/data-strip-next="1">Next<\/button>/.test(v2) && (dmHtml.match(/id="btnNextTurn"/g) || []).length === 1);
check("src.v2TailIntact", /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/.test(v2));
check("src.plainWords", !/\bLeMat\b|\bcant\b/.test(lock + v2.slice(v2.indexOf("turn order PR 2"))));

/* ---------- jsdom part: item 5 on the real map ---------- */
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } }; };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() { try { this.cb(); } catch (e) {} } disconnect() {} unobserve() {} };
  w.fetch = async function (url) {
    const name = String(url).split("/").pop();
    const file = name.endsWith(".json") ? path.join(root, "map", name) : "";
    if (!file || !fs.existsSync(file)) return { ok: false, status: 404, json: async () => { throw new Error("missing " + url); } };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
  };
  const add = (rel) => { const s = w.document.createElement("script"); s.textContent = read(rel); w.document.body.appendChild(s); };
  add("assets/js/turn-rules.js"); add("map/ssdns-map-firebase.js"); add("map/ssdns-map.js");
  const pointer = (el, type, x, y) => {
    const ev = new (w.PointerEvent || w.MouseEvent)(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, pointerId: 1, button: 0, buttons: 1 });
    if (ev.pointerId == null) { try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {} }
    el.dispatchEvent(ev);
  };
  const spy = (inner) => { const log = []; return { log, subscribe: (p, cb) => inner.subscribe(p, cb), write(p, v, m) { log.push({ op: "write", path: p, value: v }); return inner.write(p, v, m); }, remove(p) { log.push({ op: "remove", path: p }); return inner.remove(p); } }; };
  const scene = JSON.parse(read("map/scene-dusty-spur.json"));
  const tokens = JSON.parse(read("map/tokens.json"));
  const mstore = { pub: {}, dm: {} }; const bus = [];
  const players = [{ uid: "p_jolene", name: "Jolene" }, { uid: "p_mira", name: "Mira" }];
  const dmAd = spy(w.SSDNSMapFirebase.memory({ role: "dm", store: mstore, bus }));
  const plAd = spy(w.SSDNSMapFirebase.memory({ role: "player", store: mstore, bus }));
  const mk = async (id, role, uid, adapter, hostObj, extra) => {
    const el = w.document.createElement("div"); el.id = id; w.document.body.appendChild(el);
    w.SSDNSMap.create(Object.assign({ el, role, uid, adapter, host: hostObj, options: Object.assign({ scene, tokens, assetBase: "", players: () => players, room: { table: { initiative: { order: [], turn: 0 } } } }, extra || {}) }));
    await sleep(80); return el;
  };
  const dmEl = await mk("dmMap", "dm", "dm", dmAd, { on: () => {}, players: () => players });
  const plEl = await mk("playerMap", "player", "p_jolene", plAd, { on: () => {}, displayName: (id) => id, actions: { get: () => [], run: () => {} } });
  const plCanvas = plEl.querySelector("canvas"), dmCanvas = dmEl.querySelector("canvas");
  const morder = [{ id: "c_jol", name: "Jolene", kind: "player", playerId: "p_jolene", init: 15 }, { id: "c_out", name: "Outlaw", kind: "enemy", init: 12 }];
  const setInit = async (v) => { await dmAd.write("table/initiative", v); await sleep(40); };
  let ypos = 300;
  const drag = async (el, ad) => {
    const mark = ad.log.length;
    pointer(el, "pointerdown", 400, ypos); pointer(el, "pointermove", 400, ypos + 40); pointer(el, "pointermove", 400, ypos + 70); pointer(el, "pointerup", 400, ypos + 70);
    await sleep(40);
    const moved = ad.log.slice(mark).some((e) => e.op === "write" && /tokens\/ply_p_jolene\/pos$/.test(e.path));
    if (moved) ypos += 70;
    return moved;
  };
  check("map.5.freeOutsideFight", await drag(plCanvas, plAd));
  await setInit({ round: 1, turn: 1, started: true, order: morder, seq: 2, turnStarts: { c_jol: 1, c_out: 2 } });
  check("map.5.lockedOffTurn", !(await drag(plCanvas, plAd)));
  { const mark = dmAd.log.length; pointer(dmCanvas, "pointerdown", 85, 265); pointer(dmCanvas, "pointermove", 120, 265); pointer(dmCanvas, "pointermove", 155, 265); pointer(dmCanvas, "pointerup", 155, 265); await sleep(40);
    check("map.5.dmAlwaysMoves", dmAd.log.slice(mark).some((e) => e.op === "write" && /tokens\//.test(e.path)), J(dmAd.log.slice(mark).map((e) => e.path))); }
  await setInit({ round: 1, turn: 1, started: true, order: morder, seq: 2, turnStarts: { c_jol: 1, c_out: 2 }, unlock: { p_jolene: 2 } });
  check("map.5.dmUnlockLetsMove", await drag(plCanvas, plAd));
  await setInit({ round: 2, turn: 0, started: true, order: morder, seq: 3, turnStarts: { c_jol: 3, c_out: 2 } });
  check("map.5.ownTurnMoves", await drag(plCanvas, plAd));
  await setInit({ round: 2, turn: 0, started: false, order: morder });
  check("map.5.afterCombatFree", await drag(plCanvas, plAd));
  w.close();
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
  await pg.setViewport(vp || { width: 1400, height: 1000 });
  await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
  return { pg, errs, ctx };
}
async function waitFor(fn, ms, label) {
  const t0 = Date.now(); let last = "";
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; last = J(v); } catch (e) { last = e.message; } await sleep(200); }
  throw new Error("timeout: " + label + " (" + last + ")");
}
const tab = (pg, name) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === n).click(), name);
const gunKit = () => {
  const gunRow = (id, n) => ({ weapon: id, equipped: true, proficient: true, loaded: n, chambers: Array(n).fill("c"), misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
  window.SSDNSApp.applyPatch((d) => {
    const c = d.character; c.calling = "gunslinger"; c.level = 5; c.speed = 30;
    c.abilities = Object.assign(c.abilities || {}, { STR: 12, DEX: 16 }); c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
    c.guns = [gunRow("pony-arms-chaosmaker-medium", 6), { weapon: "" }, { weapon: "" }, { weapon: "" }];
  });
};
try {
  /* ---- sheet (demo, no room): items 1, 2, 3, 6, 9 ---- */
  {
    const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now(), { width: 1280, height: 900 });
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSPlaytest && window.SSDNSActionPips && window.SSDNSTurn && window.SSDNSDmJoin && window.SSDNSTurnLock, { timeout: 25000 });
    await sleep(800);
    await pg.evaluate(() => { window.SSDNSDmJoin.uid = () => "u1"; window.SSDNSApp.applyPatch((d) => { d.character.name = "Caleb"; }); });
    await pg.evaluate(gunKit);
    await sleep(400);
    await pg.evaluate(() => { const t = document.querySelector("#tab-equip"); if (t) t.click(); }); await sleep(400);
    const show = (turn, seq, extra) => pg.evaluate((o) => window.SSDNSPlaytest.showTurn(o), Object.assign({ round: 1, turn, started: true, order, seq, turnStarts: { p1: 1, e1: 2, p2: 3 } }, extra || {}));
    const lockState = () => pg.evaluate(() => {
      const L = (s) => { const b = document.querySelector(s); return b ? b.classList.contains("turn-locked") : null; };
      return { gun: L("[data-gunroll]"), cover: L("#btnTakeCover"), mercy: L("#btnMercy"), death: L("#btnDeathSave"), dash: L('[data-tl-act="dash"]'), skill: document.querySelectorAll(".turn-locked[data-skill], .turn-locked[data-save]").length, oa: !!document.querySelector("[data-tl-oa]"), slot: (document.querySelector("#turnSlot") || {}).textContent || "" };
    });
    check("sheet.noLockOutsideFight", (await lockState()).gun === false && (await lockState()).cover === false);
    await show(1, 2); await sleep(250);
    const off = await lockState();
    check("sheet.1.offTurnGreyed", off.gun && off.cover && off.mercy && off.death && off.dash && off.skill === 0, J(off));
    check("sheet.4.oaButtonOffTurn", off.oa && /Not your turn/.test(off.slot), J(off));
    const clicked = await pg.evaluate(() => { const before = window.SSDNSActionPips.state().action; document.querySelector("[data-gunroll]").click(); return { before, after: window.SSDNSActionPips.state().action, toast: [...document.querySelectorAll(".toast, #toast")].map((t) => t.textContent).join(" | ") }; });
    check("sheet.1.clickBlocked", clicked.before === clicked.after && /isn't your turn/i.test(clicked.toast), J(clicked));
    await show(1, 2, { unlock: { u1: 2 } }); await sleep(250);
    const unl = await lockState();
    check("sheet.1.dmUnlockOpens", !unl.gun && !unl.cover && /DM unlocked this turn/.test(unl.slot), J(unl));
    await show(2, 3, { unlock: { u1: 2 } }); await sleep(250);
    check("sheet.1.unlockEndsAtNext", (await lockState()).gun === true);
    await show(0, 4, { round: 2, turnStarts: { p1: 4, e1: 2, p2: 3 } }); await sleep(250);
    const mine = await lockState();
    check("sheet.1.ownTurnOpen", mine.gun === false && mine.dash === false && !mine.oa, J(mine));
    check("sheet.2.trackerFull", /Move 30\/30 ft/.test(mine.slot), mine.slot);
    await pg.evaluate(() => { document.querySelector('[data-tl-move="5"]').click(); document.querySelector('[data-tl-move="5"]').click(); }); await sleep(150);
    check("sheet.2.minus", /Move 20\/30 ft/.test(await pg.$eval("#turnSlot", (e) => e.textContent)));
    await pg.evaluate(() => document.querySelector('[data-tl-move="-5"]').click()); await sleep(150);
    check("sheet.2.plus", /Move 25\/30 ft/.test(await pg.$eval("#turnSlot", (e) => e.textContent)));
    await pg.evaluate(() => document.querySelector('[data-tl-act="dash"]').click()); await sleep(150);
    const dash = await pg.evaluate(() => ({ st: window.SSDNSActionPips.state(), slot: document.querySelector("#turnSlot").textContent }));
    check("sheet.3.dashUsesActionDoubles", dash.st.action && dash.st.dash && /Move 55\/60 ft/.test(dash.slot), J(dash));
    await pg.evaluate(() => document.querySelector('[data-tl-act="dodge"]').click()); await sleep(150);
    const dodge = await pg.evaluate(() => ({ st: window.SSDNSActionPips.state() }));
    check("sheet.3.dodgeFlag", dodge.st.dodge && dodge.st.action, J(dodge));
    await pg.evaluate(() => document.querySelector('[data-tl-act="disengage"]').click()); await sleep(150);
    check("sheet.3.disengageFlag", (await pg.evaluate(() => window.SSDNSActionPips.state())).disengage);
    /* off turn keeps movement; own turn refills */
    await show(1, 5, { round: 2, turnStarts: { p1: 4, e1: 5, p2: 3 } }); await sleep(200);
    check("sheet.2.keptOffTurn", /Move 55\/60 ft/.test(await pg.$eval("#turnSlot", (e) => e.textContent)));
    await show(0, 7, { round: 3, turnStarts: { p1: 7, e1: 5, p2: 6 } }); await sleep(250);
    const refill = await pg.evaluate(() => ({ st: window.SSDNSActionPips.state(), slot: document.querySelector("#turnSlot").textContent }));
    check("sheet.2.refillOwnTurn", /Move 30\/30 ft/.test(refill.slot) && !refill.st.action && !refill.st.dash, J(refill));
    /* item 9: no player Reset; a used pip can't be given back during a fight */
    check("sheet.9.noResetButton", await pg.evaluate(() => !document.querySelector("[data-pips-reset]") && ![...document.querySelectorAll("[data-act-pips] button")].some((b) => /^Reset$/i.test(b.textContent.trim()))));
    const pip = await pg.evaluate(() => { const b = document.querySelector("[data-act-pips] .pip-bonus"); b.click(); const a = window.SSDNSActionPips.state().bonus; b.click(); return [a, window.SSDNSActionPips.state().bonus]; });
    check("sheet.9.pipNoGiveBack", pip[0] === true && pip[1] === true, J(pip));
    /* item 6: Mercy uses the action; death save rolls at the start of my own turn at 0 HP */
    check("sheet.6.mercyInLockList", await pg.evaluate(() => { const b = document.querySelector("#btnMercy"); return !!b; }));
    await pg.evaluate(() => { window.SSDNSTestRoll = () => 5; window.SSDNSApp.applyPatch((d) => { d.character.hpCurrent = 0; d.character.hpMax = 30; d.character.deathSaves = { success: [false, false, false], fail: [false, false, false] }; }); const i = document.getElementById("inHPCur"); if (i) { i.value = "0"; i.dispatchEvent(new Event("input", { bubbles: true })); } });
    await sleep(200);
    const ds0 = await pg.evaluate(() => { const d = window.SSDNSApp.doc().character.deathSaves || {}; return (d.success || []).filter(Boolean).length + (d.fail || []).filter(Boolean).length; });
    await show(1, 8, { round: 3, turnStarts: { p1: 7, e1: 8, p2: 6 } }); await sleep(500);
    const ds1 = await pg.evaluate(() => { const d = window.SSDNSApp.doc().character.deathSaves || {}; return (d.success || []).filter(Boolean).length + (d.fail || []).filter(Boolean).length; });
    check("sheet.6.noDeathSaveOffTurn", ds1 === ds0, J([ds0, ds1]));
    await show(0, 10, { round: 4, turnStarts: { p1: 10, e1: 8, p2: 9 } }); await sleep(900);
    const ds2 = await pg.evaluate(() => { const d = window.SSDNSApp.doc().character.deathSaves || {}; return (d.success || []).filter(Boolean).length + (d.fail || []).filter(Boolean).length; });
    check("sheet.6.deathSaveAtTurnStart", ds2 === ds0 + 1, J([ds0, ds2]));
    await show(0, 10, { round: 4, turnStarts: { p1: 10, e1: 8, p2: 9 } }); await sleep(700);
    const ds3 = await pg.evaluate(() => { const d = window.SSDNSApp.doc().character.deathSaves || {}; return (d.success || []).filter(Boolean).length + (d.fail || []).filter(Boolean).length; });
    check("sheet.6.oneDeathSavePerTurn", ds3 === ds2, J([ds2, ds3]));
    check("sheet.6.deathButtonAfterAutoRoll", await pg.evaluate(() => document.querySelector("#btnDeathSave").classList.contains("turn-locked")));
    /* phone width: the tracker wraps but stays usable */
    await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); /* (isMobile reloads the page) */
    await pg.waitForFunction(() => window.SSDNSPlaytest && window.SSDNSTurnLock && window.SSDNSDmJoin, { timeout: 25000 }); await sleep(600);
    await pg.evaluate(() => { window.SSDNSDmJoin.uid = () => "u1"; });
    await show(1, 11, { round: 4, turnStarts: { p1: 10, e1: 11, p2: 9 } }); await sleep(400);
    const phone = await pg.evaluate(() => { const r = [...document.querySelectorAll("#turnSlot button")].map((b) => b.getBoundingClientRect()); return { html: document.querySelector("#turnSlot").innerHTML.slice(0, 200), lock: window.SSDNSTurnLock.inFight(), n: r.length, right: Math.max(...r.map((x) => x.right)), vw: window.innerWidth, over: document.documentElement.scrollWidth - window.innerWidth }; });
    check("sheet.phoneFits", phone.n >= 5 && phone.right <= phone.vw + 1 && phone.over <= 2, J(phone));
    check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  /* ---- DMCC demo: items 1, 4, 7, 8, 9 on the Fight tab; Table tab still no Next; map card markers ---- */
  for (const [vp, sfx] of [[{ width: 1400, height: 1000 }, "desktop"], [{ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "phone"]]) {
    const { pg, errs, ctx } = await page(dmccUrl("/dm/index.html?fresh=" + Date.now()), vp);
    await dmccOffline(pg); /* never the live ssdns-dm-hub database */
    await pg.waitForFunction(() => window.DMCC && window.DMCCEnhance && window.SSDNSTurn && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 2, { timeout: 20000 });
    await tab(pg, "Fight"); await sleep(300);
    await pg.evaluate(() => { document.querySelector("#combatantMenu").open = true; });
    const players = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean));
    for (const v of players.slice(0, 2)) { await pg.select("#initPlayer", v); await pg.click("#btnAddPlayer"); await sleep(250); }
    await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click()); await sleep(300);
    await pg.evaluate(() => { document.querySelector("#combatantMenu").open = false; });
    check("dm." + sfx + ".noPanelBeforeFight", await pg.evaluate(() => document.querySelector("#turnRules").hidden));
    await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(600);
    const info = await pg.evaluate(() => { const s = window.DMCCEnhance.turnState(); const cur = window.DMCCEnhance.currentTurn(); const pcs = s.order.filter((r) => r.kind === "player"); return { cur: cur.playerId || cur.id, curKind: cur.kind, pcs: pcs.map((r) => r.playerId || r.id), enemy: (s.order.find((r) => r.kind === "enemy") || {}).id }; });
    const onP = info.curKind === "player" ? info.cur : info.pcs[0];
    const offP = info.pcs.find((p) => p !== onP);
    const panel = await pg.evaluate(() => ({ hidden: document.querySelector("#turnRules").hidden, rows: document.querySelectorAll("#turnRules [data-tr-pid]").length, text: document.querySelector("#turnRules").textContent }));
    check("dm." + sfx + ".9.panelEveryPlayer", !panel.hidden && panel.rows === 2 && /Move 30\/30 ft/.test(panel.text), J(panel));
    /* item 8: tap a player's pip */
    const pipSel = (pid, k) => `#turnRules [data-dm-pip="${k}"][data-pip-pid="${pid}"]`;
    await pg.evaluate((s) => document.querySelector(s).click(), pipSel(offP, "reaction")); await sleep(200);
    await pg.evaluate((s) => document.querySelector(s).click(), pipSel(offP, "action")); await sleep(200);
    const ed = await pg.evaluate((pid) => ({ m: window.DMCCEnhance.playerMarkers(pid), stored: (window.DMCC.state.players[pid] || {}).turnMarkers }), offP);
    check("dm." + sfx + ".8.editMarks", ed.m.reaction && ed.m.action && ed.stored.by === "dm" && /marked your action used/.test(ed.stored.dmNote), J(ed.stored));
    await pg.evaluate((s) => document.querySelector(s).click(), pipSel(offP, "action")); await sleep(200);
    check("dm." + sfx + ".8.editBack", !(await pg.evaluate((pid) => window.DMCCEnhance.playerMarkers(pid), offP)).action);
    /* item 9: DM Reset */
    await pg.evaluate((pid) => document.querySelector(`#turnRules [data-pip-reset="${pid}"]`).click(), offP); await sleep(250);
    const rs = await pg.evaluate((pid) => ({ m: window.DMCCEnhance.playerMarkers(pid), }), offP);
    check("dm." + sfx + ".9.dmReset", !rs.m.action && !rs.m.reaction && !rs.m.bonus && rs.m.moveUsed === 0, J(rs));
    /* item 1: Unlock this turn, and it closes at the next Next */
    check("dm." + sfx + ".1.noUnlockOnOwnTurn", await pg.evaluate((pid) => !document.querySelector(`#turnRules [data-turn-unlock="${pid}"]`), onP));
    await pg.evaluate((pid) => document.querySelector(`#turnRules [data-turn-unlock="${pid}"]`).click(), offP); await sleep(250);
    const un = await pg.evaluate((pid) => ({ s: window.DMCCEnhance.turnState(), btn: document.querySelector(`#turnRules [data-turn-unlock="${pid}"]`).textContent.trim() }), offP);
    check("dm." + sfx + ".1.unlockWritten", !!un.s.unlock && un.s.unlock[offP] === un.s.seq && /Lock again/.test(un.btn), J([un.s.unlock, un.s.seq, un.btn]));
    /* item 4: an OA request lands in the approve list; Approve writes status */
    await pg.evaluate((o) => window.DMCCEnhance.noteOaRequest({ type: "oa", from: o.off, characterName: "Offie", targetName: "Outlaw", targetId: o.enemy, ts: new Date().toISOString() }, "oa_t1"), { off: offP, enemy: info.enemy }); await sleep(250);
    check("dm." + sfx + ".4.oaListed", await pg.evaluate(() => !!document.querySelector('#turnRules [data-oa-ok="oa_t1"]') && /Opportunity attacks to approve/.test(document.querySelector("#turnRules").textContent)));
    await pg.evaluate(() => document.querySelector('#turnRules [data-oa-ok="oa_t1"]').click()); await sleep(250);
    const oa = await pg.evaluate(() => window.DMCCEnhance.turnState().oa);
    check("dm." + sfx + ".4.oaApproved", oa.oa_t1 && oa.oa_t1.status === "approved" && !(await pg.evaluate(() => !!document.querySelector('#turnRules [data-oa-ok="oa_t1"]'))), J(oa));
    const badge = await pg.evaluate((o) => ({ tagged: window.DMCC.rollOutOfTurn({ id: "r1", playerId: o.off, uid: "x", oa: "oa_t1", damage: 3 }), plain: window.DMCC.rollOutOfTurn({ id: "r2", playerId: o.off, uid: "x", damage: 3 }) }), { off: offP });
    check("dm." + sfx + ".4.badgeRespectsOa", badge.tagged === false && badge.plain === true, J(badge));
    await pg.evaluate((o) => window.DMCCEnhance.noteOaRequest({ type: "oa", from: o.off, characterName: "Offie", targetName: "Outlaw", ts: new Date().toISOString() }, "oa_t2"), { off: offP }); await sleep(200);
    await pg.evaluate(() => document.querySelector('#turnRules [data-oa-no="oa_t2"]').click()); await sleep(200);
    check("dm." + sfx + ".4.oaDenied", (await pg.evaluate(() => window.DMCCEnhance.turnState().oa.oa_t2.status)) === "denied");
    /* item 7: an out-of-turn hit waits; the on-turn player's applies */
    const hp0 = await pg.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, info.enemy);
    const held = await pg.evaluate((o) => ({ off: window.DMCCEnhance.heldOutOfTurn({ from: o.off }), on: window.DMCCEnhance.heldOutOfTurn({ from: o.on }), oa: window.DMCCEnhance.heldOutOfTurn({ from: o.off, oa: "oa_t1" }), dm: window.DMCCEnhance.heldOutOfTurn({ from: window.DMCC.state.uid }) }), { off: offP, on: onP });
    check("dm." + sfx + ".7.whoWaits", held.off === true && held.on === false && held.oa === false && held.dm === false, J(held));
    await pg.evaluate((o) => window.DMCCEnhance.holdHit({ rollId: "h_t1", targetId: o.enemy, targetName: "Outlaw", amount: 2, from: o.off, characterName: "Offie", type: "attack", heal: false }, "Offie → Outlaw for 2"), { off: offP, enemy: info.enemy }); await sleep(250);
    const hp1 = await pg.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, info.enemy);
    check("dm." + sfx + ".7.heldNotApplied", hp1 === hp0 && (await pg.evaluate(() => !!document.querySelector('#turnRules [data-held-ok="h_t1"]'))), J([hp0, hp1]));
    await pg.evaluate(() => document.querySelector('#turnRules [data-held-ok="h_t1"]').click()); await sleep(300);
    const hp2 = await pg.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, info.enemy);
    check("dm." + sfx + ".7.applyOnOk", hp2 === hp0 - 2 && !(await pg.evaluate(() => !!document.querySelector('#turnRules [data-held-ok="h_t1"]'))), J([hp0, hp2]));
    await pg.evaluate((o) => window.DMCCEnhance.holdHit({ rollId: "h_t2", targetId: o.enemy, targetName: "Outlaw", amount: 3, from: o.off, characterName: "Offie", type: "attack", heal: false }, "Offie → Outlaw for 3"), { off: offP, enemy: info.enemy }); await sleep(200);
    await pg.evaluate(() => document.querySelector('#turnRules [data-held-no="h_t2"]').click()); await sleep(250);
    const hp3 = await pg.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, info.enemy);
    check("dm." + sfx + ".7.skipChangesNothing", hp3 === hp2, J([hp2, hp3]));
    /* the map card (DM drawer) shows the same markers + Reset for a player */
    const mm = await pg.evaluate((pid) => window.DMCCEnhance.mapMarkersHtml(pid), offP);
    check("dm." + sfx + ".8.mapCardMarkers", /data-dm-pip="action"/.test(mm) && /data-pip-reset=/.test(mm) && /Move \d+\/\d+ ft/.test(mm), mm.slice(0, 200));
    /* next Next: unlock closes for the old turn */
    await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(500);
    check("dm." + sfx + ".1.unlockClosesAtNext", await pg.evaluate((pid) => !window.SSDNSTurn.unlocked(window.DMCCEnhance.turnState(), pid), offP));
    await tab(pg, "Table"); await sleep(300);
    check("dm." + sfx + ".tableStripNoNext", (await pg.evaluate(() => [...document.querySelectorAll("#panel-table button, #turnStrip button")].filter((b) => b.offsetParent !== null && /^Next$/i.test(b.textContent.trim())).length)) === 0);
    check("dm." + sfx + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }

  /* ---- live room (emulators): DM ⇄ players over Firebase ---- */
  if ((await portOpen(9000)) && (await portOpen(9099))) {
    const dmP = await page("/dm/?emu=1", { width: 1400, height: 1000 });
    const dm = dmP.pg;
    await waitFor(async () => /Firebase connected/i.test(await dm.$eval("#statusText", (el) => el.textContent || "")), 25000, "dm firebase");
    await dm.$eval("#btnCreateRoom", (el) => el.click());
    const code = await waitFor(() => dm.evaluate(() => { const st = window.DMCC.state; return document.body.classList.contains("in-room") && st.roomCode && !st.demo ? st.roomCode : ""; }), 20000, "room");
    const seat = async (id, name) => {
      const p = await page("/", { width: 1280, height: 900 });
      await p.pg.evaluate((w) => {
        const doc = { id: w.id, version: 1, createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z", shards: { white: 0, blue: 0, green: 0, yellow: 0, purple: 0 },
          character: { name: w.name, player: w.name + "'s player", wizardDone: true, calling: "gunslinger", level: 5, speed: 30, hpMax: 30, hpCurrent: 20, abilities: { STR: 12, DEX: 16, CON: 12, INT: 10, WIS: 10, CHA: 10 } } };
        localStorage.setItem("ssdns.sheet.char." + w.id, JSON.stringify(doc));
        localStorage.setItem("ssdns.sheet.last", JSON.stringify(w.id));
        localStorage.setItem("ssdns.sheet.index", JSON.stringify([{ id: w.id, name: w.name, calling: "gunslinger", level: 5, updatedAt: doc.updatedAt }]));
      }, { id, name });
      await p.pg.goto(ORIGIN + "/?emu=1&room=" + encodeURIComponent(code), { waitUntil: "domcontentloaded" });
      await waitFor(() => p.pg.evaluate(() => !!(window.SSDNSApp && window.SSDNSDmJoin && window.SSDNSTurnLock)), 20000, "sheet boot " + name);
      await waitFor(async () => ((await p.pg.$eval("#btnDmJoin", (el) => el.textContent || "")).indexOf(code) >= 0), 20000, "join button");
      await p.pg.$eval("#btnDmJoin", (el) => el.click());
      await waitFor(async () => /Joined /i.test(await p.pg.$eval("#dmJoinStatus", (el) => el.textContent || "")), 25000, "joined " + name);
      await p.pg.evaluate(gunKit);
      await p.pg.evaluate(() => { const t = document.querySelector("#tab-equip"); if (t) t.click(); });
      return p;
    };
    const A = await seat("char-caleb", "Caleb"), B = await seat("char-dolan", "Dolan");
    await waitFor(() => dm.evaluate(() => Object.keys(window.DMCC.state.players || {}).length >= 2), 20000, "dm sees 2");
    const uidA = await A.pg.evaluate(() => window.SSDNSDmJoin.uid()), uidB = await B.pg.evaluate(() => window.SSDNSDmJoin.uid());
    await tab(dm, "Fight"); await sleep(300);
    await dm.evaluate(() => { document.querySelector("#combatantMenu").open = true; });
    for (const v of [uidA, uidB]) { await dm.select("#initPlayer", v); await dm.click("#btnAddPlayer"); await sleep(300); }
    await dm.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click()); await sleep(300);
    await dm.evaluate(() => { document.querySelector("#combatantMenu").open = false; });
    /* start the fight and step until a player has the turn */
    await dm.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(600);
    for (let i = 0; i < 3 && (await dm.evaluate(() => window.DMCCEnhance.currentTurn().kind)) !== "player"; i++) { await dm.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(600); }
    const curUid = await dm.evaluate(() => { const c = window.DMCCEnhance.currentTurn(); return c.playerId || c.id; });
    const [On, Off, onUid, offUid] = curUid === uidA ? [A, B, uidA, uidB] : [B, A, uidB, uidA];
    const enemy = await dm.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy"); return { id: r.id, hp: r.hp, name: r.name }; });
    const locked = (p) => p.pg.evaluate(() => ({ lock: window.SSDNSTurnLock.locked(), cover: !!(document.querySelector("#btnTakeCover") || {}).classList?.contains("turn-locked") }));
    await waitFor(async () => (await locked(Off)).lock && !(await locked(On)).lock, 15000, "lock state");
    check("live.1.offLockedOnOpen", (await locked(Off)).cover && !(await locked(On)).cover);
    /* item 1: Unlock this turn reaches the player */
    await dm.evaluate((pid) => document.querySelector(`#turnRules [data-turn-unlock="${pid}"]`).click(), offUid);
    check("live.1.unlockReachesPlayer", !!(await waitFor(async () => !(await locked(Off)).lock, 15000, "unlock").catch(() => false)));
    await dm.evaluate((pid) => document.querySelector(`#turnRules [data-turn-unlock="${pid}"]`).click(), offUid);
    check("live.1.lockAgainReachesPlayer", !!(await waitFor(async () => (await locked(Off)).lock, 15000, "relock").catch(() => false)));
    /* item 3 shows on the DMCC: the on-turn player Dashes */
    await On.pg.evaluate(() => document.querySelector('[data-tl-act="dash"]').click());
    check("live.3.dmSeesDash", !!(await waitFor(() => dm.evaluate((pid) => { const r = document.querySelector(`#turnRules [data-tr-pid="${pid}"]`); return r && /Dash/.test(r.textContent) && /Move 60\/60 ft/.test(r.textContent); }, onUid), 15000, "dash on dm").catch(() => false)));
    /* item 8: the DM's tap reaches the sheet */
    await dm.evaluate((pid) => document.querySelector(`#turnRules [data-dm-pip="bonus"][data-pip-pid="${pid}"]`).click(), onUid);
    check("live.8.dmEditReachesSheet", !!(await waitFor(() => On.pg.evaluate(() => window.SSDNSActionPips.state().bonus), 15000, "dm edit").catch(() => false)));
    /* item 9: the DM's Reset reaches the sheet */
    await dm.evaluate((pid) => document.querySelector(`#turnRules [data-pip-reset="${pid}"]`).click(), onUid);
    check("live.9.dmResetReachesSheet", !!(await waitFor(() => On.pg.evaluate(() => { const s = window.SSDNSActionPips.state(); return !s.action && !s.bonus && !s.dash && /Move 30\/30 ft/.test(document.querySelector("#turnSlot").textContent); }), 15000, "dm reset").catch(() => false)));
    /* item 7: an out-of-turn hit waits for the DM */
    await Off.pg.evaluate((e) => window.SSDNSDmJoin.postDamage({ targetId: e.id, targetName: e.name, amount: 4, label: "Peacemaker", weapon: "Peacemaker", rollId: "ootdmg1" }), enemy);
    const heldRow = await waitFor(() => dm.evaluate(() => document.querySelector('#turnRules [data-held-ok="ootdmg1"]') ? 1 : 0), 15000, "held").catch(() => 0);
    const hpHeld = await dm.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, enemy.id);
    check("live.7.outOfTurnWaits", heldRow && hpHeld === enemy.hp, J([heldRow, hpHeld, enemy.hp]));
    await dm.evaluate(() => document.querySelector('#turnRules [data-held-ok="ootdmg1"]').click()); await sleep(400);
    check("live.7.dmApplies", (await dm.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, enemy.id)) === enemy.hp - 4);
    /* item 6: Mercy Hands from off turn waits too (and isn't read as damage) */
    const hpOn0 = await On.pg.evaluate(() => window.SSDNSApp.doc().character.hpCurrent);
    await Off.pg.evaluate((pid) => window.SSDNSDmJoin.postMercy({ targetId: pid, amount: 3 }), onUid);
    const mercyKey = await waitFor(() => dm.evaluate(() => { const b = [...document.querySelectorAll("#turnRules [data-held-ok]")].find((x) => /^mercy:/.test(x.getAttribute("data-held-ok"))); return b ? b.getAttribute("data-held-ok") : ""; }), 15000, "mercy held").catch(() => "");
    await sleep(800);
    check("live.6.mercyOffTurnWaits", !!mercyKey && (await On.pg.evaluate(() => window.SSDNSApp.doc().character.hpCurrent)) === hpOn0, J([mercyKey, hpOn0]));
    if (mercyKey) await dm.evaluate((k) => document.querySelector(`#turnRules [data-held-ok="${k}"]`).click(), mercyKey);
    check("live.6.mercyAppliedOnOk", !!(await waitFor(() => On.pg.evaluate((h) => window.SSDNSApp.doc().character.hpCurrent === h + 3, hpOn0), 15000, "mercy heal").catch(() => false)), J(await On.pg.evaluate(() => window.SSDNSApp.doc().character.hpCurrent)));
    /* item 4: OA round trip: ask → DM approves → one attack on the reaction → its hit applies without waiting */
    await Off.pg.evaluate((e) => { const s = document.getElementById("atkTarget"); if (s && [...s.options].some((o) => o.value === e.id)) s.value = e.id; }, enemy);
    await Off.pg.evaluate(() => document.querySelector("[data-tl-oa]").click());
    const oaId = await waitFor(() => dm.evaluate(() => { const b = document.querySelector("#turnRules [data-oa-ok]"); return b ? b.getAttribute("data-oa-ok") : ""; }), 15000, "oa ask").catch(() => "");
    check("live.4.dmSeesAsk", !!oaId, oaId);
    if (oaId) await dm.evaluate((id) => document.querySelector(`#turnRules [data-oa-ok="${id}"]`).click(), oaId);
    const armed = await waitFor(() => Off.pg.evaluate(() => window.SSDNSActionPips.state().oaArmed), 15000, "armed").catch(() => "");
    check("live.4.playerArmed", armed === oaId && (await Off.pg.evaluate(() => !document.querySelector("[data-gunroll]").classList.contains("turn-locked"))), J(armed));
    const before = await Off.pg.evaluate(() => window.SSDNSActionPips.state());
    await Off.pg.evaluate(() => window.SSDNSActionPips.attack("Peacemaker"));
    const after = await Off.pg.evaluate(() => window.SSDNSActionPips.state());
    check("live.4.usesReaction", after.reaction && after.action === before.action && !after.oaArmed, J(after));
    const hpA = await dm.evaluate((id) => window.DMCCEnhance.turnState().order.find((r) => r.id === id).hp, enemy.id);
    await Off.pg.evaluate((e) => window.SSDNSDmJoin.postAttack({ targetId: e.id, targetName: e.name, amount: 2, hitTotal: 40, nat: 15, label: "Peacemaker", weapon: "Peacemaker", rollId: "oaatk1", gun: true }), enemy);
    check("live.4.oaHitApplies", !!(await waitFor(() => dm.evaluate((o) => window.DMCCEnhance.turnState().order.find((r) => r.id === o.id).hp === o.hp - 2, { id: enemy.id, hp: hpA }), 15000, "oa hit").catch(() => false)));
    check("live.4.lockedAfterOa", await Off.pg.evaluate(() => document.querySelector("[data-gunroll]").classList.contains("turn-locked")));
    check("live.noPageErrors", dmP.errs.length === 0 && A.errs.length === 0 && B.errs.length === 0, [...dmP.errs, ...A.errs, ...B.errs].join(" | "));
    await dmP.ctx.close(); await A.ctx.close(); await B.ctx.close();
  } else {
    console.log("(live part skipped: no emulators on :9000 / :9099)");
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall turn order PR 2 checks passed");
process.exit(failures.length ? 1 : 0);

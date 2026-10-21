/**
 * 0.3.100 / 0.2.113: Jessey 2026-10-19 10:13 PM CT, "98 didnt apply to the maps full screen side or the player side".
 * The #98 dice + feed behaviour now also covers:
 *  - the map's own dice lane (DMCC map and player map, normal and full screen): the die art and "1d4 = 4" show inline
 *    to the right of the lane's buttons, the lane never grows, and in full screen every roll lands there (the page tray is covered)
 *  - the player sheet's top dice tray: inline to the right, no layout shift (tabs stay put)
 *  - the map chat (DM + player) and the popped-out chat: a single die reads "Ada: 1d4 = 3", not "Ada: d4 [blank] 1d4 = 3 (3)";
 *    the player's dm-join writer no longer writes "d4 1d4 = 4 (4)"; pools and modified rolls keep their breakdown
 * The player map is opened with the real sheet + map code and a stubbed join (in-memory map adapter), so no emulator is needed.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-ui-notes-2.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const SIDES = [4, 6, 8, 10, 12, 20, 100];

/* ---- pure: tidySingle after a speaker */
require("../assets/js/dice-art.js");
const T = globalThis.SSDNSDice && globalThis.SSDNSDice.tidySingle;
check("tidy.exists", typeof T === "function");
const cases = [
  ["Ada: d4 1d4 = 3 (3)", "Ada: 1d4 = 3"], ["Ada · d4 · 1d4 = 3 (3)", "Ada · 1d4 = 3"], ["d100 1d100 = 73 (73)", "1d100 = 73"],
  ["Ada: Roll 2d6+1 = 9 (3 + 5 + 1)", "Ada: Roll 2d6+1 = 9 (3 + 5 + 1)"], ["Ada: d4 1d4 = 3 (2)", "Ada: d4 1d4 = 3 (2)"],
  ["Ada: Perception 1d20 = 14 (14)", "Ada: Perception 1d20 = 14 (14)"], ["DM: 1d4 = 2", "DM: 1d4 = 2"],
  ["Ada attacks Bo: d20 «14» + 3 = 17 vs AC 15 → HIT", "Ada attacks Bo: d20 «14» + 3 = 17 vs AC 15 → HIT"]
];
if (T) cases.forEach(([a, b], i) => check("tidy." + i, T(a) === b, J([a, T(a), b])));

/* ---- pure: the player's dm-join writer */
const dj = fs.readFileSync(path.join(root, "assets/js/dm-join.js"), "utf8");
function grab(src, name) {
  const start = src.indexOf("function " + name + "("); if (start < 0) return "";
  let depth = 0; for (let j = src.indexOf("{", start); j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) return src.slice(start, j + 1); }
  return "";
}
const box = vm.createContext({});
vm.runInContext(grab(dj, "rollText") + "\nthis.rollText = rollText;", box);
const rt = box.rollText;
check("writer.d4", rt({ label: "d4", formula: "1d4", result: 4, detail: "4" }) === "1d4 = 4", rt({ label: "d4", formula: "1d4", result: 4, detail: "4" }));
check("writer.d100", rt({ label: "d100", formula: "1d100", result: 73, detail: "73" }) === "1d100 = 73");
check("writer.labelled", rt({ label: "Perception", formula: "1d20", result: 14, detail: "14" }) === "Perception 1d20 = 14");
check("writer.pool", rt({ label: "Roll", formula: "2d6+1", result: 9, detail: "3 + 5 + 1" }) === "Roll 2d6+1 = 9 (3 + 5 + 1)");
check("writer.mod", rt({ label: "Roll", formula: "1d20+2", result: 13, detail: "11 + 2" }) === "Roll 1d20+2 = 13 (11 + 2)");
check("writer.attack", rt({ label: "Attack", formula: "1d20+4", result: 19, detail: "Ada → Bo: 15+4 = 19 → HIT" }) === "Ada → Bo: 15+4 = 19 → HIT");

function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port || (u.protocol === "https:" ? 443 : 80)), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const laneInfo = (pg) => pg.evaluate(() => {
  const R = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
  const bar = document.querySelector("#mapMount .dice-bar-map"); const lane = bar && bar.querySelector(".dice-stage-inline");
  const btns = bar ? [...bar.querySelectorAll(".dice-bar-btn")].map((x) => x.getBoundingClientRect()) : [];
  const vis = (n) => { if (!n) return false; const r = n.getBoundingClientRect(); if (!r.width || !r.height) return false; const at = document.elementFromPoint(r.left + Math.min(30, r.width / 2), r.top + r.height / 2); return !!(at && n.contains(at)); };
  const f = lane ? [...lane.querySelectorAll(".die-face")] : []; const line = lane && lane.querySelector(".dice-stage-line");
  return { bar: R(bar), lane: R(lane), btnRight: btns.length ? Math.round(Math.max(...btns.map((x) => x.right))) : null, visible: vis(lane), hidden: lane ? lane.hidden : null,
    faces: f.length, sides: f[0] && f[0].getAttribute("data-sides"), num: f[0] && f[0].querySelector(".die-num text") ? f[0].querySelector(".die-num text").textContent : null,
    img: !!(f[0] && f[0].querySelector("img") && f[0].querySelector("img").naturalWidth > 0), line: line ? line.textContent : null,
    pageStage: document.querySelector("#diceStage") ? !document.querySelector("#diceStage").hidden : null };
});
async function laneChecks(pg, who) {
  const before = await laneInfo(pg);
  check(who + ".lane.exists", !!before.lane && before.lane.h > 0, J(before));
  for (const n of SIDES) {
    await pg.click('#mapMount .dice-bar-map [data-die="' + n + '"]');
    await wait(300);
    const a = await laneInfo(pg);
    const m = String(a.line || "").match(new RegExp("^1d" + n + " = (\\d+)$"));
    check(who + ".d" + n + ".noShift", a.bar.h === before.bar.h && a.bar.t === before.bar.t, J({ before: before.bar, after: a.bar }));
    check(who + ".d" + n + ".inline", a.visible && a.lane.l >= a.btnRight - 1 && a.lane.t >= a.bar.t - 1 && a.lane.b <= a.bar.b + 1, J(a));
    check(who + ".d" + n + ".art", a.faces === 1 && a.sides === String(n) && !!m && a.num === m[1] && a.img, J(a));
  }
  /* any other roll (sheet button, chat, SFX) lands in the lane in full screen */
  await pg.evaluate(() => window.SSDNSDice.show({ sides: 6, face: 5, formula: "1d6", total: 5 }));
  await wait(150);
  const o = await laneInfo(pg);
  check(who + ".fullscreen.otherRolls", o.visible && o.line === "1d6 = 5" && o.bar.h === before.bar.h, J(o));
  return before;
}

/* ---- DMCC map, full screen */
const dm = await browser.newPage(); await dm.setViewport({ width: 1400, height: 900 });
dm.on("pageerror", (e) => errs.push("dm " + String(e)));
await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo") && document.querySelector('#diceBar [data-die="4"]'), { timeout: 20000 });
await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
await dm.waitForFunction(() => window.DMCC.state.demo, { timeout: 20000 });
await wait(800);
await dm.click("#tab-map");
await dm.waitForFunction(() => document.querySelector('#mapMount .dice-bar-map [data-die="4"]'), { timeout: 20000 });
await wait(800);
/* normal (not full screen): a lane roll shows in the lane, not in the page tray */
await dm.click('#mapMount .dice-bar-map [data-die="8"]'); await wait(250);
const dmNormal = await laneInfo(dm);
check("dm.map.normal.lane", dmNormal.visible && /^1d8 = \d$/.test(dmNormal.line || ""), J(dmNormal));
await dm.click("#btnMapFull"); await wait(500);
check("dm.map.fullscreen", await dm.evaluate(() => document.body.classList.contains("map-fullscreen")));
await laneChecks(dm, "dm.full");
/* DMCC Table feed still single-die clean from a map-lane roll */
const dmFeed = await dm.evaluate(() => { const n = [...document.querySelectorAll(".dock-item.dock-rolls > div:last-child")].pop(); const c = n.cloneNode(true); c.querySelectorAll(".die-num").forEach((x) => x.remove()); return { t: c.textContent.replace(/\s+/g, " ").trim(), dice: n.querySelectorAll(".die-face").length }; });
check("dm.full.feed", /^1d100 = \d+$/.test(dmFeed.t) && dmFeed.dice === 1, J(dmFeed));
await dm.click("#btnMapFull"); await wait(300);
await dm.close();

/* ---- Player sheet: top tray, then the Map tab (stubbed join) */
const sh = await browser.newPage(); await sh.setViewport({ width: 1400, height: 900 });
sh.on("pageerror", (e) => errs.push("sheet " + String(e)));
await sh.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
await sh.waitForFunction(() => window.SSDNSApp && window.SSDNSMapHost && window.SSDNSDmJoin && document.querySelector('#diceBar [data-die="4"]'), { timeout: 20000 });
await wait(800);
const top = () => sh.evaluate(() => { const R = (s) => { const n = document.querySelector(s); if (!n) return null; const b = n.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
  const btns = [...document.querySelectorAll("#diceBar .dice-bar-btn")].map((x) => x.getBoundingClientRect());
  const s = document.querySelector("#diceStage"); const f = [...s.querySelectorAll(".die-face")]; const line = s.querySelector(".dice-stage-line");
  return { tray: R("#diceTray"), bar: R("#diceBar"), stage: R("#diceStage"), tabs: R("nav.tabs"), btnRight: Math.round(Math.max(...btns.map((x) => x.right))), faces: f.length, sides: f[0] && f[0].getAttribute("data-sides"), line: line && line.textContent }; });
const t0 = await top();
check("sheet.tray", !!t0.tray && t0.tray.h > 0, J(t0));
for (const n of SIDES) {
  await sh.click('#diceBar [data-die="' + n + '"]'); await wait(250);
  const a = await top();
  check("sheet.d" + n + ".noShift", a.tray.h === t0.tray.h && a.tabs.t === t0.tabs.t && a.bar.h === t0.bar.h, J({ t0, a }));
  check("sheet.d" + n + ".inline", a.stage.l >= a.btnRight - 1 && a.stage.t >= a.tray.t - 1 && a.stage.b <= a.tray.b + 1 && a.faces === 1 && a.sides === String(n) && new RegExp("^1d" + n + " = \\d+$").test(a.line || ""), J(a));
}
const ownLog = await sh.evaluate(() => { const n = document.querySelector("#sheetDockFeed .dock-item:last-child > div:last-child") || [...document.querySelectorAll("#logFeed .log-item > div:last-child")].pop(); if (!n) return null; const c = n.cloneNode(true); c.querySelectorAll(".die-num").forEach((x) => x.remove()); return { t: c.textContent.replace(/\s+/g, " ").trim(), dice: n.querySelectorAll(".die-face").length }; });
check("sheet.ownLog.single", !!ownLog && /1d\d+ = \d+$/.test(ownLog.t) && ownLog.dice === 1 && !/\(\d+\)|d\d+ ·/.test(ownLog.t), J(ownLog));
await sh.evaluate(() => {
  window.SSDNSApp.applyPatch((d) => { d.character.name = "Wade"; d.character.player = "Jess"; });
  const Jn = window.SSDNSDmJoin;
  Jn.isJoined = () => true;
  Jn.live = () => ({ joined: true, roomCode: "UIN-0002", db: {}, fb: {}, uid: "p_wade", dmUid: "dm" });
  if (Jn.postRoll) Jn.postRoll = () => Promise.resolve();
  window.SSDNSMapFirebase.create = (o) => window.SSDNSMapFirebase.memory({ role: o.role });
  const mk = window.SSDNSMap.create;
  window.SSDNSMap.create = function () { const m = mk.apply(this, arguments); window.__map = m; return m; };
  document.querySelector("#tab-map").click();
  window.SSDNSMapHost.syncRoom();
});
await sh.waitForFunction(() => window.__map && document.querySelector('#mapMount .dice-bar-map [data-die="4"]'), { timeout: 20000 });
await wait(1000);
await sh.click('#mapMount .dice-bar-map [data-die="6"]'); await wait(250);
const plNormal = await laneInfo(sh);
check("player.map.normal.lane", plNormal.visible && /^1d6 = \d$/.test(plNormal.line || ""), J(plNormal));
await sh.click("#btnMapFull"); await wait(500);
check("player.map.fullscreen", await sh.evaluate(() => document.body.classList.contains("map-fullscreen")));
await laneChecks(sh, "player.full");
/* map chat: rows as tableFeed delivers them */
await sh.evaluate(() => {
  const ts = new Date().toISOString();
  const rows = [
    { id: "u1", who: "Ada", characterName: "Ada", from: "p_ada", fromName: "Ada", text: "d4 1d4 = 3 (3)", formula: "1d4" },
    { id: "u2", who: "Ada", characterName: "Ada", from: "p_ada", fromName: "Ada", text: "1d20 = 7", formula: "1d20" },
    { id: "u3", who: "DM", from: "dm", fromName: "DM", text: "1d100 = 52", formula: "1d100" },
    { id: "u4", who: "Ada", characterName: "Ada", from: "p_ada", fromName: "Ada", text: "Roll 2d6+1 = 9 (3 + 5 + 1)", formula: "2d6+1", dice: [{ sides: 6, face: 3 }, { sides: 6, face: 5 }] },
    { id: "u5", who: "Ada", characterName: "Ada", from: "p_ada", fromName: "Ada", text: "Roll 1d20+2 = 13 (11 + 2)", formula: "1d20+2" }
  ];
  rows.forEach((r) => window.__map.pushFeed(Object.assign({ ts, kind: "roll" }, r)));
});
await wait(300);
const chat = await sh.evaluate(() => { const log = document.querySelector('#mapMount [data-act="chatlog"]'); return [...log.children].slice(-5).map((n) => { const c = n.cloneNode(true); c.querySelectorAll(".die-num").forEach((x) => x.remove()); return { t: c.textContent.replace(/\s+/g, " ").trim(), dice: n.querySelectorAll(".die-face").length, numbered: n.querySelectorAll(".die-face .die-num").length }; }); });
check("chat.oldSingle", chat[0] && /Ada: 1d4 = 3$/.test(chat[0].t) && chat[0].dice === 1 && chat[0].numbered === 1 && !/\(3\)|d4 ·|d4 \S*1d4/.test(chat[0].t), J(chat[0]));
check("chat.newSingle", chat[1] && /Ada: 1d20 = 7$/.test(chat[1].t) && chat[1].dice === 1 && chat[1].numbered === 1, J(chat[1]));
check("chat.dmD100", chat[2] && /1d100 = 52$/.test(chat[2].t) && chat[2].dice === 1 && chat[2].numbered === 1, J(chat[2]));
check("chat.poolKeeps", chat[3] && /2d6\+1 = 9 \(3 \+ 5 \+ 1\)$/.test(chat[3].t) && chat[3].dice === 2, J(chat[3]));
check("chat.modKeeps", chat[4] && /1d20\+2 = 13 \(11 \+ 2\)$/.test(chat[4].t) && chat[4].dice === 1, J(chat[4]));
await sh.click("#btnMapFull"); await wait(200);
check("player.fullscreen.exit", await sh.evaluate(() => !document.body.classList.contains("map-fullscreen")));
check("no.pageerrors", errs.length === 0, errs.join(" | "));
await browser.close();
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nall ui-notes-2 checks passed");
process.exit(failures.length ? 1 : 0);

/**
 * Instant range, drag throttle, pending attack math, and map chat chrome.
 *   node tools/test-map-sync-polish.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
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
  w.fetch = async function () { return { ok: false, status: 404, json: async () => ({}) }; };
  w.matchMedia = function () { return { matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }; };
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function pointer(w, el, type, x, y) {
  const Ev = w.PointerEvent || w.MouseEvent;
  const ev = new Ev(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y,
    pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1
  });
  if (ev.pointerId == null) {
    try { Object.defineProperty(ev, "pointerId", { value: 1 }); } catch (e) {}
  }
  el.dispatchEvent(ev);
}
function act(el, name) { return el.querySelector('[data-act="' + name + '"]'); }

function loggingAdapter() {
  const log = [];
  const subs = [];
  let holdTokens = false;
  function deliver(path, value, meta) {
    if (holdTokens && String(path).indexOf("tokens") >= 0) return;
    const msg = Object.assign({ path: path }, meta || {});
    subs.forEach((s) => {
      if (path === s.path || String(path).indexOf(s.path + "/") === 0) s.cb(value, msg);
    });
  }
  return {
    log,
    hold(v) { holdTokens = !!v; },
    subscribe(path, cb) {
      const entry = { path: path, cb: cb };
      subs.push(entry);
      if (path === "map/public/tokens") cb(null, { path: path, ready: true });
      return function () {
        const i = subs.indexOf(entry);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    write(path, value, meta) {
      log.push({ op: "write", path: path, value: value });
      deliver(path, value, meta || {});
      return Promise.resolve({ ok: true });
    },
    remove(path) {
      log.push({ op: "remove", path: path });
      deliver(path, null, { removed: true });
      return Promise.resolve();
    }
  };
}

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const NAVY = {
  id: "gunroll:0",
  label: "Navy / Army Ball n Cap Revolver",
  name: "Navy / Army Ball n Cap Revolver",
  weapon: "navy-army-ball-n-cap-revolver",
  action: "Percussion revolver (slow)",
  group: "pistol",
  tier: "medium",
  toHit: 5,
  damage: "1d8",
  cylinder: { index: 0, loaded: 6, cap: 6, chambers: [1, 1, 1, 1, 1, 1] }
};

const pw = makeWindow();
addScript(pw, "assets/data/rules.js");
addScript(pw, "assets/js/range-rings.js");
addScript(pw, "assets/js/apply-guard.js");
addScript(pw, "map/ssdns-map-firebase.js");
addScript(pw, "map/ssdns-map.js");
const playerRuns = [];
const playerEl = pw.document.createElement("div");
pw.document.body.appendChild(playerEl);
const playerAd = loggingAdapter();
const playerApi = pw.SSDNSMap.create({
  el: playerEl, role: "player", uid: "p1", adapter: playerAd,
  host: {
    sheetTargets() { return [{ id: "tok_bandit", label: "Bandit" }]; },
    rangeWeapons() { return [{ id: NAVY.id, name: NAVY.name, weapon: NAVY.weapon, range: "20/60", group: "pistol" }]; },
    actions: {
      get() { return [NAVY]; },
      run(id, ctx) { playerRuns.push({ id: id, targetId: ctx && ctx.targetId }); }
    }
  },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
let seq = 20;
async function putToken(id, x, y, extra) {
  seq += 1;
  await playerAd.write("map/public/tokens/" + id, Object.assign({
    id: id, pos: { x: x, y: y }, name: id, size: 1
  }, extra || {}), { seq: seq, by: "dm" });
}
/* fog off for these range checks (0.3.101 fog-aware targeting only lists what the player can see) */
await playerAd.write("map/public/scenes/scn_dustyspur01", { walls: [], fogRects: [], fogRevealed: true }, { seq: 2, by: "dm" });
await putToken("tok_me", 13, 10, { ownerUid: "p1", name: "Jolene", color: "#e67e22" });
await putToken("tok_bandit", 15, 10, { name: "Bandit" });
await flush(20);
const show = act(playerEl, "showRange");
show.checked = true;
show.dispatchEvent(new pw.Event("change", { bubbles: true }));
const aim = playerEl.querySelector('[data-act="cylTarget"]');
aim.value = "tok_bandit";
aim.dispatchEvent(new pw.Event("change", { bubbles: true }));
const navyBtn = () => playerEl.querySelector('[data-act="playerAttack"][data-id="gunroll:0"]');
check("range.near", navyBtn() && !navyBtn().querySelector(".ssm-dis") && !navyBtn().disabled, navyBtn() && navyBtn().textContent);

playerAd.hold(true);
const canvas = playerEl.querySelector("canvas");
const mark = playerAd.log.length;
pointer(pw, canvas, "pointerdown", 295, 335);
pointer(pw, canvas, "pointermove", 225, 335);
pointer(pw, canvas, "pointermove", 155, 335);
pointer(pw, canvas, "pointermove", 85, 335);
const mid = navyBtn();
const midDis = mid && mid.querySelector(".ssm-dis");
check("range.during", !!(midDis && midDis.textContent === "Disadvantage" && !mid.disabled && playerEl.dataset.rangeBand === "limit"), (mid && mid.textContent) + " band=" + playerEl.dataset.rangeBand);
pw.SSDNSRangeRings.clear();
mid.click();
const peek = pw.SSDNSRangeRings.peek();
check("range.click", playerRuns.length === 1 && peek && peek.disadvantage && !peek.blocked && String(peek.button || "").indexOf("DIS") >= 0, JSON.stringify(peek && { button: peek.button, disadvantage: peek.disadvantage, blocked: peek.blocked }));
pointer(pw, canvas, "pointerup", 85, 335);
const after = navyBtn();
check("range.after", !!(after && after.querySelector(".ssm-dis") && playerEl.dataset.rangeBand === "limit"), (after && after.textContent) + " band=" + playerEl.dataset.rangeBand);
playerAd.hold(false);
const syncSeq = Date.now() + 5000;
await playerAd.write("map/public/tokens/tok_me/pos", { x: 13, y: 10, by: "dm", seq: syncSeq }, { seq: syncSeq, by: "dm" });
await flush(20);
const back = navyBtn();
check("range.syncWins", !!(back && !back.querySelector(".ssm-dis")), back && back.textContent);

const streamed = playerAd.log.slice(mark).filter((e) => e.op === "write" && String(e.path).indexOf("/pos") >= 0);
check("range.streamWhileHeld", streamed.length >= 1, "pos writes " + streamed.length);

playerApi.destroy();

const tw = makeWindow();
let now = 1_000_000;
tw.Date.now = () => now;
addScript(tw, "assets/data/rules.js");
addScript(tw, "assets/js/range-rings.js");
addScript(tw, "assets/js/apply-guard.js");
addScript(tw, "map/ssdns-map-firebase.js");
addScript(tw, "map/ssdns-map.js");
const throttleEl = tw.document.createElement("div");
tw.document.body.appendChild(throttleEl);
const throttleAd = loggingAdapter();
const throttleApi = tw.SSDNSMap.create({
  el: throttleEl, role: "player", uid: "p1", adapter: throttleAd,
  host: { actions: { get() { return []; } } },
  options: { scene, assetBase: "", room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(80);
await throttleAd.write("map/public/tokens/tok_me", {
  id: "tok_me", pos: { x: 13, y: 10 }, name: "Jolene", ownerUid: "p1", size: 1, color: "#4a90d9"
}, { seq: 3, by: "dm" });
await flush(20);
const tCanvas = throttleEl.querySelector("canvas");
const burstMark = throttleAd.log.length;
now = 2_000_000;
pointer(tw, tCanvas, "pointerdown", 295, 335);
for (let i = 1; i <= 6; i++) pointer(tw, tCanvas, "pointermove", 295 + i * 70, 335);
const burst = throttleAd.log.slice(burstMark).filter((e) => e.path && e.path.indexOf("/pos") >= 0);
check("throttle.burst", burst.length === 1, "writes " + burst.length);
pointer(tw, tCanvas, "pointermove", 295 + 6 * 70, 335);
const same = throttleAd.log.slice(burstMark).filter((e) => e.path && e.path.indexOf("/pos") >= 0);
check("throttle.sameCell", same.length === 1, "writes " + same.length);
pointer(tw, tCanvas, "pointerup", 295 + 6 * 70, 335);
const afterUp = throttleAd.log.slice(burstMark).filter((e) => e.path && e.path.indexOf("/pos") >= 0);
check("throttle.pointerup", afterUp.length === 2 && afterUp[1].path.indexOf("/pos") >= 0, "writes " + afterUp.length);
const idleMark = throttleAd.log.length;
now += 500;
await flush(200);
check("throttle.idle", throttleAd.log.length === idleMark, "extra " + (throttleAd.log.length - idleMark));

const paceMark = throttleAd.log.length;
now = 3_000_000;
pointer(tw, tCanvas, "pointerdown", 295 + 6 * 70, 335);
let px = 295 + 6 * 70;
for (let i = 0; i < 6; i++) {
  px -= 70;
  now += 200;
  pointer(tw, tCanvas, "pointermove", px, 335);
}
const paced = throttleAd.log.slice(paceMark).filter((e) => e.path && e.path.indexOf("/pos") >= 0);
check("throttle.cap", paced.length >= 5 && paced.length <= 8, "writes " + paced.length + " in one second");
pointer(tw, tCanvas, "pointerup", px, 335);

throttleApi.pushFeed({ id: "c1", fromName: "Jolene", text: "On me", kind: "chat", ts: "2026-01-01T00:00:01.000Z" });
throttleApi.pushFeed({ id: "r1", fromName: "Jolene", text: "Jolene → Bandit\nd20 «15» · DEX +3 = 18", kind: "roll", ts: "2026-01-01T00:00:02.000Z" });
throttleApi.pushFeed({ id: "d1", fromName: "DM", text: "Hold", kind: "chat", ts: "2026-01-01T00:00:03.000Z" });
const logEl = act(throttleEl, "chatlog");
const jolene = logEl.querySelector(".ssm-who");
const want = tw.SSDNSApplied.tokenColorFor("Jolene");
check("chat.color", !!(jolene && (jolene.getAttribute("style") || "").toLowerCase().indexOf(want.toLowerCase()) >= 0), (jolene && jolene.getAttribute("style")) + " vs " + want);
check("chat.dmNeutral", logEl.textContent.indexOf("DM: Hold") >= 0 && !Array.from(logEl.querySelectorAll(".ssm-who")).some((n) => n.textContent === "DM"), logEl.innerHTML);
const colorMark = throttleAd.log.length;
act(throttleEl, "chatlog").parentElement.querySelector('[data-chat-filter="rolls"]').click();
check("chat.rolls", logEl.textContent.indexOf("d20") >= 0 && logEl.textContent.indexOf("On me") < 0 && logEl.textContent.indexOf("Hold") < 0, logEl.textContent);
act(throttleEl, "chatlog").parentElement.querySelector('[data-chat-filter="talk"]').click();
check("chat.talk", logEl.textContent.indexOf("On me") >= 0 && logEl.textContent.indexOf("d20") < 0, logEl.textContent);
act(throttleEl, "chatlog").parentElement.querySelector('[data-chat-filter="all"]').click();
check("chat.filterLocal", throttleAd.log.length === colorMark, "writes " + (throttleAd.log.length - colorMark));
act(throttleEl, "chatToggle").click();
check("chat.collapsed", throttleEl.querySelector(".ssdns-chatdock").classList.contains("ssm-chat-shut"), throttleEl.querySelector(".ssdns-chatdock").className);
const beforeBadge = act(throttleEl, "chatBadge");
check("chat.badgeClear", beforeBadge.hidden, beforeBadge.textContent);
throttleApi.pushFeed({ id: "c2", fromName: "Jolene", text: "Again", kind: "chat", ts: "2026-01-01T00:00:04.000Z" });
const badge = act(throttleEl, "chatBadge");
check("chat.badge", !badge.hidden && badge.textContent === "1", badge.hidden + " " + badge.textContent);
act(throttleEl, "chatToggle").click();
check("chat.opened", badge.hidden && !throttleEl.querySelector(".ssdns-chatdock").classList.contains("ssm-chat-shut"), badge.textContent);
throttleApi.destroy();

const dw = makeWindow();
dw.Date.now = () => 4_000_000;
addScript(dw, "map/ssdns-map-firebase.js");
addScript(dw, "map/ssdns-map.js");
const dmEl = dw.document.createElement("div");
dw.document.body.appendChild(dmEl);
const dmAd = loggingAdapter();
const dmApi = dw.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd,
  host: {},
  options: {
    scene, assetBase: "",
    tokens: { tokens: {
      tok_hide: { id: "tok_hide", pos: { x: 13, y: 10 }, name: "Shade", hidden: true, color: "#9b59b6", hp: 9, notes: "secret" }
    } },
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(80);
const dmCanvas = dmEl.querySelector("canvas");
const hideMark = dmAd.log.length;
pointer(dw, dmCanvas, "pointerdown", 295, 335);
pointer(dw, dmCanvas, "pointermove", 365, 335);
const hideDuring = dmAd.log.slice(hideMark);
const publicLeak = hideDuring.some((e) => String(e.path).indexOf("map/public") === 0);
const dmWrite = hideDuring.find((e) => e.path === "map/dm/tokens/tok_hide");
check("stream.hidden", !publicLeak && !!dmWrite && dmWrite.value && dmWrite.value.hidden === true && dmWrite.value.pos && dmWrite.value.pos.x === 14, hideDuring.map((e) => e.op + " " + e.path).join(" | "));
pointer(dw, dmCanvas, "pointerup", 365, 335);
dmApi.destroy();

const sw = makeWindow();
addScript(sw, "assets/js/apply-guard.js");
addScript(sw, "assets/js/sheet-extras.js");
const dock = sw.document.createElement("aside");
dock.id = "sheetDock";
dock.innerHTML = '<div id="sheetDockFeed"></div>';
sw.document.body.appendChild(dock);
sw.SSDNSTokenColors = { jolene: "#e67e22" };
const posted = [];
sw.SSDNSDmJoin = {
  isJoined() { return true; },
  postRoll(entry) { posted.push(entry); return Promise.resolve(); },
  postAttack() { return Promise.resolve(); }
};
sw.SSDNSSheet.sendPendingAttack({
  who: "Jolene",
  targetName: "Bandit",
  targetId: "en1",
  nat: 15,
  n1: 15,
  parts: [{ label: "DEX", value: 3 }, { label: "proficiency", value: 2 }],
  hitTotal: 20,
  damage: 8,
  dice: "6",
  dmgParts: [{ label: "mod", value: 2 }],
  dmgType: "piercing",
  formula: "1d20+5",
  rollId: "r_pending",
  label: "Jolene → Bandit",
  weapon: "Navy"
});
const pending = sw.SSDNSSheet.logRows().filter((e) => e && e.attack)[0];
const pendingText = pending && pending.text || "";
const postedText = posted[0] && posted[0].detail || "";
check("pending.math", pendingText.indexOf("d20") >= 0 && pendingText.indexOf("DEX +3") >= 0 && pendingText.indexOf("proficiency +2") >= 0 && pendingText.indexOf("= 20") >= 0 && pendingText.indexOf("Damage:") >= 0 && pendingText.indexOf("= 8") >= 0, pendingText);
check("pending.hidden", pendingText.indexOf("vs AC") < 0 && !/→\s*(HIT|MISS|CRIT)/.test(pendingText) && pendingText !== "Jolene → Bandit: Waiting on DM…", pendingText);
check("pending.feed", postedText === pendingText && posted[0] && posted[0].awaitDm === true, postedText);
const colored = dock.querySelector(".ssm-who");
check("pending.nameColor", !!(colored && colored.textContent.indexOf("Jolene") >= 0 && (colored.getAttribute("style") || "").toLowerCase().indexOf(sw.SSDNSApplied.tokenColorFor("Jolene").toLowerCase()) >= 0), colored && colored.outerHTML);
const known = sw.SSDNSApplied.attackBreakdown({
  who: "Jolene", target: "Bandit", nat: 15, n1: 15, parts: [{ label: "DEX", value: 3 }], total: 18, ac: 14, revealAc: true
});
check("pending.dmStillSees", known.dmText.indexOf("vs AC 14") >= 0 && known.dmText.indexOf("HIT") >= 0 && known.publicText.indexOf("vs AC") < 0, known.publicText);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok map sync polish");

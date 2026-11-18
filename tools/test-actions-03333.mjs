/**
 * Slice 1 game actions: token moves, portraits, and initiative keep order.
 * An older seq cannot rewind a square, a picture, or the turn strip.
 * Sheet 0.3.338 / DMCC 0.2.351.
 *   node tools/test-actions-03333.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function flush(ms) { return new Promise((r) => setTimeout(r, ms)); }
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.338" && ver.dmcc === "0.2.351" && ver.sheetBuild === "sheet-playtest-v03338" && ver.dmccBuild === "dmcc-playtest-v02351");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.338") && !read("database.rules.json").includes("0.3.338"));
check("rules.untouched", !read("database.rules.json").includes("actionSeq") && !read("assets/data/rules.js").includes("moveToken"));

const mapSrc = read("map/ssdns-map.js");
const joinSrc = read("assets/js/dm-join.js");
const v2Src = read("dm/assets/js/v2.js");
check("wire.move", mapSrc.includes("function noteMove") && mapSrc.includes("GA.moveToken"));
check("wire.image", mapSrc.includes("GA.setTokenImage") && mapSrc.includes("imageSeq"));
check("wire.posSeq", mapSrc.includes("pos.seq = moveSeq"));
check("wire.roll", joinSrc.includes("SSDNSGameActions.rollInitiative"));
check("wire.turn", v2Src.includes("SSDNSGameActions.setInitiative") && v2Src.includes("actionSeq"));
check("wire.fightSeq", v2Src.includes("seq: fight.seq || 0"));
const appCheckSrc = read("assets/js/app-check.js");
check("appcheck.flag", appCheckSrc.includes("enabled !== true") && appCheckSrc.includes("ReCaptchaV3Provider") && appCheckSrc.includes("ReCaptchaEnterpriseProvider"));
check("appcheck.wire", joinSrc.includes("SSDNSAppCheck.start") && v2Src.includes("SSDNSAppCheck.start") === false && read("dm/assets/js/dmcc.js").includes("SSDNSAppCheck.start"));
const actionsSrc = read("assets/js/game-actions.js");
check("adapter.clean", actionsSrc.includes("function localAdapter") && actionsSrc.includes("send:") && !actionsSrc.includes("gstatic.com") && !actionsSrc.includes("firebase"));

function fakeFirebase() {
  const tree = {};
  const listeners = [];
  function clone(v) { return v == null || typeof v !== "object" ? v : JSON.parse(JSON.stringify(v)); }
  function get(p) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (const part of parts) {
      if (!cur || typeof cur !== "object" || !(part in cur)) return null;
      cur = cur[part];
    }
    return cur;
  }
  function setPath(p, value) {
    const parts = String(p).split("/").filter(Boolean);
    let cur = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const leaf = parts[parts.length - 1];
    if (value == null) delete cur[leaf];
    else cur[leaf] = clone(value);
  }
  function notify(p) {
    listeners.forEach((l) => {
      if (p === l.path || p.startsWith(l.path + "/") || l.path.startsWith(p + "/")) l.cb({ val: () => clone(get(l.path)) });
    });
  }
  const fb = {
    ref(_db, p) { return { path: p }; },
    onValue(r, cb) {
      const entry = { path: r.path, cb };
      listeners.push(entry);
      cb({ val: () => clone(get(r.path)) });
      return () => { const i = listeners.indexOf(entry); if (i >= 0) listeners.splice(i, 1); };
    },
    runTransaction(r, fn) {
      const next = fn(clone(get(r.path)));
      if (next === undefined) return Promise.resolve({ committed: false });
      setPath(r.path, next);
      notify(r.path);
      return Promise.resolve({ committed: true });
    },
    set(r, value) { setPath(r.path, value); notify(r.path); return Promise.resolve(); },
    remove(r) { setPath(r.path, null); notify(r.path); return Promise.resolve(); }
  };
  return { fb, get };
}

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const frames = [];
  w.requestAnimationFrame = (fn) => { const id = frames.length + 1; frames.push(fn); return id; };
  w.cancelAnimationFrame = () => {};
  w.__pump = () => {
    let n = 0;
    while (frames.length && n < 8) {
      const batch = frames.splice(0);
      n += 1;
      batch.forEach((fn) => { try { fn(n); } catch (e) {} });
    }
  };
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 640; } });
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 640, width: 900, height: 640, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    if (this.__ctx) return this.__ctx;
    const canvas = this;
    canvas.__imgs = [];
    const bag = {};
    this.__ctx = new Proxy(bag, {
      get(t, p) {
        if (p === "drawImage") return (img) => { canvas.__imgs.push(img && (img.__src || img.src || "")); };
        if (p === "measureText") return () => ({ width: 8 });
        if (p in t) return t[p];
        return () => bag;
      },
      set(t, p, v) { t[p] = v; return true; }
    });
    return this.__ctx;
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  const srcDesc = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, "src");
  Object.defineProperty(w.HTMLImageElement.prototype, "src", {
    configurable: true,
    set(v) { this.__src = String(v); if (this.onload) this.onload(); return srcDesc.set.call(this, v); },
    get() { return this.__src || ""; }
  });
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  if (typeof w.PointerEvent !== "function") {
    w.PointerEvent = class PointerEvent extends w.MouseEvent {
      constructor(type, init) { super(type, init || {}); this.pointerId = (init && init.pointerId) || 1; }
    };
  }
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function box(api, id) {
  return (api.tokenBoxes() || []).find((t) => t && t.id === id) || null;
}
function pointer(canvas, type, x, y) {
  canvas.dispatchEvent(new canvas.ownerDocument.defaultView.PointerEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1,
    button: 0, buttons: type === "pointerup" ? 0 : 1
  }));
}

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const tokens = JSON.parse(read("map/tokens.json"));
const w = makeWindow();
addScript(w, "assets/js/app-check.js");
const appCheckOff = await w.SSDNSAppCheck.start({ name: "unused" });
check("appcheck.off", appCheckOff && appCheckOff.skipped === true && w.SSDNSAppCheck.enabled() === false);
w.SSDNS_APP_CHECK = { enabled: true, siteKey: "  " };
check("appcheck.blankKey", (await w.SSDNSAppCheck.start({ name: "unused" })).skipped === true && w.SSDNSAppCheck.enabled() === false);
w.SSDNS_APP_CHECK = { enabled: false, siteKey: "site-key", enterprise: true };
check("appcheck.disabled", w.SSDNSAppCheck.enabled() === false && (await w.SSDNSAppCheck.start({ name: "unused" })).skipped === true);
["assets/js/game-actions.js", "map/ssdns-map-move.js", "map/places.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
const GA = w.SSDNSGameActions;
check("loaded", !!(GA && GA.moveToken && GA.accept(10, 11) && !GA.accept(11, 10)));

const turns = [];
GA.on((action) => {
  if (action.name === "setInitiative") turns.push(action.payload.turn);
});
const firstRoll = GA.rollInitiative({ key: "p1", playerId: "p1", init: 18, name: "Wren" }, "p1");
const secondRoll = GA.rollInitiative({ key: "p1", playerId: "p1", init: 4, name: "Wren" }, "p1");
check("roll.newer", secondRoll.seq > firstRoll.seq && secondRoll.payload.init === 4);
check("roll.oldIgnored", GA.applyRemote("rollInitiative", { key: "p1", playerId: "p1", init: 1, name: "Wren" }, firstRoll.seq, "p1") === false);
const strip = GA.setInitiative({ round: 1, turn: 2, started: true, order: [{ id: "p1" }], turnSeq: 4 }, "dm");
check("turn.oldIgnored", GA.applyRemote("setInitiative", { round: 1, turn: 0, started: true, order: [], turnSeq: 1 }, strip.seq - 1, "dm") === false);
check("turn.listener", turns.length === 1 && turns[0] === 2, JSON.stringify(turns));

const live = fakeFirebase();
const fb = live.fb;
async function boot(id, role, uid) {
  const el = w.document.createElement("div");
  el.id = id;
  w.document.body.appendChild(el);
  const api = w.SSDNSMap.create({
    el, role, uid,
    adapter: w.SSDNSMapFirebase.create({ db: {}, fb, roomCode: "SYNC", role, uid }),
    host: { players: () => [{ uid: "p_jolene", name: "Jolene" }] },
    options: {
      scene,
      tokens: role === "dm" ? tokens : { tokens: {} },
      assetBase: "",
      players: () => [{ uid: "p_jolene", name: "Jolene" }],
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
  await flush(40);
  w.__pump();
  return { el, api };
}
const dm = await boot("dm", "dm", "dm");
const pl = await boot("pl", "player", "p_jolene");
await flush(30);
w.__pump();
const edit = dm.el.querySelector('[data-act="dmEditBtn"]');
edit.click();
const canvas = dm.el.querySelector("canvas");
const who = "ply_p_jolene";
const jolene = box(dm.api, who);
check("setup.token", !!(jolene && jolene.screen));
const r = canvas.getBoundingClientRect();
const cell = Math.max(8, jolene.screen.x2 - jolene.screen.x1);
const x0 = r.left + (jolene.screen.x1 + jolene.screen.x2) / 2;
const y0 = r.top + (jolene.screen.y1 + jolene.screen.y2) / 2;
pointer(canvas, "pointerdown", x0, y0);
pointer(canvas, "pointermove", x0 + cell * 2.2, y0);
pointer(canvas, "pointerup", x0 + cell * 2.2, y0);
await flush(30);
w.__pump();
const dragged = box(dm.api, who);
const seen = box(pl.api, who);
check("drag.synced", !!(dragged && seen && dragged.x === jolene.x + 2 && seen.x === dragged.x), JSON.stringify({ from: jolene && jolene.x, dm: dragged && dragged.x, pl: seen && seen.x }));

const stored = live.get("rooms/SYNC/map/public/tokens/" + who);
check("drag.seq", !!(stored && stored.seq && stored.pos && stored.pos.seq === stored.seq), JSON.stringify(stored && { seq: stored.seq, pos: stored.pos }));
const moves = GA.recent().filter((a) => a.name === "moveToken" && a.payload.tokenId === who);
check("drag.action", moves.length > 0 && moves[moves.length - 1].payload.x === dragged.x);

const late = w.SSDNSMapFirebase.create({ db: {}, fb, roomCode: "SYNC", role: "dm", uid: "dm" });
const older = JSON.parse(JSON.stringify(stored));
older.seq = 1;
older.pos = { x: stored.pos.x - 4, y: stored.pos.y, seq: 1, by: "dm" };
const dropped = await late.write("map/public/tokens/" + who, older, { seq: 1, by: "dm", revive: true });
await flush(20);
w.__pump();
const afterOld = box(pl.api, who);
check("drag.oldDropped", !!(dropped && dropped.dropped) && afterOld && afterOld.x === dragged.x, JSON.stringify({ dropped, x: afterOld && afterOld.x }));

await fb.set(fb.ref({}, "rooms/SYNC/map/public/tokens/" + who + "/pos"), { x: stored.pos.x - 4, y: stored.pos.y, seq: 1, by: "dm" });
await flush(20);
w.__pump();
const afterEcho = box(pl.api, who);
check("drag.echoIgnored", afterEcho && afterEcho.x === dragged.x, JSON.stringify({ x: afterEcho && afterEcho.x }));

dm.api.patchToken(who, { image: "data:image/png;base64,pic-a" });
await flush(20);
w.__pump();
dm.api.patchToken(who, { image: "data:image/png;base64,pic-b" });
await flush(20);
w.__pump();
const pic = box(pl.api, who);
const images = GA.recent().filter((a) => a.name === "setTokenImage" && a.payload.tokenId === who);
check("pic.action", pic && pic.image === "data:image/png;base64,pic-b" && images.length >= 2, JSON.stringify({ image: pic && pic.image, n: images.length }));
const winner = live.get("rooms/SYNC/map/public/tokens/" + who);
await fb.set(fb.ref({}, "rooms/SYNC/map/public/tokens/" + who), Object.assign({}, winner, {
  image: "data:image/png;base64,pic-a",
  imageSeq: 1
}));
await flush(20);
w.__pump();
const picKept = box(pl.api, who);
check("pic.oldIgnored", picKept && picKept.image === "data:image/png;base64,pic-b", picKept && picKept.image);

const sent = [];
let push = null;
const swapped = GA.use({
  name: "ws",
  send: function (action) { sent.push(action); if (push) push(action); },
  subscribe: function (fn) { push = fn; return function () { push = null; }; }
});
const via = GA.moveToken("tok_swap", { x: 3, y: 4 }, "p");
check("adapter.swap", swapped === "ws" && GA.transport() === "ws" && sent.length === 1 && sent[0].name === "moveToken" && via.payload.x === 3);
check("adapter.local", GA.use(null) === "local" && GA.transport() === "local");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("actions slice 1 0.3.338 ok");

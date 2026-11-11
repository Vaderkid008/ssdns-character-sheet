/**
 * Edit tokens drag stays on the pointer. The token card opens after the pointer
 * comes up, so docking it cannot slide the map mid-drag.
 *   node tools/test-edit-drag-03273.mjs
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
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
  });
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
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 900; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 640; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 900, bottom: 640, width: 900, height: 640, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    if (this.__ctx) return this.__ctx;
    const bag = {};
    this.__ctx = new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        if (p === "measureText") return () => ({ width: 8 });
        if (p === "setTransform") return () => {};
        return () => bag;
      },
      set(t, p, v) { t[p] = v; return true; }
    });
    return this.__ctx;
  };
  if (!w.HTMLCanvasElement.prototype.setPointerCapture) w.HTMLCanvasElement.prototype.setPointerCapture = function () {};
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  if (typeof w.PointerEvent !== "function") {
    w.PointerEvent = class PointerEvent extends w.MouseEvent {
      constructor(type, init) {
        super(type, init || {});
        this.pointerId = (init && init.pointerId) || 1;
      }
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
function point(canvas, token) {
  const r = canvas.getBoundingClientRect();
  return {
    x: r.left + (token.screen.x1 + token.screen.x2) / 2,
    y: r.top + (token.screen.y1 + token.screen.y2) / 2,
    cell: token.screen.x2 - token.screen.x1
  };
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
addScript(w, "map/ssdns-map-move.js");
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
w.localStorage.removeItem("ssdns.map.dmEdit");
const el = w.document.createElement("div");
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  options: { scene, tokens, assetBase: "", room: { table: { initiative: { started: true, round: 1, turn: 0, order: [] } } } }
});
await flush(30);
w.__pump();
const edit = el.querySelector('[data-act="dmEditBtn"]');
edit.click();
await flush(10);
const canvas = el.querySelector("canvas");
const bandit = box(map, "tok_bandit2");
check("setup.bandit", !!(bandit && bandit.screen), JSON.stringify(bandit && { x: bandit.x, y: bandit.y }));
const p0 = point(canvas, bandit);
pointer(canvas, "pointerdown", p0.x, p0.y);
pointer(canvas, "pointermove", p0.x + p0.cell * 2.2, p0.y);
check("edit.drawerWaits", !el.querySelector(".ssm-drawer"), "card opened before pointerup");
const mid = box(map, "tok_bandit2");
check("edit.dragMoves", mid && mid.x === bandit.x + 2 && mid.y === bandit.y, JSON.stringify(mid && { x: mid.x, y: mid.y, from: bandit.x }));
pointer(canvas, "pointerup", p0.x + p0.cell * 2.2, p0.y);
await flush(20);
check("edit.drawerAfter", !!el.querySelector(".ssm-drawer"));
const parked = box(map, "tok_bandit2");
pointer(canvas, "pointerdown", point(canvas, parked).x, point(canvas, parked).y);
pointer(canvas, "pointerup", point(canvas, parked).x + 4, point(canvas, parked).y + 3);
check("edit.clickStays", box(map, "tok_bandit2").x === parked.x && box(map, "tok_bandit2").y === parked.y);

edit.click();
await flush(10);
const quiet = box(map, "tok_bystander1");
const q0 = point(canvas, quiet);
pointer(canvas, "pointerdown", q0.x, q0.y);
pointer(canvas, "pointermove", q0.x + q0.cell * 3, q0.y);
pointer(canvas, "pointerup", q0.x + q0.cell * 3, q0.y);
const quietAfter = box(map, "tok_bystander1");
check("menu.noDrag", quietAfter.x === quiet.x && quietAfter.y === quiet.y && !!el.querySelector('[data-act="tokenCmd"]'), JSON.stringify(quietAfter && { x: quietAfter.x, y: quietAfter.y }));

edit.click();
await flush(10);
map.placePartyToken({ pos: { x: 4, y: 8 } });
w.__pump();
const party = (map.tokenBoxes() || []).find((t) => t && t.story);
check("party.placed", !!(party && party.screen));
const pp = point(canvas, party);
pointer(canvas, "pointerdown", pp.x, pp.y);
pointer(canvas, "pointermove", pp.x + pp.cell * 2.2, pp.y + pp.cell * 1.2);
pointer(canvas, "pointerup", pp.x + pp.cell * 2.2, pp.y + pp.cell * 1.2);
const partyAfter = (map.tokenBoxes() || []).find((t) => t && t.id === party.id);
check("party.drag", partyAfter && partyAfter.x === party.x + 2 && partyAfter.y === party.y + 1, JSON.stringify(partyAfter && { x: partyAfter.x, y: partyAfter.y, fromX: party.x, fromY: party.y }));

canvas.dispatchEvent(new w.WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 200, clientY: 200, deltaY: -120 }));
w.__pump();
const zoomed = box(map, "tok_bandit2");
const zp = point(canvas, zoomed);
pointer(canvas, "pointerdown", zp.x, zp.y);
pointer(canvas, "pointermove", zp.x + zp.cell * 2.2, zp.y);
pointer(canvas, "pointerup", zp.x + zp.cell * 2.2, zp.y);
const zoomedAfter = box(map, "tok_bandit2");
check("zoom.drag", zoomedAfter && zoomedAfter.x === zoomed.x + 2 && zoomedAfter.y === zoomed.y, JSON.stringify(zoomedAfter && { x: zoomedAfter.x, y: zoomedAfter.y, cell: zp.cell }));

const pw = makeWindow();
addScript(pw, "map/ssdns-map-move.js");
addScript(pw, "map/ssdns-map-firebase.js");
addScript(pw, "map/ssdns-map.js");
const playerAd = pw.SSDNSMapFirebase.memory({ role: "player" });
for (const t of Object.values(tokens.tokens || {})) {
  if (!t || t.hidden) continue;
  await playerAd.write("map/public/tokens/" + t.id, JSON.parse(JSON.stringify(t)));
}
const pel = pw.document.createElement("div");
pw.document.body.appendChild(pel);
const player = pw.SSDNSMap.create({
  el: pel, role: "player", uid: "p_jolene",
  adapter: playerAd,
  options: { scene, assetBase: "", room: { table: { initiative: { started: false, order: [], turn: 0 } } } }
});
await flush(30);
pw.__pump();
const pc = pel.querySelector("canvas");
const mine = box(player, "tok_jolene");
const other = box(player, "tok_bandit2");
check("player.sees", !!(mine && mine.screen && other && other.screen), (player.tokenBoxes() || []).map((t) => t.id).join(","));
if (!(mine && other && other.screen && mine.screen)) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
const op = point(pc, other);
pointer(pc, "pointerdown", op.x, op.y);
pointer(pc, "pointermove", op.x + op.cell * 2, op.y);
pointer(pc, "pointerup", op.x + op.cell * 2, op.y);
check("player.enemyStays", box(player, "tok_bandit2").x === other.x && box(player, "tok_bandit2").y === other.y);
const mp = point(pc, mine);
pointer(pc, "pointerdown", mp.x, mp.y);
pointer(pc, "pointermove", mp.x + mp.cell * 2.2, mp.y);
pointer(pc, "pointerup", mp.x + mp.cell * 2.2, mp.y);
check("player.ownNeedsMove", box(player, "tok_jolene").x === mine.x && !!pel.querySelector('[data-act="tokenCmdMove"]'));
const moveBtn = pel.querySelector('[data-act="tokenCmdMove"]');
moveBtn.click();
const armed = box(player, "tok_jolene");
const ap = point(pc, armed);
pointer(pc, "pointerdown", ap.x, ap.y);
pointer(pc, "pointermove", ap.x + ap.cell * 2.2, ap.y);
pointer(pc, "pointerup", ap.x + ap.cell * 2.2, ap.y);
const walked = box(player, "tok_jolene");
check("player.ownDrag", walked && walked.x !== armed.x, JSON.stringify(walked && { x: walked.x, y: walked.y, from: armed.x }));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.284" && ver.dmcc === "0.2.297");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.284") && !read("database.rules.json").includes("0.3.284"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nedit drag ok");

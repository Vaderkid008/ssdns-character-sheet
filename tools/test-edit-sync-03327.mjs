/**
 * Edit tokens drag and a new token picture reach the other client at once.
 * Two clients, one fake RTDB (deliverTree). Sheet 0.3.336 / DMCC 0.2.349.
 *   node tools/test-edit-sync-03327.mjs
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
check("ver", ver.sheet === "0.3.336" && ver.dmcc === "0.2.349" && ver.sheetBuild === "sheet-playtest-v03336" && ver.dmccBuild === "dmcc-playtest-v02349");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.336") && !read("database.rules.json").includes("0.3.336"));

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
  w.SSDNSTokenCrop = {
    open(opts) { if (opts && opts.onSave) opts.onSave(w.__nextImage || "data:image/png;base64,pic-a"); },
    preset() { return ""; }
  };
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
function owned(api, id) {
  return (api.layers().tokens() || []).find((t) => t && t.id === id) || null;
}
function point(canvas, token) {
  const r = canvas.getBoundingClientRect();
  return {
    x: r.left + (token.screen.x1 + token.screen.x2) / 2,
    y: r.top + (token.screen.y1 + token.screen.y2) / 2,
    cell: Math.max(8, token.screen.x2 - token.screen.x1)
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
["map/ssdns-map-move.js", "map/places.js", "map/ssdns-map-firebase.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
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
check("setup.token", !!(jolene && jolene.screen), JSON.stringify(jolene && { x: jolene.x, y: jolene.y }));
const p0 = point(canvas, jolene);
pointer(canvas, "pointerdown", p0.x, p0.y);
pointer(canvas, "pointermove", p0.x + p0.cell * 2.2, p0.y);
pointer(canvas, "pointerup", p0.x + p0.cell * 2.2, p0.y);
await flush(30);
w.__pump();
const dragged = box(dm.api, "ply_p_jolene");
const seen = box(pl.api, "ply_p_jolene");
check("drag.sameFloor", !!(dragged && seen && dragged.x === jolene.x + 2 && seen.x === dragged.x && seen.y === dragged.y), JSON.stringify({ from: jolene && { x: jolene.x, y: jolene.y }, dm: dragged && { x: dragged.x, y: dragged.y }, pl: seen && { x: seen.x, y: seen.y } }));
dm.api.maps().swap("scn_upstairs");
await flush(20);
w.__pump();
dm.api.maps().swap("scn_dustyspur01");
await flush(20);
w.__pump();
const afterFloor = owned(pl.api, "ply_p_jolene");
const back = box(pl.api, "ply_p_jolene");
check("drag.afterFloor", !!(afterFloor && back && afterFloor.x === dragged.x && afterFloor.y === dragged.y && back.x === dragged.x && back.sceneId === "scn_dustyspur01"), JSON.stringify({ owned: afterFloor && { x: afterFloor.x, y: afterFloor.y, scene: afterFloor.sceneId }, box: back && { x: back.x, y: back.y, scene: back.sceneId } }));

dm.api.patchToken("ply_p_jolene", { image: "data:image/png;base64,pic-a" });
await flush(20);
w.__pump();
const picA = box(pl.api, "ply_p_jolene");
check("pic.first", picA && picA.image === "data:image/png;base64,pic-a", picA && picA.image);
dm.api.patchToken("ply_p_jolene", { image: "data:image/png;base64,pic-b" });
await flush(20);
w.__pump();
const picB = box(pl.api, "ply_p_jolene");
const drawn = (pl.el.querySelector("canvas").__imgs || []).filter((src) => String(src).indexOf("pic-b") >= 0);
check("pic.replace", picB && picB.image === "data:image/png;base64,pic-b" && drawn.length > 0, JSON.stringify({ image: picB && picB.image, drawn: drawn.length }));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  failures.forEach((line) => console.error(" - " + line));
  process.exit(1);
}
console.log("edit sync 0.3.336 ok");

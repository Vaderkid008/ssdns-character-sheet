/**
 * DM link badge (sheet 0.3.285 / DMCC 0.2.298).
 * ⚠ only on an unlinked player token. Enemies get no mark. A linked player token keeps ⛓.
 * The player map shows neither.
 *   node tools/test-unlinked-badge-03265.mjs
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.285" && ver.dmcc === "0.2.298" && ver.sheetBuild === "sheet-playtest-v03285" && ver.dmccBuild === "dmcc-playtest-v02298");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.285") && !read("database.rules.json").includes("0.3.285"));
check("src.gate", read("map/ssdns-map.js").includes("tokenWantsSheetLink(t)") && read("map/ssdns-map.js").includes("Bestiary enemies, monsters, and NPC hostiles"));

function fakeFirebase() {
  const tree = {};
  const listeners = [];
  function clone(v) {
    if (v == null || typeof v !== "object") return v;
    return JSON.parse(JSON.stringify(v));
  }
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
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    set(r, value) { setPath(r.path, value); notify(r.path); return Promise.resolve(); },
    update(r, value) {
      const cur = get(r.path);
      setPath(r.path, Object.assign({}, cur && typeof cur === "object" ? cur : {}, value));
      notify(r.path);
      return Promise.resolve();
    },
    remove(r) { setPath(r.path, null); notify(r.path); return Promise.resolve(); },
    get(r) {
      const val = clone(get(r.path));
      return Promise.resolve({ exists: () => val != null, val: () => val });
    }
  };
  return { fb, get };
}

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
    const texts = [];
    this.__texts = texts;
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p === "fillText") return (text) => { texts.push(String(text)); };
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        return function () {
          if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
          return bag;
        };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  let rafN = 0;
  w.requestAnimationFrame = (fn) => { rafN += 1; const id = rafN; queueMicrotask(() => fn(id)); return id; };
  w.cancelAnimationFrame = () => {};
  w.confirm = () => true;
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
function textList(el) {
  const canvas = el.querySelector("canvas");
  return (canvas && canvas.__texts) || [];
}
function markAfter(list, name) {
  const i = list.lastIndexOf(name);
  if (i < 0) return null;
  const next = list[i + 1] || "";
  return next === "⚠" || next === "⛓" ? next : "";
}

const scene = { id: "scn_badge", name: "Badge", grid: { cols: 16, rows: 12, px: 70 }, walls: [] };
const players = [{ uid: "wade", name: "Wade" }];
const w = makeWindow();
addScript(w, "map/ssdns-map-firebase.js");
addScript(w, "map/ssdns-map.js");
const live = fakeFirebase();
const dmEl = w.document.createElement("div");
dmEl.id = "dmMap";
w.document.body.appendChild(dmEl);
const dm = w.SSDNSMap.create({
  el: dmEl,
  role: "dm",
  uid: "dm",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "BADGE", role: "dm" }),
  host: { players: () => players },
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => players, room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
dm.addPlayerTokenFor("stray", { name: "Stray", quiet: true });
const add = dmEl.querySelector('[data-act="addTokenBtn"]');
if (add) add.click();
await flush(30);
const dmList = textList(dmEl);
check("dm.enemy", markAfter(dmList, "Enemy") === "", dmList.join(" | "));
check("dm.unlinked", markAfter(dmList, "Stray") === "⚠", dmList.join(" | "));
check("dm.linked", markAfter(dmList, "Wade") === "⛓", dmList.join(" | "));

const plEl = w.document.createElement("div");
plEl.id = "plMap";
w.document.body.appendChild(plEl);
w.SSDNSMap.create({
  el: plEl,
  role: "player",
  uid: "wade",
  adapter: w.SSDNSMapFirebase.create({ db: {}, fb: live.fb, roomCode: "BADGE", role: "player" }),
  host: { players: () => players },
  options: { scene, tokens: { tokens: {} }, assetBase: "", players: () => players, room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
const plText = textList(plEl).join(" ");
check("player.neither", !plText.includes("⚠") && !plText.includes("⛓"), plText);

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("unlinked badge ok");
process.exit(0);

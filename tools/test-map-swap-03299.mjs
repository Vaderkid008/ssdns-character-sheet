/**
 * The DM swaps maps from the Maps menu and the player follows.
 * Two clients, one mocked RTDB. A write that still contains undefined is dropped.
 * Sheet 0.3.307 / DMCC 0.2.320.
 *   node tools/test-map-swap-03299.mjs
 */
import fs from "node:fs";
import { JSDOM } from "jsdom";

const root = new URL("..", import.meta.url).pathname;
const read = (rel) => fs.readFileSync(root + rel, "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.307" && ver.dmcc === "0.2.320");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.307") && !read("database.rules.json").includes("0.3.307"));

function undefs(v, path, out) {
  if (v === undefined) { out.push(path); return; }
  if (!v || typeof v !== "object") return;
  if (Array.isArray(v)) { v.forEach((x, i) => undefs(x, path + "[" + i + "]", out)); return; }
  Object.keys(v).forEach((k) => undefs(v[k], path + "." + k, out));
}
function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const proto = w.HTMLElement.prototype;
  Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 1280; } });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 800; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get() { return 900; } });
  Object.defineProperty(w.HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get() { return 600; } });
  proto.getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 800, width: 1280, height: 800, toJSON() { return {}; } }; };
  w.__images = [];
  w.__srcs = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === "drawImage") return function () { w.__images.push(arguments[0] && arguments[0].src); };
        if (p === "createLinearGradient" || p === "createRadialGradient") return function () { return { addColorStop() {} }; };
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  const srcDesc = Object.getOwnPropertyDescriptor(w.HTMLImageElement.prototype, "src");
  Object.defineProperty(w.HTMLImageElement.prototype, "src", {
    configurable: true,
    set(v) { w.__srcs.push(String(v)); return srcDesc.set.call(this, v); },
    get() { return srcDesc.get.call(this); }
  });
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.confirm = () => false;
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const dropped = [];
function guard(base) {
  return {
    subscribe: (p, cb) => base.subscribe(p, cb),
    remove: (p) => base.remove(p),
    claim: (p, v) => base.claim(p, v),
    write(path, value, meta) {
      const found = [];
      undefs(value, path, found);
      if (found.length) {
        dropped.push(path);
        return Promise.resolve({ dropped: true });
      }
      return base.write(path, value, meta);
    }
  };
}
function boot(w, opts) {
  ["map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  return w.SSDNSMap.create({
    el,
    role: opts.role || "dm",
    uid: opts.uid || "dm",
    adapter: guard(opts.adapter),
    host: { players: () => opts.players || [] },
    options: {
      scene: JSON.parse(JSON.stringify(scene)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => opts.players || [],
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
function mine(api, uid) {
  return api.tokenBoxes().find((b) => b.ownerUid === uid || b.id === "ply_" + uid);
}
function click(w, act) {
  const btn = w.document.querySelector('[data-act="' + act + '"]');
  if (!btn) return false;
  btn.click();
  return true;
}

const players = [{ uid: "hero", id: "hero", name: "Ada" }];
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const store = { pub: {}, dm: {} };
const bus = [];
const dmAd = dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus });
const dm = boot(dmW, { adapter: dmAd, players, role: "dm", uid: "dm" });
await flush(120);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const plAd = plW.SSDNSMapFirebase.memory({ role: "player", store, bus });
const player = boot(plW, { adapter: plAd, players, role: "player", uid: "hero" });
await flush(120);

check("cover.scene", player.viewedScene() === "scn_between", player.viewedScene());
check("cover.token", !!mine(player, "hero") && mine(player, "hero").sceneId === "scn_between");

dm.maps().swap("scn_upstairs");
await flush(80);
check("view.stays", player.viewedScene() === "scn_between" && mine(player, "hero").sceneId === "scn_between", player.viewedScene());

check("menu.maps", click(dmW, "mapsBtn"));
check("menu.show", click(dmW, "showSceneBtn"));
await flush(120);
const up = mine(player, "hero");
check("show.scene", player.viewedScene() === "scn_upstairs", player.viewedScene());
check("show.token", !!up && up.sceneId === "scn_upstairs", JSON.stringify(player.tokenBoxes().map((b) => b.id + "@" + b.sceneId)));
check("show.image", plW.__srcs.some((src) => /scn_upstairs\.webp/.test(src)));
check("show.clean", dropped.length === 0, dropped.join(" "));

check("menu.cover", click(dmW, "betweenBtn"));
await flush(120);
const back = mine(player, "hero");
check("cover.again", player.viewedScene() === "scn_between" && back && back.sceneId === "scn_between", player.viewedScene() + " " + (back && back.sceneId));
check("cover.image", plW.__srcs.some((src) => /between-encounters\.webp/.test(src)));

dm.maps().swap("scn_upstairs");
await flush(40);
check("menu.show2", click(dmW, "showSceneBtn"));
await flush(120);
const again = mine(player, "hero");
check("back.scene", player.viewedScene() === "scn_upstairs" && again && again.sceneId === "scn_upstairs", player.viewedScene());

const lateW = makeWindow();
addScript(lateW, "map/ssdns-map-firebase.js");
const lateAd = lateW.SSDNSMapFirebase.memory({ role: "player", store, bus });
dm.addPlayerTokenFor("late", { name: "Bo" });
await flush(40);
const late = boot(lateW, { adapter: lateAd, players: players.concat([{ uid: "late", id: "late", name: "Bo" }]), role: "player", uid: "late" });
await flush(120);
const bo = mine(late, "late");
check("late.token", !!bo && bo.sceneId === "scn_upstairs", JSON.stringify(late.tokenBoxes().map((b) => b.id + "@" + b.sceneId)));
check("late.scene", late.viewedScene() === "scn_upstairs", late.viewedScene());
check("late.image", lateW.__srcs.some((src) => /scn_upstairs\.webp/.test(src)));
check("late.clean", dropped.length === 0, dropped.join(" "));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap swap ok");

/**
 * Multi-map party layers: each player stays on their own map until the DM moves them.
 * Two clients, one mocked RTDB. A write that still contains undefined is dropped.
 * Sheet 0.3.306 / DMCC 0.2.319.
 *   node tools/test-map-layers-03300.mjs
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
check("ver", ver.sheet === "0.3.306" && ver.dmcc === "0.2.319");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.306") && !read("database.rules.json").includes("0.3.306"));

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
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (p === "createLinearGradient" || p === "createRadialGradient") return function () { return { addColorStop() {} }; };
        return function () { return bag; };
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
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
function click(w, act) {
  const btn = w.document.querySelector('[data-act="' + act + '"]');
  if (!btn) return false;
  btn.click();
  return true;
}
function row(api, uid) {
  return api.layers().tokens().filter((t) => t.ownerUid === uid);
}
function one(api, uid) {
  const list = row(api, uid);
  const active = list.find((t) => t.id === api.layers().activeId(uid)) || list[0];
  return active;
}

const players = [{ uid: "ada", id: "ada", name: "Ada" }, { uid: "bo", id: "bo", name: "Bo" }];
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const store = { pub: {}, dm: {} };
const bus = [];
const dm = boot(dmW, { adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }), players, role: "dm", uid: "dm" });
await flush(140);
const aW = makeWindow();
addScript(aW, "map/ssdns-map-firebase.js");
const ada = boot(aW, { adapter: aW.SSDNSMapFirebase.memory({ role: "player", store, bus }), players, role: "player", uid: "ada" });
const bW = makeWindow();
addScript(bW, "map/ssdns-map-firebase.js");
const bo = boot(bW, { adapter: bW.SSDNSMapFirebase.memory({ role: "player", store, bus }), players, role: "player", uid: "bo" });
await flush(140);

check("boot.ada", ada.viewedScene() === "scn_between" && one(dm, "ada").sceneId === "scn_between", ada.viewedScene());
check("boot.bo", bo.viewedScene() === "scn_between");
const adaId = one(dm, "ada").id;
const boId = one(dm, "bo").id;
const adaSheet = one(dm, "ada").sheetId;

dm.maps().swap("scn_upstairs");
await flush(60);
check("view.dm", dm.viewedScene() === "scn_upstairs");
check("view.players", ada.viewedScene() === "scn_between" && bo.viewedScene() === "scn_between", ada.viewedScene() + " " + bo.viewedScene());

dm.focusToken(adaId);
dm.layers().prepOn(true);
dm.layers().prep("ada", 4, 6);
await flush(40);
check("ghost.placed", !!(dm.layers().preps().scn_upstairs && dm.layers().preps().scn_upstairs.ada && dm.layers().preps().scn_upstairs.ada.x === 4));
check("ghost.hidden", one(ada, "ada").sceneId === "scn_between" && ada.viewedScene() === "scn_between");
check("ghost.noPublic", !Object.keys(store.pub).some((k) => k.indexOf("preps") >= 0));

check("menu.pick", click(dmW, "mapsBtn") && click(dmW, "movePickBtn"));
const every = dmW.document.querySelector('[data-act="moveEveryone"]');
every.checked = false;
every.dispatchEvent(new dmW.Event("change", { bubbles: true }));
const adaBox = dmW.document.querySelector('[data-owner="ada"]');
const boBox = dmW.document.querySelector('[data-owner="bo"]');
check("menu.ada", !!adaBox && !!boBox);
adaBox.checked = true;
boBox.checked = false;
dmW.document.querySelector('[data-act="moveGo"]').click();
await flush(120);
const adaMoved = one(dm, "ada");
check("move.ghost", ada.viewedScene() === "scn_upstairs" && adaMoved.sceneId === "scn_upstairs" && adaMoved.x === 4 && adaMoved.y === 6, JSON.stringify(adaMoved));
check("move.same", adaMoved.id === adaId && adaMoved.sheetId === adaSheet);
check("move.boStays", bo.viewedScene() === "scn_between" && one(dm, "bo").sceneId === "scn_between");
check("move.ghostGone", !(dm.layers().preps().scn_upstairs && dm.layers().preps().scn_upstairs.ada));

const upstairs = dm.maps().sceneState("scn_upstairs");
upstairs.fogShapes = [{ id: "keep", op: "reveal", kind: "box", x: 1, y: 1, w: 2, h: 2 }];
dm.maps().swap("scn_street");
await flush(40);
check("flip.dm", dm.viewedScene() === "scn_street");
check("flip.players", ada.viewedScene() === "scn_upstairs" && bo.viewedScene() === "scn_between");

check("card.send", dm.layers().openCard(boId));
const send = dmW.document.querySelector('[data-act="sendTo"]');
send.value = "scn_street";
send.dispatchEvent(new dmW.Event("change", { bubbles: true }));
await flush(120);
const boSent = one(dm, "bo");
check("send.bo", bo.viewedScene() === "scn_street" && boSent.id === boId && boSent.sceneId === "scn_street", bo.viewedScene() + " " + JSON.stringify(boSent));
check("send.ada", ada.viewedScene() === "scn_upstairs" && one(dm, "ada").id === adaId);
check("fog.kept", (dm.maps().sceneState("scn_upstairs").fogShapes || []).some((s) => s && s.id === "keep"));

const strip = dm.layers().strip();
check("strip", /Ada/.test(strip) && /Bo/.test(strip) && /Upstairs|Dusty Spur/.test(strip), strip);

dm.maps().swap("scn_plains_day");
await flush(30);
const copyId = dm.layers().duplicate(boId);
await flush(80);
const copies = row(dm, "bo");
const copy = copies.find((t) => t.id === copyId);
check("copy.two", copies.length === 2 && copy && copy.sceneId === "scn_plains_day" && copy.copyOf === boId && copy.sheetId === boSent.sheetId && copy.playerActive === false, JSON.stringify(copies));
check("copy.view", bo.viewedScene() === "scn_street" && dm.layers().activeId("bo") === boId, bo.viewedScene());

const beforeCond = one(dm, "bo").conditions.slice();
dm.focusToken(boId);
const cond = dmW.document.querySelector('[data-act="condSelect"]');
cond.value = "prone";
click(dmW, "condToggleBtn");
await flush(80);
const after = row(dm, "bo");
check("share.cond", after.every((t) => t.conditions.indexOf("prone") >= 0) && beforeCond.indexOf("prone") < 0, JSON.stringify(after.map((t) => t.conditions)));

bo.layers().setActive(copyId);
await flush(100);
check("switch.view", bo.viewedScene() === copy.sceneId && dm.layers().activeId("bo") === copyId, bo.viewedScene() + " active " + dm.layers().activeId("bo"));
check("switch.sheet", one(dm, "bo").sheetId === boSent.sheetId);

const lateW = makeWindow();
addScript(lateW, "map/ssdns-map-firebase.js");
const late = boot(lateW, { adapter: lateW.SSDNSMapFirebase.memory({ role: "player", store, bus }), players, role: "player", uid: "ada" });
await flush(120);
check("late.ada", late.viewedScene() === "scn_upstairs", late.viewedScene());
check("clean", dropped.length === 0, dropped.join(" "));

const chip = [].find.call(dmW.document.querySelectorAll("[data-floor]"), (b) => b.getAttribute("data-floor") === "scn_upstairs");
check("strip.chip", !!chip, dm.layers().strip());
if (chip) chip.click();
await flush(40);
check("strip.click", dm.viewedScene() === "scn_upstairs" && ada.viewedScene() === "scn_upstairs" && bo.viewedScene() === copy.sceneId, dm.viewedScene() + " " + bo.viewedScene());

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap layers ok");

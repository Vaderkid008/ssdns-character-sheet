/**
 * Granting control of a second token must not remove the character.
 * The sheet link survives every map move. Duplicates stay linked.
 * Two clients, one mocked RTDB. Undefined writes are dropped.
 * Sheet 0.3.301 / DMCC 0.2.314.
 *   node tools/test-token-continuity-03301.mjs
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
check("ver", ver.sheet === "0.3.301" && ver.dmcc === "0.2.314");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.301") && !read("database.rules.json").includes("0.3.301"));

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
const publicHp = [];
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
      if (String(path).indexOf("map/public/tokens/") === 0 && value && (value.hp != null || value.maxHp != null)) publicHp.push(path);
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
const players = [{ uid: "ada", id: "ada", name: "Ada" }];
const store = { pub: {}, dm: {} };
const bus = [];
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }), players, role: "dm", uid: "dm" });
await flush(140);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }), players, role: "player", uid: "ada" });
await flush(140);

const sheet = { hp: 18, maxHp: 27, tempHp: 4, exhaustion: 1, concentration: "Bless", conditions: ["prone"], light: 20 };
const adaId = dm.layers().activeId("ada");
dm.patchToken(adaId, {
  hp: sheet.hp,
  maxHp: sheet.maxHp,
  tempHp: sheet.tempHp,
  exhaustion: sheet.exhaustion,
  concentration: sheet.concentration,
  conditions: sheet.conditions,
  lights: [{ id: "torch", bright: sheet.light, dim: 20 }]
});
await flush(80);

function mine(api) {
  return api.layers().tokens().find((t) => t.id === adaId);
}
function linked(row) {
  if (!row) return false;
  const light = (row.lights || []).some((l) => l.bright === sheet.light);
  return row.id === adaId && row.sheetId === "ada" && row.combatantId === "ada" && row.ownerUid === "ada"
    && row.tempHp === sheet.tempHp && row.exhaustion === sheet.exhaustion && row.concentration === sheet.concentration
    && (row.conditions || []).indexOf("prone") >= 0 && light;
}
check("boot.token", !!mine(dm) && player.viewedScene() === "scn_between", adaId + " " + player.viewedScene());
check("boot.sheet", linked(mine(dm)) && mine(dm).hp === sheet.hp && linked(mine(player)) && mine(player).hp == null, JSON.stringify(mine(player)));

dm.maps().swap("scn_upstairs");
await flush(40);
dmW.document.querySelector('[data-act="addTokenBtn"]').click();
const horse = dm.tokenBoxes().find((t) => t.kind === "npc" || t.kind === "enemy");
dm.focusToken(horse.id);
dmW.document.querySelector('[data-act="grantUid"]').value = "ada";
dmW.document.querySelector('[data-act="grantBtn"]').click();
await flush(80);
const horseBox = dm.tokenBoxes().find((t) => t.id === horse.id);
check("grant.own", player.viewedScene() === "scn_between" && !!player.tokenBoxes().find((t) => t.id === adaId), player.viewedScene());
check("grant.active", dm.layers().activeId("ada") === adaId);
check("grant.added", !!(horseBox && (horseBox.controlledBy || []).indexOf("ada") >= 0) && horseBox.ownerUid !== "ada", JSON.stringify(horseBox && { own: horseBox.ownerUid, by: horseBox.controlledBy }));
check("grant.sheet", linked(mine(dm)) && linked(mine(player)));

dm.applyLink(horse.id, { ownerUid: "ada", kind: "player", name: "Horse", sheetId: "ada", combatantId: "ada" });
await flush(80);
check("link.own", !!dm.layers().tokens().find((t) => t.id === adaId) && dm.layers().activeId("ada") === adaId && player.viewedScene() === "scn_between");
check("link.horse", dm.tokenBoxes().some((t) => t.id === horse.id));

function still(label) {
  const row = mine(dm);
  const seen = mine(player);
  check("move." + label, linked(row) && row.hp === sheet.hp && linked(seen) && seen.hp == null && seen.sceneId === row.sceneId, label + " " + JSON.stringify(seen));
}

dm.layers().prep("ada", 3, 4);
dm.layers().moveParty(["ada"]);
await flush(80);
check("ghost.square", mine(dm).sceneId === "scn_upstairs" && mine(dm).x === 3 && mine(dm).y === 4, JSON.stringify(mine(dm)));
still("ghost");

dm.maps().swap("scn_street");
await flush(20);
dm.layers().moveParty(null);
await flush(80);
check("everyone.scene", mine(player).sceneId === "scn_street", mine(player).sceneId);
still("everyone");

dm.maps().swap("scn_plains_day");
await flush(20);
dm.layers().send(adaId, "scn_plains_day");
await flush(80);
check("send.scene", mine(player).sceneId === "scn_plains_day");
still("send");

dmW.document.querySelector('[data-act="betweenBtn"]').click();
await flush(100);
check("between.scene", mine(player).sceneId === "scn_between", mine(player).sceneId);
still("between");

const copyId = dm.layers().duplicate(adaId);
await flush(80);
dm.refreshPlayers();
await flush(40);
const twins = dm.layers().tokens().filter((t) => t.ownerUid === "ada");
const copy = twins.find((t) => t.id === copyId);
check("dup.stays", twins.length === 2 && copy && copy.sheetId === "ada" && copy.concentration === sheet.concentration && (copy.conditions || []).indexOf("prone") >= 0 && copy.hp === sheet.hp, JSON.stringify(twins.map((t) => t.id)));
check("dup.view", dm.layers().activeId("ada") === adaId && player.viewedScene() === "scn_between");
dm.removeToken(copyId);
await flush(40);
check("dup.removed", !dm.layers().tokens().some((t) => t.id === copyId) && !!mine(dm) && mine(dm).hp === sheet.hp);

const lateW = makeWindow();
addScript(lateW, "map/ssdns-map-firebase.js");
const late = boot(lateW, { adapter: lateW.SSDNSMapFirebase.memory({ role: "player", store, bus }), players, role: "player", uid: "ada" });
await flush(120);
const lateRow = late.layers().tokens().find((t) => t.id === adaId);
check("late.same", linked(lateRow) && late.viewedScene() === mine(dm).sceneId, JSON.stringify(lateRow) + " view " + late.viewedScene());
check("public.noHp", publicHp.length === 0, publicHp.join(" "));
check("clean", dropped.length === 0, dropped.join(" "));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ntoken continuity ok");

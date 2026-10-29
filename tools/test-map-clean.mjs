/**
 * Map Clean and Gear Clean leave the same gun.
 *   node tools/test-map-clean.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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

const mapSrc = read("map/ssdns-map.js");
const hostSrc = read("map/ssdns-map-host.js");
const appSrc = read("assets/js/app.js");
const joinSrc = read("assets/js/dm-join.js");
const v2 = read("dm/assets/js/v2.js");
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.164" && version.dmcc === "0.2.177");
check("src.player", mapSrc.includes('data-act="playerClean"') && mapSrc.includes("cleanControl"));
check("src.dm", mapSrc.includes('data-act="rowClean"') && mapSrc.includes("drawer:clean"));
check("src.same", hostSrc.includes("SSDNSApp.cleanGun") || hostSrc.includes("root.SSDNSApp && root.SSDNSApp.cleanGun"));
check("src.command", joinSrc.includes('payload.op === "clean"') && joinSrc.includes("applyCleanOption"));
check("src.fight", v2.includes("function mapGunClean") && v2.includes('op: "clean"') && v2.includes("pickClean"));
check("src.rules", !read("assets/data/rules.js").includes("playerClean") && !read("database.rules.json").includes("playerClean"));
check("src.gear", appSrc.includes("function cleanGun") && appSrc.includes("commitClean") && appSrc.includes("applyCleanOption"));

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
window.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
};
window.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
window.fetch = async function (url) {
  const name = String(url).split("/").pop();
  const file = path.join(root, "map", name);
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
};
function run(rel) {
  vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel });
}
run("assets/data/rules.js");
run("assets/js/ssdns-bridge.js");
run("assets/js/storage.js");
run("assets/js/misfire.js");
run("assets/js/app.js");

const app = window.SSDNSApp;
const c = app.doc().character;
const logs = [];
window.SSDNSSheet = { addLog(entry) { logs.push(entry); } };
c.abilities.DEX = 10;
c.es = 2000;
const g = c.guns[0];
g.weapon = "navy-army-ball-n-cap-revolver";
g.capacity = 6;
g.loaded = 4;
g.chambers = ["round", "round", "round", "round", "", ""];

function stamp(gun) {
  return JSON.stringify({
    dirty: !!gun.dirty,
    fouled: !!gun.fouled,
    jammed: !!gun.jammed,
    ruined: !!gun.ruined,
    broken: !!gun.broken,
    misStreak: gun.misStreak || 0,
    pendingD4: !!gun.pendingD4,
    pendingD4Rolls: gun.pendingD4Rolls || null,
    pendingD4Step: gun.pendingD4Step || 0,
    es: c.es
  });
}
function seed(flags) {
  g.dirty = !!flags.dirty;
  g.fouled = !!flags.fouled;
  g.jammed = !!flags.jammed;
  g.ruined = !!flags.ruined;
  g.broken = !!flags.broken;
  g.misStreak = flags.misStreak || 0;
  g.pendingD4 = !!flags.pendingD4;
  g.pendingD4Rolls = flags.pendingD4Rolls || null;
  g.pendingD4Step = flags.pendingD4Step || 0;
  c.es = flags.es != null ? flags.es : 2000;
  logs.length = 0;
}
async function choose(index) {
  await flush(0);
  const dlg = window.document.querySelector("dialog.clean-modal");
  check("modal", !!dlg && dlg.textContent.includes("Pick a method. Nothing changes until you do."));
  if (!dlg) return;
  const btn = dlg.querySelector('[data-clean-opt="' + index + '"]');
  if (btn) btn.click();
  await flush(0);
}
const dirtySeed = { dirty: true, jammed: false, misStreak: 3, pendingD4Rolls: [2, 4], pendingD4Step: 1, es: 2000 };

seed(dirtySeed);
window.document.querySelector('[data-clean="0"]').click();
await choose(0);
const gearDirty = stamp(g);
const gearLog = logs.filter((e) => e.kind === "alert").map((e) => e.text).join("|");
check("gear.line", gearLog === "Navy / Army Ball n Cap Revolver: Clean (removes Dirty, resets streak, clears jam).", gearLog);
check("gear.cleared", gearDirty.includes('"dirty":false') && gearDirty.includes('"jammed":false') && gearDirty.includes('"misStreak":0') && gearDirty.includes('"pendingD4Rolls":null'));

run("map/ssdns-map-firebase.js");
run("map/ssdns-map.js");
run("map/ssdns-map-host.js");
window.SSDNSDmJoin = {
  isJoined: () => true,
  uid: () => "p1",
  publishSnapshot() {},
  live: () => ({ db: {}, fb: {}, uid: "p1", roomCode: "DUST", joined: true, dmUid: "dm" })
};
seed(dirtySeed);
window.SSDNSMapHost.syncRoom();
await flush(80);
const mount = window.document.getElementById("mapMount");
const mapBtn = mount.querySelector('[data-act="playerClean"]');
check("map.shown", !!mapBtn && mapBtn.textContent === "Clean 10 min" && !mapBtn.disabled);
check("map.first", mount.querySelector("[data-act=actionSlot] button").getAttribute("data-act") === "playerAttack");
const cleanGun = c.guns[1];
cleanGun.weapon = "henrietta-repeating-rifle";
cleanGun.capacity = 6;
cleanGun.loaded = 1;
cleanGun.chambers = ["round", "", "", "", "", ""];
window.SSDNSMapHost.refreshCard();
await flush(20);
const buttons = mount.querySelectorAll('[data-act="playerClean"]');
check("map.hiddenWhenClean", buttons.length === 1, "buttons " + buttons.length);

logs.length = 0;
mount.querySelector('[data-act="playerClean"]').click();
await choose(0);
const mapDirty = stamp(g);
const mapLog = logs.filter((e) => e.kind === "alert").map((e) => e.text).join("|");
check("map.matchesGear", mapDirty === gearDirty && mapLog === gearLog, mapDirty + " vs " + gearDirty + " log " + mapLog);

seed(dirtySeed);
logs.length = 0;
await app.applyCleanOption(0, "dirty-kit");
const cmdDirty = stamp(g);
const cmdLog = logs.filter((e) => e.kind === "alert").map((e) => e.text).join("|");
check("command.matchesGear", cmdDirty === gearDirty && cmdLog === gearLog, cmdDirty);

seed({ fouled: true, misStreak: 4, es: 2000 });
const fouledBefore = stamp(g);
window.document.querySelector('[data-clean="0"]').click();
await flush(0);
check("gear.fouledStays", stamp(g) === fouledBefore && !window.document.querySelector("dialog.clean-modal"), stamp(g));

seed({ fouled: true, misStreak: 4, es: 2000 });
window.SSDNSMapHost.refreshCard();
await flush(10);
check("map.fouledHidden", !mount.querySelector('[data-act="playerClean"]'));

seed({ fouled: true, misStreak: 4, es: 2000 });
await app.applyCleanOption(0, "fouled-pay");
check("command.fouledStays", stamp(g) === fouledBefore);

seed({ jammed: true, dirty: true, misStreak: 2, es: 2000 });
window.document.querySelector('[data-clean="0"]').click();
await choose(0);
const gearJam = stamp(g);
check("gear.unjam", gearJam.includes('"jammed":false') && gearJam.includes('"dirty":true') && gearJam.includes('"misStreak":2'), gearJam);
seed({ jammed: true, dirty: true, misStreak: 2, es: 2000 });
await app.applyCleanOption(0, "unjam");
check("command.unjam", stamp(g) === gearJam);

seed({ pendingD4: true, dirty: true });
const pendingBefore = stamp(g);
await app.cleanGun(0);
check("pending.blocked", stamp(g) === pendingBefore && !window.document.querySelector("dialog.clean-modal"));

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const dmEl = window.document.createElement("div");
dmEl.className = "ssdns-map";
window.document.body.appendChild(dmEl);
let dmActs = true;
let dmKind = "pc";
const dm = window.SSDNSMap.create({
  el: dmEl,
  role: "dm",
  uid: "dm",
  adapter: window.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    getCard(id) {
      if (id !== "jolene") return null;
      return {
        name: "Jolene",
        kind: dmKind,
        dmActsAs: dmActs,
        ac: 14,
        hp: { cur: 20, max: 20 },
        speed: 30,
        attacks: [
          { id: "navy", name: "Navy", toHit: 5, damage: "1d8 piercing", ammo: { loaded: 4, cap: 6, chambers: [1, 1, 1, 1, 0, 0] }, dirty: true, jammed: true, misStreak: 2 },
          { id: "hen", name: "Henrietta", toHit: 5, damage: "1d8 piercing", ammo: { loaded: 3, cap: 6, chambers: [1, 1, 1, 0, 0, 0] }, fouled: true },
          { id: "ok", name: "Clean Gun", toHit: 4, damage: "1d6 piercing", ammo: { loaded: 1, cap: 6, chambers: [1, 0, 0, 0, 0, 0] } }
        ]
      };
    },
    players() { return []; }
  },
  options: {
    scene,
    tokens: { tokens: { jolene: { id: "jolene", name: "Jolene", pos: { x: 2, y: 2 }, color: "#4a90d9" } } },
    assetBase: "",
    players: () => [],
    room: { table: { initiative: { order: [], turn: 0 } } }
  }
});
await flush(40);
dm.syncCombatants({ order: [{ id: "jolene", name: "Jolene" }], turn: 0 });
const chip = dmEl.querySelector("[data-act=turnStrip] span");
if (chip) chip.click();
await flush(20);
let drawer = dmEl.querySelector("[data-act=drawer]");
let cleans = drawer ? drawer.querySelectorAll("[data-act=rowClean]") : [];
check("dm.shown", cleans.length === 1 && drawer.textContent.includes("Navy") && drawer.textContent.includes("Henrietta"), drawer && drawer.textContent.replace(/\s+/g, " ").slice(0, 240));
const emitted = [];
dm.on && dm.on("drawer:clean", (detail) => emitted.push(detail));
if (!dm.on) {
  cleans[0] && cleans[0].click();
}
dmActs = false;
dm.refreshCard("jolene");
await flush(10);
drawer = dmEl.querySelector("[data-act=drawer]");
check("dm.hiddenUntilActing", drawer && !drawer.querySelector("[data-act=rowClean]"));
dmActs = true;
dmKind = "enemy";
dm.refreshCard("jolene");
await flush(10);
drawer = dmEl.querySelector("[data-act=drawer]");
/* Mech PR A M2 (Jessey 2026-10-21): the DM cleans enemy / NPC guns from the token too */
check("dm.enemyShowsClean", drawer && !!drawer.querySelector("[data-act=rowClean]"));
dm.destroy();
if (window.SSDNSMapHost && window.SSDNSMapHost.destroy) window.SSDNSMapHost.destroy();
dom.window.close();

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("map clean ok");

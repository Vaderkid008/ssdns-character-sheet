/**
 * A granted Bite rolls damage, crits by doubling the dice, and the DM applies HP once.
 * A later DM HP edit refreshes the player's grant card without changing who controls the token.
 * Sheet 0.3.312 / DMCC 0.2.325.
 *   node tools/test-grant-damage-03307.mjs
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
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.312" && ver.dmcc === "0.2.325" && ver.sheetBuild === "sheet-playtest-v03312" && ver.dmccBuild === "dmcc-playtest-v02325");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.312") && !read("database.rules.json").includes("0.3.312"));

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
  return w;
}
function addScript(w, rel) {
  const s = w.document.createElement("script");
  s.textContent = read(rel);
  w.document.body.appendChild(s);
}
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const own = { name: "Ada", ac: 14, hp: { cur: 18, max: 27, temp: 0 }, speed: 30, attacks: [{ id: "gunroll:0", name: "Revolver", toHit: "+5", damage: "1d8+3", range: "40/120" }], spells: [] };
const bite = { id: "bite", name: "Bite", kind: "melee", toHit: "+4", damage: "2d4+2 piercing", range: "5 ft" };
const acOf = {};
function boot(w, opts) {
  ["assets/js/range-rings.js", "assets/js/turn-rules.js", "map/token-crop.js", "map/ssdns-map-firebase.js", "map/map-packs.js", "map/map-library.js", "map/ssdns-map.js"].forEach((f) => addScript(w, f));
  const el = w.document.createElement("div");
  w.document.body.appendChild(el);
  return w.SSDNSMap.create({
    el, role: opts.role, uid: opts.uid,
    adapter: opts.adapter,
    host: {
      players: () => [{ uid: "ada", name: "Ada" }],
      ownCard: opts.role === "player" ? () => own : null,
      targetAc: (id) => (acOf[id] != null ? acOf[id] : null)
    },
    options: {
      scene: JSON.parse(JSON.stringify(scene)),
      tokens: { tokens: {} },
      assetBase: "../map/",
      players: () => [{ uid: "ada", name: "Ada" }],
      ensureScene: opts.role !== "player",
      room: { table: { initiative: { order: [], turn: 0 } } }
    }
  });
}
const flush = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { pub: {}, dm: {} };
const bus = [];
const dmW = makeWindow();
addScript(dmW, "map/ssdns-map-firebase.js");
const dm = boot(dmW, { role: "dm", uid: "dm", adapter: dmW.SSDNSMapFirebase.memory({ role: "dm", store, bus }) });
await flush(80);
const plW = makeWindow();
addScript(plW, "map/ssdns-map-firebase.js");
const player = boot(plW, { role: "player", uid: "ada", adapter: plW.SSDNSMapFirebase.memory({ role: "player", store, bus }) });
await flush(80);

function addNpc() {
  const before = new Set(dm.tokenBoxes().map((t) => t.id));
  dmW.document.querySelector("[data-act='addTokenBtn']").click();
  return dm.tokenBoxes().find((t) => !before.has(t.id) && (t.kind === "npc" || t.kind === "enemy"));
}
const devil = addNpc();
const scor = addNpc();
dm.patchToken(devil.id, {
  name: "Dust Devil", size: 1, pos: { x: 5, y: 5 }, ac: 13, hp: 11, maxHp: 11, speed: 40,
  attacks: [bite]
});
dm.patchToken(scor.id, { name: "Giant Scorpion", size: 2, pos: { x: 6, y: 5 }, ac: 15, hp: 52, maxHp: 52 });
acOf[scor.id] = 15;
acOf[devil.id] = 13;
dm.focusToken(devil.id);
dmW.document.querySelector("[data-act='grantUid']").value = "ada";
dmW.document.querySelector("[data-act='grantBtn']").click();
await flush(40);
const granted = dm.tokenBoxes().find((t) => t.id === devil.id);
check("grant.control", granted && granted.controlledBy.indexOf("ada") >= 0, JSON.stringify(granted && granted.controlledBy));

const posted = [];
let damagePosts = 0;
plW.SSDNSDmJoin = {
  isJoined() { return true; },
  postAttack(entry) {
    posted.push(JSON.parse(JSON.stringify(entry)));
    return Promise.resolve(dm.applyStyledHit(entry));
  },
  postRoll() { return Promise.resolve({ ok: true }); },
  postDamage() { damagePosts += 1; return Promise.resolve({ ok: true }); }
};

player.useGrant(devil.id);
player.aim(scor.id);
player.queueRolls([18, 2, 2]);
plW.document.querySelector("[data-act='playerAttack']").click();
await flush(20);
const hit = player.grantLog().slice(-1)[0];
check("hit.roll", hit && hit.nat === 18 && hit.hitTotal === 22 && hit.miss === false && hit.amount === 6 && hit.faces.join(",") === "2,2" && hit.type === "piercing", JSON.stringify(hit));
check("hit.line", hit && hit.line.indexOf("HIT") >= 0 && hit.line.indexOf("= 6") >= 0 && hit.line.indexOf("Dust Devil") >= 0, hit && hit.line);
check("hit.hp", dm.tokenSnapshot(scor.id).hp === 46, String(dm.tokenSnapshot(scor.id).hp));
check("hit.once", posted.length === 1 && posted[0].amount === 6 && posted[0].dmgFaces.join(",") === "2,2" && damagePosts === 0, JSON.stringify(posted[0] && { amount: posted[0].amount, faces: posted[0].dmgFaces, damagePosts }));
const chat = plW.document.querySelector("[data-act='chatlog']");
check("hit.chat", !!(chat && chat.textContent.indexOf("HIT") >= 0 && chat.textContent.indexOf("6") >= 0), chat && chat.textContent.replace(/\s+/g, " ").trim().slice(0, 180));

player.queueRolls([20, 4, 4, 1, 1]);
plW.document.querySelector("[data-act='playerAttack']").click();
await flush(20);
const crit = player.grantLog().slice(-1)[0];
check("crit.dice", crit && crit.nat === 20 && crit.crit === true && crit.faces.length === 4 && crit.amount === 12, JSON.stringify(crit && { faces: crit.faces, amount: crit.amount, line: crit.line }));
check("crit.hp", dm.tokenSnapshot(scor.id).hp === 34, String(dm.tokenSnapshot(scor.id).hp));
check("crit.once", posted.length === 2 && damagePosts === 0);

player.queueRolls([2]);
plW.document.querySelector("[data-act='playerAttack']").click();
await flush(20);
const miss = player.grantLog().slice(-1)[0];
check("miss.roll", miss && miss.nat === 2 && miss.hitTotal === 6 && miss.miss === true && miss.amount === 0, JSON.stringify(miss));
check("miss.hp", dm.tokenSnapshot(scor.id).hp === 34, String(dm.tokenSnapshot(scor.id).hp));
check("miss.payload", posted.length === 3 && posted[2].amount === 0);

dm.patchToken(devil.id, { hp: 7 });
await flush(40);
const card = player.grantCard();
const still = dm.tokenBoxes().find((t) => t.id === devil.id);
check("card.hp", card && card.hp && card.hp.cur === 7 && card.hp.max === 11, JSON.stringify(card && card.hp));
check("card.control", still && still.controlledBy.length === granted.controlledBy.length && still.controlledBy.indexOf("ada") >= 0, JSON.stringify(still && still.controlledBy));
const pub = store.pub["map/public/tokens/" + devil.id];
check("public.clean", pub && pub.value && pub.value.hp == null && pub.value.ac == null, JSON.stringify(pub && pub.value && { hp: pub.value.hp, ac: pub.value.ac }));
const inbox = store.pub["inbox/ada/grant_" + devil.id];
check("inbox.hp", inbox && inbox.value && inbox.value.sheet && inbox.value.sheet.hp === 7 && inbox.value.type === "grant_sheet", JSON.stringify(inbox && inbox.value && inbox.value.sheet && inbox.value.sheet.hp));

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("grant damage 0.3.312 ok");
process.exit(0);

/**
 * Map gun rows call the same Gear functions for ammo, unload, TR, hex, and adv/dis.
 *   node tools/test-map-guns.mjs
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
const extraSrc = read("assets/js/sheet-extras.js");
const joinSrc = read("assets/js/dm-join.js");
const v2 = read("dm/assets/js/v2.js");
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.152" && version.dmcc === "0.2.165");
check("src.pool", mapSrc.includes('data-act="playerPool"') && mapSrc.includes('data-act="rowPool"') && appSrc.includes("function poolsForGun") && appSrc.includes("setGunAmmoPool"));
check("src.unload", mapSrc.includes('data-act="playerUnload"') && hostSrc.includes("unloadGunIndex"));
check("src.tr", mapSrc.includes('data-act="rowTr"') && hostSrc.includes('"drawer:tr": "tr"') && joinSrc.includes('payload.op === "tr"'));
check("src.hex", mapSrc.includes("a.calling !== 'hexslinger' || !a.caster") && mapSrc.includes("+ Hex shell") && mapSrc.includes("Cast through gun"));
check("src.mode", mapSrc.includes('data-act="playerAdv"') && mapSrc.includes('data-act="playerDis"') && !mapSrc.includes('data-act="playerMode"'));
check("src.same", extraSrc.includes("gunChosen(i)") && extraSrc.includes("SSDNSGunCast = castThroughGun") && appSrc.includes("gunAttackMode"));
check("src.skip", !mapSrc.includes("Gunsmith modification") && !mapSrc.includes("Capacity upgrade"));
check("src.rules", !read("assets/data/rules.js").includes("playerPool") && !read("database.rules.json").includes("playerPool"));
check("src.fight", v2.includes('op: "pool"') || v2.includes('mapGunChoice(detail, "pool"'));
check("src.fight2", v2.includes('mapGunChoice(detail, "hex"') && v2.includes("calling !== \"hexslinger\""));

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
const g = c.guns[0];
const g2 = c.guns[1];
c.gunBelt = true;
c.ammo = [
  { type: "cartridge", caliber: "Medium", count: 10 },
  { type: "buck", caliber: "12 ga", count: 8 },
  { type: "cartridge", caliber: "Medium", count: 4 }
];

function armHenrietta() {
  g.weapon = "henrietta-repeating-rifle";
  g.tier = "medium";
  g.chamber = "medium|.44-40";
  g.chamberSet = true;
  g.capacity = 6;
  g.loaded = 1;
  g.chambers = ["k:cartridge:Medium::", "", "", "", "", ""];
  g.ammoPool = "";
  g.attackMode = "";
  c.ammo[0].count = 10;
  c.ammo[1].count = 8;
  c.ammo[2].count = 4;
}
function stampGun() {
  return JSON.stringify({
    loaded: g.loaded,
    chambers: (g.chambers || []).slice(),
    piles: c.ammo.map((a) => a.count),
    pool: g.ammoPool == null ? "" : String(g.ammoPool)
  });
}
armHenrietta();
const choices = app.ammoChoices(0).map((row) => row.idx);
check("filter", choices.join(",") === "0,2", choices.join(","));
check("filter.reject", app.setAmmoPool(0, 1) === false && String(g.ammoPool || "") === "");
app.setAmmoPool(0, 0);
const gearSel = window.document.querySelector('[data-ammopool="0"]');
check("gear.pool", !!gearSel && gearSel.value === "0" && String(g.ammoPool) === "0");
gearSel.value = "2";
gearSel.dispatchEvent(new window.Event("change", { bubbles: true }));
check("gear.change", String(g.ammoPool) === "2" && gearSel.value === "2");
window.document.querySelector('[data-reload="0"]').click();
const gearReload = stampGun();
check("gear.spent", c.ammo[0].count === 10 && c.ammo[1].count === 8 && c.ammo[2].count === 0 && g.loaded === 5, gearReload);

run("map/ssdns-map-firebase.js");
run("map/ssdns-map.js");
run("map/ssdns-map-host.js");
window.SSDNSDmJoin = {
  isJoined: () => true,
  uid: () => "p1",
  publishSnapshot() {},
  live: () => ({ db: {}, fb: {}, uid: "p1", roomCode: "DUST", joined: true, dmUid: "dm" })
};
armHenrietta();
window.SSDNSMapHost.syncRoom();
await flush(80);
const mount = window.document.getElementById("mapMount");
check("map.first", mount.querySelector("[data-act=actionSlot] button").getAttribute("data-act") === "playerAttack");
const mapPool = mount.querySelector('[data-act="playerPool"]');
check("map.pool", !!mapPool && mapPool.options.length === 2 && !mount.textContent.includes("12 ga"));
mapPool.value = "2";
mapPool.dispatchEvent(new window.Event("change", { bubbles: true }));
await flush(10);
mount.querySelector('[data-act="playerReload"]').click();
await flush(10);
check("map.reload", stampGun() === gearReload, stampGun() + " vs " + gearReload);

armHenrietta();
g.jammed = true;
g.lockedChambers = [];
g.misStreak = 2;
app.refreshGunFace();
const gearBox = window.document.querySelector('[data-lockup-box="0"]');
const gearN = window.document.querySelector('[data-lockup-n="0"]');
const jamBox = window.document.querySelector('[data-f="character.guns.0.jammed"]');
check("lockup.zero", !!(gearBox && !gearBox.checked && gearN && gearN.textContent === "0" && jamBox && jamBox.checked));
check("lockup.mapZero", mount.textContent.includes("LOCKED UP ×0"));
g.jammed = false;
g.misStreak = 3;
g.lockedChambers = [1];
app.refreshGunFace();
const chamber = window.document.querySelector('[data-chambers="0"] [data-k="1"]');
check("lockup.paint", !!(gearBox.checked && gearN.textContent === "1" && jamBox && !jamBox.checked && chamber && chamber.textContent.trim() === "X"), chamber && chamber.outerHTML);
check("lockup.map", mount.textContent.includes("LOCKED UP ×1") && !!mount.querySelector('[data-k="1"]') && mount.querySelector('[data-k="1"]').textContent.trim() === "X");
g.lockedChambers = [1, 4];
app.refreshGunFace();
check("lockup.two", gearN.textContent === "2" && g.misStreak === 3);
app.clearLockedChambers(0, "one");
check("lockup.clearOne", g.lockedChambers.join(",") === "4" && gearN.textContent === "1" && g.misStreak === 3 && g.jammed === false);
app.clearLockedChambers(0, "all");
check("lockup.clearAll", g.lockedChambers.length === 0 && gearN.textContent === "0" && !gearBox.checked && g.misStreak === 3);
g.lockedChambers = [];
g.jammed = false;
g.fouled = false;
g.misStreak = 0;
armHenrietta();

armHenrietta();
g.loaded = 3;
g.chambers = ["k:cartridge:Medium::", "k:cartridge:Medium::", "k:cartridge:Medium::", "", "", ""];
window.document.querySelector('[data-unload="0"]').click();
const gearUnload = stampGun();
armHenrietta();
g.loaded = 3;
g.chambers = ["k:cartridge:Medium::", "k:cartridge:Medium::", "k:cartridge:Medium::", "", "", ""];
window.SSDNSMapHost.refreshCard();
await flush(10);
mount.querySelector('[data-act="playerUnload"]').click();
await flush(10);
check("map.unload", stampGun() === gearUnload, stampGun() + " vs " + gearUnload);
check("map.unloadShown", !!mount.querySelector('[data-act="playerUnload"]'));

armHenrietta();
g.loaded = 1;
g.chambers = ["k:cartridge:Medium::", "", "", "", "", ""];
g.ammoPool = "0";
window.document.querySelector('[data-tr="0"]').click();
const gearTr = stampGun();
armHenrietta();
g.loaded = 1;
g.chambers = ["k:cartridge:Medium::", "", "", "", "", ""];
g.ammoPool = "0";
app.tacticalReload(0);
check("tr.same", stampGun() === gearTr, stampGun() + " vs " + gearTr);

c.calling = "hexslinger";
c.level = 5;
c.overrides["hex.1"] = 1;
c.cantrips = ["Boom Shell"];
g.weapon = "blacksnake";
g.capacity = 6;
g.loaded = 0;
g.chambers = ["", "", "", "", "", ""];
g.tier = "medium";
g.chamber = "medium|.357";
g2.weapon = "henrietta-repeating-rifle";
g2.capacity = 6;
g2.loaded = 1;
g2.tier = "medium";
g2.chamber = "medium|.44-40";
g2.chambers = ["k:cartridge:Medium::", "", "", "", "", ""];
g2.tr = true;
function clearHex() {
  g.loaded = 0;
  g.chambers = ["", "", "", "", "", ""];
  if (c.hexLead && c.hexLead[1]) c.hexLead[1][0] = false;
}
clearHex();
const lvl = window.document.querySelector('[data-hexlvl="0"]');
if (lvl) lvl.value = "1";
window.document.querySelector('[data-hexload="0"]').click();
await flush(0);
const gearHex = JSON.stringify({ chambers: g.chambers.slice(), spent: !!(c.hexLead[1] && c.hexLead[1][0]) });
clearHex();
window.SSDNSMapHost.refreshCard();
await flush(20);
const hexRows = [...mount.querySelectorAll(".cylinder-row")];
const snake = hexRows.find((row) => /Blacksnake/i.test(row.textContent));
const hen = hexRows.find((row) => /Henrietta/i.test(row.textContent));
check("hex.shown", !!(snake && snake.querySelector('[data-act="playerHex"]') && snake.textContent.includes("Cast through gun")));
check("hex.plain", !!(hen && !hen.querySelector('[data-act="playerHex"]') && !hen.textContent.includes("Cast through gun")));
const hexBtn = snake && snake.querySelector('[data-act="playerHex"]');
const hexLvl = snake && snake.querySelector('[data-act="playerHexLvl"]');
if (hexLvl) hexLvl.value = "1";
if (hexBtn) hexBtn.click();
await flush(10);
check("hex.same", JSON.stringify({ chambers: g.chambers.slice(), spent: !!(c.hexLead[1] && c.hexLead[1][0]) }) === gearHex, JSON.stringify(g.chambers));

let castHit = null;
window.SSDNSGunCast = function (i) {
  const spell = window.document.querySelector('[data-castspell="' + i + '"]');
  const slot = window.document.querySelector('[data-castslot="' + i + '"]');
  castHit = { i: i, spell: spell && spell.value, slot: slot && slot.value };
};
window.SSDNSMapHost.refreshCard();
await flush(10);
const castRow = [...mount.querySelectorAll(".cylinder-row")].find((row) => /Blacksnake/i.test(row.textContent));
const castSel = castRow && castRow.querySelector('[data-act="playerCastSpell"]');
check("cast.list", !!(castSel && [...castSel.options].some((op) => op.value === "0:Boom Shell")));
if (castSel) {
  castSel.value = "0:Boom Shell";
  castSel.dispatchEvent(new window.Event("change", { bubbles: true }));
}
await flush(10);
const castBtn = [...mount.querySelectorAll(".cylinder-row")].find((row) => /Blacksnake/i.test(row.textContent)).querySelector('[data-act="playerCast"]');
castBtn.click();
await flush(10);
check("cast.same", castHit && castHit.i === 0 && castHit.spell === "0:Boom Shell", JSON.stringify(castHit));

c.calling = "outlaw";
window.SSDNSMapHost.refreshCard();
await flush(10);
check("hex.hidden", !mount.querySelector('[data-act="playerHex"]') && !mount.textContent.includes("Cast through gun") && !mount.textContent.includes("+ Hex shell"));

c.calling = "outlaw";
armHenrietta();
window.SSDNSMapHost.refreshCard();
await flush(10);
const adv = mount.querySelector('[data-act="playerAdv"]');
const dis = mount.querySelector('[data-act="playerDis"]');
check("mode.boxes", !!adv && !!dis && adv.type === "checkbox" && dis.type === "checkbox");
adv.checked = true;
adv.dispatchEvent(new window.Event("change", { bubbles: true }));
await flush(10);
check("mode.adv", app.gunAttackMode(0) === "adv" && window.document.querySelector('[data-adv="0"]').value === "adv" && !mount.querySelector('[data-act="playerDis"]').checked);
const dis2 = mount.querySelector('[data-act="playerDis"]');
dis2.checked = true;
dis2.dispatchEvent(new window.Event("change", { bubbles: true }));
await flush(10);
check("mode.dis", app.gunAttackMode(0) === "dis" && window.document.querySelector('[data-adv="0"]').value === "dis" && !mount.querySelector('[data-act="playerAdv"]').checked);
const dis3 = mount.querySelector('[data-act="playerDis"]');
dis3.checked = false;
dis3.dispatchEvent(new window.Event("change", { bubbles: true }));
await flush(10);
check("mode.off", app.gunAttackMode(0) === "" && window.document.querySelector('[data-adv="0"]').value === "");

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const dmEl = window.document.createElement("div");
dmEl.className = "ssdns-map";
dmEl.style.height = "640px";
window.document.body.appendChild(dmEl);
let dmActs = true;
let dmKind = "pc";
let dmCalling = "hexslinger";
const castSpells = [{ level: 0, name: "Boom Shell", value: "0:Boom Shell", label: "Boom Shell", slots: [] }];
const pools = [{ idx: 0, label: "Medium (10)", count: 10 }, { idx: 2, label: "Medium (4)", count: 4 }];
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
        calling: dmCalling,
        ac: 14,
        hp: { cur: 20, max: 20 },
        speed: 30,
        attacks: [
          { id: "snake", name: "Blacksnake", toHit: 5, damage: "1d8", ammo: { loaded: 1, cap: 6, chambers: [1, 0, 0, 0, 0, 0] }, tr: true, caster: true, calling: dmCalling, pools: pools, castSpells: castSpells, ammoPool: "0", attackMode: "adv", gunIndex: 0 },
          { id: "hen", name: "Henrietta", toHit: 5, damage: "1d8", ammo: { loaded: 3, cap: 6, chambers: [1, 1, 1, 0, 0, 0] }, tr: true, caster: false, calling: dmCalling, pools: pools, gunIndex: 1 },
          { id: "navy", name: "Navy", toHit: 4, damage: "1d8", ammo: { loaded: 2, cap: 6, chambers: [1, 1, 0, 0, 0, 0] }, tr: false, caster: false, calling: dmCalling, pools: pools, gunIndex: 2 }
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
const dmRows = () => [...drawer.querySelectorAll(".cylinder-row")];
let rows = dmRows();
const dmSnake = rows.find((row) => /Blacksnake/i.test(row.textContent));
const dmHen = rows.find((row) => /Henrietta/i.test(row.textContent));
const dmNavy = rows.find((row) => /Navy/i.test(row.textContent));
check("dm.hex", !!(dmSnake && dmSnake.querySelector('[data-act="rowHex"]') && dmSnake.textContent.includes("Cast through gun")));
check("dm.plain", !!(dmHen && !dmHen.querySelector('[data-act="rowHex"]') && dmNavy && !dmNavy.textContent.includes("Hex shell")));
check("dm.tr", !!(dmHen && dmHen.querySelector('[data-act="rowTr"]')) && !(dmNavy && dmNavy.querySelector('[data-act="rowTr"]')));
check("dm.adv", !!(dmSnake && dmSnake.querySelector('[data-act="rowAdv"]').checked) && !dmSnake.querySelector('[data-act="rowDis"]').checked);
check("dm.pool", dmHen && dmHen.querySelector('[data-act="rowPool"]').options.length === 2);
dmCalling = "outlaw";
dm.refreshCard("jolene");
await flush(10);
drawer = dmEl.querySelector("[data-act=drawer]");
check("dm.hexHidden", drawer && !drawer.querySelector('[data-act="rowHex"]') && !drawer.textContent.includes("Cast through gun"));
check("dm.trStays", !!drawer.querySelector('[data-act="rowTr"]'));
dmActs = false;
dm.refreshCard("jolene");
await flush(10);
drawer = dmEl.querySelector("[data-act=drawer]");
check("dm.hiddenUntilActing", drawer && !drawer.querySelector('[data-act="rowPool"]') && !drawer.querySelector('[data-act="rowTr"]') && !drawer.querySelector('[data-act="rowAdv"]'));
dmActs = true;
dmKind = "enemy";
dm.refreshCard("jolene");
await flush(10);
drawer = dmEl.querySelector("[data-act=drawer]");
check("dm.enemyHidden", drawer && !drawer.querySelector('[data-act="rowHex"]') && !drawer.querySelector('[data-act="rowPool"]'));

dm.destroy();
if (window.SSDNSMapHost && window.SSDNSMapHost.destroy) window.SSDNSMapHost.destroy();
dom.window.close();

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("map guns ok");

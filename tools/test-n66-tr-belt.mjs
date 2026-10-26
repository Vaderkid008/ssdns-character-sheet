/**
 * N66 (sheet 0.3.153 / DMCC 0.2.166): Tactical Reload needs a gun belt or bandolier.
 * No belt: fading toast, no reload, no Bonus. Belt, checkbox, or feedsTR: one round and Bonus.
 *   node tools/test-n66-tr-belt.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const version = JSON.parse(read("version.json"));
const appSrc = read("assets/js/app.js");
const v2 = read("dm/assets/js/v2.js");
const joinSrc = read("assets/js/dm-join.js");
const guardSrc = read("assets/js/apply-guard.js");
const BELT = "Need a gun belt or bandolier for Tactical Reload.";

check("ver.sheet", version.sheet === "0.3.153" && version.sheetBuild === "sheet-playtest-v03153");
check("ver.dmcc", version.dmcc === "0.2.166" && version.dmccBuild === "dmcc-playtest-v02166");
check("ver.app", appSrc.includes('APP_VERSION = "0.3.153"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.166"'));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("0.3.153") && !read("database.rules.json").includes("0.2.166") && !read("assets/data/rules.js").includes("0.3.153"));
check("src.noOverride", !appSrc.includes("Load anyway") && !appSrc.includes("tr-warn") && appSrc.includes(BELT));
check("src.dmCallsSheet", joinSrc.includes('payload.op === "tr"') && joinSrc.includes("app.tacticalReload") && joinSrc.includes("gunBelt: !!c.gunBelt"));
check("src.cardStamp", guardSrc.includes("feedsTR: !!(b.feedsTR || b.gunBelt)"));

const enemyFn = v2.slice(v2.indexOf("async function mapEnemyTr"), v2.indexOf("async function mapGunChoice"));
const choiceFn = v2.slice(v2.indexOf("async function mapGunChoice"), v2.indexOf("async function mapGunClean"));
const chamberFn = v2.slice(v2.indexOf("async function mapGunChamber"), v2.indexOf("function markDeath"));
check("src.enemyBeforeSpend", enemyFn.indexOf("if (!enemyBelted(row))") > 0 && enemyFn.indexOf('spendEnemyPip(row, "bonus", "Tactical Reload")') > enemyFn.indexOf("if (!enemyBelted(row))"));
check("src.playerBeforeSend", choiceFn.indexOf("playerBeltBlock(snap)") > 0 && choiceFn.indexOf("DM.pushCommand") > choiceFn.indexOf("playerBeltBlock(snap)"));
check("src.chamberBelt", chamberFn.indexOf("playerBeltBlock(snap)") > 0 && chamberFn.indexOf("playerBeltBlock(snap)") < chamberFn.indexOf("max: 1"));

const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const trIds = ["switch-boss", "company-rider", "rival-adventurer", "scorps-enforcer", "abigail-ellen", "buddy-kidd", "captain-rhee-calder", "dolan-murphy", "jasper-hargrove", "nina-vasquez"];
trIds.forEach((id) => {
  const row = beasts.find((b) => b && b.id === id);
  const listed = JSON.stringify((row && row.attackList) || []);
  check("beast." + id, !!(row && row.feedsTR === true && /Tactical Reload/.test(listed)));
});
const outlaw = beasts.find((b) => b && b.id === "outlaw");
check("beast.outlaw", !!outlaw && outlaw.feedsTR !== true && !/Tactical Reload/.test(JSON.stringify(outlaw.attackList || [])));

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
window.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
};
function run(rel) { vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel }); }
run("assets/data/rules.js");
run("assets/js/ssdns-bridge.js");
run("assets/js/storage.js");
run("assets/js/misfire.js");
run("assets/js/app.js");
run("assets/js/action-pips.js");

const app = window.SSDNSApp;
const pips = window.SSDNSActionPips;
const c = app.doc().character;
const g = c.guns[0];
const g2 = c.guns[1];
c.gunBelt = false;
c.belt = "";
c.holster = "";
c.holsterR = "";
c.ammo = [{ type: "cartridge", caliber: "Medium", count: 10 }];

function armHenrietta() {
  g.weapon = "henrietta-repeating-rifle";
  g.tier = "medium";
  g.chamber = "medium|.44-40";
  g.chamberSet = true;
  g.capacity = 6;
  g.loaded = 1;
  g.chambers = ["k:cartridge:Medium::", "", "", "", "", ""];
  g.ammoPool = "0";
  g.equipped = true;
  g.pendingD4 = false;
  c.ammo[0].count = 10;
}
function stamp() {
  return JSON.stringify({ loaded: g.loaded, chambers: (g.chambers || []).slice(), ammo: c.ammo[0].count, bonus: !!(pips && pips.state().bonus), action: !!(pips && pips.state().action) });
}
function toastText() { return window.document.getElementById("toastText").textContent; }
g2.weapon = "single-barrel-farm-shotgun";
g2.capacity = 1;
g2.loaded = 0;
g2.chambers = [""];
g2.equipped = true;
g2.pendingD4 = false;
pips.reset(true);
app.tacticalReload(1);
check("sheet.nonTr", g2.loaded === 0 && !pips.state().bonus && toastText() === "This gun can't Tactical Reload (TR —).", toastText());
await flush(4300);

armHenrietta();
pips.reset(true);
const before = stamp();
window.document.querySelector('[data-tr="0"]').click();
check("sheet.clickBlocked", stamp() === before && toastText() === BELT, stamp() + " toast=" + toastText());
check("sheet.noLoadAnyway", window.document.getElementById("toastAction").hidden === true || !/Load anyway/.test(window.document.getElementById("toastAction").textContent));

armHenrietta();
pips.reset(true);
app.tacticalReload(0);
check("sheet.apiBlocked", stamp() === before && toastText() === BELT, stamp());
app.reloadGun(0, 1);
check("sheet.maxBlocked", stamp() === before, stamp());

armHenrietta();
pips.reset(true);
window.document.querySelector('[data-reload="0"]').click();
check("sheet.fullWithoutBelt", g.loaded === 6 && c.ammo[0].count === 5 && !pips.state().bonus && pips.state().action === true, stamp());

armHenrietta();
c.belt = "bandolier";
pips.reset(true);
app.tacticalReload(0);
check("sheet.bandolier", g.loaded === 2 && c.ammo[0].count === 9 && pips.state().bonus === true && pips.state().action === false, stamp());

armHenrietta();
c.belt = "";
c.gunBelt = true;
pips.reset(true);
window.document.querySelector('[data-tr="0"]').click();
check("sheet.checkbox", g.loaded === 2 && c.ammo[0].count === 9 && pips.state().bonus === true, stamp());

/* DM / NPC: missing feedsTR toasts and does not load or spend Bonus. A stamped beast still reloads and spends. */
const dmBeasts = [
  { id: "bare-gun", name: "Bare Gun", ac: 12, hp: 11, dex: 8, attackList: [{ id: "rifle", name: "Rifle", capacity: 6, loaded: 2, spare: 10, properties: ["Tactical Reload"], notes: "Tactical Reload loads 1 round as a bonus action." }] },
  { id: "belted-gun", name: "Belted Gun", ac: 12, hp: 11, dex: 18, feedsTR: true, attackList: [{ id: "rifle", name: "Rifle", capacity: 6, loaded: 2, spare: 10, properties: ["Tactical Reload"], notes: "Tactical Reload loads 1 round as a bonus action." }] }
];
function makeDm() {
  const d = new JSDOM(`<!doctype html><html><body>
    <div id="initList"></div><div id="bestiaryList"></div><div id="turnStrip"></div>
    <button type="button" id="btnNextTurn">Next</button>
    <button type="button" id="btnAddCustom">Add custom enemy</button>
    <section id="enemySheet" hidden><h2 id="enemySheetTitle"></h2><p id="enemySheetSub"></p><div id="enemySheetBody"></div></section>
  </body></html>`, { url: "http://127.0.0.1:8765/dm/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = d.window;
  w.__tok = 0;
  w.__toasts = [];
  w.confirm = () => true;
  w.DMCC = {
    $: (sel) => w.document.querySelector(sel),
    $$: (sel) => Array.from(w.document.querySelectorAll(sel)),
    esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])); },
    state: { players: {}, ledger: [], rolls: [], demo: false, roomCode: "DUST", uid: "dm", db: {}, unsubs: [], meta: { dmUid: "dm" } },
    toast(msg) { w.__toasts.push(String(msg || "")); },
    uid(p) { w.__seq = (w.__seq || 0) + 1; return (p || "id") + w.__seq; },
    guardFocus(fn) { if (fn) fn(); },
    parseDice() { return { total: 4, detail: "4" }; },
    pushCommand() { return Promise.resolve(); },
    pushRoll() { return Promise.resolve(); },
    pushLedger() { return Promise.resolve(); },
    renderPlayers() {},
    roomRef(p) { return { path: "rooms/DUST/" + p }; },
    _fb: null
  };
  w.DMCC.state._fb = {
    ref(db, p) { return { path: p }; },
    update() { return Promise.resolve(); },
    set() { return Promise.resolve(); },
    onValue() { return function () {}; },
    get() { return Promise.resolve({ exists() { return false; }, val() { return null; } }); },
    remove() { return Promise.resolve(); }
  };
  w.fetch = async (url) => {
    if (String(url).includes("bestiary")) return { ok: true, json: async () => dmBeasts };
    return { ok: false, json: async () => ({}) };
  };
  w.SSDNSMapHost = {
    placeToken() { w.__tok += 1; return "tok" + w.__tok; },
    removeToken() {}, hasToken() { return true; }, releaseToken() {}, tokensLoaded() { return true; }, syncInitiative() {}, refreshMove() {}, refreshCard() {}
  };
  function addScript(code) {
    const s = w.document.createElement("script");
    s.textContent = code;
    w.document.body.appendChild(s);
  }
  addScript(read("assets/js/apply-guard.js"));
  addScript(read("assets/js/turn-rules.js"));
  addScript(read("dm/assets/js/v2.js"));
  return w;
}
const dm = makeDm();
for (let n = 0; n < 30 && !(dm.SSDNSMapCards && dm.SSDNSMapCards.choices && dm.SSDNSMapCards.choices().bestiary.some((g) => (g.options || []).some((b) => b.id === "bare-gun"))); n++) await flush(20);
const bareTok = dm.SSDNSMapFight.placeBeast({ beastId: "bare-gun" });
const beltTok = dm.SSDNSMapFight.placeBeast({ beastId: "belted-gun" });
await flush(20);
function rowId(name) {
  const btn = Array.from(dm.document.querySelectorAll("[data-open-enemy]")).find((b) => b.textContent === name);
  return btn ? btn.getAttribute("data-open-enemy") : "";
}
function sheetAmmo(id) {
  const btn = dm.document.querySelector('[data-open-enemy="' + id + '"]');
  if (btn) btn.dispatchEvent(new dm.MouseEvent("click", { bubbles: true }));
  return (dm.document.getElementById("enemySheetBody") || {}).textContent || "";
}
const bareId = rowId("Bare Gun");
const beltId = rowId("Belted Gun");
check("dm.placed", !!bareTok && !!beltTok && !!bareId && !!beltId, JSON.stringify({ bareTok, beltTok, bareId, beltId }));
dm.__toasts = [];
const bareBlocked = await dm.SSDNSMapFight.tr({ combatantId: bareId, weaponId: "rifle" });
check("dm.bareBlocked", bareBlocked === false && dm.__toasts.indexOf(BELT) >= 0 && sheetAmmo(bareId).includes("2/6"), dm.__toasts.join(" | ") + " :: " + sheetAmmo(bareId).slice(0, 180));
dm.document.getElementById("btnNextTurn").click();
await flush(30);
const usedBefore = dm.document.querySelectorAll('[data-dm-pip="bonus"].used').length;
dm.__toasts = [];
const bareAgain = await dm.SSDNSMapFight.tr({ combatantId: bareId, weaponId: "rifle" });
const usedMid = dm.document.querySelectorAll('[data-dm-pip="bonus"].used').length;
check("dm.bareNoBonus", bareAgain === false && usedMid === usedBefore && sheetAmmo(bareId).includes("2/6"), "used " + usedBefore + "->" + usedMid + " " + dm.__toasts.join(" | "));
dm.__toasts = [];
const beltOk = await dm.SSDNSMapFight.tr({ combatantId: beltId, weaponId: "rifle" });
const usedAfter = dm.document.querySelectorAll('[data-dm-pip="bonus"].used').length;
const beltSheet = sheetAmmo(beltId);
check("dm.beltedLoads", beltOk === true && beltSheet.includes("3/6") && usedAfter === usedBefore + 1, "ok=" + beltOk + " used " + usedBefore + "->" + usedAfter + " " + dm.__toasts.join(" | ") + " :: " + beltSheet.slice(0, 180));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nN66 ok");
process.exit(0);

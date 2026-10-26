/**
 * N49 / N51 / N52 / N54 / N60 (sheet 0.3.142 / DMCC 0.2.155).
 *   node tools/test-n49-n60.mjs
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
const app = read("assets/js/app.js");
const v2 = read("dm/assets/js/v2.js");
const mapJs = read("map/ssdns-map.js");
const host = read("map/ssdns-map-host.js");
const lock = read("assets/js/turn-lock.js");
const join = read("assets/js/dm-join.js");
const rulesJs = read("assets/data/rules.js");
const rules = read("database.rules.json");

check("ver.sheet", version.sheet === "0.3.142" && version.sheetBuild === "sheet-playtest-v03142");
check("ver.dmcc", version.dmcc === "0.2.155" && version.dmccBuild === "dmcc-playtest-v02155");
check("ver.app", app.includes('APP_VERSION = "0.3.142"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.155"'));
check("src.rulesUntouched", !rulesJs.includes("0.3.142") && !rulesJs.includes("0.2.155") && !rules.includes("0.3.142") && !rules.includes("gunAllowsTactical") && !rulesJs.includes("No fight card linked"));

const noAmmo = app.slice(app.indexOf('var msg = "No ammo for this caliber"'), app.indexOf('var msg = "No ammo for this caliber"') + 500);
check("src.n51.sheetToastOnly", noAmmo.includes("toast(msg)") && !noAmmo.includes("addLog") && !noAmmo.includes("postChat"));
const loadFn = v2.slice(v2.indexOf("async function mapGunLoad"), v2.indexOf("function sheetSlot"));
check("src.n51.mapToastOnly", loadFn.includes("DM.toast(fail)") && loadFn.includes('DM.toast("No ammo for this caliber")') && !loadFn.includes("logTableAlert"));
check("src.n51.joinNoChat", /op === "reload" && app\.reloadGun/.test(join) && !/ammoFailText[\s\S]{0,240}postChat/.test(join));

check("src.n52.gate", /function offTurnBlock\(kind\)/.test(lock) && /It isn't your turn/.test(lock) && /offTurnBlock: offTurnBlock/.test(lock));
check("src.n52.map", /Lock\.offTurnBlock/.test(mapJs) && /!gear && st\.oaArmed/.test(mapJs) && /function playerUseItem\(/.test(mapJs) && /blockMap\(cost, label\)/.test(mapJs));
check("src.n52.roll", /offTurnBlock\("attack"\)/.test(read("assets/js/sheet-extras.js")) && /function offTurnStop\(kind\)/.test(app));

const npcExtras = mapJs.slice(mapJs.indexOf("function gunExtras"), mapJs.indexOf("function playerCylinderRow"));
check("src.n54.npcTr", /side === 'npc'/.test(npcExtras) && /data-act="rowTr"/.test(npcExtras) && /function mapEnemyTr\(/.test(v2) && /This gun can't Tactical Reload \(TR —\)\./.test(v2) && /spendEnemyPip\(row, "bonus", "Tactical Reload"\)/.test(v2));
check("src.n54.stamp", /function gunAllowsTactical\(/.test(read("assets/js/apply-guard.js")) && /tr: !!gunAllowsTactical\(a\)/.test(read("assets/js/apply-guard.js")));

check("src.n60.allow", /still goes through/.test(v2) && /_dmAllow/.test(join) && !/blockMap\(pip\.cost, pip\.what\)/.test(join) && /echoPipWarn\(/.test(v2));
check("src.n49.copy", mapJs.includes("drawerHeadHtml('No fight card linked')") && host.includes("map.focusToken") && v2.includes('DM.toast("No fight card linked")') && !v2.includes('DM.toast("No card linked")'));

/* ---------- N52: off-turn hard-block, on-turn and outside initiative stay open ---------- */
{
  const toasts = [];
  const sb = { console, setTimeout, clearTimeout, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
  sb.window = sb; sb.globalThis = sb;
  const store = {};
  sb.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  sb.SSDNSDmJoin = { uid: () => "u1" };
  sb.SSDNSApp = { doc: () => ({ character: { name: "Caleb", calling: "gunslinger", level: 5 } }) };
  sb.SSDNSToast = (msg) => { toasts.push(String(msg || "")); };
  sb.document = {
    readyState: "complete",
    body: { classList: { toggle() {}, contains() { return false; } } },
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  sb.MutationObserver = class { observe() {} disconnect() {} };
  sb.addEventListener = () => {};
  vm.createContext(sb);
  vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
  vm.runInContext(read("assets/js/action-pips.js"), sb, { filename: "action-pips.js" });
  vm.runInContext(read("assets/js/turn-lock.js"), sb, { filename: "turn-lock.js" });
  const order = [
    { id: "e1", name: "Outlaw", kind: "enemy" },
    { id: "p1", name: "Caleb", kind: "player", playerId: "u1" }
  ];
  const off = { round: 1, turn: 0, started: true, order, seq: 2, turnStarts: { e1: 2, p1: 1 } };
  sb.SSDNSActionPips.onTurn(off);
  const blocked = sb.SSDNSTurnLock.offTurnBlock("gear");
  check("n52.offTurn", blocked === "It isn't your turn" && toasts.includes("It isn't your turn") && sb.SSDNSActionPips.state().action === false, blocked);
  sb.SSDNSActionPips.onTurn(Object.assign({}, off, { turn: 1 }));
  check("n52.ownTurn", sb.SSDNSTurnLock.offTurnBlock("gear") === "" && sb.SSDNSTurnLock.offTurnBlock("attack") === "");
  sb.SSDNSActionPips.onTurn({ round: 1, turn: 0, started: false, order, seq: 1, turnStarts: {} });
  check("n52.outside", sb.SSDNSTurnLock.offTurnBlock("attack") === "" && sb.SSDNSTurnLock.offTurnBlock("gear") === "");
  sb.SSDNSActionPips.onTurn(off);
  sb.SSDNSActionPips.setOa("oaArmed", "oa1");
  check("n52.oaOpen", sb.SSDNSTurnLock.offTurnBlock("attack") === "");
  check("n52.gearStillBlocked", sb.SSDNSTurnLock.offTurnBlock("gear") === "It isn't your turn");
  sb.SSDNSApp._dmCmd = true;
  check("n52.dmSkips", sb.SSDNSTurnLock.offTurnBlock("gear") === "");
  sb.SSDNSApp._dmCmd = false;
  const before = sb.SSDNSActionPips.state().bonus;
  sb.SSDNSActionPips.onTurn(Object.assign({}, off, { turn: 1 }));
  sb.SSDNSActionPips.spend("bonus", "Tactical Reload");
  check("n52.onTurnSpends", sb.SSDNSActionPips.state().bonus === true && before === false);
  const n = toasts.length;
  check("n52.playerStillBlocks", sb.SSDNSActionPips.blockMap("bonus", "Tactical Reload") === "Bonus action already used." && toasts.length === n + 1);
}

/* ---------- N51 / N54 / N60 against the DM fight ---------- */
function makeFight() {
  const toasts = [];
  const ledger = [];
  const commands = [];
  const chat = [];
  const sb = {
    console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
    URL, encodeURIComponent, Promise, setTimeout, clearTimeout
  };
  sb.globalThis = sb;
  sb.window = sb;
  const stored = {};
  sb.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null; },
    setItem(k, v) { stored[k] = String(v); }
  };
  sb.document = {
    getElementById() { return null; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { innerHTML: "", className: "", dataset: {}, style: {}, addEventListener() {}, appendChild() {}, setAttribute() {}, querySelector() { return null; }, querySelectorAll() { return []; } }; },
    body: { appendChild() {}, classList: { contains() { return false; } } },
    activeElement: null
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let seq = 0;
  sb.DMCC = {
    $: () => null, $$: () => [], esc,
    state: { players: {}, ledger: [], rolls: [], chat, demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: [] },
    toast(msg) { toasts.push(String(msg || "")); },
    uid(p) { seq += 1; return (p || "id") + seq; },
    guardFocus(fn) { if (fn) fn(); },
    parseDice() { return { total: 4, detail: "4" }; },
    pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
    pushRoll() { return Promise.resolve(); },
    pushLedger(row) { ledger.push(row); return Promise.resolve(); },
    renderPlayers() {},
    roomRef(p) { return { path: p }; }
  };
  vm.createContext(sb);
  vm.runInContext(read("assets/js/turn-rules.js"), sb, { filename: "turn-rules.js" });
  vm.runInContext(read("assets/js/apply-guard.js"), sb, { filename: "apply-guard.js" });
  vm.runInContext(read("assets/js/misfire.js"), sb, { filename: "misfire.js" });
  vm.runInContext(read("assets/js/conditions.js"), sb, { filename: "conditions.js" });
  const src = v2.replace(
    /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
    "\nglobalThis.__fight = { fight: fight };\n"
  );
  vm.runInContext(src, sb, { filename: "v2.js" });
  return { sb, toasts, ledger, commands, chat };
}

{
  const sb = { console };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read("assets/js/apply-guard.js"), sb, { filename: "apply-guard.js" });
  const beast = {
    attackList: [
      { id: "henrietta", name: "Henrietta Repeating Rifle", capacity: 6, loaded: 4, spare: 3, properties: ["Tactical Reload"], notes: "Tactical Reload loads 1 round as a bonus action." },
      { id: "ball", name: "Ball n Cap Revolver", capacity: 6, loaded: 2, spare: 4, properties: ["slow load (a full turn)"], notes: "Slow load: reloading takes a full turn." },
      { id: "bite", name: "Bite", damage: "1d4" }
    ]
  };
  const card = sb.SSDNSApplied.enemyCardModel(beast);
  check("n54.stampTr", card.attacks[0].tr === true && beast.attackList[0].tr === true && card.attacks[1].tr === false && beast.attackList[1].tr === false && card.attacks[2].tr !== true, JSON.stringify(card.attacks.map((a) => a.tr)));
}

{
  const { sb, toasts, ledger, chat } = makeFight();
  const fight = sb.__fight.fight;
  const gun = { id: "henrietta", name: "Henrietta", capacity: 6, loaded: 4, spare: 3, tr: true, properties: "Tactical Reload" };
  const slow = { id: "ball", name: "Ball n Cap", capacity: 6, loaded: 2, spare: 0, tr: false, properties: "slow load (a full turn)" };
  const foe = { id: "en1", name: "Deputy", kind: "enemy", ac: 13, hp: 20, maxHp: 20, mapTokenId: "tok_en1", card: { attacks: [gun, slow] }, attackList: [gun, slow] };
  fight.order = [foe];
  fight.started = true;
  fight.turn = 0;
  fight.round = 1;
  const empty = await sb.SSDNSMapFight.reload({ combatantId: "en1", weaponId: "ball" });
  check("n51.enemyEmpty", empty === false && slow.loaded === 2 && slow.spare === 0 && toasts.some((t) => /no ammo/i.test(t)) && ledger.length === 0 && chat.length === 0, JSON.stringify({ empty, loaded: slow.loaded, toasts, ledger: ledger.length }));
  toasts.length = 0;
  gun.spare = 0;
  gun.loaded = 3;
  const none = await sb.SSDNSMapFight.reload({ combatantId: "en1", weaponId: "henrietta" });
  check("n51.trGunEmptyReload", none === false && gun.loaded === 3 && toasts.some((t) => /no ammo/i.test(t)) && ledger.length === 0, JSON.stringify({ none, loaded: gun.loaded, toasts }));

  gun.spare = 3;
  gun.loaded = 4;
  toasts.length = 0;
  const first = await sb.SSDNSMapFight.tr({ combatantId: "en1", weaponId: "henrietta" });
  const marks = (fight.markers || {}).en1 || {};
  check("n54.firstTr", first === true && gun.loaded === 5 && gun.spare === 2 && marks.bonus === true, JSON.stringify({ first, loaded: gun.loaded, spare: gun.spare, marks }));
  const second = await sb.SSDNSMapFight.tr({ combatantId: "en1", weaponId: "henrietta" });
  check("n54.secondWarns", second === true && gun.loaded === 6 && gun.spare === 1 && toasts.some((t) => /done anyway/i.test(t)) && ledger.length === 0 && chat.length === 0, JSON.stringify({ second, loaded: gun.loaded, toasts }));
  const held = slow.loaded;
  toasts.length = 0;
  const denied = await sb.SSDNSMapFight.tr({ combatantId: "en1", weaponId: "ball" });
  check("n54.trMinus", denied === false && slow.loaded === held && toasts.some((t) => /can't Tactical Reload \(TR —\)/.test(t)), JSON.stringify({ denied, loaded: slow.loaded, toasts }));
}

{
  const { sb, toasts, ledger, commands, chat } = makeFight();
  const fight = sb.__fight.fight;
  const snapGun = { id: "navy", index: 0, name: "Navy", capacity: 6, loaded: 1, spare: 0, tr: true, weapon: "navy" };
  const pc = { id: "pc1", name: "Ada", kind: "player", playerId: "pc1", dmActsAs: true, mapTokenId: "tok_pc1", card: { attacks: [] } };
  fight.order = [pc];
  fight.started = true;
  fight.turn = 0;
  fight.round = 1;
  fight.seq = 2;
  fight.turnStarts = { pc1: 2 };
  sb.DMCC.state.players.pc1 = {
    snapshot: { name: "Ada", guns: [snapGun], ammo: [] },
    turnMarkers: { action: true, bonus: true, reaction: true, actionBy: "other", attacks: 1, turnKey: "s2" }
  };
  const re = await sb.SSDNSMapFight.reload({ combatantId: "pc1", weaponId: "navy" });
  check("n51.playerDrawer", re === false && commands.length === 0 && ledger.length === 0 && chat.length === 0 && toasts.some((t) => /no .+ left to reload|no ammo/i.test(t)), JSON.stringify({ re, toasts, commands: commands.length }));
  toasts.length = 0;
  snapGun.spare = 4;
  const tr = await sb.SSDNSMapFight.tr({ combatantId: "pc1", weaponId: "navy" });
  check("n60.playerTrAllows", tr === true && commands.length === 1 && commands[0].payload && commands[0].payload.op === "tr" && toasts.some((t) => /done anyway/i.test(t)) && ledger.length === 0 && chat.length === 0, JSON.stringify({ tr, commands, toasts }));
  toasts.length = 0;
  const shot = await sb.SSDNSMapFight.attack({ combatantId: "pc1", weaponId: "navy", targetCombatantId: "pc1" });
  check("n60.attackNeedsTarget", shot === false);
  const other = { id: "en9", name: "Bandit", kind: "enemy", ac: 12, hp: 8, maxHp: 8 };
  fight.order = [pc, other];
  const fired = await sb.SSDNSMapFight.attack({ combatantId: "pc1", weaponId: "navy", targetCombatantId: "en9" });
  check("n60.attackAllows", fired === true && commands.some((c) => c.payload && c.payload.op === "fire") && toasts.some((t) => /done anyway/i.test(t)), JSON.stringify({ fired, toasts, ops: commands.map((c) => c.payload && c.payload.op) }));
}

/* ---------- N49: bestiary place and Add token → beast link the fight card ---------- */
function makeWindow() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div id="initList"></div><div id="bestiaryList"></div>
    <button type="button" id="btnAddCustom">Add custom enemy</button>
  </body></html>`, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  w.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = {};
    return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; if (typeof p !== "string") return undefined; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
  };
  w.confirm = () => true;
  return w;
}
const beasts = [{
  id: "outlaw", name: "Outlaw", group: "generic-folk", ac: 13, hp: 11, dex: 12,
  attacks: "Revolver +4",
  attackList: [{ id: "henrietta", name: "Henrietta Repeating Rifle", capacity: 7, loaded: 7, spare: 7, properties: ["Tactical Reload"], notes: "Tactical Reload loads 1 round as a bonus action." }]
}];
const w = makeWindow();
w.fetch = async (url) => {
  const u = String(url);
  if (u.includes("bestiary")) return { ok: true, json: async () => beasts };
  return { ok: false, json: async () => ({}) };
};
w.DMCC = {
  $: (sel) => w.document.querySelector(sel),
  $$: (sel) => Array.from(w.document.querySelectorAll(sel)),
  esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  state: { players: {}, ledger: [], rolls: [], demo: false, roomCode: "DUST", uid: "dm", db: {}, unsubs: [], meta: { dmUid: "dm" } },
  toast() {},
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
function addScript(code) {
  const s = w.document.createElement("script");
  s.textContent = code;
  w.document.body.appendChild(s);
}
addScript(read("assets/js/apply-guard.js"));
addScript(read("assets/js/conditions.js"));
addScript(read("dm/assets/js/v2.js"));
for (let n = 0; n < 30 && !(w.SSDNSMapCards && w.SSDNSMapCards.choices && w.SSDNSMapCards.choices().bestiary.some((g) => (g.options || []).some((b) => b.id === "outlaw"))); n++) {
  await flush(20);
}
addScript(read("map/ssdns-map-firebase.js"));
addScript(read("map/ssdns-map.js"));
const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const el = w.document.createElement("div");
el.id = "map";
w.document.body.appendChild(el);
const map = w.SSDNSMap.create({
  el, role: "dm", uid: "dm",
  adapter: w.SSDNSMapFirebase.memory({ role: "dm" }),
  host: {
    on(name, detail) {
      detail = detail || {};
      if (name === "drawer:link" && w.SSDNSMapFight && w.SSDNSMapFight.link) {
        Promise.resolve(w.SSDNSMapFight.link(detail)).then((patch) => {
          if (patch && map.applyLink) map.applyLink(detail.tokenId, patch);
          if (map.refreshCard) map.refreshCard(detail.tokenId || "");
        });
      }
      if (name === "bestiary:place" && w.SSDNSMapFight && w.SSDNSMapFight.placeBeast) {
        Promise.resolve(w.SSDNSMapFight.placeBeast(detail)).then((tokenId) => {
          if (tokenId && map.focusToken) map.focusToken(tokenId);
        });
      }
    },
    getCard(id) { return w.SSDNSMapCards.get(id); },
    linkChoices() { return w.SSDNSMapCards.choices(); },
    players() { return []; }
  },
  options: { scene, assetBase: "", players: () => [], room: { table: { initiative: { order: [], turn: 0 } } } }
});
await flush(40);
w.SSDNSMapHost = {
  placeToken(spec) {
    const token = map.placeLinkedToken(spec || {});
    return token && token.id ? token.id : "";
  },
  removeToken(id) { map.removeToken(id); },
  hasToken(id) { return map.hasToken(id); },
  releaseToken(id) { map.releaseToken(id); },
  tokensLoaded() { return true; },
  syncInitiative() {}
};
function act(name) { return el.querySelector('[data-act="' + name + '"]'); }
function click(node) { node.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }
click(act("addTokenBtn"));
await flush(20);
const blank = act("drawer");
check("n49.blank", !!(blank && blank.textContent.includes("No fight card linked") && act("linkPick")), blank && blank.textContent.slice(0, 80));
const pick = act("linkPick");
pick.value = "beast:outlaw";
pick.dispatchEvent(new w.Event("change", { bubbles: true }));
await flush(40);
const linked = (w.SSDNSMapFight && true) && (function () {
  /* fight.order is closed over inside v2; read it through the card the drawer paints */
  return act("drawer") && act("drawer").textContent;
})();
check("n49.pickBeast", linked && linked.includes("Outlaw") && linked.includes("Henrietta") && !linked.includes("No fight card linked") && !!act("drawer").querySelector('[data-act="rowTr"]'), String(linked).slice(0, 180));

const placedId = w.SSDNSMapFight.placeBeast({ beastId: "outlaw", at: { x: 3, y: 3 } });
await flush(20);
if (placedId && map.focusToken) map.focusToken(placedId);
await flush(20);
const placedDrawer = act("drawer") && act("drawer").textContent;
check("n49.place", !!placedId && map.hasToken(placedId) && placedDrawer && placedDrawer.includes("Outlaw") && !placedDrawer.includes("No fight card linked"), String(placedId) + " " + String(placedDrawer).slice(0, 120));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nN49–N60 ok");

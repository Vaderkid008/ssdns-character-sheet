/**
 * Fight board: portraits, side frames, Roll Init, condition X, weapon log, live attacks.
 *   node tools/test-fight-board.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const html = read("dm/index.html");
check(html.includes('class="wanted-head"') && html.includes(">Wanted<"), "Wanted header");
check(html.includes('id="fightPortraits"') && html.includes('id="fightFocus"') && html.includes('id="fightLog"'), "portrait, focus, and log mounts");
/* turn order PR 1 (T1): one Next, one Roll Initiative (header), one End combat (header); Previous is "Undo last Next" */
check(html.includes('id="btnNextTurn"') && html.includes('id="btnRollInitAll"') && !html.includes('id="btnRollAll"') && html.includes('id="btnEndCombatHead"') && !html.includes('id="btnEndCombat"') && html.includes('id="btnPrevTurn"'), "one Next, one Roll Initiative and one End combat");
check(html.includes('id="combatantMenu"') && html.includes("Set order and add a combatant"), "one combatant menu");
check(html.includes('id="turnStrip"'), "table turn strip stays");

const css = read("dm/assets/css/dmcc.css");
check(css.includes("#panel-fight .init-row.side-pc") && css.includes("#panel-fight .init-row.side-enemy") && css.includes("--fight-enemy: #6e2430") && css.includes("--fight-pc: #3d6f8a"), "PC and enemy frames are distinct");
check(css.includes(".fight-portrait.current") && css.includes(".fight-portrait.ondeck") && css.includes(".fight-portrait.later"), "portrait states");

const bag = {};
function make(id) {
  if (!bag[id]) bag[id] = {
    id: id,
    innerHTML: "",
    textContent: "",
    hidden: id === "enemySheet",
    value: id === "damageMode" ? "auto" : "",
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    options: []
  };
  return bag[id];
}
const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.localStorage = { getItem() { return null; }, setItem() {} };
sandbox.document = {
  getElementById(id) { return make(id); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() {
    return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, setAttribute() {}, appendChild() {} };
  },
  body: { appendChild() {} },
  activeElement: null
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let seq = 0;
sandbox.DMCC = {
  $: (sel) => make(String(sel || "").replace(/^#/, "")),
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { seq += 1; return (p || "id") + seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand() { return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {}
};
sandbox.SSDNSConditions = {
  label(c) { return (c && c.name) || ""; },
  idFor(s, n) { return s + ":" + n; },
  normalize(x) { return x; },
  mergeById(list) { return list || []; },
  listText() { return ""; }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const v2 = read("dm/assets/js/v2.js").replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__fight = { turnRowHtml, renderFight, publicGuns, conditionChips, dropListedCondition, setOrder: function (rows) { fight.order = rows || []; }, setFight: function (started, turn) { fight.started = !!started; fight.turn = turn || 0; }, setCond: function (map) { fight.condMap = map || {}; }, cond: function () { return fight.condMap; } };\n"
);
vm.runInContext(v2, sandbox, { filename: "v2.js" });
const api = sandbox.__fight;

const pc = { id: "pc1", playerId: "pc1", kind: "player", name: "Caleb", ac: 14, hp: 20, init: 16 };
const ally = { id: "ab", name: "Abigail", kind: "enemy", side: "friendly", ac: 15, hp: 9, init: 14, card: { attacks: [{ name: "Saber", toHit: 4, damage: "1d8" }, { name: "Old Knife", toHit: 1, dropped: true }] } };
const foe = { id: "ban", name: "Bandit", kind: "enemy", ac: 12, hp: 11, init: 8, card: { attacks: [{ name: "Revolver", toHit: 3 }] } };
const wolf = { id: "wolf", name: "Wolf", kind: "enemy", ac: 13, hp: 11, init: 4 };
api.setOrder([pc, ally, foe, wolf]);
api.setFight(true, 0);
api.renderFight();

const portraits = bag.fightPortraits.innerHTML;
check(portraits.indexOf("fight-portrait side-pc current") >= 0, "current PC portrait is lit");
check(portraits.indexOf("fight-portrait side-ally ondeck") >= 0, "next ally is greyed");
check(portraits.indexOf("fight-portrait side-enemy ondeck") >= 0, "the second turn is greyed");
check(portraits.indexOf("fight-portrait side-enemy later") >= 0, "later enemy is dimmer");
check(portraits.indexOf('data-fight-portrait="0"') >= 0, "portrait click does not use a turn button");
check(bag.fightFocus.innerHTML.indexOf("side-pc") >= 0 && bag.fightFocus.innerHTML.indexOf("Caleb") >= 0, "focus is the active turn");
check(bag.initList.innerHTML.indexOf("Abigail") >= 0 && bag.initList.innerHTML.indexOf("Caleb") < 0, "other cards stay in the list");
check(bag.btnRollAll.hidden === true, "Roll Init hides once combat has started");

api.setFight(false, 0);
api.renderFight();
check(bag.btnRollAll.hidden === false, "Roll Init is back before combat starts");
check(bag.fightFocus.innerHTML.indexOf("Roll Init") >= 0, "focus waits for initiative");
check(bag.initList.innerHTML.indexOf("init-row") >= 0 && bag.initList.innerHTML.indexOf("Caleb") >= 0, "cards list before combat");

const allyHtml = api.turnRowHtml(ally, 1);
const foeHtml = api.turnRowHtml(foe, 2);
const pcHtml = api.turnRowHtml(pc, 0);
check(allyHtml.indexOf("data-row-atk") >= 0 && allyHtml.indexOf("Saber +4") >= 0 && allyHtml.indexOf("Old Knife") < 0, "ally attacks, dropped weapons stay off the card");
check(allyHtml.indexOf(" side-ally") >= 0 && allyHtml.indexOf(" friendly") >= 0, "ally frame");
check(foeHtml.indexOf("side-enemy") >= 0 && foeHtml.indexOf("init-row friendly") < 0 && foeHtml.indexOf("Mark friendly") >= 0, "enemy frame is not the friendly row");
check(pcHtml.indexOf("side-pc") >= 0 && pcHtml.indexOf("data-grab=\"rob\"") >= 0 && pcHtml.indexOf(">Rob/Disarm<") >= 0 && pcHtml.indexOf("data-grab=\"disarm\"") < 0, "PC card has one Rob/Disarm button");
check(foeHtml.indexOf("DM roll vs this AC") >= 0 && foeHtml.indexOf("data-cover-val") >= 0, "cover and the AC roll stay");

sandbox.DMCC.state.players.pc1 = {
  snapshot: {
    guns: [
      { name: "Navy", weapon: "Navy", index: 0, equipped: true, capacity: 6 },
      { name: "Packed Rifle", weapon: "Rifle", index: 1, equipped: false, capacity: 1 }
    ]
  }
};
const guns = api.publicGuns(pc);
check(guns.length === 1 && guns[0].name === "Navy", "unequipped guns leave the fight strip, got " + guns.map((g) => g.name).join(","));

api.setCond({
  "ab:Poisoned": { id: "ab:Poisoned", name: "Poisoned", subjectId: "ab" }
});
const chips = api.conditionChips(ally);
check(chips.indexOf("data-cond-drop") >= 0 && chips.indexOf("Poisoned") >= 0 && chips.indexOf("cond-x") >= 0, "condition chips have a remove control");
await api.dropListedCondition("ab", "enemy", "Poisoned", "ab:Poisoned");
check(!api.cond()["ab:Poisoned"], "removing a chip uses the condition writer");

sandbox.DMCC.state.rolls = [
  { attack: true, who: "Bandit", weapon: "Ball n Cap Revolver +3", detail: "Bandit attacks Caleb: 18+3 = 21 vs AC 14 → HIT", crit: false }
];
api.renderFight();
check(bag.fightLog.innerHTML.indexOf("Ball n Cap Revolver") >= 0 && bag.fightLog.innerHTML.indexOf("HIT") >= 0, "attack log keeps the weapon name");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok fight board");

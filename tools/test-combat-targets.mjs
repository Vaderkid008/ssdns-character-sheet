/**
 * One target list for every combatant, friendly attacks, NPC saves,
 * and the Bandit Ball n Cap misfire.
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

const commands = [];
const rolls = [];
const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.localStorage = { getItem() { return null; }, setItem() {} };
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, setAttribute() {} };
  },
  body: { appendChild() {} },
  activeElement: null
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let seq = 0;
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { seq += 1; return (p || "id") + seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice(formula) {
    const text = String(formula || "");
    const flat = text.match(/^(\d+)$/);
    if (flat) return { total: Number(flat[1]), detail: text };
    return { total: 4, detail: "4" };
  },
  pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
  pushRoll(roll) { rolls.push(roll); return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {}
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/data/rules.js"), sandbox, { filename: "rules.js" });
const v2 = read("dm/assets/js/v2.js").replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__combat = { combatTargets, defaultCombatTarget, targetMenu, turnRowHtml, enemyCardHtml, stripGuns, enemyStrike, cardStrike, requestPlayerSave, ensureCombatantCard, banditGun, attackFromLine, mergeBestiary, setOrder: function (rows) { fight.order = rows || []; }, order: function () { return fight.order; }, setFight: function (started, turn) { fight.started = !!started; fight.turn = turn || 0; } };\n"
);
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const api = sandbox.__combat;
const Applied = sandbox.SSDNSApplied;

const ally = {
  id: "ab",
  name: "Abigail Ellen",
  kind: "enemy",
  side: "friendly",
  ac: 15,
  hp: 9,
  card: { attacks: [{ id: "saber", name: "Saber", toHit: 4, damage: "1d8", damageType: "slashing" }] }
};
const allyFight = api.turnRowHtml(ally, 0);
const allySheet = api.enemyCardHtml(ally, 0);
check(allyFight.indexOf("data-row-atk") >= 0 && allyFight.indexOf("Saber +4") >= 0, "friendly row shows its attack button");
check(allyFight.indexOf("DM roll vs this AC") >= 0 && allyFight.indexOf('title="Rolls against this row\'s AC using the Damage box dice"') >= 0, "the AC button is renamed and explained");
check(allySheet.indexOf("data-sheet-roll") >= 0 && allySheet.indexOf("does not target the party") < 0, "friendly sheet can roll");

api.setFight(true, 0);
const banditPreview = {
  id: "ban",
  name: "Bandit",
  kind: "enemy",
  side: "friendly",
  card: { attacks: [api.banditGun()] }
};
const dots = api.stripGuns(banditPreview, 0);
check(dots.indexOf("chamber-dot") >= 0 && dots.indexOf("data-row-atk") >= 0, "a friendly gun's chambers are clickable on its turn");
api.setFight(false, 0);

api.setOrder([
  { id: "pc1", playerId: "pc1", kind: "player", name: "Caleb", ac: 14, hp: 20 },
  { id: "ally", kind: "enemy", side: "friendly", name: "Abigail", ac: 15, hp: 9 },
  { id: "wolf", kind: "enemy", name: "Wolf", ac: 13, hp: 11 },
  { id: "down", kind: "enemy", name: "Downed", ac: 10, hp: 0, status: "Down" },
  { id: "gone", kind: "enemy", name: "Gone", ac: 10, hp: 8, fled: true, status: "Fled" },
  { id: "ban", kind: "enemy", name: "Bandit", ac: 12, hp: 11 }
]);
const bandit = api.order().filter((r) => r.id === "ban")[0];
const picked = api.combatTargets(bandit);
const ids = picked.map((p) => p.id);
check(ids.indexOf("pc1") >= 0 && ids.indexOf("ally") >= 0 && ids.indexOf("wolf") >= 0, "picker includes allies, enemies, and PCs: " + ids.join(","));
check(ids.indexOf("ban") < 0 && ids.indexOf("down") < 0 && ids.indexOf("gone") < 0, "picker excludes the attacker, Down, and fled");
check(picked.map((p) => p.group).join(",") === "Party,Allies,Enemies", "targets group as Party, Allies, Enemies");
check(api.defaultCombatTarget(bandit, picked) === "pc1", "a hostile defaults to the party");
const abigail = api.order().filter((r) => r.id === "ally")[0];
check(api.defaultCombatTarget(abigail, api.combatTargets(abigail)) === "wolf", "a friendly defaults to a hostile");
const menu = api.targetMenu(picked, "wolf");
check(menu.indexOf('label="Party"') >= 0 && menu.indexOf('label="Allies"') >= 0 && menu.indexOf('label="Enemies"') >= 0 && menu.indexOf("No targets") < 0, "the menu uses the three groups");
check(api.targetMenu([], "") === '<option value="">No targets</option>', "an empty fight says No targets");

commands.length = 0;
rolls.length = 0;
sandbox.SSDNSTestRoll = () => 15;
sandbox.askEnemyStrike = async () => ({ targetId: "wolf", bonus: 5, dice: "4" });
const shooter = { id: "ban2", name: "Bandit", kind: "enemy", ac: 12, hp: 11, atkBonus: 5, damage: "4" };
const wolf = { id: "wolf", name: "Wolf", kind: "enemy", ac: 13, hp: 11, maxHp: 11 };
api.setOrder([shooter, wolf]);
await sandbox.enemyStrike(0);
check(wolf.hp === 7, "an enemy hit lowers the other enemy's HP, got " + wolf.hp);
check(!commands.some((c) => c && c.type === "hp"), "an enemy hit does not send a player hp command");

commands.length = 0;
rolls.length = 0;
sandbox.DMCC.state.demo = false;
sandbox.DMCC.state.db = {};
const saver = {
  id: "wolf",
  name: "Wolf",
  kind: "enemy",
  ac: 13,
  hp: 11,
  card: { scores: { DEX: 14 }, saves: {} }
};
api.setOrder([saver]);
sandbox.SSDNSTestRoll = () => 10;
const save = await Promise.race([
  sandbox.requestPlayerSave({ targetId: "wolf", targetName: "Wolf", ability: "DEX", dc: 15, label: "Bite" }),
  new Promise((_, reject) => setTimeout(() => reject(new Error("npc save waited on a player")), 400))
]);
check(save && save.logged && save.mod === 2 && save.total === 12 && save.failed === true, "an NPC save uses the sheet mod, got " + JSON.stringify(save && { logged: save.logged, mod: save.mod, total: save.total, failed: save.failed }));
check(rolls.length === 1 && rolls[0].save === true, "the NPC save is logged");
check(!commands.some((c) => c && c.type === "save"), "an NPC save does not ask a player");
sandbox.DMCC.state.demo = true;
sandbox.DMCC.state.db = null;

const gun = api.banditGun();
check(gun.misfire === 4 && gun.id === "ball-n-cap" && gun.kind === "ranged" && gun.damageType === "piercing" && gun.weapon.indexOf("Ball n Cap") >= 0, "the Bandit gun is a numeric Ball n Cap");
const typed = api.attackFromLine("Ball n Cap Revolver +3, 20/60, 1d8+1 piercing, MF 1–4, slow, cap 6", "", "");
check(typed.misfire === 4 && typed.capacity === 6 && typed.kind === "ranged", "typed MF 1–4 becomes a ceiling of 4");
const banditRow = { id: "ban", name: "Bandit", kind: "enemy", ac: 12, hp: 11, attackList: [Object.assign({}, gun)] };
const mark = { id: "wolf", name: "Wolf", kind: "enemy", ac: 13, hp: 20, maxHp: 20 };
api.setOrder([banditRow, mark]);
api.ensureCombatantCard(banditRow);
check(banditRow.card.attacks[0].misfire === 4 && banditRow.card.attacks[0].loaded === 6, "the Bandit card keeps six rounds and misfire 4");
sandbox.askEnemyStrike = async () => ({ targetId: "wolf", bonus: 3, dice: "1d8+1" });
for (const nat of [1, 2, 3, 4]) {
  banditRow.card.attacks[0].loaded = 6;
  banditRow.card.attacks[0].jammed = false;
  sandbox.SSDNSTestRoll = () => nat;
  await sandbox.cardStrike(0, 0);
  check(banditRow.card.attacks[0].jammed === true && banditRow.card.attacks[0].loaded === 5, "natural " + nat + " misfires and spends a round");
}
banditRow.card.attacks[0].loaded = 6;
banditRow.card.attacks[0].jammed = false;
sandbox.SSDNSTestRoll = () => 5;
await sandbox.cardStrike(0, 0);
check(banditRow.card.attacks[0].jammed === false && banditRow.card.attacks[0].loaded === 5, "natural 5 fires and still spends a round");

const legacy = { id: "old", name: "Old Bandit", kind: "enemy", attackList: [{ name: "Ball n Cap Revolver", misfire: "1–4", capacity: 6, damage: "1d8+1", toHit: 3 }] };
api.ensureCombatantCard(legacy);
check(legacy.card.attacks[0].misfire === 4, "a saved 1–4 misfire string becomes 4");

const fileBeasts = [{ id: "outlaw", name: "Outlaw", source: "file", attacks: "ChaosMaker" }];
const saved = [
  { id: "outlaw", name: "Road Agent", source: "file", attackList: [{ name: "Scimitar" }] },
  { id: "ghost", name: "Ghost Gun", source: "file", attacks: "Revolver" },
  { id: "my-bandit", name: "My Bandit", custom: true, attacks: "Knife" }
];
const merged = api.mergeBestiary(fileBeasts, saved);
check(merged.filter((b) => b.id === "outlaw")[0].name === "Road Agent", "a saved name still overrides the file");
check(merged.filter((b) => b.id === "outlaw")[0].attacks === "ChaosMaker", "the file attacks stay");
check(!merged.some((b) => b.id === "ghost"), "a stale saved id is dropped");
check(merged.some((b) => b.id === "my-bandit"), "a true custom entry stays");
check(Applied.isMisfire(4, "1–4") === true && Applied.isMisfire(5, "1–4") === false, "misfire ranges use the high number");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok combat targets");

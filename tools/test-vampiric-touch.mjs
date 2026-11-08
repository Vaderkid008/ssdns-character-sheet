/**
 * Vampiric Touch heals the caster for half the necrotic dealt when the hit lands
 * (sheet 0.3.225 / DMCC 0.2.238).
 * A joined cast posts a melee spell attack. That request used to drop healHalf,
 * so the DM never healed. The spell name is enough, and the flag still works.
 *   node tools/test-vampiric-touch.mjs
 * rules.js is not edited.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.240" && version.sheetBuild === "sheet-playtest-v03240");
check("ver.dmcc", version.dmcc === "0.2.253" && version.dmccBuild === "dmcc-playtest-v02253");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.240"') && read("assets/js/app.js").includes("sheet-playtest-v03240"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.253"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02253"));
const rulesDiff = execSync("git diff --name-only HEAD -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sheet = read("assets/js/sheet-extras.js");
const join = read("assets/js/dm-join.js");
const hidden = sheet.slice(sheet.indexOf("if (hiddenSpell)"), sheet.indexOf("if (rolled.attack && rolled.multi"));
const pending = sheet.slice(sheet.indexOf("function sendPendingAttack"), sheet.indexOf("function freeShotChosen"));
const post = join.slice(join.indexOf("function postDamage"), join.indexOf("function writeAttack"));
const attack = join.slice(join.indexOf("function writeAttack"), join.indexOf("function oaTagOn"));
check("sheet.hidden", /healHalf:\s*!!\(row && row\.healHalf\)/.test(hidden));
check("sheet.pending", /healHalf:\s*!!info\.healHalf/.test(pending));
check("sheet.offline", /row\.healHalf && spellDmg > 0 && !joined\(\)/.test(sheet));
check("join.damage", /if \(entry\.healHalf\) row\.healHalf = true;/.test(post));
check("join.attack", /if \(entry\.healHalf\) row\.healHalf = true;/.test(attack));

const box = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
box.window = box;
box.globalThis = box;
vm.createContext(box);
vm.runInContext(read("assets/data/rules.js"), box);
vm.runInContext(read("assets/js/spell-riders.js"), box);
vm.runInContext(read("assets/js/spell-cast.js"), box);
const Cast = box.SSDNSSpellCast;
const R = box.SSDNSSpellRiders;
const row = Cast.lookup("Vampiric Touch");
check("cast.row", !!(row && row.healHalf && row.kind === "attack" && row.type === "necrotic"), JSON.stringify(row && { healHalf: row.healHalf, kind: row.kind, type: row.type, dice: row.dice }));
box.SSDNSTestRoll = function () { return 15; };
const rolled = Cast.rollCast({ spellName: "Vampiric Touch", slotLevel: 3, attackBonus: 5, characterLevel: 5 });
check("cast.pack", rolled.attack === true && rolled.healHalf === true && rolled.damageTotal >= 3 && rolled.label === "Vampiric Touch", rolled.text);
check("cast.half", R.vampiricHalf(11) === 5 && R.vampiricHalf(7) === 3 && R.vampiricHalf(1) === 0);
check("cast.alias", R.spellKey("Vampiric Touch (Bleed 'Em Dry)") === "vampiric touch" && R.patchRow({ name: "vampiric touch" }).healHalf === true);

const commands = [];
const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, URL, encodeURIComponent, Promise, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.addEventListener = function () {};
sandbox.removeEventListener = function () {};
sandbox.localStorage = { getItem() { return null; }, setItem() {} };
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, querySelectorAll() { return []; }, setAttribute() {} };
  },
  body: { appendChild() {}, classList: { contains() { return false; } } },
  activeElement: null
};
const esc = (s) => String(s == null ? "" : s);
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: [] },
  toast() {},
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand(cmd) { commands.push(cmd); return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {}
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox);
vm.runInContext(read("assets/js/conditions.js"), sandbox);
vm.runInContext(read("assets/js/spell-riders.js"), sandbox);
vm.runInContext(read("dm/assets/js/v2.js").replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__fight = { setOrder: function (r) { fight.order = r; }, applyRequest: applyRequest, applyPlayerHit: applyPlayerHit };\n"), sandbox);

const caster = { id: "pc1", playerId: "u_me", name: "Mara", kind: "player", hp: 12, maxHp: 30, ac: 14 };
const enemy = { id: "en1", name: "Bandit", kind: "enemy", hp: 40, maxHp: 40, ac: 12 };
sandbox.__fight.setOrder([caster, enemy]);

function heals() {
  return commands.filter((c) => c && c.type === "hp" && c.payload && c.payload.kind === "heal");
}

sandbox.__fight.applyRequest({
  type: "attack", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  hitTotal: 18, nat: 14, amount: 11, label: "Vampiric Touch", spellName: "Vampiric Touch", spell: true,
  rollId: "vt-atk", weapon: ""
}, "q-atk");
check("atk.enemy", enemy.hp === 29, String(enemy.hp));
check("atk.caster", caster.hp === 17, String(caster.hp));
const healCmd = heals();
check("atk.cmd", healCmd.length === 1 && healCmd[0].to === "u_me" && healCmd[0].payload.delta === 5 && /Vampiric Touch heals Mara 5/.test(healCmd[0].payload.text || ""), JSON.stringify(healCmd.map((c) => c.payload)));

const beforeMiss = caster.hp;
sandbox.__fight.applyRequest({
  type: "attack", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  hitTotal: 8, nat: 1, amount: 11, label: "Vampiric Touch", spellName: "Vampiric Touch", spell: true,
  rollId: "vt-miss"
}, "q-miss");
check("miss.none", enemy.hp === 29 && caster.hp === beforeMiss, enemy.hp + "/" + caster.hp);

sandbox.__fight.applyRequest({
  type: "spell", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  amount: 7, label: "Vampiric Touch", spell: "Vampiric Touch", rollId: "vt-dmg"
}, "q-dmg");
check("dmg.half", enemy.hp === 22 && caster.hp === 20, enemy.hp + "/" + caster.hp);

sandbox.__fight.applyRequest({
  type: "spell", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  amount: 9, label: "Fire Bolt", spell: "Fire Bolt", rollId: "fb"
}, "q-fb");
check("other.none", enemy.hp === 13 && caster.hp === 20, enemy.hp + "/" + caster.hp);

enemy.hp = 4;
sandbox.__fight.applyRequest({
  type: "attack", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  hitTotal: 19, nat: 16, amount: 11, label: "Vampiric Touch (Bleed 'Em Dry)", spellName: "Vampiric Touch (Bleed 'Em Dry)", spell: true,
  rollId: "vt-over"
}, "q-over");
check("over.dealt", enemy.hp === 0 && caster.hp === 25, enemy.hp + "/" + caster.hp);

enemy.hp = 20;
sandbox.__fight.applyRequest({
  type: "spell", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  amount: 10, label: "Siphon", spell: "Siphon", healHalf: true, rollId: "vt-flag"
}, "q-flag");
check("flag.half", enemy.hp === 10 && caster.hp === 30, enemy.hp + "/" + caster.hp);

const atCap = caster.hp;
sandbox.__fight.applyRequest({
  type: "spell", from: "u_me", characterName: "Mara", targetId: "en1", targetName: "Bandit",
  amount: 1, label: "Vampiric Touch", spell: "Vampiric Touch", rollId: "vt-one"
}, "q-one");
check("odd.zero", enemy.hp === 9 && caster.hp === atCap, enemy.hp + "/" + caster.hp);

const ghoul = { id: "gh1", name: "Ghoul", kind: "enemy", hp: 9, maxHp: 22, ac: 12 };
const victim = { id: "en2", name: "Scout", kind: "enemy", hp: 20, maxHp: 20, ac: 11 };
sandbox.__fight.setOrder([caster, ghoul, victim]);
sandbox.__fight.applyPlayerHit({
  rollId: "vt-card", targetId: "en2", targetName: "Scout", amount: 11,
  from: "gh1", characterName: "Ghoul", label: "Vampiric Touch", type: "damage"
});
check("dm.card", victim.hp === 9 && ghoul.hp === 14, victim.hp + "/" + ghoul.hp);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("vampiric touch ok");

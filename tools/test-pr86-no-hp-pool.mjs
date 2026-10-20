/**
 * PR86 (sheet 0.3.82 / DMCC 0.2.95): a creature with no hit-point pool (Spectral Horse: hp 0, immune to all damage)
 * is never shown as Down, to the DM or to players. Ordinary enemies at 0 HP still go Down.
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
  body: { appendChild() {} }
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], demo: true, roomCode: "", uid: "dm" },
  toast() {},
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/data/rules.js"), sandbox, { filename: "rules.js" });
vm.runInContext(read("assets/js/spell-cast.js"), sandbox, { filename: "spell-cast.js" });
const v2 = read("dm/assets/js/v2.js").replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__enemy = { enemyCardHtml, compactAttackButtons, turnRowHtml, enemyPickerList, enemySelectHtml, claimEnemyAdd, finishEnemyAdd, beastRow, enemyStatus, playersSeeLine, applyEnemyHp, grabDowned, noteUnconscious };\n");
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const Applied = sandbox.SSDNSApplied;
const E = sandbox.__enemy;
const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const beast = (id) => beasts.filter((b) => b.id === id)[0];
const J = (x) => JSON.stringify(x);
check(typeof Applied.noHpPool === "function", "SSDNSApplied.noHpPool is exported");

/* the Spectral Horse straight from the bestiary */
const horse = E.beastRow(beast("spectral-horse"));
check(horse.noHpPool === true && horse.hp === 0 && horse.beastId === "spectral-horse", "bestiary row flags no hp pool " + J({ f: horse.noHpPool, hp: horse.hp }));
check(E.enemyStatus(horse) === "", "DMCC status is not Down: " + E.enemyStatus(horse));
check(Applied.coarseStatus(horse) === "", "coarse status is blank");
check(Applied.publicEnemy(horse, 0, []).status === "", "players are not told Down");
check(!/Down/.test(E.playersSeeLine(horse, 0)), "Players see line has no Down: " + E.playersSeeLine(horse, 0));
check(Applied.refreshCombatantStatus(horse) === "" && horse.status !== "Down", "refresh keeps it up");
check(Applied.syncDownStatus(horse) === "" && horse.status !== "Down", "HP sync never marks it Down");
check(E.applyEnemyHp(horse, -7) === null && horse.hp === 0 && horse.status !== "Down", "damage changes nothing");
check(E.applyEnemyHp(horse, 5) === null && horse.hp === 0, "healing changes nothing");
check(E.grabDowned(horse) === false, "not treated as downed for grapples");
horse.status = "Down";
check(E.enemyStatus(horse) === "" && Applied.publicEnemy(horse, 0, []).status === "", "a stale Down status is not shown");
horse.fled = true;
check(E.enemyStatus(horse) === "Fled" && Applied.coarseStatus(horse) === "Fled", "it can still be dismissed as Fled");

/* an older saved row (no flag) with a bestiary id and 0 / 0 HP */
const legacy = { id: "en-old", name: "Spectral Horse", kind: "enemy", hp: 0, maxHp: 0, beastId: "spectral-horse" };
check(Applied.noHpPool(legacy) && E.enemyStatus(legacy) === "", "older saved summon row is not Down");

/* everything else is unchanged */
const outlaw = E.beastRow(beast("outlaw"));
check(outlaw.noHpPool === false, "a normal bestiary enemy has an hp pool");
outlaw.hp = 0;
check(E.enemyStatus(outlaw) === "Down" && Applied.publicEnemy(outlaw, 0, []).status === "Down", "outlaw at 0 HP is Down");
check(Applied.syncDownStatus(outlaw) === "Down", "HP sync still marks a normal enemy Down");
check(E.grabDowned(outlaw) === true, "a downed outlaw is still downed for grapples");
const hand = { id: "en-hand", name: "Goon", kind: "enemy", hp: 0, maxHp: 0 };
check(!Applied.noHpPool(hand) && E.enemyStatus(hand) === "Down", "a hand-added enemy at 0 HP is still Down");
const pc = { id: "p1", kind: "player", hp: 0, maxHp: 0, status: "Down" };
check(!Applied.noHpPool(pc), "players are never no-pool");
const wounded = E.beastRow(beast("outlaw"));
const b0 = E.applyEnemyHp(wounded, -3);
check(b0 === wounded.maxHp && wounded.hp === wounded.maxHp - 3, "damage still lands on normal enemies " + J([b0, wounded.hp]));

console.log(failures.length ? failures.length + " FAILED:\n" + failures.join("\n") : "All PR86 no-hp-pool checks passed.");
if (failures.length) process.exitCode = 1;

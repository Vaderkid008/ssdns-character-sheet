/**
 * N79 Phase 1c B — assignable Scorching Ray / Pact Shot beams, Disintegrate save edge.
 *   node tools/test-n79-beams.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const context = { console, Math, Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/pact-shot.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;
const Pact = context.SSDNSPactShot;

function row(name) { return Cast.lookup(name); }

const scorch = row("Scorching Ray");
check("ray.data", scorch && scorch.rays === 3 && scorch.rayUp === 1 && scorch.dice === "2d6" && scorch.type === "fire" && scorch.kind === "attack");
check("ray.count", Area.dartCount(scorch, 2) === 3 && Area.dartCount(scorch, 3) === 4 && Area.dartCount(scorch, 4) === 5);

context.Math.random = () => 0;
context.SSDNSTestRoll = () => 15;
const rays = Cast.rollCast({ spellName: "Scorching Ray", slotLevel: 3, attackBonus: 5, characterLevel: 5 });
check("ray.roll", rays.assign === "ray" && rays.shots && rays.shots.length === 4 && rays.shots.every((s) => s.amount === 2 && s.nat === 15), JSON.stringify(rays.shots));

const split = Area.assignBeams(rays.shots, [
  { id: "a", name: "Outlaw", ac: 18 },
  { id: "b", name: "Deputy", ac: 18 },
  { id: "a", name: "Outlaw", ac: 18 },
  { id: "b", name: "Deputy", ac: 30 }
]);
const outlaw = split.groups.filter((g) => g.id === "a")[0];
const deputy = split.groups.filter((g) => g.id === "b")[0];
check("ray.split", split.beams.length === 4 && outlaw && outlaw.total === 4 && deputy && deputy.total === 2, JSON.stringify(split.groups));
check("ray.miss", split.beams[3].hit === false && split.beams[0].hit === true && /Outlaw 4, Deputy 2/.test(split.totalLine), split.totalLine);

const crit = Area.assignBeams(
  [{ nat: 20, total: 12, amount: 8, dice: "4d6", label: "ray 1/1", push: 0 }],
  [{ id: "a", name: "Outlaw", ac: 30 }]
);
check("ray.crit", crit.beams[0].hit === true && crit.beams[0].crit === true && crit.groups[0].total === 8);
const nat1 = Area.assignBeams(
  [{ nat: 1, total: 6, amount: 0, dice: "", label: "ray 1/1" }],
  [{ id: "a", name: "Outlaw", ac: 10 }]
);
check("ray.nat1", nat1.beams[0].hit === false && nat1.groups[0].total === 0);

check("beam.levels", Area.beamCount(1) === 1 && Area.beamCount(4) === 1 && Area.beamCount(5) === 2 && Area.beamCount(10) === 2 && Area.beamCount(11) === 3 && Area.beamCount(16) === 3 && Area.beamCount(17) === 4 && Area.beamCount(20) === 4);
const eb = row("Eldritch Blast");
check("beam.data", eb && eb.scale === "beam" && eb.dice === "1d10" && eb.type === "force");
context.SSDNSTestRoll = () => 12;
const pact = Cast.rollCast({
  spellName: "Pact Shot", slotLevel: 0, attackBonus: 5, characterLevel: 11,
  agonizing: true, repelling: true, chaMod: 3
});
check("beam.count", pact.beamCount === 3 && pact.shots && pact.shots.length === 3, JSON.stringify({ n: pact.beamCount, shots: pact.shots && pact.shots.length }));
check("beam.ago", pact.shots.every((s) => s.amount === 4 && s.push === 10 && /Agonizing/.test(s.dice) && /push 10 ft/.test(pact.text)), pact.text);
const mods = Pact.blastMods({ invocations: ["Agonizing Blast", "Repelling Blast"], chaMod: 4 });
check("beam.mods", mods.agonizing === true && mods.repelling === true && mods.cha === 4, JSON.stringify(mods));
const plain = Pact.blastMods({ invocations: [], chaMod: 2 });
check("beam.noinv", plain.agonizing === false && plain.repelling === false);

const assigned = Area.assignBeams(pact.shots, [
  { id: "a", name: "Rattler", ac: 13 },
  { id: "b", name: "Bandit", ac: 13 },
  { id: "a", name: "Rattler", ac: 13 }
]);
check("beam.split", assigned.groups.length === 2 && assigned.groups[0].total === 8 && assigned.groups[1].total === 4 && assigned.groups[0].pushes === 20, JSON.stringify(assigned.groups));

const dust = row("Disintegrate");
check("dust.data", dust && dust.save === "DEX" && dust.dice === "10d6+40" && dust.up === "3d6" && dust.onSave === "none" && dust.zeroHp === "disintegrated" && !dust.note, JSON.stringify({ onSave: dust && dust.onSave, note: dust && dust.note }));
context.SSDNSTestRoll = null;
const fail = Cast.rollCast({ spellName: "Disintegrate", slotLevel: 6, dc: 17 });
const up = Cast.rollCast({ spellName: "Disintegrate", slotLevel: 7, dc: 17 });
check("dust.dice", fail.damageTotal === 50 && fail.onSave === "none" && fail.zeroHp === "disintegrated" && /none on a successful save/.test(fail.text) && !/no damage on a successful save/.test(fail.text), fail.text);
check("dust.up", up.damageTotal === 53, String(up.damageTotal));
check("dust.save", R.dealt(dust, fail.damageTotal, { failed: false }) === 0 && R.dealt(dust, fail.damageTotal, { failed: true }) === 50);
const state = R.zeroState(dust);
check("dust.state", state && state.status === "Disintegrated" && state.deathSaves === false && /dust/.test(state.log), JSON.stringify(state));

const sheet = read("assets/js/sheet-extras.js");
const v2 = read("dm/assets/js/v2.js");
const rules = read("assets/data/rules.js");
const focus = read("assets/js/focus-slot.js");
check("src.assign", sheet.includes("assignBeams") && sheet.includes('assign = "beam"') && sheet.includes('assign = "ray"') && v2.includes("applyAssignedBeams") && v2.includes('askSpellDarts(row, name, nBeams'));
check("src.dust", v2.includes("function noteDust") && v2.includes('onSave === "none"') && v2.includes("is dust. No death saves") && sheet.includes("Disintegrated. No death saves."));
check("src.iron", focus.includes("Borrowed Iron isn't in your hand") && v2.includes("borrowedIronAway"));
check("src.rules", !rules.includes("0.3.159") && !rules.includes("0.2.172") && !read("database.rules.json").includes("0.3.159"));
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.159" && version.sheetBuild === "sheet-playtest-v03159");
check("ver.dmcc", version.dmcc === "0.2.172" && version.dmccBuild === "dmcc-playtest-v02172");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");

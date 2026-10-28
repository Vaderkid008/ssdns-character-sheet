/**
 * N81 P0-1..3 — end-of-turn rider ticks, start-of-turn saves, Acid Arrow's delayed 2d4.
 *   node tools/test-n81-ticks.mjs
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

const context = { console, Math, Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };

function row(name) { return Cast.lookup(name); }
function ones() { return 1; }

const contagion = R.onHitSpell(R.emptyBag(null), { row: row("Contagion"), name: "Contagion", targetId: "t1", disease: "Flesh Rot" });
check("contagion.eot", contagion.bag.ticks.some((t) => t.when === "end" && t.save === "CON" && t.contagion && t.id));
const again = R.landResolved(contagion.bag, { row: row("Contagion"), name: "Contagion", targetId: "t1", hit: true, disease: "Flesh Rot" });
check("contagion.once", again.changed === false && again.bag.ticks.length === contagion.bag.ticks.length);

let sick = contagion.bag;
const due0 = R.phaseTicks(sick, ["t1", "other"], "end");
check("contagion.due", due0.due.length === 1 && due0.due[0].when === "end");
check("contagion.notstart", R.phaseTicks(sick, "t1", "start").due.length === 0);
const step1 = R.settleTick(sick, due0.due[0], { failed: true });
sick = step1.bag;
check("contagion.f1", /F 1\/3/.test(step1.logs.join(" ")) && sick.ticks.some((t) => t.contagion) && step1.chips.some((c) => /F●/.test(c.name)));
sick = R.settleTick(sick, R.phaseTicks(sick, "t1", "end").due[0], { failed: true }).bag;
const fail3 = R.settleTick(sick, R.phaseTicks(sick, "t1", "end").due[0], { failed: true });
check("contagion.f3", fail3.chips.some((c) => c.name === "Diseased: Flesh Rot (7 days)") && !fail3.bag.ticks.some((t) => t.contagion), fail3.logs.join(" | "));

let saved = contagion.bag;
for (let i = 0; i < 3; i++) saved = R.settleTick(saved, R.phaseTicks(saved, "t1", "end").due[0], { failed: false }).bag;
check("contagion.s3", !saved.marks.some((m) => m.kind === "contagion") && !saved.ticks.some((t) => t.contagion));

const pk = R.landResolved(R.emptyBag(null), { row: row("Phantasmal Killer"), name: "Phantasmal Killer", slot: 4, targetId: "t1", failed: true });
check("pk.arm", pk.changed === true && pk.bag.ticks.some((t) => t.when === "end" && t.save === "WIS" && t.dice === "4d10" && t.endOnSuccess && t.conc));
check("pk.nofail", R.landResolved(R.emptyBag(null), { row: row("Phantasmal Killer"), failed: false, hit: true }).changed === false);
const pkUp = R.landResolved(R.emptyBag(null), { row: row("Phantasmal Killer"), slot: 6, targetId: "t1", failed: true });
check("pk.up", pkUp.bag.ticks[0].dice === "4d10+1d10+1d10", pkUp.bag.ticks[0].dice);
const pkDue = R.phaseTicks(pk.bag, "t1", "end").due[0];
const pkFail = R.settleTick(pk.bag, pkDue, { failed: true, rng: ones });
check("pk.dmg", pkFail.amount === 4 && pkFail.bag.ticks.length === 1 && /FAIL/.test(pkFail.logs.join(" ")), String(pkFail.amount));
const pkSave = R.settleTick(pk.bag, pkDue, { failed: false });
check("pk.end", pkSave.ended === true && pkSave.bag.ticks.length === 0 && pkSave.bag.conc === "" && pkSave.removed.some((c) => c.name === "Frightened"));

const sear = R.landResolved(R.emptyBag(null), { row: row("Searing Smite"), name: "Searing Smite", slot: 1, targetId: "t1", hit: true, failed: false });
check("sear.arm", sear.changed === true && sear.bag.ticks.some((t) => t.when === "start" && t.save === "CON" && t.dice === "1d6" && !t.auto) && sear.chips.some((c) => c.name === "Burning"));
const searDue = R.phaseTicks(sear.bag, "t1", "start").due[0];
const searFail = R.settleTick(sear.bag, searDue, { failed: true, rng: ones });
check("sear.fail", searFail.amount === 1 && searFail.bag.ticks.length === 1, String(searFail.amount));
const searOk = R.settleTick(sear.bag, searDue, { failed: false });
check("sear.end", searOk.ended === true && searOk.bag.ticks.length === 0 && searOk.removed.some((c) => c.name === "Burning"));

const ensMiss = R.landResolved(R.emptyBag(null), { row: row("Ensnaring Strike"), slot: 1, targetId: "t1", hit: true, failed: false });
check("ens.nosave", ensMiss.changed === false && ensMiss.bag.ticks.length === 0);
const ens = R.landResolved(R.emptyBag(null), { row: row("Ensnaring Strike"), slot: 2, targetId: "t1", hit: true, failed: true });
check("ens.arm", ens.changed === true && ens.bag.ticks[0].when === "start" && ens.bag.ticks[0].auto === true && ens.bag.ticks[0].dice === "1d6+1d6", ens.bag.ticks[0] && ens.bag.ticks[0].dice);
const ensDue = R.phaseTicks(ens.bag, "t1", "start", ones).due[0];
check("ens.roll", ensDue.amount === 2 && ensDue.auto === true, String(ensDue.amount));
const ensKeep = R.settleTick(ens.bag, ensDue, { auto: true });
check("ens.keep", ensKeep.amount === 2 && ensKeep.bag.ticks.length === 1 && ensKeep.ended === false);

const blind = R.landResolved(R.emptyBag(null), { row: row("Blinding Smite"), slot: 3, targetId: "t1", hit: true, failed: true });
check("blind.arm", blind.bag.ticks.some((t) => t.when === "end" && t.save === "CON" && t.endOnSuccess));
check("blind.skip", R.landResolved(R.emptyBag(null), { row: row("Blinding Smite"), hit: true, failed: false }).bag.ticks.length === 0);
const blindEnd = R.settleTick(blind.bag, R.phaseTicks(blind.bag, "t1", "end").due[0], { failed: false });
check("blind.end", blindEnd.ended === true && blindEnd.removed.some((c) => c.name === "Blinded") && blindEnd.bag.ticks.length === 0);

const enf = R.onHitSpell(R.emptyBag(null), { row: row("Ray of Enfeeblement"), name: "Ray of Enfeeblement", targetId: "t1" });
const enfEnd = R.settleTick(enf.bag, R.phaseTicks(enf.bag, "t1", "end").due[0], { failed: false });
check("enf.end", enfEnd.ended === true && enfEnd.removed.some((c) => /Enfeebled/.test(c.name)) && enfEnd.bag.conc === "");

context.Math.random = () => 0;
const acidHit = R.landResolved(R.emptyBag(null), { row: row("Acid Arrow"), slot: 2, targetId: "t1", hit: true, crit: false });
check("acid.arm", acidHit.changed === true && acidHit.bag.ticks.length === 1 && acidHit.bag.ticks[0].when === "end" && acidHit.bag.ticks[0].auto === true && acidHit.bag.ticks[0].once === true && acidHit.bag.ticks[0].amount === 2, JSON.stringify(acidHit.bag.ticks[0]));
const acidMiss = R.landResolved(R.emptyBag(null), { row: row("Acid Arrow"), slot: 2, targetId: "t1", hit: false, miss: true });
check("acid.miss", acidMiss.changed === false && acidMiss.bag.ticks.length === 0);
const passed = R.landResolved(R.emptyBag(null), { row: row("Acid Arrow"), targetId: "t1", hit: true, rolledDelayed: { formula: "2d4", total: 5, faces: [2, 3] } });
check("acid.kept", passed.bag.ticks[0].amount === 5 && passed.bag.ticks[0].formula === "2d4");
const acidDue = R.phaseTicks(passed.bag, "t1", "end", () => 6).due[0];
check("acid.noreroll", acidDue.amount === 5, String(acidDue.amount));
const acidPay = R.settleTick(passed.bag, acidDue, { auto: true });
check("acid.once", acidPay.amount === 5 && acidPay.ended === true && acidPay.bag.ticks.length === 0);
check("acid.gone", R.phaseTicks(acidPay.bag, "t1", "end").due.length === 0);
const stacked = R.landResolved(acidHit.bag, { row: row("Acid Arrow"), targetId: "t1", hit: true, rolledDelayed: { formula: "2d4", total: 3, faces: [1, 2] } });
check("acid.stack", stacked.bag.ticks.length === 2);

const v2 = read("dm/assets/js/v2.js");
check("v2.end", v2.includes('riderPhase(ending, "end")') && v2.includes('riderPhase(phaseWho, "start")'));
check("v2.save", /function deliverRiderTick[\s\S]*requestPlayerSave\(/.test(v2));
check("v2.nottoast", !v2.includes('tick.save && !tick.auto")') && !/tick\.save && !tick\.auto\) \{\s*DM\.toast/.test(v2));
check("v2.land", v2.includes("commitRider(") && v2.includes("absorbRider("));
const sheet = read("assets/js/sheet-extras.js");
check("sheet.land", sheet.includes("landResolved(") && sheet.includes("endSpell:"));
check("join.fields", read("assets/js/dm-join.js").includes("entry.delayedDice") && read("assets/js/dm-join.js").includes('case "spell_end"'));

const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);
check("rules.nover", !read("assets/data/rules.js").includes("0.3.163") && !read("assets/data/rules.js").includes("spell-riders"));
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.163" && version.sheetBuild === "sheet-playtest-v03163");
check("ver.dmcc", version.dmcc === "0.2.176" && version.dmccBuild === "dmcc-playtest-v02176");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");

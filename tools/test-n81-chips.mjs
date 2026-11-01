/**
 * N81 P0-6 — missing FAIL / on-hit chips (sheet 0.3.168 / DMCC 0.2.181).
 *   node tools/test-n81-chips.mjs
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
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/conditions.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;
const Cond = context.SSDNSConditions;

function row(name) { return Cast.lookup(name); }
function names(list) { return (list || []).map((c) => c && c.name); }

const sunbeam = row("Sunbeam");
check("sunbeam.row", sunbeam && sunbeam.onFail === "Blinded" && sunbeam.until === "caster" && sunbeam.half === true && sunbeam.save === "CON");
check("sunbeam.fail", Area.onFail("Sunbeam") === "Blinded" && R.failList("Sunbeam").join(",") === "Blinded");
const beamRoll = Cast.rollCast({ spellName: "Sunbeam", slotLevel: 6, dc: 16 });
check("sunbeam.roll", beamRoll.condition === "Blinded" && /until your next turn/.test(beamRoll.text) && /fail: Blinded/.test(beamRoll.text), beamRoll.text);
let beam = R.landResolved(R.emptyBag(null), { row: sunbeam, name: "Sunbeam", targetId: "t1", casterId: "wiz", hit: true, failed: true });
check("sunbeam.chip", names(beam.chips).indexOf("Blinded") >= 0 && beam.bag.ticks.some((t) => t.when === "start" && t.targetId === "wiz" && t.victimId === "t1" && t.drop && t.drop.indexOf("Blinded") >= 0), JSON.stringify(beam.bag.ticks));
check("sunbeam.save", R.landResolved(R.emptyBag(null), { row: sunbeam, targetId: "t1", casterId: "wiz", hit: true, failed: false }).changed === false);
const beamDue = R.phaseTicks(beam.bag, "wiz", "start").due[0];
const beamEnd = R.settleTick(beam.bag, beamDue, { auto: true });
check("sunbeam.drop", beamEnd.ended === true && names(beamEnd.removed).indexOf("Blinded") >= 0 && beamEnd.removed[0].targetId === "t1" && beamEnd.bag.ticks.length === 0);

const burst = row("Sunburst");
check("burst.row", burst && burst.onFail === "Blinded" && burst.endSave === "CON" && burst.rounds === 10 && burst.half === true);
check("burst.fail", Area.onFail("Sunburst") === "Blinded");
const burstRoll = Cast.rollCast({ spellName: "Sunburst", slotLevel: 8, dc: 17 });
check("burst.roll", burstRoll.condition === "Blinded" && burstRoll.endSave === "CON" && /end of turn CON save/.test(burstRoll.text), burstRoll.text);
let blind = R.landResolved(R.emptyBag(null), { row: burst, name: "Sunburst", targetId: "t1", casterId: "wiz", hit: true, failed: true });
check("burst.tick", names(blind.chips).indexOf("Blinded") >= 0 && blind.chips[0].rounds === 10 && blind.bag.ticks.some((t) => t.when === "end" && t.save === "CON" && t.targetId === "t1" && t.endOnSuccess === true));
const burstDue = R.phaseTicks(blind.bag, "t1", "end").due[0];
const burstOk = R.settleTick(blind.bag, burstDue, { failed: false });
check("burst.save", burstOk.ended === true && names(burstOk.removed).indexOf("Blinded") >= 0 && /ends/.test(burstOk.logs.join(" ")), burstOk.logs.join(" | "));
const burstFail = R.settleTick(blind.bag, burstDue, { failed: true });
check("burst.keeps", burstFail.ended === false && names(burstFail.removed).indexOf("Blinded") < 0 && /continues/.test(burstFail.logs.join(" ")));

const wave = row("Thunderwave");
check("wave.row", wave && wave.onFail === "Pushed 10 ft" && wave.push === 10 && wave.half === true && wave.save === "CON");
check("wave.fail", Area.onFail("Thunderwave") === "Pushed 10 ft");
const waveRoll = Cast.rollCast({ spellName: "Thunderwave", slotLevel: 1, dc: 13 });
check("wave.roll", waveRoll.push === 10 && waveRoll.condition === "Pushed 10 ft" && /push 10 ft/.test(waveRoll.text), waveRoll.text);
const shoved = R.landResolved(R.emptyBag(null), { row: wave, name: "Thunderwave", targetId: "t1", casterId: "wiz", hit: true, failed: true });
check("wave.chip", names(shoved.chips).indexOf("Pushed 10 ft") < 0 && /pushed 10 ft/.test(shoved.logs.join(" ")) && shoved.changed === false, shoved.logs.join(" | ") + " chips " + names(shoved.chips).join(","));
check("wave.ok", R.landResolved(R.emptyBag(null), { row: wave, targetId: "t1", hit: true, failed: false }).changed === false);

const chill = row("Chill Touch");
check("chill.row", chill && chill.onHit === "No healing" && chill.until === "caster");
context.SSDNSTestRoll = () => 15;
const chillRoll = Cast.rollCast({ spellName: "Chill Touch", slotLevel: 0, attackBonus: 5, characterLevel: 1 });
check("chill.roll", chillRoll.kind === "attack" && chillRoll.condition === "No healing" && /No healing/.test(chillRoll.text), chillRoll.text);
context.SSDNSTestRoll = null;
const chilled = R.landResolved(R.emptyBag(null), { row: chill, name: "Chill Touch", targetId: "t1", casterId: "wiz", hit: true, failed: false });
check("chill.chip", names(chilled.chips).indexOf("No healing") >= 0 && chilled.bag.ticks.some((t) => t.when === "start" && t.targetId === "wiz" && t.drop && t.drop.indexOf("No healing") >= 0));
check("chill.miss", R.landResolved(R.emptyBag(null), { row: chill, targetId: "t1", casterId: "wiz", hit: false, miss: true }).changed === false);

const frost = row("Ray of Frost");
check("frost.row", frost && frost.onHit === "Speed −10" && frost.speed === -10 && frost.until === "caster");
const frozen = R.landResolved(R.emptyBag(null), { row: frost, name: "Ray of Frost", targetId: "orc", casterId: "wiz", hit: true, failed: false });
check("frost.chip", names(frozen.chips).indexOf("Speed −10") >= 0);
check("frost.speed", Cond.withSpeedChips(30, [{ name: "Speed −10" }]) === 20 && Cond.withSpeedChips(30, []) === 30 && Cond.withSpeedChips(8, [{ name: "Speed -10" }]) === 0);

const grasp = row("Shocking Grasp");
check("grasp.row", grasp && grasp.onHit === "No reactions" && grasp.until === "target");
const shocked = R.landResolved(R.emptyBag(null), { row: grasp, name: "Shocking Grasp", targetId: "t1", casterId: "wiz", hit: true, failed: false });
check("grasp.chip", shocked.chips[0] && shocked.chips[0].name === "No reactions" && shocked.chips[0].rounds === 1, JSON.stringify(shocked.chips));
check("grasp.metal", !grasp.metalAdv && !/metal armor/i.test(JSON.stringify({ onHit: grasp.onHit, until: grasp.until })));

const mock = row("Vicious Mockery");
check("mock.row", mock && mock.onFail === "Disadv next attack" && mock.until === "targetEnd" && mock.save === "WIS");
check("mock.fail", Area.onFail("Vicious Mockery") === "Disadv next attack");
const mocked = R.landResolved(R.emptyBag(null), { row: mock, name: "Vicious Mockery", targetId: "t1", casterId: "bard", hit: true, failed: true });
check("mock.chip", names(mocked.chips).indexOf("Disadv next attack") >= 0 && mocked.bag.ticks.some((t) => t.when === "end" && t.targetId === "t1" && t.hold === 1 && t.drop && t.drop.indexOf("Disadv next attack") >= 0));
check("mock.mode", Cond.attackMode([{ name: "Disadv next attack" }], "", "") === "dis" && Cond.riderMode([{ name: "Disadv next attack" }], []) === "dis");
check("mock.spend", Cond.strikeSpend([{ name: "Disadv next attack" }], []).attacker[0] === "Disadv next attack");
const mockDue = R.phaseTicks(mocked.bag, "t1", "end").due[0];
const mockHold = R.settleTick(mocked.bag, mockDue, { auto: true });
check("mock.hold", mockHold.ended === false && mockHold.bag.ticks[0].hold === 0 && /still up/.test(mockHold.logs.join(" ")));
const mockDrop = R.settleTick(mockHold.bag, R.phaseTicks(mockHold.bag, "t1", "end").due[0], { auto: true });
check("mock.end", mockDrop.ended === true && names(mockDrop.removed).indexOf("Disadv next attack") >= 0);

const bolt = row("Guiding Bolt");
check("bolt.row", bolt && bolt.onHit === "Guided" && bolt.until === "casterEnd" && bolt.consume === "target");
const guided = R.landResolved(R.emptyBag(null), { row: bolt, name: "Guiding Bolt", targetId: "t1", casterId: "wiz", hit: true, failed: false });
check("bolt.chip", names(guided.chips).indexOf("Guided") >= 0 && guided.bag.ticks.some((t) => t.when === "end" && t.targetId === "wiz" && t.victimId === "t1" && t.hold === 1));
check("bolt.mode", Cond.attackMode([], "", "", [{ name: "Guided" }]) === "adv" && Cond.attackMode([{ name: "Poisoned" }], "", "", [{ name: "Guided" }]) === "" && Cond.riderMode([], [{ name: "Guided" }]) === "adv");
check("bolt.spend", Cond.strikeSpend([], [{ name: "Guided" }]).target[0] === "Guided");
const boltDue = R.phaseTicks(guided.bag, "wiz", "end").due[0];
const boltHold = R.settleTick(guided.bag, boltDue, { auto: true });
const boltDrop = R.settleTick(boltHold.bag, R.phaseTicks(boltHold.bag, "wiz", "end").due[0], { auto: true });
check("bolt.end", boltDrop.ended === true && names(boltDrop.removed).indexOf("Guided") >= 0 && boltDrop.removed[0].targetId === "t1");

const brand = row("Branding Smite");
check("brand.row", brand && brand.clears && brand.clears.indexOf("Invisible") >= 0 && brand.light && brand.light.dim === 5 && brand.conc === true);
const branded = R.landResolved(R.emptyBag(null), { row: brand, name: "Branding Smite", targetId: "t1", casterId: "pal", hit: true, failed: false });
check("brand.clear", names(branded.removed).indexOf("Invisible") >= 0 && /clears Invisible/.test(branded.logs.join(" ")) && /dim 5 ft \(lighting waits\)/.test(branded.logs.join(" ")), branded.logs.join(" | "));
const armed = R.arm(R.emptyBag(null), { row: brand, name: "Branding Smite", armPending: true, slot: 2, casterId: "pal" });
const brandHit = R.attackRiders(armed.bag, { hit: true, weaponAttack: true, melee: false, targetId: "t9", casterId: "pal" }, () => 3);
check("brand.arm", names(brandHit.removed).indexOf("Invisible") >= 0 && /dim 5/.test(brandHit.logs.join(" ")) && brandHit.total === 9, brandHit.logs.join(" | ") + " total " + brandHit.total);

const heal = row("Heal");
check("heal.row", heal && heal.clears && heal.clears.join(",") === "Blinded,Deafened" && R.clearsOf("Heal").join(",") === "Blinded,Deafened");
const healRoll = Cast.rollCast({ spellName: "Heal", slotLevel: 6 });
check("heal.roll", healRoll.kind === "heal" && healRoll.clears && healRoll.clears.join(",") === "Blinded,Deafened" && /ends Blinded and Deafened/.test(healRoll.text), healRoll.text);

check("old.fail", Area.onFail("Hold Person") === "Paralyzed" && Area.onFail("Grease") === "Prone" && R.failList("Arms of Hadar").join(",") === "No reactions");
const prone = R.landResolved(R.emptyBag(null), { row: row("Thunderous Smite"), name: "Thunderous Smite", targetId: "t1", casterId: "pal", hit: true, failed: true });
check("old.smite", names(prone.chips).indexOf("Prone") >= 0 && prone.chips[0].conc === true && /pushed 10 ft/.test(prone.logs.join(" ")), JSON.stringify(prone.chips));

const rules = read("assets/data/rules.js");
check("rules.noregen", !rules.includes("Sunbeam") || rules.includes("spellCast") ? !rules.includes("0.3.169") && !rules.includes("spell-riders") : false);
check("rules.nover", !rules.includes("0.3.169") && !read("database.rules.json").includes("0.3.169"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.169" && version.sheetBuild === "sheet-playtest-v03169");
check("ver.dmcc", version.dmcc === "0.2.182" && version.dmccBuild === "dmcc-playtest-v02182");
const v2 = read("dm/assets/js/v2.js");
check("src.noheal", v2.includes('hasName(conditionsForRow(row), "No healing")') && read("assets/js/sheet-extras.js").includes("No healing"));
check("src.react", read("assets/js/react-prompt.js").includes("no reactions") && read("assets/js/turn-lock.js").includes("No reactions"));
check("src.clears", v2.includes("req.clears") && read("assets/js/dm-join.js").includes("entry.clears"));
check("src.nolight", !read("assets/js/lighting.js").includes("branding smite") && !read("assets/js/spell-zones.js").includes("Pushed 10"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");

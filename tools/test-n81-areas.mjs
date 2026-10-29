/**
 * N81 P0-4 — lasting PHB areas in the spell-zones BOOK (sheet 0.3.168 / DMCC 0.2.181).
 *   node tools/test-n81-areas.mjs
 * rules.js is not regenerated. Expiry and DM Clear ship in the P0-5 slice.
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

const context = { console, Math, Date, Promise };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-buffs.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const Z = context.SSDNSSpellZones;
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;
const fixed = function () { return 4; };

function at(x, y) {
  return { origin: { x: x, y: y }, facing: 0, area: null };
}
const mob = { x: 10, y: 10, size: 1, id: "mob", name: "Goblin" };
const ally = { x: 10, y: 10, size: 1, id: "ally", name: "Ada" };
const casterTok = { x: 10, y: 10, size: 1, id: "ada", name: "Ada" };

check("daggers.zone", Z.isZone("Cloud of Daggers") && Z.defersCast("Cloud of Daggers"));
const daggers = Z.buildZone("Cloud of Daggers", at(10, 10), { slot: 2, casterId: "ada", dc: 14 });
check("daggers.shape", daggers.shape === "cube" && daggers.side === 5 && daggers.conc && daggers.dur === "1 min");
const daggersUp = Z.buildZone("Cloud of Daggers", at(10, 10), { slot: 3, casterId: "ada" });
const dagStart = Z.phaseDue({ zones: [daggers] }, mob, "start", fixed);
const dagEnd = Z.phaseDue({ zones: [daggers] }, mob, "end", fixed);
const dagEnter = Z.moveDue([daggers], { x: 8, y: 10 }, { x: 10, y: 10 }, mob, fixed);
check("daggers.start", dagStart.length === 1 && dagStart[0].dice === "4d4" && dagStart[0].type === "slashing" && dagStart[0].auto && !dagStart[0].save && dagStart[0].amount === 16);
check("daggers.up", daggersUp.ticks.some((t) => t.dice === "6d4"));
check("daggers.noend", dagEnd.length === 0);
check("daggers.enter", dagEnter.length === 1 && dagEnter[0].when === "enter" && dagEnter[0].auto);

check("moon.zone", Z.isZone("Moonbeam") && Z.defersCast("Moonbeam"));
const moon = Z.buildZone("Moonbeam", at(10, 10), { slot: 2, casterId: "ada", dc: 15 });
const moonUp = Z.buildZone("Moonbeam", at(10, 10), { slot: 4, casterId: "ada", dc: 15 });
const moonStart = Z.phaseDue({ zones: [moon] }, mob, "start", fixed);
check("moon.shape", moon.shape === "cylinder" && moon.radius === 5 && moon.conc);
check("moon.start", moonStart.length === 1 && moonStart[0].save === "CON" && moonStart[0].half === true && moonStart[0].dice === "2d10" && moonStart[0].type === "radiant" && moonStart[0].shapechanger);
check("moon.up", moonUp.ticks.some((t) => t.dice === "4d10" && t.when === "start"));
check("moon.enter", Z.moveDue([moon], { x: 6, y: 10 }, { x: 10, y: 10 }, mob, fixed).some((t) => t.when === "enter" && t.save === "CON"));
check("moon.deferrow", Cast.lookup("Moonbeam").applyNow === false);

const spirits = Z.buildZone("Spirit Guardians", at(10, 10), { slot: 3, casterId: "ada", dc: 15, exemptIds: ["ally"], damageType: "necrotic" });
check("spirits.aura", spirits.follow && spirits.halfSpeed && spirits.radius === 15 && spirits.conc && Z.defersCast("Spirit Guardians"));
const spiritHit = Z.phaseDue({ zones: [spirits] }, mob, "start", fixed);
const spiritAlly = Z.phaseDue({ zones: [spirits] }, ally, "start", fixed);
const spiritSelf = Z.phaseDue({ zones: [spirits] }, casterTok, "start", fixed);
check("spirits.start", spiritHit.length === 1 && spiritHit[0].save === "WIS" && spiritHit[0].half && spiritHit[0].dice === "3d8" && spiritHit[0].type === "necrotic");
check("spirits.ally", spiritAlly.length === 0 && spiritSelf.length === 0);
check("spirits.speed", Z.terrainMult([spirits], mob) === 2 && Z.terrainMult([spirits], ally) === 1 && Z.terrainMult([spirits], casterTok) === 1);
check("spirits.dress", Z.dressArea("Spirit Guardians", Area.areaOf("Spirit Guardians"), 3).self === true);

const faith = Z.buildZone("Guardian of Faith", at(10, 10), { slot: 4, casterId: "ada", dc: 15 });
check("faith.meta", !faith.conc && faith.dur === "8 hours" && faith.budget === 60 && faith.spent === 0 && Z.defersCast("Guardian of Faith"));
check("faith.notend", Z.phaseDue({ zones: [faith] }, mob, "end", fixed).length === 0 && Z.phaseDue({ zones: [faith] }, mob, "start", fixed).length === 0);
const faithMove = Z.moveDue([faith], { x: 6, y: 10 }, { x: 10, y: 10 }, mob, fixed);
const faithFar = Z.moveDue([faith], { x: 0, y: 10 }, { x: 1, y: 10 }, mob, fixed);
check("faith.move", faithMove.length === 1 && faithMove[0].when === "approach" && faithMove[0].hostile && faithMove[0].save === "DEX" && faithMove[0].half && faithMove[0].dice === "20" && faithMove[0].reach === 10);
check("faith.far", faithFar.length === 0);
const seen = {};
check("faith.once", Z.once(seen, faithMove[0], "mob", "1:0") && !Z.once(seen, faithMove[0], "mob", "1:0") && Z.once(seen, faithMove[0], "mob", "1:1"));
let pool = [faith];
let step = Z.charge(pool, faith.id, 20);
pool = step.zones;
check("faith.budget", !step.ended && step.zones[0].spent === 20);
step = Z.charge(pool, faith.id, 20);
pool = step.zones;
step = Z.charge(pool, faith.id, 20);
check("faith.ends", step.ended && step.ended.spent === 60 && step.zones.length === 0);

const ice = Z.buildZone("Wall of Ice", at(10, 10), { slot: 6, casterId: "ada" });
check("ice.through", Z.moveDue([ice], { x: 10, y: 8 }, { x: 10, y: 12 }, { size: 1, id: "m" }, fixed).some((t) => t.when === "through" && t.save === "CON" && t.dice === "5d6" && t.type === "cold"));

const bolt = Z.buildZone("Call Lightning", at(4, 4), { slot: 3, casterId: "ada", dc: 15 });
check("bolt.stays", Z.isZone("Call Lightning") && bolt.conc && !Z.defersCast("Call Lightning") && bolt.ticks.length === 0 && bolt.radius === 5);
check("bolt.row", Cast.lookup("Call Lightning").applyNow !== false);

const sphere = Z.buildZone("Flaming Sphere", at(10, 10), { slot: 2, casterId: "ada", dc: 13 });
const sphereEnd = Z.phaseDue({ zones: [sphere] }, mob, "end", fixed);
check("sphere.end", Z.defersCast("Flaming Sphere") && sphereEnd.length === 1 && sphereEnd[0].save === "DEX" && sphereEnd[0].half && sphereEnd[0].dice === "2d6" && sphereEnd[0].near === 5);

const kill = Z.buildZone("Cloudkill", at(10, 10), { slot: 5, casterId: "ada", dc: 16 });
const bugs = Z.buildZone("Insect Plague", at(10, 10), { slot: 5, casterId: "ada", dc: 16 });
const fireCloud = Z.buildZone("Incendiary Cloud", at(10, 10), { slot: 8, casterId: "ada", dc: 17 });
check("kill.tick", kill.heavilyObscured && Z.phaseDue({ zones: [kill] }, mob, "start", fixed).some((t) => t.save === "CON" && t.dice === "5d8" && t.type === "poison"));
check("bugs.tick", bugs.difficult && bugs.lightlyObscured && Z.terrainMult([bugs], mob) === 2 && Z.phaseDue({ zones: [bugs] }, mob, "start", fixed).some((t) => t.dice === "4d10"));
check("firecloud.tick", fireCloud.heavilyObscured && Z.phaseDue({ zones: [fireCloud] }, mob, "start", fixed).some((t) => t.save === "DEX" && t.dice === "10d8" && t.half));

const bead = Z.buildZone("Delayed Blast Fireball", at(8, 8), { slot: 7, casterId: "ada", dc: 16 });
check("bead.meta", Z.defersCast("Delayed Blast Fireball") && bead.conc && bead.radius === 5 && bead.blast.radius === 20 && bead.blast.dice === "12d6" && bead.blast.save === "DEX" && bead.blast.half);
const grew = Z.growList([bead], "ada", "1:0");
check("bead.grow", grew.changed && grew.zones[0].blast.dice === "13d6" && !Z.growList(grew.zones, "ada", "1:0").changed);
const again = Z.place({ zones: [bead], conc: "Delayed Blast Fireball" }, Z.buildZone("Delayed Blast Fireball", at(3, 3), { slot: 7, casterId: "ada", dc: 16 }));
check("bead.replace", again.replaced.length === 1 && again.replaced[0].blast && again.bag.zones.length === 1);

const weapon = Z.buildZone("Spiritual Weapon", at(5, 5), { slot: 2, casterId: "ada" });
check("weapon.token", Z.isZone("Spiritual Weapon") && !weapon.conc && weapon.dur === "1 min" && weapon.ticks.length === 0 && weapon.radius === 5);

const sheet = read("assets/js/sheet-extras.js");
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const rules = read("assets/data/rules.js");
check("wire.sheet", sheet.includes("detonateBeads") && sheet.includes("needsAllies") && sheet.includes("_allies"));
check("wire.dm", v2.includes("deliverZoneTick") && v2.includes("growBeads") && v2.includes("chargeZone") && v2.includes("zoneListNow") && v2.includes("requestPlayerSave"));
check("wire.map", map.includes("liveSpellZones") && map.includes("terrainCost") && map.includes("sweepFollow"));
check("wire.ice", map.includes("paintSpellZones") && v2.includes("zonePhase"));
check("clear.hook", v2.includes("expireSpellZones") && map.includes("clearAllZonesBtn") && map.includes("clearSpellGrid"));
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.168" && ver.dmcc === "0.2.181" && ver.sheetBuild === "sheet-playtest-v03168" && ver.dmccBuild === "dmcc-playtest-v02181");
check("rules.clean", !rules.includes("0.3.168") && !rules.includes("spell-zones") && !read("database.rules.json").includes("0.3.168"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn81 areas ok");

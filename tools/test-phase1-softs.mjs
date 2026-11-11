/**
 * Phase 1 softs (sheet 0.3.219 / DMCC 0.2.232).
 * Witch Bolt damage writes HP, Circle of Death covers the 60-ft sphere,
 * Blade Barrier uses the aim as the long axis, Disintegrate drops the token
 * without the fight row, Fire Shield can be dismissed, and an extra token
 * does not replace the PC.
 * rules.js is not edited.
 *   node tools/test-phase1-softs.mjs
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
check("ver.sheet", version.sheet === "0.3.289" && version.sheetBuild === "sheet-playtest-v03289");
check("ver.dmcc", version.dmcc === "0.2.302" && version.dmccBuild === "dmcc-playtest-v02302");
const rulesDiff = execSync("git diff --name-only HEAD -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const map = read("map/ssdns-map.js");
const dm = read("dm/assets/js/v2.js");
const sheet = read("assets/js/sheet-extras.js");
check("bolt.seed", read("assets/js/apply-guard.js").includes("function seedCombatHp") && dm.includes("seedCombatHp") && dm.includes("mirrorTokenHp"));
check("death.paint", map.includes('type === \'spell\'') && map.includes("geo.T"));
check("dust.keep", map.includes("function dropTokenKeepRow") && map.includes("silent: true, keepOwner: true") && dm.includes("dropTokenKeepRow") && dm.includes("delete row.mapTokenId"));
check("dust.nocombatant", !/dropTokenKeepRow[\s\S]{0,400}combatant:remove/.test(map.slice(map.indexOf("function dropTokenKeepRow"), map.indexOf("function dropTokenKeepRow") + 500)));
check("shield.end", sheet.includes("End Fire Shield") && dm.includes("data-dismiss-shield") && dm.includes('payload: { spell: "Fire Shield" }'));
check("light.stack", map.includes("destination-over") && map.includes("function paintOneVeil"));
check("extra.control", map.includes("Their character token stays") && map.includes("keepSpellControl") && map.includes('ownerUid: ""'));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("assets/js/apply-guard.js"), context);
const Area = context.SSDNSSpellArea;
const Cast = context.SSDNSSpellCast;
const R = context.SSDNSSpellRiders;
const Applied = context.SSDNSApplied;

const bolt = Cast.rollCast({ spellName: "Witch Bolt", slotLevel: 1, attackBonus: 5, characterLevel: 5 });
check("witch.roll", bolt.damageTotal > 0 && /1d12/.test(bolt.text), bolt.text);
const seeded = Applied.seedCombatHp({ hp: "", maxHp: 40 }, 30);
const afterHit = seeded && Applied.applyHpDelta(seeded.hp, -bolt.damageTotal, 40);
check("witch.hp", !!(seeded && seeded.seeded && seeded.hp === 30 && afterHit === 30 - bolt.damageTotal), JSON.stringify({ seeded, afterHit }));
const fromMax = Applied.seedCombatHp({ hp: null, maxHp: 22 }, null);
check("witch.max", !!(fromMax && fromMax.hp === 22 && Applied.applyHpDelta(fromMax.hp, -5, 22) === 17));
check("witch.none", Applied.seedCombatHp({ hp: "", maxHp: "" }, null) == null);
const sustain = Cast.rollCast({ spellName: "Witch Bolt", slotLevel: 1, sustainAuto: true });
check("witch.sustain", sustain.autoDamage === true && sustain.damageTotal > 0 && /1d12/.test(sustain.text), sustain.text);

const death = Area.areaOf("Circle of Death");
check("death.area", !!(death && death.shape === "sphere" && death.radius === 60), JSON.stringify(death && { shape: death.shape, radius: death.radius }));
const near = { x: 8, y: 0, size: 1 };
const far = { x: 14, y: 0, size: 1 };
check("death.near", Area.hits(death, { x: 0, y: 0 }, 0, near));
check("death.far", !Area.hits(death, { x: 0, y: 0 }, 0, far));

const wall = Area.areaOf("Blade Barrier");
check("wall.area", !!(wall && wall.shape === "wall" && wall.length === 100), JSON.stringify(wall && { shape: wall.shape, length: wall.length, width: wall.width }));
const along = { x: 8, y: 0, size: 1 };
const across = { x: 0, y: 8, size: 1 };
check("wall.aim", Area.hits(wall, { x: 0, y: 0 }, 0, along));
check("wall.side", !Area.hits(wall, { x: 0, y: 0 }, 0, across));
const north = Math.PI / 2;
check("wall.north", Area.hits(wall, { x: 0, y: 0 }, north, across) && !Area.hits(wall, { x: 0, y: 0 }, north, along));

const armed = R.arm(null, { name: "Fire Shield", row: R.patchRow({ name: "Fire Shield" }) || { name: "Fire Shield" }, mode: "warm", casterId: "pc" });
const mark = (armed.bag.marks || []).filter((m) => m && m.kind === "shield")[0];
check("shield.arm", !!(mark && mark.conc === false && mark.light && mark.light.bright === 10), JSON.stringify(mark));
check("shield.notconc", R.concentrates("Fire Shield", { name: "Fire Shield", conc: false }) === false);
const dropped = R.dropSpell(armed.bag, "Fire Shield");
check("shield.drop", (dropped.bag.marks || []).every((m) => !m || m.kind !== "shield") && dropped.removed.length > 0);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("phase1 softs ok");

/**
 * Phase 1 remaining spells (sheet 0.3.310 / DMCC 0.2.323).
 * Witch Bolt ticks the creature it hit, Fire Shield dismiss clears the glow,
 * Ice Storm keeps the hailstorm look, Phantasmal Killer asks even with a
 * frontier name, smite riders survive a hidden-AC gun, Chain Lightning hops
 * carry squares, and overlapping lights punch their bright discs clear.
 * rules.js is not edited.
 *   node tools/test-phase1-remain.mjs
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
check("ver.sheet", version.sheet === "0.3.310" && version.sheetBuild === "sheet-playtest-v03310");
check("ver.dmcc", version.dmcc === "0.2.323" && version.dmccBuild === "dmcc-playtest-v02323");
const rulesDiff = execSync("git diff --name-only HEAD -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sheet = read("assets/js/sheet-extras.js");
const dm = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const fx = read("map/ssdns-map-fx.js");
const light = read("assets/js/lighting.js");
check("bolt.lock", sheet.includes("noteSustain") && sheet.includes("item.targetId") && dm.includes("data-sustain-target"));
check("bolt.miss", sheet.includes("missedBolt") && dm.includes("bareSpellName(row.concentration) === \"witch bolt\""));
const endBody = sheet.slice(sheet.indexOf("function endSpell"), sheet.indexOf("function breakLocalConc"));
check("shield.paint", endBody.includes("paintFollowups()"));
check("shield.dismiss", light.includes("dismissSpell(key)") && map.includes("t.ownerUid !== uid") && dm.includes("stripSpellLight"));
check("shield.quiet", dm.includes('dropOwnedConditions("Fire Shield", { quiet: true })'));
check("ice.idle", fx.includes("function hailstormIdle") && map.includes("FXA.hailIdle") && map.includes('zone.key === "ice storm"'));
check("pk.bare", dm.includes("function bareSpellName") && dm.includes("freshKiller") && dm.includes("bareSpellName(name) === \"phantasmal killer\""));
check("smite.gun", read("assets/js/spell-riders.js").includes("gunOk: !!row.gunOk"));
check("smite.hidden", sheet.includes("riderSave: pendRide") && read("assets/js/dm-join.js").includes("entry.riderSave") && dm.includes("function askSmiteSave"));
check("chain.stamp", sheet.includes("function stampHopPoints") && dm.includes("function stampFxPoints"));
check("light.punch", map.includes("destination-out") && map.includes("brightPx"));
check("wall.aim", map.includes("aiming.hover") && map.includes("aiming.facing"));
check("zone.tick", map.includes('event === \'zone-tick\'') && map.includes("function applyZoneTickFeed"));
check("zone.merge", map.includes("sender") && map.includes("kept.concat(incoming)"));
check("bar.blank", map.includes('info.dmCur !== ""'));
check("patch.ref", map.includes("const t = tokenByRef(id);"));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, performance: { now: function () { return 0; } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const R = context.SSDNSSpellRiders;
const Z = context.SSDNSSpellZones;
const FX = context.SSDNSMapFx;
const Cast = context.SSDNSSpellCast;

const bolt = Cast.rollCast({ spellName: "Witch Bolt (Wire Lash)", slotLevel: 1, attackBonus: 5 });
check("witch.roll", bolt.damageTotal > 0 && bolt.attack === true, bolt.text);
const noted = R.noteSustain(null, { name: "Witch Bolt", slot: 1, targetId: "gob", targetName: "Gob" });
const ready = R.sustainReady(noted);
check("witch.tick", ready.length === 1 && ready[0].targetId === "gob" && ready[0].spec && ready[0].spec.auto, JSON.stringify(ready[0]));
const kept = R.noteSustain(noted, { name: "Witch Bolt", slot: 1 });
check("witch.keep", R.sustainReady(kept)[0].targetId === "gob");

const ban = R.arm(null, { name: "Banishing Smite", row: R.patchRow(Cast.lookup("Banishing Smite")), slot: 5, armPending: true });
const banMark = (ban.bag.marks || []).filter((m) => m && m.kind === "smite")[0];
check("ban.mark", !!(banMark && banMark.gunOk && banMark.banishAt === 50), JSON.stringify(banMark && { gunOk: banMark.gunOk, banishAt: banMark.banishAt }));
const banHit = R.attackRiders(ban.bag, { hit: true, weaponAttack: true, melee: false, gun: true, targetId: "t1", attack: true });
check("ban.gun", banHit.total > 0 && banHit.banishAt === 50, JSON.stringify({ total: banHit.total, banishAt: banHit.banishAt }));

const stag = R.arm(null, { name: "Staggering Smite", row: R.patchRow(Cast.lookup("Staggering Smite")), slot: 4, armPending: true });
const stagHit = R.attackRiders(stag.bag, { hit: true, weaponAttack: true, melee: true, gun: false, targetId: "t2", attack: true });
check("stag.melee", stagHit.total > 0 && stagHit.hitSave && stagHit.hitSave.ability === "WIS" && stagHit.hitSave.onFail === "Staggered", JSON.stringify(stagHit.hitSave));
const stagGun = R.attackRiders(stag.bag, { hit: true, weaponAttack: true, melee: false, gun: true, targetId: "t2", attack: true });
check("stag.notgun", !(stagGun.hitSave) && (stagGun.bag.marks || []).some((m) => m && m.pending), JSON.stringify(stagGun.hitSave));

check("ice.look", FX.lookOf({ type: "spell", spell: "Ice Storm (Hailstorm)", dmg: "bludgeoning and cold" }) === "hailstorm");
check("ice.notcold", FX.lookOf({ type: "spell", spell: "Ice Storm", dmg: "cold" }) === "hailstorm");
check("death.look", FX.lookOf({ type: "spell", spell: "Circle of Death (Ghost Town)", dmg: "necrotic" }) === "deathring");
check("chain.look", FX.lookOf({ type: "spell", spell: "Chain Lightning (Telegraph Line)", dmg: "lightning" }) === "chain-lightning");
const hopped = FX.request({ type: "spell", spell: "Chain Lightning", result: "hit", hops: [{ id: "a", x: 3, y: 4 }, { id: "b" }] });
check("chain.hops", hopped && hopped.hops && hopped.hops[0].x === 3 && hopped.hops[0].y === 4 && hopped.hops[1].id === "b", JSON.stringify(hopped && hopped.hops));

const placed = { origin: { x: 4, y: 4 }, facing: Math.PI / 2, area: { shape: "sphere", radius: 20 } };
const zone = Z.buildZone("Insect Plague (Locust Swarm)", placed, { slot: 5, casterId: "wiz", dc: 15 });
check("bug.zone", !!(zone && zone.rounds === 100 && zone.ticks && zone.ticks.length === 2 && zone.dc === 15), JSON.stringify(zone && { rounds: zone.rounds, n: zone.ticks.length, dc: zone.dc }));
const due = Z.phaseDue({ zones: [zone] }, { x: 4, y: 4, size: 1, id: "ant" }, "start");
check("bug.tick", due.length === 1 && due[0].save === "CON" && due[0].dice === "4d10" && due[0].dc === 15, JSON.stringify(due[0] && { save: due[0].save, dice: due[0].dice, dc: due[0].dc }));
const later = Z.tickRounds([zone], 10);
check("bug.lives", later.zones.length === 1 && later.zones[0].roundsLeft === 90, JSON.stringify(later.zones[0] && later.zones[0].roundsLeft));

const wall = Z.buildZone("Blade Barrier", { origin: { x: 0, y: 0 }, facing: Math.PI / 2, area: { shape: "wall", length: 100, width: 5 } }, { slot: 6, dc: 16 });
check("blade.face", !!(wall && Math.abs(wall.facing - Math.PI / 2) < 0.001 && wall.length === 100));
const Area = context.SSDNSSpellArea;
check("blade.axis", Area.hits({ shape: "wall", length: 100, width: 5 }, { x: 0, y: 0 }, wall.facing, { x: 0, y: 8, size: 1 }) && !Area.hits({ shape: "wall", length: 100, width: 5 }, { x: 0, y: 0 }, wall.facing, { x: 8, y: 0, size: 1 }));

const death = FX.sanitize({ type: "spell", spell: "Circle of Death", result: "hit", radius: 60, at: { x: 2, y: 2 } });
check("death.radius", death && death.radius === 60 && death.spell === "Circle of Death", JSON.stringify(death && { radius: death.radius, spell: death.spell }));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("phase1 remain ok");

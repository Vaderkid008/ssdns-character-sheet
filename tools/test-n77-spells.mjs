/**
 * N77 — every spell can roll damage, and area text becomes a shape.
 *   node tools/test-n77-spells.mjs
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

const context = { console: console, Math: Math, Date: Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
const A = context.SSDNSSpellArea;

function shape(name) {
  const area = A.areaOf(name);
  return area && area.shape;
}

check("fireball.sphere", shape("Fireball") === "sphere" && A.areaOf("Fireball").radius === 20);
check("fireball.shell", shape("Fireball Shell") === "sphere" && A.areaOf("Fireball Shell").radius === 20);
check("fireball.alias", shape("Fireball (Brand)") === "sphere" && A.areaOf("Fireball (Brand)").radius === 20);
check("bolt.noarea", A.areaOf("Fire Bolt") == null);
check("shatter.sphere", shape("Shatter") === "sphere" && A.areaOf("Shatter").radius === 10);
check("burning.cone", shape("Burning Hands") === "cone" && A.areaOf("Burning Hands").self && A.areaOf("Burning Hands").length === 15);
check("cold.cone", shape("Cone of Cold") === "cone" && A.areaOf("Cone of Cold").length === 60);
check("thunder.cube", shape("Thunderwave") === "cube" && A.areaOf("Thunderwave").self && A.areaOf("Thunderwave").side === 15);
check("bolt.line", shape("Lightning Bolt") === "line" && A.areaOf("Lightning Bolt").length === 100 && A.areaOf("Lightning Bolt").width === 5);
check("gust.width", shape("Gust of Wind") === "line" && A.areaOf("Gust of Wind").width === 10);
check("moon.cylinder", shape("Moonbeam") === "cylinder" && A.areaOf("Moonbeam").radius === 5);
check("entangle.square", shape("Entangle") === "square" && A.areaOf("Entangle").side === 20);
check("wall", shape("Wind Wall") === "wall" && A.areaOf("Wind Wall").length === 50);
check("acid.skip", A.areaOf("Acid Splash") == null);
check("meteor.count", A.areaOf("Meteor Swarm") && A.areaOf("Meteor Swarm").count === 4 && A.areaOf("Meteor Swarm").radius === 40);
check("shapes", A.shapes.join(",") === "sphere,cylinder,cone,cube,square,line,wall");

const origin = { x: 0, y: 0 };
const inside = { x: 1, y: 0, size: 1 };
const outside = { x: 8, y: 0, size: 1 };
const sphere = { shape: "sphere", radius: 20 };
check("sphere.hit", A.hits(sphere, origin, 0, inside));
check("sphere.miss", !A.hits(sphere, origin, 0, outside));

const cone = { shape: "cone", length: 15 };
check("cone.front", A.hits(cone, origin, 0, { x: 1, y: 0, size: 1 }));
check("cone.behind", !A.hits(cone, origin, 0, { x: -3, y: 0, size: 1 }));
check("cone.side", !A.hits(cone, origin, 0, { x: 0, y: 3, size: 1 }));

const cube = { shape: "cube", side: 15, self: false };
check("cube.center", A.hits(cube, origin, 0, { x: 0, y: 0, size: 1 }));
check("cube.far", !A.hits(cube, origin, 0, { x: 4, y: 0, size: 1 }));

const selfCube = { shape: "cube", side: 15, self: true };
check("cube.self.front", A.hits(selfCube, { x: 0, y: 0, casterSize: 1 }, 0, { x: 1, y: 0, size: 1 }));
check("cube.self.back", !A.hits(selfCube, { x: 0, y: 0, casterSize: 1 }, 0, { x: -2, y: 0, size: 1 }));

const line = { shape: "line", length: 100, width: 5 };
check("line.along", A.hits(line, origin, 0, { x: 4, y: 0, size: 1 }));
check("line.off", !A.hits(line, origin, 0, { x: 4, y: 3, size: 1 }));

const wall = { shape: "wall", length: 50, width: 5 };
check("wall.center", A.hits(wall, origin, 0, { x: 0, y: 0, size: 1 }));

check("save.half", A.savedAmount(28, true, { failed: false, blocked: false }) === 14);
check("save.fail", A.savedAmount(28, true, { failed: true }) === 28);
check("save.none", A.savedAmount(28, false, { failed: false }) === 0);
check("save.cover", A.savedAmount(28, true, { blocked: true, failed: false }) === 0);

context.SSDNS_RULES = {
  spellCast: [
    { name: "Fireball", level: 3, kind: "save", save: "DEX", dice: "8d6", type: "fire", half: true, up: "1d6" },
    { name: "Fire Bolt", level: 0, kind: "attack", dice: "1d10", type: "fire", scale: "cantrip" },
    { name: "Cure Wounds", level: 1, kind: "heal", dice: "1d8", healMod: true, up: "1d8" },
    { name: "Sacred Flame", level: 0, kind: "save", save: "DEX", dice: "1d8", type: "radiant", scale: "cantrip" },
    { name: "Shield", level: 1, kind: "none" }
  ]
};
vm.runInContext(read("assets/js/spell-cast.js"), context);
const Cast = context.SSDNSSpellCast;
const fireball = Cast.rollCast({ spellName: "Fireball", slotLevel: 3, dc: 15 });
check("pack.fireball", fireball.kind === "save" && fireball.half === true && fireball.save === "DEX" && fireball.damageTotal >= 8 && fireball.damageTotal <= 48, JSON.stringify({ kind: fireball.kind, total: fireball.damageTotal, half: fireball.half }));
const up = Cast.rollCast({ spellName: "Fireball", slotLevel: 5, dc: 15 });
check("pack.upcast", up.damageTotal >= 10 && up.damageTotal <= 60, String(up.damageTotal));
const bolt = Cast.rollCast({ spellName: "Fire Bolt", slotLevel: 0, characterLevel: 5, attackBonus: 7, mode: "" });
check("pack.bolt", bolt.attack === true && bolt.kind === "attack" && bolt.damageTotal != null, JSON.stringify({ attack: bolt.attack, total: bolt.damageTotal, nat: bolt.nat }));
const heal = Cast.rollCast({ spellName: "Cure Wounds", slotLevel: 1, spellMod: 4 });
check("pack.heal", heal.kind === "heal" && heal.heal === true && heal.damageTotal >= 5, String(heal.damageTotal));
const flame = Cast.rollCast({ spellName: "Sacred Flame", slotLevel: 0, characterLevel: 1, dc: 13 });
check("pack.flame", flame.kind === "save" && flame.half === false && flame.damageTotal >= 1, String(flame.damageTotal));
const shield = Cast.rollCast({ spellName: "Shield", slotLevel: 1 });
check("pack.shield", shield.kind === "none" && shield.damageTotal === 0 && shield.attack === false);

const sheet = read("assets/js/sheet-extras.js");
const castClick = sheet.slice(sheet.indexOf('e.target.closest("[data-cast]")'));
check("click.selected", castClick.indexOf("selectedCast(gi)") >= 0 && castClick.indexOf("selectedCast(gi)") < castClick.indexOf("openCastPrompt"));
check("click.gun", castClick.indexOf("castThroughGun(gi)") >= 0 && castClick.indexOf("castThroughGun(gi)") < castClick.indexOf("openCastPrompt"));
check("dmg.total", sheet.indexOf("rolled.damageTotal") >= 0 && sheet.indexOf('split("→ HIT")') < 0);
check("post.save", sheet.indexOf("hitRow.save") >= 0 || sheet.indexOf("save: row.save") >= 0);
check("rules.untouched", !/spell-area/.test(read("assets/data/rules.js")));

const nowFn = sheet.slice(sheet.indexOf("function castSpellAttackNow"), sheet.indexOf("function selectedCast"));
check("handoff.placeThenSpend", nowFn.indexOf("placeBlast") >= 0 && nowFn.indexOf("spendForCast") > nowFn.indexOf("placeBlast"));
check("handoff.gateStays", nowFn.indexOf("castSpellAttackNow._reactGo = true") >= 0 && nowFn.indexOf("finally { castSpellAttackNow._reactGo = false") < 0);
const gunNow = sheet.slice(sheet.indexOf("function castThroughGunNow"), sheet.indexOf("function castLoadedHex"));
check("handoff.gunDefers", gunNow.indexOf("spendHexChamber") < 0 && gunNow.indexOf("castSpellAttack") >= 0);
const pickedNow = sheet.slice(sheet.indexOf("function castPickedNow"), sheet.indexOf("function openCastPrompt"));
check("handoff.tabDefers", pickedNow.indexOf("spendHexChamber") < 0 && pickedNow.indexOf("castSpellAttack") >= 0);
const appJs = read("assets/js/app.js");
check("panel.gunScope", appJs.indexOf('$$("#guns select[data-gun]")') >= 0 && appJs.indexOf('$$("[data-gun]")') < 0);
const ask = read("assets/js/dm-join.js");
const askFn = ask.slice(ask.indexOf("askSpell = function"), ask.indexOf("function watchEs"));
check("handoff.passContinues", askFn.indexOf('choice === "go" || choice === "pass"') >= 0 && askFn.indexOf('choice === "cancel"') >= 0);

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.167");
check("ver.dmcc", version.dmcc === "0.2.180");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");

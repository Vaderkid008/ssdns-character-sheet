/**
 * N81 P0-7 through P0-12, plus Fireball burn-scar and Grease / Ice Storm grids.
 *   node tools/test-n81-closeout.mjs
 * rules.js is not regenerated. No Lighting v2.
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
context.SSDNS_RULES = { spellCast: book, wildSpark: [
  { text: "fizzle" }, { text: "backfire" }, { text: "wild" }, { text: "spark" }, { text: "flare" }, { text: "boom" }
] };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const Z = context.SSDNSSpellZones;
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;

function row(name) { return Cast.lookup(name); }

check("chain.plan", R.pickPlan("Chain Lightning", 6).count === 4 && R.pickPlan("Chain Lightning", 8).count === 6);
check("acid.plan", R.pickPlan("Acid Splash", 0).count === 2 && R.pickPlan("Acid Splash", 0).within === 5);
check("mhw.plan", R.pickPlan("Mass Healing Word", 3).count === 6 && R.pickPlan("Mass Healing Word", 3).each === "heal" && !R.pickPlan("Mass Healing Word", 3).inArea);
check("mcw.plan", R.pickPlan("Mass Cure Wounds", 5).inArea === true && R.pickPlan("Mass Cure Wounds", 5).count === 6);
check("wave.plan", R.pickPlan("Destructive Wave", 5).mode === "choose");
const kept = R.keepChosen(
  [{ id: "a", name: "A" }, { id: "b", combatantId: "c", name: "B" }, { id: "d", name: "D" }],
  [{ id: "a" }, { id: "c" }]
);
check("keep.chosen", kept.length === 2 && kept[0].id === "a" && kept[1].combatantId === "c");

check("meteor.count", Area.areaOf("Meteor Swarm").count === 4 && Area.areaOf("Meteor Swarm").radius === 40);
check("storm.count", Area.areaOf("Fire Storm").count === 10 && Area.areaOf("Fire Storm").side === 10);
const once = Area.tokensIn(
  [{ id: "gob", x: 0, y: 0, size: 1 }],
  { shape: "sphere", radius: 40 },
  [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  0,
  ""
);
check("meteor.once", once.length === 1 && once[0].id === "gob");

const harmLow = R.harmAdjust(8, 40, 20, true);
check("harm.floor", harmLow.hp === 1 && harmLow.max === 20 && harmLow.died === false, JSON.stringify(harmLow));
const harmDie = R.harmAdjust(30, 30, 40, true);
check("harm.die", harmDie.died === true && harmDie.hp === 0 && harmDie.max === 0);
const harmSave = R.harmAdjust(20, 40, 10, false);
check("harm.save", harmSave.hp === 10 && harmSave.max === 40);

const faces = [];
function seqRng() {
  const rolls = [1, 6, 8, 2, 3, 7];
  return function () { faces.push(1); return rolls[faces.length - 1] || 1; };
}
const red = R.prismaticRay(function () { return 1; });
check("prism.red", red.n === 1 && red.type === "fire" && red.dice === "10d6");
const indigo = R.prismaticRay(function () { return 6; });
check("prism.indigo", indigo.n === 6 && indigo.condition === "Restrained" && indigo.tracker === "petrified");
const violet = R.prismaticRay(function () { return 7; });
check("prism.violet", violet.condition === "Blinded");
const two = R.prismaticRay(function () { return faces.push(1) <= 1 ? 8 : 4; });
check("prism.two", two.n === 8 && R.prismaticLeaves(two).length === 2);
const colored = R.prismaticHit(red, { failed: true }, function () { return 3; });
check("prism.dmg", colored.parts[0].amount === 30 && colored.parts[0].type === "fire");
const saved = R.prismaticHit(red, { failed: false }, function () { return 3; });
check("prism.half", saved.parts[0].amount === 15);
const armed = R.armPrismatic(null, { failed: true, targetId: "mob", part: { condition: "Restrained", tracker: "petrified" } });
check("prism.arm", armed.changed && armed.bag.ticks.some((t) => t.prismatic && t.save === "CON") && armed.chips.some((c) => c.name === "Restrained"));
const settled = R.settleTick(armed.bag, armed.bag.ticks[0], { failed: true });
const settled2 = R.settleTick(settled.bag, settled.bag.ticks[0], { failed: true });
const settled3 = R.settleTick(settled2.bag, settled2.bag.ticks[0], { failed: true });
check("prism.petrify", settled3.chips.some((c) => c.name === "Petrified") && settled3.ended);

check("splash.hail", row("Hail of Thorns").splash.includeTarget === true && row("Hail of Thorns").splash.radius === 5);
check("splash.arrow", row("Lightning Arrow").splash.radius === 10 && row("Lightning Arrow").splash.half === true);
const hailBag = R.arm(null, { name: "Hail of Thorns", row: row("Hail of Thorns"), slot: 1, armPending: true });
const hailed = R.attackRiders(hailBag.bag, { hit: true, weaponAttack: true, melee: false, targetId: "mob" }, function () { return 4; });
check("hail.splashback", hailed.splash && hailed.splash.radius === 5 && hailed.riders.length === 0, JSON.stringify({ riders: hailed.riders, splash: hailed.splash }));
const boltBag = R.arm(null, { name: "Lightning Arrow", row: row("Lightning Arrow"), slot: 3, armPending: true });
const missed = R.attackRiders(boltBag.bag, { hit: false, weaponAttack: true, melee: false, targetId: "mob" }, function () { return 2; });
check("arrow.miss", missed.splash && missed.splash.radius === 10 && missed.total > 0, JSON.stringify({ total: missed.total, splash: missed.splash }));

check("sustain.bolt", R.sustainSpec("Witch Bolt").auto === true && R.sustainSpec("Witch Bolt").action === "action");
check("sustain.heat", R.sustainSpec("Heat Metal").action === "bonus");
check("sustain.sw", R.sustainSpec("Spiritual Weapon").conc === false && R.sustainSpec("Spiritual Weapon").action === "bonus");
check("sustain.vamp", R.sustainSpec("Vampiric Touch").healHalf === true && R.vampiricHalf(7) === 3);
const held = R.noteSustain(null, { name: "Witch Bolt", slot: 3 });
check("sustain.ready", R.sustainReady(held).some((s) => s.name === "Witch Bolt" && s.slot === 3));
check("vamp.row", row("Vampiric Touch").healHalf === true);

const hexed = R.arm(null, { name: "Hex", slot: 1, targetId: "a", targetName: "A" });
check("hex.default", hexed.bag.marks[0].ability === "WIS");
const down = R.noteDown(hexed.bag, "a");
check("hex.movable", down.marks[0].movable === true);
const moved = R.transfer(down, "hex", "b", "B");
check("hex.moved", moved.moved && moved.bag.marks[0].targetId === "b" && moved.bag.marks[0].movable === false);
const shield = R.arm(null, { name: "Fire Shield", slot: 4 });
check("shield.warm", /Warm/.test(shield.bag.marks[0].chip));
const sick = R.onHitSpell(null, { name: "Contagion", row: row("Contagion"), targetId: "mob" });
check("rot.default", sick.logs.some((line) => /Flesh Rot/.test(line)));

check("thorn.pull", R.slideOf("Thorn Whip").dir === "pull" && R.slideOf("Thorn Whip").feet === 10 && row("Thorn Whip").pull === 10);
check("wave.push", row("Thunderwave").push === 10);
check("banish.hide", row("Banishing Smite").banishAt === 50);
check("ammo.piercing", R.ammoType({ loaded: 2, load: "slug" }) === "piercing");
check("ammo.typed", R.ammoType({ dmgType: "slashing (cone)", loaded: 1 }) === "slashing");
check("barrage.flag", row("Conjure Barrage").ammoType === true && row("Conjure Volley").ammoType === true);
const typed = Cast.rollCast({ spellName: "Conjure Barrage", slotLevel: 3, dc: 14, ammoType: "piercing" });
check("barrage.type", /piercing/.test(typed.text) && !/ammunition/.test(typed.text), typed.text);
check("dust.block", R.healBlocked({ disintegrated: true }) === true && R.healBlocked({ conditions: ["Disintegrated"] }) === true && R.healBlocked({ hp: 4 }) === false);

context.SSDNSTestRoll = function () { return 1; };
const rays = Cast.rollCast({ spellName: "Scorching Ray", slotLevel: 2, attackBonus: 5, wildSpark: true });
check("spark.cancel", rays.shots && rays.shots.length === 3 && rays.shots[0].amount === 0 && rays.shots[1].cancelled === true && rays.shots[2].cancelled === true, JSON.stringify(rays.shots));
check("spark.line", /Wild spark/.test(rays.text) && /cancelled/.test(rays.text));

const scar = Z.buildZone("Fireball", { origin: { x: 4, y: 4 } }, { slot: 3, casterId: "ada", dc: 15 });
check("scar.zone", scar && !scar.deferCast && !Z.defersCast("Fireball") && scar.tag === "burn-scar" && scar.rounds === 2 && scar.conc === false);
const scarTick = Z.phaseDue({ zones: [scar] }, { x: 4, y: 4, size: 1, id: "mob" }, "start", function () { return 4; });
check("scar.tick", scarTick.length === 1 && scarTick[0].dice === "1d6" && scarTick[0].type === "fire" && !scarTick[0].save && scarTick[0].amount === 4);
check("fireball.still", row("Fireball").applyNow !== false && row("Fireball").dice === "8d6");

const grease = Z.buildZone("Grease", { origin: { x: 2, y: 2 } }, { slot: 1, casterId: "ada", dc: 13 });
check("grease.zone", grease && grease.shape === "square" && grease.side === 10 && grease.difficult && !grease.conc && grease.rounds === 10 && grease.appear.onFail === "Prone");
const greaseEnd = Z.phaseDue({ zones: [grease] }, { x: 2, y: 2, size: 1, id: "mob" }, "end");
const greaseEnter = Z.moveDue([grease], { x: 0, y: 2 }, { x: 2, y: 2 }, { id: "mob", size: 1 });
check("grease.ticks", greaseEnd.length === 1 && greaseEnd[0].save === "DEX" && greaseEnd[0].onFail === "Prone" && greaseEnter.some((t) => t.when === "enter" && t.onFail === "Prone"));
check("grease.area", Area.areaOf("Grease") && Area.areaOf("Grease").shape === "square" && Area.areaOf("Grease").side === 10);
check("grease.rules", /"name": "Grease"[\s\S]{0,120}"kind": "none"/.test(read("assets/data/rules.js")));
const posts = Z.appearPosts(grease, [{ id: "mob", name: "Goblin" }]);
check("grease.appear", posts.length === 1 && posts[0].condition === "Prone" && posts[0].save === "DEX");

const slick = Z.buildZone("Ice Storm", { origin: { x: 6, y: 6 } }, { slot: 4, casterId: "ada" });
check("slick.zone", slick && slick.difficult && slick.tag === "slick-ice" && slick.shape === "cylinder" && slick.radius === 20 && !slick.deferCast && slick.rounds === 2);
check("slick.nodmg", Z.phaseDue({ zones: [slick] }, { x: 6, y: 6, size: 1, id: "mob" }, "start").length === 0);
check("slick.cast", row("Ice Storm").applyNow !== false && row("Ice Storm").dice === "2d8+4d6");
check("slick.terrain", Z.terrainMult([slick], { x: 6, y: 6, size: 1 }) === 2);

const sheet = read("assets/js/sheet-extras.js");
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
check("wire.pick", sheet.includes("pickPlan") && sheet.includes("chooseBlastCreatures") && v2.includes("chooseAffected"));
check("wire.sustain", sheet.includes("runSustain") && sheet.includes("Sustain ") && v2.includes("data-sustain"));
check("wire.hex", sheet.includes("Move Hex") && v2.includes("mark_down"));
check("wire.shove", map.includes("function shoveToken") && map.includes("function setTokenHidden") && v2.includes("shoveToken"));
check("wire.spark", read("assets/js/spell-cast.js").includes("cancelOnSpark"));
check("no.lighting", !sheet.includes("Lighting v2") && !read("assets/js/spell-zones.js").includes("wow"));
const rules = read("assets/data/rules.js");
check("rules.clean", !rules.includes("burn-scar") && !rules.includes("pickPlan") && !rules.includes("0.3.169"));
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.169" && ver.dmcc === "0.2.182" && ver.sheetBuild === "sheet-playtest-v03169" && ver.dmccBuild === "dmcc-playtest-v02182");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ncloseout ok");

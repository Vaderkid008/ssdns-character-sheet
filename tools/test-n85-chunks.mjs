/**
 * N85 Chunks 2–6 FX + create-tokens + spell SFX map (sheet 0.3.174 / DMCC 0.2.187).
 *   node tools/test-n85-chunks.mjs
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
check("ver.sheet", version.sheet === "0.3.194" && version.sheetBuild === "sheet-playtest-v03194");
check("ver.dmcc", version.dmcc === "0.2.207" && version.dmccBuild === "dmcc-playtest-v02207");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.194"') && read("assets/js/app.js").includes("sheet-playtest-v03194"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.207"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02207"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);
check("rules.no172", !read("assets/data/rules.js").includes("0.3.174") && !read("assets/data/rules.js").includes("0.2.187"));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  Promise, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null, body: null },
  location: { pathname: "/", search: "" },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read("assets/sfx/sfx.json"))) }),
  Audio: function () { this.play = () => Promise.resolve(); this.addEventListener = () => {}; this.load = () => {}; },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
};
context.window = context;
context.globalThis = context;
context.dispatchEvent = () => {};
vm.createContext(context);
vm.runInContext(read("assets/sfx/spell-sfx-map.js"), context);
vm.runInContext(read("assets/js/sfx.js"), context);
vm.runInContext(read("assets/js/spell-tokens.js"), context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const Audio = context.SSDNSAudio;
const Tok = context.SSDNSSpellTokens;
const R = context.SSDNSSpellRiders;
const Z = context.SSDNSSpellZones;
const FX = context.SSDNSMapFx;
const map = JSON.parse(read("assets/sfx/spell-sfx.json"));

check("sfx.count", map.count === 85 && Object.keys(map.spells).length === 85);
check("sfx.barrage", Audio.spellFile("Conjure Barrage") === "magic/reaction_counter_spe_#2-1793411864281.mp3" && map.spells["conjure barrage"].source === "lock");
check("sfx.barrage.not-hail", !/a_volley_of_sharp_wo/.test(Audio.spellFile("Conjure Barrage")));
check("sfx.missile", Audio.spellFile("Magic Missile") === Audio.spellFile("Conjure Barrage"));
check("sfx.volley-keeps-hail", /a_volley_of_sharp_wo/.test(Audio.spellFile("Conjure Volley")));
check("sfx.firebolt-shipped", Audio.spellCue({ name: "Fire Bolt", kind: "attack" }) === "spellfile-fire-bolt");
check("sfx.frost-shipped", Audio.spellCue({ name: "Ray of Frost", kind: "attack" }) === "spellfile-ray-of-frost");
check("sfx.grasp-shipped", Audio.spellCue({ name: "Shocking Grasp", kind: "attack" }) === "spellfile-shocking-grasp");
const c1 = {
  "acid splash": "magic/booming_acid_splash_#2-1793461200201.mp3",
  "chill touch": "magic/Leviathan_Blizzard._-1793461257926.mp3",
  "fire bolt": "magic/Booming_fire_bolt_sp_#3-1793461301842.mp3",
  "poison spray": "magic/booming_poison_spray_#4-1793461351034.mp3",
  "produce flame": "magic/booming_flame_ignite_#3-1793461375442.mp3",
  "ray of frost": "magic/MAGSpel-Dark_fantasy_spell,_-Elevenlabs.mp3",
  "sacred flame": "magic/The_sound_of_superhe-1793461504161.mp3",
  "shocking grasp": "magic/An_empowered_chain_l_#4-1793461651887.mp3",
  "thorn whip": "magic/booming_sound_of_a_w_#1-1793461724552.mp3"
};
Object.keys(c1).forEach((name) => {
  const base = path.basename(c1[name]);
  check("sfx.c1." + name, Audio.spellFile(name) === c1[name] && map.spells[name].assigned === base && map.spells[name].file.indexOf("179333") < 0, Audio.spellFile(name));
  check("sfx.c1.disk." + name, fs.existsSync(path.join(root, "assets/sfx/magic", base)));
});
check("sfx.knock.cloudkill", Audio.spellFile("Cloudkill") === c1["poison spray"] && map.spells.cloudkill.source === "preassigned");
check("sfx.knock.flame", Audio.spellFile("Flame Strike") === c1["sacred flame"] && map.spells["flame strike"].source === "preassigned");
check("sfx.knock.scorch", Audio.spellFile("Scorching Ray") === c1["fire bolt"] && map.spells["scorching ray"].source === "preassigned" && !/A_Ray_of_scorching_h/.test(Audio.spellFile("Scorching Ray")));
const graspFile = c1["shocking grasp"];
Audio.markSpellFile(graspFile, true);
check("sfx.grasp-when-present", Audio.spellCue({ name: "Shocking Grasp", kind: "attack" }) === "spellfile-shocking-grasp");
Audio.markSpellFile(graspFile, false);
check("sfx.grasp-when-missing", Audio.spellCue({ name: "Shocking Grasp", kind: "attack" }) === "electric");
check("sfx.heal-fallback", Audio.spellCue({ name: "Healing Word", kind: "heal" }) === "heal");
check("sfx.bolt-fallback", Audio.spellCue({ name: "Lightning Bolt", kind: "attack", calling: "pact-seeker" }) === "lightning-ultimate");
check("sfx.ice-fallback", Audio.spellCue({ name: "Ice Storm" }) === "ice-storm");
check("sfx.light-fallback", Audio.spellCue({ name: "Light" }) === "spellcast");
check("sfx.present", Audio.spellCue({ name: "Eldritch Blast", calling: "pact-seeker", attack: true }) === "spellfile-eldritch-blast");
const drop = Audio.spellFile("Conjure Barrage");
Audio.markSpellFile(drop, true);
check("sfx.when-present", Audio.spellCue({ name: "Conjure Barrage" }) === "spellfile-conjure-barrage");
Audio.markSpellFile(drop, false);
check("sfx.when-missing", Audio.spellCue({ name: "Conjure Barrage" }) === "spellcast" || Audio.spellCue({ name: "Conjure Barrage" }) === "spellshot");
check("sfx.hash", Audio.fileUrl("sfx", "magic/reaction_counter_spe_#2-1793411864281.mp3").includes("%23"));
const present = Object.keys(map.spells).filter((k) => map.spells[k].present);
const shippedNeed = ["eldritch blast", "mass healing word", "fire bolt", "ray of frost", "shocking grasp", "witch bolt", "scorching ray"];
check("sfx.shipped", present.length === 11 && shippedNeed.every((k) => present.indexOf(k) >= 0), present.join(","));
const magicDir = path.join(root, "assets/sfx/magic");
const onDisk = new Set(fs.existsSync(magicDir) ? fs.readdirSync(magicDir) : []);
const dropNames = Object.keys(map.spells).map((k) => map.spells[k].file).filter((f) => String(f).indexOf("magic/") === 0).map((f) => path.basename(f));
const uniqueDrops = [...new Set(dropNames)];
const shippedDrops = uniqueDrops.filter((f) => onDisk.has(f));
const absentDrops = uniqueDrops.filter((f) => !onDisk.has(f));
check("sfx.shipped-drops", shippedDrops.length === 61 && onDisk.size === 62, String(shippedDrops.length) + " on disk " + onDisk.size);
check("sfx.still-missing", absentDrops.length === 0, absentDrops.join(" | "));
check("sfx.guiding-bolt", Audio.spellFile("Guiding Bolt") === "magic/The_sound_of_superhe-1793461504161.mp3" && map.spells["guiding bolt"].file.indexOf("179333") < 0);
check("sfx.barrage-file", onDisk.has("reaction_counter_spe_#2-1793411864281.mp3"));

function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }
check("fx.locked-fire", look("Fire Bolt", "fire") === "fire");
check("fx.locked-cold", look("Ray of Frost", "cold") === "cold");
check("fx.locked-grasp", look("Shocking Grasp", "lightning") === "lightning");
check("fx.locked-eb", look("Eldritch Blast") === "scurve");
check("fx.locked-mm", look("Magic Missile", "force") === "beads");
check("fx.locked-heal", look("Cure Wounds") === "heal" && look("Healing Word") === "heal");
check("fx.hex", look("Hex") === "hex" && FX.stickyLook("Hexed (WIS)") === "hex");
check("fx.mark", look("Hunter's Mark") === "brand" && FX.stickyLook("Marked") === "brand");
check("fx.thorn", look("Thorn Whip") === "thorn");
check("fx.rebuke", look("Hellish Rebuke", "fire") === "rebuke");
check("fx.blade", look("Flame Blade", "fire") === "flameblade" && Tok.isHeld("Flame Blade") === true && Tok.isToken("Flame Blade") === false);
check("fx.sphere", look("Flaming Sphere", "fire") === "token" && Tok.isToken("Flaming Sphere") === true);
check("fx.spirit", look("Spiritual Weapon", "force") === "token");
check("fx.guard", look("Guardian of Faith") === "token");
check("fx.heat", look("Heat Metal") === "heat" && FX.stickyLook("Heated metal") === "heat");
check("fx.shield", look("Fire Shield") === "fireshield" && FX.stickyLook("Fire Shield (chill)") === "rime");
check("fx.vamp", look("Vampiric Touch") === "siphon");
check("fx.enfeeble", look("Ray of Enfeeblement") === "enfeeble" && FX.stickyLook("Enfeebled (½ STR weapon dmg)") === "enfeeble");
check("fx.cage", FX.stickyLook("No reactions") === "cage");
check("fx.mockery", look("Vicious Mockery") === "mockery");
check("fx.mass", look("Mass Healing Word") === "massword" && look("Mass Cure Wounds") === "masscure" && look("Heal") === "healcolumn");
check("fx.sky", look("Call Lightning", "lightning") === "skybolt" && look("Meteor Swarm", "fire") === "meteors");
check("fx.walls", look("Wall of Ice") === "wallice" && look("Hunger of Hadar") === "void" && look("Delayed Blast Fireball", "fire") === "bead");
check("fx.c7-not-a-new-book", look("Wish") === "ribbon" || look("Wish") === "");

const sw = Tok.spec("Spiritual Weapon");
const fsphere = Tok.spec("Flaming Sphere");
const guard = Tok.spec("Guardian of Faith");
check("tok.sw", sw.kind === "token" && sw.moveFeet === 20 && sw.squares === 1 && sw.noHp === true && sw.noInit === true && sw.notTargetable === true && /spiritual-weapon-token-140/.test(sw.image));
check("tok.sphere", fsphere.kind === "token" && fsphere.moveFeet === 30 && fsphere.ram === true && /flaming-sphere-token-140/.test(fsphere.image));
check("tok.guard", guard.kind === "token" && guard.squares === 2 && guard.moveFeet === 0 && guard.aura === 10 && /guardian-of-faith-token-280/.test(guard.image));
check("tok.clamp", JSON.stringify(Tok.clampStep({ x: 2, y: 2 }, { x: 10, y: 2 }, 20)) === JSON.stringify({ x: 6, y: 2 }));
check("tok.lock", JSON.stringify(Tok.clampStep({ x: 3, y: 4 }, { x: 8, y: 9 }, 0)) === JSON.stringify({ x: 3, y: 4 }));
check("tok.png", ["spiritual-weapon-token-140.png", "flaming-sphere-token-140.png", "guardian-of-faith-token-280.png"].every((f) => fs.existsSync(path.join(root, "map/spell-tokens", f))));

check("row.sw", R.patchRow({ name: "Spiritual Weapon" }).createToken === true && R.patchRow({ name: "Spiritual Weapon" }).moveFeet === 20 && R.patchRow({ name: "Spiritual Weapon" }).noInit === true);
check("row.sphere", R.patchRow({ name: "Flaming Sphere" }).createToken === true && R.sustainSpec("Flaming Sphere").move === 30 && R.sustainSpec("Flaming Sphere").action === "bonus");
check("row.guard", R.patchRow({ name: "Guardian of Faith" }).squares === 2 && R.patchRow({ name: "Guardian of Faith" }).createToken === true && R.patchRow({ name: "Guardian of Faith" }).noHp === true);
check("row.blade", R.patchRow({ name: "Flame Blade" }).createToken === false && R.patchRow({ name: "Flame Blade" }).heldFx === true);
const held = R.arm(null, { name: "Flame Blade", slot: 2, casterId: "ada" });
check("row.blade-chip", held.chips.some((c) => c.name === "Flame blade" && c.targetId === "ada"));
const heated = R.arm(null, { name: "Heat Metal", slot: 2, targetId: "mob" });
check("row.heat-chip", heated.chips.some((c) => c.name === "Heated metal"));
check("row.sw-move", R.sustainSpec("Spiritual Weapon").move === 20 && R.sustainSpec("Spiritual Weapon").conc === false);

const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const Cast = context.SSDNSSpellCast;
const searing = Cast.lookup("Searing Smite");
const branding = Cast.lookup("Branding Smite");
const banishing = Cast.lookup("Banishing Smite");
check("smite.melee", searing.meleeOnly === true && branding.meleeOnly === false && branding.gunOk === true && banishing.gunOk === true && banishing.meleeOnly === false);
const armedSear = R.arm(null, { name: "Searing Smite", row: searing, slot: 1, armPending: true });
const gunSear = R.attackRiders(armedSear.bag, { hit: true, weaponAttack: true, melee: false, gun: true, targetId: "mob" }, () => 4);
check("smite.gun-blocked", gunSear.riders.length === 0, JSON.stringify(gunSear.riders));
const armedBrand = R.arm(null, { name: "Branding Smite", row: branding, slot: 2, armPending: true });
const gunBrand = R.attackRiders(armedBrand.bag, { hit: true, weaponAttack: true, melee: false, gun: true, targetId: "mob" }, () => 3);
check("smite.gun-ok", gunBrand.total === 9, JSON.stringify({ total: gunBrand.total, riders: gunBrand.riders }));

const zone = Z.buildZone("Guardian of Faith", { origin: { x: 4, y: 5 }, area: { shape: "sphere" } }, { slot: 4, casterId: "ada" });
check("zone.guard", zone && zone.createToken === true && zone.footprint === 2 && zone.budget === 60);
const sphere = Z.buildZone("Flaming Sphere", { origin: { x: 1, y: 1 }, area: { shape: "sphere" } }, { slot: 2 });
check("zone.sphere", sphere && sphere.createToken === true && sphere.footprint === 1 && sphere.ticks.length === 1);
check("zone.turn", typeof Z.tickRounds === "function" && Z.tickRounds([Object.assign({}, sphere, { rounds: 10, roundsLeft: 2 })], 1).zones[0].roundsLeft === 1);
check("map.wire", read("map/ssdns-map.js").includes("syncSpellPieces") && read("map/ssdns-map.js").includes("paintStickyMarks") && read("map/ssdns-map.js").includes("noInit"));
check("html.wire", read("index.html").includes("spell-tokens.js") && read("index.html").includes("spell-sfx-map.js") && read("dm/index.html").includes("spell-tokens.js"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("n85 chunks ok");

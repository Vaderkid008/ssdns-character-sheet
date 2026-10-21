/**
 * Locks from the 2026-10-17 first-half brief.
 *   node tools/test-first-half.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  console.log((cond ? "ok  " : "FAIL") + "  " + msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const sandbox = { window: {}, globalThis: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("assets/data/rules.js"), sandbox);
vm.runInContext(read("assets/js/conditions.js"), sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox);
vm.runInContext(read("assets/js/range-rings.js"), sandbox);
const rules = sandbox.SSDNS_RULES;
const guns = (rules.firearms || []).concat(rules.casterGuns || []);
function gun(id) { return guns.filter((w) => w && w.id === id)[0]; }
function melee(id) { return (rules.melee || []).filter((w) => w && w.id === id)[0]; }
const store = JSON.parse(read("dm/assets/data/store-items.json"));
function item(id) { return store.filter((row) => row && row.id === id)[0]; }
const app = read("assets/js/app.js");
const creator = read("assets/js/creator.js");
const join = read("assets/js/dm-join.js");
const mapCss = read("map/ssdns-map.css");
const mapJs = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const kits = read("assets/js/kits.js");
const version = JSON.parse(read("version.json"));

check(version.sheet === "0.3.98" && version.sheetBuild === "sheet-playtest-v0398", "sheet 0.3.55");
check(version.dmcc === "0.2.111" && version.dmccBuild === "dmcc-playtest-v02111", "DMCC 0.2.68");

const heavy = gun("pony-arms-chaosmaker-heavy");
const musket = gun("dull-co-rifle-musket");
check(heavy && heavy.ability === "DEX", "ChaosMaker Heavy attacks with DEX");
check(musket && musket.ability === "DEX", "Rifle-Musket attacks with DEX");
["single-barrel-farm-shotgun", "double-barrel-coach-gun", "lancaster-lever-shotgun"].forEach((id) => {
  const w = gun(id);
  check(w && w.ability === "STR", id + " stays STR");
});
check(gun("bison-big-fifty-buffalo-rifle").ability === "STR", "Big Fifty stays STR");

const lanc = gun("lancaster-heavy-saddle-carbine");
check(lanc && lanc.cost === "4,500" && lanc.handy === true && /Handy/.test(lanc.properties), "Lancaster carbine 4,500 Handy");
check(lanc.tiers.light.damage === "1d6" && lanc.tiers.light.range === "10/30" && lanc.tiers.light.misfire === "1", "Lancaster light");
check(lanc.tiers.medium.damage === "1d6" && lanc.tiers.medium.range === "20/70" && lanc.tiers.medium.misfire === "1", "Lancaster medium");
check(lanc.tiers.heavy.damage === "1d8" && lanc.tiers.heavy.range === "30/90" && lanc.tiers.heavy.misfire === "1–2", "Lancaster heavy");
check(lanc.heavyChambered === "STR/DEX", "Lancaster heavy chamber ability stays");
const hen = gun("henrietta-saddle-carbine");
check(hen && hen.cost === "3,000" && hen.handy === true, "Henrietta carbine 3,000 Handy");
check(hen.tiers.light.misfire === "1–2" && hen.tiers.medium.damage === "1d6" && hen.tiers.medium.range === "20/70" && hen.tiers.medium.misfire === "1–2", "Henrietta tiers");
const lightCarbine = gun("dullards-light-carbine");
check(lightCarbine && lightCarbine.cost === "1,500" && lightCarbine.handy === true, "Light carbine Handy at 1,500");
check(lightCarbine.tiers.light.damage === "1d4" && lightCarbine.tiers.light.range === "10/30" && lightCarbine.tiers.light.misfire === "1–4", "Light carbine .22 line");
check(item("lancaster-heavy-saddle-carbine").price_es === 4500, "store Lancaster 4500");
check(item("henrietta-saddle-carbine").price_es === 3000, "store Henrietta 3000");
check(item("dullards-light-carbine").price_es === 1500, "store light carbine 1500");

const plinker = gun("dullards-plinker-revolver");
check(plinker.tiers.light.misfire === "1–4" && plinker.dirtyMisfire === "1–4", "Plinker MF 1–4, dirtyMisfire left at 1–4");
check(plinker.properties === "Close quarters, simple, chambered .22 LR", "Plinker properties drop .32 rimfire");
check(plinker.rounds.light.indexOf(".32 rimfire") >= 0, ".32 rimfire rechamber data stays");
const repeater = gun("dullards-plinker-repeater");
check(repeater && repeater.group === "rifle" && repeater.category === "simple" && repeater.ability === "DEX", "Repeater identity");
check(repeater.cost === "1,800" && repeater.capacity === 7 && repeater.tr === true && repeater.handy !== true, "Repeater cost, cap 7, TR, not Handy");
check(repeater.tiers.light.damage === "1d4" && repeater.tiers.light.range === "10/30" && repeater.tiers.light.misfire === "1–4", "Repeater light line");
check(repeater.properties === "Two-handed, simple, chambered .22 LR" && repeater.weight === "5 lb.", "Repeater properties and weight");
check(item("dullards-plinker-repeater").price_es === 1800, "store repeater");

check(app.includes('s.range = "10/30"') && app.includes('s.misfire = "1–4"'), ".22 LR override sets range and misfire");
check(/\.22 LR \(Light, 1d4\)/.test(app), ".22 LR chamber option stays");

const exp = {};
(rules.explosives.items || []).forEach((row) => { exp[row.id] = row; });
check(exp["dynamite-stick-standard-fuse"].cost === "2,500" && /DC 12 Dex half/.test(exp["dynamite-stick-standard-fuse"].notes), "dynamite 2,500");
check(/1d4 sticks/.test(exp["dynamite-stick-standard-fuse"].notes), "store stocks 1d4 sticks");
check(exp["dynamite-stick-sweating-sold-cheap"].cost === "1,250", "sweating 1,250");
check(exp["long-fuse-per-stick"].cost === "50", "long fuse 50");
check(exp["blasting-caps-box-of-5"].cost === "250", "caps 250");
check(exp["blasting-powder-1-lb"].cost === "400" && /max 3\/short rest/.test(exp["blasting-powder-1-lb"].notes), "powder 400");
check(exp["fuse-cord-50-ft"].cost === "100", "fuse cord 100");
check(exp["blasting-keg"].cost === "10,000", "keg 10,000");
check(exp["padded-powder-crate-holds-12-sticks"].cost === "200", "crate 200");
check(item("dynamite-stick-standard-fuse").price_es === 2500, "store dynamite");
check(item("dynamite-stick-sweating-sold-cheap").price_es === 1250, "store sweating");
check(item("blasting-keg").price_es === 10000, "store keg");

check(!read("assets/data/rules.js").includes("fake assay papers"), "fake ore papers");
check(read("assets/data/rules.js").includes("fake ore papers"), "ore papers present");
check(read("assets/data/rules.js").includes("ore sample") && read("assets/data/refcards.js").includes("ore sample"), "ore sample");
check(read("assets/data/rules.js").includes("ore notes"), "ore notes");
check(read("assets/data/rules.js").includes('"name": "Ore glass"'), "Ore glass");
check(read("assets/data/rules.js").includes('"name": "Ore scale"'), "Ore scale");
check(read("assets/data/rules.js").includes("Healing Libation"), "Healing Libation");
check(read("assets/data/rules.js").includes("ore buyer"), "ore buyer");
check(read("assets/data/rules.js").includes("Second-Story Work"), "Second-Story Work");
check(read("assets/data/rules.js").includes("Dust Tendrils") && !read("assets/data/rules.js").includes("Claim Tendrils"), "Dust Tendrils");
check(read("assets/data/rules.js").includes("Will-o' Claim"), "Will-o' Claim stays");
check(read("assets/data/rules.js").includes("Field Test") && !read("assets/data/rules.js").includes("Field Assay"), "Field Test");
check(read("assets/data/rules.js").includes("False Reading") && !read("assets/data/rules.js").includes("False Assay"), "False Reading");
check(!read("assets/data/rules.js").includes("Assayer's lead tin"), "lead tin cut from rules");
check(!item("assayer-s-lead-tin"), "lead tin cut from the store");
check(item("assay-glass-magnifying-glass").name === "Ore glass (magnifying glass)", "store ore glass id stable");
check(item("assay-scale").name === "Ore scale", "store ore scale id stable");
check(item("assay-tonic-trail-draught").name === "Healing Libation", "store libation id stable");
check(item("forgery-kit-assay-forgeries").name === "Forgery kit (ore forgeries)", "store forgery id stable");
check(!read("assets/data/rules.js").includes("Trail Cant") && !read("assets/data/refcards.js").includes("Gambler Cant"), "old cant names stay gone");
check(read("assets/data/refcards.js").includes("Pathfinder's Code") && read("assets/data/refcards.js").includes("Card Sharp's Tells"), "renames already in refcards");
check(app.includes("Under-Cant") && app.includes("hearth-cant") && app.includes("guild-cant") && app.includes("dock-cant") && app.includes("brand-cant"), "migration keys stay");
check(!read("dm/assets/data/bestiary.json").includes("Thieves’ cant"), "bestiary display cant became lingo");

const coverText = read("assets/data/rules.js");
check(coverText.includes("doesn't stack with cover") && !coverText.includes("stacks on half") && !coverText.includes("stacks on that"), "Take Cover text");
check(read("index.html").includes("doesn't stack with cover"), "sheet reminder");
const Applied = sandbox.SSDNSApplied;
check(Applied.takeCoverDisadvantage(true, "") === true, "Take Cover disadvantages a target with no cover");
check(Applied.takeCoverDisadvantage(true, "half") === false, "half cover does not stack");
check(Applied.takeCoverDisadvantage(true, "three") === false, "three-quarters cover does not stack");
check(Applied.takeCoverDisadvantage(true, "full") === false, "total cover does not stack");
check(Applied.takeCoverDisadvantage(false, "") === false, "no Take Cover means no extra disadvantage");
check(v2.includes('type: "surprise_draw"') && v2.includes("takeCoverDisadvantage"), "DMCC wires surprise draw and Take Cover");

const rig = (rules.holsters || []).filter((h) => h && h.id === "shoulder-rig")[0];
check(rig && rig.firstShot === 0 && /didn't know you were armed/.test(rig.perk), "Shoulder Rig +2 text, firstShot stays 0");
check(/\+2 to your first shot/.test(item("shoulder-rig").notes), "store shoulder rig note");
check(join.includes('type === "surprise_draw"') || join.includes('case "surprise_draw"'), "sheet accepts surprise_draw");

const tinker = (rules.backgrounds || []).filter((b) => b && b.id === "tinker")[0];
check(tinker && /Guild-lingo:/.test(tinker.feature.text) && /not a language/i.test(tinker.feature.text), "Tinker guild-lingo");
check(read("assets/data/refcards.js").includes("Guild-lingo:"), "refcard guild-lingo");

const bat = melee("baseball-bat");
check(bat && bat.group === "simple-melee" && bat.category === "simple" && bat.ability === "STR", "baseball bat identity");
check(bat.damage === "1d6" && bat.dmgType === "Bludgeoning" && bat.cost === "300" && bat.weight === "2 lb." && bat.properties === "—", "baseball bat stats");
check(item("baseball-bat").price_es === 300 && item("baseball-bat").name === "Baseball bat", "store baseball bat");
check(read("assets/js/weapon-art.js").includes("dullards-plinker-repeater") && read("assets/js/weapon-art.js").includes("baseball-bat"), "placeholder art slugs");

check(app.includes("Melee: Pistol Whip, 5 ft") && app.includes("Melee: Rifle Butt, 5 ft"), "gun melee labels");
check(read("assets/js/sheet-extras.js").includes("function rollGunMelee") && read("assets/js/sheet-extras.js").includes('kind: "melee"'), "gun melee roll skips the gun shot");
check(read("assets/js/sheet-playtest.js").includes("data-melee-roll"), "gear melee still has Roll");

const rings = sandbox.SSDNSRangeRings;
const handyScope = rings.bands({ weapon: "henrietta-saddle-carbine", scope: true });
check(handyScope.close === 0 && /handy:/.test(handyScope.label), "Handy carbine keeps close quarters under a scope");
const whip = rings.bands({ name: "Pistol Whip", kind: "melee", group: "melee", range: "5 ft" });
check(whip.melee === 5, "gun melee ring is 5 ft");

check(creator.includes("OLD_TONGUES") && creator.includes("nearly useless on the frontier"), "optional Old Tongues");
check(!/Infernal|Celestial/.test(creator.slice(creator.indexOf("OLD_TONGUES"), creator.indexOf("OLD_TONGUES") + 120)), "Old Tongues list has no Infernal or Celestial");

const Cond = sandbox.SSDNSConditions;
const down = Cond.ensureUnconscious([], 0, "self");
check(down.some((row) => row.name === "Unconscious"), "0 HP adds Unconscious");
check(Cond.ensureUnconscious([], "", "self").length === 0, "blank HP does not add Unconscious");
check(Cond.ensureUnconscious([], null, "self").length === 0, "missing HP does not add Unconscious");
check(Cond.ensureUnconscious(down, 4, "self").every((row) => row.name !== "Unconscious"), "heal above 0 clears Unconscious");
check(Cond.ensureUnconscious([], -3, "self").some((row) => row.name === "Unconscious"), "negative HP is still down");
check(read("assets/js/sheet-extras.js").includes("function syncDown"), "sheet syncs Down on HP");
check(mapJs.includes("haveCur && curHp <= 0"), "map death tally needs a real HP number");
check(/\.ssdns-map > canvas/.test(mapCss) && /#mapMount > canvas/.test(mapCss) && /\.ssm-cropper canvas/.test(mapCss), "cropper canvas is not the stage canvas");

check(join.includes("grantListedWeapon") && join.includes("Weapon: "), "give-list weapons log as weapons");
check(v2.includes("id: id") && v2.includes("reward_item"), "give weapon sends the item id");
check(kits.includes("oneWeapon") && kits.includes("dullards-plinker-repeater") && !kits.includes("buffalo-axe-greataxe"), "kits are one weapon");
check(!read("assets/data/rules.js").includes("stacks on half / three-quarters cover"), "no leftover stack wording");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("ok first-half");

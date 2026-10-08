/**
 * Round 13: owner locks from 2026-10-07 (guns, Plinker, Lingo, refcards, kits).
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const rulesSrc = read("assets/data/rules.js");
const sandbox = { window: {}, globalThis: {} };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(rulesSrc, sandbox, { filename: "rules.js" });
const rules = sandbox.SSDNS_RULES;
const guns = (rules.firearms || []).concat(rules.casterGuns || []);
function gun(id) { return guns.find((g) => g.id === id); }

const plinker = gun("dullards-plinker-revolver");
check(plinker && plinker.tiers.light.damage === "1d6" && plinker.tiers.light.misfire === "1–2", "clean Plinker is 1d6, misfire 1–2");
check(plinker && plinker.rustyDamage === "1d4" && plinker.rustyMisfire === "1–4", "rusty Plinker is 1d4, misfire 1–4");
check(gun("bison-big-fifty-buffalo-rifle").ability === "STR", "Big Fifty is STR");
check(gun("dull-co-rifle-musket").ability === "STR/DEX", "Rifle-Musket is STR or DEX");
check(gun("pony-arms-chaosmaker-heavy").ability === "STR/DEX", "Heavy ChaosMaker is STR or DEX");
["dulls-rolling-block-rifle", "henrietta-repeating-rifle", "lancaster-repeating-rifle", "lancaster-heavy-saddle-carbine"].forEach((id) => {
  check(gun(id) && gun(id).heavyChambered === "STR/DEX", id + " heavy chamber uses STR or DEX");
});
(rules.firearms || []).filter((g) => g.group === "shotgun" || /shotgun/i.test(g.group || "")).forEach((g) => {
  check(g.ability === "STR", g.id + " shotgun stays STR");
});
check(gun("blacksnake").ability === "SPELL" && gun("hognose").ability === "SPELL", "caster guns stay CHA/SPELL");

const lingo = (rules.lineages || []).map((l) => l.languages || "").join("\n");
check(lingo.indexOf("Under Lingo") >= 0 && lingo.indexOf("Under-Cant") < 0, "lineage languages say Lingo");
check(!/BOOK1\.md line \d+/.test(read("assets/data/refcards.js")), "player refcards do not cite BOOK1 line numbers");
check(read("assets/js/sheet-extras.js").indexOf('out.unshift({ name: "Pact Shot"') < 0, "Pact Shot is not added as a free cantrip");
check(read("assets/js/app.js").indexOf('sub.id === "variant-human"') >= 0, "variant human replaces the lineage +1 all");
const kits = read("assets/js/kits.js");
const lawStart = kits.lastIndexOf('} else if (calling === "lawman")');
const lawman = kits.slice(lawStart, kits.indexOf('} else if (calling === "frontier-scout")', lawStart));
check(lawman.indexOf("javelin") < 0 && lawman.indexOf("ballCap(c)") >= 0 && kits.indexOf("navy-army-ball-n-cap-revolver") >= 0, "lawman kit is saber, shield, and Ball n Cap");
check(read("version.json").indexOf("0.3.16") >= 0 && read("version.json").indexOf("0.2.29") >= 0, "versions bumped");
check(!/database\.rules\.json/.test("") , "placeholder");
const rulesDiff = read("database.rules.json");
check(rulesDiff.indexOf("requests") >= 0, "rules file still present");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok round13");

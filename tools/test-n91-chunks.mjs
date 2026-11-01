/**
 * N91 Chunks 7–9 catalog admit + soft-locked map FX (sheet 0.3.180 / DMCC 0.2.193).
 *   node tools/test-n91-chunks.mjs
 * rules.js is not edited. Guiding Bolt uses the Sacred Flame file from N88.
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
check("ver.sheet", version.sheet === "0.3.191" && version.sheetBuild === "sheet-playtest-v03191");
check("ver.dmcc", version.dmcc === "0.2.204" && version.dmccBuild === "dmcc-playtest-v02204");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.191"') && read("assets/js/app.js").includes("sheet-playtest-v03191"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.204"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02204"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const SPELLS = [
  ["Entangle", 1, "save", "briar", "map/spell-fx/tiles/01-entangle.jpg", "zone"],
  ["Faerie Fire", 1, "save", "foxfire", "map/spell-fx/tiles/02-faerie-fire.jpg", ""],
  ["Sleep", 1, "none", "chloroform", "map/spell-fx/tiles/03-sleep.jpg", ""],
  ["Bane", 1, "none", "jinx", "map/spell-fx/tiles/04-bane.jpg", ""],
  ["Armor of Agathys", 1, "none", "agathys", "map/spell-fx/tiles/05-armor-of-agathys.jpg", ""],
  ["Color Spray", 1, "none", "limelight", "map/spell-fx/tiles/06-color-spray.jpg", ""],
  ["Darkness", 2, "none", "darkvoid", "map/spell-fx/tiles/07-darkness.jpg", "zone"],
  ["Hold Person", 2, "save", "lasso", "map/spell-fx/tiles/08-hold-person.jpg", ""],
  ["Misty Step", 2, "none", "dustpop", "map/spell-fx/tiles/09-misty-step.jpg", ""],
  ["Web", 2, "save", "silk", "map/spell-fx/tiles/10-web.jpg", "zone"],
  ["Spike Growth", 2, "none", "cholla", "map/spell-fx/tiles/01-spike-growth.jpg", "zone"],
  ["Mirror Image", 2, "none", "tintype", "map/spell-fx/tiles/02-mirror-image.jpg", ""],
  ["Blur", 2, "none", "haze", "map/spell-fx/tiles/03-blur.jpg", ""],
  ["Silence", 2, "none", "hush", "map/spell-fx/tiles/04-silence.jpg", "zone"],
  ["Counterspell", 3, "none", "snap", "map/spell-fx/tiles/05-counterspell.jpg", ""],
  ["Fear", 3, "save", "terror", "map/spell-fx/tiles/06-fear.jpg", ""],
  ["Haste", 3, "none", "brass", "map/spell-fx/tiles/07-haste.jpg", ""],
  ["Slow", 3, "save", "molasses", "map/spell-fx/tiles/08-slow.jpg", ""],
  ["Hypnotic Pattern", 3, "save", "mesmer", "map/spell-fx/tiles/09-hypnotic-pattern.jpg", "zone"],
  ["Fly", 3, "none", "flight", "map/spell-fx/tiles/10-fly.jpg", ""],
  ["Stinking Cloud", 3, "save", "gutfog", "map/spell-fx/tiles/01-stinking-cloud.jpg", "zone"],
  ["Wind Wall", 3, "save", "gale", "map/spell-fx/tiles/02-wind-wall.jpg", "zone"],
  ["Banishment", 4, "save", "rift", "map/spell-fx/tiles/03-banishment.jpg", ""],
  ["Black Tentacles", 4, "save", "tentacles", "map/spell-fx/tiles/04-black-tentacles.jpg", "zone"],
  ["Polymorph", 4, "save", "morph", "map/spell-fx/tiles/05-polymorph.jpg", ""]
];

const book = JSON.parse(read("tools/spell_cast.json"));
const byName = {};
book.forEach((row) => { if (row && row.name && !byName[row.name]) byName[row.name] = row; });
check("catalog.count", SPELLS.every((s) => byName[s[0]] && byName[s[0]].kind === s[2] && byName[s[0]].level === s[1]), SPELLS.filter((s) => !byName[s[0]] || byName[s[0]].kind !== s[2]).map((s) => s[0] + ":" + (byName[s[0]] && byName[s[0]].kind)).join(","));
check("catalog.wind-dice", byName["Wind Wall"].dice === "3d8" && byName["Wind Wall"].save === "STR");
check("catalog.tentacles", byName["Black Tentacles"].dice === "3d6" && byName["Black Tentacles"].applyNow === false);
check("catalog.hypnotic", /v2 tile/.test(byName["Hypnotic Pattern"].note || ""));
check("catalog.dark-note", /Lighting v2/.test(byName.Darkness.note || ""));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  Promise, setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null, body: null },
  location: { pathname: "/", search: "" },
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  Audio: function () { this.play = () => Promise.resolve(); this.addEventListener = () => {}; this.load = () => {}; }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
context.SSDNS_RULES = { spellCast: [{ name: "Entangle", level: 1, kind: "none" }, { name: "Wind Wall", level: 3, kind: "save", save: "STR", dice: "3d8", type: "bludgeoning", half: true, conc: true }] };
vm.runInContext(read("assets/data/spell-cast-admit.js"), context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("assets/sfx/spell-sfx-map.js"), context);
vm.runInContext(read("assets/js/sfx.js"), context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const Cast = context.SSDNSSpellCast;
const Z = context.SSDNSSpellZones;
const FX = context.SSDNSMapFx;
const Audio = context.SSDNSAudio;
const entangle = Cast.lookup("Entangle");
const wall = Cast.lookup("Wind Wall");
check("live.entangle", entangle && entangle.kind === "save" && entangle.save === "STR" && entangle.onFail === "Restrained" && entangle.conc === true, JSON.stringify(entangle && { kind: entangle.kind, save: entangle.save, onFail: entangle.onFail }));
check("live.wall-kept", wall && wall.kind === "save" && wall.dice === "3d8" && /gale/.test(wall.note || ""), wall && wall.note);
check("live.admit-count", context.SSDNS_SPELL_ADMIT.rows.length === 25);

function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }
SPELLS.forEach((s) => {
  check("fx." + s[0], look(s[0], s[2] === "save" ? "bludgeoning" : "") === s[3] && FX.tileOf(s[0]) === s[4] && FX.namedLook(s[0]) === s[3], look(s[0]) + " " + FX.tileOf(s[0]));
  check("tile." + s[0], fs.existsSync(path.join(root, s[4])));
});
check("fx.locked-fire", look("Fire Bolt", "fire") === "fire");
check("fx.locked-smite", look("Wrathful Smite") === "fear");
check("fx.wish", look("Wish") === "ribbon" || look("Wish") === "");
check("fx.held", FX.lookSelf({ type: "spell", spell: "Blur" }) === true && FX.lookSelf({ type: "spell", spell: "Haste" }) === false);
check("fx.sticky", FX.stickyLook("Baned") === "jinx" && FX.stickyLook("Paralyzed") === "lasso" && FX.stickyLook("Charmed + Incapacitated") === "mesmer");
const guided = context.SSDNSSpellRiders.arm(context.SSDNSSpellRiders.emptyBag(null), {
  name: "True Strike", row: { name: "True Strike", kind: "none" }, slot: 0,
  targetId: "goblin", targetName: "Goblin", casterId: "wiz"
});
check("cast.trueStrike", !!(guided && guided.chips.some((c) => c && c.name === "Guided" && c.targetId === "goblin") && guided.bag.conc === "True Strike"), JSON.stringify(guided && guided.chips));
check("fx.hypnotic-tile", FX.tileOf("Hypnotic Pattern") === "map/spell-fx/tiles/09-hypnotic-pattern.jpg");
check("fx.dark-not-void", look("Darkness") === "darkvoid" && look("Hunger of Hadar") === "void");

const zoneNames = ["Entangle", "Web", "Spike Growth", "Silence", "Hypnotic Pattern", "Stinking Cloud", "Black Tentacles", "Darkness", "Wind Wall"];
zoneNames.forEach((name) => {
  const spec = Z.specOf(name);
  check("zone." + name, !!(spec && Z.isZone(name)), spec && spec.shape);
});
const entZone = Z.buildZone("Entangle", { origin: { x: 2, y: 3 }, area: { shape: "square", side: 20 } }, { slot: 1 });
check("zone.entangle-size", entZone && entZone.difficult === true && entZone.radius === 10 && entZone.appear && entZone.appear.onFail === "Restrained", JSON.stringify(entZone && { radius: entZone.radius, shape: entZone.shape }));
const hyp = Z.buildZone("Hypnotic Pattern", { origin: { x: 1, y: 1 }, area: { shape: "cube", side: 30 } }, { slot: 3 });
check("zone.hypnotic", hyp && hyp.radius === 15 && hyp.shape === "cube" && hyp.appear.onFail === "Charmed + Incapacitated");
const dark = Z.specOf("Darkness");
check("zone.dark-silhouette", dark && dark.magicalDark === true && dark.heavilyObscured === true && !read("assets/js/spell-zones.js").includes("occlusionPhase4"));
const tent = Z.buildZone("Black Tentacles", { origin: { x: 4, y: 4 }, area: { shape: "square" } }, { slot: 4 });
check("zone.tentacles", tent && tent.deferCast === true && tent.ticks.length === 2 && tent.ticks[0].dice === "3d6");
const stink = Z.specOf("Stinking Cloud");
check("zone.stink", stink && stink.heavilyObscured === true && stink.tag === "gutfog" && look("Cloudkill") !== "gutfog");

const sfx = JSON.parse(read("assets/sfx/spell-sfx.json"));
check("sfx.guiding", Audio.spellFile("Guiding Bolt") === "magic/The_sound_of_superhe-1793461504161.mp3");
check("sfx.guiding-json", sfx.spells["guiding bolt"].file === "magic/The_sound_of_superhe-1793461504161.mp3" && sfx.spells["guiding bolt"].file.indexOf("179333") < 0);
check("sfx.sacred-same", Audio.spellFile("Guiding Bolt") === Audio.spellFile("Sacred Flame"));
check("sfx.count", sfx.count === 85);
check("html.admit", read("index.html").includes("spell-cast-admit.js") && read("dm/index.html").includes("spell-cast-admit.js"));
check("cast.lightHost", read("map/ssdns-map-host.js").includes("setSpellZones: function") && read("assets/js/sheet-extras.js").includes("function noteSpellLight"));
check("cast.holdWrap", read("dm/assets/js/v2.js").includes("function pushTokenConditions") && read("map/ssdns-map.js").includes("Lasting wrap"));
check("docs.locked", read("specs/spell-fx/beam-map-fx-chunk8-v1.md").includes("Soft-lock:") && read("specs/spell-fx/beam-map-fx-chunk8-v1.md").includes("09-hypnotic-pattern.jpg"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("n91 chunks ok");

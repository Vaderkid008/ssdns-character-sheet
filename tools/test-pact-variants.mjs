/**
 * Locked per-patron Pact Shot (L0209). Names come from the iron slug, not the patron.
 *   node tools/test-pact-variants.mjs
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

const ctx = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
ctx.globalThis = ctx;
ctx.window = ctx;
ctx.document = { readyState: "complete", getElementById() { return null; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
ctx.SSDNSApp = { doc() { return { character: ctx.__ch || null }; }, compute() { return { spellDC: 13, mods: { CHA: 3 } }; } };
ctx.SSDNSSheet = { addLog() {} };
ctx.SSDNSSpellCast = {
  cantripTier(lv) {
    lv = parseInt(lv, 10) || 1;
    if (lv >= 17) return 4;
    if (lv >= 11) return 3;
    if (lv >= 5) return 2;
    return 1;
  }
};
vm.createContext(ctx);
vm.runInContext(read("assets/js/iron-art.js"), ctx, { filename: "iron-art.js" });
vm.runInContext(read("assets/js/pact-shot.js"), ctx, { filename: "pact-shot.js" });
const P = ctx.SSDNSPactShot;
const locked = {
  "the-crossroads-note": ["Hellshot", "fire beams", "fire", "120 ft", false],
  "the-sealed-orders": ["Lightshot", "radiant beams", "radiant", "120 ft", false],
  "lass-o-lakes": ["Churn Shot", "psychic beams", "psychic", "120 ft", false],
  "the-last-round": ["Belly Shot", "point-blank force", "force", "60 ft", false],
  "the-sand-oath": ["Sirocco Shot", "long force beams", "force", "240 ft", false],
  "the-pine-box-contract": ["Pallbearer Load", "necrotic cone", "necrotic", "15-ft cone", true],
  "the-drowned-breath": ["Undertow Shot", "cold beams", "cold", "120 ft", false]
};
Object.keys(locked).forEach((pact) => {
  const c = { calling: "pact-seeker", subclass: pact, level: 5 };
  const v = P.variant(c);
  const want = locked[pact];
  check("name." + pact, v.name === want[0] && v.subtitle === want[1] && v.damage === want[2] && v.range === want[3] && v.cone === want[4], JSON.stringify(v));
  check("noPatron." + pact, !/crowley|gabriel|buttah|virgil the|saaladin|undertaker|keel/i.test(v.name + " " + v.subtitle));
});
const plain = P.variant({ calling: "pact-seeker" });
check("default.force", plain.name === "Pact Shot" && plain.subtitle === "force beams" && plain.range === "120 ft" && plain.cone === false, JSON.stringify(plain));
const hell = P.quickSpells({ calling: "pact-seeker", subclass: "the-crossroads-note", cantrips: [], spells: {} })[0];
check("quick.hellshot", hell && hell.name === "Hellshot" && hell.value === "0:" + P.NAME && hell.pact === true, JSON.stringify(hell));

ctx.__ch = { calling: "pact-seeker", subclass: "the-pine-box-contract", level: 1, invocations: [] };
const low = P.rollCone(ctx.__ch);
check("cone.noAttack", low.attack === false && low.cone === true && low.dice === "1d6" && /Dexterity save/.test(low.text) && !/\bd20\b/.test(low.text) && /one creature only/.test(low.text), low.text);
ctx.__ch.level = 17;
ctx.__ch.invocations = ["Agonizing Blast", "Repelling Blast"];
const high = P.rollCone(ctx.__ch);
check("cone.tier4", high.dice === "4d6" && /DC 13/.test(high.text) && /\+3 Charisma to one creature/.test(high.text) && /pushes each creature that fails/.test(high.text), high.text);
check("ui.button", /iron-spell-sub/.test(read("assets/js/sheet-playtest.js")) && /shot\.cone/.test(read("assets/js/sheet-playtest.js")) && /data-cone/.test(read("assets/js/sheet-playtest.js")));
check("ui.notAttack", /rollCone\(ch\(\)\)/.test(read("assets/js/sheet-playtest.js")));
check("rules.untouched", !read("assets/data/rules.js").includes("Hellshot") && !read("assets/data/rules.js").includes("Pallbearer Load"));
check("belly.pointBlank", P.variant({ calling: "pact-seeker", subclass: "the-last-round" }).pointBlank === true);
vm.runInContext(read("assets/js/range-rings.js"), ctx, { filename: "range-rings.js" });
const RR = ctx.SSDNSRangeRings;
ctx.__ch = { calling: "pact-seeker", subclass: "the-last-round", level: 5 };
const belly = RR.resolve({ name: "Pact Shot", kind: "spell", spell: true, spellKind: "attack", range: "60 ft" }, 30, { hasTarget: true, hostileFeet: 5 });
check("belly.noCloseDis", belly && belly.spell === true && belly.disadvantage === false && belly.feet === 30, JSON.stringify(belly));
ctx.__ch = { calling: "pact-seeker", subclass: "the-crossroads-note", level: 5 };
const hellDis = RR.resolve({ name: "Pact Shot", kind: "spell", spell: true, spellKind: "attack", range: "120 ft" }, 30, { hasTarget: true, hostileFeet: 5 });
check("hell.closeDis", hellDis && hellDis.spell === true && hellDis.disadvantage === true && /hostile within 5/.test(hellDis.note), JSON.stringify(hellDis));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\npact variants ok");

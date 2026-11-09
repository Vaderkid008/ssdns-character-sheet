/**
 * Phase 1 cast / FX first cut (sheet 0.3.219 / DMCC 0.2.232).
 * Touch casts are not aborted when the map cannot measure.
 * Spiritual Weapon still makes one melee spell attack after the token is placed.
 * Chain hops publish as squares a player map can draw.
 * Contagion keeps the caster DC on the end-of-turn save.
 * rules.js is not edited.
 *   node tools/test-phase1-cast-cut.mjs
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
check("ver.sheet", version.sheet === "0.3.259" && version.sheetBuild === "sheet-playtest-v03259");
check("ver.dmcc", version.dmcc === "0.2.272" && version.dmccBuild === "dmcc-playtest-v02272");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.259"') && read("assets/js/app.js").includes("sheet-playtest-v03259"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.272"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02272"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const map = read("map/ssdns-map.js");
const sheet = read("assets/js/sheet-extras.js");
const dm = read("dm/assets/js/v2.js");
const join = read("assets/js/dm-join.js");
check("fx.hops", map.includes("function fxPublicPoints") && map.includes("const hopPub = fxPublicPoints(spec.hops, seen)"));
check("touch.sheet", sheet.includes("allowUnmeasured: allow || !measured"));
check("touch.dm", dm.includes("allowUnmeasured: allow || !measured"));
check("touch.map", map.includes("allowUnmeasured: kind === \"heal\" || !measured"));
check("sw.sheet", sheet.includes("kindNow === \"attack\"") && sheet.includes("postAttack"));
check("sw.dm", dm.includes("kind === \"attack\" && rolled && rolled.attack && tokens.length"));
check("zone.link", dm.includes("liveMapTokenId(row)"));
check("join.dc", join.includes("row.dc == null && entry.dc"));

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  Promise, setTimeout, clearTimeout
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const row = Cast.lookup("Contagion");
const landed = R.landResolved(null, {
  row: row, name: "Contagion", targetId: "mob", targetName: "Bandit", hit: true, disease: "Flesh Rot", dc: 15
});
const tick = (landed.bag.ticks || []).filter((t) => t && t.contagion)[0];
check("contagion.dc", !!(tick && tick.save === "CON" && tick.when === "end" && tick.dc === 15), JSON.stringify(tick));
check("contagion.chip", landed.chips.some((c) => c.name === "Poisoned"));
const bare = R.landResolved(null, { row: row, name: "Contagion", targetId: "mob", hit: true, disease: "Flesh Rot" });
const bareTick = (bare.bag.ticks || []).filter((t) => t && t.contagion)[0];
check("contagion.nodc", !!(bareTick && bareTick.dc == null));

const bolt = Cast.rollCast({ spellName: "Witch Bolt", slotLevel: 1, attackBonus: 6, characterLevel: 5 });
check("witch.dice", bolt.kind === "attack" && bolt.damageTotal > 0 && /1d12/.test(bolt.text), bolt.text);
const wounds = Cast.lookup("Inflict Wounds");
check("wounds.row", wounds.kind === "attack" && wounds.dice === "3d10" && wounds.type === "necrotic");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("phase1 cast cut ok");

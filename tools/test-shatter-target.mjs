/**
 * Shatter can be aimed: a point within 60 ft, or a creature under that point.
 * The cast is a CON save for 3d8 thunder in a 10-ft sphere. The glass burst stays.
 *   node tools/test-shatter-target.mjs
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
check("ver.sheet", version.sheet === "0.3.236" && version.sheetBuild === "sheet-playtest-v03236");
check("ver.dmcc", version.dmcc === "0.2.249" && version.dmccBuild === "dmcc-playtest-v02249");
const rulesDiff = execSync("git diff --name-only HEAD -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const Area = context.SSDNSSpellArea;
const Cast = context.SSDNSSpellCast;
const FX = context.SSDNSMapFx;

function sphere(name) {
  const area = Area.areaOf(name);
  return area && {
    shape: area.shape, radius: area.radius, self: area.self, rangeFeet: area.rangeFeet
  };
}
const labels = [
  "Shatter",
  "Shatter (Resonance)",
  "spell:2:Shatter (Resonance)",
  "2:Shatter (Resonance)",
  "Shatter (L2) · save · DC 15 · 3d8",
  "Cast Shatter (Resonance)"
];
labels.forEach((name) => {
  const area = sphere(name);
  check("area." + name, area && area.shape === "sphere" && area.radius === 10 && area.self === false && area.rangeFeet === 60, JSON.stringify(area));
});
check("area.fireballStill", sphere("Fireball").radius === 20 && sphere("spell:3:Fireball").self === false);
check("area.burningSelf", Area.areaOf("Burning Hands").self === true && Area.isSelfOrigin(Area.areaOf("Burning Hands")));
check("area.notPoint", !Area.areaOf("Fire Bolt"));

const row = Cast.lookup("spell:2:Shatter (Resonance)");
check("row.save", row && row.name === "Shatter" && row.kind === "save" && row.save === "CON" && row.dice === "3d8" && row.type === "thunder" && row.half === true, JSON.stringify(row && { name: row.name, kind: row.kind, save: row.save, dice: row.dice, type: row.type, half: row.half }));
check("range.meta", Cast.rangeOf("spell:2:Shatter (Resonance)") === "60 ft");
const rolled = Cast.rollCast({ spellName: "Shatter (L2) · save · 3d8 thunder", slotLevel: 2, dc: 14 });
check("roll.pack", rolled.kind === "save" && rolled.save === "CON" && rolled.half === true && /3d8/.test(rolled.formula || "") && rolled.damageTotal >= 3 && rolled.damageTotal <= 24, JSON.stringify({ kind: rolled.kind, save: rolled.save, half: rolled.half, formula: rolled.formula, total: rolled.damageTotal }));
const up = Cast.rollCast({ spellName: "Shatter", slotLevel: 3, dc: 14 });
check("roll.upcast", /3d8\+1d8/.test(up.formula || "") && up.damageTotal >= 4 && up.damageTotal <= 32, up.formula + " " + up.damageTotal);

const caster = { x: 10, y: 10, size: 1 };
const shatter = Area.areaOf("Shatter");
check("reach.here", Area.pointInReach(shatter, caster, { x: 10.5, y: 10.5 }));
check("reach.edge", Area.pointInReach(shatter, caster, { x: 22.5, y: 10.5 }));
check("reach.past", !Area.pointInReach(shatter, caster, { x: 24.5, y: 10.5 }));
check("reach.noCaster", Area.pointInReach(shatter, null, { x: 40, y: 40 }));

const origin = { x: 10.5 * 5, y: 10.5 * 5 };
check("hit.onPoint", Area.hits(shatter, origin, 0, { x: 10, y: 10, size: 1 }));
check("hit.neighbor", Area.hits(shatter, origin, 0, { x: 12, y: 10, size: 1 }));
check("hit.outside", !Area.hits(shatter, origin, 0, { x: 14, y: 10, size: 1 }));
check("save.half", Area.savedAmount(16, true, { failed: false, blocked: false }) === 8);
check("save.fail", Area.savedAmount(16, true, { failed: true }) === 16);

const map = read("map/ssdns-map.js");
const note = map.slice(map.indexOf("function rangeButtonNote"), map.indexOf("function rangeButtonNote") + 500);
check("gate.skipCreature", note.indexOf("pointPlacedSpell(attack)") >= 0 && note.indexOf("pointPlacedSpell(attack)") < note.indexOf("SSDNSRangeRings.resolve"));
const place = map.slice(map.indexOf("function blastPointer"), map.indexOf("function blastPointer") + 3500);
check("aim.creatureCommits", !place.includes("function blastCreatureAt") && map.includes("function blastCreatureAt") && place.includes("blastCreatureAt(e)") && place.includes("confirmBlast()"));
check("aim.groundWaits", place.includes("Empty ground still waits"));
check("aim.reachHelper", map.includes("Area.pointInReach"));
const geo = map.slice(map.indexOf("function fxGeometry"), map.indexOf("function fxGeometry") + 1800);
check("fx.pointKept", geo.includes("geo.T && type === 'spell'") && geo.includes("Shatter's burst belongs on that point"));
check("drawer.name", map.includes("const label = (named && named.name)") && map.includes("areaOf(label)"));
check("drawer.pendingPoint", map.includes("pointPlacedSpell(state.pendingTarget)") && map.includes("targetCombatantId: ''"));

const sheet = read("assets/js/sheet-extras.js");
const cast = sheet.slice(sheet.indexOf("function castSpellAttack"), sheet.indexOf("function castSpellAttackNow"));
check("sheet.skipCreature", cast.includes("areaPick ? Promise.resolve({ skip: true })"));
const nowStart = sheet.indexOf("function castSpellAttackNow");
const nowEnd = sheet.indexOf("\n  function ", nowStart + 40);
const now = sheet.slice(nowStart, nowEnd > nowStart ? nowEnd : nowStart + 12000);
check("sheet.place", now.includes("placeBlast") && now.indexOf("placeBlast") < now.indexOf("spendForCast"));
const v2 = read("dm/assets/js/v2.js");
const rollStart = v2.indexOf("async function rollSpellAt");
const rollEnd = v2.indexOf("\nasync function ", rollStart + 40);
const rollAt = v2.slice(rollStart, rollEnd > rollStart ? rollEnd : rollStart + 20000);
check("dm.areaFirst", rollAt.includes("areaEarly") && rollAt.indexOf("areaSpellOf") >= 0 && rollAt.indexOf("areaSpellOf") < rollAt.indexOf("reachBlock("));

check("look.stays", FX.lookOf({ type: "spell", spell: "Shatter", dmg: "thunder" }) === "shatter");
check("look.closeFlag", map.includes("pointPlacedSpell") && read("map/ssdns-map-fx.js").includes("var close = d.d < 16"));

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function () {
        if (p === "fill") ops.push({ fillStyle });
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}
const cell = 70;
const palm = { x: 200, y: 200 };
const onCaster = { x: palm.x + 4, y: palm.y + 2 };
const far = { x: palm.x + 220, y: palm.y - 30 };
const geoClose = { A: palm, B: onCaster, S: palm, T: onCaster, cell, rS: 18, rT: 18, dir: { x: 1, y: 0 } };
const closePaint = trace({ spell: "Shatter", dmg: "thunder" }, 400, geoClose);
check("look.closeGlass", closePaint.some((op) => /200,\s*225,\s*250|245,\s*250,\s*255/.test(op.fillStyle || "")));
const farPaint = trace({ spell: "Shatter", dmg: "thunder" }, 400, { A: palm, B: far, S: palm, T: far, cell, rS: 18, rT: 18, dir: { x: 1, y: 0 } });
check("look.farStill", farPaint.length > 0);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nshatter targeting ok");

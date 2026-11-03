/**
 * Remaining Phase 1 softs (sheet 0.3.223 / DMCC 0.2.236).
 * Shatter on the caster still paints the 10-ft glass burst.
 * Ice Storm paints the hail cylinder. Damage and the 2-round slick stay.
 * Hunger of Hadar start/end ticks, Insect Plague's 10-minute clock,
 * Phantasmal Killer's stored target, smite riders, Heat Metal's drop line,
 * and Hellish Rebuke without a hex shell.
 * rules.js is not edited.
 *   node tools/test-phase1-rest.mjs
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
check("ver.sheet", version.sheet === "0.3.226" && version.sheetBuild === "sheet-playtest-v03226");
check("ver.dmcc", version.dmcc === "0.2.239" && version.dmccBuild === "dmcc-playtest-v02239");
const rulesDiff = execSync("git diff --name-only HEAD -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const context = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Promise
};
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
const Cast = context.SSDNSSpellCast;
const R = context.SSDNSSpellRiders;
const Z = context.SSDNSSpellZones;
const FX = context.SSDNSMapFx;
const fixed = () => 3;

function trace(spec, lt, g) {
  const ops = [];
  let fillStyle = "";
  let strokeStyle = "";
  let cur = [];
  let lastArc = null;
  const ctx = new Proxy({}, {
    get(_t, p) {
      if (typeof p !== "string") return undefined;
      return function (...args) {
        if (p === "beginPath") { cur = []; lastArc = null; }
        else if (p === "moveTo") cur = [[args[0], args[1]]];
        else if (p === "lineTo") cur.push([args[0], args[1]]);
        else if (p === "arc") lastArc = { x: args[0], y: args[1], r: args[2] };
        else if (p === "fill") ops.push({ op: "fill", fillStyle, arc: lastArc, n: cur.length });
        else if (p === "stroke") ops.push({ op: "stroke", strokeStyle, arc: lastArc, n: cur.length });
        else if (p === "createRadialGradient" || p === "createLinearGradient") return { addColorStop() {} };
        return ctx;
      };
    },
    set(_t, p, v) {
      if (p === "fillStyle") fillStyle = typeof v === "string" ? v : "";
      if (p === "strokeStyle") strokeStyle = typeof v === "string" ? v : "";
      return true;
    }
  });
  FX.paint(ctx, Object.assign({ type: "spell", result: "hit", seed: 4 }, spec), lt, g);
  return ops;
}

const cell = 70;
const palm = { x: 220, y: 280 };
const point = { x: palm.x + 4, y: palm.y + 2 };
const far = { x: palm.x + 280, y: palm.y - 40 };
function geo(B) {
  return { A: palm, B, S: palm, T: B, rS: 22, rT: 18, cell, dir: { x: 1, y: 0 } };
}
const close = trace({ spell: "Shatter", dmg: "thunder" }, 400, geo(point));
const rings = close.filter((op) => op.op === "stroke" && op.arc && Math.hypot(op.arc.x - point.x, op.arc.y - point.y) < 8 && op.arc.r > cell);
check("shatter.closeRings", rings.length >= 1, JSON.stringify(rings.map((op) => Math.round(op.arc.r))));
check("shatter.closeGlass", close.some((op) => /200,\s*225,\s*250|245,\s*250,\s*255/.test(op.fillStyle || "")));
check("shatter.closeNotThunderOnly", !read("map/ssdns-map-fx.js").includes("if (d.d < 16) { thunderPaint"));
const away = trace({ spell: "Shatter", dmg: "thunder" }, 400, geo(far));
check("shatter.farStill", away.some((op) => op.arc && Math.abs(op.arc.r - cell * 2) < 2));

check("ice.look", FX.lookOf({ type: "spell", spell: "Ice Storm", dmg: "bludgeoning and cold" }) === "hailstorm");
check("ice.named", /"ice storm": "hailstorm"/.test(read("map/ssdns-map-fx.js").slice(read("map/ssdns-map-fx.js").indexOf("var CHUNK_LOOKS"), read("map/ssdns-map-fx.js").indexOf("var CHUNK_LOOKS") + 2800)));
const icePaint = trace({ spell: "Ice Storm", dmg: "cold" }, 200, geo(far));
check("ice.notChip", !icePaint.some((op) => op.op === "fill" && op.fillStyle && /SPD/.test(op.fillStyle)));
const iceRow = R.patchRow(Cast.lookup("Ice Storm"));
const slick = Z.buildZone("Ice Storm", { origin: { x: 6, y: 6 } }, { slot: 4, casterId: "ada" });
check("ice.dice", iceRow.dice === "2d8+4d6" && iceRow.save === "DEX" && iceRow.half === true);
check("ice.zone", slick && slick.tag === "slick-ice" && slick.difficult && slick.rounds === 2 && !slick.deferCast);

const hunger = Z.buildZone("Hunger of Hadar", { origin: { x: 4, y: 4 } }, { slot: 3, casterId: "ada", dc: 15 });
const cold = Z.phaseDue({ zones: [hunger] }, { x: 4, y: 4, size: 1, id: "mob" }, "start", fixed);
const acid = Z.phaseDue({ zones: [hunger] }, { x: 4, y: 4, size: 1, id: "mob" }, "end", fixed);
check("hunger.cold", cold.length === 1 && cold[0].type === "cold" && cold[0].auto && cold[0].amount === 6 && !cold[0].save && cold[0].targetId === "mob", JSON.stringify(cold[0]));
check("hunger.acid", acid.length === 1 && acid[0].type === "acid" && acid[0].save === "DEX" && acid[0].half === false && acid[0].dc === 15 && acid[0].amount == null);
check("hunger.both", cold.length === 1 && acid.length === 1);
const v2 = read("dm/assets/js/v2.js");
check("hunger.toast", v2.includes("function zoneApplyAmount") && /if \(amount > 0\) \{\s*const line = \(tick\.spell/.test(v2));
check("hunger.link", v2.includes("liveMapTokenId(r)") && v2.includes("tickIds[String(tick.targetId)]"));

const bugs = Z.buildZone("Insect Plague", { origin: { x: 10, y: 10 } }, { slot: 5, casterId: "ada", dc: 16 });
check("bugs.clock", bugs.conc && bugs.rounds === 100 && bugs.roundsLeft === 100 && bugs.deferCast && bugs.difficult && bugs.lightlyObscured, JSON.stringify({ rounds: bugs && bugs.rounds, dur: bugs && bugs.dur }));
const early = Z.tickRounds([bugs], 10);
check("bugs.holds", early.removed.length === 0 && early.zones[0].roundsLeft === 90);
const last = Z.tickRounds([{ ...bugs, roundsLeft: 1 }], 1);
check("bugs.ends", last.removed.length === 1 && /10 min/.test(last.logs[0] || ""));
const enter = Z.moveDue([bugs], { x: 2, y: 10 }, { x: 10, y: 10 }, { size: 1, id: "mob" }, fixed);
const start = Z.phaseDue({ zones: [bugs] }, { x: 10, y: 10, size: 1, id: "mob" }, "start", fixed);
check("bugs.ticks", enter.some((t) => t.when === "enter" && t.dice === "4d10" && t.save === "CON") && start.some((t) => t.when === "start" && t.dice === "4d10" && t.save === "CON"));

const pk = R.landResolved(R.emptyBag(null), {
  row: R.patchRow(Cast.lookup("Phantasmal Killer")), name: "Phantasmal Killer", slot: 4,
  targetId: "mob", targetName: "Bandit", failed: true, dc: 15, casterId: "ada"
});
const pkTick = (pk.bag.ticks || []).filter((t) => t && t.spell === "Phantasmal Killer")[0];
check("pk.target", pk.changed && pkTick && pkTick.targetId === "mob" && pkTick.save === "WIS" && pkTick.dice === "4d10" && pkTick.dc === 15 && (pk.chips || []).some((c) => c.name === "Frightened" && c.targetId === "mob"), JSON.stringify(pkTick));
const dueMob = R.phaseTicks(pk.bag, ["mob", "tok-mob"], "end");
const dueOther = R.phaseTicks(pk.bag, ["someone-else"], "end");
check("pk.due", dueMob.due.length === 1 && dueMob.due[0].targetId === "mob" && dueOther.due.length === 0);
check("pk.castNone", R.dealt(R.patchRow(Cast.lookup("Phantasmal Killer")), 22, { failed: true }) === 0);
check("pk.ask", v2.includes("Choose the creature") && read("assets/js/sheet-extras.js").includes('phbKey(name) === "phantasmal killer"'));
check("pk.fx", v2.includes("phantasmal killer") && v2.includes("spellMapFx"));

check("smite.ride", R.ridesWeapon(Cast.lookup("Staggering Smite")) && R.ridesWeapon(Cast.lookup("Banishing Smite")) && !R.ridesWeapon(Cast.lookup("Hellish Rebuke")));
const stagRow = R.patchRow(Cast.lookup("Staggering Smite"));
const banRow = R.patchRow(Cast.lookup("Banishing Smite"));
check("smite.rows", stagRow.save === "WIS" && stagRow.onFail === "Staggered" && banRow.save == null && banRow.banishAt === 50);
const stagArm = R.arm(null, { name: "Staggering Smite", row: stagRow, slot: 4, armPending: true, casterId: "pal" });
const stagMark = (stagArm.bag.marks || []).filter((m) => m && m.pending)[0];
check("smite.arm", !!(stagMark && stagMark.save === "WIS" && /armed on the next melee/.test((stagArm.logs || []).join(" "))), JSON.stringify(stagArm.logs));
const stagHit = R.attackRiders(stagArm.bag, { hit: true, weaponAttack: true, melee: true, targetId: "mob" }, fixed);
check("smite.save", stagHit.hitSave && stagHit.hitSave.ability === "WIS" && stagHit.hitSave.onFail === "Staggered" && stagHit.hitSave.targetId === "mob" && !(stagHit.chips || []).some((c) => c.name === "Staggered"), JSON.stringify(stagHit.hitSave));
check("smite.dice", (stagHit.riders || []).some((r) => r.total === 12 && /psychic/.test(r.type || "")));
const banArm = R.arm(null, { name: "Banishing Smite", row: banRow, slot: 5, armPending: true, casterId: "pal" });
const banHit = R.attackRiders(banArm.bag, { hit: true, weaponAttack: true, melee: true, gun: true, targetId: "mob" }, fixed);
check("smite.banish", banHit.banishAt === 50 && banHit.hitSave == null && (banHit.riders || []).some((r) => /force/.test(r.type || "") && r.total === 15));
check("smite.wire", read("assets/js/sheet-extras.js").includes("ridesWeapon(row)") && v2.includes("readies ") && read("assets/js/dm-join.js").includes("row.banishAt") && read("assets/js/dm-join.js").includes("row.riderSave"));

const heatFail = R.landResolved(R.emptyBag(null), { row: R.patchRow(Cast.lookup("Heat Metal")), name: "Heat Metal", targetId: "mob", targetName: "Bandit", failed: true, hit: true });
const heatSave = R.landResolved(R.emptyBag(null), { row: R.patchRow(Cast.lookup("Heat Metal")), name: "Heat Metal", targetId: "mob", targetName: "Bandit", failed: false, hit: true });
check("heat.fail", /drops the object/.test((heatFail.logs || []).join(" ")) && /Nothing leaves inventory/.test((heatFail.logs || []).join(" ")) && !(heatFail.chips || []).length);
check("heat.keep", /keeps hold of the object/.test((heatSave.logs || []).join(" ")) && /still lands/.test((heatSave.logs || []).join(" ")));
check("heat.auto", R.patchRow(Cast.lookup("Heat Metal")).damageAuto === true && R.dealt(R.patchRow(Cast.lookup("Heat Metal")), 9, { failed: false }) === 9);
check("heat.sustain", v2.includes("CON save only to drop the object"));

const app = read("assets/js/app.js");
const sheet = read("assets/js/sheet-extras.js");
check("rebuke.shell", app.includes('=== "hellish rebuke"') && sheet.includes("rebukeCast") && sheet.includes('=== "hellish rebuke"'));
check("rebuke.look", FX.lookOf({ type: "spell", spell: "Hellish Rebuke", dmg: "fire" }) === "rebuke");
check("rebuke.card", v2.includes("function castHellishReaction") && v2.includes('spellMapFx(row.mapTokenId || row.id, target.id, "Hellish Rebuke"'));
check("rebuke.aim", read("assets/js/dm-join.js").includes("aimCastTarget(target, targetName)"));
const rebuke = R.patchRow(Cast.lookup("Hellish Rebuke"));
check("rebuke.save", rebuke.kind === "save" && rebuke.save === "DEX" && rebuke.half === true && rebuke.dice === "2d10");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("phase1 rest ok");

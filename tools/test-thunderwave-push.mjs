/**
 * Thunderwave / Porch Boom: a failed CON save shoves 10 ft. The push is not a condition.
 *   node tools/test-thunderwave-push.mjs
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

const context = { console, Math, Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("map/ssdns-map-move.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book, spellAliases: [{ phb: "Thunderwave", alias: "Porch Boom", level: 1 }] };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;
const M = context.SSDNSMapMove;

function row(name) { return Cast.lookup(name); }
function names(list) { return (list || []).map((c) => c && c.name); }

check("key.porch", R.spellKey("Porch Boom") === "thunderwave" && R.spellKey("Thunderwave (Porch Boom)") === "thunderwave");
check("key.shell", R.spellKey("Thunderwave Shell") === "thunderwave");
const wave = row("Thunderwave");
const porch = row("Porch Boom");
const labeled = row("Thunderwave (Porch Boom)");
check("lookup.porch", porch && porch.push === 10 && porch.save === "CON" && porch.name === "Thunderwave", JSON.stringify(porch && { name: porch.name, push: porch.push }));
check("lookup.label", labeled && labeled.push === 10 && labeled.onFail === "Pushed 10 ft");
check("slide.wave", R.slideOf("Thunderwave").feet === 10 && R.slideOf("Thunderwave").dir === "push" && R.slideOf("Thunderwave").on === "fail");
check("slide.porch", R.slideOf("Porch Boom").feet === 10 && R.slideOf("Porch Boom").on === "fail");
check("slide.thorn", R.slideOf("Thorn Whip").dir === "pull" && R.slideOf("Thorn Whip").on === "hit" && R.slideOf("Thorn Whip").feet === 10);

const fail = { failed: true, blocked: false };
const ok = { failed: false, blocked: false };
const blocked = { failed: true, blocked: true };
check("apply.fail", (() => {
  const m = R.slideApply("Porch Boom", fail);
  return m && m.feet === 10 && m.dir === "push" && m.forced === true && m.on === "fail";
})());
check("apply.label", R.slideApply("Thunderwave (Porch Boom)", fail).feet === 10);
check("apply.save", R.slideApply("Thunderwave", ok) === null);
check("apply.cover", R.slideApply("Thunderwave", blocked) === null);
check("apply.posted", R.slideApply("Fireball", ok, { push: 10 }) === null);
check("apply.postedFail", R.slideApply("Fireball", fail, { push: 10 }).feet === 10);
check("apply.beam", R.slideApply("Eldritch Blast", null, { push: 10 }).feet === 10 && R.slideApply("Eldritch Blast", null, { push: 10 }).on === "hit");
check("apply.mule", R.slideApply("Mule Kick", fail, { push: 20 }).feet === 20 && R.slideApply("Mule Kick", ok, { push: 20 }) === null);
check("note.push", R.pushNote("Pushed 10 ft") === true && R.pushNote("Prone") === false);

const shoved = R.landResolved(R.emptyBag(null), { row: wave, name: "Thunderwave", targetId: "t1", casterId: "wiz", hit: true, failed: true });
check("chip.none", names(shoved.chips).indexOf("Pushed 10 ft") < 0 && shoved.changed === false, names(shoved.chips).join(","));
check("chip.log", /pushed 10 ft/.test(shoved.logs.join(" ")), shoved.logs.join(" | "));
check("chip.save", R.landResolved(R.emptyBag(null), { row: wave, targetId: "t1", hit: true, failed: false }).changed === false);
const prone = R.landResolved(R.emptyBag(null), { row: row("Thunderous Smite"), name: "Thunderous Smite", targetId: "t1", casterId: "pal", hit: true, failed: true });
check("smite.prone", names(prone.chips).indexOf("Prone") >= 0 && R.slideOf("Thunderous Smite").feet === 10 && R.slideOf("Thunderous Smite").on === "fail");
check("smite.wait", R.slideApply("Thunderous Smite", null) === null && R.slideApply("Thunderous Smite", fail).feet === 10);
check("area.note", Area.onFail("Thunderwave") === "Pushed 10 ft" && Area.onFail("Porch Boom") === "Pushed 10 ft");
const roll = Cast.rollCast({ spellName: "Porch Boom", slotLevel: 1, dc: 13 });
check("roll.note", roll.push === 10 && /push 10 ft/.test(roll.text) && roll.condition === "Pushed 10 ft", roll.text);

check("step.cardinal", M.pushStep(4, 0.2).x === 1 && M.pushStep(4, 0.2).y === 0);
check("step.diag", M.pushStep(3, 3).x === 1 && M.pushStep(3, 3).y === 1);
check("step.zero", M.pushStep(0, 0).x === 0 && M.pushStep(0, 0).y === 0);
const open = M.forcedDest({ x: 2, y: 2 }, { x: 1, y: 0 }, 2, 1, null, { cols: 20, rows: 20 });
check("walk.open", open.x === 4 && open.y === 2 && open.squares === 2, JSON.stringify(open));
const wall = { x1: 4, y1: 0, x2: 4, y2: 8, open: false };
const crosses = (a, b) => M.segmentBlocks(a.x, a.y, b.x, b.y, wall);
const stopped = M.forcedDest({ x: 2, y: 2 }, { x: 1, y: 0 }, 2, 1, crosses, { cols: 20, rows: 20 });
check("walk.wall", stopped.x === 3 && stopped.y === 2 && stopped.squares === 1, JSON.stringify(stopped));
const edge = M.forcedDest({ x: 8, y: 1 }, { x: 1, y: 0 }, 2, 1, null, { cols: 10, rows: 10 });
check("walk.edge", edge.x === 9 && edge.y === 1 && edge.squares === 1, JSON.stringify(edge));
const away = M.forcedDest({ x: 5, y: 5 }, { x: -1, y: -1 }, 2, 1, null, { cols: 20, rows: 20 });
check("walk.away", away.x === 3 && away.y === 3 && away.squares === 2, JSON.stringify(away));

const sheet = read("assets/js/sheet-extras.js");
const join = read("assets/js/dm-join.js");
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
check("wire.sheet", sheet.includes("function stampSlide") && sheet.includes("stampSlide(hitRow, row, rolled)") && sheet.includes("push: (row && row.push)"));
check("wire.join", join.includes("row.push = Number(entry.push)") && join.includes("row.pull = Number(entry.pull)"));
check("wire.dm", v2.includes("function slideMove") && v2.includes("function applyForcedSlide") && v2.includes("shoveToken") && v2.includes("pushNote"));
check("wire.failOnly", v2.includes("if (dealt > 0 || saveMove)") && v2.includes('meta.slideOn === "fail" && meta.failed === false'));
check("wire.map", map.includes("M.forcedDest") && map.includes("forced: true") && map.includes("spec.forced !== false"));
const shoveFn = map.split("function shoveToken")[1].split("function setTokenHidden")[0];
check("wire.noOa", !/leaveReach/.test(shoveFn));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nthunderwave push ok");

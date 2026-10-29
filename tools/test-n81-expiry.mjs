/**
 * N81 P0-5 — zone expiry from dur, and one DM Clear (sheet 0.3.165 / DMCC 0.2.178).
 *   node tools/test-n81-expiry.mjs
 * rules.js is not regenerated. Aim-then-cast and zonePhase stay in place.
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
const Z = context.SSDNSSpellZones;
const R = context.SSDNSSpellRiders;
const fixed = function () { return 4; };
function at(x, y) { return { origin: { x: x, y: y }, facing: 0, area: null }; }
const mob = { x: 10, y: 10, size: 1, id: "mob", name: "Goblin" };

check("dur.min", Z.roundsFromDur("1 min") === 10 && Z.roundsFromDur("1 minute") === 10);
check("dur.ten", Z.roundsFromDur("10 min") === 100);
check("dur.hour", Z.roundsFromDur("1 hour") === 600 && Z.roundsFromDur("8 hours") === 4800);
check("dur.blank", Z.roundsFromDur("") === 0 && Z.roundsFromDur("until dispelled") === 0);

const light = Z.buildZone("Light", at(4, 4), { slot: 0, casterId: "ada" });
const day = Z.buildZone("Daylight", at(6, 6), { slot: 3, casterId: "ada" });
const moon = Z.buildZone("Moonbeam", at(10, 10), { slot: 2, casterId: "ada", dc: 15 });
const faith = Z.buildZone("Guardian of Faith", at(10, 10), { slot: 4, casterId: "ada", dc: 15 });
check("light.rounds", light && !light.conc && light.dur === "1 hour" && light.rounds === 600 && light.roundsLeft === 600);
check("day.rounds", day && !day.conc && day.rounds === 600 && day.roundsLeft === 600);
check("moon.rounds", moon && moon.conc && moon.dur === "1 min" && moon.rounds === 10 && moon.roundsLeft === 10);
check("faith.rounds", faith && !faith.conc && faith.dur === "8 hours" && faith.rounds === 4800 && faith.budget === 60 && faith.spent === 0);

const held = Z.tickRounds([moon], 9);
check("moon.holds", held.removed.length === 0 && held.zones.length === 1 && held.zones[0].roundsLeft === 1);
check("moon.stillticks", Z.phaseDue({ zones: held.zones }, mob, "start", fixed).length === 1 && Z.phaseDue({ zones: held.zones }, mob, "end", fixed).length === 0);
const moonDone = Z.tickRounds(held.zones, 1);
check("moon.expires", moonDone.zones.length === 0 && moonDone.removed.length === 1 && /Moonbeam expires \(1 min\)/.test(moonDone.logs[0] || ""));
check("moon.jump", Z.tickRounds([moon], 10).removed.length === 1 && Z.tickRounds([moon], 10).zones.length === 0);

const lightLong = Z.tickRounds([light], 599);
check("light.holds", lightLong.zones.length === 1 && lightLong.zones[0].roundsLeft === 1 && lightLong.removed.length === 0);
const lightDone = Z.tickRounds(lightLong.zones, 1);
check("light.expires", lightDone.zones.length === 0 && /Light expires \(1 hour\)/.test(lightDone.logs[0] || ""));
check("day.expires", Z.tickRounds([day], 600).removed.length === 1 && /Daylight expires/.test(Z.tickRounds([day], 600).logs[0] || ""));
check("faith.expires", Z.tickRounds([faith], 4800).removed.length === 1 && Z.tickRounds([faith], 4799).zones[0].roundsLeft === 1);

const legacy = Z.tickRounds([{ id: "old", spell: "Light", dur: "1 hour" }], 1);
check("legacy.backfill", legacy.zones.length === 1 && legacy.zones[0].rounds === 600 && legacy.zones[0].roundsLeft === 599);
check("untimed.stays", Z.tickRounds([{ id: "u", spell: "Odd", dur: "" }], 50).zones.length === 1);

let pool = [faith];
let spent = Z.charge(pool, faith.id, 40);
check("faith.budget", !spent.ended && spent.zones[0].spent === 40 && spent.zones[0].roundsLeft === 4800);
spent = Z.charge(spent.zones, faith.id, 20);
check("faith.budgetends", !!spent.ended && spent.ended.spent === 60 && spent.zones.length === 0);

const placed = Z.place({ zones: [], conc: "" }, moon);
check("conc.break", R.breakConc(placed.bag, "Moonbeam").bag.zones.length === 0 && R.breakConc(placed.bag, "Moonbeam").bag.conc === "");
const recast = Z.place(placed.bag, Z.buildZone("Moonbeam", at(2, 2), { slot: 2, casterId: "ada", dc: 15, id: "moon2" }));
check("recast", recast.replaced.length === 1 && recast.bag.zones.length === 1 && recast.bag.zones[0].id === "moon2" && recast.bag.zones[0].roundsLeft === 10);

const scene = [light, moon, faith];
const one = Z.clearZones(scene, { id: moon.id });
check("clear.one", one.removed.length === 1 && one.removed[0].spell === "Moonbeam" && one.logs[0] === "DM cleared Moonbeam grid" && one.zones.length === 2 && one.zones.some((z) => z.spell === "Light") && one.zones.some((z) => z.spell === "Guardian of Faith"));
const all = Z.clearZones(scene, { all: true });
check("clear.all", all.zones.length === 0 && all.removed.length === 3 && all.logs.every((line) => line.indexOf("DM cleared ") === 0 && line.indexOf(" grid") > 0));
check("clear.miss", Z.clearZones(scene, { id: "nope" }).removed.length === 0 && Z.clearZones(scene, { id: "nope" }).zones.length === 3);
check("clear.keepsbudget", Z.clearZones([faith], { id: faith.id }).removed[0].budget === 60);

const sheet = read("assets/js/sheet-extras.js");
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const playerAt = map.indexOf("ssdns-playercard");
const attackAt = map.indexOf("attack effects");
const dmHtml = map.slice(0, playerAt);
const playerHtml = map.slice(playerAt, attackAt);
const expireAt = v2.indexOf("      expireSpellZones();");
const endAt = v2.indexOf('zonePhase(ending, "end")');
const startAt = v2.indexOf('zonePhase(phaseWho, "start")');
check("ui.dm", dmHtml.includes('data-act="clearAllZonesBtn"') && dmHtml.includes("Clear all grids") && dmHtml.includes("Spell grids"));
check("ui.player", playerAt > 0 && !playerHtml.includes("clearAllZonesBtn") && !playerHtml.includes("Clear all grids") && !playerHtml.includes("Spell grids"));
check("ui.guard", map.includes('if (role !== "dm") return'));
check("wire.order", endAt > 0 && expireAt > endAt && startAt > expireAt);
check("wire.clear", v2.includes('addEventListener("ssdns-zone-clear"') && v2.includes("endRemovedZones"));
check("wire.phase", v2.includes("function zonePhase") && v2.includes("Z.phaseDue") && map.includes("placeBlast"));
check("wire.sheet", sheet.includes("noteLiveZones") && sheet.includes("noBlast") && read("assets/js/dm-join.js").includes("endSpell(payload.spell || \"\", payload || {})"));
check("aim.still", map.includes("function placeBlast") || map.includes("placeBlast("));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.165" && ver.dmcc === "0.2.178" && ver.sheetBuild === "sheet-playtest-v03165" && ver.dmccBuild === "dmcc-playtest-v02178");
const rules = read("assets/data/rules.js");
check("rules.clean", !rules.includes("0.3.165") && !rules.includes("0.2.178") && !rules.includes("roundsFromDur") && !rules.includes("spell-zones") && !read("database.rules.json").includes("0.3.165"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn81 expiry ok");

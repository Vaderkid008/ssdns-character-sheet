/**
 * Zone timer badges (sheet 0.3.195 / DMCC 0.2.208).
 *   node tools/test-zone-timer-badge.mjs
 * DM plate reads the shared roundsLeft. Two copies of one spell get a number
 * and a caster on the badge and the Clear row. Hover uses pulseZoneId.
 * Players do not get the plate. Clear all stays in the Spell grids panel.
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
function at(x, y, facing) { return { origin: { x: x, y: y }, facing: facing || 0, area: null }; }
function filled(pips) { return (pips || []).filter(Boolean).length; }

const wall = Z.buildZone("Wall of Fire", at(8, 6), { slot: 4, casterId: "p_jolene", casterName: "Jolene" });
check("wof.lock", wall && wall.dur === "1 min" && wall.rounds === 10 && wall.roundsLeft === 10 && wall.casterName === "Jolene");
const fresh = Z.badgeView(wall);
check("badge.full", fresh.show && fresh.text === "10 rd" && fresh.low === false && fresh.pips.length === 10 && filled(fresh.pips) === 10, JSON.stringify(fresh));

let held = [wall];
held = Z.tickRounds(held, 3).zones;
const seven = Z.badgeView(held[0]);
check("badge.seven", held[0].roundsLeft === 7 && seven.text === "7 rd" && seven.low === false && filled(seven.pips) === 7 && seven.pips.length === 10, JSON.stringify(seven));
held = Z.tickRounds(held, 4).zones;
const three = Z.badgeView(held[0]);
check("badge.ember", held[0].roundsLeft === 3 && three.text === "3 rd" && three.low === true && filled(three.pips) === 3 && three.pips[3] === false, JSON.stringify(three));
check("badge.four", Z.badgeView(Object.assign({}, wall, { roundsLeft: 4 })).low === false);
check("badge.one", Z.badgeView(Object.assign({}, wall, { roundsLeft: 1 })).text === "1 rd" && Z.badgeView(Object.assign({}, wall, { roundsLeft: 1 })).low === true);

const light = Z.buildZone("Light", at(2, 2), { slot: 0, casterId: "ada" });
const dayPips = Z.badgeView(light);
check("badge.hour", light.rounds === 600 && dayPips.pips.length === 10 && filled(dayPips.pips) === 10 && dayPips.low === false);
const almost = Z.badgeView(Object.assign({}, light, { roundsLeft: 3 }));
check("badge.hourLow", almost.low === true && almost.text === "3 rd" && filled(almost.pips) === 1 && almost.pips.length === 10, JSON.stringify(almost));
const half = Z.badgeView(Object.assign({}, light, { roundsLeft: 300 }));
check("badge.hourHalf", filled(half.pips) === 5 && half.pips.length === 10);
check("badge.untimed", Z.badgeView({ id: "u", spell: "Odd", dur: "" }).show === false);

const grease = Z.buildZone("Grease", at(14, 12), { slot: 1, casterId: "p_caleb", casterName: "Caleb" });
check("grease.ten", grease && grease.rounds === 10 && Z.zoneIconKind(grease) === "grease" && Z.zoneIconKind(wall) === "fire");

const other = Z.buildZone("Wall of Fire", at(18, 10, Math.PI / 2), { id: "wof-caleb", slot: 4, casterId: "p_caleb", casterName: "Caleb" });
other.roundsLeft = 3;
const named = Z.zoneMarks([Object.assign({}, wall, { roundsLeft: 7, id: "wof-jolene" }), other, grease], { p_jolene: "Jolene", p_caleb: "Caleb" });
check("multi.count", named.length === 3 && named[0].multi && named[0].n === 1 && named[1].n === 2 && named[2].multi === false && named[2].n === 0, JSON.stringify(named.map(m => [m.spell, m.n, m.who])));
check("multi.who", named[0].who === "1 · Jolene" && named[1].who === "2 · Caleb" && named[2].who === "");
check("multi.clear", named[0].clearLabel === "Clear Wall of Fire · 1 · Jolene · 7 rds left" && named[1].clearLabel === "Clear Wall of Fire · 2 · Caleb · 3 rds left" && named[1].low === true && named[2].clearLabel === "Clear Grease · 10 rds left");
check("multi.oneLeft", Z.zoneMarks([Object.assign({}, wall, { roundsLeft: 1 })])[0].clearLabel === "Clear Wall of Fire · 1 rd left");
const lone = Z.zoneMarks([wall]);
check("single.plain", lone.length === 1 && lone[0].n === 0 && lone[0].who === "" && lone[0].clearLabel === "Clear Wall of Fire · 10 rds left");

check("pulse.hit", Z.pulseZoneId([wall, other], other.id) === String(other.id));
check("pulse.miss", Z.pulseZoneId([wall], "nope") === "" && Z.pulseZoneId([wall], "") === "");

const placed = Z.place({ zones: [], conc: "" }, wall);
check("conc.clear", R.breakConc(placed.bag, "Wall of Fire").bag.zones.length === 0 && R.breakConc(placed.bag, "Wall of Fire").bag.conc === "");

const map = read("map/ssdns-map.js");
const css = read("map/ssdns-map.css");
const clearAt = map.indexOf("function renderZoneClear");
const clearFn = map.slice(clearAt, map.indexOf("function adoptSpellZones"));
check("map.pulseHook", clearFn.includes("mouseenter") && clearFn.includes("armZonePulse") && map.includes("function armZonePulse") && map.includes("pulseZoneId"));
check("map.sync", map.includes("function syncZoneClear") && map.includes("syncZoneClear()"));
const badgeAt = map.indexOf("function paintZoneBadges");
const badgeFn = map.slice(badgeAt, map.indexOf("function paintSpellZones"));
check("map.dmOnly", badgeFn.includes('role !== "dm"') && badgeFn.includes("zoneBadgeLayer.hidden = true"));
check("map.noCanvasRd", !map.includes('fillText((zone.spell || "Wall of Fire")') && !map.includes('fillText((zone.spell || "Zone")'));
check("map.panel", map.includes("ssm-spell-grids") && map.includes("ssm-right-scroll") && map.includes('data-act="clearAllZonesBtn"'));
check("css.pin", css.includes(".ssm-spell-grids") && css.includes(".ssm-right-scroll") && /ssm-right-scroll[\s\S]{0,240}overflow:\s*auto/.test(css) && css.includes("clearAllZonesBtn") && /clearAllZonesBtn[\s\S]{0,220}flex:\s*0\s*0\s*auto/.test(css));
check("css.player", css.includes(".ssdns-role-player .ssm-zone-badges") && css.includes("display: none"));
check("css.ember", css.includes(".ssm-zb.is-low") && css.includes("#d0602a"));
check("wire.caster", read("dm/assets/js/v2.js").includes("casterName:"));

const ver = JSON.parse(read("version.json"));
check("ver.tip", ver.sheet === "0.3.195" && ver.dmcc === "0.2.208" && ver.sheetBuild === "sheet-playtest-v03195" && ver.dmccBuild === "dmcc-playtest-v02208", JSON.stringify(ver));
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.195"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.208"'));
const rules = read("assets/data/rules.js");
check("rules.clean", !rules.includes("0.3.195") && !rules.includes("0.2.208") && !read("database.rules.json").includes("0.3.195"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nzone timer badge ok");

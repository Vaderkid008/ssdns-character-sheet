/**
 * N79 Phase 1c D — zones on the aim-then-cast placer (sheet 0.3.161 / DMCC 0.2.174).
 *   node tools/test-n79-zones.mjs
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
vm.runInContext(read("assets/js/spell-buffs.js"), context);
vm.runInContext(read("assets/js/spell-riders.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
vm.runInContext(read("assets/js/spell-zones.js"), context);
const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const Z = context.SSDNSSpellZones;
const R = context.SSDNSSpellRiders;
const Cast = context.SSDNSSpellCast;
const Area = context.SSDNSSpellArea;

function placedAt(x, y, facing) {
  return { origin: { x: x, y: y }, facing: facing || 0, area: null };
}
const fixed = function () { return 3; };

check("dark.radius", Z.dressArea("Darkness", null, 2).radius === 15 && Z.dressArea("Darkness", null, 2).shape === "sphere");
const dark = Z.buildZone("Darkness", placedAt(10, 10), { slot: 2, casterId: "ada" });
check("dark.flags", dark.magicalDark && dark.conc && dark.blocksDarkvision && dark.blocksNonmagical && dark.dispelsLightAtOrBelow === 2);
check("dark.hide", Z.hides(10, 10, [dark], { x: 4, y: 10, devilsSight: false, darkvision: 60 }) === true);
check("dark.devil", Z.hides(10, 10, [dark], { x: 8, y: 10, devilsSight: true }) === false);
check("dark.devilfar", Z.hides(10, 10, [dark], { x: 40, y: 10, devilsSight: true }) === true);
check("dark.torch", Z.lightBlocked({ magical: false, spellLevel: null }, 10, 10, [dark]) === true);
check("dark.daylightpt", Z.lightBlocked({ magical: true, spellLevel: 3, id: "daylight" }, 10, 10, [dark]) === false);
check("dark.cantrip", Z.lightBlocked({ magical: true, spell: true, spellLevel: 0 }, 10, 10, [dark]) === true);
check("dark.feature", Z.lightBlocked({ magical: true, feature: true }, 10, 10, [dark]) === false);

const light = Z.buildZone("Light", placedAt(10, 10), { slot: 0, casterId: "ada" });
check("light.radii", light.light.bright === 20 && light.light.dim === 20 && light.radius === 20);
const day = Z.buildZone("Daylight", placedAt(10, 10), { slot: 3, casterId: "ada" });
check("day.radii", day.light.bright === 60 && day.light.dim === 60 && day.radius === 60);
const overlap = Z.place({ zones: [dark] }, light);
check("dark.dispelslight", overlap.bag.zones.length === 1 && overlap.bag.zones[0].key === "darkness" && /dispels/.test(overlap.log));
const dayOver = Z.place({ zones: [dark] }, day);
check("day.dispelsdark", dayOver.bag.zones.length === 1 && dayOver.bag.zones[0].key === "daylight" && /dispels/.test(dayOver.log));

const fog1 = Z.dressArea("Fog Cloud", Area.areaOf("Fog Cloud"), 1);
const fog2 = Z.dressArea("Fog Cloud", Area.areaOf("Fog Cloud"), 2);
check("fog.up", fog1.radius === 20 && fog2.radius === 40 && fog1.shape === "sphere");
const fog = Z.buildZone("Fog Cloud", placedAt(6, 6), { slot: 1, casterId: "ada" });
check("fog.hide", fog.heavilyObscured && !fog.magicalDark && Z.hides(6, 6, [fog], { x: 6, y: 6, devilsSight: true }) === true);
check("fog.conc", fog.conc && fog.dur === "1 hour");

const hunger = Z.buildZone("Hunger of Hadar", placedAt(4, 4), { slot: 3, casterId: "ada", dc: 15 });
check("hunger.blind", hunger.blindedInside && hunger.noLight && Z.viewerBlinded({ x: 4, y: 4, devilsSight: true }, [hunger]) === true);
check("hunger.outside", Z.hides(4, 4, [hunger], { x: -2, y: 4, devilsSight: true }) === false);
check("hunger.nolight", Z.lightBlocked({ magical: true, spellLevel: 3 }, 4, 4, [hunger]) === true);
check("hunger.defer", Z.defersCast("Hunger of Hadar") === true);
const cold = Z.phaseDue({ zones: [hunger] }, { x: 4, y: 4, size: 1, id: "mob" }, "start", fixed);
const acid = Z.phaseDue({ zones: [hunger] }, { x: 4, y: 4, size: 1, id: "mob" }, "end", fixed);
check("hunger.cold", cold.length === 1 && cold[0].type === "cold" && cold[0].auto && cold[0].amount === 6 && !cold[0].save);
check("hunger.acid", acid.length === 1 && acid[0].type === "acid" && acid[0].save === "DEX" && acid[0].amount == null && acid[0].half === false);
const hungerGone = Z.place({ zones: [hunger] }, day);
check("day.dispels hunger", hungerGone.bag.zones.every((z) => z.key !== "hunger of hadar"));

const fire = Z.buildZone("Wall of Fire", placedAt(10, 10), { slot: 4, casterId: "ada" });
const ice = Z.buildZone("Wall of Ice", placedAt(10, 10), { slot: 6, casterId: "ada" });
const thorns = Z.buildZone("Wall of Thorns", placedAt(10, 10), { slot: 6, casterId: "ada" });
const blades = Z.buildZone("Blade Barrier", placedAt(10, 10), { slot: 6, casterId: "ada" });
const wind = Z.buildZone("Wind Wall", placedAt(10, 10), { slot: 3, casterId: "ada" });
check("wall.aim", [fire, ice, thorns, blades, wind].every((z) => z.shape === "wall"));
check("fire.appear", fire.appear.dice === "5d8" && fire.appear.type === "fire" && fire.appear.save === "DEX" && fire.appear.half);
check("fire.hot", Z.phaseDue({ zones: [fire] }, { x: 10, y: 11, size: 1 }, "end", fixed).some((t) => t.type === "fire" && !t.save && t.hot));
check("ice.through", Z.moveDue([ice], { x: 10, y: 8 }, { x: 10, y: 12 }, { size: 1, id: "m" }, fixed).some((t) => t.save === "CON" && t.dice === "5d6" && t.type === "cold"));
check("thorns.types", thorns.appear.type === "piercing" && Z.moveDue([thorns], { x: 10, y: 8 }, { x: 10, y: 12 }, { size: 1, id: "m" }, fixed).some((t) => t.type === "slashing" && t.dice === "7d8"));
check("blades.ticks", blades.appear.dice === "6d10" && Z.phaseDue({ zones: [blades] }, { x: 10, y: 10, size: 1 }, "start", fixed).some((t) => t.dice === "6d10" && t.save === "DEX"));
check("wind.cross", wind.appear.dice === "3d8" && wind.appear.save === "STR" && Z.crossesWall([wind], { x: 10, y: 8 }, { x: 10, y: 12 }).indexOf("Wind Wall") >= 0);
check("wind.up", Z.appearOf("Wall of Fire", 5).dice === "6d8");

const put = Z.place({ conc: "", marks: [], zones: [], ticks: [] }, dark);
check("place.log", /ZONE Darkness placed/.test(put.log) && put.bag.conc === "Darkness" && put.bag.zones.length === 1);
const broke = R.breakConc(put.bag, "Darkness");
check("conc.dropszone", broke.bag.zones.length === 0 && broke.bag.conc === "");

const rowDark = Cast.lookup("Darkness");
const rowWind = Cast.lookup("Wind Wall");
const rowThorn = Cast.lookup("Wall of Thorns");
const rowHunger = Cast.lookup("Hunger of Hadar");
check("patch.dark", rowDark && rowDark.level === 2 && rowDark.conc === true);
check("patch.wind", rowWind && rowWind.kind === "save" && rowWind.dice === "3d8" && rowWind.save === "STR" && rowWind.conc === true);
check("patch.thorns", rowThorn && rowThorn.type === "piercing" && rowThorn.through === "slashing");
check("patch.hunger", rowHunger && rowHunger.applyNow === false && rowHunger.tickEnd && rowHunger.tickEnd.type === "acid");

const sheet = read("assets/js/sheet-extras.js");
const map = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const rules = read("assets/data/rules.js");
const rulesDb = read("database.rules.json");
check("wire.sheet", sheet.includes("SSDNSSpellZones") && sheet.includes("rememberZone") && sheet.includes("ssdns-zone-tick"));
check("wire.map", map.includes("paintSpellZones") && map.includes("setSpellZones") && map.includes("noteZoneCross") && map.includes("DIS: wind wall"));
check("wire.dm", v2.includes("adoptCastZone") && v2.includes("zonePhase") && v2.includes("defersCast"));
check("wire.html", read("index.html").includes("spell-zones.js") && read("dm/index.html").includes("spell-zones.js"));
check("aim.family", map.includes("needsAim") && /area\.shape === \"wall\"/.test(map));
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.161" && ver.dmcc === "0.2.174" && ver.sheetBuild === "sheet-playtest-v03161" && ver.dmccBuild === "dmcc-playtest-v02174");
check("rules.clean", !rules.includes("0.3.161") && !rules.includes("spell-zones") && !rulesDb.includes("0.3.161") && !rulesDb.includes("0.2.174"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn79 zones ok");

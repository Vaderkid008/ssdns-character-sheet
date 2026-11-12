/**
 * Food and water stays optional (Off / Loose / Strict, default Off).
 * Eat, meters, forage/hunt, horse feed, and a sated hot meal.
 * No spoilage. No new combat bonus. Sheet 0.3.300 / DMCC 0.2.313.
 *   node tools/test-food-water-03258.mjs
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.300" && ver.dmcc === "0.2.313" && ver.sheetBuild === "sheet-playtest-v03300" && ver.dmccBuild === "dmcc-playtest-v02313");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.300") && !read("database.rules.json").includes("0.3.300") && !read("assets/data/rules.js").includes("hotMeal"));
check("bestiary.kept", read("dm/assets/js/v2.js").includes("bestiary.json?v=0.2.249-spell-tokens"));

const sheet = read("assets/js/supplies-sheet.js");
const dm = read("dm/assets/js/supplies-dm.js");
const core = read("assets/js/supplies.js");
const map = read("map/ssdns-map.js");
check("ui.eat", sheet.includes('id="btnEat"') && sheet.includes("sup-meters") && sheet.includes(">Fed</span>") && sheet.includes(">Water</span>"));
check("ui.hideOff", sheet.includes('v.mode === "off"') && sheet.includes("box.hidden = true"));
check("ui.hot", sheet.includes('id="btnHotMeal"') && sheet.includes("You are sated"));
check("ui.forage", dm.includes('id="supForageDc"') && dm.includes('id="btnSupForage"') && dm.includes('id="btnSupHunt"') && dm.includes('cfg.mode === "off"') && dm.includes("ASSUMED: a success grants 1 ration"));
check("ui.playersOnly", dm.includes("Player characters only") && !map.includes("hotMeal") && !map.includes("eatNow"));
check("ui.noSpoil", !/function spoil|setInterval\(/.test(core) && core.includes("No spoilage") && dm.includes("does not spoil") && !dm.includes("Hot meals and campfires are still not"));

const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null };
vm.createContext(ctx);
["assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/items.js", "assets/js/supplies.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const S = ctx.SSDNSSupplies;
const Items = ctx.SSDNSItems;
const pot = Items.byId("cook-pot");
check("pot.identity", pot && pot.name === "Cook pot" && pot.capacity === 1 && /1 gallon/.test(pot.description || pot.effect.text || ""));

function pc(mode) {
  const c = { items: [], speed: 30, mounted: false, abilities: { CON: 10 } };
  S.ensure(c).mode = mode;
  return c;
}

let c = pc("off");
S.giveRations(c, 2);
S.giveWater(c, 2);
Items.add(c, pot);
Items.add(c, Items.byId("riding-horse-cow-pony"));
const before = S.rations(c);
check("off.default", S.defaults().mode === "off");
check("off.eat", S.eatNow(c).ok === false && S.rations(c) === before);
check("off.hot", S.hotMeal(c).ok === false && S.rations(c) === before && S.ensure(c).sated !== true);
check("off.horse", S.feedMount(c, S.mounts(c)[0].key).ok === false && S.tick(c, { conMod: 0 }) && S.mounts(c).every((m) => !m.hungry));

c = pc("strict");
S.giveRations(c, 2);
S.giveWater(c, 2);
const ate = S.eatNow(c);
const view = S.view(c);
check("on.eat", ate.ok === true && ate.ate === 1 && view.rations === 1 && view.daysHungry === 0 && view.mode === "strict");
check("on.meters", view.water > 0 && typeof view.daysHungry === "number");

c = pc("loose");
S.giveRations(c, 1);
check("hot.needsPot", S.hotMeal(c).ok === false && S.rations(c) === 1);
Items.add(c, pot);
const meal = S.hotMeal(c);
const after = S.view(c);
const stillPot = c.items.filter((it) => (it.catalogId || it.id) === "cook-pot")[0];
check("hot.sated", meal.ok === true && meal.sated === true && meal.bonus == null && meal.ate === 1 && after.sated === true && after.rations === 0 && after.daysHungry === 0 && stillPot && stillPot.capacity === 1, JSON.stringify({ meal, after, cap: stillPot && stillPot.capacity }));
S.tick(c, { conMod: 0 });
check("hot.clears", S.view(c).sated === false);

c = pc("strict");
Items.add(c, Items.byId("riding-horse-cow-pony"));
Items.add(c, Items.byId("mule"));
const enemy = { catalogId: "riding-horse-cow-pony", name: "Bandit horse" };
check("horse.ownedOnly", S.mounts(c).length === 2 && S.mounts({ items: [enemy], supplies: { mode: "strict", mounts: {} } }).length === 1);
S.tick(c, { conMod: 0 });
const hungry = S.mounts(c).filter((m) => m.hungry);
check("horse.strict", hungry.length === 2 && hungry.every((m) => m.speed === m.baseSpeed - 10));
c.mounted = true;
check("horse.disadvantage", S.handlingNote(c).indexOf("disadvantage") === 0 && S.mountedAttackNote(c) === "disadvantage: hungry mount");
c = pc("off");
Items.add(c, Items.byId("riding-horse-cow-pony"));
S.tick(c, { conMod: 0 });
check("horse.off", S.mounts(c).every((m) => !m.hungry) && S.handlingNote(c) === "" && S.mountedAttackNote(c) === "");

check("forage.kinds", dm.includes('kind === "hunt" ? "hunt"') && dm.includes('b.id === "btnSupHunt"') && dm.includes("supForageDc"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("food water ok");

/**
 * L0216 horse feed. Same Off / Loose / Strict dial and the same end-of-day tick as food.
 * One portion (5 ES, 10 lb) feeds one horse or pack mule. No spoilage. No exhaustion.
 *   node tools/test-horse-feed.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");
const sheet = read("assets/js/supplies-sheet.js");
const dm = read("dm/assets/js/supplies-dm.js");
const extras = read("assets/js/sheet-extras.js");
check("rules.untouched", !rules.includes("tickMounts") && !rules.includes("horseFeed") && !rulesJs.includes("tickMounts") && !rulesJs.includes("0.3.159"));
check("ui.player", sheet.includes('data-feed-mount') && sheet.includes(">Feed</button>") && sheet.includes("horse feed"));
check("ui.dm", dm.includes("Give feed") && dm.includes("Clear Hungry") && dm.includes("data-sup-graze") && dm.includes("Horse feed does not spoil"));
check("ui.noCampfire", !dm.includes("hot meal") && !dm.includes("campfire cook") && dm.includes("Hot meals and campfires are still not"));
check("wire.attacks", extras.includes("mountedAttackNote") && extras.includes("handlingNote") && extras.includes("mountAttackExtra"));

const ctx = { console, setTimeout, clearTimeout };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null };
vm.createContext(ctx);
["assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/items.js", "assets/js/supplies.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
const S = ctx.SSDNSSupplies;
const Items = ctx.SSDNSItems;
const feed = Items.byId("feed-1-day");
check("item.name", feed.name === "Horse feed (oats/hay/grain)" && feed.price === 5 && feed.weight === 10 && feed.feedDays === 1 && !S.isFood(feed));

function pc(mode) {
  const c = { items: [], speed: 30, mounted: false, abilities: { WIS: 12 } };
  S.ensure(c).mode = mode;
  return c;
}
function addMount(c, id) { Items.add(c, Items.byId(id)); }
function horse(c) { return S.mounts(c).filter((m) => m.catalogId === "riding-horse-cow-pony")[0]; }

let c = pc("off");
addMount(c, "riding-horse-cow-pony");
addMount(c, "mule");
addMount(c, "cart");
S.giveFeed(c, 1);
check("off.noSpend", S.tick(c, { conMod: 0 }) && S.feedPortions(c) === 1 && S.mounts(c).every((m) => !m.hungry) && S.mounts(c).length === 2, J(S.mounts(c)));
check("off.notFood", S.rations(c) === 0);

c = pc("loose");
addMount(c, "riding-horse-cow-pony");
const beforeExh = c.supplies.daysHungry;
S.tick(c, { conMod: 0 });
check("loose.skip", horse(c) && !horse(c).hungry && S.feedPortions(c) === 0 && c.supplies.daysHungry === beforeExh + 1, J(S.mounts(c)));

c = pc("strict");
addMount(c, "mule");
addMount(c, "cavalry-horse");
S.giveFeed(c, 1);
const speedBefore = c.speed;
S.tick(c, { conMod: 0 });
const rows = S.mounts(c);
const fed = rows.filter((m) => !m.hungry);
const hungry = rows.filter((m) => m.hungry);
check("strict.oneEach", fed.length === 1 && hungry.length === 1 && S.feedPortions(c) === 0, J(rows));
check("strict.speed", hungry[0].speed === hungry[0].baseSpeed - 10 && c.speed === speedBefore && !("exhaustion" in c), J(hungry[0]));
check("strict.handling", /hungry/.test(S.handlingNote(c)) && S.mountedAttackNote(c) === "");
c.mounted = true;
check("strict.mounted", S.mountedAttackNote(c) === "disadvantage: hungry mount");

c = pc("strict");
addMount(c, "draft-freight-horse");
const m = S.mounts(c)[0];
S.setGrazing(c, m.key, true);
S.giveFeed(c, 2);
S.tick(c, { conMod: 0 });
check("strict.grazing", S.feedPortions(c) === 2 && !S.mounts(c)[0].hungry && S.mounts(c)[0].grazing, J(S.mounts(c)));

c = pc("strict");
addMount(c, "riding-horse-cow-pony");
const key = S.mounts(c)[0].key;
S.tick(c, { conMod: 0 });
check("strict.hungry", S.mounts(c)[0].hungry === true && S.mounts(c)[0].speed === 50);
S.giveFeed(c, 1);
const fedNow = S.feedMount(c, key);
check("feed.clears", fedNow.ok === true && !S.mounts(c)[0].hungry && S.feedPortions(c) === 0 && S.mounts(c)[0].speed === 60, J(fedNow));
S.tick(c, { conMod: 0 });
check("feed.prepaid", !S.mounts(c)[0].hungry, J(S.mounts(c)));

c = pc("strict");
addMount(c, "mule");
S.tick(c, { conMod: 0 });
S.clearHungry(c, S.mounts(c)[0].key);
check("clear.dm", S.mounts(c)[0].hungry === false && S.feedPortions(c) === 0);

c = pc("strict");
S.giveFeed(c, 3);
S.giveRations(c, 2);
check("feed.notRations", S.rations(c) === 2 && S.feedPortions(c) === 3 && S.giveFeed(c, -1) === 2);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("horse feed ok");

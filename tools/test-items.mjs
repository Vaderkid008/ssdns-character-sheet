/**
 * Sheet 0.3.54 / DMCC 0.2.67 item catalog, effect kinds, weight, quest rob.
 *   node tools/test-items.mjs
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

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  readyState: "complete",
  getElementById: function () { return null; },
  addEventListener: function () {},
  querySelector: function () { return null; }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/data/item-catalog.js"), sandbox, { filename: "assets/data/item-catalog.js" });
vm.runInContext(read("assets/js/items.js"), sandbox, { filename: "assets/js/items.js" });
vm.runInContext(read("assets/js/grab.js"), sandbox, { filename: "assets/js/grab.js" });
const Items = sandbox.SSDNSItems;
const Grab = sandbox.SSDNSGrab;

const KINDS = ["heal", "castSpell", "attack", "save+condition", "buff", "text"];
const seeds = Items.seeds();
check("schema.count", seeds.length === 47, "got " + seeds.length); /* 0.3.85: + bread, cheese, meat chunk (L0191); 0.3.98: + borrowed-iron (L0197) */
check("schema.effects", Items.SCHEMA.effects.join(",") === KINDS.join(","));
const ids = seeds.map((row) => row.id);
check("schema.unique", new Set(ids).size === 47);
check("schema.valid", seeds.every((row) => Items.valid(Items.normalize(row))));
const seen = {};
seeds.forEach((row) => { seen[row.effect.kind] = true; });
check("schema.kinds", KINDS.every((kind) => seen[kind]), JSON.stringify(Object.keys(seen)));
check("schema.stable", ids.indexOf("assay-tonic-trail-draught") >= 0 && ids.indexOf("dynamite-stick-standard-fuse") >= 0 && ids.indexOf("cutlass") < 0 && ids.indexOf("cutlass-of-the-suns-fury") >= 0);

const STABLE = [
  "assay-tonic-trail-draught",
  "snakebite-antivenin-antitoxin",
  "blessed-water-saint-s-wash",
  "field-medic-kit",
  "hardtack-jerky-1-day",
  "whiskey-bottle",
  "trail-poison-illegal-in-most-towns",
  "dynamite-stick-standard-fuse",
  "dynamite-stick-sweating-sold-cheap",
  "blasting-keg",
  "lamp-oil",
  "fuse-cord-50-ft",
  "lariat-50-ft",
  "iron-cuffs",
  "caltrops-jack-nails-bag-of-20",
  "field-glass-spyglass",
  "gun-cleaning-kit"
];
check("schema.oldIds", STABLE.every((id) => ids.indexOf(id) >= 0));

function zero() { return 0; }
function face(n) { return (n - 1) / 20; }

const libation = Items.instanceFrom(Items.byId("assay-tonic-trail-draught"));
const heal = Items.use(libation, { name: "Ada", rng: zero });
check("effect.heal", heal.ok && heal.kind === "heal" && heal.total === 4 && heal.consume === true && /heals 4/.test(heal.chat), JSON.stringify(heal));

const greater = Items.use(Items.instanceFrom(Items.byId("greater-healing-libation")), { rng: zero });
check("effect.healGreater", greater.kind === "heal" && greater.total === 8);

const letter = Items.instanceFrom(Items.byId("glowing-letter-fireball"));
const cast = Items.use(letter, { name: "Ada", level: 5, rng: zero });
check("effect.cast", cast.ok && cast.kind === "castSpell" && cast.spell === "Fireball" && cast.level === 3 && cast.dc === 15 && cast.attack === 7 && cast.consume === true, JSON.stringify(cast));

const sealed = Items.use(Items.instanceFrom(Items.byId("glowing-letter")), { name: "Ada", level: 5 });
check("effect.castBlank", sealed.ok === false && /no spell/.test(sealed.reason));

const tooHigh = Items.use(letter, { name: "Ada", level: 1, intMod: 0, rng: function () { return face(1); } });
check("effect.castCheck", tooHigh.ok === false && tooHigh.consume === false && tooHigh.dc === 13, JSON.stringify(tooHigh));

const stick = Items.use(Items.instanceFrom(Items.byId("dynamite-stick-standard-fuse")), { name: "Ada", rng: (() => { let first = true; return () => (first ? (first = false, 0.06) : 0); })() });
check("effect.attack", stick.ok && stick.kind === "attack" && stick.total === 3 && stick.dc === 12 && stick.radius === 5 && stick.rings && stick.rings.kind === "thrown", JSON.stringify({ total: stick.total, rings: stick.rings }));

const keg = Items.ringSpec(Items.byId("blasting-keg"));
check("effect.placed", keg && keg.kind === "spell" && keg.range === "20 ft");

const whiskey = Items.use(Items.instanceFrom(Items.byId("whiskey-bottle")), { name: "Ada", rng: zero });
check("effect.save", whiskey.ok && whiskey.kind === "save+condition" && whiskey.save === "CON" && whiskey.dc === 10 && whiskey.condition === "Poisoned" && whiskey.tempHp === 1, JSON.stringify(whiskey));

const dust = Items.use(Items.instanceFrom(Items.byId("eldorite-dust")), { name: "Ada" });
check("effect.buff", dust.ok && dust.kind === "buff" && dust.consume === true && /1d4/.test(dust.chat));

const medic = Items.use(Items.instanceFrom(Items.byId("field-medic-kit")), { name: "Ada" });
check("effect.text", medic.ok && medic.kind === "text" && /Stabilize/.test(medic.chat) && medic.consume === true);

const addressed = Items.instanceFrom(Items.byId("glowing-letter-cure-wounds"), { addressedTo: "Ada" });
addressed.addressedTo = "Ada";
check("letter.blank", Items.addressedBlank(addressed, { name: "Bea" }) === true && Items.addressedBlank(addressed, { name: "Ada" }) === false && Items.addressedBlank(addressed, { name: "Bea", dm: true }) === false);
const blankUse = Items.use(addressed, { name: "Bea", viewer: { name: "Bea" } });
check("letter.blankUse", blankUse.ok === false && blankUse.blank === true);
const openUse = Items.use(addressed, { name: "Ada", level: 5, viewer: { name: "Ada" }, rng: zero });
check("letter.open", openUse.ok === true && openUse.spell === "Cure Wounds");

const warrant = Items.byId("bounty-warrant");
const warrantInst = Items.instanceFrom(warrant);
check("quest.rob", Items.canRob(warrantInst) === false && Items.canRob(warrantInst, { dmAllow: true }) === true && Items.canRob(warrantInst, { override: true }) === true);
check("quest.drop", Items.canDrop(warrantInst) === false && Items.canDrop(warrantInst, { dm: true, allow: true }) === true);
const sheet = { name: "Bea", items: [], guns: [], melee: [], explosives: [], abilities: { STR: 10 } };
check("quest.add", Items.add(sheet, warrant, { player: true }).ok === false && sheet.items.length === 0);
const given = Items.add(sheet, warrant, { dm: true });
check("quest.given", given.ok === true && given.item.type === "quest" && given.item.dmOnly === true);

const questBlock = Grab.plan({
  mode: "rob",
  take: "item",
  success: true,
  quest: true,
  itemUid: warrantInst.uid,
  item: warrantInst,
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "b", kind: "player", name: "Bea" }
});
check("quest.plan", questBlock.blocked === true && questBlock.commands.length === 0);

const locked = { name: "Ada", inventoryLocked: true, items: [], abilities: { STR: 10 } };
check("lock.add", Items.add(locked, Items.byId("hardtack-jerky-1-day"), { player: true }).ok === false);
check("lock.rob", Items.canRob({ name: "Hat" }, { inventoryLocked: true }) === false && Items.canRob({ name: "Hat" }, { inventoryLocked: true, override: true }) === true);

const playerItem = Items.add({ name: "Ada", items: [] }, { name: "Lucky coin", type: "gear", effect: { kind: "text", text: "A coin." } }, { player: true });
check("player.tag", playerItem.ok && playerItem.item.playerAdded === true && playerItem.item.approved === false);

Items.setRoom({ weightOn: false, catalog: {} });
const weighed = { abilities: { STR: 10 }, items: [Items.instanceFrom(Items.byId("assay-tonic-trail-draught"))] };
const off = Items.weightReport(weighed);
check("weight.off", off.on === false && off.carried === 0.5 && off.capacity === 150 && Items.carryCapacity(10) === 150);
Items.setRoom({ weightOn: true });
const on = Items.weightReport(weighed);
check("weight.on", on.on === true && on.carried === 0.5 && on.over === false);
weighed.items.push(Object.assign(Items.instanceFrom(Items.byId("blasting-keg")), { count: 8 }));
const heavy = Items.weightReport(weighed);
check("weight.over", heavy.on === true && heavy.carried === 160.5 && heavy.over === true && heavy.capacity === 150);
Items.setRoom({ weightOn: false });
check("weight.default", Items.room().weightOn === false);

const custom = Items.normalize({ id: "room-tonic", name: "Room Tonic", type: "consumable", effect: { kind: "heal", dice: "1d4" }, price: 10, forSale: true });
Items.setRoom({ weightOn: false, catalog: { "room-tonic": custom } });
check("catalog.room", Items.byId("room-tonic").name === "Room Tonic" && Items.catalog({ dm: true }).some((row) => row.id === "room-tonic"));
check("catalog.shop", Items.catalog({ forSale: true }).every((row) => row.forSale) && !Items.catalog({ forSale: true }).some((row) => row.id === "eldorite-dust" || row.id === "hat-of-the-sharpshooter" || row.id === "bounty-warrant"));

const store = JSON.parse(read("dm/assets/data/store-items.json"));
Items.setStore(store);
function storePrice(id) {
  const row = store.find((item) => item.id === id);
  return row && row.price_es != null && row.price_es !== "" ? row.price_es : null;
}
["dynamite-stick-standard-fuse", "dynamite-stick-sweating-sold-cheap", "blasting-keg", "fuse-cord-50-ft", "whiskey-bottle", "snakebite-antivenin-antitoxin", "field-glass-spyglass", "gun-cleaning-kit", "lariat-50-ft"].forEach((id) => {
  const got = Items.byId(id);
  check("price." + id, got.price === storePrice(id) && got.forSale === true && storePrice(id) != null, JSON.stringify(got && { price: got.price, forSale: got.forSale }));
});
check("price.l0164", Items.byId("dynamite-stick-standard-fuse").price === 2500 && Items.byId("dynamite-stick-sweating-sold-cheap").price === 1250 && Items.byId("blasting-keg").price === 10000);
check("price.libation", Items.byId("assay-tonic-trail-draught").price === 5000 && Items.byId("assay-tonic-trail-draught").forSale === true);
const drifted = store.map((row) => row.id === "dynamite-stick-standard-fuse" ? Object.assign({}, row, { price_es: 9999 }) : row);
drifted.push({ id: "hat-of-the-sharpshooter", price_es: 50 }, { id: "bounty-warrant", price_es: 20 });
Items.setStore(drifted);
check("price.follow", Items.byId("dynamite-stick-standard-fuse").price === 9999);
const pricedHat = Items.byId("hat-of-the-sharpshooter");
const pricedWarrant = Items.byId("bounty-warrant");
check("price.story", pricedHat.price == null && pricedHat.forSale === false && pricedWarrant.price == null && pricedWarrant.forSale === false);
Items.setStore(store);
check("catalog.questHidden", !Items.catalog({ dm: false }).some((row) => row.type === "quest") && Items.catalog({ dm: true }).some((row) => row.id === "black-shard"));

const spendSheet = { name: "Ada", items: [], abilities: { STR: 10 }, level: 5 };
const added = Items.add(spendSheet, Items.byId("assay-tonic-trail-draught"), { dm: true });
sandbox.SSDNSApp = {
  doc: function () { return { character: spendSheet }; },
  compute: function () { return { spellMod: 3, mods: { INT: 1 } }; },
  applyPatch: function () { spendSheet._patched = true; }
};
const chats = [];
sandbox.SSDNSDmJoin = { postChat: function (msg) { chats.push(msg.text); } };
const deltas = [];
sandbox.SSDNSSheet = { applyDelta: function (n) { deltas.push(n); }, addLog: function () {} };
const used = Items.useOnSheet(added.item.uid);
check("libation.sheet", used.ok && used.total === used.hp && deltas[0] === used.hp && spendSheet.items.length === 0 && chats.length === 1 && /heals/.test(chats[0]) && spendSheet._patched === true, JSON.stringify({ used: used && used.total, items: spendSheet.items.length, chats: chats }));

const weaponSheet = { name: "Ada", items: [], guns: [], melee: [], explosives: [] };
const axe = Items.add(weaponSheet, Items.byId("lightning-tomahawk"), { dm: true });
check("weapon.land", axe.ok && axe.landed && axe.landed.melee === true && weaponSheet.melee.length === 1 && weaponSheet.melee[0].weapon === "lightning-tomahawk" && Items.showUse(axe.item) === false);
check("weapon.use", Items.showUse(Items.instanceFrom(Items.byId("lasso-of-binding"))) === true && Items.showUse(Items.instanceFrom(Items.byId("assay-tonic-trail-draught"))) === true);
const boom = Items.add(weaponSheet, Items.byId("dynamite-stick-standard-fuse"), { dm: true });
check("explosive.land", boom.ok && !(weaponSheet.explosives||[]).length && weaponSheet.items.some((i) => i.catalogId === "dynamite-stick-standard-fuse" || i.id === "dynamite-stick-standard-fuse" || i.item === "dynamite-stick-standard-fuse"));

const ART = [
  "glowing-letter.webp",
  "glowing-letter-cure-wounds.webp",
  "glowing-letter-shield.webp",
  "glowing-letter-fireball.webp",
  "glowing-letter-revivify.webp",
  "greater-healing-libation.webp",
  "eldorite-dust.webp",
  "bounty-warrant.webp",
  "claim-deed.webp",
  "strongbox-key.webp",
  "black-shard.webp",
  "hat-of-the-sharpshooter.webp",
  "harmonica-of-soothing-melodies.webp",
  "saddle-of-the-phantom-steed.webp",
  "lightning-tomahawk.webp",
  "cutlass-of-the-suns-fury.webp",
  "old-henrys-rifle.webp",
  "lasso-of-binding.webp"
];
check("art.files", ART.every((file) => fs.existsSync(path.join(root, "assets/img/items", file))));
check("art.paths", ["glowing-letter", "greater-healing-libation", "eldorite-dust", "bounty-warrant", "claim-deed", "strongbox-key", "black-shard", "hat-of-the-sharpshooter", "old-henrys-rifle"].every((id) => {
  const row = Items.byId(id);
  return row && row.art === "assets/img/items/" + id + ".webp";
}));

const contestRolls = [face(12), face(6)];
let contestN = 0;
const contest = Grab.contest({
  mode: "disarm",
  actor: { skills: { Athletics: 3 } },
  target: { skills: { Athletics: 1, Acrobatics: 4 } },
  defenseSkill: "Acrobatics",
  feet: 5,
  rng: function () { return contestRolls[Math.min(contestN++, contestRolls.length - 1)]; }
});
check("rob.contest", contest.ok === true && contest.attack.skill === "Athletics" && contest.attack.total === 15 && contest.defense.skill === "Acrobatics" && contest.defense.total === 10 && contest.line.indexOf("Attack ") < 0, JSON.stringify(contest));

const pocket = Grab.contest({
  mode: "rob-pocket",
  actor: { skills: { "Sleight of Hand": 2 } },
  target: {},
  feet: 5,
  rng: function () { return face(11); }
});
check("rob.pocket", pocket.attack.skill === "Sleight of Hand" && pocket.defense.passive === 15 && pocket.ok === false && pocket.attack.total === 13);

const cost = Grab.actionCost({ take: "weapon", combat: true });
const pocketCost = Grab.actionCost({ take: "gear", combat: true, calling: "gambler" });
const free = Grab.actionCost({ downed: true, combat: true });
check("rob.cost", cost === "replaces one attack" && pocketCost === "bonus action" && free === "free action" && Grab.actionCost({ take: "gear", combat: false }) === "no action");

const sheetHtml = read("index.html");
const dmHtml = read("dm/index.html");
check("wire.sheet", sheetHtml.includes('id="itemGear"') && sheetHtml.includes("item-catalog.js") && sheetHtml.indexOf("item-catalog.js") < sheetHtml.indexOf("assets/js/items.js"));
check("wire.dm", dmHtml.includes('id="chkWeight"') && dmHtml.includes('id="dmItemTools"') && dmHtml.includes("item-catalog.js"));
check("wire.rules", !read("database.rules.json").includes("itemCatalog") && !read("assets/data/rules.js").includes("SSDNS_ITEM_CATALOG"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("items ok");

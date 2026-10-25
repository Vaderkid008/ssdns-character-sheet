/**
 * B8: per-enemy gear and Drop loot.
 * Inventory stays on the fight row. Public enemy nodes and public tokens do not carry it.
 * Stat-block guns drop Dirty through handPlace. Pocket cash is the saddlebag 2d6×5 line.
 *   node tools/test-b8-enemy-loot.mjs
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

const ctx = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  encodeURIComponent, URL, document: { getElementById: function () { return null; }, addEventListener: function () {} }
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
["assets/data/item-catalog.js", "assets/data/loot-tags.js", "assets/js/loot.js", "assets/data/rules.js", "assets/js/enemy-loot.js", "assets/js/apply-guard.js", "assets/js/give.js"].forEach((f) => {
  vm.runInContext(read(f), ctx, { filename: f });
});
ctx.SSDNSItems = {
  byId: function (id) {
    const list = ctx.SSDNS_ITEM_CATALOG || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  },
  catalog: function () { return (ctx.SSDNS_ITEM_CATALOG || []).slice(); }
};

const EL = ctx.SSDNSEnemyLoot;
const L = ctx.SSDNSLoot;
const Applied = ctx.SSDNSApplied;
const Give = ctx.SSDNSGive;

const outlaw = {
  id: "en-outlaw",
  name: "Outlaw",
  kind: "enemy",
  ac: 12,
  hp: 11,
  maxHp: 11,
  atkBonus: 3,
  beastId: "outlaw",
  card: {
    attacks: [
      { id: "ball-n-cap-revolver", name: "Ball n Cap Revolver", weapon: "Navy / Army Ball n Cap Revolver", capacity: 6, loaded: 6, toHit: 3, damage: "1d8+1" },
      { id: "bowie", name: "Bowie", kind: "melee", toHit: 3, damage: "1d6+1", range: "5 ft" }
    ]
  }
};

check("add.letter", EL.addGear(outlaw, "glowing-letter", 1).ok === true);
check("add.pistol", EL.addGear(outlaw, "herringer-light-pocket-pistol", 1).ok === true);
check("inv.both", outlaw.inventory.length === 2 && outlaw.inventory.some((r) => r.id === "glowing-letter") && outlaw.inventory.some((r) => r.id === "herringer-light-pocket-pistol"));
const pistol = outlaw.card.attacks.filter((a) => a && a.gear && a.fromItem === "herringer-light-pocket-pistol")[0];
check("atk.pistol", !!pistol && pistol.capacity === 1 && pistol.loaded === 1 && /Herringer/.test(pistol.name), pistol && pistol.name);
check("atk.letter", !outlaw.card.attacks.some((a) => a && a.fromItem === "glowing-letter"));
check("atk.relic", EL.addGear(outlaw, "viper", 1).ok === true && outlaw.card.attacks.some((a) => a && a.gear && a.fromItem === "viper" && a.weapon === "blacksnake"));

const pub = Applied.publicEnemy(outlaw, 0, []);
check("leak.public", pub.inventory == null && pub.lootDropped == null && JSON.stringify(pub).indexOf("glowing-letter") < 0 && JSON.stringify(pub).indexOf("herringer") < 0);
const revealed = Applied.publicEnemy(Object.assign({}, outlaw, { reveal: { name: true, block: true } }), 0, []);
const shownAttacks = (revealed.revealed && revealed.revealed.block && revealed.revealed.block.attacks) || [];
check("leak.block", shownAttacks.some((a) => a && a.name === "Bowie") && !shownAttacks.some((a) => a && a.gear));
const secret = Applied.secretEnemy(outlaw);
check("secret.inv", Array.isArray(secret.inventory) && secret.inventory.some((r) => r.id === "glowing-letter") && secret.inventory.some((r) => r.id === "herringer-light-pocket-pistol"));

check("remove.relic", EL.removeGear(outlaw, "viper").ok === true && !outlaw.card.attacks.some((a) => a && a.fromItem === "viper") && outlaw.card.attacks.some((a) => a && a.id === "bowie"));

const zeros = function () { return 0; };
const plan = EL.planDrop(outlaw, zeros);
const ids = plan.places.map((p) => p.id);
check("drop.letter", ids.indexOf("glowing-letter") >= 0);
check("drop.pistol", plan.places.some((p) => p.id === "herringer-light-pocket-pistol" && p.dirty === true));
check("drop.statgun", plan.places.some((p) => p.id === "navy-army-ball-n-cap-revolver" && p.dirty === true));
check("drop.nobowie", ids.indexOf("bowie") < 0 && !plan.places.some((p) => /bowie/i.test(p.id) || /bowie/i.test(p.name || "")));
check("drop.ammo", ids.indexOf("cartridges-light-20") >= 0 && ids.indexOf("powder-ball-and-caps-20-shots") >= 0, ids.join(","));
check("drop.cash", plan.cash && plan.cash.pocket === "saddlebag" && plan.cash.es === 10 && plan.cash.source.indexOf("2d6x5") >= 0, JSON.stringify(plan.cash));

EL.addGear(outlaw, "es", 40);
const held = EL.planDrop(outlaw, zeros);
check("drop.rowcash", held.cash.es === 40 && held.cash.pocket === "inventory" && held.places.every((p) => p.id !== "es"));

const box = L.place(plan.table, { rollMode: "onOpen", reveal: "everyone" }, zeros);
EL.fillBox(box, plan);
check("box.type", box.boxType === "enemy-drop" && box.rolled === true && box.shared === true);
const gunRow = (box.contents || []).filter((r) => r.id === "herringer-light-pocket-pistol")[0];
const navyRow = (box.contents || []).filter((r) => r.id === "navy-army-ball-n-cap-revolver")[0];
check("box.dirty", !!(gunRow && gunRow.dirty) && !!(navyRow && navyRow.dirty), JSON.stringify(box.contents));
const who = { es: 0, ammo: [], items: [], guns: [] };
const took = L.takeAll(box, "p_a", who);
L.applyTake(who, took);
check("take.ok", took.ok === true, took.reason);
check("take.guns", who.guns.some((g) => g.weapon === "herringer-light-pocket-pistol" && g.dirty === true) && who.guns.some((g) => g.weapon === "navy-army-ball-n-cap-revolver" && g.dirty === true), JSON.stringify(who.guns));
check("take.ammo", who.ammo.some((a) => a.type === "cartridge" && a.caliber === "Light" && a.count === 20) && who.ammo.some((a) => a.type === "percussion" && a.count === 20), JSON.stringify(who.ammo));
check("take.es", who.es === 10, String(who.es));
const letter = who.items.filter((it) => it.catalogId === "glowing-letter")[0];
check("take.letter", !!letter && letter.storyOnly !== true);

const keyRow = { id: "en2", kind: "enemy", name: "Outlaw", atkBonus: 3, card: { attacks: [] }, inventory: [] };
check("story.add", EL.addGear(keyRow, "strongbox-key", 1).ok === true);
EL.addGear(keyRow, "eldorite-dust", 1);
const keyPlan = EL.planDrop(keyRow, zeros);
const keyBox = L.place(keyPlan.table, { rollMode: "onOpen" }, zeros);
EL.fillBox(keyBox, keyPlan);
const holder = { es: 0, ammo: [], items: [], guns: [] };
L.applyTake(holder, L.takeAll(keyBox, "p_a", holder));
const dust = holder.items.filter((it) => it.catalogId === "eldorite-dust")[0];
check("story.tag", !!dust && dust.storyOnly === true, JSON.stringify(holder.items));
dust.uid = "dust-1";
dust.name = "Eldorite Dust";
const offer = Give.canOffer({ name: "Ada", items: [dust], es: 0, ammo: [], guns: [] }, { kind: "item", uid: "dust-1", qty: 1 }, {});
check("story.notrade", offer.ok === false && /can't be traded/.test(offer.reason || ""), offer.reason);

const keyOnly = holder.items.filter((it) => it.catalogId === "strongbox-key")[0];
check("key.tag", !!keyOnly && keyOnly.noTrade === true && keyOnly.actMin == null, JSON.stringify(keyOnly));
keyOnly.uid = "key-1";
const keyOffer = Give.canOffer({ name: "Ada", items: [keyOnly], es: 0, ammo: [], guns: [] }, { kind: "item", uid: "key-1", qty: 1 }, {});
check("key.notrade", keyOffer.ok === false && /can't be traded/.test(keyOffer.reason || ""), keyOffer.reason);

check("v14.budget", L.BUDGET["outlaw-stash"] === 1125 && L.BUDGET.saddlebag === 450 && L.CHAPTER[1] === 465);
check("v14.friendlier", /sealed 35, Cure 24, Shield 24, Fireball 12, Revivify 5/.test(read("assets/js/loot.js")));
check("v14.stashlock", /"lockRate": 0\.7/.test(read("assets/data/loot/act1-outlaw-stash.json")) || /0\.7/.test(read("assets/js/loot.js")));

const map = read("map/ssdns-map.js");
const pubFn = map.slice(map.indexOf("function publicToken"), map.indexOf("function saveToken"));
check("leak.token", pubFn.indexOf("inventory:") < 0 && pubFn.indexOf("lootDropped") < 0);
const v2 = read("dm/assets/js/v2.js");
const mark = v2.slice(v2.indexOf("async function markDown"), v2.indexOf("async function clearDown"));
check("drop.button", mark.indexOf("mapDropLoot") < 0 && mark.indexOf("dropLoot") < 0 && map.indexOf('data-act="dropLoot"') >= 0);
check("m4.rounds", map.indexOf('data-act="rowAddRounds"') >= 0 && v2.indexOf("enemyAddRounds") >= 0);
check("rules.untouched", read("assets/data/rules.js").indexOf("enemy-drop") < 0 && read("database.rules.json").indexOf("enemy-drop") < 0 && read("database.rules.json").indexOf("lootDropped") < 0);
check("choices.pistol", EL.choices().some((g) => (g.options || []).some((o) => o.id === "herringer-light-pocket-pistol")));
check("choices.letter", EL.choices().some((g) => (g.options || []).some((o) => o.id === "glowing-letter")));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok b8 enemy loot");

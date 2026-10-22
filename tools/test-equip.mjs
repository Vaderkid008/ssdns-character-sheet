/**
 * L0170 loadout: slot caps, combat lock, DM override, migration, badge rows.
 *   node tools/test-equip.mjs
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
vm.createContext(sandbox);
vm.runInContext(read("assets/js/equip.js"), sandbox, { filename: "assets/js/equip.js" });
const E = sandbox.SSDNSEquip;

sandbox.SSDNS_RULES = {
  holsters: [
    { id: "shoulder-rig", isRig: true, holds: "1 pistol" },
    { id: "hip-holster", isRig: true, holds: "1 revolver" },
    { id: "pommel-holsters-pair", isRig: true, holds: "2 pistols" },
    { id: "saddle-scabbard", isRig: true, holds: "1 carbine or rifle" },
    { id: "gun-belt", isRig: false, holds: "cartridges" },
    { id: "bandolier", isRig: false, holds: "shells" }
  ]
};

const CATALOG = {
  peacemaker: { id: "peacemaker", name: "Peacemaker", group: "pistol", capacity: 6 },
  navy: { id: "navy", name: "Navy", group: "pistol", capacity: 6 },
  derringer: { id: "derringer", name: "Derringer", group: "pistol", capacity: 2 },
  blacksnake: { id: "blacksnake", name: "Blacksnake", group: "caster", capacity: 6 },
  winchester: { id: "winchester", name: "Winchester", group: "rifle", capacity: 15 },
  sharps: { id: "sharps", name: "Sharps", group: "bigbore", capacity: 1 },
  coach: { id: "coach", name: "Coach Gun", group: "shotgun", capacity: 2 },
  carbine: { id: "carbine", name: "Carbine", group: "carbine", capacity: 7 },
  bow: { id: "bow", name: "Shortbow", group: "simple-ranged", properties: "", capacity: 1 },
  knife: { id: "knife", name: "Throwing Knife", group: "simple-ranged", properties: "thrown", capacity: 1 },
  saber: { id: "saber", name: "Saber", group: "martial-melee" },
  bowie: { id: "bowie", name: "Bowie", group: "simple-melee" }
};
function lookup(id) { return CATALOG[id] || null; }
function gun(id, extra) { return Object.assign({ weapon: id, equipped: false }, extra || {}); }
function sheet(extra) {
  return Object.assign({
    guns: [],
    melee: [],
    instrument: "",
    holster: "",
    equipment: ""
  }, extra || {});
}

check("limits", E.LIMITS.pistol === 2 && E.LIMITS.long === 1 && E.LIMITS.melee === 1 && E.LIMITS.focus === 1);
check("lockTip", E.LOCK_TIP === "Change loadout outside combat");
check("slots.groups", E.slotOf(CATALOG.peacemaker) === "pistol" && E.slotOf(CATALOG.blacksnake) === "pistol" && E.slotOf(CATALOG.winchester) === "long" && E.slotOf(CATALOG.carbine) === "long" && E.slotOf(CATALOG.coach) === "long" && E.slotOf(CATALOG.sharps) === "long" && E.slotOf(CATALOG.bow) === "long" && E.slotOf(CATALOG.knife) === "melee" && E.slotOf(CATALOG.saber) === "melee");
check("jammer.pistol", E.slotOf(E.lookupWeapon("test-jammer")) === "pistol");

E.setCombat(false);
const caps = sheet({
  guns: [gun("peacemaker"), gun("navy"), gun("derringer"), gun("winchester"), gun("coach"), gun("bow")],
  melee: [{ weapon: "saber", equipped: false }, { weapon: "bowie", equipped: false }],
  instrument: "fiddle"
});
const first = E.setEquipped(caps, { kind: "gun", index: 0, equipped: true, lookup });
const second = E.setEquipped(caps, { kind: "gun", index: 1, equipped: true, lookup });
const third = E.setEquipped(caps, { kind: "gun", index: 2, equipped: true, lookup });
const long1 = E.setEquipped(caps, { kind: "gun", index: 3, equipped: true, lookup });
const long2 = E.setEquipped(caps, { kind: "gun", index: 4, equipped: true, lookup });
const bowBlocked = E.setEquipped(caps, { kind: "gun", index: 5, equipped: true, lookup });
const melee1 = E.setEquipped(caps, { kind: "melee", index: 0, equipped: true, lookup });
const melee2 = E.setEquipped(caps, { kind: "melee", index: 1, equipped: true, lookup });
const focus = E.setEquipped(caps, { kind: "focus", equipped: true, lookup });
const focusAgain = E.setEquipped(caps, { kind: "focus", equipped: true, lookup });
check("cap.pistols", first.ok && second.ok && !third.ok && third.reason === "Pistol slot is full." && caps.guns[2].equipped === false);
check("cap.long", long1.ok && !long2.ok && long2.reason === "Long gun slot is full." && !bowBlocked.ok);
check("cap.melee", melee1.ok && !melee2.ok && melee2.reason === "Melee slot is full.");
check("cap.focus", focus.ok && focus.carry === "held" && focusAgain.ok && E.countSlots(caps, lookup).focus === 1);
check("cap.counts", JSON.stringify(E.countSlots(caps, lookup)) === JSON.stringify({ pistol: 2, long: 1, melee: 1, focus: 1 }));

const thrown = sheet({
  guns: [gun("knife")],
  melee: [{ weapon: "saber", equipped: false }]
});
check("thrown.takesMelee", E.setEquipped(thrown, { kind: "gun", index: 0, equipped: true, lookup }).ok);
check("thrown.blocksSword", !E.setEquipped(thrown, { kind: "melee", index: 0, equipped: true, lookup }).ok && thrown.melee[0].equipped === false);

const held = sheet({ instrument: "fiddle", guns: [gun("peacemaker")] });
E.setEquipped(held, { kind: "focus", equipped: true, lookup });
check("focus.doesNotBlockGun", E.setEquipped(held, { kind: "gun", index: 0, equipped: true, lookup }).ok && held.guns[0].equipped === true);
check("carry.straps", E.focusCarry({ instrument: "guitar" }).carry === "free" && E.focusCarry({ instrument: "banjo" }).carry === "free" && E.focusCarry({ instrument: "accordion" }).carry === "free");
check("carry.held", E.focusCarry({ instrument: "fiddle" }).carry === "held" && E.focusCarry({ instrument: "harmonica" }).carry === "held");
check("carry.gear", E.focusCarry({ instrument: "fiddle", equipment: "violin strap" }).carry === "free" && E.focusCarry({ instrument: "harmonica", equipment: "harmonica rack" }).carry === "free" && E.focusCarry({ instrument: "guitar", equipment: "standard strap" }).carry === "free");
check("carry.voice", E.focusCarry({ instrument: "voice" }).carry === "free" && E.focusCarry({ instrument: "piano" }).carry === "free");

const bare = sheet({ guns: [gun("peacemaker", { equipped: true }), gun("navy", { equipped: true })] });
const openDraw = E.drawCheck(bare, 0, lookup);
const secondDraw = E.drawCheck(bare, 1, lookup);
check("draw.none", openDraw.needed === false && secondDraw.needed === true && secondDraw.dc === 12 && secondDraw.ability === "DEX");
bare.holster = "shoulder-rig";
check("draw.shoulder", E.drawCheck(bare, 1, lookup).needed === false && E.pistolCovers("shoulder-rig") === 1);
bare.holster = "hip-holster";
check("draw.hip", E.drawCheck(bare, 1, lookup).needed === false && E.pistolCovers("hip-holster") === 1);
bare.holster = "pommel-holsters-pair";
check("draw.pommel", E.pistolCovers("pommel-holsters-pair") === 2 && E.drawCheck(bare, 1, lookup).needed === false);
bare.holster = "saddle-scabbard";
check("draw.saddle", E.pistolCovers("saddle-scabbard") === 0 && E.drawCheck(bare, 1, lookup).needed === true);
bare.holster = "gun-belt";
check("draw.belt", E.pistolCovers("gun-belt") === 0 && E.pistolCovers("bandolier") === 0 && E.drawCheck(bare, 1, lookup).needed === true);
check("draw.packed", E.drawCheck(sheet({ guns: [gun("peacemaker"), gun("navy", { equipped: true })] }), 0, lookup).needed === false);

E.setCombat(true);
const lockedSheet = sheet({ guns: [gun("peacemaker"), gun("navy", { equipped: true })], instrument: "guitar" });
const lockedOn = E.setEquipped(lockedSheet, { kind: "gun", index: 0, equipped: true, lookup });
const lockedOff = E.setEquipped(lockedSheet, { kind: "gun", index: 1, equipped: false, lookup });
const lockedFocus = E.setEquipped(lockedSheet, { kind: "focus", equipped: true, lookup });
check("combat.lock", E.combatLocked() && !lockedOn.ok && lockedOn.reason === E.LOCK_TIP && lockedSheet.guns[0].equipped === false);
check("combat.unequipLocked", !lockedOff.ok && lockedSheet.guns[1].equipped === true);
check("combat.focusLocked", !lockedFocus.ok && lockedFocus.reason === E.LOCK_TIP);
check("combat.flag", E.combatActive({ order: [{ id: "a" }], started: true }) && !E.combatActive({ order: [], started: true }) && !E.combatActive({ order: [{ id: "a" }], started: false }) && !E.combatActive(null));
const viaInit = E.setEquipped(sheet({ guns: [gun("peacemaker")] }), { kind: "gun", index: 0, equipped: true, lookup, initiative: { order: [{ id: "a" }], started: true } });
check("combat.initiative", !viaInit.ok && viaInit.reason === E.LOCK_TIP);
E.setCombat(false);
const outside = E.setEquipped(sheet({ guns: [gun("peacemaker")] }), { kind: "gun", index: 0, equipped: true, lookup, initiative: { order: [{ id: "a" }], started: false } });
check("combat.notStarted", outside.ok === true);

const dmSheet = sheet({
  guns: [gun("peacemaker"), gun("navy"), gun("derringer")],
  melee: [{ weapon: "saber", equipped: false }]
});
E.setCombat(true);
const dmOn = E.setEquipped(dmSheet, { kind: "gun", index: 0, equipped: true, lookup, dm: true });
const dmSecond = E.setEquipped(dmSheet, { kind: "gun", index: 1, equipped: true, lookup, dm: true, combat: true });
const dmThird = E.setEquipped(dmSheet, { kind: "gun", index: 2, equipped: true, lookup, dm: true });
const dmMelee = E.setEquipped(dmSheet, { kind: "melee", index: 0, equipped: true, lookup, dm: true });
check("dm.midCombat", dmOn.ok && dmSheet.guns[0].equipped === true && dmSecond.ok && dmMelee.ok);
check("dm.stillCapped", !dmThird.ok && dmThird.reason === "Pistol slot is full." && dmSheet.guns[2].equipped === false);
const dmOff = E.setEquipped(dmSheet, { kind: "gun", index: 0, equipped: false, lookup, dm: true });
check("dm.unequip", dmOff.ok && dmSheet.guns[0].equipped === false);
const playerStill = E.setEquipped(dmSheet, { kind: "melee", index: 0, equipped: false, lookup });
check("dm.playerStillLocked", !playerStill.ok && dmSheet.melee[0].equipped === true);
E.setCombat(false);

const gift = sheet({ guns: [gun("peacemaker"), gun("navy"), gun("derringer")] });
const auto0 = E.tryAutoEquip(gift, { kind: "gun", index: 0, lookup });
const auto1 = E.tryAutoEquip(gift, { kind: "gun", index: 1, lookup });
const auto2 = E.tryAutoEquip(gift, { kind: "gun", index: 2, lookup });
check("give.freeSlot", auto0.ok && auto1.ok && gift.guns[0].equipped === true && gift.guns[1].equipped === true);
check("give.fullStaysPacked", !auto2.ok && gift.guns[2].equipped === false);
E.setCombat(true);
const midGift = sheet({ guns: [gun("coach")] });
const mid = E.tryAutoEquip(midGift, { kind: "gun", index: 0, lookup });
check("give.combatPacked", !mid.ok && mid.reason === E.LOCK_TIP && midGift.guns[0].equipped === false);
E.setCombat(false);
const focusGift = sheet({ instrument: "guitar" });
check("give.focus", E.tryAutoEquip(focusGift, { kind: "focus", lookup }).ok && focusGift.focusEquipped === true);

const legacy = sheet({
  guns: [
    { weapon: "peacemaker" },
    { weapon: "navy" },
    { weapon: "derringer" },
    { weapon: "winchester" },
    { weapon: "sharps" },
    { weapon: "knife" }
  ],
  melee: [{ weapon: "saber" }, { weapon: "bowie" }],
  instrument: "guitar"
});
const moved = E.migrate(legacy, lookup);
check("migrate.once", moved.ok && moved.skipped !== true && legacy.equipRule === "L0170");
check("migrate.pistols", legacy.guns[0].equipped === true && legacy.guns[1].equipped === true && legacy.guns[2].equipped === false);
check("migrate.long", legacy.guns[3].equipped === true && legacy.guns[4].equipped === false);
check("migrate.melee", legacy.guns[5].equipped === true && legacy.melee[0].equipped === false && legacy.melee[1].equipped === false);
check("migrate.focus", legacy.focusEquipped === true && E.focusCarry(legacy).carry === "free");
check("migrate.counts", moved.counts.pistol === 2 && moved.counts.long === 1 && moved.counts.melee === 1 && moved.counts.focus === 1);
legacy.guns[2].weapon = "peacemaker";
const again = E.migrate(legacy, lookup);
check("migrate.skip", again.skipped === true && legacy.guns[2].equipped === false);

const rows = E.badgeRows([
  { name: "Peacemaker", group: "pistol", loaded: 4, cap: 6, equipped: true },
  { name: "Packed", group: "pistol", loaded: 6, cap: 6, equipped: false },
  { name: "Legacy", group: "rifle", loaded: 1, cap: 1 },
  { name: "Empty", group: "shotgun", loaded: 0, cap: 0, equipped: true },
  { name: "Coach", group: "shotgun", loaded: 1, cap: 2, equipped: true },
  { name: "Sharps", group: "bigbore", loaded: 1, cap: 1, equipped: true },
  { name: "Snake", group: "caster", loaded: 3, cap: 6, equipped: true }
]);
check("badge.filter", rows.length === 4 && rows.map((r) => r.name).join(",") === "Peacemaker,Coach,Sharps,Snake");
check("badge.icons", rows[0].icon === "pistol" && rows[1].icon === "shotgun" && rows[2].icon === "rifle" && rows[3].icon === "pistol");
check("badge.text", rows[0].loaded === 4 && rows[0].cap === 6 && rows[0].svg.indexOf("<svg") === 0 && rows[1].svg.indexOf("<svg") === 0);
const lifted = E.badgeRowsForToken([
  { name: "Legacy", group: "rifle", loaded: 2, cap: 8 },
  { name: "Packed", group: "pistol", loaded: 1, cap: 6, equipped: false }
]);
check("badge.legacyLift", lifted.length === 1 && lifted[0].name === "Legacy" && lifted[0].icon === "rifle" && lifted[0].loaded === 2 && lifted[0].cap === 8);

function mem(seed) {
  const bag = Object.assign({}, seed || {});
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) { bag[k] = String(v); },
    bag
  };
}
const fresh = mem();
check("chat.default", E.readChatOpen(fresh, "dm") === true && fresh.getItem(E.OLD_CHAT_KEY) == null && fresh.getItem(E.CHAT_KEYS.dm) == null);
const migrated = mem({ "ssdns.map.chatOpen": "0" });
check("chat.migratePlayer", E.readChatOpen(migrated, "player") === false && migrated.getItem(E.CHAT_KEYS.player) === "0" && migrated.getItem(E.OLD_CHAT_KEY) === "0");
check("chat.migrateDm", E.readChatOpen(migrated, "dm") === false && migrated.getItem(E.CHAT_KEYS.dm) === "0" && migrated.getItem(E.OLD_CHAT_KEY) === "0");
E.writeChatOpen(migrated, "dm", true);
check("chat.split", migrated.getItem(E.CHAT_KEYS.dm) === "1" && migrated.getItem(E.CHAT_KEYS.player) === "0" && migrated.getItem(E.OLD_CHAT_KEY) === "0");
const prefer = mem({ "ssdns.map.chatOpen": "0", "ssdns.map.chatOpen.player": "1" });
check("chat.roleWins", E.readChatOpen(prefer, "player") === true && prefer.getItem(E.OLD_CHAT_KEY) === "0");

const version = JSON.parse(read("version.json"));
const app = read("assets/js/app.js");
const mapSrc = read("map/ssdns-map.js");
const hostSrc = read("map/ssdns-map-host.js");
const dmcc = read("dm/assets/js/dmcc.js");
const join = read("assets/js/dm-join.js");
check("ver.sheet", version.sheet === "0.3.102" && version.sheetBuild === "sheet-playtest-v03102");
check("ver.dmcc", version.dmcc === "0.2.115" && version.dmccBuild === "dmcc-playtest-v02115");
check("wire.migrate", app.includes("SSDNSEquip.migrate") && app.includes('APP_VERSION = "0.3.102"'));
check("wire.lockTip", app.includes("Equip.LOCK_TIP") && read("assets/js/sheet-playtest.js").includes("Change loadout outside combat"));
check("wire.give", app.includes('tryAutoEquip(C(), { kind: "gun"') && app.includes('tryAutoEquip(C(), { kind: "melee"'));
check("wire.dm", join.includes('payload.op === "equip"') && join.includes("dm: true") && dmcc.includes('data-gun-op="equip"') && dmcc.includes('VERSION = "0.2.115"'));
check("wire.badge", mapSrc.includes("function paintAmmoColumn") && mapSrc.includes("const colX = s.x + r + 8") && hostSrc.includes("badgeRowsForToken"));
check("wire.chat", mapSrc.includes("ssdns.map.chatOpen.dm") && mapSrc.includes("ssdns.map.chatOpen.player") && read("index.html").includes("assets/js/equip.js") && read("dm/index.html").includes("assets/js/equip.js"));
check("wire.firebolt", fs.existsSync(path.join(root, "tools/test_firebolt.cjs")) && !fs.existsSync(path.join(root, "tools/test_firebolt.js")) && read("tools/package.json").includes('"type": "module"'));
check("rules.untouched", !read("assets/data/rules.js").includes("L0170") && !read("database.rules.json").includes("L0170") && !read("tools/build_rules.py").includes("L0170"));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("equip ok");

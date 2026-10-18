/**
 * Range rings draw the bands. resolve() applies them to a map attack that has a target.
 *   node tools/test-range-rings.mjs
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

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/data/rules.js"), context);
vm.runInContext(read("assets/js/spell-cast.js"), context);
vm.runInContext(read("assets/js/range-rings.js"), context);
const api = context.SSDNSRangeRings;

const rifle = api.bands({ weapon: "dulls-rolling-block-rifle", tier: "medium" });
check("rifle.normal", rifle.normal === 60 && rifle.long === 240, JSON.stringify(rifle));
check("rifle.close", rifle.close === 5);
check("rifle.noMelee", rifle.melee === 0);

const fifty = api.bands({ weapon: "bison-big-fifty-buffalo-rifle" });
check("fifty.close", fifty.close === 30 && fifty.normal === 150 && fifty.long === 600, JSON.stringify(fifty));

const pistol = api.bands({ weapon: "herringer-light-pocket-pistol" });
check("pistol.noClose", pistol.close === 0 && pistol.normal > 0 && pistol.long > pistol.normal, JSON.stringify(pistol));

const carbine = api.bands({ weapon: "henrietta-saddle-carbine" });
check("carbine.closeQuarters", carbine.close === 0, JSON.stringify(carbine));
const scoped = api.bands({ weapon: "henrietta-saddle-carbine", scope: true, moved: false });
check("scope.still", scoped.clearLong === true && scoped.close === 0, JSON.stringify(scoped));
const scopedMoved = api.bands({ weapon: "henrietta-saddle-carbine", scope: true, moved: true });
check("scope.moved", scopedMoved.clearLong === false && scopedMoved.close === 0, JSON.stringify(scopedMoved));

const reach = api.bands({ weapon: "boarding-hook-poleaxe-halberd" });
check("melee.reach", reach.melee === 10 && reach.meleeRed === 12.5 && reach.long === 0, JSON.stringify(reach));
const fist = api.bands({ name: "Bowie", range: "—", properties: "Finesse, light", group: "martial-melee", kind: "melee" });
check("melee.five", fist.melee === 5 && fist.meleeRed === 7.5, JSON.stringify(fist));

const thrown = api.bands({ weapon: "stiletto-dagger" });
check("thrown.both", thrown.thrown && thrown.melee === 5 && thrown.normal === 20 && thrown.long === 60, JSON.stringify(thrown));

const cone = api.bands({ name: "Farm Shotgun", range: "15 ft cone", group: "shotgun", properties: "Two-handed, scatter, close quarters" });
check("cone", cone.cone && cone.normal === 15 && cone.long === 15 && cone.close === 0, JSON.stringify(cone));

const bolt = api.bands({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft", longRangeHex: true });
check("hex.double", bolt.spell && bolt.normal === 240 && bolt.long === 240 && bolt.close === 0, JSON.stringify(bolt));
const plain = api.bands({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft" });
check("hex.off", plain.normal === 120);
const save = api.bands({ name: "Bless", kind: "spell", spellKind: "save", range: "30 ft", longRangeHex: true });
check("hex.notSave", save.normal === 30 && save.long === 30 && save.doubled === false && save.purple === true, JSON.stringify(save));
const selfSpell = api.bands({ name: "Shield", kind: "spell", spell: true, spellKind: "save", range: "self" });
check("spell.self", selfSpell.self === true && selfSpell.normal === 0, JSON.stringify(selfSpell));
const touch = api.bands({ name: "Shocking Grasp", kind: "spell", spell: true, spellKind: "attack", range: "touch" });
check("spell.touch", touch.normal === 5 && touch.touch === true && touch.purple === true, JSON.stringify(touch));
const purple = api.rings({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft" });
check("spell.purple", purple.rings.length === 1 && purple.rings[0].role === "spell" && purple.rings[0].stroke === "#7b4fd6" && purple.rings[0].feet === 120, JSON.stringify(purple.rings));
check("spell.label", purple.label === "Spell · 120 ft", purple.label);
const hexLabel = api.rings({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft", longRangeHex: true });
check("spell.hexLabel", hexLabel.label.indexOf("x2 Long-Range Hex") >= 0 && hexLabel.rings[0].feet === 240, hexLabel.label);
const warn = api.rings({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft", hostileFeet: 5 });
check("spell.warn", warn.rings.some((r) => r.role === "warn" && r.feet === 5 && r.stroke === "#e23b32"));
const long = api.resolve({ weapon: "dulls-rolling-block-rifle", tier: "medium" }, 100, { hasTarget: true, hostileFeet: 40 });
check("band.long", long.apply && long.disadvantage && !long.blocked && long.button === "DIS · long range" && long.note.indexOf("100 ft") >= 0, JSON.stringify(long));
const casterFifty = api.resolve({ weapon: "blacksnake", round: ".50-90" }, 10, { hasTarget: true, hostileFeet: 5 });
check("caster.fifty", !casterFifty.note || casterFifty.note.indexOf("close quarters") < 0, JSON.stringify(casterFifty));
const blocked = api.resolve({ weapon: "dulls-rolling-block-rifle", tier: "medium" }, 300, { hasTarget: true });
check("band.past", blocked.blocked && blocked.button === "Out of range", JSON.stringify(blocked));
const spellPast = api.resolve({ name: "Fire Bolt", kind: "spell", spell: true, spellKind: "attack", range: "120 ft" }, 130, { hasTarget: true });
check("band.spellPast", spellPast.blocked && spellPast.button === "out of range", JSON.stringify(spellPast));
const ignored = api.resolve({ weapon: "dulls-rolling-block-rifle", tier: "medium" }, 300, { hasTarget: true, override: "ignore" });
check("band.ignore", !ignored.blocked && !ignored.disadvantage && ignored.log === "DM override: range ignored", JSON.stringify(ignored));
const forced = api.resolve({ weapon: "herringer-light-pocket-pistol" }, 10, { hasTarget: true, override: "force", hostileFeet: 100 });
check("band.force", forced.disadvantage && !forced.blocked && forced.log === "DM override: disadvantage forced", JSON.stringify(forced));
const none = api.resolve({ weapon: "dulls-rolling-block-rifle", tier: "medium" }, null, { hasTarget: false });
check("band.noTarget", none.apply === false, JSON.stringify(none));
const close = api.resolve({ weapon: "dulls-rolling-block-rifle", tier: "medium" }, 20, { hasTarget: true, hostileFeet: 5 });
check("band.close", close.disadvantage && close.note.indexOf("close quarters") >= 0, JSON.stringify(close));
const cq = api.resolve({ weapon: "henrietta-saddle-carbine" }, 10, { hasTarget: true, hostileFeet: 5 });
check("band.closeQuarters", !cq.disadvantage, JSON.stringify(cq));

const sharp = api.bands({ weapon: "bison-big-fifty-buffalo-rifle", sharpshooter: true, moved: true });
check("sharp.keepsUnwieldy", sharp.clearLong === true && sharp.close === 30, JSON.stringify(sharp));

const drawn = api.rings({ weapon: "dulls-rolling-block-rifle", tier: "medium" });
const roles = drawn.rings.map((r) => r.role + ":" + r.feet);
check("draw.order", roles[0] === "limit:240" && roles.indexOf("normal:60") > 0 && roles.indexOf("close:5") > roles.indexOf("normal:60"), roles.join(" "));
check("draw.colors", drawn.rings[0].stroke === "#e23b32" && drawn.rings.find((r) => r.role === "normal").stroke === "#2ea84a" && drawn.rings.find((r) => r.role === "close").stroke === "#e07a20");

const mapSrc = read("map/ssdns-map.js");
check("toggle.player", mapSrc.includes("Show my range"));
check("toggle.dm", mapSrc.includes("> Show range</label>"));
check("toggle.off", mapSrc.includes("showRange: false"));
check("toggle.noAttackChange", mapSrc.includes("drawer:attack") && !mapSrc.includes("SSDNSRangeRings.bands") || mapSrc.includes("SSDNSRangeRings.rings"));
check("rules.untouched", !read("assets/js/range-rings.js").includes("database.rules"));

const cast = context.SSDNSSpellCast.rangeOf("Fire Bolt");
check("spell.rangeOf", cast === "120 ft", cast);

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("range rings ok");

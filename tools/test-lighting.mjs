/**
 * Item lights, hood, hands, darkvision, belt lantern lock (L0215).
 *   node tools/test-lighting.mjs
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

const rules = {
  lineages: [
    { id: "mountain-folk", traits: [{ name: "Darkvision (Lamp-Eye)", text: "You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light." }] },
    { id: "aristocrats", traits: [{ name: "Darkvision (Night-Court Eyes)", text: "within 60 feet" }], sublineages: [{ id: "night-house", traits: [{ name: "Superior Darkvision", text: "Your darkvision has a radius of 120 feet." }] }] },
    { id: "farmers", traits: [{ name: "Lucky", text: "Reroll a 1." }] }
  ],
  feats: [{ id: "skulker", name: "Skulker", text: "You can hide when you are lightly obscured. Dim light doesn't give you disadvantage on Perception." }],
  firearms: [{ id: "long-gun", properties: "two-handed" }, { id: "pistol", properties: "light" }],
  melee: []
};
const sandbox = { console, Math, Number, String, Object, Array, JSON, isFinite };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.SSDNS_RULES = rules;
vm.createContext(sandbox);
vm.runInContext(read("assets/js/lighting.js"), sandbox);
const L = sandbox.SSDNSLighting;

const torch = { uid: "t1", catalogId: "torch-pitch-stick", name: "Torch / pitch stick" };
const hood = { uid: "h1", catalogId: "hooded-lamp", name: "Hooded lamp" };
const belt = { uid: "b1", catalogId: "belt-lantern", name: "Belt lantern", wear: "trinket" };
const c = { items: [torch, hood, belt], guns: [], melee: [], shield: "", lineage: "farmers", feats: [], cantrips: ["Light"], lightOn: {} };

check("torch.needsHand", !L.litItem(torch));
check("hold.ok", L.hold(c, "t1", true).ok && L.litItem(torch).bright === 20 && L.litItem(torch).dim === 20 && torch.lightSlot === "revolver_1" && L.lightInSlot(c, "revolver_1") === torch);
check("hold.slotName", L.slotName("revolver_1") === "Pistol L" && L.slotName("melee") === "Melee" && L.LIGHT_SLOTS.join() === "revolver_1,revolver_2,melee");
const candle = { uid: "c1", catalogId: "candle", name: "Candle" };
c.items.push(candle);
check("hold.secondSlot", L.hold(c, "c1", true).ok && candle.lightSlot === "revolver_2" && L.lightInSlot(c, "revolver_2") === candle);
check("hold.moveMelee", L.hold(c, "c1", true, "melee").ok && candle.lightSlot === "melee" && !L.lightInSlot(c, "revolver_2"));
check("hold.stow", L.hold(c, "c1", false).ok && candle.lightHeld === false && candle.lightSlot === "" && !L.lightInSlot(c, "melee"));
check("hold.badSlot", !L.hold(c, "t1", true, "long_gun").ok);
check("hood.down", L.setHood(c, "h1", true).ok && L.radii(hood).bright === 0 && L.radii(hood).dim === 5);
L.hold(c, "h1", true);
check("hood.heldDim", L.litItem(hood).bright === 0 && L.litItem(hood).dim === 5);
check("belt.stowed", !L.litItem(belt));
belt.equipSlot = "accessory_1";
check("belt.worn", L.litItem(belt).bright === 15 && L.litItem(belt).dim === 15 && L.litItem(belt).handsFree);
check("belt.locked", L.TABLE["belt-lantern"].placeholder !== true && L.TABLE["belt-lantern"].slot === "trinket" && L.TABLE["belt-lantern"].handsFree === true && L.TABLE["belt-lantern"].bright === 15 && L.TABLE["belt-lantern"].dim === 15);
const gear = read("assets/data/item-catalog-gear.js");
const beltBlock = gear.slice(gear.indexOf('"id": "belt-lantern"'), gear.indexOf('"id": "tinderbox-lucifers"'));
check("belt.price", /"price": 750/.test(beltBlock) && /"weight": 1/.test(beltBlock) && /"forSale": true/.test(beltBlock) && /"wear": "trinket"/.test(beltBlock) && !/PENDING Encounter Bot/.test(beltBlock) && !/provisional/.test(beltBlock));

const busy = { items: [], guns: [{ weapon: "long-gun", equipped: true }], melee: [], shield: "tin" };
check("hands.full", L.handsUsed(busy) >= 2 && !L.hold(Object.assign(busy, { items: [Object.assign({}, torch)] }), "t1", true).ok);

c.lineage = "mountain-folk";
check("dv.60", L.darkvisionFeet(c) === 60);
c.lineage = "aristocrats"; c.sublineage = "night-house";
check("dv.120", L.darkvisionFeet(c) === 120);
c.feats = ["skulker"];
check("skulker", L.hasSkulker(c) && /no disadvantage/.test(L.perceptionNote("dim", true)));
check("dim.dis", /Disadvantage/.test(L.perceptionNote("dim", false)));
check("dark.blind", /blinded/.test(L.perceptionNote("dark", false)));

check("spell.shellKey", L.spellKey("Light Shell") === "spell:light" && L.spellKey("Light") === "spell:light" && L.spellKey("Dancing Lights Shell") === "spell:dancing-lights");
const shell = { items: [], guns: [], melee: [], shield: "", lineage: "farmers", feats: [], cantrips: ["Light Shell"], lightOn: {}, spellMarks: { zones: [{ id: "z1", key: "light", spell: "Light" }, { id: "z2", key: "daylight", spell: "Daylight" }] } };
L.setSpell(shell, "spell:light", true);
check("spell.shellOn", L.spellLights(shell).some((row) => row.id === "spell:light") && shell.spellMarks.zones.length === 2);
L.setSpell(shell, "spell:light", false);
check("spell.shellDismiss", shell.lightOn["spell:light"] === false && shell.spellMarks.zones.length === 1 && shell.spellMarks.zones[0].key === "daylight");
L.setSpell(c, "spell:light", true);
const prof = L.tokenProfile(c);
check("profile.spell", prof.lights.some(l => l.bright === 20 && l.name === "Light"));
check("profile.dv", prof.darkvision === 120 && prof.skulker === true);

const lights = [{ x: 0, y: 0, bright: 20, dim: 20 }];
check("level.bright", L.rawLevel(1, 0, lights, "dark") === "bright");
check("level.dim", L.rawLevel(6, 0, lights, "dark") === "dim");
check("level.dark", L.rawLevel(10, 0, lights, "dark") === "dark");
const dance = [{ x: 0, y: 0, bright: 0, dim: 10 }];
check("level.dimOnly", L.rawLevel(1, 0, dance, "dark") === "dim" && L.rawLevel(1, 0, dance, "dim") === "dim" && L.rawLevel(3, 0, dance, "dark") === "dark");
check("level.ambient", L.rawLevel(10, 0, [], "bright") === "bright");
check("dv.up", L.applyDarkvision("dark", true) === "dim" && L.applyDarkvision("dim", true) === "bright");

const src = read("map/ssdns-map.js");
check("src.noTorchButton", !src.includes("playerTorchBtn") && src.includes('data-act="ambientSel"') && src.includes('data-act="dmDouseBtn"'));
check("src.partyDefault", src.includes("visionMode === 'own' ? 'own' : 'party'"));
check("src.conePunch", src.includes("drawVisible(ls.x, ls.y, ls.radius * px, ls)") && src.includes("if (cone && cone.cone)"));
const ringsFn = src.slice(src.indexOf("function paintLightRings"), src.indexOf("function drawVisible"));
const gateAt = ringsFn.indexOf("if (role !== 'dm' || !state.showLightRings) return");
check("rings.defaultOff", /showLightRings:\s*false/.test(src));
check("rings.playerNever", gateAt > 0 && ringsFn.indexOf("playerLights") < gateAt && ringsFn.indexOf("strokeRing") > gateAt && ringsFn.indexOf("strokeCone") > gateAt);
check("rings.dmOnly", src.includes('data-act="showLightRings"> Light rings') && !src.slice(src.indexOf("ssdns-playercard"), src.indexOf("attack effects")).includes("showLightRings") && !src.slice(src.indexOf("ssdns-playercard"), src.indexOf("attack effects")).includes("Light rings"));
check("rings.rangeKept", src.includes("function paintRangeRings") && src.includes("paintRangeRings();") && src.includes("function paintMoveReach"));
check("rings.washStays", src.includes("for (const ls of lightSources) drawVisible(ls.x, ls.y, ls.radius * px, ls)") && src.includes("if (b.darkvision) drawVisible"));
check("rules.untouched", !read("database.rules.json").includes("dmDoused"));
check("glow.fn", src.includes("function paintLightGlow") && src.includes("createRadialGradient") && src.includes("function paintDimLift") && src.includes("onlyDim"));
check("dim.stronger", src.includes("rgba(16, 16, 20, 0.72)") && !src.includes("rgba(18, 24, 48, 0.42)"));
check("legend", src.includes('data-act="lightLegend"') && src.includes('data-level="bright"') && src.includes('data-level="dim"') && src.includes('data-level="dark"'));
check("testlight", src.includes('data-act="testLightBtn"') && src.includes("function dropTestTorch") && src.includes("torch-pitch-stick") && src.includes("testLightRows"));
check("toast.nolight", src.includes("No one in the party is carrying a light."));
check("viewas.deferred", !src.includes("View as") && !src.includes("viewAsPlayer"));
const doll = read("assets/js/paper-doll.js");
const items = read("assets/js/items.js");
check("doll.light", doll.includes("data-doll-light") && doll.includes("heldLight") && doll.includes("doll-light-on") && doll.includes("doll-light-out"));
check("doll.sync", doll.includes("Lights.hold(c, blocking.uid, false)") && items.includes("SSDNSDoll.paint") && items.includes("In hand"));
check("belt.trinket", L.TABLE["belt-lantern"].slot === "trinket" && L.TABLE["belt-lantern"].handsFree === true && !/TODO:.*belt lantern price/i.test(read("assets/js/lighting.js")));

const dollRules = {
  lineages: [], feats: [], holsters: [], armor: [],
  firearms: [{ id: "pistol", name: "Pistol", group: "pistol", properties: "light" }],
  melee: [{ id: "knife", name: "Knife", properties: "" }]
};
const db = { console, Math, Number, String, Object, Array, JSON, isFinite, Date };
db.globalThis = db;
db.window = db;
db.SSDNS_RULES = dollRules;
vm.createContext(db);
vm.runInContext(read("assets/js/lighting.js"), db);
vm.runInContext(read("assets/js/paper-doll.js"), db);
const DL = db.SSDNSLighting;
const DD = db.SSDNSDoll;
const pc = {
  items: [{ uid: "t1", catalogId: "torch-pitch-stick", name: "Torch / pitch stick" }],
  guns: [{ weapon: "pistol", equipped: true }],
  melee: [],
  shield: "",
  dollWeapons: { revolver_1: 0 },
  calling: ""
};
const held = DL.hold(pc, "t1", true, "revolver_1");
check("sync.holdFrees", held.ok && held.slot === "revolver_1" && pc.guns[0].equipped === false && DL.lightInSlot(pc, "revolver_1") === pc.items[0] && DD.weaponName(pc, "revolver_1") === "Torch / pitch stick");
const back = DD.setWeapon(pc, "revolver_1", 0);
check("sync.weaponStows", back.ok && pc.guns[0].equipped === true && pc.items[0].lightHeld === false && !DL.lightInSlot(pc, "revolver_1"));
DL.hold(pc, "t1", true, "melee");
const litHtml = DD.html(pc, { readOnly: true });
check("sync.dollOn", litHtml.includes("doll-light-on") && litHtml.includes('data-doll-slot="melee"') && litHtml.includes(">On<"));
pc.items[0].lightOut = true;
const outHtml = DD.html(pc, { readOnly: true });
check("sync.dollOut", outHtml.includes("doll-light-out") && outHtml.includes(">Out<"));
check("sync.picker", DD.pickerHtml(pc, "revolver_2").includes('data-doll-light="t1"') && DD.pickerHtml(pc, "long_gun").indexOf("data-doll-light") < 0);
const beltDoll = { uid: "b9", catalogId: "belt-lantern", name: "Belt lantern", equipSlot: "accessory_1" };
const beltHtml = DD.html({ items: [beltDoll], guns: [], melee: [], shield: "", calling: "" }, { readOnly: true });
check("sync.beltTrinket", beltHtml.includes("doll-light-on") && beltHtml.includes('data-doll-slot="accessory_1"') && !DL.handsUsed({ items: [beltDoll], guns: [], melee: [], shield: "" }));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nlighting ok");

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
check("hold.ok", L.hold(c, "t1", true).ok && L.litItem(torch).bright === 20 && L.litItem(torch).dim === 20);
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

L.setSpell(c, "spell:light", true);
const prof = L.tokenProfile(c);
check("profile.spell", prof.lights.some(l => l.bright === 20 && l.name === "Light"));
check("profile.dv", prof.darkvision === 120 && prof.skulker === true);

const lights = [{ x: 0, y: 0, bright: 20, dim: 20 }];
check("level.bright", L.rawLevel(1, 0, lights, "dark") === "bright");
check("level.dim", L.rawLevel(6, 0, lights, "dark") === "dim");
check("level.dark", L.rawLevel(10, 0, lights, "dark") === "dark");
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

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nlighting ok");

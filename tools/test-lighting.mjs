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
check("spell.shellOn", !L.spellLights(shell).some((row) => row.id === "spell:light") && shell.spellMarks.zones.length === 2);
L.setSpell(shell, "spell:light", false);
check("spell.shellDismiss", shell.lightOn["spell:light"] === false && shell.spellMarks.zones.length === 1 && shell.spellMarks.zones[0].key === "daylight");
c.cantrips = ["Light", "Produce Flame"];
L.setSpell(c, "spell:produce-flame", true);
const prof = L.tokenProfile(c);
check("profile.spell", prof.lights.some(l => l.bright === 10 && l.name === "Produce Flame") && !prof.lights.some(l => l.name === "Light"));
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
check("src.ownDefault", src.includes("visionMode === 'party' ? 'party' : 'own'"));
check("src.liveSquares", src.includes("liveParty") && src.includes("function squareShown") && src.includes("function paintOwnLiveSquares") && !src.includes("revealedCells") && !src.includes("exploredFog"));
check("src.layers", src.includes("function paintRegionLayer") && src.includes("function paintMagicalDarknessLayer") && src.includes("function magicalDarknessZones"));
check("src.stack", read("assets/js/lighting.js").includes("function stackLevel") && read("assets/js/lighting.js").includes("function applyMagicalDarkness") && read("assets/js/lighting.js").includes("function regionBase"));
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
check("viewas.stays", !src.includes("View as") && !src.includes("viewAsPlayer") && src.includes('data-act="showFovBtn"'));
const doll = read("assets/js/paper-doll.js");
const items = read("assets/js/items.js");
check("doll.light", doll.includes("data-doll-light") && doll.includes("heldLight") && doll.includes("doll-light-on") && doll.includes("doll-light-out"));
check("doll.sync", doll.includes("Lights.hold(c, blocking.uid, false)") && items.includes("SSDNSDoll.paint") && items.includes("In hand"));
check("belt.trinket", L.TABLE["belt-lantern"].slot === "trinket" && L.TABLE["belt-lantern"].handsFree === true && !/TODO:.*belt lantern price/i.test(read("assets/js/lighting.js")));

const lightSpec = L.emitter("Light");
const danceSpec = L.emitter("Dancing Lights Shell");
const daySpec = L.emitter("Daylight");
const gasSpec = L.emitter("Gas Lamp");
const moonSpec = L.emitter("Moonbeam");
const wallSpec = L.emitter("Wall of Fire");
const flameSpec = L.emitter("Produce Flame");
const bladeSpec = L.emitter("Flame Blade");
const sphereSpec = L.emitter("Flaming Sphere");
const sunSpec = L.emitter("Sunbeam");
const shieldSpec = L.emitter("Fire Shield");
check("emit.radii", lightSpec.bright === 20 && lightSpec.dim === 20 && gasSpec.bright === 20 && gasSpec.dim === 20 && danceSpec.bright === 0 && danceSpec.dim === 10 && daySpec.bright === 60 && daySpec.dim === 60 && flameSpec.bright === 10 && flameSpec.dim === 10 && bladeSpec.bright === 10 && sphereSpec.bright === 20 && sphereSpec.dim === 20 && sunSpec.bright === 30 && sunSpec.dim === 30 && shieldSpec.bright === 10 && moonSpec.bright === 5 && moonSpec.dim === 5);
check("emit.wallHouse", wallSpec.houseRadius === true && wallSpec.bright === 20 && wallSpec.dim === 20 && wallSpec.place === "wall");
check("emit.not", L.NOT_EMITTERS.join() === "faerie fire,spirit guardians,guiding bolt,prayer of healing,sacred flame" && !L.emitter("Faerie Fire") && !L.emitter("Spirit Guardians") && !L.emitter("Guiding Bolt") && !L.emitter("Prayer of Healing"));
check("emit.hand", flameSpec.place === "caster" && bladeSpec.place === "caster" && sunSpec.place === "caster" && lightSpec.place === "point-or-token" && danceSpec.place === "orbs" && danceSpec.max === 4 && danceSpec.cluster === 20 && danceSpec.move === 60 && danceSpec.range === 120 && danceSpec.conc === true);
const casterPt = { x: 0.5, y: 0.5 };
const orb1 = { x: 2.5, y: 0.5 };
check("dance.add", L.canAddOrb([], orb1, casterPt, danceSpec).ok);
const farOrb = L.canAddOrb([orb1], { x: 10.5, y: 0.5 }, casterPt, danceSpec);
check("dance.cluster", !farOrb.ok && /20 ft/.test(farOrb.reason));
const nearOrb = L.canAddOrb([orb1], { x: 6.5, y: 0.5 }, casterPt, danceSpec);
check("dance.pair", nearOrb.ok && nearOrb.orbs.length === 2);
const outOrb = L.canAddOrb([], { x: 30.5, y: 0.5 }, casterPt, danceSpec);
check("dance.range", !outOrb.ok && /120/.test(outOrb.reason));
const dragOk = L.canDragOrb(nearOrb.orbs, 1, { x: 4.5, y: 0.5 }, casterPt, danceSpec, { x: 6.5, y: 0.5 });
check("dance.drag", dragOk.ok);
const dragFar = L.canDragOrb(nearOrb.orbs, 1, { x: 20.5, y: 0.5 }, casterPt, danceSpec, { x: 6.5, y: 0.5 });
check("dance.dragCap", !dragFar.ok && /60/.test(dragFar.reason));
check("borrow.line", L.borrowedText({ name: "Light", casterName: "Jolene", dur: "1 hour" }) === "Light from Jolene, 1 hr");
const foe = { id: "gob", kind: "enemy" };
const pal = { id: "pc", kind: "player", ownerUid: "u1" };
check("save.unwilling", L.needsUnwillingSave(lightSpec, foe, { id: "wiz", ownerUid: "u1" }) && !L.needsUnwillingSave(lightSpec, pal, { id: "wiz", ownerUid: "u1" }) && !L.needsUnwillingSave(daySpec, foe, { id: "wiz" }));
check("save.math", L.dexSave(10, 3, 13).passed === true && L.dexSave(8, 2, 13).passed === false);
const ticked = L.tickEmitters([{ id: "a", rounds: 10, roundsLeft: 1, name: "Dancing Lights" }, { id: "b", rounds: 0, name: "Gas Lamp" }], 1);
check("tick.expire", ticked.removed.length === 1 && ticked.removed[0].id === "a" && ticked.emitters.length === 1 && ticked.emitters[0].id === "b");
const hand = { lightOn: {}, cantrips: ["Produce Flame"], guns: [], melee: [], items: [], feats: [] };
L.setSpell(hand, "spell:produce-flame", true);
check("hand.clock", hand.lightOn["spell:produce-flame:left"] === 100 && L.tickHandLights(hand, 99) && hand.lightOn["spell:produce-flame"] === true && L.tickHandLights(hand, 1) && hand.lightOn["spell:produce-flame"] === false);
const concGone = L.dropConcEmitters([{ id: "d", conc: true, name: "Dancing Lights", key: "dancing-lights", casterUid: "u1" }, { id: "g", conc: false, name: "Gas Lamp", casterUid: "u1" }], "u1", "Dancing Lights");
check("conc.drop", concGone.removed.length === 1 && concGone.emitters.length === 1 && concGone.emitters[0].id === "g");
const pts = L.wallLightPoints({ origin: { x: 10, y: 4 }, length: 60, facing: 0 });
check("wall.points", pts.length >= 3 && Math.abs(pts[0].y - 4) < 0.001 && pts[0].x < 10 && pts[pts.length - 1].x > 10);
check("src.emitters", src.includes("function spellEmitterRows") && src.includes("function zoneLightRows") && src.includes("followTarget") && src.includes("placeSpellLight") && src.includes("ssdns-conc-end"));
check("stack.same", L.stackLevel(1, 0, { ambient: "dark", emitters: lights }) === "bright" && L.stackLevel(6, 0, { ambient: "dark", emitters: lights }) === "dim" && L.stackLevel(10, 0, { ambient: "dark", emitters: lights }) === "dark");
check("stack.region", L.stackLevel(10, 0, { ambient: "dark", regions: [{ x: 8, y: -1, w: 6, h: 4, level: "dim" }] }) === "dim");
check("stack.regionDark", L.stackLevel(1, 0, { ambient: "bright", regions: [{ x: 0, y: 0, w: 3, h: 3, level: "dark" }] }) === "dark");
check("stack.emitterWins", L.stackLevel(1, 0, { ambient: "dark", regions: [{ x: 0, y: 0, w: 3, h: 3, level: "dim" }], emitters: lights }) === "bright");
check("stack.brightWins", L.stackLevel(1, 0, { ambient: "bright", emitters: dance }) === "bright");
check("stack.laterRegion", L.stackLevel(1, 0, { ambient: "dark", regions: [{ x: 0, y: 0, w: 4, h: 4, level: "bright" }, { x: 0, y: 0, w: 2, h: 2, level: "dim" }] }) === "dim");
const ink = { magicalDark: true, kind: "box", x: 0, y: 0, w: 4, h: 4, level: 2, devilsSightSees: true, blocksDarkvision: true, dispelledByLightAtOrAbove: 3 };
const sphere = { magicalDark: true, origin: { x: 10, y: 10 }, radius: 15, level: 2, devilsSightSees: true, blocksDarkvision: true, dispelledByLightAtOrAbove: 3, conc: true, spell: "Darkness", key: "darkness", casterId: "u1" };
const hadar = { magicalDark: true, noLight: true, blindedInside: true, devilsSightSees: true, origin: { x: 0, y: 0 }, radius: 20, level: 3, dispelledByLightAtOrAbove: 3, conc: true, spell: "Hunger of Hadar", key: "hunger of hadar" };
check("stack.darkEmpty", L.applyMagicalDarkness("bright", 1, 1, [{ magicalDark: true }]) === "bright");
check("stack.darkBlocks", L.stackLevel(1, 1, { ambient: "bright", darkness: [ink] }) === "dark" && L.stackLevel(1, 1, { ambient: "bright", darkness: [ink], viewer: { x: 1, y: 1, darkvision: 60 } }) === "dark");
check("stack.darkTorch", L.stackLevel(1, 1, { ambient: "dark", darkness: [ink], emitters: [{ x: 1, y: 1, bright: 20, dim: 20 }] }) === "dark");
check("stack.darkLight", L.stackLevel(1, 1, { ambient: "dark", darkness: [ink], emitters: [{ x: 1, y: 1, bright: 20, dim: 20, magical: true, spell: true, spellLevel: 0, id: "spell:light" }] }) === "dark");
check("stack.darkGas", L.stackLevel(1, 1, { ambient: "dark", darkness: [ink], emitters: [{ x: 1, y: 1, bright: 20, dim: 20, magical: true, spellLevel: 2, id: "spell:continual-flame" }] }) === "dark");
check("stack.darkDevil", L.stackLevel(1, 1, { ambient: "bright", darkness: [ink], viewer: { x: 1, y: 1, devilsSight: true } }) === "dark" && L.devilSees(ink, { x: 1, y: 1, devilsSight: true }, 1, 1) === true);
check("stack.darkSphere", L.stackLevel(10, 10, { ambient: "dim", darkness: [sphere], viewer: { x: 10, y: 10, darkvision: 60 } }) === "dark" && L.stackLevel(14, 10, { ambient: "bright", darkness: [sphere] }) === "bright");
check("stack.hadarIn", L.stackLevel(0.2, 0.2, { ambient: "bright", darkness: [hadar], viewer: { x: 0.2, y: 0.2, devilsSight: true } }) === "dark" && L.devilSees(hadar, { x: 0.2, y: 0.2, devilsSight: true }, 0.2, 0.2) === false);
check("stack.hadarOut", L.stackLevel(1, 0, { ambient: "bright", darkness: [hadar], viewer: { x: 8, y: 0, devilsSight: true } }) === "dark" && L.devilSees(hadar, { x: 8, y: 0, devilsSight: true }, 1, 0) === true);
const dayLight = { x: 1, y: 1, bright: 60, dim: 60, spellLevel: 3, magical: true, id: "spell:daylight" };
const cantrip = { x: 1, y: 1, bright: 20, dim: 20, spellLevel: 0, magical: true, id: "spell:light" };
check("dispel.day", L.lightDispelsZone(ink, dayLight) && !L.lightDispelsZone(ink, cantrip) && !L.lightDispelsZone(ink, { x: 1, y: 1, bright: 20, dim: 20 }));
const concDark = L.dropConcDarkness([sphere, { id: "g", conc: false, magicalDark: false, spell: "Gas Lamp", casterId: "u1" }, hadar], "u1", "Darkness");
check("conc.dark", concDark.removed.length === 1 && concDark.removed[0].spell === "Darkness" && concDark.zones.length === 2);
const washFn = src.slice(src.indexOf("function paintMagicalDarknessLayer"), src.indexOf("function clipLightRegion"));
check("wash.ink", src.includes('const MAGICAL_DARK_WASH = "rgba(46, 12, 84, 0.94)"') && washFn.includes("ctx.fillStyle = MAGICAL_DARK_WASH") && !washFn.includes("role"));
check("wash.plainDark", src.includes("#0a0806") && src.includes("rgba(0,0,0,0.55)"));
check("src.mdark", src.includes('value="mdark"') && src.includes("Magical darkness") && src.includes("scene.magicalDark") && src.includes("dropConcDarkness"));
check("stack.dv", L.stackLevel(10, 0, { ambient: "dark", viewer: { x: 10, y: 0, darkvision: 60 } }) === "dim" && L.stackLevel(1, 0, { ambient: "dim", viewer: { x: 1, y: 0, darkvision: 30 } }) === "bright");
check("stack.dvFar", L.stackLevel(10, 0, { ambient: "dark", viewer: { x: 0, y: 0, darkvision: 10 } }) === "dark");
check("src.regionTool", src.includes('data-act="regionBtn"') && src.includes("function commitLightRegion") && src.includes("Shared party sight"));
const zones = read("assets/js/spell-zones.js");
check("zones.light", zones.includes('light: { bright: 20, dim: 20, spellLevel: 2, magical: true }') && zones.includes('light: { bright: 5, dim: 5, spellLevel: 2, magical: true }') && zones.includes('light: { bright: 20, dim: 20, spellLevel: 4, magical: true }'));

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

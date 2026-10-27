/**
 * Phase 2 Sat batch: belt lantern L0215, cylinder spin L0217–L0219, repeater cycle L0220–L0221.
 * Sheet 0.3.158 / DMCC 0.2.171. rules.js stays untouched.
 *   node tools/test-sat-phase2.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function sliceFn(src, name, next) {
  const at = src.indexOf("function " + name);
  const end = next ? src.indexOf("function " + next, at + 1) : src.length;
  return at < 0 ? "" : src.slice(at, end < 0 ? src.length : end);
}

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.158" && version.sheetBuild === "sheet-playtest-v03158");
check("ver.dmcc", version.dmcc === "0.2.171" && version.dmccBuild === "dmcc-playtest-v02171");
check("ver.rulesUntouched", !read("assets/data/rules.js").includes("0.3.158") && !read("database.rules.json").includes("0.3.158") && !read("assets/data/rules.js").includes("spinCylinder") && !read("assets/data/rules.js").includes("cycleTube"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
vm.runInContext(read("assets/data/rules.js"), dom.getInternalVMContext());
vm.runInContext(read("assets/js/ammo-display.js"), dom.getInternalVMContext());
const api = dom.window.SSDNSAmmoDisplay;

check("kind.revolver", api.spins({ action: "Revolver" }) && api.kind({ action: "Percussion revolver (slow)" }) === "cylinder");
check("kind.caster", api.spins({ action: "Caster cylinder" }) && api.kind({ weapon: "blacksnake" }) === "cylinder");
check("kind.tube", !api.spins({ action: "Lever (tube)" }) && api.kind({ action: "Lever (tube)" }) === "tube");
check("kind.pepperbox", !api.spins({ action: "Pepperbox" }) && api.kind({ action: "Break-action" }) === "dots");
check("kind.named", api.kind({ weapon: "henrietta-repeating-rifle" }) === "tube" && api.kind({ weapon: "dullards-plinker-revolver" }) === "cylinder");

const six = dom.window.document.createElement("div");
dom.window.document.body.appendChild(six);
api.mount(six, {
  action: "Revolver",
  cap: 6,
  chambers: ["a", "b", "c", "", "e", "f"],
  attrs: function (k) { return { "data-fire": "0", "data-k": String(k), "data-act": "chamber" }; }
});
const holes = Array.from(six.querySelectorAll(".ammo-round"));
check("cyl.count", holes.length === 6);
check("cyl.hammer", holes[0].className.includes("is-hammer") && holes[0].getAttribute("data-fire") === "0" && holes[0].getAttribute("data-act") === "chamber" && !holes[0].hasAttribute("data-spin"));
check("cyl.spin", holes[2].className.includes("is-spin") && holes[2].getAttribute("data-spin") === "1" && holes[2].getAttribute("data-act") === "spin" && !holes[2].hasAttribute("data-fire") && holes[2].getAttribute("data-k") === "2" && holes[2].getAttribute("data-gun") === "0");
check("cyl.noSecondRing", !six.querySelector(".is-next"));
check("cyl.tubeClean", !api.html({ action: "Lever (tube)", cap: 6, chambers: [1, 1, "", "", "", ""] }).includes("is-hammer") && !api.html({ action: "Lever (tube)", cap: 4, loaded: 2 }).includes("data-spin"));

const spun = api.spinTo(["a", "b", "c", "", "e", "f"], 2);
const spunLocks = api.rotateIndexes([2, 4], 2, 6);
check("spin.toHammer", spun.join("|") === "c||e|f|a|b" && spunLocks.join(",") === "0,2", spun.join("|") + " locks " + spunLocks.join(","));
let fired = spun.slice();
fired[0] = "";
fired = api.advance(fired);
const firedLocks = api.rotateIndexes(spunLocks, 1, 6);
check("spin.advance", fired.join("|") === "|e|f|a|b|" && fired[0] === "" && firedLocks.join(",") === "5,1", fired.join("|") + " locks " + firedLocks.join(","));

const ejected = api.cycleEject(["", "k:cartridge:.44:medium", "k:hex:2:spent", ""]);
check("cycle.ejectsFirst", ejected.ok && ejected.index === 1 && ejected.ejected === "k:cartridge:.44:medium" && ejected.chambers[1] === "" && ejected.chambers[2] === "k:hex:2:spent");
const emptyCycle = api.cycleEject(["", "", ""]);
check("cycle.empty", emptyCycle.ok === false && emptyCycle.reason === "Nothing chambered.");
const hexCycle = api.cycleEject(["k:hex:3:spent", "round"]);
check("cycle.hexToken", hexCycle.ok && hexCycle.ejected === "k:hex:3:spent" && hexCycle.chambers[0] === "" && hexCycle.chambers[1] === "round");

const app = read("assets/js/app.js");
const extras = read("assets/js/sheet-extras.js");
const lock = read("assets/js/turn-lock.js");
const play = read("assets/js/sheet-playtest.js");
const map = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const light = read("assets/js/lighting.js");
const gear = read("assets/data/item-catalog-gear.js");
const store = read("dm/assets/data/store-items.json");
const cycleBody = sliceFn(app, "cycleTube", "spendRound");
const spinBody = sliceFn(app, "spinCylinder", "cycleTube");
const spendBody = sliceFn(app, "spendRound", "spendHexChamber");
const hexBody = sliceFn(app, "spendHexChamber", "fire");
const rollBody = sliceFn(extras, "rollGun", "fireFreeShot");

check("sheet.cycleButton", app.includes('data-cycle') && app.includes("On the ground:") && cycleBody.includes("onto the ground") && !cycleBody.includes("returnChamber"));
check("sheet.spinFree", spinBody.includes("rotateCylinder") && !spinBody.includes("offTurnStop") && !spinBody.includes("ActionPips"));
check("sheet.hammerOnly", spendBody.includes("spinGun") && spendBody.includes("dry: true") && spendBody.includes("advanced: true"));
check("sheet.hexFromOne", hexBody.includes("position 1 only") && hexBody.includes("rotateCylinder"));
check("sheet.drySpendsAttack", extras.includes("function dryFire") && rollBody.indexOf("spinCylinder") < rollBody.indexOf('offTurnBlock("attack")') && rollBody.includes("plan.dry") && rollBody.includes("plan.hex"));
check("sheet.turnLockLeavesSpin", !lock.includes("data-spin") && !lock.includes("data-cycle") && play.includes('data-spin') && play.includes('closest("[data-spin]")'));
check("map.cycleAndSpin", map.includes('data-act="playerCycle"') && map.includes('data-act="playerSpin"') && map.includes("cycleTube") && map.includes('data-act="rowCycle"'));
check("dm.spinNotFire", v2.includes("data-cyl-spin") && v2.includes("function cylinderGun") && v2.includes("cylinderGun(atk)"));
check("lantern.table", /"belt-lantern": \{ name: "Belt lantern", bright: 15, dim: 15, slot: "trinket", handsFree: true \}/.test(light) && !/"belt-lantern": \{[^}]*placeholder/.test(light));
const beltBlock = gear.slice(gear.indexOf('"id": "belt-lantern"'), gear.indexOf('"id": "tinderbox-lucifers"'));
check("lantern.catalog", /"price": 750/.test(beltBlock) && /"weight": 1/.test(beltBlock) && /"forSale": true/.test(beltBlock) && /"wear": "trinket"/.test(beltBlock) && !/provisional/.test(beltBlock));
check("lantern.store", /"id": "belt-lantern"/.test(store) && /"price_es": 750/.test(store) && /"weight_lb": 1/.test(store));
check("out.noLootOdds", !app.includes("letterChance") && !app.includes("keyChance"));

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const sheet = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const w = sheet.window;
w.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
w.HTMLCanvasElement.prototype.getContext = function () {
  const bag = {};
  return new Proxy(bag, { get(t, p) { if (p in t) return t[p]; return function () { return bag; }; }, set(t, p, v) { t[p] = v; return true; } });
};
function run(rel) { vm.runInContext(read(rel), sheet.getInternalVMContext(), { filename: rel }); }
run("assets/data/rules.js");
run("assets/js/ssdns-bridge.js");
run("assets/js/storage.js");
run("assets/js/ammo-display.js");
run("assets/js/misfire.js");
run("assets/js/action-pips.js");
run("assets/js/app.js");
run("assets/js/sheet-extras.js");
const A = w.SSDNSApp;
const pips = w.SSDNSActionPips;
const c = A.doc().character;
const g = c.guns[0];
c.calling = "hexslinger";
c.level = 3;
g.weapon = "dullards-plinker-revolver";
g.equipped = true;
g.capacity = 6;
g.chamber = "light|.22";
g.chamberSet = true;
g.chambers = ["k:cartridge:.22:light", "", "2", "k:cartridge:.22:light", "", ""];
g.loaded = 3;
g.jammed = false;
g.pendingD4 = false;
g.lockedChambers = [4];
check("run.spin", A.spinCylinder(0, 2) === true);
check("run.underHammer", g.chambers[0] === "2" && g.chambers[1] === "k:cartridge:.22:light" && g.lockedChambers.indexOf(2) >= 0, JSON.stringify({ chambers: g.chambers, locks: g.lockedChambers }));
const hexBlock = A.spendRound(0);
check("run.hexNoShot", hexBlock.ok === false && /position 1|Cast through gun|hex shell/i.test(hexBlock.reason || ""));
g.chambers[0] = "";
g.loaded = g.chambers.filter(Boolean).length;
if (pips && pips.state) pips.reset && pips.reset();
const actionBefore = pips && pips.state ? !!pips.state().action : null;
w.SSDNSGunRoll(0, null);
const actionAfter = pips && pips.state ? !!pips.state().action : null;
check("run.dryClick", g.chambers[0] === "" && actionBefore === false && actionAfter === true, JSON.stringify({ before: actionBefore, after: actionAfter, chambers: g.chambers }));
g.chambers = ["k:cartridge:.22:light", "k:cartridge:.22:light", "", "", "", ""];
g.loaded = 2;
g.lockedChambers = [];
if (pips && pips.reset) pips.reset();
const shot = A.spendRound(0);
check("run.advance", shot.ok === true && shot.advanced === true && g.chambers[0] === "k:cartridge:.22:light" && g.chambers[g.chambers.length - 1] === "" && g.loaded === 1, JSON.stringify({ shot, chambers: g.chambers }));

g.weapon = "henrietta-repeating-rifle";
g.chamber = "medium|.44-40";
g.capacity = 6;
g.chambers = ["k:cartridge:.44-40:medium", "k:hex:2:spent", "", "", "", ""];
g.loaded = 2;
g.grounded = [];
c.ammo = [{ type: "cartridge", caliber: ".44-40", count: 8 }];
c.hexLead = { 2: [true, false] };
const ammoBefore = c.ammo[0].count;
const cycled = A.cycleTube(0);
check("run.cycle", cycled === true && g.chambers[0] === "" && g.chambers[1] === "k:hex:2:spent" && c.ammo[0].count === ammoBefore && g.grounded.length === 1, JSON.stringify({ chambers: g.chambers, grounded: g.grounded, ammo: c.ammo[0].count }));
const cycledHex = A.cycleTube(0);
check("run.cycleHex", cycledHex === true && !g.chambers.some(Boolean) && c.hexLead[2][0] === true && c.hexLead[2][1] === false && (g.grounded || []).some((t) => /Hex shell 2/.test(t)), JSON.stringify({ chambers: g.chambers, hex: c.hexLead[2], grounded: g.grounded }));
g.chambers = ["", "", "", "", "", ""];
g.loaded = 0;
check("run.cycleEmpty", A.cycleTube(0) === false);
check("run.tubeNoSpin", A.spinCylinder(0, 1) === false);
g.weapon = "dullards-plinker-revolver";
g.chambers = ["k:cartridge:.22:light", "k:cartridge:.22:light", "", "", "", ""];
g.loaded = 2;
check("run.revolverNoCycle", A.cycleTube(0) === false && g.loaded === 2);
A.applyPatch((d) => {
  const gun = d.character.guns[0];
  gun.weapon = "dullards-plinker-revolver";
  gun.equipped = true;
  gun.capacity = 6;
  gun.chamber = "light|.22";
  gun.chamberSet = true;
  gun.chambers = ["k:cartridge:.22:light", "k:cartridge:.22:light", "", "", "", ""];
  gun.loaded = 2;
  gun.lockedChambers = [];
  gun.grounded = [];
});
const rounds = w.document.querySelectorAll('[data-chambers="0"] .ammo-round');
const cycleBtn = w.document.querySelector('[data-cycle="0"]');
check("dom.hammer", rounds.length === 7 && rounds[0].classList.contains("is-hammer") && rounds[2].classList.contains("is-spin") && rounds[2].getAttribute("data-spin") === "1" && rounds[2].getAttribute("data-fire") == null, rounds.length + " fire=" + (rounds[2] && rounds[2].getAttribute("data-fire")));
check("dom.noCycleOnRevolver", !!cycleBtn && cycleBtn.hidden === true);
A.applyPatch((d) => {
  const gun = d.character.guns[0];
  gun.weapon = "henrietta-repeating-rifle";
  gun.equipped = true;
  gun.chamber = "medium|.44-40";
  gun.chamberSet = true;
  gun.chambers = ["k:cartridge:.44-40:medium", "k:cartridge:.44-40:medium", "", "", "", ""];
  gun.loaded = 2;
});
const cycleBtn2 = w.document.querySelector('[data-cycle="0"]');
const tubePic = w.document.querySelector('[data-chambers="0"] .ssdns-ammo-tube');
check("dom.cycleOnTube", !!cycleBtn2 && cycleBtn2.hidden === false && cycleBtn2.disabled === false && !!tubePic && !tubePic.querySelector(".is-hammer") && !tubePic.querySelector("[data-spin]"));
const ground = w.document.querySelector('[data-ground="0"]');
A.cycleTube(0);
check("dom.ground", !!ground && ground.hidden === false && /On the ground:/.test(ground.textContent) && /Not in the belt/.test(ground.textContent), ground && ground.textContent);

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("sat phase 2 ok");
process.exit(0);

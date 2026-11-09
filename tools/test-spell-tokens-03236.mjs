/**
 * Spell-token cards drop on cast and link to the caster.
 * Live tip after the shove restack is sheet 0.3.271 / DMCC 0.2.284.
 * Spiritual Weapon, Flaming Sphere, and Guardian of Faith are effect pieces.
 *
 *   node tools/test-spell-tokens-03236.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.271" && version.sheetBuild === "sheet-playtest-v03271");
check("ver.dmcc", version.dmcc === "0.2.284" && version.dmccBuild === "dmcc-playtest-v02284");

const bestiary = JSON.parse(read("dm/assets/data/bestiary.json"));
function card(id) { return bestiary.find((b) => b && b.id === id); }
["spiritual-weapon", "flaming-sphere", "guardian-of-faith"].forEach((id) => {
  const b = card(id);
  check("card." + id, !!(b && b.pieceType === "effect" && b.draft !== true && b.group === "spell-tokens" && b.creature === false));
  const baked = (b && b.attackList || []).some((a) => a && (a.toHit != null || a.dc != null));
  check("card." + id + ".caster", !!(b && !baked && (b.attackList || []).every((a) => !a || a.toHitFrom === "casterSpellAttack" || a.dcFrom === "casterSpellSave")));
});
check("card.sw.action", (card("spiritual-weapon").playerActions || []).some((a) => a && a.name === "Move and Strike" && a.slotCost === 0));
check("card.sphere.action", (card("flaming-sphere").playerActions || []).some((a) => a && a.name === "Shove" && a.slotCost === 0));
check("card.guard.budget", card("guardian-of-faith").damageBudget === 60 && card("guardian-of-faith").hp == null && card("guardian-of-faith").showHp === false);
["map/spell-tokens/spiritual-weapon-token-140.png", "map/spell-tokens/spiritual-weapon-token-512.png",
  "map/spell-tokens/flaming-sphere-token-140.png", "map/spell-tokens/flaming-sphere-token-512.png",
  "map/spell-tokens/guardian-of-faith-token-280.png", "map/spell-tokens/guardian-of-faith-token-1024.png",
  "map/tokenImages/bestiary/spiritual-weapon-token-140.png",
  "map/tokenImages/bestiary/flaming-sphere-token-140.png",
  "map/tokenImages/bestiary/guardian-of-faith-token-280.png"].forEach((rel) => {
  check("art." + path.basename(rel), fs.existsSync(path.join(root, rel)) && !rel.includes("specs/"));
});

const sheet = read("assets/js/sheet-extras.js");
const hiddenAt = sheet.indexOf("if (placedBlast) sealPlacedZone(spellName, slot, placedBlast, v.spellDC);");
const commitAt = sheet.indexOf("commitCast();", hiddenAt);
check("cast.seals-before-hidden-return", hiddenAt > 0 && commitAt > hiddenAt);
check("cast.piece-button", sheet.includes("runPieceAction") && sheet.includes("Move and Strike") === false);
check("cast.no-slot-on-piece", /function runPieceAction[\s\S]*?function strikeFromPiece/.test(sheet) && !/function runPieceAction[\s\S]*?function strikeFromPiece/.exec(sheet)[0].includes("spendForCast"));

function makeWindow() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously"
  });
  const w = dom.window;
  w.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  w.cancelAnimationFrame = (id) => clearTimeout(id);
  const proto = w.HTMLElement.prototype;
  try {
    Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 800; } });
    Object.defineProperty(proto, "clientHeight", { configurable: true, get() { return 600; } });
  } catch (e) {}
  proto.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON() { return {}; } };
  };
  w.HTMLCanvasElement.prototype.getContext = function () {
    const bag = { fillStyle: "", strokeStyle: "", globalAlpha: 1 };
    return new Proxy(bag, {
      get(t, p) {
        if (p in t) return t[p];
        if (typeof p !== "string") return undefined;
        if (p === "measureText") return function () { return { width: 24 }; };
        if (p === "createLinearGradient" || p === "createRadialGradient") {
          return function () { return { addColorStop() {} }; };
        }
        return function () {};
      },
      set(t, p, v) { t[p] = v; return true; }
    });
  };
  w.HTMLImageElement.prototype.decode = function () { return Promise.resolve(); };
  w.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  return w;
}
function boot(w) {
  w.addEventListener("error", (ev) => {
    console.log("script error", ev.message, ev.filename, ev.lineno);
  });
  ["assets/js/spell-area.js", "assets/js/spell-zones.js", "assets/js/spell-tokens.js", "assets/js/spell-riders.js", "map/ssdns-map-firebase.js", "map/ssdns-map-fx.js", "map/ssdns-map.js"].forEach((rel) => {
    const s = w.document.createElement("script");
    s.textContent = read(rel);
    w.document.body.appendChild(s);
  });
}

const scene = JSON.parse(read("map/scene-dusty-spur.json"));
const store = { pub: {}, dm: {} };
const bus = [];
const pw = makeWindow();
const dw = makeWindow();
boot(pw);
boot(dw);
const Z = pw.SSDNSSpellZones;
const R = pw.SSDNSSpellRiders;
check("sustain.buttons", R.sustainSpec("Spiritual Weapon").button === "Move and Strike" && R.sustainSpec("Spiritual Weapon").conc === false && R.sustainSpec("Flaming Sphere").button === "Shove" && R.sustainSpec("Flaming Sphere").move === 30);
const sphereSpec = Z.specOf("Flaming Sphere");
check("sphere.half", !!(sphereSpec && sphereSpec.ticks && sphereSpec.ticks[0] && sphereSpec.ticks[0].half === true && sphereSpec.ticks[0].when === "end" && sphereSpec.ticks[0].near === 5));
check("blade.not-token", pw.SSDNSSpellTokens.isHeld("Flame Blade") && !pw.SSDNSSpellTokens.isToken("Flame Blade"));

const guard = Z.buildZone("Guardian of Faith", { origin: { x: 8, y: 8 } }, { slot: 4, casterId: "p1", dc: 15, id: "zone-guard" });
const enter = Z.moveDue([guard], { x: 12, y: 8 }, { x: 11, y: 8 }, { id: "foe", x: 11, y: 8, size: 1, hostile: true });
const stay = Z.moveDue([guard], { x: 11, y: 8 }, { x: 11, y: 9 }, { id: "foe", x: 11, y: 9, size: 1, hostile: true });
const far = Z.moveDue([guard], { x: 14, y: 8 }, { x: 13, y: 8 }, { id: "foe", x: 13, y: 8, size: 1 });
check("guard.approach", enter.length === 1 && enter[0].when === "approach" && enter[0].dice === "20" && enter[0].half === true && enter[0].save === "DEX");
check("guard.already", stay.length === 0);
check("guard.outside", far.length === 0);
const seen = {};
check("guard.once", Z.once(seen, enter[0], "foe", "1:0") === true && Z.once(seen, enter[0], "foe", "1:0") === false);
let charged = Z.charge([guard], guard.id, 20);
check("guard.budget-fail", charged.spent === 20 && !charged.ended && charged.zones[0].spent === 20);
charged = Z.charge(charged.zones, guard.id, 10);
check("guard.budget-save", charged.spent === 30 && !charged.ended);
charged = Z.charge(charged.zones, guard.id, 30);
check("guard.budget-gone", !!(charged.ended && charged.ended.spent === 60 && charged.zones.length === 0));

const sphere = Z.buildZone("Flaming Sphere", { origin: { x: 4, y: 4 } }, { slot: 4, casterId: "p1", dc: 15, id: "zone-sphere" });
check("sphere.upcast", sphere.ticks[0].dice === "4d6" && sphere.light && sphere.light.bright === 20 && sphere.light.dim === 20);
const endNear = Z.phaseDue({ zones: [sphere] }, { id: "foe", x: 5, y: 4, size: 1, name: "Bull" }, "end");
const endFar = Z.phaseDue({ zones: [sphere] }, { id: "foe", x: 8, y: 4, size: 1 }, "end");
check("sphere.end", endNear.length === 1 && endNear[0].half === true && endNear[0].save === "DEX" && endFar.length === 0);

const weapon = Z.buildZone("Spiritual Weapon", { origin: { x: 2, y: 2 } }, { slot: 2, casterId: "p1", id: "zone-sw" });
check("sw.zone", weapon && weapon.createToken === true && weapon.conc === false && weapon.key === "spiritual weapon");

const playerAd = pw.SSDNSMapFirebase.memory({ role: "player", store: store, bus: bus });
const dmAd = dw.SSDNSMapFirebase.memory({ role: "dm", store: store, bus: bus });
const playerEl = pw.document.createElement("div");
const dmEl = dw.document.createElement("div");
pw.document.body.appendChild(playerEl);
dw.document.body.appendChild(dmEl);
const room = { table: { initiative: { order: [], turn: 0 } } };
const playerMap = pw.SSDNSMap.create({
  el: playerEl, role: "player", uid: "p1", adapter: playerAd,
  host: { players() { return []; } },
  options: { scene: scene, assetBase: "map/", room: room }
});
const dmMap = dw.SSDNSMap.create({
  el: dmEl, role: "dm", uid: "dm", adapter: dmAd,
  host: { players() { return [{ uid: "p1", name: "TEST" }]; } },
  options: { scene: JSON.parse(JSON.stringify(scene)), assetBase: "../map/", room: room }
});
await flush(40);
await dmAd.write("map/public/tokens/tok-pc", {
  id: "tok-pc", name: "TEST Caster", ownerUid: "p1", kind: "player",
  pos: { x: 1, y: 1 }, size: 1, sceneId: "scn_dustyspur01", controlledBy: []
}, { by: "dm" });
await dmAd.write("map/public/tokens/tok-foe", {
  id: "tok-foe", name: "Bull", kind: "enemy", ownerUid: "",
  pos: { x: 7, y: 4 }, size: 1, sceneId: "scn_dustyspur01"
}, { by: "dm" });
await flush(40);

playerMap.setSpellZones([weapon, sphere, guard], { casterId: "p1" });
await flush(80);

function piece(map, key) {
  return (map.tokenBoxes() || []).find((t) => t && t.spellPiece === key);
}
const swP = piece(playerMap, "spiritual weapon");
const swD = piece(dmMap, "spiritual weapon");
const spD = piece(dmMap, "flaming sphere");
const gD = piece(dmMap, "guardian of faith");
const pc = (dmMap.tokenBoxes() || []).find((t) => t && t.ownerUid === "p1" && !t.spellPiece);
check("drop.player", !!(swP && swP.ownerUid === "" && (swP.controlledBy || []).indexOf("p1") >= 0 && swP.image.indexOf("spiritual-weapon-token-140.png") >= 0), JSON.stringify(swP));
check("drop.dm", !!(swD && swD.id === swP.id && swD.ownerUid === "" && (swD.controlledBy || []).indexOf("p1") >= 0), JSON.stringify(swD && { id: swD.id, owner: swD.ownerUid, by: swD.controlledBy }));
check("drop.sphere", !!(spD && spD.image.indexOf("flaming-sphere-token-140.png") >= 0 && (spD.controlledBy || []).indexOf("p1") >= 0));
check("drop.guard", !!(gD && gD.size === 2 && gD.budgetLeft === 60 && gD.image.indexOf("guardian-of-faith-token-280.png") >= 0 && gD.ownerUid === ""), JSON.stringify(gD && { size: gD.size, budget: gD.budgetLeft, owner: gD.ownerUid }));
check("pc.stays", !!(pc && pc.ownerUid === "p1" && pc.id !== swD.id && pc.kind !== "spell"), JSON.stringify(pc && { id: pc.id, owner: pc.ownerUid, kind: pc.kind }));

const stepped = dmMap.moveSpellPiece(swD.id, swD.x + 6, swD.y);
check("sw.move", !!(stepped && stepped.to.x === swD.x + 4 && stepped.to.y === swD.y && !stepped.rammed), JSON.stringify(stepped && stepped.to));
const shoved = dmMap.moveSpellPiece(spD.id, 7, 4);
check("sphere.shove", !!(shoved && shoved.rammed && shoved.rammed.name === "Bull" && shoved.to.x === 6 && shoved.to.y === 4), JSON.stringify(shoved));
const parked = dmMap.moveSpellPiece(gD.id, gD.x + 3, gD.y);
check("guard.still", !!(parked && parked.to.x === gD.x && parked.to.y === gD.y), JSON.stringify(parked && parked.to));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nspell tokens ok");
process.exit(0);

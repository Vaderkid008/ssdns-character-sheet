/**
 * N78 — damaging casts change HP.
 * Cone / cube / line apply a save (half on success) to every token in the shape.
 * Touch spells stop past 5 ft. Magic Missile darts split across targets.
 *   node tools/test-n78-spells.mjs
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

const context = { console: console, Math: Math, Date: Date };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("assets/js/spell-fx.js"), context);
vm.runInContext(read("assets/js/spell-area.js"), context);
const A = context.SSDNSSpellArea;

const book = JSON.parse(read("tools/spell_cast.json"));
context.SSDNS_RULES = { spellCast: book };
vm.runInContext(read("assets/js/spell-cast.js"), context);
const Cast = context.SSDNSSpellCast;

const rows = [
  { id: "en1", kind: "enemy", name: "Outlaw", mapTokenId: "tok_en", hp: 30 },
  { id: "en2", kind: "enemy", name: "Deputy", mapTokenId: "tok_en2", hp: 18 },
  { id: "pc2", kind: "player", name: "Bo", playerId: "uid_bo", mapTokenId: "tok_bo", hp: 22 }
];
const caster = { id: "ply_pc", x: 0, y: 0, size: 1, ownerUid: "uid_pc", name: "Ada" };
const front = { id: "tok_en", x: 1, y: 0, size: 1, name: "Token" };
const second = { id: "tok_en2", x: 2, y: 0, size: 1, name: "Token" };
const side = { id: "tok_side", x: 0, y: 3, size: 1, name: "Side" };
const ally = { id: "tok_bo", x: 1, y: 0, size: 1, ownerUid: "uid_bo", name: "Bo" };
const origin = [{ x: 2.5, y: 2.5, casterSize: 1 }];

function strike(area, saves, full) {
  return A.applyArea({
    area: area,
    origins: origin,
    facing: 0,
    tokens: [caster, front, second, side],
    excludeId: caster.id,
    rows: rows,
    full: full,
    half: true,
    kind: "save",
    saves: saves
  });
}

const hands = A.areaOf("Burning Hands");
const saved = strike(hands, { en1: { failed: false, blocked: false }, en2: { failed: true, blocked: false } }, 11);
const byId = {};
saved.forEach((row) => { byId[row.targetId] = row; });
check("cone.shape", hands && hands.shape === "cone" && hands.self && hands.length === 15);
check("cone.front.half", byId.en1 && byId.en1.amount === 5 && byId.en1.targetId === "en1", JSON.stringify(saved));
check("cone.second.fail", byId.en2 && byId.en2.amount === 11, JSON.stringify(byId.en2));
check("cone.side.miss", !saved.some((row) => row.tokenId === "tok_side"));
check("cone.caster.out", !saved.some((row) => row.tokenId === "ply_pc"));
check("cone.id.notMap", byId.en1 && byId.en1.targetId !== "tok_en");

const failed = strike(hands, { en1: { failed: true }, en2: { failed: false } }, 12);
check("cone.fail.full", failed.some((row) => row.targetId === "en1" && row.amount === 12));
check("cone.save.half", failed.some((row) => row.targetId === "en2" && row.amount === 6));

const wave = A.areaOf("Thunderwave");
const waved = strike(wave, { en1: { failed: false }, en2: { failed: false } }, 9);
check("cube.hits", wave && wave.shape === "cube" && waved.some((row) => row.targetId === "en1" && row.amount === 4), JSON.stringify(waved.map((r) => r.targetId + ":" + r.amount)));

const bolt = A.areaOf("Lightning Bolt");
const bolted = strike(bolt, { en1: { failed: true }, en2: { failed: true } }, 28);
check("line.hits", bolt && bolt.shape === "line" && bolted.filter((row) => row.amount === 28).length >= 2, JSON.stringify(bolted));

const friendly = A.applyArea({
  area: hands, origins: origin, facing: 0,
  tokens: [caster, ally], excludeId: "uid_pc", rows: rows,
  full: 10, half: true, kind: "save", saves: { uid_bo: { failed: false } }
});
check("cone.friendly", friendly.some((row) => row.targetId === "uid_bo" && row.amount === 5), JSON.stringify(friendly));

check("touch.far", A.touchBlock(10, "touch") === "Out of reach.");
check("touch.adj", A.touchBlock(5, "touch") === "" && A.touchBlock(0, "touch") === "");
check("touch.unknown", A.touchBlock(null, "touch") === "Out of reach. Put a token next to you on the map.");
check("touch.heal.unknown", A.touchBlock(null, "touch", { allowUnmeasured: true }) === "");
check("touch.notTouch", A.touchBlock(40, "120 ft") === "");
check("range.missile", A.rangeBlock(130, "120 ft") === "Out of range." && A.rangeBlock(120, "120 ft") === "");
check("range.touch", A.rangeBlock(10, "touch") === "Out of reach.");
check("grasp.meta", Cast.rangeOf("Shocking Grasp") === "touch");
check("missile.meta", Cast.rangeOf("Magic Missile") === "120 ft");

const mm = Cast.lookup("Magic Missile");
check("missile.count", A.dartCount(mm, 1) === 3 && A.dartCount(mm, 2) === 4);
const groups = A.assignDarts(
  [{ n: 1, total: 3, text: "1d4+1 = 3" }, { n: 2, total: 4, text: "1d4+1 = 4" }, { n: 3, total: 2, text: "1d4+1 = 2" }],
  [{ id: "en1", name: "Outlaw" }, { id: "en2", name: "Deputy" }, { id: "en1", name: "Outlaw" }]
);
check("darts.split", groups.length === 2, JSON.stringify(groups));
const outlaw = groups.filter((g) => g.id === "en1")[0];
const deputy = groups.filter((g) => g.id === "en2")[0];
check("darts.sum", outlaw && outlaw.total === 5 && deputy && deputy.total === 4, JSON.stringify(groups));
check("darts.force", outlaw.bits.length === 2 && deputy.total > 0);
const rolledMm = Cast.rollCast({ spellName: "Magic Missile", slotLevel: 1 });
check("missile.roll", rolledMm.kind === "auto" && rolledMm.darts && rolledMm.darts.length === 3 && rolledMm.darts.every((d) => d.total >= 2 && d.total <= 5) && rolledMm.damageTotal === rolledMm.darts.reduce((s, d) => s + d.total, 0), JSON.stringify(rolledMm.darts));

const handsRoll = Cast.rollCast({ spellName: "Burning Hands", slotLevel: 1, dc: 13 });
check("hands.roll", handsRoll.kind === "save" && handsRoll.save === "DEX" && handsRoll.half === true && handsRoll.damageTotal >= 3 && handsRoll.damageTotal <= 18, JSON.stringify({ save: handsRoll.save, half: handsRoll.half, total: handsRoll.damageTotal }));
const waveRoll = Cast.rollCast({ spellName: "Thunderwave", slotLevel: 1, dc: 13 });
check("wave.roll", waveRoll.kind === "save" && waveRoll.half === true && waveRoll.damageTotal >= 2);
const boltRoll = Cast.rollCast({ spellName: "Lightning Bolt", slotLevel: 3, dc: 15 });
check("bolt.roll", boltRoll.kind === "save" && boltRoll.half === true && boltRoll.damageTotal >= 8);

const gaps = [];
book.forEach((row) => {
  if (!row || !row.name) return;
  const kind = row.kind || "none";
  const damaging = kind === "attack" || kind === "save" || kind === "auto" || kind === "heal" || kind === "weapon";
  if (!damaging) {
    gaps.push(row.name + " (" + kind + ", no HP on cast)");
    return;
  }
  if (!row.dice) {
    gaps.push(row.name + " (attack with no damage dice)");
    return;
  }
  const rolled = Cast.rollCast({
    spellName: row.name,
    slotLevel: row.level || 0,
    characterLevel: 5,
    attackBonus: 5,
    weaponAtk: 5,
    spellMod: 3,
    dc: 13,
    mode: ""
  });
  const miss = rolled.attack && rolled.nat === 1 && !(rolled.shots && rolled.shots.some((s) => s.amount > 0)) && !(rolled.darts && rolled.darts.length);
  if (!miss && !(Number(rolled.damageTotal) > 0)) gaps.push(row.name + " (rolled 0)");
});
check("audit.damage", !gaps.some((g) => /rolled 0/.test(g)), gaps.filter((g) => /rolled 0/.test(g)).join("; "));
console.log("gaps " + gaps.length);
gaps.forEach((g) => console.log("  gap " + g));

const sheet = read("assets/js/sheet-extras.js");
const map = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const rules = read("assets/data/rules.js");
check("src.strike", map.includes("strikeTargetId") && map.includes("b.facing = Math.atan2"));
check("src.touch", sheet.includes("spellReachMessage") && v2.includes("function reachBlock") && map.includes("function touchGate"));
check("src.darts", sheet.includes("assignDarts") && v2.includes("askSpellDarts") && v2.includes("applyDartGroups"));
check("src.find", v2.includes("r.mapTokenId === want"));
check("src.rules", !rules.includes("spell-area") && !rules.includes("0.3.166") && !read("database.rules.json").includes("0.3.166"));
const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.166" && version.sheetBuild === "sheet-playtest-v03166");
check("ver.dmcc", version.dmcc === "0.2.179" && version.dmccBuild === "dmcc-playtest-v02179");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall checks passed");

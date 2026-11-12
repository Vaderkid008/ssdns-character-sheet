/**
 * COA #14 — a lasting map effect ticks on the round wrap, not on the caster's turn,
 * and a DM publish drops it from the player map when the clock hits zero
 * (sheet 0.3.296 / DMCC 0.2.309).
 *   node tools/test-out-of-turn-timers-03248.mjs
 * rules.js is not regenerated.
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

const context = { console, Math, Date, Promise };
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/js/spell-fx.js", "assets/js/spell-buffs.js", "assets/js/spell-riders.js", "assets/js/spell-area.js", "assets/js/spell-zones.js", "assets/js/spell-tokens.js"].forEach((rel) => {
  vm.runInContext(read(rel), context);
});
const Z = context.SSDNSSpellZones;
const R = context.SSDNSSpellRiders;
const Tok = context.SSDNSSpellTokens;
function at(x, y) { return { origin: { x: x, y: y }, facing: 0, area: null }; }

const hunger = Z.buildZone("Hunger of Hadar", at(8, 8), { slot: 3, casterId: "p_jolene", casterName: "Jolene", dc: 15, id: "hadar-1" });
const sphere = Z.buildZone("Flaming Sphere", at(4, 4), { slot: 2, casterId: "p_jolene", casterName: "Jolene", dc: 14, id: "sphere-1" });
const spirit = Z.buildZone("Spiritual Weapon", at(5, 5), { slot: 2, casterId: "p_jolene", casterName: "Jolene", id: "spirit-1" });
const faith = Z.buildZone("Guardian of Faith", at(6, 6), { slot: 4, casterId: "p_jolene", casterName: "Jolene", dc: 15, id: "faith-1" });
const wall = Z.buildZone("Wall of Fire", at(12, 8), { slot: 4, casterId: "p_caleb", casterName: "Caleb", id: "wall-1" });

check("book.hunger", hunger && hunger.conc && hunger.rounds === 10 && hunger.roundsLeft === 10 && hunger.shape === "sphere");
check("book.sphere", sphere && sphere.conc && sphere.createToken && sphere.rounds === 10 && Tok.isToken("flaming sphere"));
check("book.spirit", spirit && !spirit.conc && spirit.createToken && spirit.rounds === 10 && Tok.isToken("spiritual weapon"));
check("book.faith", faith && faith.createToken && faith.rounds === 4800 && Tok.isToken("guardian of faith"));
check("untimed.stays", Z.tickRounds([{ id: "mark", spell: "Hunter's Mark", dur: "until dispelled", casterId: "p_jolene" }], 4).zones.length === 1);

/* The round clock wraps after the last living turn. Here that turn is the bandit, not Jolene. */
const order = [{ id: "p_jolene", name: "Jolene" }, { id: "bandit", name: "Bandit" }];
const banditTurn = 1;
const nextIndex = (banditTurn + 1) % order.length;
const wrapped = nextIndex <= banditTurn;
check("offturn.wrap", wrapped && order[banditTurn].id !== hunger.casterId && nextIndex === 0);

const mid = Z.tickRounds([hunger, sphere, spirit, wall], 1);
check("offturn.tick", mid.removed.length === 0 && mid.zones.every((z) => z.roundsLeft === z.rounds - 1) && mid.zones.every((z) => z.casterId === (z.id === "wall-1" ? "p_caleb" : "p_jolene")));
const almost = mid.zones.map((z) => Object.assign({}, z, { roundsLeft: 1 }));
const ended = Z.tickRounds(almost, 1);
check("expire.zero", ended.zones.length === 0 && ended.removed.length === 4 && ended.removed.every((z) => z.roundsLeft === 0));
check("expire.log", /Hunger of Hadar expires/.test(ended.logs.join(" ")) && /Flaming Sphere expires/.test(ended.logs.join(" ")));

const playerCopy = almost.slice();
const published = Z.mergeFeed(playerCopy, ended.zones, { full: true });
check("player.cleared", published.length === 0);
const stillUp = Z.mergeFeed(playerCopy, mid.zones, { full: true });
check("player.keepsLive", stillUp.length === 4 && stillUp.every((z) => z.roundsLeft === 9));

const joleneOnly = Z.mergeFeed([hunger, wall], [Object.assign({}, hunger, { roundsLeft: 8 })], { sender: "p_jolene", full: false });
check("partial.keepsOther", joleneOnly.some((z) => z.id === "wall-1" && z.roundsLeft === 10) && joleneOnly.some((z) => z.id === "hadar-1" && z.roundsLeft === 8));

const cleared = Z.clearZones([hunger, wall], { id: hunger.id });
check("clear.one", cleared.removed.length === 1 && cleared.removed[0].id === "hadar-1" && cleared.zones.length === 1 && cleared.zones[0].id === "wall-1");
const placed = Z.place({ zones: [], conc: "" }, hunger);
const broke = R.breakConc(placed.bag, "Hunger of Hadar");
check("conc.break", broke.bag.zones.length === 0 && broke.bag.conc === "");
const spiritPlaced = Z.place({ zones: [spirit], conc: "" }, spirit);
const spiritBroke = R.breakConc(spiritPlaced.bag, "Bless");
check("spirit.notConc", spiritBroke.bag.zones.some((z) => z.id === "spirit-1"));

function tokenWant(zones) {
  const want = {};
  (zones || []).forEach((z) => {
    if (z && z.id && Tok.isToken(z.key || z.spell)) want[z.id] = 1;
  });
  return want;
}
const tokenLive = tokenWant(mid.zones);
const tokenGone = tokenWant(ended.zones);
check("token.live", tokenLive["sphere-1"] && tokenLive["spirit-1"] && !tokenLive["hadar-1"]);
check("token.gone", !tokenGone["sphere-1"] && !tokenGone["spirit-1"] && !tokenGone["faith-1"]);

const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const wrapAt = v2.indexOf("if (step.wrapped)");
const wrapBlock = v2.slice(wrapAt, wrapAt + 280);
check("wire.wrap", wrapAt > 0 && wrapBlock.includes("expireSpellZones();") && wrapBlock.includes("fight.round += 1") && !/caster/.test(wrapBlock));
check("wire.full", map.includes("full: role === \"dm\"") && map.includes("Z.mergeFeed") && map.includes("state.zoneRoster"));
check("wire.bomb", map.includes('data-act="bombDefuse"') && map.includes('data-act="bombArm"') && read("map/interact-timers.js").includes("function onRound"));
check("wire.badge", map.includes("ssm-zone-badges") && map.includes('if (role !== \'dm\') zoneBadgeLayer.hidden = true'));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.296" && ver.dmcc === "0.2.309" && ver.sheetBuild === "sheet-playtest-v03296" && ver.dmccBuild === "dmcc-playtest-v02309");
const rules = read("assets/data/rules.js");
check("rules.clean", !rules.includes("0.3.296") && !rules.includes("0.2.309") && !read("database.rules.json").includes("0.3.296"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nout-of-turn timers ok");

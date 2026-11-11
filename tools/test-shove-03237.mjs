/**
 * Creature Shove replaces one attack (sheet 0.3.289 / DMCC 0.2.302).
 * A win slides the target 5 feet. It does not offer prone.
 *
 *   node tools/test-shove-03237.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.289" && version.sheetBuild === "sheet-playtest-v03289");
check("ver.dmcc", version.dmcc === "0.2.302" && version.dmccBuild === "dmcc-playtest-v02302");
check("rules.untouched", !read("assets/data/rules.js").includes("creature Shove"));

const context = vm.createContext({ console, Math });
context.globalThis = context;
vm.runInContext(read("assets/js/grab.js"), context);
vm.runInContext(read("assets/js/shove.js"), context);
const S = context.SSDNSShove;

check("size.medium-large", S.sizeOk("Medium", "Large") && S.sizeOk("Medium", "Medium") && !S.sizeOk("Medium", "Huge") && !S.sizeOk("Medium", "Gargantuan"));
check("size.small", S.sizeOk("Small", "Medium") && !S.sizeOk("Small", "Large") && S.sizeOk("Large", "Huge"));
check("reach.five", S.reachFeet({ melee: [{ weapon: "dagger", equipped: true, properties: "" }] }) === 5);
check("reach.ten", S.reachFeet({ melee: [{ weapon: "glaive", equipped: true, properties: "Reach, heavy" }] }) === 10);
check("reach.stowed", S.reachFeet({ melee: [{ weapon: "glaive", equipped: false, properties: "Reach" }] }) === 5);
const gate = S.gate({ actorSize: "Medium", targetSize: "Huge", feet: 5, reach: 5 });
check("gate.huge", gate.ok === false && gate.tooBig === true);
const far = S.gate({ actorSize: "Medium", targetSize: "Medium", feet: 10, reach: 5 });
check("gate.ten", far.ok === false && far.outOfRange === true);
const pole = S.gate({ actorSize: "Medium", targetSize: "Medium", feet: 10, reach: 10 });
check("gate.pole", pole.ok === true);
const near = S.gate({ actorSize: "Medium", targetSize: "Large", feet: 5, reach: 5 });
check("gate.near", near.ok === true);

const seq = [12, 8];
let n = 0;
const win = S.contest({
  actor: { skills: { Athletics: 5 } },
  target: { skills: { Athletics: 1, Acrobatics: 6 } },
  actorSize: "Medium",
  targetSize: "Medium",
  defenseSkill: "Athletics",
  feet: 5,
  reach: 5,
  rng: () => (seq[n++] - 1) / 20
});
check("contest.chosen", win.ok === true && win.defense.skill === "Athletics" && win.defense.mod === 1 && win.slide === 5, JSON.stringify(win));
n = 0;
const lose = S.contest({
  actor: { skills: { Athletics: 0 } },
  target: { skills: { Athletics: 0, Acrobatics: 9 } },
  actorSize: "Medium",
  targetSize: "Medium",
  defenseSkill: "Acrobatics",
  feet: 5,
  reach: 5,
  rng: () => (seq[n++] - 1) / 20
});
check("contest.acrobatics", lose.ok === false && lose.defense.skill === "Acrobatics" && lose.slide === 0);
n = 0;
const tie = S.contest({
  actor: { skills: { Athletics: 0 } },
  target: { skills: { Athletics: 0 } },
  defenseSkill: "Athletics",
  feet: 5,
  reach: 5,
  rng: () => 0
});
check("contest.tie", tie.ok === false && tie.tie === true && tie.slide === 0);
const need = S.contest({ actorSize: "Medium", targetSize: "Medium", feet: 5, reach: 5 });
check("contest.choice", need.needChoice === true && need.ok === false);
check("no.prone", !/prone/i.test(read("assets/js/shove.js")));

const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const sheet = read("assets/js/sheet-playtest.js");
const join = read("assets/js/dm-join.js");
check("ui.fight", v2.includes('data-shove="${i}"') && v2.includes(">Shove</button>") && v2.includes(">Rob/Disarm</button>"));
check("ui.map", map.includes('data-act="shoveBtn"') && map.includes('data-act="playerShove"') && map.includes("drawer:shove"));
check("ui.sheet", sheet.includes('shoveBtn.id = "btnShove"') && sheet.includes('SSDNSActionPips.attack("Shove")'));
check("pip.enemy", v2.includes('spendEnemyPip(actor, "attack", "Shove")'));
check("slide", v2.includes("slideShove") && v2.includes("feet: 5") && v2.includes('dir: "push"') && v2.includes("forced: true"));
check("post", join.includes('type: "shove"') && join.includes('type: "shove_answer"') && join.includes('case "shove_pick"'));
check("host", read("map/ssdns-map-host.js").includes('"drawer:shove": "shove"'));
check("not.spell", !map.includes("flaming sphere") || map.indexOf('data-act="shoveBtn"') > 0);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nshove ok");

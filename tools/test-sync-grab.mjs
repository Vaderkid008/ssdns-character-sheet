/**
 * Sheet 0.3.54 / DMCC 0.2.67: snapshot sync and Disarm / Rob.
 *   node tools/test-sync-grab.mjs
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
check("ver.sheet", version.sheet === "0.3.159" && version.sheetBuild === "sheet-playtest-v03159");
check("ver.dmcc", version.dmcc === "0.2.172" && version.dmccBuild === "dmcc-playtest-v02172");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.159"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.172"'));
check("ver.notice", !read("dm/assets/js/v2.js").includes("slight delay") && !read("map/ssdns-map.js").includes("slight delay"));

const join = read("assets/js/dm-join.js");
const app = read("assets/js/app.js");
const guard = read("assets/js/apply-guard.js");
const dmcc = read("dm/assets/js/dmcc.js");
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const host = read("map/ssdns-map-host.js");
const sheetHtml = read("index.html");
const dmHtml = read("dm/index.html");

check("sync.no500", !join.includes("setTimeout(publishSnapshot, 500)") && join.includes("setTimeout(publishSnapshot, 0)"));
check("sync.coalesce", join.includes("SSDNSGrab.coalesce") && join.includes("publishNow"));
check("sync.portraitOffWrite", join.includes("cachedPortrait") && !join.includes("await shrinkPortrait"));
check("sync.reloadPublishes", /function reloadFromPool[\s\S]{0,1600}publishGunCard\(/.test(app));
check("sync.equipPublishes", /function setEquipped[\s\S]{0,400}publishGunCard\(/.test(app));
check("sync.patchPublishes", /applyPatch: function[\s\S]{0,240}publishGunCard\(/.test(app));
check("sync.parallel", dmcc.includes("Promise.allSettled") && /async function pushCommand[\s\S]{0,900}allSettled/.test(dmcc));
check("sync.gunsEquipped", /function gunsSignature[\s\S]{0,500}g\.equipped === false \? 0 : 1/.test(guard));
check("sync.cardHp", v2.includes("function snapshotCardSig") && v2.includes("s.hpCurrent") && v2.includes("refreshOpenCard"));
check("sync.grabBeforeJoin", sheetHtml.indexOf("assets/js/grab.js") < sheetHtml.indexOf("assets/js/dm-join.js") && sheetHtml.indexOf("assets/js/grab.js") >= 0);
check("sync.grabBeforeV2", dmHtml.indexOf("assets/js/grab.js") < dmHtml.indexOf("assets/js/v2.js") && dmHtml.indexOf("assets/js/grab.js") >= 0);

check("ui.fight", v2.includes(">Rob/Disarm<") && v2.includes('data-grab="rob"') && v2.includes("function runGrabFromMap") && v2.includes("No automatic reputation tracking"));
check("ui.map", map.includes(">Rob/Disarm<") && map.includes('data-act="robBtn"') && map.includes("drawer:rob") && map.includes("No automatic reputation tracking"));
check("ui.host", host.includes('"drawer:disarm": "disarm"') && host.includes('"drawer:rob": "rob"') && host.includes("feetBetween:"));
check("ui.ops", join.includes('payload.op === "take"') && join.includes('payload.op === "receive"') && join.includes('case "take_gear"'));
check("ui.demo", dmcc.includes('payload.op === "take"') && dmcc.includes('payload.op === "receive"'));

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("assets/js/grab.js"), sandbox, { filename: "assets/js/grab.js" });
const Grab = sandbox.SSDNSGrab;

function seq(values) {
  let i = 0;
  return function () { return values[Math.min(i++, values.length - 1)]; };
}
const face = (n) => (n - 1) / 20;

const tie = Grab.contest({
  mode: "disarm",
  attackMod: 0,
  target: { mods: { STR: 0 } },
  feet: 5,
  rng: seq([face(12), face(12)])
});
check("contest.tie", tie.ok === false && tie.tie === true, JSON.stringify(tie));

const win = Grab.contest({
  mode: "disarm",
  actor: { skills: { Athletics: 5 } },
  target: { mods: { STR: 0 } },
  feet: 5,
  rng: seq([face(10), face(8)])
});
check("contest.win", win.ok === true && win.attack.skill === "Athletics" && win.attack.total === 15 && win.defense.total === 8 && win.defense.skill === "Athletics" && win.line.indexOf("Attack ") < 0, JSON.stringify(win));

const acro = Grab.contest({
  mode: "disarm",
  attackMod: 0,
  target: { mods: { STR: 1, DEX: 4 }, skills: { Acrobatics: 6 } },
  defenseSkill: "Acrobatics",
  feet: null,
  rng: seq([face(18), face(10)])
});
check("contest.acro", acro.ok === true && acro.defense.skill === "Acrobatics" && acro.defense.mod === 6);

const two = Grab.contest({
  mode: "disarm",
  actor: { skills: { Athletics: 2 } },
  weapon: { group: "rifle" },
  target: { mods: { STR: 0 } },
  feet: 5,
  rng: seq([face(18), face(4), face(16)])
});
check("contest.twoHand", two.defense.advantage === true && two.defense.kept === 16 && two.ok === true, JSON.stringify(two));

const far = Grab.contest({ mode: "disarm", feet: 10, rng: seq([face(20)]) });
check("contest.range", far.ok === false && far.outOfRange === true);

const unknown = Grab.contest({
  mode: "disarm",
  attackMod: 0,
  target: {},
  feet: null,
  rng: seq([face(11), face(10)])
});
check("contest.unknownRange", unknown.ok === true && unknown.defense.skill === "Athletics" && unknown.defense.mod === 0);

const downFar = Grab.contest({ mode: "disarm", downed: true, feet: 15 });
check("contest.downFar", downFar.ok === false && downFar.outOfRange === true);
const down = Grab.contest({ mode: "disarm", downed: true, feet: 5 });
check("contest.down", down.ok === true && down.downed === true && down.line.indexOf("Downed") >= 0);

const sneak = Grab.contest({
  mode: "rob-pocket",
  actor: { skills: { "Sleight of Hand": 5 } },
  target: {},
  feet: 5,
  rng: seq([face(10)])
});
check("contest.pocket", sneak.ok === true && sneak.attack.total === 15 && sneak.defense.passive === 15, JSON.stringify(sneak));
const sneakFail = Grab.contest({
  mode: "rob-es",
  actor: { mods: { DEX: 1 } },
  target: { mods: { WIS: 3 } },
  feet: 5,
  rng: seq([face(5)])
});
check("contest.pocketFail", sneakFail.ok === false && sneakFail.defense.passive === 13 && sneakFail.attack.total === 6);

const over = Grab.contest({ mode: "disarm", override: true, feet: 40 });
check("contest.override", over.ok === true && over.override === true);

const drop = Grab.plan({
  mode: "disarm",
  success: true,
  contestLine: "Attack 12+2 = 14 vs Athletics 9+1 = 10 — success",
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "b", kind: "player", name: "Bea" },
  weapon: { kind: "gun", index: 1, name: "Peacemaker" }
});
check("plan.disarm", drop.commands.length === 1 && drop.commands[0].payload.op === "equip" && drop.commands[0].payload.equipped === false && drop.commands[0].to === "b" && /drops, unequipped/.test(drop.chat));

const robbed = Grab.plan({
  mode: "rob",
  success: true,
  combat: true,
  slotFree: true,
  contestLine: "hit",
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "en", kind: "enemy", name: "Bandit" },
  weapon: { id: "atk1", kind: "attack", name: "Rifle", weaponId: "henrietta", group: "rifle" }
});
check("plan.robCombat", robbed.commands.length === 1 && robbed.commands[0].payload.op === "receive" && robbed.commands[0].payload.equipped === false && robbed.enemy.removeAttackId === "atk1" && /stowed/.test(robbed.chat) && /loadout stays locked/.test(robbed.chat));

const freeSlot = Grab.plan({
  mode: "rob",
  success: true,
  combat: false,
  slotFree: true,
  actor: { id: "a", kind: "enemy", name: "Wolf" },
  target: { id: "b", kind: "player", name: "Bea" },
  weapon: { kind: "melee", index: 0, name: "Knife", weaponId: "knife" }
});
check("plan.robEquip", freeSlot.commands.length === 1 && freeSlot.commands[0].payload.op === "take" && freeSlot.commands[0].payload.kind === "melee" && freeSlot.enemy.give && freeSlot.enemy.give.equipped === false && /Taken and stowed/.test(freeSlot.chat));
const worn = Grab.plan({
  mode: "rob",
  success: true,
  combat: false,
  slotFree: true,
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "b", kind: "player", name: "Bea" },
  weapon: { kind: "gun", index: 0, name: "Navy", weaponId: "navy" }
});
check("plan.worn", worn.commands[1].payload.op === "receive" && worn.commands[1].payload.equipped === true && /Taken and equipped/.test(worn.chat));

const full = Grab.plan({
  mode: "rob",
  success: true,
  combat: false,
  slotFree: false,
  actor: { id: "a", kind: "player", name: "Ada", calling: "lawman" },
  target: { id: "b", kind: "player", name: "Bea" },
  weapon: { kind: "gun", index: 0, name: "Navy", weaponId: "navy" }
});
check("plan.slotFull", full.commands[1].payload.equipped === false && /slot is full/.test(full.chat));

const gear = Grab.plan({
  mode: "rob",
  take: "gear",
  success: true,
  combat: true,
  actor: { id: "a", kind: "player", name: "Ada", calling: "gambler" },
  target: { id: "b", kind: "player", name: "Bea" },
  gearText: "• Wanted poster"
});
check("plan.gear", gear.commands[0].type === "take_gear" && gear.commands[1].type === "reward_item" && /DM approved/.test(gear.chat) && /bonus action/.test(gear.chat));
const gearOut = Grab.plan({
  mode: "rob",
  take: "gear",
  success: true,
  combat: false,
  actor: { id: "a", kind: "player", name: "Ada", calling: "gambler" },
  target: { id: "b", kind: "player", name: "Bea" },
  gearText: "• Wanted poster"
});
check("plan.gearOut", /no action/.test(gearOut.chat));

const es = Grab.plan({
  mode: "rob",
  take: "es",
  success: true,
  combat: true,
  es: 4,
  actor: { id: "a", kind: "player", name: "Ada", calling: "gambler-burglar" },
  target: { id: "b", kind: "player", name: "Bea" }
});
check("plan.es", es.commands[0].payload.delta === -4 && es.commands[1].payload.delta === 4 && /bonus action/.test(es.chat));

const miss = Grab.plan({
  mode: "disarm",
  success: false,
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "b", kind: "player", name: "Bea" },
  weapon: { name: "Peacemaker" }
});
check("plan.fail", miss.commands.length === 0 && /fails to disarm/.test(miss.chat));
const wrest = Grab.plan({
  mode: "rob",
  take: "weapon",
  success: true,
  combat: true,
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "b", kind: "player", name: "Bea" },
  weapon: { kind: "gun", index: 0, name: "Navy" }
});
check("plan.wrest", /replaces one attack/.test(wrest.chat));
const questBlock = Grab.plan({
  mode: "rob",
  take: "item",
  success: true,
  quest: true,
  itemUid: "it1",
  item: { uid: "it1", name: "Bounty Warrant", type: "quest" },
  actor: { id: "a", kind: "player", name: "Ada" },
  target: { id: "b", kind: "player", name: "Bea" }
});
check("plan.quest", questBlock.blocked === true && questBlock.commands.length === 0);

let calls = 0;
let release;
const gate = new Promise((resolve) => { release = resolve; });
const run = Grab.coalesce(function () {
  calls += 1;
  if (calls === 1) return gate;
  return Promise.resolve();
});
const first = run();
const second = run();
let secondValue = "pending";
second.then((value) => { secondValue = value; });
await Promise.resolve();
check("coalesce.queued", calls === 1 && secondValue === false);
release();
await first;
check("coalesce.rerun", calls === 2);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("sync + grab ok");

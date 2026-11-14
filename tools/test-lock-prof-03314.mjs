/**
 * Lock proficiency comes from level when the sheet has no prof field.
 * Thieves' tools means the item, not a mention in the notes.
 * Sheet 0.3.314 / DMCC 0.2.327.
 *   node tools/test-lock-prof-03314.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.314" && ver.dmcc === "0.2.327" && ver.sheetBuild === "sheet-playtest-v03314" && ver.dmccBuild === "dmcc-playtest-v02327");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.314") && !read("database.rules.json").includes("0.3.314"));

const sb = { console: console };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("assets/js/loot.js"), sb);
const L = sb.SSDNSLoot;
const tools = [{ catalogId: "thieves-tools-lock-picks", name: "Thieves' tools (lock picks)", count: 1 }];
function lock(dc) {
  return { lock: { dc: dc, unlocked: false, attempts: {}, forceAttempts: {}, allowRetries: false, forceDc: dc }, log: [] };
}

const level3 = { level: 3, abilities: { STR: 16, DEX: 16 }, skillProf: { Athletics: 1 } };
const forced = L.forceOpen(lock(16), level3, "ada", () => 0, { nat: 10 });
check("pb.level3", forced.total === 15 && forced.success === false && /\+2 Athletics/.test(forced.line) && forced.noise === true, forced.line);

const expert = { level: 3, abilities: { STR: 16 }, skillProf: { Athletics: 2 } };
const doubled = L.forceOpen(lock(15), expert, "ada", () => 0, { nat: 10 });
check("pb.expertise", doubled.total === 17 && /\+4 Athletics/.test(doubled.line), doubled.line);

const bareAth = { level: 3, abilities: { STR: 16 }, skillProf: { Athletics: 0 } };
const noAth = L.forceOpen(lock(15), bareAth, "ada", () => 0, { nat: 10 });
check("pb.notProficient", noAth.total === 13 && !/Athletics/.test(noAth.line), noAth.line);

const explicit = { level: 3, prof: 3, abilities: { STR: 16 }, skillProf: { Athletics: 1 } };
const kept = L.forceOpen(lock(15), explicit, "ada", () => 0, { nat: 10 });
check("pb.explicit", kept.total === 16 && /\+3 Athletics/.test(kept.line), kept.line);

const level5 = { level: 5, abilities: { STR: 10 }, skillProf: { Athletics: 1 } };
const mid = L.forceOpen(lock(15), level5, "ada", () => 0, { nat: 10 });
check("pb.level5", mid.total === 13 && /\+3 Athletics/.test(mid.line), mid.line);

[1, 4].forEach((lv) => {
  const row = L.forceOpen(lock(30), { level: lv, abilities: { STR: 10 }, skillProf: { Athletics: 1 } }, "ada", () => 0, { nat: 10 });
  check("pb.band." + lv, row.total === 12, row.line);
});
[17].forEach((lv) => {
  const row = L.forceOpen(lock(30), { level: lv, abilities: { STR: 10 }, skillProf: { Athletics: 1 } }, "ada", () => 0, { nat: 10 });
  check("pb.band." + lv, row.total === 16, row.line);
});

const picker = { level: 3, abilities: { DEX: 16 }, toolProficiencies: ["Thieves' tools"], items: tools };
const picked = L.pickLock(lock(16), picker, "ada", () => 0, { nat: 10 });
check("pick.proficient", picked.success === false && picked.total === 15 && /\+2 tools/.test(picked.line), picked.line);

const holder = { level: 3, abilities: { DEX: 16 }, items: tools };
const untrained = L.pickLock(lock(10), holder, "bev", () => 0, { nat: 8 });
check("pick.itemNoProf", untrained.success === true && untrained.total === 11 && !/tools/.test(untrained.line), untrained.line);

const expertTools = { level: 3, abilities: { DEX: 16 }, toolProf: { "Thieves' tools": 2 }, items: tools };
const toolExp = L.pickLock(lock(20), expertTools, "cy", () => 0, { nat: 10 });
check("pick.expertise", toolExp.total === 17 && /\+4 tools/.test(toolExp.line), toolExp.line);

const mentioned = {
  level: 3,
  abilities: { DEX: 16 },
  equipment: "A book that mentions thieves' tools.",
  features: "Quick Hands can use thieves' tools to open a lock.",
  proficienciesLanguages: "Weapons: simple weapons, thieves' tools",
  items: [{ name: "Trail rations", catalogId: "trail-rations", count: 1, description: "Not thieves' tools" }]
};
check("gate.text", L.hasThievesTools(mentioned) === false);
const refused = L.pickLock(lock(15), mentioned, "ada", () => 0, { nat: 20 });
check("gate.refused", refused.noTools === true && refused.success === false, refused.reason);
check("gate.stillProficient", L.thievesBonus(mentioned) === 2);

const emptyCount = { level: 3, items: [{ catalogId: "thieves-tools-lock-picks", name: "Thieves' tools", count: 0 }] };
check("gate.empty", L.hasThievesTools(emptyCount) === false);

const real = { level: 3, abilities: { DEX: 14 }, items: tools };
check("gate.item", L.hasThievesTools(real) === true);
const withKit = L.pickLock(lock(15), real, "ada", () => 0, { nat: 12 });
check("gate.rolls", withKit.noTools !== true && withKit.total === 14 && withKit.success === false, withKit.line);

const flagOnly = { level: 3, abilities: { DEX: 16 }, thievesTools: true, items: [] };
check("gate.flag", L.hasThievesTools(flagOnly) === false && L.thievesBonus(flagOnly) === 2);
const flagged = L.pickLock(lock(15), flagOnly, "ada", () => 0, { nat: 18 });
check("gate.flagBlocked", flagged.noTools === true);

let rolls = 0;
const improvised = L.pickLock(lock(15), { level: 8, abilities: { DEX: 16 }, skillProf: { Athletics: 1 } }, "ada", () => (rolls++ === 0 ? 0.99 : 0), { improvise: true });
check("improvise", improvised.noTools !== true && improvised.nat === 1 && improvised.total === 4 && /disadv/.test(improvised.line) && !/tools/.test(improvised.line), improvised.line);
const second = L.pickLock(lock(15), real, "ada", () => 0, { nat: 20 });
const again = L.pickLock(second.box || lock(15), real, "ada", () => 0, { nat: 20 });
const onceBox = lock(15);
L.pickLock(onceBox, real, "ada", () => 0, { nat: 10 });
const blocked = L.pickLock(onceBox, real, "ada", () => 0, { nat: 20 });
check("once", blocked.already === true && onceBox.lock.unlocked === false);

const loud = L.forceOpen(lock(25), level3, "ada", () => 0, { nat: 1 });
check("force.noise", loud.success === false && loud.noise === true && /holds/.test(loud.line) && loud.total === 6, loud.line);

vm.runInContext(read("map/ssdns-map-move.js") + "\n" + read("map/interact-timers.js"), sb);
const door = { x1: 6, y1: 5, x2: 7, y2: 5, door: true, open: false, locked: true, lockDc: 15 };
const beside = { pos: { x: 6, y: 6 }, size: 1 };
const grey = sb.SSDNSInteract.doorMenu(door, { token: beside, dm: false, who: "ada", sheet: mentioned });
const openPick = sb.SSDNSInteract.doorMenu(door, { token: beside, dm: false, who: "ada", sheet: real });
const pickGrey = grey.actions.find((a) => a.id === "lockpick");
const pickLive = openPick.actions.find((a) => a.id === "lockpick");
check("menu.grey", pickGrey && pickGrey.disabled === true && /Needs thieves' tools/.test(pickGrey.note || ""), JSON.stringify(grey.actions));
check("menu.item", pickLive && pickLive.disabled !== true && pickLive.label === "Pick lock", JSON.stringify(openPick.actions));
const impro = sb.SSDNSInteract.doorMenu(door, { token: beside, dm: false, who: "ada", sheet: mentioned, improvise: true });
check("menu.improvise", impro.actions.some((a) => a.id === "improvise") && !impro.actions.some((a) => a.id === "lockpick" && !a.disabled));

if (failures.length) {
  console.log("FAILED " + failures.length);
  failures.forEach((line) => console.log(" - " + line));
  process.exit(1);
}
console.log("lock prof 0.3.314 ok");
process.exit(0);

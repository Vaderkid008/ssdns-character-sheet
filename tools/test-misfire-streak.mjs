/**
 * Locked misfire streak ladder. Pure checks against assets/js/misfire.js.
 *   node tools/test-misfire-streak.mjs
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
const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/misfire.js"), "utf8"), vm.createContext(sandbox), { filename: "misfire.js" });
const M = sandbox.SSDNSMisfire;

function shot(gun, nat, extra) {
  return M.resolveShot(Object.assign({ capacity: 6 }, gun), Object.assign({ n1: nat, nat: nat, ceiling: 2 }, extra));
}

let s = shot({ misStreak: 2 }, 12, { ceiling: 4 });
check("reset", !s.misfire && s.reset && s.misStreak === 0, JSON.stringify(s.misStreak));

s = shot({ misStreak: 0 }, 1);
check("jam1", s.jammed && s.tier === "jam" && s.misStreak === 1 && !s.lock && !s.armD4);
s = shot({ misStreak: 1, jammed: true }, 1);
check("jam2", s.jammed && s.misStreak === 2 && !s.lock);

s = shot({ misStreak: 2 }, 1, { chamber: 0 });
check("lock3", s.lock && !s.jammed && s.misStreak === 3 && s.lockIndex === 1 && s.lockedChambers.join(",") === "1", JSON.stringify(s));

s = shot({ misStreak: 2, capacity: 1 }, 1, { capacity: 1 });
check("cap1", s.fouled && s.ruined && !s.lock && s.tier === "foul");

s = shot({ misStreak: 3, lockedChambers: [1] }, 1);
check("d4arm", s.armD4 && s.tier === "d4" && s.misStreak === 4 && !s.jammed && !s.lock);

s = shot({ misStreak: 0, lockedChambers: [2], capacity: 6 }, 1, { chamber: 0 });
check("lockedSupersedes", s.lock && s.misStreak === 1 && s.lockedChambers.join(",") === "2,1");

s = M.resolveShot({ misStreak: 0, capacity: 2, lockedChambers: [0, 1] }, { n1: 1, nat: 1, ceiling: 2, capacity: 2 });
check("allLocked", s.fouled && s.ruined);

const rugged = { weapon: "lancaster-heavy-saddle-carbine", capacity: 6 };
s = shot(Object.assign({ misStreak: 2 }, rugged), 1);
check("rugged3", s.jammed && s.misStreak === 3 && !s.lock);
s = shot(Object.assign({ misStreak: 3 }, rugged), 1, { chamber: 0 });
check("rugged4", s.lock && s.misStreak === 4 && !s.fouled);
s = shot(Object.assign({ misStreak: 4, lockedChambers: [1] }, rugged), 1);
check("rugged5", s.armD4 && s.misStreak === 5 && !s.fouled);

s = M.resolveShot({ dirty: true, misStreak: 1, capacity: 6 }, { n1: 1, n2: 2, nat: 1, ceiling: 4 });
check("dirtyBoth", s.both && s.armD4 && !s.fouled && s.misStreak === 2);
s = M.resolveShot({ dirty: false, misStreak: 0, capacity: 6 }, { n1: 1, n2: 2, nat: 1, ceiling: 4 });
check("cleanBoth", s.both && s.jammed && !s.armD4 && s.misStreak === 1);

s = M.resolveShot({ misStreak: 4 }, { spark: true, n1: 1, nat: 1, ceiling: 20 });
check("spark", s.spark && !s.misfire && s.misStreak === 4);
s = M.resolveShot({ misStreak: 4, jammed: true }, { melee: true, n1: 1, nat: 1, ceiling: 20 });
check("melee", s.tier === "melee" && s.misStreak === 4 && s.jammed);
s = M.resolveShot({ misStreak: 4, jammed: false }, { wildAttack: true, n1: 1, nat: 1, ceiling: 20 });
check("wildAttack", s.streakIgnored && s.misStreak === 4 && !s.armD4 && !s.jammed);

const marked = { dirty: false, misStreak: 0 };
M.markDirty(marked);
check("dirtyStart", marked.dirty && marked.misStreak === 1);

function face(n, ruggedOn) { return M.d4Result(n, ruggedOn); }
check("d4-1", face(1, false).explode && face(1, false).fire === "1d4" && face(1, false).fouled && !face(1, false).lock);
check("d4-1-rugged", face(1, true).explode && face(1, true).lock && !face(1, true).fouled);
check("d4-2", face(2, false).fouled && !face(2, false).lock);
check("d4-2-rugged", face(2, true).lock && !face(2, true).fouled);
check("d4-3", face(3, false).lock && face(3, false).keepStreak && !face(3, false).fouled);
check("d4-4", face(4, false).wild && face(4, false).keepStreak && !face(4, false).fouled);

const applied = M.applyD4({ misStreak: 4, capacity: 6, lockedChambers: [1] }, 3, { capacity: 6, chamber: 0 });
check("applyLockKeeps", applied.gun.misStreak === 4 && applied.gun.lock && applied.gun.lockedChambers.indexOf(2) >= 0 && !applied.gun.fouled);
const wild = M.applyD4({ misStreak: 4, capacity: 6 }, 4, { capacity: 6 });
check("applyWild", wild.gun.misStreak === 4 && wild.face.wild && !wild.gun.fouled && !wild.gun.jammed);
const boom = M.applyD4({ misStreak: 4, capacity: 6 }, 1, { capacity: 6 });
check("applyBoom", boom.gun.fouled && boom.gun.ruined && boom.face.explode);

const jammedOnly = M.cleanOptions({ jammed: true, dirty: true }).map((o) => o.id);
check("cleanJam", jammedOnly.length === 1 && jammedOnly[0] === "unjam");
const dirtyOnly = M.cleanOptions({ dirty: true, jammed: false });
check("cleanDirty", dirtyOnly.length === 1 && dirtyOnly[0].label.indexOf("removes Dirty") >= 0 && dirtyOnly[0].resetStreak);
check("cleanFouled", M.cleanOptions({ fouled: true, dirty: true }).length === 0);
check("cleanRuined", M.cleanOptions({ ruined: true }).length === 0);
const cleared = M.applyClean({ jammed: true, dirty: true, misStreak: 2 }, "unjam");
check("unjamKeeps", cleared.ok && cleared.gun.jammed === false && cleared.gun.dirty === true && cleared.gun.misStreak === 2);
const washed = M.applyClean({ dirty: true, misStreak: 3, pendingD4: true }, "dirty-kit");
check("wash", washed.ok && washed.gun.dirty === false && washed.gun.misStreak === 0 && washed.gun.pendingD4 === false);

check("freeRugged", M.unjamIsFree({ weapon: "lancaster-heavy-saddle-carbine" }));
check("freeSmooth", M.unjamIsFree({ mod: "Smoothed action" }));
check("freeLoader", M.unjamIsFree({ feats: ["muzzleloader"] }));
check("bigFifty", !M.unjamIsFree({ id: "bison-big-fifty-buffalo-rifle", mod: "Smoothed action" }));

const rested = M.shortRest([{ misStreak: 3, lockedChambers: [0, 2] }, { misStreak: 1 }], true);
check("restTools", rested[0].misStreak === 0 && rested[0].lockedChambers.length === 0 && rested[1].misStreak === 0);
const kept = M.shortRest([{ misStreak: 3, lockedChambers: [0, 2] }], false);
check("restNoTools", kept[0].misStreak === 0 && kept[0].lockedChambers.join(",") === "0,2");
check("reopen", M.reopenIndex({ capacity: 6, lockedChambers: [4, 1] }) === 4);

const grown = M.activeLocks({ lockedChambers: [1, 8] }, 9);
check("locksPersist", grown.join(",") === "1,8");

const beforeFace = M.gunFace({ misStreak: 2, jammed: true, capacity: 6, lockedChambers: [] });
const locked = shot({ misStreak: 2, jammed: true, capacity: 6 }, 1, { chamber: 0 });
const afterFace = M.gunFace(locked);
check("lockup0", beforeFace.lockup === 0 && !beforeFace.lockupChecked && beforeFace.lockupLabel === "LOCKED UP ×0" && beforeFace.chamberMarks.indexOf("X") < 0);
check("lockupCount", afterFace.lockup === 1 && afterFace.lockupLabel === "LOCKED UP ×1" && afterFace.lockedChambers.join(",") === "1");
check("rerender", afterFace.lockupChecked && !afterFace.jammed && afterFace.chamberMarks[1] === "X" && beforeFace.chamberMarks[1] === "" && afterFace.misStreak === 3, JSON.stringify(afterFace));

const fouledFace = M.gunFace(shot({ misStreak: 2, capacity: 1 }, 1, { capacity: 1 }));
check("rerenderFoul", fouledFace.fouled && fouledFace.lockup === 0 && !fouledFace.lockupChecked && fouledFace.lockupLabel === "LOCKED UP ×0");

const d4Face = M.gunFace(M.applyD4({ misStreak: 4, capacity: 6, lockedChambers: [1], pendingD4: true }, 3, { capacity: 6, chamber: 0 }).gun);
check("rerenderD4", d4Face.lockup === 2 && d4Face.chamberMarks[1] === "X" && d4Face.chamberMarks[2] === "X" && !d4Face.pendingD4 && !d4Face.fouled);

const held = { misStreak: 3, jammed: false, fouled: false, dirty: true, capacity: 6, lockedChambers: [1, 4] };
const once = M.clearLocks(held, "one");
check("clearOne", once.lockedChambers.join(",") === "4" && once.cleared.join(",") === "1" && once.misStreak === 3 && once.dirty && !once.fouled && M.gunFace(once).lockup === 1 && M.gunFace(once).chamberMarks[1] === "");
const gone = M.clearLocks(held, "all");
check("clearAll", gone.lockedChambers.length === 0 && gone.misStreak === 3 && gone.dirty && M.gunFace(gone).lockup === 0 && !M.gunFace(gone).lockupChecked);
const picked = M.clearLocks(held, "one", 4);
check("clearPicked", picked.lockedChambers.join(",") === "1" && picked.cleared.join(",") === "4" && picked.misStreak === 3);

const appSrc = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const extraSrc = fs.readFileSync(path.join(root, "assets/js/sheet-extras.js"), "utf8");
const sfxSrc = fs.readFileSync(path.join(root, "assets/js/sfx.js"), "utf8");
const joinSrc = fs.readFileSync(path.join(root, "assets/js/dm-join.js"), "utf8");
const dmccSrc = fs.readFileSync(path.join(root, "dm/assets/js/dmcc.js"), "utf8");
const mapSrc = fs.readFileSync(path.join(root, "map/ssdns-map.js"), "utf8");
check("wire.refresh", appSrc.includes("function refreshGunFace") && appSrc.includes("publishGunCard()") && extraSrc.includes("root.SSDNSApp.refreshGunFace()"));
check("wire.d4", sfxSrc.includes("app.refreshGunFace"));
check("wire.mark", appSrc.includes("LOCKED UP ×") && appSrc.includes("data-lockup-n") && mapSrc.includes("LOCKED UP ×") && mapSrc.includes("function lockupMark"));
check("wire.clear", joinSrc.includes('payload.op === "clear-locks"') && dmccSrc.includes('data-gun-op="clear-locks"') && dmccSrc.includes("Clear locked chambers") && dmccSrc.includes("postDmAction"));
check("rules.untouched", !fs.readFileSync(path.join(root, "assets/data/rules.js"), "utf8").includes("LOCKED UP") && !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("clear-locks"));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("misfire streak ok");

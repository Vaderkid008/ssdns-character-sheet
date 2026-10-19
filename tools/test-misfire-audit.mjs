/**
 * Misfire audit (2026-10-19). Part A: the state machine in assets/js/misfire.js (must pass today).
 * Part B: DM/player button wiring bugs found in the audit, fixed in 0.3.65. Strict by default
 * (pass --report to only list them).
 *   node tools/test-misfire-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const strict = !process.argv.includes("--report");
const failures = [], known = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok   " : "FAIL ") + id + (detail && !cond ? " — " + detail : "")); }
function bug(id, fixed, what) { if (!fixed) known.push(id); console.log((fixed ? "ok   " : "KNOWN") + " " + id + " — " + what); }
const box = { console, Math, Number, String, Object, Array, JSON, isFinite }; box.window = box; box.globalThis = box;
vm.runInContext(read("assets/js/misfire.js"), vm.createContext(box));
const M = box.SSDNSMisfire;
const shot = (g, nat, x) => M.resolveShot(Object.assign({ capacity: 6 }, g), Object.assign({ n1: nat, nat: nat, ceiling: 2 }, x));

/* ---- A. state matrix ---- */
let s = shot({}, 1);                                   check("A1.jam1", s.tier === "jam" && s.jammed && s.misStreak === 1);
s = shot({ misStreak: 1, jammed: true }, 2);           check("A2.jam2", s.tier === "jam" && s.misStreak === 2);
s = shot({ misStreak: 2 }, 1, { chamber: 2 });         check("A3.lock3", s.tier === "lock" && s.lockedChambers.join() === "3" && !s.jammed);
s = shot({ misStreak: 3 }, 1);                         check("A4.d4", s.tier === "d4" && s.armD4);
s = shot({ misStreak: 1, lockedChambers: [0] }, 1);    check("A5.lockedSupersedes", s.tier === "lock" && s.lockedChambers.length === 2);
s = shot({ misStreak: 2, capacity: 1 }, 1, { capacity: 1 }); check("A6.cap1Fouls", s.tier === "foul" && s.fouled && s.ruined);
s = shot({ misStreak: 3, rugged: true }, 1);           check("A7.ruggedLater", s.tier === "lock");
s = shot({ misStreak: 3 }, 15);                        check("A8.fireResets", s.tier === "reset" && s.misStreak === 0);
s = shot({ dirty: true, misStreak: 1 }, 1, { n2: 2 }); check("A9.dirtyBothD4", s.tier === "d4" && s.armD4);
s = shot({ misStreak: 0 }, 1, { n2: 2 });              check("A10.cleanBothOne", s.misStreak === 1 && s.tier === "jam");
let d = M.applyD4({ misStreak: 4, capacity: 6 }, 1);   check("A11.d4explode", d.gun.exploded && d.gun.fouled && d.face.fire === "1d4");
d = M.applyD4({ misStreak: 4, capacity: 6 }, 2);       check("A12.d4foul", d.gun.fouled && !d.gun.exploded);
d = M.applyD4({ misStreak: 4, capacity: 6 }, 3);       check("A13.d4lock", d.gun.lockedChambers.length === 1 && d.gun.misStreak === 4);
d = M.applyD4({ misStreak: 4, capacity: 6 }, 4);       check("A14.d4wild", d.gun.wild);
check("A15.cleanJam", M.cleanOptions({ jammed: true }).map((o) => o.id).join() === "unjam");
check("A16.cleanDirty", M.cleanOptions({ dirty: true }).map((o) => o.id).join() === "dirty-kit");
check("A17.cleanFouledNone", M.cleanOptions({ fouled: true }).length === 0);
let c = M.applyClean({ jammed: true, misStreak: 2 }, "unjam"); check("A18.unjamKeepsStreak", c.ok && !c.gun.jammed && c.gun.misStreak === 2);
c = M.applyClean({ dirty: true, jammed: true, misStreak: 3 }, "dirty-kit"); check("A19.dirtyKitResets", c.ok && !c.gun.dirty && !c.gun.jammed && c.gun.misStreak === 0);
let k = M.clearLocks({ capacity: 6, lockedChambers: [1, 4] }, "one"); check("A20.clearOne", k.lockedChambers.join() === "4" && k.cleared.join() === "1");
k = M.clearLocks({ capacity: 6, lockedChambers: [1, 4], misStreak: 3, jammed: true }, "all"); check("A21.clearAllLocksOnly", k.lockedChambers.length === 0 && k.misStreak === 3 && k.jammed);
k = M.clearLocks({ capacity: 6, lockedChambers: [], jammed: true, dirty: true }, "all"); check("A22.clearAllNothing", k.cleared.length === 0, "Clear all on a jammed/dirty gun with no locks changes nothing");
let r = M.repair({ fouled: true, ruined: true, jammed: true, dirty: true, misStreak: 5, lockedChambers: [0, 1], pendingD4: true, exploded: true });
check("A23.repairAll", !r.fouled && !r.ruined && !r.jammed && !r.dirty && r.misStreak === 0 && !r.lockedChambers.length && !r.pendingD4 && !r.exploded);
let o = M.applyOverride({ misStreak: 1 }, { dirty: true });      check("A24.setDirtyStreak", o.gun.dirty && o.gun.misStreak === 2);
o = M.applyOverride({ fouled: true, ruined: true }, { fouled: false }); check("A25.clearFouled", !o.gun.fouled && !o.gun.ruined);
o = M.applyOverride({ pendingD4: true, misStreak: 4 }, { cancelD4: true }); check("A26.cancelD4", !o.gun.pendingD4 && o.gun.misStreak === 0);
const sr = M.shortRest([{ misStreak: 2, lockedChambers: [1] }], true); check("A27.shortRestTools", sr[0].misStreak === 0 && !sr[0].lockedChambers.length);
check("A28.unjamFree", M.unjamIsFree({ properties: "Rugged" }) && M.unjamIsFree({ mod: "smoothed" }) && !M.unjamIsFree({ weapon: "bison-big-fifty-buffalo-rifle", mod: "smoothed" }));

/* ---- B. wiring (known bugs) ---- */
const host = read("map/ssdns-map-host.js"), v2 = read("dm/assets/js/v2.js"), dmcc = read("dm/assets/js/dmcc.js"), join = read("assets/js/dm-join.js");
const fightApi = v2.slice(v2.lastIndexOf("SSDNSMapFight"));
bug("B12.reopenOp", /payload\.op === "reopen" && app\.reopenChamber/.test(join), "sheet handles the DM reopen command");
bug("B1.hostRoutesUnjam", /"drawer:unjam"\s*:/.test(host), "map drawer Unjam (DM acting for player) is emitted but never routed by ssdns-map-host");
bug("B2.hostRoutesReopen", /"drawer:reopen"\s*:/.test(host), "map drawer Reopen chamber: same, never routed");
bug("B3.fightUnjam", /\n\s*(async )?unjam\(detail/.test(v2), "SSDNSMapFight has no unjam handler");
bug("B4.fightReopen", /\n\s*(async )?reopen\(detail/.test(v2), "SSDNSMapFight has no reopen handler");
const clean = v2.slice(v2.indexOf("async function mapGunClean"), v2.indexOf("function mapSpellIndex"));
bug("B5.cleanSheetIndex", /index: sheetSlot\(atk, n\)/.test(clean), "mapGunClean sends gunIndex (position among named guns) instead of the sheet slot");
const load = v2.slice(v2.indexOf("async function mapGunLoad"), v2.indexOf("async function mapGunChoice"));
bug("B6.loadSheetIndex", load.length > 0 && /op: unload \? "unload" : "reload", index: sheetSlot\(atk, n\)/.test(load), "map Reload/Unload send gunIndex instead of the sheet slot");
const detail = dmcc.slice(dmcc.indexOf('<div class="detail-section"><h3>HP and guns</h3>'), dmcc.indexOf('<div class="detail-section"><h3>Equipment</h3>'));
bug("B7.detailIndex", !/data-gun-op="[^"]+"[^>]*data-gun-i="\$\{i\}"/.test(detail), "DMCC player detail: Reload/Unload/Dirty d4/Set loaded/streak/Dirty/Fouled/Ruined/Cancel d4 use the list position ${i}; Clear/Repair use the sheet slot");
const click = dmcc.slice(dmcc.indexOf('querySelectorAll("[data-gun-op]")'), dmcc.indexOf('const badgeSel'));
bug("B8.clearNoSilent", !/if \(op === "clear-locks" && !lockN\) return;/.test(click), "Clear one / Clear all silently do nothing when no chamber is locked (no toast, even if the gun is jammed/dirty/fouled)");
bug("B9.pcOverridePushes", /row\.kind === "player"[\s\S]{0,400}op: "misfire"[\s\S]{0,200}pushCommand[\s\S]*optionId: "unjam"[\s\S]{0,120}pushCommand/.test(v2.slice(v2.indexOf('if (t.hasAttribute("data-mf-op"))'), v2.indexOf('if (t.hasAttribute("data-apply-rider"))'))), "Fight card misfire overrides and Clear jam only change the DM's copy; on a PC row they never reach the sheet");
bug("B10.fouledCleanMsg", !/This gun isn't jammed, dirty, fouled, or ruined\./.test(clean), "map Clean on a Fouled/Ruined gun says it isn't fouled or ruined");
const fire = join.slice(join.indexOf('payload.op === "fire"'), join.indexOf('payload.op === "dirty-d4"'));
bug("B11.dmFireNoPrompt", /payload\.dm\b/.test(fire) && /dmNow[\s\S]{0,200}_dmShot/.test(read("assets/js/sheet-extras.js")) && /async function dmFireMode/.test(v2) && /const picked = await dmFireMode\(pid, atk\)[\s\S]{0,200}dm: true/.test(v2), "DM-acting fire runs the player's own confirm (Disadvantage? / Pick a target) on the player's sheet");
console.log("\nA: " + (failures.length ? failures.length + " FAILED: " + failures.join(", ") : "state matrix ok") + " · B: " + known.length + " known bug(s)" + (known.length ? ": " + known.join(", ") : ""));
process.exit(failures.length || (strict && known.length) ? 1 : 0);

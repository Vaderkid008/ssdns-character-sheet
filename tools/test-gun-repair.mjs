/**
 * DM repair, explosion fire, and the ruined-gun X.
 *   node tools/test-gun-repair.mjs
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

const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInContext(read("assets/js/misfire.js"), vm.createContext(sandbox), { filename: "misfire.js" });
vm.runInContext(read("assets/js/test-jammer.js"), vm.createContext(sandbox), { filename: "test-jammer.js" });
const M = sandbox.SSDNSMisfire;

const wrecked = {
  fouled: true,
  ruined: true,
  broken: true,
  jammed: true,
  dirty: true,
  misStreak: 4,
  lockedChambers: [0, 2],
  pendingD4: true,
  pendingD4Rolls: [1],
  pendingD4Step: 1,
  exploded: true,
  capacity: 6,
  loaded: 4
};
const fixed = M.repair(wrecked);
check("repair.flags", !fixed.fouled && !fixed.ruined && !fixed.broken && !fixed.jammed && !fixed.dirty);
check("repair.streak", fixed.misStreak === 0 && fixed.lockedChambers.length === 0 && !fixed.pendingD4 && fixed.pendingD4Rolls == null);
check("repair.boom", !fixed.exploded && M.gunFace(fixed).showX === false);
check("repair.cost", fixed.cost === 0);
check("repair.keeps", wrecked.loaded === 4 && wrecked.lockedChambers.join(",") === "0,2", "source gun stays put");

check("x.ruined", M.gunFace({ ruined: true, capacity: 6 }).showX === true && M.gunFace({ fouled: true, ruined: true, capacity: 6 }).showX === true);
check("x.exploded", M.gunFace({ exploded: true, ruined: false, capacity: 6 }).showX === true);
check("x.clean", M.gunFace({ capacity: 6, misStreak: 2, jammed: true }).showX === false);

const boom = M.applyD4({ misStreak: 4, capacity: 6 }, 1, { capacity: 6 });
check("boom.mark", boom.face.explode && boom.face.fire === "1d4" && boom.gun.exploded && boom.gun.ruined && M.gunFace(boom.gun).showX);
const ruggedBoom = M.applyD4({ weapon: "lancaster-heavy-saddle-carbine", misStreak: 5, capacity: 6 }, 1, { capacity: 6, chamber: 0 });
check("boom.rugged", ruggedBoom.face.explode && ruggedBoom.gun.exploded && !ruggedBoom.gun.ruined && !ruggedBoom.gun.fouled && M.gunFace(ruggedBoom.gun).showX);
const jammer = M.applyD4({ weapon: "test-jammer", misStreak: 4, capacity: 6 }, 1, { capacity: 6 });
check("boom.jammer", jammer.face.explode && jammer.gun.exploded && jammer.gun.ruined && jammer.face.fire === "1d4");
const foulOnly = M.applyD4({ misStreak: 4, capacity: 6 }, 2, { capacity: 6 });
check("foul.x", foulOnly.gun.ruined && !foulOnly.face.explode && M.gunFace(foulOnly.gun).showX);
check("fire.roll", M.fireRoll(function () { return 3; }) === 3 && M.fireRoll(function () { return 9; }) === 4 && M.fireRoll(function () { return 0; }) === 1);
check("fire.line", M.explosionLine("Ada", "TEST Jammer", 3) === "Ada · TEST Jammer · 3 fire");
check("fire.line.blank", M.explosionLine("", "", "nope") === "You · Gun · 0 fire");
const repairedBoom = M.repair(boom.gun);
check("repair.after", !repairedBoom.exploded && !repairedBoom.ruined && !repairedBoom.fouled && repairedBoom.cost === 0 && !M.gunFace(repairedBoom).showX);

const appSrc = read("assets/js/app.js");
const sfxSrc = read("assets/js/sfx.js");
const joinSrc = read("assets/js/dm-join.js");
const dmccSrc = read("dm/assets/js/dmcc.js");
const mapSrc = read("map/ssdns-map.js");
const hostSrc = read("map/ssdns-map-host.js");
const sheetCss = read("assets/css/sheet.css");
const mapCss = read("map/ssdns-map.css");
const repairBody = appSrc.slice(appSrc.indexOf("function repairGun"), appSrc.indexOf("function promptShortRestTools"));
check("wire.repair", repairBody.includes("M.repair") && repairBody.includes('addLog') && repairBody.includes("DM repaired "));
check("wire.free", !repairBody.includes("chargeEs") && !repairBody.includes("applyDelta") && !repairBody.includes("500"));
check("wire.dm", dmccSrc.includes(">Repair gun (clear everything)</button>") && dmccSrc.includes('data-gun-op="repair"') && dmccSrc.includes('postDmAction("DM repaired "') && dmccSrc.includes('payload.op === "repair"'));
check("wire.player", joinSrc.includes('payload.op === "repair"') && joinSrc.includes("repairGun") && appSrc.includes("repairGun: function"));
check("wire.sync", joinSrc.includes("exploded: !!g.exploded") && hostSrc.includes("exploded: !!g.exploded"));
check("wire.fire", sfxSrc.includes("d4-fire") && sfxSrc.includes("broadcastFire") && sfxSrc.includes("explosionText") && sfxSrc.includes("applyDelta(-fire") && sfxSrc.includes("catalogGunName") && sfxSrc.includes("SSDNSTestJammer"));
check("wire.x", appSrc.includes('photo.classList.toggle("gun-x"') && sheetCss.includes(".g-photo.gun-x::after") && mapSrc.includes("function crossClass") && mapSrc.includes("gun-x") && mapCss.includes(".cylinder-row.gun-x"));
check("wire.version", read("version.json").includes('"sheet": "0.3.130"') && read("version.json").includes('"dmcc": "0.2.143"') && appSrc.includes('APP_VERSION = "0.3.130"') && dmccSrc.includes('VERSION = "0.2.143"'));
check("repair.live", dmccSrc.includes('if (state.demo || op === "repair") applyDemoGun'));
check("repair.hint", joinSrc.includes("repairGun(payload.index, payload)") && appSrc.includes("function repairGun(i, hint)"));
check("repair.row", appSrc.includes("if (!row) return;"));
check("repair.body", repairBody.includes("g.exploded = false") && repairBody.includes("g.lockedChambers") && repairBody.includes("g.fouled = false") && repairBody.includes("g.cracked = false"));
const slot0 = { weapon: "", fouled: false, ruined: false, exploded: false, lockedChambers: [] };
const slot2 = { weapon: "repeater", fouled: true, ruined: true, broken: true, exploded: true, dirty: true, jammed: true, misStreak: 3, lockedChambers: [1], pendingD4: true };
const guns = [slot0, { weapon: "" }, slot2];
const hinted = guns.filter((g) => g && g.weapon === "repeater")[0];
const fixedSlot = M.repair(hinted);
check("repair.slot", hinted.weapon === "repeater" && !fixedSlot.fouled && !fixedSlot.ruined && !fixedSlot.exploded && !fixedSlot.broken && fixedSlot.lockedChambers.length === 0 && !fixedSlot.pendingD4 && fixedSlot.misStreak === 0 && M.gunFace(fixedSlot).showX === false);
check("repair.source", slot2.fouled && slot2.exploded && slot2.lockedChambers.join(",") === "1");
check("rules.untouched", !read("assets/data/rules.js").includes("Repair gun") && !read("assets/data/rules.js").includes("explosionLine") && !read("database.rules.json").includes("repair") && !read("database.rules.json").includes("exploded"));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("gun repair ok");

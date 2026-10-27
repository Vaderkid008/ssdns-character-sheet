/**
 * N56 (sheet 0.3.161 / DMCC 0.2.174): player-visible fight state was never written.
 * Dropping an enemy to 0 HP marked the DM row Down and skipped the public token,
 * so player maps never drew the X. A hidden-AC gun or spell returned before the
 * Action / spell pip, so turnMarkers stayed unspent.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const version = JSON.parse(read("version.json"));
check(version.sheet === "0.3.161" && version.sheetBuild === "sheet-playtest-v03161", "sheet bumped");
check(version.dmcc === "0.2.174" && version.dmccBuild === "dmcc-playtest-v02174", "dmcc bumped");
check(read("assets/js/app.js").includes('APP_VERSION = "0.3.161"'), "sheet banner");
check(read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.174"'), "dmcc banner");
check(!read("assets/data/rules.js").includes("0.3.161") && !read("database.rules.json").includes("0.2.174"), "rules were not regenerated");

const ex = read("assets/js/sheet-extras.js");
const gunPend = ex.split("Hidden AC returns before the resolved attack")[1].split("consumeRollMode()")[0];
check(gunPend.includes("SSDNSActionPips.attack"), "hidden-AC gun spends the Action before it returns");
check(gunPend.indexOf("OH.spendPip") < gunPend.indexOf("SSDNSActionPips.attack"), "off-hand still spends the bonus, not the Action");
check(gunPend.indexOf("FAN.spend") < gunPend.indexOf("SSDNSActionPips.attack"), "Fan still spends the bonus, not the Action");
const spellPend = ex.split("Hidden AC returns before the resolved cast")[1].split("return;")[0];
check(spellPend.includes("SSDNSActionPips.spell"), "hidden-AC spell spends before it returns");
const resolvedGun = ex.split("var miss = nat === 1")[1].split("consumeRollMode()")[0];
check(resolvedGun.includes("SSDNSActionPips.attack"), "a resolved gun attack still spends");

const v2src = read("dm/assets/js/v2.js");
const attackFn = v2src.split("async function attackRow")[1].split("function rollAllEnemies")[0];
check(attackFn.includes("noteUnconscious(row)"), "a DM attack that drops HP to 0 publishes Down");
const noteFn = v2src.split("function noteUnconscious")[1].split("async function markDown")[0];
check(noteFn.indexOf('mirrorMapStatus(row, "down")') < noteFn.indexOf("fight.condMap[idEarly]"), "the public X is written before the already-down return");
check(v2src.includes("function liveMapTokenId"), "a stale mapTokenId can be retargeted");
check(read("map/ssdns-map.js").includes("status: t.status || ''"), "players still receive token status on the public token");
check(!read("map/ssdns-map.js").split("function publicToken")[1].split("function saveToken")[0].includes("combatantId"), "combatantId stays off the public token");

const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, Set,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, setAttribute() {} };
  },
  body: { appendChild() {} }
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], demo: true, roomCode: "N56", uid: "dm", db: null },
  toast() {},
  renderPlayers() {},
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); },
  pushLedger() {},
  pushCommand() {},
  pushRoll() {},
  roomRef(p) { return p; }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
const v2 = v2src.replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__n56 = { applyEnemyHp, noteUnconscious, clearDown, syncMapTokens, fight };\n");
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const N = sandbox.__n56;
const patches = [];
const live = {};
const byCid = {};
sandbox.SSDNSMapHost = {
  tokensLoaded() { return true; },
  hasToken(id) { return !!live[id]; },
  tokenForCombatant(cid) { return byCid[cid] || ""; },
  tokenForPlayer() { return ""; },
  patchToken(id, fields) { patches.push({ id: id, status: fields && fields.status }); return { id: id }; },
  syncInitiative() {}
};

function resetHost() {
  patches.length = 0;
  Object.keys(live).forEach((k) => delete live[k]);
  Object.keys(byCid).forEach((k) => delete byCid[k]);
  N.fight.order = [];
  N.fight.condMap = {};
}
function enemy(extra) {
  return Object.assign({ id: "en1", name: "Outlaw", kind: "enemy", hp: 12, maxHp: 12, mapTokenId: "tok-live", status: "" }, extra || {});
}

resetHost();
live["tok-live"] = true;
const dropped = enemy();
const before = N.applyEnemyHp(dropped, -12);
check(before === 12 && dropped.hp === 0 && dropped.status === "Down", "damage to 0 marks the fight row Down");
check(patches.length === 0, "applyEnemyHp alone does not publish the token");
N.noteUnconscious(dropped);
check(patches.length === 1 && patches[0].id === "tok-live" && patches[0].status === "down", "first drop writes status down on the public token " + JSON.stringify(patches));

N.noteUnconscious(dropped);
check(patches.length === 2 && patches[1].status === "down", "a second call still publishes after Unconscious is already on the row " + JSON.stringify(patches));

resetHost();
live["tok-live"] = true;
byCid.en1 = "tok-live";
const stale = enemy({ hp: 0, status: "Down", mapTokenId: "tok-gone" });
N.noteUnconscious(stale);
check(stale.mapTokenId === "tok-live", "a stale mapTokenId is retargeted to the live token");
check(patches.length === 1 && patches[0].id === "tok-live" && patches[0].status === "down", "the X lands on the live token, not the stale id " + JSON.stringify(patches));

resetHost();
live["tok-live"] = true;
const healed = enemy({ hp: 0, status: "Down" });
N.noteUnconscious(healed);
N.applyEnemyHp(healed, 6);
check(healed.hp === 6 && healed.status !== "Down", "healing above 0 clears the row status");
await N.clearDown(healed);
check(patches.some((p) => p.id === "tok-live" && p.status === ""), "healing clears the public X " + JSON.stringify(patches));

resetHost();
live["tok-live"] = true;
const late = enemy({ hp: 0, status: "Down" });
const fled = enemy({ id: "en2", name: "Runner", hp: 0, status: "Fled", fled: true, mapTokenId: "tok-fled" });
live["tok-fled"] = true;
const horse = enemy({ id: "en3", name: "Spectral Horse", hp: 0, maxHp: 0, noHpPool: true, mapTokenId: "tok-horse" });
live["tok-horse"] = true;
N.fight.order = [late, fled, horse];
N.syncMapTokens();
const ids = patches.map((p) => p.id + ":" + p.status);
check(ids.indexOf("tok-live:down") >= 0, "a map that mounts after the drop still publishes the X " + ids.join(","));
check(ids.indexOf("tok-fled:down") < 0, "a fled token is not marked down");
check(ids.indexOf("tok-horse:down") < 0, "a no-HP-pool creature is not marked down");

resetHost();
const quiet = enemy({ hp: 0, mapTokenId: "" });
N.noteUnconscious(quiet);
check(patches.length === 0 && quiet.status === "Down", "no linked token does not throw, and the row is still Down");

console.log(failures.length ? failures.length + " FAILED:\n" + failures.join("\n") : "All N56 sync checks passed.");
if (failures.length) process.exitCode = 1;

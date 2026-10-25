/**
 * Dirty-gun tracker (sheet 0.3.131 / DMCC 0.2.144).
 * Campaign day is DM-advanced. Two campaign days since the last clean lists the gun for the DM only.
 * Advancing the day does not set Dirty. Set Dirty does not write the ledger.
 *   node tools/test-gun-clock.mjs
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const v2 = read("dm/assets/js/v2.js");
const join = read("assets/js/dm-join.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");
const html = read("dm/index.html");

check("src.clock", html.includes('id="gunClock"') && html.includes("Gun care") && html.includes('id="btnCampaignDay"') && v2.includes("function advanceCampaignDay"));
check("src.labels", html.includes("quicksand") && html.includes("does not set Dirty") && html.includes("Fouled is separate") && v2.includes("days since last clean — still not Dirty unless you Set Dirty"));
check("src.noAutoDirty", !/advanceCampaignDay[\s\S]{0,500}\.dirty\s*=\s*true/.test(v2));
check("src.silentSet", v2.includes("const settingDirty = op === \"dirty\"") && v2.includes("if (settingDirty) payloadO.quiet = true") && v2.includes("if (!settingDirty)"));
check("src.playerQuiet", join.includes("if (root.SSDNSSheet && !payload.quiet)"));
check("src.rulesUntouched", !rules.includes("campaignDay") && !rulesJs.includes("campaignDay") && !rulesJs.includes("0.3.134"));
check("src.persisted", v2.includes("campaignDay: fight.campaignDay || 1") && v2.includes("gunClean: fight.gunClean || {}"));

const bag = {};
const toasts = [];
const ledgers = [];
function make(id) {
  if (!bag[id]) bag[id] = {
    id, innerHTML: "", textContent: "", hidden: false, value: "",
    contains() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    classList: { toggle() {}, add() {}, remove() {} }
  };
  return bag[id];
}
const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.localStorage = { getItem() { return null; }, setItem() {} };
sandbox.document = {
  getElementById(id) { return make(id); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  createElement() { return { className: "", innerHTML: "", setAttribute() {}, appendChild() {}, addEventListener() {} }; },
  body: { appendChild() {} },
  activeElement: null
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
sandbox.DMCC = {
  $: (sel) => make(String(sel || "").replace(/^#/, "")),
  $$: () => [],
  esc,
  state: {
    players: {
      pc1: { snapshot: { name: "Caleb", speed: 30, guns: [{ index: 0, name: "Peacemaker", capacity: 6, loaded: 6, dirty: false }] } }
    },
    ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null
  },
  toast(msg) { toasts.push(String(msg || "")); },
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand() { return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger(row) { ledgers.push(row); return Promise.resolve(); },
  postDmAction(line) { ledgers.push({ what: line, feed: true }); return Promise.resolve(); },
  renderPlayers() {}
};
sandbox.SSDNSConditions = { label(c) { return (c && c.name) || ""; }, idFor(s, n) { return s + ":" + n; }, normalize(x) { return x; }, mergeById(list) { return list || []; }, listText() { return ""; }, icon() { return "●"; } };
vm.createContext(sandbox);
vm.runInContext(read("assets/js/turn-rules.js"), sandbox, { filename: "turn-rules.js" });
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const src = v2.replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__fight = { renderFight, setOrder: function (rows) { fight.order = rows || []; } };\n"
);
vm.runInContext(src, sandbox, { filename: "v2.js" });
const clock = sandbox.SSDNSGunClock;
const foe = { id: "ban", name: "Bandit", kind: "enemy", hp: 11, maxHp: 11, card: { attacks: [{ name: "Revolver", capacity: 6, loaded: 2, dirty: false }] } };
sandbox.__fight.setOrder([foe]);
sandbox.__fight.renderFight();

check("day.starts", clock.day() === 1, String(clock.day()));
check("baseline.notOverdue", clock.overdue().length === 0, JSON.stringify(clock.overdue()));
const gun = sandbox.DMCC.state.players.pc1.snapshot.guns[0];
const atk = foe.card.attacks[0];
clock.advance();
check("advance.one", clock.day() === 2 && clock.overdue().length === 0 && !gun.dirty && !atk.dirty);
clock.advance();
const late = clock.overdue();
check("advance.two", clock.day() === 3 && late.length === 2 && late.every((g) => g.days === 2) && !gun.dirty && !atk.dirty, JSON.stringify(late));
check("advance.toast", toasts.some((t) => /days since last clean — still not Dirty unless you Set Dirty/.test(t)) && ledgers.length === 0, JSON.stringify({ toasts, ledgers }));
const list = bag.gunClockList.innerHTML;
check("paint.names", list.includes("Caleb") && list.includes("Peacemaker") && list.includes("Bandit") && list.includes("Revolver") && list.includes("2 days since last clean — still not Dirty unless you Set Dirty"), list);

clock.stamp(clock.playerKey("pc1", 0));
sandbox.__fight.renderFight();
const afterClean = clock.overdue();
check("clean.clearsPlayer", afterClean.length === 1 && afterClean[0].who === "Bandit", JSON.stringify(afterClean));
check("clean.stillNotDirty", gun.dirty === false && atk.dirty === false);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("gun clock ok");

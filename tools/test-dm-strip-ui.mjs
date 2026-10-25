/**
 * DM strip matches the player strip look (sheet 0.3.131 / DMCC 0.2.144).
 * Round, whose-turn pill, pill chips, Action / Bonus / R, Move, Dash / Disengage / Dodge.
 * The Table strip still has no Next button. rules.js and database.rules.json stay out of this.
 *   node tools/test-dm-strip-ui.mjs
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

const sheet = read("assets/css/sheet.css");
const dm = read("dm/assets/css/dmcc.css");
const mapCss = read("map/ssdns-map.css");
const mapJs = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");

check("frame.player", /#turnPanel\.turn-panel \{[^}]*border: 2px solid #3fbf9a/.test(sheet));
check("frame.table", dm.includes("#turnStrip.turn-strip") && dm.includes("border: 2px solid #3fbf9a") && dm.includes(".dm-turn-now"));
check("frame.map", /position: relative;\s*\n\s*grid-area: strip;[\s\S]{0,500}border: 2px solid #3fbf9a/.test(mapCss));
check("weight.next", mapCss.includes(".ssm-turnstrip .btn-next") && mapCss.includes("#8b2f1f"));
check("pips.colors", dm.includes(".pip-action:not(.used)") && dm.includes("#6fbf4f") && dm.includes(".pip-reaction:not(.used)") && dm.includes("#5c9bd1"));
check("src.noTableNext", !/strip\.innerHTML = [^;]*Next/.test(v2) && v2.includes("data-dm-scroll") && v2.includes("stripActsHtml"));
check("src.mapRound", mapJs.includes("roundEl.className = 'turn-round'") && mapJs.includes("textContent = 'Next'"));
check("src.playerDock", mapCss.includes(".ssdns-map.has-sheet-turn > .ssm-turnstrip { display: none !important; }"));
check("src.rulesUntouched", !rules.includes("dm-strip") && !rulesJs.includes("0.3.137") && !rulesJs.includes("stripActsHtml"));
check("src.namesUncut", /min-width: 701px\) \{\s*\n\s*\.ssm-turnhost #turnPanel \.turn-chip \.chip-name \{ max-width: none/.test(sheet));

const bag = {};
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
  state: { players: { pc1: { snapshot: { name: "Caleb", speed: 30 }, turnMarkers: { action: false, bonus: true, reaction: false, dash: true, disengage: false, dodge: false, moveUsed: 10 } } }, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand() { return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {}
};
sandbox.SSDNSConditions = { label(c) { return (c && c.name) || ""; }, idFor(s, n) { return s + ":" + n; }, normalize(x) { return x; }, mergeById(list) { return list || []; }, listText() { return ""; }, icon() { return "●"; } };
vm.createContext(sandbox);
vm.runInContext(read("assets/js/turn-rules.js"), sandbox, { filename: "turn-rules.js" });
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
const src = v2.replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__fight = { renderFight, setOrder: function (rows) { fight.order = rows || []; }, setFight: function (started, turn, round) { fight.started = !!started; fight.turn = turn || 0; if (round) fight.round = round; } };\n"
);
vm.runInContext(src, sandbox, { filename: "v2.js" });
const api = sandbox.__fight;
const pc = { id: "pc1", playerId: "pc1", kind: "player", name: "Caleb", ac: 14, hp: 20, init: 16 };
const foe = { id: "ban", name: "Bandit", kind: "enemy", ac: 12, hp: 0, maxHp: 11, init: 8, card: { attacks: [{ name: "Revolver", capacity: 6, loaded: 2 }] } };
api.setOrder([pc, foe]);
api.setFight(true, 0, 7);
api.renderFight();
const html = bag.turnStrip.innerHTML;
check("render.round", html.includes("Round 7") && html.includes("dm-turn-now") && html.includes("Caleb"), html.slice(0, 240));
check("render.pips", html.includes('data-dm-pip="action"') && html.includes("Bonus") && html.includes(">R<") && /Move 50\/60 ft/.test(html), html.replace(/\s+/g, " ").slice(0, 500));
check("render.dash", html.includes("tl-act on") && html.includes("Dash") && html.includes("Disengage") && html.includes("Dodge"));
check("render.chips", html.includes('class="chip-name"') && html.includes("Bandit") && html.includes("Down"));
check("render.noNext", !/>\s*Next\s*</.test(html) && html.includes("data-dm-scroll"));
check("render.enemyOpen", html.includes('data-open-enemy="ban"'));

api.setFight(true, 1, 7);
api.renderFight();
const enemy = bag.turnStrip.innerHTML;
check("render.enemyTurn", enemy.includes("Bandit") && enemy.includes('data-dm-pip="action"') && /Move 30\/30 ft/.test(enemy) && enemy.includes('data-dm-act="dash"'));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("dm strip ui ok");

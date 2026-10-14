/**
 * Duplicating an enemy token adds a full combatant. Map-card labels clear AA.
 *   node tools/test-map-dup.mjs
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
function lin(c) {
  c = c / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function ratio(a, b) {
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}
const css = read("map/ssdns-map.css");
const card = "#14100c";
check("contrast.adv", css.includes("#34c759") && ratio("#34c759", card) >= 4.5, ratio("#34c759", card).toFixed(2));
check("contrast.dis", css.includes("#ff3b30") && ratio("#ff3b30", card) >= 4.5, ratio("#ff3b30", card).toFixed(2));
check("contrast.ink", ratio("#f0e4cf", card) >= 4.5 && ratio("#f0e4cf", "#3a3228") >= 4.5 && ratio("#f0e4cf", "#2a241c") >= 4.5);
check("contrast.rules", css.includes('input[data-act="playerAdv"]') && css.includes('input[data-act="playerDis"]') && css.includes('input[data-act="rowAdv"]') && css.includes('input[data-act="rowDis"]'));

const mapSrc = read("map/ssdns-map.js");
const hostSrc = read("map/ssdns-map-host.js");
check("dup.emit", mapSrc.includes("duplicate: true") && mapSrc.includes("sourceCombatantId"));
check("dup.host", hostSrc.includes('name === "combatant:add"') && hostSrc.includes("detail.duplicate"));
check("dup.hide", mapSrc.includes("token:hidden") && hostSrc.includes('name === "token:hidden"'));
check("dup.playerStrip", read("assets/js/sheet-playtest.js").includes('cur.mapHidden ? "Hidden"') && read("assets/js/sheet-playtest.js").includes("if (row.mapHidden) return"));

const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
const stored = {};
sandbox.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null; },
  setItem(k, v) { stored[k] = String(v); }
};
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, setAttribute() {} };
  },
  body: { appendChild() {}, classList: { contains() { return false; } } },
  activeElement: { tagName: "BODY" }
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let seq = 0;
sandbox.DMCC = {
  $: () => null,
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { seq += 1; return (p || "id") + seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand() { return Promise.resolve(); },
  pushRoll() { return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {}
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
const v2 = read("dm/assets/js/v2.js").replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__fight = { setOrder: function (rows) { fight.order = rows || []; }, setConds: function (map) { fight.condMap = map || {}; }, publish: buildPublish };\n"
);
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const rustler = {
  id: "en_rust",
  name: "Rustler",
  kind: "enemy",
  init: 14,
  hp: 11,
  maxHp: 11,
  ac: 12,
  mapTokenId: "tok_rust",
  card: { attacks: [{ name: "Ball n Cap", capacity: 6, loaded: 6, chambers: ["k:percussion::medium", "k:percussion::medium", "k:percussion::medium", "k:percussion::medium", "k:percussion::medium", "k:percussion::medium"] }] }
};
const jolene = { id: "p_jolene", playerId: "p_jolene", kind: "player", name: "Jolene", hp: 20, maxHp: 20, ac: 13 };
sandbox.__fight.setOrder([jolene, rustler]);
sandbox.__fight.setConds({ cond_old: { id: "cond_old", name: "Frightened", subjectId: "en_rust" } });

const copy = sandbox.SSDNSMapFight.duplicate({
  duplicate: true,
  tokenId: "tok_copy",
  sourceId: "tok_rust",
  sourceCombatantId: "en_rust",
  hidden: false,
  name: "Rustler"
});
check("dup.made", !!copy && copy.id !== rustler.id && copy.kind === "enemy" && /Rustler 2/.test(copy.name), copy && copy.name);
check("dup.init", copy && copy.init === 14 && rustler.init === 14);
check("dup.order", sandbox.__fight.publish().order.some((row) => row.id === copy.id));
const targets = sandbox.SSDNSMapFight.targets({ combatantId: "p_jolene" });
check("dup.targets", targets.options.some((o) => o.id === copy.id) && targets.options.some((o) => o.id === rustler.id));
copy.hp = 3;
copy.card.attacks[0].loaded = 1;
check("dup.independent", rustler.hp === 11 && rustler.card.attacks[0].loaded === 6 && copy.card.attacks[0].chambers[0] === "k:percussion::medium");
const pub = sandbox.__fight.publish();
check("dup.public", !!pub.pub[copy.id] && pub.pub[copy.id].name === copy.name);

const hidden = sandbox.SSDNSMapFight.duplicate({
  duplicate: true,
  tokenId: "tok_hid",
  sourceCombatantId: rustler.id,
  hidden: true
});
check("dup.hiddenRow", !!hidden && hidden.mapHidden === true && hidden.id !== copy.id);
const masked = sandbox.__fight.publish();
const hiddenOrder = masked.order.find((row) => row.id === hidden.id);
check("dup.hiddenPub", hiddenOrder && hiddenOrder.mapHidden === true && hiddenOrder.guns.length === 0 && hiddenOrder.name === "Unknown gunman" && !masked.pub[hidden.id]);
check("dup.hiddenDm", sandbox.SSDNSMapFight.targets({ combatantId: "p_jolene" }).options.some((o) => o.id === hidden.id));
check("dup.playerSkip", sandbox.SSDNSMapFight.duplicate({ duplicate: true, sourceCombatantId: "p_jolene" }) == null);
const before = sandbox.__fight.publish().order.length;
check("dup.blank", sandbox.SSDNSMapFight.duplicate({ tokenId: "tok_new" }) == null && sandbox.__fight.publish().order.length === before);

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("dup ok");

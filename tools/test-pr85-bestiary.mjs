/**
 * PR85 (DMCC 0.2.84): Encounter Bot bestiary v1 (mounts, Spectral Horse, Oct 17 swaps).
 * Every entry is valid and still builds an enemy card; the new and changed entries carry the approved stats.
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

const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.localStorage = { getItem() { return null; }, setItem() {} };
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
  state: { players: {}, ledger: [], demo: true, roomCode: "", uid: "dm" },
  toast() {},
  uid(p) { return (p || "id") + "1"; },
  guardFocus(fn) { if (fn) fn(); }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/data/rules.js"), sandbox, { filename: "rules.js" });
vm.runInContext(read("assets/js/spell-cast.js"), sandbox, { filename: "spell-cast.js" });
const v2 = read("dm/assets/js/v2.js").replace(/\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/, "\nglobalThis.__enemy = { enemyCardHtml, compactAttackButtons, turnRowHtml, enemyPickerList, enemySelectHtml, claimEnemyAdd, finishEnemyAdd };\n");
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const Applied = sandbox.SSDNSApplied;
const htmlOf = sandbox.__enemy.enemyCardHtml;
const compact = sandbox.__enemy.compactAttackButtons;
const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
function beast(id) { return beasts.filter((b) => b.id === id)[0]; }
function rowFor(b) {
  const card = Applied.enemyCardModel(b);
  return { id: "en-" + b.id, name: b.name, kind: "enemy", ac: b.ac, hp: b.hp, maxHp: b.hp, atkBonus: b.atkBonus, damage: b.damage || "", attacks: b.attacks || "", beastId: b.id, card };
}
const J = (x) => JSON.stringify(x).slice(0, 300);
const live = beasts.filter((b) => b && !b.template);
const ids = beasts.map((b) => b.id);
check(beasts.length === 55 && live.length === 54, "55 entries (54 live + template) " + beasts.length);
check(new Set(ids).size === ids.length, "ids are unique");
const REQ = ["id", "name", "size", "type", "ac", "hp", "speed", "cr", "xp", "abilities", "attackList", "traits", "actions", "group"];
live.forEach((b) => {
  const miss = REQ.filter((k) => !(k in b));
  check(!miss.length, b.id + " has the required fields " + miss.join(","));
  check(Number.isInteger(b.ac) && Number.isInteger(b.hp) && Number.isInteger(b.xp), b.id + " numeric ac/hp/xp");
  check(["creature", "generic-folk", "named"].indexOf(b.group) >= 0, b.id + " group " + b.group);
  (b.attackList || []).forEach((a) => check(a && a.id && a.name, b.id + " attack has id and name " + J(a)));
  let html = "";
  try { const row = rowFor(b); html = htmlOf(row, 0); compact(row); } catch (e) { html = ""; check(false, b.id + " card throws " + e); }
  check(html.indexOf("enemy-card") >= 0 && html.indexOf(b.ac + "</b><span>AC") >= 0, b.id + " builds an enemy card");
});
const by = (id) => beasts.filter((b) => b.id === id)[0] || {};
["draft-horse", "mule", "spectral-horse", "elite-sandie-brute", "sand-devourer", "slumber-ghoul"].forEach((id) => check(by(id).id === id, "new entry " + id));
/* shared spook rules plus prices on the four living mounts */
const SPOOK = "Gunshots within 60 ft. frighten it (DC 12 Animal Handling to soothe). Double riding halves speed. Death is permanent.";
[["riding-horse", "7,500"], ["warhorse", "40,000"], ["draft-horse", "5,000"], ["mule", "800"]].forEach(([id, es]) => {
  check(String(by(id).tactics).indexOf(SPOOK) >= 0, id + " carries the shared spook rules");
  check(String(by(id).loot).indexOf("~" + es + " ES") >= 0, id + " price " + es + " ES " + by(id).loot);
});
const sh = by("spectral-horse");
check(sh.ac === 10 && sh.speed === "100 ft." && sh.cr === "—" && sh.xp === 0, "spectral horse AC 10, speed 100, CR —, XP 0 " + J([sh.ac, sh.speed, sh.cr, sh.xp]));
check(sh.damageImmunities === "all damage" && (sh.attackList || []).length === 0 && sh.allySummon === true, "spectral horse takes no damage, no attacks, summon only");
check((sh.traits || []).some((t) => t.name === "Never Spooked") && (sh.traits || []).some((t) => /Saddle of the Phantom Steed/.test(t.text)), "spectral horse never spooked, saddle summon");
/* Oct 17: Act I ChaosMaker swaps, Scorps Act II, Enforcer Heavy ChaosMaker + Farm Shotgun Buckshot Cone */
const enf = by("scorps-enforcer");
check((enf.attackList || []).map((a) => a.name).join(",") === "Blackjack,Heavy ChaosMaker,Farm Shotgun (Medium shell)", "enforcer arms " + J((enf.attackList || []).map((a) => a.name)));
check(/Buckshot Cone/.test(enf.attacks || ""), "enforcer farm shotgun buckshot cone");
check(/Act II/.test(String(enf.act || "")), "Scorps enforcer is Act II");
check((by("outlaw").attackList || [])[0].name === "Ball n Cap Revolver", "Act I outlaw swap to ball n cap");
/* kept from the repo: the #53 word swap and the shipped Sandie languages line */
check(JSON.stringify(beasts).indexOf("Thieves’ cant") < 0, "no Thieves' cant (lingo swap kept)");
check(/tribal tongue/.test(by("sandie").languages || ""), "Sandie keeps its shipped languages line");
check(live.filter((b) => b.parked).map((b) => b.id).join(",") === "captain-rhee-calder", "only Calder is parked");
check(read("dm/assets/js/v2.js").indexOf('bestiary.json?v=0.2.84-mounts') >= 0, "bestiary cache key bumped so tables load the new data");
console.log(failures.length ? failures.length + " FAILED:\n" + failures.join("\n") : "All PR85 bestiary checks passed (" + live.length + " entries).");
if (failures.length) process.exitCode = 1;

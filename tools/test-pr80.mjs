/**
 * PR80: damage die faces on REAL live call shapes (0.3.59 only drew them when a sample passed dice:"1d8").
 * Live callers pass faces + the rolled formula; DMCC enemy attacks pass dice = face detail ("4+2");
 * player attacks reach the DM over Firebase (encounter/requests), which dropped dmgFaces/dmgParts/n1/parts.
 * Also: the attack (d20) total is plain light-blue text, no ring; damage keeps its badge.
 *   node tools/test-pr80.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const box = { location: { pathname: "/" }, document: null }; box.window = box;
vm.runInNewContext(read("assets/js/dice-art.js"), box);
vm.runInNewContext(read("assets/js/apply-guard.js"), box);
const B = box.SSDNSApplied.attackBreakdown;
const L = (t) => box.SSDNSDice.lead({ attack: true }, t).replace(/<span class="die-face[^]*?<\/span>/g, (m) => "[d" + (m.match(/data-sides="(\d+)"/) || [])[1] + ":" + ((m.match(/>(\d+)<\/text>/) || [])[1] || "") + "]");

/* sheet gun card: rollDamageExpr -> { total, detail, faces, flat, formula } (crit already doubled in formula) */
let c = B({ who: "Ruby", weapon: "Navy", target: "Bandit", nat: 14, parts: [{ label: "DEX", value: 3 }], damage: { faces: [4], formula: "1d8+2", parts: [{ label: "DEX", value: 2 }], total: 6, type: "piercing" } });
let h = L(c.text);
check("gun.faces", h.includes("Damage: d8 [d8:4] + 2 (DEX) = <span class=\"roll-total dmg\">6</span> piercing"), h);
check("gun.atkPlain", h.includes('= <span class="roll-total-atk">17</span>') && !/roll-total(?!-atk)[^"]*">17/.test(h), h);
c = B({ who: "Ruby", target: "Bandit", nat: 20, parts: [{ label: "DEX", value: 3 }], damage: { faces: [6, 3], formula: "2d8+3", parts: [{ label: "DEX", value: 3 }], total: 12, type: "piercing" } });
h = L(c.text);
check("gun.crit", h.includes("2d8 [d8:6][d8:3]") && h.includes('roll-total dmg crit">12') && h.includes('roll-total-atk crit">23'), h);
/* sheet melee: formula is the crit-adjusted "NdS+K" */
for (const sides of [4, 6, 10, 12]) {
  c = B({ who: "Jo", target: "X", nat: 12, parts: [{ label: "bonus", value: 4 }], damage: { faces: [3], formula: "1d" + sides + "+1", parts: [{ label: "mod", value: 1 }], total: 4, type: "" } });
  h = L(c.text);
  check("melee.d" + sides, h.includes("Damage: d" + sides + " [d" + sides + ":3]"), h);
}
/* DMCC enemy attack: dice = parseDice detail ("4+2"), formula = the enemy's damage expression */
c = B({ who: "Coyote", weapon: "Bite", target: "Ruby", nat: 17, atk: 4, ac: 15, damage: { faces: [4], formula: "1d6+2", parts: [], total: 6, dice: "4+2", type: "piercing" } });
h = L(c.dmText);
check("dm.enemy", h.includes("Damage: d6 [d6:4] + 2 (mod)") && h.includes('roll-total dmg">6'), h);
/* 0.3.59 live shape without a formula stays readable (no crash, no dropped line) */
c = B({ who: "Ruby", target: "Bandit", nat: 14, parts: [{ label: "DEX", value: 3 }], damage: { faces: [4], parts: [{ label: "DEX", value: 2 }], total: 6, type: "piercing" } });
check("legacy.line", /Damage: 4 \+ 2 \(DEX\) = 6 piercing/.test(c.text) && L(c.text).includes('roll-total dmg">6'), c.text);
/* received over Firebase: writeAttack must carry the breakdown; the DM builds the card from req */
const dj = read("assets/js/dm-join.js");
const w = dj.slice(dj.indexOf("function writeAttack"), dj.indexOf("function postAttack"));
for (const k of ["dmgFaces", "dmgFormula", "dmgParts", "dmgType", "n1", "n2", "parts"]) check("fb." + k, new RegExp("row\\." + k + " = ").test(w));
const fakeRow = { nat: 14, n1: 14, hitTotal: 17, parts: [{ label: "DEX", value: 3 }], amount: 6, dmgFaces: [4], dmgFormula: "1d8+2", dmgParts: [{ label: "DEX", value: 2 }], dmgType: "piercing", dice: "4+2" };
c = B({ who: "Ruby", target: "Bandit", nat: fakeRow.nat, n1: fakeRow.n1, parts: fakeRow.parts, total: fakeRow.hitTotal, ac: 15, revealAc: true,
  damage: { faces: fakeRow.dmgFaces, parts: fakeRow.dmgParts, total: fakeRow.amount, type: fakeRow.dmgType, formula: fakeRow.dmgFormula, dice: fakeRow.dice } });
h = L(c.dmText);
check("fb.dmCard", h.includes("d20 [d20:14]") && h.includes("Damage: d8 [d8:4] + 2 (DEX)"), h);
/* call sites pass the formula */
const se = read("assets/js/sheet-extras.js"), sp = read("assets/js/sheet-playtest.js"), v2 = read("dm/assets/js/v2.js");
check("site.gun", /faces: dmg\.faces, formula: dmg\.formula/.test(se));
check("site.gunPending", /dmgFormula: pendingDmg \? pendingDmg\.formula : ""/.test(se) && /formula: info\.dmgFormula \|\| ""/.test(se) && /dmgFormula: info\.dmgFormula \|\| ""/.test(se));
check("site.melee", /faces: rolls, formula: formula/.test(sp));
check("site.dmEnemy", /faces: dmg\.rolls, formula: dice/.test(v2));
check("site.dmVerdict", /formula: req\.dmgFormula \|\| ""/.test(v2));
/* dice art exists for every damage die */
for (const s of [4, 6, 8, 10, 12, 20]) check("art.d" + s, fs.existsSync(path.join(root, "assets/img/dice/d" + s + ".webp")));
check("css.atk", /\.roll-total-atk \{ color: #4FDCCB/.test(read("assets/css/dice.css")));
check("rules.untouched", !fs.readFileSync(path.join(root, "database.rules.json"), "utf8").includes("dmgFormula"));
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.114" && ver.dmcc === "0.2.127");
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR80 checks passed.");
process.exit(failures.length ? 1 : 0);

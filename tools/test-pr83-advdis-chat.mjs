/**
 * PR83 (sheet 0.3.60): advantage / disadvantage in chat. Both d20s show; the kept one gets a green (adv)
 * or red (dis) ring, the dropped one a thin faint red X. Checks, saves, initiative, grapple/shove and
 * spell beams/rays use the same "d20 5 / «14»" card format as gun attacks, so none shows a blank d20.
 *   node tools/test-pr83-advdis-chat.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

const box = { location: { pathname: "/" }, document: null, Math }; box.window = box;
vm.runInNewContext(read("assets/js/dice-art.js"), box);
vm.runInNewContext(read("assets/js/apply-guard.js"), box);
vm.runInNewContext(read("assets/js/grab.js"), box);
const D = box.SSDNSDice;
/* compact view: [d20:N] for a die, K+/K- for kept adv/dis, X for dropped */
const V = (h) => h
  .replace(/<span class="die-used die-kept (adv|dis)"[^>]*>(<span class="die-face[^]*?<\/span>)<\/span>/g, (m, mode, f) => (mode === "adv" ? "K+" : "K-") + f)
  .replace(/<span class="die-dropped"[^>]*>(<span class="die-face[^]*?<\/span>)<\/span>/g, (m, f) => "X" + f)
  .replace(/<span class="die-face[^]*?<\/span>/g, (m) => "[d" + (m.match(/data-sides="(\d+)"/) || [])[1] + ":" + ((m.match(/>(\d+)<\/text>/) || [])[1] || "") + "]");

check("advRun.format", D.advRun([5, 14], 14) === "d20 5 / «14»" && D.advRun([14, 5], 5) === "d20 14 / «5»" && D.advRun([7, 7], 7) === "d20 «7» / 7" && D.advRun([9], 9) === "9");

/* gun attack card (attackBreakdown already writes both faces) */
const B = box.SSDNSApplied.attackBreakdown;
let card = B({ who: "Ruby", target: "Bandit", faces: [8, 17], nat: 17, atk: 5, ac: 15 });
let h = V(D.lead({ attack: true }, card.text));
check("card.adv", h.includes("d20 X[d20:8]K+[d20:17]"), h);
card = B({ who: "Ruby", target: "Bandit", faces: [8, 17], nat: 8, atk: 5, ac: 15 });
h = V(D.lead({ attack: true }, card.text));
check("card.dis", h.includes("d20 K-[d20:8]X[d20:17]"), h);
h = V(D.cardBadges("Ruby → Bandit\nd20 «7» / 7 · DEX +3 = 10 vs AC 15 → MISS · disadvantage"));
check("card.tieUsesWord", h.includes("K-[d20:7]X[d20:7]"), h);
h = V(D.cardBadges("Ruby → Bandit\nd20 «7» / 7 · DEX +3 = 10 vs AC 15 → MISS · advantage"));
check("card.tieAdv", h.includes("K+[d20:7]X[d20:7]"), h);

/* sheet check / save / initiative text (postCheck: label · formula = total (detail)) */
const chk = "Ruby · dex check · 2d20+3 = 17 (d20 5 / «14»+3 · advantage)";
h = V(D.lead({ formula: "2d20+3", detail: "d20 5 / «14»+3 · advantage", result: 17 }, chk));
check("check.adv", h.includes("X[d20:5]K+[d20:14]") && (h.match(/\[d20:\]/g) || []).length === 0, h);
const sv = "Ruby · wis save · 2d20+1 = 4 (d20 «3» / 16+1 · disadvantage)";
h = V(D.lead({ formula: "2d20+1", detail: "d20 «3» / 16+1 · disadvantage", result: 4 }, sv));
check("save.dis", h.includes("K-[d20:3]X[d20:16]") && !/\[d20:\]/.test(h), h);
const init = "Ruby · Initiative · 2d20+2 = 21 (d20 «19» / 4+2 · advantage)";
h = V(D.lead({ formula: "2d20+2", detail: "d20 «19» / 4+2 · advantage", result: 21 }, init));
check("init.adv", h.includes("K+[d20:19]X[d20:4]") && !/\[d20:\]/.test(h), h);

/* straight rolls are untouched */
check("plain.untouched", D.cardBadges("Ruby rolls Perception: 1d20+3 = 15") === "Ruby rolls Perception: 1d20+3 = 15");
const once = D.cardBadges(chk);
check("idempotent", D.cardBadges(once) === once);

/* grapple / shove contest */
const G = box.SSDNSGrab;
let seq = [0.2, 0.7, 0.45, 0.1]; let k = 0;
const rng = () => seq[k++ % seq.length];
const res = G.contest({ mode: "grapple", feet: 5, rng, advantage: "adv", actor: { skills: { Athletics: 3 } }, target: { skills: { Athletics: 1 } }, weapon: { properties: "two-handed" } });
check("grab.text", /Athletics d20 \d+ \/ «\d+»|Athletics d20 «\d+» \/ \d+/.test(res.line || "") && !/keep/.test(res.line || ""), res.line);
h = V(D.cardBadges(res.line || ""));
check("grab.render", (h.match(/K\+\[d20:\d+\]/g) || []).length >= 1 && (h.match(/X\[d20:\d+\]/g) || []).length >= 1, h);

/* spell cast: beams / rays / no-target */
const sbox = { location: { pathname: "/" }, document: null, Math: Object.create(Math) }; sbox.window = sbox;
vm.runInNewContext(read("assets/js/dice-art.js"), sbox);
const spellSrc = read("assets/js/spell-cast.js");
const d20 = spellSrc.slice(spellSrc.indexOf("function d20roll("), spellSrc.indexOf("function sign("));
const tbox = { root: sbox, SSDNSTestRoll: null, out: null };
vm.runInNewContext("var root = this.root; var q = [6, 15]; function die() { return q.shift(); }\n" + d20 + "\nthis.adv = d20roll('adv'); q = [6, 15]; this.dis = d20roll('dis'); q = [11]; this.one = d20roll('');", tbox);
check("spell.d20roll", tbox.adv.shown === "d20 6 / «15»" && tbox.adv.nat === 15 && tbox.dis.shown === "d20 «6» / 15" && tbox.dis.nat === 6 && tbox.one.shown === "11", JSON.stringify([tbox.adv, tbox.dis, tbox.one]));
h = V(sbox.SSDNSDice.cardBadges("Ruby · Eldritch Blast · spell attack +5 · beam 1 d20 6 / «15»+5 = 20 on hit 1d10 «7» = 7; beam 2 d20 «3» / 2+5 = 8 on hit 1d10 «4» = 4"));
check("spell.beams", h.includes("X[d20:6]K+[d20:15]") && h.includes("K+[d20:3]X[d20:2]"), h);

/* modeWord gets its separator; sources use the shared format */
const ex = read("assets/js/sheet-extras.js");
check("modeWord.sep", ex.includes('if (mode === "dis") return " · disadvantage";') && ex.includes('if (mode === "adv") return " · advantage";'));
check("rollAdv.format", /var dice = n2 == null \? String\(nat\) : advRunText\(\[n1, n2\], nat\);/.test(ex) && !/n1 \+ "\/" \+ n2 \+ " → "/.test(ex));
check("spell.noArrow", !/n1 \+ "\/" \+ n2 \+ " → "/.test(spellSrc));
check("grab.noKeep", !/" keep "/.test(read("assets/js/grab.js")));
const css = read("assets/css/dice.css");
check("css.ring", /\.die-kept\.adv \{[^}]*#46c46a/.test(css) && /\.die-kept\.dis \{[^}]*#e0524a/.test(css));
check("css.x", /\.die-dropped::after \{[^}]*linear-gradient\(45deg[^}]*rgba\(255, 140, 140, \.75\)/.test(css) && /\.die-dropped \{[^}]*opacity: \.72/.test(css));
for (const f of ["index.html", "dm/index.html", "map/chat-pop.html"]) check("css.loaded." + f, /dice\.css/.test(read(f)));
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR83 adv/dis chat checks passed.");
if (failures.length) process.exitCode = 1;

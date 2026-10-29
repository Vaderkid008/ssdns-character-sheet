/**
 * PR79: linked-token hygiene (no duplicate enemy tokens, dedupe on DM load, Clear stale tokens,
 * unlink by combatantId) and chat totals (gold-ringed totals, damage die faces).
 *   node tools/test-pr79.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

/* ---- chat totals ---- */
const box = { location: { pathname: "/" }, document: null }; box.window = box;
vm.runInNewContext(read("assets/js/dice-art.js"), box);
vm.runInNewContext(read("assets/js/apply-guard.js"), box);
const B = box.SSDNSApplied.attackBreakdown;
const L = (e, t) => box.SSDNSDice.lead(e, t).replace(/<span class="die-face[^]*?<\/span>/g, (m) => "[d" + (m.match(/data-sides="(\d+)"/) || [])[1] + ":" + ((m.match(/>(\d+)<\/text>/) || [])[1] || "") + "]");
const hit = B({ who: "Ruby", weapon: "Navy", target: "Bandit", nat: 14, parts: [{ label: "DEX", value: 3 }, { label: "prof", value: 2 }], ac: 15, damage: { dice: "1d8", faces: [1], parts: [{ label: "DEX", value: 2 }], total: 3, type: "piercing" } });
check("text.damageFaces", /Damage: d8 «1» \+ 2 \(DEX\) = 3 piercing/.test(hit.text), hit.text);
let h = L({ attack: true, formula: "1d20+5" }, hit.text);
check("hit.d20", h.includes("d20 [d20:14]") && !h.includes("«"), h);
check("hit.total", h.includes('= <span class="roll-total-atk">19</span> vs AC 15 → HIT'), h);
check("hit.dmg", h.includes('Damage: d8 [d8:1] + 2 (DEX) = <span class="roll-total dmg">3</span> piercing'), h);
const crit = B({ who: "Ruby", target: "Bandit", nat: 20, atk: 5, damage: { dice: "1d8", faces: [6, 3], parts: [{ label: "DEX", value: 3 }], total: 12, type: "piercing" } });
h = L({ attack: true }, crit.text);
check("crit.doubled", h.includes("2d8 [d8:6][d8:3]") && h.includes('roll-total-atk crit">25') && h.includes('roll-total dmg crit">12'), h);
const multi = B({ who: "J", target: "W", faces: [8, 17], nat: 17, atk: 7, damage: { dice: "2d6+1d4", faces: [4, 5, 2], parts: [{ label: "DEX", value: 4 }], total: 15, type: "piercing" } });
h = L({ attack: true }, multi.text);
check("multi.dice", h.includes("2d6 [d6:4][d6:5] + d4 [d4:2]") && h.includes('roll-total dmg">15'), h);
check("adv.used", /<span class="die-dropped"[^>]*>\[d20:8\]<\/span><span class="die-used die-kept adv"[^>]*>\[d20:17\]<\/span>/.test(h), h);
const miss = B({ who: "Outlaw", target: "Jessey", nat: 9, atk: 4, ac: 15 });
h = L({ attack: true }, miss.dmText);
check("enemy.miss", h.includes('roll-total-atk miss">13') && !h.includes("Damage"), h);
check("plain.untouched", box.SSDNSDice.cardBadges("Ruby rolls Perception: 1d20+3 = 15") === "Ruby rolls Perception: 1d20+3 = 15");
check("idempotent", box.SSDNSDice.cardBadges(box.SSDNSDice.cardBadges(hit.text)) === box.SSDNSDice.cardBadges(hit.text));
check("css", /\.roll-total \{[^}]*border: 3px solid #e1b24a/.test(read("assets/css/dice.css")));
for (const f of ["assets/js/sheet-extras.js", "dm/assets/js/dmcc.js", "map/ssdns-map-chat.js"]) check("path." + f, /SSDNSDice\.lead\(/.test(read(f)));

/* ---- linked tokens (map helpers run in a stub) ---- */
const src = read("map/ssdns-map.js");
const a = src.indexOf("function linkedKind("), b = src.indexOf("function placeLinkedToken(");
const removed = [];
const mbox = { role: "dm", state: { tokens: [] }, shared: { tokens: {} }, removeMapTokens: (ids) => { removed.push(...ids); mbox.state.tokens = mbox.state.tokens.filter((t) => !ids.includes(t.id)); ids.forEach((id) => delete mbox.shared.tokens[id]); }, requestDraw() {}, window: {} };
vm.runInNewContext(src.slice(a, b) + "\nthis.api={tokenForCombatant,dedupeLinkedTokens,staleTokenIds,clearStaleTokens};", mbox);
const M = mbox.api;
function seed() {
  removed.length = 0;
  mbox.state.tokens = [
    { id: "t1", combatantId: "en_a", kind: "npc" }, { id: "t2", combatantId: "en_a", kind: "npc" }, { id: "t3", combatantId: "en_a", kind: "npc" },
    { id: "t4", combatantId: "en_b", kind: "npc" }, { id: "p1", ownerUid: "u1", combatantId: "u1", kind: "player" }, { id: "old", combatantId: "en_gone", kind: "npc" }
  ];
  mbox.shared.tokens = {}; mbox.state.tokens.forEach((t) => { mbox.shared.tokens[t.id] = JSON.parse(JSON.stringify(t)); });
}
seed();
check("adopt", M.tokenForCombatant("en_b").id === "t4" && M.tokenForCombatant("u1") === null);
mbox.state.tokens = mbox.state.tokens.filter((t) => t.id !== "t4");
check("adopt.shared", M.tokenForCombatant("en_b") && M.tokenForCombatant("en_b").id === "t4" && mbox.state.tokens.some((t) => t.id === "t4"));
seed();
check("dedupe.keep", M.dedupeLinkedTokens({ en_a: "t1" }) === 2 && removed.sort().join() === "t2,t3", removed.join());
seed();
check("dedupe.noKeep", M.dedupeLinkedTokens({}) === 2 && !removed.includes("t3"), removed.join());
seed();
const stale = M.staleTokenIds(["en_a", "en_b"], { en_a: "t2" });
check("stale.list", stale.sort().join() === "old,t1,t3", stale.join());
check("stale.clear", M.clearStaleTokens(["en_a", "en_b"], { en_a: "t2" }) === 3 && mbox.state.tokens.map((t) => t.id).sort().join() === "p1,t2,t4");
check("stale.playersSafe", !removed.includes("p1"));

/* ---- wiring ---- */
check("map.placeAdopts", /function placeLinkedToken[\s\S]{0,300}tokenForCombatant\(spec\.combatantId\)/.test(src));
check("map.dedupeOnLoad", /dedupePlayerTokens\(\);\s*dedupeLinkedTokens\(fightKeepMap\(\)\);/.test(src));
check("map.api", /tokensLoaded: function/.test(src) && /clearStaleTokens\n/.test(src));
const host = read("map/ssdns-map-host.js");
check("host.api", ["tokensLoaded: tokensLoaded", "tokenForCombatant: tokenForCombatant", "staleTokenIds: staleTokenIds", "clearStaleTokens: clearStaleTokens"].every((k) => host.includes(k)));
const v2 = read("dm/assets/js/v2.js");
check("v2.syncWaits", /function syncMapTokens\(\) \{\s*if \(linkBusy\) return;\s*const hostNow[\s\S]{0,140}tokensLoaded\(\)\) return;/.test(v2));
check("v2.bindAdopts", /function bindNewToken[\s\S]{0,500}tokenForCombatant\(row\.id\)/.test(v2));
check("v2.unlinkCid", /function unlinkMapToken[\s\S]{0,500}r\.id === cid && \(!r\.mapTokenId \|\| !tokenStillThere\(r\.mapTokenId\)\)/.test(v2));
check("v2.clearConfirm", /Clear " \+ ids\.length \+ " stale token/.test(v2) && /SSDNSAsk\.confirm\(msg\)/.test(v2));
check("dm.button", /id="btnClearStale"/.test(read("dm/index.html")) && /#btnClearStale/.test(v2));
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.165" && ver.dmcc === "0.2.178");
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR79 checks passed.");
process.exit(failures.length ? 1 : 0);

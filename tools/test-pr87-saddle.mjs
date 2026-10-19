/**
 * PR87 / Lock L0182: the Saddle of the Phantom Steed has unlimited summons.
 * No uses counter or charge pips on the sheet or DMCC, it can always be used, and old saved
 * characters with a stored 1/dawn count lose it. The Spectral Horse block says so (L0181 checks).
 *   node tools/test-pr87-saddle.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "outside-only" });
const w = dom.window;
w.eval(read("assets/data/item-catalog.js"));
w.eval(read("assets/js/items.js"));
const I = w.SSDNSItems;
check("api", !!(I && I.byId && I.instanceFrom && I.unlimitedFix && I.use && I.spend && I.drawerRows));
const row = I.byId("saddle-of-the-phantom-steed");
check("catalog.noUses", !!row && (!row.uses || row.uses.max == null), JSON.stringify(row && row.uses));
check("catalog.src", !/saddle-of-the-phantom-steed[\s\S]{0,400}uses:\s*\{\s*max:\s*1/.test(read("assets/data/item-catalog.js")));

/* a fresh saddle */
const fresh = I.instanceFrom({ catalogId: "saddle-of-the-phantom-steed" });
check("fresh.unlimited", fresh.uses.max == null && fresh.chargesLeft == null, JSON.stringify({ uses: fresh.uses, charges: fresh.chargesLeft }));

/* an old saved character: stored 1/dawn and no charge left */
const old = { uid: "it_old", catalogId: "saddle-of-the-phantom-steed", name: "Saddle of the Phantom Steed", type: "gear", count: 1,
  effect: { kind: "castSpell", spell: "Phantom Steed", level: 3 }, uses: { max: 1, recharge: "dawn" }, chargesLeft: 0 };
const rebuilt = I.instanceFrom(JSON.parse(JSON.stringify(old)));
check("saved.instanceFrom", rebuilt.uses.max == null && rebuilt.chargesLeft == null, JSON.stringify({ uses: rebuilt.uses, charges: rebuilt.chargesLeft }));
const ch = { items: [JSON.parse(JSON.stringify(old))] };
const listed = I.list ? I.list(ch) : (I.listOf ? I.listOf(ch) : null);
const fixed = I.unlimitedFix(JSON.parse(JSON.stringify(old)));
check("saved.fix", fixed.uses.max == null && fixed.chargesLeft == null);
check("saved.listFix", !listed || (listed[0].uses.max == null && listed[0].chargesLeft == null), JSON.stringify(listed && listed[0]));

/* using it: never blocked, never spent, counter never shown */
let uses = 0, blocked = 0;
for (let n = 0; n < 4; n++) {
  const plan = I.use(rebuilt, { name: "Dust", level: 5, rng: () => 0.5 });
  if (plan && plan.ok) uses++; else blocked++;
  if (plan && plan.consume) I.spend(rebuilt);
}
check("use.unlimited", uses === 4 && blocked === 0 && (rebuilt.count == null || rebuilt.count === 1) && rebuilt.chargesLeft == null, JSON.stringify({ uses, blocked, count: rebuilt.count, charges: rebuilt.chargesLeft }));
const drawer = I.drawerRows([rebuilt], { dm: true });
check("dmcc.noCounter", /Saddle of the Phantom Steed/.test(drawer) && !/\(\d+\/\d+\)/.test(drawer) && /useItem/.test(drawer), drawer);
const itemsSrc = read("assets/js/items.js");
check("sheet.counterRule", /var charges = item\.chargesLeft != null && item\.uses && item\.uses\.max != null/.test(itemsSrc));
check("sync.fixOnSnapshot", /SSDNSItems\.unlimitedFix\(item\)/.test(read("assets/js/dm-join.js")));

/* bestiary text */
const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const horse = (Array.isArray(beasts) ? beasts : (beasts.creatures || beasts.beasts || Object.values(beasts))).find((b) => b && b.id === "spectral-horse");
const trait = (name) => ((horse && horse.traits) || []).find((t) => t && t.name === name);
const bound = trait("Bound Saddle"), dur = trait("Duration");
check("beast.bound", !!bound && !/1\/dawn/.test(bound.text) && !/charge or the spell lasts/.test(bound.text) && /instant and unlimited/.test(bound.text) && /owner controls/.test(bound.text) && /DC 15 Arcana/.test(bound.text) && /DC 12 Animal Handling/.test(bound.text) && /L0181/.test(bound.text), bound && bound.text);
check("beast.duration", !!dur && !/1\/dawn/.test(dur.text) && /no limit/.test(dur.text), dur && dur.text);
check("beast.noDawnAnywhere", !/1\/dawn/.test(JSON.stringify(horse)));

console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR87 saddle checks passed.");
process.exit(failures.length ? 1 : 0);

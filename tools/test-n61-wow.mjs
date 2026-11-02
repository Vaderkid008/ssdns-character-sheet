/**
 * N61 skins + expand-FX + Fixed Bayonet OA (sheet 0.3.168 / DMCC 0.2.181).
 * rules.js stays untouched.   node tools/test-n61-wow.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.169" && version.sheetBuild === "sheet-playtest-v03169");
check("ver.dmcc", version.dmcc === "0.2.182" && version.dmccBuild === "dmcc-playtest-v02182");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.169"'));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.182"'));
check("rules.untouched", !read("assets/data/rules.js").includes("0.3.169") && !read("assets/data/rules.js").includes("0.2.182") && !read("database.rules.json").includes("0.3.169"));
check("no.fog.redesign", !read("assets/js/lighting.js").includes("n61") && read("map/ssdns-map-fx.js").includes("function powderSmoke"));

const sandbox = { window: {}, console: console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(read("assets/js/cast-skins.js"), sandbox, { filename: "cast-skins.js" });
vm.runInContext(read("assets/data/rules.js"), sandbox, { filename: "rules.js" });
vm.runInContext(read("assets/js/pact-shot.js"), sandbox, { filename: "pact-shot.js" });
vm.runInContext(read("map/ssdns-map-fx.js"), sandbox, { filename: "ssdns-map-fx.js" });

const Skins = sandbox.SSDNSCastSkins;
const PS = sandbox.SSDNSPactShot;
const FX = sandbox.SSDNSMapFx;
const callings = ["hexslinger", "scholar", "pact-seeker", "lawman", "frontier-preacher", "nature-guide", "frontier-scout", "storyteller", "martial-artist"];
callings.forEach(function (id) { check("skin." + id, !!Skins.skinFor(id)); });
check("skin.gunOnly", Skins.skinFor("hexslinger").gun === true && Skins.hidesLineCast("hexslinger") === false && Skins.hidesLineCast("scholar") === true);

const levels = [{ level: 1, total: 2, spent: 1, spells: [{ name: "Magic Missile", cast: "1:Magic Missile" }] }];
const scholar = Skins.html({ calling: "scholar", cantrips: [{ name: "Light", cast: "0:Light" }], levels: levels }, "1:1");
check("html.scholarTabs", scholar.includes("n61-tok") && scholar.includes("Ledger") && scholar.includes("data-skin-go") && scholar.includes("data-cast=\"1:Magic Missile\""));
check("html.scholarPop", scholar.includes('data-skin-pop="1"') && !scholar.includes('data-skin-pop="1" hidden'));
const hex = Skins.html({ calling: "hexslinger", cantrips: [{ name: "Fire Bolt", cast: "0:Fire Bolt" }], levels: levels }, "");
check("html.hexNoTokens", !hex.includes("data-skin-token") && hex.includes("Caster Gun") && hex.includes("data-spell-cast=\"0:Fire Bolt\""));
const pact = Skins.html({ calling: "pact-seeker", cantrips: [], levels: levels, quick: [{ name: "Pact Shot", cast: "0:Eldritch Blast (Pact Shot)", first: true, pact: true }] }, "");
check("html.pact", pact.includes("Sigil") || pact.includes("sigil") || pact.includes("Borrowed Iron"));
check("html.pactQuick", pact.includes("Pact Shot") && pact.includes("n61-qc first"));
const foe = Skins.enemyHtml({ calling: "", slots: { 1: { max: 2, left: 1 } }, spells: [{ name: "Fire Bolt", level: 0, n: 0 }, { name: "Shield", level: 1, n: 1 }] });
check("html.enemy", foe.includes("data-cast-skin") && foe.includes('data-sheet-cast="1" data-n="0"') && foe.includes('data-n="1"') && foe.includes("data-skin-token"));

const c = { calling: "pact-seeker", level: 3, pactBoon: "blade", borrowedIronAway: false, melee: [{ weapon: "longsword", pactBlade: true, equipped: true }] };
const strike = PS.oaStrike(c);
check("oa.bayonet", strike && strike.index === 0 && /longsword/i.test(strike.name), JSON.stringify(strike));
c.borrowedIronAway = true;
check("oa.ironAway", PS.oaStrike(c) == null);
c.borrowedIronAway = false;
c.pactBoon = "tome";
check("oa.noBoon", PS.oaStrike(c) == null);
check("oa.gunBlock", read("assets/js/turn-lock.js").includes("Borrowed Iron is not a gun attack"));
check("oa.arm", read("assets/js/dm-join.js").includes("strikeLabel") && read("assets/js/react-prompt.js").includes('data-react-choice="strike"'));

function look(spell, dmg) { return FX.lookOf({ type: "spell", spell: spell, dmg: dmg || "" }); }
check("fx.fire", look("Fire Bolt", "fire") === "fire");
check("fx.cold", look("Ray of Frost", "cold") === "cold");
check("fx.lightning", look("Shocking Grasp", "lightning") === "lightning");
check("fx.force", look("Eldritch Blast", "force") === "scurve");
check("fx.eb", look("Eldritch Blast") === "scurve");
check("fx.pact", look("Eldritch Blast (Pact Shot)") === "bullet" && look("Hellshot", "fire") === "bullet");
check("fx.mm", look("Magic Missile", "force") === "beads");
check("fx.shield", look("Shield") === "shield" && look("Mage Armor") === "magearmor");
check("fx.acidRibbon", look("Acid Splash", "acid") === "acid" && look("Poison Spray", "poison") === "poison-spray");
check("fx.utility", look("Cure Wounds") === "heal" && look("Bless") === "bless" && look("Fog Cloud") === "fog" && look("Mage Hand") === "hand" && look("Pass without Trace") === "pwt" && look("Invisibility") === "invis");
check("fx.self", FX.lookSelf({ spell: "Shield" }) === true && FX.lookSelf({ spell: "Fire Bolt", dmg: "fire" }) === false);
const plan = FX.plan("spell", "hit", { spell: "Fire Bolt", dmg: "fire" });
check("fx.planFire", plan.impactAt === 300 && plan.look === "fire", JSON.stringify(plan));
const pub = FX.sanitize({ type: "spell", result: "hit", spell: "Fire Bolt", dmg: "fire", self: true, weapon: "Fire Bolt" });
check("fx.sanitize", pub && pub.spell === "Fire Bolt" && pub.dmg === "fire" && pub.self === true);
const req = FX.request({ type: "spell", spell: "Magic Missile", dmg: "force", weapon: "Magic Missile" });
check("fx.request", req.spell === "Magic Missile" && req.dmg === "force");
check("fx.toggle", typeof FX.enabled === "function" && typeof FX.setEnabled === "function");
check("fx.smoke", read("map/ssdns-map-fx.js").includes("black_powder") || (read("map/ssdns-map-fx.js").includes("1150") && read("map/ssdns-map-fx.js").includes("900")));
check("fx.hidden", read("map/ssdns-map-fx.js").includes("if (g.srcHidden) edgeGlow"));
check("sheet.wired", read("index.html").includes("cast-skins.js") && read("assets/js/app.js").includes("paintSheet"));
check("dm.wired", read("dm/index.html").includes("cast-skins.js") && read("dm/assets/js/v2.js").includes("enemyHtml"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("n61 wow ok");

/**
 * Item 8: Big Fifty is Heavy, and Cross-Draw's first shot is seated, mounted, or driving only.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const rulesSrc = read("assets/data/rules.js");
const sandbox = { window: {}, globalThis: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(rulesSrc, sandbox, { filename: "rules.js" });
const rules = sandbox.SSDNS_RULES;
const big = (rules.firearms || []).find((g) => g.id === "bison-big-fifty-buffalo-rifle");
check(big && big.tiers.heavy && big.tiers.heavy.damage === "3d10", "Big Fifty Heavy line is 3d10");
check(big && big.tiers.heavy.range === "150/600" && big.tiers.heavy.misfire === "1–5", "Big Fifty Heavy range and misfire stay listed");
check(big && !big.tiers.medium, "Big Fifty has no Medium class");
check(big && big.rounds.heavy && big.rounds.heavy[0] === ".50-90" && !big.rounds.medium, "Big Fifty .50-90 is a Heavy round");
const bore = rules.roundTiers["big bore"];
check(bore && bore.heavy.indexOf(".50-90") >= 0 && bore.medium.length === 0, "big bore table lists .50-90 as Heavy");
check(read("assets/js/app.js").indexOf('"bison-big-fifty-50-90": ["bison-big-fifty-buffalo-rifle", "heavy"]') >= 0, "old Big Fifty id migrates to Heavy");

const store = JSON.parse(read("dm/assets/data/store-items.json"));
const storeGun = store.find((x) => x.id === "bison-big-fifty-buffalo-rifle");
check(storeGun && /Heavy/.test(storeGun.notes) && !/Medium/.test(storeGun.notes), "DMCC store card says Heavy");
const storeHol = store.find((x) => x.id === "cross-draw-holster");
check(storeHol && /seated, mounted, or driving/.test(storeHol.notes) && /does not apply on foot/.test(storeHol.notes), "DMCC Cross-Draw note states the rule");

const cross = (rules.holsters || []).find((h) => h.id === "cross-draw-holster");
check(cross && cross.firstShot === 1 && cross.initBonus === 1, "Cross-Draw still lists +1 init and +1 first shot");
check(cross && /only while seated, mounted, or driving/.test(cross.notes), "Cross-Draw note states the rule");
check(cross && /only while seated, mounted, or driving/.test(cross.perk), "Cross-Draw perk states the rule");
check(cross && /does not apply on foot/.test(cross.notes), "Cross-Draw note says it is off on foot");

const kept = {
  "slim-jim": { firstShot: 0, initBonus: 1, perk: "Belt rig.", notes: "Plain slim leather pouch on a belt loop. Every drover's first holster." },
  "mexican-loop": { firstShot: 1, initBonus: 1, perk: "Belt rig.", notes: "A single folded piece of leather. The gun rides high and steady." },
  "skeleton-rig": { firstShot: 1, initBonus: 2, perk: "Belt rig.", notes: "Cut-away leather with almost no drag on the draw. Favored by men who get paid to be fast." },
  "bridgeport-rig-swivel": { firstShot: 2, initBonus: 2, perk: "Belt rig. Fast swap.", notes: "A steel clip on a stud in the hammer screw. It pivots, so you can fire it before it's fully drawn." },
  "pommel-holsters-pair": { firstShot: 0, initBonus: 1, perk: "Saddle only. No mounted penalty. Fast swap while mounted. †Mounted only.", notes: "Twin horse-pistol holsters over the saddle horn, cavalry fashion. Three loaded Ball n Caps beat one reload." }
};
Object.keys(kept).forEach((id) => {
  const h = rules.holsters.find((x) => x.id === id);
  const want = kept[id];
  check(h && h.firstShot === want.firstShot && h.initBonus === want.initBonus && h.perk === want.perk && h.notes === want.notes, id + " holster was left alone");
});

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
function run(rel) {
  vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel });
}
run("assets/data/rules.js");
run("assets/js/ssdns-bridge.js");
run("assets/js/storage.js");
run("assets/js/app.js");

const app = window.SSDNSApp;
check(app && typeof app.compute === "function", "sheet compute is available");
const doc = app.state.doc;
const c = doc.character;
c.abilities.DEX = 10;
c.guns[0].weapon = "herringer-pocket-pistol";
c.guns[0].proficient = false;
c.holsterActive = true;

function setHolster(id, seated, mounted) {
  c.holster = id;
  c.seated = !!seated;
  c.mounted = !!mounted;
  return app.compute();
}
function pistol(id) {
  return (rules.firearms || []).find((g) => g.id === id);
}
if (!pistol("herringer-pocket-pistol")) {
  const any = (rules.firearms || []).find((g) => g.group === "pistol");
  c.guns[0].weapon = any.id;
}

let v = setHolster("cross-draw-holster", false, false);
check(v.holsterFirst === 0, "Cross-Draw first shot is off on foot");
check(v.holsterInit === 1, "Cross-Draw initiative still applies on foot");
check((v.guns[0].note || "").indexOf("first shot") < 0, "gun card omits the first-shot line on foot");

v = setHolster("cross-draw-holster", true, false);
check(v.holsterFirst === 1, "Cross-Draw first shot applies while seated or driving");
check((v.guns[0].note || "").indexOf("first shot from the rig") >= 0, "gun card shows the first-shot bonus while seated");

v = setHolster("cross-draw-holster", false, true);
check(v.holsterFirst === 1, "Cross-Draw first shot applies while mounted");

c.holsterActive = false;
v = setHolster("cross-draw-holster", true, false);
check(v.holsterFirst === 0, "Cross-Draw first shot stays off until a pistol rides in the rig");
c.holsterActive = true;

v = setHolster("mexican-loop", false, false);
check(v.holsterFirst === 1, "Mexican Loop first shot still applies on foot");
v = setHolster("mexican-loop", true, false);
check(v.holsterFirst === 0, "Mexican Loop still loses the first shot while seated");
v = setHolster("pommel-holsters-pair", false, false);
check(v.holsterInit === 0 && v.holsterFirst === 0, "Pommel initiative stays mounted-only");
v = setHolster("pommel-holsters-pair", false, true);
check(v.holsterInit === 1 && v.holsterFirst === 0, "Pommel initiative still applies while mounted");

app.applyPatch(function (d) {
  d.character.guns[0].weapon = "bison-big-fifty-buffalo-rifle";
  d.character.guns[0].chamber = "medium|.50-90";
  d.character.guns[0].tier = "medium";
});
const after = app.state.doc.character.guns[0];
const stats = app.compute().guns[0];
check(after.chamber === "heavy|.50-90" && after.tier === "heavy", "a saved Medium Big Fifty chamber becomes Heavy");
check(stats && stats.tier === "heavy" && String(stats.damage || "").indexOf("3d10") === 0, "Big Fifty card damage is the Heavy 3d10 line");
const label = window.document.querySelector(".gun[data-row='0'] .chamber-sel");
check(label && label.selectedOptions[0] && /Heavy/.test(label.selectedOptions[0].textContent) && /Medium/.test(label.selectedOptions[0].textContent) === false, "weapon card chamber reads Heavy");

const info = window.document.querySelector("#holsterInfo");
c.holster = "cross-draw-holster";
c.seated = false;
c.mounted = false;
c.holsterActive = true;
app.applyPatch(function () {});
check(info && /only while seated, mounted, or driving/.test(info.textContent) && /That bonus is off/.test(info.textContent), "holster note says the bonus is off on foot");
c.seated = true;
app.applyPatch(function () {});
check(/That bonus is on/.test(info.textContent), "holster note says the bonus is on while seated or driving");

dom.window.close();

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok item8");

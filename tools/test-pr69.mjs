/**
 * PR69 explosives per DND Bot (PHB p.63-64).
 *   node tools/test-items.mjs
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

const sandbox = { console };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  readyState: "complete",
  getElementById: function () { return null; },
  addEventListener: function () {},
  querySelector: function () { return null; }
};
vm.createContext(sandbox);
vm.runInContext(read("assets/data/item-catalog.js"), sandbox, { filename: "assets/data/item-catalog.js" });
vm.runInContext(read("assets/js/items.js"), sandbox, { filename: "assets/js/items.js" });
vm.runInContext(read("assets/js/grab.js"), sandbox, { filename: "assets/js/grab.js" });
const Items = sandbox.SSDNSItems;
const Grab = sandbox.SSDNSGrab;
// rng from a list of d20/d6/d8/damage faces expressed as [0,1) values
function seq(vals) { let i = 0; return () => vals[i++ % vals.length]; }
const f20 = (n) => (n - 1) / 20 + 0.001, f6 = (n) => (n - 1) / 6 + 0.001, f8 = (n) => (n - 1) / 8 + 0.001;
const stick = Items.instanceFrom(Items.byId("dynamite-stick-standard-fuse"));
const sweat = Items.instanceFrom(Items.byId("dynamite-stick-sweating-sold-cheap"));
const keg = Items.instanceFrom(Items.byId("blasting-keg"));
let r = Items.use(stick, { name: "Ada", rng: seq([f20(10), 0.5, 0.5, 0.5]), distance: 20 });
check("save.only", r.ok && r.noAttackRoll && r.save === "DEX" && r.dc === 12 && !/to hit|attack roll [0-9]/i.test(r.chat) && r.half === Math.floor(r.total / 2) && r.objects === r.total * 2);
check("timing.std", /end of your turn/.test(r.chat) && /Extra Attack/.test(r.chat) && /AC 15/.test(r.chat));
r = Items.use(stick, { name: "Ada", rng: seq([f20(10), 0.5, 0.5, 0.5, f8(3)]), distance: 50 });
check("scatter", r.scatter && r.scatter.feet === 10 && r.scatter.dir === "E" && /scattered 10 ft E/.test(r.chat));
check("range.max", Items.use(stick, { distance: 70 }).ok === false);
r = Items.use(stick, { name: "Ada", rng: seq([f20(1), 0.5, 0.5, 0.5, f6(2)]) });
check("fresh.dud", r.misfire && r.dud && r.consume === false && /Relighting is an action/.test(r.chat));
r = Items.use(stick, { name: "Ada", rng: seq([f20(1), 0.5, 0.5, 0.5, f6(4)]) });
check("fresh.fast", r.fast && /halfway/.test(r.chat));
r = Items.use(stick, { name: "Ada", rng: seq([f20(1), 0.5, 0.5, 0.5, f6(6)]) });
check("fresh.slow", r.slow && /next turn/.test(r.chat));
r = Items.use(stick, { name: "Ada", powderMan: true, rng: seq([f20(1), 0.5, 0.5, 0.5]) });
check("powderman.fresh", !r.misfire);
r = Items.use(sweat, { name: "Ada", rng: seq([f20(3), 0.5, 0.5, 0.5, f6(1)]) });
check("sweat.1-3", r.misfire && r.dud);
r = Items.use(sweat, { name: "Ada", powderMan: true, rng: seq([f20(3), 0.5, 0.5, 0.5]) });
check("powderman.sweat", !r.misfire);
r = Items.use(sweat, { name: "Ada", rng: seq([f20(1), 0.5, 0.5, 0.5]) });
check("sweat.inhand", r.inHand && r.selfDamage === r.total && /centered on Ada/.test(r.chat));
r = Items.use(keg, { name: "Ada", rng: seq([f20(12), 0.5]) });
check("keg", r.radius === 20 && r.dc === 13 && /Not throwable/.test(r.chat) && /fire damage or a gun crit/.test(r.chat) && Items.use(keg, { distance: 70, rng: seq([f20(12), 0.5]) }).ok);
const B = [[2, "4d6", 10, 12], [3, "5d6", 15, 13], [4, "6d6", 20, 13]];
check("bundles", B.every(([n, d, ft, dc]) => { const b = Items.byId("dynamite-bundle-" + n); return b && b.effect.damage === d && b.effect.radius === ft && b.effect.dc === dc; }));
const k = Items.byId("blasting-keg").effect;
check("keg.stats", k.damage === "6d6" && k.placed === true);
if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("pr69 ok");

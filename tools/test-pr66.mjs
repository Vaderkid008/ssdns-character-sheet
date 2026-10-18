/**
 * PR66 items run: custom weapons, attunement, reward routing, explosives merge, Peace Maker, Ore, Give tab.
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
sandbox.SSDNS_RULES = { melee: [], firearms: [], otherRanged: [], storytellerGear: { instruments: [{ id: "fiddle", name: "Fiddle" }] }, explosives: { items: [] } };
vm.runInContext(read("assets/js/custom-weapons.js"), sandbox, { filename: "custom-weapons.js" });
vm.runInContext(read("assets/js/peace-maker.js"), sandbox, { filename: "peace-maker.js" });
const CW = sandbox.SSDNSCustomWeapons;
const rec = CW.registerItem({ type: "weapon", name: "Rust Cleaver", weapon: { kind: "melee", category: "martial", damage: "1d10", dmgType: "Slashing", magic: 1 } });
check("cw.record", rec && rec.custom === true && sandbox.SSDNS_RULES.melee.some((m) => m.id === rec.id));
const gunRec = CW.registerItem({ type: "weapon", name: "Odd Pistol", weapon: { kind: "firearm", damage: "1d8", caliber: ".36", capacity: 6 } });
check("cw.firearm", gunRec && sandbox.SSDNS_RULES.firearms.some((g) => g.id === gunRec.id));
const pm = sandbox.SSDNSPeaceMaker.weapon();
check("peace.bat", pm.damage === "1d6" && Number(pm.magic) === 1 && /bludgeon/i.test(pm.dmgType || pm.damageType || ""));
const c = { items: [] };
const ore = ["ore-scholars-robe", "true-measure-ore-kit", "night-prospectors-cape", "ore-buyers-signet", "prospectors-touch"];
check("ore.catalog", ore.every((id) => Items.byId(id) && Items.byId(id).attune && Items.byId(id).dmPlace));
check("ore.hidden", !Items.catalog({}).some((r) => ore.includes(r.id)));
ore.forEach((id) => Items.add(c, Items.byId(id), { dm: true }));
const uids = c.items.map((i) => i.uid);
for (let i = 0; i < 3; i++) Items.setAttuned(c, uids[i], true, {});
check("attune.cap", Items.attunedCount(c) === 3 && Items.setAttuned(c, uids[3], true, {}).ok === false);
check("attune.dm", Items.setAttuned(c, uids[3], true, { dm: true }).ok === true && Items.attunedCount(c) === 4);
c.attuneCap = 5; check("attune.capOverride", Items.attuneCap(c) === 5);
check("route.instrument", Items.classifyReward("Quality Fiddle").kind === "instrument");
check("route.explosive", Items.classifyReward("Dynamite stick (standard fuse)", "dynamite-stick-standard-fuse").kind === "explosive");
const old = { items: [], explosives: [{ item: "dynamite-stick-standard-fuse", count: 3 }] };
check("merge.explosives", Items.mergeExplosives(old) === 1 && old.explosives.length === 0 && old.items[0].count === 3);
const sweat = Items.seeds().find((r) => /sweat/i.test(r.name));
check("misfire.sweat", sweat && sweat.effect && sweat.effect.misfire);
const dm = read("dm/index.html");
check("give.tab", /id="tab-rewards"[^>]*>[^<]*Give/.test(dm) && /id="giveHandout"/.test(dm));
if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("pr66 ok");

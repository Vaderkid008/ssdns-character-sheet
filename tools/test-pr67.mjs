/**
 * PR67 paper doll: slots, locks, bonuses, rigs no-stack, Dex cap 20, two-handed shield.
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
sandbox.SSDNS_RULES = { melee: [{ id: "maul", name: "Maul", properties: "heavy, two-handed" }], firearms: [], armor: [], holsters: [] };
vm.runInContext(read("assets/js/paper-doll.js"), sandbox, { filename: "paper-doll.js" });
const D = sandbox.SSDNSDoll;
const map = JSON.parse(read("assets/images/doll/slot-map-B6.json"));
check("map.25", Object.keys(D.BOX).length === 25 && Object.keys(map.slots).every((k) => JSON.stringify(map.slots[k]) === JSON.stringify(D.BOX[k])));
check("rings.2", Object.keys(D.BOX).filter((k) => /^ring_/.test(k)).length === 2);
const c = { items: [
  { uid: "r1", name: "R1", wear: "ring", bonuses: { ac: 1 } }, { uid: "r2", name: "R2", wear: "ring" }, { uid: "r3", name: "R3", wear: "ring" },
  { uid: "h1", name: "Rig A", wear: "holster", bonuses: { dex: 2, init: 1 } }, { uid: "h2", name: "Rig B", wear: "holster", bonuses: { dex: 1, init: 3 } },
  { uid: "cl", name: "Cape", wear: "cloak", attune: true, attuned: false, bonuses: { DEX: 4 } },
  { uid: "sh", name: "Buckler", wear: "shield", bonuses: { ac: 2 } }, { uid: "pot", name: "Tonic", type: "consumable", wear: "ring" }] };
check("slot.fit", D.equip(c, "ring_1", "r1").ok && !D.equip(c, "hat", "r2").ok && !D.equip(c, "ring_2", "pot").ok);
D.equip(c, "ring_2", "r2"); D.equip(c, "ring_2", "r3");
check("slot.lock", c.items.filter((i) => i.equipSlot === "ring_2").length === 1 && c.items[1].equipSlot === "");
check("bonus.slotted", D.bonuses(c).ac === 1);
D.equip(c, "holster_l", "h1"); D.equip(c, "holster_r", "h2");
const b = D.bonuses(c);
check("rig.nostack", b.holsterDex === 2 && b.holsterInit === 3);
D.equip(c, "coat", "cl");
check("attune.needed", !D.bonuses(c).abilities.DEX);
c.items[5].attuned = true;
check("dex.cap", D.capped(18, D.bonuses(c).abilities.DEX) === 20 && D.capped(21, 2) === 21);
D.equip(c, "accessory_8", "sh");
check("shield.on", D.bonuses(c).ac === 3 && !D.bonuses(c).shieldOff);
c.melee = [{ weapon: "maul" }];
check("shield.twohanded", D.bonuses(c).shieldOff && D.bonuses(c).ac === 1);
const h = D.html(c, { es: 42 });
check("html.slots", (h.match(/data-doll-slot=/g) || []).length === 25 && /42<\/span><span class="doll-es-unit">ES/.test(h));
check("html.ro", !/<button/.test(D.html(c, { readOnly: true })));
const idx = read("index.html");
check("index.wired", /id="dollHost"/.test(idx) && /id="dollMini"/.test(idx) && /paper-doll\.js/.test(idx));
check("app.hook", /SSDNSDoll\.bonuses/.test(read("assets/js/app.js")));
if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("pr67 ok");

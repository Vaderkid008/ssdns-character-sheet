/**
 * Live two-client path for Disintegrate, Inflict Wounds, and Hunger of Hadar.
 * Sheet 0.3.259 / DMCC 0.2.272.
 *
 * A string search is not enough. This drives the same functions the clients call:
 * the map firebase adapter (shared by both seats), the attack stamp that
 * postDamage writes and applyRequest reads, and the zone ticks the DM runs
 * when a turn starts or ends inside a sphere the player just placed.
 *
 *   node tools/test-spell-live-03231.mjs
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
check("ver.sheet", version.sheet === "0.3.259" && version.sheetBuild === "sheet-playtest-v03259");
check("ver.dmcc", version.dmcc === "0.2.272" && version.dmccBuild === "dmcc-playtest-v02272");

const context = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, RegExp };
context.window = context;
context.globalThis = context;
vm.createContext(context);
["assets/data/rules.js", "assets/js/spell-fx.js", "assets/js/spell-area.js", "assets/js/spell-riders.js", "assets/js/spell-cast.js", "assets/js/spell-zones.js", "assets/js/apply-guard.js"].forEach((rel) => {
  vm.runInContext(read(rel), context, { filename: rel });
});
vm.runInContext(read("map/ssdns-map-firebase.js"), context, { filename: "map/ssdns-map-firebase.js" });
const Cast = context.SSDNSSpellCast;
const Z = context.SSDNSSpellZones;
const A = context.SSDNSApplied;
const FB = context.SSDNSMapFirebase;

/* --- Disintegrate: a status write that was already in flight must not restore the token --- */
const store = { pub: {}, dm: {} };
const bus = [];
const seen = { dm: [], player: [] };
const dm = FB.memory({ role: "dm", store: store, bus: bus });
const player = FB.memory({ role: "player", store: store, bus: bus });
dm.subscribe("map/public/tokens", (value, meta) => { seen.dm.push({ value: value, meta: meta }); });
player.subscribe("map/public/tokens", (value, meta) => { seen.player.push({ value: value, meta: meta }); });

const tokenPath = "map/public/tokens/mob1";
const tokenBody = { id: "mob1", name: "Bandit", pos: { x: 4, y: 5 }, status: "", kind: "npc" };
await dm.write(tokenPath, tokenBody, { seq: 100, by: "dm" });
check("dust.bothSee", store.pub[tokenPath] && seen.player.some((e) => e.value && e.value.id === "mob1"));
await dm.remove(tokenPath);
check("dust.playerDrop", !store.pub[tokenPath] && seen.player.some((e) => e.meta && e.meta.removed));

const stale = Object.assign({}, tokenBody, { status: "disintegrated", seq: 200 });
let inflight = null;
const data = {};
const fakeFb = {
  ref: function (_db, fullPath) { return fullPath; },
  set: function () { return Promise.resolve(); },
  remove: function (fullPath) { delete data[fullPath]; return Promise.resolve(); },
  runTransaction: function (fullPath, update) {
    return new Promise(function (resolve) {
      inflight = function () {
        const next = update(data[fullPath]);
        if (next === undefined) { resolve({ committed: false }); return; }
        data[fullPath] = next;
        resolve({ committed: true });
      };
    });
  }
};
const live = FB.create({ db: {}, fb: fakeFb, roomCode: "TEST", uid: "dm", role: "dm" });
const livePath = "map/public/tokens/mob1";
const writing = live.write(livePath, stale, { seq: 200, by: "dm" });
check("dust.inflight", typeof inflight === "function");
data["rooms/TEST/" + livePath] = tokenBody;
await live.remove(livePath);
check("dust.removed", data["rooms/TEST/" + livePath] == null);
inflight();
await writing;
check("dust.noRewrite", data["rooms/TEST/" + livePath] == null, JSON.stringify(data["rooms/TEST/" + livePath] || null));

const again = await dm.write(tokenPath, stale, { seq: 300, by: "dm" });
check("dust.adapterDrops", again && again.buried === true && !store.pub[tokenPath]);
const playerAfter = seen.player.filter((e) => e.value && e.value.id === "mob1");
check("dust.playerKeptGone", playerAfter.length === 1 && !store.pub[tokenPath], "player saw the token " + playerAfter.length + " times");
const fresh = await dm.write("map/public/tokens/mob2", { id: "mob2", name: "Other", pos: { x: 1, y: 1 } }, { seq: 400, by: "dm" });
check("dust.newToken", fresh && fresh.ok === true && store.pub["map/public/tokens/mob2"]);

A.setShowDowned(true);
check("dust.list", A.dustedTarget({ status: "Disintegrated", hp: 0 }) === true && A.isUnusableTarget({ status: "Disintegrated", hp: 0, kind: "enemy" }) === true);
check("dust.showDowned", A.isUnusableTarget({ status: "Down", hp: 0, kind: "enemy" }) === false && A.isUnusableTarget({ disintegrated: true, status: "Down", hp: 0, kind: "enemy" }) === true);

/* --- Inflict Wounds: a melee spell attack posted as damage still counts as an attack --- */
const wounds = {
  amount: 18,
  label: "Inflict Wounds",
  type: "spell",
  spell: "Inflict Wounds",
  spellName: "Inflict Wounds",
  melee: true,
  nat: 18,
  hitTotal: 23,
  n1: 18,
  targetId: "mob1",
  hit: true
};
const posted = { type: wounds.type, spell: wounds.spell, label: wounds.label, amount: wounds.amount, targetId: wounds.targetId, melee: true };
Cast.stampAttack(posted, wounds);
check("wounds.stamp", posted.hitTotal === 23 && posted.nat === 18 && posted.spellName === "Inflict Wounds" && posted.melee === true, JSON.stringify(posted));
check("wounds.attack", Cast.countsAsAttack(posted) === true);
const saveReq = Cast.stampAttack({ type: "spell", label: "Hunger of Hadar", amount: 7, save: "DEX" }, { label: "Hunger of Hadar", amount: 7, save: "DEX" });
check("wounds.notSave", Cast.countsAsAttack(saveReq) === false);
const healReq = { type: "heal", hitTotal: 8, heal: true };
check("wounds.notHeal", Cast.countsAsAttack(healReq) === false);
const hidden = { type: "attack", nat: 11, hitTotal: 16, spellName: "Inflict Wounds", melee: true };
check("wounds.hidden", Cast.countsAsAttack(hidden) === true);

/* --- Hunger of Hadar: start cold and end acid, including a creature that walked in --- */
const placed = { origin: { x: 10, y: 10 }, origins: [{ x: 10, y: 10 }], facing: 0, area: { shape: "sphere", radius: 20 } };
const built = Z.buildZone("Hunger of Hadar", placed, { slot: 3, casterId: "player1", dc: 15, id: "zone-hadar" });
const wire = JSON.parse(JSON.stringify(built));
const bag = Z.place(null, wire).bag;
const zone = bag.zones.filter((z) => z && z.key === "hunger of hadar")[0];
check("hadar.kept", !!(zone && zone.dc === 15 && zone.ticks && zone.ticks.length === 2), JSON.stringify(zone && zone.ticks));

const inside = { id: "mob1", name: "Bandit", x: 10, y: 10, size: 1, kind: "enemy" };
const outside = { id: "mob2", name: "Scout", x: 30, y: 30, size: 1, kind: "enemy" };
const cold = Z.phaseDue({ zones: [zone] }, inside, "start");
const acid = Z.phaseDue({ zones: [zone] }, inside, "end");
const missed = Z.phaseDue({ zones: [zone] }, outside, "start").concat(Z.phaseDue({ zones: [zone] }, outside, "end"));
check("hadar.cold", cold.length === 1 && cold[0].type === "cold" && cold[0].dice === "2d6" && cold[0].auto === true && cold[0].amount >= 2 && cold[0].amount <= 12 && !cold[0].save, JSON.stringify(cold[0]));
check("hadar.acid", acid.length === 1 && acid[0].save === "DEX" && acid[0].half === false && acid[0].type === "acid" && acid[0].dice === "2d6" && acid[0].dc === 15 && !acid[0].auto, JSON.stringify(acid[0]));
check("hadar.outside", missed.length === 0);

const walked = { id: "pc1", name: "Marshal", x: 11, y: 10, size: 1, kind: "player", ownerUid: "player2" };
const before = { x: 30, y: 30 };
const after = { x: 11, y: 10 };
const onEnter = Z.moveDue([zone], before, after, walked);
const startAfterEnter = Z.phaseDue({ zones: [zone] }, walked, "start");
const endAfterEnter = Z.phaseDue({ zones: [zone] }, walked, "end");
check("hadar.enterLater", onEnter.length === 0 && startAfterEnter.length === 1 && startAfterEnter[0].type === "cold" && endAfterEnter.length === 1 && endAfterEnter[0].save === "DEX");
check("hadar.playerSave", endAfterEnter[0].targetId === "pc1" && startAfterEnter[0].targetId === "pc1");
check("hadar.enemySave", acid[0].targetId === "mob1" && cold[0].targetId === "mob1");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nspell live path ok");

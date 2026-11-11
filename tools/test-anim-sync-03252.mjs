/**
 * Animation clock: a late frame does not skip a bolt to its end,
 * and the same stamp is shared inside one turn (sheet 0.3.285 / DMCC 0.2.298).
 *   node tools/test-anim-sync-03252.mjs
 * rules.js is not regenerated. No new projectile.
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

const context = { console, Math, Date, localStorage: { getItem() { return null; }, setItem() {} }, dispatchEvent() {} };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(read("map/ssdns-map-fx.js"), context);
const FX = context.SSDNSMapFx;
const clock = FX.makeAnimClock(50);
const t0 = clock(1000);
check("clock.origin", t0 === 0);
check("clock.frame", clock(1016) === 16);
const hitch = clock(1016 + 800);
check("clock.hitch", hitch === 66, String(hitch));
check("clock.sameTurn", clock(1016 + 800) === hitch);
const after = clock(1016 + 800 + 16);
check("clock.next", after === 82, String(after));

const boltLife = FX.lookTime("lightning").grow + FX.lookTime("lightning").hold + FX.lookTime("lightning").fade;
const uncapped = 800;
check("bolt.wouldSkip", uncapped > boltLife && hitch - t0 < FX.lookTime("lightning").grow, "life " + boltLife + " paced " + (hitch - t0));
const paced = FX.projectileLight({ type: "spell", spell: "Lightning Bolt", dmg: "lightning" }, hitch - t0);
check("bolt.stillFlying", paced && paced.phase === "flight", JSON.stringify(paced));
const leapt = FX.projectileLight({ type: "spell", spell: "Lightning Bolt", dmg: "lightning" }, uncapped);
check("bolt.leaptAway", leapt === null);

const map = read("map/ssdns-map.js");
check("wire.fx", map.includes("entry.t0 = fxStamp()") && map.includes("const now = fxStamp()"));
check("wire.slide", map.includes("start: fxStamp()") && map.includes("const now = fxStamp()"));
check("wire.light", map.includes("projectileLight(e.spec, now - e.t0)") && map.includes("makeAnimClock(50)"));
check("ball.kept", FX.lookOf({ type: "spell", spell: "Fireball", dmg: "fire" }) === "fireball" && map.includes("function fireballComet") === false && read("map/ssdns-map-fx.js").includes("function fireballComet"));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.285" && ver.dmcc === "0.2.298" && ver.sheetBuild === "sheet-playtest-v03285" && ver.dmccBuild === "dmcc-playtest-v02298");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.285") && !read("database.rules.json").includes("0.3.285"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nanim sync ok");

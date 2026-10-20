/**
 * PR76: Jessey's approved SFX set wired in. Every approved file is in a pool (or the ambient
 * music list), pools start with the primary, alts are randomised, the extra decisions hold
 * (misfire = empty chamber, sword-hit = spear alt, roll-blade = blade attack roll), and the
 * outcome table, misfire / unjam / rechamber / turn hooks, and stinger defaults are in place.
 *   node tools/test-pr76.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

const map = JSON.parse(read("assets/sfx/sfx.json"));
const pools = map.pools;
const all = new Set(Object.values(pools).flat());
const approved = ["buffalo-rifle","cock","misfire","misfire-alt-01","misfire-alt-02","gatling","gatling-ellen-manor","hit-gun","hit-gun-alt-01","hit-gun-alt-02","lever-fire","lever-fire-alt-01","lever-fire-alt-02","plinker","revolver","ricochet","ricochet-alt-01","ricochet-alt-02","ricochet-alt-03","ricochet-alt-04","rifle","shotgun","silenced","unjam","clean","rechamber","reload-repeater","reload-repeater-alt-01","reload-repeater-alt-02","reload-revolver","revolver-spin","hit-arrow","hit-arrow-alt-01","miss-arrow","miss-arrow-alt-01","axe-hit","crit-melee","crit-melee-alt-01","hit-melee","hit-melee-alt-01","miss-melee","miss-melee-alt-01","bow-short-fire","bow-long-draw","spear-hit","sword-hit","spear-throw","roll-blade","electric","heal","ice-storm","lightning-ultimate","lightning","magic-whoosh-soft","teleport","teleport-alt-01","pactshot","spellcast","spellcast-alt-01","grappling-gun-fire","grappling-gun-retract","holster","roll-d20","turn","ui-back","enemy-downed","ui-tick","nat1","nat20","sting-reveal","sting-tension","explode","explode-alt-01","fuse"];
const unused = approved.filter((n) => !all.has(n + ".mp3"));
check("set.allUsed", unused.length === 0, unused.join(", "));
check("set.count", approved.length === 74);
const missing = [...all].filter((f) => !fs.existsSync(path.join(root, "assets/sfx", f)));
check("files.exist", missing.length === 0, missing.join(", "));
check("events.primary", Object.keys(pools).every((k) => map.events[k] === pools[k][0]));
const amb = JSON.parse(read("assets/music/tracks.json")).tracks.filter((t) => /^ambient\//.test(t.file));
check("ambient.tracks", amb.length === 4 && amb.every((t) => t.layer === "ambient" && t.loop && fs.existsSync(path.join(root, "assets/music", t.file))));
/* decisions */
check("dec.emptyClick", pools["empty-click"][0] === "misfire.mp3" && pools["empty-click"].length === 3);
check("dec.spearAlt", pools.spear.join() === "spear-hit.mp3,sword-hit.mp3");
check("dec.bladeRoll", pools.slash.join() === "roll-blade.mp3");
check("alts.random", pools.ricochet.length === 5 && pools.misfire.length === 3 && pools["hit-melee"].length === 3);

/* engine */
const made = [];
class FakeAudio { constructor(u) { this.url = u; this.volume = 1; } play() { made.push(this); return Promise.resolve(); } addEventListener() {} pause() {} }
const box = { Audio: FakeAudio, localStorage: { getItem() { return null; }, setItem() {} }, location: { pathname: "/", search: "" }, URLSearchParams, CustomEvent: class {}, setTimeout, clearTimeout, Math,
  fetch: () => Promise.resolve({ ok: true, json: () => map }) };
box.window = box; box.dispatchEvent = () => {};
vm.runInNewContext(read("assets/js/sfx.js"), box, { filename: "sfx.js" });
await new Promise((r) => setTimeout(r, 30));
const A = box.SSDNSAudio;
check("cue.blade", A.weaponCue({ name: "Machete (Scimitar)" }) === "slash");
check("cue.axeSwing", A.weaponCue({ id: "hatchet-handaxe", name: "Hatchet" }) === "whoosh");
check("cue.javelin", A.weaponCue({ id: "throwing-spear-javelin" }) === "spear-throw");
check("cue.longbow", A.weaponCue({ id: "longbow" }) === "bow-long");
check("cue.rifle", A.weaponCue({ gun: true, name: "Some rifle" }) === "attack" && pools.attack[0] === "rifle.mp3");
check("out.gunHit", A.outcomeCue({ gun: true, name: "Navy" }, "hit") === "hit-gun");
check("out.gunMiss", A.outcomeCue({ gun: true, name: "Navy" }, "miss") === "ricochet");
check("out.gunCrit", A.outcomeCue({ gun: true, name: "Navy" }, "crit") === "nat20");
check("out.blade", A.outcomeCue({ name: "Machete" }, "hit") === "sword-hit");
check("out.blunt", A.outcomeCue({ name: "Club" }, "miss") === "miss-blunt");
check("out.axe", A.outcomeCue({ id: "hatchet-handaxe", name: "Hatchet" }, "hit") === "axe");
check("out.spear", A.outcomeCue({ name: "Trail spear" }, "hit") === "spear");
check("out.meleeCrit", A.outcomeCue({ name: "Machete" }, "crit") === "crit-melee");
check("out.arrow", A.outcomeCue({ id: "shortbow", name: "Shortbow", group: "bow" }, "hit") === "hit-arrow");
check("out.nat1", A.outcomeCue({ name: "Machete", nat: 1 }, "miss") === "nat1" && A.outcomeCue({ gun: true, name: "Navy", nat: 1 }, "miss") === "ricochet");
check("spell.big", A.spellCue({ name: "Lightning Bolt" }) === "lightning-ultimate" && A.spellCue({ name: "Ice Storm" }) === "ice-storm");
check("shared.new", ["misfire", "sting-tension", "sting-reveal", "enemy-downed", "gatling-ellen-manor"].every((c) => A.sharedCue(c) === c));
const n = made.length; A.play("ricochet"); await new Promise((r) => setTimeout(r, 950)); /* results wait ~750 ms (0.3.75) */
check("play.alt", made.length === n + 1 && /ricochet(-alt-0\d)?\.mp3$/.test(made.at(-1).url));
/* master volume still scales */
A.setVolume(0.25); A.play("rifle");
check("master.volume", made.at(-1).volume <= 0.25 * 1.08 + 1e-9, String(made.at(-1).volume));

/* hooks */
const ex = read("assets/js/sheet-extras.js"), app = read("assets/js/app.js"), pt = read("assets/js/sheet-playtest.js"), v2 = read("dm/assets/js/v2.js");
check("hook.misfire", /else attackCue\("misfire"\)/.test(ex) && !/playOutcome\(\{ gun: true, id: g\.weapon, name: name \}, "miss"\)/.test(ex));
check("hook.unjamClean", /\? "unjam" : "clean"/.test(app));
check("hook.rechamber", (app.match(/play\("rechamber"\)/g) || []).length === 3);
check("hook.turn", /play\("turn"\)/.test(pt) && /play\("end-turn"\)/.test(pt) && /play\("turn"\)/.test(v2) && /play\("ui-back"\)/.test(v2));
check("hook.downed", /play\("enemy-downed"\)/.test(v2));
check("hook.creatorDice", /play\("roll-dice"\)/.test(read("assets/js/creator.js")));
check("dm.stingers", /DEFAULT_STINGERS = \[\{ event: "sting-tension"/.test(read("dm/assets/js/music-dm.js")));
const ver = JSON.parse(read("version.json"));
check("ver", /^\d+\.\d+\.\d+$/.test(ver.sheet) && /^\d+\.\d+\.\d+$/.test(ver.dmcc) && read("assets/js/sfx.js").includes("sfx.json?v=" + ver.sheet));
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR76 checks passed.");
process.exit(failures.length ? 1 : 0);

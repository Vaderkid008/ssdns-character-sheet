/**
 * SFX pack: files, weapon ids, cue map, and the call sites that play them.
 * Sheet and DMCC versions stay put; only the sfx.json cache query moves.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const map = JSON.parse(read("assets/sfx/sfx.json"));
const events = map.events || {};
const weapons = map.weapons || {};
check(!map._comment, "the merged map has no draft comment");

Object.keys(events).forEach((cue) => {
  const file = events[cue];
  const full = path.join(root, "assets/sfx", file);
  check(fs.existsSync(full), cue + " file exists: " + file);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  check(stat.size > 100, cue + " file is not empty");
  const fd = fs.openSync(full, "r");
  const head = Buffer.alloc(3);
  fs.readSync(fd, head, 0, 3, 0);
  fs.closeSync(fd);
  const tag = head.toString("hex");
  const audio = tag === "494433" || tag.startsWith("fff") || tag === "524946";
  check(audio, cue + " starts with an audio header, got " + tag);
});

const rules = read("assets/data/rules.js");
const store = read("dm/assets/data/store-items.json");
Object.keys(weapons).forEach((id) => {
  const cue = weapons[id];
  check(!!events[cue], id + " points at a real cue (" + cue + ")");
  const needle = '"id": "' + id + '"';
  check(rules.indexOf(needle) >= 0 || store.indexOf(needle) >= 0, id + " is a catalog weapon");
});

["dulls-rolling-block-rifle", "dull-co-rifle-musket", "lancaster-heavy-saddle-carbine", "henrietta-saddle-carbine", "dullards-light-carbine"].forEach((id) => {
  check(!weapons[id], id + " stays on the rifle gunshot");
  check(rules.indexOf('"id": "' + id + '"') >= 0, id + " still exists");
});

const version = JSON.parse(read("version.json"));
check(version.sheet === "0.3.70" && version.sheetBuild === "sheet-playtest-v0370", "sheet 0.3.55");
check(version.dmcc === "0.2.83" && version.dmccBuild === "dmcc-playtest-v0283", "dmcc 0.2.68");
check(read("assets/js/sfx.js").indexOf('sfx.json?v=0.3.70') >= 0, "the sound map cache query matches the sheet version");
check(read("assets/js/app.js").indexOf('APP_VERSION = "0.3.70"') >= 0, "the sheet banner is 0.3.55");

let fetched = "";
const sandbox = {
  window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, URLSearchParams, Promise, setTimeout,
  localStorage: { getItem: () => null, setItem: () => {} },
  document: { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null, body: null },
  location: { pathname: "/", search: "" },
  fetch: (url) => {
    fetched = String(url);
    return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(read("assets/sfx/sfx.json"))) });
  },
  Audio: function () { this.play = () => Promise.resolve(); this.addEventListener = () => {}; },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.window.dispatchEvent = () => {};
vm.runInNewContext(read("assets/js/sfx.js"), sandbox, { filename: "assets/js/sfx.js" });
await new Promise((resolve) => setTimeout(resolve, 30));
const audio = sandbox.SSDNSAudio;
check(fetched.indexOf("sfx.json?v=0.3.70") >= 0, "load fetches the bumped map");

check(audio.weaponCue({ gun: true, name: "Dullards Plinker" }) === "attack", "a Plinker without an id stays the rifle gunshot");
check(audio.weaponCue({ gun: true, id: "dullards-plinker-revolver", name: "Dullards Plinker" }) === "plinker", "the Plinker id plays plinker");
check(audio.weaponCue({ gun: true, id: "bison-big-fifty-buffalo-rifle" }) === "buffalo", "Big Fifty plays buffalo");
check(audio.weaponCue({ gun: true, id: "henrietta-repeating-rifle" }) === "lever-fire", "Henrietta repeater plays lever-fire");
check(audio.weaponCue({ gun: true, id: "dulls-rolling-block-rifle", name: "Dulls Rolling Block Rifle" }) === "attack", "the rolling block stays attack");
check(audio.weaponCue({ gun: true, id: "lancaster-lever-shotgun" }) === "lever-fire", "the lever shotgun is lever-fire");
check(audio.weaponCue({ gun: true, id: "pony-arms-chaosmaker-heavy" }) === "revolver", "a Chaosmaker plays revolver");
check(audio.weaponCue({ gun: true, id: "navy-army-ball-n-cap-revolver", sfx: "silenced" }) === "silenced", "an explicit sfx wins");
check(audio.weaponCue({ id: "buffalo-axe-greataxe", name: "Buffalo axe" }) === "whoosh", "the buffalo axe swings (its axe-hit plays on the hit, 0.3.56)");
check(audio.weaponCue({ name: "Machete (scimitar)", dmgType: "Slashing" }) === "slash", "a machete stays slash");
check(audio.weaponCue({ name: "Throwing spear (javelin)" }) === "spear-throw", "a named javelin plays the spear throw");
check(audio.weaponCue({ name: "Shortbow", group: "bow" }) === "twang", "a bow without an id stays twang");
check(audio.weaponCue({ id: "shortbow", name: "Shortbow", group: "bow" }) === "bow", "the shortbow id plays bow");
check(audio.weaponCue({ name: "Sledgehammer", dmgType: "Bludgeoning" }) === "thud", "a sledgehammer stays thud");
check(audio.weaponCue({ name: "Net" }) === "whoosh", "a net stays whoosh");

check(audio.reloadCue({ action: "Lever (tube)", group: "rifle", name: "Henrietta Repeating Rifle" }) === "reload-lever", "a lever gun reloads with the lever");
check(audio.reloadCue({ action: "Revolver", group: "pistol", name: "Dullards Plinker Revolver" }) === "reload-revolver", "a revolver reloads with the cylinder");
check(audio.reloadCue({ action: "Break-action", group: "shotgun", name: "Single-barrel Farm Shotgun" }) === "reload", "a break-action shotgun uses the plain reload");

check(audio.spellCue({ name: "Fireball", kind: "attack", calling: "pact-seeker" }) === "pactshot", "a Pact Seeker attack is pactshot");
check(audio.spellCue({ name: "Shocking Grasp", kind: "attack" }) === "electric", "Shocking Grasp is electric");
check(audio.spellCue({ name: "Lightning Bolt", kind: "attack", calling: "pact-seeker" }) === "lightning-ultimate", "big lightning wins over the pact");
check(audio.spellCue({ name: "Healing Word", kind: "heal", calling: "pact-seeker" }) === "heal", "a heal wins over the pact");
check(audio.spellCue({ name: "Light", kind: "utility" }) === "spellcast", "Light is a plain cast");
check(audio.spellCue({ name: "Misty Step" }) === "teleport", "Misty Step is teleport");

check(audio.sharedCue("revolver") === "revolver" && audio.sharedCue("lightning") === "lightning", "new attack cues can be shared");
check(audio.sharedCue("heal") === "" && audio.sharedCue("teleport") === "", "heal and teleport stay local");
check(audio.sharedCue("empty-click") === "" && audio.sharedCue("reload-lever") === "" && audio.sharedCue("reload-revolver") === "", "clicks and reloads stay local");

const app = read("assets/js/app.js");
const extras = read("assets/js/sheet-extras.js");
const v2 = read("dm/assets/js/v2.js");
check(app.indexOf('play("empty-click")') >= 0 && extras.indexOf('play("empty-click")') >= 0, "an empty chamber clicks");
check(app.indexOf("reloadCue") >= 0, "reload asks for the weapon's reload cue");
check(extras.indexOf("spellCueName()") >= 0 && extras.indexOf("rolled.attack) attackCue") >= 0, "sheet spells still share only attacks");
check(v2.indexOf('play("heal")') >= 0, "a DM heal plays heal");
check(v2.indexOf("rolled.attack) playTableSfx") >= 0, "DM spell share stays attack-only");
check(v2.indexOf('playTableSfx("spellcast")') >= 0, "an enemy spellcast is still shared by that name");

if (failures.length) {
  console.error(failures.join("\n"));
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("sfx pack ok (" + Object.keys(events).length + " cues, " + Object.keys(weapons).length + " weapons)");

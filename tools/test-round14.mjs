/**
 * Sheet 0.3.17 / DMCC 0.2.30: Plinker, settler languages, badge, dirty d4,
 * weapon cues, misfire automation, DM overrides, and medium spell text.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) { if (!cond) failures.push(msg); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function load(names) {
  const sandbox = {
    window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
    URL, URLSearchParams, Promise,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { readyState: "complete", addEventListener() {}, querySelectorAll: () => [], getElementById: () => null, body: null },
    location: { pathname: "/", search: "" },
    fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
    Audio: function () { this.play = () => Promise.resolve(); this.addEventListener = () => {}; }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  sandbox.window.dispatchEvent = () => {};
  names.forEach((rel) => vm.runInNewContext(read(rel), sandbox, { filename: rel }));
  return sandbox;
}

const rulesBox = load(["assets/data/rules.js"]);
const rules = rulesBox.SSDNS_RULES;
const guns = (rules.firearms || []).concat(rules.casterGuns || []);
const gun = (id) => guns.find((g) => g.id === id);
const plinker = gun("dullards-plinker-revolver");
check(plinker && plinker.tiers.light.damage === "1d4", "Plinker .22 damage is 1d4");
check(plinker && plinker.dirtyMisfire === "1–4", "Plinker dirtyMisfire is 1–4");
check(plinker && !plinker.rustyDamage && !plinker.rustyMisfire && !plinker.tiers.medium, "no Rusty flag and no Medium tier");
check(plinker.rifleRounds[".32 rimfire"].damage === "1d6", ".32 rimfire is 1d6");
check((plinker.rounds.light || []).indexOf(".22 LR") >= 0 && (plinker.rounds.light || []).indexOf(".32 rimfire") >= 0, "both Light rounds are listed");

const app = read("assets/js/app.js");
check(app.indexOf("w.dirtyMisfire") >= 0 && app.indexOf("longGun22") >= 0, "gun stats read dirtyMisfire and the long-gun .22 cap");
check(app.indexOf("IT BLOWS") < 0 && app.indexOf("rustyDamage") < 0, "the Rusty unjam path is gone");
check(app.indexOf("pay a gunsmith 500 ES") >= 0, "fouled pay-a-gunsmith option stays");
check(app.indexOf("10 minutes with gunsmith's tools or a gun cleaning kit") >= 0, "dirty clean wording");
check(app.indexOf("gunsmith repair, 500 ES and a day") >= 0, "ruined repair wording");
check(read("assets/js/misfire.js").indexOf("a short rest working on it with tinker's or gunsmith's tools") >= 0, "fouled rest wording");

const box = load(["assets/data/rules.js", "assets/js/misfire.js", "assets/js/sfx.js"]);
const M = box.SSDNSMisfire;
const clean = { dirty: false, misStreak: 0 };
let s = M.resolveShot(clean, { n1: 1, nat: 1, ceiling: 2 });
check(s.misfire && s.jammed && s.misStreak === 1 && !s.armD4, "a clean gun's first misfire is a jam");
s = M.resolveShot({ dirty: true, misStreak: 0 }, { n1: 3, nat: 3, ceiling: 4 });
check(s.jammed && s.misStreak === 1 && !s.armD4, "dirty gun, odd misfire is a plain jam");
s = M.resolveShot({ dirty: true, misStreak: 1 }, { n1: 2, nat: 2, ceiling: 4 });
check(s.armD4 && !s.jammed && s.misStreak === 2, "dirty gun, second misfire opens the d4");
s = M.resolveShot({ dirty: true, misStreak: 2 }, { n1: 12, nat: 12, ceiling: 4 });
check(!s.misfire && s.misStreak === 0, "a clean miss resets the streak");
s = M.resolveShot({ dirty: true, misStreak: 1 }, { n1: 1, n2: 2, nat: 2, ceiling: 4 });
check(s.both && s.fouled && s.misStreak === 0 && !s.armD4, "both dice in range foul the gun and reset the streak");
s = M.resolveShot({ dirty: true, misStreak: 0 }, { n1: 1, n2: 18, nat: 18, ceiling: 4 });
check(!s.misfire && s.misStreak === 0, "advantage keeps only the high die");
s = M.resolveShot({ dirty: true, misStreak: 0 }, { n1: 1, n2: 18, nat: 1, ceiling: 4 });
check(s.misfire && !s.both && s.misStreak === 1, "disadvantage keeps the low die");
s = M.resolveShot({ misStreak: 3, weapon: "lancaster-heavy-saddle-carbine" }, { spark: true, n1: 1, nat: 1, ceiling: 4 });
check(s.spark && !s.misfire && s.misStreak === 3, "a wild spark does not count as a misfire");
check(M.isRugged({ weapon: "lancaster-heavy-saddle-carbine" }) && !M.isRugged({ weapon: "dullards-plinker-revolver" }), "only the Lancaster Heavy is Rugged");
const face2 = M.d4Result(2, true);
check(face2.jammed && !face2.fouled, "Rugged turns a d4 2 into a jam");
check(M.d4Result(1, true).explode && M.d4Result(1, false).ruined, "a 1 still explodes, Rugged or not");
check(M.d4Result(2, false).fouled && M.d4Result(3, false).jammed && M.d4Result(4, false).again, "d4 faces 2, 3, and 4");
const dirtyOpts = M.cleanOptions({ dirty: true }).map((o) => o.label);
check(dirtyOpts.length === 1 && dirtyOpts[0].indexOf("10 minutes") >= 0, "dirty clean offers the kit method");
const foulOpts = M.cleanOptions({ fouled: true, dirty: true }).map((o) => o.id);
check(foulOpts.indexOf("fouled-pay") >= 0 && foulOpts.indexOf("fouled-rest") >= 0, "fouled clean keeps the 500 ES payment");
const ruined = M.applyClean({ ruined: true, dirty: true, fouled: true, misStreak: 4 }, "ruined-gunsmith");
check(ruined.ok && ruined.gun.ruined === false && ruined.gun.dirty === false && ruined.gun.misStreak === 0, "ruined repair comes back clean");
const over = M.applyOverride({ misStreak: 4, pendingD4: true, pendingD4Rolls: [2], dirty: true }, { cancelD4: true, fouled: true });
check(over.gun.pendingD4 === false && over.gun.misStreak === 0 && over.gun.fouled === true && over.gun.dirty === true, "DM override cancels the d4 and sets Fouled on its own");

const sfxSrc = read("assets/js/sfx.js");
check(sfxSrc.indexOf("pendingD4Rolls = planDirtyRolls()") >= 0 && sfxSrc.indexOf("persistDoc()") >= 0, "the d4 is planned and saved before the reveal");
check(sfxSrc.indexOf("broadcastD4") >= 0 && sfxSrc.indexOf('kind: "d4"') >= 0, "every d4 click is broadcast");
check(read("assets/js/sheet-extras.js").indexOf("g.misStreak = resolved.misStreak") >= 0, "the sheet keeps the streak the resolver returns");
check(app.indexOf('g.misStreak = 0') >= 0, "a weapon swap resets the streak");
check(app.indexOf("d4Pending") >= 0, "reload, clean, and swap check a pending d4");

const audio = load(["assets/js/sfx.js"]).SSDNSAudio;
check(audio.weaponCue({ gun: true, name: "Dullards Plinker" }) === "attack", "guns use the gunshot");
check(audio.weaponCue({ name: "Machete (scimitar)", dmgType: "Slashing" }) === "slash", "a scimitar is a slash, not a gunshot");
check(audio.weaponCue({ name: "Sledgehammer", dmgType: "Bludgeoning" }) === "thud", "a hammer is a thud");
check(audio.weaponCue({ name: "Shortbow", group: "bow" }) === "twang", "a bow is a twang");
check(audio.weaponCue({ name: "Net" }) === "whoosh", "anything else is a whoosh");
check(audio.weaponCue({ gun: true, name: "Special", sfx: "pactshot" }) === "pactshot", "a weapon sfx field overrides the map");
check(audio.sharedCue("slash") === "slash" && audio.sharedCue("whoosh") === "whoosh", "weapon cues can be shared at the table");

const sheet = read("index.html");
const dm = read("dm/index.html");
check(read("assets/js/table-ux.js").indexOf("id='badgeState'") >= 0, "the sheet paints a Lawman badge control");
check(read("dm/assets/js/dmcc.js").indexOf('id="dmBadge"') >= 0 && read("assets/js/dm-join.js").indexOf('case "badge"') >= 0, "the DMCC sets the badge through the inbox");
check(read("dm/assets/js/dmcc.js").indexOf('data-gun-op="misfire"') >= 0 && read("assets/js/dm-join.js").indexOf('payload.op === "misfire"') >= 0, "player-gun overrides go through the gun command");
check(read("dm/assets/js/v2.js").indexOf("data-mf-op") >= 0 && read("dm/assets/js/dmcc.js").indexOf("postDmAction") >= 0, "fight-row overrides log a DM action");
check(read("dm/assets/js/dmcc.js").indexOf('kind: "dm"') >= 0, "the override is written to tableFeed");

const banned = /\b(Orc|Orcish|Gnomish|Elvish|Dwarvish|Draconic|Infernal|Halfling|Goblin|Giant|Abyssal|Sylvan|Celestial|Undercommon|Primordial|Druidic)\b/i;
function languageFields(src) {
  const hits = [];
  const re = /"languages"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(src))) hits.push(m[1]);
  return hits;
}
const rulesLang = languageFields(read("assets/data/rules.js"));
const refLang = languageFields(read("assets/data/refcards.js"));
rulesLang.concat(refLang).forEach((line) => {
  check(!banned.test(line), "language field stays settler: " + line.slice(0, 80));
});
const playerText = read("assets/data/rules.js") + "\n" + read("assets/data/refcards.js");
check(!/\bcant\b|-cant\b|\bLingo\b/i.test(playerText.replace(/cantrip/gi, "")), "player-facing text has no Lingo or cant");
check(playerText.indexOf("Pathfinder's Code") >= 0 && playerText.indexOf("Card Sharp's Tells") >= 0, "the two renames are in the data");
check(playerText.indexOf("one extra language of your choice") >= 0 && playerText.indexOf("One of your choice") >= 0, "Demon Blood and Tinker grants");

const spellBox = load(["assets/data/rules.js", "assets/js/spell-fx.js", "assets/js/spell-cast.js"]);
const seen = new Set();
(spellBox.SSDNS_RULES.spellCast || []).forEach((row) => {
  if (!row || !row.name || seen.has(row.name)) return;
  seen.add(row.name);
  const text = spellBox.SSDNSSpellCast.describe(row.name, { spellDC: 14, spellAtk: 6, level: 5 });
  const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
  check(sentences >= 2, row.name + " has a medium description");
  if (row.dice && /\d+d\d+/.test(String(row.dice))) {
    const core = String(row.dice).replace(/\s/g, "").split("+")[0];
    check(text.replace(/\s/g, "").indexOf(core) >= 0, row.name + " shows " + row.dice);
  } else {
    check(/[.!?]/.test(text) && text.length > 40, row.name + " has an effect line");
  }
});
check(spellBox.SSDNSSpellCast.describe("Vicious Mockery", { spellDC: 15 }).indexOf("Tongue Lashing") >= 0, "the frontier name stays on the description");
check(spellBox.SSDNSSpellCast.describe("Fireball", { spellDC: 15 }).indexOf("8d6") >= 0, "Fireball keeps the sheet's damage");

if (failures.length) {
  console.error(failures.slice(0, 40).join("\n"));
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("ok round14 (" + seen.size + " spells)");

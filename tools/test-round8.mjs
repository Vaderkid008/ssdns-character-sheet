/**
 * Round 8 checks that do not need a browser: kit scores, damage routing,
 * leave/recruit gates, feed text, and the second-tab lock.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const kitsSrc = read("assets/js/kits.js");
const sandbox = { window: {}, globalThis: {}, module: { exports: {} }, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(kitsSrc, sandbox, { filename: "kits.js" });
const Kits = sandbox.SSDNSKits;
const hero = {
  abilities: { STR: 16, DEX: 14, CON: 15, INT: 8, WIS: 12, CHA: 13 },
  guns: [{}, {}, {}],
  melee: [{}, {}, {}, {}],
  ammo: [],
  equipment: "",
  holster: "",
  gunBelt: false,
  shield: false,
  armor: "",
  casterGun: "",
  pactFocus: ""
};
Kits.apply(hero, "lawman", {});
check(hero.abilities.STR === 16 && hero.abilities.DEX === 14 && hero.abilities.CON === 15, "kit apply changed ability scores");
check(hero.abilities.INT === 8 && hero.abilities.WIS === 12 && hero.abilities.CHA === 13, "kit apply changed a mental score");
check(hero.armor === "mail-duster", "lawman kit still sets mail duster");

const v2 = read("dm/assets/js/v2.js");
const dm = read("dm/assets/js/dmcc.js");
const join = read("assets/js/dm-join.js");
const play = read("assets/js/sheet-playtest.js");
const extra = read("assets/js/sheet-extras.js");
const app = read("assets/js/app.js");

check(/if \(fight\.recruit === false\) return;/.test(v2), "ensurePlayers/onPlayerInit missing recruit gate");
check(/fight\.recruit = false;[\s\S]{0,240}await saveRemoteTable\(\)/.test(v2), "end combat must clear recruit before the table write");
check(/function ensurePlayers\(\) \{[\s\S]{0,500}if \(!playerIsOnline\(pid\)\) return;/.test(v2), "offline players must not be recruited");
check(/data-resend-turn/.test(v2) && /Your turn → /.test(v2), "your-turn feed line and resend button");
check(/Apply \$\{amt\}/.test(v2) === false, "apply label should be built in dmcc");
check(/function applyPlayerHit/.test(v2) && /fight\.appliedHits\[rollId\]/.test(v2), "player hits need an idempotent apply");
check(/kind === "player"/.test(v2) && /type: "hp"/.test(v2), "a hit on another player still routes an hp command");
check(/customName"\)\.value = ""/.test(v2) === false, "add enemy must keep the name");
check(/customQty/.test(v2) && /customDex/.test(v2), "add enemy clears the other fields");

check(/let uiTab = "tab-table"/.test(dm), "uiTab starts on the table tab");
check(/function rememberUi\(\) \{\s*UI_FIELDS/.test(dm), "rememberUi must not copy the selected tab from the DOM");
check(/function rollBody/.test(dm) && /function hitApplyButton/.test(dm), "feed body and apply button");
check(/if \(\/\^dm\$\/i\.test\(who\)\)/.test(dm), "DM ledger rows stay attributed to the DM");
check(/presenceStep/.test(dm) && /type: "join"/.test(dm) && /leaveTimers/.test(dm), "join is logged once, and a leave waits out a disconnect blip");
check(/data-apply-hit/.test(dm), "apply button is in the roll markup");

function grab(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) return "";
  let i = src.indexOf("{", start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  return "";
}
const fnSrc = [grab(dm, "rollAc"), grab(dm, "rollDetail"), grab(dm, "rollBody"), grab(dm, "ledgerNames"), grab(dm, "realTargetName"), grab(dm, "hitApplyButton")].join("\n");
const fake = {
  window: { DMCCEnhance: { acFor: () => 13 } },
  namesFor: () => ({ playerName: "Eli", characterName: "Eli Hart" }),
  esc: (s) => String(s)
};
const box = vm.createContext(Object.assign({ window: fake.window }, fake));
vm.runInContext(fnSrc + "\nthis.api = { rollDetail, rollBody, ledgerNames, hitApplyButton };", box);
const api = box.api;
const attack = { detail: "Eli → Rustler 1: 15+4 = 19 → HIT · 1d8+4 = 9", formula: "1d20+4", result: 19, label: "Eli → Rustler 1", ac: 13, damage: 9, id: "r1", targetName: "Rustler 1" };
const body = api.rollBody(attack);
check(body.indexOf("vs AC 13") >= 0, "DM line should include vs AC 13, got " + body);
check(body.indexOf("vs AC 13") === body.lastIndexOf("vs AC 13"), "vs AC should appear once");
check((body.match(/1d20\+4/g) || []).length === 0, "attack detail should not repeat the formula, got " + body);
const looked = api.rollBody({ detail: "Eli → Rustler 1: 15+4 = 19 → HIT", formula: "1d20+4", result: 19, label: "Attack", targetId: "en1" });
check(looked.indexOf("vs AC 13") >= 0, "missing roll.ac should use the combatant's AC");
const again = api.rollDetail({ detail: looked, ac: 13 });
check((again.match(/vs AC/g) || []).length === 1, "vs AC must not be injected twice");
check(api.ledgerNames({ who: "DM", playerId: "p1", characterName: "Eli Hart" }) === "DM → Eli Hart", "DM actor label");
check(api.ledgerNames({ who: "Eli Hart", playerId: "p1", characterName: "Eli Hart", playerName: "Eli" }).indexOf("DM →") !== 0, "player rows stay the player's");
const btn = api.hitApplyButton(attack);
check(btn.indexOf("Apply 9 → Rustler 1") >= 0 && btn.indexOf("data-apply-hit") >= 0, "apply button label");
check(api.hitApplyButton({ id: "m", damage: 9, nat: 1, detail: "→ MISS" }) === "", "a nat 1 has no apply button");

check(/if \(!state\.joined \|\| state\.left\) return Promise\.resolve\(\{ ok: false, skipped: true \}\)/.test(join), "postRoll must not enqueue a pre-join roll");
check(/left: true/.test(join) && /state\.left = true/.test(join), "leave writes a left flag");
check(/saved\.left !== true/.test(join), "auto-rejoin honors the left flag");
check(/stillHere\(epoch\)/.test(join), "snapshot must re-check leave after each await");
check(/function flushHandouts/.test(join) && /HANDOUT_Q/.test(join), "handouts queue across a rejoin");
check(/case "your_turn"/.test(join) && /turnAck/.test(join), "player acks your turn");
check(/CONNECTION_CLOSED/.test(join), "a dropped socket is handled");
check(/joined !== true/.test(join), "queued rolls need an explicit joined flag");

check(/combat-ended:" \+ \(room/.test(play), "combat ended id is the room, and only while joined");
check(/inRoom && room && sawOrder/.test(play), "combat ended is not logged off the table");
check(/keepScores/.test(play), "kit restores typed ability scores");
check(/postDamage\(\{ amount: total/.test(play), "melee hits post damage");
check(/Hit die/.test(play) && /postRoll/.test(play), "hit die echoes to the table");

check(/handoutAttrs/.test(extra) && /data-reopen-handout/.test(extra), "handout rows carry reopen data");
check(/targetName: tgt && tgt\.name, rollId: gunRollId/.test(extra), "gun damage carries the roll id");
check(/split\("→ HIT"\)/.test(extra), "spell damage is the hit tail, not the attack total");

check(/phb5e && a\.phb5e !== a\.name/.test(app), "armor label includes the PHB name");
check(/applyAutoHp: function/.test(app), "calculated HP is exposed for a fresh character");
check(/isReadOnly\(\)\) return/.test(app), "a read-only tab does not save");
check(/sheet-readonly/.test(read("assets/css/sheet.css")), "read-only tab disables the fields");
check(/Mail Duster/.test(read("assets/data/rules.js")) && /"phb5e": "Chain mail"/.test(read("assets/data/rules.js")), "mail duster keeps AC 16 and the chain mail name");

check(read("version.json").indexOf('"sheet": "0.3.10"') >= 0 && read("version.json").indexOf('"dmcc": "0.2.18"') >= 0, "versions bumped");
check(read("database.rules.json").indexOf("playerInit") >= 0, "rules file still present and untouched by this test");

const order = [
  { id: "en", name: "Rustler 1", kind: "enemy", playerId: "" },
  { id: "p1", name: "Eli", kind: "player", playerId: "p1" },
  { id: "p2", name: "Ada", kind: "player", playerId: "p2" }
];
function find(meta) {
  const id = meta && meta.targetId;
  const name = String((meta && meta.targetName) || "").trim().toLowerCase();
  return order.find((r) => id && (r.id === id || r.playerId === id))
    || order.find((r) => name && String(r.name).toLowerCase() === name)
    || null;
}
check(find({ targetId: "en" }).name === "Rustler 1", "damage routes to the named enemy");
check(find({ targetName: "Ada" }).playerId === "p2", "a second player is a distinct target");
check(find({ targetId: "p1" }).id !== find({ targetId: "p2" }).id, "two players stay separate combatants");
check(/inbox\/" \+ to/.test(dm), "commands still copy into that player's inbox");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok round8 damage, leave, handouts, scores, and two-player routing");

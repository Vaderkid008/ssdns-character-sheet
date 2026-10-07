/**
 * Table attack cues: which events may be shared, and that the sender
 * does not play their own echo. Skill checks and generic dice stay quiet.
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
function fnBody(src, name) {
  const re = new RegExp("(?:async )?function " + name + "\\(");
  const m = re.exec(src);
  if (!m) return "";
  let depth = 0;
  let started = false;
  for (let i = m.index; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") { depth++; started = true; }
    else if (ch === "}") {
      depth--;
      if (started && depth === 0) return src.slice(m.index, i + 1);
    }
  }
  return "";
}

const played = [];
const sandbox = {
  console,
  Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  encodeURIComponent,
  URL,
  URLSearchParams,
  Promise,
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
  fetch: function () {
    return Promise.resolve({
      ok: true,
      json: function () { return Promise.resolve({ events: { attack: "attack.mp3" } }); }
    });
  },
  Audio: function Audio() {
    played.push("audio");
    this.play = function () { return Promise.resolve(); };
    this.addEventListener = function () {};
  },
  localStorage: {
    getItem: function () { return null; },
    setItem: function () {}
  },
  document: {
    readyState: "complete",
    addEventListener: function () {},
    querySelectorAll: function () { return []; },
    getElementById: function () { return null; },
    body: null
  },
  location: { pathname: "/", search: "" }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.window.dispatchEvent = function () {};
vm.runInNewContext(read("assets/js/sfx.js"), sandbox, { filename: "assets/js/sfx.js" });
const AudioApi = sandbox.SSDNSAudio;

check(AudioApi && typeof AudioApi.sharedCue === "function", "sharedCue is exported");
check(AudioApi.sharedCue("attack") === "attack", "attack may be shared");
check(AudioApi.sharedCue("jam") === "jam", "jam may be shared");
check(AudioApi.sharedCue("spellshot") === "spellshot", "spellshot may be shared");
check(AudioApi.sharedCue("pactshot") === "pactshot", "pactshot may be shared");
check(AudioApi.sharedCue("spellcast") === "spellcast", "spellcast may be shared");
check(AudioApi.sharedCue("attack", "dm", "player") === "attack", "another client hears the cue");
check(AudioApi.sharedCue("attack", "player-1", "player-1") === "", "the sender skips their own echo");
check(AudioApi.sharedCue("jam", "player-1", "player-1") === "", "the sender skips their own jam");
check(AudioApi.sharedCue("reward") === "", "reward is not an attack cue");
check(AudioApi.sharedCue("reload") === "", "reload is not an attack cue");
check(AudioApi.sharedCue("holster") === "", "holster is not an attack cue");
check(AudioApi.sharedCue("turn") === "", "turn is not an attack cue");
check(AudioApi.sharedCue("check") === "", "a skill check is not an attack cue");
check(AudioApi.sharedCue("") === "", "a blank event is ignored");
check(AudioApi.sharedCue("attack", "player-1", "") === "attack", "a missing self id still plays for listeners");

AudioApi.setMuted(true);
AudioApi.play("attack");
check(played.length === 0, "Sound off stays silent");
AudioApi.setMuted(false);
AudioApi.setVolume(0);
AudioApi.play("attack");
check(played.length === 0, "volume 0 stays silent");

const sheet = read("assets/js/sheet-extras.js");
const gun = fnBody(sheet, "rollGun");
const spell = fnBody(sheet, "castSpellAttackNow");
const checkRoll = fnBody(sheet, "rollCheck");
const initRoll = fnBody(sheet, "rollInitiative");
check(gun.indexOf('attackCue("jam")') >= 0, "a gun misfire shares jam");
check(gun.indexOf('attackCue("attack")') >= 0, "a gun attack shares attack");
check(spell.indexOf("attackCue(spellCueName())") >= 0, "a spell attack shares its cue");
check(spell.indexOf("rolled.attack) attackCue") >= 0, "only attack spells are shared");
check(checkRoll.indexOf("attackCue") < 0, "ability and skill checks do not share a cue");
check(initRoll.indexOf("attackCue") < 0, "initiative does not share a cue");

const playtest = read("assets/js/sheet-playtest.js");
const melee = fnBody(playtest, "rollMelee");
check(melee.indexOf('attackCue("attack")') >= 0, "a melee attack shares attack");

const join = read("assets/js/dm-join.js");
check(join.indexOf("function postSfx") >= 0, "players can post a table cue");
check(join.indexOf('kind: "sfx"') >= 0, "player cues use the table feed");
check(join.indexOf('row.kind === "sfx"') >= 0, "players play incoming table cues");
check(fnBody(join, "handleCommand").indexOf("sharedCue(payload.event, cmd.from, state.uid)") >= 0, "command echoes skip the sender");
check(fnBody(join, "handleCommand").indexOf("payload.sfx") < 0, "the hit verdict does not play a second cue");

const v2 = read("dm/assets/js/v2.js");
check(fnBody(v2, "enemyStrike").indexOf('playTableSfx("attack")') >= 0, "an enemy strike shares attack");
check(fnBody(v2, "cardStrike").indexOf('playTableSfx("jam")') >= 0, "an enemy gun misfire shares jam");
check(fnBody(v2, "cardStrike").indexOf('playTableSfx("attack")') >= 0, "an enemy weapon roll shares attack");
check(fnBody(v2, "cardCast").indexOf('playTableSfx("spellcast")') >= 0, "an enemy spell attack shares spellcast");
check(fnBody(v2, "rollGunAttack").indexOf('playTableSfx("attack")') >= 0, "DM weapon roll shares attack");
check(fnBody(v2, "rollGunAttack").indexOf('playTableSfx("jam")') >= 0, "DM weapon misfire shares jam");
check(fnBody(v2, "rollSpell").indexOf("rolled.attack) playTableSfx") >= 0, "DM spell share is attack-only");
check(fnBody(v2, "cardCheck").indexOf("playTableSfx") < 0, "enemy checks stay quiet");
check(fnBody(v2, "cardDice").indexOf("playTableSfx") < 0, "enemy plain dice stay quiet");
check(fnBody(v2, "rollAllEnemies").indexOf("playTableSfx") < 0, "initiative rolls stay quiet");
const shortcuts = fnBody(v2, "shortcuts");
check(shortcuts.indexOf('type: "sfx"') >= 0 && shortcuts.indexOf('const key = "attack"') >= 0, "Alt+Shift+S still sends attack");
check(fnBody(v2, "playTableSfx").indexOf("DM.state.demo") >= 0, "demo does not push a cue");

const dmcc = read("dm/assets/js/dmcc.js");
check(fnBody(dmcc, "doDmRoll").indexOf("playTableSfx") < 0 && fnBody(dmcc, "doDmRoll").indexOf('type: "sfx"') < 0, "the header d20 is not an attack");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("table sfx ok");

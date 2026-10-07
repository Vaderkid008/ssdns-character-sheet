/**
 * Round 12: stay in the room, invite hash, undone applies, outlaw weapons,
 * save spells, empty guns, ammo tiers, and attack buttons.
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
function load(names) {
  const sandbox = { window: {}, console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, URL, encodeURIComponent };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  names.forEach((rel) => vm.runInNewContext(read(rel), sandbox, { filename: rel }));
  return sandbox;
}

const box = load([
  "assets/js/apply-guard.js",
  "assets/data/rules.js",
  "assets/js/spell-cast.js",
  "assets/js/kits.js",
  "assets/js/creator.js"
]);
const Applied = box.SSDNSApplied;
const Cast = box.SSDNSSpellCast;
const Creator = box.SSDNSCreator;

check(Applied.staysInRoom(true, ""), "a live session ignores a blank lobby reason");
check(Applied.staysInRoom(true, "join"), "a player join cannot drop the DM to the lobby");
check(Applied.staysInRoom(true, "turn"), "a turn change cannot drop the DM to the lobby");
check(Applied.staysInRoom(true, "reconnect"), "a reconnect cannot drop the DM to the lobby");
check(!Applied.staysInRoom(true, "leave") && !Applied.staysInRoom(true, "end") && !Applied.staysInRoom(true, "new"), "Leave, End, and New may return to the lobby");
check(!Applied.staysInRoom(false, "join"), "the lobby is available before a session opens");
check(Applied.resumeInsteadOfLobby({ code: "DUST-4307" }), "a reload with an open room resumes it");
check(!Applied.resumeInsteadOfLobby(null), "a fresh tab still offers the lobby");

const joined = Applied.presenceStep({ phase: "new" }, true);
check(joined.log === "join" && joined.phase === "online" && !joined.arm, "first online presence is a join");
const blip = Applied.presenceStep(joined, false);
check(blip.log === "" && blip.arm && blip.pending && blip.phase === "online", "a disconnect blip waits before logging a leave");
const back = Applied.presenceStep(blip, true);
check(back.log === "" && back.cancel && !back.pending, "reconnecting inside the wait logs nothing");
const gone = Applied.presenceLeave();
check(gone.log === "leave" && gone.phase === "offline", "a leave is logged only after the wait");
const again = Applied.presenceStep(gone, true);
check(again.log === "rejoin", "a real return after the wait is a rejoin");
check(Applied.PRESENCE_LEAVE_MS >= 30000, "leave debounce is at least 30 seconds");
check(read("dm/assets/js/v2.js").indexOf("turnGate") >= 0 && read("dm/assets/js/v2.js").indexOf("e.repeat") >= 0, "enemy turns cannot advance twice in one moment");
check(read("dm/assets/js/v2.js").indexOf("data-init-fled") >= 0 && read("dm/assets/js/v2.js").indexOf("Removed ") >= 0, "fled stays on the list and remove confirms");
check(read("assets/js/dm-join.js").indexOf("payload.absolute") >= 0, "a DM HP edit sets an absolute value");

const invite = Applied.sheetInviteUrl("https://vaderkid008.github.io/ssdns-character-sheet/dm/", "dust-4307");
check(invite.indexOf("?room=DUST-4307") >= 0 && invite.indexOf("#room=DUST-4307") >= 0, "invite keeps the code in the query and the hash, got " + invite);

const mem = { bag: {} };
const storage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(mem.bag, k) ? mem.bag[k] : null; },
  setItem(k, v) { mem.bag[k] = String(v); }
};
check(Applied.claim("DUST", "hit-9", storage), "apply claims once");
check(Applied.takeUndo("DUST", "hit-9", storage), "undo marks the hit");
check(Applied.undone("DUST", "hit-9", storage), "undone state is stored");
check(!Applied.claim("DUST", "hit-9", storage), "a reload cannot apply an undone hit again");
check(Applied.settled("DUST", "hit-9", storage), "undone hits stay settled");

const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const outlaw = beasts.filter((b) => b.id === "outlaw")[0];
check(outlaw.attackList.map((a) => a.name).join(",") === "Revolver,Bowie", "outlaw weapons are Revolver and Bowie");
check(outlaw.attackList[0].damage === "1d8+1" && outlaw.attackList[0].range === "20/60" && outlaw.attackList[0].capacity === 6 && outlaw.attackList[0].misfire === 1, "revolver keeps the canon stats");
check(outlaw.attackList[1].damage === "1d6+1", "bowie damage is 1d6+1");
const stale = [{ id: "outlaw", name: "Outlaw", attackList: [{ name: "Scimitar", bonus: 3, damage: "1d6+1" }], attacks: "Scimitar" }];
const mergedSrc = read("dm/assets/js/v2.js");
check(mergedSrc.indexOf("attackList: b.attackList") >= 0, "bestiary merge keeps the file attack list");

check(Applied.attackButtonLabel({ name: "Revolver", toHit: 3 }) === "Revolver +3", "compact button uses the attack name and bonus");
check(Applied.attackButtonLabel({ name: "Bowie", bonus: 3 }) === "Bowie +3", "bonus field still labels the button");
check(mergedSrc.indexOf("compactAttackButtons") >= 0 && mergedSrc.indexOf("data-row-atk") >= 0, "the fight row renders one button per attack");

const mockery = Cast.lookup("Vicious Mockery");
check(mockery && mockery.kind === "save" && mockery.save === "WIS" && mockery.dice === "1d4", "Vicious Mockery is a Wisdom save, got " + JSON.stringify(mockery && { kind: mockery.kind, save: mockery.save, dice: mockery.dice }));
check(mergedSrc.indexOf("askSaveSpell") >= 0 && mergedSrc.indexOf("requestPlayerSave") >= 0, "save spells and riders ask the player");

check(Applied.gunEmpty({ loaded: 0, chambers: ["", ""] }), "an empty cylinder cannot fire");
check(!Applied.gunEmpty({ loaded: 2 }), "a loaded gun can fire");
check(read("assets/js/sheet-extras.js").indexOf("Empty: reload") >= 0, "empty guns toast instead of rolling");

check(Applied.cartridgePoolLabel(".22 LR") === "Cartridges (Light)", ".22 LR shares the light pool");
check(Applied.cartridgePoolLabel(".32 Long") === "Cartridges (Light)", ".32 Long shares the light pool");
check(Applied.cartridgeTier("Light") === "Light", "the kit tier name stays Light");

check(!Applied.showHitApply({ id: "r", damage: 5, detail: "no target" }), "untargeted rolls hide Apply");
check(!Applied.showHitApply({ id: "r", damage: 5, targetId: "p", outOfTurn: true }), "out-of-turn rolls hide Apply");
check(Applied.showHitApply({ id: "r", damage: 5, targetId: "p", targetName: "Moss" }), "a targeted hit can Apply");

const chat = Applied.dedupeById([{ id: "m1", text: "Howdy" }, { id: "m1", text: "Howdy" }, { id: "m2", text: "Again" }]);
check(chat.length === 2 && chat[1].id === "m2", "chat render drops a repeated message id");

const queued = Applied.enqueueToast([{ msg: "Old" }, { msg: "Older" }], { msg: "Old" }, 3);
check(queued.length === 2, "a repeated toast is coalesced");
const capped = Applied.enqueueToast([{ msg: "A" }, { msg: "B" }, { msg: "C" }], { msg: "D" }, 3);
check(capped.length === 3 && capped[0].msg === "B" && capped[2].msg === "D", "the toast queue stays at three");

const steps = Creator.stepsFor({ calling: "gunslinger" });
check(steps.indexOf("style") > steps.indexOf("calling"), "the wizard asks a gunslinger for a fighting style");
check(Creator.errorsFor({ calling: "gunslinger", fightingStyle: "", name: "Ada", lineage: "human", background: "folk-hero", skills: [], scores: { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 }, method: "custom", kit: {}, level: 1 }, "style").length > 0, "a gunslinger cannot skip the style");

check(read("dm/assets/js/dmcc.js").indexOf('await put("meta"') >= 0, "a moved room writes meta before its children");
check(read("database.rules.json").indexOf("meta/dmUid').val() === auth.uid && (!data.exists() || !newData.exists())") >= 0, "the DM can copy chat into the new room");
check(read("version.json").indexOf('"sheet": "0.3.13"') >= 0 && read("version.json").indexOf('"dmcc": "0.2.27"') >= 0, "versions");
check(read("index.html").indexOf("favicon.ico") < 0 && read("dm/index.html").indexOf("favicon.ico") < 0, "favicon no longer 404s on a missing ico");
check(read("dm/index.html").indexOf('id="headerRoll"') >= 0, "the header has a dice roller");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok round 12");

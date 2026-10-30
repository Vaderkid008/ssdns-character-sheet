/**
 * N73 — a linked PC still gets the leave-reach card when the token view
 * lost reactorPlayerId. The DM waits on one surface. Enemies still Attack/Pass.
 *   node tools/test-n73-player-oa.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", runScripts: "dangerously" });
const w = dom.window;
w.eval(read("assets/js/spell-fx.js"));
w.eval(read("assets/js/react-prompt.js"));
const R = w.SSDNSReact;

const order = [
  { id: "uid_wizard", playerId: "uid_wizard", kind: "player", name: "WIZARD" },
  { id: "uid_bo", playerId: "uid_bo", kind: "player", name: "Bo", mapTokenId: "tok_bo" },
  { id: "en_abi", kind: "enemy", name: "Abigail Ellen" }
];

check("link.owner", R.linkedPlayerId({ ownerUid: "uid_wizard", kind: "npc" }, order) === "uid_wizard");
check("link.sheet", R.linkedPlayerId({ sheetId: "uid_wizard", kind: "player" }, order) === "uid_wizard");
check("link.combatant", R.linkedPlayerId({ combatantId: "uid_wizard", kind: "player" }, order) === "uid_wizard");
check("link.ply", R.linkedPlayerId({ id: "ply_uid_wizard", kind: "player" }, order) === "uid_wizard");
check("link.mapToken", R.linkedPlayerId({ id: "tok_bo", kind: "npc" }, order) === "uid_bo");
check("link.name", R.linkedPlayerId({ id: "tok_wizard", kind: "player", label: "WIZARD", name: "WIZARD" }, order) === "uid_wizard");
check("link.clone", R.linkedPlayerId({ id: "tok_copy", kind: "player", label: "WIZARD*", name: "WIZARD" }, order) === "");
check("link.enemyName", R.linkedPlayerId({ id: "tok_bandit", kind: "npc", label: "WIZARD", name: "WIZARD" }, order) === "");
check("link.twoNames", R.linkedPlayerId({ id: "tok_x", kind: "player", label: "Sam" }, [
  { id: "a", playerId: "a", kind: "player", name: "Sam" },
  { id: "b", playerId: "b", kind: "player", name: "Sam" }
]) === "");

const broken = {
  kind: "leave",
  dmRuns: true,
  playerOwns: false,
  reactorPlayerId: "",
  reactorKind: "enemy",
  reactorId: "tok_wizard",
  reactorName: "WIZARD",
  text: "Abigail Ellen is leaving your reach — Opportunity attack?",
  mirrorText: "WIZARD can take an opportunity attack as Abigail Ellen leaves reach.",
  spells: [
    { name: "Fire Bolt", level: 0 },
    { name: "Shocking Grasp", level: 0 },
    { name: "Witch Bolt", level: 0 }
  ]
};
const wizardRow = { id: "uid_wizard", playerId: "uid_wizard", kind: "player", name: "WIZARD", dmActsAs: false };
const stamped = R.stampLeaveOwner(broken, wizardRow);
check("stamp.pc", stamped.playerOwns === true && stamped.dmRuns === false && stamped.reactorKind === "player" && stamped.reactorPlayerId === "uid_wizard", JSON.stringify(stamped));

R.openMirror(Object.assign({}, broken, stamped, {
  hideAttack: true,
  spells: [],
  mirrorText: "WIZARD is deciding on an opportunity attack…"
}));
let mirror = w.document.querySelector("[data-react-mirror]");
let modal = w.document.querySelector("[data-react-modal]");
check("wait.oneSurface", mirror && !modal && mirror.querySelector("[data-react-choice=cancel]") && !mirror.querySelector("[data-react-choice=attack]") && !mirror.querySelector("[data-react-choice=pass]") && !mirror.querySelector("[data-react-choice=cast]") && /deciding on an opportunity attack/.test(mirror.textContent));
R.close();

R.openMirror(Object.assign({}, broken, {
  hideAttack: false,
  playerOwns: false,
  dmRuns: true,
  mirrorText: "WIZARD is deciding on an opportunity attack…"
}));
mirror = w.document.querySelector("[data-react-mirror]");
check("wait.hidesAttack", mirror && !mirror.querySelector("[data-react-choice=attack]") && !mirror.querySelector("[data-react-choice=cast]") && !mirror.querySelector("[data-react-choice=pass]") && !!mirror.querySelector("[data-react-choice=cancel]"));
R.close();

const dmRun = R.stampLeaveOwner(broken, Object.assign({}, wizardRow, { dmActsAs: true }));
check("stamp.dmRun", dmRun.dmRuns === true && dmRun.playerOwns === false && dmRun.reactorPlayerId === "uid_wizard", JSON.stringify(dmRun));
R.openMirror(Object.assign({}, broken, dmRun, {
  kicker: "Opportunity attack",
  mirrorText: "WIZARD can take an opportunity attack as Abigail Ellen leaves reach."
}));
mirror = w.document.querySelector("[data-react-mirror]");
check("dmRun.attack", mirror && mirror.querySelector("[data-react-choice=attack]") && mirror.querySelector("[data-react-choice=pass]") && !/deciding on an opportunity attack/.test(mirror.textContent));
R.close();

const enemy = R.stampLeaveOwner({
  kind: "leave",
  dmRuns: true,
  playerOwns: false,
  reactorKind: "enemy",
  reactorName: "Abigail Ellen"
}, { id: "en_abi", kind: "enemy", name: "Abigail Ellen" });
check("stamp.enemy", enemy.dmRuns === true && enemy.playerOwns === false && !enemy.reactorPlayerId, JSON.stringify(enemy));
R.openMirror(Object.assign({
  kind: "leave",
  kicker: "Opportunity attack",
  choice: "attack",
  attackLabel: "Attack",
  dmRuns: true,
  playerOwns: false,
  mirrorText: "Abigail Ellen can take an opportunity attack as WIZARD leaves reach."
}, enemy));
mirror = w.document.querySelector("[data-react-mirror]");
check("enemy.attack", mirror && mirror.querySelector("[data-react-choice=attack]") && mirror.querySelector("[data-react-choice=pass]"));
R.close();

const kept = R.stampLeaveOwner({
  kind: "leave",
  dmRuns: false,
  playerOwns: true,
  reactorKind: "player",
  reactorPlayerId: "uid_wizard"
}, null);
check("stamp.keep", kept.playerOwns === true && kept.dmRuns === false && kept.reactorPlayerId === "uid_wizard");

const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const join = read("assets/js/dm-join.js");
const lock = read("assets/js/turn-lock.js");
const prompt = read("assets/js/react-prompt.js");
const waitFn = v2.slice(v2.indexOf("function openPlayerWait"), v2.indexOf("function cancelPendingOa"));
const present = v2.slice(v2.indexOf("function presentReact"), v2.indexOf("function castReactOffer"));
check("src.wait", waitFn.includes("hideAttack: true") && waitFn.includes("spells: []") && waitFn.includes("dmRuns: false") && waitFn.includes("is deciding on an opportunity attack") && !waitFn.includes("openModal") && waitFn.includes("pushReactPrompt"));
check("src.present", present.includes("openPlayerWait(view, handler)") && present.includes("leavePlayerOwns(view) && !view.approving") && present.includes("function openPlayerWait") === false);
check("src.map", map.includes("R.linkedPlayerId") && map.includes("card.kind === 'pc'") && map.includes("prevTok.ownerUid") && map.includes("playerTokenId(row.playerId || row.id)"));
check("src.join", join.includes("view.playerOwns || !view.dmRuns") && join.includes("view.dmRuns = false"));
check("src.manualChip", lock.includes("function askOa") && lock.includes("data-tl-oa"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("stampLeaveOwner") && !read("assets/data/rules.js").includes("0.3.169") && !read("database.rules.json").includes("0.3.169") && prompt.includes("function stampLeaveOwner") && prompt.includes("function linkedPlayerId"));
const ver = JSON.parse(read("version.json"));
check("src.versions", ver.sheet === "0.3.169" && ver.dmcc === "0.2.182" && ver.sheetBuild === "sheet-playtest-v03169" && ver.dmccBuild === "dmcc-playtest-v02182", JSON.stringify(ver));
check("src.banners", read("assets/js/app.js").includes('APP_VERSION = "0.3.169"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.182"'));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nn73 ok");

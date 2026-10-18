/**
 * DM fire is one command. The player sheet spends and resolves the misfire.
 * Both cards paint the sheet's chamber strings. TEST Jammer is debug-only.
 *   node tools/test-map-fire-source.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
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

const PERC = "k:percussion::medium";
const six = () => [PERC, PERC, PERC, PERC, PERC, PERC];
const rules = read("assets/data/rules.js");
const appSrc = read("assets/js/app.js");
const v2src = read("dm/assets/js/v2.js");
const joinSrc = read("assets/js/dm-join.js");
const gunOpts = fnBody(appSrc, "gunOptions");
const attackSrc = v2src.slice(v2src.indexOf("async attack(detail)"), v2src.indexOf("async cast(detail)"));
check("rules.clean", !rules.includes("test-jammer") && !rules.includes("TEST Jammer"));
check("catalog.clean", gunOpts.includes("R.firearms") && !gunOpts.includes("test-jammer") && !gunOpts.includes("SSDNSTestJammer"));
check("grant.src", fnBody(appSrc, "grantTestGun").includes(PERC) && fnBody(appSrc, "grantTestGun").includes("jam.capacity"));
check("join.test", joinSrc.includes('payload.op === "test-gun"') && joinSrc.includes("grantTestGun"));
check("sheet.misfire", read("assets/js/sheet-extras.js").includes("SSDNSMisfire.resolveShot") && read("assets/js/sheet-extras.js").includes("catalogWeapon"));
check("dm.testing", v2src.includes("Give TEST Jammer") && v2src.includes("Make Dirty") && v2src.includes("debug=1") && v2src.includes('op: "test-gun"'));
check("dm.onefire", attackSrc.indexOf('op: "fire"') >= 0 && attackSrc.indexOf('op: "fire"') < attackSrc.indexOf("cardStrike") && !attackSrc.includes("gun_event") && !attackSrc.includes('op: "set"'));

const jammerBox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array
};
jammerBox.globalThis = jammerBox;
jammerBox.window = jammerBox;
vm.createContext(jammerBox);
vm.runInContext(read("assets/js/misfire.js"), jammerBox, { filename: "misfire.js" });
vm.runInContext(read("assets/js/test-jammer.js"), jammerBox, { filename: "test-jammer.js" });
const M = jammerBox.SSDNSMisfire;
const jam = jammerBox.SSDNSTestJammer.weapon();
check("jammer.name", jam.name.includes("TEST") && jam.id === "test-jammer" && jam.debug === true && jam.capacity === 6 && jam.ammo === "percussion");
check("jammer.ceiling", jam.tiers.medium.misfire === "1–20");
const straight = M.resolveShot({ misStreak: 0 }, { n1: 15, nat: 15, ceiling: 20 });
check("jammer.straight", straight.misfire === true && straight.jammed === true && straight.misStreak === 1 && straight.armD4 === false);
const spark = M.resolveShot({ misStreak: 2 }, { n1: 1, nat: 1, ceiling: 20, spark: true });
check("jammer.spark", spark.misfire === false && spark.misStreak === 2 && spark.jammed === false);
const both = M.resolveShot({ misStreak: 3, capacity: 6 }, { n1: 8, n2: 19, nat: 8, ceiling: 20 });
check("jammer.both", both.misfire === true && both.armD4 === true && both.fouled === false && both.jammed === false && both.misStreak === 4);
const d4 = M.resolveShot({ misStreak: 1, dirty: true, capacity: 6 }, { n1: 4, nat: 4, ceiling: 20 });
check("jammer.d4", d4.misfire === true && d4.jammed === true && d4.armD4 === false && d4.misStreak === 2);

const commands = [];
const rolls = [];
const els = {};
const sandbox = {
  console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array,
  URL, encodeURIComponent, Promise, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
const stored = {};
sandbox.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null; },
  setItem(k, v) { stored[k] = String(v); }
};
sandbox.document = {
  getElementById() { return null; },
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() {
    return {
      className: "", innerHTML: "", dataset: {},
      addEventListener() {},
      querySelector() { return { addEventListener() {} }; },
      querySelectorAll() { return []; },
      setAttribute() {}
    };
  },
  body: { appendChild() {}, classList: { contains() { return false; }, add() {}, remove() {} } },
  activeElement: null
};
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let seq = 0;
sandbox.DMCC = {
  $: (sel) => (Object.prototype.hasOwnProperty.call(els, sel) ? els[sel] : null),
  $$: () => [],
  esc,
  state: { players: {}, ledger: [], rolls: [], demo: false, roomCode: "DUST", uid: "dm", db: null },
  toast() {},
  uid(p) { seq += 1; return (p || "id") + seq; },
  guardFocus(fn) { if (fn) fn(); },
  parseDice() { return { total: 4, detail: "4" }; },
  pushCommand(cmd) { commands.push(JSON.parse(JSON.stringify(cmd))); return Promise.resolve(); },
  pushRoll(roll) { rolls.push(roll); return Promise.resolve(); },
  pushLedger() { return Promise.resolve(); },
  renderPlayers() {}
};
sandbox.state = sandbox.DMCC.state;
sandbox.$ = sandbox.DMCC.$;
sandbox.renderPlayers = function () {};
sandbox.openDetail = function () {};
vm.createContext(sandbox);
vm.runInContext(read("assets/js/misfire.js"), sandbox, { filename: "misfire.js" });
vm.runInContext(read("assets/js/test-jammer.js"), sandbox, { filename: "test-jammer.js" });
vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
vm.runInContext(read("assets/js/ammo-display.js"), sandbox, { filename: "ammo-display.js" });
vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
vm.runInContext(fnBody(read("dm/assets/js/dmcc.js"), "demoGunAt") + "\n" + fnBody(read("dm/assets/js/dmcc.js"), "grantDemoTestGun") + "\n" + fnBody(read("dm/assets/js/dmcc.js"), "applyDemoGun") + "\nDMCC.applyDemoGun = applyDemoGun;\n", sandbox, { filename: "applyDemoGun.js" });
const v2 = v2src.replace(
  /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
  "\nglobalThis.__fight = { setOrder: function (rows) { fight.order = rows || []; }, syncPlayers: syncPlayerVitals, rollGunAttack: rollGunAttack };\n"
);
vm.runInContext(v2, sandbox, { filename: "v2.js" });

const chambers = six();
const snapGun = {
  name: "Navy / Army Ball n Cap Revolver",
  weapon: "navy-army-ball-n-cap-revolver",
  action: "Percussion revolver (slow)",
  ammo: "percussion",
  tier: "medium",
  capacity: 6,
  loaded: 6,
  index: 1,
  misfire: "1–4",
  misStreak: 0,
  chambers: chambers
};
sandbox.DMCC.state.players.p_jolene = { id: "p_jolene", snapshot: { name: "Jolene", guns: [snapGun], ammo: [] } };
const jolene = { id: "p_jolene", playerId: "p_jolene", kind: "player", name: "Jolene", dmActsAs: true, ac: 13, hp: 20, maxHp: 20 };
const bandit = {
  id: "en_bandit1",
  name: "Bandit",
  kind: "enemy",
  ac: 12,
  hp: 11,
  maxHp: 11,
  card: { attacks: [{ id: "ballncap", name: "Ball n Cap", toHit: 3, damage: "1d8+1", capacity: 6, loaded: 6, misfire: 4 }] }
};
sandbox.__fight.setOrder([jolene, bandit]);
sandbox.SSDNSTestRoll = () => 20;

const before = chambers.slice();
const once = await sandbox.SSDNSMapFight.attack({
  combatantId: "p_jolene",
  weaponId: "Navy / Army Ball n Cap Revolver",
  chamber: 2,
  targetCombatantId: "en_bandit1"
});
check("fire.once", once === true && commands.length === 1 && commands[0].type === "gun" && commands[0].payload.op === "fire" && commands[0].payload.index === 1 && commands[0].payload.chamber === 2, JSON.stringify(commands));
check("fire.quiet", rolls.length === 0 && commands.every((c) => c.payload && c.payload.op !== "set" && c.type !== "gun_event"));
check("fire.unspent", snapGun.loaded === 6 && snapGun.chambers.join("|") === before.join("|"));
const card = jolene.card.attacks[0];
check("fire.same", card.chambers.join("|") === snapGun.chambers.join("|") && card.ammoName === "percussion" && card.sheetIndex === 1);

const paint = sandbox.SSDNSAmmoDisplay.html({
  name: card.name, action: card.action, weapon: card.weapon, ammo: card.ammoName, tier: card.tier,
  cap: card.capacity, loaded: card.loaded, chambers: card.chambers
});
const collapsed = sandbox.SSDNSAmmoDisplay.html({
  name: card.name, action: "Percussion revolver (slow)", ammo: "percussion", tier: "medium",
  cap: 6, loaded: 6, chambers: [1, 1, 1, 1, 1, 1]
});
check("art.grey", paint.includes("--case:#7d8b99") && !paint.includes("#e0b84a"));
check("art.brassWas", collapsed.includes("#e0b84a") && !collapsed.includes("#7d8b99"));

sandbox.DMCC.state.demo = true;
commands.length = 0;
for (const k of [0, 2, 4]) {
  const ok = await sandbox.SSDNSMapFight.attack({
    combatantId: "p_jolene",
    weaponId: "Navy / Army Ball n Cap Revolver",
    chamber: k,
    targetCombatantId: "en_bandit1"
  });
  check("fire.step" + k, ok === true);
}
check("fire.three", commands.length === 3 && commands.every((c) => c.payload.op === "fire") && snapGun.loaded === 3, String(snapGun.loaded));
check("fire.named", snapGun.chambers[0] === "" && snapGun.chambers[2] === "" && snapGun.chambers[4] === "" && snapGun.chambers[1] === PERC && snapGun.chambers[3] === PERC && snapGun.chambers[5] === PERC);
check("fire.cardFollows", jolene.card.attacks[0].chambers.join("|") === snapGun.chambers.join("|") && jolene.card.attacks[0].loaded === 3);

snapGun.chambers[1] = "";
snapGun.loaded = 2;
sandbox.document.activeElement = { tagName: "BODY" };
await sandbox.__fight.syncPlayers();
check("fire.sync", jolene.card.attacks[0].loaded === 2 && jolene.card.attacks[0].chambers[1] === "" && jolene.card.attacks[0].chambers[5] === PERC);

jolene.dmActsAs = false;
const held = commands.length;
const blocked = await sandbox.SSDNSMapFight.attack({
  combatantId: "p_jolene",
  weaponId: "Navy / Army Ball n Cap Revolver",
  chamber: 3,
  targetCombatantId: "en_bandit1"
});
check("fire.playerActs", blocked === false && commands.length === held && snapGun.chambers[3] === PERC);

const enemy = await sandbox.SSDNSMapFight.attack({
  combatantId: "en_bandit1",
  weaponId: "ballncap",
  targetCombatantId: "p_jolene"
});
check("fire.enemy", enemy === true && bandit.card.attacks[0].loaded === 5 && rolls.length === 1);

els["#detailGun"] = { value: "0" };
els["#detailAdv"] = { value: "" };
snapGun.misStreak = 4;
snapGun.loaded = 2;
sandbox.DMCC.state.demo = false;
const beforeDetail = commands.length;
await sandbox.__fight.rollGunAttack("p_jolene");
const detailCmd = commands[commands.length - 1];
check("detail.fire", commands.length === beforeDetail + 1 && detailCmd && detailCmd.payload.op === "fire" && detailCmd.payload.index === 1 && detailCmd.type === "gun" && !commands.some((c) => c.type === "gun_event"));
check("detail.local", snapGun.misStreak === 4 && snapGun.loaded === 2);

const html = read("index.html").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
const dom = new JSDOM(html, { url: "http://127.0.0.1:8765/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const window = dom.window;
window.matchMedia = function () { return { matches: false, addEventListener() {}, removeEventListener() {} }; };
function run(rel) {
  vm.runInContext(read(rel), dom.getInternalVMContext(), { filename: rel });
}
run("assets/data/rules.js");
run("assets/js/ssdns-bridge.js");
run("assets/js/storage.js");
run("assets/js/misfire.js");
run("assets/js/test-jammer.js");
run("assets/js/ammo-display.js");
run("assets/js/apply-guard.js");
run("assets/js/app.js");
run("map/ssdns-map-host.js");
const sheet = window.SSDNSApp;
check("grant.fn", typeof sheet.grantTestGun === "function");
const emptySel = window.document.querySelector('[data-gun="0"]');
check("grant.hidden", !!emptySel && !emptySel.querySelector('option[value="test-jammer"]'));
check("grant.ok", sheet.grantTestGun() === true);
const cg = sheet.doc().character.guns[0];
const view = sheet.compute().guns[0];
check("grant.slot", cg.weapon === "test-jammer" && cg.loaded === 6 && cg.chambers.length === 6 && cg.chambers.every((st) => st === PERC));
check("grant.label", view && view.w && view.w.name === "TEST Jammer" && String(view.misfire) === "1–20");
const grantedSel = window.document.querySelector('[data-gun="0"]');
const otherSel = window.document.querySelector('[data-gun="1"]');
check("grant.shown", grantedSel && grantedSel.value === "test-jammer" && /TEST/.test(grantedSel.selectedOptions[0].textContent));
check("grant.other", otherSel && !otherSel.querySelector('option[value="test-jammer"]'));
check("grant.phb", !(window.SSDNS_RULES.firearms || []).some((f) => f && f.id === "test-jammer"));
const cyl = window.SSDNSMapHost.sheetCylinder(0);
const playerPaint = window.SSDNSAmmoDisplay.html({
  name: view.w.name, action: view.w.action, weapon: cg.weapon, ammo: view.w.ammo, tier: view.tier,
  cap: cyl.cap, loaded: cyl.loaded, chambers: cyl.chambers
});
check("grant.art", cyl && cyl.chambers.join("|") === cg.chambers.join("|") && playerPaint.includes("--case:#7d8b99") && !playerPaint.includes("#e0b84a"));
sheet.grantTestGun(2);
const second = sheet.doc().character.guns[2];
check("grant.next", second.weapon === "test-jammer" && cg.weapon === "test-jammer" && second.chambers[5] === PERC);

sandbox.DMCC.state.demo = true;
commands.length = 0;
sandbox.DMCC.applyDemoGun("p_jolene", { op: "test-gun", index: 3, weapon: "test-jammer" });
const granted = sandbox.DMCC.state.players.p_jolene.snapshot.guns.find((g) => g.weapon === "test-jammer");
check("demo.grant", !!granted && granted.name === "TEST Jammer" && granted.index === 3 && granted.chambers.every((st) => st === PERC) && granted.misfire === "1–20");
granted.misStreak = 1;
sandbox.DMCC.applyDemoGun("p_jolene", { op: "misfire", index: 3, dirty: true });
check("demo.dirty", granted.dirty === true && granted.misStreak === 2);
sandbox.DMCC.applyDemoGun("p_jolene", { op: "misfire", index: 3, dirty: false });
check("demo.clean", granted.dirty === false && granted.misStreak === 2);

if (window.SSDNSMapHost && window.SSDNSMapHost.destroy) window.SSDNSMapHost.destroy();
dom.window.close();

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("fire source ok");

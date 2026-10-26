/**
 * B9: DM gun parity on NPC rows (sheet 0.3.131 / DMCC 0.2.144).
 * Chamber-pick fire, Jam, Lock chamber, Unload, and the same controls on allies and creatures.
 * Dirty stays off NPC guns. Player guns and rules.js stay put.
 *   node tools/test-b9-npc-gun-parity.mjs
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
const v2 = read("dm/assets/js/v2.js");
const map = read("map/ssdns-map.js");
const host = read("map/ssdns-map-host.js");
const rules = read("database.rules.json");
const rulesJs = read("assets/data/rules.js");

check("ver.sheet", version.sheet === "0.3.149" && version.sheetBuild === "sheet-playtest-v03149");
check("ver.dmcc", version.dmcc === "0.2.162" && version.dmccBuild === "dmcc-playtest-v02162");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.149"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.162"'));
check("src.rulesUntouched", !rulesJs.includes("0.3.149") && !rulesJs.includes("enemyGunJam") && !rules.includes("0.3.149") && !rules.includes("drawer:jam"));

check("src.strip", v2.includes('if (row.kind !== "player")') && !v2.includes('if (row.kind === "enemy") {\n    const list = (row.card && row.card.attacks'));
check("src.chamberForward", v2.includes("strikeOpts.chamber") && v2.includes("freeOpts.chamber") && v2.includes("shot.chamber = Number(rawK)"));
check("src.jamLockApi", v2.includes('jam(detail) { return mapEnemyGunTool(detail, "jam"); }') && v2.includes('lock(detail) { return mapEnemyGunTool(detail, "lock"); }'));
check("src.host", host.includes('"drawer:jam": "jam"') && host.includes('"drawer:lock": "lock"') && host.includes('"drawer:unload": "unload"'));
check("src.noDirtyOnJam", /async function enemyGunJam[\s\S]*?async function enemyGunLock/.test(v2) && !/async function enemyGunJam[\s\S]*?async function enemyGunLock/.exec(v2)[0].includes(".dirty"));
check("src.unloadClearsChambers", v2.includes('if (Array.isArray(atk.chambers)) atk.chambers = atk.chambers.map(() => "");'));

const playerRow = map.slice(map.indexOf("function playerCylinderRow"), map.indexOf("function paintPlayerFight"));
check("src.playerUntouched", playerRow.includes('data-act="playerChamber"') && !playerRow.includes("rowJam") && !playerRow.includes("npcJam") && !playerRow.includes("Lock chamber"));
check("src.drawerNpc", map.includes("const npc = !isPc;") && map.includes("function npcJam") && map.includes("function npcLock") && map.includes("rowJamLock") && map.includes(">Jam<") === false);
check("src.jamLabel", map.includes("sideButton(a, 'rowJam', 'jam', 'Jam')") && map.includes("sideButton(a, 'rowLock', 'lock', 'Lock chamber')"));
check("src.npcUnload", map.includes("side === 'npc'") && map.includes('data-act="rowUnload"') && map.includes("drawer:unload"));
check("src.chamberClick", map.includes("That chamber is locked.") && map.includes("drawer:target") && map.includes("chamber: Number(b.getAttribute('data-k'))"));
check("src.noSpin", !map.includes("Spin chamber") && !map.includes("Cycle") && !v2.includes("data-act=\"rowSpin\""));

function makeSandbox() {
  const toasts = [];
  const ledger = [];
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
      return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, querySelectorAll() { return []; }, setAttribute() {} };
    },
    body: { appendChild() {}, classList: { contains() { return false; } } },
    activeElement: null
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let seq = 0;
  sandbox.DMCC = {
    $: () => null, $$: () => [], esc,
    state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: [] },
    toast(msg) { toasts.push(String(msg || "")); },
    uid(p) { seq += 1; return (p || "id") + seq; },
    guardFocus(fn) { if (fn) fn(); },
    parseDice(formula) {
      const flat = String(formula || "").match(/^(\d+)$/);
      if (flat) return { total: Number(flat[1]), detail: String(formula) };
      return { total: 4, detail: "4" };
    },
    pushCommand() { return Promise.resolve(); },
    pushRoll() { return Promise.resolve(); },
    pushLedger(row) { ledger.push(row); return Promise.resolve(); },
    renderPlayers() {},
    roomRef(p) { return { path: p }; }
  };
  vm.createContext(sandbox);
  vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
  vm.runInContext(read("assets/js/misfire.js"), sandbox, { filename: "misfire.js" });
  vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
  const src = v2.replace(
    /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
    "\nglobalThis.__fight = { fight: fight, setOrder: function (rows) { fight.order = rows || []; } };\n"
  );
  vm.runInContext(src, sandbox, { filename: "v2.js" });
  return { sandbox, toasts, ledger };
}

function revolver(over) {
  return Object.assign({
    id: "peacemaker", name: "Peacemaker", toHit: 5, damage: "1d8+3",
    capacity: 6, loaded: 6, spare: 6, misfire: 2
  }, over || {});
}
function row(id, kind, gun, extra) {
  return Object.assign({
    id: id, name: id, kind: kind, ac: 13, hp: 20, maxHp: 20, mapTokenId: "tok_" + id,
    card: { attacks: [gun] }
  }, extra || {});
}

{
  const { sandbox, toasts, ledger } = makeSandbox();
  const foe = row("en_outlaw", "enemy", revolver());
  const ally = row("en_deputy", "ally", revolver({ id: "henry", name: "Henry Rifle", capacity: 7, loaded: 7, spare: 3 }));
  const beast = row("en_bird", "creature", revolver({ id: "spit", name: "Spitfire", capacity: 5, loaded: 5, spare: 2 }));
  const pc = row("pc_caleb", "player", revolver({ id: "navy", name: "Navy" }), { playerId: "pc_caleb", dmActsAs: true });
  const target = row("en_witch", "enemy", { id: "lash", name: "Thorn", toHit: 3, damage: "1d6" });
  sandbox.__fight.setOrder([foe, ally, beast, pc, target]);
  sandbox.SSDNSTestRoll = () => 15;
  const gun = foe.card.attacks[0];

  const plain = await sandbox.SSDNSMapFight.attack({ combatantId: "en_outlaw", weaponId: "peacemaker", targetCombatantId: "en_witch" });
  check("fire.count", plain === true && gun.loaded === 5 && !Array.isArray(gun.chambers), JSON.stringify({ loaded: gun.loaded, chambers: gun.chambers }));
  gun.loaded = 6;

  const shot = await sandbox.SSDNSMapFight.attack({ combatantId: "en_outlaw", weaponId: "peacemaker", targetCombatantId: "en_witch", chamber: 2 });
  check("fire.chamber3", shot === true && gun.loaded === 5 && Array.isArray(gun.chambers) && gun.chambers.length === 6 && !gun.chambers[2] && gun.chambers.filter(Boolean).length === 5, JSON.stringify(gun.chambers));
  check("fire.othersStay", gun.chambers[0] && gun.chambers[1] && gun.chambers[3]);

  const beforeJam = ledger.length;
  const markers = JSON.stringify(sandbox.__fight.fight.markers || {});
  const jammed = await sandbox.SSDNSMapFight.jam({ combatantId: "en_outlaw", weaponId: "peacemaker" });
  check("jam.sets", jammed === true && gun.jammed === true && gun.dirty !== true && gun.loaded === 5, JSON.stringify({ jammed: gun.jammed, dirty: gun.dirty, loaded: gun.loaded }));
  check("jam.ledger", ledger.length === beforeJam + 1 && /jammed Peacemaker/.test(ledger[ledger.length - 1].what));
  check("jam.noPip", JSON.stringify(sandbox.__fight.fight.markers || {}) === markers);
  const refused = await sandbox.SSDNSMapFight.attack({ combatantId: "en_outlaw", weaponId: "peacemaker", targetCombatantId: "en_witch", chamber: 0 });
  check("jam.blocksFire", refused !== true && gun.loaded === 5 && toasts.some((t) => /jammed/i.test(t)));
  const cleared = await sandbox.SSDNSMapFight.unjam({ combatantId: "en_outlaw", weaponId: "peacemaker" });
  check("unjam.free", cleared === true && gun.jammed === false && gun.loaded === 5 && gun.dirty !== true);
  check("unjam.noPip", JSON.stringify(sandbox.__fight.fight.markers || {}) === markers);

  const locked = await sandbox.SSDNSMapFight.lock({ combatantId: "en_outlaw", weaponId: "peacemaker", chamber: 1 });
  check("lock.chamber2", locked === true && (gun.lockedChambers || []).indexOf(1) >= 0 && !gun.chambers[1] && gun.dirty !== true, JSON.stringify({ locks: gun.lockedChambers, chambers: gun.chambers, loaded: gun.loaded }));
  const card = sandbox.SSDNSMapCards.get("tok_en_outlaw");
  const pictured = card && card.attacks.find((a) => a.id === "peacemaker");
  check("lock.picture", pictured && pictured.ammo && pictured.ammo.locked.indexOf(1) >= 0 && pictured.jammed !== true);
  toasts.length = 0;
  const blocked = await sandbox.SSDNSMapFight.attack({ combatantId: "en_outlaw", weaponId: "peacemaker", targetCombatantId: "en_witch", chamber: 1 });
  check("lock.cannotFire", blocked !== true && toasts.some((t) => /locked/i.test(t)) && (gun.lockedChambers || []).indexOf(1) >= 0);
  const opened = await sandbox.SSDNSMapFight.reopen({ combatantId: "en_outlaw", weaponId: "peacemaker" });
  check("reopen.clears", opened === true && !(gun.lockedChambers || []).length, JSON.stringify(gun.lockedChambers));

  const held = gun.loaded;
  const spareBefore = Number(gun.spare) || 0;
  const unloaded = await sandbox.SSDNSMapFight.unload({ combatantId: "en_outlaw", weaponId: "peacemaker" });
  check("unload.match", unloaded === true && gun.loaded === 0 && gun.chambers.every((c) => !c) && Number(gun.spare) === spareBefore + held, gun.loaded + " spare " + gun.spare);
  const added = await sandbox.SSDNSMapFight.addrounds({ combatantId: "en_outlaw", weaponId: "peacemaker", rounds: 2, into: "gun" });
  check("addrounds.still", added === true && gun.loaded === 2 && gun.chambers.filter(Boolean).length === 2, JSON.stringify(gun.chambers));
  gun.spare = 4;
  await sandbox.SSDNSMapFight.reload({ combatantId: "en_outlaw", weaponId: "peacemaker" });
  check("reload.match", gun.loaded === 6 && gun.spare === 0 && gun.chambers.filter(Boolean).length === 6, gun.loaded + "/" + gun.spare);

  const allyGun = ally.card.attacks[0];
  const allyJam = await sandbox.SSDNSMapFight.jam({ combatantId: "en_deputy", weaponId: "henry" });
  check("ally.jam", allyJam === true && allyGun.jammed === true && allyGun.dirty !== true && ally.kind === "ally");
  await sandbox.SSDNSMapFight.unjam({ combatantId: "en_deputy", weaponId: "henry" });
  const allyShot = await sandbox.SSDNSMapFight.attack({ combatantId: "en_deputy", weaponId: "henry", targetCombatantId: "en_witch", chamber: 3 });
  check("ally.fire", allyShot === true && allyGun.loaded === 6 && !allyGun.chambers[3] && allyGun.chambers.filter(Boolean).length === 6, JSON.stringify({ loaded: allyGun.loaded, chambers: allyGun.chambers }));
  const allyCard = sandbox.SSDNSMapCards.get("tok_en_deputy");
  check("ally.card", allyCard && allyCard.kind !== "pc" && allyCard.attacks.some((a) => a.id === "henry" && a.ammo && a.ammo.cap === 7));

  const beastGun = beast.card.attacks[0];
  const beastLock = await sandbox.SSDNSMapFight.lock({ combatantId: "en_bird", weaponId: "spit", chamber: 0 });
  check("creature.lock", beastLock === true && beastGun.lockedChambers[0] === 0 && beast.kind === "creature" && beastGun.dirty !== true);

  const pcGun = pc.card.attacks[0];
  const pcJam = await sandbox.SSDNSMapFight.jam({ combatantId: "pc_caleb", weaponId: "navy" });
  check("pc.noJam", pcJam === false && pcGun.jammed !== true && toasts.some((t) => /enemy and NPC/i.test(t)));

  sandbox.SSDNSTestRoll = () => 1;
  const misfireGun = revolver({ loaded: 6 });
  delete misfireGun.chambers;
  const misfireRow = row("en_misfire", "enemy", misfireGun);
  sandbox.__fight.setOrder([misfireRow, target]);
  const boom = await sandbox.SSDNSMapFight.attack({ combatantId: "en_misfire", weaponId: "peacemaker", targetCombatantId: "en_witch" });
  check("misfire.jams", boom === true && misfireGun.jammed === true && misfireGun.loaded === 5 && misfireGun.dirty !== true, JSON.stringify({ jammed: misfireGun.jammed, loaded: misfireGun.loaded, dirty: misfireGun.dirty }));
  const badge = sandbox.SSDNSMapCards.get("tok_en_misfire");
  const badgeGun = badge && badge.attacks.find((a) => a.id === "peacemaker");
  check("misfire.badge", badgeGun && badgeGun.jammed === true && Number(badgeGun.ammo.loaded) === 5);
  await sandbox.SSDNSMapFight.unjam({ combatantId: "en_misfire", weaponId: "peacemaker" });
  check("misfire.unjam", misfireGun.jammed === false && misfireGun.loaded === 5);
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nB9 npc gun parity ok");

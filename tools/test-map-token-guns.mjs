/**
 * Map token guns (Jessey 2026-10-20): weapon memory, DM unjam / reload on NPC tokens, ADV/DIS ticks,
 * condition names on the map initiative, bestiary placement labels, tube detection for NPC prose guns,
 * and the HP / ammo bar blink after many shots (stale encounter/dm echoes).
 *   node tools/test-map-token-guns.mjs            (V2=path/to/v2.js to run the blink case against another copy)
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
function read(rel) { return fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(root, rel), "utf8"); }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function makeSandbox(opts) {
  opts = opts || {};
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
    toast() {},
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
  vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
  const v2 = read(opts.v2 || "dm/assets/js/v2.js").replace(
    /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
    "\nglobalThis.__fight = { fight: fight, setOrder: function (rows) { fight.order = rows || []; }, watchSecrets: watchSecrets," +
    " captureSecrets: captureSecrets, tokenLabel: typeof tokenLabel === 'function' ? tokenLabel : null };\n"
  );
  vm.runInContext(v2, sandbox, { filename: "v2.js" });
  return { sandbox, ledger };
}

/* a Firebase stand-in: set/update resolve later (the first write of a save is slow, like a real round trip),
   and a listener hears every set at once with the value just written, as the real SDK raises local events. */
function fakeFb(sandbox, slowMs) {
  const listeners = {};
  const writes = [];
  let n = 0;
  const fb = {
    ref(db, p) { return { path: p }; },
    onValue(ref, cb) {
      (listeners[ref.path] = listeners[ref.path] || []).push(cb);
      return () => { listeners[ref.path] = (listeners[ref.path] || []).filter((x) => x !== cb); };
    },
    update(ref, val) { writes.push({ op: "update", path: ref.path, val: JSON.parse(JSON.stringify(val)) }); n += 1; return wait(n % 2 ? slowMs : 1); },
    set(ref, val) {
      const copy = JSON.parse(JSON.stringify(val));
      writes.push({ op: "set", path: ref.path, val: copy });
      (listeners[ref.path] || []).forEach((cb) => cb({ val: () => JSON.parse(JSON.stringify(copy)) }));
      return wait(1);
    }
  };
  sandbox.DMCC.state._fb = fb;
  sandbox.DMCC.state.db = {};
  sandbox.DMCC.state.demo = false;
  return { fb, writes, listeners };
}

function abigail() {
  return {
    id: "en_abigail", name: "Abigail Ellen", kind: "enemy", side: "friendly", ac: 14, hp: 30, maxHp: 30, mapTokenId: "tok_abigail",
    card: { attacks: [
      { id: "bowie", name: "Bowie", toHit: 4, damage: "1d4+2" },
      { id: "henrietta-rifle", name: "Henrietta Repeating Rifle", toHit: 5, damage: "1d10+2", capacity: 6, loaded: 6, misfire: 2 }
    ] }
  };
}
function witch() {
  return { id: "en_witch", name: "Cactus Witch", kind: "enemy", ac: 12, hp: 82, maxHp: 82, mapTokenId: "tok_witch", card: { attacks: [{ id: "thorn", name: "Thorn Lash", toHit: 4, damage: "2d6" }] } };
}

/* ---------- 1. blink: many quick shots, then the bars sit still ---------- */
async function blinkRun(v2) {
  const { sandbox } = makeSandbox({ v2 });
  const net = fakeFb(sandbox, 25);
  const ab = abigail(), w = witch();
  sandbox.__fight.setOrder([ab, w]);
  sandbox.SSDNSTestRoll = () => 15;
  sandbox.__fight.watchSecrets();
  const seenHp = [];
  const seenAmmo = [];
  /* every redraw the map would make reads the row: record what it would show */
  const sample = () => {
    const rowW = sandbox.__fight.fight.order.find((r) => r.id === "en_witch");
    const rowA = sandbox.__fight.fight.order.find((r) => r.id === "en_abigail");
    seenHp.push(Number(rowW.hp));
    seenAmmo.push(Number(rowA.card.attacks[1].loaded));
  };
  net.listeners["encounter/dm"].push(() => sample());
  const shots = [];
  for (let k = 0; k < 12; k++) {
    const row = sandbox.__fight.fight.order.find((r) => r.id === "en_abigail");
    if (Number(row.card.attacks[1].loaded) === 0) await sandbox.SSDNSMapFight.reload({ combatantId: "en_abigail", weaponId: "henrietta-rifle" });
    shots.push(sandbox.SSDNSMapFight.attack({ combatantId: "en_abigail", tokenId: "tok_abigail", weaponId: "henrietta-rifle", targetCombatantId: "en_witch" }));
    await wait(3); /* quicker than one save round trip: shots overlap their saves */
    sample();
  }
  await Promise.all(shots);
  await wait(250);
  const settledWrites = net.writes.length;
  const settledHp = sandbox.__fight.fight.order.find((r) => r.id === "en_witch").hp;
  await wait(250);
  let ups = 0;
  for (let k = 1; k < seenHp.length; k++) if (seenHp[k] > seenHp[k - 1]) ups += 1;
  let ammoBack = 0;
  for (let k = 1; k < seenAmmo.length; k++) if (seenAmmo[k] > seenAmmo[k - 1] && seenAmmo[k] !== 6) ammoBack += 1;
  const lastDm = net.writes.filter((x) => x.path === "encounter/dm").pop();
  return {
    ups, ammoBack, settledHp,
    finalHp: sandbox.__fight.fight.order.find((r) => r.id === "en_witch").hp,
    storedHp: lastDm && lastDm.val.en_witch && lastDm.val.en_witch.hp,
    quiet: net.writes.length === settledWrites,
    listeners: (net.listeners["encounter/dm"] || []).length,
    seenHp
  };
}
const fixed = await blinkRun(process.env.V2 || null);
check("blink.hpNeverJumpsBack", fixed.ups === 0, JSON.stringify(fixed.seenHp));
check("blink.ammoNeverJumpsBack", fixed.ammoBack === 0, String(fixed.ammoBack));
check("blink.hpLanded", fixed.finalHp < 82 && fixed.finalHp === fixed.settledHp, fixed.settledHp + " -> " + fixed.finalHp);
check("blink.storedMatchesRow", Number(fixed.storedHp) === Number(fixed.finalHp), fixed.storedHp + " vs " + fixed.finalHp);
check("blink.noWriteLoop", fixed.quiet, "writes kept coming after the shots settled");
check("blink.noListenerGrowth", fixed.listeners === 2, String(fixed.listeners)); /* watchSecrets + this test's sampler */

/* ---------- 2. weapon memory, DM unjam / reload on an NPC, ADV/DIS tick ---------- */
{
  const { sandbox, ledger } = makeSandbox();
  const net = fakeFb(sandbox, 1);
  const ab = abigail(), w = witch();
  sandbox.__fight.setOrder([ab, w]);
  sandbox.SSDNSTestRoll = () => 15;
  const card0 = sandbox.SSDNSMapCards.get("tok_abigail");
  check("memory.noneYet", card0 && !card0.lastWeaponId, card0 && card0.lastWeaponId);
  await sandbox.SSDNSMapFight.weapon({ combatantId: "en_abigail", weaponId: "henrietta-rifle" });
  check("memory.pick", ab.lastWeaponId === "henrietta-rifle" && sandbox.SSDNSMapCards.get("tok_abigail").lastWeaponId === "henrietta-rifle");
  const dmCopy = net.writes.filter((x) => x.path === "encounter/dm").pop();
  check("memory.secret", dmCopy && dmCopy.val.en_abigail.lastWeaponId === "henrietta-rifle");
  const init = net.writes.filter((x) => x.path === "table").pop();
  check("memory.notPublic", init && JSON.stringify(init.val.initiative.order).indexOf("lastWeaponId") < 0);
  const pub = net.writes.filter((x) => x.path === "encounter/public").pop();
  check("memory.notInPublicView", pub && JSON.stringify(pub.val).indexOf("lastWeaponId") < 0);
  await sandbox.SSDNSMapFight.attack({ combatantId: "en_abigail", weaponId: "bowie", targetCombatantId: "en_witch" });
  check("memory.lastAttack", ab.lastWeaponId === "bowie", ab.lastWeaponId);
  await sandbox.SSDNSMapFight.attack({ combatantId: "en_abigail", weaponId: "henrietta-rifle", targetCombatantId: "en_witch" });
  check("memory.secondAttack", ab.lastWeaponId === "henrietta-rifle" && ab.card.attacks[1].loaded === 5);
  /* restore from the DM copy alone (page reload: the local row has no memory yet) */
  delete ab.lastWeaponId;
  sandbox.__fight.fight.secrets = { en_abigail: { lastWeaponId: "henrietta-rifle" } };
  sandbox.__fight.setOrder([ab, w]);
  vm.runInContext("restoreSecrets()", sandbox);
  check("memory.restored", ab.lastWeaponId === "henrietta-rifle");

  const rifle = ab.card.attacks[1];
  rifle.jammed = true;
  const before = ledger.length;
  const freed = await sandbox.SSDNSMapFight.unjam({ combatantId: "en_abigail", weaponId: "henrietta-rifle" });
  check("unjam.npc", freed === true && rifle.jammed === false && rifle.loaded === 5, JSON.stringify(rifle));
  check("unjam.ledger", ledger.length === before + 1 && /cleared the jam on Henrietta/.test(ledger[ledger.length - 1].what));
  const dmAfter = net.writes.filter((x) => x.path === "encounter/dm").pop();
  check("unjam.synced", dmAfter && dmAfter.val.en_abigail.card && dmAfter.val.en_abigail.card.attacks[1].jammed !== true);
  check("unjam.refusesClear", (await sandbox.SSDNSMapFight.unjam({ combatantId: "en_abigail", weaponId: "henrietta-rifle" })) === false);
  rifle.jammed = true; rifle.fouled = true;
  check("unjam.refusesFouled", (await sandbox.SSDNSMapFight.unjam({ combatantId: "en_abigail", weaponId: "henrietta-rifle" })) === false && rifle.jammed === true);
  rifle.jammed = false; rifle.fouled = false;

  await sandbox.SSDNSMapFight.unload({ combatantId: "en_abigail", weaponId: "henrietta-rifle" });
  check("unload.npc", Number(rifle.loaded) === 0 && Number(rifle.spare) === 5, rifle.loaded + "/" + rifle.spare);
  rifle.spare = 4; /* a box of rounds on the belt */
  await sandbox.SSDNSMapFight.reload({ combatantId: "en_abigail", weaponId: "henrietta-rifle" });
  check("reload.npc", Number(rifle.loaded) === 4 && Number(rifle.spare) === 0, rifle.loaded + "/" + rifle.spare);
  const dmReload = net.writes.filter((x) => x.path === "encounter/dm").pop();
  check("reload.synced", dmReload && Number(dmReload.val.en_abigail.card.attacks[1].loaded) === 4);
  const mapCard = sandbox.SSDNSMapCards.get("tok_abigail");
  const mapRifle = mapCard.attacks.find((a) => a.id === "henrietta-rifle");
  check("reload.mapCard", mapRifle && mapRifle.ammo && Number(mapRifle.ammo.loaded) === 4 && Number(mapRifle.ammo.cap) === 6, JSON.stringify(mapRifle && mapRifle.ammo));

  await sandbox.SSDNSMapFight.mode({ combatantId: "en_abigail", weaponId: "henrietta-rifle", mode: "adv" });
  check("mode.npc", rifle.attackMode === "adv", String(rifle.attackMode));
}

/* ---------- 3. conditions reach the map order; hidden rows stay masked for players ---------- */
{
  const { sandbox } = makeSandbox();
  const net = fakeFb(sandbox, 1);
  const w = witch();
  w.conditions = [{ name: "Poisoned" }, { name: "Prone" }];
  const hid = Object.assign(witch(), { id: "en_hid", name: "Hidden Gunman", mapHidden: true, conditions: [{ name: "Prone" }] });
  sandbox.__fight.setOrder([w, hid]);
  const order = sandbox.SSDNSMapCards.initiative().order;
  check("conds.dmMap", JSON.stringify(order[0].conditions) === JSON.stringify(["Poisoned", "Prone"]), JSON.stringify(order[0].conditions));
  await vm.runInContext("saveRemoteTable()", sandbox);
  const pubOrder = net.writes.filter((x) => x.path === "table").pop().val.initiative.order;
  const hidRow = pubOrder.find((r) => r.id === "en_hid");
  check("conds.hiddenMasked", hidRow && Array.isArray(hidRow.conditions) && hidRow.conditions.length === 0);
  check("conds.icons", sandbox.SSDNSConditions.icon("Prone") !== sandbox.SSDNSConditions.icon("Poisoned") && sandbox.SSDNSConditions.icon("nonsense") === "●");
}

/* ---------- 4. bestiary labels: numbered copies fit the 16-character cap ---------- */
{
  const { sandbox } = makeSandbox();
  const label = sandbox.__fight.tokenLabel;
  check("label.short", label && label("Outlaw 2") === "Outlaw 2");
  check("label.cap", label && label("Thunderbird Hatchling 2").length <= 16 && /\s2$/.test(label("Thunderbird Hatchling 2")), label && label("Thunderbird Hatchling 2"));
  const map = read("map/ssdns-map.js");
  check("bestiary.button", map.indexOf('data-act="bestiaryBtn"') >= 0 && map.indexOf("bestiary:place") >= 0);
  const host = read("map/ssdns-map-host.js");
  check("bestiary.host", host.indexOf("placeBeast") >= 0 && host.indexOf('"drawer:weapon": "weapon"') >= 0);
  check("map.targetBar", map.indexOf('data-act="cylTarget" data-main="1"') >= 0, "every Fight card carries a Target picker");
}

/* ---------- 5. NPC statblock prose guns find the right picture ---------- */
{
  const sb = { window: {}, console };
  sb.globalThis = sb; sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read("assets/data/rules.js"), sb, { filename: "rules.js" });
  vm.runInContext(read("assets/js/ammo-display.js"), sb, { filename: "ammo-display.js" });
  const A = sb.SSDNSAmmoDisplay;
  if (A && A.kind) {
    check("ammo.tube", A.kind({ id: "henrietta-rifle", name: "Henrietta Repeating Rifle, Medium (.44-40)", cap: 6 }) === "tube", A.kind({ id: "henrietta-rifle", name: "Henrietta Repeating Rifle, Medium (.44-40)", cap: 6 }));
    check("ammo.cylinder", A.kind({ id: "ballncap", name: "Ball n Cap Revolver", cap: 6 }) === "cylinder");
  } else check("ammo.api", false, "SSDNSAmmoDisplay.kind missing");
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nmap token guns ok");

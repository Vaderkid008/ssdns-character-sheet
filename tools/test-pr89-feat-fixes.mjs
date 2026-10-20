/**
 * PR89 (0.3.86): feat audit "looks wrong today" fixes.
 *  first-shot (rig + Hair trigger) reaches the roll; per-gun magic in the shown number + damage;
 *  Hat of the Sharpshooter / Eldorite Dust / Cutlass / Old Henry reach the roll; Archery all ranged;
 *  Lawman Paladin styles at 2+ (+GWF); Dust Fury +2/+3/+4; Powder Hands TR; Reopen = action 1/short rest;
 *  Powder Man Long Arm 50/100; rules.js hand edits (unjam free, Reopen line).
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-pr89-feat-fixes.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* rules.js: only the two hand edits */
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(read("assets/data/rules.js"), ctx);
const ml = ctx.SSDNS_RULES.feats.filter((f) => f.id === "muzzleloader")[0];
check("rules.unjamFree", ml.bullets.some((b) => /Clear the Jam\..*as a free action, with no check\./.test(b)) && !ml.bullets.some((b) => /as a bonus action, with no check/.test(b)), J(ml.bullets));
check("rules.reopenLine", ml.bullets.some((b) => /^Reopen\. As an action, you can clear one locked chamber on one of your guns\. Once per short rest\.$/.test(b)), J(ml.bullets));
check("rules.gist", /free-action jam clear/.test(ml.gist), ml.gist);

function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
if (!(await portOpen(8765))) { console.log("Static server is not listening on 8765 (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSApp.applyPatch && window.SSDNSItems && document.querySelector("#atkTarget"), { timeout: 20000 });
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const A = window.SSDNSApp;
    await wait(1200);
    const out = {};
    const NAVY = "navy-army-ball-n-cap-revolver";
    const base = (d, extra) => {
      const c = d.character;
      c.name = "Dust"; c.calling = "gunslinger"; c.level = 3; c.feats = []; c.fightingStyle = ""; c.items = []; c.buffs = [];
      c.holster = ""; c.holsterActive = false; c.seated = false; c.mounted = false; c.firstShotSpent = false; c.raging = false;
      c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns[0] = Object.assign(c.guns[0] || {}, { weapon: NAVY, equipped: true, proficient: true, loaded: 6, chambers: ["c", "c", "c", "c", "c", "c"], misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "", mod: "", magic: null, lockedChambers: [] });
      c.activeConditions = [];
      if (extra) extra(c);
    };
    const parts = (i) => (A.compute().guns[i || 0].parts || []).map((p) => p.label + ":" + p.value);
    /* first shot from the rig */
    A.applyPatch((d) => base(d, (c) => { c.holster = "bridgeport-rig-swivel"; c.holsterActive = true; }));
    await wait(100);
    out.rig = parts();
    const sel = document.querySelector("#atkTarget"); sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#globalAdv").value = "";
    const realRandom = Math.random; Math.random = () => 0.6;
    window.SSDNSGunRoll(0, 0);
    await wait(700);
    out.spentAfterShot = !!A.doc().character.firstShotSpent;
    out.rigAfter = parts();
    out.logFirst = (document.querySelector(".log-item") || {}).textContent || "";
    window.SSDNSSheet && window.SSDNSSheet.rollInitiative && window.SSDNSSheet.rollInitiative();
    const initBtn = document.querySelector("#btnRollInit, [data-roll='initiative']");
    if (!(window.SSDNSSheet && window.SSDNSSheet.rollInitiative) && initBtn) initBtn.click();
    await wait(300);
    out.resetByInit = !A.doc().character.firstShotSpent;
    Math.random = realRandom;
    /* Hair trigger alone: +1; with Bridgeport it caps at +2 */
    A.applyPatch((d) => base(d, (c) => { c.guns[0].mod = "Hair trigger"; }));
    out.hair = parts();
    A.applyPatch((d) => base(d, (c) => { c.guns[0].mod = "Hair trigger"; c.holster = "bridgeport-rig-swivel"; c.holsterActive = true; }));
    out.hairCap = parts();
    /* per-gun magic: shown number and damage */
    A.applyPatch((d) => base(d));
    const plain = A.compute().guns[0];
    A.applyPatch((d) => base(d, (c) => { c.guns[0].magic = 1; }));
    const magic = A.compute().guns[0];
    out.magic = { atk0: plain.atk, atk1: magic.atk, dmg0: plain.dmg, dmg1: magic.dmg, parts: parts() };
    /* Hat of the Sharpshooter, worn */
    A.applyPatch((d) => base(d, (c) => { c.items = [{ uid: "hat1", catalogId: "hat-of-the-sharpshooter", name: "Hat of the Sharpshooter", type: "gear", effect: { kind: "buff" }, equipSlot: "hat" }]; }));
    out.hatWorn = parts();
    A.applyPatch((d) => base(d, (c) => { c.items = [{ uid: "hat1", catalogId: "hat-of-the-sharpshooter", name: "Hat of the Sharpshooter", type: "gear", effect: { kind: "buff" } }]; }));
    out.hatPacked = parts();
    /* Old Henry's Rifle */
    A.applyPatch((d) => base(d, (c) => { c.guns[1] = Object.assign(c.guns[1] || {}, { weapon: "henrietta-repeating-rifle", equipped: true, proficient: true }); c.items = [{ uid: "oh1", catalogId: "old-henrys-rifle", name: "Old Henry's Rifle", type: "weapon", effect: { kind: "attack", bonus: 1 } }]; }));
    out.henry = parts(1);
    out.henryAtk = A.compute().guns[1].atk;
    /* Eldorite Dust: use it, the first equipped gun's damage gets +1d4 */
    A.applyPatch((d) => base(d, (c) => { c.items = [{ uid: "ed1", catalogId: "eldorite-dust", name: "Eldorite Dust", type: "consumable", count: 1, effect: { kind: "buff", text: "x", duration: "1 hour", dmgDice: "1d4", hours: 1 }, uses: { max: 3 }, chargesLeft: 3 }]; }));
    await wait(100);
    const used = window.SSDNSItems.useOnSheet("ed1", {});
    await wait(200);
    out.dust = { chat: used && used.chat, buffs: (A.doc().character.buffs || []).map((b) => b.weapon + ":" + b.dmgDice), dmg: A.compute().guns[0].dmg };
    const dmgExpr = A.compute().guns[0].dmg;
    Math.random = () => 0.99;
    out.dustRoll = window.SSDNSSheet.rollDamageExpr(dmgExpr, false);
    Math.random = realRandom;
    /* Cutlass of the Sun's Fury in a melee slot */
    A.applyPatch((d) => base(d, (c) => { c.melee = c.melee || []; c.melee[0] = { weapon: "cutlass-of-the-suns-fury", proficient: true, equipped: true }; c.abilities.STR = 14; }));
    await wait(200);
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
    await wait(200);
    out.cutlass = { atk: (document.querySelector("[data-melee-atk='0']") || {}).textContent, dmg: (document.querySelector("[data-melee-dmg='0']") || {}).textContent, prof: A.compute().prof,
      picked: ((document.querySelector("[data-melee='0']") || {}).selectedOptions || [])[0] ? document.querySelector("[data-melee='0']").selectedOptions[0].textContent : "" };
    /* Archery: all ranged */
    A.applyPatch((d) => base(d, (c) => { c.calling = "frontier-scout"; c.level = 2; c.fightingStyle = "archery"; }));
    out.archeryPistol = A.styleAttackBonus({ group: "pistol" });
    out.archeryShotgun = A.styleAttackBonus({ group: "shotgun" });
    out.archeryRifle = A.styleAttackBonus({ group: "rifle" });
    out.archeryMelee = A.styleAttackBonus({ group: "martial-melee" });
    out.archeryThrown = A.styleAttackBonus({ group: "simple-melee", properties: "thrown" }, { thrown: true });
    /* Lawman styles */
    const styleSel = () => [...(document.querySelector("#selFightingStyle") || { options: [] }).options].map((o) => o.value).filter(Boolean);
    A.applyPatch((d) => base(d, (c) => { c.calling = "lawman"; c.level = 1; }));
    await wait(150);
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
    await wait(150);
    out.lawman1 = styleSel();
    A.applyPatch((d) => base(d, (c) => { c.calling = "lawman"; c.level = 2; }));
    await wait(150);
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
    await wait(150);
    out.lawman2 = styleSel();
    /* Dust Fury */
    out.rage = [1, 8, 9, 15, 16, 20].map((lv) => A.rageDamageBonus({ calling: "tribal-warrior", raging: true, level: lv }));
    out.rageOff = A.rageDamageBonus({ calling: "tribal-warrior", raging: false, level: 20 });
    /* Powder Hands */
    const R = window.SSDNS_RULES;
    const W = (id) => R.firearms.filter((w) => w.id === id)[0];
    const feat = { feats: ["muzzleloader"] }, none = { feats: [] };
    out.tr = {
      ballFeat: A.canTacticalReload(W(NAVY), feat), musketFeat: A.canTacticalReload(W("dull-co-rifle-musket"), feat),
      fiftyFeat: A.canTacticalReload(W("bison-big-fifty-buffalo-rifle"), feat), ballNone: A.canTacticalReload(W(NAVY), none)
    };
    /* Reopen chamber spends the action on the DM-acting path too */
    A.applyPatch((d) => base(d, (c) => { c.feats = ["muzzleloader"]; c.muzzleReopenUsed = false; c.guns[0].lockedChambers = [2]; c.guns[0].chambers = ["c", "c", "", "c", "c", "c"]; }));
    if (window.SSDNSActionPips.reset) window.SSDNSActionPips.reset();
    const ok1 = A.reopenChamber(0);
    const pips = window.SSDNSActionPips.state();
    A.applyPatch((d) => { d.character.guns[0].lockedChambers = [3]; });
    const ok2 = A.reopenChamber(0);
    out.reopen = { ok1, action: pips.action, ok2, used: !!A.doc().character.muzzleReopenUsed };
    /* Powder Man Long Arm */
    const I = window.SSDNSItems;
    const stick = { name: "Dynamite", type: "explosive", effect: { kind: "attack", range: "30/60", damage: "3d6", damageType: "bludgeoning", radius: 5, save: "DEX", dc: 12 } };
    const keg = { name: "Blasting keg", type: "explosive", effect: { kind: "attack", range: "", damage: "6d6", radius: 20, placed: true } };
    const rng = () => 0.5;
    const pm90 = I.useExplosive(stick, stick.effect, { distance: 90, powderMan: true, rng }, "Dust");
    const pm45 = I.useExplosive(stick, stick.effect, { distance: 45, powderMan: true, rng }, "Dust");
    const plain90 = I.useExplosive(stick, stick.effect, { distance: 90, powderMan: false, rng }, "Dust");
    const pm110 = I.useExplosive(stick, stick.effect, { distance: 110, powderMan: true, rng }, "Dust");
    out.pm = {
      pm90: pm90.ok && !!pm90.scatter, pm45: pm45.ok && !pm45.scatter, plain90: plain90.ok, pm110: pm110.ok, pm110reason: pm110.reason,
      ringPm: (I.ringSpec(stick, { powderMan: true }) || {}).range, ringPlain: (I.ringSpec(stick) || {}).range,
      kegRing: (I.ringSpec(keg, { powderMan: true }) || {}).spellKind
    };
    /* multi-term damage */
    Math.random = () => 0.99;
    out.multi = window.SSDNSSheet.rollDamageExpr("1d6+1 +3", false);
    out.single = window.SSDNSSheet.rollDamageExpr("1d8 +3 piercing (15-ft cone)", true);
    Math.random = realRandom;
    return out;
  });
  check("first.rigPart", r.rig.includes("first shot:2"), J(r.rig));
  check("first.spent", r.spentAfterShot && !r.rigAfter.some((p) => /^first shot/.test(p)), J({ s: r.spentAfterShot, p: r.rigAfter }));
  check("first.inRollLog", /first shot/i.test(r.logFirst) || /\+2/.test(r.logFirst), r.logFirst);
  check("first.resetByInit", r.resetByInit === true);
  check("first.hairTrigger", r.hair.includes("first shot:1"), J(r.hair));
  check("first.hairCap2", r.hairCap.includes("first shot:2"), J(r.hairCap));
  check("magic.shown", parseInt(r.magic.atk1, 10) === parseInt(r.magic.atk0, 10) + 1, J(r.magic));
  check("magic.damage", /\+\d/.test(r.magic.dmg1) && r.magic.dmg1 !== r.magic.dmg0 && r.magic.parts.includes("magic:1"), J(r.magic));
  check("hat.worn", r.hatWorn.includes("Hat of the Sharpshooter:1"), J(r.hatWorn));
  check("hat.notWornNoBonus", !r.hatPacked.some((p) => /Hat/.test(p)), J(r.hatPacked));
  check("henry.part", r.henry.includes("Old Henry's Rifle:1"), J(r.henry));
  check("dust.buff", r.dust.buffs.length === 1 && r.dust.buffs[0] === "gun:0:1d4" && /\+1d4/.test(r.dust.dmg) && /\+1d4 damage on/.test(r.dust.chat || ""), J(r.dust));
  check("dust.rolled", r.dustRoll && r.dustRoll.faces.length === 2 && r.dustRoll.faces[1] === 4, J(r.dustRoll));
  check("cutlass.picker", r.cutlass.picked === "Cutlass of the Sun's Fury", r.cutlass.picked);
  check("cutlass.paints", r.cutlass.atk === "+" + (2 + r.cutlass.prof + 1) && /^1d6\+1 \+2$/.test(r.cutlass.dmg), J(r.cutlass));
  check("archery.allRanged", r.archeryPistol === 2 && r.archeryShotgun === 2 && r.archeryRifle === 2 && r.archeryThrown === 2 && r.archeryMelee === 0, J(r));
  check("lawman.gate", r.lawman1.length === 0 && J(r.lawman2) === J(["defense", "dueling", "great-weapon", "protection"]), J({ l1: r.lawman1, l2: r.lawman2 }));
  check("rage.scale", J(r.rage) === J([2, 2, 3, 3, 4, 4]) && r.rageOff === 0, J(r.rage));
  check("tr.powderHands", r.tr.ballFeat && r.tr.musketFeat && !r.tr.fiftyFeat && !r.tr.ballNone, J(r.tr));
  check("reopen.action", r.reopen.ok1 === true && r.reopen.action === true && r.reopen.ok2 === false && r.reopen.used, J(r.reopen));
  check("powderMan.longArm", r.pm.pm90 && r.pm.pm45 && !r.pm.plain90 && !r.pm.pm110 && /50\/100/.test(r.pm.pm110reason || ""), J(r.pm));
  check("powderMan.rings", r.pm.ringPm === "50/100" && r.pm.ringPlain === "30/60" && r.pm.kegRing === "save", J(r.pm));
  check("damage.multiTerm", r.multi.total === 10 && r.multi.flat === 4, J(r.multi));
  check("damage.singleUnchanged", r.single.formula === "2d8+3" && r.single.total === 19, J(r.single));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR89 feat-fix checks passed.");
if (failures.length) process.exitCode = 1;

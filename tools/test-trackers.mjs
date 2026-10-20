/**
 * Trackers (sample-trackers PR): class resources, bows / crossbows / thrown, misfire only on firearms,
 * Recover ½, the Loading auto-load (one bolt per shot), and Jessey's 2026-10-19 Sneak Attack / Smite Lead
 * arm-BEFORE-attack toggles (hit spends + adds dice, miss spends nothing, toggle always clears, crit doubles,
 * nothing can be added after the roll).
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-trackers.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---- node: resource scaling straight from trackers.js + rules.js (rules.js is read, never written) */
const ctx = { console, setTimeout, clearTimeout }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(read("assets/data/rules.js"), ctx);
vm.runInContext(read("assets/js/trackers.js"), ctx);
const T = ctx.SSDNSTrackers;
const ab = { STR: 10, DEX: 16, CON: 10, INT: 10, WIS: 14, CHA: 16 };
function res(calling, level, subclass, extra) {
  const c = Object.assign({ calling, level, subclass: subclass || "", abilities: ab, res: {}, feats: [] }, extra || {});
  const out = {};
  T.resourcesFor(c).forEach((r) => { out[r.id] = r.kind === "unlimited" ? "inf" : (r.max != null ? r.max + "/" + r.rest : r.kind); });
  return out;
}
check("rage.l1", res("tribal-warrior", 1).rage === "2/long", J(res("tribal-warrior", 1)));
check("rage.l6", res("tribal-warrior", 6).rage === "4/long");
check("rage.l20.unlimited", res("tribal-warrior", 20).rage === "inf");
check("rageMax", T.rageMax({ calling: "tribal-warrior", level: 12, abilities: ab }) === 5 && T.rageMax({ calling: "tribal-warrior", level: 20, abilities: ab }) === Infinity);
check("wildShape.l2", res("nature-guide", 2).wildShape === "2/short");
check("wildShape.l20", res("nature-guide", 20).wildShape === "inf");
check("ironNerve.l8.none", !res("gunslinger", 8).indomitable);
check("ironNerve.9/13/17", res("gunslinger", 9).indomitable === "1/long" && res("gunslinger", 13).indomitable === "2/long" && res("gunslinger", 17).indomitable === "3/long");
check("secondCylinder.1/2", res("gunslinger", 2).actionSurge === "1/short" && res("gunslinger", 16).actionSurge === "1/short" && res("gunslinger", 17).actionSurge === "2/short");
check("creed.1/2/3", res("frontier-preacher", 2).creed === "1/short" && res("frontier-preacher", 6).creed === "2/short" && res("frontier-preacher", 18).creed === "3/short");
check("warPriest.subclass", res("frontier-preacher", 1, "shotgun-preacher-war").warPriest === "2/long" && !res("frontier-preacher", 1, "domain-of-the-faithful-sawbones-life").warPriest);
check("oathSense", res("lawman", 1).oathSense === "4/long");
check("deputize.3/11", !res("lawman", 2).deputize && res("lawman", 3).deputize === "1/long" && res("lawman", 11).deputize === "2/long");
check("rally.cha.long→short@5", res("storyteller", 4).rally === "3/long" && res("storyteller", 5).rally === "3/short");
check("storyteller.instrument", res("storyteller", 3, "", { instrument: "banjo" }).instrumentDc === "1/short" && !res("storyteller", 3, "", { instrument: "voice" }).instrumentDc);
check("ki.5e.short", res("martial-artist", 6).ki === "6/short");
check("whistle.subclass", res("martial-artist", 6, "rough-and-tumble-brawler-open-hand").whistle === "1/long" && !res("martial-artist", 6, "tong-hatchet-man-shadow").whistle);
check("tides.subclass", res("hexslinger", 1, "chaos-wild-magic").tides === "1/long");
check("dustLamp.day", res("scholar", 1).dustLamp === "1/day");
check("sneak.turn", /turn$/.test(res("gambler", 5).sneak), J(res("gambler", 5)));
check("coversFeature", T.coversFeature("Dying Weave Spellcasting") && T.coversFeature("Iron Nerve (Indomitable - 9th lvl)") && T.coversFeature("Oath Sense") && !T.coversFeature("Fighting Style"));
const jv = T.recoverHalfThrown({ count: 3, out: 3 });
check("javelin.recoverHalf", jv.count === 1 && jv.out === 0 && jv.back === 1 && jv.lostN === 2, J(jv));
check("javelin.allLost", T.recoverHalfThrown({ count: 1, out: 1 }).lost === true);
check("halfBack.javelin/spear only", T.halfBack({ id: "throwing-spear-javelin", name: "Throwing spear (javelin)" }) && !T.halfBack({ id: "hatchet-handaxe", name: "Hatchet" }) && !T.halfBack({ id: "throwing-knife-dagger", name: "Throwing knife" }));
/* source hooks (DM-sent shots carry the arms; misfire guard) */
const dmJoin = read("assets/js/dm-join.js");
check("dmjoin.fire.arms", /payload\.sneak\) TRK\.toggle\("sneak", \{ on: true, dm: true \}\)/.test(dmJoin) && /payload\.smite\) TRK\.toggle\("smite"/.test(dmJoin));
check("v2.detail.toggles", /id="detailSneak"/.test(read("dm/assets/js/v2.js")) && /payload\.smite = true/.test(read("dm/assets/js/v2.js")));
check("rules.js no crossbow injection", !/"id":\s*"light-crossbow"/.test(read("assets/data/rules.js")));

function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const port = Number(new URL(ORIGIN).port);
if (!(await portOpen(port))) { console.log("Static server is not listening on " + port + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSTrackers && window.SSDNSPlaytest && document.querySelector("#atkTarget"), { timeout: 20000 });
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    await wait(1200);
    document.querySelectorAll("dialog[open]").forEach((n) => { try { n.close(); } catch (e) {} });
    const A = window.SSDNSApp, T = window.SSDNSTrackers, P = window.SSDNSPlaytest;
    const out = {};
    const C = () => A.doc().character;
    const logs = () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent);
    const roll = async (fn, rnd) => { const rr = Math.random; Math.random = () => rnd; try { fn(); await wait(450); } finally { Math.random = rr; } };
    const noTarget = () => { const s = document.querySelector("#atkTarget"); if (s) { s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); } };
    const base = (patch) => { A.applyPatch((d) => { const c = d.character; c.name = "Ash"; c.level = 5; c.feats = []; c.items = []; c.res = {}; c.badgeState = ""; c.subclass = ""; c.abilities.DEX = 16; c.abilities.STR = 16; c.abilities.CHA = 14; c.activeConditions = []; patch(c); }); P.syncSheet(); };
    /* bows: fire and spend an arrow; natural 1 never misfires a bow */
    base((c) => { c.calling = "frontier-scout"; c.ammo = [{ type: "arrows", caliber: "", count: 20 }, { type: "bolts", caliber: "", count: 3 }];
      c.guns = [{ weapon: "longbow", equipped: true, proficient: true }, { weapon: "light-crossbow", equipped: true, proficient: true, loaded: 0 }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "throwing-spear-javelin", proficient: true, equipped: true, count: 3 }, { weapon: "hatchet-handaxe", proficient: true, equipped: true, count: 2 }, { weapon: "" }, { weapon: "" }]; });
    await wait(400); noTarget();
    await roll(() => window.SSDNSGunRoll(0), 0.0); /* nat 1 */
    out.bowNat1 = { arrows: C().ammo[0].count, jammed: !!C().guns[0].jammed, fouled: !!C().guns[0].fouled, log: logs()[0] };
    await roll(() => window.SSDNSGunRoll(0), 0.5);
    out.bow = { arrows: C().ammo[0].count, spent: C().guns[0].spentAmmo, log: logs()[0] };
    /* quiver Recover ½ */
    T.paint(); await wait(100);
    document.querySelector('[data-trk-recover="0"]').click(); await wait(200);
    out.bowRecover = { arrows: C().ammo[0].count, spent: C().guns[0].spentAmmo };
    /* crossbow: empty + bolts → auto-load; every shot spends one bolt and rolls normally; a second shot in the same action too */
    await roll(() => window.SSDNSGunRoll(1), 0.5);
    out.xb1 = { bolts: C().ammo[1].count, loaded: C().guns[1].loaded, log: logs()[0] };
    await roll(() => window.SSDNSGunRoll(1), 0.5);
    out.xb2 = { bolts: C().ammo[1].count, logs: logs().slice(0, 4) };
    await roll(() => window.SSDNSGunRoll(1), 0.5);
    await roll(() => window.SSDNSGunRoll(1), 0.5);
    out.xbOut = { bolts: C().ammo[1].count, log: logs()[0] };
    /* javelin Recover ½, hatchet Recover all */
    A.applyPatch((d) => { d.character.melee[0].out = 3; d.character.melee[1].out = 2; }); T.paint(); await wait(150);
    out.javBtn = (document.querySelector('[data-trk-recall="melee:0"]') || {}).textContent;
    out.hatBtn = (document.querySelector('[data-trk-recall="melee:1"]') || {}).textContent;
    document.querySelector('[data-trk-recall="melee:0"]').click(); await wait(150);
    document.querySelector('[data-trk-recall="melee:1"]').click(); await wait(150);
    out.jav = { count: C().melee[0].count, out: C().melee[0].out };
    out.hat = { count: C().melee[1].count, out: C().melee[1].out };

    /* Smite Lead toggle */
    base((c) => { c.calling = "lawman"; c.subclass = "oath-of-the-badge-devotion"; c.hexLead = { 1: [false, false, false, false], 2: [false, false] };
      c.guns = [{ weapon: "navy-army-ball-n-cap-revolver", equipped: true, proficient: true, loaded: 6, chambers: ["c", "c", "c", "c", "c", "c"], misStreak: 0, jammed: false }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.melee = [{ weapon: "cavalry-saber-longsword", proficient: true, equipped: true }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; });
    await wait(400); noTarget();
    const slots = () => J2(C().hexLead);
    function J2(x) { return JSON.stringify(x); }
    out.smiteUi = { arm: [...document.querySelectorAll('#trkGear [data-trk-arm="smite"]')].map((b) => b.textContent), level: [...document.querySelectorAll('#trkGear [data-trk-smite-lv] option')].map((o) => o.textContent),
      afterHitButtons: document.querySelectorAll("[data-trk-smite], [data-trk-sneak-roll]").length };
    T.toggle("smite");
    out.smiteArmed = C().res.smiteArmed;
    await roll(() => P.rollMelee(0), 0.0); /* miss */
    out.smiteMiss = { slots: slots(), armed: C().res.smiteArmed };
    T.toggle("smite");
    await roll(() => P.rollMelee(0), 0.5); /* hit */
    out.smiteHit = { slots: slots(), armed: C().res.smiteArmed, log: logs()[0] };
    out.smiteAfterRoll = { armed: C().res.smiteArmed, buttons: document.querySelectorAll("[data-trk-smite]").length };
    T.toggle("smite", { level: 2 });
    await roll(() => window.SSDNSGunRoll(0), 0.99); /* gun crit, 2nd-level slot */
    out.smiteCrit = { slots: slots(), armed: C().res.smiteArmed, log: logs()[0] };
    A.applyPatch((d) => { d.character.badgeState = "dull"; });
    out.smiteDull = T.toggle("smite");
    A.applyPatch((d) => { d.character.badgeState = ""; d.character.hexLead = { 1: [true, true, true, true], 2: [true, true] }; });
    out.smiteNoSlots = T.toggle("smite");
    /* DM-sent attack: DM arms, the sheet resolves on a hit (override of Dull allowed) */
    A.applyPatch((d) => { d.character.hexLead = { 1: [false, false, false, false], 2: [false, false] }; d.character.badgeState = "dull"; });
    T.toggle("smite", { on: true, dm: true });
    window.SSDNSGunRoll._dm = { mode: "" };
    await roll(() => window.SSDNSGunRoll(0), 0.5);
    window.SSDNSGunRoll._dm = null;
    out.smiteDm = { slots: slots(), armed: C().res.smiteArmed, log: logs()[0] };
    A.applyPatch((d) => { d.character.badgeState = ""; });
    /* map token Attacks: the toggle entry exists and flips the arm */
    out.mapActs = T.mapActions().map((a) => a.id + ":" + a.enabled);
    if (window.SSDNSMapHost && window.SSDNSMapHost.runAction) window.SSDNSMapHost.runAction("trk:smite", {});
    out.mapArmed = C().res.smiteArmed;
    const own = window.SSDNSMapHost && window.SSDNSMapHost.ownCard ? window.SSDNSMapHost.ownCard() : null;
    out.mapCard = own ? own.attacks.filter((a) => a.arm).map((a) => a.id + "|" + a.armed) : null;
    T.toggle("smite", { on: false });

    /* Sneak Attack toggle */
    base((c) => { c.calling = "gambler"; c.subclass = "the-burglar-thief"; c.ammo = [{ type: "bolts", caliber: "", count: 10 }];
      c.guns = [{ weapon: "light-crossbow", equipped: true, proficient: true, loaded: 0 }, { weapon: "" }, { weapon: "" }, { weapon: "" }];
      c.melee = [{ weapon: "cavalry-saber-longsword", proficient: true, equipped: true }, { weapon: "stiletto-dagger", proficient: true, equipped: true }, { weapon: "" }, { weapon: "" }]; });
    await wait(400); noTarget();
    out.sneakUi = { arm: [...document.querySelectorAll('#trkGear [data-trk-arm="sneak"]')].map((b) => b.textContent), rollBtn: document.querySelectorAll("[data-trk-sneak-roll]").length };
    T.toggle("sneak");
    await roll(() => window.SSDNSGunRoll(0), 0.0); /* miss */
    out.sneakMiss = { used: !!C().res.sneakUsed, armed: !!C().res.sneakArmed };
    T.toggle("sneak");
    await roll(() => window.SSDNSGunRoll(0), 0.5); /* hit */
    out.sneakHit = { used: !!C().res.sneakUsed, armed: !!C().res.sneakArmed, log: logs()[0] };
    T.paint(); await wait(50);
    out.sneakDisabled = { toggle: T.toggle("sneak"), btn: [...document.querySelectorAll('#trkGear [data-trk-arm="sneak"]')].map((b) => b.disabled) };
    A.applyPatch((d) => { d.character.res.sneakUsed = false; });
    T.toggle("sneak");
    await roll(() => P.rollMelee(0), 0.5); /* longsword: not finesse → no dice, still clears */
    out.sneakNotFinesse = { used: !!C().res.sneakUsed, armed: !!C().res.sneakArmed, log: logs().slice(0, 3).join(" | ") };
    T.toggle("sneak");
    await roll(() => P.rollMelee(1), 0.99); /* stiletto crit */
    out.sneakCrit = { used: !!C().res.sneakUsed, log: logs()[0] };
    /* free shot (no target) clears an arm without spending */
    A.applyPatch((d) => { d.character.res.sneakUsed = false; });
    T.toggle("sneak");
    window.SSDNSGunRoll._free = true;
    await roll(() => window.SSDNSGunRoll(0), 0.5);
    window.SSDNSGunRoll._free = null;
    out.sneakFree = { used: !!C().res.sneakUsed, armed: !!C().res.sneakArmed };

    /* Rage: the Enter button respects the Rages column; long rest resets */
    base((c) => { c.calling = "tribal-warrior"; c.level = 1; c.rageUsed = 0; c.raging = false; });
    await wait(300);
    const rb = document.getElementById("btnRage");
    for (let k = 0; k < 4; k++) { if (rb) { rb.click(); await wait(60); rb.click(); await wait(60); } }
    out.rage = { used: C().rageUsed, max: T.rageMax(C()) };
    T.onRest("long");
    out.rageRest = { used: C().rageUsed, raging: !!C().raging };

    /* featureUses: no double chips for features with their own tracker */
    base((c) => { c.calling = "storyteller"; c.level = 5; c.featuresCustom = false; c.featureUses = { "Dying Weave Spellcasting": { max: 1, used: 0, rest: "short" } }; });
    const lvl = document.getElementById("inLevel");
    if (lvl) { lvl.dispatchEvent(new Event("change", { bubbles: true })); }
    await wait(500);
    out.featureUses = Object.keys(C().featureUses || {});
    return out;
  });
  console.log(J(r));
  check("bow.nat1.noMisfire", r.bowNat1.arrows === 19 && !r.bowNat1.jammed && !r.bowNat1.fouled && !/misfire|jam/i.test(r.bowNat1.log), J(r.bowNat1));
  check("bow.firesAndSpends", r.bow.arrows === 18 && r.bow.spent === 2 && /Damage:/.test(r.bow.log), J(r.bow));
  check("quiver.recoverHalf", r.bowRecover.arrows === 19 && r.bowRecover.spent === 0, J(r.bowRecover));
  check("xbow.autoload.shot1", r.xb1.bolts === 2 && r.xb1.loaded === 0 && /HIT/.test(r.xb1.log) && /Damage:/.test(r.xb1.log) && /auto-loaded 1 bolt/.test(r.xb1.log), J(r.xb1));
  check("xbow.secondShot.spends+rolls+warns", r.xb2.bolts === 1 && /Damage:/.test(r.xb2.logs[0]) && r.xb2.logs.some((l) => /Loading: one shot per action/.test(l)), J(r.xb2));
  check("xbow.outOfBolts", r.xbOut.bolts === 0 && /Out of bolts/.test(r.xbOut.log), J(r.xbOut));
  check("javelin.button+recover", /Recover ½ \(\+1\)/.test(r.javBtn) && r.jav.count === 1 && r.jav.out === 0, J([r.javBtn, r.jav]));
  check("hatchet.recoverAll", /Recover all/.test(r.hatBtn) && r.hat.count === 2 && r.hat.out === 0, J([r.hatBtn, r.hat]));
  check("smite.ui.toggle+level", r.smiteUi.arm.length > 0 && /Smite next attack/.test(r.smiteUi.arm[0]) && r.smiteUi.level.length === 2 && r.smiteUi.afterHitButtons === 0, J(r.smiteUi));
  check("smite.defaultLowest", r.smiteArmed === 1);
  check("smite.miss.spendsNothing+clears", r.smiteMiss.slots === J({ 1: [false, false, false, false], 2: [false, false] }) && r.smiteMiss.armed === 0, J(r.smiteMiss));
  check("smite.hit.spends+dice+clears", r.smiteHit.slots === J({ 1: [true, false, false, false], 2: [false, false] }) && r.smiteHit.armed === 0 && /\+ 2d8 .*\(smite\)/.test(r.smiteHit.log.replace(/\n/g, " ")) , J(r.smiteHit));
  check("smite.nothingAfterRoll", r.smiteAfterRoll.armed === 0 && r.smiteAfterRoll.buttons === 0);
  check("smite.crit.doubles", /6d8/.test(r.smiteCrit.log) && r.smiteCrit.slots === J({ 1: [true, false, false, false], 2: [true, false] }) && r.smiteCrit.armed === 0, J(r.smiteCrit));
  check("smite.blocked.dull", r.smiteDull === false);
  check("smite.blocked.noSlots", r.smiteNoSlots === false);
  check("smite.dmOverride", /smite/.test(r.smiteDm.log) && r.smiteDm.slots === J({ 1: [true, false, false, false], 2: [false, false] }) && r.smiteDm.armed === 0, J(r.smiteDm));
  check("map.toggle", r.mapActs.indexOf("trk:smite:true") >= 0 && r.mapArmed === 1 && (r.mapCard == null || r.mapCard.indexOf("trk:smite|true") >= 0), J([r.mapActs, r.mapArmed, r.mapCard]));
  check("sneak.ui.toggle.noRollButton", r.sneakUi.arm.length > 0 && /Sneak Attack next attack/.test(r.sneakUi.arm[0]) && r.sneakUi.rollBtn === 0, J(r.sneakUi));
  check("sneak.miss.nothingUsed+clears", !r.sneakMiss.used && !r.sneakMiss.armed);
  check("sneak.hit.dice+used+clears", r.sneakHit.used && !r.sneakHit.armed && /\+ 3d6 .*\(sneak\)/.test(r.sneakHit.log.replace(/\n/g, " ")), J(r.sneakHit));
  check("sneak.disabledOnceUsed", r.sneakDisabled.toggle === false && r.sneakDisabled.btn.every(Boolean), J(r.sneakDisabled));
  check("sneak.notFinesse.noDice+clears", !r.sneakNotFinesse.used && !r.sneakNotFinesse.armed && !/\(sneak\)/.test(r.sneakNotFinesse.log), J(r.sneakNotFinesse));
  check("sneak.crit.doubles", r.sneakCrit.used && /6d6/.test(r.sneakCrit.log), J(r.sneakCrit));
  check("freeShot.clearsUnspent", !r.sneakFree.used && !r.sneakFree.armed, J(r.sneakFree));
  check("rage.cap.byTable", r.rage.max === 2 && r.rage.used === 2, J(r.rage));
  check("rage.longRest", r.rageRest.used === 0 && !r.rageRest.raging, J(r.rageRest));
  check("featureUses.noDoubleChip", r.featureUses.indexOf("Dying Weave Spellcasting") < 0 && !r.featureUses.some((k) => /Rally Word/.test(k)), J(r.featureUses));
  check("no page errors", !errs.length, errs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("FAILED: " + failures.join(", ")); process.exit(1); }
console.log("ALL OK");

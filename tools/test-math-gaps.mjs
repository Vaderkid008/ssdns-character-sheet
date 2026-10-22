/**
 * Small math gaps (sheet 0.3.105 / DMCC 0.2.118):
 * Alert (+5 init), Tough (+2 HP/level), Observant (+5 passive Perception and Investigation),
 * Medium Armor Master (Dex cap 3 in medium armor), Demon Hide (AC 13 + Dex unarmored, +1 HP/level),
 * crit range (Champion 19-20 / 18-20, Pistolero Dead Eye 19-20 in normal range) on the sheet and the DM verdict,
 * speed (Fast Movement, Dust Runner, Mobile, slotted gear), Sharpshooter / GWM -5/+10 toggle,
 * Versatile two-handed grip.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-math-gaps.mjs
 */
import net from "node:net";
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
const ORIGIN = "http://127.0.0.1:8765";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

/* ---- part 1: the shared verdict helpers (DM side uses these for hidden-AC attacks) ---- */
{
  const sb = { console, Math, Date, JSON, Number, String, Object, Array, isFinite, parseInt };
  sb.window = sb; sb.globalThis = sb;
  sb.document = { getElementById() { return null; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(root, "assets/js/apply-guard.js"), "utf8"), sb);
  const A = sb.SSDNSApplied;
  const v19 = A.attackVerdict({ nat: 19, total: 14, ac: 16, critMin: 19 });
  check("verdict.critRangeHits", !v19.miss && v19.crit && v19.verdict === "CRIT", J(v19));
  const v19n = A.attackVerdict({ nat: 19, total: 14, ac: 16 });
  check("verdict.plain19Misses", v19n.miss && !v19n.crit, J(v19n));
  const v18 = A.attackVerdict({ nat: 18, total: 25, ac: 16, critMin: 19 });
  check("verdict.18NotCrit", !v18.miss && !v18.crit, J(v18));
  const v1 = A.attackVerdict({ nat: 1, total: 30, ac: 10, critMin: 18 });
  check("verdict.nat1StillMisses", v1.miss, J(v1));
  const card = A.attackBreakdown({ who: "Ace", target: "Bandit", weapon: "Colt", nat: 19, parts: [{ label: "DEX", value: 3 }], total: 22, ac: 25, critMin: 19, damage: { faces: [3, 4], formula: "2d6", parts: [], total: 7 } });
  check("card.critRangeHits", /CRIT/.test(card.dmText) && !/MISS/.test(card.dmText), card.dmText);
  const v2src = fs.readFileSync(path.join(root, "dm/assets/js/v2.js"), "utf8");
  check("dm.passesCritMin", /attackVerdict\(\{ nat: req\.nat, total: req\.hitTotal, ac: ac, sfx: req\.sfx, critMin: req\.critMin \}\)/.test(v2src) && /critMin: req\.critMin,\n\s*misfire/.test(v2src), "v2 pending-attack resolution");
  const joinSrc = fs.readFileSync(path.join(root, "assets/js/dm-join.js"), "utf8");
  check("join.writesCritMin", /row\.critMin = Number\(entry\.critMin\)/.test(joinSrc), "dm-join writeAttack");
}

function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
if (!(await portOpen(8765))) { console.log("Static server is not listening on 8765 (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.applyPatch && window.SSDNSApp.critMin && window.SSDNSGunRoll && document.querySelector("#atkTarget"), { timeout: 20000 });
  const r = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const A = window.SSDNSApp;
    const C = () => A.doc().character;
    const set = (fn) => A.applyPatch((d) => fn(d.character));
    const out = {};
    await wait(800);
    set((c) => { c.name = "Ace"; c.lineage = "nomads"; c.sublineage = ""; c.calling = "gunslinger"; c.subclass = ""; c.level = 1; c.feats = [];
      c.abilities = { STR: 16, DEX: 18, CON: 14, INT: 10, WIS: 12, CHA: 10 }; c.armor = ""; c.shield = false; c.speed = ""; c.speedAuto = true; c.hpAuto = true;
      c.powerAttack = false; c.fightingStyle = ""; c.overrides = {}; });
    await wait(150);
    const base = A.compute();
    out.base = { init: base.initiative, passive: base.passive, inv: base.passiveInv, ac: base.ac, speed: C().speed };
    set((c) => { c.feats = ["alert"]; });
    out.alert = A.compute().initiative;
    /* Tough: +2 per level on the auto HP */
    set((c) => { c.feats = []; c.level = 4; });
    A.applyAutoHp(); const hp0 = Number(C().hpMax);
    set((c) => { c.feats = ["tough"]; });
    A.applyAutoHp(); out.tough = { hp0, hp1: Number(C().hpMax) };
    /* Observant */
    set((c) => { c.feats = ["observant"]; });
    const ob = A.compute();
    await wait(100);
    out.observant = { passive: ob.passive, inv: ob.passiveInv, invShown: (document.querySelector("[data-calc='passiveInv']") || {}).value };
    /* Medium Armor Master: hide wrap 12 + Dex (max 2) -> max 3 */
    set((c) => { c.feats = []; c.armor = "hide-wrap"; });
    const m0 = A.compute().ac;
    set((c) => { c.feats = ["medium-armor-master"]; });
    out.mam = { before: m0, after: A.compute().ac };
    /* Demon Hide */
    set((c) => { c.feats = []; c.armor = ""; c.calling = "hexslinger"; c.subclass = "demon-blood-draconic"; c.level = 4; });
    const dh = A.compute();
    A.applyAutoHp(); const dhHp = Number(C().hpMax);
    set((c) => { c.subclass = ""; });
    A.applyAutoHp(); const plainHp = Number(C().hpMax);
    const plainAc = A.compute().ac;
    set((c) => { c.subclass = "demon-blood-draconic"; c.armor = "hide-wrap"; });
    out.demon = { ac: dh.ac, plainAc, hp: dhHp, plainHp, armoredAc: A.compute().ac };
    /* crit range */
    const pistol = window.SSDNS_RULES.firearms.filter((w) => w.group === "pistol")[0];
    set((c) => { c.calling = "gunslinger"; c.subclass = "deadeye-champion-champion"; c.armor = ""; c.level = 2; c.feats = []; });
    out.crit = { l2: A.critMin({ weapon: pistol }) };
    set((c) => { c.level = 3; }); out.crit.l3 = A.critMin({ weapon: pistol }); out.crit.l3melee = A.critMin({ melee: true });
    set((c) => { c.level = 15; }); out.crit.l15 = A.critMin({ weapon: pistol });
    set((c) => { c.subclass = ""; c.level = 5; c.feats = ["pistolero"]; });
    out.crit.deadEyeNormal = A.critMin({ weapon: pistol, band: "normal", rangeApply: true });
    out.crit.deadEyeLong = A.critMin({ weapon: pistol, band: "long", rangeApply: true });
    out.crit.deadEyeNoMap = A.critMin({ weapon: pistol });
    out.crit.deadEyeRifle = A.critMin({ weapon: window.SSDNS_RULES.firearms.filter((w) => w.group !== "pistol")[0], band: "normal", rangeApply: true });
    /* a Champion's natural 19 on the sheet is a CRIT and doubles the dice */
    set((c) => { c.feats = []; c.subclass = "deadeye-champion-champion"; c.level = 3; c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns[0] = Object.assign(c.guns[0] || {}, { weapon: "navy-army-ball-n-cap-revolver", equipped: true, proficient: true, loaded: 6, chambers: ["c", "c", "c", "c", "c", "c"], misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
      c.activeConditions = []; });
    await wait(200);
    const sel = document.querySelector("#atkTarget");
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#globalAdv").value = "";
    const realRandom = Math.random;
    Math.random = () => 0.9; /* every d20 = 19 */
    window.SSDNSGunRoll(0, 0);
    await wait(700);
    Math.random = realRandom;
    const item = document.querySelector(".log-item");
    out.gunCrit = item ? item.textContent : "";
    /* speed */
    set((c) => { c.subclass = ""; c.calling = "tribal-warrior"; c.level = 4; c.armor = ""; c.feats = []; c.speed = ""; c.speedAuto = true; });
    out.speed = { tw4: Number(C().speed) };
    set((c) => { c.level = 5; }); out.speed.tw5 = Number(C().speed);
    set((c) => { c.armor = "ring-coat"; }); out.speed.tw5heavy = Number(C().speed);
    set((c) => { c.armor = ""; c.calling = "martial-artist"; c.level = 6; }); out.speed.ma6 = Number(C().speed);
    set((c) => { c.level = 18; }); out.speed.ma18 = Number(C().speed);
    const spTitle = () => (document.querySelector("[data-f='character.speed']") || {}).title || "";
    set((c) => { c.armor = "hide-wrap"; }); out.speed.maArmor = Number(C().speed); out.speed.maArmorTitle = spTitle();
    set((c) => { c.armor = ""; c.shield = true; }); out.speed.maShield = Number(C().speed); out.speed.maShieldTitle = spTitle();
    set((c) => { c.shield = false; }); out.speed.maBare = Number(C().speed); out.speed.maBareTitle = spTitle();
    set((c) => { c.calling = "gunslinger"; c.level = 1; c.feats = ["mobile"]; }); out.speed.mobile = Number(C().speed);
    out.speed.title = (document.querySelector("[data-f='character.speed']") || {}).title || "";
    set((c) => { c.feats = []; }); out.speed.back = Number(C().speed);
    set((c) => { c.speed = 25; c.speedAutoValue = null; c.feats = ["mobile"]; }); out.speed.legacyKept = Number(C().speed);
    set((c) => { c.speed = 45; c.speedAuto = false; }); out.speed.typedKept = Number(C().speed);
    set((c) => { c.speedAuto = true; c.speed = ""; c.feats = []; });
    /* Sharpshooter -5/+10 */
    const wrap = document.querySelector("#powerAttackWrap");
    out.power = { hiddenNoFeat: !!(wrap && wrap.hidden) };
    const g0 = A.compute().guns[0];
    set((c) => { c.feats = ["sharpshooter"]; c.powerAttack = false; });
    out.power.shown = !!(wrap && !wrap.hidden);
    out.power.label = wrap ? wrap.textContent.trim() : "";
    const box = document.querySelector("#chkPowerAttack");
    box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(100);
    const g1 = A.compute().guns[0];
    out.power.gun = { atk0: g0.atk, atk1: g1.atk, dmg0: g0.dmg, dmg1: g1.dmg, stored: C().powerAttack, parts: g1.parts.map((p) => p.label + p.value).join(","), shownAtk: (document.querySelector("[data-calc='gunAtk.0']") || {}).value };
    /* Free shot ignores the toggle: d20 + bonus without the -5 */
    sel.value = "__free"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    set((c) => { c.guns[0].loaded = 6; c.guns[0].chambers = ["c", "c", "c", "c", "c", "c"]; c.guns[0].jammed = false; c.guns[0].misStreak = 0; });
    const rr = Math.random; Math.random = () => 0.6; /* d20 = 13 */
    window.SSDNSGunRoll(0, 0);
    await wait(700);
    Math.random = rr;
    const fi = document.querySelector(".log-item");
    out.power.free = fi ? fi.textContent : "";
    out.power.freeToggle = C().powerAttack;
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    set((c) => { c.guns[0].proficient = false; });
    out.power.unproficient = A.compute().guns[0].atk;
    set((c) => { c.guns[0].proficient = true; });
    /* GWM: heavy melee only */
    set((c) => { c.feats = ["great-weapon-master"]; c.calling = "tribal-warrior"; c.level = 1; c.powerAttack = false;
      c.melee = [{ weapon: "buffalo-axe-greataxe", proficient: true, equipped: true }, { weapon: "cavalry-saber-longsword", proficient: true, equipped: true }, {}, {}]; });
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
    await wait(100);
    const mtxt = (i) => ({ atk: (document.querySelector("[data-melee-atk='" + i + "']") || {}).textContent, dmg: (document.querySelector("[data-melee-dmg='" + i + "']") || {}).textContent });
    out.gwm = { off: [mtxt(0), mtxt(1)], label: wrap ? wrap.textContent.trim() : "" };
    set((c) => { c.powerAttack = true; }); await wait(50);
    out.gwm.on = [mtxt(0), mtxt(1)];
    /* Versatile two hands */
    set((c) => { c.powerAttack = false; c.feats = []; });
    const grip = document.querySelector("[data-melee-grip='1']");
    out.vers = { gripOnSaber: !!grip, gripOnAxe: !!document.querySelector("[data-melee-grip='0']"), one: mtxt(1).dmg };
    if (grip) { grip.checked = true; grip.dispatchEvent(new Event("change", { bubbles: true })); }
    await wait(100);
    out.vers.two = mtxt(1).dmg; out.vers.stored = !!(C().melee[1] && C().melee[1].twoHand);
    set((c) => { c.shield = true; }); await wait(50);
    out.vers.shield = mtxt(1).dmg; out.vers.gripDisabled = !!(document.querySelector("[data-melee-grip='1']") || {}).disabled;
    set((c) => { c.shield = false; c.fightingStyle = "dueling"; c.calling = "lawman"; c.level = 2; }); await wait(50);
    out.vers.duelTwo = mtxt(1).dmg;
    set((c) => { c.melee[1].twoHand = false; }); await wait(50);
    out.vers.duelOne = mtxt(1).dmg;
    return out;
  });
  check("alert.init", r.alert === r.base.init + 5, J([r.base, r.alert]));
  check("tough.hp", r.tough.hp1 === r.tough.hp0 + 8, J(r.tough));
  check("observant.passive", r.observant.passive === r.base.passive + 5, J([r.base, r.observant]));
  check("observant.investigation", r.observant.inv === r.base.inv + 5 && String(r.observant.invShown) === String(r.observant.inv), J([r.base, r.observant]));
  check("mam.dexCap3", r.mam.before === 14 && r.mam.after === 15, J(r.mam));
  check("demonHide.ac", r.demon.ac === 13 + 4 && r.demon.plainAc === 14, J(r.demon));
  check("demonHide.armorWins", r.demon.armoredAc === 14, J(r.demon));
  check("demonHide.hp", r.demon.hp === r.demon.plainHp + 4, J(r.demon));
  check("crit.champion", r.crit.l2 === 20 && r.crit.l3 === 19 && r.crit.l3melee === 19 && r.crit.l15 === 18, J(r.crit));
  check("crit.deadEye", r.crit.deadEyeNormal === 19 && r.crit.deadEyeLong === 20 && r.crit.deadEyeNoMap === 20 && r.crit.deadEyeRifle === 20, J(r.crit));
  check("crit.sheetGun19", /CRIT/.test(r.gunCrit) && !/MISS/.test(r.gunCrit), r.gunCrit);
  check("speed.fastMovement", r.speed.tw4 === 30 && r.speed.tw5 === 40 && r.speed.tw5heavy === 30, J(r.speed));
  check("speed.dustRunner", r.speed.ma6 === 45 && r.speed.ma18 === 60, J(r.speed));
  check("speed.dustRunnerArmorOff", r.speed.maArmor === 30 && /Dust Runner \+30 is off \(armor on\)/.test(r.speed.maArmorTitle), J(r.speed));
  check("speed.dustRunnerShieldOff", r.speed.maShield === 30 && /Dust Runner \+30 is off \(shield on\)/.test(r.speed.maShieldTitle), J(r.speed));
  check("speed.dustRunnerBareOn", r.speed.maBare === 60 && /\+ 30 Dust Runner = 60 ft/.test(r.speed.maBareTitle) && !/is off/.test(r.speed.maBareTitle), J(r.speed));
  check("speed.mobile", r.speed.mobile === 40 && r.speed.back === 30 && /Mobile/.test(r.speed.title), J(r.speed));
  check("speed.overridesKept", r.speed.legacyKept === 25 && r.speed.typedKept === 45, J(r.speed));
  check("power.toggleGated", r.power.hiddenNoFeat && r.power.shown && /Sharpshooter/.test(r.power.label), J(r.power));
  const a0 = parseInt(r.power.gun.atk0, 10), a1 = parseInt(r.power.gun.atk1, 10);
  check("power.sharpshooterAtk", r.power.gun.stored === true && a1 === a0 - 5 && /Sharpshooter-5/.test(r.power.gun.parts) && parseInt(r.power.gun.shownAtk, 10) === a1, J(r.power.gun));
  const flat = (s) => { const m = String(s).match(/([+-]\s*\d+)/); return m ? parseInt(m[1].replace(/\s/g, ""), 10) : 0; };
  check("power.sharpshooterDmg", flat(r.power.gun.dmg1) === flat(r.power.gun.dmg0) + 10, J(r.power.gun));
  { const want = a0; const m = String(r.power.free).match(/shoots freely · (?:13)?1d20([+-]\d+) = (\d+)/);
    check("power.freeShotIgnoresToggle", r.power.freeToggle === true && !!m && parseInt(m[1], 10) === want && parseInt(m[2], 10) === 13 + want, J([a0, r.power.free])); }
  check("power.needsProficiency", parseInt(r.power.unproficient, 10) === a0 - 2, J([a0, r.power.unproficient]));
  check("gwm.heavyOnly", parseInt(r.gwm.on[0].atk, 10) === parseInt(r.gwm.off[0].atk, 10) - 5 && flat(r.gwm.on[0].dmg) === flat(r.gwm.off[0].dmg) + 10 && r.gwm.on[1].atk === r.gwm.off[1].atk && r.gwm.on[1].dmg === r.gwm.off[1].dmg, J(r.gwm));
  check("gwm.label", /GWM/.test(r.gwm.label), r.gwm.label);
  check("versatile.gripOnlyVersatile", r.vers.gripOnSaber && !r.vers.gripOnAxe, J(r.vers));
  check("versatile.twoHands", /^1d8/.test(r.vers.one) && /^1d10/.test(r.vers.two) && r.vers.stored, J(r.vers));
  check("versatile.shieldBlocks", /^1d8/.test(r.vers.shield) && r.vers.gripDisabled, J(r.vers));
  check("versatile.duelingOneHandOnly", /^1d10/.test(r.vers.duelTwo) && /^1d8/.test(r.vers.duelOne) && flat(r.vers.duelOne) === flat(r.vers.duelTwo) + 2, J(r.vers));
  check("noPageErrors", errs.length === 0, J(errs));
} finally {
  await browser.close();
}
if (failures.length) { console.log("FAILED: " + failures.join(", ")); process.exit(1); }
console.log("ALL PASS (math gaps)");

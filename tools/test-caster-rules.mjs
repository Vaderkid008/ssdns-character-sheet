/**
 * L0200 Caster Gun rules (DND Bot lock; Jessey rulings 2026-10-20 8:20-8:25 PM CT; assets/js/caster-rules.js).
 *  - Caster Guns take any cartridge (the Big Fifty .50-90 pool included), never shotgun shells (UI + logic), with an
 *    override path for a later relic shotgun caster (g.allowShells / w.allowShells / w.relicShotgun / SSDNSItemUI casterShells).
 *  - A .50-90 from a Caster Gun misfires on 1-5. Each such misfire rolls 1d6 (logged); a 1 explodes it whatever the streak:
 *    2d6 fire to the shooter (rolled, logged, off HP) and the gun is Wrecked.
 *  - Wrecked: can't fire, can't be cast through (Focus cast block), card line "Wrecked — repair: traveling merchant only
 *    (not a gunsmith)". The plain DM Repair leaves it; the DMCC Merchant repair clears it.
 *   node tools/test-caster-rules.mjs        (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-caster-rules.mjs   also saves caster-rules-*.png
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js", "assets/js/caster-rules.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const CR = sb.SSDNSCasterRules, R = sb.SSDNS_RULES, K = sb.SSDNSKits, F = sb.SSDNSFocus, D = sb.SSDNSDoll;
const WPN = {}; [].concat(R.firearms, R.casterGuns).forEach((w) => { WPN[w.id] = w; });
const bs = WPN.blacksnake, hog = WPN.hognose, coach = WPN["double-barrel-coach-gun"] || R.firearms.find((w) => w.scatter);

/* 1. shells */
check("caster.detect", CR.isCaster(bs) && CR.isCaster(hog) && !CR.isCaster(coach) && CR.isCaster({ id: "x", group: "pistol" }, { caster: true }) && !CR.isCaster({ id: "borrowed-iron", group: "caster" }));
check("shell.blocked", CR.shellBlock(bs, {}, { type: "buck" }) === CR.SHELL_NOTE && CR.shellBlock(hog, {}, "slug") === CR.SHELL_NOTE, CR.shellBlock(bs, {}, { type: "buck" }));
check("shell.noteWords", /don't take shotgun shells/.test(CR.SHELL_NOTE) && /Any cartridge/.test(CR.SHELL_NOTE));
check("shell.cartridgeFine", CR.shellBlock(bs, {}, { type: "cartridge" }) === "" && CR.shellBlock(bs, {}, { type: "bigfifty" }) === "");
check("shell.ordinaryShotgunUnchanged", CR.shellBlock(coach, {}, { type: "buck" }) === "" && CR.takesShells(coach, {}));
check("shell.override.gunFlag", CR.takesShells(bs, { allowShells: true }) && CR.shellBlock(bs, { allowShells: true }, "buck") === "");
check("shell.override.weaponFlag", CR.takesShells({ id: "relic-x", group: "caster", hexShells: true, relicShotgun: true }, {}));
sb.SSDNSItemUI.register("relic-coach-caster", { casterShells: true });
check("shell.override.itemUI", CR.takesShells({ id: "relic-coach-caster", group: "caster", hexShells: true }, {}) && !CR.takesShells(bs, {}));
sb.SSDNSItemUI.register("relic-fn", { casterShells: (w, g) => !!(g && g.relic) });
check("shell.override.itemUIfn", CR.takesShells({ id: "relic-fn", group: "caster" }, { relic: true }) && !CR.takesShells({ id: "relic-fn", group: "caster" }, {}));
check("shell.override.gunFalseWins", !CR.takesShells({ id: "relic-coach-caster", group: "caster" }, { allowShells: false }));

/* 2. Big Fifty misfire range + d6 */
check("bf.round", CR.isBigFiftyRound("k:bigfifty:.50-90:heavy") && CR.isBigFiftyRound("k:cartridge:.50-90:heavy") && !CR.isBigFiftyRound("k:cartridge:.357:medium") && CR.isBigFiftyRound("c", { chamber: "heavy|.50-90" }) && !CR.isBigFiftyRound("c", { chamber: "medium|.357" }));
check("bf.ceiling", CR.misfireCeiling(bs, {}, "k:bigfifty:.50-90:heavy", 1) === 5 && CR.misfireCeiling(bs, {}, "k:cartridge:.357:medium", 1) === 1 && CR.misfireCeiling(WPN["bison-big-fifty-buffalo-rifle"], {}, "k:bigfifty:.50-90:", 3) === 3);
check("bf.rulesTable", bs.rifleRounds[".50-90"].misfire === "1–5" && hog.rifleRounds[".50-90"].misfire === "1–5");
check("bf.needsRoll", CR.needsBoomRoll(bs, {}, "k:bigfifty:.50-90:heavy", true) && !CR.needsBoomRoll(bs, {}, "k:bigfifty:.50-90:heavy", false) && !CR.needsBoomRoll(bs, {}, "k:cartridge:.357:", true) && !CR.needsBoomRoll(WPN["bison-big-fifty-buffalo-rifle"], {}, "k:bigfifty:.50-90:", true));
const seq = (arr) => { let k = 0; return () => arr[k++ % arr.length]; };
let g = { weapon: "blacksnake", misStreak: 1, jammed: true };
let r = CR.rollBoom(g, seq([0.5]));
check("d6.holds", r.d6 === 4 && !r.exploded && !g.wrecked && g.jammed === true, J([r, g]));
g = { weapon: "blacksnake", misStreak: 1, jammed: true, pendingD4: true };
r = CR.rollBoom(g, seq([0.0, 0.5, 0.99]));
check("d6.explodes", r.d6 === 1 && r.exploded && J(r.fire) === J([4, 6]) && r.fireTotal === 10, J(r));
check("d6.wrecked", g.wrecked === true && g.jammed === false && g.pendingD4 === false && g.misStreak === 1, J(g));
check("d6.anyStreak", CR.rollBoom({ misStreak: 0 }, seq([0])).exploded === true);
check("line.d6", CR.d6Line("Dust", "Blacksnake", 3) === "Dust · Blacksnake · Big Fifty misfire in a Caster Gun: 1d6 = 3 — holds");
check("line.boom", /2d6 fire = 4\+6 = 10 to Dust\. The gun is Wrecked \(repair: traveling merchant only\)\./.test(CR.boomLine("Dust", "Blacksnake", [4, 6], 10)));

/* 3. Wrecked */
check("wrecked.note", CR.WRECKED_NOTE === "Wrecked \u2014 repair: traveling merchant only (not a gunsmith)");
check("wrecked.cantFire", /can't fire/.test(CR.CANT_FIRE) && /traveling merchant/.test(CR.CANT_FIRE) && /never a gunsmith/.test(CR.CANT_FIRE));
const hex = () => { const c = K.apply(K.blankCharacter(), "hexslinger", {}); c.calling = "hexslinger"; return c; };
const hx = hex();
check("cast.okBefore", F.castBlock(hx) === "" && F.castGunIndex(hx) === 0);
hx.guns[0].wrecked = true;
check("cast.blockedWrecked", F.castBlock(hx) === CR.CANT_CAST && F.castGunIndex(hx) === -1, F.castBlock(hx));
const fsW = D.focusState(hx);
check("focus.wreckedNote", fsW && fsW.wrecked && fsW.canCast === false && /Wrecked/.test(fsW.note), J(fsW));
/* a working Caster Gun in the other pistol slot still casts */
const two = hex(); two.guns[0].wrecked = true; two.guns[1] = { weapon: "hognose", proficient: true, chambers: [], equipped: true }; two.dollWeapons = { revolver_1: 0, revolver_2: 1 };
check("cast.otherGunWorks", F.castBlock(two) === "" && F.castGunIndex(two) === 1, F.castBlock(two) + " " + F.castGunIndex(two));
/* Pact Seeker untouched: the Borrowed Iron isn't a Caster Gun, and nothing assumes where it sits */
const ps = K.apply(K.blankCharacter(), "pact-seeker", {}); ps.calling = "pact-seeker";
check("pact.untouched", F.castBlock(ps) === "" && !CR.isCaster({ id: "borrowed-iron", group: "caster", hexShells: true }));
/* merchant repair */
const mg = { wrecked: true, jammed: true, misStreak: 3, lockedChambers: [1], dirty: true };
check("merchant.clears", CR.merchantRepair(mg) === true && !mg.wrecked && !mg.jammed && mg.misStreak === 0 && mg.lockedChambers.length === 0 && !mg.dirty, J(mg));
/* the plain repair (misfire.js) never touches Wrecked */
vm.runInContext(read("assets/js/misfire.js"), sb, { filename: "misfire.js" });
const rep = sb.SSDNSMisfire.repair({ wrecked: true, jammed: true });
check("repair.plainNoWreckedKey", rep.wrecked === undefined);
check("repair.sheetKeepsWrecked", !/wrecked/.test((read("assets/js/app.js").match(/function repairGun\(i, hint\) \{[\s\S]*?\n  \}/) || [""])[0]));
/* wiring */
const app = read("assets/js/app.js"), sx = read("assets/js/sheet-extras.js"), dmcc = read("dm/assets/js/dmcc.js"), dj = read("assets/js/dm-join.js");
check("wire.indexScript", /assets\/js\/caster-rules\.js\?v=/.test(read("index.html")));
check("wire.spendRound", /g\.wrecked && window\.SSDNSCasterRules\) return \{ ok: false, wrecked: true/.test(app));
check("wire.poolsBigFifty", /a\.type === "cartridge" \|\| a\.type === "bigfifty"/.test(app));
check("wire.rollAndFree", (sx.match(/SSDNSCasterRules\.afterMisfire\(/g) || []).length === 2 && (sx.match(/SSDNSCasterRules\.misfireCeiling\(/g) || []).length === 2);
check("wire.castThroughGun", /c\.guns\[i\]\.wrecked && root\.SSDNSCasterRules/.test(sx));
check("wire.dmccMerchant", /data-gun-op="merchant"/.test(dmcc) && /payload\.op === "merchant"/.test(dmcc) && /payload\.op === "merchant" && root\.SSDNSCasterRules/.test(dj));
check("wire.snapshot", /wrecked: !!g\.wrecked/.test(dj) && /wrecked: !!g\.wrecked/.test(read("map/ssdns-map-host.js")));
check("noRulesChange", !/wrecked/.test(read("database.rules.json")));

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
function portOpen(port, host) { return new Promise((res) => { const s = net.connect({ port, host }, () => { s.end(); res(true); }); s.on("error", () => res(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) {
  console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)");
  process.exit(1);
}
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function shot(pg, sel, file) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await pg.addStyleTag({ content: ".toast,#toast{display:none!important}" });
  await sleep(200);
  const el = await pg.$(sel);
  try { if (el) await el.screenshot({ path: path.join(SHOTS, file) }); } catch (e) { console.log("(screenshot skipped: " + file + " — " + e.message + ")"); }
}
/* the log feed sits in a drawer; copy its newest rows into a visible box for the sample */
async function logShot(pg, n, file) {
  if (!SHOTS) return;
  await pg.evaluate((n) => {
    const old = document.getElementById("shotLog"); if (old) old.remove();
    const box = document.createElement("div"); box.id = "shotLog"; box.className = "log-feed";
    box.style.cssText = "position:fixed;left:20px;top:20px;width:620px;z-index:99999;background:#f4ead3;border:2px solid #5a3b1a;padding:10px;border-radius:6px;";
    Array.from(document.querySelectorAll("#logFeed .log-item")).slice(0, n).reverse().forEach((x) => box.appendChild(x.cloneNode(true)));
    document.body.appendChild(box);
  }, n);
  await shot(pg, "#shotLog", file);
  await pg.evaluate(() => { const b = document.getElementById("shotLog"); if (b) b.remove(); });
}
try {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1100, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSCasterRules && window.SSDNSGunRoll && window.SSDNSFocus && window.SSDNSKits, { timeout: 20000 });
  await sleep(1000);
  const SETUP = () => window.SSDNSApp.applyPatch((d) => {
    const c = d.character; c.name = "Dust"; c.calling = "hexslinger"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
    window.SSDNSKits.apply(c, "hexslinger", {}); c.kitStamp = "hexslinger"; c.cantrips = ["Fire Bolt"];
    c.hpMax = 24; c.hpCurrent = 24; c.hpTemp = 0;
    c.ammo = [{ type: "buck", caliber: "12 ga", count: 10 }, { type: "bigfifty", caliber: ".50-90", count: 10 }, { type: "cartridge", caliber: ".357", count: 20 }];
    Object.assign(c.guns[0], { weapon: "blacksnake", equipped: true, chamber: "medium|.357", tier: "medium", loaded: 0, chambers: ["", "", "", "", "", ""], misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, wrecked: false, ammoPool: "" });
  });
  await pg.evaluate(SETUP);
  await sleep(600);
  await pg.evaluate(() => { const t = document.querySelector("#tab-equip, #tab-gear"); if (t) t.click(); });
  await sleep(500);

  /* shells: not in the pool list, a note says why, a forced load is refused */
  const sh = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, c = () => A.doc().character;
    const choices = A.ammoChoices(0);
    const note = document.getElementById("shellNote0");
    const btn = document.createElement("button"); btn.setAttribute("data-takepool", "0:0:0"); btn.textContent = "x";
    document.querySelector('.gun[data-row="0"]').appendChild(btn); btn.click(); await wait(300); btn.remove();
    const g = c().guns[0];
    const logs = Array.from(document.querySelectorAll(".log-item")).map((x) => x.textContent);
    return { choices: choices.map((x) => x.type), note: note ? { text: note.textContent, hidden: note.hidden } : null, loaded: g.loaded, chambers: g.chambers, buck: c().ammo[0].count, log: logs.find((t) => /shotgun shells/.test(t)) || "" };
  });
  check("ui.shell.notListed", sh.choices.indexOf("buck") < 0 && sh.choices.indexOf("bigfifty") >= 0 && sh.choices.indexOf("cartridge") >= 0, J(sh.choices));
  check("ui.shell.note", sh.note && !sh.note.hidden && /don't take shotgun shells/.test(sh.note.text), J(sh.note));
  check("ui.shell.forcedLoadRefused", Number(sh.loaded) === 0 && sh.buck === 10 && !sh.chambers.some(Boolean) && /don't take shotgun shells/.test(sh.log), J(sh));
  await shot(pg, '.gun[data-row="0"]', "caster-rules-shell-blocked.png");

  /* load Big Fifty rounds (pool 1) and fire: d20 = 4 (misfire only because of the .50-90 1-5 range), d6 = 3 holds */
  const m1 = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, c = () => A.doc().character;
    const btn = document.createElement("button"); btn.setAttribute("data-takepool", "0:1:0"); btn.textContent = "x";
    document.querySelector('.gun[data-row="0"]').appendChild(btn); btn.click(); await wait(300); btn.remove();
    const loaded = { loaded: c().guns[0].loaded, chambers: c().guns[0].chambers.slice(), left: c().ammo[1].count };
    const sel = document.querySelector("#atkTarget"); if (sel) { sel.value = "__free"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    const realRandom = Math.random; Math.random = () => 0.15; /* d20 = 4 */
    window.SSDNSCasterRules.rng = (() => { const s = [0.4]; let k = 0; return () => s[k++ % s.length]; })(); /* d6 = 3 */
    window.SSDNSGunRoll(0, 0);
    await wait(800);
    Math.random = realRandom;
    const g = c().guns[0];
    const logs = Array.from(document.querySelectorAll(".log-item")).map((x) => x.textContent);
    return { loaded, streak: g.misStreak, jammed: g.jammed, wrecked: !!g.wrecked, hp: Number(document.querySelector("#inHPCur").value), d6: logs.find((t) => /1d6 = 3/.test(t)) || "", logs: logs.slice(0, 4) };
  });
  check("ui.bf.loaded", Number(m1.loaded.loaded) === 6 && m1.loaded.chambers.every((t) => /^k:bigfifty:\.50-90:heavy$/.test(t)) && m1.loaded.left === 4, J(m1.loaded));
  check("ui.bf.misfireOn4", m1.streak === 1 && m1.jammed === true, J(m1));
  check("ui.d6.logged", /Big Fifty misfire in a Caster Gun: \d?1d6 = 3 — holds/.test(m1.d6) && !m1.wrecked && m1.hp === 24, J(m1));
  await logShot(pg, 4, "caster-rules-misfire-d6.png");

  /* a plain .357 at d20 = 4 does not misfire and rolls no d6 */
  const plain = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, c = () => A.doc().character;
    A.applyPatch((d) => { const g = d.character.guns[0]; g.jammed = false; g.misStreak = 0; g.chambers = ["k:cartridge:.357:medium", "", "", "", "", ""]; g.loaded = 1; });
    await wait(300);
    const n0 = Array.from(document.querySelectorAll(".log-item")).filter((x) => /1d6 =/.test(x.textContent)).length;
    const realRandom = Math.random; Math.random = () => 0.15;
    window.SSDNSGunRoll(0, 0); await wait(700); Math.random = realRandom;
    const n1 = Array.from(document.querySelectorAll(".log-item")).filter((x) => /1d6 =/.test(x.textContent)).length;
    return { streak: c().guns[0].misStreak, jammed: c().guns[0].jammed, d6: n1 - n0 };
  });
  check("ui.plain357.noMisfireNoD6", plain.streak === 0 && !plain.jammed && plain.d6 === 0, J(plain));

  /* explosion: streak 0 (first misfire), d6 = 1 -> 2d6 fire (2+5 = 7) off HP, Wrecked */
  const ex = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, c = () => A.doc().character;
    A.applyPatch((d) => { const g = d.character.guns[0]; g.jammed = false; g.misStreak = 0; g.chambers = ["k:bigfifty:.50-90:heavy", "k:bigfifty:.50-90:heavy", "", "", "", ""]; g.loaded = 2; });
    await wait(300);
    const realRandom = Math.random; Math.random = () => 0.15;
    window.SSDNSCasterRules.rng = (() => { const s = [0.0, 0.2, 0.7]; let k = 0; return () => s[k++ % s.length]; })(); /* d6 1, fire 2 + 5 */
    /* the regular attack path this time (No target, no enemies listed -> straight to the roll) */
    const sel = document.querySelector("#atkTarget"); if (sel) { sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true })); }
    window.SSDNSGunRoll(0, 0); await wait(1500); Math.random = realRandom;
    const g = c().guns[0];
    const logs = Array.from(document.querySelectorAll(".log-item")).map((x) => x.textContent);
    const row = document.querySelector('.gun[data-row="0"]');
    const note = row.querySelector('[data-wrecked="0"]');
    return { wrecked: !!g.wrecked, jammed: g.jammed, pendingD4: !!g.pendingD4, hp: Number(document.querySelector("#inHPCur").value), hpDoc: c().hpCurrent,
      shotLine: logs.slice(0, 6).join(" || "),
      boomAfterShot: logs.findIndex((t) => /2d6 fire = 2\+5/.test(t)) < logs.findIndex((t) => /ATTACK/.test(t)),
      d6: logs.find((t) => /: \d?1d6 = 1 — EXPLODES/.test(t)) || "", boom: logs.find((t) => /2d6 fire = 2\+5 = 7/.test(t)) || "",
      note: note ? { text: note.textContent, hidden: note.hidden } : null, status: (row.querySelector('[data-out="gst.0"]') || {}).textContent, x: !!row.querySelector(".g-photo.gun-x") };
  });
  check("ui.boom.d6", /1d6 = 1 — EXPLODES/.test(ex.d6), J(ex));
  check("ui.boom.regularPath", /ATTACK[\s\S]*Blacksnake[\s\S]*d20 4[\s\S]*misfire/.test(ex.shotLine.split(" || ")[2] || ""), J(ex.shotLine));
  check("ui.boom.fireLogged", /explodes: \d*2d6 fire = 2\+5 = 7 to Dust/.test(ex.boom) && ex.boomAfterShot, J(ex));
  check("ui.boom.hp", ex.hp === 17, J(ex));
  check("ui.boom.wrecked", ex.wrecked && !ex.jammed && !ex.pendingD4, J(ex));
  check("ui.wrecked.cardLine", ex.note && !ex.note.hidden && ex.note.text === "Wrecked \u2014 repair: traveling merchant only (not a gunsmith)" && /Wrecked/.test(ex.status) && ex.x, J(ex));
  await logShot(pg, 4, "caster-rules-explosion-log.png");
  await shot(pg, '.gun[data-row="0"]', "caster-rules-wrecked-card.png");

  /* Wrecked can't fire (no round spent) and can't be cast through */
  const wr = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, c = () => A.doc().character;
    const before = c().guns[0].loaded;
    window.SSDNSGunRoll(0, 1); await wait(500);
    const spent = A.spendRound(0, 1);
    const after = c().guns[0].loaded;
    if (window.SSDNSFocus.paintCastBlock) window.SSDNSFocus.paintCastBlock();
    await wait(200);
    const castBtn = document.querySelector('[data-cast="0"]'), hexBtn = document.querySelector("#btnHexRoll");
    const nLog0 = document.querySelectorAll(".log-item").length;
    if (window.SSDNSGunCast) window.SSDNSGunCast(0);
    await wait(400);
    const logs = Array.from(document.querySelectorAll(".log-item")).map((x) => x.textContent);
    return { before, after, spent, block: window.SSDNSFocus.castBlock(c()), cast: castBtn ? { d: castBtn.disabled, t: castBtn.title } : null, hex: hexBtn ? { d: hexBtn.disabled } : null,
      fireLog: logs.find((t) => /Wrecked: it can't fire/.test(t)) || "", castNote: (document.getElementById("focusCastNote") || {}).textContent || "", newCastRolls: logs.slice(0, document.querySelectorAll(".log-item").length - nLog0).filter((t) => /Fire Bolt/.test(t)).length };
  });
  check("ui.wrecked.cantFire", wr.before === wr.after && wr.spent.ok === false && wr.spent.wrecked && /Wrecked: it can't fire/.test(wr.fireLog), J(wr));
  check("ui.wrecked.cantCast", /Caster Gun is Wrecked/.test(wr.block) && wr.cast && wr.cast.d && /Wrecked/.test(wr.cast.t) && wr.hex && wr.hex.d && /Wrecked/.test(wr.castNote) && wr.newCastRolls === 0, J(wr));
  await shot(pg, ".hex-roll", "caster-rules-hex-cant-cast.png");
  await pg.evaluate(() => { const t = document.querySelector("#tab-equip"); if (t) t.click(); });
  await sleep(400);
  await shot(pg, "#dollHost .doll", "caster-rules-focus-wrecked.png");

  /* the plain DM repair leaves Wrecked; the merchant repair (DMCC command) clears it and casting is back */
  const fix = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, c = () => A.doc().character, DJ = window.SSDNSDmJoin;
    A.repairGun(0, {}); await wait(300);
    const afterPlain = !!c().guns[0].wrecked;
    if (DJ && DJ._handle) DJ._handle({ id: "cmd_merchant_" + Date.now(), type: "gun", payload: { op: "merchant", index: 0, name: "Blacksnake", weapon: "blacksnake" } });
    await wait(600);
    const logs = Array.from(document.querySelectorAll(".log-item")).map((x) => x.textContent);
    return { afterPlain, afterMerchant: !!c().guns[0].wrecked, block: window.SSDNSFocus.castBlock(c()), log: logs.find((t) => /traveling merchant repaired/i.test(t)) || "", handle: !!(DJ && DJ._handle) };
  });
  check("ui.repair.plainKeepsWrecked", fix.afterPlain === true, J(fix));
  check("ui.repair.merchantClears", fix.handle && fix.afterMerchant === false && fix.block === "" && /traveling merchant repaired Blacksnake/i.test(fix.log), J(fix));
  check("ui.sheet.noPageErrors", errs.length === 0, errs.join(" | "));
  await ctx.close();

  /* DMCC: Wrecked status + Merchant repair button + the command it sends */
  const pg2 = await browser.newPage();
  const errs2 = [];
  pg2.on("pageerror", (e) => { if (!/drawImage/.test(String(e))) errs2.push(String(e)); });
  await pg2.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg2.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await pg2.waitForFunction(() => window.DMCC && window.DMCC.state && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await pg2.evaluate(() => { if (!Object.keys(window.DMCC.state.players || {}).length) document.querySelector("#btnLoadDemo").click(); });
  await pg2.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length, { timeout: 20000 });
  const dm = await pg2.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const D = window.DMCC;
    const pid = Object.keys(D.state.players).find((k) => D.state.players[k].snapshot);
    const snap = D.state.players[pid].snapshot;
    snap.guns = [{ index: 0, name: "Blacksnake", weapon: "blacksnake", capacity: 6, loaded: 1, chambers: ["k:bigfifty:.50-90:heavy", "", "", "", "", ""], equipped: true, caster: true, misStreak: 1, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, pendingD4: false, lockedChambers: [], exploded: false, wrecked: true }];
    D.openDetail(pid); await wait(300);
    const chip = () => document.querySelector("#detailBody .gun-chip");
    const out = { status: chip().querySelector("[data-gun-status]").textContent.trim(), fix: [...chip().querySelectorAll(".gun-fix-row button")].map((b) => b.textContent.trim()), x: chip().classList.contains("gun-x") };
    out.chipSel = true;
    const realAsk = window.SSDNSAsk; let asked = "";
    window.SSDNSAsk = { confirm: async (m) => { asked = m; return true; } };
    /* plain repair: Wrecked stays */
    D.state.commands.length = 0;
    [...chip().querySelectorAll("button")].find((b) => b.textContent.trim() === "Repair gun (clear everything)").click(); await wait(300);
    out.plainAsk = asked; out.plainAfter = !!snap.guns[0].wrecked;
    D.openDetail(pid); await wait(200);
    out.shotReady = true;
    return out;
  });
  check("dmcc.status", /Wrecked \(traveling merchant only\)/.test(dm.status) && dm.x, J(dm));
  check("dmcc.merchantButton", dm.fix.indexOf("Merchant repair (clears Wrecked)") >= 0, J(dm.fix));
  check("dmcc.plainRepairKeepsWrecked", dm.plainAfter === true && /Wrecked stays/.test(dm.plainAsk), J(dm));
  await shot(pg2, "#detailBody .gun-chip", "caster-rules-dmcc-repair.png");
  const dm2 = await pg2.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const D = window.DMCC;
    const pid = Object.keys(D.state.players).find((k) => D.state.players[k].snapshot);
    const snap = D.state.players[pid].snapshot;
    const chip = () => document.querySelector("#detailBody .gun-chip");
    let asked = "";
    window.SSDNSAsk = { confirm: async (m) => { asked = m; return true; } };
    D.state.commands.length = 0;
    [...chip().querySelectorAll("button")].find((b) => b.textContent.trim() === "Merchant repair (clears Wrecked)").click(); await wait(400);
    const cmd = D.state.commands.find((c) => c.type === "gun") || null;
    return { asked, cmd: cmd && cmd.payload, after: !!snap.guns[0].wrecked, status: document.querySelector("#detailBody .gun-chip [data-gun-status]").textContent.trim() };
  });
  check("dmcc.merchantCommand", dm2.cmd && dm2.cmd.op === "merchant" && dm2.cmd.index === 0 && dm2.cmd.weapon === "blacksnake" && /traveling merchant/i.test(dm2.asked), J(dm2));
  check("dmcc.merchantClearsDemo", dm2.after === false && !/Wrecked/.test(dm2.status), J(dm2));
  check("dmcc.noPageErrors", errs2.length === 0, errs2.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll L0200 Caster Gun rule checks passed.");
if (failures.length) process.exitCode = 1;

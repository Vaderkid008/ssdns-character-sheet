/**
 * L0196 (Jessey 2026-10-20 12:15 PM CT): the Whistler arrow deals 1d4 bludgeoning + Dex IN PLACE of the bow's die.
 * Only the base die and the type change; Dex, a magic bow's +X, buff dice (Hunter's Mark style), Sneak Attack and crits
 * all work as normal. Still a signal arrow (heard about a mile off); recovery stays half.
 *   node tools/test-whistler.mjs   (browser part: ssdns-test-all's :8765)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---- data + pure helpers */
const sb = { console }; sb.window = sb; sb.globalThis = sb; vm.createContext(sb);
vm.runInContext(read("assets/data/rules.js"), sb, { filename: "rules.js" });
vm.runInContext(read("assets/js/trackers.js"), sb, { filename: "trackers.js" });
const T = sb.SSDNSTrackers;
const W = T.arrowType("whistler");
check("data.die", W.die === "1d4" && W.dtype === "bludgeoning" && !W.noDamage && !W.dice, JSON.stringify(W));
check("data.signal", /Heard about a mile off; used for signals\./.test(W.fx) && /instead of the bow's die/.test(W.fx), W.fx);
check("data.recoverHalf", W.recover === "half" && T.arrowRecover({ spentAmmo: 4, spentBy: { whistler: 4 } }).back.whistler === 2);
check("expr.swap", T.arrowDieExpr("1d8 +3 bludgeoning", "whistler") === "1d4 +3 bludgeoning", T.arrowDieExpr("1d8 +3 bludgeoning", "whistler"));
check("expr.keepsBuffDice", T.arrowDieExpr("1d8 +4 +1d6 bludgeoning", "whistler") === "1d4 +4 +1d6 bludgeoning");
check("expr.idempotent", T.arrowDieExpr("1d4 +3 bludgeoning", "whistler") === "1d4 +3 bludgeoning");
check("expr.otherArrowsUntouched", ["standard", "blunt", "fire", "broadhead", "poison", ""].every((id) => T.arrowDieExpr("1d8 +3 piercing", id) === "1d8 +3 piercing"));
const adj = T.arrowAdjust({ total: 6, flat: 3, formula: "1d4+3", detail: "3+3" }, "whistler");
check("adjust.type", adj && !adj.none && adj.type === "bludgeoning" && adj.die === "1d4" && /mile off/.test(adj.note), JSON.stringify(adj));
const store = JSON.parse(read("dm/assets/data/store-items.json")).find((r) => r.id === "arrows-whistler-5");
check("store.notes", /1d4 \+ Dex bludgeoning instead of the bow's die/.test(store.notes) && /mile off/.test(store.notes) && store.price_es === 50, store.notes);
check("rules.js untouched", !/whistler/i.test(read("assets/data/rules.js")));

/* ---- browser */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  try {
    const pg = await browser.newPage(); const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSTrackers && window.SSDNSPlaytest, { timeout: 25000 });
    const r = await pg.evaluate(async () => {
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      await wait(1000);
      document.querySelectorAll("dialog[open]").forEach((n) => { try { n.close(); } catch (e) {} });
      const A = window.SSDNSApp, T = window.SSDNSTrackers, P = window.SSDNSPlaytest, C = () => A.doc().character, out = {};
      const logs = () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent);
      const roll = async (k, rnd) => { const rr = Math.random; Math.random = () => rnd; try { window.SSDNSGunRoll(k); await wait(450); } finally { Math.random = rr; } return logs()[0]; };
      const card = (k) => (document.querySelector('[data-calc="gunDmg.' + k + '"]') || {}).value;
      const nock = async (k, id) => { const s = document.querySelector('[data-trk-nock="' + k + '"]'); s.value = id; s.dispatchEvent(new Event("change", { bubbles: true })); await wait(250); };
      const noTarget = () => { const s = document.querySelector("#atkTarget"); if (s) { s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); } };
      A.applyPatch((d) => { const c = d.character; c.name = "Ash"; c.level = 5; c.calling = "frontier-scout"; c.feats = []; c.items = []; c.res = {}; c.abilities.DEX = 16; c.activeConditions = []; c.buffs = [];
        c.ammo = [{ type: "arrows", caliber: "", count: 20 }, { type: "arrows", caliber: "whistler", count: 10 }, { type: "arrows", caliber: "blunt", count: 5 }];
        c.guns = [{ weapon: "longbow", equipped: true, proficient: true }, { weapon: "shortbow", equipped: true, proficient: true, arrowType: "whistler" }, { weapon: "" }, { weapon: "" }]; });
      P.syncSheet(); await wait(400); noTarget(); T.paint(); window.SSDNSActionPips.reset(true); await wait(200);
      out.stdCard = card(0);
      await nock(0, "whistler");
      out.card = card(0); out.cardShort = card(1); out.view = A.compute().guns[0].dmgType;
      out.hit = await roll(0, 0.5);           /* d4 face 3 + 3 DEX = 6 */
      out.crit = await roll(0, 0.99);         /* 2d4 4+4 + 3 = 11 */
      window.SSDNSActionPips.reset(true);
      out.short = await roll(1, 0.5);
      /* magic +1 longbow */
      A.applyPatch((d) => { d.character.guns[0].magic = 1; }); await wait(300);
      out.magicCard = card(0);
      window.SSDNSActionPips.reset(true);
      out.magicHit = await roll(0, 0.5);      /* 3 + 3 DEX + 1 magic = 7 */
      A.applyPatch((d) => { delete d.character.guns[0].magic; }); await wait(200);
      /* Hunter's Mark style buff dice on the bow */
      A.applyPatch((d) => { d.character.buffs = [{ name: "Hunter's Mark", dmgDice: "1d6", weapon: "gun:0" }]; }); await wait(300);
      out.buffCard = card(0);
      window.SSDNSActionPips.reset(true);
      out.buffHit = await roll(0, 0.5);       /* d4 3 + d6 4 + 3 = 10 */
      out.buffCrit = await roll(0, 0.99);     /* 2d4 8 + 2d6 12 + 3 = 23 */
      A.applyPatch((d) => { d.character.buffs = []; }); await wait(200);
      /* Sneak Attack (gambler, lv 5 = 3d6) rides on a whistler hit */
      A.applyPatch((d) => { d.character.calling = "gambler"; d.character.res = { sneakArmed: true }; }); await wait(300);
      window.SSDNSActionPips.reset(true);
      out.sneak = await roll(0, 0.5);         /* d4 3 + 3 + sneak 3d6 (4+4+4) = 18 */
      A.applyPatch((d) => { d.character.calling = "frontier-scout"; d.character.res = {}; }); await wait(300);
      /* switch back: standard restores the bow's own die; blunt keeps d8 + bludgeoning (no stacking with whistler) */
      await nock(0, "standard"); out.backCard = card(0);
      window.SSDNSActionPips.reset(true);
      out.backHit = await roll(0, 0.5);       /* d8 5 + 3 = 8 piercing */
      await nock(0, "blunt"); out.bluntCard = card(0);
      out.bluntHit = await roll(0, 0.5);      /* d8 5 + 3 = 8 bludgeoning */
      await nock(0, "whistler"); out.again = card(0);
      await nock(0, "blunt"); out.bluntAgain = card(0);
      /* last whistler: the shot still rolls 1d4 even though the quiver falls back afterward */
      A.applyPatch((d) => { const c = d.character; c.ammo.forEach((a) => { if (a.caliber === "whistler") a.count = 1; }); delete c.guns[0].arrowType; c.ammo.forEach((a) => { if (a.caliber === "" || a.caliber === "blunt") a.count = 0; }); });
      await wait(300); T.paint();
      out.lastCard = card(0);
      window.SSDNSActionPips.reset(true);
      out.lastHit = await roll(0, 0.5);
      out.lastLeft = C().ammo.filter((a) => a.caliber === "whistler").reduce((n, a) => n + Number(a.count), 0);
      out.quiverTag = (document.querySelector('.gun[data-row="1"] .trk-agrp[data-arrow-grp="whistler"] .trk-atag') || {}).textContent || "";
      return out;
    });
    check("b.standard.card", /^1d8 \+3 piercing$/.test(r.stdCard), r.stdCard);
    check("b.card.longbow", /^1d4 \+3 bludgeoning$/.test(r.card) && r.view === "bludgeoning", JSON.stringify([r.card, r.view]));
    check("b.card.shortbow", /^1d4 \+3 bludgeoning$/.test(r.cardShort), r.cardShort);
    check("b.roll.hit", /d4 3 \+ 3 \(DEX\) = 6 bludgeoning/.test(r.hit) && !/d8/.test(r.hit) && !/piercing/.test(r.hit) && /mile off/.test(r.hit), r.hit);
    check("b.roll.crit", /2d4 .*= 11 bludgeoning/.test(r.crit) && !/d8/.test(r.crit), r.crit);
    check("b.roll.shortbow", /d4 3 \+ 3 \(DEX\) = 6 bludgeoning/.test(r.short) && !/d6/.test(r.short), r.short);
    check("b.magic.card", /^1d4 \+4 bludgeoning$/.test(r.magicCard), r.magicCard);
    check("b.magic.roll", /= 7 bludgeoning/.test(r.magicHit) && /magic/.test(r.magicHit), r.magicHit);
    check("b.buff.card", /^1d4 \+3 \+1d6 bludgeoning$/.test(r.buffCard), r.buffCard);
    check("b.buff.roll", /= 10 bludgeoning/.test(r.buffHit), r.buffHit);
    check("b.buff.crit", /= 23 bludgeoning/.test(r.buffCrit), r.buffCrit);
    check("b.sneak.roll", /3d6/.test(r.sneak) && /sneak/i.test(r.sneak) && /= 18/.test(r.sneak), r.sneak);
    check("b.switchBack.card", /^1d8 \+3 piercing$/.test(r.backCard), r.backCard);
    check("b.switchBack.roll", /d8 5 \+ 3 \(DEX\) = 8 piercing/.test(r.backHit), r.backHit);
    check("b.blunt.noStack", /^1d8 \+3 bludgeoning$/.test(r.bluntCard) && /^1d8 \+3 bludgeoning$/.test(r.bluntAgain) && /^1d4 \+3 bludgeoning$/.test(r.again), JSON.stringify([r.bluntCard, r.again, r.bluntAgain]));
    check("b.blunt.roll", /d8 5 \+ 3 \(DEX\) = 8 bludgeoning/.test(r.bluntHit) && !/mile off/.test(r.bluntHit), r.bluntHit);
    check("b.lastArrow", /^1d4 \+3 bludgeoning$/.test(r.lastCard) && /= 6 bludgeoning/.test(r.lastHit) && r.lastLeft === 0, JSON.stringify([r.lastCard, r.lastHit, r.lastLeft]));
    check("b.quiverTag", /1d4/.test(r.quiverTag), r.quiverTag);
    check("b.noErrors", !errs.length, errs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("whistler ok");

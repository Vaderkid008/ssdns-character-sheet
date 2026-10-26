/**
 * L0195 Thunderbird age ladder (Jessey 2026-10-20; stat blocks from Encounter Bot THUNDERBIRD-DRAFT-v5, tokens 12:16 PM CT).
 * Five bestiary entries (#57-#61), lock/act/draft keys, lair:true lair actions, saveDamage/rider on area saves (text only
 * in the DMCC). The draft Elder stays out of normal picking (hidden like a parked entry, badged Draft).
 *   node tools/test-thunderbirds.mjs   (browser part: ssdns-test-all's :8765)
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const beasts = JSON.parse(read("dm/assets/data/bestiary.json"));
const by = (id) => beasts.find((b) => b.id === id) || {};
const TB = [["thunderbird-hatchling", "57", "1", 22], ["thunderbird-hatchling-brood", "58", "3", 49], ["young-thunderbird", "59", "6", 110], ["widower-thunderbird", "60", "10", 168], ["elder-thunderbird", "61", "16", 296]];
TB.forEach(([id, n, cr, hp]) => {
  const b = by(id);
  check("entry." + id, b.id === id && b.cr === cr && b.hp === hp && b.lock === "L0195" && typeof b.act === "string" && b.act && b.group === "creature" && new RegExp("^" + n + "-" + id + "\\.webp$").test(b.token), JSON.stringify([b.cr, b.hp, b.lock, b.token]));
});
check("order.tail", beasts.slice(-5).map((b) => b.id).join() === TB.map((t) => t[0]).join());
check("widower.name", by("widower-thunderbird").name === "Widower Thunderbird" && /Papa/.test(by("widower-thunderbird").aka || ""));
/* DND Bot fix (L0195 2026-10-20): the brood's passive Perception 10 and Screech DC 10 Con, in text and rider */
const brood = by("thunderbird-hatchling-brood"), scr = (brood.actions || []).find((a) => a.name === "Screech") || {};
check("brood.pp10", brood.senses === "passive Perception 10" && brood.abilities.WIS === 10 && !(brood.skills || {}).Perception, brood.senses);
check("brood.screechDc10", /DC 10 Constitution saving throw/.test(scr.text) && scr.rider && scr.rider.dc === 10 && scr.rider.save === "CON", JSON.stringify(scr.rider));
/* draft: only the Elder */
check("draft.onlyElder", beasts.filter((b) => b.draft).map((b) => b.id).join() === "elder-thunderbird" && /Act IV/.test(by("elder-thunderbird").draftNote));
/* lair actions: flagged and in the actions list, text only */
const lair = (by("elder-thunderbird").actions || []).filter((a) => a.lair).map((a) => a.name);
check("elder.lair", lair.join() === "Lair Actions,Lightning Strike,Rockfall,Gale", lair.join());
/* every area save keeps its numbers in saveDamage / rider, matching the text */
let saves = 0, bad = [];
TB.forEach(([id]) => ["actions", "legendary"].forEach((k) => (by(id)[k] || []).forEach((a) => {
  [a.saveDamage, a.rider].filter(Boolean).forEach((s) => { saves++; if (!s.save || !s.dc || a.text.indexOf("DC " + s.dc) < 0) bad.push(id + ":" + a.name); });
  if (a.saveDamage && a.text.indexOf("(" + a.saveDamage.damage.replace("+", " + ") + ")") < 0) bad.push(id + ":" + a.name + " dice");
})));
check("saves.matchText", saves >= 12 && !bad.length, bad.join() + " / " + saves);
/* the Fight tab only wires rider/saveDamage on attackList rows; actions stay text */
check("saves.notOnAttacks", TB.every(([id]) => (by(id).attackList || []).every((a) => !a.saveDamage && !a.rider)));
const v2 = read("dm/assets/js/v2.js");
check("code.draftHidden", /function isParkedBeast\(b\) \{ return !!\(b && \(b\.parked \|\| b\.draft\)\); \}/.test(v2) && (v2.match(/isParkedBeast\(b\)/g) || []).length >= 4);
check("code.cacheKey", v2.indexOf('bestiary.json?v=0.2.159-thunderbirds') >= 0);
check("rules.js untouched", !/thunderbird/i.test(read("assets/data/rules.js")));

/* ---- browser: DMCC demo table, Fight tab picking, stat block, map placement */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOT = process.env.SSDNS_SHOT || "";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const pg = await browser.newPage(); const errs = [], imgs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    pg.on("response", (r) => { if (/tokenImages\/bestiary\//.test(r.url())) imgs.push(r.status() + " " + r.url().replace(/^.*tokenImages\/bestiary\//, "")); });
    await pg.setViewport({ width: 1400, height: 1000 });
    await pg.goto(ORIGIN + dmccUrl("/dm/index.html"), { waitUntil: "domcontentloaded" });
    await dmccOffline(pg); /* never the live ssdns-dm-hub database */
    await pg.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /load demo table/i.test(b.textContent)), { timeout: 25000 });
    await sleep(1500);
    await pg.evaluate(() => [...document.querySelectorAll("button")].find((b) => /load demo table/i.test(b.textContent)).click());
    await sleep(2000);
    const tab = (n) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === n).click(), n);
    await tab("Map");
    await pg.waitForFunction(() => window.SSDNSMapHost && window.SSDNSMapHost.tokensLoaded && window.SSDNSMapHost.tokensLoaded(), { timeout: 20000 });
    await pg.evaluate(() => {
      const h = window.SSDNSMapHost, orig = h.placeToken; window.__placed = [];
      h.placeToken = function (p) { window.__placed.push({ name: p.name, image: p.image || "" }); return orig.apply(this, arguments); };
    });
    await tab("Fight"); await sleep(500);
    const pick = await pg.evaluate(() => {
      const ids = () => [...document.querySelectorAll("[data-add-beast]")].map((b) => b.getAttribute("data-add-beast"));
      const opts = () => [...document.querySelectorAll("#enemyQ, select")].flatMap((s) => [...(s.options || [])].map((o) => o.value));
      const out = { off: ids().filter((x) => /thunderbird/.test(x)), offOpt: opts().includes("elder-thunderbird") };
      const t = document.getElementById("beastParked"); t.checked = true; t.dispatchEvent(new Event("change", { bubbles: true }));
      out.on = ids().filter((x) => /thunderbird/.test(x));
      const card = document.querySelector('[data-beast-card="elder-thunderbird"]');
      out.badge = card ? [...card.querySelectorAll(".badge")].map((b) => b.textContent).join() : "";
      out.note = card ? /Act IV/.test(card.textContent) : false;
      out.label = t.closest("label").textContent.trim();
      return out;
    });
    check("b.draft.hiddenByDefault", pick.off.join() === "thunderbird-hatchling,thunderbird-hatchling-brood,young-thunderbird,widower-thunderbird" && !pick.offOpt, JSON.stringify(pick));
    check("b.draft.toggleShows", pick.on.includes("elder-thunderbird") && pick.badge === "Draft" && pick.note && /draft/i.test(pick.label), JSON.stringify(pick));
    for (const [id] of TB) { await pg.evaluate((id) => document.querySelector('[data-add-beast="' + id + '"]').click(), id); await sleep(400); }
    /* the Elder's stat block: lair actions marked, save actions text-only, no-HP logic untouched */
    const sheet = await pg.evaluate(async () => {
      const b = document.querySelector('[data-open-beast="elder-thunderbird"]'); if (b) b.click();
      await new Promise((r) => setTimeout(r, 500));
      const t = document.body.innerText;
      const o = { lair: /Lightning Strike \(lair\)\./.test(t) && /Rockfall \(lair\)\./.test(t) && /Gale \(lair\)\./.test(t), shriek: /Thunder Shriek\./.test(t), legendary: /Wing Gust/.test(t) };
      document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (e) {} });
      const close = [...document.querySelectorAll("button")].find((x) => x.offsetParent && /^close$/i.test(x.textContent.trim()));
      if (close) close.click();
      return o;
    });
    check("b.elder.sheet", sheet.lair && sheet.shriek && sheet.legendary, JSON.stringify(sheet));
    await tab("Map"); await sleep(2500);
    const placed = await pg.evaluate(() => window.__placed);
    const byName = Object.fromEntries(placed.map((p) => [p.name, p.image]));
    const want = { "Thunderbird Hatchling": "57-thunderbird-hatchling.webp", "Thunderbird Hatchling Brood": "58-thunderbird-hatchling-brood.webp", "Young Thunderbird": "59-young-thunderbird.webp", "Widower Thunderbird": "60-widower-thunderbird.webp", "Elder Thunderbird": "61-elder-thunderbird.webp" };
    check("b.placed.art", Object.entries(want).every(([n, f]) => byName[n] === "tokenImages/bestiary/" + f), JSON.stringify(placed));
    check("b.loaded", Object.values(want).every((f) => imgs.includes("200 " + f)), imgs.join());
    const downed = await pg.evaluate(() => [...document.querySelectorAll(".token.down, .down-x, [data-down='1']")].length);
    check("b.noneDowned", downed === 0, String(downed));
    if (SHOT) {
      await sleep(800);
      const el = await pg.$("#mapStage, .map-stage, #map, .ssdns-map, [data-map-root]");
      if (el) await el.screenshot({ path: SHOT }); else await pg.screenshot({ path: SHOT });
      console.log("shot  " + SHOT);
    }
    check("b.noErrors", !errs.length, errs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("thunderbirds ok");

/**
 * 0.3.108 (Jessey approved Art Bot's caster art 2026-10-20 11:10 PM CT):
 *  - Blacksnake / Hognose restyled: 1200x400 engravings (Weapons rows, gun cards) + 256 tiles (doll slots, item rows).
 *  - Patron Focus tiles (assets/img/items/patron/<pact slug>.webp) replace #116's fallback.
 *  - Relic Caster Guns (L0199 / L0202): art only, under assets/img/dm-only/, mapped by slug in item-art.js. No catalog,
 *    store, rules or Add item entries; nothing player-facing lists them.
 *   node tools/test-caster-art.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-caster-art.mjs   also saves caster-art-*.png
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const exists = (rel) => fs.existsSync(path.join(root, rel));
const sha = (rel) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, rel))).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function webpInfo(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const t = b.toString("ascii", 12, 16);
  if (t === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10) };
  if (t === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
  if (t === "VP8L") { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff), alpha: !!((v >> 28) & 1) }; }
  return null;
}
const RELICS = ["viper", "python", "boa", "cobra", "cotton-mouth", "fer-de-lance", "cascabel", "timber-rat", "massasauga", "twin-puff-adder-left", "twin-puff-adder-right"];
const PATRONS = ["crossroads-note", "sealed-orders", "lass-o-lakes", "last-round", "sand-oath", "pine-box-contract", "drowned-breath"];

/* ---------- files ---------- */
for (const s of ["blacksnake", "hognose"]) {
  const e = webpInfo("assets/img/weapons/" + s + ".webp"), t = webpInfo("assets/img/items/caster/" + s + ".webp");
  check("file." + s + ".engraving", e && e.w === 1200 && e.h === 400 && e.alpha, J(e));
  check("file." + s + ".tile", t && t.w === 256 && t.h === 256, J(t));
}
for (const s of PATRONS) { const t = exists("assets/img/items/patron/" + s + ".webp") && webpInfo("assets/img/items/patron/" + s + ".webp"); check("file.patron." + s, t && t.w === 256 && t.h === 256, J(t)); }
for (const s of RELICS) {
  const t = exists("assets/img/dm-only/items/caster/" + s + ".webp") && webpInfo("assets/img/dm-only/items/caster/" + s + ".webp");
  const e = exists("assets/img/dm-only/weapons/caster/" + s + ".webp") && webpInfo("assets/img/dm-only/weapons/caster/" + s + ".webp");
  check("file.relic." + s, t && t.w === 256 && t.h === 256 && e && e.w === 1200 && e.h === 400 && e.alpha, J({ t, e }));
  check("file.relic." + s + ".notPublicPath", !exists("assets/img/items/caster/" + s + ".webp") && !exists("assets/img/weapons/caster/" + s + ".webp") && !exists("assets/img/weapons/" + s + ".webp"));
}
check("file.retiredTwinSlug", !exists("assets/img/dm-only/items/caster/twin-puff-adders.webp") && !exists("assets/img/dm-only/weapons/caster/twin-puff-adders.webp"));

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/item-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const IA = sb.SSDNSIronArt, A = sb.SSDNSWeaponArt, IT = sb.SSDNSItemArt, D = sb.SSDNSDoll, K = sb.SSDNSKits;
for (const s of RELICS) {
  check("map." + s, IT.relicTile(s) === "assets/img/dm-only/items/caster/" + s + ".webp" && IT.relicEngraving({ id: s }) === "assets/img/dm-only/weapons/caster/" + s + ".webp" &&
    A.srcFor({ id: s }) === "assets/img/dm-only/weapons/caster/" + s + ".webp" && IA.weaponTile(s) === "assets/img/dm-only/items/caster/" + s + ".webp" &&
    IT.srcFor({ id: s }) === "assets/img/dm-only/items/caster/" + s + ".webp", J([IT.relicTile(s), A.srcFor({ id: s }), IA.weaponTile(s)]));
}
check("map.itemByCatalogId", IA.itemTile({ catalogId: "twin-puff-adder-left" }, {}) === "assets/img/dm-only/items/caster/twin-puff-adder-left.webp");
check("map.aliases", IT.relicSlug("relic-viper") === "viper" && IT.relicSlug("cottonmouth") === "cotton-mouth" && IT.relicSlug("puff-adder-right") === "twin-puff-adder-right");
check("map.retiredTwin", IT.relicSlug("twin-puff-adders") === "" && A.srcFor({ id: "twin-puff-adders" }) === "");
check("map.nameNotMatched", A.srcFor({ name: "Viper" }) === "" && IT.srcFor({ name: "Python" }) === "");
check("hidden.weaponSlugs", RELICS.every((s) => A.slugs().indexOf(s) < 0));
check("hidden.itemList", RELICS.every((s) => !IT.list().some((r) => r.id === s)) && IT.matchesIn("a viper and a python and a boa").length === 0);
const cat = J(sb.SSDNS_ITEM_CATALOG || {}) + J((sb.SSDNSItems && sb.SSDNSItems.catalog && sb.SSDNSItems.catalog()) || []);
check("hidden.noCatalogItems", RELICS.every((s) => cat.indexOf('"' + s + '"') < 0));
check("hidden.noRulesWeapons", RELICS.every((s) => !((sb.SSDNS_RULES.weapons || {})[s])));
check("hidden.noStoreOrHtml", ["index.html", "dm/index.html", "assets/js/store.js"].filter(exists).every((f) => !/dm-only\/(items|weapons)\/caster/.test(read(f))));
check("wide.relicTileIsSquare", !/eq-wide/.test(String(sb.SSDNSItems && sb.SSDNSItems.eqThumb ? sb.SSDNSItems.eqThumb("assets/img/dm-only/items/caster/viper.webp") : "")));
const pact = (sub) => { const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; c.subclass = sub; return c; };
(sb.SSDNS_RULES.callings || []).find((c) => c.id === "pact-seeker").subclasses.forEach((s) => {
  const f = D.focusState(pact(s.id));
  check("patron." + s.id, f.kind === "patron" && exists(f.art), J(f && f.art));
});
check("rules.untouched", !/viper|twin-puff/.test(read("database.rules.json")) && !read("assets/data/rules.js").includes("0.3.127"));

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function shot(pg, sel, file) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await pg.addStyleTag({ content: ".toast{display:none!important}" });
  await sleep(250);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
}
async function waitImgs(pg) { await pg.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })))); }
async function open(setup, arg) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSIronArt && window.SSDNSItemArt && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  await pg.evaluate(setup, arg);
  await sleep(500);
  await pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
  await sleep(700); await waitImgs(pg); await sleep(200);
  return { pg, errs, ctx };
}
try {
  for (const [sub, slug, nm] of [["the-crossroads-note", "crossroads-note", "The Crossroads Note"], ["lass-o-lakes", "lass-o-lakes", "Lass O"], ["the-drowned-breath", "drowned-breath", "The Drowned Breath"]]) {
    const { pg, errs, ctx } = await open((o) => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Pact"; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.subclass = o;
    }), sub);
    const v = await pg.evaluate(() => { const s = document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]'); const im = s && s.querySelector(".doll-art");
      return { src: im ? im.getAttribute("src") : "", nw: im ? im.naturalWidth : 0, name: s && s.querySelector(".doll-name") ? s.querySelector(".doll-name").textContent : "" }; });
    check("ui.patron." + slug, new RegExp("items/patron/" + slug + "\\.webp").test(v.src) && v.nw === 256 && v.name.indexOf(nm) >= 0, J(v));
    await shot(pg, "#dollHost .doll", "caster-art-pact-focus-" + slug + ".png");
    check("ui.patron." + slug + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  {
    const { pg, errs, ctx } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Dust"; c.calling = "hexslinger"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "hexslinger", {}); c.kitStamp = "hexslinger"; c.cantrips = ["Fire Bolt"];
      c.guns[1] = { weapon: "hognose", proficient: true, chambers: [], equipped: true };
    }));
    const v = await pg.evaluate(async () => {
      const q = (k) => { const s = document.querySelector('#dollHost [data-doll-slot="' + k + '"] .doll-art'); return s ? { src: s.getAttribute("src"), nw: s.naturalWidth } : null; };
      const rows = [...document.querySelectorAll('#itemList li[data-eq-cat="weapons"] .eq-thumb img')].map((i) => ({ src: i.getAttribute("src"), nw: i.naturalWidth, wide: i.closest(".eq-thumb").classList.contains("eq-wide") }));
      const cards = [...document.querySelectorAll(".gun .g-photo img")].map((i) => ({ src: i.getAttribute("src"), nw: i.naturalWidth }));
      const h = async (u) => { const b = await (await fetch(u, { cache: "no-store" })).arrayBuffer(); const d = await crypto.subtle.digest("SHA-256", b); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join(""); };
      return { l: q("revolver_1"), r: q("revolver_2"), focus: q("focus_borrowed_iron"), rows, cards,
        hash: { be: await h("assets/img/weapons/blacksnake.webp"), he: await h("assets/img/weapons/hognose.webp"), bt: await h("assets/img/items/caster/blacksnake.webp"), ht: await h("assets/img/items/caster/hognose.webp") } };
    });
    check("ui.hex.servedNewArt", v.hash.be === sha("assets/img/weapons/blacksnake.webp") && v.hash.he === sha("assets/img/weapons/hognose.webp") && v.hash.bt === sha("assets/img/items/caster/blacksnake.webp") && v.hash.ht === sha("assets/img/items/caster/hognose.webp"), J(v.hash));
    const slots = [v.l, v.r].filter(Boolean).map((x) => x.src).join(" ");
    /* 0.3.108 (Jessey 2026-10-21 7:47 PM CT): engravings on the doll and cards, colour tiles in the Equipment list */
    check("ui.hex.dollEngravings", /assets\/img\/weapons\/blacksnake\.webp/.test(slots) && /assets\/img\/weapons\/hognose\.webp/.test(slots) && [v.l, v.r].every((x) => x && x.nw === 1200), J([v.l, v.r]));
    check("ui.hex.focusEngraving", v.focus && /assets\/img\/weapons\/blacksnake\.webp/.test(v.focus.src) && v.focus.nw === 1200, J(v.focus));
    check("ui.hex.weaponsRowsTiles", v.rows.some((r) => /items\/caster\/blacksnake\.webp/.test(r.src) && !r.wide && r.nw === 256) && v.rows.some((r) => /items\/caster\/hognose\.webp/.test(r.src) && !r.wide && r.nw === 256), J(v.rows));
    check("ui.hex.gunCards", v.cards.some((r) => /weapons\/blacksnake\.webp/.test(r.src) && r.nw === 1200) && v.cards.some((r) => /weapons\/hognose\.webp/.test(r.src) && r.nw === 1200), J(v.cards));
    await shot(pg, "#dollHost .doll", "caster-art-hexslinger-doll.png");
    await shot(pg, ".gear-col.gear-weapons", "caster-art-hexslinger-weapons.png");
    await shot(pg, "#itemList", "caster-art-hexslinger-equipment.png");
    /* relic art loads by id (DM-placed later); nothing in the page lists it */
    const rv = await pg.evaluate(async (ids) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(0); i.src = src; });
      const out = [];
      for (const id of ids) out.push([id, await load(window.SSDNSIronArt.weaponTile(id)), await load(window.SSDNSWeaponArt.srcFor({ id }))]);
      const html = document.documentElement.innerHTML;
      return { out, listed: ids.filter((id) => html.indexOf("dm-only/items/caster/" + id) >= 0 || html.indexOf("dm-only/weapons/caster/" + id) >= 0) };
    }, RELICS);
    check("ui.relic.loadById", rv.out.every((x) => x[1] === 256 && x[2] === 1200), J(rv.out));
    check("ui.relic.notOnPlayerPage", rv.listed.length === 0, J(rv.listed));
    check("ui.hex.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall caster-art checks passed");
process.exit(failures.length ? 1 : 0);

/**
 * 0.3.106 — Art Bot's item art batch 1 (Jessey approved 2026-10-21 6:40 PM CT).
 *  - 59 player weapon square tiles at assets/img/items/weapons/<slug>.webp. Jessey 7:47 PM CT rule: colour tiles everywhere in
 *    the inventory (Equipment list, Weapons rows included, and item rows); b/w engravings on the weapons cards and the doll.
 *  - The Peace Maker's tile is DM-only (assets/img/dm-only/items/the-peace-maker.webp), never on a player page.
 *  - 32 banner fixes: 18 replaced in place (no wide use); 14 kept as banners (Store / DMCC gear table / notes strip draw
 *    them 3:1) with the square added at assets/img/items/square/<slug>.webp.
 *  - Generic Borrowed Iron tile 400 -> 256 RGBA. Pact Shot tile on the Borrowed Iron card's Pact Shot button.
 *   node tools/test-art-batch1.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-art-batch1.mjs   also saves art-batch1-*.png
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
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 600) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const exists = (rel) => fs.existsSync(path.join(root, rel.replace(/^(\.\.\/)+/, "").replace(/[?#].*$/, "")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function webpInfo(rel) {
  if (!exists(rel)) return null;
  const b = fs.readFileSync(path.join(root, rel));
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const t = b.toString("ascii", 12, 16);
  if (t === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10) };
  if (t === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false };
  if (t === "VP8L") { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff), alpha: !!((v >> 28) & 1) }; }
  return null;
}
const sq = (rel) => { const i = webpInfo(rel); return !!i && i.w === 256 && i.h === 256; };
const wide = (rel) => { const i = webpInfo(rel); return !!i && i.w === 1200 && i.h === 400; };

/* the 14 ItemArt rows keep their banner; the other 18 banner-only catalog items were replaced in place */
const KEPT = ["assay-tonic-trail-draught", "snakebite-antivenin-antitoxin", "lamp-oil", "fuse-cord-50-ft", "lariat-50-ft", "field-medic-kit", "iron-cuffs",
  "hardtack-jerky-1-day", "caltrops-jack-nails-bag-of-20", "field-glass-spyglass", "whiskey-bottle", "gun-cleaning-kit", "trail-poison-illegal-in-most-towns", "blessed-water-saint-s-wash"];
const REPLACED = ["black-shard", "bounty-warrant", "claim-deed", "cutlass-of-the-suns-fury", "eldorite-dust", "glowing-letter", "glowing-letter-cure-wounds", "glowing-letter-fireball",
  "glowing-letter-revivify", "glowing-letter-shield", "greater-healing-libation", "harmonica-of-soothing-melodies", "hat-of-the-sharpshooter", "lasso-of-binding", "lightning-tomahawk",
  "old-henrys-rifle", "saddle-of-the-phantom-steed", "strongbox-key"];

/* ---------- files ---------- */
const tileFiles = fs.readdirSync(path.join(root, "assets/img/items/weapons")).sort();
check("file.weapons.count", tileFiles.length === 60, tileFiles.length);  /* 59 + the v2.1 Cottonwood Walking Stick */
check("file.weapons.allSquareWebp", tileFiles.every((f) => /\.webp$/.test(f) && sq("assets/img/items/weapons/" + f)), J(tileFiles.filter((f) => !sq("assets/img/items/weapons/" + f))));
check("file.peaceMaker.dmOnly", sq("assets/img/dm-only/items/the-peace-maker.webp") && !exists("assets/img/items/weapons/the-peace-maker.webp") && !exists("assets/img/items/the-peace-maker.webp"));
check("file.replaced.square", REPLACED.every((s) => sq("assets/img/items/" + s + ".webp")), J(REPLACED.filter((s) => !sq("assets/img/items/" + s + ".webp"))));
check("file.kept.bannerAndSquare", KEPT.every((s) => wide("assets/img/items/" + s + ".webp") && sq("assets/img/items/square/" + s + ".webp")), J(KEPT.filter((s) => !(wide("assets/img/items/" + s + ".webp") && sq("assets/img/items/square/" + s + ".webp")))));
check("file.square.onlyKept", fs.readdirSync(path.join(root, "assets/img/items/square")).sort().join() === KEPT.map((s) => s + ".webp").sort().join());
const gi = webpInfo("assets/img/items/borrowed-iron.webp");
check("file.borrowedIron.256rgba", gi && gi.w === 256 && gi.h === 256 && gi.alpha, J(gi));
check("file.pactShot", sq("assets/img/spells/pact-shot.webp"));
check("file.noOtherBanners", fs.readdirSync(path.join(root, "assets/img/items")).filter((f) => /\.webp$/.test(f) && wide("assets/img/items/" + f)).sort().join() === KEPT.map((s) => s + ".webp").sort().join());

/* ---------- node part ---------- */
function sandbox(pathname) {
  const sb = { console }; sb.window = sb; sb.globalThis = sb; sb.location = { pathname: pathname || "/index.html" };
  sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  vm.createContext(sb);
  for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
    "assets/js/kits.js", "assets/js/equip.js", "assets/js/peace-maker.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/item-art.js", "assets/js/paper-doll.js"]) {
    vm.runInContext(read(f), sb, { filename: f });
  }
  return sb;
}
const sb = sandbox();
const IA = sb.SSDNSIronArt, A = sb.SSDNSWeaponArt, IT = sb.SSDNSItemArt, Items = sb.SSDNSItems, D = sb.SSDNSDoll, R = sb.SSDNS_RULES;
const slugs = A.tileSlugs();
check("map.slugsMatchFiles", slugs.slice().sort().join() === tileFiles.map((f) => f.replace(/\.webp$/, "")).join(), J(slugs.filter((s) => tileFiles.indexOf(s + ".webp") < 0)));
check("map.slugsAreRealWeapons", slugs.every((s) => exists("assets/img/weapons/" + s + ".webp")), J(slugs.filter((s) => !exists("assets/img/weapons/" + s + ".webp"))));
for (const s of slugs) {
  const t = "assets/img/items/weapons/" + s + ".webp";
  check("slug." + s, IA.weaponTile(s) === t && A.tileFor({ id: s }) === t && IA.itemTile({ catalogId: s }, {}) === t && A.srcFor({ id: s }) === "assets/img/weapons/" + s + ".webp",
    J([IA.weaponTile(s), A.tileFor({ id: s }), A.srcFor({ id: s })]));
}
/* every rules weapon (by its real catalog id / name) reaches a tile that exists; Caster Guns keep their items/caster tiles */
const rulesWeapons = [].concat(R.firearms || [], R.melee || [], R.otherRanged || [], R.casterGuns || []);
const noTile = rulesWeapons.filter((w) => !IA.weaponTile(w.id) || !exists(IA.weaponTile(w.id)) || !IA.weaponTile({ id: "", name: w.name }));
check("rules.everyWeaponHasTile", noTile.length === 0, J(noTile.map((w) => w.id)));
check("rules.casterTilesUnchanged", IA.weaponTile("blacksnake") === "assets/img/items/caster/blacksnake.webp" && IA.weaponTile("hognose") === "assets/img/items/caster/hognose.webp");
check("rules.explosives", ((R.explosives && R.explosives.items) || []).filter((e) => /dynamite-stick|blasting-keg/.test(e.id)).every((e) => /items\/weapons\//.test(IA.weaponTile(e.id)) && exists(IA.weaponTile(e.id))));
/* (e) dynamite bundles share the standard-fuse tile, in the item row and through the catalog art */
for (const n of [2, 3, 4]) {
  const id = "dynamite-bundle-" + n, inst = Items.instanceFrom(Items.byId(id));
  check("bundle." + n, IA.itemTile({ catalogId: id }, {}) === "assets/img/items/weapons/dynamite-stick-standard-fuse.webp" && Items.artSrc(inst) === "assets/img/items/weapons/dynamite-stick-standard-fuse.webp", J([IA.itemTile({ catalogId: id }, {}), Items.artSrc(inst)]));
}
/* (c) banner fixes: item slots get the square; the wide boxes keep the banner */
for (const s of KEPT) {
  const row = Items.byId(s), inst = row ? Items.instanceFrom(row) : { id: s };
  check("kept." + s, IT.squareFor({ id: s }) === "assets/img/items/square/" + s + ".webp" && Items.artSrc(inst) === "assets/img/items/square/" + s + ".webp" &&
    IT.srcFor({ id: s }) === "assets/img/items/" + s + ".webp" && /src="assets\/img\/items\/[a-z0-9-]+\.webp"/.test(IT.thumbHtml({ id: s })), J([IT.squareFor({ id: s }), Items.artSrc(inst), IT.srcFor({ id: s })]));
}
check("kept.listIsWide", IT.list().every((r) => !/\/square\//.test(r.src) && wide(r.src)));
check("ownArtBeatsWeaponTile", Items.artSrc(Items.instanceFrom(Items.byId("old-henrys-rifle"))) === "assets/img/items/old-henrys-rifle.webp");
check("kept.savedOldPath", Items.artSrc({ uid: "x", name: "Lamp oil", art: "assets/img/items/lamp-oil.webp" }) === "assets/img/items/square/lamp-oil.webp");
for (const s of REPLACED) {
  const row = Items.byId(s);
  check("replaced." + s, row && Items.artSrc(Items.instanceFrom(row)) === "assets/img/items/" + s + ".webp", J(row && Items.artSrc(Items.instanceFrom(row))));
}
/* eq-wide only for engravings */
check("eqThumb.tileNotWide", !/eq-wide/.test(Items.eqThumb ? Items.eqThumb("assets/img/items/weapons/cutlass.webp") : "") && (!Items.eqThumb || /eq-wide/.test(Items.eqThumb("assets/img/weapons/cutlass.webp"))));
/* (b) the Peace Maker: tile only on the DMCC */
check("peace.player.noTile", A.tileFor("the-peace-maker") === "" && A.tileFor({ id: "the-peace-maker", name: "The Peace Maker" }) === "" && IA.weaponTile("the-peace-maker") === "" &&
  IA.itemTile({ catalogId: "the-peace-maker" }, {}) === "" && A.srcFor({ id: "the-peace-maker" }) === "" && slugs.indexOf("the-peace-maker") < 0 && A.slugs().indexOf("the-peace-maker") < 0);
check("peace.player.notListed", !IT.list().some((r) => /peace/.test(r.id)) && IT.matchesIn("the peace maker").length === 0);
const dm = sandbox("/ssdns-character-sheet/dm/index.html");
check("peace.dm.tile", dm.SSDNSWeaponArt.tileFor("the-peace-maker") === "../assets/img/dm-only/items/the-peace-maker.webp" && dm.SSDNSIronArt.weaponTile("the-peace-maker") === "../assets/img/dm-only/items/the-peace-maker.webp", dm.SSDNSWeaponArt.tileFor("the-peace-maker"));
check("dm.prefix", dm.SSDNSIronArt.weaponTile("cutlass") === "../assets/img/items/weapons/cutlass.webp" && dm.SSDNSItemArt.squareFor({ id: "lamp-oil" }) === "../assets/img/items/square/lamp-oil.webp");
const playerFiles = ["index.html", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-art.js", "assets/js/items.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/kits.js", "assets/js/sheet-playtest.js", "assets/js/app.js"];
check("peace.noPlayerRefs", playerFiles.every((f) => !/dm-only\/items\/the-peace-maker/.test(read(f))));
/* no broken paths: every literal asset path in the shipped code exists */
const scan = ["index.html", "dm/index.html"].concat(fs.readdirSync(path.join(root, "assets/js")).filter((f) => /\.js$/.test(f)).map((f) => "assets/js/" + f),
  fs.readdirSync(path.join(root, "assets/data")).filter((f) => /\.js$/.test(f)).map((f) => "assets/data/" + f), ["assets/css/sheet.css"]);
const missing = [];
for (const f of scan) {
  const src = read(f);
  for (const m of src.matchAll(/assets\/img\/[A-Za-z0-9_\/.-]+\.(?:webp|png|svg|jpg)/g)) if (!exists(m[0])) missing.push(f + ": " + m[0]);
}
/* the catalog's art("x.webp") helper prefixes assets/img/items/ */
for (const m of read("assets/data/item-catalog.js").matchAll(/art\("([^"]+)"\)/g)) if (!exists("assets/img/items/" + m[1])) missing.push("item-catalog.js: art(" + m[1] + ")");
check("paths.allExist", missing.length === 0, J(missing));
check("rules.untouched", !read("assets/data/rules.js").includes("items/weapons/"));

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
  const bb = el ? await el.boundingBox() : null;
  if (el && bb && bb.height > 0) await el.screenshot({ path: path.join(SHOTS, file) });
}
async function waitImgs(pg) { await pg.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })))); }
async function open(setup, arg, vp) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport(vp || { width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSIronArt && window.SSDNSItemArt && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  await pg.evaluate(setup, arg);
  await sleep(500);
  await pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
  await sleep(700); await waitImgs(pg); await sleep(200);
  return { pg, errs, ctx };
}
const ITEMS = ["dynamite-stick-standard-fuse", "dynamite-bundle-3", "lamp-oil", "whiskey-bottle", "black-shard", "hat-of-the-sharpshooter", "lasso-of-binding", "claim-deed", "field-medic-kit"];
const gunSetup = (o) => window.SSDNSApp.applyPatch((d) => {
  const c = d.character; c.name = "Slim"; c.calling = "gunslinger"; c.level = 3;
  c.guns[0] = { weapon: "navy-army-ball-n-cap-revolver", proficient: true, chambers: [], equipped: true };
  c.guns[1] = o.noLong ? { weapon: "" } : { weapon: "henrietta-repeating-rifle", proficient: true, chambers: [], equipped: true };
  c.melee = [{ weapon: "cutlass", proficient: true, equipped: true }];
  c.items = o.items.map((id, i) => Object.assign(window.SSDNSItems.instanceFrom(window.SSDNSItems.byId(id)), { uid: "t" + i, count: 1 }));
  if (o.peace) c.melee.push({ weapon: "the-peace-maker", proficient: true, equipped: false });
});
const pageInfo = () => {
  const q = (k) => { const s = document.querySelector('#dollHost [data-doll-slot="' + k + '"]'); const im = s && s.querySelector(".doll-art");
    return im ? { src: im.getAttribute("src"), nw: im.naturalWidth, cls: s.className } : null; };
  const rows = [...document.querySelectorAll("#itemList li.eq-row")].map((li) => { const i = li.querySelector(".eq-thumb img");
    return { key: li.getAttribute("data-eq-key"), cat: li.getAttribute("data-eq-cat"), name: (li.querySelector(".eq-name b") || {}).textContent, src: i ? i.getAttribute("src") : "", nw: i ? i.naturalWidth : 0, wide: !!(i && i.closest(".eq-thumb").classList.contains("eq-wide")) }; });
  const cards = [...document.querySelectorAll(".g-photo img, .m-photo img, [data-art] img")].map((i) => ({ src: i.getAttribute("src"), nw: i.naturalWidth }));
  const broken = [...document.images].filter((i) => /assets\/img\//.test(i.getAttribute("src") || "") && i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src"));
  return { r1: q("revolver_1"), r2: q("revolver_2"), long: q("long_gun"), melee: q("melee"), rows, cards, broken, html: document.documentElement.innerHTML };
};
try {
  /* Equipment rows + paper doll: pistol, long gun, melee, items */
  {
    const { pg, errs, ctx } = await open(gunSetup, { items: ITEMS, peace: true });
    await pg.evaluate(() => document.querySelector("#dollHost").scrollIntoView());
    await waitImgs(pg); await sleep(300);
    const v = await pg.evaluate(pageInfo);
    const pistol = [v.r1, v.r2].find((x) => x && /navy-army/.test(x.src));
    /* Jessey 7:47 PM: engravings on the doll, pistol slots included */
    check("ui.doll.pistolEngraving", pistol && pistol.src === "assets/img/weapons/navy-army-ball-n-cap-revolver.webp" && pistol.nw === 1200, J([v.r1, v.r2]));
    check("ui.doll.noTiles", ![v.r1, v.r2, v.long, v.melee].some((x) => x && /items\/weapons\//.test(x.src)), J([v.r1, v.r2, v.long, v.melee]));
    check("ui.doll.longGun", v.long && /henrietta-repeating-rifle\.webp$/.test(v.long.src) && v.long.nw > 0, J(v.long));
    check("ui.doll.melee", v.melee && /cutlass\.webp$/.test(v.melee.src) && v.melee.nw > 0, J(v.melee));
    const slotRow = (re) => v.rows.find((r) => /^slot:/.test(r.key) && re.test(r.src));
    /* Jessey 7:47 PM: colour tiles everywhere in the inventory, Weapons rows included (replaces #116's engraving rows) */
    check("ui.eq.weaponRowsTile", ["navy-army-ball-n-cap-revolver", "henrietta-repeating-rifle", "cutlass"].every((s) => { const r = slotRow(new RegExp("assets/img/items/weapons/" + s + "\\.webp$")); return r && !r.wide && r.nw === 256; }), J(v.rows.filter((r) => /^slot:/.test(r.key))));
    check("ui.eq.noEngravingRows", !v.rows.some((r) => r.wide || r.nw === 1200), J(v.rows));
    const itemRow = (src) => v.rows.find((r) => r.src === src);
    const want = { "dynamite-stick-standard-fuse": "assets/img/items/weapons/dynamite-stick-standard-fuse.webp", "dynamite-bundle-3": "assets/img/items/weapons/dynamite-stick-standard-fuse.webp",
      "lamp-oil": "assets/img/items/square/lamp-oil.webp", "whiskey-bottle": "assets/img/items/square/whiskey-bottle.webp", "black-shard": "assets/img/items/black-shard.webp",
      "lasso-of-binding": "assets/img/items/lasso-of-binding.webp", "claim-deed": "assets/img/items/claim-deed.webp", "field-medic-kit": "assets/img/items/square/field-medic-kit.webp" };
    const bad = Object.keys(want).filter((id) => { const r = itemRow(want[id]); return !r || r.nw !== 256 || r.wide; });
    check("ui.eq.itemRowsSquare", bad.length === 0, J({ bad, rows: v.rows.filter((r) => !/^slot:/.test(r.key)) }));
    check("ui.eq.noBannerInRows", !v.rows.some((r) => r.nw === 1200 && /assets\/img\/items\//.test(r.src)), J(v.rows));
    check("ui.cards.engravings", ["navy-army-ball-n-cap-revolver", "henrietta-repeating-rifle"].every((s) => v.cards.some((c) => c.src === "assets/img/weapons/" + s + ".webp" && c.nw === 1200)), J(v.cards));
    check("ui.cards.noTiles", !v.cards.some((c) => /items\/weapons\//.test(c.src)), J(v.cards));
    check("ui.peace.notOnPlayerPage", !/the-peace-maker\.webp/.test(v.html));
    check("ui.noBrokenImages", v.broken.length === 0, J(v.broken));
    await shot(pg, "#itemList", "art-batch1-equipment-weapons.png");
    await shot(pg, "#dollHost .doll", "art-batch1-doll-pistol-long-melee.png");
    /* a few replaced / added item rows, opened from the Use / Gear filters */
    await shot(pg, ".gear-col.gear-weapons", "art-batch1-weapons-cards.png");
    /* Store tab keeps the 3:1 banner thumbs */
    const st = await pg.evaluate(async () => { document.querySelector("#tab-store").click(); await new Promise((r) => setTimeout(r, 600));
      return [...document.querySelectorAll("#storeStock .art-thumb")].map((i) => ({ src: i.getAttribute("src"), nw: i.naturalWidth })); });
    check("ui.store.bannersKept", st.every((t) => !/\/square\/|items\/weapons\//.test(t.src)), J(st));
    const wb = await pg.evaluate(async () => {
      const box = document.createElement("div"); box.className = "store-row"; box.innerHTML = window.SSDNSItemArt.thumbHtml({ id: "lamp-oil", name: "Lamp oil" }); document.body.appendChild(box);
      const i = box.querySelector("img"); await new Promise((r) => { if (i.complete) r(); else { i.onload = i.onerror = r; } });
      return { src: i.getAttribute("src"), nw: i.naturalWidth };
    });
    check("ui.store.thumbStillBanner", wb.src === "assets/img/items/lamp-oil.webp" && wb.nw === 1200, J(wb));
    check("ui.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* more replaced / added item rows */
  {
    const more = ["glowing-letter", "glowing-letter-fireball", "harmonica-of-soothing-melodies", "saddle-of-the-phantom-steed", "old-henrys-rifle", "lightning-tomahawk",
      "cutlass-of-the-suns-fury", "strongbox-key", "bounty-warrant", "eldorite-dust", "greater-healing-libation", "assay-tonic-trail-draught", "gun-cleaning-kit", "lariat-50-ft", "iron-cuffs"];
    const { pg, errs, ctx } = await open(gunSetup, { items: more, noLong: true });
    await pg.evaluate(() => document.querySelectorAll("#itemList img").forEach((i) => { i.loading = "eager"; }));
    await waitImgs(pg); await sleep(300);
    const v = await pg.evaluate(pageInfo);
    const items = v.rows.filter((r) => !/^slot:/.test(r.key) && /assets\/img\/items\//.test(r.src));
    const names = await pg.evaluate((ids) => ids.map((id) => window.SSDNSItems.byId(id).name), more);
    const missingRows = names.filter((n) => !items.some((r) => r.name === n));
    check("ui.rows.replacedAndAdded", missingRows.length === 0 && items.every((r) => r.nw === 256 && !r.wide), J({ missingRows, bad: items.filter((r) => r.nw !== 256 || r.wide) }));
    check("ui.rows.noBrokenImages", v.broken.length === 0, J(v.broken));
    await shot(pg, "#itemList", "art-batch1-item-rows.png");
    check("ui.rows.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* mobile: Equipment rows and the doll with pistol + long gun + melee */
  {
    const { pg, errs, ctx } = await open(gunSetup, { items: ITEMS }, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const v = await pg.evaluate(() => ({ overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      thumbs: [...document.querySelectorAll("#itemList .eq-thumb")].map((t) => { const r = t.getBoundingClientRect(); return { w: r.width, h: r.height, wide: t.classList.contains("eq-wide") }; }) }));
    check("ui.mobile.noOverflow", !v.overflow);
    check("ui.mobile.squareThumbs", v.thumbs.filter((t) => !t.wide).every((t) => Math.abs(t.w - t.h) <= 2), J(v.thumbs));
    await pg.evaluate(() => document.querySelector("#itemList").scrollIntoView());
    await shot(pg, "#itemList", "art-batch1-mobile-equipment.png");
    await pg.evaluate(() => document.querySelector("#dollHost").scrollIntoView());
    await shot(pg, "#dollHost .doll", "art-batch1-mobile-doll.png");
    check("ui.mobile.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* Pact Seeker: Pact Shot tile on the iron card's button, desktop + mobile */
  for (const vp of [{ width: 1300, height: 1000, deviceScaleFactor: 2 }, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]) {
    const mobile = vp.width < 600;
    const { pg, errs, ctx } = await open((o) => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Pact"; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.subclass = o; c.cantrips = ["Fire Bolt"];
    }), "lass-o-lakes", vp);
    await pg.evaluate(() => { const b = document.querySelector("#pactFocus"); if (b) b.scrollIntoView({ block: "center" }); });
    await waitImgs(pg); await sleep(300);
    const b = await pg.evaluate(() => {
      const btn = document.querySelector("#btnPactShot"), im = btn && btn.querySelector("img.iron-spell-art");
      const other = document.querySelector("#pactIronSpells .iron-spell");
      const r = btn ? btn.getBoundingClientRect() : null, ir = im ? im.getBoundingClientRect() : null;
      return { text: btn ? btn.textContent.trim() : "", src: im ? im.getAttribute("src") : "", nw: im ? im.naturalWidth : 0, h: r ? r.height : 0, oh: other ? other.getBoundingClientRect().height : 0,
        inside: !!(r && ir && ir.left >= r.left - 0.5 && ir.right <= r.right + 0.5 && ir.top >= r.top - 4 && ir.bottom <= r.bottom + 4), iw: ir ? ir.width : 0,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1, shown: !!(btn && btn.offsetParent) };
    });
    const tag = mobile ? "ui.pactShot.mobile" : "ui.pactShot";
    const ir = await pg.evaluate(() => {
      const row = document.querySelector('#itemList li[data-eq-cat="weapons"][data-iron-class]'), ri = row && row.querySelector(".eq-thumb img");
      const s = document.querySelector("#dollHost .doll-iron .doll-art"), card = document.querySelector("#pactIronArt:not([hidden]) img");
      return { row: ri ? ri.getAttribute("src") : "", rowWide: !!(ri && ri.closest(".eq-thumb").classList.contains("eq-wide")), doll: s ? s.getAttribute("src") : "", card: card ? card.getAttribute("src") : "" };
    });
    check(tag + ".ironRowTile", ir.row === "assets/img/items/borrowed-iron/butter-repeater.webp" && !ir.rowWide, J(ir));
    check(tag + ".ironDollAndCardEngraving", ir.doll === "assets/img/weapons/borrowed-iron/butter-repeater.webp" && ir.card === "assets/img/weapons/borrowed-iron/butter-repeater.webp", J(ir));
    check(tag + ".art", b.shown && b.src === "assets/img/spells/pact-shot.webp" && b.nw === 256 && b.text === "Pact Shot" && b.iw >= 18 && b.iw <= 22, J(b));
    check(tag + ".layout", b.inside && b.h > 0 && b.h <= 40 && (!b.oh || Math.abs(b.h - b.oh) <= 4) && !b.overflow, J(b));
    await shot(pg, "#pactFocus", mobile ? "art-batch1-mobile-iron-card.png" : "art-batch1-iron-card-pact-shot.png");
    check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall art-batch1 checks passed");
process.exit(failures.length ? 1 : 0);

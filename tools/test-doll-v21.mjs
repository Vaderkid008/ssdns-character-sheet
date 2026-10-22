/**
 * Paper Doll v2.1 item art (Art Bot, Jessey approved 2026-10-22 4:25 AM CT).
 *  - 22 worn items: a 256 colour tile at assets/img/items/<slug>.webp (Equipment list / item rows) and a 400x400 b/w
 *    engraving at assets/img/items/gear/<slug>.webp (paper doll). Mapped by future catalog id (= slug) and, for custom
 *    items, by name (item-art.js gearV21). The four plain store rows (Cattleman hat, Bandana, Work gloves, Leather chaps)
 *    match their exact plain name (r2); other hats / bandanas / gloves / chaps keep the generic art.
 *  - Cottonwood Walking Stick: a melee weapon with a 1200x400 engraving (cards, doll) and a 256 tile (Equipment list).
 *  - The three new belts draw wide on the doll (WIDE_GEAR_ART).
 *   node tools/test-doll-v21.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
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
const dim = (rel, w, h) => { const i = webpInfo(rel); return !!i && i.w === w && i.h === h; };

const SLUGS = ["cattleman-hat", "bandana", "pocket-watch", "signet-ring", "work-gloves", "leather-chaps", "rail-gang-rifle-plate", "tin-star-board",
  "lost-troop-cavalry-shield", "hushwire-shoulder-rig", "rattlers-skeleton-rig", "last-word-cross-draw", "dry-powder-bandolier", "rodeo-champions-buckle",
  "gravediggers-gun-belt", "brush-buster-chaps", "rattler-hide-chaps", "saddle-glue-woolies", "brass-bound-hymn-book", "brass-magnifying-glass",
  "tight-lip-ring", "reinforced-trail-leathers"];

/* ---------- files ---------- */
check("file.tiles", SLUGS.every((s) => dim("assets/img/items/" + s + ".webp", 256, 256)), J(SLUGS.filter((s) => !dim("assets/img/items/" + s + ".webp", 256, 256))));
check("file.engravings", SLUGS.every((s) => dim("assets/img/items/gear/" + s + ".webp", 400, 400) && webpInfo("assets/img/items/gear/" + s + ".webp").alpha),
  J(SLUGS.filter((s) => !dim("assets/img/items/gear/" + s + ".webp", 400, 400))));
check("file.stick.engraving", dim("assets/img/weapons/cottonwood-walking-stick.webp", 1200, 400));
check("file.stick.tile", dim("assets/img/items/weapons/cottonwood-walking-stick.webp", 256, 256));
check("file.genericsKept", ["hat-cattleman", "neck-bandana", "gloves-leather", "chaps-leather"].every((s) => exists("assets/img/items/gear/" + s + ".webp")));

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
const IT = sb.SSDNSItemArt, A = sb.SSDNSWeaponArt, IA = sb.SSDNSIronArt, Items = sb.SSDNSItems, D = sb.SSDNSDoll, R = sb.SSDNS_RULES;

check("map.sameSlugs", J(IT.gearV21Slugs()) === J(SLUGS) && J(D.GEAR_V21) === J(SLUGS));
for (const s of SLUGS) {
  check("id." + s, D.gearArtFile(s) === s && IT.srcFor({ id: s }) === "assets/img/items/" + s + ".webp" && Items.artSrc({ uid: "u", catalogId: s, id: s, name: "x", type: "gear" }) === "assets/img/items/" + s + ".webp",
    J([D.gearArtFile(s), IT.srcFor({ id: s })]));
}
/* custom items by name: tile in the Equipment list, engraving on the doll, kept inside the slot family */
const NAMED = [
  ["Pocket watch", "trinket", "accessory_2", "pocket-watch"], ["Signet ring", "ring", "ring_1", "signet-ring"],
  ["Rail-Gang Rifle Plate", "shield", "accessory_8", "rail-gang-rifle-plate"], ["Tin-Star Board", "shield", "accessory_8", "tin-star-board"],
  ["Lost Troop Cavalry Shield", "shield", "accessory_8", "lost-troop-cavalry-shield"], ["Hushwire Shoulder Rig", "holster", "holster_l", "hushwire-shoulder-rig"],
  ["Rattler's Skeleton Rig", "holster", "holster_r", "rattlers-skeleton-rig"], ["Last Word Cross-Draw", "holster", "holster_l", "last-word-cross-draw"],
  ["Dry-Powder Bandolier", "bandolier", "gunbelt", "dry-powder-bandolier"], ["Rodeo Champion's Buckle", "belt", "gunbelt", "rodeo-champions-buckle"],
  ["Gravedigger's Gun Belt", "belt", "gunbelt", "gravediggers-gun-belt"], ["Brush-Buster Chaps", "legs", "chaps", "brush-buster-chaps"],
  ["Rattler-Hide Chaps", "legs", "chaps", "rattler-hide-chaps"], ["Saddle-Glue Woolies", "chaps", "chaps", "saddle-glue-woolies"],
  ["Tight-Lip Ring", "ring", "ring_2", "tight-lip-ring"], ["Reinforced Trail Leathers", "armor", "vest", "reinforced-trail-leathers"]
];
for (const [name, wear, slot, slug] of NAMED) {
  const it = { uid: "u-" + slug, name, type: "gear", wear, equipSlot: slot };
  check("name." + slug, D.gearArtFile(it, slot) === slug && Items.artSrc(it) === "assets/img/items/" + slug + ".webp", J([D.gearArtFile(it, slot), Items.artSrc(it)]));
}
check("name.focusItems", Items.artSrc({ uid: "h", name: "Brass-Bound Hymn-Book", type: "gear" }) === "assets/img/items/brass-bound-hymn-book.webp" &&
  Items.artSrc({ uid: "m", name: "Brass Magnifying Glass", type: "gear" }) === "assets/img/items/brass-magnifying-glass.webp");
check("name.wrongSlotFamily", D.gearArtFile({ name: "Rattler-Hide Chaps", wear: "legs" }, "hat") === "hat-cattleman");
/* r2 (Jessey 2026-10-22 6:02 AM): the four plain store names take the new art; other hats / gloves / chaps keep the generic */
const PLAIN = [["Leather chaps", "legs", "chaps", "leather-chaps"], ["Cattleman hat", "head", "hat", "cattleman-hat"], ["Bandana", "neck", "neck", "bandana"], ["Work gloves", "gloves", "gloves", "work-gloves"]];
for (const [name, wear, slot, slug] of PLAIN) {
  const it = { uid: "p-" + slug, name, type: "gear", wear, equipSlot: slot };
  check("plain." + slug, D.gearArtFile(it, slot) === slug && Items.artSrc(it) === "assets/img/items/" + slug + ".webp" && D.gearArtFile({ name: " " + name.toUpperCase() + " ", wear }, slot) === slug, J([D.gearArtFile(it, slot), Items.artSrc(it)]));
}
check("generic.kept", D.gearArtFile({ name: "Batwing chaps", wear: "legs" }, "chaps") === "chaps-leather" && D.gearArtFile({ name: "Stetson hat", wear: "head" }, "hat") === "hat-cattleman" &&
  D.gearArtFile({ name: "Red bandana", wear: "neck" }, "neck") === "neck-bandana" && D.gearArtFile({ name: "Leather gloves", wear: "gloves" }, "gloves") === "gloves-leather" &&
  D.gearArtFile({ name: "Old cattleman hat", wear: "head" }, "hat") === "hat-cattleman");
check("generic.oreSignet", D.gearArtFile({ id: "ore-buyers-signet", name: "Ore Buyer's Signet", wear: "ring" }, "ring_1") === "ring-eldorite");
check("generic.badgeHoly", !IT.gearV21({ id: "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol", name: "Holy symbol (badge, saint-medal, carved Eldorite, hymn-book)" }));
check("generic.oreGlass", !IT.gearV21({ id: "assay-glass-magnifying-glass", name: "Ore glass (magnifying glass)" }));
check("generic.phbShield", D.gearArtFile("shield-badge-board-cavalry-shield-rifle-plate", "accessory_8") === "shield");
check("ownArtWins", Items.artSrc({ uid: "o", name: "Rodeo Champion's Buckle", type: "gear", wear: "belt", art: "assets/img/items/hat-of-the-sharpshooter.webp" }) === "assets/img/items/hat-of-the-sharpshooter.webp");
check("dm.prefix", sandbox("/ssdns-character-sheet/dm/index.html").SSDNSItemArt.srcFor({ name: "Tin-Star Board" }) === "../assets/img/items/tin-star-board.webp");

/* the doll: engravings (not tiles), wide belts */
const c = { calling: "", items: [
  { uid: "a", name: "Rodeo Champion's Buckle", type: "gear", wear: "belt", equipSlot: "gunbelt" },
  { uid: "b", name: "Rattler-Hide Chaps", type: "gear", wear: "legs", equipSlot: "chaps" },
  { uid: "d", name: "Tin-Star Board", type: "gear", wear: "shield", equipSlot: "accessory_8" },
  { uid: "e", name: "Pocket watch", type: "gear", wear: "trinket", equipSlot: "accessory_1" },
  { uid: "f", name: "Leather chaps", type: "gear", wear: "legs" }
], guns: [], melee: [] };
let h = D.html(c, {});
check("doll.engravings", /items\/gear\/rodeo-champions-buckle\.webp/.test(h) && /items\/gear\/rattler-hide-chaps\.webp/.test(h) && /items\/gear\/tin-star-board\.webp/.test(h) &&
  /items\/gear\/pocket-watch\.webp/.test(h) && !/assets\/img\/items\/(rodeo-champions-buckle|rattler-hide-chaps|tin-star-board|pocket-watch)\.webp/.test(h));
check("doll.wideBelt", /doll-wideart[^>]*data-doll-slot="gunbelt"/.test(h));
check("doll.chapsNotWide", !/doll-wideart[^>]*data-doll-slot="chaps"/.test(h));
for (const s of ["dry-powder-bandolier", "rodeo-champions-buckle", "gravediggers-gun-belt"]) check("wide." + s, !!D.WIDE_GEAR_ART[s]);

/* the Cottonwood Walking Stick: a created melee weapon flagged as a focus */
R.melee.push({ id: "custom-cottonwood-walking-stick", name: "Cottonwood Walking Stick", damage: "1d6", dmgType: "bludgeoning", properties: "versatile (1d8)", custom: true });
check("stick.slug", A.slugFor({ id: "custom-cottonwood-walking-stick", name: "Cottonwood Walking Stick" }) === "cottonwood-walking-stick" &&
  A.slugFor({ id: "x", name: "Cottonwood Walking Stick (Fine druidic focus)" }) === "cottonwood-walking-stick");
check("stick.card", A.srcFor({ id: "custom-cottonwood-walking-stick", name: "Cottonwood Walking Stick" }) === "assets/img/weapons/cottonwood-walking-stick.webp");
check("stick.tile", IA.weaponTile({ id: "custom-cottonwood-walking-stick", name: "Cottonwood Walking Stick" }) === "assets/img/items/weapons/cottonwood-walking-stick.webp");
c.melee = [{ weapon: "custom-cottonwood-walking-stick", equipped: true, isFocus: true }];
h = D.html(c, {});
const fs0 = D.focusState(c);
check("stick.melee", /doll-longart[^>]*data-doll-slot="melee"[^>]*>\s*<img class="doll-art" alt="" src="assets\/img\/weapons\/cottonwood-walking-stick\.webp"/.test(h), (h.match(/data-doll-slot="melee"[^>]*>[^>]*>/) || [""])[0]);
check("stick.focus", fs0 && fs0.kind === "weapon" && fs0.name === "Cottonwood Walking Stick" && fs0.art === "assets/img/weapons/cottonwood-walking-stick.webp" &&
  /data-doll-slot="focus_borrowed_iron"[^>]*>\s*<img class="doll-art" alt="" src="assets\/img\/weapons\/cottonwood-walking-stick\.webp"/.test(h), J(fs0));

/* r2 (Jessey 2026-10-22 6:02 AM): empty-slot outlines, the bigger Melee art, the centred Focus mirror */
{
  const e = D.html({ items: [], guns: [], melee: [] }, {});
  const svg = (k) => (e.match(new RegExp('data-doll-slot="' + k + '"[^>]*>\\s*(<svg[^>]*>[\\s\\S]*?</svg>)')) || [])[1] || "";
  check("glyph.longRifle", /data-glyph="long" viewBox="6 0 22 96"/.test(svg("long_gun")), svg("long_gun"));
  check("glyph.pistolR", /data-glyph="pistol" viewBox="0 0 48 48"/.test(svg("revolver_2")) && !/scale\(-1 1\)/.test(svg("revolver_2")), svg("revolver_2"));
  check("glyph.pistolLMirrored", /data-glyph="pistol"/.test(svg("revolver_1")) && /transform="translate\(48 0\) scale\(-1 1\)"/.test(svg("revolver_1")), svg("revolver_1"));
  check("glyph.focusCrystal", /data-glyph="focus"/.test(svg("focus_borrowed_iron")) && svg("focus_borrowed_iron").includes("M24 6l9 11-9 25-9-25z"));
  check("glyph.classKept", /data-doll-slot="boots"[^>]*>[^<]*<svg class="doll-glyph"/.test(e));
  const css = read("assets/css/sheet.css");
  check("css.meleeBigger", /\.doll-longart\[data-doll-slot="melee"\] \.doll-art \{[^}]*width: 192%/.test(css));
  check("css.focusCentred", /\.doll-wide\.doll-focus-weapon\.filled \.doll-art \{ inset: 24% 8% 15%/.test(css));
  check("css.glyphLong", /\.doll-glyph\[data-glyph="long"\]/.test(css));
}

console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nALL PASS");
process.exit(failures.length ? 1 : 0);

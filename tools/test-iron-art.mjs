/**
 * 0.3.96 (Jessey approved Art Bot's per-weapon art 2026-10-20 9:17 PM CT): Borrowed Iron + Caster Gun art.
 *  - Pact name (character.subclass) -> iron slug -> 256 item tile (Equipment row, Focus slot) + 1200x400 engraving (Gear card).
 *  - BOOK1 L2060: the DM reveals what the Borrowed Iron really is, so the player's sheet keeps the generic art until
 *    character.ironRevealed (DMCC "Reveal to player", command iron_reveal). The DM page always sees it.
 *  - Hexslinger Focus slot + Weapons rows use the square Caster Gun tile, not the 3:1 engraving cropped to its middle.
 *   node tools/test-iron-art.mjs     (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-iron-art.mjs   also saves iron-art-*.png screenshots
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
/* webp canvas size (VP8X / VP8 / VP8L) */
function webpSize(rel) {
  const b = fs.readFileSync(path.join(root, rel));
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const t = b.toString("ascii", 12, 16);
  if (t === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (t === "VP8 ") return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (t === "VP8L") { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return null;
}

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const IA = sb.SSDNSIronArt, D = sb.SSDNSDoll, K = sb.SSDNSKits, A = sb.SSDNSWeaponArt;
const SLUGS = ["hell-maker", "lightslinger", "butter-repeater", "virgil", "sirocco-long-rifle", "pallbearer", "revenge-of-the-sea"];
const pacts = (sb.SSDNS_RULES.callings || []).find((c) => c.id === "pact-seeker").subclasses.map((s) => s.id);
check("map.everyPactHasIron", pacts.length === 7 && pacts.every((id) => SLUGS.indexOf(IA.PACT_SLUG[id]) >= 0), J(pacts));
check("map.sevenDistinct", new Set(Object.values(IA.PACT_SLUG)).size === 7 && J(IA.slugs().slice().sort()) === J(SLUGS.slice().sort()));
check("map.crossroads", IA.PACT_SLUG["the-crossroads-note"] === "hell-maker" && IA.PACT_SLUG["the-drowned-breath"] === "revenge-of-the-sea" && IA.PACT_SLUG["the-last-round"] === "virgil");
SLUGS.forEach((s) => {
  const tile = "assets/img/items/borrowed-iron/" + s + ".webp";
  check("file.tile." + s, fs.existsSync(path.join(root, tile)) && J(webpSize(tile)) === "[256,256]", J(fs.existsSync(path.join(root, tile)) && webpSize(tile)));
  const c = { calling: "pact-seeker", subclass: Object.keys(IA.PACT_SLUG).find((k) => IA.PACT_SLUG[k] === s), ironRevealed: true };
  const eng = IA.engravingSrc(c);
  check("file.engraving." + s, !!eng && fs.existsSync(path.join(root, eng)) && J(webpSize(eng)) === "[1200,400]", eng);
});
check("file.hellMakerReused", IA.engravingSrc({ calling: "pact-seeker", subclass: "the-crossroads-note", ironRevealed: true }) === "assets/img/dm-only/hell-maker.webp" &&
  !fs.existsSync(path.join(root, "assets/img/weapons/borrowed-iron/hell-maker.webp")));
["blacksnake", "hognose"].forEach((g) => check("file.casterTile." + g, J(webpSize("assets/img/items/caster/" + g + ".webp")) === "[256,256]"));

/* reveal gate (BOOK1 L2060) */
const ps = { calling: "pact-seeker", subclass: "the-crossroads-note" };
check("gate.hiddenByDefault", IA.slugFor(ps) === "" && IA.tileSrc(ps) === "" && IA.engravingSrc(ps) === "" && IA.nameFor(ps) === "");
check("gate.dmSees", IA.slugFor(ps, { dm: true }) === "hell-maker" && IA.nameFor(ps, { dm: true }) === "Hell Maker");
check("gate.revealed", IA.tileSrc(Object.assign({}, ps, { ironRevealed: true })) === "assets/img/items/borrowed-iron/hell-maker.webp");
check("gate.noPact", IA.slugFor({ calling: "pact-seeker", subclass: "", ironRevealed: true }) === "" && IA.slugFor({ calling: "pact-seeker", subclass: "made-up", ironRevealed: true }) === "");
check("gate.otherCalling", IA.slugFor({ calling: "gunslinger", subclass: "the-crossroads-note", ironRevealed: true }) === "");
check("map.byName", IA.pactSlug({ subclass: "Lass O' Lakes" }) === "butter-repeater" && IA.pactSlug({ subclass: "The Pine Box Contract" }) === "pallbearer");
/* the old DM-only weapon-art rule still holds for the 3:1 list */
check("weaponArt.hellStillHidden", A.srcFor({ id: "hell-maker", name: "Hell Maker" }) === "" && A.slugs().indexOf("hell-maker") < 0);

/* Focus slot */
const pact = (sub, rev) => { const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; c.subclass = sub; if (rev) c.ironRevealed = true; return c; };
let f = D.focusState(pact("the-crossroads-note"));
check("focus.genericUntilRevealed", /assets\/img\/items\/borrowed-iron\.webp$/.test(f.art) && f.name === "Borrowed Iron" && f.note === "In hand · pact focus", J(f));
f = D.focusState(pact("the-crossroads-note", true));
check("focus.hellMaker", /items\/borrowed-iron\/hell-maker\.webp$/.test(f.art) && f.name === "Borrowed Iron" && f.note === "In hand · Hell Maker", J(f));
f = D.focusState(pact("lass-o-lakes", true));
check("focus.butterRepeater", /items\/borrowed-iron\/butter-repeater\.webp$/.test(f.art), J(f));
f = D.focusState(pact("", true));
check("focus.noPactGeneric", /assets\/img\/items\/borrowed-iron\.webp$/.test(f.art), J(f));
const hx = K.apply(K.blankCharacter(), "hexslinger", {}); hx.calling = "hexslinger";
f = D.focusState(hx);
check("focus.hexSquareTile", f && f.kind === "caster" && /items\/caster\/blacksnake\.webp$/.test(f.art), J(f));
check("weaponTile.only.casters", IA.weaponTile("blacksnake") && IA.weaponTile({ id: "hognose" }) && IA.weaponTile("dullards-plinker-revolver") === "");

/* wiring (source checks) */
check("wire.sheetScript", /assets\/js\/iron-art\.js\?v=/.test(read("index.html")) && /\.\.\/assets\/js\/iron-art\.js\?v=/.test(read("dm/index.html")));
const dj = read("assets/js/dm-join.js");
check("wire.revealCmd", /case "iron_reveal":[\s\S]{0,300}doc\.character\.ironRevealed = payload\.on !== false/.test(dj));
check("wire.snapshot", /ironRevealed: !!c\.ironRevealed/.test(dj));
const dm = read("dm/assets/js/dmcc.js");
check("wire.dmccButton", /type: "iron_reveal", to: pid/.test(dm) && /function ironSectionHtml\(s\)/.test(dm));
check("wire.noPublicFeed", !/postDmAction\([^)]*Borrowed Iron/.test(dm));
check("rules.untouched", !/ironRevealed|iron_reveal/.test(read("database.rules.json")));

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
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
  await pg.addStyleTag({ content: ".toast{display:none!important}" });
  await sleep(250);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
}
async function open(setup, arg) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + "/index.html?fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSIronArt && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  await pg.evaluate(setup, arg);
  await sleep(500);
  await pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
  await sleep(700);
  return { pg, errs };
}
const info = () => {
  const s = document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]');
  const im = s && s.querySelector(".doll-art");
  const thumb = (cat) => [...document.querySelectorAll('#itemList li[data-eq-cat="' + cat + '"] .eq-thumb img')].map((i) => ({ src: i.getAttribute("src"), ok: i.complete && i.naturalWidth > 0, nw: i.naturalWidth, nh: i.naturalHeight }));
  const eng = document.querySelector("#pactIronArt");
  const ei = eng && eng.querySelector("img");
  return {
    focusArt: im ? im.getAttribute("src") : "", focusOk: !!(im && im.naturalWidth > 0),
    note: s && s.querySelector(".doll-focus-note") ? s.querySelector(".doll-focus-note").textContent : "",
    focusRows: thumb("focus"), weaponRows: thumb("weapons"),
    eng: eng && !eng.hidden && ei ? { src: ei.getAttribute("src"), ok: ei.naturalWidth === 1200 && ei.naturalHeight === 400 } : null,
    ironName: (document.querySelector("#pactIronName:not([hidden])") || {}).textContent || ""
  };
};
const pactSetup = (o) => window.SSDNSApp.applyPatch((d) => {
  const c = d.character; c.name = o.name; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
  window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.cantrips = ["Eldritch Blast"]; c.subclass = o.sub;
  if (o.rev) c.ironRevealed = true;
});
async function waitImgs(pg) { await pg.evaluate(() => Promise.all([...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 3000); })))); }
try {
  /* Crossroads Note, not yet revealed: generic everywhere */
  {
    const { pg, errs } = await open(pactSetup, { name: "Ash", sub: "the-crossroads-note", rev: false });
    await pg.evaluate(() => document.querySelector("#dollHost").scrollIntoView());
    await waitImgs(pg);
    let v = await pg.evaluate(info);
    check("ui.hidden.focusGeneric", /assets\/img\/items\/borrowed-iron\.webp/.test(v.focusArt) && v.focusOk, J(v));
    check("ui.hidden.rowGeneric", v.focusRows.length === 1 && /items\/borrowed-iron\.webp/.test(v.focusRows[0].src), J(v.focusRows));
    check("ui.hidden.noEngraving", v.eng === null && v.ironName === "", J(v.eng));
    await shot(pg, "#dollHost .doll", "iron-art-pact-hidden-focus.png");
    /* the DM reveals it (same patch the iron_reveal command makes) */
    await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { d.character.ironRevealed = true; }));
    await sleep(700); await waitImgs(pg);
    v = await pg.evaluate(info);
    check("ui.reveal.focusHellMaker", /items\/borrowed-iron\/hell-maker\.webp/.test(v.focusArt) && v.focusOk && /Hell Maker/.test(v.note), J(v));
    check("ui.reveal.rowTile", v.focusRows.length === 1 && /items\/borrowed-iron\/hell-maker\.webp/.test(v.focusRows[0].src) && v.focusRows[0].ok && v.focusRows[0].nw === 256, J(v.focusRows));
    check("ui.reveal.engraving", !!v.eng && /dm-only\/hell-maker\.webp/.test(v.eng.src) && v.eng.ok && /Hell Maker/.test(v.ironName), J(v.eng));
    await shot(pg, "#dollHost .doll", "iron-art-pact-hell-maker-focus.png");
    await shot(pg, "#itemList", "iron-art-pact-hell-maker-equipment.png");
    await shot(pg, "#pactFocus", "iron-art-pact-hell-maker-card.png");
    check("ui.pact.noPageErrors", errs.length === 0, errs.join(" | "));
    await pg.browserContext().close();
  }
  /* two more patrons, revealed */
  for (const [sub, slug, nm, label] of [["lass-o-lakes", "butter-repeater", "Butter Repeater", "butter-repeater"], ["the-drowned-breath", "revenge-of-the-sea", "Revenge of the Sea", "revenge-of-the-sea"], ["the-last-round", "virgil", "Virgil", "virgil"]]) {
    const { pg, errs } = await open(pactSetup, { name: "Pact " + nm, sub, rev: true });
    await waitImgs(pg);
    const v = await pg.evaluate(info);
    check("ui." + slug + ".focus", new RegExp("items/borrowed-iron/" + slug + "\\.webp").test(v.focusArt) && v.focusOk, J(v));
    check("ui." + slug + ".engraving", !!v.eng && new RegExp("weapons/borrowed-iron/" + slug + "\\.webp").test(v.eng.src) && v.eng.ok && v.ironName.indexOf(nm) >= 0, J(v.eng));
    if (slug !== "virgil") {
      await shot(pg, "#dollHost .doll", "iron-art-pact-" + label + "-focus.png");
      await shot(pg, "#pactFocus", "iron-art-pact-" + label + "-card.png");
    }
    check("ui." + slug + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await pg.browserContext().close();
  }
  /* Hexslinger: Blacksnake in Pistol L, Hognose carried */
  {
    const { pg, errs } = await open(() => window.SSDNSApp.applyPatch((d) => {
      const c = d.character; c.name = "Dust"; c.calling = "hexslinger"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "hexslinger", {}); c.kitStamp = "hexslinger"; c.cantrips = ["Fire Bolt"];
      c.guns[1] = { weapon: "hognose", proficient: true, chambers: [], equipped: false };
    }));
    await waitImgs(pg);
    const v = await pg.evaluate(info);
    check("ui.hex.focusTile", /items\/caster\/blacksnake\.webp/.test(v.focusArt) && v.focusOk, J(v));
    const bs = v.weaponRows.find((r) => /blacksnake/.test(r.src)), hn = v.weaponRows.find((r) => /hognose/.test(r.src));
    check("ui.hex.rowsSquare", !!bs && !!hn && /items\/caster\//.test(bs.src) && /items\/caster\//.test(hn.src) && bs.ok && bs.nw === bs.nh, J(v.weaponRows));
    check("ui.hex.gunCardStill3x1", await pg.evaluate(() => { const i = document.querySelector('.gun[data-row="0"] .g-photo img'); return !!i && /assets\/img\/weapons\/blacksnake\.webp/.test(i.getAttribute("src")); }));
    await shot(pg, "#dollHost .doll", "iron-art-hexslinger-focus.png");
    await shot(pg, "#itemList", "iron-art-hexslinger-equipment.png");
    check("ui.hex.noPageErrors", errs.length === 0, errs.join(" | "));
    await pg.browserContext().close();
  }
  /* DMCC player card (demo): the DM always sees the iron; Reveal sends iron_reveal */
  {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport({ width: 1300, height: 1100, deviceScaleFactor: 2 });
    await pg.goto(ORIGIN + "/dm/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.DMCC && window.SSDNSIronArt && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length, { timeout: 20000 });
    const pid = await pg.evaluate(() => { const id = Object.keys(window.DMCC.state.players)[1];
      Object.assign(window.DMCC.state.players[id].snapshot, { calling: "Pact Seeker", callingId: "pact-seeker", subclass: "the-crossroads-note", ironRevealed: false }); return id; });
    await pg.evaluate((id) => document.querySelector('.pcard[data-pid="' + id + '"]').click(), pid);
    await sleep(900); await waitImgs(pg);
    const v = await pg.evaluate(() => { const s = document.querySelector(".dm-iron"); const im = s && [...s.querySelectorAll("img")];
      return s ? { name: s.querySelector("b").textContent, tile: im[0].getAttribute("src"), tileOk: im[0].naturalWidth === 256, eng: im[1].getAttribute("src"), engOk: im[1].naturalWidth === 1200, btn: s.querySelector("#btnDmIronReveal").textContent } : null; });
    check("dm.section", !!v && v.name === "Hell Maker" && /\.\.\/assets\/img\/items\/borrowed-iron\/hell-maker\.webp/.test(v.tile) && v.tileOk && /dm-only\/hell-maker\.webp/.test(v.eng) && v.engOk && v.btn === "Reveal to player", J(v));
    await shot(pg, ".dm-iron", "iron-art-dmcc-reveal.png");
    const after = await pg.evaluate((id) => { document.querySelector("#btnDmIronReveal").click(); return { btn: document.querySelector("#btnDmIronReveal").textContent, snap: window.DMCC.state.players[id].snapshot.ironRevealed }; }, pid);
    check("dm.revealToggle", after.btn === "Hide again" && after.snap === true, J(after));
    check("dm.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall iron-art checks passed");
process.exit(failures.length ? 1 : 0);

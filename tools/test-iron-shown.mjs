/**
 * 0.3.105 (Jessey 2026-10-21 5:47 / 5:50 PM CT): "Can't you just show the actual gun here? We don't have to hide it."
 * Sheet-only choice: from the Pact pick on, the player's sheet shows the real Borrowed Iron (name, tile, engraving)
 * everywhere, with no DM reveal (this intentionally differs from BOOK1 L2060). No Pact yet: the plain Borrowed Iron.
 * The DMCC player card has no Reveal toggle; character.ironRevealed stays on old saves and is ignored.
 *   node tools/test-iron-shown.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
 *   SSDNS_SHOTS=/workspace/specs node tools/test-iron-shown.mjs   also saves iron-shown-*.png screenshots
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
const PACTS = [
  ["the-crossroads-note", "hell-maker", "Hell Maker", "revolver_2", "Pact revolver"],
  ["the-sealed-orders", "lightslinger", "Lightslinger", "revolver_2", "Pact revolver"],
  ["lass-o-lakes", "butter-repeater", "Butter Repeater", "long_gun", "Pact rifle"],
  ["the-last-round", "virgil", "Virgil", "revolver_2", "Pact revolver"],
  ["the-sand-oath", "sirocco-long-rifle", "Sirocco Long-Rifle", "long_gun", "Pact rifle"],
  ["the-pine-box-contract", "pallbearer", "Pallbearer", "long_gun", "Pact shotgun"],
  ["the-drowned-breath", "revenge-of-the-sea", "Revenge of the Sea", "long_gun", "Pact rifle"] /* U6 (Jessey 7:34 PM): was "Pact harpoon gun" */
];
const eng = (slug) => (slug === "hell-maker" ? "assets/img/dm-only/hell-maker.webp" : "assets/img/weapons/borrowed-iron/" + slug + ".webp");
const tile = (slug) => "assets/img/items/borrowed-iron/" + slug + ".webp";

/* ---------- node part ---------- */
const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js",
  "assets/js/spell-fx.js", "assets/js/spell-cast.js", "assets/js/pact-shot.js", "assets/js/creator.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const IA = sb.SSDNSIronArt, D = sb.SSDNSDoll, K = sb.SSDNSKits;
const pact = (sub, extra) => { const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; c.subclass = sub; Object.assign(c, extra || {}); D.syncIron(c, { pactChanged: true }); return c; };
for (const [sub, slug, nm, slot, cls] of PACTS) {
  for (const extra of [{}, { ironRevealed: false }, { ironRevealed: true }]) {
    const c = pact(sub, extra), tag = "node." + slug + (extra.ironRevealed === undefined ? ".noField" : extra.ironRevealed ? ".revealedField" : ".falseField");
    const st = D.ironState(c);
    check(tag + ".realIron", IA.nameFor(c) === nm && IA.tileSrc(c) === tile(slug) && IA.engravingSrc(c) === eng(slug) && IA.labelFor(c) === nm + " — " + cls, J([IA.nameFor(c), IA.labelFor(c)]));
    check(tag + ".doll", st.key === slot && st.art === tile(slug) && st.note === "In hand · " + nm && D.weaponName(c, slot) === nm, J(st));
    check(tag + ".slotArt", D.slotArt(c, slot) === eng(slug) /* 0.3.105 (Jessey 7:47 PM): engraving in every doll slot */ && IA.hiddenArt(c) === "", D.slotArt(c, slot));
  }
}
const none = pact("");
check("node.noPact.generic", IA.nameFor(none) === "" && IA.labelFor(none) === "Borrowed Iron" && IA.tileSrc(none) === "" && IA.engravingSrc(none) === "" &&
  /items\/borrowed-iron\.webp$/.test(D.ironState(none).art) && IA.hiddenArt(none) === "", J(D.ironState(none)));
check("node.revealedIgnored", IA.revealed({}) === true && IA.revealed({ ironRevealed: false }) === true);
/* source wiring: the DMCC Reveal toggle is gone; the player-side command is harmless */
const dmcc = read("dm/assets/js/dmcc.js"), join = read("assets/js/dm-join.js"), iron = read("assets/js/iron-art.js");
check("src.noRevealButton", !/btnDmIronReveal|Reveal to player|Hide again/.test(dmcc));
check("src.noRevealLog", !/revealed your Borrowed Iron|true shape again/.test(join));
check("src.noGate", !/c\.ironRevealed === true/.test(iron));
check("src.rulesUntouched", !/ironRevealed/.test(read("database.rules.json")));

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
async function page(url) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1300, height: 1000, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
  return { pg, errs, ctx };
}
async function sheet(sub) {
  const P = await page("/index.html?nowizard=1&fresh=" + Date.now());
  await P.pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSIronArt && window.SSDNSKits && document.querySelector("#dollHost"), { timeout: 20000 });
  await sleep(900);
  await P.pg.evaluate((sub) => window.SSDNSApp.applyPatch((d) => {
    const c = d.character; c.name = "Pact Seeker"; c.calling = "pact-seeker"; c.level = 3; c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
    window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.cantrips = ["Eldritch Blast"]; c.subclass = sub; delete c.ironRevealed;
    window.SSDNSDoll.syncIron(c, { pactChanged: true });
  }), sub);
  await sleep(500);
  await P.pg.evaluate(() => { if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
  await sleep(700); await waitImgs(P.pg);
  return P;
}
const view = (slot) => {
  const s = slot ? document.querySelector('#dollHost [data-doll-slot="' + slot + '"]') : [...document.querySelectorAll("#dollHost .doll-iron")][0];
  const im = s && s.querySelector(".doll-art");
  const row = document.querySelector('#itemList li[data-eq-cat="weapons"][data-iron-class]') ||
    [...document.querySelectorAll('#itemList li[data-eq-cat="weapons"]')].find((li) => /Borrowed Iron/.test(li.textContent));
  const ri = row && row.querySelector(".eq-thumb img");
  const card = document.querySelector("#pactFocus");
  const ci = card && card.querySelector("#pactIronArt:not([hidden]) img");
  const f = document.querySelector('#dollHost [data-doll-slot="focus_borrowed_iron"]');
  return {
    slot: s ? s.getAttribute("data-doll-slot") : "", slotArt: im ? im.getAttribute("src") : "", slotOk: !!(im && im.naturalWidth > 0),
    slotName: s && s.querySelector(".doll-name") ? s.querySelector(".doll-name").textContent : "",
    rowName: row ? row.querySelector(".eq-name b").textContent : "", rowSub: row ? row.querySelector(".eq-sub").textContent : "", rowArt: ri ? ri.getAttribute("src") : "", rowOk: !!(ri && ri.naturalWidth > 0),
    cardHead: card ? (card.querySelector("b") || {}).textContent : "", cardArt: ci ? ci.getAttribute("src") : "", cardOk: !!(ci && ci.naturalWidth > 0),
    cardTag: (document.querySelector("#pactIronName:not([hidden])") || {}).textContent || "",
    spells: [...document.querySelectorAll("#pactIronSpells .iron-spell")].map((b) => b.textContent.trim()),
    pactShot: (() => { const b = document.querySelector("#btnPactShot"); return b ? { shown: b.offsetParent !== null, disabled: !!b.disabled } : null; })(),
    focusPatron: !!f && /doll-focus-patron/.test(f.className),
    text: document.body.innerText
  };
};
try {
  for (const [sub, slug, nm, slot, cls] of PACTS) {
    const { pg, errs, ctx } = await sheet(sub);
    const v = await pg.evaluate(view, slot);
    const tag = "ui." + slug;
    check(tag + ".slot", v.slot === slot && v.slotOk && v.slotArt === eng(slug) && v.slotName === nm, J(v.slotArt + " " + v.slotName));
    check(tag + ".row", v.rowName === nm + " — " + cls && /^Borrowed Iron · soul-bound/.test(v.rowSub) && v.rowArt === tile(slug) && v.rowOk, J([v.rowName, v.rowSub, v.rowArt]));
    check(tag + ".card", v.cardHead === nm + " — " + cls && v.cardArt === eng(slug) && v.cardOk && v.cardTag === "· Borrowed Iron", J([v.cardHead, v.cardArt, v.cardTag]));
    check(tag + ".pactShotButton", !!v.pactShot && v.pactShot.shown && !v.pactShot.disabled, J([v.pactShot, v.spells]));
    check(tag + ".focusPatron", v.focusPatron);
    check(tag + ".noRevealWording", !/DM reveals what it really is|your DM reveals/i.test(v.text));
    check(tag + ".noPageErrors", errs.length === 0, errs.join(" | "));
    if (slug === "butter-repeater" || slug === "lightslinger") {
      await shot(pg, ".gear-col.gear-weapons", "iron-shown-weapons-" + slug + ".png");
      await shot(pg, "#dollHost .doll", "iron-shown-doll-" + slug + ".png");
    }
    await ctx.close();
  }
  /* no Pact yet: the plain Borrowed Iron */
  {
    const { pg, errs, ctx } = await sheet("");
    const v = await pg.evaluate(view, "");
    check("ui.noPact.generic", /items\/borrowed-iron\.webp$/.test(v.slotArt) && v.slotName === "Borrowed Iron" && !/borrowed-iron\//.test(v.rowArt + v.cardArt) &&
      !/Pact (revolver|rifle|shotgun)/.test(v.rowName + v.cardHead), J(v));
    check("ui.noPact.noPageErrors", errs.length === 0, errs.join(" | "));
    await shot(pg, ".gear-col.gear-weapons", "iron-shown-weapons-no-pact.png");
    await shot(pg, "#dollHost .doll", "iron-shown-doll-no-pact.png");
    await ctx.close();
  }
  /* an old DMCC still sending iron_reveal: the field changes, the sheet doesn't, no log line */
  {
    const { pg, errs, ctx } = await sheet("lass-o-lakes");
    const before = await pg.evaluate(view, "long_gun");
    const out = await pg.evaluate(() => {
      window.SSDNSApp.applyPatch((d) => { d.character.ironRevealed = false; });
      if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); window.SSDNSItems.paintSheet();
      return { field: window.SSDNSApp.doc().character.ironRevealed };
    });
    await sleep(500);
    const after = await pg.evaluate(view, "long_gun");
    check("ui.revealFalseIgnored", out.field === false && after.slotArt === before.slotArt && after.cardArt === before.cardArt && after.rowName === before.rowName && after.rowName === "Butter Repeater — Pact rifle", J([before.rowName, after.rowName]));
    check("ui.revealFalse.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* DMCC player card: the iron, its class, no Reveal toggle */
  for (const [sub, slug, nm, slot, cls] of [PACTS[2], PACTS[1]]) {
    const { pg, errs, ctx } = await page("/dm/index.html");
    await pg.setViewport({ width: 1300, height: 1100, deviceScaleFactor: 2 });
    await pg.waitForFunction(() => window.DMCC && window.SSDNSIronArt && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length, { timeout: 20000 });
    const pid = await pg.evaluate((sub) => { const id = Object.keys(window.DMCC.state.players)[1];
      Object.assign(window.DMCC.state.players[id].snapshot, { name: "Pact Seeker", calling: "pact-seeker", callingId: "pact-seeker", subclass: sub, ironRevealed: false }); return id; }, sub);
    await pg.evaluate((id) => document.querySelector('.pcard[data-pid="' + id + '"]').click(), pid);
    await sleep(1000); await waitImgs(pg);
    const v = await pg.evaluate(() => {
      const s = document.querySelector(".dm-iron");
      return { name: s ? s.querySelector("b").textContent : "", type: s && s.querySelector(".dm-iron-type") ? s.querySelector(".dm-iron-type").textContent : "",
        btn: !!document.querySelector("#btnDmIronReveal"), text: s ? s.textContent : "" };
    });
    check("dm." + slug + ".card", v.name === nm && v.type === "· " + cls && !v.btn && !/Reveal to player|Hide again|Hidden:/.test(v.text) && /player sees it/.test(v.text), J(v));
    check("dm." + slug + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await shot(pg, ".dm-iron", "iron-shown-dmcc-" + slug + ".png");
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall iron-shown checks passed");
process.exit(failures.length ? 1 : 0);

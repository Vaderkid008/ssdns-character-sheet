/**
 * UI fixes 1 (0.3.103 / DMCC 0.2.116), Jessey's UI notes of 2026-10-20 / 21:
 *   U1 wizard: the dialog no longer scrolls itself (the burnt frame stays put, no dark "bubble"); an inner .wiz-body scrolls
 *   U2 map drawers: padding and a sticky head that stays on top (CSS only, checked by source)
 *   U3 the wizard opens on Module start; Full kit is still offered
 *   U4 no Bedtime item anywhere; an old saved "Bedtime item:" line goes on load
 *   U5 the Borrowed Iron row counts under Weapons and Focus; All lists it once
 *   U6 Revenge of the Sea is a "Pact rifle"
 *   U7 HP on the paper doll: 25/37, +temp only when above 0
 *   U8 DMCC portraits use pictures   U9 DMCC turn order folds to one line per combatant
 *   U10 the sheet's turn strip is one slim row; tap a chip for its details
 *   node tools/test-ui-fixes1.mjs   (browser part needs ssdns-test-all's static server on 127.0.0.1:8765)
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
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js",
  "assets/js/spell-fx.js", "assets/js/spell-cast.js", "assets/js/pact-shot.js", "assets/js/creator.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const K = sb.SSDNSKits, D = sb.SSDNSDoll, IA = sb.SSDNSIronArt, C = sb.SSDNSCreator;
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"); /* comments may name the old wording */
const creator = code(read("assets/js/creator.js")), kits = code(read("assets/js/kits.js"));

/* U3 */
check("u3.blankDraftModule", /kitMode:\s*"module"/.test(creator));
check("u3.pickerModuleFirst", /option\("module", "Module start", draft\.kitMode !== "full"\)[\s\S]{0,80}option\("full", "Full kit", draft\.kitMode === "full"\)/.test(creator));
check("u3.buildSheetFullByDefault", C.buildSheet({ calling: "gunslinger" }).draft.kitMode === "full" && C.buildSheet({ calling: "gunslinger", kitMode: "module" }).draft.kitMode === "module");
/* U4 */
check("u4.noWizardField", !/wizBedtime|Bedtime item/.test(creator), (creator.match(/.{0,40}[Bb]edtime.{0,40}/) || [""])[0]);
check("u4.kitsNeverWrite", !/addLine\([^)]*Bedtime/.test(kits));
for (const cal of ["gunslinger", "pact-seeker", "hexslinger"]) {
  const c = K.apply(K.blankCharacter(), cal, { bedtime: "Teddy bear" });
  check("u4.noLine." + cal, !/bedtime/i.test(c.equipment || ""), c.equipment);
}
{
  const c = { equipment: "Trail pack\nBedtime item: Teddy bear\n• bedtime item: a tin star\nNote: my bedtime item story stays" };
  const n = K.stripBedtime(c);
  check("u4.stripOnLoad", n === 2 && c.equipment === "Trail pack\nNote: my bedtime item story stays", J([n, c.equipment]));
  check("u4.stripIdempotent", K.stripBedtime(c) === 0 && K.stripBedtime({}) === 0 && K.stripBedtime({ equipment: "Trail pack" }) === 0);
  const m = { equipment: "Bedtime item: X\nRope" }; K.migrateEquipment && K.migrateEquipment(m);
  check("u4.migrateStrips", !/Bedtime/.test(m.equipment || ""), m.equipment);
}
/* U6 */
const IRONS = [["the-crossroads-note", "Hell Maker", "Pact revolver"], ["the-sealed-orders", "Lightslinger", "Pact revolver"], ["lass-o-lakes", "Butter Repeater", "Pact rifle"],
  ["the-last-round", "Virgil", "Pact revolver"], ["the-sand-oath", "Sirocco Long-Rifle", "Pact rifle"], ["the-pine-box-contract", "Pallbearer", "Pact shotgun"],
  ["the-drowned-breath", "Revenge of the Sea", "Pact rifle"]];
for (const [sub, nm, cls] of IRONS) {
  const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; c.subclass = sub; D.syncIron(c, { pactChanged: true });
  check("u6.label." + sub, IA.labelFor(c) === nm + " — " + cls, IA.labelFor(c));
}
{
  const c = K.apply(K.blankCharacter(), "pact-seeker", {}); c.calling = "pact-seeker"; c.subclass = "the-drowned-breath"; D.syncIron(c, { pactChanged: true });
  check("u6.revengeLongGun", D.ironState(c).key === "long_gun", J(D.ironState(c)));
  check("u6.noHarpoonClass", !/pact-harpoon-gun|Pact harpoon gun/.test(code(read("assets/js/iron-art.js"))));
}
/* U7 */
const txt = (h) => h.replace(/<[^>]+>/g, "");
check("u7.hp", txt(D.hpInner({ hpCurrent: 25, hpMax: 37, hpTemp: 5 })) === "25/37+5", D.hpInner({ hpCurrent: 25, hpMax: 37, hpTemp: 5 }));
check("u7.noTempAtZero", txt(D.hpInner({ hpCurrent: 25, hpMax: 37, hpTemp: 0 })) === "25/37" && txt(D.hpInner({ hpCurrent: "25", hpMax: "37", hpTemp: "" })) === "25/37");
check("u7.emptyHidden", D.hpInner({}) === "");
check("u7.mirrorsCounter", D.HP_BOX[1] === D.COUNTER[1] && D.HP_BOX[3] === D.COUNTER[3] && D.HP_BOX[0] + D.HP_BOX[2] === 1080 - D.COUNTER[0], J(D.HP_BOX));
/* U2 / U8 / U9 / U10 source wiring */
const mapCss = read("map/ssdns-map.css"), dmCss = read("dm/assets/css/dmcc.css"), v2 = read("dm/assets/js/v2.js"), pt = read("assets/js/sheet-playtest.js"), sheetCss = read("assets/css/sheet.css");
check("u2.drawerCss", /\.ssm-drawer-head\s*\{[^}]*z-index/.test(mapCss) && /\.ssm-drawer-body\s*\{[^}]*padding/.test(mapCss));
check("u8.faceArt", /function faceArt\(row\)/.test(v2) && /faceHtml\(row, "portrait-face"/.test(v2) && /faceHtml\(row, "chip-face"/.test(v2) && /\.face-art/.test(dmCss));
check("u9.fold", /function foldRowHtml/.test(v2) && /\.turn-line/.test(dmCss));
check("u9.v2TailIntact", /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/.test(v2));
check("u10.strip", /function paintTurnStrip/.test(pt) && /id='btnEndTurn' hidden/.test(pt) && /#turnPanel \.turn-order-strip \{[^}]*scrollbar-width:\s*none/.test(sheetCss), "");
check("u10.noRulesTouch", !/Bedtime|harpoon/i.test(read("database.rules.json")));

/* ---------- browser part ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const DESK = { width: 1280, height: 900 }, PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function page(url, vp) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage(); const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport(vp || DESK);
  await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
  return { pg, errs, ctx };
}
async function sheet(vp) {
  const P = await page("/index.html?nowizard=1&fresh=" + Date.now(), vp);
  await P.pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDoll && window.SSDNSKits && window.SSDNSCreator && window.SSDNSPlaytest && document.querySelector("#dollHost"), { timeout: 25000 });
  await sleep(1000);
  return P;
}
const ROUND4 = { round: 4, turn: 1, started: true, order: [
  { id: "p1", name: "WIZARD", kind: "player", playerId: "zz", init: 19 },
  { id: "e1", name: "Outlaw", kind: "enemy", init: 17, status: "Down", hp: 0, maxHp: 11, conditions: ["Blinded", "Unconscious"], guns: [{ name: "Ball n Cap Revolver", chambers: [0, 0, 0, 0, 0, 0] }] },
  { id: "e2", name: "Switch Boss", kind: "enemy", init: 15, status: "Down", hp: 0, maxHp: 30, conditions: ["Unconscious"] },
  { id: "e3", name: "Cactus Witch", kind: "enemy", init: 13, status: "Blinded", conditions: ["Blinded"] },
  { id: "a1", name: "Abigail Ellen", kind: "enemy", side: "friendly", init: 12, status: "Unhurt" },
  { id: "e4", name: "Company Rider", kind: "enemy", init: 10, status: "Unhurt" },
  { id: "e5", name: "Buffalo Bull", kind: "enemy", init: 8, status: "Unhurt" }
] };
try {
  /* U1 + U3 + U4: the wizard */
  for (const [vp, sfx] of [[DESK, "desktop"], [PHONE, "phone"]]) {
    const { pg, errs, ctx } = await sheet(vp);
    const mode = await pg.evaluate(() => { window.SSDNSCreator.open(true); return window.SSDNSCreator.draft().kitMode; });
    check("ui.wizard." + sfx + ".opensOnModule", mode === "module", mode);
    const step = async (re) => { for (let i = 0; i < 14; i++) {
      const h = await pg.evaluate(() => (document.querySelector("#wizDialog .wiz-body h2") || {}).textContent || "");
      if (re.test(h)) return true;
      await pg.evaluate((cal) => { const d = window.SSDNSCreator.draft(); if (!d.name) Object.assign(d, window.SSDNSCreator.buildSheet({ calling: "pact-seeker" }).draft, { kitMode: "module", name: "Wiz" }); document.querySelector("#wizNext").click(); }); await sleep(250);
    } return false; };
    check("ui.wizard." + sfx + ".kitStep", await step(/starting kit/i));
    const kit = await pg.evaluate(() => {
      const s = document.querySelector("#wizKitMode");
      return { opts: s ? [...s.options].map((o) => o.value) : [], val: s ? s.value : "", bed: !!document.querySelector("#wizBedtime"), text: document.querySelector("#wizDialog").innerText };
    });
    check("ui.wizard." + sfx + ".picker", J(kit.opts) === J(["module", "full"]) && kit.val === "module", J(kit));
    check("ui.wizard." + sfx + ".noBedtime", !kit.bed && !/bedtime/i.test(kit.text));
    check("ui.wizard." + sfx + ".spellsStep", await step(/spell/i));
    const box = await pg.evaluate(() => {
      const d = document.querySelector("#wizDialog"), b = d.querySelector(".wiz-body"), f = d.querySelector(".dlg-foot");
      const cs = getComputedStyle(d), bs = getComputedStyle(b);
      b.scrollTop = b.scrollHeight;
      const dr = d.getBoundingClientRect(), fr = f.getBoundingClientRect();
      return { dOverflow: cs.overflowY, dScroll: d.scrollHeight - d.clientHeight, bOverflow: bs.overflowY, bScrolls: b.scrollHeight > b.clientHeight, bPad: parseFloat(bs.paddingLeft),
        footIn: fr.bottom <= dr.bottom + 1 && fr.top >= dr.top, dScrollTop: d.scrollTop };
    });
    check("ui.wizard." + sfx + ".dialogStill", box.dOverflow === "hidden" && box.dScroll <= 1 && box.dScrollTop === 0, J(box));
    check("ui.wizard." + sfx + ".bodyScrolls", box.bOverflow === "auto" && box.bScrolls && box.bPad >= 10 && box.footIn, J(box));
    check("ui.wizard." + sfx + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* U5 + U6 + U7: a Drowned Breath Pact Seeker */
  {
    const { pg, errs, ctx } = await sheet(DESK);
    await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Pact"; c.calling = "pact-seeker"; c.level = 3;
      c.abilities = Object.assign(c.abilities || {}, { CHA: 16 }); window.SSDNSKits.apply(c, "pact-seeker", {}); c.kitStamp = "pact-seeker"; c.subclass = "the-drowned-breath";
      c.hpMax = 37; c.hpCurrent = 25; c.hpTemp = 5; window.SSDNSDoll.syncIron(c, { pactChanged: true }); }));
    await sleep(500);
    await pg.evaluate(() => { if (window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet(); document.querySelector("#tab-equip").click(); window.SSDNSItems.paintSheet(); });
    await sleep(800);
    const chips = () => pg.evaluate(() => {
      const n = (f) => { const b = document.querySelector('#itemList [data-eq-filter="' + f + '"] .n'); return b ? Number(b.textContent) : -1; };
      const iron = [...document.querySelectorAll("#itemList li")].filter((li) => /Revenge of the Sea/.test(li.textContent));
      return { all: n("all"), weapons: n("weapons"), focus: n("focus"), ironRows: iron.length, ironText: iron[0] ? iron[0].querySelector(".eq-name b").textContent : "",
        rows: document.querySelectorAll("#itemList li[data-eq-key]").length };
    });
    const a = await chips();
    check("ui.u5.chips", a.weapons >= 1 && a.focus >= 1 && a.ironRows === 1, J(a));
    check("ui.u6.row", a.ironText === "Revenge of the Sea — Pact rifle", a.ironText);
    await pg.evaluate(() => document.querySelector('#itemList [data-eq-filter="focus"]').click()); await sleep(400);
    const f = await chips();
    check("ui.u5.focusFilter", f.ironRows === 1 && f.all === a.all && f.focus === a.focus, J(f));
    await pg.evaluate(() => document.querySelector('#itemList [data-eq-filter="weapons"]').click()); await sleep(400);
    const w = await chips();
    check("ui.u5.weaponsFilter", w.ironRows === 1, J(w));
    await pg.evaluate(() => document.querySelector('#itemList [data-eq-filter="all"]').click()); await sleep(400);
    const b = await chips();
    check("ui.u5.allOnce", b.ironRows === 1 && b.all === a.all, J(b));
    const card = await pg.evaluate(() => (document.querySelector("#pactFocus b") || {}).textContent || "");
    check("ui.u6.card", card === "Revenge of the Sea — Pact rifle", card);
    const slot = await pg.evaluate(() => !!document.querySelector('#dollHost [data-doll-slot="long_gun"].doll-iron, #dollHost .doll-iron[data-doll-slot="long_gun"]'));
    check("ui.u6.longGunSlot", slot);
    const hp = async () => pg.evaluate(() => { const e = document.querySelector("#dollHost [data-doll-hp]"); return e ? { t: e.textContent, hidden: e.hidden, shown: e.offsetParent !== null } : null; });
    const h1 = await hp();
    check("ui.u7.doll", h1 && h1.t === "25/37+5" && !h1.hidden && h1.shown, J(h1));
    await pg.evaluate(() => { const t = document.querySelector("#hpTemp, [name=hpTemp], [data-field=hpTemp]"); if (t) { t.value = "0"; t.dispatchEvent(new Event("input", { bubbles: true })); t.dispatchEvent(new Event("change", { bubbles: true })); } else window.SSDNSApp.applyPatch((d) => { d.character.hpTemp = 0; }); });
    await sleep(500);
    const h2 = await hp();
    check("ui.u7.tempGone", h2 && h2.t === "25/37", J(h2));
    check("ui.pact.noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* U10: the turn strip */
  for (const [vp, sfx] of [[{ width: 1024, height: 700 }, "desktop"], [PHONE, "phone"]]) {
    const { pg, errs, ctx } = await sheet(vp);
    await pg.evaluate((init) => window.SSDNSPlaytest.showTurn(init), ROUND4);
    await sleep(500);
    const s = await pg.evaluate(() => {
      const p = document.querySelector("#turnPanel"), n = document.querySelector("#turnNames");
      const chips = [...n.querySelectorAll(".turn-chip")];
      const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)));
      const cur = n.querySelector(".turn-chip.current"), prev = cur && cur.previousElementSibling;
      const nr = n.getBoundingClientRect(), pr = prev ? prev.getBoundingClientRect() : null;
      return { h: Math.round(p.getBoundingClientRect().height), chips: chips.length, rows: tops.size, bar: n.offsetHeight - n.clientHeight,
        round: (document.querySelector("#turnRound") || {}).textContent || "", curName: cur ? cur.textContent : "", icons: cur ? cur.querySelectorAll(".tc-icons > *").length : 0,
        prevVisible: !!pr && pr.right > nr.left + 8 && pr.left < nr.right, detailOpen: !!document.querySelector("#turnDetail .turn-fold") };
    });
    check("ui.u10." + sfx + ".slim", s.h <= 44 && s.rows === 1 && s.chips === 7 && s.bar === 0, J(s));
    check("ui.u10." + sfx + ".header", /4/.test(s.round) && /Outlaw/.test(s.curName) && s.icons >= 2 && !s.detailOpen, J(s));
    check("ui.u10." + sfx + ".prevChipShows", s.prevVisible, J(s));
    await pg.evaluate(() => document.querySelector("#turnNames .turn-chip.current").click()); await sleep(300);
    const o = await pg.evaluate(() => { const f = document.querySelector("#turnDetail .turn-fold"); return f ? { shown: f.offsetParent !== null, text: f.innerText } : null; });
    check("ui.u10." + sfx + ".tapOpens", o && o.shown && /Blinded/.test(o.text) && /Unconscious/.test(o.text) && /Ball n Cap Revolver/.test(o.text), J(o));
    await pg.evaluate(() => document.querySelector("#turnNames .turn-chip.current").click()); await sleep(300);
    check("ui.u10." + sfx + ".tapCloses", await pg.evaluate(() => !document.querySelector("#turnDetail .turn-fold")));
    check("ui.u10." + sfx + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
  /* U8 + U9: DMCC */
  for (const [vp, sfx] of [[{ width: 1400, height: 1000 }, "desktop"], [PHONE, "phone"]]) {
    const { pg, errs, ctx } = await page("/dm/index.html?fresh=" + Date.now(), vp);
    await pg.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
    await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
    await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length, { timeout: 20000 });
    await pg.evaluate(() => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === "Fight").click()); await sleep(400);
    await pg.evaluate(() => { const P = window.DMCC.state.players; const ids = Object.keys(P); P[ids[0]].snapshot.portrait = "../map/tokenImages/jolene.webp"; document.querySelector("#combatantMenu").open = true; });
    const players = await pg.evaluate(() => [...document.querySelectorAll("#initPlayer option")].map((o) => o.value).filter(Boolean));
    for (const v of players.slice(0, 2)) { await pg.select("#initPlayer", v); await pg.click("#btnAddPlayer"); await sleep(300); }
    for (const id of ["outlaw", "switch-boss"]) { await pg.evaluate((id) => document.querySelector('[data-add-beast="' + id + '"]').click(), id); await sleep(350); }
    const pre = await pg.evaluate(() => document.querySelectorAll("#initList details.turn-fold").length);
    check("ui.u9." + sfx + ".noFoldBeforeStart", pre === 0, String(pre));
    await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(900);
    const d = await pg.evaluate(() => {
      const folds = [...document.querySelectorAll("#initList details.turn-fold")];
      return { folds: folds.length, open: folds.filter((f) => f.open).length, lineH: folds[0] ? Math.round(folds[0].querySelector("summary").getBoundingClientRect().height) : 0,
        faces: [...document.querySelectorAll("#fightPortraits .portrait-face img.face-art")].map((i) => i.getAttribute("src")) };
    });
    check("ui.u9." + sfx + ".folded", d.folds === 3 && d.open === 0 && d.lineH > 0 && d.lineH <= 60, J(d));
    check("ui.u8." + sfx + ".pictures", d.faces.some((s) => /jolene\.webp$/.test(s)) && d.faces.filter((s) => /tokenImages|token/i.test(s)).length >= 2, J(d.faces));
    await pg.evaluate(() => document.querySelector("#initList details.turn-fold summary").click()); await sleep(400);
    const op = await pg.evaluate(() => { const f = document.querySelector("#initList details.turn-fold"); return { open: f.open, inputs: f.querySelectorAll("input,select,button").length }; });
    check("ui.u9." + sfx + ".tapOpens", op.open && op.inputs > 0, J(op));
    await pg.evaluate(() => document.querySelector("#btnNextTurn").click()); await sleep(700);
    const kept = await pg.evaluate(() => document.querySelectorAll("#initList details.turn-fold[open]").length);
    check("ui.u9." + sfx + ".openKeptOrMoved", kept <= 1, String(kept));
    check("ui.dmcc." + sfx + ".noPageErrors", errs.length === 0, errs.join(" | "));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures.length ? "\n" + failures.length + " FAILED" : "\nall ui-fixes1 checks passed");
process.exit(failures.length ? 1 : 0);

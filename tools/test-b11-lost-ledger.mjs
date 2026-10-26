/**
 * B11 / L0223: Lost Ledger. A Scholar without the Chemical Field Ledger still casts.
 *   Prepared spell attacks roll at disadvantage. Saves against those spells have advantage.
 *   Utility spells and cantrips stay normal. Prepare and copy stay gated.
 *   Other Callings are unchanged. rules.js and database.rules.json stay untouched.
 *   node tools/test-b11-lost-ledger.mjs
 *   SSDNS_SHOTS=/opt/cursor/artifacts node tools/test-b11-lost-ledger.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

const sb = { console }; sb.window = sb; sb.globalThis = sb;
sb.document = { readyState: "complete", getElementById: () => null, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(sb);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/data/item-catalog-gear.js", "assets/js/item-ui.js", "assets/js/items.js",
  "assets/js/kits.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/iron-art.js", "assets/js/paper-doll.js", "assets/js/focus-slot.js",
  "assets/js/spell-cast.js", "assets/js/conditions.js", "assets/js/signature-cards.js"]) {
  vm.runInContext(read(f), sb, { filename: f });
}
const K = sb.SSDNSKits, D = sb.SSDNSDoll, F = sb.SSDNSFocus, Cast = sb.SSDNSSpellCast, Cond = sb.SSDNSConditions, Sig = sb.SSDNSSignature;
const ARCANE = "eldorite-charm-bone-fetish-quill-case-lens-arcane-focus";

function scholar(start) {
  const c = K.apply(K.blankCharacter(), "scholar", start ? { _start: start } : {});
  c.calling = "scholar";
  c.level = 5;
  c.cantrips = ["Fire Bolt"];
  c.spells = { 1: [
    { name: "Ray of Sickness", prepared: true },
    { name: "Burning Hands", prepared: true },
    { name: "Mage Armor", prepared: true },
    { name: "Magic Missile", prepared: true },
    { name: "Charm Person", prepared: true },
    { name: "Searing Smite", prepared: true },
    { name: "Shield", prepared: true },
    { name: "Ray of Sickness (Blight Ray)", prepared: false }
  ]};
  return c;
}
function dropLedger(c) {
  c.items = (c.items || []).filter((it) => it.catalogId !== "chemical-field-ledger");
  delete c.focusItemUid;
  return c;
}
const row = (name) => Cast.lookup(name);
const flags = (c, name, slot) => F.ledgerCast(c, name, row(name), slot);
const emptyFlags = (f) => f && !f.attackDis && !f.saveAdv && !f.attackNote && !f.saveNote;

const mod = scholar("module");
check("present.module", F.ledgerEquipped(mod) && !F.ledgerMissing(mod) && F.prepBlock(mod) === "" && F.castBlock(mod) === "", J(D.focusState(mod)));
check("present.note", /spellbook/.test((D.focusState(mod) || {}).note || ""));
check("present.attack", emptyFlags(flags(mod, "Ray of Sickness", 1)));
check("present.save", emptyFlags(flags(mod, "Burning Hands", 1)));
const full = scholar("full");
check("present.full", (D.focusState(full) || {}).itemId === "chemical-field-ledger" && !F.ledgerMissing(full) && (full.items || []).some((it) => it.catalogId === ARCANE));

const gone = dropLedger(scholar("module"));
check("absent.missing", F.ledgerMissing(gone) && F.prepBlock(gone) === F.PREP_WHY && F.castBlock(gone) === "");
check("absent.attack", flags(gone, "Ray of Sickness", 1).attackDis === true && flags(gone, "Ray of Sickness", 1).saveAdv === false);
check("absent.save", flags(gone, "Burning Hands", 1).saveAdv === true && flags(gone, "Burning Hands", 1).attackDis === false);
check("absent.utility", emptyFlags(flags(gone, "Mage Armor", 1)) && emptyFlags(flags(gone, "Magic Missile", 1)) && emptyFlags(flags(gone, "Charm Person", 1)));
check("absent.cantrip", emptyFlags(flags(gone, "Fire Bolt", 0)));
check("absent.unprepared", emptyFlags(flags(gone, "Shield of Faith", 1)));
check("absent.weapon", flags(gone, "Searing Smite", 1).attackDis === true && flags(gone, "Searing Smite", 1).saveAdv === false);
const both = F.ledgerCast(gone, "Ray of Sickness", { kind: "weapon", save: "CON" }, 1);
check("absent.weaponSave", both.attackDis === true && both.saveAdv === true);
check("absent.alias", F.ledgerCast(gone, "Blight Ray", row("Ray of Sickness"), 1).attackDis === false);
gone.spells[1].push({ name: "Ray of Sickness (Blight Ray)", prepared: true });
check("absent.aliasPrepared", F.ledgerCast(gone, "Ray of Sickness", row("Ray of Sickness"), 1).attackDis === true);
check("absent.noSubstring", F.isPreparedSpell(gone, "Shield") === true && F.isPreparedSpell(gone, "Shield of Faith") === false);

const prism = scholar("full");
const prismItem = (prism.items || []).find((it) => it.catalogId === ARCANE);
prism.focusItemUid = prismItem && prismItem.uid;
check("prism.missing", !!prismItem && F.ledgerMissing(prism) && (D.focusState(prism) || {}).itemId === ARCANE && (D.focusState(prism) || {}).ledgerAway === true);
const prismHtml = D.html(prism, {});
check("prism.doll", /doll-ledger-away/.test(prismHtml) && /Lost Ledger/.test(prismHtml) && !/doll-focus-lost/.test(focusSlice(prismHtml)));
check("prism.picker", /Lost Ledger/.test(D.pickerHtml(prism, "focus_borrowed_iron")) && !/data-doll-focuslost/.test(D.pickerHtml(prism, "focus_borrowed_iron")) && !/data-doll-focusremake/.test(D.pickerHtml(prism, "focus_borrowed_iron")));

const bare = { calling: "scholar", items: [] };
check("bare.focusState", D.focusState(bare) === null);
const bareHtml = D.html(bare, {});
check("bare.doll", /doll-ledger-away/.test(bareHtml) && /Lost Ledger/.test(bareHtml));
check("bare.picker", /Recover your focus/.test(D.pickerHtml(bare, "focus_borrowed_iron")));
const bareCard = Sig.model(bare);
check("bare.card", bareCard.title === "Chemical Field Ledger" && bareCard.note === F.PREP_WHY, J(bareCard));
const keptCard = Sig.model(mod);
check("present.card", /Ledger|Chemical/.test(keptCard.title) && keptCard.note !== F.PREP_WHY, keptCard.title + " / " + keptCard.note);

let faces = [15, 4, 8, 2];
sb.SSDNSTestRoll = () => faces.shift() || 10;
const atk = Cast.rollCast({ spellName: "Ray of Sickness", slotLevel: 1, attackBonus: 5, mode: "dis", characterLevel: 5 });
check("roll.dice", atk.n1 === 15 && atk.n2 === 4 && atk.nat === 4 && String(atk.formula).indexOf("2d20") === 0 && atk.text.indexOf("/") >= 0, atk.text);
const noted = { text: atk.text, detail: atk.text };
F.applyLedgerNotes(noted, flags(gone, "Ray of Sickness", 1), "dis");
check("roll.note", /Lost Ledger: disadvantage/.test(noted.text) && noted.ledgerAttack === true && noted.ledgerSave === false, noted.text);
const cancelled = Cond.attackMode([], "adv", F.ATTACK_NOTE);
const cancelRoll = { text: "d20 «14» / 8", detail: "d20 «14» / 8" };
F.applyLedgerNotes(cancelRoll, { attackDis: true, saveAdv: true, attackNote: F.ATTACK_NOTE, saveNote: F.SAVE_NOTE }, cancelled);
check("roll.cancel", cancelled === "" && !/disadvantage/.test(cancelRoll.text) && /advantage on the save/.test(cancelRoll.text), cancelRoll.text);
const saveRoll = { text: "Burning Hands · DC 13 DEX save", detail: "Burning Hands · DC 13 DEX save" };
F.applyLedgerNotes(saveRoll, flags(gone, "Burning Hands", 1), "");
check("roll.save", /advantage on the save/.test(saveRoll.text) && !/disadvantage/.test(saveRoll.text));

const hex = K.apply(K.blankCharacter(), "hexslinger", {});
hex.calling = "hexslinger";
hex.guns = [];
check("other.hex", F.ledgerMissing(hex) === false && emptyFlags(F.ledgerCast(hex, "Fire Bolt", row("Fire Bolt"), 0)) && /Caster Gun/.test(F.castBlock(hex)));
const pact = K.apply(K.blankCharacter(), "pact-seeker", {});
pact.calling = "pact-seeker";
F.markAway(pact, { combat: true, turn: "t1" });
check("other.pact", F.ledgerMissing(pact) === false && F.castBlock(pact) === F.NO_IRON && F.prepBlock(pact) === "");
const preach = K.apply(K.blankCharacter(), "frontier-preacher", {});
preach.calling = "frontier-preacher";
check("other.preacher", F.ledgerMissing(preach) === false && F.prepBlock(preach) === "" && F.castBlock(preach) === "" && emptyFlags(F.ledgerCast(preach, "Burning Hands", row("Burning Hands"), 1)));

const sigSrc = read("assets/js/signature-cards.js");
const focusSrc = read("assets/js/focus-slot.js");
const extraSrc = read("assets/js/sheet-extras.js");
const appSrc = read("assets/js/app.js");
const rulesJs = read("assets/data/rules.js");
const rulesDb = read("database.rules.json");
const ver = JSON.parse(read("version.json"));
check("src.castPath", /ledgerCast/.test(extraSrc) && /applyLedgerNotes/.test(extraSrc) && /withLedger/.test(extraSrc));
check("src.noCastBlock", F.castBlock(gone) === "" && !/calling === "scholar"[\s\S]{0,80}PREP_WHY/.test(focusSrc.slice(focusSrc.indexOf("function castBlock"), focusSrc.indexOf("function castGunIndex"))));
check("src.prepGate", /prepBlock/.test(appSrc) && /btnAddSpell/.test(focusSrc));
check("src.noLostLedger", !/lostLedger|attackDisadv|saveAdv/.test(sigSrc) && /not in this file/.test(sigSrc));
check("src.versions", ver.sheet === "0.3.153" && ver.dmcc === "0.2.166" && ver.sheetBuild === "sheet-playtest-v03153" && ver.dmccBuild === "dmcc-playtest-v02166");
check("src.rulesUntouched", !rulesJs.includes("0.3.153") && !rulesJs.includes("ledgerMissing") && !rulesDb.includes("0.3.153") && !rulesDb.includes("0.2.166") && !rulesDb.includes("ledgerMissing"));

function focusSlice(html) {
  const m = /data-doll-slot="focus_borrowed_iron"[\s\S]{0,900}/.exec(html);
  return m ? m[0] : html;
}

if (failures.length) {
  console.error("\n" + failures.length + " failed before browser");
  process.exit(1);
}

const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
function portOpen(port, host) {
  return new Promise((res) => {
    const s = net.connect({ port, host }, () => { s.end(); res(true); });
    s.on("error", () => res(false));
  });
}
const u = new URL(ORIGIN);
let server = null;
if (!(await portOpen(Number(u.port), u.hostname))) {
  server = spawn("python3", ["-m", "http.server", String(u.port), "--bind", u.hostname], { cwd: root, stdio: "ignore" });
  for (let i = 0; i < 30 && !(await portOpen(Number(u.port), u.hostname)); i++) await sleep(150);
}
if (!(await portOpen(Number(u.port), u.hostname))) {
  console.log("Static server is not listening on " + ORIGIN);
  process.exit(1);
}

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function shot(pg, sel, file) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await pg.addStyleTag({ content: ".toast{display:none!important}" }).catch(() => {});
  await sleep(120);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
  else await pg.screenshot({ path: path.join(SHOTS, file) });
}

const BOOK = {
  cantrips: ["Fire Bolt"],
  spells: { 1: [
    { name: "Ray of Sickness", prepared: true },
    { name: "Burning Hands", prepared: true },
    { name: "Mage Armor", prepared: true },
    { name: "Shield", prepared: false }
  ]}
};

try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await pg.goto(ORIGIN + "/index.html?nowizard=1&fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSKits && window.SSDNSFocus && window.SSDNSSpellCast && window.SSDNSPlaytest, { timeout: 25000 });
  await sleep(300);

  async function loadCalling(calling, extra, drop) {
    await pg.evaluate((calling, extra, drop) => {
      window.SSDNSTestRoll = () => 12;
      window.SSDNSApp.applyPatch((d) => {
        const c = d.character;
        const fresh = window.SSDNSKits.blankCharacter();
        c.items = [];
        c.guns = fresh.guns;
        c.melee = fresh.melee;
        c.ammo = [];
        c.equipment = "";
        c.cantrips = [];
        c.spells = {};
        c.instrument = "";
        c.casterGun = "";
        c.pactFocus = "";
        delete c.focusLost;
        delete c.focusItemUid;
        delete c.borrowedIronAway;
        c.hexLead = {};
        for (var hi = 1; hi <= 9; hi++) c.hexLead[hi] = [false, false, false, false, false, false, false, false, false];
        c.name = "Ada";
        c.calling = calling;
        c.level = 5;
        delete c.kitGrants;
        delete c.kitStamp;
        c.abilities = Object.assign({ STR: 10, DEX: 14, CON: 12, INT: 16, WIS: 14, CHA: 14 }, c.abilities || {});
        window.SSDNSKits.apply(c, calling, {});
        c.calling = calling;
        c.level = 5;
        Object.assign(c, extra || {});
        if (drop) c.items = (c.items || []).filter((it) => it.catalogId !== drop);
      });
      document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (e) {} });
      if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
    }, calling, extra || {}, drop || "");
    await sleep(350);
  }

  async function cast(spec) {
    return pg.evaluate(async (spec) => {
      document.querySelectorAll("dialog[open]").forEach((d) => { try { d.close(); } catch (e) {} });
      const b = document.querySelector('#spellGrid [data-spell-cast="' + spec + '"]') || document.querySelector('[data-spell-cast="' + spec + '"]');
      const info = { found: !!b, disabled: b ? !!b.disabled : null, title: b ? b.title : "" };
      if (!b || b.disabled) return Object.assign(info, { asked: false, text: "", html: "" });
      b.click();
      await new Promise((r) => setTimeout(r, 100));
      const narrative = document.querySelector("dialog[open] #spellNarrative");
      if (narrative) narrative.click();
      await new Promise((r) => setTimeout(r, 120));
      const go = document.querySelector("[data-dis-continue]");
      const asked = !!go;
      if (go) go.click();
      await new Promise((r) => setTimeout(r, 350));
      const item = document.querySelector("#logFeed .log-item");
      return Object.assign(info, { asked, text: item ? item.innerText : "", html: item ? item.innerHTML : "" });
    }, spec);
  }

  await loadCalling("scholar", BOOK, "");
  await pg.click("#tab-hex");
  await sleep(200);
  const withLedger = await pg.evaluate(() => {
    const add = document.getElementById("btnAddSpell");
    const note = document.getElementById("gunNote");
    const ray = document.querySelector('[data-spell-cast="1:Ray of Sickness"]');
    const prep = document.getElementById("ledgerPrepNote");
    return {
      missing: window.SSDNSFocus.ledgerMissing(window.SSDNSApp.doc().character),
      addDisabled: add ? add.disabled : null,
      note: note ? note.textContent : "",
      rayDisabled: ray ? ray.disabled : null,
      prep: prep ? prep.textContent : ""
    };
  });
  check("ui.present.flags", withLedger.missing === false && withLedger.addDisabled === false && withLedger.rayDisabled === false && !/Lost Ledger/.test(withLedger.note) && !withLedger.prep, J(withLedger));
  await shot(pg, "#page-hex", "b11-scholar-ledger-desktop.png");
  const normal = await cast("1:Ray of Sickness");
  check("ui.present.cast", normal.found && normal.disabled === false && normal.asked === false && !/Lost Ledger|disadvantage/.test(normal.text) && !/die-kept|die-dropped/.test(normal.html), J(normal));

  await loadCalling("scholar", BOOK, "chemical-field-ledger");
  await pg.click("#tab-hex");
  await sleep(200);
  const lostUi = await pg.evaluate(() => {
    const add = document.getElementById("btnAddSpell");
    const note = document.getElementById("gunNote");
    const prep = document.getElementById("ledgerPrepNote");
    const boxes = Array.from(document.querySelectorAll("#spellGrid .sp-line")).map((line) => {
      const cb = line.querySelector("input[type=checkbox]");
      const name = line.querySelector(".sp-alias");
      return { name: name ? name.textContent : "", checked: cb ? cb.checked : null, disabled: cb ? cb.disabled : null, title: cb ? cb.title : "" };
    });
    const ray = document.querySelector('[data-spell-cast="1:Ray of Sickness"]');
    const save = document.querySelector('[data-spell-cast="1:Burning Hands"]');
    const util = document.querySelector('[data-spell-cast="1:Mage Armor"]');
    const bolt = document.querySelector('[data-spell-cast="0:Fire Bolt"]');
    return {
      missing: window.SSDNSFocus.ledgerMissing(window.SSDNSApp.doc().character),
      addDisabled: add ? add.disabled : null,
      addTitle: add ? add.title : "",
      note: note ? note.textContent : "",
      prep: prep ? prep.textContent : "",
      boxes,
      buttons: {
        ray: ray ? ray.disabled : null,
        save: save ? save.disabled : null,
        util: util ? util.disabled : null,
        bolt: bolt ? bolt.disabled : null
      }
    };
  });
  const spellBoxes = (lostUi.boxes || []).filter((b) => b.checked != null);
  const openBox = spellBoxes.find((b) => b.checked === false);
  const heldBox = spellBoxes.find((b) => b.checked === true);
  check("ui.absent.gate", lostUi.missing === true && lostUi.addDisabled === true && /Lost Ledger/.test(lostUi.addTitle) && /Lost Ledger/.test(lostUi.prep) && /Lost Ledger/.test(lostUi.note), J(lostUi));
  check("ui.absent.checks", !!openBox && openBox.disabled === true && /Lost Ledger/.test(openBox.title) && !!heldBox && heldBox.disabled === false, J(spellBoxes));
  check("ui.absent.buttons", lostUi.buttons.ray === false && lostUi.buttons.save === false && lostUi.buttons.util === false && lostUi.buttons.bolt === false, J(lostUi.buttons));
  await shot(pg, "#page-hex", "b11-scholar-lost-desktop.png");
  await pg.click("#tab-equip");
  await sleep(200);
  await shot(pg, "#dollHost", "b11-scholar-focus-lost.png");
  await pg.click("#tab-hex");
  await sleep(150);

  const atkUi = await cast("1:Ray of Sickness");
  check("ui.absent.attack", atkUi.disabled === false && atkUi.asked === true && /Lost Ledger: disadvantage/.test(atkUi.text) && /d20/.test(atkUi.text) && /die-kept/.test(atkUi.html) && /die-dropped/.test(atkUi.html), J(atkUi));
  const saveUi = await cast("1:Burning Hands");
  check("ui.absent.save", saveUi.asked === false && /advantage on the save/.test(saveUi.text) && !/Lost Ledger: disadvantage/.test(saveUi.text), J(saveUi));
  const utilUi = await cast("1:Mage Armor");
  check("ui.absent.utility", utilUi.asked === false && !/Lost Ledger|disadvantage|advantage on the save/.test(utilUi.text), J(utilUi));
  const boltUi = await cast("0:Fire Bolt");
  check("ui.absent.cantrip", boltUi.asked === false && !/Lost Ledger/.test(boltUi.text), J(boltUi));
  await pg.click("#tab-log");
  await sleep(150);
  await shot(pg, "#page-log", "b11-scholar-lost-log.png");

  await pg.click("#tab-hex");
  const blockedAdd = await pg.evaluate(() => {
    const btn = document.getElementById("btnAddSpell");
    if (btn) btn.click();
    const picker = document.getElementById("spellPicker");
    const toast = document.querySelector(".toast");
    return { hidden: picker ? picker.hidden : null, toast: toast ? toast.textContent : "" };
  });
  check("ui.absent.copy", blockedAdd.hidden === true && lostUi.addDisabled === true && /Lost Ledger/.test(lostUi.addTitle), J(blockedAdd));

  await loadCalling("scholar", BOOK, "");
  await pg.click("#tab-hex");
  await sleep(200);
  const back = await pg.evaluate(() => {
    const add = document.getElementById("btnAddSpell");
    const prep = document.getElementById("ledgerPrepNote");
    const boxes = Array.from(document.querySelectorAll("#spellGrid .sp-line input[type=checkbox]"));
    return { missing: window.SSDNSFocus.ledgerMissing(window.SSDNSApp.doc().character), addDisabled: add ? add.disabled : null, prepHidden: prep ? prep.hidden : true, anyDisabled: boxes.some((cb) => cb.disabled), boxes: boxes.length };
  });
  check("ui.restored", back.missing === false && back.addDisabled === false && back.prepHidden === true && back.anyDisabled === false && back.boxes > 0, J(back));

  await loadCalling("frontier-preacher", { cantrips: ["Sacred Flame"] }, "");
  await pg.click("#tab-hex");
  await sleep(200);
  const preacher = await pg.evaluate(() => {
    const add = document.getElementById("btnAddSpell");
    const note = document.getElementById("gunNote");
    const prep = document.getElementById("ledgerPrepNote");
    return {
      missing: window.SSDNSFocus.ledgerMissing(window.SSDNSApp.doc().character),
      block: window.SSDNSFocus.castBlock(window.SSDNSApp.doc().character),
      addDisabled: add ? add.disabled : null,
      note: note ? note.textContent : "",
      prep: prep && !prep.hidden ? prep.textContent : ""
    };
  });
  check("ui.preacher", preacher.missing === false && preacher.block === "" && preacher.addDisabled === false && !/Lost Ledger/.test(preacher.note + preacher.prep), J(preacher));

  await loadCalling("hexslinger", { cantrips: ["Fire Bolt"] }, "");
  await pg.evaluate(() => {
    window.SSDNSApp.applyPatch((d) => { d.character.guns = [{}, {}, {}, {}]; });
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
  });
  await sleep(250);
  const hexUi = await pg.evaluate(() => {
    const b = document.querySelector("[data-spell-cast]");
    return {
      missing: window.SSDNSFocus.ledgerMissing(window.SSDNSApp.doc().character),
      block: window.SSDNSFocus.castBlock(window.SSDNSApp.doc().character),
      disabled: b ? b.disabled : null,
      title: b ? b.title : ""
    };
  });
  check("ui.hex", hexUi.missing === false && /Caster Gun/.test(hexUi.block) && hexUi.disabled === true && /Caster Gun/.test(hexUi.title), J(hexUi));

  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true });
  await loadCalling("scholar", BOOK, "chemical-field-ledger");
  await pg.click("#tab-hex");
  await sleep(250);
  await shot(pg, "#page-hex", "b11-phone-scholar.png");
  const phone = await pg.evaluate(() => {
    const b = document.querySelector('#spellGrid [data-spell-cast="1:Mage Armor"]') || document.querySelector('[data-spell-cast="1:Mage Armor"]');
    if (b) b.scrollIntoView({ block: "center" });
    return { disabled: b ? b.disabled : null, text: b ? b.textContent : "" };
  });
  const phoneCast = await cast("1:Mage Armor");
  await pg.click("#tab-log");
  await sleep(200);
  await shot(pg, "#page-log", "b11-phone-cast.png");
  check("ui.phone", phone.disabled === false && phoneCast.disabled === false && !/Lost Ledger: disadvantage/.test(phoneCast.text) && /Mage Armor|Dust Skin/.test(phoneCast.text) && errs.length === 0, J({ phone, phoneCast, errs }));
  check("ui.noPageErrors", errs.length === 0, errs.join(" | "));
} catch (err) {
  check("ui.crash", false, String(err && err.stack || err));
} finally {
  await browser.close();
  if (server) server.kill();
}

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nb11 lost ledger ok");

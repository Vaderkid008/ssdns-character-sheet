/**
 * B10 / L0224: Calling signature cards on the Gear tab (sheet 0.3.131 / DMCC 0.2.144).
 *   Same shape as Borrowed Iron. Buttons use the sheet's cast, attack, check, and resource paths.
 *   The map drawer lists only the open Calling's signature actions (no Pact Shot on the wrong Calling).
 *   Lost Ledger attack disadvantage (L0223 / B11) is not in this change.
 *   node tools/test-b10-signature-cards.mjs
 *   Browser half needs a static server on 127.0.0.1:8765 (this file starts one if the port is free).
 *   SSDNS_SHOTS=/opt/cursor/artifacts node tools/test-b10-signature-cards.mjs
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const sigSrc = read("assets/js/signature-cards.js");
const playSrc = read("assets/js/sheet-playtest.js");
const hostSrc = read("map/ssdns-map-host.js");
const html = read("index.html");
const ver = JSON.parse(read("version.json"));
const rulesJs = read("assets/data/rules.js");
const rulesDb = read("database.rules.json");

check("src.wired", html.indexOf("assets/js/signature-cards.js?v=0.3.166-sig") >= 0 && html.indexOf("signature-cards.js") < html.indexOf("sheet-playtest.js"));
check("src.versions", ver.sheet === "0.3.166" && ver.dmcc === "0.2.179" && ver.sheetBuild === "sheet-playtest-v03166" && ver.dmccBuild === "dmcc-playtest-v02179");
check("src.banners", read("assets/js/app.js").includes('APP_VERSION = "0.3.166"') && read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.179"'));
check("src.rulesUntouched", !rulesJs.includes("0.3.166") && !rulesJs.includes("callingSig") && !rulesDb.includes("0.3.166") && !rulesDb.includes("callingSig") && !rulesDb.includes("0.2.179"));
check("src.noLostLedger", !/lostLedger|attackDisadv|saveAdv/.test(sigSrc) && /not in this file/.test(sigSrc));
check("src.noSecondRoller", !/function rollSig|SSDNSSignature\.roll/.test(sigSrc) && /data-sig-proxy/.test(sigSrc) && /data-spell-cast/.test(sigSrc) && /data-d20/.test(sigSrc) && /data-trk-res/.test(sigSrc));
check("src.meleeHook", /fistsWeapon/.test(playSrc) && /SSDNSSignature\.prepare/.test(playSrc) && /SSDNSSignature\.paint/.test(playSrc));
check("src.mapGate", /function signatureActions/.test(hostSrc) && /sig:/.test(hostSrc) && /data-sig-map/.test(hostSrc));
check("src.noItemAdd", !/SSDNSItems\.add/.test(sigSrc));

function boot() {
  const page = `<!doctype html><html><body>
    <section class="page" id="page-equip" hidden>
      <div id="pactFocus" hidden><button type="button" id="btnPactShot">Pact Shot</button></div>
      <div id="guns"></div>
      <div id="meleeBox"></div>
    </section>
    <section class="page" id="page-map"></section>
    <input id="charName" value="Tester">
  </body></html>`;
  const dom = new JSDOM(page, { url: "http://localhost/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const state = { character: blank("scholar") };
  const logs = [];
  w.SSDNSApp = {
    doc() { return state; },
    applyPatch(fn) { if (fn) fn(state); },
    compute() { return { mods: { STR: 2, DEX: 3, CON: 1, INT: 2, WIS: 2, CHA: 3 }, prof: 3, ac: 14, guns: [] }; }
  };
  w.SSDNSSheet = { addLog(row) { logs.push(row && row.text || ""); } };
  function add(rel) {
    const s = w.document.createElement("script");
    s.textContent = read(rel);
    w.document.body.appendChild(s);
  }
  add("assets/data/rules.js");
  add("assets/js/trackers.js");
  add("assets/js/weapon-art.js");
  add("assets/js/instrument-art.js");
  add("assets/js/iron-art.js");
  add("assets/js/paper-doll.js");
  add("assets/js/focus-slot.js");
  add("assets/js/pact-shot.js");
  add("assets/js/signature-cards.js");
  add("map/ssdns-map-host.js");
  return { w, state, logs };
}
function blank(calling) {
  return {
    name: "Tester", calling: calling, level: 5, subclass: "",
    abilities: { STR: 14, DEX: 16, CON: 12, INT: 14, WIS: 14, CHA: 16 },
    guns: [{ weapon: "", equipped: true }, { weapon: "", equipped: true }, { weapon: "", equipped: true }, { weapon: "", equipped: true }],
    melee: [{}, {}, {}, {}],
    items: [], cantrips: [], spells: {}, res: {}, feats: [], instrument: ""
  };
}
function idsOf(list) { return (list || []).map((a) => a.id); }
function labelsOf(view) { return (view.actions || []).map((a) => a.label); }
function attr(view, key) {
  return (view.actions || []).some((a) => a.attrs && a.attrs[key] != null && a.attrs[key] !== "");
}

const { w, state, logs } = boot();
const Sig = w.SSDNSSignature;
const H = w.SSDNSMapHost;
check("boot.modules", !!Sig && !!H && !!w.SSDNSTrackers && !!w.SSDNSDoll, "signature " + !!Sig + " map " + !!H);

const c = () => state.character;
function use(calling, extra) {
  state.character = Object.assign(blank(calling), extra || {}, { calling: calling });
  if (calling === "martial-artist") Sig.applyFists(state.character);
  Sig.paint();
  return Sig.model(state.character);
}

check("die.fists", Sig.fistsWeapon(Object.assign(blank("martial-artist"), { level: 1 })).damage === "1d4"
  && Sig.fistsWeapon(Object.assign(blank("martial-artist"), { level: 5 })).damage === "1d6"
  && Sig.fistsWeapon(Object.assign(blank("martial-artist"), { level: 11 })).damage === "1d8"
  && Sig.fistsWeapon(Object.assign(blank("martial-artist"), { level: 17 })).damage === "1d10");
check("die.otherCalling", Sig.fistsWeapon(blank("scholar")) == null);

let view = use("pact-seeker");
check("card.pactHidden", view.show === false && w.document.getElementById("callingSig").hidden === true);
w.document.getElementById("pactFocus").hidden = false;
let acts = H.sheetActions();
check("map.pactShows", acts.some((a) => a.id === "pact") && !acts.some((a) => String(a.id).indexOf("sig:") === 0), idsOf(acts).join(","));

view = use("gambler");
w.document.getElementById("pactFocus").hidden = true;
acts = H.sheetActions();
check("card.gamblerNone", view.show === false);
check("map.gamblerNoSig", !acts.some((a) => a.id === "pact" || String(a.id).indexOf("sig:") === 0), idsOf(acts).join(","));

view = use("tribal-warrior");
check("card.tribalNone", view.show === false && H.sheetActions().every((a) => a.id !== "pact" && String(a.id).indexOf("sig:") !== 0));

view = use("scholar", {
  cantrips: ["Fire Bolt"],
  spells: { 1: [{ name: "Magic Missile", prepared: true }, { name: "Shield", prepared: false }] },
  items: [{ uid: "led1", catalogId: "chemical-field-ledger", name: "Chemical Field Ledger", count: 1 }]
});
check("card.scholar", view.show && /Ledger|Chemical/.test(view.title) && /hymn-book|focus\.webp/.test(view.art), view.title + " " + view.art);
check("card.scholarSpells", attr(view, "data-spell-cast") && labelsOf(view).some((t) => /Fire Bolt|Magic Missile/.test(t)) && !labelsOf(view).some((t) => /Shield/.test(t)));
check("card.scholarNoPactNoKi", !labelsOf(view).some((t) => /Pact Shot|Flurry|Fists/.test(t)));
acts = H.sheetActions();
const card = H.ownCard();
check("map.scholar", !acts.some((a) => a.id === "pact" || a.id === "sig:flurry") && acts.some((a) => String(a.id).indexOf("sig:") === 0) && !(card.spells || []).some((s) => s.id === "pact"), idsOf(acts).join(","));
check("map.scholarSpellOnce", acts.filter((a) => a.id === "spell:0:Fire Bolt").length <= 1);

view = use("hexslinger", {
  cantrips: ["Fire Bolt"],
  guns: [{ weapon: "blacksnake", equipped: true, proficient: true }, { weapon: "", equipped: true }, {}, {}]
});
check("card.hex", view.show && /Blacksnake|Caster Gun/.test(view.title) && view.actions.some((a) => a.attrs && String(a.attrs["data-sig-proxy"] || "").indexOf("gunroll:") === 0) && attr(view, "data-spell-cast") && !labelsOf(view).some((t) => /Pact Shot|Flurry/.test(t)), view.title + " " + labelsOf(view).join("|"));
check("map.hexNoPact", !H.sheetActions().some((a) => a.id === "pact" || a.id === "sig:flurry"));

view = use("storyteller", { instrument: "banjo", cantrips: ["Vicious Mockery"] });
check("card.story", view.show && view.actions.some((a) => a.attrs && a.attrs["data-d20"] === "skill.Performance") && attr(view, "data-sig-map"), labelsOf(view).join("|"));
check("map.storyPerform", H.sheetActions().some((a) => a.id === "sig:perform") && !H.sheetActions().some((a) => a.id === "pact"));

view = use("frontier-preacher", {
  items: [{ uid: "h1", catalogId: "badge-saint-medal-carved-eldorite-hymn-book-holy-symbol", name: "Holy symbol", count: 1 }],
  cantrips: ["Sacred Flame"]
});
check("card.preacher", view.show && /Holy|symbol|hymn|amulet/i.test(view.title + view.art) && view.actions.some((a) => /Creed|Sacred/.test(a.label)), view.title + " " + labelsOf(view).join("|"));

view = use("nature-guide", {
  items: [{ uid: "s1", catalogId: "home-spring-soil-pouch", name: "Home-spring soil", count: 1 }]
});
check("card.guide", view.show && view.actions.some((a) => /Beast Mantle/.test(a.label)) && !labelsOf(view).some((t) => /Pact|Flurry/.test(t)), labelsOf(view).join("|"));

view = use("frontier-scout", {
  items: [{ uid: "k1", catalogId: "frontier-keepsake", name: "Keepsake", count: 1 }],
  cantrips: ["Guidance"]
});
check("card.scout", view.show && /Keepsake|locket|focus/i.test(view.title + view.art), view.title + " " + view.art);
state.character.focusLost = { catalogId: "frontier-keepsake" };
state.character.items = [];
view = Sig.model(state.character);
Sig.paint();
check("card.scoutLost", view.show && view.lost === true && /Lost/.test(view.note), view.note);

view = use("lawman", {
  level: 3,
  items: [{ uid: "b1", catalogId: "tin-star-badge", name: "Tin star", count: 1 }],
  cantrips: ["Light"]
});
check("card.lawman", view.show && /Tin|badge|star/i.test(view.title) && view.actions.some((a) => a.attrs && a.attrs["data-trk-arm"] === "smite") && !view.actions.some((a) => a.attrs && a.attrs["data-sig-map"] === "smite"), view.title + " " + labelsOf(view).join("|"));
check("map.lawmanSmiteOnce", H.sheetActions().filter((a) => /smite/i.test(a.label) || a.id === "trk:smite").length === 1, idsOf(H.sheetActions()).join(","));

view = use("martial-artist", { level: 5 });
check("card.ki", view.show && view.title === "Ki" && view.actions.some((a) => a.attrs && String(a.attrs["data-sig-proxy"] || "").indexOf("melee:") === 0) && ["Flurry of Blows", "Patient Defense", "Step of the Wind", "Stunning Strike"].every((n) => labelsOf(view).indexOf(n) >= 0), labelsOf(view).join("|"));
check("card.kiNoPact", !labelsOf(view).some((t) => /Pact Shot/.test(t)));
const meleeBtn = w.document.createElement("button");
meleeBtn.setAttribute("data-melee-roll", String(Sig.fistsIndex(state.character)));
let meleeClicks = 0;
meleeBtn.addEventListener("click", () => { meleeClicks += 1; });
w.document.getElementById("meleeBox").appendChild(meleeBtn);
const fistsBtn = w.document.querySelector("#callingSig [data-sig-proxy]");
fistsBtn.click();
check("click.fistsProxy", meleeClicks === 1, "clicks " + meleeClicks + " proxy " + (fistsBtn && fistsBtn.getAttribute("data-sig-proxy")));
logs.length = 0;
const flurry = w.document.querySelector('#callingSig [data-sig-map="flurry"]');
flurry.click();
check("click.kiSpend", (state.character.res && state.character.res.ki) === 1 && logs.some((t) => /Flurry of Blows/.test(t) && /Breath Coins/.test(t)), JSON.stringify(state.character.res) + " " + logs.join(" | "));
acts = H.sheetActions();
check("map.ki", acts.some((a) => a.id === "sig:flurry") && !acts.some((a) => a.id === "pact") && !acts.some((a) => a.id === "sig:perform"), idsOf(acts).join(","));
const own = H.ownCard();
check("map.fistsAttack", (own.attacks || []).some((a) => a.id.indexOf("melee:") === 0 && /Fists/.test(a.name)) && (own.attacks || []).some((a) => a.id === "sig:flurry"), (own.attacks || []).map((a) => a.id + ":" + a.name).join(","));
H.runAction("sig:patient");
check("click.mapPatient", (state.character.res && state.character.res.ki) === 2 && logs.some((t) => /Patient Defense/.test(t)), logs.join(" | "));

view = use("gunslinger", {
  level: 3,
  guns: [{ weapon: "navy-army-ball-n-cap-revolver", equipped: true, proficient: true }, {}, {}, {}]
});
check("card.grit", view.show && view.title === "Grit" && view.actions.some((a) => a.attrs && String(a.attrs["data-sig-proxy"] || "").indexOf("gunroll:") === 0) && labelsOf(view).some((t) => /Dust Breath/.test(t)) && !labelsOf(view).some((t) => /Flurry|Pact Shot|Fists/.test(t)), labelsOf(view).join("|"));
check("map.gritNoKi", !H.sheetActions().some((a) => a.id === "sig:flurry" || a.id === "pact") && H.sheetActions().some((a) => /Dust Breath/.test(a.label)), idsOf(H.sheetActions()).join(","));
logs.length = 0;
const dust = w.document.querySelector('#callingSig [data-trk-res="secondWind"]');
dust.click();
check("click.dustBreath", (state.character.res && state.character.res.secondWind) === 1 && logs.some((t) => /Dust Breath/.test(t)), logs.join(" | "));

const before = state.character.items.length;
Sig.paint();
check("items.noDuplicate", state.character.items.length === before);

/* switching off Martial Artist clears the Fists row the card added */
state.character = blank("martial-artist");
Sig.applyFists(state.character);
check("fists.added", state.character.melee.some((row) => row && row.weapon === "unarmed" && row.sigFists));
state.character.calling = "scholar";
check("fists.needClear", Sig.fistsNeed(state.character) === true);
Sig.applyFists(state.character);
check("fists.cleared", !state.character.melee.some((row) => row && (row.weapon === "unarmed" || row.sigFists)));

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
  for (let i = 0; i < 20 && !(await portOpen(Number(u.port), u.hostname)); i++) await sleep(150);
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
  await sleep(150);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
}
const CALLINGS = [
  ["pact-seeker", "Pact", { cantrips: ["Eldritch Blast (Pact Shot)"] }],
  ["hexslinger", "Hex", { cantrips: ["Fire Bolt"] }],
  ["scholar", "Ledger", { cantrips: ["Fire Bolt"], spells: { 1: [{ name: "Magic Missile", prepared: true }] } }],
  ["storyteller", "Instrument", { instrument: "banjo", cantrips: ["Vicious Mockery"] }],
  ["frontier-preacher", "Holy", { cantrips: ["Sacred Flame"] }],
  ["nature-guide", "Land", {}],
  ["frontier-scout", "Keepsake", { cantrips: ["Guidance"] }],
  ["lawman", "Badge", { cantrips: ["Light"] }],
  ["martial-artist", "Ki", {}],
  ["gunslinger", "Grit", {}]
];
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await pg.goto(ORIGIN + "/index.html?nowizard=1&fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSSignature && window.SSDNSPlaytest && window.SSDNSKits && window.SSDNSMapHost, { timeout: 25000 });
  await sleep(400);

  async function showCalling(calling, level, extra) {
    await pg.evaluate((calling, level, extra) => {
      window.SSDNSApp.applyPatch((d) => {
        const c = d.character;
        const fresh = window.SSDNSKits.blankCharacter();
        c.items = [];
        c.guns = fresh.guns;
        c.melee = fresh.melee;
        c.ammo = [];
        c.equipment = "";
        c.instrument = "";
        c.cantrips = [];
        c.spells = {};
        c.res = {};
        c.subclass = "";
        c.casterGun = "";
        c.pactFocus = "";
        delete c.focusLost;
        delete c.focusItemUid;
        c.name = calling;
        c.calling = calling;
        c.level = level;
        c.abilities = Object.assign({ STR: 14, DEX: 16, CON: 12, INT: 14, WIS: 14, CHA: 16 }, c.abilities || {});
        window.SSDNSKits.apply(c, calling, {});
        c.kitStamp = calling;
        Object.assign(c, extra || {});
        c.calling = calling;
        c.level = level;
      });
      document.querySelectorAll("dialog[open]").forEach((d) => { if (d.close) d.close(); });
      if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
      const tab = document.getElementById("tab-equip");
      if (tab) tab.click();
    }, calling, level, extra || {});
    await sleep(350);
  }

  for (const [calling, slug, extra] of CALLINGS) {
    await showCalling(calling, calling === "lawman" || calling === "gunslinger" ? 3 : 5, extra);
    const info = await pg.evaluate((calling) => {
      const pact = document.getElementById("pactFocus");
      const box = document.getElementById("callingSig");
      const art = box && box.querySelector("img");
      const title = document.getElementById("callingSigTitle");
      const buttons = box ? Array.from(box.querySelectorAll("button")).map((b) => b.textContent.trim()) : [];
      const items = (window.SSDNSApp.doc().character.items || []).map((it) => it.catalogId);
      const dup = items.filter((id, i) => id && items.indexOf(id) !== i);
      return {
        pactHidden: pact ? pact.hidden : null,
        sigHidden: box ? box.hidden : null,
        calling: box ? box.getAttribute("data-calling") : "",
        title: title ? title.textContent : "",
        buttons,
        art: art ? art.getAttribute("src") : "",
        artW: art ? art.naturalWidth : 0,
        dup: infoDup(items)
      };
      function infoDup(items) {
        const seen = {};
        const dup = [];
        items.forEach((id) => {
          if (!id) return;
          seen[id] = (seen[id] || 0) + 1;
          if (seen[id] === 2) dup.push(id);
        });
        return dup;
      }
    }, calling);
    if (calling === "pact-seeker") {
      check("ui.pact.card", info.pactHidden === false && info.sigHidden === true, JSON.stringify(info));
      await shot(pg, "#pactFocus", "b10-pact-seeker-borrowed-iron.png");
    } else {
      check("ui." + calling + ".card", info.sigHidden === false && info.calling === calling && info.pactHidden === true && info.buttons.length > 0 && info.dup.length === 0, JSON.stringify(info));
      check("ui." + calling + ".art", info.artW > 0, info.art + " w=" + info.artW);
      await shot(pg, "#callingSig", "b10-" + calling + "-" + slug.toLowerCase() + ".png");
    }
  }

  await showCalling("scholar", 5, { cantrips: ["Fire Bolt"], spells: { 1: [{ name: "Magic Missile", prepared: true }] } });
  const spell = await pg.evaluate(async () => {
    const logs = [];
    if (window.SSDNSSheet) {
      const orig = window.SSDNSSheet.addLog;
      window.SSDNSSheet.addLog = function (row) { logs.push((row && row.text) || ""); if (orig) orig(row); };
    }
    const b = document.querySelector("#callingSig [data-spell-cast]");
    const before = { label: b ? b.getAttribute("data-spell-cast") : "", disabled: b ? b.disabled : null, title: b ? b.title : "" };
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 40));
    const dlg = document.querySelector("dialog[open]");
    const narrative = dlg && dlg.querySelector("#spellNarrative");
    if (narrative) narrative.click();
    await new Promise((r) => setTimeout(r, 250));
    const toast = document.querySelector(".toast");
    return { before, opened: !!dlg, logs, toast: toast ? toast.textContent : "" };
  });
  check("ui.scholar.castPath", !!spell.before.label && spell.before.disabled === false && (spell.opened || spell.logs.length > 0 || /Fire Bolt|Magic Missile|cast|spell/i.test(spell.toast + spell.logs.join(" "))), JSON.stringify(spell));

  await showCalling("martial-artist", 5, {});
  const fists = await pg.evaluate(() => {
    const logs = [];
    if (window.SSDNSSheet) {
      const orig = window.SSDNSSheet.addLog;
      window.SSDNSSheet.addLog = function (row) { logs.push((row && row.text) || ""); if (orig) orig(row); };
    }
    const b = document.querySelector("#callingSig [data-sig-proxy]");
    if (b) b.click();
    const melee = window.SSDNSApp.doc().character.melee || [];
    return { proxy: b ? b.getAttribute("data-sig-proxy") : "", fists: melee.some((row) => row && row.weapon === "unarmed"), logs };
  });
  await sleep(400);
  check("ui.fists.path", fists.fists && /^melee:/.test(fists.proxy || "") && fists.logs.some((t) => /Fists|d20|attack/i.test(t)), JSON.stringify(fists));

  await showCalling("gunslinger", 3, {});
  const grit = await pg.evaluate(() => {
    const logs = [];
    if (window.SSDNSSheet) {
      const orig = window.SSDNSSheet.addLog;
      window.SSDNSSheet.addLog = function (row) { logs.push((row && row.text) || ""); if (orig) orig(row); };
    }
    const b = document.querySelector('#callingSig [data-trk-res="secondWind"]');
    if (b) b.click();
    const res = (window.SSDNSApp.doc().character.res || {}).secondWind;
    return { clicked: !!b, res, logs };
  });
  check("ui.grit.spend", grit.clicked && grit.res === 1 && grit.logs.some((t) => /Dust Breath/.test(t)), JSON.stringify(grit));

  await showCalling("scholar", 5, { cantrips: ["Fire Bolt"] });
  const wrong = await pg.evaluate(() => {
    const actions = window.SSDNSMapHost.sheetActions();
    const card = window.SSDNSMapHost.ownCard();
    const labels = actions.map((a) => a.label).concat((card.attacks || []).map((a) => a.name), (card.spells || []).map((s) => s.name));
    return { labels, pact: labels.some((t) => /pact shot|hellshot|flurry/i.test(t || "")) };
  });
  check("ui.map.scholarNoOther", wrong.pact === false, JSON.stringify(wrong.labels));

  await showCalling("martial-artist", 5, {});
  const mine = await pg.evaluate(() => {
    const actions = window.SSDNSMapHost.sheetActions();
    const card = window.SSDNSMapHost.ownCard();
    const labels = actions.map((a) => a.id + " " + a.label).concat((card.attacks || []).map((a) => a.id + " " + a.name));
    return {
      flurry: labels.some((t) => /sig:flurry|Flurry/.test(t)),
      pact: labels.some((t) => /pact shot|hellshot|\bpact\b/i.test(t))
    };
  });
  check("ui.map.kiOnly", mine.flurry === true && mine.pact === false, JSON.stringify(mine));

  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await showCalling("scholar", 5, { cantrips: ["Fire Bolt"] });
  const phone = await pg.evaluate(() => {
    const box = document.getElementById("callingSig");
    const btn = box && box.querySelector("button");
    const r = btn ? btn.getBoundingClientRect() : { height: 0, width: 0 };
    const boxR = box ? box.getBoundingClientRect() : { width: 0 };
    return { hidden: box ? box.hidden : true, h: r.height, w: r.width, boxW: boxR.width, overflow: box ? box.scrollWidth <= window.innerWidth + 8 : false };
  });
  check("ui.phone.card", phone.hidden === false && phone.h >= 40 && phone.w > 40 && phone.boxW > 0 && phone.boxW <= 400, JSON.stringify(phone));
  await shot(pg, "#callingSig", "b10-phone-scholar.png");
  await showCalling("martial-artist", 5, {});
  await shot(pg, "#callingSig", "b10-phone-ki.png");

  check("ui.noPageErrors", errs.length === 0, errs.join(" | "));
} finally {
  await browser.close();
  if (server) server.kill();
}

if (failures.length) {
  console.error("\n" + failures.length + " failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nall B10 signature card checks passed");

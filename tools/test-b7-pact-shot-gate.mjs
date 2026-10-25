/**
 * B7: Pact Shot on the map only for a real Pact Seeker.
 *   A Wizard's Fight card and the sheet action list must not list it.
 *   #btnPactShot is never hidden; #pactFocus is. Tab panels use hidden too,
 *   so a page ancestor must not hide the shot from a real Seeker.
 *   Iron quick-casts dedupe by data-spell-cast, and a calling switch drops them.
 *   node tools/test-b7-pact-shot-gate.mjs
 *   Browser half needs a static server on 127.0.0.1:8765.
 *   SSDNS_SHOTS=/opt/cursor/artifacts node tools/test-b7-pact-shot-gate.mjs
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
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

const hostSrc = read("map/ssdns-map-host.js");
const playSrc = read("assets/js/sheet-playtest.js");
const ver = JSON.parse(read("version.json"));
check("src.gate", /function pactShotOnMap/.test(hostSrc) && /PS\.applies\(c\)/.test(hostSrc) && /!\s*box \|\| box\.hidden/.test(hostSrc) && /classList\.contains\("page"\)/.test(hostSrc));
check("src.noBarePactHidden", !/!pact\.hidden/.test(hostSrc) && !/pact\.closest\(/.test(hostSrc));
check("src.dedupe", /seenSpell\[raw\]/.test(hostSrc) && /firstShown\(/.test(hostSrc));
check("src.repaint", /paintPact\._mapSig/.test(playSrc) && /refreshCard\(\)/.test(playSrc));
check("src.stillFires", /castNamed\("Pact Shot"\)/.test(playSrc) && /rollCone\(ch\(\)\)/.test(playSrc));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("pactShotOnMap") && !read("database.rules.json").includes("pactShotOnMap") && !read("assets/data/rules.js").includes("0.3.136") && !read("assets/data/rules.js").includes("Hellshot"));
check("src.versions", ver.sheet === "0.3.136" && ver.dmcc === "0.2.149" && ver.sheetBuild === "sheet-playtest-v03136" && ver.dmccBuild === "dmcc-playtest-v02149");

function boot() {
  const html = `<!doctype html><html><body>
    <section class="page" id="page-main" hidden>
      <div id="pactFocus" hidden>
        <button type="button" id="btnPactShot">Pact Shot</button>
        <div id="pactIronSpells" hidden>
          <button type="button" class="iron-spell" id="ironFire" data-spell-cast="0:Fire Bolt">Fire</button>
          <button type="button" class="iron-spell" id="ironChill" data-spell-cast="0:Chill Touch (Cold Hand)">Chill</button>
          <button type="button" class="iron-spell" id="ironPact" data-spell-cast="0:Eldritch Blast (Pact Shot)">EB</button>
        </div>
      </div>
      <button type="button" id="bookFire" data-spell-cast="0:Fire Bolt">Cast Fire Bolt</button>
      <button type="button" id="bookEb" data-spell-cast="0:Eldritch Blast (Pact Shot)">Cast EB</button>
      <button type="button" id="gun0" data-gunroll="0">Roll</button>
      <button type="button" data-melee-roll="0">Melee</button>
    </section>
    <section class="page" id="page-map"></section>
    <div id="secret" hidden><button type="button" id="secretGun" data-gunroll="9">Secret</button></div>
    <input id="charName" value="Wizard">
  </body></html>`;
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  const w = dom.window;
  const character = {
    name: "Wizard",
    calling: "scholar",
    cantrips: ["Fire Bolt", "Eldritch Blast (Pact Shot)"],
    spells: { 1: [{ name: "Magic Missile", prepared: true }, { name: "Shield", prepared: false }] },
    guns: [],
    melee: []
  };
  w.SSDNSApp = {
    doc() { return { character: character }; },
    compute() { return { ac: 12, guns: [] }; }
  };
  const clicks = [];
  w.document.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => clicks.push(b.id || b.textContent)));
  function add(rel) {
    const s = w.document.createElement("script");
    s.textContent = read(rel);
    w.document.body.appendChild(s);
  }
  add("assets/js/iron-art.js");
  add("assets/js/pact-shot.js");
  add("map/ssdns-map-host.js");
  return { w, character, clicks };
}

const ids = (list) => (list || []).map((x) => x.id);
const { w, character, clicks } = boot();
const H = w.SSDNSMapHost;
const pactBtn = w.document.getElementById("btnPactShot");
const box = w.document.getElementById("pactFocus");
check("hyp.btnNeverHidden", pactBtn.hidden === false && box.hidden === true, "button hidden=" + pactBtn.hidden + " card hidden=" + box.hidden);

let actions = H.sheetActions();
let card = H.ownCard();
check("wizard.noPactActions", !actions.some((a) => a.id === "pact" || /pact shot|hellshot/i.test(a.label)), JSON.stringify(actions.map((a) => a.label)));
check("wizard.noPactCard", !card.spells.some((s) => s.id === "pact" || /pact shot|hellshot|eldritch/i.test(s.name)), JSON.stringify(card.spells));
check("wizard.noIronLeak", !actions.some((a) => /Chill Touch/.test(a.label)), JSON.stringify(actions.map((a) => a.label)));
check("wizard.fireOnce", actions.filter((a) => a.id === "spell:0:Fire Bolt").length === 1, JSON.stringify(ids(actions)));
check("wizard.keepsPageButtons", actions.some((a) => a.id === "gunroll:0") && card.spells.some((s) => s.name === "Fire Bolt") && card.spells.some((s) => s.name === "Magic Missile") && !card.spells.some((s) => s.name === "Shield"));
check("wizard.hidesNonPage", !actions.some((a) => a.id === "gunroll:9"));
H.runAction("pact");
H.runAction("spell:0:Fire Bolt");
check("wizard.runSkipsPact", clicks.indexOf("btnPactShot") < 0 && clicks.indexOf("bookFire") >= 0 && clicks.indexOf("ironFire") < 0, clicks.join(","));

character.calling = "pact-seeker";
character.subclass = "the-crossroads-note";
character.name = "Pact Seeker";
w.document.getElementById("charName").value = "Pact Seeker";
box.hidden = false;
w.document.getElementById("pactIronSpells").hidden = false;
clicks.length = 0;
actions = H.sheetActions();
card = H.ownCard();
const pactAct = actions.filter((a) => a.id === "pact")[0];
const pactCard = card.spells.filter((s) => s.id === "pact")[0];
check("seeker.pageHiddenStillShows", !!pactAct && /Hellshot/.test(pactAct.label) && pactBtn.hidden === false && w.document.getElementById("page-main").hidden === true, JSON.stringify(pactAct));
check("seeker.cardVariant", !!pactCard && pactCard.name === "Hellshot" && pactCard.kind === "attack" && pactCard.enabled !== false, JSON.stringify(pactCard));
check("seeker.fireOnce", actions.filter((a) => a.id === "spell:0:Fire Bolt").length === 1 && actions.filter((a) => a.id === "spell:0:Chill Touch (Cold Hand)").length === 1, JSON.stringify(ids(actions)));
check("seeker.keepsCantrip", card.spells.some((s) => /Eldritch Blast/.test(s.name)));
H.runAction("pact");
check("seeker.runClicks", clicks.indexOf("btnPactShot") >= 0, clicks.join(","));

pactBtn.disabled = true;
actions = H.sheetActions();
card = H.ownCard();
check("seeker.disabledStillListed", actions.some((a) => a.id === "pact" && a.enabled === false) && card.spells.some((s) => s.id === "pact" && s.name === "Hellshot" && s.enabled === false));
pactBtn.disabled = false;

character.calling = "scholar";
character.subclass = "";
box.hidden = true;
w.document.getElementById("pactIronSpells").hidden = true;
clicks.length = 0;
actions = H.sheetActions();
card = H.ownCard();
check("switch.dropsPact", !actions.some((a) => a.id === "pact") && !card.spells.some((s) => s.id === "pact" || /eldritch|hellshot|pact shot/i.test(s.name)), JSON.stringify(card.spells));
check("switch.dropsIron", !actions.some((a) => /Chill Touch/.test(a.label)) && actions.filter((a) => a.id === "spell:0:Fire Bolt").length === 1, JSON.stringify(actions.map((a) => a.label)));
H.runAction("pact");
check("switch.runSkips", clicks.indexOf("btnPactShot") < 0, clicks.join(","));

/* ---------- browser: real sheet Map tab ---------- */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
function portOpen(port, host) {
  return new Promise((res) => {
    const s = net.connect({ port, host }, () => { s.end(); res(true); });
    s.on("error", () => res(false));
  });
}
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) {
  console.log("Static server is not listening on " + ORIGIN);
  process.exit(failures.length ? 1 : 1);
}
if (failures.length) {
  console.error("\n" + failures.length + " failed before browser");
  process.exit(1);
}

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function shot(pg, sel, file) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await pg.addStyleTag({ content: ".toast{display:none!important}" });
  await sleep(200);
  const el = await pg.$(sel);
  if (el) await el.screenshot({ path: path.join(SHOTS, file) });
}
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await pg.goto(ORIGIN + "/index.html?nowizard=1&fresh=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSPactShot && window.SSDNSMapHost && window.SSDNSKits, { timeout: 20000 });
  await sleep(400);
  await pg.evaluate(() => {
    window.SSDNSMapFirebase.create = function () { return window.SSDNSMapFirebase.memory({ role: "player" }); };
    window.SSDNSDmJoin.isJoined = function () { return true; };
    window.SSDNSDmJoin.live = function () {
      return {
        joined: true, roomCode: "DUST", uid: "p1", dmUid: "dm", db: { stub: 1 },
        fb: { ref: function () { return {}; }, get: function () { return Promise.resolve({ exists: function () { return false; } }); } }
      };
    };
    window.SSDNSApp.applyPatch((d) => {
      const c = d.character;
      c.name = "Wizard";
      c.calling = "scholar";
      c.subclass = "";
      c.level = 3;
      c.cantrips = ["Fire Bolt"];
      c.spells = { 1: [{ name: "Magic Missile", prepared: true }] };
      c.guns = [];
      c.melee = [];
    });
    const name = document.getElementById("charName");
    if (name) name.value = "Wizard";
    window.SSDNSMapHost.syncRoom();
  });
  await pg.waitForFunction(() => document.querySelector("#mapMount canvas"), { timeout: 20000 });
  await pg.evaluate(() => document.getElementById("tab-map").click());
  await sleep(400);
  await pg.evaluate(() => {
    const d = document.querySelector("#mapMount details.ssm-spells");
    if (d) d.open = true;
  });
  await sleep(200);
  const wizard = await pg.evaluate(() => {
    const card = window.SSDNSMapHost.ownCard();
    const actions = window.SSDNSMapHost.sheetActions();
    const text = (document.querySelector("#mapMount [data-act=actionSlot]") || {}).innerText || "";
    const btn = document.getElementById("btnPactShot");
    const box = document.getElementById("pactFocus");
    return {
      text,
      names: (card.spells || []).map((s) => s.name),
      acts: actions.filter((a) => a.id === "pact" || /pact|hellshot|chill/i.test(a.label)).map((a) => a.label),
      btnHidden: btn ? btn.hidden : null,
      boxHidden: box ? box.hidden : null,
      pageHidden: document.getElementById("page-main").hidden
    };
  });
  check("ui.wizard.noPact", !/pact shot|hellshot/i.test(wizard.text) && !wizard.names.some((n) => /pact|hellshot/i.test(n)) && wizard.acts.length === 0 && wizard.names.indexOf("Fire Bolt") >= 0, JSON.stringify(wizard));
  check("ui.wizard.hypothesis", wizard.btnHidden === false && wizard.boxHidden === true && wizard.pageHidden === true, JSON.stringify(wizard));
  await shot(pg, "#page-map", "b7-wizard-map-no-pact-shot.png");

  await pg.evaluate(() => {
    window.SSDNSApp.applyPatch((d) => {
      const c = d.character;
      c.name = "Pact Seeker";
      c.calling = "pact-seeker";
      c.level = 5;
      c.abilities = Object.assign(c.abilities || {}, { CHA: 16 });
      window.SSDNSKits.apply(c, "pact-seeker", {});
      c.kitStamp = "pact-seeker";
      c.subclass = "the-crossroads-note";
      c.cantrips = ["Eldritch Blast (Pact Shot)", "Chill Touch (Cold Hand)", "Fire Bolt"];
      window.SSDNSPactShot.ensure(c);
      if (window.SSDNSDoll && window.SSDNSDoll.syncIron) window.SSDNSDoll.syncIron(c, { pactChanged: true });
    });
    const name = document.getElementById("charName");
    if (name) name.value = "Pact Seeker";
    if (window.SSDNSPlaytest && window.SSDNSPlaytest.syncSheet) window.SSDNSPlaytest.syncSheet();
    document.getElementById("tab-map").click();
  });
  await sleep(500);
  await pg.evaluate(() => {
    const d = document.querySelector("#mapMount details.ssm-spells");
    if (d) d.open = true;
  });
  const seeker = await pg.evaluate(() => {
    const card = window.SSDNSMapHost.ownCard();
    const actions = window.SSDNSMapHost.sheetActions();
    const text = (document.querySelector("#mapMount [data-act=actionSlot]") || {}).innerText || "";
    const chill = actions.filter((a) => /Chill Touch/.test(a.label));
    const btn = document.getElementById("btnPactShot");
    return {
      text,
      pact: (card.spells || []).filter((s) => s.id === "pact")[0] || null,
      chill: chill.length,
      disabled: btn ? btn.disabled : null,
      pageHidden: document.getElementById("page-main").hidden
    };
  });
  check("ui.seeker.hellshot", seeker.pact && seeker.pact.name === "Hellshot" && /Hellshot/.test(seeker.text) && seeker.pageHidden === true, JSON.stringify(seeker));
  check("ui.seeker.noDupChill", seeker.chill === 1, JSON.stringify(seeker));
  check("ui.seeker.canFire", seeker.disabled === false, JSON.stringify(seeker));
  await shot(pg, "#page-map", "b7-pact-seeker-map-hellshot.png");

  const fired = await pg.evaluate(() => {
    const sel = document.getElementById("atkTarget");
    if (sel) {
      let opt = [...sel.options].find((o) => o.value === "narrative");
      if (!opt) { opt = document.createElement("option"); opt.value = "narrative"; opt.textContent = "No target / narrative"; sel.appendChild(opt); }
      sel.value = "narrative";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const before = window.SSDNSActionPips && window.SSDNSActionPips.state ? !!window.SSDNSActionPips.state().action : null;
    const b = document.querySelector('#mapMount [data-act="playerSpell"][data-id="pact"]');
    if (b) b.click();
    return { before, clicked: !!b, disabled: b ? b.disabled : null };
  });
  await sleep(600);
  await pg.evaluate(() => {
    const narrative = document.querySelector("#spellNarrative");
    if (narrative) narrative.click();
    const dlg = document.querySelector("dialog[open]");
    if (dlg && dlg.close && !document.querySelector("#spellNarrative")) dlg.close();
  });
  await sleep(400);
  const after = await pg.evaluate(() => {
    const log = [...document.querySelectorAll("#log .log-item, .log-item")].map((n) => n.textContent).filter((t) => /Hellshot|Pact Shot|Eldritch/i.test(t));
    const pip = window.SSDNSActionPips && window.SSDNSActionPips.state ? window.SSDNSActionPips.state() : null;
    return { log: log.slice(-3), action: pip ? pip.action : null };
  });
  check("ui.seeker.fired", fired.clicked === true && fired.disabled === false && (after.action === true || after.log.length > 0), JSON.stringify({ fired, after }));

  await pg.evaluate(() => {
    window.SSDNSApp.applyPatch((d) => {
      const c = d.character;
      c.name = "Wizard";
      c.calling = "scholar";
      c.subclass = "";
      c.cantrips = ["Fire Bolt", "Chill Touch (Cold Hand)", "Eldritch Blast (Pact Shot)"];
    });
    const name = document.getElementById("charName");
    if (name) name.value = "Wizard";
    document.getElementById("tab-map").click();
  });
  await sleep(400);
  const back = await pg.evaluate(() => {
    const card = window.SSDNSMapHost.ownCard();
    const actions = window.SSDNSMapHost.sheetActions();
    const text = (document.querySelector("#mapMount [data-act=actionSlot]") || {}).innerText || "";
    return {
      text,
      pact: (card.spells || []).some((s) => s.id === "pact" || /pact|hellshot|eldritch/i.test(s.name)),
      chillActs: actions.filter((a) => /Chill Touch/.test(a.label)).length,
      chillCard: (card.spells || []).filter((s) => /Chill Touch/.test(s.name)).length
    };
  });
  check("ui.switch.drops", back.pact === false && !/pact shot|hellshot/i.test(back.text) && back.chillActs === 1 && back.chillCard === 1, JSON.stringify(back));
  check("ui.noPageErrors", errs.length === 0, errs.join(" | "));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("\n" + failures.length + " failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nb7 pact shot gate ok");

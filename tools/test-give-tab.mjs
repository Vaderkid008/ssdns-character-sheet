/**
 * Give tab rework (sheet 0.3.108 / DMCC 0.2.121, Jessey 2026-10-22, the 13 Give fixes + a Loot placeholder).
 *   node tools/test-give-tab.mjs               (node + browser; SSDNS_ORIGIN=http://127.0.0.1:PORT for the browser part)
 *   NODE_ONLY=1 node tools/test-give-tab.mjs   (skip the browser part)
 * Node: every caliber in the catalog plans into the pool its guns read (store-stock grantPlan + the Ammo list),
 *   the catalog name fixes (Bowie, percussion caps, Big Fifty / .50-90, buckshot, .44 rimfire), the preview line
 *   with the quantity and the before and after, the button label, the Everyone confirm text.
 * Browser, DMCC demo (?demo=1, offline): no default Who, one What row, Everyone asks first (Cancel sends nothing),
 *   the Ammo list fits the picked player's guns (Show all adds the rest), recent gives + their Undo, Loot is a
 *   placeholder, Food & water only for supplies, the custom item form is behind Custom item…, the inventory panel
 *   shows the Ammo pools. Browser, sheet: each caliber lands in the right pool and the gun that takes it lists it;
 *   the ES log keeps the reason ("DM +25 ES (Bounty)"); each give's Undo takes back just that give.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 600) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node ---------- */
function nodePart() {
  const sb = { console, Math, Date, JSON, Number, String, Object, Array, RegExp, parseInt, isFinite };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(read("assets/data/rules.js"), sb, { filename: "rules.js" });
  vm.runInContext(read("assets/js/trackers.js"), sb, { filename: "trackers.js" });
  vm.runInContext(read("dm/assets/js/store-stock.js"), sb, { filename: "store-stock.js" });
  vm.runInContext(read("dm/assets/js/give-tab.js"), sb, { filename: "give-tab.js" });
  const S = sb.SSDNSStore, P = sb.SSDNSGiveTab.pure, R = sb.SSDNS_RULES;

  /* every round a gun in the catalog fires → a plan into the pool that gun's type reads */
  const want = {};
  [].concat(R.firearms, R.casterGuns).forEach((f) => Object.keys(f.rounds || {}).forEach((t) => (f.rounds[t] || []).forEach((cal) => {
    const T = t.charAt(0).toUpperCase() + t.slice(1);
    if (f.ammo === "cartridge") want[cal] = { type: "cartridge", caliber: T };
    if (f.ammo === "bigfifty" || cal === ".50-90") want[cal] = { type: "bigfifty", caliber: ".50-90" };
    if (f.ammo === "shell") want[cal] = { type: "buck", caliber: cal };
  })));
  const calibers = Object.keys(want);
  check("node.catalogCalibers", calibers.length >= 12 && [".22 LR", ".32 Long", ".32 rimfire", ".44 rimfire", ".357", ".44-40", ".45 Long", ".45-70", ".50-90", ".410", "12 ga", "10 ga"].every((c) => calibers.includes(c)), J(calibers));
  calibers.forEach((cal) => {
    const name = want[cal].type === "buck" ? cal + " shells" : cal;
    const p = S.grantPlan({ name: name });
    const type = p.kind === "cartridge" ? "cartridge" : p.type;
    check("node.caliber " + cal, type === want[cal].type && p.caliber === want[cal].caliber, J({ name, p, want: want[cal] }));
  });
  /* every Ammo option is a real pool key, and a gun of that kind lists it as fitting */
  const cat = P.ammoCatalog();
  const keys = cat.map((o) => o.key);
  ["cartridge|Light", "cartridge|Medium", "cartridge|Heavy", "bigfifty|.50-90", "buck|.410", "buck|12 ga", "buck|10 ga", "slug|.410", "slug|12 ga", "slug|10 ga", "percussion|", "arrows|", "arrows|broadhead", "arrows|blunt", "arrows|fire", "arrows|whistler", "arrows|poison", "bolts|", "stones|", "needles|"]
    .forEach((k) => check("node.ammoOption " + k, keys.includes(k), J(keys)));
  const fits = (gun, key) => P.gunKeys(gun).includes(key);
  check("node.fits.casterAll", ["cartridge|Light", "cartridge|Medium", "cartridge|Heavy", "bigfifty|.50-90"].every((k) => fits({ name: "Blacksnake", caster: true }, k)) && !fits({ name: "Blacksnake", caster: true }, "buck|12 ga"));
  check("node.fits.carbineLight", fits({ weapon: "dullards-light-carbine", name: "Dullards Light Carbine", ammo: "cartridge" }, "cartridge|Light") && !fits({ weapon: "dullards-light-carbine", ammo: "cartridge" }, "cartridge|Heavy"));
  check("node.fits.tierPicked", fits({ weapon: "henrietta-repeating-rifle", ammo: "cartridge", tier: "medium" }, "cartridge|Medium") && !fits({ weapon: "henrietta-repeating-rifle", ammo: "cartridge", tier: "medium" }, "cartridge|Light"));
  check("node.fits.bigFifty", fits({ weapon: "bison-big-fifty-buffalo-rifle", ammo: "bigfifty" }, "bigfifty|.50-90"));
  check("node.fits.coachGun", fits({ name: "Double-Barrel Coach Gun", ammo: "shell" }, "buck|12 ga") && fits({ name: "Double-Barrel Coach Gun", ammo: "shell" }, "slug|10 ga") && !fits({ name: "Double-Barrel Coach Gun", ammo: "shell" }, "buck|.410"));
  check("node.fits.ballNCap", fits({ weapon: "navy-army-ball-n-cap-revolver", ammo: "percussion" }, "percussion|"));
  check("node.fits.bow", fits({ weapon: "longbow", ammo: "arrows" }, "arrows|") && fits({ weapon: "longbow", ammo: "arrows" }, "arrows|fire"));
  check("node.fits.sling", fits({ weapon: "sling", ammo: "sling stones" }, "stones|"));

  /* fix 13: the names that turned into junk items */
  const nm = (n) => { const p = S.grantPlan({ name: n }); return (p.kind === "cartridge" ? "cartridge" : p.type || p.kind) + "|" + (p.caliber || "") + "|" + p.qty; };
  check("node.name.44rimfire", nm(".44 rimfire") === "cartridge|Light|1" && nm("20 .44 rimfire") === "cartridge|Light|20", nm(".44 rimfire"));
  check("node.name.buckshot", nm("Buckshot") === "buck|12 ga|1", nm("Buckshot"));
  check("node.name.caps", nm("Percussion caps") === "percussion||1" && nm("Ball n cap") === "percussion||1", nm("Percussion caps"));
  check("node.name.bigFifty", nm("Big Fifty") === "bigfifty|.50-90|1" && nm(".50-90") === "bigfifty|.50-90|1" && nm("Big Fifty cartridges, .50-90 (10)") === "bigfifty|.50-90|10", nm("Big Fifty"));
  check("node.name.notTheGuns", nm("Bison Big Fifty Buffalo Rifle") === "gear||1" && nm("Henrietta Repeating Rifle, Medium (.44-40)") === "gear||1" && nm("Cartridge belt") === "gear||1");
  check("node.name.leadCount", nm("20 Light cartridges") === "cartridge|Light|20" && nm("10 ga shells") === "buck|10 ga|1" && nm("Cartridges, Heavy (20)") === "cartridge|Heavy|20");
  check("node.name.storeRowsSame", nm("Arrows (20)") === "arrows||20" && nm("Shells, 12 ga (10)") === "buck|12 ga|10" && nm("Powder, ball, and caps (20 shots)") === "percussion||20");

  /* fixes 5 + 6 + 1: the preview line, the button, the Everyone confirm */
  const players = {
    p_j: { snapshot: { name: 'Jolene "Dusty" Pike', es: 3453, ammo: [{ type: "cartridge", caliber: "Light", count: 20 }], guns: [{ name: "Blacksnake", caster: true }] } },
    p_c: { snapshot: { name: 'Caleb "Iron" Marsh', es: 890, ammo: [], guns: [{ name: "Pony Arms ChaosMaker (Heavy)", ammo: "cartridge" }] } }
  };
  const d1 = P.describe({ mode: "ammo", target: "p_j", players, ammoKey: "cartridge|Light", ammoQty: 20 });
  check("node.preview.ammo", d1.line === "Jolene gets 20 Light cartridges, Light cartridges pool 20 to 40, fits Jolene's Blacksnake.", d1.line);
  check("node.button.ammo", d1.button === "Give 20 Light cartridges to Jolene", d1.button);
  const d1b = P.describe({ mode: "ammo", target: "p_c", players, ammoKey: "cartridge|Light", ammoQty: 1 });
  check("node.preview.ammoNoFit", /Caleb gets 1 Light cartridge, Light cartridges pool 0 to 1, none of Caleb's guns take it\./.test(d1b.line), d1b.line);
  const d2 = P.describe({ mode: "es", target: "p_j", players, es: 25, reason: "Bounty" });
  check("node.preview.es", d2.line === "Jolene gets 25 ES (Bounty). ES 3,453 to 3,478." && d2.button === "Give 25 ES to Jolene", J(d2));
  const d2b = P.describe({ mode: "es", target: "p_j", players, es: -50, reason: "" });
  check("node.preview.esTake", /takes 50 ES from Jolene \(DM reward\)\. ES 3,453 to 3,403\./.test(d2b.line) && d2b.button === "Take 50 ES from Jolene", J(d2b));
  const d3 = P.describe({ mode: "ammo", target: "all", players, ammoKey: "cartridge|Heavy", ammoQty: 10 });
  check("node.preview.everyone", /^Everyone gets 10 Heavy cartridges each\. Jolene 0 to 10 · Caleb 0 to 10\.$/.test(d3.line) && d3.button === "Give 10 Heavy cartridges to everyone" && /each of the 2 players/.test(d3.confirm), J(d3));
  const d4 = P.describe({ mode: "item", target: "p_j", players, text: "Gun cleaning kit", qty: 3, match: { kind: "item" } });
  check("node.preview.itemQty", d4.line === "Jolene gets 3 × Gun cleaning kit (catalog item)." && d4.button === "Give 3 × Gun cleaning kit to Jolene", J(d4));
  check("node.noDefault", P.describe({ mode: "es", target: "", players, es: 50 }).error === "Pick who gets it first");
  check("node.loot", !!P.describe({ mode: "loot", target: "p_j", players }).error);
  check("node.ackKey", P.ackKey("undo_rew.1/2") === "undo_rew_1_2");
  check("node.ackCount", J(P.ackCount({ grants: [{ pid: "p_j", gid: "g1" }, { pid: "p_c", gid: "g2" }] }, { p_j: { grantAcks: { g1: { ok: true } } }, p_c: {} })) === J({ seen: 1, of: 2 }));

  /* source: the sheet acks on the player's own node, and database.rules.json is not touched */
  const dj = read("assets/js/dm-join.js");
  check("src.sheet.ackPath", /roomPath\("players\/" \+ state\.uid \+ "\/grantAcks"\)/.test(dj));
  check("src.sheet.esReason", /" \(" \+ reason \+ "\)"/.test(dj));
  const rules = JSON.parse(read("database.rules.json"));
  check("src.rules.playerNodeWritable", /auth\.uid === \$playerId/.test(rules.rules.rooms.$roomCode.players.$playerId[".write"]));
}

/* ---------- browser ---------- */
async function browserPart() {
  let puppeteer;
  try { puppeteer = (await import("puppeteer-core")).default; }
  catch (e) { puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default; }
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  async function page(url, vw) {
    const ctx = await browser.createBrowserContext();
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport(vw || { width: 1400, height: 1000 });
    await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
    return { pg, errs, ctx };
  }
  const lastDialog = (pg) => pg.evaluate(() => { const ds = [...document.querySelectorAll("dialog[open]")]; const d = ds[ds.length - 1]; return d ? d.textContent.replace(/\s+/g, " ") : ""; });
  const answer = (pg, v) => pg.evaluate((v) => { const ds = [...document.querySelectorAll("dialog[open]")]; ds[ds.length - 1].querySelector("[value=" + v + "]").click(); }, v);
  try {
    /* ---- DMCC demo ---- */
    {
      const { pg, errs, ctx } = await page(dmccUrl("/dm/index.html?fresh=" + Date.now()));
      await dmccOffline(pg);
      await pg.waitForFunction(() => document.querySelector("#btnLoadDemo") && window.SSDNSGiveTab, { timeout: 25000 });
      await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
      await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 3, { timeout: 20000 });
      const off = await pg.evaluate(() => ({ demo: window.DMCC.state.demo, db: !!window.DMCC.state.db }));
      if (!off.demo || off.db) throw new Error("DMCC is not offline; stopping before any give");
      await pg.evaluate(() => document.querySelector("#tab-rewards").click()); await sleep(400);
      const top = await pg.evaluate(() => ({
        target: document.querySelector("#rewTarget").value, type: document.querySelector("#rewType").value,
        btn: document.querySelector("#btnPushReward").textContent, dis: document.querySelector("#btnPushReward").disabled,
        es: document.querySelector("#rewEs").value,
        cards: [...document.querySelectorAll("[data-give-who]")].map((b) => b.textContent.replace(/\s+/g, " ").trim()),
        modes: [...document.querySelectorAll("[data-give-mode]")].map((b) => b.textContent.trim()),
        oldChips: document.querySelectorAll("[data-give]:not(#panel-rewards)").length,
        typeVisible: !document.querySelector("#rewType").hidden,
        lootTab: [...document.querySelectorAll("[role=tab]")].some((t) => /loot/i.test(t.textContent)),
        formHidden: document.querySelector("#dmItemFormWrap").hidden, moreClosed: !document.querySelector("#giveMore").open
      }));
      check("dm.fix1.noDefaultTarget", top.target === "" && top.dis && /Pick who/.test(top.btn) && top.es === "", J(top));
      check("dm.fix2.whoCards", top.cards.length === 4 && /Jolene "Dusty" Pike\s*Hexslinger 3 · 3,453 ES · online/.test(top.cards[0]) && /^Everyone\s*3 players/.test(top.cards[3]), J(top.cards));
      check("dm.fix3.whatRow", J(top.modes) === J(["Money (ES)", "Ammo", "Item", "Weapon", "Starting kit", "Note", "Loot"]) && top.oldChips === 0 && !top.typeVisible, J(top));
      check("dm.loot.insideGive", !top.lootTab);
      check("dm.fix8.customFolded", top.formHidden);
      check("dm.fix12.moreFolded", top.moreClosed);

      /* fix 4: Ammo for Jolene: her guns first, Show all adds the rest */
      await pg.click('[data-give-who="p_jolene"]'); await sleep(150);
      await pg.click('[data-give-mode="ammo"]'); await sleep(150);
      const am = await pg.evaluate(() => ({ opts: [...document.querySelectorAll("#giveAmmo option")].map((o) => o.value), groups: [...document.querySelectorAll("#giveAmmo optgroup")].map((g) => g.label),
        prev: document.querySelector("#givePreview").textContent, btn: document.querySelector("#btnPushReward").textContent, qty: document.querySelector("#giveAmmoQty").value }));
      check("dm.fix4.fitsFirst", am.opts[0] === "cartridge|Light" && am.opts.includes("bigfifty|.50-90") && am.opts.includes("buck|12 ga") && !am.opts.includes("arrows|") && /^Fits Jolene/.test(am.groups[0]), J(am));
      check("dm.fix5.ammoPreview", am.prev === "Jolene gets 20 Light cartridges, Light cartridges pool 20 to 40, fits Jolene's Blacksnake.", am.prev);
      check("dm.fix6.buttonNamesIt", am.btn === "Give 20 Light cartridges to Jolene", am.btn);
      await pg.evaluate(() => { const b = document.querySelector("#giveAmmoAll"); b.checked = true; b.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(150);
      const all = await pg.evaluate(() => [...document.querySelectorAll("#giveAmmo option")].map((o) => o.value));
      check("dm.fix4.showAll", ["arrows|", "arrows|fire", "percussion|", "stones|", "needles|", "bolts|", "slug|.410"].every((k) => all.includes(k)), J(all));
      await pg.evaluate(() => { const q = document.querySelector("#giveAmmoQty"); q.value = "12"; q.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(100);
      const q12 = await pg.evaluate(() => [document.querySelector("#givePreview").textContent, document.querySelector("#btnPushReward").textContent]);
      check("dm.fix5.quantityFollows", /gets 12 Light cartridges, Light cartridges pool 20 to 32/.test(q12[0]) && q12[1] === "Give 12 Light cartridges to Jolene", J(q12));
      await pg.click("#btnPushReward"); await sleep(400);
      const sent = await pg.evaluate(() => ({ c: window.DMCC.state.commands[0], pool: window.DMCC.state.players.p_jolene.snapshot.ammo.find((a) => a.type === "cartridge" && a.caliber === "Light").count,
        recent: [...document.querySelectorAll("#giveRecent .give-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()), inv: document.querySelector("#rewInvPanel").textContent }));
      check("dm.ammo.command", sent.c.type === "reward_item" && sent.c.to === "p_jolene" && J(sent.c.payload.ammo) === J({ type: "cartridge", caliber: "Light", qty: 12 }), J(sent.c));
      check("dm.ammo.demoPool", sent.pool === 32, sent.pool);
      check("dm.fix7.recentRow", sent.recent.length === 1 && /Jolene got 12 Light cartridges \(pool 20 to 32\) · sent/.test(sent.recent[0]) && /Undo/.test(sent.recent[0]), J(sent.recent));
      check("dm.fix11.invAmmo", /Ammo pools/.test(sent.inv) && /Light cartridges/.test(sent.inv) && /32/.test(sent.inv) && /Big Fifty rounds \(\.50-90\)/.test(sent.inv), sent.inv);

      /* fix 10 (DM side) + fix 7 undo: ES with a reason, then its own Undo */
      await pg.click('[data-give-mode="es"]'); await sleep(100);
      await pg.evaluate(() => { const e = document.querySelector("#rewEs"); e.value = "25"; e.dispatchEvent(new Event("input", { bubbles: true })); const r = document.querySelector("#rewReason"); r.value = "Bounty"; r.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(100);
      const esPrev = await pg.evaluate(() => [document.querySelector("#givePreview").textContent, document.querySelector("#btnPushReward").textContent]);
      check("dm.es.preview", esPrev[0] === "Jolene gets 25 ES (Bounty). ES 3,453 to 3,478." && esPrev[1] === "Give 25 ES to Jolene", J(esPrev));
      await pg.click("#btnPushReward"); await sleep(400);
      const es1 = await pg.evaluate(() => ({ es: window.DMCC.state.players.p_jolene.snapshot.es, c: window.DMCC.state.commands[0], rows: [...document.querySelectorAll("#giveRecent .give-row")].map((r) => r.textContent.replace(/\s+/g, " ").trim()) }));
      check("dm.es.sentWithReason", es1.es === 3478 && es1.c.type === "reward_es" && es1.c.payload.reason === "Bounty" && es1.c.payload.delta === 25, J(es1.c));
      check("dm.es.recentRow", /Jolene got \+25 ES “Bounty” \(ES 3,453 to 3,478\)/.test(es1.rows[0]), J(es1.rows));
      const esId = await pg.evaluate(() => document.querySelector("#giveRecent .give-row [data-give-undo]").getAttribute("data-give-undo"));
      await pg.evaluate((id) => document.querySelector('[data-give-undo="' + id + '"]').click(), esId); await sleep(400);
      const es2 = await pg.evaluate((id) => ({ es: window.DMCC.state.players.p_jolene.snapshot.es, c: window.DMCC.state.commands[0], row: document.querySelector('[data-give-row="' + id + '"]').textContent.replace(/\s+/g, " "), btn: !!document.querySelector('[data-give-undo="' + id + '"]') }), esId);
      check("dm.undo.es", es2.es === 3453 && es2.c.type === "reward_es" && es2.c.payload.delta === -25 && es2.c.payload.grantId === "undo_" + esId && /undone/.test(es2.row) && !es2.btn, J(es2));
      /* the ammo give's own Undo */
      const amId = await pg.evaluate(() => document.querySelector("#giveRecent [data-give-undo]").getAttribute("data-give-undo"));
      await pg.evaluate((id) => document.querySelector('[data-give-undo="' + id + '"]').click(), amId); await sleep(400);
      const am2 = await pg.evaluate(() => ({ c: window.DMCC.state.commands[0], pool: window.DMCC.state.players.p_jolene.snapshot.ammo.find((a) => a.type === "cartridge" && a.caliber === "Light").count }));
      check("dm.undo.ammo", am2.c.type === "undo_item" && am2.c.payload.grantId === amId && am2.c.payload.undoId === "undo_" + amId && am2.c.payload.ammo.qty === 12 && am2.pool === 20, J(am2));

      /* fix 1: Everyone asks first; Cancel sends nothing; Confirm sends one per player */
      await pg.click('[data-give-who="all"]'); await sleep(150);
      await pg.evaluate(() => { const e = document.querySelector("#rewEs"); e.value = "10"; e.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(100);
      const n0 = await pg.evaluate(() => window.DMCC.state.commands.length);
      const allBtn = await pg.evaluate(() => document.querySelector("#btnPushReward").textContent);
      check("dm.everyone.button", allBtn === "Give 10 ES to everyone", allBtn);
      await pg.click("#btnPushReward"); await sleep(300);
      const ask = await lastDialog(pg);
      check("dm.everyone.confirm", /Give to everyone\?/.test(ask) && /each of the 3 players/.test(ask), ask);
      await answer(pg, "no"); await sleep(300);
      const n1 = await pg.evaluate(() => window.DMCC.state.commands.length);
      check("dm.everyone.cancelSendsNothing", n1 === n0, J({ n0, n1 }));
      await pg.click("#btnPushReward"); await sleep(300);
      await answer(pg, "yes"); await sleep(600);
      const n2 = await pg.evaluate(() => window.DMCC.state.commands.slice(0, 3).map((c) => c.type + ">" + c.to));
      check("dm.everyone.confirmSends", n2.length === 3 && n2.every((x) => /^reward_es>p_/.test(x)) && new Set(n2).size === 3, J(n2));

      /* Item: quantity in the preview, Food & water only for supplies, Custom item… shows the full form */
      await pg.click('[data-give-who="p_caleb"]'); await sleep(100);
      await pg.click('[data-give-mode="item"]'); await sleep(100);
      const supHidden0 = await pg.evaluate(() => document.querySelector("#rewSupplyWrap").hidden);
      await pg.evaluate(() => { const t = document.querySelector("#rewText"); t.value = "Bowie knife"; t.dispatchEvent(new Event("input", { bubbles: true })); const q = document.querySelector("#rewQty"); q.value = "2"; q.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(300);
      const it = await pg.evaluate(() => ({ match: document.querySelector("#rewMatch").textContent, prev: document.querySelector("#givePreview").textContent, sup: document.querySelector("#rewSupplyWrap").hidden }));
      check("dm.fix13.bowie", /Bowie \(shortsword\)/.test(it.match), it.match);
      check("dm.fix5.itemQty", /Caleb gets 2 × Bowie knife/.test(it.prev), it.prev);
      check("dm.fix12.supplyOnlyForSupplies", supHidden0 && it.sup);
      await pg.evaluate(() => { const b = document.querySelector("#giveSupplyOn"); b.checked = true; b.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(100);
      const supOn = await pg.evaluate(() => !document.querySelector("#rewSupplyWrap").hidden && !!document.querySelector("#rewSupplyWrap #rewWeight"));
      check("dm.fix12.supplyBox", supOn);
      await pg.evaluate(() => { const b = document.querySelector("#giveSupplyOn"); b.checked = false; b.dispatchEvent(new Event("change", { bubbles: true })); }); await sleep(100);
      await pg.click("#btnCustomItem"); await sleep(200);
      const cust = await pg.evaluate(() => { const w = document.querySelector("#dmItemFormWrap"); const f = document.querySelector("#dmItemForm"); return { shown: !w.hidden, give: /Give item/.test((f.querySelector("[data-item-add]") || {}).textContent || ""), save: !!f.querySelector("[data-item-catalog-save]"), quest: !!f.querySelector('[data-item-type] option[value="quest"]'), lock: !!document.querySelector("#btnLockInventory"), pending: !!document.querySelector("#dmPendingItems") }; });
      check("dm.fix8.customItem", cust.shown && cust.give && cust.save && cust.quest && cust.lock && cust.pending, J(cust));
      await pg.click("#btnCustomItem"); await sleep(100);

      /* Weapon stays in this flow; Starting kit asks first (#127 Grant full kit); Note; Loot is a placeholder */
      await pg.click('[data-give-mode="weapon"]'); await sleep(100);
      await pg.evaluate(() => { const t = document.querySelector("#giveWeapon"); t.value = "Bowie"; t.dispatchEvent(new Event("input", { bubbles: true })); }); await sleep(150);
      const wp = await pg.evaluate(() => [document.querySelector("#givePreview").textContent, document.querySelector("#btnPushReward").textContent, document.querySelectorAll("#giveWeaponList option").length]);
      check("dm.weapon.preview", /Caleb gets Bowie \(shortsword\) in a free melee slot/.test(wp[0]) && wp[1] === "Give Bowie (shortsword) to Caleb" && wp[2] > 20, J(wp));
      await pg.click("#btnPushReward"); await sleep(300);
      const wc = await pg.evaluate(() => window.DMCC.state.commands[0]);
      check("dm.weapon.sentById", wc.type === "reward_item" && wc.payload.id === "bowie-shortsword", J(wc));
      await pg.click('[data-give-mode="kit"]'); await sleep(100);
      const kitBtn = await pg.evaluate(() => document.querySelector("#btnPushReward").textContent);
      check("dm.fix9.kitButton", kitBtn === "Give the Full kit to Caleb", kitBtn);
      await pg.click("#btnPushReward"); await sleep(300);
      const kitAsk = await lastDialog(pg);
      check("dm.fix9.kitAsks", /Grant the Full kit to Caleb/.test(kitAsk), kitAsk);
      await answer(pg, "yes"); await sleep(400);
      const kc = await pg.evaluate(() => ({ c: window.DMCC.state.commands[0], row: document.querySelector("#giveRecent .give-row").textContent }));
      check("dm.fix9.kitSent", kc.c.type === "kit_grant" && kc.c.to === "p_caleb" && /Caleb got the Full kit/.test(kc.row) && /no undo/.test(kc.row), J(kc));
      await pg.click('[data-give-mode="loot"]'); await sleep(100);
      const loot = await pg.evaluate(() => ({ text: document.querySelector("#giveLootWrap").textContent.replace(/\s+/g, " "), shown: !document.querySelector("#giveLootWrap").hidden, dis: document.querySelector("#btnPushReward").disabled }));
      check("dm.loot.placeholder", loot.shown && loot.dis && /v1\.4/.test(loot.text) && !/DRAFT/.test(loot.text) && /Place box/.test(loot.text) && /btnLootPlace|Place box/.test(loot.text), J(loot));

      /* fix 2: handouts, packs and private messages give to the Who pick */
      const more = await pg.evaluate(() => ({ ho: document.querySelector("#hoTarget").value, msg: document.querySelector("#msgTarget").value, pack: document.querySelector("#packTarget").value, hoBtn: document.querySelector("#btnSendHandout").textContent, msgBtn: document.querySelector("#btnSendMsg").textContent, hidden: document.querySelector("#hoTarget").closest("div").hidden }));
      check("dm.fix2.sharedWho", more.ho === "p_caleb" && more.msg === "p_caleb" && more.pack === "p_caleb" && /to Caleb/.test(more.hoBtn) && /to Caleb/.test(more.msgBtn) && more.hidden, J(more));
      const still = await pg.evaluate(() => ({ demo: window.DMCC.state.demo, db: !!window.DMCC.state.db }));
      check("dm.stillOffline", still.demo === true && still.db === false, J(still));
      check("dm.noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
    /* ---- sheet ---- */
    {
      const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now(), { width: 1300, height: 1000 });
      await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSDmJoin && window.SSDNSKits && window.SSDNSStore, { timeout: 25000 });
      await sleep(900);
      await pg.evaluate(() => window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Jolene"; c.calling = "gunslinger"; window.SSDNSKits.apply(c, "gunslinger", {}); c.ammo = []; }));
      await sleep(300);
      /* every Ammo option lands in its own pool; a gun that takes it lists that pool (bows and slings draw from the quiver, checked in node above) */
      const per = await pg.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = [];
        const opts = [["cartridge", "Light", "dullards-light-carbine"], ["cartridge", "Medium", "pony-arms-chaosmaker-medium"], ["cartridge", "Heavy", "pony-arms-chaosmaker-heavy"], ["bigfifty", ".50-90", "bison-big-fifty-buffalo-rifle"],
          ["buck", ".410", ""], ["buck", "12 ga", "double-barrel-coach-gun"], ["buck", "10 ga", ""], ["slug", ".410", ""], ["slug", "12 ga", ""], ["slug", "10 ga", ""],
          ["percussion", "", "navy-army-ball-n-cap-revolver"], ["arrows", "", ""], ["arrows", "fire", ""], ["bolts", "", ""], ["stones", "", ""], ["needles", "", ""]];
        let n = 0;
        for (const [type, cal, gun] of opts) {
          n++;
          window.SSDNSApp.applyPatch((d) => { d.character.ammo = []; d.character.guns = (d.character.guns || []).map(() => ({ weapon: "", tier: "", chamber: "", loaded: 0, chambers: [] })); });
          let gi = -1;
          if (gun) { window.SSDNSApp.grantListedWeapon(gun, {}); gi = window.SSDNSApp.doc().character.guns.findIndex((g) => g && g.weapon === gun); }
          window.SSDNSDmJoin._handle({ id: "am" + n, type: "reward_item", ts: new Date().toISOString(), payload: { text: "7x " + type, grantId: "am" + n, qty: 7, ammo: { type, caliber: cal, qty: 7 } } });
          await wait(60);
          const pools = window.SSDNSApp.doc().character.ammo.filter((a) => a && Number(a.count) > 0).map((a) => a.type + "|" + a.caliber + "|" + a.count);
          const choices = gi >= 0 ? window.SSDNSApp.ammoChoices(gi).map((x) => x.type + "|" + x.caliber) : null;
          out.push({ type, cal, gun, pools, choices });
        }
        return out;
      });
      per.forEach((r) => {
        check("sheet.pool " + r.type + "|" + r.cal, r.pools.length === 1 && r.pools[0] === r.type + "|" + r.cal + "|7", J(r));
        if (r.gun) check("sheet.gunTakes " + r.type + "|" + r.cal + " (" + r.gun + ")", r.choices && r.choices.includes(r.type + "|" + r.cal), J(r));
      });
      /* ES log keeps the reason; each give's undo takes back only that give */
      const es = await pg.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const J2 = window.SSDNSDmJoin, A = window.SSDNSApp, cp = () => window.SSDNSBridge.cpValue(A.doc().shards);
        A.applyPatch((d) => { d.character.ammo = [{ type: "cartridge", caliber: "Light", count: 20 }]; });
        const es0 = cp();
        const ts = new Date().toISOString();
        J2._handle({ id: "e1", type: "reward_es", ts, payload: { delta: 25, reason: "Bounty", grantId: "e1" } }); await wait(300);
        J2._handle({ id: "e2", type: "reward_es", ts, payload: { delta: 5, reason: "DM reward", grantId: "e2" } }); await wait(300);
        J2._handle({ id: "a1", type: "reward_item", ts, payload: { text: "20x Light cartridges", grantId: "a1", qty: 20, ammo: { type: "cartridge", caliber: "Light", qty: 20 }, reason: "Found in the saddlebag" } }); await wait(200);
        J2._handle({ id: "a2", type: "reward_item", ts, payload: { text: "3x Big Fifty rounds", grantId: "a2", qty: 3, ammo: { type: "bigfifty", caliber: ".50-90", qty: 3 } } }); await wait(200);
        J2._handle({ id: "w1", type: "reward_item", ts, payload: { text: "Bowie knife", grantId: "w1", qty: 1, id: "bowie-shortsword" } }); await wait(200);
        const logs = [...document.querySelectorAll(".log-item")].map((x) => x.textContent.replace(/\s+/g, " "));
        const mid = { es: cp(), ammo: JSON.stringify(A.doc().character.ammo), melee: (A.doc().character.melee || []).map((m) => m.weapon).filter(Boolean) };
        J2._handle({ id: "u1", type: "undo_item", ts, payload: { grantId: "a1", undoId: "undo_a1", ammo: { type: "cartridge", caliber: "Light", qty: 20 } } }); await wait(200);
        J2._handle({ id: "u1b", type: "undo_item", ts, payload: { grantId: "a1", undoId: "undo_a1", ammo: { type: "cartridge", caliber: "Light", qty: 20 } } }); await wait(200);
        J2._handle({ id: "u2", type: "reward_es", ts, payload: { delta: -25, reason: "Undo: Bounty", grantId: "undo_e1" } }); await wait(300);
        J2._handle({ id: "u3", type: "undo_item", ts, payload: { grantId: "w1", undoId: "undo_w1", weaponId: "bowie-shortsword" } }); await wait(200);
        J2._handle({ id: "u4", type: "undo_item", ts, payload: { grantId: "never", undoId: "undo_never", text: "Ghost" } }); await wait(200);
        const end = { es: cp(), ammo: JSON.stringify(A.doc().character.ammo), melee: (A.doc().character.melee || []).map((m) => m.weapon).filter(Boolean) };
        return { es0, logs, mid, end };
      });
      check("sheet.fix10.esReasonLog", es.logs.some((l) => /DM \+25 ES \(Bounty\)/.test(l)) && es.logs.some((l) => /DM \+5 ES(?! \()/.test(l)), J(es.logs.slice(0, 6)));
      check("sheet.ammoReasonLog", es.logs.some((l) => /Ammo: 20 Light cartridges \(Found in the saddlebag\)/.test(l)) && es.logs.some((l) => /Ammo: 3 Big Fifty rounds \(\.50-90\)/.test(l)), J(es.logs.slice(0, 6)));
      check("sheet.gave", es.mid.es === es.es0 + 30 && /"Light","count":40/.test(es.mid.ammo) && /bigfifty/.test(es.mid.ammo) && es.mid.melee.includes("bowie-shortsword"), J(es.mid));
      check("sheet.undo.onlyThatGive", es.end.es === es.es0 + 5 && /"Light","count":20/.test(es.end.ammo) && /"bigfifty","caliber":".50-90","count":3/.test(es.end.ammo) && !es.end.melee.includes("bowie-shortsword"), J(es.end));
      check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  } finally { await browser.close(); }
}

nodePart();
if (!process.env.NODE_ONLY) await browserPart();
console.log(failures.length ? "\n" + failures.length + " FAILED:\n" + failures.join("\n") : "\nall Give tab checks passed");
process.exit(failures.length ? 1 : 0);

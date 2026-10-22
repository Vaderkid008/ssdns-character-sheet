/**
 * Mechanics PR A (Jessey 2026-10-21/22):
 *  M1  the misfire badge and the shot read the round actually chambered (Big Fifty in a Caster Gun = 1–5, 2d12)
 *  M2  DM Clean / Reopen chamber on enemy guns (DMCC enemy card + map token); enemy 3rd-misfire locks stick
 *  M4  DM Add rounds on enemy guns: silent (no chat, no log, no ledger), fills open chambers / the spare
 *  M5  DMCC "Grant full kit": confirm first; the sheet unpacks the wizard's Full kit, nothing doubles
 *  M6  Lawman picks ONE gun: Ball n Cap, Light carbine + 20 Light, or the .410
 *   node tools/test-mech-pr-a.mjs                 (node + browser; SSDNS_ORIGIN=http://127.0.0.1:PORT for the browser part)
 *   NODE_ONLY=1 node tools/test-mech-pr-a.mjs     (skip the browser part)
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 600) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- node: v2.js sandbox (same stand-in as tools/test-map-token-guns.mjs) ---------- */
function makeSandbox() {
  const ledger = [], commands = [], rolls = [], toasts = [];
  const sandbox = { console, Math, Date, JSON, parseInt, isFinite, Number, String, Object, Array, URL, encodeURIComponent, Promise, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  const stored = {};
  sandbox.localStorage = { getItem(k) { return Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : null; }, setItem(k, v) { stored[k] = String(v); } };
  sandbox.document = {
    getElementById() { return null; }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    createElement() { return { className: "", innerHTML: "", dataset: {}, addEventListener() {}, querySelector() { return { addEventListener() {} }; }, querySelectorAll() { return []; }, setAttribute() {} }; },
    body: { appendChild() {}, classList: { contains() { return false; } } }, activeElement: null
  };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let seq = 0;
  sandbox.DMCC = {
    $: () => null, $$: () => [], esc,
    state: { players: {}, ledger: [], rolls: [], demo: true, roomCode: "DUST", uid: "dm", db: null, unsubs: [] },
    toast(t) { toasts.push(String(t)); },
    uid(p) { seq += 1; return (p || "id") + seq; },
    guardFocus(fn) { if (fn) fn(); },
    parseDice() { return { total: 4, detail: "4" }; },
    pushCommand(c) { commands.push(c); return Promise.resolve(); },
    pushRoll(r) { rolls.push(r); return Promise.resolve(); },
    pushLedger(row) { ledger.push(row); return Promise.resolve(); },
    renderPlayers() {}, roomRef(p) { return { path: p }; }
  };
  vm.createContext(sandbox);
  vm.runInContext(read("assets/js/apply-guard.js"), sandbox, { filename: "apply-guard.js" });
  vm.runInContext(read("assets/js/conditions.js"), sandbox, { filename: "conditions.js" });
  vm.runInContext(read("assets/js/misfire.js"), sandbox, { filename: "misfire.js" });
  const v2 = read("dm/assets/js/v2.js").replace(
    /\nwireLookupNow\(\);\s*\nbootV2\(\);\s*$/,
    "\nglobalThis.__fight = { fight: fight, setOrder: function (rows) { fight.order = rows || []; }," +
    " keepLocks: enemyKeepLocks, openChambers: enemyOpenChambers, addRounds: enemyAddRounds, cardHtml: enemyCardHtml };\n"
  );
  if (v2.indexOf("globalThis.__fight") < 0) throw new Error("v2.js tail changed: test hook not injected");
  vm.runInContext(v2, sandbox, { filename: "v2.js" });
  return { sandbox, ledger, commands, rolls, toasts };
}
function outlaw(extra) {
  return {
    id: "en_out", name: "Outlaw", kind: "enemy", ac: 12, hp: 11, maxHp: 11, mapTokenId: "tok_out",
    card: { attacks: [
      Object.assign({ id: "bnc", name: "Ball n Cap Revolver", toHit: 3, damage: "1d8+1", capacity: 6, loaded: 6, spare: 4, misfire: 4 }, extra || {}),
      { id: "bowie", name: "Bowie", toHit: 3, damage: "1d4+1" }
    ] }
  };
}

async function nodePart() {
  /* M2: Clean (jam → unjam, dirty → dirty kit), via the map's Clean on an enemy token */
  {
    const { sandbox, ledger, commands, rolls } = makeSandbox();
    const M = sandbox.SSDNSMisfire;
    const picked = [];
    M.pickClean = async (name, opts) => { picked.push(opts.map((o) => o.id + ":" + o.label)); return opts[0]; };
    const row = outlaw({ jammed: true, misStreak: 1 });
    sandbox.__fight.setOrder([row]);
    const ok = await sandbox.SSDNSMapFight.clean({ combatantId: "en_out", weaponId: "bnc" });
    const atk = row.card.attacks[0];
    check("m2.clean.unjam", ok === true && atk.jammed === false, J({ ok, atk }));
    check("m2.clean.freeLabel", picked[0] && picked[0].some((s) => /^unjam:Unjam \(free · DM\)$/.test(s)), J(picked));
    check("m2.clean.ledger", ledger.length === 1 && ledger[0].type === "jam" && /Outlaw cleaned Ball n Cap Revolver \(jam cleared\)/.test(ledger[0].what), J(ledger));
    check("m2.clean.noPlayerTraffic", commands.length === 0 && rolls.length === 0, J({ commands, rolls }));
    atk.dirty = true; atk.misStreak = 2;
    const ok2 = await sandbox.SSDNSMapFight.clean({ combatantId: "en_out", weaponId: "bnc" });
    check("m2.clean.dirty", ok2 === true && !atk.dirty && (Number(atk.misStreak) || 0) === 0, J(atk));
    const ok3 = await sandbox.SSDNSMapFight.clean({ combatantId: "en_out", weaponId: "bnc" });
    check("m2.clean.nothingToClean", ok3 === false, J(atk));
  }
  /* M2: an enemy 3rd misfire locks a chamber; the lock sticks; reload and loaded respect it; Reopen frees it */
  {
    const { sandbox, ledger } = makeSandbox();
    const M = sandbox.SSDNSMisfire;
    const row = outlaw({ misStreak: 2, loaded: 6 });
    sandbox.__fight.setOrder([row]);
    const atk = row.card.attacks[0];
    const res = M.resolveShot(atk, { ceiling: 4, n1: 2, nat: 2, chamber: 0 });
    sandbox.__fight.keepLocks(atk, res);
    check("m2.lock.third", res.tier && Array.isArray(atk.lockedChambers) && atk.lockedChambers.length === 1, J({ tier: res.tier, locks: atk.lockedChambers }));
    check("m2.lock.openChambers", sandbox.__fight.openChambers(atk) === 5, String(sandbox.__fight.openChambers(atk)));
    sandbox.__fight.keepLocks(atk, M.resolveShot(atk, { ceiling: 4, n1: 15, nat: 15 }));
    check("m2.lock.sticks", atk.lockedChambers.length === 1, J(atk.lockedChambers));
    atk.loaded = 0; atk.spare = 10;
    await sandbox.SSDNSMapFight.reload({ combatantId: "en_out", weaponId: "bnc" });
    check("m2.lock.reloadSkipsLocked", Number(atk.loaded) === 5, J({ loaded: atk.loaded, spare: atk.spare }));
    const html = sandbox.__fight.cardHtml(row, 0);
    check("m2.card.noCleanWhenClean", !/data-enemy-gun="clean"/.test(html));
    atk.jammed = true;
    const htmlJ = sandbox.__fight.cardHtml(row, 0);
    atk.jammed = false;
    check("m2.card.buttons", /data-enemy-gun="clean"/.test(htmlJ) && /data-enemy-gun="reopen"[^>]*>Reopen chamber \(1 locked\)/.test(html) && /data-enemy-gun="addrounds"/.test(html), html.slice(0, 200));
    check("m2.card.noToolsOnMelee", (html.match(/data-enemy-gun="addrounds"/g) || []).length === 1);
    const before = ledger.length;
    const ok = await sandbox.SSDNSMapFight.reopen({ combatantId: "en_out", weaponId: "bnc" });
    check("m2.reopen", ok === true && atk.lockedChambers.length === 0 && sandbox.__fight.openChambers(atk) === 6, J(atk.lockedChambers));
    check("m2.reopen.ledger", ledger.length === before + 1 && /Outlaw reopened chamber \d on Ball n Cap Revolver/.test(ledger[ledger.length - 1].what), J(ledger.slice(-1)));
    check("m2.reopen.none", (await sandbox.SSDNSMapFight.reopen({ combatantId: "en_out", weaponId: "bnc" })) === false);
    /* players' rows are not touched by the enemy tools */
    const pc = { id: "p1", name: "Iron", kind: "player", card: { attacks: [{ id: "g", name: "Gun", capacity: 6, loaded: 0 }] } };
    sandbox.__fight.setOrder([row, pc]);
    check("m2.playerRowUntouched", (await sandbox.SSDNSMapFight.addrounds({ combatantId: "p1", weaponId: "g", rounds: 3 })) === false && pc.card.attacks[0].loaded === 0);
  }
  /* M4: Add rounds, silent */
  {
    const { sandbox, ledger, commands, rolls, toasts } = makeSandbox();
    const row = outlaw({ loaded: 2, spare: 4, lockedChambers: [5] });
    sandbox.__fight.setOrder([row]);
    const atk = row.card.attacks[0];
    let ok = await sandbox.SSDNSMapFight.addrounds({ combatantId: "en_out", weaponId: "bnc", rounds: 5, into: "gun" });
    check("m4.gun.fillsOpenThenSpare", ok === true && atk.loaded === 5 && atk.spare === 6, J({ loaded: atk.loaded, spare: atk.spare }));
    ok = await sandbox.SSDNSMapFight.addrounds({ combatantId: "en_out", weaponId: "bnc", rounds: 7, into: "spare" });
    check("m4.spare", ok === true && atk.loaded === 5 && atk.spare === 13, J({ loaded: atk.loaded, spare: atk.spare }));
    check("m4.silent", ledger.length === 0 && commands.length === 0 && rolls.length === 0, J({ ledger, commands, rolls }));
    check("m4.dmToastOnly", toasts.some((t) => /\+7 rounds/.test(t)), J(toasts));
    /* unlimited spare: "into spare" adds nothing, "into gun" still loads */
    const u = outlaw({ loaded: 1, spare: undefined });
    sandbox.__fight.setOrder([u]);
    const ua = u.card.attacks[0];
    check("m4.unlimited.spareRefused", (await sandbox.SSDNSMapFight.addrounds({ combatantId: "en_out", weaponId: "bnc", rounds: 3, into: "spare" })) === false && ua.spare === undefined);
    check("m4.unlimited.gun", (await sandbox.SSDNSMapFight.addrounds({ combatantId: "en_out", weaponId: "bnc", rounds: 9, into: "gun" })) === true && ua.loaded === 6 && ua.spare === undefined, J(ua));
    check("m4.melee.refused", (await sandbox.SSDNSMapFight.addrounds({ combatantId: "en_out", weaponId: "bowie", rounds: 3 })) === false);
  }
  /* source wiring: map buttons, host event, DMCC kit section, dm-join kit_grant, creator keeps picks */
  {
    const map = read("map/ssdns-map.js"), host = read("map/ssdns-map-host.js"), dmcc = read("dm/assets/js/dmcc.js"),
      join = read("assets/js/dm-join.js"), creator = read("assets/js/creator.js"), v2 = read("dm/assets/js/v2.js"), sx = read("assets/js/sheet-extras.js");
    check("src.map.npcButtons", /function npcReopen\(a\)/.test(map) && /data-act="rowAddRounds"/.test(map) && /npc \? npcReopen\(a\) \+ npcAddRounds\(a\)/.test(map) && /npc \? cleanControl\(a, 'rowClean'\)/.test(map));
    check("src.map.addroundsEvent", /'drawer:addrounds'/.test(map) && /"drawer:addrounds": "addrounds"/.test(host));
    check("src.v2.addroundsSilentDialog", /Only you see this\. Nothing goes to chat or the log\./.test(v2));
    check("src.dmcc.kitSection", /id="btnGrantFullKit"/.test(dmcc) && /askText\("Grant the Full kit to "/.test(dmcc) && /type: "kit_grant"/.test(dmcc));
    check("src.join.kitGrant", /case "kit_grant":/.test(join) && /claimGrant\("kit:"/.test(join) && /kitFull/.test(join));
    check("src.creator.kitPicks", /c\.kitPicks = Object\.assign\(\{\}, draft\.kit \|\| \{\}\)/.test(creator));
    check("src.shot.spentRound", (sx.match(/misfireCeiling\(spentMisfireText\(i, spent, misEl\)/g) || []).length === 2);
  }
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
    await pg.setViewport(vw || { width: 1300, height: 1000 });
    await pg.goto(ORIGIN + url, { waitUntil: "domcontentloaded" });
    return { pg, errs, ctx };
  }
  try {
    /* M1 sheet: Blacksnake with a Big Fifty chambered first, a .32 Long next */
    {
      const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now());
      await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSCasterRules && window.SSDNSGunRoll && window.SSDNSKits, { timeout: 25000 });
      await sleep(900);
      const SETUP = (chambers) => window.SSDNSApp.applyPatch((d) => {
        const c = d.character; c.name = "Dust"; c.calling = "hexslinger"; c.level = 3;
        window.SSDNSKits.apply(c, "hexslinger", {}); c.kitStamp = "hexslinger";
        c.hpMax = 24; c.hpCurrent = 24; c.hpTemp = 0;
        Object.assign(c.guns[0], { weapon: "blacksnake", equipped: true, chamber: "light|.32 Long", tier: "light", loaded: chambers.filter(Boolean).length, chambers: chambers.concat(["", "", "", ""]).slice(0, 6),
          misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, wrecked: false, lockedChambers: [] });
      });
      const BF = "k:bigfifty:.50-90:heavy", L32 = "k:cartridge:.32 Long:light";
      await pg.evaluate(SETUP, [BF, L32]); await sleep(400);
      const card = await pg.evaluate(() => ({ mis: (document.querySelector('[data-out="mis.0"]') || {}).textContent || "", dmg: (document.querySelector('[data-calc="gunDmg.0"]') || {}).value || "", next: window.SSDNSApp.nextRoundToken(0) }));
      check("m1.card.bigFifty", /1–5/.test(card.mis) && /2d12/.test(card.dmg) && /bigfifty/.test(card.next), J(card));
      const fire = () => pg.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const A = window.SSDNSApp, c = () => A.doc().character;
        const sel = document.querySelector("#atkTarget"); if (sel) { sel.value = "__free"; sel.dispatchEvent(new Event("change", { bubbles: true })); }
        const real = Math.random; Math.random = () => 0.15; /* d20 = 4 */
        window.SSDNSCasterRules.rng = () => 0.4; /* Big Fifty d6 = 3: holds */
        window.SSDNSGunRoll(0, 0); await wait(900); Math.random = real;
        const g = c().guns[0];
        return { streak: Number(g.misStreak) || 0, jammed: !!g.jammed, chambers: g.chambers.slice(), mis: (document.querySelector('[data-out="mis.0"]') || {}).textContent || "" };
      });
      const s1 = await fire();
      check("m1.shot.bigFiftyMisfiresOn4", s1.streak === 1 && s1.jammed === true, J(s1));
      /* the other way round: the .32 goes first, so a 4 is no misfire even though a Big Fifty sits behind it */
      await pg.evaluate(SETUP, [L32, BF]); await sleep(400);
      const before2 = await pg.evaluate(() => (document.querySelector('[data-out="mis.0"]') || {}).textContent || "");
      const s2 = await fire();
      check("m1.shot.lightNoMisfireOn4", s2.streak === 0 && !s2.jammed, J({ before2, s2 }));
      check("m1.card.followsNextRound", /1–5/.test(s2.mis), J(s2));
      /* DMCC snapshot (map drawer on the DM side) reads the same computed misfire */
      const snap = await pg.evaluate(() => { const J2 = window.SSDNSDmJoin; const s = J2 && J2.buildSnapshot ? J2.buildSnapshot() : null; const g = s && (s.guns || s.weapons || []).find((x) => x && /blacksnake|Blacksnake/.test(String(x.weapon || x.id || x.name))); return g ? { misfire: g.misfire } : { keys: s ? Object.keys(s).slice(0, 40) : null }; });
      check("m1.dmSnapshot", /1–5|^5$/.test(String(snap.misfire || "")), J(snap));
      /* M5 / M6 on the sheet's kits */
      const k = await pg.evaluate(() => {
        const K = window.SSDNSKits, out = {};
        const fresh = () => { const c = JSON.parse(JSON.stringify(window.SSDNSApp.doc().character)); delete c.kitGrants; delete c.kitStamp; delete c.kitMode; delete c.kitPicks; c.casterGun = ""; c.equipment = ""; return c; };
        const callings = ["storyteller", "frontier-preacher", "nature-guide", "martial-artist", "lawman", "frontier-scout", "gambler", "hexslinger", "pact-seeker", "scholar"];
        out.calls = callings.map((id) => {
          const c = fresh(); c.calling = id; c.guns = c.guns.map((g) => Object.assign({}, g, { weapon: "", loaded: 0, chambers: [] })); c.items = []; c.ammo = []; c.armor = "";
          K.apply(c, id, { _start: "module" });
          const items0 = c.items.length;
          const r1 = K.grantFull(c);
          const snap1 = JSON.stringify({ items: c.items, ammo: c.ammo, guns: c.guns, melee: c.melee });
          const r2 = K.grantFull(c);
          const snap2 = JSON.stringify({ items: c.items, ammo: c.ammo, guns: c.guns, melee: c.melee });
          return { id, ok: r1 && r1.ok, added: r1 && r1.added && r1.added.length, grew: c.items.length >= items0, es1: r1 && r1.es, again: r2 && r2.already, es2: r2 && r2.es, same: snap1 === snap2, mode: c.kitMode };
        });
        const law = (pick) => { const c = fresh(); c.calling = "lawman"; c.guns = c.guns.map((g) => Object.assign({}, g, { weapon: "", loaded: 0, chambers: [] })); c.items = []; c.ammo = []; K.apply(c, "lawman", { weapon: pick }); return { guns: c.guns.filter((g) => g.weapon).map((g) => g.weapon + "|" + (g.chamber || "")), ammo: (c.ammo || []).map((a) => a.type + ":" + a.caliber + ":" + a.count) }; };
        out.law = { revolver: law("revolver"), carbine: law("carbine"), shotgun: law("shotgun"), def: law(undefined) };
        const ch = (K.choices.lawman || []).find((x) => x.id === "weapon");
        out.lawOpts = ch ? ch.options.map((o) => o.id) : [];
        out.lawPrompt = ch ? ch.prompt : "";
        return out;
      });
      for (const r of k.calls) check("m5.grantFull." + r.id, r.ok && r.added > 0 && r.grew && r.again && !r.es2 && r.same && r.mode === "full", J(r));
      check("m6.options", k.lawOpts[0] === "revolver" && k.lawOpts.indexOf("carbine") > 0 && k.lawOpts.indexOf("shotgun") > 0 && /carbine/.test(k.lawPrompt), J(k.lawOpts));
      check("m6.oneGun", ["revolver", "carbine", "shotgun"].every((p) => k.law[p].guns.length === 1), J(k.law));
      check("m6.carbine", /^dullards-light-carbine\|light/.test(k.law.carbine.guns[0] || "") && k.law.carbine.ammo.some((a) => /:20$/.test(a) && /cartridge/.test(a)), J(k.law.carbine));
      check("m6.defaultIsBallnCap", k.law.def.guns.length === 1 && k.law.def.guns[0] === k.law.revolver.guns[0], J(k.law));
      /* dm-join kit_grant: once per grant id */
      const g = await pg.evaluate(async () => {
        const A = window.SSDNSApp, J2 = window.SSDNSDmJoin;
        A.applyPatch((d) => { const c = d.character; delete c.kitGrants; delete c.kitStamp; c.equipment = ""; c.calling = "lawman"; c.items = []; c.ammo = []; c.guns = c.guns.map((x) => Object.assign({}, x, { weapon: "", loaded: 0, chambers: [] })); window.SSDNSKits.apply(c, "lawman", { _start: "module", weapon: "carbine" }); c.kitPicks = { weapon: "carbine" }; });
        const es0 = window.SSDNSBridge.cpValue(A.doc().shards);
        const n0 = A.doc().character.items.length;
        J2._handle({ id: "c1", type: "kit_grant", ts: new Date().toISOString(), payload: { mode: "full", grantId: "kit-t1" } });
        await new Promise((r) => setTimeout(r, 300));
        const n1 = A.doc().character.items.length, es1 = window.SSDNSBridge.cpValue(A.doc().shards);
        J2._handle({ id: "c1", type: "kit_grant", ts: new Date().toISOString(), payload: { mode: "full", grantId: "kit-t1" } });
        await new Promise((r) => setTimeout(r, 300));
        const c = A.doc().character;
        return { n0, n1, n2: c.items.length, es0, es1, es2: window.SSDNSBridge.cpValue(A.doc().shards), mode: c.kitMode, guns: c.guns.filter((x) => x.weapon).map((x) => x.weapon),
          log: Array.from(document.querySelectorAll(".log-item")).map((x) => x.textContent).find((t) => /granted your Full kit/.test(t)) || "",
          snap: J2.buildSnapshot ? { kitMode: J2.buildSnapshot().kitMode, kitFull: J2.buildSnapshot().kitFull } : null };
      });
      check("m5.join.grants", g.n1 > g.n0 && g.mode === "full" && /granted your Full kit/.test(g.log), J(g));
      check("m5.join.oncePerId", g.n2 === g.n1 && g.es2 === g.es1, J(g));
      check("m5.join.keepsPickedGun", g.guns.length === 1 && g.guns[0] === "dullards-light-carbine", J(g.guns));
      check("m5.join.snapshot", g.snap && g.snap.kitMode === "full" && g.snap.kitFull === true, J(g.snap));
      check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
    /* M6 wizard: the Lawman's kit step offers the three guns */
    {
      const { pg, errs, ctx } = await page("/index.html?nowizard=1&fresh=" + Date.now());
      await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSCreator && window.SSDNSKits, { timeout: 25000 });
      await sleep(800);
      const w = await pg.evaluate(async () => {
        const W = window.SSDNSCreator; W.open(true);
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const dr = W.draft(); dr.name = "Wade";
        for (const l of window.SSDNS_RULES.lineages || []) { dr.lineage = l.id; dr.sublineage = ((l.sublineages || [])[0] || {}).id || ""; if (!W.errorsFor(dr, "lineage").length) break; }
        dr.settlerLanguage = dr.settlerLanguage || "English"; dr.extraLanguage = dr.extraLanguage || "German";
        for (let i = 0; i < 6 && !document.querySelector("#wizCalling"); i++) { document.querySelector("#wizNext").click(); await wait(60); }
        const cs = document.querySelector("#wizCalling"); if (!cs) return { err: "no calling" };
        cs.value = "lawman"; cs.dispatchEvent(new Event("change", { bubbles: true })); await wait(80);
        for (const bg of window.SSDNS_RULES.backgrounds || []) { dr.background = bg.id; if (!W.errorsFor(dr, "background").length) break; }
        for (let i = 0; i < 10 && !document.querySelector("#wizKitMode"); i++) { document.querySelector("#wizNext").click(); await wait(90); }
        const sel = document.querySelector('#wizDialog select[data-kit="weapon"]');
        if (!sel) return { err: "no kit weapon select", h2: (document.querySelector("#wizDialog .wiz-body h2") || {}).textContent };
        const opts = Array.from(sel.options).map((o) => o.value + "=" + o.textContent);
        sel.value = "carbine"; sel.dispatchEvent(new Event("change", { bubbles: true })); await wait(120);
        const lines = Array.from(document.querySelectorAll("#wizDialog .wiz-kit li")).map((x) => x.textContent);
        return { opts, label: sel.getAttribute("aria-label"), draftPick: dr.kit && dr.kit.weapon, lines };
      });
      check("m6.wizard.options", !w.err && w.opts.some((o) => /^revolver=/.test(o)) && w.opts.some((o) => /^carbine=Dullards Light Carbine \+ 20 Light cartridges$/.test(o)) && w.opts.some((o) => /^shotgun=/.test(o)), J(w));
      check("m6.wizard.pick", w.draftPick === "carbine" && w.lines.some((l) => /Light Carbine/i.test(l)) && !w.lines.some((l) => /Ball n Cap/i.test(l)), J(w));
      check("m6.wizard.plainWords", !w.opts.some((o) => /LeMat/.test(o)), J(w.opts));
      check("wizard.noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
    /* DMCC demo: enemy card tools, Add rounds box, map drawer buttons, Grant full kit confirm */
    {
      const { pg, errs, ctx } = await page("/dm/index.html?demo=1&fresh=" + Date.now(), { width: 1400, height: 1000 });
      await pg.waitForFunction(() => window.DMCC && window.DMCCEnhance && document.querySelector("#btnLoadDemo"), { timeout: 25000 });
      await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
      await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length >= 2, { timeout: 20000 });
      /* offline only: ?demo=1 never loads Firebase, so nothing here can reach a real room */
      const offline = await pg.evaluate(() => ({ demo: window.DMCC.state.demo, db: !!window.DMCC.state.db }));
      check("dm.offlineDemo", offline.demo === true && offline.db === false, J(offline));
      if (!offline.demo || offline.db) throw new Error("DMCC is not offline; stopping before any write");
      const tab = (n) => pg.evaluate((n) => [...document.querySelectorAll("[role=tab],.tab,[data-tab]")].find((t) => t.textContent.trim() === n).click(), n);
      await tab("Fight"); await sleep(300);
      await pg.evaluate(() => { const m = document.querySelector("#combatantMenu"); if (m) m.open = true; });
      await pg.evaluate(() => document.querySelector('[data-add-beast="outlaw"]').click()); await sleep(400);
      await pg.evaluate(() => { const m = document.querySelector("#combatantMenu"); if (m) m.open = false; });
      const id = await pg.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy" && /Outlaw/.test(x.name)); const a = r.card.attacks[0]; a.jammed = true; a.misStreak = 1; a.lockedChambers = [2]; a.loaded = 3; a.spare = 4; return r.id; });
      await pg.evaluate((id) => document.querySelector('[data-open-enemy="' + id + '"]').click(), id); await sleep(500);
      const tools = await pg.evaluate(() => [...document.querySelectorAll("#enemySheet [data-enemy-gun]")].map((b) => b.textContent.trim()));
      check("dm.card.tools", tools.join("|") === "Clean|Reopen chamber (1 locked)|Add rounds", J(tools));
      const counts = () => pg.evaluate(() => ({ ledger: window.DMCC.state.ledger.length, rolls: window.DMCC.state.rolls.length, cmds: (window.DMCC.state.commands || []).length, chat: document.querySelectorAll("#feedList > *, .table-feed .feed-item, #tableFeed .feed-item").length }));
      const c0 = await counts();
      await pg.evaluate(() => document.querySelector('#enemySheet [data-enemy-gun="addrounds"]').click()); await sleep(300);
      const dlg = await pg.evaluate(() => { const d = document.querySelector(".add-rounds-dlg"); return d ? { text: d.textContent.replace(/\s+/g, " "), n: d.querySelector("[data-ar-n]").value, spareOff: d.querySelector("[data-ar-spare]").disabled, gunOff: d.querySelector("[data-ar-gun]").disabled } : null; });
      check("m4.dialog", dlg && /Only you see this\. Nothing goes to chat or the log\./.test(dlg.text) && dlg.n === "2" && !dlg.spareOff && !dlg.gunOff && /Loaded 3\/6 \(1 locked\) · Spare 4/.test(dlg.text), J(dlg));
      await pg.evaluate(() => { const d = document.querySelector(".add-rounds-dlg"); d.querySelector("[data-ar-n]").value = "5"; d.querySelector("[data-ar-gun]").click(); }); await sleep(500);
      const after = await pg.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy" && /Outlaw/.test(x.name)); const a = r.card.attacks[0]; return { loaded: a.loaded, spare: a.spare }; });
      const c1 = await counts();
      check("m4.dmcc.loaded", after.loaded === 5 && after.spare === 7, J(after));
      check("m4.dmcc.silent", c1.ledger === c0.ledger && c1.rolls === c0.rolls && c1.cmds === c0.cmds && c1.chat === c0.chat, J({ c0, c1 }));
      /* Clean from the card: the clean picker opens with the DM's free unjam */
      await pg.evaluate(() => document.querySelector('#enemySheet [data-enemy-gun="clean"]').click()); await sleep(300);
      const pick = await pg.evaluate(() => { const ds = [...document.querySelectorAll("dialog[open]")]; const d = ds[ds.length - 1]; return d ? [...d.querySelectorAll("button")].map((b) => b.textContent.trim()) : []; });
      check("m2.dmcc.cleanPicker", pick.some((t) => /Unjam \(free · DM\)/.test(t)), J(pick));
      await pg.evaluate(() => { const ds = [...document.querySelectorAll("dialog[open]")]; const d = ds[ds.length - 1]; const b = [...d.querySelectorAll("button")].find((x) => /Unjam/.test(x.textContent)); b.click(); }); await sleep(500);
      await pg.evaluate(() => document.querySelector('#enemySheet [data-enemy-gun="reopen"]').click()); await sleep(500);
      const st = await pg.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy" && /Outlaw/.test(x.name)); const a = r.card.attacks[0]; return { jammed: !!a.jammed, locks: (a.lockedChambers || []).length, tools: [...document.querySelectorAll("#enemySheet [data-enemy-gun]")].map((b) => b.textContent.trim()) }; });
      check("m2.dmcc.cleanReopen", !st.jammed && st.locks === 0 && st.tools.join("|") === "Add rounds", J(st));
      /* map drawer on the same Outlaw token */
      await pg.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy" && /Outlaw/.test(x.name)); const a = r.card.attacks[0]; a.jammed = true; a.lockedChambers = [1]; });
      await pg.evaluate(() => { const s = document.querySelector("#enemySheet"); const c = [...s.querySelectorAll("button")].find((b) => /close/i.test(b.textContent)); if (c) c.click(); });
      await tab("Map"); await sleep(1500);
      await pg.evaluate(() => { const b = document.getElementById("btnMapFull"); if (b) b.click(); }); await sleep(800);
      const boxes = await pg.evaluate(() => window.SSDNSMapHost.tokenBoxes());
      const t = boxes.find((b) => /Outlaw/.test(b.label));
      const cv = await pg.evaluate(() => { const c = document.querySelector("#mapMount canvas, .ssdns-map canvas"); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top }; });
      if (t) { await pg.mouse.click(cv.x + (t.screen.x1 + t.screen.x2) / 2, cv.y + (t.screen.y1 + t.screen.y2) / 2); await sleep(700); }
      const dr = await pg.evaluate(() => { const d = document.querySelector("[data-act=drawer]"); return d ? [...d.querySelectorAll("button")].map((b) => b.textContent.trim()) : null; });
      check("map.drawer.buttons", dr && dr.includes("Clean") && dr.some((x) => /^Reopen chamber \(DM\) · 1 locked$/.test(x)) && dr.includes("Add rounds"), J(dr));
      const c2 = await counts();
      await pg.evaluate(() => [...document.querySelectorAll("[data-act=drawer] button")].find((b) => b.textContent.trim() === "Add rounds").click()); await sleep(300);
      const mdlg = await pg.evaluate(() => !!document.querySelector(".add-rounds-dlg"));
      await pg.evaluate(() => { const d = document.querySelector(".add-rounds-dlg"); if (d) { d.querySelector("[data-ar-n]").value = "3"; d.querySelector("[data-ar-spare]").click(); } }); await sleep(500);
      const ma = await pg.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy" && /Outlaw/.test(x.name)); return r.card.attacks[0].spare; });
      const c3 = await counts();
      check("map.addrounds", mdlg && ma === 10 && c3.ledger === c2.ledger && c3.cmds === c2.cmds && c3.rolls === c2.rolls, J({ mdlg, ma, c2, c3 }));
      await pg.evaluate(() => [...document.querySelectorAll("[data-act=drawer] button")].find((b) => /^Reopen chamber/.test(b.textContent.trim())).click()); await sleep(500);
      const mr = await pg.evaluate(() => { const r = window.DMCCEnhance.turnState().order.find((x) => x.kind === "enemy" && /Outlaw/.test(x.name)); return (r.card.attacks[0].lockedChambers || []).length; });
      check("map.reopen", mr === 0, String(mr));
      /* Grant full kit: confirm first; Cancel sends nothing; Confirm queues one kit_grant */
      await pg.evaluate(() => { const b = document.getElementById("btnMapFull"); if (b && /exit/i.test(b.textContent)) b.click(); }); await sleep(400);
      await tab("Table"); await sleep(400);
      const pid = await pg.evaluate(() => { const ps = window.DMCC.state.players; const k = Object.keys(ps).find((id) => ps[id].snapshot && (ps[id].snapshot.callingId || ps[id].snapshot.calling)); const b = document.querySelector('.pcard[data-pid="' + k + '"]'); if (b) b.click(); return k; });
      await sleep(500);
      const sec = await pg.evaluate(() => { const b = document.querySelector("#btnGrantFullKit"); return b ? { text: b.textContent, sec: b.closest(".kit-grant").textContent.replace(/\s+/g, " ") } : null; });
      check("m5.dmcc.section", sec && /Grant full kit/.test(sec.text) && /Starting kit/.test(sec.sec), J(sec));
      const n0 = await pg.evaluate(() => (window.DMCC.state.commands || []).filter((c) => c.type === "kit_grant").length);
      await pg.evaluate(() => document.querySelector("#btnGrantFullKit").click()); await sleep(300);
      const ask = await pg.evaluate(() => { const ds = [...document.querySelectorAll("dialog[open]")]; const d = ds[ds.length - 1]; return d ? d.textContent.replace(/\s+/g, " ") : ""; });
      check("m5.dmcc.confirm", /Grant the Full kit to /.test(ask) && /nothing they already have is given twice/.test(ask), ask);
      await pg.evaluate(() => { const ds = [...document.querySelectorAll("dialog[open]")]; ds[ds.length - 1].querySelector("[value=no]").click(); }); await sleep(300);
      const n1 = await pg.evaluate(() => (window.DMCC.state.commands || []).filter((c) => c.type === "kit_grant").length);
      check("m5.dmcc.cancelSendsNothing", n1 === n0, J({ n0, n1 }));
      await pg.evaluate(() => document.querySelector("#btnGrantFullKit").click()); await sleep(300);
      await pg.evaluate(() => { const ds = [...document.querySelectorAll("dialog[open]")]; ds[ds.length - 1].querySelector("[value=yes]").click(); }); await sleep(500);
      const sent = await pg.evaluate((pid) => { const cs = (window.DMCC.state.commands || []).filter((c) => c.type === "kit_grant"); const c = cs[0]; return { n: cs.length, to: c && c.to, mode: c && c.payload && c.payload.mode, gid: c && c.payload && c.payload.grantId, pid }; }, pid);
      check("m5.dmcc.sent", sent.n === n0 + 1 && sent.to === pid && sent.mode === "full" && /^kit-/.test(sent.gid || ""), J(sent));
      const still = await pg.evaluate(() => ({ demo: window.DMCC.state.demo, db: !!window.DMCC.state.db }));
      check("dm.stillOffline", still.demo === true && still.db === false, J(still));
      check("dmcc.noPageErrors", errs.length === 0, errs.join(" | "));
      await ctx.close();
    }
  } finally { await browser.close(); }
}

await nodePart();
if (!process.env.NODE_ONLY) await browserPart();
console.log(failures.length ? "\n" + failures.length + " FAILED:\n" + failures.join("\n") : "\nall mech PR A checks passed");
process.exit(failures.length ? 1 : 0);

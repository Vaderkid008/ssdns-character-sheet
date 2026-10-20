/**
 * PR84 (sheet 0.3.76 / DMCC 0.2.89): fight controls and token ammo badges.
 *  - Wanted header: End combat next to Roll Initiative while a fight is set up or running.
 *  - DM map strip: "No fight running" + Roll Initiative when there is no fight; End combat at the far end
 *    (asks first, through the Fight tab's own End combat).
 *  - Token ammo badge: one round per equipped gun, the round that fires NEXT in that gun (#73 art colours),
 *    caliber default + muted red count when empty, live on reload / swap.
 * Part 1 runs in node (vm). Part 2 needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all).
 *   node tools/test-pr84-map-combat-ammo.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

/* ---- part 1: roundLook ---- */
const box = { location: { search: "" }, localStorage: null }; box.window = box;
vm.runInNewContext(read("assets/data/rules.js"), box);
vm.runInNewContext(read("assets/js/ammo-display.js"), box);
const L = box.SSDNSAmmoDisplay.roundLook;
const J = (o) => JSON.stringify(o);
let k = L({ weapon: "navy-army-ball-n-cap-revolver", chambers: ["c", "c", "", "", "", ""] });
check("look.ballNCap", k.type === "ball" && k.tone === "#7d8b99" && !k.empty && k.next === 0, J(k));
k = L({ weapon: "navy-army-ball-n-cap-revolver", chambers: ["", "k:cartridge::medium", "", "", "", ""] });
check("look.cartMedium", k.type === "cart" && k.tone === "#e0b84a" && k.next === 1, J(k));
k = L({ name: "Pocket gun", chambers: ["k:cartridge:.22:light"] });
check("look.rf22", k.type === "rf22" && k.tone === "#f3e7b3", J(k));
k = L({ group: "shotgun", chambers: ["k:buck:12 ga:", "k:slug:12 ga:"] });
check("look.buck12", k.type === "shell" && k.gauge === "12" && k.hull === "#c4322e" && !k.slug, J(k));
k = L({ group: "shotgun", chambers: ["", "k:slug:10 ga:heavy"] });
check("look.slug10", k.type === "shell" && k.gauge === "10" && k.hull === "#2f7a3a" && k.slug === true && k.next === 1, J(k));
k = L({ group: "shotgun", tier: "light", chambers: ["k:buck:.410:light"] });
check("look.buck410", k.type === "shell" && k.gauge === "410" && k.hull === "#3f8fe0", J(k));
k = L({ name: "Caster", chambers: ["3", "k:cartridge::medium"] });
check("look.hex", k.type === "hex" && k.hexLevel === 3 && k.tone === "#8b5cf6", J(k));
k = L({ name: "Caster", chambers: ["3", "k:cartridge::medium"], locked: [0] });
check("look.mixedSkipsLocked", k.type === "cart" && k.next === 1, J(k));
k = L({ name: "Caster", chambers: ["", "k:hex:5", "k:cartridge::medium"] });
check("look.mixedNextToFire", k.type === "hex" && k.hexLevel === 5 && k.next === 1, J(k));
k = L({ weapon: "navy-army-ball-n-cap-revolver", chambers: ["", "", "", "", "", ""] });
check("look.emptyFallsBack", k.empty === true && k.type === "ball", J(k));
k = L({ group: "shotgun", load: "slug", chambers: ["", ""] });
check("look.emptyShellDefault", k.empty === true && k.type === "shell" && k.slug === true, J(k));

/* ---- wiring in the sources ---- */
const mapSrc = read("map/ssdns-map.js"), hostSrc = read("map/ssdns-map-host.js"), equipSrc = read("assets/js/equip.js");
check("src.paintRound", /function paintRoundIcon\(ctx, look, x, y, w\)/.test(mapSrc) && mapSrc.includes("if (row && row.look && row.look.type) paintRoundIcon(ctx, row.look, colX, y, 12);"));
check("src.rowHeight", mapSrc.includes("const rowH = 15;"));
check("src.mutedRedEmpty", mapSrc.includes("ctx.fillStyle = loaded > 0 ? '#e2c56a' : '#c27a70';"));
check("src.liveRedraw", /function refreshCard\(tokenId\) \{[\s\S]{0,400}requestDraw\(\);/.test(mapSrc));
check("src.equipLook", equipSrc.includes("look: g.look || null"));
check("src.hostLook", (hostSrc.match(/look: roundLookFor\(/g) || []).length === 2);
check("src.hostRoutes", hostSrc.includes('name === "initiative:roll"') && hostSrc.includes('$("btnRollInitAll")') && hostSrc.includes('name === "initiative:end"') && hostSrc.includes('$("btnEndCombat")'));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("roundLook") && !read("database.rules.json").includes("roundLook"));

/* ---- part 2: real DMCC (demo) ---- */
function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
if (!(await portOpen(8765))) { console.log("Static server is not listening on 8765 (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1400, height: 1000 });
  const errs = [];
  /* 0.2.89 also fixes the demo map's token-portrait drawImage throw, so no page error is allowed */
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto("http://127.0.0.1:8765/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await pg.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await pg.waitForFunction(() => window.DMCC.state.demo && Object.keys(window.DMCC.state.players || {}).length && window.SSDNSMapHost, { timeout: 20000 });
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); } return false; };
    const out = {};
    document.querySelector("#tab-map").click();
    await until(() => document.querySelector('[data-act="turnStrip"]'), 5000);
    const strip = document.querySelector('[data-act="turnStrip"]');
    out.idle = { hidden: strip.hidden, text: strip.textContent, roll: !!strip.querySelector('[data-act="stripRollInit"]'), headEnd: document.querySelector("#btnEndCombatHead").hidden };
    strip.querySelector('[data-act="stripRollInit"]').click();
    await until(() => document.querySelector('[data-act="turnStrip"] .turn-chip'), 15000);
    const s2 = document.querySelector('[data-act="turnStrip"]');
    const btns = [...s2.children];
    out.fight = { chips: s2.querySelectorAll(".turn-chip").length, last: btns.length ? btns[btns.length - 1].textContent : "", next: btns.some((b) => b.textContent === "Next"), headEnd: document.querySelector("#btnEndCombatHead").hidden, headRoll: !!document.querySelector("#btnRollInitAll") };
    /* End combat from the strip asks first; No keeps the fight */
    s2.querySelector('[data-act="stripEndCombat"]').click();
    await until(() => document.querySelector("dialog.ssdns-ask[open]"), 3000);
    const dlg = document.querySelector("dialog.ssdns-ask[open]");
    out.asks = !!dlg && /End combat/.test(dlg.textContent);
    if (dlg) dlg.querySelector("[value=no]").click();
    await wait(300);
    out.keptAfterNo = document.querySelectorAll('[data-act="turnStrip"] .turn-chip').length;
    /* ammo look per gun follows the loaded round, live */
    const D = window.DMCC, pid = "p_jolene", snap = D.state.players[pid].snapshot;
    const look = () => (window.SSDNSMapHost.rounds({ id: pid }) || []).map((r) => r.look && { type: r.look.type, empty: r.look.empty, slug: r.look.slug, gauge: r.look.gauge, hexLevel: r.look.hexLevel, loaded: r.loaded });
    out.before = look();
    const coach = snap.guns.find((g) => g && /Coach/.test(g.name));
    if (coach) { coach.chambers = ["k:slug:12 ga:", "k:buck:12 ga:"]; coach.loaded = 2; }
    out.slugNext = look();
    if (coach) { coach.chambers = ["", ""]; coach.loaded = 0; }
    out.emptied = look();
    const first = snap.guns[0];
    first.chambers = ["2", "k:cartridge::medium", "", "", "", ""]; first.loaded = 2;
    out.hexSwap = look();
    /* the card refresh asks the map to redraw (that is what the sheet's publishGunCard and the DM snapshot sync call) */
    let drew = 0; const raf = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { drew++; return raf(f); };
    await wait(50); drew = 0; window.SSDNSMapHost.refreshCard(""); window.requestAnimationFrame = raf;
    out.redrawOnRefresh = drew;
    /* End combat from the strip, Yes this time */
    document.querySelector('[data-act="stripEndCombat"]').click();
    await until(() => document.querySelector("dialog.ssdns-ask[open]"), 3000);
    const d2 = document.querySelector("dialog.ssdns-ask[open]");
    if (d2) d2.querySelector("button[type=submit]").click();
    await until(() => /No fight running/.test((document.querySelector('[data-act="turnStrip"]') || {}).textContent || ""), 5000);
    out.ended = { text: document.querySelector('[data-act="turnStrip"]').textContent, headEnd: document.querySelector("#btnEndCombatHead").hidden };
    return out;
  });
  check("strip.idle", !res.idle.hidden && /No fight running/.test(res.idle.text) && res.idle.roll, J(res.idle));
  check("head.endHiddenIdle", res.idle.headEnd === true, J(res.idle));
  check("strip.rollStartsFight", res.fight.chips > 0 && res.fight.next, J(res.fight));
  check("strip.endAtFarEnd", res.fight.last === "End combat", J(res.fight));
  check("head.endShownInFight", res.fight.headEnd === false, J(res.fight));
  check("strip.endAsks", res.asks && res.keptAfterNo > 0, J(res));
  check("strip.endYes", /No fight running/.test(res.ended.text) && res.ended.headEnd === true, J(res.ended));
  const coachAt = (list) => (list || []).findIndex((r) => r && r.type === "shell");
  const ci = coachAt(res.before);
  check("ammo.perGun", res.before.length >= 2 && res.before.every((r) => r && r.type), J(res.before));
  check("ammo.slugNext", ci >= 0 && res.slugNext[ci].slug === true && res.slugNext[ci].gauge === "12", J(res.slugNext));
  check("ammo.emptyDefault", ci >= 0 && res.emptied[ci].empty === true && res.emptied[ci].type === "shell" && res.emptied[ci].loaded === 0, J(res.emptied));
  check("ammo.hexSwap", res.hexSwap[0].type === "hex" && res.hexSwap[0].hexLevel === 2, J(res.hexSwap));
  check("ammo.liveRedraw", res.redrawOnRefresh >= 1, J(res.redrawOnRefresh));
  check("noPageErrors", errs.length === 0, errs.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR84 map combat + ammo checks passed.");
if (failures.length) process.exitCode = 1;

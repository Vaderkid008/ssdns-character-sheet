/**
 * Click-to-shoot quiver (Jessey 2026-10-20 8:38 AM CT): one click on the quiver / bolt / pouch art fires the nocked
 * type through the card's Roll path (one shot, not per arrow; double-click fires once; Enter / Space). Plus per-arrow-type
 * sfx keys (8:40 AM): sfx.json "arrows" type -> key; a key with no file falls back to the bow's own shot cue.
 * node tools/test-quiver-click.mjs  (browser part: ssdns-test-all's :8765)
 */
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

/* ---- sfx keys */
const sfx = JSON.parse(read("assets/sfx/sfx.json"));
const TYPES = ["standard", "broadhead", "blunt", "fire", "whistler", "poison", "dynamite"];
check("sfx.keys", TYPES.every((t) => sfx.arrows && sfx.arrows[t] === "arrow-" + t), JSON.stringify(sfx.arrows));
check("sfx.reuse", JSON.stringify(sfx.pools["arrow-fire"]) === '["fuse.mp3"]' && JSON.stringify(sfx.pools["arrow-dynamite"]) === '["explode.mp3","explode-alt-01.mp3"]');
check("sfx.noNewFiles", Object.values(sfx.pools).flat().concat(Object.values(sfx.events)).every((f) => fs.existsSync(path.join(root, "assets/sfx", f))));
check("sfx.fallbackKeys", ["standard", "broadhead", "blunt", "whistler", "poison"].every((t) => !sfx.events["arrow-" + t] && !sfx.pools["arrow-" + t]));
check("rules.js untouched", !/data-trk-shoot|arrow-fire/.test(read("assets/data/rules.js")));

/* ---- browser */
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const up = await new Promise((res) => { const u = new URL(ORIGIN); const s = net.connect(Number(u.port || 80), u.hostname, () => { s.end(); res(true); }); s.on("error", () => res(false)); });
if (!up) console.log("skip  browser part: no static server at " + ORIGIN + " (run via ssdns-test-all)");
else {
  const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
  const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const pg = await browser.newPage(); const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e)));
    await pg.setViewport({ width: 1440, height: 1100 });
    await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSTrackers && window.SSDNSPlaytest && window.SSDNSActionPips && window.SSDNSAudio, { timeout: 25000 });
    await sleep(1000);
    /* helpers in the page */
    await pg.evaluate(() => {
      document.querySelectorAll("dialog[open]").forEach((n) => { try { n.close(); } catch (e) {} });
      const A = window.SSDNSApp, C = () => A.doc().character;
      window.__q = {
        sfx: [], rolls: [],
        logs: () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent),
        pool: (type, cal) => C().ammo.filter((a) => a.type === type && (cal == null || String(a.caliber || "") === cal)).reduce((n, a) => n + Number(a.count), 0),
        setup: (fn) => { A.applyPatch((d) => { const c = d.character; c.name = "Ash"; c.level = 5; c.calling = "frontier-scout"; c.feats = []; c.items = []; c.res = {}; c.abilities.DEX = 16; c.activeConditions = []; fn(c); });
          window.SSDNSPlaytest.syncSheet(); window.SSDNSActionPips.reset(true);
          const s = document.querySelector("#atkTarget"); if (s) { s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); }
          window.SSDNSTrackers.paint();
          const g = document.getElementById("guns"); const p = g.closest("[id^=page-]"); const tab = document.querySelector('[aria-controls="' + p.id + '"]'); if (tab) tab.click(); }
      };
      window.addEventListener("ssdns-sfx", (e) => window.__q.sfx.push(String(e.detail)));
      const orig = window.SSDNSGunRoll;
      const spy = function () { window.__q.rolls.push([].slice.call(arguments)); return orig.apply(this, arguments); };
      Object.keys(orig).forEach((k) => { spy[k] = orig[k]; });
      Object.defineProperty(spy, "_dm", { get: () => orig._dm, set: (v) => { orig._dm = v; } });
      window.SSDNSGunRoll = spy;
    });
    const ev = (fn, arg) => pg.evaluate(fn, arg);
    /* dbl: a real double-click (mousedown/up detail 1, then detail 2, then dblclick), as a browser sends it */
    const clickArt = async (sel, dbl) => {
      const h = await pg.$(sel); await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await sleep(150);
      const b = await h.boundingBox(); const x = b.x + Math.min(b.width / 2, 12), y = b.y + b.height / 2;
      await pg.mouse.move(x, y);
      await pg.mouse.down({ clickCount: 1 }); await pg.mouse.up({ clickCount: 1 });
      if (dbl) { await sleep(90); await pg.mouse.down({ clickCount: 2 }); await pg.mouse.up({ clickCount: 2 }); }
      await sleep(650);
    };
    const reset = () => ev(() => { window.SSDNSActionPips.reset(true); window.__q.rolls = []; window.__q.sfx = []; });

    /* 1. longbow: fire nocked, a click on any arrow fires one fire arrow through the Roll path */
    await ev(() => window.__q.setup((c) => { c.ammo = [{ type: "arrows", caliber: "", count: 20 }, { type: "arrows", caliber: "fire", count: 5 }]; c.guns = [{ weapon: "longbow", equipped: true, proficient: true, arrowType: "fire" }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; }));
    await sleep(500); await reset();
    const attrs = await ev(() => { const n = document.querySelector('.gun[data-row="0"] [data-trk-shoot="0"]'); return n && { role: n.getAttribute("role"), tab: n.getAttribute("tabindex"), title: n.title, cursor: getComputedStyle(n).cursor, grp: (n.querySelector(".trk-agrp") || {}).title }; });
    check("b.attrs", attrs && attrs.role === "button" && attrs.tab === "0" && attrs.title === "Click to shoot (nocked: Fire)" && attrs.cursor === "pointer" && /^Click to shoot \(nocked: Fire\)\./.test(attrs.grp), JSON.stringify(attrs));
    const atk0 = await ev(() => window.SSDNSActionPips.state().attacks);
    await clickArt('.gun[data-row="0"] .trk-agrp[data-arrow-grp="standard"] .trk-arrow'); /* any arrow: fires the nocked type */
    const s1 = await ev(() => ({ fire: __q.pool("arrows", "fire"), std: __q.pool("arrows", ""), log: __q.logs().find((l) => /Longbow/.test(l)) || "", rolls: JSON.stringify(__q.rolls), atk: window.SSDNSActionPips.state().attacks, sfx: __q.sfx.join(), lit: !!window.SSDNSApp.doc().character.res.litUsed }));
    check("b.click.firesNocked", s1.fire === 4 && s1.std === 20 && /[12]d4/.test(s1.log) && s1.lit, JSON.stringify(s1));
    check("b.click.rollPath", s1.rolls === "[[0,null]]" && s1.atk === atk0 + 1, JSON.stringify([s1.rolls, s1.atk, atk0]));
    check("b.sfx.fire", /arrow-fire/.test(s1.sfx) && !/(^|,)bow-long(,|$)/.test(s1.sfx), s1.sfx);
    /* 2. second lit arrow the same turn: blocked by the one-lit-arrow rule */
    await clickArt('.gun[data-row="0"] .trk-arrows');
    const s2 = await ev(() => ({ fire: __q.pool("arrows", "fire"), log: __q.logs()[0] }));
    check("b.click.litRule", s2.fire === 4 && /One lit arrow per turn/.test(s2.log), JSON.stringify(s2));
    /* 3. standard nocked: double-click fires once; the bow's own cue plays (fallback) */
    await reset();
    await ev(() => { const s = document.querySelector('[data-trk-nock="0"]'); s.value = "standard"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await sleep(300);
    const t3 = await ev(() => document.querySelector('[data-trk-shoot="0"]').title);
    await clickArt('.gun[data-row="0"] .trk-arrows', true);
    const s3 = await ev(() => ({ std: __q.pool("arrows", ""), rolls: __q.rolls.length, sfx: __q.sfx.join() }));
    check("b.click.title.standard", t3 === "Click to shoot (nocked: Standard)", t3);
    check("b.dblclick.once", s3.std === 19 && s3.rolls === 1, JSON.stringify(s3));
    check("b.sfx.standardFallsBack", /(^|,)bow-long(,|$)/.test(s3.sfx) && !/arrow-standard/.test(s3.sfx), s3.sfx);
    /* 4. keyboard: Enter and Space each fire one */
    await reset();
    await ev(() => document.querySelector('[data-trk-shoot="0"]').focus());
    await pg.keyboard.press("Enter"); await sleep(700);
    const s4a = await ev(() => ({ std: __q.pool("arrows", ""), focus: document.activeElement && document.activeElement.getAttribute("data-trk-shoot") }));
    await ev(() => document.querySelector('[data-trk-shoot="0"]').focus());
    await pg.keyboard.press(" "); await sleep(700);
    const s4b = await ev(() => ({ std: __q.pool("arrows", ""), rolls: __q.rolls.length }));
    check("b.keyboard", s4a.std === 18 && s4a.focus === "0" && s4b.std === 17 && s4b.rolls === 2, JSON.stringify([s4a, s4b]));
    /* 5. empty quiver: no roll, the same out-of-ammo message as the Roll button */
    await ev(() => window.__q.setup((c) => { c.ammo = []; c.guns = [{ weapon: "longbow", equipped: true, proficient: true, spentAmmo: 2 }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; }));
    await sleep(400); await reset();
    const atk5 = await ev(() => window.SSDNSActionPips.state().attacks);
    const n5 = await ev(() => __q.logs().length);
    await clickArt('.gun[data-row="0"] .trk-arrows');
    const viaArt = await ev((n) => ({ logs: __q.logs().slice(0, __q.logs().length - n), atk: window.SSDNSActionPips.state().attacks }), n5);
    await sleep(700);
    const n5b = await ev(() => __q.logs().length);
    await ev(() => document.querySelector('[data-gunroll="0"]').click()); await sleep(600);
    const viaBtn = await ev((n) => __q.logs().slice(0, __q.logs().length - n), n5b);
    check("b.empty.sameMessage", viaArt.atk === atk5 && viaArt.logs.length >= 1 && /out of arrows/i.test(viaArt.logs.join(" ")) && viaArt.logs.join("|").replace(/^\S+ \S+/gm, "") === viaBtn.join("|").replace(/^\S+ \S+/gm, "") && !viaArt.logs.some((l) => /d20 \d/.test(l)), JSON.stringify([viaArt, viaBtn]));
    /* 6. crossbow bolt marker, blowpipe, sling pouch */
    for (const [wid, type, sel, word] of [["light-crossbow", "bolts", ".trk-bolt", "bolt"], ["blowpipe-blowgun", "needles", ".trk-bolt", "needle"], ["sling", "stones", ".trk-pips.ammo", "sling stone"]]) {
      await ev((a) => window.__q.setup((c) => { c.ammo = [{ type: a.type, caliber: "", count: 6 }]; c.guns = [{ weapon: a.wid, equipped: true, proficient: true }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; }), { wid, type });
      await sleep(400); await reset();
      const tip = await ev((s) => { const n = document.querySelector('.gun[data-row="0"] ' + s + '[data-trk-shoot="0"]'); return n ? n.title + "|" + getComputedStyle(n).cursor : ""; }, sel);
      await clickArt('.gun[data-row="0"] ' + sel + '[data-trk-shoot="0"]', true);
      const r6 = await ev((t) => ({ left: __q.pool(t), rolls: __q.rolls.length, log: __q.logs()[0] }), type);
      check("b.other." + wid, tip.includes("Click to shoot (") && tip.includes(word) && /\|pointer$/.test(tip) && r6.left === 5 && r6.rolls === 1 && /d20 \d/.test(r6.log), JSON.stringify([tip, r6]));
    }
    /* 7. dynamite arrow by click: the Powder Man flow (no attack roll), sfx fuse + arrow-dynamite */
    await ev(() => window.__q.setup((c) => { c.feats = ["powder-man"]; c.ammo = [{ type: "arrows", caliber: "", count: 3 }, { type: "arrows", caliber: "dynamite", count: 1 }]; c.guns = [{ weapon: "longbow", equipped: true, proficient: true, arrowType: "dynamite" }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; }));
    await sleep(400); await reset();
    const rr = await ev(() => { const r0 = Math.random; Math.random = () => 0.6; window.__restoreRnd = () => { Math.random = r0; }; return true; });
    await clickArt('.gun[data-row="0"] .trk-arrows');
    const s7 = await ev(() => { window.__restoreRnd(); return { dyn: __q.pool("arrows", "dynamite"), log: __q.logs().find((l) => /dynamite arrow/.test(l)) || "", sfx: __q.sfx.join() }; });
    check("b.dynamite.click", rr && s7.dyn === 0 && /no attack roll/.test(s7.log), JSON.stringify(s7));
    check("b.sfx.dynamite", /fuse/.test(s7.sfx) && /arrow-dynamite/.test(s7.sfx), s7.sfx);
    /* 8. the Recover button and Nocked picker still do their own thing (no shot) */
    await reset();
    const s8 = await ev(async () => { const b = document.querySelector('[data-trk-recover="0"]'); if (b && !b.disabled) b.click(); await new Promise((r) => setTimeout(r, 300)); return __q.rolls.length; });
    check("b.recover.noShot", s8 === 0, String(s8));
    check("b.noErrors", !errs.length, errs.join(" | "));
  } finally { await browser.close(); }
}
if (failures.length) { console.log("\n" + failures.length + " FAILED"); process.exit(1); }
console.log("quiver-click ok");

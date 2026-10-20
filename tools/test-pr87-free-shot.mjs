/**
 * PR87 (0.3.80): 'Free shot' in every target picker.
 * The gun just fires: round spent, misfire rules, sound, Action pip. No target, range, Adv/Dis ask,
 * AC, hit/miss or damage. Chat: "<Name> shoots freely · 1d20+B = T".
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-pr87-free-shot.mjs
 */
import net from "node:net";
const ORIGIN = "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function portOpen(port) { return new Promise((r) => { const s = net.connect({ port, host: "127.0.0.1" }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
if (!(await portOpen(8765))) { console.log("Static server is not listening on 8765 (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  /* ---- part 1: the player's sheet ---- */
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && window.SSDNSApp.applyPatch && document.querySelector("#atkTarget"), { timeout: 20000 });
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp;
    const load = () => A.applyPatch((d) => { const c = d.character; c.name = "Dust"; c.ammo = [{ type: "cartridge", caliber: "", count: 50 }];
      c.guns[0] = Object.assign(c.guns[0] || {}, { weapon: "navy-army-ball-n-cap-revolver", equipped: true, loaded: 6, chambers: ["c", "c", "c", "c", "c", "c"], misStreak: 0, jammed: false, dirty: false, fouled: false, ruined: false, broken: false, attackMode: "" });
      c.activeConditions = [{ id: "poisoned", name: "Poisoned" }]; });
    const gun = () => A.doc().character.guns[0];
    const dialogs = () => document.querySelectorAll("dialog[open]").length;
    const lastLog = () => { const it = document.querySelector(".log-item"); return it ? it.textContent : ""; };
    const sounds = [];
    const realPlay = window.SSDNSAudio && window.SSDNSAudio.play;
    if (window.SSDNSAudio) window.SSDNSAudio.play = (n) => { sounds.push(n); };
    const out = {};
    await wait(1200);
    const sel = document.querySelector("#atkTarget");
    out.firstOption = { value: sel.options[0].value, text: sel.options[0].textContent, def: sel.value };
    /* the Gear tab's Target picker is the same #atkTarget, moved into the Gear target slot */
    const gear = document.querySelector("#gearTarget select, #gearTargetSlot select");
    out.gearFirst = gear && gear.options && gear.options[0] ? gear.options[0].textContent : "(no gear picker)";
    load(); await wait(300);
    if (window.SSDNSActionPips && window.SSDNSActionPips.reset) window.SSDNSActionPips.reset();
    sel.value = "__free"; sel.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#globalAdv").value = "adv";
    const realRandom = Math.random; Math.random = () => 0.6; /* every d20 = 13 */
    const loaded0 = Number(gun().loaded);
    window.SSDNSGunRoll(0, 0);
    await wait(700);
    out.plain = { dialogs: dialogs(), loaded: Number(gun().loaded), loaded0, log: lastLog(), toast: ((document.querySelector("#toast") || {}).textContent || ""), sounds: sounds.slice(), pips: window.SSDNSActionPips && window.SSDNSActionPips.state() };
    /* misfire still applies on a free shot */
    sounds.length = 0;
    Math.random = () => 0; /* natural 1 */
    window.SSDNSGunRoll(0, 1);
    await wait(700);
    out.misfire = { dialogs: dialogs(), loaded: Number(gun().loaded), log: lastLog(), sounds: sounds.slice(), streak: gun().misStreak, jammed: gun().jammed, locked: gun().lockedChambers };
    /* a DM-sent free shot (the DM picked Free shot on the map) fires free even with No target here */
    load(); await wait(300);
    sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    Math.random = () => 0.6;
    window.SSDNSGunRoll._dm = { mode: "" }; window.SSDNSGunRoll._free = true;
    window.SSDNSGunRoll(0, 2);
    window.SSDNSGunRoll._dm = null; window.SSDNSGunRoll._free = null;
    await wait(700);
    out.dmFree = { dialogs: dialogs(), loaded: Number(gun().loaded), log: lastLog(), leak: window.SSDNSGunRoll._free };
    Math.random = realRandom;
    if (realPlay) window.SSDNSAudio.play = realPlay;
    document.querySelector("#globalAdv").value = "";
    return out;
  });
  check("sheet.firstOption", res.firstOption.value === "__free" && res.firstOption.text === "Free shot" && res.firstOption.def === "", J(res.firstOption));
  check("sheet.gearPicker", res.gearFirst === "Free shot", J(res.gearFirst));
  check("sheet.noAsk", res.plain.dialogs === 0, J(res.plain));
  check("sheet.roundSpent", res.plain.loaded === res.plain.loaded0 - 1, J(res.plain));
  /* the log draws the d20 face (13) in front of the formula */
  check("sheet.chatLine", /Dust shoots freely · (13)?1d20[+-]\d+ = 13/.test(res.plain.log), J(res.plain));
  check("sheet.oneD20", /1d20[+-]\d+ = (\d+)/.test(res.plain.log) && !/2d20|advantage|disadvantage/i.test(res.plain.log), res.plain.log);
  check("sheet.noAttackBits", !/\bAC\b|HIT|MISS|CRIT|damage|→/i.test(res.plain.log), res.plain.log);
  check("sheet.sound", res.plain.sounds.length > 0 && res.plain.sounds.indexOf("misfire") < 0, J(res.plain.sounds));
  check("sheet.actionPip", !!(res.plain.pips && (res.plain.pips.action || res.plain.pips.attacks > 0)), J(res.plain.pips));
  check("sheet.misfire", /shoots freely/.test(res.misfire.log) && /misfire/.test(res.misfire.log) && res.misfire.sounds.indexOf("misfire") >= 0 && res.misfire.dialogs === 0, J(res.misfire));
  check("sheet.dmFree", res.dmFree.dialogs === 0 && /Dust shoots freely/.test(res.dmFree.log) && res.dmFree.loaded === 5 && !res.dmFree.leak, J(res.dmFree));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));

  /* ---- part 2: the DMCC (demo): an NPC's free shot, from the map and from the Fight tab picker ---- */
  const dm = await browser.newPage();
  await dm.setViewport({ width: 1400, height: 1000 });
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await dm.waitForFunction(() => window.DMCC.state.demo && window.SSDNSMapHost && window.SSDNSMapFight, { timeout: 20000 });
  const d = await dm.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await wait(100); } return false; };
    const out = {};
    document.querySelector("#tab-fight").click();
    await wait(300);
    const add = document.querySelector('[data-add-beast="outlaw"]');
    if (add) add.click();
    await wait(800);
    const rolls = [];
    const realPush = window.DMCC.pushRoll;
    window.DMCC.pushRoll = function (entry) { rolls.push(entry); return realPush.apply(this, arguments); };
    /* the Fight tab target picker: Free shot is listed first for a gun */
    const btns = [...document.querySelectorAll("[data-row-atk]")];
    out.buttons = btns.length;
    let found = false;
    for (const b of btns) {
      b.click();
      await until(() => document.querySelector("#enemyTarget"), 1500);
      const tsel = document.querySelector("#enemyTarget");
      if (!tsel) continue;
      if (tsel.options[0] && tsel.options[0].value === "__free") {
        found = true;
        out.pickerFirst = tsel.options[0].textContent;
        tsel.value = "__free";
        tsel.closest("form").querySelector("button[type=submit]").click();
        await wait(800);
        break;
      }
      const no = tsel.closest("form").querySelector("[value=no]");
      if (no) no.click();
      await wait(200);
    }
    out.found = found;
    out.rolls = rolls.map((r) => ({ detail: r.detail, attack: r.attack, freeShot: r.freeShot, targetId: r.targetId || "" }));
    out.toast = (document.querySelector("#toast") || {}).textContent || "";
    await wait(400);
    /* the DM table feed shows the free shot as one line */
    const feedEls = [...document.querySelectorAll("*")].filter((n) => n.children.length < 12 && /shoots freely/.test(n.textContent || "") && !/shoots freely/.test([...n.children].map((c) => c.textContent).join("\u0001").replace(/[^\u0001]*shoots freely[^\u0001]*/, "")));
    const leaf = feedEls.filter((n) => ![...n.children].some((c) => /shoots freely/.test(c.textContent || ""))).map((n) => n.textContent);
    out.feed = leaf;
    window.DMCC.pushRoll = realPush;
    return out;
  });
  check("dmcc.pickerFree", d.found && d.pickerFirst === "Free shot", J(d));
  const free = (d.rolls || []).find((r) => /shoots freely/.test(r.detail || ""));
  check("dmcc.chatLine", !!free && /shoots freely · 1d20[+-]\d+ = \d+/.test(free.detail) && free.freeShot === true && !free.attack && !free.targetId, J(d.rolls));
  check("dmcc.noAttackBits", !!free && !/\bAC\b|HIT|MISS|CRIT|→/.test(free.detail), free && free.detail);
  check("dmcc.feedOneLine", (d.feed || []).length > 0 && (d.feed || []).every((t) => (t.match(/1d20/g) || []).length === 1 && !/\(.*shoots freely/.test(t)), J(d.feed));
  check("dmcc.roundSpent", /left/.test(d.toast) || /misfire/.test(d.toast), d.toast);
  check("dmcc.noPageErrors", dmErrs.length === 0, dmErrs.join(" | "));
} finally { await browser.close(); }
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR87 free shot checks passed.");
if (failures.length) process.exitCode = 1;

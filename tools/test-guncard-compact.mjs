/**
 * 0.3.106: compact gun card (Jessey's markup, 2026-10-19).
 *  - weapon mod + capacity share the weapon-name row
 *  - ADV / DIS ticks (mutually exclusive, neither = normal) on the sub row, same attackMode state as the old dropdown
 *  - Roll / Melee / gun-melee note on the cylinder / Reload / Unload / ammo row
 *  - misfire range, condition ticks, Clean / Unjam / Reopen as one horizontal row
 * Mechanics must not move: Roll, Melee, Reload, Unload, Clean, Unjam (cost + chat), Reopen (cost + chat), map/DMCC adv/dis + unjam paths.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-guncard-compact.mjs
 */
import fs from "node:fs";
import net from "node:net";
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
const J = (x) => JSON.stringify(x);
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
function portOpen(port, host) { return new Promise((r) => { const s = net.connect({ port, host }, () => { s.end(); r(true); }); s.on("error", () => r(false)); }); }
const u = new URL(ORIGIN);
if (!(await portOpen(Number(u.port), u.hostname))) { console.log("Static server is not listening on " + ORIGIN + " (run via ssdns-test-all)"); process.exit(1); }
const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const setup = async (pg, width) => {
  await pg.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
  await pg.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.SSDNSApp && window.SSDNSGunRoll && document.querySelector("#atkTarget") && document.querySelector('.gun[data-row="0"]'), { timeout: 20000 });
  await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(900);
    const gunRow = (id, n) => ({ weapon: id, equipped: true, proficient: true, loaded: n, chambers: Array(n).fill("c"), misStreak: 0, jammed: false, dirty: false, fouled: false, attackMode: "" });
    window.SSDNSApp.applyPatch((d) => { const c = d.character; c.name = "Dust"; c.calling = "gunslinger"; c.level = 5; c.feats = []; c.abilities.DEX = 14;
      c.ammo = [{ type: "percussion", caliber: "", count: 60 }, { type: "buck", caliber: "", count: 20 }];
      c.guns = [gunRow("navy-army-ball-n-cap-revolver", 5), gunRow("double-barrel-coach-gun", 2), { weapon: "" }, { weapon: "" }]; c.muzzleReopenUsed = false; });
    await wait(400);
    const t = document.querySelector("#tab-equip"); if (t) t.click();
    await wait(500);
  });
};
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await setup(pg, 1400);
  const res = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, P = window.SSDNSActionPips;
    const out = {};
    const J0 = (x) => { try { return JSON.stringify(x); } catch (e) { return ""; } };
    const card = (i) => document.querySelector('.gun[data-row="' + i + '"]');
    const vis = (n) => !!n && !n.hidden && n.offsetParent !== null && n.getClientRects().length > 0;
    const logs = () => [...document.querySelectorAll(".log-item")].map((n) => n.textContent);
    const sel = document.querySelector("#atkTarget"); sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
    /* structure, for both the revolver and the coach gun */
    out.struct = [0, 1].map((i) => {
      const c = card(i), nr = c.querySelector(".g-namerow"), sub = c.querySelector(".g-sub"), ch = c.querySelector(".g-chamber-row"), mis = c.querySelector(".g-mis");
      const top = (n) => Math.round(n.getBoundingClientRect().top);
      const misKids = [...mis.children].filter(vis);
      const nameSel = nr && nr.querySelector("[data-gun]"), mod = nr && nr.querySelector(".mod-sel"), cap = nr && nr.querySelector(".cap-sel");
      return {
        nameRow: !!(nameSel && mod && cap) && (vis(mod) || vis(cap)) && [mod, cap].filter(vis).every((n) => Math.abs(top(nameSel) - top(n)) < 8),
        ticks: sub.querySelectorAll('[data-advtick="' + i + '"]').length === 2 && vis(sub.querySelector('[data-advtick="' + i + '"][value="adv"]')) && vis(sub.querySelector('[data-advtick="' + i + '"][value="dis"]')),
        selectHidden: !!c.querySelector('[data-adv="' + i + '"]') && !vis(c.querySelector('[data-adv="' + i + '"]')),
        rollOnChamberRow: !!ch.querySelector('[data-gunroll="' + i + '"]') && !!ch.querySelector('[data-gunmelee="' + i + '"]') && !!ch.querySelector('[data-out="gmelee.' + i + '"]'),
        /* sensible wrap: Roll sits on the cylinder row's line, or wraps with the ammo select right below it */
        rollSameLine: top(c.querySelector('[data-gunroll="' + i + '"]')) - top(c.querySelector('[data-reload="' + i + '"]')) < 70 && top(c.querySelector('[data-gunroll="' + i + '"]')) < top(mis),
        misRow: getComputedStyle(mis).flexDirection === "row" && misKids.length >= 5 && (Math.max(...misKids.map(top)) - Math.min(...misKids.map(top))) < 30,
        misLeft: Math.round(mis.getBoundingClientRect().left - c.getBoundingClientRect().left) < 40,
        noSmithRow: !vis(c.querySelector(".g-smith")),
        oldAdvGone: !c.querySelector('.g-actions [data-adv]')
      };
    });
    /* ADV green / DIS red, the chat-ring hues (#46c46a / #e0524a) */
    {
      const al = document.querySelector('[data-advtick="0"][value="adv"]').closest("label"), dl = document.querySelector('[data-advtick="0"][value="dis"]').closest("label");
      const cs = (n) => getComputedStyle(n);
      out.colors = { advAccent: cs(al.querySelector("input")).accentColor, disAccent: cs(dl.querySelector("input")).accentColor, advText: cs(al).color, disText: cs(dl).color, advBg: cs(al).backgroundColor, disBg: cs(dl).backgroundColor };
    }
    {
      const m = document.querySelector('[data-out="mis.0"]'), cs = getComputedStyle(m);
      out.badge = { border: cs.borderTopStyle + " " + cs.borderTopWidth + " " + cs.borderTopColor, bg: cs.backgroundColor, weight: cs.fontWeight, pad: cs.paddingLeft, text: m.textContent };
    }
    /* ADV / DIS ticks: mutually exclusive, same state as before */
    const adv = document.querySelector('[data-advtick="0"][value="adv"]'), dis = document.querySelector('[data-advtick="0"][value="dis"]');
    adv.click(); await wait(100);
    out.t1 = { mode: A.gunAttackMode(0), saved: A.doc().character.guns[0].attackMode, sel: document.querySelector('[data-adv="0"]').value, adv: adv.checked, dis: dis.checked };
    dis.click(); await wait(100);
    out.t2 = { mode: A.gunAttackMode(0), adv: adv.checked, dis: dis.checked };
    dis.click(); await wait(100);
    out.t3 = { mode: A.gunAttackMode(0), adv: adv.checked, dis: dis.checked };
    /* map / DMCC path: setAttackMode (dm-join op "mode") paints the ticks */
    A.setAttackMode(0, "adv"); await wait(100);
    out.mapAdv = { adv: adv.checked, dis: dis.checked, card: (window.SSDNSMapHost && window.SSDNSMapHost.ownCard && J0(window.SSDNSMapHost.ownCard())) };
    A.renderCalc && A.renderCalc(); await wait(100);
    out.mapAdv.afterRender = adv.checked;
    /* Roll with ADV rolls two d20 */
    Math.random = () => 0.6;
    P.reset(true);
    const l0 = A.doc().character.guns[0].loaded;
    document.querySelector('[data-gunroll="0"]').click(); await wait(800);
    out.roll = { loaded: A.doc().character.guns[0].loaded, before: l0, log: logs().find((t) => /Ball n Cap/.test(t) && /→/.test(t)) || "" };
    A.setAttackMode(0, ""); await wait(50);
    /* Melee */
    P.reset(true);
    document.querySelector('[data-gunmelee="0"]').click(); await wait(700);
    out.melee = logs().slice(0, 3).join(" | ");
    /* Unload + Reload */
    document.querySelector('[data-unload="0"]').click(); await wait(500);
    out.unload = A.doc().character.guns[0].loaded;
    P.reset(true);
    document.querySelector('[data-reload="0"]').click(); await wait(800);
    out.reload = A.doc().character.guns[0].loaded;
    /* Clean on a dirty gun opens the clean picker (pick before anything changes) */
    A.applyPatch((d) => { d.character.guns[1].dirty = true; }); await wait(300);
    const before = document.body.innerHTML.length;
    document.querySelector('[data-clean="1"]').click(); await wait(500);
    const modal = document.querySelector("dialog.clean-modal");
    const picks = modal ? [...modal.querySelectorAll("button")].filter((b) => vis(b) && !/cancel|close/i.test(b.textContent)) : [];
    out.clean = { picker: !!(modal && modal.open) ? picks.length : 0, labels: picks.map((b) => b.textContent.trim().slice(0, 30)) };
    const kit = picks.find((b) => /kit|tools|10 min/i.test(b.textContent)) || picks[0];
    if (kit) { kit.click(); await wait(600); }
    out.clean.dirtyAfter = A.doc().character.guns[1].dirty;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await wait(100);
    /* condition chips: each condition shows once, active ones highlighted (not dimmed) */
    A.applyPatch((d) => { const g = d.character.guns[1]; g.dirty = true; g.fouled = false; g.jammed = false; }); await wait(400);
    const chipInfo = (i, cond) => {
      const c = card(i);
      const l = cond === "lockup" ? c.querySelector('[data-lockup="' + i + '"]') : c.querySelector('[data-f="character.guns.' + i + '.' + cond + '"]').closest("label");
      const inp = l.querySelector("input"), cs = getComputedStyle(l), ci = getComputedStyle(inp);
      return { on: l.classList.contains("on"), cond: l.getAttribute("data-cond"), checked: inp.checked, disabled: inp.disabled, op: cs.opacity + "/" + ci.opacity, bg: cs.backgroundColor, border: cs.borderTopColor, weight: cs.fontWeight, boxBg: ci.backgroundColor };
    };
    out.cond = { dirty: chipInfo(1, "dirty"), fouledOff: chipInfo(1, "fouled"), status: card(1).querySelector('[data-out="gst.1"]').textContent, badge: card(1).querySelector('[data-out="mis.1"]').textContent,
      dirtyWords: (card(1).querySelector(".g-mis").textContent.match(/dirty/gi) || []).length };
    A.applyPatch((d) => { const g = d.character.guns[1]; g.dirty = false; g.fouled = true; }); await wait(400);
    out.cond.fouled = chipInfo(1, "fouled");
    A.applyPatch((d) => { const g = d.character.guns[1]; g.fouled = false; }); await wait(300);
    A.applyPatch((d) => { const g = d.character.guns[0]; g.jammed = true; g.misStreak = 2; g.lockedChambers = [1]; }); await wait(400);
    out.cond.jammed = chipInfo(0, "jammed"); out.cond.lock = chipInfo(0, "lockup");
    out.cond.status0 = card(0).querySelector('[data-out="gst.0"]').textContent;
    A.applyPatch((d) => { const g = d.character.guns[0]; g.jammed = false; g.misStreak = 0; g.lockedChambers = []; }); await wait(400);
    out.cond.lockOff = chipInfo(0, "lockup"); out.cond.jamOff = chipInfo(0, "jammed");
    /* Unjam: shows when jammed, sits in the misfire row, costs the bonus action, posts to chat */
    P.reset(true);
    A.applyPatch((d) => { const g = d.character.guns[0]; g.jammed = true; g.misStreak = 1; }); await wait(400);
    const uj = document.querySelector('[data-unjam="0"]');
    out.unjam = { shown: vis(uj), inRow: !!uj.closest(".g-mis"), text: uj.textContent, cost: uj.getAttribute("data-cost") || "", gunRow: !!card(0).classList.contains("jammed") };
    uj.click(); await wait(800);
    out.unjam.after = { jammed: A.doc().character.guns[0].jammed, bonus: P.state().bonus, log: logs().slice(0, 4).join(" | "), hidden: !vis(uj) };
    /* Unjam via the map card (runAction) and the DMCC (dm-join op "clean" optionId "unjam") */
    P.reset(true);
    A.applyPatch((d) => { d.character.guns[0].jammed = true; }); await wait(300);
    const ownJam = (window.SSDNSMapHost.ownCard().attacks || []).map((a) => a.id).concat(Object.keys(window.SSDNSMapHost.ownCard()));
    await window.SSDNSMapHost.runAction("unjam:0", {}); await wait(600);
    out.mapUnjam = { jammed: A.doc().character.guns[0].jammed, bonus: P.state().bonus };
    P.reset(true);
    A.applyPatch((d) => { d.character.guns[0].jammed = true; }); await wait(300);
    await A.applyCleanOption(0, "unjam"); await wait(600); /* dm-join op "clean"/"unjam": a DM unjam stays free (Jessey, 2026-10-19) */
    out.dmUnjam = { jammed: A.doc().character.guns[0].jammed, bonus: P.state().bonus };
    /* jam pop-up "Unjam" button uses SSDNSApp.unjamGun: player path, costs the bonus action */
    P.reset(true);
    A.applyPatch((d) => { d.character.guns[0].jammed = true; }); await wait(300);
    await A.unjamGun(0); await wait(600);
    out.toastUnjam = { jammed: A.doc().character.guns[0].jammed, bonus: P.state().bonus };
    /* free with Muzzleloader on the player path */
    P.reset(true);
    A.applyPatch((d) => { d.character.feats = ["muzzleloader"]; d.character.guns[0].jammed = true; }); await wait(300);
    await A.unjamGun(0); await wait(600);
    out.freeUnjam = { jammed: A.doc().character.guns[0].jammed, bonus: P.state().bonus };
    A.applyPatch((d) => { d.character.feats = []; }); await wait(200);
    /* Reopen (Muzzleloader + a locked chamber): shows, costs the action, posts to chat */
    P.reset(true);
    A.applyPatch((d) => { const c = d.character; c.feats = ["muzzleloader"]; c.muzzleReopenUsed = false; c.guns[0].lockedChambers = [2]; }); await wait(400);
    const ro = document.querySelector('[data-reopen="0"]');
    out.reopen = { shown: vis(ro), inRow: !!ro.closest(".g-mis"), cost: ro.getAttribute("data-cost") || "", lockShown: vis(document.querySelector('[data-lockup="0"]')) };
    ro.click(); await wait(800);
    out.reopen.after = { locks: (A.doc().character.guns[0].lockedChambers || []).length, action: P.state().action, log: logs().slice(0, 4).join(" | "), used: !!A.doc().character.muzzleReopenUsed };
    /* DMCC reopen op uses the same API */
    P.reset(true);
    A.applyPatch((d) => { const c = d.character; c.muzzleReopenUsed = false; c.guns[0].lockedChambers = [3]; }); await wait(300);
    await A.reopenChamber(0); await wait(500);
    out.dmReopen = { locks: (A.doc().character.guns[0].lockedChambers || []).length, action: P.state().action };
    return out;
  });
  res.struct.forEach((s, i) => {
    const n = i ? "coach" : "revolver";
    check(n + ".nameRowHasModCap", s.nameRow, J(s));
    check(n + ".advDisTicks", s.ticks && s.selectHidden && s.oldAdvGone, J(s));
    check(n + ".rollOnCylinderRow", s.rollOnChamberRow && s.rollSameLine, J(s));
    check(n + ".misfireRowHorizontal", s.misRow && s.misLeft, J(s));
    check(n + ".noEmptySmithRow", s.noSmithRow, J(s));
  });
  check("adv.colors", res.colors.advAccent === "rgb(70, 196, 106)" && res.colors.disAccent === "rgb(224, 82, 74)" && /^rgb\(\d+, 1[0-9]{2}, /.test(res.colors.advText) && /^rgb\(1[0-9]{2}, \d{1,2}, /.test(res.colors.disText) && /rgba\(70, 196, 106/.test(res.colors.advBg) && /rgba\(224, 82, 74/.test(res.colors.disBg), JSON.stringify(res.colors));
  check("misfire.badge", /^solid 1px rgb\(74, 50, 32\)$/.test(res.badge.border) && /rgba\(59, 42, 26/.test(res.badge.bg) && Number(res.badge.weight) >= 700 && parseFloat(res.badge.pad) >= 6 && /\d/.test(res.badge.text), JSON.stringify(res.badge));
  check("adv.tickSetsMode", res.t1.mode === "adv" && res.t1.saved === "adv" && res.t1.sel === "adv" && res.t1.adv && !res.t1.dis, J(res.t1));
  check("adv.exclusive", res.t2.mode === "dis" && !res.t2.adv && res.t2.dis, J(res.t2));
  check("adv.neitherIsNormal", res.t3.mode === "" && !res.t3.adv && !res.t3.dis, J(res.t3));
  check("adv.mapDmccPaintsTicks", res.mapAdv.adv && !res.mapAdv.dis && res.mapAdv.afterRender && /"attackMode":"adv"/.test(res.mapAdv.card), J(res.mapAdv));
  check("roll.works", res.roll.loaded === res.roll.before - 1 && /d20/.test(res.roll.log), J(res.roll));
  check("roll.advTwoDice", /adv/i.test(res.roll.log), res.roll.log);
  check("melee.works", /Pistol Whip/.test(res.melee), res.melee);
  check("unload.works", res.unload === 0, J(res.unload));
  check("reload.works", res.reload === 6, J(res.reload));
  check("clean.picker", res.clean.picker > 0 && res.clean.dirtyAfter === false, J(res.clean));
  {
    const c = res.cond, lit = (x) => x.on && x.checked && x.op === "1/1" && Number(x.weight) >= 700 && !/rgba\(0, 0, 0, 0\)/.test(x.bg);
    check("cond.dirtyOnce", c.dirtyWords === 2 && !/Dirty/.test(c.status) && /\(dirty\)/.test(c.badge), JSON.stringify(c)); /* chip label + the badge's "(dirty)" note */
    check("cond.dirtyLit", lit(c.dirty) && c.dirty.disabled && /rgba\(214, 135, 40/.test(c.dirty.bg) && c.dirty.boxBg === "rgb(176, 97, 26)", JSON.stringify(c.dirty));
    check("cond.fouledLit", lit(c.fouled) && /rgba\(214, 135, 40/.test(c.fouled.bg), JSON.stringify(c.fouled));
    check("cond.jammedLit", lit(c.jammed) && /rgba\(224, 82, 74/.test(c.jammed.bg) && c.jammed.boxBg === "rgb(179, 38, 30)", JSON.stringify(c.jammed));
    check("cond.lockupLit", lit(c.lock) && /rgba\(224, 82, 74/.test(c.lock.bg), JSON.stringify(c.lock));
    check("cond.statusKeepsRest", /misfires 2/.test(c.status0) && !/Jammed|locked/.test(c.status0), c.status0);
    check("cond.offPlain", !c.fouledOff.on && !c.lockOff.on && !c.jamOff.on && !c.lockOff.checked && c.lockOff.op === "1/1", JSON.stringify([c.fouledOff, c.lockOff, c.jamOff]));
  }
  check("unjam.shownInRow", res.unjam.shown && res.unjam.inRow && /^Unjam/.test(res.unjam.text), J(res.unjam));
  check("unjam.worksCostChat", res.unjam.after.jammed === false && res.unjam.after.bonus === true && /unjam/i.test(res.unjam.after.log) && res.unjam.after.hidden, J(res.unjam.after));
  check("unjam.mapPath", res.mapUnjam.jammed === false && res.mapUnjam.bonus === true, J(res.mapUnjam));
  check("unjam.dmJoinStaysFree", !/payload\.optionId === "unjam" && app\.unjamGun/.test(fs.readFileSync(new URL("../assets/js/dm-join.js", import.meta.url), "utf8")) && /payload\.op === "clean" && app\.applyCleanOption/.test(fs.readFileSync(new URL("../assets/js/dm-join.js", import.meta.url), "utf8")));
  check("unjam.dmccPathFree", res.dmUnjam.jammed === false && res.dmUnjam.bonus === false, J(res.dmUnjam));
  check("unjam.jamPopupCosts", res.toastUnjam.jammed === false && res.toastUnjam.bonus === true, J(res.toastUnjam));
  check("unjam.freeWithMuzzleloader", res.freeUnjam.jammed === false && res.freeUnjam.bonus === false, J(res.freeUnjam));
  check("reopen.shownInRow", res.reopen.shown && res.reopen.inRow && res.reopen.cost === "Action" && res.reopen.lockShown, J(res.reopen));
  check("reopen.worksCostChat", res.reopen.after.locks === 0 && res.reopen.after.action === true && /reopened chamber/i.test(res.reopen.after.log) && res.reopen.after.used, J(res.reopen.after));
  check("reopen.dmccPath", res.dmReopen.locks === 0 && res.dmReopen.action === true, J(res.dmReopen));
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));

  /* narrow width: no horizontal overflow, controls still reachable */
  await pg.close(); /* the sheet syncs across tabs through storage; one tab at a time */
  const ph = await browser.newPage();
  const phErrs = [];
  ph.on("pageerror", (e) => phErrs.push(String(e)));
  await setup(ph, 390);
  const narrow = await ph.evaluate(async () => {
    window.SSDNSApp.applyPatch((d) => { d.character.guns[0].jammed = true; d.character.guns[0].misStreak = 1; }); await new Promise((r) => setTimeout(r, 600));
    return [0, 1].map((i) => {
      const c = document.querySelector('.gun[data-row="' + i + '"]');
      const r = c.getBoundingClientRect();
      const kids = [...c.querySelectorAll("button, select, input, label")].filter((n) => n.offsetParent !== null && n.getClientRects().length);
      const out = kids.filter((n) => { const b = n.getBoundingClientRect(); return b.right > r.right + 1 || b.left < r.left - 1; }).map((n) => n.outerHTML.slice(0, 60));
      return { overflow: c.scrollWidth > c.clientWidth + 1, outside: out, page: document.documentElement.scrollWidth <= window.innerWidth + 1,
        unjam: i === 0 ? document.querySelector('[data-unjam="0"]').offsetParent !== null : true };
    });
  });
  check("narrow.noOverflow", narrow.every((n) => !n.overflow && !n.outside.length && n.page), J(narrow));
  check("narrow.unjamVisible", narrow[0].unjam, J(narrow));
  check("narrow.noPageErrors", phErrs.length === 0, phErrs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed: " + failures.join(", ")); process.exit(1); }
console.log("\nall compact gun card checks passed");

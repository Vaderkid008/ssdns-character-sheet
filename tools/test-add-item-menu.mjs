/**
 * 0.3.76 / DMCC 0.2.89: the player's free-add item area is a compact "Add item ▾" menu
 * (pick list grouped by type + search, custom form opens from the menu). Picking a catalog row
 * must produce exactly what the old always-open form produced. DMCC Give item is unchanged.
 * One flag hides it later (FINAL STRETCH): window.SSDNS_PLAYER_FREE_ADD = false.
 * Needs the static server on 127.0.0.1:8765 and Chrome (ssdns-test-all starts the server).
 *   node tools/test-add-item-menu.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* static wiring */
{
  const js = read("assets/js/items.js");
  check("wire.flag", /function playerFreeAdd\(\) \{ return root\.SSDNS_PLAYER_FREE_ADD !== false; \}/.test(js));
  check("wire.dmFormUntouched", /if \(slot\) slot\.innerHTML = formHtml\(\{ dm: true \}\);/.test(js));
  check("wire.sameAddPath", (js.match(/addFromForm\(/g) || []).length >= 3 && /add\(character\(\), Object\.assign\(made, \{ addressedTo: made\.addressedTo \}\), \{ player: true \}\)/.test(js));
}

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function openSheet(page) {
  await page.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.applyPatch && window.SSDNSItems && document.querySelector("#tab-equip"), { timeout: 20000 });
  await page.evaluate(() => document.querySelector("#tab-equip").click());
  await page.waitForFunction(() => document.querySelector("#itemFormSlot [data-add-item-menu]"), { timeout: 10000 });
  await sleep(300);
}
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1440, height: 900 });
  await openSheet(pg);

  /* closed by default: one button, no open form */
  const closed = await pg.evaluate(() => {
    const slot = document.querySelector("#itemFormSlot");
    const t = slot.querySelector("[data-add-item-toggle]");
    return { text: t && t.textContent, exp: t && t.getAttribute("aria-expanded"), popHidden: slot.querySelector("[data-add-item-pop]").hidden,
      formHidden: slot.querySelector("[data-add-item-formwrap]").hidden, formInDom: !!slot.querySelector("[data-item-form]"), h: Math.round(document.querySelector("#itemGear").getBoundingClientRect().height) };
  });
  check("closed.button", closed.text === "Add item ▾" && closed.exp === "false", JSON.stringify(closed));
  check("closed.noOpenForm", closed.popHidden && closed.formHidden && closed.formInDom, JSON.stringify(closed));
  check("closed.compact", closed.h < 200, "items area " + closed.h + "px (was ~1300px)");

  /* open: grouped pick list matching the catalog, with search */
  await pg.click("[data-add-item-toggle]");
  await sleep(200);
  const open = await pg.evaluate(() => {
    const slot = document.querySelector("#itemFormSlot");
    const groups = [...slot.querySelectorAll("[data-add-item-group]")].map((g) => g.getAttribute("data-add-item-group"));
    const picks = [...slot.querySelectorAll("[data-add-item-pick]")].map((b) => b.getAttribute("data-add-item-pick"));
    const cat = window.SSDNSItems.catalog({ dm: false });
    const types = [...new Set(cat.map((r) => r.type))];
    const groupOk = [...slot.querySelectorAll("[data-add-item-group]")].every((g) => [...g.querySelectorAll("[data-add-item-pick]")].every((b) => { const row = cat.find((r) => r.id === b.getAttribute("data-add-item-pick")); return row && row.type === g.getAttribute("data-add-item-group"); }));
    return { exp: slot.querySelector("[data-add-item-toggle]").getAttribute("aria-expanded"), popShown: !slot.querySelector("[data-add-item-pop]").hidden, groups, types,
      picks: picks.length, cat: cat.length, groupOk, search: !!slot.querySelector("[data-add-item-search]"), custom: !!slot.querySelector("[data-add-item-custom]"), quest: cat.some((r) => r.type === "quest") };
  });
  check("open.shown", open.exp === "true" && open.popShown, JSON.stringify(open));
  check("open.allCatalog", open.picks === open.cat && open.cat > 20, open.picks + " vs " + open.cat);
  check("open.groupsMatchTypes", open.types.every((t) => open.groups.includes(t)) && open.groupOk, JSON.stringify(open.groups));
  check("open.groupOrder", open.groups.join(",") === ["weapon", "explosive", "consumable", "scroll", "gear"].filter((t) => open.types.includes(t)).join(","), open.groups.join(","));
  check("open.searchAndCustom", open.search && open.custom && !open.quest);
  await pg.type("[data-add-item-search]", "dynamite");
  await sleep(150);
  const srch = await pg.evaluate(() => ({ groups: [...document.querySelectorAll("#itemFormSlot [data-add-item-group]")].map((g) => g.getAttribute("data-add-item-group")), names: [...document.querySelectorAll("#itemFormSlot [data-add-item-pick]")].map((b) => b.textContent) }));
  check("search.filters", srch.groups.join() === "explosive" && srch.names.length > 0 && srch.names.every((n) => /dynamite/i.test(n)), JSON.stringify(srch));
  await pg.evaluate(() => { const s = document.querySelector("[data-add-item-search]"); s.value = "zzzz"; s.dispatchEvent(new Event("input", { bubbles: true })); });
  check("search.empty", await pg.evaluate(() => !!document.querySelector("#itemFormSlot .add-item-empty")));
  await pg.evaluate(() => { const s = document.querySelector("[data-add-item-search]"); s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })); });

  /* Escape and outside click close it */
  await pg.keyboard.press("Escape");
  check("close.escape", await pg.evaluate(() => document.querySelector("#itemFormSlot [data-add-item-pop]").hidden));
  await pg.click("[data-add-item-toggle]");
  await pg.evaluate(() => document.querySelector("#taEquip").click());
  check("close.outside", await pg.evaluate(() => document.querySelector("#itemFormSlot [data-add-item-pop]").hidden));

  /* picking == the old form path (catalog select + fill + Add item), for each type */
  const same = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp, I = window.SSDNSItems;
    const slot = document.querySelector("#itemFormSlot");
    let patches = 0;
    const realPatch = A.applyPatch;
    A.applyPatch = function (fn) { patches++; return realPatch.apply(this, arguments); };
    const reset = () => A.applyPatch((d) => { const c = d.character; c.items = []; c.inventoryLocked = false; c.guns = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; c.melee = [{ weapon: "" }, { weapon: "" }, { weapon: "" }, { weapon: "" }]; });
    const strip = (c) => JSON.parse(JSON.stringify({ items: (c.items || []).map((it) => { const o = Object.assign({}, it); delete o.uid; delete o.addedAt; delete o.ts; delete o.created; return o; }), guns: (c.guns || []).map((g) => g.weapon || ""), melee: (c.melee || []).map((g) => g.weapon || "") }));
    const oldPath = async (id) => {
      reset(); await wait(50);
      slot.querySelector("[data-add-item-custom]").click();
      const form = slot.querySelector("[data-item-form]");
      const sel = form.querySelector("[data-item-catalog]");
      sel.value = id; sel.dispatchEvent(new Event("change", { bubbles: true }));
      form.querySelector("[data-item-add]").click();
      await wait(50);
      return strip(A.doc().character);
    };
    const menuPath = async (id, times) => {
      reset(); await wait(50);
      for (let k = 0; k < (times || 1); k++) {
        slot.querySelector("[data-add-item-toggle]").click();
        await wait(20);
        slot.querySelector('[data-add-item-pick="' + id + '"]').click();
        await wait(50);
      }
      return strip(A.doc().character);
    };
    const cat = I.catalog({ dm: false });
    const out = { cases: [] };
    for (const type of ["weapon", "explosive", "consumable", "scroll", "gear"]) {
      const row = cat.find((r) => r.type === type);
      if (!row) continue;
      const a = await oldPath(row.id), b = await menuPath(row.id);
      out.cases.push({ type, id: row.id, same: JSON.stringify(a) === JSON.stringify(b), playerAdded: !!(b.items[0] && b.items[0].playerAdded), a: JSON.stringify(a).slice(0, 300), b: JSON.stringify(b).slice(0, 300) });
    }
    const cons = cat.find((r) => r.type === "consumable");
    const twice = await menuPath(cons.id, 2);
    out.merge = twice.items.length === 1 && twice.items[0].count === 2;
    out.menuClosedAfterPick = slot.querySelector("[data-add-item-pop]").hidden;
    out.catalogReset = slot.querySelector("[data-item-catalog]").value === "";
    out.listShows = /\S/.test(document.querySelector("#itemList").textContent) && document.querySelectorAll("#itemList .item-row").length === 1;
    const before = patches;
    await menuPath(cons.id, 1);
    out.committed = patches > before;
    A.applyPatch = realPatch;
    return out;
  });
  same.cases.forEach((c) => check("pick.sameAsOldForm." + c.type, c.same && c.playerAdded, c.id + " old=" + c.a + " menu=" + c.b));
  check("pick.weaponLands", same.cases.some((c) => c.type === "weapon"), "a catalog weapon was tested");
  check("pick.mergesStack", same.merge);
  check("pick.closesMenu", same.menuClosedAfterPick && same.catalogReset);
  check("pick.listRepaints", same.listShows);
  check("pick.commitsForDmSync", same.committed, "applyPatch (the sheet save + DM snapshot path) ran");

  /* custom item form opens from the menu, adds, and folds away */
  const custom = await pg.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const A = window.SSDNSApp;
    A.applyPatch((d) => { d.character.items = []; });
    const slot = document.querySelector("#itemFormSlot");
    slot.querySelector("[data-add-item-toggle]").click();
    await wait(20);
    slot.querySelector("[data-add-item-custom]").click();
    const opened = !slot.querySelector("[data-add-item-formwrap]").hidden && slot.querySelector("[data-add-item-pop]").hidden;
    const f = slot.querySelector("[data-item-form]");
    f.querySelector("[data-item-name]").value = "Lucky Coin";
    const ty = f.querySelector("[data-item-type]"); ty.value = "gear"; ty.dispatchEvent(new Event("change", { bubbles: true }));
    f.querySelector("[data-item-weight]").value = "0.1";
    f.querySelector("[data-item-add]").click();
    await wait(50);
    const it = (A.doc().character.items || [])[0] || {};
    const folded = slot.querySelector("[data-add-item-formwrap]").hidden;
    slot.querySelector("[data-add-item-custom]").click();
    slot.querySelector("[data-add-item-close]").click();
    return { opened, name: it.name, type: it.type, weight: it.weight, playerAdded: !!it.playerAdded, folded, closeBtn: slot.querySelector("[data-add-item-formwrap]").hidden };
  });
  check("custom.opensFromMenu", custom.opened, JSON.stringify(custom));
  check("custom.adds", custom.name === "Lucky Coin" && custom.type === "gear" && custom.weight === 0.1 && custom.playerAdded, JSON.stringify(custom));
  check("custom.foldsAway", custom.folded && custom.closeBtn);

  /* weapon custom fields still toggle inside the custom form */
  check("custom.weaponFields", await pg.evaluate(() => { const slot = document.querySelector("#itemFormSlot"); slot.querySelector("[data-add-item-custom]").click(); const f = slot.querySelector("[data-item-form]"); const ty = f.querySelector("[data-item-type]"); ty.value = "weapon"; ty.dispatchEvent(new Event("change", { bubbles: true })); const shown = !f.querySelector("[data-item-weapon-fields]").hidden; ty.value = "gear"; ty.dispatchEvent(new Event("change", { bubbles: true })); slot.querySelector("[data-add-item-close]").click(); return shown; }));

  /* locked inventory disables the menu; unlocking re-enables */
  const lock = await pg.evaluate(async () => {
    const A = window.SSDNSApp, I = window.SSDNSItems;
    A.applyPatch((d) => { d.character.inventoryLocked = true; }); I.paintSheet();
    const t = document.querySelector("[data-add-item-toggle]");
    const off = t.disabled;
    A.applyPatch((d) => { d.character.inventoryLocked = false; }); I.paintSheet();
    return { off, on: !t.disabled };
  });
  check("lock.disables", lock.off && lock.on, JSON.stringify(lock));

  /* one flag hides the whole thing (not set now) */
  const flag = await pg.evaluate(() => {
    const I = window.SSDNSItems, slot = document.querySelector("#itemFormSlot");
    const def = I.playerFreeAdd();
    window.SSDNS_PLAYER_FREE_ADD = false; I.paintSheet();
    const hidden = !slot.querySelector("[data-add-item-menu]") && !slot.querySelector("[data-item-form]");
    delete window.SSDNS_PLAYER_FREE_ADD; I.paintSheet();
    return { def, hidden, back: !!slot.querySelector("[data-add-item-menu]") };
  });
  check("flag.defaultOn", flag.def && flag.back);
  check("flag.hides", flag.hidden);
  check("sheet.noPageErrors", errs.length === 0, errs.join(" | "));

  /* phone 390px: the menu fits */
  const ph = await browser.newPage();
  const perrs = [];
  ph.on("pageerror", (e) => perrs.push(String(e)));
  await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await openSheet(ph);
  await ph.evaluate(() => document.querySelector("[data-add-item-toggle]").scrollIntoView({ block: "center" }));
  await ph.tap("[data-add-item-toggle]");
  await sleep(200);
  const pb = await ph.evaluate(() => { const r = document.querySelector("[data-add-item-pop]").getBoundingClientRect(); const b = document.querySelector("[data-add-item-pick]").getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth, pickH: b.height, shown: !document.querySelector("[data-add-item-pop]").hidden }; });
  check("phone.fits", pb.shown && pb.l >= 0 && pb.r <= pb.vw, JSON.stringify(pb));
  check("phone.touchTargets", pb.pickH >= 44, JSON.stringify(pb));
  check("phone.noPageErrors", perrs.length === 0, perrs.join(" | "));

  /* DMCC Give item: still the full always-open DM form, no player menu */
  const dm = await browser.newPage();
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.goto(ORIGIN + "/dm/index.html?demo=1", { waitUntil: "domcontentloaded" });
  await dm.waitForFunction(() => window.DMCC && document.querySelector("#btnLoadDemo"), { timeout: 20000 });
  await dm.evaluate(() => document.querySelector("#btnLoadDemo").click());
  await dm.waitForFunction(() => window.DMCC.state.demo && document.querySelector("#dmItemForm [data-item-form]"), { timeout: 20000 });
  const give = await dm.evaluate(() => { const s = document.querySelector("#dmItemForm"); return { form: !!s.querySelector("[data-item-form]"), give: /Give item/.test((s.querySelector("[data-item-add]") || {}).textContent || ""), save: !!s.querySelector("[data-item-catalog-save]"), menu: !!document.querySelector("[data-add-item-menu]"), quest: !!s.querySelector('[data-item-type] option[value="quest"]') }; });
  check("dmcc.giveFormUnchanged", give.form && give.give && give.save && give.quest && !give.menu, JSON.stringify(give));
  check("dmcc.noPageErrors", dmErrs.length === 0, dmErrs.join(" | "));
} finally {
  await browser.close();
}
if (failures.length) { console.log("\n" + failures.length + " failed: " + failures.join(", ")); process.exit(1); }
console.log("\nall add-item menu checks passed");

/**
 * 0.3.84 / DMCC 0.2.97: default UI by type (Jessey 2026-10-20). Any item, from the catalog, the store, the Give tab,
 * the DM Add Item form or a reward, lands with the existing card for its type and feeds the sheet math:
 * firearm → gun card, bow / crossbow / blowpipe / sling → their gun-slot cards, melee / thrown → melee card,
 * armor / shield → AC, apparel → paper doll, food / water → supplies numbers, tools → uses, ammo → Ammo pool,
 * packs → Unpack, anything else → a generic row with weight. Also: Special UI hook (SSDNSItemUI.register / on),
 * typed Give-tab / drawer builder (type + weight required), Give-tab ammo → pool and Dirty guns (C11).
 * Needs the static server (ssdns-test-all starts it on 127.0.0.1:8765) and Chrome.
 *   node tools/test-typeui.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dmccUrl, dmccOffline } from "./dmcc-offline.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = process.env.SSDNS_ORIGIN || "http://127.0.0.1:8765";
const SHOTS = process.env.SSDNS_SHOTS || "";
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* static wiring */
{
  check("wire.sheetScript", /assets\/js\/item-ui\.js\?v=/.test(read("index.html")));
  check("wire.dmScript", /\.\.\/assets\/js\/item-ui\.js\?v=/.test(read("dm/index.html")));
  check("wire.giveBuilder", /id="rewItemBuilder"/.test(read("dm/index.html")) && /typedGive\(/.test(read("dm/assets/js/dmcc.js")) && /typedGive\(/.test(read("dm/assets/js/v2.js")));
  check("wire.cardHook", /SSDNSItemUI\.decorate\(card, \{ card: "gun"/.test(read("assets/js/trackers.js")) && /SSDNSItemUI\.decorate\(card, \{ card: "melee"/.test(read("assets/js/trackers.js")));
  check("wire.schemaDoc", /Special UI/.test(read("docs/SCHEMA.md")) && /itemKind/.test(read("docs/SCHEMA.md")));
}

const puppeteer = (await import("/tmp/pup/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js")).default;
const browser = await puppeteer.launch({ executablePath: "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
async function openSheet(page) {
  await page.goto(ORIGIN + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.SSDNSApp && window.SSDNSApp.applyPatch && window.SSDNSItems && window.SSDNSItemUI && document.querySelector("#tab-equip"), { timeout: 20000 });
  await page.evaluate(() => {
    window.SSDNSApp.applyPatch((d) => { d.character.abilities.DEX = 14; d.character.abilities.STR = 12; d.character.armor = ""; d.character.shield = false; d.character.items = []; d.character.ammo = []; });
    document.querySelector("#tab-equip").click();
  });
  await sleep(300);
}
try {
  const pg = await browser.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e)));
  await pg.setViewport({ width: 1440, height: 1000 });
  await openSheet(pg);

  /* 1) classify: catalog rows and rules weapons pick the closest default UI */
  const cls = await pg.evaluate(() => {
    const UI = window.SSDNSItemUI, I = window.SSDNSItems;
    const row = (id) => UI.classify(I.instanceFrom({ catalogId: id }));
    const w = (id) => UI.classify({ type: "weapon", weaponId: id, name: id });
    return {
      hardtack: row("hardtack-jerky-1-day"), canteen: row("waterskin-canteen"), trail: row("trail-kit"), horse: row("riding-horse-cow-pony"),
      tools: row("gunsmith-s-tools"), hat: row("hat-of-the-sharpshooter"), tomahawk: row("lightning-tomahawk"), henry: row("old-henrys-rifle"),
      libation: row("assay-tonic-trail-draught"), dynamite: row("dynamite-stick-standard-fuse"), clothes: row("common-clothes-trail-wear"),
      shortbow: w("shortbow"), sling: w("sling"), blowpipe: w("blowpipe-blowgun"), xbow: w("light-crossbow"), knife: w("throwing-knife-dart"),
      bowie: w("bowie-shortsword"), chaos: w("pony-arms-chaosmaker-light"), unknown: UI.classify({ name: "Pocket watch", type: "gear" })
    };
  });
  const want = { hardtack: "food", canteen: "water", trail: "pack", horse: "mount", tools: "tool", hat: "apparel", tomahawk: "melee", henry: "firearm",
    libation: "consumable", dynamite: "explosive", clothes: "gear", shortbow: "bow", sling: "sling", blowpipe: "blowpipe", xbow: "crossbow", knife: "thrown",
    bowie: "melee", chaos: "firearm", unknown: "gear" };
  Object.keys(want).forEach((k) => check("classify." + k, cls[k] === want[k], k + " → " + cls[k] + " (want " + want[k] + ")"));

  /* 2) DM-made items land with their card and feed the math */
  const land = await pg.evaluate(async () => {
    const I = window.SSDNSItems, A = window.SSDNSApp;
    const out = {};
    const add = (raw) => { let r; A.applyPatch((d) => { r = I.add(d.character, raw, { dm: true }); }); return r; };
    const c = () => A.state ? A.state().character : (window.SSDNSApp.doc ? window.SSDNSApp.doc().character : null);
    const acBefore = A.compute().ac;
    out.gun = add({ id: "custom-trail-iron", name: "Trail Iron", type: "weapon", weight: 2.5, dirty: true, effect: { kind: "attack", damage: "1d8" },
      weapon: { kind: "firearm", group: "pistol", damage: "1d8", dmgType: "piercing", range: "20/60", caliber: ".44 Trail", capacity: 6, misfire: "1", load: "cartridge" } });
    out.bow = add({ id: "custom-ash-bow", name: "Ash Bow", type: "weapon", weight: 2, effect: { kind: "attack", damage: "1d6" }, weapon: { kind: "bow", ability: "DEX", damage: "1d6", dmgType: "piercing", range: "80/320" } });
    out.xbow = add({ id: "custom-pin-crossbow", name: "Pin Crossbow", type: "weapon", weight: 4, effect: { kind: "attack", damage: "1d8" }, weapon: { kind: "crossbow", ability: "DEX", damage: "1d8", dmgType: "piercing", range: "60/240" } });
    out.melee = add({ id: "custom-railroad-spike", name: "Railroad Spike", type: "weapon", weight: 1, effect: { kind: "attack", damage: "1d4" }, weapon: { kind: "melee", damage: "1d4", dmgType: "piercing" } });
    out.armor = add({ id: "custom-cattle-hide", name: "Cattle-hide Vest", type: "gear", itemKind: "armor", armorId: "studded-vest", wear: "armor", bonuses: { ac: 1 }, weight: 13, effect: { kind: "text", text: "Studded vest +1" } });
    out.shield = add({ id: "custom-stove-lid", name: "Stove-lid Shield", type: "gear", itemKind: "shield", wear: "shield", weight: 6, effect: { kind: "text", text: "Shield" } });
    out.hat = add({ id: "custom-lucky-hat", name: "Lucky Hat", type: "gear", itemKind: "apparel", wear: "head", bonuses: { rangedAtk: 1 }, weight: 1, effect: { kind: "text", text: "+1 ranged" } });
    out.food = add({ id: "custom-smoked-trout", name: "Smoked Trout", type: "consumable", itemKind: "food", tags: ["food"], meals: 1, weight: 1, uses: { max: 1 }, effect: { kind: "text", text: "A day of food" } });
    out.tool = add({ id: "custom-farrier-kit", name: "Farrier Kit", type: "gear", itemKind: "tool", shelf: "Tools", weight: 6, uses: { max: 3, recharge: "long" }, effect: { kind: "text", text: "Shoe a horse" } });
    out.ammo = add({ id: "custom-bolts", name: "Iron bolts (20)", type: "gear", itemKind: "ammo", ammo: { type: "bolts", caliber: "", per: 20 }, weight: 1.5, effect: { kind: "text", text: "bolts" } });
    out.pack = add({ id: "custom-grub-sack", name: "Grub Sack", type: "gear", itemKind: "pack", contents: [["hardtack-jerky-1-day", 2]], weight: 4, effect: { kind: "text", text: "food" } });
    out.watch = add({ id: "custom-pocket-watch", name: "Pocket Watch", type: "gear", weight: 0.5, effect: { kind: "text", text: "Ticks" } });
    await new Promise((r) => setTimeout(r, 400));
    const ch = window.SSDNSApp.character ? window.SSDNSApp.character() : null;
    return { out: JSON.parse(JSON.stringify(out, (k, v) => (k === "item" ? (v && v.name) : v))), acBefore, acAfter: A.compute().ac };
  });
  const st = await pg.evaluate(() => {
    const d = JSON.parse(JSON.stringify(window.SSDNSApp.doc ? window.SSDNSApp.doc() : {}));
    return d;
  }).catch(() => null);
  const ch = await pg.evaluate(() => {
    let c = null;
    window.SSDNSApp.applyPatch((d) => { c = JSON.parse(JSON.stringify(d.character)); });
    return c;
  });
  const gunIx = ch.guns.findIndex((g) => g && g.weapon === "custom-trail-iron");
  check("land.gun.slot", gunIx >= 0, JSON.stringify(ch.guns.map((g) => g && g.weapon)));
  check("land.gun.dirty", gunIx >= 0 && ch.guns[gunIx].dirty === true);
  check("land.bow.gunSlot", ch.guns.some((g) => g && g.weapon === "custom-ash-bow") && !ch.melee.some((m) => m && m.weapon === "custom-ash-bow"));
  check("land.crossbow.gunSlot", ch.guns.some((g) => g && g.weapon === "custom-pin-crossbow"));
  check("land.melee.meleeSlot", ch.melee.some((m) => m && m.weapon === "custom-railroad-spike"));
  check("land.armor.ac", ch.armor === "studded-vest" && land.acAfter === land.acBefore + 2 + 1 + 2, "armor " + ch.armor + " ac " + land.acBefore + " → " + land.acAfter + " (want +5: studded 12+2 vs 10+2, +1 magic, +2 shield)");
  check("land.shield.on", ch.shield === true);
  const hat = ch.items.find((i) => i.name === "Lucky Hat");
  check("land.apparel.doll", hat && hat.equipSlot === "hat", JSON.stringify(hat && hat.equipSlot));
  check("land.ammo.pool", ch.ammo.some((a) => a.type === "bolts" && Number(a.count) === 20) && !ch.items.some((i) => i.name === "Iron bolts (20)"));
  check("land.food.meals", ch.items.some((i) => i.name === "Smoked Trout" && i.meals === 1 && (i.tags || []).includes("food")));

  /* the cards */
  const cards = await pg.evaluate(() => {
    window.SSDNSApp.applyPatch(() => {});
    if (window.SSDNSTrackers && window.SSDNSTrackers.paint) window.SSDNSTrackers.paint();
    const c = (() => { let x; window.SSDNSApp.applyPatch((d) => { x = d.character; }); return x; })();
    const gi = (id) => c.guns.findIndex((g) => g && g.weapon === id);
    const card = (i) => document.querySelector('.gun[data-row="' + i + '"]');
    const gunCard = card(gi("custom-trail-iron"));
    const bowCard = card(gi("custom-ash-bow"));
    const xCard = card(gi("custom-pin-crossbow"));
    const rows = [...document.querySelectorAll("#itemList .item-row")].map((r) => ({ t: r.textContent, home: r.querySelector("[data-item-home]") && r.querySelector("[data-item-home]").getAttribute("data-item-home"), sup: r.querySelector("[data-item-supply]") && r.querySelector("[data-item-supply]").textContent, unpack: !!r.querySelector("[data-item-unpack]") }));
    return {
      gunChamber: !!(gunCard && gunCard.querySelector(".g-chamber-row, .chamber-sel")), gunMis: !!(gunCard && gunCard.querySelector(".g-mis") && !gunCard.querySelector(".g-mis").hidden),
      bowQuiver: !!(bowCard && bowCard.querySelector(".trk-quiver")), xLoaded: !!(xCard && xCard.querySelector(".trk-slot-gun") && xCard.querySelector(".trk-slot-gun").textContent.trim()),
      xMisHidden: !!(xCard && xCard.querySelector(".g-mis") && xCard.querySelector(".g-mis").hidden),
      meleeCard: [...document.querySelectorAll("#meleeBox .melee-card select")].some((s) => s.value === "custom-railroad-spike"),
      rows
    };
  });
  check("card.gun.chambers", cards.gunChamber && cards.gunMis, JSON.stringify(cards));
  check("card.bow.quiver", cards.bowQuiver);
  check("card.crossbow.loaded", cards.xLoaded && cards.xMisHidden);
  check("card.melee", cards.meleeCard);
  const r = (n) => cards.rows.find((x) => x.t.indexOf(n) >= 0) || {};
  check("row.food.supplies", r("Smoked Trout").home === "food" && /1 meal/.test(r("Smoked Trout").sup || ""), JSON.stringify(r("Smoked Trout")));
  check("row.armor.ac", r("Cattle-hide Vest").home === "armor" && /AC 12/.test(r("Cattle-hide Vest").sup || ""), JSON.stringify(r("Cattle-hide Vest")));
  check("row.tool.uses", r("Farrier Kit").home === "tool" && /3\/3/.test(r("Farrier Kit").t), JSON.stringify(r("Farrier Kit")));
  check("row.pack.unpack", r("Grub Sack").home === "pack" && r("Grub Sack").unpack);
  check("row.generic.weight", r("Pocket Watch").home === "gear" && /0\.5 lb/.test(r("Pocket Watch").t), JSON.stringify(r("Pocket Watch")));

  /* weight: the donned armor and shield count once (slot), not twice */
  const wt = await pg.evaluate(() => { let c; window.SSDNSApp.applyPatch((d) => { c = d.character; }); return window.SSDNSItems.weightReport(c); });
  check("weight.armorOnce", wt.slots.armor === 13 + 6 && wt.items === 22, JSON.stringify(wt)); /* items: 2.5+2+4+1+1+1+6+4+0.5; armor 13 + shield 6 via the slot */

  /* taking the shield off clears character.shield; the unpack lands the contents */
  const off = await pg.evaluate(() => {
    let c; window.SSDNSApp.applyPatch((d) => { c = d.character; const s = c.items.find((i) => i.name === "Stove-lid Shield"); window.SSDNSDoll.toggleWear(c, s.uid); });
    let c2; window.SSDNSApp.applyPatch((d) => { c2 = d.character; const p = c2.items.find((i) => i.name === "Grub Sack"); window.SSDNSItems.unpack(c2, p.uid, { dm: true }); });
    return { shield: c2.shield, hard: (c2.items.find((i) => i.catalogId === "hardtack-jerky-1-day") || {}).count };
  });
  check("shield.off", off.shield === false);
  check("pack.unpack.contents", off.hard === 2, JSON.stringify(off));

  /* 3) Special UI hook: extend one gun's card, and a per-card hook sees the bow card */
  const hook = await pg.evaluate(async () => {
    let quiverSeen = 0;
    window.SSDNSItemUI.register("custom-trail-iron", { extend: (host) => { host.innerHTML = '<button type="button" class="btn xs" data-special-ctrl>Special</button>'; } });
    window.SSDNSItemUI.on("quiver", () => { quiverSeen++; });
    window.SSDNSTrackers.paint();
    await new Promise((r) => setTimeout(r, 100));
    const extras = [...document.querySelectorAll(".gun .itemui-extra [data-special-ctrl]")].length;
    window.SSDNSItemUI.unregister("custom-trail-iron");
    window.SSDNSTrackers.paint();
    return { extras, quiverSeen, after: document.querySelectorAll(".gun .itemui-extra").length };
  });
  check("hook.extendOneCard", hook.extras === 1, JSON.stringify(hook));
  check("hook.quiverHook", hook.quiverSeen >= 1);
  check("hook.cleanup", hook.after === 0);

  if (SHOTS) {
    const shot = async (sel, file) => {
      const el = await pg.$(sel);
      if (el) { await el.evaluate((n) => n.scrollIntoView({ block: "center" })); await sleep(150); await el.screenshot({ path: path.join(SHOTS, file) }); }
    };
    const gi = await pg.evaluate(() => { let c; window.SSDNSApp.applyPatch((d) => { c = d.character; }); return { gun: c.guns.findIndex((g) => g && g.weapon === "custom-trail-iron"), bow: c.guns.findIndex((g) => g && g.weapon === "custom-ash-bow") }; });
    await shot('.gun[data-row="' + gi.gun + '"]', "typeui-gun.png");
    await shot('.gun[data-row="' + gi.bow + '"]', "typeui-bow.png");
    await shot("#meleeBox", "typeui-melee.png");
  }

  /* 4) the Add Item form: kind picker shows the kind's fields, presets, and needs a weight */
  const form = await pg.evaluate(() => {
    const host = document.createElement("div");
    host.id = "typeuiFormHost";
    host.innerHTML = window.SSDNSItems.formHtml({ dm: false });
    document.body.appendChild(host);
    const f = host.querySelector("[data-item-form]");
    const kind = f.querySelector("[data-item-kind]");
    kind.value = "armor";
    window.SSDNSItems.applyKind(f);
    const armorShown = !f.querySelector('[data-item-kind-fields="armor"]').hidden;
    const weight = f.querySelector("[data-item-weight]").value;
    f.querySelector("[data-item-armor]").value = "mail-duster";
    const made = window.SSDNSItems.readForm(f);
    f.querySelector("[data-item-weight]").value = "";
    const missing = window.SSDNSItems.weightMissing(f);
    kind.value = "crossbow";
    window.SSDNSItems.applyKind(f);
    const wk = f.querySelector("[data-item-wkind]").value, wf = !f.querySelector("[data-item-weapon-fields]").hidden;
    host.remove();
    return { armorShown, weight, armorId: made.armorId, kind: made.itemKind, wear: made.wear, missing, wk, wf };
  });
  check("form.armorFields", form.armorShown && form.weight !== "" && form.kind === "armor" && form.wear === "armor", JSON.stringify(form));
  check("form.armorId", form.armorId === "mail-duster");
  check("form.weightRequired", form.missing === true);
  check("form.crossbowPreset", form.wk === "crossbow" && form.wf);

  /* 5) rewards on the player side: typed item, ammo text (C11), Dirty gun, undo by grant id */
  const rew = await pg.evaluate(async () => {
    const J = window.SSDNSDmJoin;
    if (!J || !J._handle) return { noHook: true };
    J._handle({ id: "t1", type: "reward_item", payload: { text: "Silver Spurs", grantId: "g-spurs", qty: 1, item: { id: "custom-silver-spurs", name: "Silver Spurs", type: "gear", itemKind: "apparel", wear: "boots", weight: 1, bonuses: { speed: 5 }, effect: { kind: "text", text: "Jingle" } } } });
    J._handle({ id: "t2", type: "reward_item", payload: { text: "2x Arrows (20)", grantId: "g-arrows" } });
    J._handle({ id: "t3", type: "reward_item", payload: { text: "Sling stones (20)", grantId: "g-stones", ammo: { type: "stones", caliber: "", qty: 20 } } });
    J._handle({ id: "t4", type: "reward_item", payload: { text: "Pony Arms ChaosMaker (Light)", id: "pony-arms-chaosmaker-light", grantId: "g-gun", dirty: true } });
    await new Promise((r) => setTimeout(r, 300));
    let c; window.SSDNSApp.applyPatch((d) => { c = JSON.parse(JSON.stringify(d.character)); });
    const spurs = c.items.find((i) => i.name === "Silver Spurs");
    const res = { spurs: spurs && { slot: spurs.equipSlot, w: spurs.weight }, arrows: (c.ammo.find((a) => a.type === "arrows" && !a.caliber) || {}).count,
      stones: (c.ammo.find((a) => a.type === "stones") || {}).count, gun: (c.guns.find((g) => g && g.weapon === "pony-arms-chaosmaker-light") || {}).dirty,
      textLine: /Arrows|Silver Spurs/.test(c.equipment || "") };
    J._handle({ id: "t5", type: "undo_item", payload: { text: "Silver Spurs", grantId: "g-spurs" } });
    await new Promise((r) => setTimeout(r, 200));
    window.SSDNSApp.applyPatch((d) => { res.undone = !d.character.items.some((i) => i.name === "Silver Spurs"); });
    return res;
  });
  check("reward.hook", !rew.noHook);
  check("reward.typedItem", rew.spurs && rew.spurs.slot === "boots" && rew.spurs.w === 1, JSON.stringify(rew));
  check("reward.ammoText", rew.arrows === 40, JSON.stringify(rew));
  check("reward.ammoPayload", rew.stones === 20);
  check("reward.dirtyGun", rew.gun === true);
  check("reward.noTextLine", rew.textLine === false);
  check("reward.undoTyped", rew.undone === true);

  /* #105 + #107 merge: Give-tab typed Big Fifty ammo → Big Fifty pool (C1); a Food & water reward carries its weight */
  const b50 = await pg.evaluate(async () => {
    const J = window.SSDNSDmJoin;
    window.SSDNSApp.applyPatch((d) => { d.character.ammo = []; d.character.items = []; });
    J._handle({ id: "t6", type: "reward_item", payload: { text: "Big Fifty cartridges, .50-90 (10)", grantId: "g-b50a", ammo: { type: "bigfifty", caliber: ".50-90", qty: 10 } } });
    J._handle({ id: "t7", type: "reward_item", payload: { text: "2x Big Fifty cartridges, .50-90 (10)", grantId: "g-b50b" } });
    J._handle({ id: "t8", type: "reward_item", payload: { text: "Deer haunch", grantId: "g-deer", qty: 1, supply: { tags: ["food"], meals: 6, weight: 40 } } });
    await new Promise((r) => setTimeout(r, 300));
    let c; window.SSDNSApp.applyPatch((d) => { c = JSON.parse(JSON.stringify(d.character)); });
    const pools = c.ammo.filter((a) => a.type === "bigfifty");
    const deer = c.items.find((i) => i.name === "Deer haunch");
    return { pools: pools.map((p) => [p.caliber, p.count]), cart: c.ammo.filter((a) => a.type === "cartridge").length, deer: deer && { w: deer.weight, meals: deer.meals, tags: deer.tags } };
  });
  check("reward.bigFiftyPool", b50.pools.length === 1 && b50.pools[0][0] === ".50-90" && b50.pools[0][1] === 30 && b50.cart === 0, JSON.stringify(b50));
  check("reward.supplyWeight", b50.deer && b50.deer.w === 40 && b50.deer.meals === 6 && b50.deer.tags.includes("food"), JSON.stringify(b50));

  if (SHOTS) {
    await pg.evaluate(() => { window.SSDNSItems.paintSheet(); });
    await sleep(200);
    await shot2(pg, "#itemList", "typeui-items.png");
    await pg.evaluate(() => { const t = document.querySelector("#tab-main"); if (t) t.click(); });
    await sleep(300);
    await shot2(pg, ".shield-box", "typeui-armor-ac.png");
    await pg.evaluate(() => { document.querySelector("#tab-equip").click(); });
  }
  check("sheet.noErrors", errs.length === 0, errs.slice(0, 3).join(" | "));

  /* 6) DMCC Give tab: free text → typed builder (type + weight), ammo text → pool payload */
  const dm = await browser.newPage();
  const dmErrs = [];
  dm.on("pageerror", (e) => dmErrs.push(String(e)));
  await dm.setViewport({ width: 1440, height: 1100 });
  await dm.goto(ORIGIN + dmccUrl("/dm/index.html"), { waitUntil: "domcontentloaded" });
  await dmccOffline(dm); /* never the live ssdns-dm-hub database */
  await dm.waitForFunction(() => window.SSDNSItems && document.querySelector("#rewType") && document.querySelector("#rewItemBuilder"), { timeout: 20000 });
  await sleep(800);
  await dm.evaluate(() => { const d = document.querySelector("#btnLoadDemo"); if (d) d.click(); });
  await sleep(1200);
  await dm.evaluate(() => { const t = document.querySelector("#tab-rewards"); if (t) t.click(); });
  await sleep(300);
  const give = await dm.evaluate(() => {
    const type = document.querySelector("#rewType");
    type.value = "item"; type.dispatchEvent(new Event("change", { bubbles: true }));
    const text = document.querySelector("#rewText");
    const set = (v) => { text.value = v; text.dispatchEvent(new Event("input", { bubbles: true })); };
    set("Arrows (20)");
    const ammoMsg = document.querySelector("#rewMatch").textContent, ammoHidden = document.querySelector("#rewItemBuilder").hidden;
    set("Henrietta Repeating Rifle");
    const gunDirty = !document.querySelector("#rewDirtyWrap").hidden;
    set("Grandpa's Canteen");
    const b = document.querySelector("#rewItemBuilder");
    const shown = !b.hidden;
    const f = b.querySelector("[data-item-form]");
    const k = f.querySelector("[data-item-kind]");
    k.value = "water"; k.dispatchEvent(new Event("change", { bubbles: true }));
    const supShown = !f.querySelector('[data-item-kind-fields="food water pack"]').hidden;
    f.querySelector("[data-item-capacity]").value = "0.5";
    const folded = f.querySelector("[data-item-spell]").closest("label").hidden && f.querySelector("[data-item-dice]").closest("label").hidden && !f.querySelector("[data-item-weight]").closest("label").hidden;
    return { ammoMsg, ammoHidden, gunDirty, shown, supShown, folded, compact: !f.querySelector("[data-item-add]") && !f.querySelector("[data-item-name]") };
  });
  check("give.ammoMatch", /Ammo pool/.test(give.ammoMsg) && give.ammoHidden, JSON.stringify(give));
  check("give.gunDirtyOption", give.gunDirty);
  check("give.builderForFreeText", give.shown && give.supShown && give.compact);
  check("give.foldsUnusedFields", give.folded);
  if (SHOTS) {
    await dm.evaluate(() => { const b = document.querySelector("#rewItemBuilder [data-item-weight]"); if (b) b.value = "5"; });
    await shot2(dm, "#panel-rewards .form-grid", "typeui-give-builder.png");
  }
  const nw = await dm.evaluate(() => {
    const ex = window.SSDNSItems.typedGive({ text: document.querySelector("#rewText"), match: document.querySelector("#rewMatch"), builder: document.querySelector("#rewItemBuilder"), dirty: document.querySelector("#rewDirtyWrap") });
    document.querySelector("#rewItemBuilder [data-item-weight]").value = "";
    const a = ex.extra("Grandpa's Canteen", 1);
    document.querySelector("#rewItemBuilder [data-item-weight]").value = "5";
    const b = ex.extra("Grandpa's Canteen", 1);
    const am = ex.extra("Arrows (20)", 3);
    return { a, b, am };
  });
  check("give.weightRequired", !!nw.a.error && /weight/i.test(nw.a.error), JSON.stringify(nw.a));
  check("give.typedPayload", nw.b.item && nw.b.item.itemKind === "water" && nw.b.item.weight === 5 && nw.b.item.capacity === 0.5 && nw.b.item.name === "Grandpa's Canteen" && nw.b.item.effect.kind === "text", JSON.stringify(nw.b));
  check("give.ammoPayload", nw.am.ammo && nw.am.ammo.type === "arrows" && nw.am.ammo.qty === 60, JSON.stringify(nw.am));
  const nw2 = await dm.evaluate(() => {
    const ex = window.SSDNSItems.typedGive({ text: document.querySelector("#rewText"), match: document.querySelector("#rewMatch"), builder: document.querySelector("#rewItemBuilder"), dirty: document.querySelector("#rewDirtyWrap") });
    const b50 = ex.extra("Big Fifty cartridges, .50-90 (10)", 2);
    const set = (id, v) => { document.getElementById(id).value = v; };
    set("rewMeals", "6"); set("rewTags", "food"); set("rewWeight", "");
    const noW = window.__ssdnsRewardPayload("item", "Deer haunch", "g-d1", 1);
    set("rewWeight", "40");
    const withW = window.__ssdnsRewardPayload("item", "Deer haunch", "g-d2", 1);
    ["rewMeals", "rewTags", "rewWeight"].forEach((id) => set(id, ""));
    return { b50, noW: noW.supply, withW: withW.supply, weightBox: !!document.querySelector("#rewSupplyWrap #rewWeight") };
  });
  check("give.bigFiftyPayload", nw2.b50.ammo && nw2.b50.ammo.type === "bigfifty" && nw2.b50.ammo.caliber === ".50-90" && nw2.b50.ammo.qty === 20, JSON.stringify(nw2.b50));
  check("give.supplyWeightField", nw2.weightBox && nw2.noW && nw2.noW.weight === undefined && nw2.withW && nw2.withW.weight === 40 && nw2.withW.meals === 6, JSON.stringify(nw2));
  check("give.supplyNeedsWeight", /Enter its weight in lb/.test(read("dm/assets/js/dmcc.js")));
  check("dm.noErrors", dmErrs.length === 0, dmErrs.slice(0, 3).join(" | "));
} catch (e) {
  failures.push("exception");
  console.log("FAIL  exception — " + (e && e.stack || e));
} finally {
  await browser.close();
}
async function shot2(page, sel, file) {
  const el = await page.$(sel);
  if (!el) { console.log("(no element for " + sel + ")"); return; }
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await sleep(150);
  await el.screenshot({ path: path.join(SHOTS, file) });
}
console.log(failures.length ? "\n" + failures.length + " failing: " + failures.join(", ") : "\nALL PASS");
process.exit(failures.length ? 1 : 0);

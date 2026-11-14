/**
 * Give tab search, portraits, and quantity stepper (sheet 0.3.312 / DMCC 0.2.325).
 * Same doPushReward command types. Loot still refuses.
 *   node tools/test-give-search-03288.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.312" && ver.dmcc === "0.2.325" && ver.sheetBuild === "sheet-playtest-v03312" && ver.dmccBuild === "dmcc-playtest-v02325");
check("rules.clean", !read("assets/data/rules.js").includes("giveCatalogSearch") && !read("database.rules.json").includes("giveCatalogSearch"));

const send = read("dm/assets/js/dmcc.js");
check("cmd.es", send.includes('type: "reward_es"'));
check("cmd.item", send.includes('type: type === "note" ? "reward_note" : "reward_item"'));
check("cmd.kit", send.includes("grantFullKit(pid"));
check("cmd.loot", send.includes('if (type === "loot")'));
check("cmd.ammo", send.includes("payload: { text: am.qty"));

const page = read("dm/index.html");
["es", "ammo", "item", "weapon", "kit", "note", "loot"].forEach((mode) => {
  check("chip." + mode, page.includes('data-give-mode="' + mode + '"'));
});
check("keep.reason", page.includes('id="rewReason"') && page.includes('data-give-show="es ammo item weapon"'));
check("keep.food", page.includes("It's food or water") && !page.includes('id="btnCustomItem"'));
check("keep.customRow", read("dm/assets/js/give-tab.js").includes("Create custom item"));
check("keep.step", page.includes('class="btn give-step-btn"') && page.includes('id="giveCatalogSearch"'));

const dom = new JSDOM(`<!doctype html><body>
<section id="panel-rewards">
  <div id="giveWho"></div>
  <p id="giveWhoCarry"></p>
  <select id="rewTarget"><option value="">Pick</option><option value="p1">Ada</option><option value="p2">Bea</option><option value="all">Everyone</option></select>
  <div class="give-types">
    <button type="button" class="btn sm give-chip" data-give-mode="es">Money (ES)</button>
    <button type="button" class="btn sm give-chip" data-give-mode="ammo">Ammo</button>
    <button type="button" class="btn sm give-chip" data-give-mode="item">Item</button>
    <button type="button" class="btn sm give-chip" data-give-mode="weapon">Weapon</button>
    <button type="button" class="btn sm give-chip" data-give-mode="kit">Starting kit</button>
    <button type="button" class="btn sm give-chip" data-give-mode="note">Note</button>
    <button type="button" class="btn sm give-chip" data-give-mode="loot">Loot</button>
  </div>
  <select id="rewType"><option value=""></option><option value="es">es</option><option value="ammo">ammo</option><option value="item">item</option><option value="weapon">weapon</option><option value="kit">kit</option><option value="note">note</option><option value="loot">loot</option></select>
  <div id="rewReasonWrap" data-give-show="es ammo item weapon"><input id="rewReason" value="Bounty"></div>
  <div id="giveItemMore" data-give-show="item" hidden><input id="giveSupplyOn"><button id="btnCustomItem">Custom item…</button></div>
  <div id="giveCatalogWrap">
    <input id="giveCatalogSearch" role="combobox">
    <button type="button" id="giveCatalogToggle">▼</button>
    <div id="giveCatalogHits" hidden></div>
  </div>
  <div id="dmItemFormWrap" hidden><div id="dmItemForm"><input data-item-name></div></div>
  <div id="rewItemWrap"><p id="rewMatch"></p><div id="rewItemBuilder"></div></div>
  <input id="rewText">
  <input id="rewQty" min="1" value="1">
  <button type="button" data-give-step="-1" data-give-for="rewQty">-</button>
  <button type="button" data-give-step="1" data-give-for="rewQty">+</button>
  <input id="giveAmmoQty" min="1" value="20">
  <select id="giveAmmo"><option value="cartridge|Light">Light</option></select>
  <input id="rewEs" value="25">
  <input id="giveWeapon" value="Bowie knife">
  <p id="givePreview" hidden></p>
  <button id="btnPushReward"></button>
</section>
</body>`, { url: "http://localhost/dm/", runScripts: "dangerously" });
const w = dom.window;
const catalog = [
  { id: "hardtack", name: "Hardtack", type: "consumable" },
  { id: "bowie-knife", name: "Bowie knife", type: "weapon" },
  { id: "waterskin", name: "Waterskin", type: "gear", shelf: "Drink" }
];
w.SSDNSItems = {
  catalog() { return catalog; },
  rewardMatch(text) {
    const row = catalog.filter((r) => r.name.toLowerCase() === String(text || "").trim().toLowerCase())[0];
    return row ? { kind: "gear", id: row.id } : null;
  }
};
w.DMCC = {
  state: {
    players: {
      p1: { snapshot: { name: "Ada Lovelace", es: 12, calling: "Marshal", portrait: "" }, presence: { online: true } },
      p2: { snapshot: { name: "Bea", es: 3, portrait: "https://example.invalid/missing-portrait.png" }, presence: { online: false } }
    }
  },
  playerOnline(p) { return !!(p && p.presence && p.presence.online); }
};
const script = w.document.createElement("script");
script.textContent = read("dm/assets/js/give-tab.js");
w.document.body.appendChild(script);
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
w.SSDNSGiveTab.paint();
const P = w.SSDNSGiveTab.pure;
check("pure.hits", P.catalogHits(catalog, "ha").map((r) => r.id).join(",") === "hardtack" && P.catalogHits(catalog, "h").length === 0);
check("pure.initial", P.initialOf("Ada Lovelace") === "AL" && P.initialOf("Bea") === "B");

const who = w.document.getElementById("giveWho");
check("face.initial", !!who.querySelector('[data-give-who="p1"] .give-initial') && who.querySelector('[data-give-who="p1"] .give-initial').textContent === "AL");
const broken = who.querySelector('[data-give-who="p2"]');
const brokenImg = broken.querySelector("img.give-face");
if (brokenImg) brokenImg.dispatchEvent(new w.Event("error"));
check("face.broken", !broken.querySelector("img") && broken.querySelector(".give-initial").textContent === "B");
who.querySelector('[data-give-who="p1"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
check("who.click", w.document.getElementById("rewTarget").value === "p1");

w.SSDNSGiveTab.setMode("item", true);
const chips = [...w.document.querySelectorAll("[data-give-mode]")].map((b) => b.getAttribute("data-give-mode"));
check("chips.stay", chips.join(",") === "es,ammo,item,weapon,kit,note,loot" && [...w.document.querySelectorAll("[data-give-mode]")].every((b) => !b.hidden), chips.join(","));
check("item.extras", w.document.getElementById("giveItemMore").hidden && !w.document.getElementById("rewReasonWrap").hidden);
const plus = w.document.querySelector('[data-give-step="1"][data-give-for="rewQty"]');
plus.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
plus.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
check("wired", w.document.getElementById("panel-rewards").getAttribute("data-give-tab") === "1");
check("stepper", w.document.getElementById("rewQty").value === "3", "qty=" + w.document.getElementById("rewQty").value);

const search = w.document.getElementById("giveCatalogSearch");
search.value = "bow";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
const hits = w.document.getElementById("giveCatalogHits");
check("search.filter", !hits.hidden && hits.textContent.indexOf("Bowie knife") >= 0 && hits.textContent.indexOf("Hardtack") < 0, hits.textContent);
hits.querySelector("[data-give-catalog]").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
check("search.pick", w.document.getElementById("rewText").value === "Bowie knife" && hits.hidden);
const itemPlan = w.SSDNSGiveTab.plan();
check("item.plan", itemPlan.what === "3 × Bowie knife" && !itemPlan.error, itemPlan.what);

search.value = "";
search.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
check("drop.open", !hits.hidden && hits.querySelectorAll("[data-give-catalog]").length === 3 && !hits.querySelector("[data-give-custom]"), hits.textContent);
check("drop.groups", ["Consumable", "Weapon", "Drink"].every((g) => hits.textContent.indexOf(g) >= 0), hits.textContent);
check("stepper.size", (page.match(/class="btn give-step-btn"/g) || []).length === 4 && read("dm/assets/css/dmcc.css").includes("width: 40px") && read("dm/assets/css/dmcc.css").includes("height: 40px"));
search.value = "har";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
check("drop.key", w.document.getElementById("rewText").value === "Hardtack" && hits.hidden, w.document.getElementById("rewText").value);
search.value = "lantern";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
check("drop.customRow", !!hits.querySelector("[data-give-custom]") && hits.textContent.indexOf("Create custom item: lantern") >= 0, hits.textContent);
search.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
check("drop.esc", hits.hidden);
search.value = "Lantern oil";
search.dispatchEvent(new w.Event("input", { bubbles: true }));
hits.querySelector("[data-give-custom]").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
check("custom.inline", !w.document.getElementById("dmItemFormWrap").hidden && w.document.querySelector("[data-item-name]").value === "Lantern oil" && w.document.getElementById("rewText").value === "Lantern oil");
check("custom.food", !w.document.getElementById("giveItemMore").hidden);
check("lands.hidden", w.document.getElementById("rewMatch").hidden);
w.document.body.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
search.value = "";
search.dispatchEvent(new w.FocusEvent("focusin", { bubbles: true }));
check("drop.outside", (w.document.body.dispatchEvent(new w.MouseEvent("click", { bubbles: true })) || true) && w.document.getElementById("giveCatalogHits").hidden);

w.SSDNSGiveTab.setMode("loot");
const loot = w.SSDNSGiveTab.plan();
check("loot.refuses", loot.error === "Use the Loot section" && loot.button === "Use the Loot section", loot.error);

w.SSDNSGiveTab.setMode("es");
const es = w.SSDNSGiveTab.plan();
check("mode.es", !es.error && es.es === 25, es.error || es.button);
w.SSDNSGiveTab.setMode("ammo");
const ammo = w.SSDNSGiveTab.plan();
check("mode.ammo", !ammo.error && ammo.ammo && ammo.ammo.type === "cartridge" && ammo.ammo.qty === 20, ammo.error || JSON.stringify(ammo.ammo));
w.SSDNSGiveTab.setMode("note");
w.document.getElementById("rewText").value = "A letter";
const note = w.SSDNSGiveTab.plan();
check("mode.note", !note.error && note.what === "a note", note.error);
w.SSDNSGiveTab.setMode("kit");
w.DMCC.state.players.p1.snapshot.callingId = "marshal";
const kit = w.SSDNSGiveTab.plan();
check("mode.kit", !kit.error && kit.what === "the Full kit", kit.error);

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\ngive search ok");
process.exit(0);

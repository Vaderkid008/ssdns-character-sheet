/**
 * PR71 polish: dice bar lock, paper doll in Gear (pickers, 9-slice, weapon art), lineage row,
 * modal borders, spell picker cards, instruments (DMCC payload, items, make focus),
 * weapon-art retry, cylinder round art by ammo type.
 *   node tools/test-pr71.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
const idx = read("index.html"), dmIdx = read("dm/index.html"), sheetCss = read("assets/css/sheet.css");

/* 1. dice bar */
const diceJs = read("assets/js/dice-art.js"), diceCss = read("assets/css/dice.css");
check("dice.locked96", /var LOCKED_PX = 96;/.test(diceJs) && /var px = LOCKED_PX;/.test(diceJs) && !/\? 96 : 168/.test(diceJs));
check("dice.wrapNoShrink", /\.dice-stage \{ flex-wrap: wrap;/.test(diceCss) && /\.dice-stage \.die-face \{ flex: none; \}/.test(diceCss));
check("dice.rye", /font-family: "Rye", "Smokum"/.test(diceCss) && /font-size: 26px/.test(diceCss));
check("dice.fontLink", /fonts\.googleapis\.com\/css2\?family=Rye/.test(idx) && /fonts\.googleapis\.com\/css2\?family=Rye/.test(dmIdx));
{
  const dom = new JSDOM("<!doctype html><body><div id='diceStage'></div></body>", { url: "http://127.0.0.1/index.html", runScripts: "dangerously" });
  dom.window.eval(diceJs);
  const DA = dom.window.SSDNSDice;
  const sizes = [1, 3, 7, 12].map((n) => {
    DA.show({ dice: Array.from({ length: n }, () => ({ sides: 6, face: 3 })), formula: n + "d6", total: 3 * n });
    return [...dom.window.document.querySelectorAll("#diceStage .die-face")].map((e) => e.style.width);
  });
  check("dice.faceSize", sizes.every((list) => list.length && list.every((w) => w === "96px")), JSON.stringify(sizes));
  check("dice.line", /12d6 = 36/.test(dom.window.document.querySelector(".dice-stage-line").textContent));
}

/* 2. paper doll */
const sandbox = { console, Date };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
sandbox.document = { readyState: "complete", getElementById: () => null, addEventListener: () => {}, querySelector: () => null };
vm.createContext(sandbox);
for (const f of ["assets/data/rules.js", "assets/data/item-catalog.js", "assets/js/items.js", "assets/js/equip.js", "assets/js/weapon-art.js", "assets/js/paper-doll.js", "assets/js/ammo-display.js"]) {
  vm.runInContext(read(f), sandbox, { filename: f });
}
const D = sandbox.SSDNSDoll, R = sandbox.SSDNS_RULES, Items = sandbox.SSDNSItems;
const pistol = R.firearms.find((f) => f.group === "pistol" && f.ammo === "percussion");
const pistol2 = R.firearms.find((f) => f.group === "pistol" && f.id !== pistol.id);
const rifle = R.firearms.find((f) => f.group !== "pistol" && f.group !== "shotgun");
const melee = R.melee[0];
const c = { guns: [{ weapon: pistol.id, equipped: true }, { weapon: pistol2.id, equipped: false }, { weapon: rifle.id }], melee: [{ weapon: melee.id }], items: [], armor: "", shield: false, holster: "" };
check("doll.idx.inGearCol", idx.indexOf('id="dollHost"') > idx.indexOf("gear-kit") && idx.indexOf('id="dollHost"') < idx.indexOf("<h3>Armor</h3>"));
check("doll.noMini", !/id="dollMini"/.test(idx) && !/doll-mini/.test(sheetCss));
const h = D.html(c, {});
check("doll.9slice", /doll-9/.test(h) && /border-image-source:url\([^)]*slot-256(-filled)?\.webp\)/.test(h) && !/slot-256x512/.test(h) && /\.doll-slot\.doll-9 \{[^}]*border-image-slice: 34 fill/.test(sheetCss));
check("doll.tallWide", /doll-tall[^>]*data-doll-slot="long_gun"/.test(h) && /doll-wide[^>]*data-doll-slot="focus_borrowed_iron"/.test(h));
check("doll.weaponArt", h.includes('data-doll-slot="revolver_1"') && /data-doll-slot="revolver_1"[^>]*>[^]*?<img class="doll-art"[^>]*src="assets\/img\/weapons\//.test(h), D.weaponArt(c, "revolver_1"));
check("doll.weaponArt.ballncap", /navy-army-ball-n-cap|ball/.test(D.weaponArt(c, "revolver_1")), D.weaponArt(c, "revolver_1"));
check("doll.weaponPicker", /data-doll-weapon="0"/.test(D.pickerHtml(c, "revolver_1")) && /data-doll-weapon="1"/.test(D.pickerHtml(c, "revolver_1")));
let r = D.setWeapon(c, "revolver_1", 1);
check("doll.setWeapon.equips", r.ok && c.guns[1].equipped === true && D.weaponName(c, "revolver_1") === pistol2.name, JSON.stringify(r));
r = D.setWeapon(c, "revolver_1", "");
check("doll.setWeapon.unequips", r.ok && c.guns[1].equipped === false);
check("doll.gearSync", (c.guns[0].equipped = false, D.weaponName(c, "revolver_1") === "" && D.weaponName(c, "revolver_2") === ""));
c.guns[0].equipped = true;
check("doll.meleePicker", /data-doll-weapon="0"/.test(D.pickerHtml(c, "melee")));
check("doll.armorPicker", /data-doll-armor/.test(D.pickerHtml(c, "vest")) && /data-doll-shield/.test(D.pickerHtml(c, "accessory_8")) && /data-doll-holster/.test(D.pickerHtml(c, "holster_l")));
const arm = R.armor.find((a) => a.category !== "shield");
c.armor = arm.id;
check("doll.armorSync", D.html(c, {}).includes(arm.name) && new RegExp('value="' + arm.id + '" selected').test(D.pickerHtml(c, "vest")));
/* 6. instruments */
const guitar = (R.storytellerGear.instruments || []).find((x) => /guitar/i.test(x.name)) || R.storytellerGear.instruments[1];
const fiddle = (R.storytellerGear.instruments || []).find((x) => x.id !== guitar.id && x.id !== "voice");
const ch = { calling: "hexslinger", instrument: fiddle.id, instrumentQuality: "cheap", items: [] };
Items.add(ch, { id: "instrument-" + guitar.id, name: guitar.name, type: "gear", tags: ["instrument:" + guitar.id], quality: "quality", description: "x", effect: { kind: "text", text: "x" } }, { dm: true });
check("inst.itemTagged", ch.items[0] && ch.items[0].tags[0] === "instrument:" + guitar.id && ch.items[0].quality === "quality");
check("inst.list", D.instruments(ch).length === 2 && D.instruments(ch)[0].focus);
check("inst.focusPicker", /data-doll-focus="/.test(D.pickerHtml(ch, "focus_borrowed_iron")));
r = D.makeFocus(ch, ch.items[0].uid);
check("inst.makeFocus", r.ok && ch.instrument === guitar.id && ch.instrumentQuality === "quality" && ch.items.length === 1 && D.instrumentId(ch.items[0]) === fiddle.id);
const dmJoin = read("assets/js/dm-join.js");
check("inst.routeTags", /tags: \["instrument:" \+ instId\]/.test(dmJoin) && /payload\.quality \|\| hit\.quality/.test(dmJoin));
const app = read("assets/js/app.js");
check("inst.card.anyCalling", /owned\.length > 0/.test(app) && /data-make-focus/.test(app) && /id="instrumentList"/.test(idx));
const dmcc = read("dm/assets/js/dmcc.js");
check("inst.dmccPayload", /function rewardPayload\(/.test(dmcc) && /payload\.instrument = hit\.id; payload\.quality/.test(dmcc) && /Demo: not sent to players/.test(dmcc));
{
  const fn = dmcc.slice(dmcc.indexOf("function rewardPayload("), dmcc.indexOf("if (typeof window !== \"undefined\") window.__ssdnsRewardPayload"));
  const rp = vm.runInContext(fn + "\n;rewardPayload", sandbox); /* #107 merge: the slice also holds rewardSupply() */
  const p = rp("item", "Quality " + guitar.name, "rew1", 1);
  check("inst.dmccPayload.run", p.kind === "instrument" && p.instrument === guitar.id && p.quality === "quality" && p.text && p.grantId === "rew1", JSON.stringify(p));
  const n = rp("note", "hello", "rew2", 1);
  check("inst.dmccPayload.note", !n.kind && n.text === "hello");
}

/* 3. lineage row */
check("lineage.row", /<\/div>\s*<p class="fine lineage-row" id="lineageCard"><\/p>/.test(idx) && /\.topgrid \.lineage-row \{ grid-column: 1 \/ -1;/.test(sheetCss));

/* 4. modal border */
const mb = read("assets/css/modal-border.css");
check("modal.css", /dialog\[open\]::after/.test(mb) && /outline: 1px solid rgba\(138, 106, 44/.test(mb) && /inset 0 0 14px 5px/.test(mb));
check("modal.linked", /modal-border\.css/.test(idx) && /\.\.\/assets\/css\/modal-border\.css/.test(dmIdx));

/* 5. spell picker */
const creator = read("assets/js/creator.js");
check("spells.grid", /spell-grid/.test(creator) && /spell-card-pick/.test(creator) && /spell-info/.test(creator) && /spell-counter/.test(creator) && /spell-info-strip/.test(creator));
check("spells.css", /\.spell-grid \{ display: grid;/.test(sheetCss) && /@media \(max-width: 520px\) \{ \.spell-grid \{ grid-template-columns: 1fr; \} \}/.test(sheetCss) && /\.spell-counter \{ position: sticky;/.test(sheetCss));

/* 7. weapon art retry */
{
  const dom = new JSDOM("<!doctype html><body><div class='g-photo' id='p'>Photo</div></body>", { url: "http://127.0.0.1/index.html", runScripts: "dangerously" });
  dom.window.eval(read("assets/js/weapon-art.js"));
  const box = dom.window.document.getElementById("p");
  dom.window.SSDNSWeaponArt.paint(box, { id: pistol.id, name: pistol.name });
  const img = box.querySelector("img");
  img.dispatchEvent(new dom.window.Event("error"));
  check("art.retry", box.querySelector("img") === img && /\?r=/.test(img.getAttribute("src")));
  img.dispatchEvent(new dom.window.Event("error"));
  check("art.retryOnce", !box.querySelector("img") && box.getAttribute("data-art-failed"));
}

/* 8. cylinder rounds */
const A = sandbox.SSDNSAmmoDisplay;
const cyl = A.html({ weapon: pistol.id, name: pistol.name, ammoDisplay: "cylinder", cap: 6, chambers: ["loaded", "loaded", "spent", "loaded", "loaded", "loaded"] });
check("rounds.ballncap", /rt-ball/.test(cyl) && /is-spent[^"]*rt-ball|rt-ball/.test(cyl), cyl.slice(0, 200));
const musket = R.firearms.find((f) => f.id === "dull-co-rifle-musket");
check("rounds.musketBall", A.roundType({ weapon: musket.id, name: "Anything" }) === "ball");
check("rounds.byAmmoNotName", A.roundType({ id: "x", name: "Ball n Cap Revolver", ammo: "cartridge", tier: "medium" }) === "cart");
check("rounds.22", A.roundType({ weapon: "dullards-plinker-revolver" }) === "rf22");
check("rounds.buck", A.roundType({ weapon: "lancaster-lever-shotgun" }) === "shell");
check("rounds.hex", A.roundType({ id: pistol.id }, { raw: "k:hex:2" }) === "hex");
const ac = read("assets/css/ammo-display.css");
check("rounds.css", ["rt-ball", "rt-cart", "rt-rf22", "rt-buck", "rt-hex"].every((k) => ac.includes(".is-primer.is-loaded." + k)) && /#2f3337/.test(ac));
check("rounds.states", /\.ssdns-ammo \.ammo-round\.is-spent/.test(ac) && /\.ssdns-ammo \.ammo-round\.is-locked/.test(ac));
check("rounds.everywhere", /ammo-display\.css/.test(dmIdx) && /ammo-display\.js/.test(dmIdx) && /SSDNSAmmoDisplay/.test(read("map/ssdns-map.js")));

/* versions */
const ver = JSON.parse(read("version.json"));
check("version", JSON.stringify(ver).includes("0.3.109") && JSON.stringify(ver).includes("0.2.122"), JSON.stringify(ver));

if (failures.length) { console.log(failures.length + " failed"); process.exit(1); }
console.log("pr71 ok");

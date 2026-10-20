/**
 * Sheet 0.3.54 Gear tab layout and weapon art. DMCC 0.2.67.
 *   node tools/test-gear-tab.mjs
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

const html = read("index.html");
const equip = html.slice(html.indexOf('id="page-equip"'), html.indexOf('id="page-cond"'));
const main = html.slice(html.indexOf('id="page-main"'), html.indexOf('id="page-equip"'));
const app = read("assets/js/app.js");
const play = read("assets/js/sheet-playtest.js");
const css = read("assets/css/sheet.css");
const version = JSON.parse(read("version.json"));

check("ver.sheet", version.sheet === "0.3.72" && version.sheetBuild === "sheet-playtest-v0372");
check("ver.dmcc", version.dmcc === "0.2.85" && version.dmccBuild === "dmcc-playtest-v0285");
check("ver.app", app.includes('APP_VERSION = "0.3.72"'));
check("target.banner", equip.includes('id="gearTarget"') && equip.includes("gear-bullseye") && equip.includes('id="gearTargetSlot"'));
check("target.mount", play.includes('id=\'atkTarget\'') && play.includes('$("#gearTargetSlot")'));
check("columns", equip.includes("gear-weapons") && equip.includes("gear-kit") && css.includes(".gear-columns"));
check("armor.right", equip.indexOf('id="selArmor"') > equip.indexOf("gear-kit") && equip.indexOf("Shield") > equip.indexOf("gear-kit"));
check("armor.leftMain", !main.includes('id="selArmor"'));
check("order.kit", equip.indexOf(">Armor<") < equip.indexOf(">Ammo<") && equip.indexOf(">Ammo<") < equip.indexOf(">Holsters<") && equip.indexOf(">Holsters<") < equip.indexOf('id="taAttackNotes"'));
check("weapons.left", equip.indexOf('id="guns"') < equip.indexOf('id="explosiveList"') && equip.indexOf('id="explosiveList"') < equip.indexOf("gear-kit"));
check("card.ammo", app.includes('data-ammopool') && app.includes("function chosenAmmoPool") && app.includes("reloadFromPool(i, picked, max)"));
check("card.roll", app.includes('data-gunroll') && app.includes('data-tr') && app.includes('data-hexload') && app.includes('data-cast'));
check("card.photo", app.includes("g-photo") && css.includes(".g-photo"));
check("melee.card", play.includes("data-melee-roll") && play.includes("data-melee-rng") && play.includes("Melee, bow, or thrown"));
check("phone", css.includes("max-width: 760px") && css.includes(".gear-columns { grid-template-columns: 1fr; }"));
check("attack.shared", play.includes("rollMeleeNow") && app.includes("function reload("));
check("html.art", html.includes('assets/js/weapon-art.js?v=0.3.72-'));
check("css.ratio", css.includes("aspect-ratio: 3 / 1") && css.includes(".g-photo.has-art img") && css.includes("object-fit: contain"));
check("app.paint", app.includes("SSDNSWeaponArt.paint"));
check("melee.paint", play.includes("data-melee-photo") && play.includes("SSDNSWeaponArt.paint"));
check("rules.untouched", !read("assets/data/rules.js").includes("assets/img/weapons"));

const artCtx = { window: {} };
vm.runInNewContext(read("assets/js/weapon-art.js"), artCtx, { filename: "assets/js/weapon-art.js" });
const art = artCtx.window.SSDNSWeaponArt;
check("slug.navy", art.slugFor({ id: "navy-army-ball-n-cap-revolver", name: "Navy / Army Ball n Cap Revolver" }) === "navy-army-ball-n-cap-revolver");
check("slug.staff", art.slugFor({ id: "trail-staff-drover-s-staff-quarterstaff", name: "Trail staff / drover's staff (quarterstaff)" }) === "trail-staff-drovers-staff-quarterstaff");
check("slug.pick", art.slugFor({ id: "miner-s-pick-war-pick", name: "Miner’s pick (war pick)" }) === "miners-pick-war-pick");
check("slug.sweat", art.slugFor({ id: "dynamite-stick-sweating-sold-cheap", name: "Dynamite stick, sweating (sold cheap)" }) === "dynamite-stick-sweating");
check("slug.claim", art.slugFor({ id: "claim-hammer-light-hammer", name: "Claim hammer (light hammer)" }) === "claim-hammer-light-hammer");
check("slug.fork", art.slugFor({ id: "branding-fork-trident-rare", name: "Branding fork (trident) — rare" }) === "branding-fork-trident-rare");
check("slug.cane", art.slugFor({ id: "sword-cane-rapier", name: "Sword Cane (rapier)" }) === "sword-cane-rapier");
check("slug.empty", art.slugFor(null) === "" && art.slugFor({ id: "", name: "" }) === "");
check("slug.custom", art.slugFor({ id: "grandpas-knife", name: "Grandpa's knife" }) === "");
check("src.shortbow", art.srcFor({ id: "shortbow", name: "Shortbow" }) === "assets/img/weapons/shortbow.webp");
art.slugs().forEach((slug) => {
  check("file." + slug, fs.existsSync(path.join(root, "assets/img/weapons", slug + ".webp")));
});

const rulesCtx = { window: {} };
vm.runInNewContext(read("assets/data/rules.js"), rulesCtx, { filename: "assets/data/rules.js" });
const rules = rulesCtx.window.SSDNS_RULES;
const catalog = [].concat(rules.firearms, rules.casterGuns, rules.melee, rules.otherRanged, rules.explosives.items);
const noArt = [];
catalog.forEach((w) => { if (!art.slugFor(w)) noArt.push(w.id); });
noArt.sort();
const expectedMisses = ["blasting-caps-box-of-5", "blasting-powder-1-lb", "fuse-cord-50-ft", "long-fuse-per-stick", "padded-powder-crate-holds-12-sticks"];
check("catalog.misses", noArt.join(",") === expectedMisses.join(","), noArt.join(","));

const dom = new JSDOM("<!doctype html><html><body><div class='g-photo' id='p'>Photo</div></body></html>", { url: "http://127.0.0.1:8765/index.html", runScripts: "dangerously" });
dom.window.eval(read("assets/js/weapon-art.js"));
const box = dom.window.document.getElementById("p");
const live = dom.window.SSDNSWeaponArt;
live.paint(box, { id: "shortbow", name: "Shortbow" });
live.paint(box, { id: "shortbow", name: "Shortbow" });
const img = box.querySelector("img");
check("paint.lazy", !!img && img.getAttribute("loading") === "lazy" && img.getAttribute("decoding") === "async" && img.getAttribute("src") === "assets/img/weapons/shortbow.webp" && box.querySelectorAll("img").length === 1);
check("paint.class", box.classList.contains("has-art"));
img.dispatchEvent(new dom.window.Event("error"));
check("paint.retry", !!box.querySelector("img") && /shortbow\.webp\?r=/.test(box.querySelector("img").getAttribute("src")));
img.dispatchEvent(new dom.window.Event("error"));
check("paint.fallback", !box.classList.contains("has-art") && box.textContent === "Photo" && !box.querySelector("img"));
live.paint(box, { id: "shortbow", name: "Shortbow" });
check("paint.stuck", !box.querySelector("img") && box.textContent === "Photo");
live.paint(box, { id: "grandpas-knife", name: "Grandpa's knife" });
check("paint.custom", box.textContent === "Photo" && !box.classList.contains("has-art") && !box.querySelector("img"));

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("gear tab ok");

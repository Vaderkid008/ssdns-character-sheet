/**
 * Character drawer cleanup (sheet 0.3.337 / DMCC 0.2.350).
 * Engraving on the weapon card, one red Target, desktop ammo pictures, phone dots.
 *   node tools/test-drawer-cleanup-03337.mjs
 * rules.js is not edited. Ammo counts, reload, and attack buttons stay the same actions.
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
check("ver", ver.sheet === "0.3.337" && ver.dmcc === "0.2.350" && ver.sheetBuild === "sheet-playtest-v03337" && ver.dmccBuild === "dmcc-playtest-v02350");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.337") && !read("database.rules.json").includes("0.3.337"));

const map = read("map/ssdns-map.js");
const css = read("map/ssdns-map.css");
check("no.devcopy", !map.includes("Same card height as the cast surface"));
check("paint", map.includes("function n62PaintWarts") && map.includes("SSDNSWeaponArt.paint"));
check("cards", map.includes("function n62GunCard") && map.includes("n62-guncard") && map.includes("n62PlayerWeaponHtml"));
check("oneTarget", map.includes('class="ssm-act n62-aim"') && map.includes("n62-target-label") && map.includes("state.rowTargets = {}"));
check("actions", map.includes('data-act="playerAttack"') && map.includes('data-act="playerReload"') && map.includes('data-act="playerCycle"') && map.includes('data-act="playerUnload"'));
check("pictures", map.includes("function playerAmmoPicture") && map.includes("SSDNSAmmoDisplay.html") && map.includes("function playerAmmoDots"));
check("red", css.includes("#c0392b") && css.includes(".n62-target-label"));
check("ratio", css.includes("aspect-ratio: 3 / 1") && css.includes(".n62-wart.has-art img"));
check("phone", css.includes("max-width: 719px") && css.includes(".n62-guncard .ssdns-ammo { display: none; }") && css.includes(".n62-guncard .chamber-dots { display: inline-flex !important;"));
check("bullets", css.includes("border-radius: 2px 10px 10px 2px") && css.includes(".chamber-dot.full") && css.includes("#c2421f") && css.includes(".chamber-dot.hammer"));
check("sheet", !map.slice(map.indexOf("card.innerHTML"), map.indexOf("el.appendChild(card)")).includes("1 · Identity") && !map.slice(map.indexOf("card.innerHTML"), map.indexOf("el.appendChild(card)")).includes("2 · Primary"));

function artAt(url) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: url, runScripts: "dangerously" });
  dom.window.eval(read("assets/js/weapon-art.js"));
  return dom.window.SSDNSWeaponArt;
}
const mapArt = artAt("http://127.0.0.1/map/demo.html");
const sheetArt = artAt("http://127.0.0.1/index.html");
const dmArt = artAt("http://127.0.0.1/dm/index.html");
check("prefix.map", mapArt.srcFor({ id: "navy-army-ball-n-cap-revolver", name: "Navy / Army Ball n Cap Revolver" }) === "../assets/img/weapons/navy-army-ball-n-cap-revolver.webp");
check("prefix.sheet", sheetArt.srcFor({ id: "henrietta-repeating-rifle", name: "Henrietta Repeating Rifle" }) === "assets/img/weapons/henrietta-repeating-rifle.webp");
check("prefix.dm", dmArt.srcFor({ id: "shortbow", name: "Shortbow" }) === "../assets/img/weapons/shortbow.webp");
check("prefix.dmOnly", dmArt.onDmPage ? true : dmArt.srcFor({ id: "hell-maker", name: "Hell Maker" }) === "");

const box = new JSDOM("<!doctype html><div class='n62-wart' id='w'><div>Navy</div></div>", { url: "http://127.0.0.1/map/demo.html", runScripts: "dangerously" });
box.window.eval(read("assets/js/weapon-art.js"));
const el = box.window.document.getElementById("w");
box.window.SSDNSWeaponArt.paint(el, { id: "navy-army-ball-n-cap-revolver", name: "Navy / Army Ball n Cap Revolver" });
const img = el.querySelector("img");
check("paint.map", el.classList.contains("has-art") && img && img.getAttribute("src") === "../assets/img/weapons/navy-army-ball-n-cap-revolver.webp");
box.window.SSDNSWeaponArt.paint(el, { id: "not-a-real-gun", name: "Grandpa's knife" });
check("paint.fallback", !el.classList.contains("has-art") && el.textContent === "Photo");

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

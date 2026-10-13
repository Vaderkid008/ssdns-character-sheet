/**
 * Ammo display framework: cylinder, tube, dots, flag off by default.
 *   node tools/test-ammo-display.mjs
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

function boot(url) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: url || "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
  vm.runInContext(read("assets/data/rules.js"), dom.getInternalVMContext());
  vm.runInContext(read("assets/js/ammo-display.js"), dom.getInternalVMContext());
  return dom;
}

const dom = boot();
const api = dom.window.SSDNSAmmoDisplay;
check("flag.off", api.enabled() === false);

dom.window.SSDNS_AMMO_DISPLAY = true;
check("flag.window", api.enabled() === true);
dom.window.SSDNS_AMMO_DISPLAY = false;
check("flag.windowOff", api.enabled() === false);
dom.window.localStorage.setItem("ssdns.ammoDisplay", "on");
check("flag.storage", api.enabled() === true);
dom.window.localStorage.removeItem("ssdns.ammoDisplay");
check("flag.storageOff", api.enabled() === false);

const queried = boot("http://localhost/?ammoDisplay=1");
check("flag.query", queried.window.SSDNSAmmoDisplay.enabled() === true);

check("kind.revolver", api.kind({ action: "Revolver" }) === "cylinder");
check("kind.percussion", api.kind({ action: "Percussion revolver (slow)" }) === "cylinder");
check("kind.caster", api.kind({ action: "Caster cylinder" }) === "cylinder");
check("kind.lever", api.kind({ action: "Lever (tube)" }) === "tube");
check("kind.pepperbox", api.kind({ action: "Pepperbox" }) === "dots");
check("kind.derringer", api.kind({ action: "Derringer" }) === "dots");
check("kind.break", api.kind({ action: "Break-action" }) === "dots");
check("kind.name", api.kind({ name: "ChaosMaker Revolver" }) === "cylinder");
check("kind.overrideTube", api.kind({ action: "Revolver", ammoDisplay: "tube" }) === "tube");
check("kind.overrideDots", api.kind({ action: "Lever (tube)", ammoDisplay: "dots" }) === "dots");
check("kind.catalog", api.kind({ weapon: "herringer-light-pocket-pistol" }) === "dots");
check("kind.catalogRevolver", api.kind({ weapon: "pony-arms-chaosmaker-medium" }) === "cylinder" || api.kind({ weapon: "dullards-plinker-revolver" }) === "cylinder");

function doc(html) {
  return new JSDOM("<!doctype html><body>" + html + "</body>").window.document;
}
function rounds(html, kind) {
  return doc(html).querySelectorAll(".ssdns-ammo-" + kind + " .ammo-round");
}

const six = api.html({ action: "Revolver", cap: 6, size: "demo", chambers: [1, 1, "jam", "", 1, 1], attr: 'data-act="chamber" data-wid="rev"' });
const sixDoc = doc(six);
check("cyl.six", sixDoc.querySelectorAll(".ssdns-ammo-cylinder .ammo-round").length === 6);
check("cyl.rim", !!sixDoc.querySelector("path.ammo-rim"));
check("cyl.pin", !!sixDoc.querySelector("circle.ammo-pin") && !!sixDoc.querySelector("circle.ammo-pin-core"));
check("cyl.notch", (sixDoc.querySelector("path.ammo-rim").getAttribute("d") || "").split("L").length > 8);
const states = Array.from(sixDoc.querySelectorAll(".ammo-round")).map((b) => b.className);
check("cyl.loaded", states.some((s) => s.includes("is-loaded")));
check("cyl.spent", states.some((s) => s.includes("is-spent")));
check("cyl.jam", states.some((s) => s.includes("is-jam")));
const places = Array.from(sixDoc.querySelectorAll(".ammo-round")).map((b) => b.getAttribute("style"));
check("cyl.radial", new Set(places).size === 6);
check("cyl.attrs", sixDoc.querySelector(".ammo-round").getAttribute("data-act") === "chamber" && sixDoc.querySelector(".ammo-round").getAttribute("data-wid") === "rev");
check("cyl.seven", rounds(api.html({ action: "Revolver", cap: 7, loaded: 7 }), "cylinder").length === 7);
check("cyl.eight", rounds(api.html({ action: "Revolver", cap: 8, loaded: 8 }), "cylinder").length === 8);

function follower(html) {
  const m = String(html).match(/class="ammo-follower" style="left:([0-9.]+)%"/);
  return m ? Number(m[1]) : -1;
}
const tubeFull = api.html({ action: "Lever (tube)", cap: 6, loaded: 6 });
const tubeHalf = api.html({ action: "Lever (tube)", cap: 6, loaded: 2 });
const tubeEmpty = api.html({ action: "Lever (tube)", cap: 6, loaded: 0 });
check("tube.kind", tubeFull.includes('data-ammo-kind="tube"') && tubeFull.includes("ammo-spring"));
check("tube.rounds", rounds(tubeFull, "tube").length === 6);
check("tube.slides", follower(tubeFull) > follower(tubeHalf) && follower(tubeHalf) > follower(tubeEmpty), [follower(tubeFull), follower(tubeHalf), follower(tubeEmpty)].join(" > "));
check("tube.click", doc(tubeHalf).querySelector(".ammo-round").tagName === "BUTTON");

const dots = api.html({ action: "Pepperbox", cap: 4, chambers: [1, "", 1, "jam"] });
const dotsDoc = doc(dots);
check("dots.kind", dotsDoc.querySelector(".ssdns-ammo-dots") && !dotsDoc.querySelector("svg"));
check("dots.four", dotsDoc.querySelectorAll(".ammo-round").length === 4);
check("dots.jam", !!dotsDoc.querySelector(".is-jam"));

const gunJammed = doc(api.html({ action: "Revolver", cap: 6, loaded: 4, jammed: true }));
check("jam.gun", !!gunJammed.querySelector(".ssdns-ammo.is-jammed"));

let fired = null;
dom.window.document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest("button");
  if (t && t.getAttribute("data-fire") != null) fired = t.getAttribute("data-k");
});
const host = dom.window.document.createElement("div");
dom.window.document.body.appendChild(host);
api.mount(host, {
  action: "Revolver",
  cap: 6,
  chambers: [1, 1, 1, "", "", ""],
  attrs: function (k) { return { "data-fire": "0", "data-k": String(k) }; }
});
host.querySelector(".ammo-round").click();
check("click.keepsHandler", fired === "0");

const mapSrc = read("map/ssdns-map.js");
const appSrc = read("assets/js/app.js");
const fightSrc = read("dm/assets/js/v2.js");
check("host.map", mapSrc.includes("SSDNSAmmoDisplay.enabled()") && mapSrc.includes("chamber-dots"));
check("host.gear", appSrc.includes("SSDNSAmmoDisplay.enabled()") && appSrc.includes('class: "chamber"'));
check("host.fight", fightSrc.includes("SSDNSAmmoDisplay.enabled()") && fightSrc.includes("chamber-dot"));
check("rules.file", !read("assets/js/ammo-display.js").includes("database.rules"));
check("demo.page", read("map/ammo-display.html").includes("SSDNSAmmoDisplay") && read("map/ammo-display.html").includes("Cylinder, 6"));

const plinker = (dom.window.SSDNS_RULES.firearms || []).find((w) => w && /revolver/i.test(w.action || ""));
check("kind.liveCatalog", !!plinker && api.kind({ weapon: plinker.id }) === "cylinder", plinker && plinker.id);

if (failures.length) {
  console.error(failures.length + " failed");
  process.exit(1);
}
console.log("ammo display ok");

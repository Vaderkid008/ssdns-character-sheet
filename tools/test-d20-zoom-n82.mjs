/**
 * N82 DM-act Spin/Cycle, crit/fumble d20 zoom, Option B condition tag sizes.
 * Sheet 0.3.169 / DMCC 0.2.182. rules.js stays untouched.
 *   node tools/test-d20-zoom-n82.mjs
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.169" && version.sheetBuild === "sheet-playtest-v03169");
check("ver.dmcc", version.dmcc === "0.2.182" && version.dmccBuild === "dmcc-playtest-v02182");
check("ver.rules", !read("assets/data/rules.js").includes("0.3.169") && !read("assets/data/rules.js").includes("d20-zoom") && !read("database.rules.json").includes("0.3.169"));
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.169"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.182"'));

const sheet = read("assets/css/sheet.css");
const dmcc = read("dm/assets/css/dmcc.css");
check("css.pills", sheet.includes(".status-chips .chip.cond, .status-chips .cond { background: #6e2430; color: #fff; font-size: 17px; padding: 6px 14px; gap: 5px; }"));
check("css.badge", /width: 42px; height: 42px;/.test(sheet) && /font-size: 24px/.test(sheet.slice(sheet.indexOf(".cond-badge"))));
check("css.dmChip", dmcc.includes("font-size: 17px; padding: 6px 14px"));
check("css.sheetLinked", read("index.html").includes("sheet.css?v=0.3.169-cond"));
check("css.dmLinked", read("dm/index.html").includes("dmcc.css?v=0.2.182-cond"));

const map = read("map/ssdns-map.js");
check("map.token28", map.includes("const size = Math.max(22, r * 0.97);") && map.includes("size * 0.57"));
check("map.drawerRoutes", map.includes("drawer:spin") && map.includes("drawer:cycle") && map.includes("The player acts for themselves"));
check("map.playerPath", map.includes('data-act="playerSpin"') && map.includes('data-act="playerCycle"') && map.includes("spinCylinder") && map.includes("cycleTube"));
check("map.feedZoom", map.includes("row.zoom") && map.includes("SSDNSD20Zoom.play"));

const host = read("map/ssdns-map-host.js");
check("host.spin", host.includes('"drawer:spin": "spin"') && host.includes('"drawer:cycle": "cycle"'));

const v2 = read("dm/assets/js/v2.js");
check("dm.stripSpin", v2.includes("data-strip-spin") && v2.includes("data-strip-cycle") && v2.includes('op: "spin"') && v2.includes('op: "cycle"'));
check("dm.actGate", v2.includes("function mapGunSpin") && v2.includes("function mapGunCycle") && v2.includes("!row.dmActsAs"));
check("dm.zoom", v2.includes("SSDNSD20Zoom.beforeDamage"));

const join = read("assets/js/dm-join.js");
check("sheet.spinOp", join.includes('payload.op === "spin"') && join.includes("spinCylinder") && join.includes('payload.op === "cycle"') && join.includes("cycleTube"));
check("sheet.feedZoom", join.includes("feed.zoom"));

const demo = read("dm/assets/js/dmcc.js");
check("demo.spin", demo.includes('payload.op === "spin"') && demo.includes("spinTo") && demo.includes('payload.op === "cycle"') && demo.includes("cycleEject"));
check("card.buttons", demo.includes('data-gun-op="spin"') && demo.includes('data-gun-op="cycle"'));

const ammo = read("assets/js/ammo-display.js");
check("ammo.stripSpin", ammo.includes('data-strip-spin'));

const fx = read("map/ssdns-map-fx.js");
check("fx.critMin", fx.includes("info.critMin") && fx.includes("id: spec.id"));

const zoomSrc = read("assets/js/d20-zoom.js");
check("zoom.files", zoomSrc.includes("d20-crit.mp3") && zoomSrc.includes("d20-fumble.mp3") && zoomSrc.includes("nat20") && zoomSrc.includes("nat1"));
check("zoom.hook", zoomSrc.includes("setBeforeEffect") && read("index.html").includes("d20-zoom.js") && read("dm/index.html").includes("d20-zoom.js"));
check("zoom.skip", zoomSrc.includes("Tap to skip") && zoomSrc.includes("ssdns.map.fx"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
const ctx = dom.getInternalVMContext();
vm.runInContext(read("map/ssdns-map-fx.js"), ctx);
vm.runInContext(read("assets/js/d20-zoom.js"), ctx);
const Z = dom.window.SSDNSD20Zoom;
const FX = dom.window.SSDNSMapFx;
check("kind.nat20", Z.kindOf({ nat: 20, crit: false }) === "crit");
check("kind.nat1", Z.kindOf({ nat: 1, crit: true }) === "fumble");
check("kind.expanded", Z.kindOf({ nat: 19, crit: true, critMin: 19 }) === "crit");
check("kind.expandedBare", Z.kindOf({ nat: 18, critMin: 18 }) === "crit");
check("kind.notCrit", Z.kindOf({ nat: 19, crit: false, critMin: 19 }) === "");
check("kind.plain", Z.kindOf({ nat: 15, critMin: 20 }) === "");
check("kind.pack", Z.pack({ nat: 20, id: "r1" }).crit === true && Z.pack({ nat: 12 }) == null);
check("fx.request", FX.request({ nat: 19, crit: true, critMin: 19, result: "crit" }).critMin === 19);
check("hook.installed", FX.setBeforeEffect && dom.window.SSDNSMapFx);

const off = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
off.window.localStorage.setItem("ssdns.map.fx", "0");
vm.runInContext(read("map/ssdns-map-fx.js"), off.getInternalVMContext());
vm.runInContext(read("assets/js/d20-zoom.js"), off.getInternalVMContext());
const offZoom = off.window.SSDNSD20Zoom;
check("effects.off", offZoom.effectsOn() === false);
let showed = false;
await offZoom.beforeDamage({ nat: 20, crit: true, id: "off1" });
showed = !!off.window.document.querySelector(".d20-zoom");
check("effects.skip", showed === false);

const on = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true, runScripts: "dangerously" });
vm.runInContext(read("assets/js/dice-art.js"), on.getInternalVMContext());
vm.runInContext(read("map/ssdns-map-fx.js"), on.getInternalVMContext());
vm.runInContext(read("assets/js/d20-zoom.js"), on.getInternalVMContext());
const live = on.window.SSDNSD20Zoom.play({ nat: 20, crit: true, critMin: 20, id: "live1" });
await new Promise((r) => setTimeout(r, 40));
const layer = on.window.document.querySelector(".d20-zoom");
check("zoom.shows", !!layer && layer.getAttribute("aria-label") === "Critical hit");
layer.click();
await live;
check("zoom.skipClears", !on.window.document.querySelector(".d20-zoom"));
const again = on.window.SSDNSD20Zoom.play({ nat: 20, crit: true, id: "live1" });
await again;
check("zoom.dedupe", !on.window.document.querySelector(".d20-zoom"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

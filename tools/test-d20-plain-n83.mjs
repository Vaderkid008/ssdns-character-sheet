/**
 * N83 plain d20 click uses the C2 slam curve. Crit / FAIL stay on the random pool.
 * Sheet 0.3.170 / DMCC 0.2.183.
 *   node tools/test-d20-plain-n83.mjs
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

const plainSrc = read("assets/js/d20-plain.js");
const zoomSrc = read("assets/js/d20-zoom.js");
check("src.plain", plainSrc.includes("SSDNSPlainRoll") && plainSrc.includes("c2Frame") && read("index.html").includes("d20-plain.js") && read("dm/index.html").includes("d20-plain.js"));
check("src.notHop", plainSrc.includes("Snappy") && plainSrc.includes("are not"));
check("src.c2fail", zoomSrc.includes("#e7a0a0") && zoomSrc.includes("#d2cbc0") && zoomSrc.includes("data-zoom-read") && zoomSrc.includes("C2_LAND_MS = 2850") && zoomSrc.includes("C2_TOTAL_MS = 4000"));
check("src.pool", zoomSrc.includes('["roll", "c1", "c2", "c3"]'));

function boot(fxOff) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/?testroll=20", pretendToBeVisual: true, runScripts: "dangerously" });
  const ctx = dom.getInternalVMContext();
  if (fxOff) dom.window.localStorage.setItem("ssdns.map.fx", "0");
  vm.runInContext(read("assets/js/dice-art.js"), ctx);
  vm.runInContext(read("assets/js/d20-plain.js"), ctx);
  vm.runInContext(read("assets/js/d20-zoom.js"), ctx);
  return dom;
}

const dom = boot(false);
const P = dom.window.SSDNSPlainRoll;
const Z = dom.window.SSDNSD20Zoom;
check("plain.D", P.D === 4 && P.LAND === 2.85);
check("zoom.times", Z.motionMs.c2 === 2850 && Z.motionMs.c2Total === 4000 && Z.motionMs.c1 === 900 && Z.motionMs.roll === 1100 && Z.motionMs.c3 === 1000);

let blank = 0;
let leaked = 0;
for (let t = 0; t < 2.85; t += 0.05) {
  const fr = P.c2Frame(t, { value: 14, D: 4, dir: 1 });
  blank += 1;
  if (fr.text !== "" || fr.numOpacity !== 0 || fr.showNum) leaked += 1;
}
check("curve.blank", leaked === 0 && blank > 40, "leaked " + leaked);
const at0 = P.c2Frame(0, { value: 14, D: 4, dir: 1 });
const atSpin = P.c2Frame(2.1, { value: 14, D: 4, dir: 1 });
const atOver = P.c2Frame(2.62, { value: 14, D: 4, dir: 1 });
const atLand = P.c2Frame(2.85, { value: 14, D: 4, dir: 1 });
const atEnd = P.c2Frame(4, { value: 14, D: 4, dir: 1 });
check("curve.spin", Math.abs(at0.scale - 0.3) < 0.001 && at0.blur === 9 && atSpin.text === "" && Math.abs(atSpin.scale - 0.86) < 0.02 && Math.abs(Math.abs(atSpin.rot) - 1800) < 1);
check("curve.over", Math.abs(atOver.scale - 1.34) < 0.02 && Math.abs(atOver.y + 16) < 0.5 && atOver.text === "");
check("curve.land", atLand.showNum && atLand.text === "14" && atLand.numOpacity === 0 && Math.abs(atLand.scale - 0.88) < 0.05);
check("curve.end", atEnd.text === "14" && atEnd.numOpacity === 1 && Math.abs(atEnd.scale - 1) < 0.02 && !atEnd.spinning);
check("curve.dir", P.c2Frame(1, { value: 8, D: 4, dir: -1 }).rot < 0 && P.c2Frame(1, { value: 8, D: 4, dir: 1 }).rot > 0);

const plainPose = Z.pose({ nat: 14, id: "p14", dir: -1 });
check("pose.plain", plainPose.kind === "plain" && plainPose.motion === "c2" && plainPose.value === 14 && plainPose.D === 4 && plainPose.dir === -1 && plainPose.land === 2.85);
check("pose.same", Z.pose({ nat: 14, id: "p14" }) === plainPose);
const critPose = Z.pose({ nat: 20, id: "c20", motion: "c2", dir: 1, characterName: "Jolene Pike" });
check("pose.crit", critPose.kind === "crit" && critPose.motion === "c2" && critPose.D === 4 && critPose.who === "Jolene Pike" && Z.pack({ nat: 20, id: "c20" }).motion === "c2");
const failPose = Z.pose({ nat: 1, id: "f1", motion: "c1" });
check("pose.fail", failPose.kind === "fumble" && failPose.motion === "c1" && Math.abs(failPose.D - 0.9) < 0.001);
const expPose = Z.pose({ nat: 19, crit: true, critMin: 19, id: "ex" });
check("pose.expanded", expPose.kind === "crit" && Z.motions.indexOf(expPose.motion) >= 0);
check("pose.packPlain", Z.pack({ nat: 12, id: "nope" }) == null);

const live = Z.present(plainPose);
await new Promise((r) => setTimeout(r, 30));
const layer = dom.window.document.querySelector(".d20-plain");
const num = layer && layer.querySelector("[data-plain-num]");
check("play.plain", !!layer && layer.getAttribute("data-motion") === "c2" && layer.getAttribute("data-kind") === "plain");
check("play.blank", !!num && num.textContent === "" && !layer.querySelector(".d20-zoom-word") && !layer.querySelector(".d20-zoom-crack") && !/CRITICAL|FAIL|forge/i.test(layer.textContent));
P.skip();
check("play.skipNum", num.textContent === "14");
layer.click();
await live;
check("play.closed", !dom.window.document.querySelector(".d20-plain"));

const critPlay = Z.present({ nat: 20, id: "show20", motion: "roll", dir: 1 });
await new Promise((r) => setTimeout(r, 30));
const critLayer = dom.window.document.querySelector(".d20-zoom");
check("branch.crit", !!critLayer && critLayer.classList.contains("is-crit") && critLayer.querySelector(".d20-zoom-word").textContent === "Critical" && !dom.window.document.querySelector(".d20-plain"));
critLayer.click();
critLayer.click();
await critPlay;

const failPlay = Z.present({ nat: 1, id: "show1", motion: "c2", dir: 1 });
await new Promise((r) => setTimeout(r, 40));
const failLayer = dom.window.document.querySelector(".d20-zoom");
check("branch.fail", !!failLayer && failLayer.classList.contains("is-fail") && failLayer.getAttribute("data-motion") === "c2" && failLayer.querySelector(".d20-zoom-word").textContent === "Fail" && !!failLayer.querySelector(".d20-zoom-crack") && !!failLayer.querySelector("[data-zoom-read]"));
const failNum = failLayer.querySelector("[data-plain-num]");
check("branch.failBlank", !failNum && !/CRITICAL/.test(failLayer.textContent));
failLayer.click();
await new Promise((r) => setTimeout(r, 20));
const readSlot = failLayer.querySelector("[data-zoom-read]");
check("branch.failLand", failLayer.classList.contains("is-land") && !!readSlot && !!readSlot.querySelector(".die-num, .d20-zoom-rawnum") && failLayer.querySelector(".d20-zoom-word").textContent === "Fail");
failLayer.click();
await failPlay;

const off = boot(true);
const offZoom = off.window.SSDNSD20Zoom;
check("fx.off", offZoom.effectsOn() === false);
const offPlay = offZoom.present({ nat: 8, id: "off8" });
await new Promise((r) => setTimeout(r, 20));
const offLayer = off.window.document.querySelector(".d20-plain");
const offNum = offLayer && offLayer.querySelector("[data-plain-num]");
check("fx.landed", !!offLayer && offLayer.classList.contains("is-land") && offNum && offNum.textContent === "8");
offLayer.click();
await offPlay;

const reduced = boot(false);
reduced.window.matchMedia = function (q) { return { matches: String(q).indexOf("reduce") >= 0, media: q }; };
vm.runInContext(read("assets/js/d20-plain.js"), reduced.getInternalVMContext());
vm.runInContext(read("assets/js/d20-zoom.js"), reduced.getInternalVMContext());
const redPlay = reduced.window.SSDNSD20Zoom.present({ nat: 11, id: "red11" });
await new Promise((r) => setTimeout(r, 20));
const redLayer = reduced.window.document.querySelector(".d20-plain");
check("reduced.landed", !!redLayer && redLayer.classList.contains("is-land") && redLayer.querySelector("[data-plain-num]").textContent === "11");
redLayer.click();
await redPlay;

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

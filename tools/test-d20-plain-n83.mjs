/**
 * N83 plain d20 click uses the C2 slam curve. Crit / FAIL stay on the random pool.
 * Sheet 0.3.172 / DMCC 0.2.185.
 * Ordinary d20s spin with the number showing. Blank→number and crit/FAIL
 * stay on a fancy Challenge pose.
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
check("src.fast", plainSrc.includes("1.05") && plainSrc.includes("normalFrame") && plainSrc.includes("suspense") && read("dm/index.html").includes('id="btnChallenge"') && read("assets/js/dm-join.js").includes("fancy: true"));
const dmHtml = read("dm/index.html");
const tablePanel = dmHtml.slice(dmHtml.indexOf('id="panel-table"'), dmHtml.indexOf('id="panel-rewards"'));
check("chrome.bar", dmHtml.indexOf('id="btnChallenge"') < dmHtml.indexOf('id="panel-table"') && dmHtml.includes("data-open-challenge") && dmHtml.includes("room-hero-actions") && !tablePanel.includes("btnChallenge"));
check("chrome.map", read("map/ssdns-map.js").includes('data-act="challengeBtn"') && read("map/ssdns-map.js").includes("appendStripChallenge") && read("map/ssdns-map-host.js").includes('name === "challenge:open"'));
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
check("plain.D", P.D === 1.05 && P.FAST === 1.05 && P.NORMAL === 0.9);
check("zoom.times", Z.motionMs.c2 === 2850 && Z.motionMs.c2Total === 4000 && Z.motionMs.c1 === 900 && Z.motionMs.roll === 1100 && Z.motionMs.c3 === 1000);

let leaked = 0;
for (let t = 0; t < 1.05; t += 0.05) {
  const fr = P.fastFrame(t, { value: 14, D: 1.05, dir: 1 });
  if (fr.text !== "" || fr.showNum) leaked += 1;
}
check("curve.blank", leaked === 0);
const atEnd = P.fastFrame(1.5, { value: 14, D: 1.05, dir: 1 });
check("curve.land", atEnd.showNum && atEnd.text === "14" && atEnd.numOpacity === 1);
const sus = P.fastFrame(3, { value: 20, D: 2.4, dir: 1, suspense: true });
check("curve.suspense", sus.text === "" && sus.numOpacity === 0 && sus.suspense && sus.D >= 2 && sus.D <= 3.15);
check("curve.dir", P.fastFrame(0.4, { value: 8, D: 1.05, dir: -1 }).rot < 0 && P.fastFrame(0.4, { value: 8, D: 1.05, dir: 1 }).rot > 0);
const mid = P.normalFrame(0.3, { value: 14, D: 0.9, dir: 1 });
const locked = P.normalFrame(1.1, { value: 14, D: 0.9, dir: 1 });
check("curve.normal", mid.showNum && mid.text !== "" && mid.normal && mid.spinning && locked.text === "14" && !locked.spinning && locked.suspense === false);
const failEarly = P.c2FailLook(2.0, { D: 4, dir: 1 });
const failOver = P.c2FailLook(2.5, { D: 4, dir: 1 });
const failImpact = P.c2FailLook(2.85, { D: 4, dir: 1 });
const failCrack = P.c2FailLook(3.1, { D: 4, dir: 1 });
const failHold = P.c2FailLook(3.7, { D: 4, dir: 1 });
check("fail.early", failEarly.text === "" && failEarly.numOpacity === 0 && failEarly.cracks[0] === 1 && failEarly.forge === false);
check("fail.faint", failOver.text === "1" && failOver.numOpacity > 0 && failOver.numOpacity < 0.5 && failOver.numColor === "#b88a8e" && failOver.cracks[0] === 1);
check("fail.impact", failImpact.text === "1" && Math.abs(failImpact.scale - 0.88) < 0.05 && failImpact.cracks[0] === 1 && failImpact.wordOpacity === 0 && failImpact.rings[0].opacity > 0 && Math.abs(failImpact.shake[0]) + Math.abs(failImpact.shake[1]) > 0);
check("fail.crack", failCrack.cracks[0] < 1 && failCrack.sagY > 0 && failCrack.sagR < 0 && failCrack.wordOpacity > 0 && failCrack.bright < 1);
check("fail.bone", failHold.text === "1" && failHold.numColor !== "#e7a0a0" && failHold.numColor !== "#b88a8e" && failHold.cracks[4] < 0.5 && failHold.wordOpacity === 1 && failHold.tracking === 0.3);

const plainPose = Z.pose({ nat: 14, id: "p14", dir: -1 });
check("pose.plain", plainPose.kind === "plain" && plainPose.motion === "fast" && plainPose.value === 14 && plainPose.D === 1.05 && plainPose.dir === -1);
check("pose.same", Z.pose({ nat: 14, id: "p14" }) === plainPose);
const critPose = Z.pose({ nat: 20, id: "c20", motion: "c2", dir: 1, mult: 2.5, characterName: "Jolene Pike" });
check("pose.crit", critPose.kind === "crit" && critPose.motion === "c2" && critPose.mult === 2.5 && Math.abs(critPose.D - 2.625) < 0.02 && critPose.who === "Jolene Pike" && critPose.fancy !== true && Z.pack({ nat: 20, id: "c20" }) == null);
const fancyCrit = Z.pose({ nat: 20, id: "c20f", motion: "c2", fancy: true });
check("pose.fancy", fancyCrit.fancy === true && fancyCrit.kind === "crit" && Z.pack({ nat: 20, id: "c20f" }).fancy === true);
const failPose = Z.pose({ nat: 1, id: "f1", motion: "c1" });
check("pose.fail", failPose.kind === "fumble" && failPose.motion === "c1" && failPose.mult >= 2 && failPose.mult <= 3 && Math.abs(failPose.D - 1.05 * failPose.mult) < 0.02);
const expPose = Z.pose({ nat: 19, crit: true, critMin: 19, id: "ex" });
check("pose.expanded", expPose.kind === "crit" && Z.motions.indexOf(expPose.motion) >= 0);
check("pose.packPlain", Z.pack({ nat: 12, id: "nope" }) == null);

const live = Z.present(plainPose);
await new Promise((r) => setTimeout(r, 30));
const layer = dom.window.document.querySelector(".d20-plain");
const num = layer && layer.querySelector("[data-plain-num]");
check("play.plain", !!layer && layer.getAttribute("data-motion") === "spin" && layer.getAttribute("data-kind") === "spin");
check("play.blank", !!num && num.textContent !== "" && !layer.classList.contains("is-land") && !layer.querySelector(".d20-zoom-word") && !layer.querySelector(".d20-zoom-crack") && !/CRITICAL|FAIL|forge/i.test(layer.textContent));
P.skip();
check("play.skipNum", num.textContent === "14");
layer.click();
await live;
check("play.closed", !dom.window.document.querySelector(".d20-plain"));

const ordinaryCrit = Z.present({ nat: 20, id: "ordinary20" });
await new Promise((r) => setTimeout(r, 30));
const ordinaryLayer = dom.window.document.querySelector(".d20-plain");
check("branch.ordinaryCrit", !!ordinaryLayer && ordinaryLayer.getAttribute("data-kind") === "spin" && !dom.window.document.querySelector(".d20-zoom") && !/CRITICAL|FAIL/.test(ordinaryLayer.textContent));
if (ordinaryLayer) ordinaryLayer.click();
await ordinaryCrit;

const fancyPlain = Z.present({ nat: 14, id: "fancy14", fancy: true, dir: 1 });
await new Promise((r) => setTimeout(r, 30));
const fancyLayer = dom.window.document.querySelector(".d20-plain");
check("branch.fancyBlank", !!fancyLayer && fancyLayer.getAttribute("data-kind") === "plain" && fancyLayer.getAttribute("data-motion") === "fast" && fancyLayer.querySelector("[data-plain-num]").textContent === "");
if (fancyLayer) fancyLayer.click();
await fancyPlain;

const critPlay = Z.present({ nat: 20, id: "show20", motion: "roll", dir: 1, mult: 2, fancy: true });
await new Promise((r) => setTimeout(r, 30));
const susLayer = dom.window.document.querySelector(".d20-plain");
check("branch.suspense", !!susLayer && susLayer.getAttribute("data-kind") === "suspense" && susLayer.querySelector("[data-plain-num]").textContent === "");
susLayer.click();
await new Promise((r) => setTimeout(r, 40));
const critLayer = dom.window.document.querySelector(".d20-zoom");
check("branch.crit", !!critLayer && critLayer.classList.contains("is-crit") && critLayer.querySelector(".d20-zoom-word").textContent === "Critical");
critLayer.click();
critLayer.click();
await critPlay;

const failPlay = Z.present({ nat: 1, id: "show1", motion: "c2", dir: 1, mult: 2, fancy: true });
await new Promise((r) => setTimeout(r, 20));
const failSpin = dom.window.document.querySelector(".d20-plain");
if (failSpin) failSpin.click();
await new Promise((r) => setTimeout(r, 40));
const failLayer = dom.window.document.querySelector(".d20-zoom");
check("branch.fail", !!failLayer && failLayer.classList.contains("is-fail") && failLayer.getAttribute("data-motion") === "c2" && failLayer.querySelector(".d20-zoom-word").textContent === "Fail" && !!failLayer.querySelector(".d20-zoom-crack") && !!failLayer.querySelector("[data-zoom-read]"));
const failNum = failLayer.querySelector("[data-plain-num]");
const failGlyph = failLayer.querySelector("[data-zoom-failnum]");
check("branch.failBlank", !failNum && !!failGlyph && failGlyph.textContent === "" && !/CRITICAL/.test(failLayer.textContent) && failLayer.classList.contains("is-fail-c2"));
failLayer.click();
await new Promise((r) => setTimeout(r, 20));
check("branch.failLand", failLayer.classList.contains("is-land") && failGlyph.textContent === "1" && failLayer.querySelector(".d20-zoom-word").textContent === "Fail" && !!failLayer.querySelector(".d20-zoom-crack") && !failLayer.querySelector(".d20-zoom-heat.is-forge"));
failLayer.click();
await failPlay;

const off = boot(true);
const offZoom = off.window.SSDNSD20Zoom;
check("fx.off", offZoom.effectsOn() === false);
const offPlay = offZoom.present({ nat: 8, id: "off8" });
await new Promise((r) => setTimeout(r, 20));
const offLayer = off.window.document.querySelector(".d20-plain");
const offNum = offLayer && offLayer.querySelector("[data-plain-num]");
check("fx.landed", !!offLayer && offLayer.classList.contains("is-normal") && offLayer.getAttribute("data-kind") === "spin" && offNum && offNum.textContent === "8" && !off.window.document.querySelector(".d20-zoom"));
offLayer.click();
await offPlay;

const reduced = boot(false);
reduced.window.matchMedia = function (q) { return { matches: String(q).indexOf("reduce") >= 0, media: q }; };
vm.runInContext(read("assets/js/d20-plain.js"), reduced.getInternalVMContext());
vm.runInContext(read("assets/js/d20-zoom.js"), reduced.getInternalVMContext());
const redPlay = reduced.window.SSDNSD20Zoom.present({ nat: 11, id: "red11" });
await new Promise((r) => setTimeout(r, 20));
const redLayer = reduced.window.document.querySelector(".d20-plain");
check("reduced.landed", !!redLayer && redLayer.classList.contains("is-normal") && redLayer.querySelector("[data-plain-num]").textContent === "11");
redLayer.click();
await redPlay;

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nall passed");

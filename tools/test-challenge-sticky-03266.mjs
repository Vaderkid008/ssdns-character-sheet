/**
 * Gold Challenge result stays until a click or Escape.
 * A normal d20 still closes on its own.
 * Sheet 0.3.290 / DMCC 0.2.303.
 *   node tools/test-challenge-sticky-03266.mjs
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
function flush(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.290" && ver.dmcc === "0.2.303" && ver.sheetBuild === "sheet-playtest-v03290" && ver.dmccBuild === "dmcc-playtest-v02303");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.290") && !read("database.rules.json").includes("0.3.290"));

const zoom = read("assets/js/d20-zoom.js");
const plain = read("assets/js/d20-plain.js");
const sheet = read("index.html");
const dm = read("dm/index.html");
check("src.hold", zoom.includes('layer.classList.add("is-hold")') && zoom.includes("click to close") && zoom.includes("stopChallengeSting") && !zoom.includes("later(finish"));
check("src.plain", plain.includes('layer.classList.add("is-hold")') && plain.includes("click to close"));
check("cache.sheet", sheet.includes("d20-zoom.js?v=0.3.290-lockdie") && sheet.includes("dice-art.js?v=0.3.290-lockdie") && sheet.includes("sfx.js?v=0.3.290-challenge") && sheet.includes("challenge-sfx.js?v=0.3.290-challsfx"));
check("cache.dm", dm.includes("d20-zoom.js?v=0.2.303-lockdie") && dm.includes("dice-art.js?v=0.2.303-lockdie") && dm.includes("sfx.js?v=0.2.303-challenge") && dm.includes("challenge-sfx.js?v=0.2.303-challsfx"));

const join = read("assets/js/dm-join.js");
const clickAt = join.indexOf('dieBtn.addEventListener("click"');
const handleAt = join.indexOf("function handleCommand(cmd)");
const clickBody = join.slice(clickAt, handleAt);
check("src.log", clickAt > 0 && clickBody.includes("SSDNSSheet.addLog") && clickBody.includes("postRoll(") && clickBody.includes("Zoom.present"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.localStorage.setItem("ssdns.map.fx", "0");
w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 16);
w.cancelAnimationFrame = (id) => w.clearTimeout(id);
const heard = [];
const stopped = [];
w.SSDNSAudio = {
  hasFile: (name) => name === "challenge-nat20-crit" || name === "challenge-fail",
  play: (name) => { heard.push(name); },
  playNow: (name) => { heard.push(name); },
  stop: (name) => { stopped.push(name); }
};
const logs = [];
w.SSDNSSheet = { addLog: (row) => { logs.push(row); } };
w.SSDNSApp = {
  compute: () => ({ skills: { Perception: 5 }, mods: { WIS: 2 } }),
  doc: () => ({ character: { name: "Buddy Ki" } })
};
w.SSDNSTestRoll = () => 20;
const ctx = dom.getInternalVMContext();
vm.runInContext(read("assets/js/dice-art.js"), ctx);
vm.runInContext(read("assets/js/challenge-sfx.js"), ctx);
vm.runInContext(read("assets/js/d20-plain.js"), ctx);
vm.runInContext(read("assets/js/d20-zoom.js"), ctx);
vm.runInContext(read("assets/js/dm-join.js"), ctx);
if (w.document.readyState === "loading") w.document.dispatchEvent(new w.Event("DOMContentLoaded"));

const Z = w.SSDNSD20Zoom;
const critP = Z.play({ nat: 20, fancy: true, challenge: true, id: "hold20" });
await flush(900);
const crit = w.document.querySelector(".d20-zoom");
check("hold.crit", !!crit && crit.classList.contains("is-hold") && crit.querySelector("[data-zoom-hint]").textContent === "click to close", crit && crit.className);
const sting = w.SSDNSChallengeSfx.trace().some((row) => row.kind === "play" && String(row.file).indexOf("challenge-nat20-crit.wav") >= 0);
const stopsBefore = w.SSDNSChallengeSfx.trace().filter((row) => row.kind === "stop").length;
check("hold.sting", sting && heard.length === 0, heard.join(","));
crit.click();
await critP;
const stopsAfter = w.SSDNSChallengeSfx.trace().filter((row) => row.kind === "stop").length;
check("click.crit", !w.document.querySelector(".d20-zoom") && stopsAfter > stopsBefore);

heard.length = 0;
stopped.length = 0;
const midP = Z.play({ nat: 14, fancy: true, challenge: true, id: "hold14" });
await flush(900);
const mid = w.document.querySelector(".d20-plain");
check("hold.plain", !!mid && mid.classList.contains("is-hold") && mid.querySelector(".d20-plain-hint").textContent === "click to close" && heard.length === 0);
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await midP;
check("esc.plain", !w.document.querySelector(".d20-plain"));

const plainP = Z.play({ nat: 8, id: "spin8" });
await flush(700);
check("regular.closes", !w.document.querySelector(".d20-plain") && !w.document.querySelector(".d20-zoom"));
await plainP;

w.SSDNSDmJoin._handle({
  type: "challenge",
  payload: { id: "log1", label: "Perception", skill: "Perception", ability: "WIS", abilityName: "Wisdom", dc: 15 }
});
w.document.querySelector("[data-challenge-die]").click();
await flush(40);
check("log.now", logs.length === 1 && !!w.document.querySelector(".d20-zoom, .d20-plain") && /Buddy Ki/.test(logs[0].text || ""));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("challenge sticky ok");
process.exit(0);

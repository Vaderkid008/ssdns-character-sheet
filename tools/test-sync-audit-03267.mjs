/**
 * Player rolls and Challenge zooms show on the DM screen.
 * Sheet 0.3.298 / DMCC 0.2.311.
 *   node tools/test-sync-audit-03267.mjs
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

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.298" && ver.dmcc === "0.2.311" && ver.sheetBuild === "sheet-playtest-v03298" && ver.dmccBuild === "dmcc-playtest-v02311");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.298") && !read("database.rules.json").includes("0.3.298"));

const v2 = read("dm/assets/js/v2.js");
const fnAt = v2.indexOf("function feedZoomPlan");
const replayAt = v2.indexOf("function replayFeedZoom");
const watchAt = v2.indexOf("function watchTableSfx");
check("src.plan", fnAt > 0 && replayAt > fnAt && watchAt > replayAt && v2.includes("replayFeedZoom(row, started)") && v2.includes("window.SSDNSFeedSync"));
const chunk = v2.slice(fnAt, replayAt);
const sandbox = {};
vm.runInNewContext(chunk + "\nthis.plan = feedZoomPlan;", sandbox);
const plan = sandbox.plan;

const started = Date.parse("2026-11-09T17:40:00.000Z");
const fresh = new Date(started + 1000).toISOString();
const old = new Date(started - 60000).toISOString();
const challenge = {
  id: "ch1", ts: fresh, from: "player-1", kind: "roll",
  zoom: { id: "ch1", nat: 20, kind: "crit", fancy: true, challenge: true, motion: "c1" }
};
const plainDie = {
  id: "ch2", ts: fresh, from: "player-1", kind: "roll",
  die: { id: "ch2", nat: 14, value: 14, kind: "plain", fancy: true, challenge: true, motion: "fast", D: 1.05 }
};
check("dm.seesZoom", plan(challenge, "dm-1", started) === "zoom");
check("player.skipsOwn", plan(challenge, "player-1", started) === "");
check("dm.seesDie", plan(plainDie, "dm-1", started) === "die");
check("dm.skipsOld", plan(Object.assign({}, challenge, { ts: old }), "dm-1", started) === "");
check("dm.skipsSfx", plan({ id: "s1", ts: fresh, from: "player-1", kind: "sfx", event: "attack" }, "dm-1", started) === "");
check("dm.skipsTalk", plan({ id: "t1", ts: fresh, from: "player-1", kind: "roll", text: "Perception 12" }, "dm-1", started) === "");

const sheet = read("index.html");
const dm = read("dm/index.html");
check("cache.sheet", sheet.includes("d20-zoom.js?v=0.3.298-lockdie") && sheet.includes("dice-art.js?v=0.3.298-lockdie") && sheet.includes("sfx.js?v=0.3.298-challenge") && sheet.includes("challenge-sfx.js?v=0.3.298-challsfx") && sheet.indexOf("challenge-sfx.js") < sheet.indexOf("d20-zoom.js") && sheet.includes("spell-tokens.js?v=0.3.172-n85") && sheet.includes("ssdns-map.js?v=0.3.298-force"));
check("cache.dm", dm.includes("d20-zoom.js?v=0.2.311-lockdie") && dm.includes("dice-art.js?v=0.2.311-lockdie") && dm.includes("sfx.js?v=0.2.311-challenge") && dm.includes("challenge-sfx.js?v=0.2.311-challsfx") && dm.includes("v2.js?v=0.2.311-playfix") && dm.includes("supplies.js?v=0.2.181-supplies") && dm.includes("spell-tokens.js?v=0.2.185-n85") && dm.includes("ssdns-map.js?v=0.2.311-force"));
check("src.oneWatch", v2.split("function watchTableSfx").length === 2);
check("src.noRebind", v2.includes("if (fight._sfxRoom === room && fight._sfxUnsub && DM.state.unsubs.indexOf(fight._sfxUnsub) >= 0) return;"));
const join = read("assets/js/dm-join.js");
check("player.skipsOwn", join.includes("var own = row.from === state.uid;") && join.includes("if (!own && row.zoom && root.SSDNSD20Zoom && root.SSDNSD20Zoom.play)"));
check("player.skipsOld", join.includes("if (!own && (!ts || ts <= (state.marker || 0))) return;"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/dm/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.localStorage.setItem("ssdns.map.fx", "0");
w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 16);
w.cancelAnimationFrame = (id) => w.clearTimeout(id);
const heard = [];
w.SSDNSAudio = {
  hasFile: (name) => name === "challenge-nat20-crit" || name === "challenge-fail",
  play: (name) => { heard.push(name); },
  playNow: (name) => { heard.push(name); }
};
const ctx = dom.getInternalVMContext();
vm.runInContext(read("assets/js/dice-art.js"), ctx);
vm.runInContext(read("assets/js/d20-plain.js"), ctx);
vm.runInContext(read("assets/js/d20-zoom.js"), ctx);

function replay(row, selfUid) {
  const how = plan(row, selfUid, started);
  const Zoom = w.SSDNSD20Zoom;
  if (how === "zoom") return Zoom.play(row.zoom);
  if (how === "die") return Zoom.present(row.die);
  return Promise.resolve();
}
const shown = replay(challenge, "dm-1");
await new Promise((r) => setTimeout(r, 40));
const layer = w.document.querySelector(".d20-zoom");
check("dm.playsCrit", !!layer && layer.querySelector(".d20-zoom-word").textContent === "Critical");
check("dm.hearsSting", heard[0] === "challenge-nat20-crit", heard.join(","));
if (layer) layer.click();
await new Promise((r) => setTimeout(r, 30));
const held = w.document.querySelector(".d20-zoom");
if (held) held.click();
await shown;
check("dm.quietOwn", plan(challenge, "player-1", started) === "");
heard.length = 0;
await replay({ id: "ord", ts: fresh, from: "player-1", kind: "roll", text: "1d20 = 8" }, "dm-1");
check("dm.noPlainSting", heard.length === 0);

function bootPacked(url) {
  const packed = new JSDOM("<!doctype html><html><body></body></html>", { url: url, pretendToBeVisual: true, runScripts: "dangerously" });
  const win = packed.window;
  win.localStorage.setItem("ssdns.map.fx", "0");
  win.Audio = function Audio(src) {
    this.src = src;
    this.volume = 1;
    this.readyState = 1;
    this.play = () => Promise.resolve();
    this.pause = () => {};
    this.addEventListener = () => {};
  };
  const bus = [];
  win.SSDNSAudio = {
    isMuted: () => false,
    volume: () => 0.8,
    play: (name) => { bus.push(name); },
    playNow: (name) => { bus.push("now:" + name); },
    stop: () => {}
  };
  win.requestAnimationFrame = (fn) => win.setTimeout(() => fn(Date.now()), 16);
  win.cancelAnimationFrame = (id) => win.clearTimeout(id);
  const packedCtx = packed.getInternalVMContext();
  vm.runInContext(read("assets/js/dice-art.js"), packedCtx);
  vm.runInContext(read("assets/js/challenge-sfx.js"), packedCtx);
  vm.runInContext(read("assets/js/d20-plain.js"), packedCtx);
  vm.runInContext(read("assets/js/d20-zoom.js"), packedCtx);
  return { win, bus };
}
const dmSide = bootPacked("http://localhost/dm/index.html");
const playerSide = bootPacked("http://localhost/index.html");
const dmZoom = dmSide.win.SSDNSD20Zoom.play(challenge.zoom);
const playerZoom = playerSide.win.SSDNSD20Zoom.play(challenge.zoom);
await new Promise((r) => setTimeout(r, 80));
function lands(win) {
  return win.SSDNSChallengeSfx.trace().filter((row) => row.kind === "play" && String(row.file).indexOf("challenge-nat20-crit") >= 0);
}
for (const side of [{ name: "dm", box: dmSide }, { name: "player", box: playerSide }]) {
  const layer = side.box.win.document.querySelector(".d20-zoom");
  check(side.name + ".holds", !!layer && layer.classList.contains("is-hold"), layer && layer.className);
  check(side.name + ".oneLand", lands(side.box.win).length === 1 && lands(side.box.win)[0].max === 12);
  check(side.name + ".noGlobal", side.box.bus.length === 0, side.box.bus.join(","));
}
const beforeSecond = lands(dmSide.win).length;
dmSide.win.SSDNSD20Zoom.play(challenge.zoom);
await new Promise((r) => setTimeout(r, 40));
check("dm.dedupesId", lands(dmSide.win).length === beforeSecond && dmSide.win.document.querySelectorAll(".d20-zoom").length === 1);
dmSide.win.document.querySelector(".d20-zoom").click();
playerSide.win.document.dispatchEvent(new playerSide.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
await dmZoom;
await playerZoom;
check("both.dismissed", !dmSide.win.document.querySelector(".d20-zoom") && !playerSide.win.document.querySelector(".d20-zoom"));

const ordinarySide = bootPacked("http://localhost/dm/index.html");
const ordinary = ordinarySide.win.SSDNSD20Zoom.play({ nat: 8, id: "ordinary-8" });
await new Promise((r) => setTimeout(r, 700));
check("ordinary.closes", !ordinarySide.win.document.querySelector(".d20-plain") && !ordinarySide.win.document.querySelector(".d20-zoom"));
check("ordinary.quiet", !ordinarySide.win.SSDNSChallengeSfx.trace().some((row) => row.kind === "play") && ordinarySide.bus.length === 0);
await ordinary;

const midSide = bootPacked("http://localhost/index.html");
const midZoom = midSide.win.SSDNSD20Zoom.present(plainDie.die);
await new Promise((r) => setTimeout(r, 80));
const midLayer = midSide.win.document.querySelector(".d20-plain");
check("recv.holdsPlain", !!midLayer && midLayer.classList.contains("is-hold") && midSide.bus.length === 0);
midLayer.click();
await midZoom;
check("recv.plainGone", !midSide.win.document.querySelector(".d20-plain"));

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("sync audit ok");
process.exit(0);

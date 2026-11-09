/**
 * Challenge sound pack timings (sheet 0.3.268 / DMCC 0.2.281).
 * Gold path only. Ordinary rolls stay quiet of these cues.
 *   node tools/test-challenge-sfx-03266.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
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
check("ver", ver.sheet === "0.3.268" && ver.dmcc === "0.2.281");
check("rules.clean", !read("assets/data/rules.js").includes("0.3.268"));

const fire = fs.readFileSync(path.join(root, "assets/sfx/challenge-roll-fireball.mp3"));
const fast = fs.readFileSync(path.join(root, "assets/sfx/challenge-roll-fast.mp3"));
check("clips.distinct", fire.length > 1000 && fast.length > 1000 && !fire.equals(fast));
check("clips.mp3", fire.slice(0, 3).toString() === "ID3" && fast.slice(0, 3).toString() === "ID3");
check("clips.hash", crypto.createHash("sha256").update(fire).digest("hex") !== crypto.createHash("sha256").update(fast).digest("hex"));

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/index.html", pretendToBeVisual: true, runScripts: "dangerously" });
const w = dom.window;
w.localStorage.setItem("ssdns.map.fx", "1");
function FakeAudio(url) {
  this.src = url;
  this.volume = 1;
  this.readyState = 1;
  this.paused = false;
  this.play = () => Promise.resolve();
  this.pause = () => { this.paused = true; };
  this.addEventListener = () => {};
}
w.Audio = FakeAudio;
w.SSDNSAudio = { isMuted: () => false, volume: () => 0.8, playNow: () => { throw new Error("global cue"); } };
w.requestAnimationFrame = (fn) => w.setTimeout(() => fn(Date.now()), 16);
w.cancelAnimationFrame = (id) => w.clearTimeout(id);
const ctx = dom.getInternalVMContext();
vm.runInContext(read("assets/js/challenge-sfx.js"), ctx);
vm.runInContext(read("assets/js/dice-art.js"), ctx);
vm.runInContext(read("assets/js/d20-plain.js"), ctx);
vm.runInContext(read("assets/js/d20-zoom.js"), ctx);
const S = w.SSDNSChallengeSfx;
const Z = w.SSDNSD20Zoom;

function files() {
  return S.trace().filter((row) => row.kind === "play").map((row) => row.file);
}
const fiery = S.plan("roll", true);
const c1 = S.plan("c1", true);
const c2 = S.plan("c2", true);
const c3 = S.plan("c3", true);
const failC1 = S.plan("c1", false);
check("time.fiery", fiery.duration === 1100 && fiery.landAt === 1012 && fiery.ring === false && fiery.land.max === 12 && fiery.roll.delay === 0 && fiery.roll.start === 0);
check("time.c1", c1.duration === 900 && c1.landAt === 900 && c1.land.max === 12);
check("time.c2", c2.duration === 850 && c2.landAt === Math.round(850 * 0.87) && c2.land.max === 12);
check("time.c3", c3.duration === 1000 && c3.landAt === 900 && c3.land.max === 12);
check("time.failInherits", failC1.duration === 900 && failC1.landAt === 900 && failC1.soundSlot === "fail" && failC1.land.max === 8 && failC1.land.pick === "liveFail");
check("time.failNotZero", S.plan("roll", false).duration === 1100 && S.pack.motions.fail.duration === 0);

S.resetTrace();
S.begin(fiery);
S.land(fiery);
const order = S.trace().map((row) => row.kind + ":" + (row.file || row.slot || ""));
const rollAt = order.findIndex((row) => row.indexOf("play:") === 0 && row.indexOf("fireball") >= 0);
const fadeAt = order.findIndex((row) => row.indexOf("fade:") === 0);
const landAt = order.findIndex((row) => row.indexOf("play:") === 0 && row.indexOf("challenge-nat20-crit") >= 0);
check("order.rollThenLand", rollAt >= 0 && fadeAt > rollAt && landAt > fadeAt, order.join(" "));
check("order.noDuplicateLand", files().filter((f) => f.indexOf("challenge-nat20-crit") >= 0).length === 1);

S.resetTrace();
S.begin(failC1);
S.land(failC1);
const failPlay = S.trace().filter((row) => row.kind === "play" && String(row.file).indexOf("challenge-fail") >= 0);
check("cap.fail", failPlay.length === 1 && failPlay[0].max === 8);
const critPlay = S.trace().filter((row) => row.kind === "play" && String(row.file).indexOf("challenge-nat20-crit") >= 0);
check("cap.critSeparate", critPlay.length === 0);

const before = S.trace().length;
S.stop();
check("dismiss.stops", S.trace().slice(before).some((row) => row.kind === "stop"));

S.resetTrace();
const plain = Z.play({ nat: 8, id: "ordinary" });
await new Promise((r) => setTimeout(r, 500));
check("regular.isolated", !S.trace().some((row) => row.kind === "play"), S.trace().map((r) => r.kind).join(","));
await plain;

if (failures.length) {
  console.log(failures.length + " failed");
  process.exit(1);
}
console.log("challenge sfx ok");
process.exit(0);

/**
 * PR78 (supersedes test-pr77): results anchor to the shot's REAL playback start.
 * Shots with load latency, failed shots, results that arrive before the broadcast shot,
 * crit layering, downed chaining, gap spacing, misfire immediacy, caps, and the DMCC call order.
 *   node tools/test-pr78.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const failures = [];
function check(id, cond, detail) { if (!cond) failures.push(id); console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : "")); }

let clock = 1_000_000;
const timers = [];
const started = [];
let latency = {};      /* per-cue load latency in ms; Infinity = never starts; "error" = fails */
const RES = new Set(["hit-gun", "ricochet", "nat20", "nat1", "hit-melee", "crit-melee", "sword-hit", "miss-melee", "enemy-downed", "misfire"]);
/* any non-result file is reported as S (the shot / swing / roll), whichever pool variant played */
const name = (u) => { const n = path.basename(u || "").replace(/(-alt-\d+)?\.mp3$|\.wav$/, ""); return RES.has(n) ? n : "S"; };
function later(fn, ms) { const t = { fn, at: clock + ms }; timers.push(t); return t; }
class FakeAudio {
  constructor(u) { this.src = u || ""; this.volume = 1; this.currentTime = 0; this.playbackRate = 1; this.ev = {}; }
  set src(v) { this._src = v; } get src() { return this._src; }
  load() {}
  cloneNode() { return new FakeAudio(this._src); }
  addEventListener(k, f) { (this.ev[k] = this.ev[k] || []).push(f); }
  emit(k) { (this.ev[k] || []).forEach((f) => f()); }
  play() {
    const n = name(this._src), lag = latency[n] == null ? 0 : latency[n];
    if (lag === "error") { later(() => this.emit("error"), 5); return Promise.resolve(); }
    if (lag !== Infinity) later(() => { started.push({ n, t: clock }); this.emit("playing"); }, lag);
    return Promise.resolve();
  }
  pause() {}
}
const map = JSON.parse(read("assets/sfx/sfx.json"));
const box = { Audio: FakeAudio, Date: { now: () => clock }, localStorage: { getItem() { return null; }, setItem() {} }, location: { pathname: "/", search: "" }, URLSearchParams, CustomEvent: class {}, Math,
  setTimeout: later, clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  fetch: () => Promise.resolve({ ok: true, json: () => map }) };
box.window = box; box.dispatchEvent = () => {};
vm.runInNewContext(read("assets/js/sfx.js"), box, { filename: "sfx.js" });
await new Promise((r) => setTimeout(r, 30));
const A = box.SSDNSAudio;
A.setJitterSource(() => 0.5);
function advance(ms) { const end = clock + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); clock = t.at; t.fn(); } clock = end; }
function run(fn, ms = 3000) { A.resetQueue(); timers.length = 0; started.length = 0; const t0 = clock; fn(t0); advance(ms); return started.map((s) => s.n + "@" + (s.t - t0)).join(" "); }

const T = A.TIMING;
check("const", T.gap === 250 && T.resultAfterShot === 750 && T.downedAfterResult === 450 && T.critLead === 150 && T.critBeforeShot === false && T.maxWait === 1800 && T.shotStartTimeout === 1000 && T.jitter === 20, JSON.stringify(T));

latency = {};
check("hit.basic", run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); }) === "S@0 hit-gun@750");
/* the 0.3.59 bug: slow shot (300 ms load) used to lose to a cached hit */
latency = { S: 300 };
let r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); });
check("hit.afterSlowShot", r === "S@300 hit-gun@1050", r);
latency = { S: 700 };
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); });
check("hit.veryslow.capped", r === "S@700 hit-gun@1450", r);
latency = { S: Infinity };
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); });
check("shot.never.resultAnyway", r === "hit-gun@1750", r);
latency = {};
/* result first (DMCC verdict before the player's broadcast shot): it waits for the shot */
r = run(() => { A.playOutcome({ gun: true, name: "Navy" }, "hit"); advance(200); A.play("revolver"); });
check("result.beforeShot.waits", r === "S@200 hit-gun@950", r);
r = run(() => { A.playOutcome({ name: "Machete" }, "hit"); });
check("result.noShot.playsAnyway", r === "sword-hit@750", r);
/* crit: sting 150 ms before the hit, both after the shot */
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy", nat: 20 }, "crit"); });
check("crit.gun.layered", r === "S@0 nat20@600 hit-gun@750", r);
latency = { S: 250 };
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy", nat: 20 }, "crit"); });
check("crit.neverBeforeShot", r === "S@250 nat20@850 hit-gun@1000", r);
latency = {};
r = run(() => { A.play("slash"); A.playOutcome({ name: "Machete" }, "crit"); });
check("crit.melee", r === "S@0 crit-melee@750", r);
/* downed: 450 ms after the result's real start */
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); A.play("enemy-downed"); });
check("chain", r === "S@0 hit-gun@750 enemy-downed@1200", r);
latency = { "hit-gun": 100 };
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); A.play("enemy-downed"); });
check("chain.slowHit", r === "S@0 hit-gun@850 enemy-downed@1300", r);
latency = {};
r = run(() => { A.play("enemy-downed"); });
check("downed.alone", r === "enemy-downed@0", r);
/* gaps, misfire, idle */
r = run(() => { A.play("revolver"); A.play("shotgun"); A.play("bow"); });
check("gap", r === "S@0 S@250 S@500", r);
r = run(() => { A.play("revolver"); A.play("shotgun"); A.play("misfire"); });
check("misfire.now", r.startsWith("S@0 misfire@0"), r);
r = run(() => { for (let k = 0; k < 12; k++) A.play("revolver"); });
check("cap", Math.max(...r.split(" ").map((x) => +x.split("@")[1])) <= 1800, r);
for (const j of [0, 1]) {
  A.setJitterSource(() => j);
  r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "miss"); });
  check("jitter." + j, Math.abs(+r.split("@").pop() - 750) === 20, r);
}
A.setJitterSource(() => 0.5);
/* broadcast cues come in through play() */
const dj = read("assets/js/dm-join.js"), v2 = read("dm/assets/js/v2.js"), sx = read("assets/js/sfx.js");
check("bcast.player", /if \(sfxName\) root\.SSDNSAudio\.play\(sfxName\)/.test(dj) && /root\.SSDNSAudio\.play\(heard\)/.test(dj));
check("bcast.dm", /if \(heard\) window\.SSDNSAudio\.play\(heard\)/.test(v2));
const shared = sx.match(/var SHARED_CUES = \{([\s\S]*?)\};/)[1];
check("shared.unchanged", (shared.match(/[a-z0-9"-]+: 1/g) || []).length === 36);
/* no play site bypasses the queue: the only new Audio( calls live in sfx.js / music-deck.js */
const files = ["assets/js/app.js", "assets/js/sheet-extras.js", "assets/js/sheet-playtest.js", "assets/js/dm-join.js", "assets/js/table-ux.js", "assets/js/action-pips.js", "assets/js/creator.js", "dm/assets/js/v2.js", "dm/assets/js/dmcc.js", "dm/assets/js/music-dm.js"];
check("noBypass", files.every((f) => !/new Audio\(/.test(read(f))));
/* DMCC enemy attack: strike cue before outcome */
const ea = v2.indexOf("playTableSfx(strikeCue(atk));"), eo = v2.indexOf("window.SSDNSAudio.playOutcome({\n      id: atk.weapon");
check("dm.order", ea > 0 && eo > ea);
/* preload */
check("preload", /function preloadSfx\(\)/.test(sx) && /cloneNode/.test(sx));
/* last: a failed file is marked missing for the session */
latency = { S: "error" };
r = run(() => { A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "miss"); });
check("shot.error.resultAnyway", r === "ricochet@755", r);
latency = {};
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.142" && ver.dmcc === "0.2.155");
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR78 checks passed.");
process.exit(failures.length ? 1 : 0);

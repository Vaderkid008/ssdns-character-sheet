/**
 * PR77: SFX play queue. Near-simultaneous cues are spaced SFX_GAP_MS apart; result cues
 * (hit/miss/crit/nat1/nat20) wait RESULT_DELAY_MS; misfire is immediate; broadcast cues
 * (which arrive through play()) get the same spacing; the shared list is unchanged.
 *   node tools/test-pr77.mjs
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
class FakeAudio { constructor(u) { this.url = u; this.volume = 1; } play() { started.push({ url: this.url, t: clock }); return Promise.resolve(); } addEventListener() {} pause() {} }
const map = JSON.parse(read("assets/sfx/sfx.json"));
const FakeDate = { now: () => clock };
const box = { Audio: FakeAudio, Date: FakeDate, localStorage: { getItem() { return null; }, setItem() {} }, location: { pathname: "/", search: "" }, URLSearchParams, CustomEvent: class {}, Math,
  setTimeout: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; }, clearTimeout: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  fetch: () => Promise.resolve({ ok: true, json: () => map }) };
box.window = box; box.dispatchEvent = () => {};
vm.runInNewContext(read("assets/js/sfx.js"), box, { filename: "sfx.js" });
await new Promise((r) => setTimeout(r, 30));
const A = box.SSDNSAudio;
A.setJitterSource(() => 0.5); /* 0.5 -> zero jitter, so timings are exact below */
function advance(ms) { const end = clock + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); clock = t.at; t.fn(); } clock = end; }
const name = (u) => path.basename(u).replace(/(-alt-\d+)?\.mp3$|\.wav$/, "");

check("const", A.TIMING.gap === 150 && A.TIMING.resultAfterShot === 300 && A.TIMING.downedAfterResult === 300 && A.TIMING.jitter === 20 && A.TIMING.maxWait === 800);
/* 1: shot then result */
A.resetQueue(); started.length = 0; const t0 = clock;
A.play("revolver");
A.playOutcome({ gun: true, name: "Navy revolver" }, "hit");
check("shot.now", started.length === 1 && name(started[0].url) === "revolver" && started[0].t === t0);
advance(1000);
check("result.delayed", started.length === 2 && name(started[1].url) === "hit-gun" && started[1].t - t0 === 300, JSON.stringify(started));
/* 2: burst of near-simultaneous cues spaced 150 ms */
A.resetQueue(); started.length = 0; const t1 = clock;
A.play("revolver"); A.play("shotgun"); A.play("bow");
advance(1000);
check("burst.spaced", started.map((s) => s.t - t1).join() === "0,150,300", started.map((s) => s.t - t1).join());
/* 3: misfire immediate even behind a queue */
A.resetQueue(); started.length = 0; const t2 = clock;
A.play("revolver"); A.play("shotgun"); A.play("misfire");
check("misfire.now", started.length === 2 && name(started[1].url) === "misfire" && started[1].t === t2);
advance(1000);
/* 4: crit / miss / nat1 / nat20 all delayed */
for (const [info, res, want] of [[{ name: "Machete" }, "crit", "crit-melee"], [{ gun: true, name: "Navy" }, "miss", "ricochet"], [{ name: "Machete", nat: 1 }, "miss", "nat1"], [{ gun: true, name: "Navy" }, "crit", "nat20"]]) {
  A.resetQueue(); started.length = 0; const t = clock;
  A.playOutcome(info, res);
  check("result." + want + ".notYet", started.length === 0);
  advance(400);
  check("result." + want, started.length === 1 && name(started[0].url) === want && started[0].t - t === 300, JSON.stringify(started));
}
/* result follows the shot's onset, not the report: shot, 120 ms of UI, then the verdict */
A.resetQueue(); started.length = 0; let ts = clock;
A.play("revolver"); advance(120); A.playOutcome({ gun: true, name: "Navy" }, "hit"); advance(1000);
check("result.anchored", started[1].t - ts === 300, String(started[1] && started[1].t - ts));
/* shot -> hit -> downed chain: 0 / 300 / 600 (< 900) */
A.resetQueue(); started.length = 0; ts = clock;
A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "hit"); A.play("enemy-downed"); advance(2000);
check("chain.order", started.map((x) => name(x.url)).join() === "revolver,hit-gun,enemy-downed");
check("chain.times", started.map((x) => x.t - ts).join() === "0,300,600", started.map((x) => x.t - ts).join());
/* DM side: downed after a broadcast shot with no local hit -> shot + 300 + 300 */
A.resetQueue(); started.length = 0; ts = clock;
A.play("shotgun"); advance(50); A.play("enemy-downed"); advance(2000);
check("chain.dmNoHit", started[1].t - ts === 600, String(started[1] && started[1].t - ts));
/* lone downed / lone result: short and never laggy */
A.resetQueue(); started.length = 0; ts = clock; A.play("enemy-downed"); advance(1000);
check("downed.alone", started[0].t - ts === 300);
/* jitter stays within +/-20 ms */
for (const r of [0, 1]) {
  A.setJitterSource(() => r); A.resetQueue(); started.length = 0; ts = clock;
  A.play("revolver"); A.playOutcome({ gun: true, name: "Navy" }, "miss"); advance(1000);
  check("jitter." + r, Math.abs(started[1].t - ts - 300) === 20, String(started[1].t - ts));
}
A.setJitterSource(() => 0.5);
/* cap: a long queue never waits more than 800 ms */
A.resetQueue(); started.length = 0; ts = clock;
for (let k = 0; k < 10; k++) A.play("revolver");
advance(3000);
check("cap", Math.max(...started.map((x) => x.t - ts)) <= 800);
/* 5: broadcast arrivals use play() and so the queue */
const dj = read("assets/js/dm-join.js"), v2 = read("dm/assets/js/v2.js");
check("bcast.player", /if \(sfxName\) root\.SSDNSAudio\.play\(sfxName\)/.test(dj) && /root\.SSDNSAudio\.play\(heard\)/.test(dj));
check("bcast.dm", /if \(heard\) window\.SSDNSAudio\.play\(heard\)/.test(v2));
A.resetQueue(); started.length = 0; const t3 = clock;
A.play(A.sharedCue("revolver", "other", "me")); A.play(A.sharedCue("shotgun", "other2", "me"));
advance(500);
check("bcast.spaced", started.map((s) => s.t - t3).join() === "0,150");
/* 6: broadcast list unchanged from 0.3.56 */
const shared = read("assets/js/sfx.js").match(/var SHARED_CUES = \{([\s\S]*?)\};/)[1];
check("shared.unchanged", (shared.match(/[a-z0-9"-]+: 1/g) || []).length === 36, String((shared.match(/[a-z0-9"-]+: 1/g) || []).length));
/* 7: idle queue does not delay a lone sound */
advance(5000); started.length = 0; const t4 = clock; A.play("roll");
check("idle.now", started.length === 1 && started[0].t === t4);
const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.57" && ver.dmcc === "0.2.70");
console.log(failures.length ? "\n" + failures.length + " FAILED: " + failures.join(", ") : "\nAll PR77 checks passed.");
process.exit(failures.length ? 1 : 0);

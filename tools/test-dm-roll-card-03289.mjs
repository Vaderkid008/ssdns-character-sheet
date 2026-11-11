/**
 * DM compact Challenge cards (sheet 0.3.291 / DMCC 0.2.304).
 * The component can render anywhere. This draft only turns it on for the DM.
 *   node tools/test-dm-roll-card-03289.mjs
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
check("ver", ver.sheet === "0.3.291" && ver.dmcc === "0.2.304");
check("rules.clean", !read("assets/data/rules.js").includes("ssdns-roll-cards") && !read("database.rules.json").includes("ssdns-roll-cards"));

const join = read("assets/js/dm-join.js");
check("player.overlay", join.includes("Zoom.present(pose)") && join.includes('host.id = "ssdns-challenge"'));
const map = read("map/ssdns-map.js");
check("map.dm-only", map.includes('role === "dm" && rollCard') && map.includes("SSDNSD20Zoom.play"));
const dm = read("dm/assets/js/v2.js");
check("dm.card-first", dm.includes("Card.offer(Card.fromFeed(row))") && dm.includes("Zoom.play(row.zoom)"));
check("dm.audience", read("dm/assets/js/dmcc.js").includes('SSDNSRollCard.setAudience("dm")'));
check("player.not-enabled", !read("index.html").includes("roll-card.js"));

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/dm/", runScripts: "dangerously" });
const w = dom.window;
const played = [];
w.SSDNSChallengeSfx = { lockpick() { played.push("lock"); }, mid() { played.push("mid"); } };
w.SSDNSAudio = { play(name) { played.push(name); } };
const script = w.document.createElement("script");
script.textContent = read("assets/js/roll-card.js");
w.document.body.appendChild(script);
const C = w.SSDNSRollCard;

check("off.silent", C.offer({ id: "a", name: "Ada", label: "Perception" }) == null && !w.document.getElementById("ssdns-roll-cards"));
C.setAudience("player");
check("player.silent", !C.enabled() && C.offer({ id: "a", name: "Ada" }) == null);

C.setAudience("dm");
check("wants.challenge", C.wants({ challenge: true, label: "Perception" }));
check("wants.lock", C.wants({ lockpick: true, challenge: true, label: "Pick lock" }));
check("wants.force", C.wants({ challenge: true, label: "Force open" }));
check("wants.shove", C.wants({ challenge: true, label: "Shove" }, { event: "prop-shove", nat: 12 }));
check("wants.not-attack", !C.wants({ fancy: true, kind: "crit", nat: 20, label: "Attack" }));

const feed = C.fromFeed({
  id: "lock1",
  fromName: "Jolene",
  text: "Jolene d20 14 +2 Dex +2 tools = 18 vs DC 15. Unlocked.",
  check: "Pick lock — Dex (thieves' tools)",
  die: { nat: 14, challenge: true, lockpick: true, label: "Pick lock" },
  total: 18,
  dc: 15,
  success: true
});
check("feed.label", feed.label === "Pick lock — Dex (thieves' tools)" && feed.nat === 14 && feed.total === 18 && feed.dc === 15 && feed.success === true, JSON.stringify(feed));

C.setTiming({ holdMs: 4000, spinMs: 15 });
const one = C.offer({ id: "p1", name: "Ada Lovelace", label: "Perception", nat: 18, total: 20, dc: 15, success: true });
check("card.shown", !!one && one.querySelector(".who").textContent === "Ada Lovelace" && one.querySelector(".face").textContent === "AL");
await new Promise((r) => setTimeout(r, 30));
check("card.landed", one.classList.contains("is-land") && one.querySelector(".die b").textContent === "18" && /20 vs DC 15 · success/.test(one.querySelector(".result").textContent));
const host = w.document.getElementById("ssdns-roll-cards");
check("host.pass", host && /pointer-events:\s*none/.test(w.document.getElementById("ssdns-roll-card-css").textContent) && /pointer-events:\s*auto/.test(w.document.getElementById("ssdns-roll-card-css").textContent));

const two = C.offer({ id: "p2", name: "Bea", portrait: "https://example.invalid/x.png", label: "Pick lock — Dex (thieves' tools)", nat: 1, total: 3, dc: 15, success: false, lockpick: true });
check("stack", host.children.length === 2 && host.children[1] === two);
check("sfx", played.indexOf("lock") >= 0 && played.indexOf("mid") >= 0);
two.querySelector("img.face").dispatchEvent(new w.Event("error"));
check("face.fallback", two.querySelector(".face").textContent === "B" && !two.querySelector("img.face"));
one.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
check("click.dismiss", C.count() === 1 && !w.document.querySelector('[data-roll-card="p1"]'));
C.setTiming({ holdMs: 20, spinMs: 5 });
C.offer({ id: "p3", name: "Caleb", label: "Force — Str (Athletics)", nat: 8, total: 10, dc: 15, success: false });
await new Promise((r) => setTimeout(r, 40));
check("auto.dismiss", !w.document.querySelector('[data-roll-card="p3"]'));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("\nroll card ok");
process.exit(0);

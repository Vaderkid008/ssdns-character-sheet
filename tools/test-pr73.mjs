/**
 * PR73: round art. Shells by gauge (.410 blue slim, 12 ga pre-#71 red, 10 ga green large, brass bases),
 * slugs = gauge hull + black band + white S, repeater follows gauge, concentric end-on shell head
 * with bold gauge ring, copper-tip tube rounds, big rifle-musket ball, hex serpent-spiral rune,
 * powder & ball misfire = lead ball + red ring/X (other misfires unchanged).
 *   node tools/test-pr73.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id);
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
const read = (r) => fs.readFileSync(path.join(root, r), "utf8");
const sb = {}; sb.window = sb; vm.createContext(sb);
try { vm.runInContext(read("assets/data/rules.js"), sb); } catch (e) {}
vm.runInContext(read("assets/js/ammo-display.js"), sb);
const A = sb.SSDNSAmmoDisplay, css = read("assets/css/ammo-display.css");
const doc = new JSDOM("<body></body>").window.document;
function el(spec, sel) { doc.body.innerHTML = A.html(spec); return [...doc.querySelectorAll(sel || ".ammo-round")]; }
const shell = (tier, extra) => Object.assign({ name: "x", group: "shotgun", ammo: "shell", action: "Break-action", tier, cap: 1, loaded: 1 }, extra || {});

const g410 = el(shell("light"))[0], g12 = el(shell("medium"))[0], g10 = el(shell("heavy"))[0];
check("gauge.410.blue", g410.className.includes("is-gauge-410") && g410.innerHTML.includes('fill="#3f8fe0"'));
check("gauge.12.pre71red", g12.innerHTML.includes('fill="#c4322e"') && g12.innerHTML.includes('stroke="#8e241f"') && g12.innerHTML.includes('viewBox="0 0 56 20"'));
check("gauge.10.green", g10.innerHTML.includes('fill="#2f7a3a"'));
check("gauge.brass", [g410, g12, g10].every((b) => b.innerHTML.includes('fill="#d7b15e"')));
const vb = (b) => b.innerHTML.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number);
check("gauge.sizes", vb(g410)[1] < vb(g12)[1] && vb(g12)[1] < vb(g10)[1]);
const slug = el(shell("medium", { load: "slug" }))[0];
check("slug.band", slug.innerHTML.includes('fill="#111111"') && slug.innerHTML.includes(">S<") && slug.innerHTML.includes('fill="#c4322e"') && !slug.innerHTML.includes("#2a62b5"));
const rep = el({ weapon: "lancaster-lever-shotgun", name: "L", group: "shotgun", ammo: "shell", action: "Lever (tube)", tier: "light", cap: 4, loaded: 2 }, ".ammo-tube .ammo-round");
check("repeater.followsGauge", rep.length === 2 && rep[0].innerHTML.includes('fill="#3f8fe0"') && !rep[0].innerHTML.includes("#c4322e"));
const endon = el({ name: "x", group: "shotgun", ammo: "shell", load: "slug", action: "Revolver", ammoDisplay: "cylinder", tier: "heavy", cap: 4, loaded: 4 });
check("endon.classes", endon[0].className.includes("rt-shell") && endon[0].className.includes("is-gauge-10") && endon[0].className.includes("is-slug"));
check("endon.concentric", /rt-shell \{[^}]*circle closest-side at 50% 50%/.test(css) && /rt-shell\.is-slug \{ --slug: #0d0d0d/.test(css) && /is-gauge-410 \{[^}]*--g: \.74/.test(css));
const tube = el({ weapon: "lancaster-repeating-rifle", name: "R", action: "Lever (tube)", ammo: "cartridge", tier: "medium", cap: 6, loaded: 2 }, ".ammo-tip");
check("tube.copperTip", tube.length && tube[0].getAttribute("fill") === "url(#ammoTipCu)");
check("musket.bigBall", A.roundType({ weapon: "dull-co-rifle-musket" }) === "ball" && /ssdns-ammo-dots\.is-demo \.ammo-round\.rt-ball \{ width: 47px/.test(css));
check("hex.serpent", /rt-hex \{[^}]*data:image\/svg\+xml/.test(css) && css.includes(encodeURIComponent("a12 12 0 0 1 12 -12 M22 8")) && /is-strip \.ammo-round\.is-primer\.is-loaded\.rt-hex/.test(css));
const bnc = el({ weapon: "navy-army-ball-n-cap-revolver", name: "B", action: "Percussion revolver (slow)", ammo: "percussion", cap: 6, next: 0, chambers: [1, "jam", 1, 1, 1, 1] });
check("misfire.ball", bnc[1].className.includes("is-jam") && bnc[1].className.includes("rt-ball") && /\.is-jam\.rt-ball \{[^}]*#e23b32[^}]*#7c8288/.test(css));
check("next.outline", bnc[0].className.includes("is-next"));
check("misfire.othersUnchanged", /\.ammo-round\.is-jam \{\s*background: radial-gradient\(circle at 38% 32%, #ffb0a8/.test(css));
check("noSamplePage", !fs.existsSync(path.join(root, "sample-rounds.html")));
if (failures.length) { console.error("pr73 FAIL: " + failures.join(", ")); process.exit(1); }
console.log("pr73 ok");

/**
 * Hex shells take Eldorite shard colors by level, and hover names the loaded spell.
 * Sheet 0.3.200 / DMCC 0.2.213.
 *   node tools/test-hex-eldorite.mjs
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
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.200" && version.sheetBuild === "sheet-playtest-v03200");
check("ver.dmcc", version.dmcc === "0.2.213" && version.dmccBuild === "dmcc-playtest-v02213");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.200"') && read("assets/js/app.js").includes("sheet-playtest-v03200"));
check("ver.dm", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.213"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02213"));
check("html.sheet", read("index.html").includes("assets/js/app.js?v=0.3.200-eldorite") && read("index.html").includes("assets/js/ammo-display.js?v=0.3.200-eldorite") && read("index.html").includes("assets/css/ammo-display.css?v=0.3.200-eldorite"));
check("html.dm", read("dm/index.html").includes("assets/js/dmcc.js?v=0.2.213-eldorite") && read("dm/index.html").includes("../assets/js/ammo-display.js?v=0.3.200-eldorite"));

const sb = {};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("assets/js/ammo-display.js"), sb);
const A = sb.SSDNSAmmoDisplay;
const css = read("assets/css/ammo-display.css");
const doc = new JSDOM("<body></body>").window.document;

const EXPECT = {
  1: { tone: "#fff", bits: ["#fff", "#d9d6cc"], dual: false },
  2: { tone: "#8cc0ff", bits: ["#8cc0ff", "#2c62b5"], dual: false },
  3: { tone: "#9ff2d6", bits: ["#9ff2d6", "#1f8f6d"], dual: false },
  4: { tone: "#ffe89a", bits: ["#ffe89a", "#c4921c"], dual: false },
  5: { tone: "#d8b3ff", bits: ["#d8b3ff", "#6b35a8"], dual: false },
  6: { tone: "#ff6a5c", bits: ["#ff6a5c", "#b3121a"], dual: false },
  7: { tone: "#8cc0ff", bits: ["#8cc0ff", "#2c62b5", "#9ff2d6", "#1f8f6d"], dual: true },
  8: { tone: "#9ff2d6", bits: ["#9ff2d6", "#1f8f6d", "#ffe89a", "#c4921c"], dual: true },
  9: { tone: "#ffe89a", bits: ["#ffe89a", "#c4921c", "#d8b3ff", "#6b35a8"], dual: true },
  10: { tone: "#d8b3ff", bits: ["#d8b3ff", "#6b35a8", "#ff6a5c", "#b3121a"], dual: true }
};

for (let lv = 1; lv <= 10; lv++) {
  const paint = A.hexPaint(lv);
  const row = EXPECT[lv];
  const hard = !row.dual || (paint.fill.includes("50%,") && paint.fill.split("50%").length >= 3);
  check(
    "paint.l" + lv,
    paint.level === lv && paint.dual === row.dual && paint.tone === row.tone && paint.ink === "#1a120c" &&
      row.bits.every((bit) => paint.fill.includes(bit)) && hard &&
      !paint.fill.includes("#c4b5fd") && !paint.fill.includes("#9b6fd6"),
    paint.fill
  );
}

const fireball = "k:hex:3:spent:3:" + encodeURIComponent("Fireball");
const missile = "k:hex:1:spent:1:" + encodeURIComponent("Magic Missile");
const wish = "k:hex:10:spent:9:" + encodeURIComponent("Wish");
const dual = "k:hex:7:spent:7:" + encodeURIComponent("Delayed Blast Fireball");
doc.body.innerHTML = A.html({
  name: "Blacksnake",
  action: "Caster cylinder",
  ammoDisplay: "cylinder",
  ammo: "cartridge",
  tier: "medium",
  cap: 6,
  chambers: [fireball, missile, "4", dual, wish, "k:cartridge::medium"]
});
const rounds = [...doc.querySelectorAll(".ammo-round")];
check("cyl.count", rounds.length === 6, String(rounds.length));
function styleOf(el) { return el.getAttribute("style") || ""; }
check("face.fireball", rounds[0].className.includes("rt-hex") && styleOf(rounds[0]).includes("#9ff2d6") && styleOf(rounds[0]).includes("--hex-face:linear-gradient"));
check("hover.fireball", rounds[0].getAttribute("title") === "Fireball · Hex shell 3" && rounds[0].getAttribute("aria-label") === "Fireball · Hex shell 3" && rounds[0].textContent === "3");
check("hover.missileSpin", rounds[1].getAttribute("title") === "Magic Missile · Hex shell 1 · Spin (free)" && rounds[1].textContent === "1");
check("hover.unnamed", rounds[2].getAttribute("title") === "Hex shell 4 · Spin (free)" && !/fireball|missile|wish/i.test(rounds[2].getAttribute("title") || "") && styleOf(rounds[2]).includes("#ffe89a"));
check("face.dual", rounds[3].textContent === "7" && styleOf(rounds[3]).includes("#8cc0ff") && styleOf(rounds[3]).includes("#9ff2d6") && styleOf(rounds[3]).includes("50%"));
check("face.l10", rounds[4].textContent === "10" && styleOf(rounds[4]).includes("#d8b3ff") && styleOf(rounds[4]).includes("#ff6a5c") && styleOf(rounds[4]).includes("#b3121a"));
check("brass.untouched", rounds[5].className.includes("rt-cart") && !rounds[5].className.includes("rt-hex") && styleOf(rounds[5]).includes("--case:#e0b84a") && !styleOf(rounds[5]).includes("--hex-face"));
check("plainFlag.notHex", A.roundType({ ammo: "cartridge", tier: "medium" }, { raw: 1 }) === "cart");

doc.body.innerHTML = A.html({
  ammoDisplay: "cylinder",
  action: "Caster cylinder",
  cap: 1,
  chambers: [fireball],
  tip: function () { return "Fireball · Hex shell 3 (slot spent)"; }
});
const hosted = doc.querySelector(".ammo-round");
check("hover.hostTip", hosted && hosted.getAttribute("title") === "Fireball · Hex shell 3 (slot spent)");

const look = A.roundLook({ chambers: ["", dual] });
check("look.dual", look.type === "hex" && look.hexLevel === 7 && look.dual === true && look.hexColors.join() === "#8cc0ff,#9ff2d6" && look.spell === "Delayed Blast Fireball");
const bare = A.roundLook({ chambers: ["6"] });
check("look.red", bare.hexLevel === 6 && bare.tone === "#ff6a5c" && !bare.spell && bare.dual === false);

check("css.noSerpent", css.includes("var(--hex-face") && !css.includes("3fd36b") && !css.includes("c8ffd0") && !css.includes("data:image/svg+xml"));
check("src.noPurpleScale", !read("assets/js/ammo-display.js").includes("#c4b5fd") && !read("assets/js/app.js").includes("#c4b5fd") && !read("dm/assets/js/dmcc.js").includes("HEX_CASE") && read("dm/assets/js/dmcc.js").includes("hexPaint(lv)"));
check("src.sheetLabel", read("assets/js/app.js").includes('p.spell + " · "') && read("assets/js/app.js").includes("hexPaintOf"));
check("map.split", read("map/ssdns-map.js").includes("look.hexColors") && read("map/ssdns-map.js").includes("cols[1]"));

if (failures.length) {
  console.error("hex-eldorite FAIL: " + failures.join(", "));
  process.exit(1);
}
console.log("hex-eldorite ok");

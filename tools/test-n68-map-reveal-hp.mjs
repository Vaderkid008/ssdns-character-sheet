/**
 * N68 — Reveal HP on the DM map token drawer.
 * Players see that token's under-token bar only when reveal.hp is public.
 * Own PCs still use canControl. Name, AC, and the stat block are not flipped.
 *   node tools/test-n68-map-reveal-hp.mjs
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + String(detail).slice(0, 400) : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + String(detail).slice(0, 400) : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const sb = { console };
sb.window = sb;
sb.globalThis = sb;
vm.createContext(sb);
vm.runInContext(read("assets/js/apply-guard.js"), sb, { filename: "apply-guard.js" });
const G = sb.SSDNSApplied;

const outlaw = {
  kind: "enemy",
  name: "Outlaw",
  ac: 14,
  hp: 6,
  maxHp: 11,
  reveal: { name: false, ac: false, hp: true, block: false },
  card: { attacks: [{ name: "Revolver" }], tactics: "Flank" }
};
const shown = G.publicEnemy(outlaw, 0, []);
const bar = G.publicBarHp(shown);
check("pub.hpOnly", bar && bar.hp === 6 && bar.maxHp === 11 && bar.ac == null && bar.block == null, JSON.stringify(bar));
check("pub.nameStaysHidden", shown.name === G.HIDDEN_ENEMY_NAME && !(shown.revealed && shown.revealed.ac) && !(shown.revealed && shown.revealed.block), JSON.stringify(shown));
const hiddenHp = G.publicEnemy(Object.assign({}, outlaw, { reveal: { name: false, ac: true, hp: false, block: true } }), 0, []);
check("pub.noHpFlag", G.publicBarHp(hiddenHp) == null && hiddenHp.revealed && hiddenHp.revealed.ac === 14 && hiddenHp.revealed.block, JSON.stringify(hiddenHp.revealed));
check("pub.acNotCopied", G.publicBarHp({ revealed: { hp: 3, maxHp: 9, ac: 12, block: { tactics: "secret" } } }).ac == null);

const mapJs = read("map/ssdns-map.js");
const barStart = mapJs.indexOf("window.SSDNSMapBar");
const barEnd = mapJs.indexOf("window.SSDNSMap =");
check("src.barExport", barStart > 0 && barEnd > barStart);
const barSb = { console, isFinite, Number };
barSb.window = barSb;
barSb.globalThis = barSb;
vm.createContext(barSb);
vm.runInContext(mapJs.slice(barStart, barEnd), barSb, { filename: "ssdns-map-bar.js" });
const B = barSb.SSDNSMapBar.hp;

check("bar.dm", JSON.stringify(B({ role: "dm", dmCur: 4, dmMax: 10 })) === JSON.stringify({ cur: 4, max: 10 }));
check("bar.dmToken", JSON.stringify(B({ role: "dm", dmCur: null, dmMax: null, tokenHp: 2, tokenMax: 8 })) === JSON.stringify({ cur: 2, max: 8 }));
check("bar.noPool", B({ role: "dm", noHpPool: true, dmCur: 0, dmMax: 0 }) == null);
check("bar.own", JSON.stringify(B({ role: "player", canControl: true, ownCur: 9, ownMax: 12, revealed: { hp: 1, maxHp: 11 } })) === JSON.stringify({ cur: 9, max: 12 }));
check("bar.revealed", JSON.stringify(B({ role: "player", canControl: false, revealed: { hp: 6, maxHp: 11 } })) === JSON.stringify({ cur: 6, max: 11 }));
check("bar.hidden", B({ role: "player", canControl: false, ownCur: 9, ownMax: 12 }) == null);
check("bar.zero", JSON.stringify(B({ role: "player", canControl: false, revealed: { hp: 0, maxHp: 11 } })) === JSON.stringify({ cur: 0, max: 11 }));
check("bar.noMax", B({ role: "player", canControl: false, revealed: { hp: 4 } }) == null);

const v2 = read("dm/assets/js/v2.js");
const host = read("map/ssdns-map-host.js");
const revealFn = v2.slice(v2.indexOf("async revealHp"), v2.indexOf("async hp(detail)"));
check("src.drawer", mapJs.includes('data-act="revealHp"') && mapJs.includes("> Reveal HP</label>"));
check("src.enemyOnly", mapJs.includes("(!isPc && !noHpPool)"));
check("src.wire", host.includes('"drawer:revealHp": "revealHp"'));
check("src.flagOnlyHp", revealFn.includes("flags.hp = !!detail.on") && !revealFn.includes("flags.name") && !revealFn.includes("flags.ac") && !revealFn.includes("flags.block"));
check("src.notPlayer", revealFn.includes('row.kind === "player"'));
check("src.publish", v2.includes("entry.revealed = bar") && v2.includes("entry.mapTokenId") && v2.includes("publicBarHp"));
check("src.dmKeepsPool", v2.includes("delete merged.revealed"));
check("src.fightCard", v2.includes('box("hp", "Reveal HP")') && v2.includes('data-reveal="${key}"'));
const pubTok = mapJs.slice(mapJs.indexOf("function publicToken"), mapJs.indexOf("function saveToken"));
check("src.publicTokenNoHp", !pubTok.includes("hp:") && !pubTok.includes("maxHp"));
check("src.rulesUntouched", !read("assets/data/rules.js").includes("publicBarHp") && !read("database.rules.json").includes("revealHp") && read("database.rules.json").includes("!newData.hasChild('hp')"));

const ver = JSON.parse(read("version.json"));
check("ver", ver.sheet === "0.3.148" && ver.dmcc === "0.2.161" && ver.sheetBuild === "sheet-playtest-v03148" && ver.dmccBuild === "dmcc-playtest-v02161", JSON.stringify(ver));
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.148"'));
check("ver.dmcc", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.161"'));

if (failures.length) {
  console.log("\n" + failures.length + " FAILED");
  process.exit(1);
}
console.log("n68 map reveal hp ok");

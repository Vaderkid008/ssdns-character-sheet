/**
 * N90 Dry Fork Water Stop showcase map (sheet 0.3.178 / DMCC 0.2.191).
 *   node tools/test-n90-dry-fork.mjs
 * Built-in My Maps scene plus pack walls. Draft map.json is not loaded.
 * rules.js is not edited. No encounter tokens.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(id, cond, detail) {
  if (!cond) failures.push(id + (detail ? " — " + detail : ""));
  console.log((cond ? "ok  " : "FAIL") + "  " + id + (detail && !cond ? " — " + detail : ""));
}
function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function webpSize(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  if (buf.slice(0, 4).toString() !== "RIFF" || buf.slice(8, 12).toString() !== "WEBP" || buf.slice(12, 16).toString() !== "VP8 ") return null;
  const o = 20;
  if (buf[o + 3] !== 0x9d || buf[o + 4] !== 0x01 || buf[o + 5] !== 0x2a) return null;
  return { w: buf.readUInt16LE(o + 6) & 0x3fff, h: buf.readUInt16LE(o + 8) & 0x3fff, bytes: buf.length };
}

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.332" && version.sheetBuild === "sheet-playtest-v03332", JSON.stringify(version));
check("ver.dmcc", version.dmcc === "0.2.345" && version.dmccBuild === "dmcc-playtest-v02345");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.332"') && read("assets/js/app.js").includes("sheet-playtest-v03332"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.345"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02345"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sb = {};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("map/map-packs.js"), sb);
const scene = sb.SSDNS_MAP_PACKS.scenes.find((s) => s.id === "scn_dry_fork");
check("pack.scene", !!scene && scene.name === "Dry Fork Water Stop" && scene.group === "Showcase");
check("pack.grid", scene && scene.grid.cols === 40 && scene.grid.rows === 30 && scene.grid.px === 70);
check("pack.paths", scene && exists("map/" + scene.img) && exists("map/" + scene.thumb));
const webp = webpSize("map/packs/showcase-dry-fork/showcase-dry-fork_40x30_70px-painted.webp");
check("pack.webp", webp && webp.w === 2800 && webp.h === 2100 && webp.bytes > 5e5 && webp.bytes < 1.5e6 && !exists("map/packs/showcase-dry-fork/showcase-dry-fork_40x30_70px.png"), JSON.stringify(webp));
const wallsFile = JSON.parse(read("map/packs/showcase-dry-fork/showcase-dry-fork.walls.json"));
check("pack.walls", scene && scene.walls.length === 31 && JSON.stringify(scene.walls) === JSON.stringify(wallsFile));
const bad = (scene ? scene.walls : []).filter((w) => {
  const ints = [w.x1, w.y1, w.x2, w.y2].every((n) => Number.isInteger(n));
  const inside = [w.x1, w.x2].every((n) => n >= 0 && n <= 40) && [w.y1, w.y2].every((n) => n >= 0 && n <= 30);
  const axis = w.x1 === w.x2 || w.y1 === w.y2;
  return !ints || !inside || !axis;
});
check("pack.wallsOnGrid", bad.length === 0, JSON.stringify(bad.slice(0, 2)));
check("pack.doors", scene && scene.walls.filter((w) => w.door).length === 6 && scene.walls.filter((w) => w.window).length === 4);

const mapJson = JSON.parse(read("map/packs/showcase-dry-fork/showcase-dry-fork.map.json"));
check("draft.status", /DRAFT/i.test(String(mapJson._status || "")) && Array.isArray(mapJson.zones) && mapJson.zones.length > 0);
check("draft.notLoaded", !read("map/ssdns-map.js").includes("showcase-dry-fork.map.json") && !read("map/ssdns-map.js").includes("Dust Devil"));
check("play.seed", read("map/ssdns-map.js").includes("function seedPackPlay(sc)") && scene.play && scene.play.tokens.length >= 12);
check("layout", exists("map/packs/showcase-dry-fork/LAYOUT-KEY.md") && read("map/packs/showcase-dry-fork/LAYOUT-KEY.md").includes("Dry Fork Water Stop"));

const mapSrc = read("map/ssdns-map.js");
check("import.prefill", mapSrc.includes("const fromPack = packScene && Array.isArray(packScene.walls)") && mapSrc.includes("prompt('Paste walls JSON (array of {x1,y1,x2,y2}):', fromPack)"));
check("seed.kept", mapSrc.includes("function seedPackWalls(sc)") && mapSrc.includes("sd.walls = sc.walls.map(w => Object.assign({}, w))"));
check("html.sheet", read("index.html").includes("map/map-packs.js?v=0.3.332-between") && read("index.html").includes("map/ssdns-map.js?v=0.3.332-force"));
check("html.dm", read("dm/index.html").includes("../map/map-packs.js?v=0.2.345-between") && read("dm/index.html").includes("../map/ssdns-map.js?v=0.2.345-force"));
check("docs", read("map/DATA.md").includes("scn_dry_fork") && read("map/DATA.md").includes("seedPackWalls") && read("docs/SCHEMA.md").includes("scn_dry_fork"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("n90 dry fork ok");

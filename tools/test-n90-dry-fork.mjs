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
function pngSize(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  if (buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.195" && version.sheetBuild === "sheet-playtest-v03195", JSON.stringify(version));
check("ver.dmcc", version.dmcc === "0.2.208" && version.dmccBuild === "dmcc-playtest-v02208");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.195"') && read("assets/js/app.js").includes("sheet-playtest-v03195"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.208"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02208"));
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
const png = pngSize("map/packs/showcase-dry-fork/showcase-dry-fork_40x30_70px.png");
check("pack.png", png && png.w === 2800 && png.h === 2100 && png.bytes < 1.5e6, JSON.stringify(png));
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
check("draft.notLoaded", !read("map/ssdns-map.js").includes("showcase-dry-fork.map.json") && !read("map/map-packs.js").includes("Hired Rifle") && !read("map/ssdns-map.js").includes("Dust Devil"));
check("layout", exists("map/packs/showcase-dry-fork/LAYOUT-KEY.md") && read("map/packs/showcase-dry-fork/LAYOUT-KEY.md").includes("Dry Fork Water Stop"));

const mapSrc = read("map/ssdns-map.js");
check("import.prefill", mapSrc.includes("const fromPack = packScene && Array.isArray(packScene.walls)") && mapSrc.includes("prompt('Paste walls JSON (array of {x1,y1,x2,y2}):', fromPack)"));
check("seed.kept", mapSrc.includes("function seedPackWalls(sc)") && mapSrc.includes("sd.walls = sc.walls.map(w => Object.assign({}, w))"));
check("html.sheet", read("index.html").includes("map/map-packs.js?v=0.3.178-n90") && read("index.html").includes("map/ssdns-map.js?v=0.3.195-zones"));
check("html.dm", read("dm/index.html").includes("../map/map-packs.js?v=0.2.191-n90") && read("dm/index.html").includes("../map/ssdns-map.js?v=0.2.208-zones"));
check("docs", read("map/DATA.md").includes("scn_dry_fork") && read("map/DATA.md").includes("seedPackWalls") && read("docs/SCHEMA.md").includes("scn_dry_fork"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("n90 dry fork ok");

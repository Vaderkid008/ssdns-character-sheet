/**
 * Dry Fork props are Asset Library tokens (sheet 0.3.320 / DMCC 0.2.333).
 *   node tools/test-dry-fork-assets-03320.mjs
 * Loads the built-in scene and both encounter packs. Each prop asset id
 * and origin square appears once. No rules.js edits. No Firebase writes.
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

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.320" && version.sheetBuild === "sheet-playtest-v03320", JSON.stringify(version));
check("ver.dmcc", version.dmcc === "0.2.333" && version.dmccBuild === "dmcc-playtest-v02333");
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sb = {};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("map/map-packs.js"), sb);
const scene = sb.SSDNS_MAP_PACKS.scenes.find((s) => s.id === "scn_dry_fork");
const playFile = JSON.parse(read("map/packs/showcase-dry-fork/showcase-dry-fork.play.json"));
check("play.same", !!scene && JSON.stringify(scene.play) === JSON.stringify(playFile));
const play = scene && scene.play;
const tokens = (play && play.tokens) || [];
const v1 = JSON.parse(read("assets/packs/encounter-pack-v1.ssdns-asset-pack.json"));
const v2 = JSON.parse(read("assets/packs/encounter-pack-v2.ssdns-asset-pack.json"));
const defs = {};
[...v1.assets, ...v2.assets].forEach((a) => { defs[a.id] = a; });

const EXPECT = [
  ["df_order_board", "ast_order-board", 33, 5, "AH6"],
  ["df_lantern_ah6", "ast_wall-lantern", 33, 5, "AH6"],
  ["df_lantern_k12", "ast_wall-lantern", 10, 11, "K12"],
  ["df_lantern_ad12", "ast_wall-lantern", 29, 11, "AD12"],
  ["df_gate", "ast_fence-gate", 31, 17, "AF18"],
  ["df_telegraph", "ast_telegraph-lever", 13, 14, "N15"],
  ["df_campfire", "ast_campfire", 29, 22, "AD23"],
  ["df_crate", "ast_cover-crate", 26, 15, "AA16"],
  ["df_powder", "ast_powder-barrel", 4, 10, "E11"],
  ["df_plunger", "ast_plunger-box", 3, 10, "D11"],
  ["df_switch_w", "ast_switch-stand", 8, 8, "I9"],
  ["df_switch_e", "ast_switch-stand", 32, 8, "AG9"],
  ["df_baggage", "ast_baggage-cart", 21, 11, "V12"],
  ["df_coal", "ast_coal-bin", 5, 10, "F11"],
  ["df_rain", "ast_rain-barrel", 22, 14, "W15"],
  ["df_trough_road", "ast_water-trough", 10, 18, "K19"],
  ["df_trough_corral", "ast_water-trough", 37, 21, "AL22"]
];
const seen = {};
tokens.forEach((t) => {
  if (!t || t.kind !== "asset") return;
  const key = t.assetDefId + "@" + t.pos.x + "," + t.pos.y;
  seen[key] = (seen[key] || 0) + 1;
});
EXPECT.forEach((row) => {
  const t = tokens.find((x) => x.id === row[0]);
  const key = row[1] + "@" + row[2] + "," + row[3];
  const def = defs[row[1]];
  const file = t && String(t.image || "").split("/").pop();
  check(
    "prop." + row[0],
    !!t && t.kind === "asset" && t.assetDefId === row[1] && t.asset && t.asset.defId === row[1]
      && t.pos.x === row[2] && t.pos.y === row[3] && t.sq === row[4]
      && seen[key] === 1 && !!def
      && String(t.image || "").includes("/assets/map-props/asset-")
      && file && fs.existsSync(path.join(root, "assets/map-props", file)),
    key + " count " + seen[key]
  );
});
check("once.assets", Object.values(seen).every((n) => n === 1), JSON.stringify(seen));
check("no.strongbox", !tokens.some((t) => t && (t.assetDefId === "ast_strongbox" || /strongbox/i.test(t.name || ""))));
check("chests.kept", tokens.filter((t) => t.kind === "chest").map((t) => t.id + "@" + t.sq).sort().join(",") === "df_saddlebag@AE16,df_stash@AB18");
check("no.creatures", !tokens.some((t) => t && (t.kind === "enemy" || t.kind === "player" || t.kind === "npc")));

const board = tokens.find((t) => t.id === "df_order_board");
check("board.red", board && board.asset.state.on === false && board.asset.props.toggle.labelOn === "Flip to GREEN" && board.asset.props.toggle.labelOff === "Flip to RED");
const gate = tokens.find((t) => t.id === "df_gate");
check("gate.moveOnly", gate && gate.asset.props.gate.blocksMove === true && gate.asset.props.gate.blocksSight === false && gate.asset.state.open === false);
["df_lantern_ah6", "df_lantern_k12", "df_lantern_ad12", "df_campfire"].forEach((id) => {
  const t = tokens.find((x) => x.id === id);
  const light = t && t.lights && t.lights[0];
  check("light." + id, !!(light && light.bright === 20 && light.dim === 20 && t.asset.state.lit === true));
});
const powder = tokens.find((t) => t.id === "df_powder");
const plunger = tokens.find((t) => t.id === "df_plunger");
check("powder.blast", powder && powder.asset.props.timer.mode === "fuse" && powder.asset.interact.actions.indexOf("toggle") >= 0 && (powder.asset.images || []).length >= 2);
check("plunger.blast", plunger && plunger.asset.props.timer.mode === "plunger" && plunger.asset.interact.actions.indexOf("toggle") >= 0 && (plunger.asset.images || []).length >= 2);

const COVER = {
  west_switch: [8, 8, 1, 1, "half"],
  east_switch: [32, 8, 1, 1, "half"],
  baggage_cart: [21, 11, 2, 1, "half"],
  coal_bin: [5, 10, 3, 2, "three-quarters"],
  rain_barrel: [22, 14, 1, 1, "half"],
  road_trough: [10, 18, 1, 2, "half"],
  corral_trough: [37, 21, 1, 2, "half"],
  signal_post: [33, 5, 1, 1, "half"],
  lantern_post_w: [10, 11, 1, 1, "half"],
  lantern_post_e: [29, 11, 1, 1, "half"],
  campfire: [29, 22, 1, 1, "none"]
};
Object.keys(COVER).forEach((id) => {
  const row = (play.cover || []).find((c) => c.id === id);
  const want = COVER[id];
  check("cover." + id, !!row && row.rect.join(",") === want.slice(0, 4).join(",") && row.cover === want[4], row && row.rect.join(","));
});

const UNMATCHED = [
  "water_tower", "tower_ladder", "water_spout", "telegraph_pole", "boulder", "mesquite_nw",
  "handcar", "desk_telegraph", "stove", "bunk_n", "bunk_s", "bunk_table", "toolbox",
  "woodpile", "broken_wagon", "horse1", "horse2", "horse3", "horse4", "outhouse", "wash_mesquite", "wash_rocks"
];
UNMATCHED.forEach((id) => {
  const row = (play.cover || []).find((c) => c.id === id);
  check("unmatched." + id, !!row && !tokens.some((t) => t.sq === row && false) && !tokens.some((t) => t.pos && t.pos.x === row.rect[0] && t.pos.y === row.rect[1] && t.kind === "asset" && !EXPECT.some((e) => e[2] === row.rect[0] && e[3] === row.rect[1])));
});

if (failures.length) {
  console.error("\n" + failures.length + " failed before the screenshot");
  process.exit(1);
}

const OUT = "/opt/cursor/artifacts/dry-fork-assets";
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = await import("/tmp/pw/node_modules/playwright-core/index.mjs");
const browser = await chromium.launch({ executablePath: "/usr/local/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:8765/map/demo.html?role=dm&room=dry-fork-320", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.map && window.map.maps);
const loaded = await page.evaluate(async () => {
  const ok = window.map.maps().swap("scn_dry_fork");
  const fog = document.querySelector("[data-act='fogBtn']");
  if (fog && fog.textContent.indexOf("ON") >= 0) fog.click();
  const amb = document.querySelector("[data-act='ambientSel']");
  if (amb) { amb.value = "bright"; amb.dispatchEvent(new Event("change", { bubbles: true })); }
  document.querySelectorAll(".ssdns-leftbar,.ssdns-rightbar,.ssdns-chatdock").forEach((n) => { n.style.display = "none"; });
  const boxes = window.map.tokenBoxes().filter((t) => t.kind === "asset");
  const art = await Promise.all(boxes.map((t) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(t.id + ":" + im.naturalWidth);
    im.onerror = () => res(t.id + ":ERR");
    im.src = t.image;
  })));
  const canvas = document.querySelector("#mount canvas");
  const zoom = Math.min(canvas.clientWidth / 2800, canvas.clientHeight / 2100) * 0.96;
  window.map.lookAt(19.5, 14.5, zoom);
  return { ok, scene: window.map.viewedScene && window.map.viewedScene(), art, n: boxes.length };
});
check("ui.swap", loaded.ok && loaded.n === 17, JSON.stringify({ ok: loaded.ok, n: loaded.n }));
check("ui.art", loaded.art.every((row) => !row.endsWith(":ERR") && !row.endsWith(":0")), loaded.art.filter((row) => row.endsWith(":ERR") || row.endsWith(":0")).join(" "));
await page.waitForTimeout(500);
await page.locator("#mount canvas").first().screenshot({ path: path.join(OUT, "dm-dry-fork.png"), timeout: 20000 });
await page.evaluate(() => { window.map.lookAt(16, 12, 0.72); });
await page.waitForTimeout(300);
await page.locator("#mount canvas").first().screenshot({ path: path.join(OUT, "dm-props.png"), timeout: 20000 });
await browser.close();

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("dry fork assets 0.3.320 ok");

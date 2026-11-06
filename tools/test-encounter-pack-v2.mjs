/**
 * Encounter Pack v2 (sheet 0.3.221 / DMCC 0.2.234).
 * One-click Assets seed beside Pack v1. rules.js is not edited.
 *   node tools/test-encounter-pack-v2.mjs
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
check("ver.sheet", version.sheet === "0.3.233" && version.sheetBuild === "sheet-playtest-v03233");
check("ver.dmcc", version.dmcc === "0.2.246" && version.dmccBuild === "dmcc-playtest-v02246");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.233"') && read("assets/js/app.js").includes("sheet-playtest-v03233"));
check("ver.dmjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.246"') && read("dm/assets/js/dmcc.js").includes("dmcc-playtest-v02246"));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sb = { console: { info() {}, log() {} }, Date, Math, JSON, Object, Array, String, Number, isFinite };
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("map/asset-library.js"), sb);
const L = sb.SSDNSAssetLibrary;

const packPath = "assets/packs/encounter-pack-v2.ssdns-asset-pack.json";
const raw = read(packPath);
const pack = JSON.parse(raw);
check("pack.meta", pack.format === "ssdns-asset-pack" && pack.version === 1 && pack.exportedAt === "2026-11-03T04:29:54Z" && !/data:|blob:/.test(raw));
const ids = pack.assets.map((a) => a.id);
check("pack.ids", ids.join() === "ast_water-trough,ast_hitching-rail,ast_tripwire-post,ast_strongbox,ast_baggage-cart,ast_switch-stand,ast_coal-bin,ast_rain-barrel");
const loaded = L.importPack(pack, {}, { skipExisting: true });
check("pack.import", loaded.entries.length === 8 && loaded.kept === 0 && loaded.entries.every((e, i) => e.id === ids[i]));
const byId = Object.fromEntries(loaded.entries.map((e) => [e.id, e]));
const notesOk = pack.assets.every((a) => byId[a.id].notes === a.notes);
check("pack.notes", notesOk);

const trough = byId["ast_water-trough"];
const rail = byId["ast_hitching-rail"];
const wire = byId["ast_tripwire-post"];
const box = byId["ast_strongbox"];
const cart = byId["ast_baggage-cart"];
const sw = byId["ast_switch-stand"];
const coal = byId["ast_coal-bin"];
const barrel = byId["ast_rain-barrel"];
check("soft.trough", trough.size === 2 && trough.props.toggle.labelOn === "Fill" && trough.props.toggle.labelOff === "Empty" && trough.props.health.max === 15 && trough.props.health.cover === "half" && trough.props.gate.blocksMove === false && trough.interact.actions.join() === "toggle" && trough.images.length === 2 && trough.sfx.on === "ui-tick.mp3" && trough.sfx.off === "ui-back.mp3");
check("soft.rail", rail.size === 2 && rail.interact.actions.length === 0 && rail.props.health.max === 20 && rail.props.health.cover === "half" && rail.images.length === 1);
check("soft.wire", wire.size === 1 && wire.props.toggle.labelOn === "Arm wire" && wire.props.toggle.labelOff === "Spring / cut" && wire.props.trap.dc === 13 && wire.props.trap.save === "dex" && wire.props.trap.damage === "1d6" && wire.props.trap.onFail === "prone" && wire.sfx.on === "ui-tick.mp3" && wire.sfx.off === "thud.wav");
check("soft.box", box.size === 1 && box.interact.actions.join() === "open" && box.props.gate.blocksMove === true && box.props.gate.open === false && box.props.health.max === 25 && box.props.health.cover === "three-quarters" && box.sfx.open === "ui-tick.mp3" && box.sfx.close === "thud.wav");
check("soft.cart", cart.size === 2 && cart.interact.actions.length === 0 && cart.props.health.max === 30 && cart.props.health.cover === "three-quarters");
check("soft.switch", sw.props.toggle.labelOn === "Throw switch" && sw.props.toggle.labelOff === "Reset switch" && sw.props.health.max === 15 && sw.props.health.cover === "half" && sw.sfx.on === "thud.wav" && sw.sfx.off === "ui-back.mp3" && sw.interact.actions.join() === "toggle");
check("soft.coal", coal.size === 2 && coal.props.health.max === 40 && coal.props.health.cover === "three-quarters" && coal.images.length === 1);
check("soft.barrel", barrel.props.toggle.labelOn === "Tip over" && barrel.props.toggle.labelOff === "Set upright" && barrel.props.health.max === 12 && barrel.props.health.cover === "half" && barrel.sfx.on === "thud.wav" && barrel.sfx.off === "ui-back.mp3");

const host = "https://vaderkid008.github.io/ssdns-character-sheet/assets/map-props/";
const files = new Set();
const httpsOk = loaded.entries.every((e) => e.images.every((u) => {
  if (!u.startsWith(host) || !u.endsWith(".webp")) return false;
  files.add(u.slice(host.length));
  return true;
}));
check("pack.https", httpsOk && files.size === 13 && trough.image.endsWith("asset-water-trough-off.webp") && box.images[1].endsWith("asset-strongbox-open.webp"));
check("pack.webp", [...files].every((name) => {
  const buf = fs.readFileSync(path.join(root, "assets/map-props", name));
  return buf.length > 1000 && buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP";
}));

const present = {};
loaded.entries.forEach((e) => { present[e.id] = e; });
const again = L.importPack(pack, present, { skipExisting: true });
check("pack.idempotent", again.entries.length === 0 && again.kept === 8);
const v1 = JSON.parse(read("assets/packs/encounter-pack-v1.ssdns-asset-pack.json"));
const both = L.importPack(pack, Object.fromEntries(v1.assets.map((a) => [a.id, 1])), { skipExisting: true });
check("pack.beside-v1", both.entries.length === 8 && both.kept === 0 && v1.assets.length === 8);

const lib = read("map/asset-library.js");
check("ui.buttons", lib.includes('data-al-starter="' + "' + esc(p.key) + '" + '"') || (lib.includes("data-al-starter=") && lib.includes("Encounter Pack v1") && lib.includes("Encounter Pack v2")));
check("ui.paths", lib.includes(packPath) && lib.includes("assets/packs/encounter-pack-v1.ssdns-asset-pack.json") && lib.includes("skipExisting") && L.STARTER_PACK_V2 === packPath && L.STARTER_PACKS.length === 2);
const sheet = read("index.html");
const dm = read("dm/index.html");
check("html.sheet", sheet.includes("map/asset-library.js?v=0.3.221-encounter2") && sheet.includes("map/ssdns-map.js?v=0.3.233-playfix"));
check("html.dm", dm.includes("../map/asset-library.js?v=0.2.234-encounter2") && dm.includes("assets/js/dmcc.js?v=0.2.246-playfix") && dm.includes("../map/ssdns-map.js?v=0.2.246-playfix"));
check("docs", read("map/DATA.md").includes("Encounter Pack v2") && read("docs/SCHEMA.md").includes("encounter-pack-v2.ssdns-asset-pack.json"));

const doc = {
  scripts: [{ src: "https://vaderkid008.github.io/ssdns-character-sheet/map/asset-library.js?v=0.3.221-encounter2" }],
  getElementsByTagName() { return this.scripts; }
};
sb.document = doc;
check("url.v1", L.starterPackUrl() .endsWith("assets/packs/encounter-pack-v1.ssdns-asset-pack.json"));
check("url.v2", L.starterPackUrl(L.STARTER_PACK_V2).endsWith(packPath) && !L.starterPackUrl(L.STARTER_PACK_V2).includes("asset-library.js"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("encounter pack v2 ok");

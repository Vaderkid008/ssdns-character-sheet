/**
 * N86 Asset Library: defs, pack, public sanitizer, 5 ft gate, live state, feed apply.
 *   node tools/test-n86-asset-library.mjs
 * rules.js is not edited.
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
check("ver.sheet", version.sheet === "0.3.191" && version.sheetBuild === "sheet-playtest-v03191");
check("ver.dmcc", version.dmcc === "0.2.204" && version.dmccBuild === "dmcc-playtest-v02204");
check("ver.app", read("assets/js/app.js").includes('APP_VERSION = "0.3.191"'));
check("ver.dmccjs", read("dm/assets/js/dmcc.js").includes('VERSION = "0.2.204"'));
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const info = [];
const sb = {
  console: { info: function () { info.push(Array.from(arguments).join(" ")); }, log: function () {} },
  Date, Math, JSON, Object, Array, String, Number, isFinite
};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("map/asset-library.js"), sb);
const L = sb.SSDNSAssetLibrary;
const Assets = sb.SSDNSAssets;

const taken = {};
const lamp = L.newDef({
  name: "Porch lantern",
  size: 1,
  image: "https://cdn.test/lantern-off.webp",
  images: ["https://cdn.test/lantern-off.webp", "https://cdn.test/lantern-on.webp"],
  sfx: { interact: "ui-tick.mp3", on: "spellcast.mp3", off: "holster.mp3" },
  props: { light: { on: false, bright: 20, dim: 20, color: "#ffcc66" }, toggle: { on: false, labelOn: "On", labelOff: "Off" } },
  interact: { reachFt: 5, actions: ["toggle", "light"], dmApprove: true }
}, taken);
taken[lamp.id] = 1;
check("def.id", lamp.id === "ast_porch-lantern" && lamp.v === 1 && lamp.size === 1 && lamp.interact.dmApprove === true);
check("def.makeId", L.makeId("Porch lantern", taken) === "ast_porch-lantern-2");
const edited = L.newDef(Object.assign({}, lamp, { name: "Porch lantern", notes: "hangs by the door", size: 2 }), taken);
check("def.edit", edited.id === lamp.id && edited.notes === "hangs by the door" && edited.size === 2);
const copy = L.duplicate(lamp, taken);
check("def.dup", copy.id !== lamp.id && /\(copy\)$/.test(copy.name) && copy.interact.actions.join() === "toggle,light" && copy.props.light.bright === 20);
let lib = L.upsert({}, lamp);
lib = L.upsert(lib, copy);
check("def.filter", L.filter(Object.values(lib), "porch").length === 2 && L.filter(Object.values(lib), "copy").length === 1);
lib = L.removeDef(lib, copy.id);
check("def.remove", !lib[copy.id] && lib[lamp.id].name === "Porch lantern");

const gate = L.newDef({
  name: "Saloon gate",
  size: 2,
  image: "https://cdn.test/gate-shut.webp",
  images: ["https://cdn.test/gate-shut.webp", "https://cdn.test/gate-open.webp"],
  sfx: { open: "thud.wav", close: "holster.mp3" },
  props: {
    gate: { open: false, blocksMove: true, blocksSight: false },
    health: { max: 26, cover: "half" },
    trap: { attack: 14, dc: 17, save: "DEX", damage: "2d6-POISON", onFail: "pinned" },
    immunities: ["fire-immune-secret"]
  },
  interact: { reachFt: 5, actions: ["open", "health", "trap", "immunities"], dmApprove: false },
  notes: "SECRET-NOTE-XYZ"
}, {});
const pack = L.exportPack({ [lamp.id]: lamp, [gate.id]: gate });
check("pack.format", pack.format === "ssdns-asset-pack" && pack.assets.length === 2);
const imported = L.importPack(JSON.stringify(pack), { [lamp.id]: 1 });
check("pack.import", imported.entries.length === 2 && imported.entries[0].id !== lamp.id && imported.entries[1].id === gate.id);
const again = L.importPack(pack, { [lamp.id]: 1, [gate.id]: 1 });
check("pack.reimport", again.entries.length === 2 && again.entries.every((e) => e.id !== lamp.id && e.id !== gate.id));
check("pack.bad", L.importPack("nope", {}).entries.length === 0 && /isn't an SSDNS asset pack/.test(L.importPack({ assets: [] }, {}).warn));
const dropped = L.importPack({ format: "ssdns-asset-pack", assets: [{ name: "Local", image: "data:image/png;base64,xx" }, { name: "" }] }, {});
check("pack.skip", dropped.entries.length === 1 && dropped.skipped === 1 && dropped.entries[0].image === "" && dropped.entries[0].images[0] === "");

const inst = L.instanceFromDef(gate);
inst.state.hp = 13;
const token = { id: "tok_gate", kind: "asset", name: gate.name, size: 2, pos: { x: 0, y: 0 }, asset: inst };
const pub = L.publicAsset(token);
const blob = JSON.stringify(pub);
check("public.keys", pub.hpPct === 50 && pub.open === false && pub.blocksMove === true && pub.actions.some((a) => a.id === "open" && !a.stub) && pub.actions.some((a) => a.id === "trap" && a.stub));
check("public.strips", !blob.includes("SECRET-NOTE-XYZ") && !blob.includes("2d6-POISON") && !blob.includes("fire-immune-secret") && !/"hp"\s*:/.test(blob) && !blob.includes('"dc"') && !blob.includes('"attack"') && !blob.includes("pinned") && !blob.includes('"notes"'));
check("public.hidden", L.publicAsset(Object.assign({}, token, { hidden: true })) === null);

const big = { pos: { x: 0, y: 0 }, size: 2 };
const beside = { pos: { x: 2, y: 0 }, size: 1 };
const far = { pos: { x: 3, y: 0 }, size: 1 };
check("feet.touch", L.feetBetween(big, beside) === 5 && L.feetBetween(big, far) === 10 && L.feetBetween(big, { pos: { x: 1, y: 0 }, size: 1 }) === 0);
const near = L.reachGate(beside, token, 5);
const away = L.reachGate(far, token, 5);
check("reach.ok", near.ok === true && near.feet === 5);
check("reach.block", away.ok === false && away.text === "Out of reach (10 ft). Interact needs to be within 5 ft.");

const lit = L.applyAction(L.instanceFromDef(lamp), "light");
check("act.light", lit.ok && lit.asset.state.lit === true && lit.image === "https://cdn.test/lantern-on.webp" && lit.lights[0].bright === 20 && /lit$/.test(lit.log));
const dark = L.applyAction(lit.asset, "light");
check("act.lightOff", dark.ok && dark.asset.state.lit === false && dark.lights.length === 0 && dark.image === "https://cdn.test/lantern-off.webp");
const toggled = L.applyAction(L.instanceFromDef(lamp), "toggle");
check("act.toggle", toggled.ok && toggled.asset.state.on === true && toggled.asset.props.toggle.on === true && toggled.sfx === "spellcast.mp3");
const opened = L.applyAction(inst, "open");
check("act.open", opened.ok && opened.asset.state.open === true && opened.image === "https://cdn.test/gate-open.webp" && opened.sfx === "thud.wav");
check("act.stub", L.applyAction(inst, "trap").stub === true && L.applyAction(inst, "trap").ok === false);
token.asset = inst;
check("gate.closed", L.cellBlockedByGate([token], 0, 0) && L.cellBlockedByGate([token], 1, 1) && !L.cellBlockedByGate([token], 2, 0) && !L.gatePassable(token));
token.asset = opened.asset;
check("gate.open", !L.cellBlockedByGate([token], 0, 0) && L.gatePassable(token));

const row = L.feedRow({ tokenId: "tok_gate", action: "open", by: "ada" });
check("feed.shape", row.kind === "sfx" && row.event === "asset" && row.assetReq.tokenId === "tok_gate" && row.assetReq.action === "open" && row.assetReq.by === "ada" && row.from === "ada");
token.asset = L.instanceFromDef(gate);
const applied = L.applyFeed(token, row);
const after = JSON.stringify(L.publicAsset(token));
check("feed.apply", applied.ok && token.asset.state.open === true && token.image.indexOf("gate-open") >= 0 && token.lights.length === 0);
check("feed.public", !after.includes("SECRET-NOTE-XYZ") && !after.includes("2d6-POISON") && !after.includes("fire-immune-secret") && !/"hp"\s*:/.test(after) && token.asset.notes === "SECRET-NOTE-XYZ" && token.asset.props.trap.dc === 17);

const bomb = { id: "tok_bomb", kind: "asset", asset: { state: { armedAtRound: 2, firesAtRound: 4 } } };
const noted = L.noteRound(4, [bomb, { id: "quiet", asset: { state: { firesAtRound: null } } }]);
check("round.note", noted.due.length === 1 && noted.due[0].tokenId === "tok_bomb" && noted.due[0].firesAtRound === 4);
L.bind({ tokens: function () { return [bomb]; } });
const hooked = Assets.onRound(4);
check("round.hook", hooked.due.length === 1 && info.some((line) => line.indexOf("tok_bomb@4") >= 0));
const door = Assets.doorInteract({ x1: 1, y1: 2, x2: 2, y2: 2 }, "peek");
check("door.stub", door.door === true && door.stub === true && door.ok === false && door.action === "peek");
let peeked = "";
check("register", Assets.registerAction("peek", function (id, action, by) { peeked = id + ":" + action + ":" + by; return { ok: true }; }) === true);
check("register.call", Assets.onInteract("door-1", "peek", "ada").ok === true && peeked === "door-1:peek:ada");

const map = read("map/ssdns-map.js");
const v2 = read("dm/assets/js/v2.js");
const sheet = read("index.html");
const dm = read("dm/index.html");
check("map.button", map.includes('data-act="assetsBtn"') && map.includes("map/dm/assetLibrary"));
check("map.public", map.includes("SSDNSAssetLibrary.publicAsset") && map.includes("hiddenFromPlayers"));
check("map.door", map.includes("doorInteract: function"));
check("map.reach", map.includes("reachGate") && map.includes("applyAssetRequest"));
const wrap = v2.indexOf("expireSpellZones();");
check("v2.round", wrap > 0 && v2.indexOf("SSDNSAssets.onRound", wrap) > wrap && v2.indexOf("SSDNSAssets.onRound", wrap) < wrap + 220);
check("html.sheet", sheet.includes("map/asset-library.js?v=0.3.182-asset") && sheet.includes("map/ssdns-map.js?v=0.3.191-tw"));
check("html.dm", dm.includes("../map/asset-library.js?v=0.2.195-asset") && dm.includes("v2.js?v=0.2.204-tw") && dm.includes("../map/ssdns-map.js?v=0.2.204-tw"));
check("docs", read("map/DATA.md").includes("ssdns-asset-pack") && read("docs/SCHEMA.md").includes("assetLibrary"));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("n86 asset library ok");

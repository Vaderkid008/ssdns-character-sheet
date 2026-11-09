/**
 * Dry Fork showcase lock (sheet 0.3.220 / DMCC 0.2.233).
 *   node tools/test-dry-fork-lock.mjs
 * 12 Module-start pregens, painted map, play seed. rules.js is not edited.
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
function pngSize(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  if (buf.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

const version = JSON.parse(read("version.json"));
check("ver.sheet", version.sheet === "0.3.269" && version.sheetBuild === "sheet-playtest-v03269");
check("ver.dmcc", version.dmcc === "0.2.282" && version.dmccBuild === "dmcc-playtest-v02282");
const rulesDiff = execSync("git diff --name-only -- assets/data/rules.js database.rules.json firebase.json", { cwd: root }).toString().trim();
check("rules.untouched", rulesDiff === "", rulesDiff);

const sb = {};
sb.window = sb;
vm.createContext(sb);
vm.runInContext(read("map/map-packs.js"), sb);
const scene = sb.SSDNS_MAP_PACKS.scenes.find((s) => s.id === "scn_dry_fork");
const playFile = JSON.parse(read("map/packs/showcase-dry-fork/showcase-dry-fork.play.json"));
check("play.matches", scene && JSON.stringify(scene.play) === JSON.stringify(playFile));
check("paint.flag", scene && scene.painted === true && scene.img === "packs/showcase-dry-fork/showcase-dry-fork_40x30_70px.png");
const png = pngSize("map/packs/showcase-dry-fork/showcase-dry-fork_40x30_70px.png");
check("paint.size", png && png.w === 2800 && png.h === 2100 && png.bytes > 1.5e6, JSON.stringify(png));
const thumb = pngSize("map/packs/thumbs/scn_dry_fork.png");
check("thumb", thumb && thumb.w === 480 && thumb.h === 360 && thumb.bytes < png.bytes);
const wallsFile = JSON.parse(read("map/packs/showcase-dry-fork/showcase-dry-fork.walls.json"));
check("walls", scene && scene.walls.length === 31 && JSON.stringify(scene.walls) === JSON.stringify(wallsFile));

const byId = {};
(playFile.tokens || []).forEach((t) => { byId[t.id] = t; });
function at(id, sq) {
  const t = byId[id];
  return t && t.sq === sq;
}
check("board.red", at("df_order_board", "AH6") && byId.df_order_board.asset.state.on === false && byId.df_order_board.asset.props.toggle.on === false);
check("lanterns", at("df_lantern_ah6", "AH6") && at("df_lantern_k12", "K12") && at("df_lantern_ad12", "AD12"));
check("lantern.light", ["df_lantern_ah6", "df_lantern_k12", "df_lantern_ad12", "df_campfire"].every((id) => {
  const L = byId[id].lights[0];
  return L && L.bright === 20 && L.dim === 20;
}));
check("gate", at("df_gate", "AF18") && byId.df_gate.asset.props.gate.blocksMove === true && byId.df_gate.asset.props.gate.blocksSight === false && byId.df_gate.asset.state.open === false);
check("telegraph", at("df_telegraph", "N15"));
check("toys", at("df_crate", "AA16") && at("df_powder", "F11") && at("df_plunger", "G11") && at("df_campfire", "AD23"));
check("powder.buttons", byId.df_powder.asset.props.timer.mode === "fuse" && byId.df_powder.asset.interact.actions.indexOf("toggle") >= 0 && byId.df_powder.asset.images.length === 2);
check("plunger.buttons", byId.df_plunger.asset.props.timer.mode === "plunger" && byId.df_plunger.asset.interact.actions.indexOf("toggle") >= 0 && byId.df_plunger.asset.images.length === 2);
const bag = byId.df_saddlebag;
const stash = byId.df_stash;
check("saddlebag", bag && bag.sq === "AE16" && bag.loot.boxType === "saddlebag" && bag.loot.lock.unlocked === true && bag.loot.hidden === false && bag.loot.tableId === "act1-saddlebag");
check("stash", stash && stash.sq === "AB18" && stash.loot.hidden === true && stash.loot.hideDc === 13 && stash.loot.lock.dc === 13 && stash.loot.lock.unlocked === false);
check("devils.optional", playFile.spawns.filter((s) => s.optional).length === 2 && !playFile.tokens.some((t) => /dust devil/i.test(t.name || "")));
const tower = (playFile.cover || []).find((o) => o.id === "water_tower");
check("tank.unshifted", tower && tower.rect[0] === 14 && tower.rect[1] === 2 && tower.rect[2] === 4 && tower.rect[3] === 4, JSON.stringify(tower && tower.rect));
check("seed.fn", read("map/ssdns-map.js").includes("function seedPackPlay(sc)") && read("map/ssdns-map.js").includes("seedPackPlay(sc);"));

const pack = JSON.parse(read("assets/packs/encounter-pack-v1.ssdns-asset-pack.json"));
const defs = {};
pack.assets.forEach((a) => { defs[a.id] = a; });
check("pack.lantern", defs["ast_wall-lantern"].props.light.bright === 20 && defs["ast_wall-lantern"].props.light.dim === 20);
check("pack.campfire", defs["ast_campfire"].props.light.bright === 20 && defs["ast_campfire"].props.light.dim === 20);
check("pack.gate", defs["ast_fence-gate"].props.gate.blocksMove === true && defs["ast_fence-gate"].props.gate.blocksSight === false);
check("pack.toys", defs["ast_powder-barrel"].props.timer.mode === "fuse" && defs["ast_plunger-box"].props.timer.mode === "plunger");

const index = JSON.parse(read("showcase/pregens/index.json"));
check("pregens.count", index.characters.length === 12);
const expect = {
  "wren-stonecrow.ssdns": { calling: "tribal-warrior", subclass: "totem-warrior", hp: 32, weapon: "throwing-spear-javelin", melee: true },
  "dell-marchand.ssdns": { calling: "storyteller", subclass: "college-of-campfire-lore-lore", hp: 24, weapon: "herringer-light-pepperbox" },
  "ruth-hollister.ssdns": { calling: "frontier-preacher", subclass: "domain-of-the-faithful-sawbones-life", hp: 27, weapon: "single-barrel-farm-shotgun" },
  "june-vale.ssdns": { calling: "nature-guide", subclass: "circle-of-the-open-range-land", hp: 24, weapon: "shortbow" },
  "mercy-blackburn.ssdns": { calling: "gunslinger", subclass: "gun-whisperer-battle-master", hp: 28, weapon: "navy-army-ball-n-cap-revolver", style: "sidearm" },
  "toby-reyes.ssdns": { calling: "martial-artist", subclass: "rough-and-tumble-brawler-open-hand", hp: 21, weapon: "baton-belaying-pin-club", melee: true },
  "amos-kettle.ssdns": { calling: "lawman", subclass: "oath-of-the-badge-devotion", hp: 25, weapon: "dullards-light-carbine" },
  "nell-harrow.ssdns": { calling: "frontier-scout", subclass: "trophy-hunter-hunter", hp: 25, weapon: "dullards-light-carbine", lantern: true },
  "ace-duchamp.ssdns": { calling: "gambler", subclass: "the-burglar-thief", hp: 21, weapon: "herringer-light-pocket-pistol" },
  "ezra-thorne.ssdns": { calling: "hexslinger", subclass: "chaos-wild-magic", hp: 20, weapon: "blacksnake" },
  "cal-mercer.ssdns": { calling: "pact-seeker", subclass: "the-last-round", hp: 24, pact: true },
  "gus-penhallow.ssdns": { calling: "scholar", subclass: "law-of-thermodynamic-transfer-evocation", hp: 20, weapon: "dullards-plinker-revolver" }
};
Object.keys(expect).forEach((file) => {
  const doc = JSON.parse(read("showcase/pregens/" + file));
  const c = doc.character;
  const want = expect[file];
  const guns = (c.guns || []).map((g) => g && g.weapon).filter(Boolean);
  const melee = (c.melee || []).map((g) => g && g.weapon).filter(Boolean);
  const held = want.melee ? melee : guns;
  const ok = doc.format === "ssdns-character" && c.kitMode === "module" && c.level === 3 && c.xp === 900
    && c.hpAuto === false && c.hpMax === want.hp && c.hpCurrent === want.hp
    && c.calling === want.calling && c.subclass === want.subclass
    && (!want.weapon || held.indexOf(want.weapon) >= 0)
    && (!want.style || c.fightingStyle === want.style)
    && (!want.lantern || (c.items || []).some((it) => it && it.catalogId === "belt-lantern" && it.equipSlot === "accessory_1"))
    && (!want.pact || (c.casterGun === "borrowed-iron" && (c.invocations || []).some((n) => /devil/i.test(n) && /sight/i.test(n))));
  check("pregen." + file, ok, !ok ? JSON.stringify({ calling: c.calling, subclass: c.subclass, hp: c.hpMax, kit: c.kitMode, guns: guns, melee: melee, style: c.fightingStyle }) : "");
});
const gus = JSON.parse(read("showcase/pregens/gus-penhallow.ssdns")).character;
const prepared = [];
const known = [];
Object.keys(gus.spells || {}).forEach((lv) => {
  (gus.spells[lv] || []).forEach((sp) => {
    if (!sp || !sp.name) return;
    (sp.prepared ? prepared : known).push(sp.name);
  });
});
check("gus.prep", prepared.length === 6 && known.length === 4, prepared.length + "/" + known.length);
const ace = JSON.parse(read("showcase/pregens/ace-duchamp.ssdns")).character;
check("ace.expert", ace.skillProf["Sleight of Hand"] === 2 && (ace.items || []).some((it) => it && it.catalogId === "thieves-tools-lock-picks"));
const nell = JSON.parse(read("showcase/pregens/nell-harrow.ssdns")).character;
check("nell.light", nell.items.some((it) => it.catalogId === "belt-lantern" && it.lightOut === false));

if (failures.length) {
  console.error("\n" + failures.length + " failed");
  process.exit(1);
}
console.log("dry fork lock ok");

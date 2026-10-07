/**
 * Round 7 regression checks that do not need a browser:
 * starting kits (all 12 Callings, every or-branch) and the item-reward double write.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
}

const kitsSrc = fs.readFileSync(path.join(root, "assets/js/kits.js"), "utf8");
const sandbox = { window: {}, globalThis: {}, module: { exports: {} }, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.runInNewContext(kitsSrc, sandbox, { filename: "kits.js" });
const Kits = sandbox.SSDNSKits;

check(Kits && Kits.callings.length === 12, "expected 12 callings, got " + (Kits && Kits.callings.length));

function guns(c) {
  return (c.guns || []).map((g) => g && g.weapon).filter(Boolean);
}
function melee(c) {
  return (c.melee || []).map((g) => g && g.weapon).filter(Boolean);
}
function ammo(c, type, cal) {
  const row = (c.ammo || []).find((a) => a.type === type && String(a.caliber || "") === String(cal || ""));
  return row ? row.count : 0;
}
function hasLine(c, text) {
  return String(c.equipment || "").indexOf(text) >= 0;
}

const expect = {
  "tribal-warrior": () => ({
    melee: ["buffalo-axe-greataxe", "hatchet-handaxe", "throwing-spear-javelin"],
    lines: ["Hatchet (second)", "Throwing spears ×4", "Explorer pack"]
  }),
  storyteller: (p) => {
    const names = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar" };
    const voice = p.voice === "voice";
    return {
      melee: ["bowie-shortsword"],
      guns: ["herringer-light-double-derringer"],
      ammo: ["cartridge", "Light", 20],
      instrument: p.voice || "fiddle",
      instrumentQuality: voice ? null : "cheap",
      instrumentStrings: voice ? null : "plain",
      lines: [
        voice ? "Voice — focus" : (names[p.voice] + " with a strap and one spare set of strings"),
        p.kit === "saloon" ? "Saloon kit" : "Diplomat trunk",
        "Duster"
      ]
    };
  },
  "frontier-preacher": (p) => ({
    guns: p.gun === "shotgun" ? ["single-barrel-farm-shotgun"] : [p.gun === "carbine" ? "dullards-light-carbine" : "dullards-tube-rifle"],
    melee: [p.melee === "hammer" ? "claim-hammer-light-hammer" : "trail-mace-chapel-mace-mace"],
    lines: ["Priest kit", "Carved holy symbol"],
    armor: p.armor === "scale" ? "scale-coat" : "heavy-leather-duster",
    ammo: p.gun === "shotgun" ? ["buck", ".410", 10] : ["cartridge", "Light", 20]
  }),
  "nature-guide": (p) => ({
    melee: ["machete-scimitar"],
    shield: true,
    lines: ["Wooden shield", "Explorer pack", "Herbalism kit", "Focus: " + ({ stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" }[p.focus || "stick"])]
  }),
  gunslinger: (p) => {
    const g = ["dullards-tube-rifle"];
    const lines = ["Duster", "Gun belt", "Mexican Loop holster", "Dungeoneer company kit"];
    const m = [];
    let cart = 20;
    let perc = 0;
    if (p.side === "twins" && p.irons === "navy") {
      g.push("navy-army-ball-n-cap-revolver");
      perc = 20;
      lines.push("Powder, ball, and caps ×20");
    } else if (p.side === "twins") {
      g.push("herringer-light-pepperbox", "herringer-light-pepperbox");
      cart = 40;
    } else m.push("cavalry-saber-longsword");
    return { guns: g, melee: m, lines: lines, holster: "mexican-loop", gunBelt: true, ammo: ["cartridge", "Light", cart], perc: perc };
  },
  "martial-artist": () => ({
    melee: ["bowie-shortsword"],
    lines: ["Throwing knives ×10", "Dungeoneer pack", "Rough canvas shirt and heavy boots"]
  }),
  lawman: () => ({
    melee: ["cavalry-saber-longsword", "throwing-spear-javelin"],
    shield: true,
    armor: "mail-duster",
    lines: ["Badge (tin star, focus)", "Javelins ×5", "Chain mail under heavy duster coat"]
  }),
  "frontier-scout": (p) => ({
    melee: ["bowie-shortsword"],
    guns: p.hunt === "bow" ? ["longbow"] : ["dullards-light-carbine"],
    gunBelt: true,
    lines: ["Second Bowie knife", "Gun belt", "Scale/leather coat", "Explorer trail pack", "Compass (focus)"].concat(p.hunt === "bow" ? ["Arrows ×20"] : []),
    ammo: p.hunt === "bow" ? null : ["cartridge", "Light", 20]
  }),
  gambler: (p) => ({
    melee: [p.blade === "bowie" ? "bowie-shortsword" : "sword-cane-rapier"],
    guns: p.ranged === "bow" ? ["shortbow"] : ["herringer-light-pocket-pistol"],
    lines: ["Stilettos ×2", "Thieves' tools", "Duster", "Satchel"].concat(p.ranged === "bow" ? ["Arrows ×20"] : []),
    ammo: p.ranged === "bow" ? null : ["cartridge", "Light", 20]
  }),
  hexslinger: (p) => ({
    guns: [p.gun === "hognose" ? "hognose" : "blacksnake"],
    melee: ["bowie-shortsword"],
    casterGun: p.gun === "hognose" ? "hognose" : "blacksnake",
    gunBelt: true,
    lines: ["Gun belt", "Explorer pack", "Daggers ×2"]
  }),
  "pact-seeker": () => ({
    casterGun: "borrowed-iron",
    lines: ["Borrowed Iron (pact focus)", "Dungeoneer pack", "Duster"]
  }),
  scholar: () => ({
    lines: ["Chemical Field Ledger (focus)", "Prism", "Galvanic reagents", "Scholar pack", "Duster"]
  })
};

let branches = 0;
Kits.callings.forEach((calling) => {
  const picks = Kits.branches(calling);
  check(picks.length >= 1, calling + " has no branches");
  picks.forEach((p) => {
    branches++;
    const c = Kits.apply(Kits.blankCharacter(), calling, p);
    const want = expect[calling](p);
    if (want.guns) check(JSON.stringify(guns(c)) === JSON.stringify(want.guns), calling + " guns " + JSON.stringify(p) + " → " + JSON.stringify(guns(c)));
    if (want.melee) check(JSON.stringify(melee(c)) === JSON.stringify(want.melee), calling + " melee " + JSON.stringify(p) + " → " + JSON.stringify(melee(c)));
    (want.lines || []).forEach((line) => check(hasLine(c, line), calling + " missing line " + line + " for " + JSON.stringify(p)));
    if (want.armor) check(c.armor === want.armor, calling + " armor " + c.armor);
    if (want.holster) check(c.holster === want.holster, calling + " holster");
    if (want.gunBelt) check(c.gunBelt === true, calling + " gun belt");
    if (want.shield) check(c.shield === true, calling + " shield");
    if (want.casterGun) check(c.casterGun === want.casterGun, calling + " caster gun " + c.casterGun);
    if (want.instrument) check(c.instrument === want.instrument, calling + " instrument " + c.instrument + " for " + JSON.stringify(p));
    if (want.instrumentQuality) check(c.instrumentQuality === want.instrumentQuality, calling + " instrument quality " + c.instrumentQuality);
    if (want.instrumentStrings) check(c.instrumentStrings === want.instrumentStrings, calling + " strings " + c.instrumentStrings);
    if (calling === "storyteller") {
      const bowie = (c.melee || []).find((row) => row && row.weapon === "bowie-shortsword");
      const iron = (c.guns || []).find((row) => row && row.weapon === "herringer-light-double-derringer");
      check(bowie && bowie.proficient === true, "storyteller boot knife is a proficient Bowie");
      check(iron && iron.proficient === true && iron.chamber === "light|.32 Long", "storyteller derringer is chambered Light .32 Long");
      check(!hasLine(c, "Boot knife"), "boot knife is an attack row, not a loose gear line");
    }
    if (want.ammo) check(ammo(c, want.ammo[0], want.ammo[1]) === want.ammo[2], calling + " ammo " + JSON.stringify(p) + " got " + ammo(c, want.ammo[0], want.ammo[1]));
    if (want.perc != null) check(ammo(c, "percussion", "") === want.perc, calling + " percussion " + ammo(c, "percussion", ""));
    if (calling === "gunslinger") {
      check(guns(c).indexOf("dullards-tube-rifle") === 0, "gunslinger repeater missing");
      check(!(p.side !== "twins" && guns(c).indexOf("herringer-light-pepperbox") >= 0), "saber branch must not add revolvers");
    }
  });
});
check(branches >= 12, "expected at least one branch per calling, ran " + branches);

const gunslingerBranches = Kits.branches("gunslinger");
check(gunslingerBranches.length === 3, "gunslinger branches " + JSON.stringify(gunslingerBranches));
check(gunslingerBranches.some((p) => p.side === "saber"), "saber branch");
check(gunslingerBranches.some((p) => p.side === "twins" && p.irons === "pepper"), "pepper branch");
check(gunslingerBranches.some((p) => p.side === "twins" && p.irons === "navy"), "ball n cap branch");

const join = fs.readFileSync(path.join(root, "assets/js/dm-join.js"), "utf8");
const equip = join.slice(join.indexOf("function appendEquipment"), join.indexOf("function appendEquipment") + 900);
check(equip.indexOf("function appendEquipment") === 0, "appendEquipment missing");
const equipBody = equip.slice(0, equip.indexOf("\n  function ") > 0 ? equip.indexOf("\n  function ") : 800);
check(!/postLedger\(/.test(equipBody), "appendEquipment must not write a second DM_PUSH ledger row");

const sfx = fs.readFileSync(path.join(root, "assets/js/sfx.js"), "utf8");
const ask = sfx.slice(sfx.indexOf("function askConfirm"), sfx.indexOf("function pumpAsk"));
check(/askQ\._open === message && askQ\._wait/.test(ask), "duplicate confirm must reuse the open dialog");
check(/askQ\[i\]\.message === message/.test(ask), "duplicate confirm must reuse a queued dialog");
const finish = sfx.slice(sfx.indexOf("function finish"), sfx.indexOf("function finish") + 500);
check(finish.indexOf("dlg.close") < finish.indexOf("resolve(!!ok)"), "confirm closes before the next dialog can open");

const play = fs.readFileSync(path.join(root, "assets/js/sheet-playtest.js"), "utf8");
const prompt = play.slice(play.indexOf("function maybePrompt"), play.indexOf("function featureLevel"));
check(/maybePrompt\._pending \|\| kitDialogOpen/.test(prompt), "kit confirm guard missing");
check(!/\.then\(function \(\) \{ maybePrompt\._pending = false/.test(prompt), "kit confirm lock must stay until the picker finishes");

const v2 = fs.readFileSync(path.join(root, "dm/assets/js/v2.js"), "utf8");
check(!/dexBlank \? initBonus/.test(v2), "blank DEX must not copy the init bonus");
check(/return 10/.test(v2.slice(v2.indexOf("function dexOf"), v2.indexOf("function dexOf") + 400)), "blank DEX tiebreak is 10");

const dmcc = fs.readFileSync(path.join(root, "dm/assets/js/dmcc.js"), "utf8");
check(/function holdUi/.test(dmcc), "DM form/tab hold missing");
check(!/toast\("Rejoined /.test(dmcc), "same-tab resume must not toast Rejoined");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("ok round7 kits " + Kits.callings.length + " callings, " + branches + " branches; item ledger echo absent");

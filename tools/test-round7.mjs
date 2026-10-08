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

function packName(id, fallback) {
  return ({
    trail: "Trail kit", claim: "Claim pack", circuit: "Circuit kit",
    trunk: "Circuit trunk", saloon: "Saloon kit", book: "Book trunk", alley: "Alley kit"
  })[id] || fallback;
}
const expect = {
  "tribal-warrior": () => ({
    melee: ["buffalo-axe-greataxe", "hatchet-handaxe", "hatchet-handaxe", "throwing-spear-javelin", "throwing-spear-javelin", "throwing-spear-javelin", "throwing-spear-javelin"],
    lines: ["Trail kit"]
  }),
  storyteller: (p) => {
    const voice = p.voice || "fiddle";
    const names = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar", accordion: "Accordion" };
    const stringed = voice !== "voice" && voice !== "harmonica";
    const melee = [];
    const guns = [];
    if (p.weapon === "saber") melee.push("cavalry-saber-longsword");
    else if (p.weapon === "derringer") guns.push("herringer-light-double-derringer");
    else melee.push("sword-cane-rapier");
    melee.push("stiletto-dagger");
    const lines = [
      voice === "voice" ? "Voice — focus" : (voice === "harmonica" ? "Harmonica (rides in a pocket)" : (names[voice] + " with a strap and one spare set of strings")),
      p.kit === "saloon" ? "Saloon kit" : "Circuit trunk"
    ];
    if (voice === "voice") lines.splice(1, 0, "Harmonica (kit instrument)");
    return {
      melee, guns, armor: "leather-jacket",
      ammo: p.weapon === "derringer" ? ["cartridge", "Light", 20] : null,
      instrument: voice,
      instrumentQuality: voice === "voice" ? null : "cheap",
      instrumentStrings: stringed ? "plain" : null,
      lines
    };
  },
  "frontier-preacher": (p) => {
    const guns = [];
    if (p.gun === "shotgun") guns.push("single-barrel-farm-shotgun");
    else if (p.gun === "plinker") guns.push("dullards-plinker-revolver");
    else if (p.gun === "carbine") guns.push("dullards-light-carbine");
    else guns.push("dullards-tube-rifle");
    return {
      guns,
      melee: [p.melee === "hammer" ? "sledgehammer-warhammer" : "trail-mace-chapel-mace-mace"],
      lines: ["Shield", packName(p.pack === "trail" ? "trail" : "circuit", "Circuit kit"), "Holy symbol (focus)"],
      armor: p.armor === "leather" ? "leather-jacket" : (p.armor === "mail" ? "mail-duster" : "scale-coat"),
      shield: true,
      ammo: p.gun === "shotgun" ? ["buck", ".410", 10] : ["cartridge", "Light", 20]
    };
  },
  "nature-guide": (p) => ({
    melee: p.shieldOr === "spear" ? ["machete-scimitar", "throwing-spear-javelin"] : ["machete-scimitar"],
    shield: p.shieldOr !== "spear",
    armor: "leather-jacket",
    lines: (p.shieldOr === "spear" ? [] : ["Wooden shield"]).concat([
      "Trail kit", "Herbalism kit",
      "Focus: " + ({ stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" }[p.focus || "stick"])
    ])
  }),
  gunslinger: (p) => {
    const g = ["dullards-tube-rifle"];
    const lines = ["Gun belt", "Mexican Loop holster", packName(p.pack === "trail" ? "trail" : "claim", "Claim pack")];
    const m = [];
    let cart = 20;
    let perc = 0;
    if (p.armor === "leather") {
      g.push("dullards-light-carbine");
      cart = 40;
    }
    if (p.side === "revolver") {
      g.push("navy-army-ball-n-cap-revolver");
      perc = 20;
      lines.push("Powder, ball, and caps ×20");
    } else {
      m.push("cavalry-saber-longsword");
      lines.push("Shield");
    }
    return {
      guns: g, melee: m, lines, holster: "mexican-loop", gunBelt: true,
      armor: p.armor === "leather" ? "leather-jacket" : "mail-duster",
      shield: p.side !== "revolver",
      ammo: ["cartridge", "Light", cart], perc
    };
  },
  "martial-artist": (p) => ({
    melee: ["bowie-shortsword"],
    guns: ["throwing-knife-dart"],
    lines: ["Throwing knives ×10", packName(p.pack === "trail" ? "trail" : "claim", "Claim pack"), "Rough canvas shirt and heavy boots"]
  }),
  lawman: (p) => ({
    melee: ["cavalry-saber-longsword"],
    guns: ["navy-army-ball-n-cap-revolver"],
    shield: true,
    armor: "mail-duster",
    perc: 20,
    lines: ["Badge (tin star, focus)", "Powder, ball, and caps ×20", "Mail Duster (chain mail)", packName(p.pack === "trail" ? "trail" : "circuit", "Circuit kit")]
  }),
  "frontier-scout": (p) => ({
    melee: ["bowie-shortsword", "bowie-shortsword"],
    guns: p.hunt === "carbine" ? ["dullards-light-carbine"] : ["longbow"],
    gunBelt: true,
    armor: p.armor === "leather" ? "leather-jacket" : "scale-coat",
    lines: ["Bowies ×2", "Gun belt", packName(p.pack === "claim" ? "claim" : "trail", "Trail kit"), "Keepsake (focus)"].concat(p.hunt === "carbine" ? [] : ["Arrows ×20"]),
    ammo: p.hunt === "carbine" ? ["cartridge", "Light", 20] : ["arrows", "", 20]
  }),
  gambler: (p) => ({
    melee: [p.blade === "bowie" ? "bowie-shortsword" : "sword-cane-rapier", "stiletto-dagger", "stiletto-dagger"],
    guns: p.ranged === "bow" ? ["shortbow"] : [p.ranged === "pepper" ? "herringer-light-pepperbox" : "herringer-light-pocket-pistol"],
    armor: "leather-jacket",
    lines: ["Stilettos ×2", "Thieves' tools", packName(p.pack === "claim" ? "claim" : (p.pack === "trail" ? "trail" : "alley"), "Alley kit")].concat(p.ranged === "bow" ? ["Arrows ×20"] : []),
    ammo: p.ranged === "bow" ? ["arrows", "", 20] : ["cartridge", "Light", 20]
  }),
  hexslinger: (p) => ({
    guns: [p.gun === "hognose" ? "hognose" : "blacksnake"],
    melee: ["stiletto-dagger", "stiletto-dagger"],
    casterGun: p.gun === "hognose" ? "hognose" : "blacksnake",
    gunBelt: true,
    ammo: ["cartridge", "Light", 20],
    lines: ["Gun belt", "Light cartridges ×20 (plain rounds, not in the cylinder)", "Stilettos ×2", packName(p.pack === "claim" ? "claim" : "trail", "Trail kit")]
  }),
  "pact-seeker": (p) => {
    const guns = [];
    const melee = [];
    if (p.gun === "simple") melee.push("hatchet-handaxe");
    else if (p.gun === "double") guns.push("herringer-light-double-derringer");
    else if (p.gun === "pepper") guns.push("herringer-light-pepperbox");
    else if (p.gun === "plinker") guns.push("dullards-plinker-revolver");
    else guns.push("herringer-light-pocket-pistol");
    melee.push("stiletto-dagger", "stiletto-dagger");
    return {
      guns, melee, casterGun: "borrowed-iron", armor: "leather-jacket",
      ammo: p.gun === "simple" ? null : ["cartridge", "Light", 20],
      lines: ["Borrowed Iron (pact focus)", "Stilettos ×2", packName(p.pack === "claim" ? "claim" : "book", "Book trunk")]
    };
  },
  scholar: (p) => ({
    melee: [p.weapon === "stiletto" ? "stiletto-dagger" : "trail-staff-drover-s-staff-quarterstaff"],
    lines: ["Chemical Field Ledger", "Prism (focus)", "Galvanic reagents (component pouch)", packName(p.pack === "trail" ? "trail" : "book", "Book trunk"), "Duster (traveler's clothes)"]
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
      const knife = (c.melee || []).find((row) => row && row.weapon === "stiletto-dagger");
      check(knife && knife.proficient === true, "storyteller stiletto is proficient");
      check(!hasLine(c, "Boot knife") && !hasLine(c, "Duster"), "boot knife and duster are not storyteller gear");
      if (p.weapon === "derringer") {
        const iron = (c.guns || []).find((row) => row && row.weapon === "herringer-light-double-derringer");
        check(iron && iron.proficient === true && iron.chamber === "light|.32 Long" && iron.chamberSet === true, "storyteller derringer is chambered Light .32 Long");
      }
    }
    if (calling === "lawman") {
      check(!hasLine(c, "Javelin") && melee(c).indexOf("throwing-spear-javelin") < 0, "lawman kit has no javelins");
    }
    if (want.ammo) check(ammo(c, want.ammo[0], want.ammo[1]) === want.ammo[2], calling + " ammo " + JSON.stringify(p) + " got " + ammo(c, want.ammo[0], want.ammo[1]));
    if (want.perc != null) check(ammo(c, "percussion", "") === want.perc, calling + " percussion " + ammo(c, "percussion", ""));
    if (calling === "gunslinger") {
      check(guns(c).indexOf("dullards-tube-rifle") === 0, "gunslinger tube rifle missing");
      check(guns(c).indexOf("herringer-light-pepperbox") < 0, "gunslinger starts with no matched pepperboxes");
      check(!(p.side === "saber" && guns(c).indexOf("navy-army-ball-n-cap-revolver") >= 0), "saber branch must not add a revolver");
    }
    const listed = Kits.describe(calling, p);
    check(listed.length > 0, calling + " describe() is empty");
  });
});
check(branches >= 12, "expected at least one branch per calling, ran " + branches);

const gunslingerBranches = Kits.branches("gunslinger");
check(gunslingerBranches.length === 8, "gunslinger branches " + gunslingerBranches.length);
check(gunslingerBranches.some((p) => p.side === "saber" && p.armor === "mail"), "saber and mail branch");
check(gunslingerBranches.some((p) => p.side === "revolver" && p.armor === "leather"), "ball n cap and leather branch");
check(!gunslingerBranches.some((p) => p.side === "twins" || p.irons), "no twin-revolver branch");
const lawman = Kits.apply(Kits.blankCharacter(), "lawman", {});
check(melee(lawman).join(",") === "cavalry-saber-longsword", "lawman melee is the saber");
check(guns(lawman).indexOf("navy-army-ball-n-cap-revolver") >= 0, "lawman carries a Ball n Cap");
const mod = Kits.apply(Kits.blankCharacter(), "lawman", { _start: "module" });
check(mod.badgeState === "dull" && guns(mod).length === 0, "module-start lawman badge is dull and unarmed");

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

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
  if (String(c.equipment || "").indexOf(text) >= 0) return true;
  /* 0.3.99 Equipment: a line the sheet now shows as a real thing (gun belt / holster rig, ammo pool, worn shield) */
  const spec = (Kits.kitLines || {})[text];
  if (!spec) return false;
  if (spec.rig === "belt") return c.belt === spec.id && c.gunBelt === true;
  if (spec.rig === "holster") return c.holster === spec.id || c.holsterR === spec.id;
  if (spec.covered === "ammo") return (c.ammo || []).some((a) => a && a.count > 0);
  if (spec.covered === "shield") return !!c.shield;
  if (spec.covered === "armor") return !!c.armor;
  if (spec.instrument && c.instrument === spec.instrument) return true;
  return (spec.items || []).every((id) => (c.items || []).some((it) => it && it.catalogId === id));
}

function packName(id, fallback) {
  return ({
    trail: "Trail kit", claim: "Claim pack", circuit: "Preacher's kit",
    trunk: "Traveling trunk", saloon: "Saloon kit", book: "Book trunk", alley: "Alley kit"
  })[id] || fallback;
}
const expect = {
  "tribal-warrior": (p) => ({
    melee: [p.weapon === "javelin" ? "throwing-spear-javelin" : "trail-staff-drover-s-staff-quarterstaff"],
    guns: [],
    lines: ["Trail kit"]
  }),
  storyteller: (p) => {
    const voice = p.voice || "fiddle";
    const names = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar", accordion: "Accordion" };
    const stringed = voice !== "voice" && voice !== "harmonica";
    const guns = [];
    if (p.weapon === "bow") guns.push("shortbow");
    else if (p.weapon === "plinker") guns.push("dullards-plinker-revolver");
    else if (p.weapon === "repeater") guns.push("dullards-plinker-repeater");
    else guns.push("herringer-light-pepperbox");
    const lines = [
      voice === "voice" ? "Voice — focus" : (voice === "harmonica" ? "Harmonica (rides in a pocket)" : (names[voice] + " with a strap and one spare set of strings")),
      p.kit === "saloon" ? "Saloon kit" : "Traveling trunk"
    ];
    if (voice === "voice") lines.splice(1, 0, "Harmonica (kit instrument)");
    if (p.weapon === "bow") lines.push("Arrows ×20");
    return {
      melee: [], guns, armor: "leather-jacket",
      ammo: p.weapon === "bow" ? ["arrows", "", 20] : ["cartridge", "Light", 20],
      instrument: voice,
      instrumentQuality: voice === "voice" ? null : "cheap",
      instrumentStrings: stringed ? "plain" : null,
      lines
    };
  },
  "frontier-preacher": (p) => {
    const guns = [];
    if (p.gun === "pepper") guns.push("herringer-light-pepperbox");
    else if (p.gun === "plinker") guns.push("dullards-plinker-revolver");
    else if (p.gun === "repeater") guns.push("dullards-plinker-repeater");
    else guns.push("single-barrel-farm-shotgun");
    return {
      guns,
      melee: [],
      lines: ["Shield", packName(p.pack === "trail" ? "trail" : "circuit", "Preacher's kit"), "Holy symbol (focus)"],
      armor: p.armor === "leather" ? "leather-jacket" : (p.armor === "mail" ? "mail-duster" : "scale-coat"),
      shield: true,
      ammo: (!p.gun || p.gun === "shotgun") ? ["buck", ".410", 10] : ["cartridge", "Light", 20]
    };
  },
  "nature-guide": (p) => {
    const bow = p.weapon === "bow";
    const lines = (p.shield === "no" ? [] : ["Wooden shield"]).concat([
      "Trail kit", "Herbalism kit",
      "Focus: " + ({ stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" }[p.focus || "stick"])
    ]);
    if (bow) lines.push("Arrows ×20");
    return {
      melee: bow ? [] : ["throwing-spear-javelin"],
      guns: bow ? ["shortbow"] : [],
      shield: p.shield !== "no",
      armor: "leather-jacket",
      ammo: bow ? ["arrows", "", 20] : null,
      lines
    };
  },
  gunslinger: (p) => {
    const guns = [];
    const lines = ["Gun belt", "Mexican Loop holster", packName(p.pack === "trail" ? "trail" : "claim", "Claim pack")];
    let ammoRow = ["cartridge", "Light", 20];
    let perc = 0;
    if (p.weapon === "revolver") {
      guns.push("navy-army-ball-n-cap-revolver");
      ammoRow = null;
      perc = 20;
      lines.push("Powder, ball, and caps ×20");
    } else if (p.weapon === "plinker") guns.push("dullards-plinker-revolver");
    else if (p.weapon === "repeater") guns.push("dullards-plinker-repeater");
    else guns.push("dullards-tube-rifle");
    return {
      guns, melee: [], lines, holster: "mexican-loop", gunBelt: true,
      armor: p.armor === "leather" ? "leather-jacket" : "mail-duster",
      ammo: ammoRow, perc
    };
  },
  "martial-artist": (p) => ({
    melee: [p.weapon === "baton" ? "baton-belaying-pin-club" : "trail-staff-drover-s-staff-quarterstaff"],
    guns: [],
    lines: [packName(p.pack === "trail" ? "trail" : "claim", "Claim pack"), "Rough canvas shirt and heavy boots"]
  }),
  lawman: (p) => {
    const guns = [];
    const lines = ["Badge (tin star, focus)", "Mail Duster (chain mail)", packName(p.pack === "trail" ? "trail" : "circuit", "Preacher's kit")];
    let ammoRow = null;
    let perc = 0;
    if (p.weapon === "shotgun") {
      guns.push("single-barrel-farm-shotgun");
      ammoRow = ["buck", ".410", 10];
    } else if (p.weapon === "plinker") {
      guns.push("dullards-plinker-revolver");
      ammoRow = ["cartridge", "Light", 20];
    } else if (p.weapon === "repeater") {
      guns.push("dullards-plinker-repeater");
      ammoRow = ["cartridge", "Light", 20];
    } else {
      guns.push("navy-army-ball-n-cap-revolver");
      perc = 20;
      lines.splice(1, 0, "Powder, ball, and caps ×20");
    }
    return {
      melee: [], guns, shield: true, armor: "mail-duster", perc, ammo: ammoRow, lines
    };
  },
  "frontier-scout": (p) => {
    const guns = [];
    const lines = ["Gun belt", packName(p.pack === "claim" ? "claim" : "trail", "Trail kit"), "Keepsake (focus)"];
    let ammoRow = ["cartridge", "Light", 20];
    if (p.hunt === "rifle") guns.push("dullards-tube-rifle");
    else if (p.hunt === "bow") { guns.push("longbow"); ammoRow = ["arrows", "", 20]; lines.push("Arrows ×20"); }
    else if (p.hunt === "plinker") guns.push("dullards-plinker-revolver");
    else if (p.hunt === "repeater") guns.push("dullards-plinker-repeater");
    else guns.push("dullards-light-carbine");
    return {
      melee: [], guns, gunBelt: true,
      armor: p.armor === "leather" ? "leather-jacket" : "scale-coat",
      lines, ammo: ammoRow
    };
  },
  gambler: (p) => ({
    melee: [],
    guns: [p.ranged === "pepper" ? "herringer-light-pepperbox" : (p.ranged === "plinker" ? "dullards-plinker-revolver" : (p.ranged === "repeater" ? "dullards-plinker-repeater" : "herringer-light-pocket-pistol"))],
    armor: "leather-jacket",
    lines: ["Thieves' tools", packName(p.pack === "claim" ? "claim" : (p.pack === "trail" ? "trail" : "alley"), "Alley kit")],
    ammo: ["cartridge", "Light", 20]
  }),
  hexslinger: (p) => {
    const swap = p.gun === "plinker" || p.gun === "repeater";
    const id = p.gun === "hognose" ? "hognose" : (p.gun === "plinker" ? "dullards-plinker-revolver" : (p.gun === "repeater" ? "dullards-plinker-repeater" : "blacksnake"));
    const lines = ["Gun belt", packName(p.pack === "claim" ? "claim" : "trail", "Trail kit")];
    if (!swap) lines.splice(1, 0, "Light cartridges ×20 (plain rounds, not in the cylinder)");
    return {
      guns: [id],
      melee: [],
      casterGun: swap ? null : id,
      gunBelt: true,
      ammo: ["cartridge", "Light", 20],
      lines
    };
  },
  "pact-seeker": (p) => ({
    guns: [], melee: [], casterGun: "borrowed-iron", armor: "leather-jacket",
    lines: ["Borrowed Iron (pact focus)", packName(p.pack === "claim" ? "claim" : "book", "Book trunk")]
  }),
  scholar: (p) => ({
    guns: [p.weapon === "repeater" ? "dullards-plinker-repeater" : (p.weapon === "pocket" ? "herringer-light-pocket-pistol" : "dullards-plinker-revolver")],
    melee: [],
    ammo: ["cartridge", "Light", 20],
    lines: ["Chemical Field Ledger", "Prism (focus)", "Galvanic reagents (component pouch)", packName(p.pack === "trail" ? "trail" : "book", "Book trunk"), "Duster (traveler's clothes)"]
  })
};

let branches = 0;
const cut = ["buffalo-axe-greataxe", "hatchet-handaxe", "cavalry-saber-longsword", "bowie-shortsword", "stiletto-dagger", "throwing-knife-dart", "machete-scimitar", "trail-mace-chapel-mace-mace", "sledgehammer-warhammer"];
Kits.callings.forEach((calling) => {
  const picks = Kits.branches(calling);
  check(picks.length >= 1, calling + " has no branches");
  picks.forEach((p) => {
    branches++;
    const c = Kits.apply(Kits.blankCharacter(), calling, p);
    const want = expect[calling](p);
    check(JSON.stringify(guns(c)) === JSON.stringify(want.guns || []), calling + " guns " + JSON.stringify(p) + " → " + JSON.stringify(guns(c)));
    check(JSON.stringify(melee(c)) === JSON.stringify(want.melee || []), calling + " melee " + JSON.stringify(p) + " → " + JSON.stringify(melee(c)));
    const count = guns(c).length + melee(c).length;
    check(calling === "pact-seeker" ? count === 0 : count === 1, calling + " weapon count " + count);
    cut.forEach((id) => check(guns(c).indexOf(id) < 0 && melee(c).indexOf(id) < 0, calling + " still has cut weapon " + id));
    if (calling !== "frontier-scout") check(guns(c).indexOf("dullards-light-carbine") < 0, calling + " took the Scout carbine");
    (want.lines || []).forEach((line) => check(hasLine(c, line), calling + " missing line " + line + " for " + JSON.stringify(p)));
    if (want.armor) check(c.armor === want.armor, calling + " armor " + c.armor);
    if (want.holster) check(c.holster === want.holster, calling + " holster");
    if (want.gunBelt) check(c.gunBelt === true, calling + " gun belt");
    if (want.shield) check(c.shield === true, calling + " shield");
    if (want.casterGun) check(c.casterGun === want.casterGun, calling + " caster gun " + c.casterGun);
    if (want.casterGun === null) check(!c.casterGun, calling + " caster gun should be empty");
    if (want.instrument) check(c.instrument === want.instrument, calling + " instrument " + c.instrument + " for " + JSON.stringify(p));
    if (want.instrumentQuality) check(c.instrumentQuality === want.instrumentQuality, calling + " instrument quality " + c.instrumentQuality);
    if (want.instrumentStrings) check(c.instrumentStrings === want.instrumentStrings, calling + " strings " + c.instrumentStrings);
    if (calling === "storyteller") check(!hasLine(c, "Boot knife") && !hasLine(c, "Duster"), "boot knife and duster are not storyteller gear");
    if (calling === "lawman") check(!hasLine(c, "Javelin") && melee(c).indexOf("throwing-spear-javelin") < 0, "lawman kit has no javelins");
    if (want.ammo) check(ammo(c, want.ammo[0], want.ammo[1]) === want.ammo[2], calling + " ammo " + JSON.stringify(p) + " got " + ammo(c, want.ammo[0], want.ammo[1]));
    if (want.perc != null) check(ammo(c, "percussion", "") === want.perc, calling + " percussion " + ammo(c, "percussion", ""));
    if (calling === "gunslinger") {
      check(guns(c).indexOf("herringer-light-pepperbox") < 0, "gunslinger starts with no matched pepperboxes");
      check(guns(c).indexOf("dullards-light-carbine") < 0, "gunslinger leather no longer adds a carbine");
      check(melee(c).indexOf("cavalry-saber-longsword") < 0, "gunslinger has no saber");
    }
    const listed = Kits.describe(calling, p);
    check(listed.length > 0, calling + " describe() is empty");
  });
});
check(branches >= 12, "expected at least one branch per calling, ran " + branches);

const gunslingerBranches = Kits.branches("gunslinger");
check(gunslingerBranches.length === 16, "gunslinger branches " + gunslingerBranches.length);
check(gunslingerBranches.some((p) => p.weapon === "tube" && p.armor === "mail"), "tube rifle and mail branch");
check(gunslingerBranches.some((p) => p.weapon === "revolver" && p.armor === "leather"), "ball n cap and leather branch");
check(!gunslingerBranches.some((p) => p.side === "twins" || p.irons || p.side === "saber"), "no twin or saber branch");
const lawman = Kits.apply(Kits.blankCharacter(), "lawman", {});
check(melee(lawman).length === 0, "lawman starts with no melee");
check(guns(lawman).join(",") === "navy-army-ball-n-cap-revolver", "lawman carries one Ball n Cap");
const mod = Kits.apply(Kits.blankCharacter(), "lawman", { _start: "module" });
check(mod.badgeState === "dull" && guns(mod).join(",") === "navy-army-ball-n-cap-revolver", "module-start lawman badge is dull and carries one Ball n Cap");

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

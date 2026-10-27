/* 0.3.108 (Jessey approved 2026-10-21 12:22 PM CT, DND Bot's recommendation): every Pact Seeker always knows Pact Shot
 * (Eldritch Blast) for free. It is auto-granted and does NOT count against cantrips known. JS only: rules.js is untouched
 * (the spell-list entry "Eldritch Blast (Pact Shot)" stays where it is; this file decides it's free for a Pact Seeker).
 *  - ensure(c): the sheet's cantrip list always has it (cast dropdown, spell list, cast paths all keep working).
 *  - countable(c, names): the names that count against the progression table (Pact Shot left out for a Pact Seeker).
 *  - migrate(c): once per save. A Pact Seeker who had spent a pick on it gets that pick back: c.pactShotSwap = 1 asks
 *    them to choose a replacement cantrip. Nothing else on the sheet is removed or changed.
 * Also the Borrowed Iron card's quick spell buttons (attack cantrips / spells, Pact Shot first) and the Fixed Bayonet
 * (Pact of the Blade, BOOK1 L2017) melee exception.
 */
(function (root) {
  "use strict";
  var NAME = "Eldritch Blast (Pact Shot)";
  var RX = /pact shot|eldritch blast/i;
  function isPactShot(name) { return RX.test(String(name || "")); }
  function applies(c) { return !!c && (c.calling === "pact-seeker" || c.callingId === "pact-seeker"); }
  function has(c) { return (Array.isArray(c && c.cantrips) ? c.cantrips : []).some(isPactShot); }
  function countable(c, names) {
    var list = (names || []).filter(Boolean);
    return applies(c) ? list.filter(function (n) { return !isPactShot(n); }) : list;
  }
  /* Pact Shot first in the list; returns true when it was added */
  function ensure(c) {
    if (!applies(c)) return false;
    if (!Array.isArray(c.cantrips)) c.cantrips = [];
    if (has(c)) return false;
    var slot = c.cantrips.findIndex(function (x) { return !x; });
    if (slot === 0) c.cantrips[0] = NAME;
    else c.cantrips.unshift(NAME);
    return true;
  }
  /* once per save; returns "swap" when a pick was freed, "added" when Pact Shot was granted, "" otherwise */
  function migrate(c) {
    if (!applies(c) || c.pactShotFree) return "";
    var had = has(c);
    ensure(c);
    c.pactShotFree = 1;
    if (had && c.wizardDone !== false) { c.pactShotSwap = 1; return "swap"; }
    return had ? "" : "added";
  }
  /* the free pick is still open (the sheet shows the prompt until the list is full again) */
  function swapPending(c, limit) {
    if (!applies(c) || !c.pactShotSwap) return false;
    if (limit == null) return true;
    return countable(c, c.cantrips).length < Number(limit);
  }
  var SWAP_NOTE = "Pact Shot is now free for every Pact Seeker, so the cantrip pick you spent on it is open again. Pick a replacement cantrip.";
  var FREE_TAG = "Free · always known";
  /* L0209 locked per-patron Pact Shot. Keyed by iron slug (SSDNSIronArt), never by the patron's DM-only name. */
  var DEFAULT_VARIANT = { name: "Pact Shot", subtitle: "force beams", damage: "force", range: "120 ft", shape: "attack", dice: "1d10", cone: false, rider: "" };
  var VARIANTS = {
    "hell-maker": { name: "Hellshot", subtitle: "fire beams", damage: "fire", range: "120 ft", shape: "attack", dice: "1d10", cone: false, rider: "Hit by 2 or more beams in one turn: the target takes 1d4 fire at the start of its next turn." },
    "lightslinger": { name: "Lightshot", subtitle: "radiant beams", damage: "radiant", range: "120 ft", shape: "attack", dice: "1d10", cone: false, rider: "A hit target can't be invisible and sheds dim light in a 5-foot radius until the start of your next turn." },
    "butter-repeater": { name: "Churn Shot", subtitle: "psychic beams", damage: "psychic", range: "120 ft", shape: "attack", dice: "1d10", cone: false, rider: "On a critical hit, the target is charmed by you until the end of its next turn." },
    "virgil": { name: "Belly Shot", subtitle: "point-blank force", damage: "force", range: "60 ft", shape: "attack", dice: "1d10", cone: false, pointBlank: true, rider: "You don't have disadvantage for firing at a creature within 5 feet." },
    "sirocco-long-rifle": { name: "Sirocco Shot", subtitle: "long force beams", damage: "force", range: "240 ft", shape: "attack", dice: "1d10", cone: false, rider: "" },
    "pallbearer": { name: "Pallbearer Load", subtitle: "necrotic cone", damage: "necrotic", range: "15-ft cone", shape: "cone", dice: "1d6", cone: true, rider: "15-ft cone, Dexterity save. No attack roll. Damage on a failed save only. Agonizing Blast adds Charisma to one creature only. Repelling Blast pushes each creature that fails." },
    "revenge-of-the-sea": { name: "Undertow Shot", subtitle: "cold beams", damage: "cold", range: "120 ft", shape: "attack", dice: "1d10", cone: false, rider: "Once per turn, a creature hit by this shot has its speed reduced by 10 feet until the start of your next turn." }
  };
  function characterOf(c) {
    if (c) return c;
    try {
      var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc();
      return d && d.character;
    } catch (e) { return null; }
  }
  function variant(c) {
    var ch = characterOf(c);
    var Art = root.SSDNSIronArt;
    var slug = Art && Art.slugFor ? Art.slugFor(ch) : "";
    var row = (slug && VARIANTS[slug]) || DEFAULT_VARIANT;
    return Object.assign({ slug: slug || "" }, DEFAULT_VARIANT, row);
  }
  /* Pallbearer Load: Dexterity save, no attack roll. Nd6 necrotic by cantrip tier. */
  function rollCone(c) {
    var ch = characterOf(c);
    var v = variant(ch);
    var tier = 1;
    try { tier = root.SSDNSSpellCast && root.SSDNSSpellCast.cantripTier ? root.SSDNSSpellCast.cantripTier((ch && ch.level) || 1) : 1; } catch (e) {}
    var faces = [];
    var total = 0;
    var i;
    for (i = 0; i < tier; i++) {
      var n = 1 + Math.floor(Math.random() * 6);
      faces.push(n);
      total += n;
    }
    var dc = "";
    var cha = 0;
    try {
      var comp = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : null;
      if (comp) {
        dc = comp.spellDC;
        cha = Number(comp.mods && comp.mods.CHA) || 0;
      }
    } catch (e2) {}
    var inv = (ch && (ch.invocations || ch.invocation)) || [];
    var bag = Array.isArray(inv) ? inv.join(" ") : String(inv || "");
    var ago = /agonizing/i.test(bag);
    var rep = /repelling/i.test(bag);
    var text = v.name + " · 15-ft cone · Dexterity save" + (dc !== "" && dc != null ? " DC " + dc : "") +
      " · " + tier + "d6 necrotic (" + faces.join("+") + " = " + total + ") on a failed save, nothing on a success. No attack roll." +
      (ago ? " Agonizing Blast adds " + (cha >= 0 ? "+" : "") + cha + " Charisma to one creature only." : " Agonizing Blast, if you have it, adds Charisma to one creature only.") +
      (rep ? " Repelling Blast pushes each creature that fails the save." : " Repelling Blast, if you have it, pushes each creature that fails.");
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "spell", text: text, name: v.name });
    return { ok: true, cone: true, attack: false, name: v.name, tier: tier, dice: tier + "d6", total: total, dc: dc, text: text };
  }

  /* Borrowed Iron card: quick spell buttons. Attack cantrips / spells the character knows (spell attack or a damaging
     save), Pact Shot first. Leveled spells cast at their own level, same as the spell list's Cast button. */
  function quickSpells(c) {
    if (!applies(c)) return [];
    var Cast = root.SSDNSSpellCast;
    var shot = variant(c);
    var out = [{ name: shot.name, subtitle: shot.subtitle, value: "0:" + NAME, level: 0, pact: true, cone: !!shot.cone }];
    var seen = { "eldritch blast": 1 };
    function kindOk(name) {
      var row = Cast && Cast.lookup ? Cast.lookup(name) : null;
      return !!row && (row.kind === "attack" || row.kind === "save");
    }
    function short(n) { var m = String(n).match(/\(([^)]+)\)\s*$/); return m ? m[1] : String(n); }
    (c.cantrips || []).forEach(function (n) {
      if (!n || isPactShot(n)) return;
      var k = String(n).toLowerCase();
      if (seen[k] || !kindOk(n)) return;
      seen[k] = 1;
      out.push({ name: short(n), full: n, value: "0:" + n, level: 0 });
    });
    for (var lv = 1; lv <= 9; lv++) {
      ((c.spells && c.spells[lv]) || []).forEach(function (s) {
        var n = s && s.name;
        if (!n || isPactShot(n) || !kindOk(n)) return;
        var k = String(n).toLowerCase();
        if (seen[k]) return;
        seen[k] = 1;
        out.push({ name: short(n), full: n, value: lv + ":" + n, level: lv });
      });
    }
    return out;
  }
  /* Fixed Bayonet (Pact of the Blade): the iron can take a melee form (a PHB melee weapon); that form keeps a normal
     melee attack. The gun part still fires only spells. */
  var BOONS = [["", "Not picked yet"], ["blade", "The Fixed Bayonet (Blade)"], ["tome", "The Black Ledger (Tome)"], ["chain", "The Familiar Spy (Chain)"]];
  function boonOpen(c) { return applies(c) && Number(c.level || 1) >= 3; }
  function bayonet(c) { return boonOpen(c) && c.pactBoon === "blade"; }
  function bayonetIndex(c) {
    var list = (c && Array.isArray(c.melee)) ? c.melee : [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].pactBlade && list[i].weapon) return i;
    return -1;
  }
  /* pick (or change) the bayonet's melee form: one soul-bound melee row flagged pactBlade, proficient */
  function setBayonetForm(c, weaponId) {
    if (!bayonet(c)) return { ok: false, reason: "Only the Fixed Bayonet pact boon gives the iron a melee form." };
    if (!Array.isArray(c.melee)) c.melee = [];
    var i = bayonetIndex(c);
    if (!weaponId) { if (i >= 0) c.melee.splice(i, 1); return { ok: true, index: -1 }; }
    var rules = (root.SSDNS_RULES && root.SSDNS_RULES.melee) || [];
    if (!rules.some(function (w) { return w && w.id === weaponId; })) return { ok: false, reason: "Pick a PHB melee weapon." };
    if (i >= 0) { c.melee[i].weapon = weaponId; return { ok: true, index: i }; }
    var free = c.melee.findIndex(function (m) { return !m || !m.weapon; });
    var row = { weapon: weaponId, proficient: true, equipped: true, pactBlade: true };
    if (free >= 0) c.melee[free] = Object.assign(c.melee[free] || {}, row); else c.melee.push(row);
    return { ok: true, index: bayonetIndex(c) };
  }

  /* Agonizing adds CHA to every beam. Repelling pushes 10 ft on each hit. CHA comes from the sheet, then a passed mod. */
  function blastMods(c) {
    var ch = c || characterOf(null);
    var inv = (ch && (ch.invocations || ch.invocation)) || [];
    var bag = Array.isArray(inv) ? inv.join(" ") : String(inv || "");
    var cha = NaN;
    if (ch && ch.chaMod != null && ch.chaMod !== "") cha = Number(ch.chaMod);
    if (!isFinite(cha)) {
      try {
        var comp = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : null;
        if (comp && comp.mods && comp.mods.CHA != null && comp.mods.CHA !== "") cha = Number(comp.mods.CHA);
      } catch (e) {}
    }
    if (!isFinite(cha) && ch && ch.spellMod != null && ch.spellMod !== "") cha = Number(ch.spellMod);
    if (!isFinite(cha)) cha = 0;
    return { agonizing: /agonizing/i.test(bag), repelling: /repelling/i.test(bag), cha: cha };
  }

  root.SSDNSPactShot = {
    NAME: NAME, isPactShot: isPactShot, applies: applies, has: has, countable: countable, ensure: ensure, migrate: migrate,
    swapPending: swapPending, SWAP_NOTE: SWAP_NOTE, FREE_TAG: FREE_TAG, quickSpells: quickSpells,
    VARIANTS: VARIANTS, variant: variant, rollCone: rollCone, blastMods: blastMods,
    BOONS: BOONS, boonOpen: boonOpen, bayonet: bayonet, bayonetIndex: bayonetIndex, setBayonetForm: setBayonetForm
  };
})(typeof window !== "undefined" ? window : globalThis);

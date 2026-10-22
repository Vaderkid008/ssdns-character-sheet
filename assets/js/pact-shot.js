/* 0.3.107 (Jessey approved 2026-10-21 12:22 PM CT, DND Bot's recommendation): every Pact Seeker always knows Pact Shot
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

  /* Borrowed Iron card: quick spell buttons. Attack cantrips / spells the character knows (spell attack or a damaging
     save), Pact Shot first. Leveled spells cast at their own level, same as the spell list's Cast button. */
  function quickSpells(c) {
    if (!applies(c)) return [];
    var Cast = root.SSDNSSpellCast;
    var out = [{ name: "Pact Shot", value: "0:" + NAME, level: 0, pact: true }];
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

  root.SSDNSPactShot = {
    NAME: NAME, isPactShot: isPactShot, applies: applies, has: has, countable: countable, ensure: ensure, migrate: migrate,
    swapPending: swapPending, SWAP_NOTE: SWAP_NOTE, FREE_TAG: FREE_TAG, quickSpells: quickSpells,
    BOONS: BOONS, boonOpen: boonOpen, bayonet: bayonet, bayonetIndex: bayonetIndex, setBayonetForm: setBayonetForm
  };
})(typeof window !== "undefined" ? window : globalThis);

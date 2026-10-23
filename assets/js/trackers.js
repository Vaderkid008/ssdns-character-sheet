/**
 * SAMPLE (sheet-trackers, Jessey 2026-10-19 "step 2: TRACKERS"). Not merged; visuals first.
 *
 * A) Class resource pips (sheet Main + Gear, read-only chips on the DMCC player card):
 *    Sneak Attack (Gambler, once per turn + dice), Lucky (feat, 3 / long rest), Breath Coins (Martial Artist Ki),
 *    superiority dice (Gun Whisperer + Martial Adept), sorcery points (Hexslinger Hex Well), Smite Lead (Lawman,
 *    spends a spell slot). Counts, dice and rests come from rules.js / BOOK1.md (source lines in RES below).
 * B) Non-gun weapon trackers on the weapon cards and the map token badge (Jessey's locked picks):
 *    quiver = arrows / sling stones you own (no cap) + "shot this fight" + Recover (half, PHB: BOOK1 L4197);
 *    loaded marker = crossbows + blowpipe (Loading; reload is free, one per action);
 *    count pips = thrown weapons (javelin, spear, hatchet, knife...), Recover all after the fight;
 *    charge pips = magic melee only (Peace Maker knockout, Cutlass Sun's Fury, catalog charges);
 *    count pips = consumables (Items list).
 *    Crossbows are added here with 5e stats (Jessey lock) instead of editing rules.js.
 * Misfire is firearms only: SSDNSTrackers.isFirearm() (app.js / sheet-extras.js use the same test).
 */
(function (root) {
  "use strict";
  var R = root.SSDNS_RULES || {};

  /* ---------------------------------------------------------------- crossbows (Jessey lock 2026-10-19) */
  var XBOWS = [
    { id: "hand-crossbow", name: "Hand crossbow", model: "Hand crossbow", group: "martial-ranged", cost: "7,500", damage: "1d6", dmgType: "Piercing", range: "30/120", capacity: null, misfire: "—", weight: "3 lb.", properties: "Ammunition (bolts), light, loading", category: "martial", ability: "DEX", ammo: "bolts", src: "Jessey lock 2026-10-19 (5e PHB stats; western name later)" },
    { id: "light-crossbow", name: "Light crossbow", model: "Light crossbow", group: "simple-ranged", cost: "2,500", damage: "1d8", dmgType: "Piercing", range: "80/320", capacity: null, misfire: "—", weight: "5 lb.", properties: "Ammunition (bolts), loading, two-handed", category: "simple", ability: "DEX", ammo: "bolts", src: "Jessey lock 2026-10-19 (5e PHB stats; western name later)" },
    { id: "heavy-crossbow", name: "Heavy crossbow", model: "Heavy crossbow", group: "martial-ranged", cost: "5,000", damage: "1d10", dmgType: "Piercing", range: "100/400", capacity: null, misfire: "—", weight: "18 lb.", properties: "Ammunition (bolts), heavy, loading, two-handed", category: "martial", ability: "DEX", ammo: "bolts", src: "Jessey lock 2026-10-19 (5e PHB stats; western name later)" }
  ];
  if (R.otherRanged) XBOWS.forEach(function (x) { if (!R.otherRanged.some(function (w) { return w && w.id === x.id; })) R.otherRanged.push(x); });
  /* Bolt price (Encounter Bot, per Jessey 2026-10-19 9:50 PM CT): one pack shared by all three crossbows,
     listed with the cartridge bundles in the gear list and the DM store (R.ammo), right after Arrows (20). */
  var BOLTS = { id: "crossbow-bolts-20", name: "Crossbow bolts (20)", cost: "100", weight: "1½ lb.", src: "Encounter Bot via Jessey 2026-10-19 (sample; not yet in BOOK1)", pack: 20, type: "bolts", fits: ["hand-crossbow", "light-crossbow", "heavy-crossbow"] };
  if (R.ammo && !R.ammo.some(function (a) { return a && a.id === BOLTS.id; })) {
    var at = -1; R.ammo.forEach(function (a, k) { if (a && a.id === "arrows-20") at = k; });
    if (at >= 0) R.ammo.splice(at + 1, 0, BOLTS); else R.ammo.push(BOLTS);
  }
  /* extra ammo pool types for the Ammo list (arrows already exist) */
  var AMMO_EXTRA = [
    { id: "bolts", label: "Crossbow bolts" },
    { id: "stones", label: "Sling stones / bullets" },
    { id: "needles", label: "Blowpipe needles" }
  ];
  var POOL_FOR = { arrows: "arrows", "sling stones": "stones", bolts: "bolts", needles: "needles" };
  var POOL_WORD = { arrows: "arrows", stones: "stones", bolts: "bolts", needles: "needles" };

  /* ---------------------------------------------------------------- helpers */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function num(v, d) { var n = parseInt(v, 10); return isFinite(n) ? n : (d === undefined ? 0 : d); }
  function app() { return root.SSDNSApp; }
  function ch() { var A = app(); var d = A && A.doc && A.doc(); return d && d.character; }
  function patch(fn) { var A = app(); if (A && A.applyPatch) A.applyPatch(function (d) { fn(d.character); }); }
  function toast(m) { if (root.SSDNSToast) root.SSDNSToast(m); }
  function log(text, kind) { if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: kind || "note", text: text }); }
  function rollDice(n, sides) { var t = 0, list = []; for (var k = 0; k < n; k++) { var r = 1 + Math.floor(Math.random() * sides); list.push(r); t += r; } return { total: t, list: list }; }
  function post(label, formula, result, detail) {
    var J = root.SSDNSDmJoin;
    if (J && J.isJoined && J.isJoined() && J.postRoll) J.postRoll({ label: label, formula: formula, result: result, detail: detail });
  }
  function lists() { R = root.SSDNS_RULES || R; return [].concat(R.firearms || [], R.casterGuns || [], R.otherRanged || [], R.melee || []); }
  function weapon(id) {
    if (!id) return null;
    var hit = lists().filter(function (w) { return w && w.id === id; })[0];
    if (hit) return hit;
    if (root.SSDNSItems && root.SSDNSItems.weaponRecord) {
      try {
        var rec = root.SSDNSItems.weaponRecord(id);
        /* catalog magic weapons: keep the item text so "once per short rest" / "returns to hand" can be read */
        var row = rec && root.SSDNSItems.byId ? root.SSDNSItems.byId(id) : null;
        if (rec && row) rec.description = String(row.description || "") + " " + String((row.effect && row.effect.text) || "");
        return rec || null;
      } catch (e) {}
    }
    return null;
  }
  var FIREARM_GROUPS = /^(pistol|rifle|carbine|shotgun|bigbore|caster)$/;
  function isFirearm(w) {
    if (!w) return false;
    if (w.tiers || w.hexShells || w.debug) return true;
    if (w.kind === "firearm") return true;
    return FIREARM_GROUPS.test(String(w.group || ""));
  }
  /* quiver | loaded | thrown | melee | firearm | "" */
  function kindOf(w) {
    if (!w) return "";
    if (isFirearm(w)) return "firearm";
    var p = String(w.properties || "").toLowerCase();
    if (/ammunition/.test(p) && /loading/.test(p)) return "loaded";
    if (/ammunition/.test(p) || w.ammo === "arrows" || w.kind === "bow") return "quiver";
    if (/\bthrown\b/.test(p) || w.kind === "thrown") {
      if (/returns to (your )?hand/i.test(String(w.description || ""))) return "melee";
      return "thrown";
    }
    return "melee";
  }
  function poolType(w) {
    var a = String((w && w.ammo) || "").toLowerCase();
    if (POOL_FOR[a]) return POOL_FOR[a];
    var m = String((w && w.properties) || "").toLowerCase().match(/ammunition \(([^)]+)\)/);
    return m ? (POOL_FOR[m[1]] || m[1]) : "arrows";
  }
  function pool(c, type, create) {
    c.ammo = c.ammo || [];
    var p = c.ammo.filter(function (a) { return a && a.type === type; })[0];
    if (!p && create) { p = { type: type, caliber: "", count: 0 }; c.ammo.push(p); }
    return p || null;
  }
  /* ---------------------------------------------------------------- special arrows (L0186, Jessey + DND Bot 2026-10-20)
     BOOK1 "##### Special arrows" (L4214-4223). Each type is its own Ammo pool: { type: "arrows", caliber: <id> }; a blank
     caliber (every arrow pool saved before this) is Standard, which stays exactly as it was. The bow card picks which
     type is nocked (guns[i].arrowType). Weight and recovery the table doesn't give use 5E defaults (see open questions). */
  var ARROW_TYPES = [
    { id: "standard", name: "Standard", word: "arrows", pack: 20, packId: "arrows-20", packName: "Arrows (20)", cost: "100", weight: "1 lb.", recover: "half", short: "",
      fx: "Weapon damage, piercing.", head: "#8f969d", fletch: "#5e8a55", src: "BOOK1 Ammunition table" },
    { id: "broadhead", name: "Broadhead", word: "broadheads", pack: 5, packId: "arrows-broadhead-5", packName: "Broadhead arrows (5)", cost: "50", weight: "¼ lb.", recover: "none", short: "+1 vs beasts",
      beast: 1, fx: "+1 damage against beasts. Breaks on a hit.", head: "#4f565d", fletch: "#a33a2a", src: "BOOK1 L4218" },
    { id: "blunt", name: "Blunt", word: "blunts", pack: 5, packId: "arrows-blunt-5", packName: "Blunt arrows (5)", cost: "25", weight: "¼ lb.", recover: "half", short: "bludgeoning",
      dtype: "bludgeoning", fx: "Bludgeoning. Can knock a creature out at 0 HP instead of killing it.", head: "#b8894a", fletch: "#d8b23a", src: "BOOK1 L4219" },
    { id: "fire", name: "Fire", word: "fire arrows", pack: 5, packId: "arrows-fire-5", packName: "Fire arrows (5)", cost: "100", weight: "¼ lb.", recover: "none", short: "+1d4 fire",
      dice: "1d4", dtype: "fire", fx: "Lighting it takes your object interaction. +1d4 fire; sets hay, roofs, and wagons alight. Never recovered.", head: "#e0702a", fletch: "#c8541f", src: "BOOK1 L4220" },
    { id: "whistler", name: "Whistler", word: "whistlers", pack: 5, packId: "arrows-whistler-5", packName: "Whistler arrows (5)", cost: "50", weight: "¼ lb.", recover: "half", short: "1d4+Dex bludg.",
      die: "1d4", dtype: "bludgeoning", fx: "1d4 + Dex bludgeoning instead of the bow's die. Heard about a mile off; used for signals.", head: "#3f6f9a", fletch: "#3f6f9a", src: "BOOK1 L4221" },
    { id: "poison", name: "Poison", word: "poison arrows", pack: 3, packId: "arrows-poison-3", packName: "Poison arrows (3)", cost: "1,500", weight: "0.15 lb.", recover: "standard", short: "DC 10 Con",
      poison: true, fx: "On a hit, DC 10 Con save or 1d4 poison. Coating lasts 1 minute once unwrapped. Illegal in most towns.", head: "#7b3fa0", fletch: "#4b2468", src: "BOOK1 L4222" },
    { id: "dynamite", name: "Dynamite", word: "dynamite arrows", pack: 1, packId: "", packName: "", cost: "1 stick + 1 arrow", weight: "1 lb.", recover: "none", short: "no attack roll",
      made: true, fx: "Powder Man only. Aim at a point within the bow's short range; no attack roll. Works like a thrown stick, with the fuse and misfire rules.", head: "#a3221c", fletch: "#5e8a55", src: "BOOK1 L4223" }
  ];
  var ARROW_BY_ID = {}; ARROW_TYPES.forEach(function (t) { ARROW_BY_ID[t.id] = t; });
  if (R.ammo) {
    var after = "arrows-20";
    ARROW_TYPES.slice(1).forEach(function (t) {
      if (t.made) return; /* dynamite arrows are made, never sold */
      if (R.ammo.some(function (a) { return a && a.id === t.packId; })) { after = t.packId; return; }
      var row = { id: t.packId, name: t.packName, cost: t.cost, weight: t.weight, src: "L0186 special arrows (" + t.src + ")", pack: t.pack, type: "arrows", arrow: t.id };
      var k = -1; R.ammo.forEach(function (a, n) { if (a && a.id === after) k = n; });
      if (k >= 0) R.ammo.splice(k + 1, 0, row); else R.ammo.push(row);
      after = t.packId;
    });
  }
  /** A pool caliber → arrow type id. Blank or unknown (older saves) = standard. */
  function arrowId(cal) {
    var s = String(cal == null ? "" : cal).trim().toLowerCase();
    if (!s) return "standard";
    if (ARROW_BY_ID[s]) return s;
    for (var k = 0; k < ARROW_TYPES.length; k++) if (ARROW_TYPES[k].name.toLowerCase() === s) return ARROW_TYPES[k].id;
    return "standard";
  }
  function arrowType(id) { return ARROW_BY_ID[arrowId(id)]; }
  function arrowPool(c, id, create) {
    c.ammo = c.ammo || [];
    id = arrowId(id);
    var p = c.ammo.filter(function (a) { return a && a.type === "arrows" && arrowId(a.caliber) === id; })[0];
    if (!p && create) { p = { type: "arrows", caliber: id === "standard" ? "" : id, count: 0 }; c.ammo.push(p); }
    return p || null;
  }
  function arrowCount(c, id) {
    var n = 0; id = arrowId(id);
    ((c && c.ammo) || []).forEach(function (a) { if (a && a.type === "arrows" && arrowId(a.caliber) === id) n += num(a.count); });
    return n;
  }
  function arrowTotal(c) { var n = 0; ((c && c.ammo) || []).forEach(function (a) { if (a && a.type === "arrows") n += num(a.count); }); return n; }
  /** The nocked type: the slot's pick, else Standard, else the first type you still have. */
  function nocked(c, g) {
    if (g && g.arrowType && ARROW_BY_ID[g.arrowType]) return g.arrowType;
    if (arrowCount(c, "standard") > 0) return "standard";
    for (var k = 1; k < ARROW_TYPES.length; k++) if (arrowCount(c, ARROW_TYPES[k].id) > 0) return ARROW_TYPES[k].id;
    return "standard";
  }
  /** Shot this fight by type. Shots counted before types (spentAmmo only) are standard. */
  function spentByType(g) {
    var by = {}, sum = 0;
    Object.keys((g && g.spentBy) || {}).forEach(function (k) { var n = num(g.spentBy[k]); if (n > 0 && ARROW_BY_ID[k]) { by[k] = n; sum += n; } });
    var extra = num(g && g.spentAmmo) - sum;
    if (extra > 0) by.standard = (by.standard || 0) + extra;
    return by;
  }
  /** Back after the fight (DND Bot L0186): half = Standard, Blunt, Whistler; standard = Poison (half back, as standard
      arrows: the coating is gone); none = Broadhead, Fire, Dynamite. */
  function recoverBack(t, n) {
    if (t.recover === "none") return 0;
    return Math.floor(n / 2);
  }
  function arrowRecover(g) {
    var by = spentByType(g), back = {}, total = 0, lost = [];
    Object.keys(by).forEach(function (k) {
      var t = ARROW_BY_ID[k], b = recoverBack(t, by[k]), to = t.recover === "standard" ? "standard" : k;
      back[to] = (back[to] || 0) + b; total += b;
      if (t.recover === "none") lost.push(t.word);
    });
    return { by: by, back: back, total: total, lost: lost };
  }
  /** One lit arrow (fire or dynamite) per turn (DND Bot L0186). Cleared when the turn pips reset or on a rest. */
  function litBlocked(c) { return c && c.res && c.res.litUsed ? "One lit arrow per turn (fire or dynamite). You already lit one this turn; Reset the turn pips on a new turn." : ""; }
  /** One arrow, point up. Line-art like the map bow icon; the head and fletching mark the type. */
  function arrowSvg(t, spent) {
    var head;
    switch (t.id) {
      case "broadhead": head = '<path d="M5 0 L9.5 7 L6.2 5.6 L5 7.6 L3.8 5.6 L.5 7 Z" fill="' + t.head + '"/>'; break;
      case "blunt": head = '<rect x="2.6" y="1" width="4.8" height="5.4" rx="2" fill="' + t.head + '" stroke="#6d4c2a" stroke-width=".6"/>'; break;
      case "fire": head = '<path d="M5 0 C7.6 2.4 7.4 4.6 5 6.2 C2.6 4.6 2.4 2.4 5 0 Z" fill="#f2a33a"/><path d="M5 2 C6.2 3.4 6 4.4 5 5.2 C4 4.4 3.8 3.4 5 2 Z" fill="#c8301f"/><rect x="3.4" y="6" width="3.2" height="3.4" rx="1" fill="#3b2a1c"/>'; break;
      case "whistler": head = '<path d="M5 0 L7.4 4 L2.6 4 Z" fill="' + t.head + '"/><ellipse cx="5" cy="6.4" rx="2.6" ry="2.2" fill="' + t.head + '"/><circle cx="5" cy="6.4" r=".8" fill="#fff8e6"/>'; break;
      case "poison": head = '<path d="M5 0 L8 6.4 L2 6.4 Z" fill="#8f969d"/><path d="M5 1.6 L6.9 5.6 L3.1 5.6 Z" fill="' + t.head + '"/><circle cx="5" cy="8.6" r="1.1" fill="' + t.head + '"/>'; break;
      case "dynamite": head = '<path d="M5 0 L7.4 3.6 L2.6 3.6 Z" fill="#8f969d"/><rect x="2.4" y="3.4" width="5.2" height="8" rx="1" fill="' + t.head + '"/><path d="M7.2 4 Q9.6 2.6 9 .6" fill="none" stroke="#3d2a16" stroke-width=".7"/><circle cx="9" cy=".8" r=".8" fill="#f2a33a"/>'; break;
      default: head = '<path d="M5 0 L8 6.4 L2 6.4 Z" fill="' + t.head + '"/>';
    }
    var fl = t.fletch;
    return '<svg class="trk-arrow-svg" viewBox="0 0 10 28" width="10" height="28" aria-hidden="true" focusable="false">' +
      '<line x1="5" y1="6" x2="5" y2="26" stroke="#6d4c2a" stroke-width="1.3"/>' + head +
      '<path d="M5 18 L1.4 21.4 L1.4 25.6 L5 23 Z" fill="' + fl + '" stroke="rgba(0,0,0,.35)" stroke-width=".4"/>' +
      '<path d="M5 18 L8.6 21.4 L8.6 25.6 L5 23 Z" fill="' + fl + '" stroke="rgba(0,0,0,.35)" stroke-width=".4"/>' +
      '<path d="M3.6 28 L5 25.4 L6.4 28" fill="none" stroke="#3d2a16" stroke-width=".9"/></svg>';
  }
  /* Jessey 2026-10-20 8:38 AM: click the quiver / bolt / pouch art to shoot, same as the card's Roll button.
     One click = one shot of the nocked type (not per arrow). Keyboard: Enter / Space. Double-clicks fire once. */
  function shootTip(c, g) { return "Click to shoot (nocked: " + arrowType(nocked(c, g)).name + ")"; }
  function shootAttrs(i, tip) {
    return ' data-trk-shoot="' + i + '" role="button" tabindex="0" title="' + esc(tip) + '" aria-label="' + esc(tip) + '"';
  }
  var lastShoot = {}, SHOOT_GAP = 600;
  function shootFrom(i, ev, viaKey) {
    if (ev && !viaKey && ev.detail > 1) return false; /* the second click of a double-click */
    var now = Date.now();
    if (lastShoot[i] && now - lastShoot[i] < SHOOT_GAP) return false;
    lastShoot[i] = now;
    var card = document.querySelector('.gun[data-row="' + i + '"]');
    var btn = (card && card.querySelector('[data-gunroll="' + i + '"]')) || document.querySelector('[data-gunroll="' + i + '"]:not([data-k])');
    if (!btn || btn.hidden || btn.disabled) return false;
    btn.click(); /* the exact Roll path: target, Attack pips, lit-arrow rule, dynamite, ammo spend */
    if (viaKey) setTimeout(function () {
      var a = document.activeElement;
      if (a && a !== document.body) return; /* a dialog (target picker) took focus: leave it */
      var n = document.querySelector('[data-trk-shoot="' + i + '"]'); if (n) n.focus();
    }, 350);
    return true;
  }
  /** The quiver: one group per type you carry (remaining, then this fight's spent as ghosts). Nocked group is ringed. */
  function quiverArt(c, g, i) {
    var cur = nocked(c, g), by = spentByType(g), html = "";
    var groups = ARROW_TYPES.filter(function (t) { return arrowCount(c, t.id) || num(by[t.id]) || t.id === cur; });
    var cap = groups.length > 1 ? 10 : 30; /* one type: up to 30 drawn as before; mixed: up to 10 per type */
    groups.forEach(function (t) {
      var have = arrowCount(c, t.id), sp = num(by[t.id]);
      var n = Math.min(have, cap), ghosts = Math.min(sp, 6);
      var inner = "";
      for (var k = 0; k < n; k++) inner += '<span class="trk-arrow" data-arrow="' + t.id + '" role="img" aria-label="' + esc(t.name) + ' arrow">' + arrowSvg(t) + "</span>";
      if (have > n) inner += '<span class="trk-more">+' + (have - n) + "</span>";
      for (var s = 0; s < ghosts; s++) inner += '<span class="trk-arrow spent" data-arrow="' + t.id + '" title="Shot this fight">' + arrowSvg(t, true) + "</span>";
      html += '<span class="trk-agrp' + (t.id === cur ? " nocked" : "") + '" data-arrow-grp="' + t.id + '" title="' + esc(shootTip(c, g) + ". " + t.name + ": " + have + " left. " + t.fx + " Recover: " + t.recover + ".") + '">' + inner +
        (t.id === "standard" && ARROW_TYPES.every(function (x) { return x.id === "standard" || (!arrowCount(c, x.id) && !num(by[x.id])); }) ? "" : '<span class="trk-atag">' + esc(t.id === "standard" ? "std" : t.short) + "</span>") + "</span>";
    });
    return '<span class="trk-pips ammo arrows trk-arrows"' + shootAttrs(i, shootTip(c, g)) + ">" + html + "</span>";
  }
  function nockPicker(c, g, i, ro) {
    var cur = nocked(c, g);
    var opts = ARROW_TYPES.filter(function (t) { return t.id === cur || arrowCount(c, t.id) > 0; }).map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === cur ? " selected" : "") + ">" + esc(t.name) + " · " + arrowCount(c, t.id) + (t.short ? " (" + esc(t.short) + ")" : "") + "</option>";
    }).join("");
    return '<label class="trk-nock-l" title="' + esc(arrowType(cur).fx) + '">Nocked <select class="trk-nock" data-trk-nock="' + i + '" aria-label="Nocked arrow type"' + (ro ? " disabled" : "") + ">" + opts + "</select></label>";
  }
  /** The bow's damage type with the nocked arrow (Blunt: bludgeoning). "" = the weapon's own type. */
  function nockedDtype(g, c) {
    var w = g && weapon(g.weapon);
    if (!w || kindOf(w) !== "quiver" || poolType(w) !== "arrows") return "";
    var t = arrowType(nocked(c || ch() || {}, g));
    return t.dtype && !t.dice ? t.dtype : "";
  }
  /** L0196 (Jessey 2026-10-20 12:15 PM): an arrow with its own die (Whistler: 1d4) replaces the bow's base weapon die.
      Only the die changes: Dex, magic +X, style, buff dice and rider dice still add; a crit doubles the 1d4 as usual.
      "" = the bow's own die (standard, blunt, fire, ... and every save before this). */
  function nockedDie(g, c) {
    var w = g && weapon(g.weapon);
    if (!w || kindOf(w) !== "quiver" || poolType(w) !== "arrows") return "";
    var t = arrowType(nocked(c || ch() || {}, g));
    return t.die || "";
  }
  /** Swap the leading base die of a damage expression for the arrow's own die ("1d8 +3 ..." -> "1d4 +3 ...").
      A crit doubles dice later in the roll, so this always takes the uncritted expression. No die on the arrow = unchanged. */
  function arrowDieExpr(expr, id) {
    if (!id || expr == null) return expr;
    var t = arrowType(id);
    if (!t || !t.die) return expr;
    return String(expr).replace(/^(\s*)\d*d\d+/i, "$1" + t.die);
  }
  /** Bow card extras: broadhead "beast" tick, dynamite note, Powder Man's Make dynamite arrow. */
  function arrowExtras(c, g, i) {
    var cur = nocked(c, g), html = "";
    if (cur === "broadhead") html += '<label class="tiny trk-nock-l" title="Broadhead: +1 damage against beasts (tick before you shoot)"><input type="checkbox" data-trk-beast="1"' + (c.res && c.res.arrowBeast ? " checked" : "") + "> beast</label>";
    if (cur === "dynamite") html += '<span class="fine trk-dyn-hint">Roll shoots it at a point within ' + (shortRange(weapon(g.weapon)) || "short") + ' ft: no attack roll; past 50 ft it scatters.</span>';
    if (isPowderMan(c)) {
      var why = canMakeDynamite(c);
      html += '<button type="button" class="btn xs" data-trk-dyn-make="' + i + '"' + (why ? ' disabled title="' + esc(why) + '"' : ' title="Powder Man: tie 1 Dynamite Stick to 1 standard arrow."') + ">Make dynamite arrow</button>";
    }
    return html;
  }
  /** rider() part: the nocked arrow's extra dice on a hit (crit doubles them). */
  function arrowRiders(ctx) {
    var t = ctx && ctx.arrow ? arrowType(ctx.arrow) : null;
    if (!t || !t.dice || !(ctx.hit || ctx.pending)) return [];
    var m = t.dice.match(/(\d+)d(\d+)/), n = num(m[1], 1), sides = num(m[2], 4);
    if (ctx.crit) n *= 2;
    var r = rollDice(n, sides);
    return [{ label: t.id === "fire" ? "fire arrow" : t.name.toLowerCase(), formula: n + "d" + sides, faces: r.list, total: r.total, type: t.dtype || "", arrow: t.id }];
  }
  /** Gun-card damage hook: changes the base damage for the arrow that flew. Returns null for standard / no arrow. */
  function arrowAdjust(dmg, id, ctx) {
    if (!id) return null;
    var t = arrowType(id), c = ch() || {};
    if (t.id === "standard") return null;
    var out = { id: t.id, name: t.name, note: t.name + " arrow" };
    if (t.noDamage) { out.none = true; out.note = t.name + ": no damage"; return out; }
    if (t.dtype && !t.dice) out.type = t.dtype;
    if (t.die) { out.die = t.die; out.note = "Whistler arrow: " + t.die + " + Dex bludgeoning in place of the bow's die; heard about a mile off"; }
    if (t.id === "blunt") out.note = "Blunt arrow: bludgeoning; at 0 HP you can knock it out instead";
    if (t.id === "fire") out.note = "Fire arrow (lighting it was your object interaction; one lit arrow per turn); sets hay, roofs, and wagons alight";
    if (t.poison) { var pr = rollDice(1, 4); out.note = "Poison arrow: DC 10 Con save or " + pr.total + " poison (1d4 «" + pr.total + "»)"; out.poison = pr.total; }
    if (t.beast && dmg) {
      if (c.res && c.res.arrowBeast) {
        dmg.total += 1; dmg.flat = (dmg.flat || 0) + 1;
        dmg.formula = String(dmg.formula || "") + "+1"; dmg.detail = String(dmg.detail || "") + "+1";
        out.part = { label: "broadhead vs beast", value: 1 }; out.note = "Broadhead: +1 vs a beast; breaks on a hit";
      } else out.note = "Broadhead (+1 only vs a beast); breaks on a hit";
    }
    return out;
  }
  /* ---- dynamite arrows: Powder Man makes them (1 dynamite stick + 1 standard arrow), never sold */
  var STICK_ID = "dynamite-stick-standard-fuse";
  function isPowderMan(c) { return !!(c && Array.isArray(c.feats) && c.feats.indexOf("powder-man") >= 0); }
  function stickItem(c) { return ((c && c.items) || []).filter(function (it) { return it && (it.catalogId === STICK_ID || it.id === STICK_ID) && num(it.count == null ? 1 : it.count) > 0; })[0] || null; }
  function canMakeDynamite(c) {
    if (!isPowderMan(c)) return "Powder Man only.";
    if (!stickItem(c)) return "Needs a Dynamite Stick (standard fuse) in Items.";
    if (arrowCount(c, "standard") <= 0) return "Needs a standard arrow.";
    return "";
  }
  function makeDynamite(cc) {
    var why = canMakeDynamite(cc);
    if (why) return { ok: false, reason: why };
    var st = stickItem(cc), n = num(st.count == null ? 1 : st.count);
    if (n > 1) st.count = n - 1; else cc.items = cc.items.filter(function (x) { return x !== st; });
    var sp = arrowPool(cc, "standard", false); sp.count = num(sp.count) - 1;
    var dp = arrowPool(cc, "dynamite", true); dp.count = num(dp.count) + 1;
    return { ok: true, count: dp.count };
  }
  function shortRange(w) { var m = String((w && w.range) || "").match(/(\d+)/); return m ? num(m[1]) : 0; }
  /** Bow + dynamite nocked: no attack roll. Spends the arrow and resolves the stick at a point (fuse + misfire rules). */
  function shootDynamite(i, opts) {
    opts = opts || {};
    var c = ch(), g = c && c.guns && c.guns[i], w = g && weapon(g.weapon);
    if (!g || !w || nocked(c, g) !== "dynamite") return null;
    if (!isPowderMan(c) && !opts.dm) return { ok: false, reason: "Dynamite arrows are Powder Man only." };
    if (arrowCount(c, "dynamite") <= 0) return { ok: false, reason: "No dynamite arrows. Make one on the bow card (1 stick + 1 arrow)." };
    var lit = litBlocked(c);
    if (lit && !opts.dm) return { ok: false, reason: lit };
    if (lit) log("DM shot: " + lit + " Shot anyway.", "alert");
    var sr = shortRange(w), dist = opts.distance;
    if (dist == null && typeof document !== "undefined") { var ds = document.getElementById("explosiveDist"); if (ds && ds.value) dist = num(ds.value); }
    if (dist != null && sr && dist > sr) return { ok: false, reason: "Too far. A dynamite arrow lands within the bow's short range (" + sr + " ft)." };
    var I = root.SSDNSItems, stick = I && I.byId ? I.byId(STICK_ID) : null;
    if (!stick || !I.use) return { ok: false, reason: "No dynamite rules loaded." };
    var tgt = root.SSDNSPlaytest && root.SSDNSPlaytest.targetInfo ? root.SSDNSPlaytest.targetInfo() : null;
    var item = Object.assign({}, stick, { name: "a dynamite arrow" });
    /* DND Bot L0186: inside 50 ft it lands on the point; past 50 ft it scatters as a thrown stick (items.js useExplosive
       scatters past its 50 ft band for a Powder Man). The bow reaches further than a throw, so the distance handed to the
       stick rules is capped at its 100 ft max; the scatter roll is the same. Fuse, misfire and dud rolls are the stick's. */
    var pm = isPowderMan(c);
    var useDist = dist == null ? null : (dist > 50 ? Math.min(dist, pm ? 100 : 60) : dist);
    var plan = I.use(item, { distance: useDist, powderMan: pm, name: c.name || "Someone", target: tgt && tgt.name ? tgt.name : (opts.point || "") });
    var chat = String(plan.chat || "").replace(" lights and throws ", " lights and shoots ").replace("Light + throw is 1 action; Extra Attack doesn't add throws.", "Lighting it is your object interaction; the shot is one attack of your Attack action.").replace(/ Optional reaction: anyone can shoot the stick[^.]*\.[^.]*\./, "") + " (" + w.name + ", no attack roll" + (dist != null ? ", aimed " + dist + " ft" + (dist > 50 ? ": past 50 ft it scatters" : ": lands on the point") : "") + ".)";
    if (plan.dud) chat += " The dud lies where it landed.";
    patch(function (cc) {
      var dp = arrowPool(cc, "dynamite", false); if (dp) dp.count = Math.max(0, num(dp.count) - 1);
      cc.res = cc.res || {}; cc.res.litUsed = true;
      var gg = cc.guns[i]; gg.spentAmmo = num(gg.spentAmmo) + 1; gg.spentBy = gg.spentBy || {}; gg.spentBy.dynamite = num(gg.spentBy.dynamite) + 1;
      if (plan.selfDamage && isFinite(Number(cc.hpCurrent))) cc.hpCurrent = Math.max(0, Number(cc.hpCurrent) - plan.selfDamage);
    });
    if (root.SSDNSAudio) {
      root.SSDNSAudio.play("fuse");
      /* sfx key arrow-dynamite (explode pool); a dud stays quiet. attack-fx: the blast waits for the arrow to land
         (sfx.json fx.boomFlight, same clock the map's arc uses) */
      if (!plan.dud && root.SSDNSAudio.arrowCue) {
        var dc = root.SSDNSAudio.arrowCue("dynamite", "");
        var FXT = root.SSDNSMapFx && root.SSDNSMapFx.TIMING;
        var land = FXT && isFinite(Number(FXT.boomFlight)) ? Number(FXT.boomFlight) : 560;
        if (dc) setTimeout(function () { root.SSDNSAudio.play(dc); }, land);
      }
    }
    log(chat, "roll"); toast(chat);
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postChat) root.SSDNSDmJoin.postChat({ text: chat });
    /* attack-fx: arc + boom on the map for everyone (the DM's map publishes it) */
    if (tgt && tgt.id && root.SSDNSDmJoin && root.SSDNSDmJoin.postFx) {
      root.SSDNSDmJoin.postFx({ type: "boom", arrow: "dynamite", target: tgt.id, result: plan.dud ? "dud" : "hit", weapon: w.name });
    }
    /* DND Bot L0186: the shot replaces one attack of the Attack action (Extra Attack applies) */
    if (root.SSDNSActionPips && root.SSDNSActionPips.attack) root.SSDNSActionPips.attack(w.name + " dynamite arrow");
    paint();
    return Object.assign({ ok: true }, plan, { chat: chat });
  }
  function pipsState() { var P = root.SSDNSActionPips; return P && P.state ? P.state() : {}; }

  /* ---------------------------------------------------------------- A) class resources */
  function calling(c) { return (R.callings || []).filter(function (x) { return x.id === c.calling; })[0] || null; }
  function lv(c) { return Math.max(1, Math.min(20, num(c && c.level, 1))); }
  function hasFeat(c, id) { return ((c && c.feats) || []).indexOf(id) >= 0; }
  function progCol(c, colName) {
    var cal = calling(c);
    if (!cal || !cal.progression) return "";
    var cols = cal.progression.columns || [];
    var k = cols.indexOf(colName);
    var row = (cal.progression.rows || [])[lv(c) - 1];
    return k >= 0 && row ? String(row[k] || "") : "";
  }
  /** Every limited resource this character has. Source lines are BOOK1.md (live PHB copy, 2026-10-19). */
  function resourcesFor(c) {
    var out = [];
    if (!c) return out;
    var L = lv(c);
    if (c.calling === "gambler") {
      var dice = progCol(c, "Sneak Attack") || (Math.ceil(L / 2) + "d6");
      out.push({ id: "sneak", kind: "sneak", name: "Sneak Attack", dice: dice, max: 1, rest: "turn",
        tip: "Suckerpunch / Dead Angle: once per turn, " + dice + " extra damage to one creature you hit with advantage (or an ally within 5 ft and no disadvantage).",
        src: "BOOK1 L1790-1791 (feature), L1806-1827 (dice by level)" });
    }
    if (c.calling === "martial-artist" && L >= 2) {
      var ki = num(progCol(c, "Ki"), L);
      out.push({ id: "ki", kind: "pips", name: "Breath Coins (Ki)", max: ki, rest: "short",
        tip: "Ki points equal to level. Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike (1). Regain all on a short or long rest (PHB; SSDNS is silent, L899).",
        src: "BOOK1 L1463-1464, L1473 (Stunning Strike), Ki column L1479-1500; rest per PHB (L899)" });
    }
    if (c.calling === "gunslinger" && c.subclass === "gun-whisperer-battle-master" && L >= 3) {
      var n = L >= 15 ? 6 : (L >= 7 ? 5 : 4);
      var die = L >= 18 ? "d12" : (L >= 10 ? "d10" : "d8");
      out.push({ id: "sup", kind: "pips", name: "Superiority dice", die: die, max: n, rest: "short", roll: die,
        tip: "Combat Superiority: " + n + " " + die + " for Trick Shots, one per attack. Regain all on a short or long rest." + (L >= 15 ? " Relentless: roll initiative with none left, regain one." : ""),
        src: "BOOK1 L1418 (dice, rest), L1421 (d10/d12), L1422 (Relentless)" });
    }
    if (hasFeat(c, "martial-adept")) {
      out.push({ id: "supMA", kind: "pips", name: "Superiority die (Martial Adept)", die: "d6", max: 1, rest: "short", roll: "d6",
        tip: "One d6 superiority die, added to any you already have. Regained on a short or long rest.",
        src: "BOOK1 L5023-5028" });
    }
    if (c.calling === "hexslinger" && L >= 2) {
      out.push({ id: "sorc", kind: "pips", name: "Sorcery points (Hex Well)", max: num(progCol(c, "Sorcery Pts"), L), rest: "long",
        tip: "Sorcery points equal to your Hexslinger level. Regain all on a long rest. Etch a shell (1st 2 · 2nd 3 · 3rd 5 · 4th 6 · 5th 7), melt a shell for points, Hex Tricks." + (L >= 20 ? " Sorcerous Restoration: regain 4 on a short rest." : ""),
        src: "BOOK1 L1901-1906 (Hex Well), L1908-1918 (Hex Tricks), table L1926-1946" });
    }
    if (hasFeat(c, "lucky")) {
      out.push({ id: "lucky", kind: "pips", name: "Luck points (Lucky)", max: 3, rest: "long",
        tip: "3 luck points, regained on a long rest. Spend one to roll another d20 on an attack, check or save (or vs an attack on you).",
        src: "BOOK1 L5014-5021" });
    }
    if (c.calling === "lawman" && L >= 2) {
      out.push({ id: "smite", kind: "smite", name: "Smite Lead", max: 0, rest: "long",
        tip: "On a weapon hit (guns too), spend a spell slot: 2d8 radiant +1d8 per slot level above 1st (max 5d8), +1d8 vs undead or fiends." + (L >= 11 ? " Improved Smite Lead: +1d8 on every hit." : ""),
        src: "BOOK1 L1586-1587 (Smite Lead), L1611 (Improved, 11th), slots L1601-1620" });
    }
    classUses(c, L, out);
    return out;
  }
  function abil(c, a) { return Math.floor((num(c && c.abilities && c.abilities[a], 10) - 10) / 2); }
  function sub(c) { return String((c && c.subclass) || ""); }
  /* Limited-use features (Callings, subclasses, lineages, feats). SSDNS line first; where it is silent the 5E PHB
     value applies (BOOK1 L899: "Build yours with the PHB class rules in full"). rest: short | long | day | week. */
  function u(out, id, name, max, rest, tip, src) {
    if (max === Infinity) { out.push({ id: id, kind: "unlimited", name: name, max: 0, rest: rest, tip: tip, src: src }); return; }
    if (max > 0) out.push({ id: id, kind: "pips", name: name, max: max, rest: rest, tip: tip, src: src });
  }
  function classUses(c, L, out) {
    var cha = abil(c, "CHA"), wis = abil(c, "WIS"), cl = c.calling, sc = sub(c);
    if (cl === "tribal-warrior") {
      var rg = progCol(c, "Rages");
      u(out, "rage", "Dust Fury (Rage)", /unlimited/i.test(rg) ? Infinity : num(rg, L >= 17 ? 6 : L >= 12 ? 5 : L >= 6 ? 4 : L >= 3 ? 3 : 2), "long",
        "Bonus action to enter Dust Fury. Rages by level (table); regain all on a long rest (PHB). Unlimited at 20th.",
        "BOOK1 L942-943, Rages column L964-985 (20th: Unlimited); rest per PHB (L899)");
    }
    if (cl === "storyteller") {
      u(out, "rally", "Rally Word (Inspiration die " + (progCol(c, "Insp. Die") || "d6") + ")", Math.max(1, cha), L >= 5 ? "short" : "long",
        "Bonus action: an ally within 60 ft adds your Inspiration die. Uses = Charisma modifier (min 1); regain on a long rest, on a short rest from 5th (Font of Inspiration, PHB). Cutting Words, Peerless Skill and Combat Inspiration spend these.",
        "BOOK1 L1044-1045, L1078 (Font of Inspiration), L1110/L1112/L1119; count + rest per PHB (L899)");
      if (c.instrument !== "voice") u(out, "instrumentDc", "Instrument: Rally die to a save DC", 1, "short",
        "Playing your Calling instrument: once per short rest, add your Rally Word die to one target's save DC.", "BOOK1 L1059-1061");
      var perk = { banjo: ["Banjo: +1d4 to a Rally die", "BOOK1 L4723"], guitar: ["Guitar: +1 to a spell save DC", "BOOK1 L4724"], accordion: ["Accordion: disadvantage on first save", "BOOK1 L4725"] }[c.instrument];
      if (perk) u(out, "instrumentPerk", perk[0], 1, "short", "Instrument perk, once per short rest.", perk[1]);
    }
    if (cl === "frontier-preacher") {
      if (L >= 2) u(out, "creed", "Channel the Creed", L >= 18 ? 3 : L >= 6 ? 2 : 1, "short",
        "Turn the Unquiet or your Domain option (Preserve Life, Guided Strike). 1 per rest, 2 at 6th, 3 at 18th; short or long rest.",
        "BOOK1 L1157-1158, table L1173 (1/rest), L1177 (2/rest), L1189 (3/rest)");
      if (L >= 10) u(out, "intervene", "Divine Intervention", 1, "week",
        "Call on your god. On a success you can't use it again for 7 days; on a failure, after a long rest (PHB). Tracked as 7 days: clear it by hand after a failure.",
        "BOOK1 L1163, table L1181; timing per PHB (L899)");
      if (sc === "shotgun-preacher-war") u(out, "warPriest", "War Priest", Math.max(1, wis), "long",
        "Bonus action weapon attack after the Attack action, Wisdom modifier times (min 1) per long rest.", "BOOK1 L1213");
    }
    if (cl === "nature-guide") {
      if (L >= 2) u(out, "wildShape", "Beast Mantle (Wild Shape)", L >= 20 ? Infinity : 2, "short",
        "Assume a frontier beast's shape twice per short or long rest. Unlimited at 20th. Skinwalker: Elemental Wild Shape spends two.",
        "BOOK1 L1254-1255, L1269 (unlimited, 20th), L1321 (two uses)");
      if (sc === "circle-of-the-open-range-land" && L >= 2) u(out, "natRecovery", "Natural Recovery", 1, "day",
        "On a short rest, recover spell slots totalling half your level (rounded up), once per day (PHB).", "BOOK1 L1309; once/day per PHB (L899)");
    }
    if (cl === "gunslinger") {
      u(out, "secondWind", "Dust Breath (Second Wind)", 1, "short", "Bonus action: regain 1d10 + level HP. Once per short or long rest.", "BOOK1 L1354-1355");
      if (L >= 2) u(out, "actionSurge", "Second Cylinder (Action Surge)", L >= 17 ? 2 : 1, "short",
        "One extra action on your turn. 1 use, 2 at 17th; short rest (one per turn, PHB).", "BOOK1 L1357-1358, table L1376 (one use), L1391 (2 uses)");
      if (L >= 9) u(out, "indomitable", "Iron Nerve (Indomitable)", L >= 17 ? 3 : L >= 13 ? 2 : 1, "long",
        "Reroll a failed saving throw. 1 use at 9th, 2 at 13th, 3 at 17th; long rest.", "BOOK1 L1366-1367, table L1383 (1), L1387 (2), L1391 (3)");
    }
    if (cl === "martial-artist" && sc === "rough-and-tumble-brawler-open-hand" && L >= 6)
      u(out, "whistle", "Whistle Recovery", 1, "long", "Action: heal 3 × your level HP. Once per long rest.", "BOOK1 L1514");
    if (cl === "lawman") {
      u(out, "oathSense", "Oath Sense", Math.max(1, 1 + cha), "long",
        "Detect restless dead, hell-branded fiends or a sacred presence within 60 ft. 1 + Cha mod times per day; regain on a long rest (PHB).", "BOOK1 L1565-1566; rest per PHB (L899)");
      if (L >= 3) u(out, "deputize", "Deputize", L >= 11 ? 2 : 1, "long",
        "Once per long rest per deputy, your deputy adds your Charisma modifier to one d20 roll. 1 deputy, 2 at 11th.", "BOOK1 L1584, table L1603 / L1611");
      if (L >= 3 && sc) u(out, "oathCreed", "Channel Creed (oath)", 1, "short",
        "Your oath's Channel Creed option (Sacred Weapon, Turn the Corrupt, Vow of Enmity, Control Undead). Once per short or long rest (PHB). Not while the badge is Dull.",
        "BOOK1 L1633-1634, L1641, L1652, L1577 (Dull); rest per PHB (L899)");
    }
    if (cl === "gambler" && L >= 20) u(out, "strokeLuck", "Stroke of Luck", 1, "short", "Turn a miss into a hit (or a failed check into a 20). Once per rest.", "BOOK1 L1799-1800");
    if (cl === "hexslinger" && sc === "chaos-wild-magic") u(out, "tides", "Tides of Chaos", 1, "long",
      "Advantage on one attack, check or save. Once per long rest (the DM can recharge it with a wild-spark roll).", "BOOK1 L1971");
    if (cl === "pact-seeker") {
      [[11, 6], [13, 7], [15, 8], [17, 9]].forEach(function (a) {
        if (L >= a[0]) u(out, "arcanum" + a[1], "Mystic Arcanum (" + a[1] + "th)", 1, "long", "Cast your " + a[1] + "th-level arcanum once per long rest.", "BOOK1 L2019-2020, table L2038-2044");
      });
      if (L >= 20) u(out, "eldritchMaster", "Eldritch Master", 1, "long", "Spend 1 minute to regain all pact slots, once per long rest (PHB).", "BOOK1 L2020; rest per PHB (L899)");
    }
    if (cl === "scholar") {
      u(out, "dustLamp", "Dust-Lamp Recovery", 1, "day", "During a short rest, recover slots totalling half your level (rounded up). Once per day.", "BOOK1 L2110-2111");
      if (L >= 20) u(out, "signature", "Signature Spells (2 × 3rd)", 2, "short", "Cast each signature spell once at 3rd level without a slot; regain on a short or long rest (PHB).", "BOOK1 L2113-2114; per PHB (L899)");
    }
    /* lineage traits */
    var lin = String(c.lineage || ""), subl = String(c.sublineage || "");
    if (lin === "aristocrats" && subl === "night-house") {
      if (L >= 3) u(out, "nhFaerie", "Night House: faerie fire", 1, "long", "Cast faerie fire once per long rest (3rd level).", "BOOK1 L494");
      if (L >= 5) u(out, "nhDark", "Night House: darkness", 1, "long", "Cast darkness once per long rest (5th level).", "BOOK1 L494");
    }
    if (lin === "camp-kin") u(out, "breath", "Fire-Eater's Trick (breath)", 1, "long", "Breath weapon, once per long rest.", "BOOK1 L633, L662-663");
    if (lin === "pioneers") u(out, "relentlessEnd", "Relentless Endurance", 1, "long", "Drop to 1 HP instead of 0, once per long rest.", "BOOK1 L832-833");
    if (lin === "street-folk") {
      if (L >= 3) u(out, "ilRebuke", "Infernal Legacy: hellish rebuke", 1, "long", "Cast hellish rebuke (2nd level) once per long rest.", "BOOK1 L879-880");
      if (L >= 5) u(out, "ilDark", "Infernal Legacy: darkness", 1, "long", "Cast darkness once per long rest.", "BOOK1 L879-880");
    }
    if (hasFeat(c, "weave-touched")) u(out, "weaveSpell", "Weave-Touched 1st-level spell", 1, "long", "Cast the feat's 1st-level spell once per long rest.", "BOOK1 L5217");
  }
  /** The generic featureUses tracker (sheet-playtest useRule) must not double-count what the class panel tracks. */
  var COVERED = /^(Dust Fury|Rally Word|Dying Weave Spellcasting|Channel the Creed|Divine Intervention|Beast Mantle|Dust Breath|Second Cylinder|Iron Nerve|Mystic Arcanum|Dust-Lamp Recovery|Oath Sense|Night House Magic|Relentless|Breath Weapon|Infernal Legacy|Reliable Talent)/i;
  function coversFeature(name) { return COVERED.test(String(name || "").trim()); }
  function rageMax(c) { var r = resourcesFor(c).filter(function (x) { return x.id === "rage"; })[0]; return !r ? 0 : (r.kind === "unlimited" ? Infinity : r.max); }
  function used(c, id) { if (id === "rage") return num(c && c.rageUsed, 0); return num(((c && c.res) || {})[id], 0); }
  function left(c, r) { return Math.max(0, r.max - used(c, r.id)); }
  function setUsed(id, n) { patch(function (c) { if (id === "rage") { c.rageUsed = Math.max(0, n); return; } c.res = c.res || {}; c.res[id] = Math.max(0, n); }); paint(); }

  function slotRows() {
    var A = app(), c = ch();
    if (!A || !c) return [];
    var rows = [];
    for (var l = 1; l <= 5; l++) {
      var total = 0, a = (c.hexLead && c.hexLead[l]) || [];
      try { var v = A.compute(); total = (v.hex && v.hex[l]) || 0; } catch (e) {}
      if (c.overrides && c.overrides["hex." + l] !== undefined && c.overrides["hex." + l] !== "") total = num(c.overrides["hex." + l]);
      if (!total) continue;
      var spent = 0; for (var k = 0; k < total; k++) if (a[k]) spent++;
      rows.push({ level: l, total: total, left: total - spent });
    }
    return rows;
  }
  function pipRow(id, max, have, opts) {
    opts = opts || {};
    var html = "";
    for (var k = 0; k < max; k++) {
      var on = k < have;
      /* art-only pips inside a click-to-shoot row: plain spans (a disabled button swallows the click) */
      if (opts.art) { html += '<span class="trk-pip' + (on ? " on" : "") + (opts.cls ? " " + opts.cls : "") + '" aria-hidden="true"></span>'; continue; }
      html += '<button type="button" class="trk-pip' + (on ? " on" : "") + (opts.cls ? " " + opts.cls : "") + '" data-trk-res="' + esc(id) + '" data-trk-on="' + (on ? 1 : 0) + '"' +
        (opts.ro ? " disabled" : "") + ' title="' + (on ? "Ready. Click to spend one." : "Spent. Click to get one back.") + '" aria-label="' + esc(opts.label || id) + " " + (k + 1) + (on ? " ready" : " spent") + '">' + (opts.glyph || "") + "</button>";
    }
    return html;
  }
  function rageBtn(c) {
    return '<button type="button" class="btn xs' + (c.raging ? " btn-primary" : "") + '" data-trk-rage="1" title="' + (c.raging ? "End Dust Fury" : "Enter Dust Fury (bonus action, spends one)") + '">' + (c.raging ? "Raging: end" : "Enter Dust Fury") + "</button>";
  }
  function restTag(r) { return { turn: "1 / turn", short: "short rest", long: "long rest", day: "1 / day", week: "7 days" }[r.rest] || "long rest"; }
  function resHtml(c, opts) {
    opts = opts || {};
    var list = resourcesFor(c);
    if (!list.length) return "";
    var body = list.map(function (r) {
      var head = '<span class="trk-name" title="' + esc(r.tip + " · " + r.src) + '">' + esc(r.name) + (r.die ? ' <span class="trk-die">' + esc(r.die) + "</span>" : "") + "</span>";
      if (r.kind === "sneak") {
        var spent = !!(c.res && c.res.sneakUsed), armedS = !!(c.res && c.res.sneakArmed);
        return '<div class="trk-res trk-sneak' + (spent ? " spent" : "") + '">' + head +
          '<span class="trk-dice">' + esc(r.dice) + "</span>" +
          (opts.ro ? "" : '<button type="button" class="trk-arm' + (armedS ? " on" : "") + '" data-trk-arm="sneak"' + (spent && !armedS ? " disabled" : "") + ' aria-pressed="' + armedS + '" title="Arm BEFORE you attack. On a hit the ' + esc(r.dice) + ' ride in that attack\'s damage and the once-per-turn use is spent; on a miss nothing is used. Clears after one attack either way.">' + (armedS ? "Armed: next attack" : "Sneak Attack next attack") + "</button>") +
          '<button type="button" class="trk-turn' + (spent ? "" : " on") + '" data-trk-sneak="1"' + (opts.ro ? " disabled" : "") + ' title="' + (spent ? "Used this turn (clears on your next turn). Click to clear: DM call." : "Ready this turn") + '">' + (spent ? "Used this turn" : "Ready") + "</button>" +
          '<span class="trk-rest">' + restTag(r) + "</span></div>";
      }
      if (r.kind === "smite") {
        var rows = opts.slots || slotRows();
        var badgeWhy = badgeWhyOf(c, "smite");
        var avail = rows.filter(function (s) { return s.left > 0; });
        var armedM = num(c.res && c.res.smiteArmed);
        var ord = function (n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); };
        var slotHtml = rows.length ? rows.map(function (s) {
          return '<span class="trk-slot"><span class="trk-slv">' + ord(s.level) + '</span>' +
            pipRow("slot" + s.level, s.total, s.left, { ro: true, cls: "slot", label: "Level " + s.level + " slot" }) + "</span>";
        }).join("") : '<span class="fine">No spell slots yet.</span>';
        var curLv = armedM || (avail[0] && avail[0].level) || 1;
        var pick = opts.ro || avail.length < 2 ? "" : '<select class="trk-smite-lv" data-trk-smite-lv="1" aria-label="Smite slot level">' + avail.map(function (s) {
          return '<option value="' + s.level + '"' + (s.level === curLv ? " selected" : "") + ">" + ord(s.level) + " · " + Math.min(5, s.level + 1) + "d8</option>";
        }).join("") + "</select>";
        var why = badgeWhy || (!avail.length ? "No spell slot left" : "");
        var arm = opts.ro ? "" : '<label class="tiny" title="+1d8 vs undead or fiends (set before the attack)"><input type="checkbox" data-trk-smite-undead="1"' + (c.res && c.res.smiteUndead ? " checked" : "") + "> unquiet / fiend</label>" +
          '<button type="button" class="trk-arm' + (armedM ? " on" : "") + '" data-trk-arm="smite"' + (why && !armedM ? ' disabled title="' + esc(why) + '"' : ' title="Arm BEFORE you attack. On a weapon hit the ' + ord(curLv) + '-level slot is spent and ' + Math.min(5, curLv + 1) + 'd8 radiant rides in that attack\'s damage (crit doubles the dice). On a miss nothing is spent. Clears after one attack either way."') + ' aria-pressed="' + !!armedM + '">' +
          (armedM ? "Armed: smite next attack (" + ord(armedM) + ")" : "Smite next attack" + (avail.length === 1 ? " (" + ord(curLv) + ")" : "")) + "</button>";
        return '<div class="trk-res trk-smite">' + head + '<span class="trk-slots">' + slotHtml + "</span>" + pick + arm + '<span class="trk-rest">spends a slot on a hit</span></div>';
      }
      if (r.kind === "unlimited") {
        return '<div class="trk-res">' + head + '<span class="trk-unl">Unlimited</span>' + (r.id === "rage" && !opts.ro ? rageBtn(c) : "") + '<span class="trk-rest">' + restTag(r) + "</span></div>";
      }
      var have = opts.ro ? Math.max(0, r.max - num(((c.res || {})[r.id]), 0)) : left(c, r);
      /* 0.3.108 Badge Bound (PHB L1577): no Channel Creed while the badge is Dull or Tarnished (pips locked, uses kept) */
      var creedWhy = r.id === "oathCreed" ? badgeWhyOf(c, "creed") : "";
      if (creedWhy) {
        return '<div class="trk-res trk-badge-off" title="' + esc(creedWhy) + '">' + head + '<span class="trk-pips">' + pipRow(r.id, r.max, have, { ro: true, label: r.name }) + "</span>" +
          '<span class="trk-count">' + have + "/" + r.max + '</span><span class="fine trk-why">' + esc(creedWhy) + '</span><span class="trk-rest">' + restTag(r) + "</span></div>";
      }
      var roll = r.roll && !opts.ro ? '<button type="button" class="btn xs" data-trk-spend-roll="' + esc(r.id) + '"' + (have ? "" : " disabled") + ' title="Spend one and roll it">Use ' + esc(r.roll) + "</button>" : "";
      return '<div class="trk-res">' + head + '<span class="trk-pips">' + pipRow(r.id, r.max, have, { ro: opts.ro, label: r.name }) + "</span>" +
        '<span class="trk-count">' + have + "/" + r.max + "</span>" + roll + (r.id === "rage" && !opts.ro ? rageBtn(c) : "") + '<span class="trk-rest">' + restTag(r) + "</span></div>";
    }).join("");
    return '<div class="trk-panel' + (opts.ro ? " ro" : "") + '"><div class="trk-title">Class resources</div>' + body + "</div>";
  }

  /* ---------------------------------------------------------------- B) weapon trackers */
  function glyph(kind) {
    return { arrows: "➶", stones: "●", bolts: "➶", needles: "|", thrown: "", charge: "✦" }[kind] || "";
  }
  function gunTracker(c, i) {
    var g = c.guns && c.guns[i], w = g && weapon(g.weapon), k = kindOf(w);
    if (!g || !g.weapon || !w) return "";
    if (k === "quiver" && poolType(w) === "arrows") {
      /* Arrow types DRAFT (2026-10-20): drawn arrows per type, a Nocked picker, Recover by each type's rule */
      var ahave = arrowTotal(c), ashot = num(g.spentAmmo), ar = arrowRecover(g);
      var canRec = ar.total > 0 || (ashot > 0 && ar.lost.length > 0);
      return '<div class="trk-weap trk-quiver" data-trk-gun="' + i + '"><span class="trk-label">Quiver</span>' +
        quiverArt(c, g, i) +
        '<span class="trk-count">' + ahave + " arrows</span>" +
        (ahave || g.arrowType ? nockPicker(c, g, i) : "") + arrowExtras(c, g, i) +
        (ashot ? '<span class="trk-shot" title="Shot this fight and lying around">' + ashot + " shot</span>" : "") +
        '<button type="button" class="btn xs" data-trk-recover="' + i + '"' + (canRec ? "" : " disabled") + ' title="After the fight: Standard, blunt and whistler arrows: half back (PHB). Poison arrows: half back as standard arrows. Broadhead, fire and dynamite arrows never come back.">Recover ' + (ar.total ? "½ (+" + ar.total + ")" : "½") + "</button>" +
        (ahave ? "" : '<span class="fine trk-warn">Out of arrows. Add them under Ammo.</span>') + "</div>";
    }
    if (k === "quiver") {
      var t = poolType(w), p = pool(c, t, false), have = p ? num(p.count) : 0, shot = num(g.spentAmmo);
      var show = Math.min(have, 30);
      var word = POOL_WORD[t] || t;
      var rec = Math.floor(shot / 2);
      return '<div class="trk-weap trk-quiver" data-trk-gun="' + i + '"><span class="trk-label">' + (t === "stones" ? "Pouch" : "Quiver") + "</span>" +
        '<span class="trk-pips ammo ' + esc(t) + '"' + shootAttrs(i, "Click to shoot (" + (t === "stones" ? "sling stone" : String(word).replace(/s$/, "")) + ")") + ">" + pipRow("q" + i, show, show, { ro: true, art: true, cls: "ammo", label: word }) + (have > 30 ? '<span class="trk-more">+' + (have - 30) + "</span>" : "") + "</span>" +
        '<span class="trk-count">' + have + " " + esc(word) + "</span>" +
        (shot ? '<span class="trk-shot" title="Shot this fight and lying around">' + shot + " shot</span>" : "") +
        '<button type="button" class="btn xs" data-trk-recover="' + i + '"' + (rec ? "" : " disabled") + ' title="After the fight: recover half your spent ' + esc(word) + ' (PHB). The rest are broken or lost.">Recover ' + (rec ? "½ (+" + rec + ")" : "½") + "</button>" +
        (have ? "" : '<span class="fine trk-warn">Out of ' + esc(word) + ". Add them under Ammo.</span>") + "</div>";
    }
    if (k === "loaded") {
      var t2 = poolType(w), p2 = pool(c, t2, false), have2 = p2 ? num(p2.count) : 0, loaded = num(g.loaded) > 0;
      var word2 = POOL_WORD[t2] || t2;
      return '<div class="trk-weap trk-loaded" data-trk-gun="' + i + '"><span class="trk-label">Loading</span>' +
        '<span class="trk-bolt' + (loaded ? " on" : "") + '"' + shootAttrs(i, "Click to shoot (" + (loaded ? "loaded: one " + word2.replace(/s$/, "") : "empty: auto-loads 1 " + word2.replace(/s$/, "")) + ")") + ">" + (loaded ? "LOADED" : "EMPTY") + "</span>" +
        '<button type="button" class="btn xs" data-trk-load="' + i + '"' + (loaded || !have2 ? " disabled" : "") + ' data-cost="Free" title="Load one ' + esc(word2.replace(/s$/, "")) + '. Free. Loading: one shot per action, bonus action or reaction, even with Extra Attack.">Load (free)</button>' +
        '<span class="trk-count">' + have2 + " " + esc(word2) + " left</span>" +
        (num(g.spentAmmo) ? '<span class="trk-shot">' + num(g.spentAmmo) + ' shot</span><button type="button" class="btn xs" data-trk-recover="' + i + '" title="After the fight: recover half (PHB ammunition rule)">Recover ½ (+' + Math.floor(num(g.spentAmmo) / 2) + ")</button>" : "") + "</div>";
    }
    if (k === "thrown") return thrownHtml("gun", i, g, w);
    return "";
  }
  /* Jessey 2026-10-19: javelins and spears are Recover ½ (5e ammunition rule applied to them); knives, hatchets and
     nets stay Recover all. */
  function halfBack(w) { return !!w && /javelin|spear/i.test(String(w.id || "") + " " + String(w.name || "")); }
  function thrownHtml(slot, i, row, w) {
    var owned = Math.max(1, num(row.count, 1)), out = Math.min(owned, num(row.out));
    var half = halfBack(w), back = half ? Math.floor(out / 2) : out;
    var pips = "";
    for (var k = 0; k < owned; k++) {
      var gone = k >= owned - out;
      pips += '<span class="trk-pip thrown' + (gone ? "" : " on") + '" title="' + (gone ? "Thrown, lying on the field" : "In hand / on the belt") + '"></span>';
    }
    var name = (w && w.name) || "";
    return '<div class="trk-weap trk-thrown" data-trk-' + slot + '="' + i + '"><span class="trk-label">' + (/net/i.test(name) ? "Nets" : "Carried") + "</span>" +
      '<span class="trk-pips">' + pips + "</span>" +
      '<span class="trk-count">' + (owned - out) + "/" + owned + "</span>" +
      '<span class="trk-stepper"><button type="button" class="btn xs ghost" data-trk-own="' + slot + ":" + i + ':-1" title="Own one fewer">−</button><button type="button" class="btn xs ghost" data-trk-own="' + slot + ":" + i + ':1" title="Own one more">+</button></span>' +
      (slot === "melee" ? '<button type="button" class="btn xs" data-trk-throw="' + i + '"' + (owned - out > 0 ? "" : " disabled") + ' title="Throw one (ranged attack with the thrown property)">Throw</button>' : "") +
      (half
        ? '<button type="button" class="btn xs" data-trk-recall="' + slot + ":" + i + '"' + (out && !row.lost ? "" : " disabled") + ' title="After the fight: recover half the thrown javelins / spears, rounded down (Jessey: same rule as arrows and bolts). The rest are broken or lost.">Recover ½' + (out ? " (+" + back + ")" : "") + "</button>"
        : '<button type="button" class="btn xs" data-trk-recall="' + slot + ":" + i + '"' + (out ? "" : " disabled") + ' title="After the fight: pick them all back up (Jessey: thrown knives and hatchets are all recovered)">Recover all</button>') +
      (row.lost ? '<span class="fine trk-warn">All lost. Buy more, or use + to set how many you own.</span>' : "") + "</div>";
  }
  function chargeInfo(c, i) {
    var row = c.melee && c.melee[i], w = row && weapon(row.weapon);
    if (!row || !w) return null;
    var pm = root.SSDNSPeaceMaker;
    if (pm && row.weapon === pm.id) {
      var u = (c.featureUses || {})[pm.usesKey] || { max: 1, used: 0 };
      return { key: pm.usesKey, max: u.max || 1, left: Math.max(0, (u.max || 1) - (u.used || 0)), label: "Knockout", rest: "short rest" };
    }
    var desc = String(w.description || w.text || (w.effect && w.effect.text) || "");
    if (/once per short rest/i.test(desc)) {
      var key = (w.name || row.weapon) + " (1/short rest)";
      var u2 = (c.featureUses || {})[key] || { max: 1, used: 0 };
      return { key: key, max: 1, left: Math.max(0, 1 - (u2.used || 0)), label: /blind/i.test(desc) ? "Sun's Fury" : "Power", rest: "short rest", feature: true };
    }
    var item = (c.items || []).filter(function (it) { return it && (it.catalogId === row.weapon || it.uid === row.itemId); })[0];
    if (item && item.uses && num(item.uses.max) > 0) {
      return { item: item.uid, max: num(item.uses.max), left: item.chargesLeft == null ? num(item.uses.max) : num(item.chargesLeft), label: "Charges", rest: item.uses.recharge ? item.uses.recharge + " recharge" : "no recharge" };
    }
    return null;
  }
  function meleeTracker(c, i) {
    var row = c.melee && c.melee[i], w = row && weapon(row.weapon), k = kindOf(w);
    if (!row || !row.weapon || !w) return "";
    if (k === "thrown") return thrownHtml("melee", i, row, w);
    var info = chargeInfo(c, i);
    if (!info) return ""; /* plain melee: no tracker (Jessey) */
    var pips = "";
    for (var n = 0; n < info.max; n++) pips += '<button type="button" class="trk-pip charge' + (n < info.left ? " on" : "") + '" data-trk-charge="' + i + '" title="' + (n < info.left ? "Ready" : "Spent") + '">✦</button>';
    return '<div class="trk-weap trk-charge" data-trk-melee="' + i + '"><span class="trk-label">' + esc(info.label) + "</span><span class=\"trk-pips\">" + pips + '</span><span class="trk-count">' + info.left + "/" + info.max + '</span><span class="trk-rest">' + esc(info.rest) + "</span></div>";
  }

  /** app.js spendRound hook for non-capacity, non-firearm gun-slot weapons. null = not ours. */
  function spendShot(c, i, w) {
    var g = c && c.guns && c.guns[i];
    var k = kindOf(w);
    if (!g || (k !== "quiver" && k !== "loaded" && k !== "thrown")) return null;
    if (k === "quiver" && poolType(w) === "arrows") {
      var nid = nocked(c, g), at = ARROW_BY_ID[nid], ap = arrowPool(c, nid, false);
      if (nid === "dynamite") return { ok: false, reason: "A dynamite arrow has no attack roll. Use Roll on the bow card (it aims at a point)." };
      if (!ap || num(ap.count) <= 0) {
        var ap2 = null; c.ammo.forEach(function (a) { if (!ap2 && a && a.type === "arrows" && arrowId(a.caliber) === nid && num(a.count) > 0) ap2 = a; });
        ap = ap2;
      }
      if (nid === "fire" && litBlocked(c)) return { ok: false, reason: litBlocked(c) };
      if (!ap) return { ok: false, reason: arrowTotal(c) > 0 ? "No " + at.word + " left. Nock another type on the bow card." : "Out of arrows. Recover some after the fight, or buy more." };
      ap.count = num(ap.count) - 1;
      g.spentAmmo = num(g.spentAmmo) + 1;
      g.spentBy = g.spentBy || {};
      g.spentBy[nid] = num(g.spentBy[nid]) + 1;
      if (nid === "fire") { c.res = c.res || {}; c.res.litUsed = true; } /* lighting it is the object interaction; one lit arrow per turn */
      return { ok: true, left: arrowCount(c, nid), unit: at.word, arrow: nid };
    }
    if (k === "quiver") {
      var t = poolType(w), p = pool(c, t, false);
      if (!p || num(p.count) <= 0) return { ok: false, reason: "Out of " + (POOL_WORD[t] || t) + ". Recover some after the fight, or buy more." };
      p.count = num(p.count) - 1;
      g.spentAmmo = num(g.spentAmmo) + 1;
      return { ok: true, left: num(p.count), unit: POOL_WORD[t] || t };
    }
    if (k === "loaded") {
      var autoNote = "";
      if (num(g.loaded) <= 0) {
        /* Q4 fix (Jessey 2026-10-19): firing an empty crossbow / blowpipe loads one from the pool for free, so every
           shot spends exactly one bolt and rolls attack and damage normally. No pool left = no shot. */
        var pa = pool(c, poolType(w), false);
        if (!pa || num(pa.count) <= 0) return { ok: false, reason: "Out of " + (POOL_WORD[poolType(w)] || "bolts") + ". Add them under Ammo." };
        pa.count = num(pa.count) - 1;
        g.loaded = 1;
        autoNote = " (auto-loaded 1 " + String(POOL_WORD[poolType(w)] || "bolts").replace(/s$/, "") + ")";
      }
      var st = pipsState();
      if (g.loadShotKey && g.loadShotKey === (st.turnKey || "") + "|" + (st.attacks || 0) && st.action) {
        /* Loading: never blocked (the DM can allow it), just warned like the action pips */
        log("Loading: one shot per action, even with Extra Attack. Fired anyway; the DM can allow it.", "alert");
      }
      g.loaded = 0;
      g.spentAmmo = num(g.spentAmmo) + 1;
      g.loadShotKey = (st.turnKey || "") + "|" + ((st.attacks || 0) + 1);
      var pb = pool(c, poolType(w), false);
      return { ok: true, left: 0, unit: "empty now" + autoNote + "; " + (pb ? num(pb.count) : 0) + " " + (POOL_WORD[poolType(w)] || "bolts") + " left", autoLoaded: !!autoNote };
    }
    var owned = Math.max(1, num(g.count, 1));
    if (num(g.out) >= owned) return { ok: false, reason: g.lost ? "None left: all lost. Buy more." : "All thrown. Recover them after the fight." };
    g.out = num(g.out) + 1;
    return { ok: true, left: owned - g.out, unit: "of " + owned + " still in hand" };
  }
  /** Recover ½ for javelins / spears: half the thrown ones come back (rounded down); the rest leave the count. */
  function recoverHalfThrown(row) {
    var owned = Math.max(1, num(row.count, 1)), out = Math.min(owned, num(row.out));
    var back = Math.floor(out / 2), lostN = out - back, left = owned - lostN;
    if (left <= 0) return { count: 1, out: 1, lost: true, back: 0, lostN: lostN };
    return { count: left, out: 0, lost: false, back: back, lostN: lostN };
  }
  /** sheet-playtest rollMeleeNow hook: a Throw spends one thrown weapon. */
  var throwing = -1;
  function onMeleeAttack(c, i) {
    if (throwing !== i) return null;
    throwing = -1;
    var row = c.melee && c.melee[i];
    if (!row) return null;
    var owned = Math.max(1, num(row.count, 1));
    if (num(row.out) >= owned) return { ok: false, reason: row.lost ? "None left: all lost. Buy more." : "All thrown. Recover them after the fight." };
    row.out = num(row.out) + 1;
    setTimeout(paint, 0);
    return { ok: true, thrown: true };
  }

  /* ---------------------------------------------------------------- consumables (Items list) */
  function itemPips(item) {
    if (!item) return "";
    var type = String(item.type || "");
    if (!/consumable|explosive|scroll/.test(type) && !(item.uses && num(item.uses.max) > 1)) return "";
    var count = item.count == null ? 1 : num(item.count, 1);
    var html = "";
    var hasUses = !!(item.uses && num(item.uses.max) > 1);
    var show = hasUses && count <= 1 ? 0 : Math.min(count, 12); /* one bottle with 4 drinks: just the 4 use pips */
    for (var k = 0; k < show; k++) html += '<span class="trk-pip on item ' + esc(type) + '"></span>';
    if (count > 12) html += '<span class="trk-more">+' + (count - 12) + "</span>";
    var charges = "";
    if (item.uses && num(item.uses.max) > 1) {
      var cl = item.chargesLeft == null ? num(item.uses.max) : num(item.chargesLeft);
      for (var n = 0; n < num(item.uses.max); n++) charges += '<span class="trk-pip charge' + (n < cl ? " on" : "") + '">✦</span>';
      charges = '<span class="trk-sub">uses</span>' + charges;
    }
    return '<span class="trk-item" title="' + count + " left" + '">' + html + charges + "</span>";
  }

  /* ---------------------------------------------------------------- map token badge rows */
  function tokenRows(c) {
    var rows = [];
    if (!c) return rows;
    (c.guns || []).forEach(function (g, i) {
      if (!g || !g.weapon || g.equipped === false) return;
      var w = weapon(g.weapon), k = kindOf(w);
      if (k === "quiver") { var p = pool(c, poolType(w), false), qn = poolType(w) === "arrows" ? arrowTotal(c) : (p ? num(p.count) : 0); rows.push({ index: i, name: w.name, icon: "bow", text: String(qn), loaded: qn, cap: 0, kind: k, arrow: poolType(w) === "arrows" ? nocked(c, g) : "" }); }
      else if (k === "loaded") { var p2 = pool(c, poolType(w), false); rows.push({ index: i, name: w.name, icon: "xbow", text: (num(g.loaded) ? "1" : "0") + "·" + (p2 ? num(p2.count) : 0), loaded: num(g.loaded), cap: 1, kind: k }); }
      else if (k === "thrown") { var o = Math.max(1, num(g.count, 1)); rows.push({ index: i, name: w.name, icon: "thrown", text: (o - num(g.out)) + "/" + o, loaded: o - num(g.out), cap: o, kind: k }); }
    });
    (c.melee || []).forEach(function (m, i) {
      if (!m || !m.weapon || m.equipped === false) return;
      var w = weapon(m.weapon);
      if (kindOf(w) !== "thrown") return;
      var o = Math.max(1, num(m.count, 1));
      rows.push({ index: 10 + i, name: w.name, icon: "thrown", text: (o - num(m.out)) + "/" + o, loaded: o - num(m.out), cap: o, kind: "thrown" });
    });
    return rows;
  }
  /** Snapshot for the DMCC (rides on players/<id>/snapshot; rules accept extra children). */
  function snapshot(c) {
    if (!c) return null;
    var res = resourcesFor(c).map(function (r) {
      if (r.kind === "sneak") return { id: r.id, name: r.name, dice: r.dice, used: !!(c.res && c.res.sneakUsed), armed: !!(c.res && c.res.sneakArmed), rest: r.rest };
      if (r.kind === "smite") return { id: r.id, name: r.name, slots: true, armed: num(c.res && c.res.smiteArmed), rest: r.rest };
      if (r.kind === "unlimited") return { id: r.id, name: r.name, unlimited: true, rest: r.rest };
      return { id: r.id, name: r.name, max: r.max, left: left(c, r), die: r.die || "", rest: r.rest };
    });
    return { res: res, tokenRows: tokenRows(c) };
  }
  /** Read-only chips for the DMCC player card. */
  function dmHtml(s) {
    var t = s && s.trackers;
    if (!t || (!(t.res || []).length && !(t.tokenRows || []).length)) return "";
    return '<div class="trk-dm">' + (t.res || []).map(function (r) {
      if (r.dice) return '<span class="trk-chip' + (r.used ? " spent" : "") + '" title="Once per turn">' + esc(r.name) + " " + esc(r.dice) + " · " + (r.armed ? "ARMED" : (r.used ? "used" : "ready")) + "</span>";
      if (r.slots) return '<span class="trk-chip" title="Spends a spell slot on a hit (see Shells line)">' + esc(r.name) + (r.armed ? " · ARMED (" + r.armed + ")" : " · slots") + "</span>";
      if (r.unlimited) return '<span class="trk-chip">' + esc(r.name) + " · unlimited</span>";
      var dots = ""; for (var k = 0; k < r.max; k++) dots += k < r.left ? "●" : "○";
      return '<span class="trk-chip" title="' + esc(r.rest === "short" ? "Short or long rest" : r.rest === "week" ? "Once per 7 days" : r.rest === "day" ? "Once per day (dawn / long rest)" : "Long rest") + '">' + esc(r.name) + (r.die ? " " + esc(r.die) : "") + ' <b class="trk-dots">' + dots + "</b> " + r.left + "/" + r.max + "</span>";
    }).join("") + ((t.tokenRows || []).length ? (t.tokenRows || []).map(function (row) {
      return '<span class="trk-chip weap">' + esc(row.name) + " " + esc(row.text) + "</span>";
    }).join("") : "") + "</div>";
  }

  /* ---------------------------------------------------------------- paint + events */
  function paint() {
    if (typeof document === "undefined") return;
    var c = ch();
    if (!c) return;
    var html = resHtml(c);
    ["trkMain", "trkGear"].forEach(function (id) {
      var host = document.getElementById(id);
      if (!host) {
        host = document.createElement("div"); host.id = id; host.className = "trk-host";
        if (id === "trkMain") { var feat = document.querySelector("#page-main .box.features"); if (feat) feat.parentNode.insertBefore(host, feat); else return; }
        else { var tgt = document.getElementById("gearTarget"); if (tgt) tgt.parentNode.insertBefore(host, tgt.nextSibling); else return; }
      }
      if (host.getAttribute("data-sig") !== html) { host.innerHTML = html; host.setAttribute("data-sig", html); }
      host.hidden = !html;
    });
    for (var i = 0; i < 4; i++) {
      var card = document.querySelector('.gun[data-row="' + i + '"]');
      if (!card) continue;
      var slot = card.querySelector(".trk-slot-gun");
      if (!slot) { slot = document.createElement("div"); slot.className = "trk-slot-gun"; var after = card.querySelector(".g-chamber-row"); if (after) after.parentNode.insertBefore(slot, after.nextSibling); else card.appendChild(slot); }
      var gh = gunTracker(c, i);
      if (slot.getAttribute("data-sig") !== gh) { slot.innerHTML = gh; slot.setAttribute("data-sig", gh); }
      var g = c.guns[i], w = g && weapon(g.weapon);
      /* misfire row is firearms only (bows, crossbows, slings, thrown) */
      var mis = card.querySelector(".g-mis");
      if (mis) mis.hidden = !!(g && g.weapon && w && !isFirearm(w));
      /* 0.3.84 Special UI hook: a registered renderer (item / weapon id or w.ui) can extend or replace this card;
         per-card hooks (SSDNSItemUI.on("quiver", fn)) run here too, e.g. #106 click-to-shoot */
      if (root.SSDNSItemUI && root.SSDNSItemUI.decorate) root.SSDNSItemUI.decorate(card, { card: "gun", kind: kindOf(w), index: i, weapon: w || null, character: c });
      if (root.SSDNSGiveSheet && root.SSDNSGiveSheet.slotControls) root.SSDNSGiveSheet.slotControls(card, { card: "gun", index: i, weapon: w || null, character: c });
    }
    $$("#meleeBox .melee-card").forEach(function (card, idx) {
      var slot2 = card.querySelector(".trk-slot-melee");
      if (!slot2) { slot2 = document.createElement("div"); slot2.className = "trk-slot-melee"; var act = card.querySelector(".g-actions"); card.insertBefore(slot2, act || null); }
      var mh = meleeTracker(c, idx);
      if (slot2.getAttribute("data-sig") !== mh) { slot2.innerHTML = mh; slot2.setAttribute("data-sig", mh); }
      var mrow = c.melee && c.melee[idx], mw = mrow && weapon(mrow.weapon);
      if (root.SSDNSItemUI && root.SSDNSItemUI.decorate) root.SSDNSItemUI.decorate(card, { card: "melee", kind: kindOf(mw), index: idx, weapon: mw || null, character: c });
      if (root.SSDNSGiveSheet && root.SSDNSGiveSheet.slotControls) root.SSDNSGiveSheet.slotControls(card, { card: "melee", index: idx, weapon: mw || null, character: c });
    });
  }
  function onClick(e) {
    var t = e.target && e.target.closest ? e.target.closest("button, [data-trk-res]") : null;
    if (!t) return;
    var c = ch();
    if (!c) return;
    if (t.hasAttribute("data-melee-roll")) { throwing = -1; return; }
    var res = t.getAttribute("data-trk-res");
    if (res && !/^(q\d|slot)/.test(res)) {
      var r = resourcesFor(c).filter(function (x) { return x.id === res; })[0];
      if (!r) return;
      if (res === "oathCreed" && badgeWhyOf(c, "creed")) return;
      var on = t.getAttribute("data-trk-on") === "1";
      setUsed(res, used(c, res) + (on ? 1 : -1));
      if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
      log((c.name || "You") + (on ? " spends " : " gets back ") + "1 " + r.name.replace(/ \(.*\)$/, "") + " (" + left(ch(), r) + "/" + r.max + " left).");
      return;
    }
    var sr = t.getAttribute("data-trk-spend-roll");
    if (sr) {
      var r2 = resourcesFor(c).filter(function (x) { return x.id === sr; })[0];
      if (!r2 || !left(c, r2)) { toast("None left until a rest."); return; }
      var sides = num(String(r2.roll).replace(/\D/g, ""), 8), got = rollDice(1, sides);
      setUsed(sr, used(c, sr) + 1);
      log((c.name || "You") + " spends a superiority die: 1" + r2.roll + " = " + got.total + " (" + left(ch(), r2) + "/" + r2.max + " left).", "roll");
      post(r2.name, "1" + r2.roll, got.total, got.list.join("+"));
      return;
    }
    if (t.hasAttribute("data-trk-sneak")) {
      patch(function (cc) { cc.res = cc.res || {}; cc.res.sneakUsed = !cc.res.sneakUsed; if (cc.res.sneakUsed) cc.res.sneakArmed = false; }); paint(); return;
    }
    var armK = t.getAttribute("data-trk-arm");
    if (armK) { toggle(armK); return; }
    if (t.hasAttribute("data-trk-rage")) {
      var rb = document.getElementById("btnRage");
      if (!c.raging && rageMax(c) !== Infinity && used(c, "rage") >= rageMax(c)) { toast("No Dust Fury left until a long rest."); return; }
      if (rb) rb.click(); else patch(function (cc) { if (cc.raging) cc.raging = false; else { cc.raging = true; cc.rageUsed = num(cc.rageUsed) + 1; } });
      paint(); return;
    }
    var dmk = t.getAttribute("data-trk-dyn-make");
    if (dmk != null) {
      var why0 = canMakeDynamite(c);
      if (why0) { toast(why0); return; }
      var made = null;
      patch(function (cc) { made = makeDynamite(cc); });
      if (made && made.ok) { log((c.name || "You") + " ties a Dynamite Stick to an arrow (" + made.count + " dynamite arrow" + (made.count === 1 ? "" : "s") + ")."); if (root.SSDNSItems && root.SSDNSItems.paintSheet) root.SSDNSItems.paintSheet(); }
      paint(); return;
    }
    var rec = t.getAttribute("data-trk-recover");
    if (rec != null) {
      var gi = num(rec), g = c.guns[gi], w = g && weapon(g.weapon);
      if (!g || !w) return;
      if (kindOf(w) === "quiver" && poolType(w) === "arrows") {
        var rr0 = arrowRecover(g), shot0 = num(g.spentAmmo);
        patch(function (cc) {
          Object.keys(rr0.back).forEach(function (id) { if (rr0.back[id] > 0) { var ap = arrowPool(cc, id, true); ap.count = num(ap.count) + rr0.back[id]; } });
          cc.guns[gi].spentAmmo = 0; cc.guns[gi].spentBy = {};
        });
        paint();
        var parts0 = Object.keys(rr0.back).filter(function (id) { return rr0.back[id] > 0; }).map(function (id) { return rr0.back[id] + " " + ARROW_BY_ID[id].word; });
        log((c.name || "You") + " recovers " + (parts0.length ? parts0.join(", ") : "no arrows") + " after the fight (of " + shot0 + " shot)" + (rr0.lost.length ? "; " + rr0.lost.join(", ") + " don't come back" : "") + ".");
        return;
      }
      var back = Math.floor(num(g.spentAmmo) / 2), tp = poolType(w);
      patch(function (cc) { var gg = cc.guns[gi]; var p = pool(cc, tp, true); p.count = num(p.count) + back; gg.spentAmmo = 0; });
      paint();
      log((c.name || "You") + " recovers " + back + " " + (POOL_WORD[tp] || tp) + " after the fight (half of " + (back * 2 + (num(g.spentAmmo) % 2)) + ").");
      return;
    }
    var ld = t.getAttribute("data-trk-load");
    if (ld != null) {
      var li = num(ld), lg = c.guns[li], lw = lg && weapon(lg.weapon), lt = poolType(lw);
      var lp = pool(c, lt, false);
      if (!lp || num(lp.count) <= 0) { toast("Out of " + (POOL_WORD[lt] || lt) + "."); return; }
      patch(function (cc) { var p = pool(cc, lt, false); p.count = num(p.count) - 1; cc.guns[li].loaded = 1; });
      if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
      paint();
      return;
    }
    var own = t.getAttribute("data-trk-own");
    if (own) {
      var parts = own.split(":"), list = parts[0] === "melee" ? "melee" : "guns", oi = num(parts[1]), d = num(parts[2]);
      patch(function (cc) {
        var row = cc[list][oi];
        if (row.lost) { row.lost = false; row.count = 1; row.out = 0; return; }
        row.count = Math.max(1, Math.min(20, Math.max(1, num(row.count, 1)) + d)); row.out = Math.min(num(row.out), row.count);
      });
      paint(); return;
    }
    var recall = t.getAttribute("data-trk-recall");
    if (recall) {
      var p2 = recall.split(":"), l2 = p2[0] === "melee" ? "melee" : "guns", ri = num(p2[1]);
      var rr = c[l2][ri], n2 = num(rr && rr.out), rw = rr && weapon(rr.weapon);
      if (halfBack(rw)) {
        var res2 = recoverHalfThrown(rr);
        patch(function (cc) { var x = cc[l2][ri]; x.count = res2.count; x.out = res2.out; x.lost = res2.lost; });
        paint();
        log((c.name || "You") + " recovers " + res2.back + " of " + n2 + " thrown " + ((rw && rw.name) || "weapons") + " after the fight; " + res2.lostN + " broken or lost.");
        return;
      }
      patch(function (cc) { cc[l2][ri].out = 0; });
      paint();
      log((c.name || "You") + " picks up " + n2 + " thrown " + (n2 === 1 ? "weapon" : "weapons") + " after the fight.");
      return;
    }
    var th = t.getAttribute("data-trk-throw");
    if (th != null) {
      var ti = num(th), row2 = c.melee[ti];
      if (num(row2.out) >= Math.max(1, num(row2.count, 1))) { toast("All thrown. Recover them after the fight."); return; }
      throwing = ti;
      if (root.SSDNSPlaytest && root.SSDNSPlaytest.rollMelee) root.SSDNSPlaytest.rollMelee(ti);
      return;
    }
    var chg = t.getAttribute("data-trk-charge");
    if (chg != null) {
      var info = chargeInfo(c, num(chg));
      if (!info) return;
      var spend = t.classList.contains("on");
      patch(function (cc) {
        if (info.item) {
          var it = (cc.items || []).filter(function (x) { return x && x.uid === info.item; })[0];
          if (it) it.chargesLeft = Math.max(0, Math.min(info.max, info.left + (spend ? -1 : 1)));
        } else {
          cc.featureUses = cc.featureUses || {};
          var u = cc.featureUses[info.key] || { max: info.max, used: 0, rest: "short" };
          u.used = Math.max(0, Math.min(info.max, (u.used || 0) + (spend ? 1 : -1)));
          cc.featureUses[info.key] = u;
        }
      });
      paint();
    }
  }
  /* ---------------------------------------------------------------- arm-before-attack riders (Jessey 2026-10-19 9:53 PM CT)
     Sneak Attack and Smite Lead are armed BEFORE the attack roll. rider() is called once by every weapon-attack path
     (Gear card gun / melee / pistol-whip, map token Attacks, DM-sent shots) after hit or miss is known. A hit spends and
     adds the dice; a miss spends nothing; the arm always clears. Nothing can be added after the roll. */
  /** The map's player Attacks list shows the arm state; repaint it after an arm flips or clears. */
  function refreshMap() { var H = root.SSDNSMapHost; if (H && H.refreshCard) { try { H.refreshCard(""); } catch (e) {} } }
  function ordinal(n) { return n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"); }
  function slotLevelsLeft() { return slotRows().filter(function (s) { return s.left > 0; }).map(function (s) { return s.level; }); }
  /* 0.3.108 Badge Bound: the reason a Lawman's badge blocks a feature (focus-slot.js badgeBlock), "" when it doesn't */
  function badgeWhyOf(c, what) {
    var F = root.SSDNSFocus;
    if (F && F.badgeBlock) return F.badgeBlock(c, what);
    return c && c.calling === "lawman" && c.badgeState === "dull" ? "Your badge is Dull: no " + ({ smite: "Smite Lead", creed: "Channel Creed", mercy: "Mercy Hands" }[what] || "spells") + "." : "";
  }
  function canArm(c, kind) {
    if (kind === "sneak") {
      if (!c || c.calling !== "gambler") return "Sneak Attack is a Gambler feature.";
      if (c.res && c.res.sneakUsed) return "Sneak Attack is already used this turn.";
      return "";
    }
    if (!c || c.calling !== "lawman" || lv(c) < 2) return "Smite Lead is a Lawman feature (2nd level).";
    var bw = badgeWhyOf(c, "smite");
    if (bw) return bw;
    if (!slotLevelsLeft().length) return "No spell slot left.";
    return "";
  }
  /** Flip an arm. opts.dm = DM override (ignores the once-per-turn / Dull checks); opts.on forces a state; opts.level picks the slot. */
  function toggle(kind, opts) {
    opts = opts || {};
    var c = ch();
    if (!c) return false;
    var res = c.res || {};
    var isOn = kind === "sneak" ? !!res.sneakArmed : !!num(res.smiteArmed);
    var want = opts.on == null ? !isOn : !!opts.on;
    if (want && !opts.dm) { var why = canArm(c, kind); if (why) { toast(why); return false; } }
    var lvls = slotLevelsLeft();
    var level = num(opts.level || res.smiteLevel, 0);
    if (kind === "smite" && want && lvls.indexOf(level) < 0) level = lvls[0] || (opts.dm ? Math.max(1, level) : 0);
    patch(function (cc) {
      cc.res = cc.res || {};
      if (kind === "sneak") cc.res.sneakArmed = want;
      else { cc.res.smiteArmed = want ? level : 0; if (want) cc.res.smiteLevel = level; }
      if (opts.dm) cc.res.armDm = true;
    });
    paint();
    refreshMap();
    if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
    return want;
  }
  function refundSlot(c, level) {
    var a = c.hexLead && c.hexLead[level];
    if (!a) return false;
    for (var k = a.length - 1; k >= 0; k--) if (a[k]) { a[k] = false; return true; }
    return false;
  }
  /**
   * ctx: { hit, crit, pending (hidden AC: the DM decides), melee, finesse, thrown, dm, weapon }
   * Returns null when nothing was armed, else { riders:[{label, formula, faces, total, type}], total, text, notes }.
   * Mutates the live character (the roll paths already do), then repaints on the next tick.
   */
  function rider(ctx) {
    ctx = ctx || {};
    var c = ch();
    if (!c) return null;
    var arw = arrowRiders(ctx); /* Arrow types DRAFT: the nocked arrow's own dice (broadhead, fire) */
    var armS = !!(c.res && c.res.sneakArmed), armM = num(c.res && c.res.smiteArmed);
    if (!armS && !armM) {
      if (!arw.length) return null;
      var at0 = 0; arw.forEach(function (r) { at0 += r.total; });
      return { riders: arw, total: at0, text: arw.map(function (r) { return "+" + r.formula + " " + r.label; }).join(" "), notes: [], spent: {} };
    }
    var dm = !!(ctx.dm || c.res.armDm);
    var hit = !!(ctx.hit || ctx.pending), crit = !!ctx.crit && !ctx.pending;
    var out = arw.slice(), notes = [], spent = {};
    if (armS) {
      var okWeapon = !ctx.melee || ctx.finesse || ctx.thrown;
      var okTurn = dm || !c.res.sneakUsed;
      if (hit && c.calling === "gambler" && okWeapon && okTurn) {
        var dice = progCol(c, "Sneak Attack") || (Math.ceil(lv(c) / 2) + "d6");
        var m = dice.match(/(\d+)d(\d+)/), n = num(m && m[1], 1), sides = num(m && m[2], 6);
        if (crit) n *= 2;
        var g1 = rollDice(n, sides);
        out.push({ label: "sneak", formula: n + "d" + sides, faces: g1.list, total: g1.total, type: "" });
        c.res.sneakUsed = true; spent.sneak = true;
      } else if (hit && !okWeapon) notes.push("Sneak Attack needs a finesse or ranged weapon (PHB): not added");
      else if (hit && !okTurn) notes.push("Sneak Attack already used this turn: not added");
    }
    if (armM) {
      var A = app(), L = armM;
      var okBadge = dm || !badgeWhyOf(c, "smite");
      if (hit && c.calling === "lawman" && okBadge) {
        var paid = A && A.spendHexSlot ? A.spendHexSlot(L) : false;
        if (!paid && A && A.spendHexSlot) { for (var up = L + 1; up <= 5 && !paid; up++) if (A.spendHexSlot(up)) { paid = true; L = up; } }
        if (paid) {
          var nd = Math.min(5, 1 + L) + (c.res.smiteUndead ? 1 : 0);
          if (crit) nd *= 2;
          var g2 = rollDice(nd, 8);
          out.push({ label: "smite", formula: nd + "d8", faces: g2.list, total: g2.total, type: "radiant" });
          spent.smite = L;
        } else notes.push("Smite Lead: no slot left, not added");
      } else if (hit && !okBadge) notes.push("Badge is Dull: no Smite Lead");
    }
    c.res.sneakArmed = false;
    c.res.smiteArmed = 0;
    c.res.smiteLevel = 0; /* next arm defaults to the lowest slot again */
    c.res.armDm = false;
    if (notes.length) setTimeout(function () { toast(notes.join(" · ")); log(notes.join(" · "), "alert"); }, 30);
    var total = 0; out.forEach(function (r) { total += r.total; });
    var text = out.map(function (r) { return "+" + r.formula + " " + r.label; }).join(" ");
    if (ctx.pending && (spent.sneak || spent.smite)) {
      c.res.pendingRefund = { sneak: !!spent.sneak, smite: spent.smite || 0, at: Date.now() };
      setTimeout(function () {
        if (root.SSDNSToast) root.SSDNSToast((text || "Rider") + " rides on this attack. If the DM calls a miss, refund it.", "Refund", function () { refundPending(); });
      }, 50);
    }
    setTimeout(function () { var A2 = app(); if (A2 && A2.applyPatch) A2.applyPatch(function () {}); paint(); refreshMap(); }, 0);
    return { riders: out, total: total, text: text, notes: notes, spent: spent };
  }
  /** Hidden-AC attacks only: the DM called a miss after the dice were sent. Gives back what rider() spent. */
  function refundPending() {
    var c = ch();
    var pr = c && c.res && c.res.pendingRefund;
    if (!pr) return false;
    patch(function (cc) {
      if (pr.sneak) cc.res.sneakUsed = false;
      if (pr.smite) refundSlot(cc, pr.smite);
      cc.res.pendingRefund = null;
    });
    log((c.name || "You") + ": the DM called a miss, refunded " + [pr.sneak ? "Sneak Attack" : "", pr.smite ? "a " + ordinal(pr.smite) + "-level slot" : ""].filter(Boolean).join(" and ") + ".");
    paint();
    return true;
  }
  /** Damage-text helper for the plain attack lines: "+2d8 smite «3» «6»". */
  function riderText(r) {
    if (!r || !r.riders || !r.riders.length) return "";
    return r.riders.map(function (x) { return "+" + x.formula + " " + x.label + " " + x.faces.map(function (f) { return "«" + f + "»"; }).join(" "); }).join(" ");
  }
  /** Map token Attacks menu entries for the toggles. */
  function mapActions() {
    var c = ch(), list = [];
    if (!c) return list;
    var res = c.res || {};
    if (c.calling === "gambler") list.push({ id: "trk:sneak", label: res.sneakArmed ? "Sneak Attack: ARMED (tap to disarm)" : "Sneak Attack next attack", group: "attack", enabled: !!res.sneakArmed || !canArm(c, "sneak"), title: "Arm before you attack; a hit adds the dice." });
    if (c.calling === "lawman" && lv(c) >= 2) list.push({ id: "trk:smite", label: num(res.smiteArmed) ? "Smite: ARMED " + ordinal(num(res.smiteArmed)) + " (tap to disarm)" : "Smite next attack", group: "attack", enabled: !!num(res.smiteArmed) || !canArm(c, "smite"), title: "Arm before you attack; a hit spends the slot and adds the dice." });
    return list;
  }
  /* rests: short = short-rest resources (+4 sorcery at Hexslinger 20th), long = everything */
  function onRest(kind) {
    var c = ch();
    if (!c) return;
    patch(function (cc) {
      cc.res = cc.res || {};
      resourcesFor(cc).forEach(function (r) {
        if (r.kind !== "pips") return;
        if (r.rest === "week") return; /* Divine Intervention: 7 days, cleared by hand */
        if (kind === "long" || r.rest === "short") { if (r.id === "rage") cc.rageUsed = 0; else cc.res[r.id] = 0; }
        else if (r.id === "sorc" && lv(cc) >= 20) cc.res[r.id] = Math.max(0, num(cc.res[r.id]) - 4);
      });
      cc.res.sneakUsed = false;
      cc.res.sneakArmed = false;
      cc.res.smiteArmed = 0;
      cc.res.litUsed = false;
      if (cc.raging) cc.raging = false;
    });
    paint();
  }
  function wrapRest() {
    var S = root.SSDNSSheet;
    if (!S || !S.applyRest || S.applyRest._trk) return !!(S && S.applyRest && S.applyRest._trk);
    var orig = S.applyRest;
    S.applyRest = function (kind, opts) { var r = orig.apply(this, arguments); onRest(kind); return r; };
    Object.keys(orig).forEach(function (k) { S.applyRest[k] = orig[k]; });
    S.applyRest._trk = true;
    return true;
  }
  /* style */
  var CSS = [
    ".trk-host{margin:8px 0}",
    ".trk-panel{border:1px solid #b9a27a;background:rgba(255,250,238,.85);border-radius:6px;padding:6px 10px;display:flex;flex-direction:column;gap:4px}",
    ".trk-panel.ro{background:transparent;border:none;padding:0}",
    ".trk-title{font-family:'IM Fell English SC',serif;font-size:15px;color:#5b2d0e;border-bottom:1px solid #d9c49b;margin-bottom:2px}",
    ".trk-res{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;min-height:28px}",
    ".trk-res select.trk-smite-lv{width:auto!important;flex:0 0 auto;display:inline-block;padding:2px 6px;font-size:13px}",
    ".trk-res label.tiny{display:inline-flex;align-items:center;gap:4px;margin:0}",
    ".trk-name{font-weight:700;min-width:170px;cursor:help}",
    ".trk-die,.trk-dice{display:inline-block;background:#3d2a16;color:#f3e2b8;border-radius:4px;padding:0 5px;font-size:12px;font-weight:700}",
    ".trk-pips{display:inline-flex;gap:3px;flex-wrap:wrap;align-items:center}",
    ".trk-pip{width:16px;height:16px;border-radius:50%;border:2px solid #7a5a2e;background:transparent;padding:0;cursor:pointer;font-size:9px;line-height:12px;color:#fff;display:inline-block;box-sizing:border-box}",
    ".trk-pip.on{background:#b5832a;border-color:#6b4a14;box-shadow:inset 0 0 0 2px rgba(255,235,180,.35)}",
    ".trk-pip.slot{border-radius:3px;width:14px;height:14px}.trk-pip.slot.on{background:#5b3b8c;border-color:#3b2360}",
    ".trk-pip:disabled{cursor:default}",
    ".trk-pip.ammo{width:7px;height:18px;border-radius:2px 2px 1px 1px;border-width:1px}",
    ".trk-pips.arrows .trk-pip.ammo.on{background:linear-gradient(#ddd 0 22%,#6d4c2a 22% 82%,#5e8a55 82%)}",
    ".trk-pips.bolts .trk-pip.ammo.on{background:linear-gradient(#999 0 18%,#5a3d1e 18%)}",
    ".trk-pips.stones .trk-pip.ammo{width:11px;height:11px;border-radius:50%}.trk-pips.stones .trk-pip.ammo.on{background:#8b8f94}",
    ".trk-pips.needles .trk-pip.ammo{width:4px}.trk-pips.needles .trk-pip.ammo.on{background:#c9c2a8}",
    ".trk-pip.thrown{width:12px;height:20px;border-radius:2px;clip-path:polygon(50% 0,100% 30%,70% 30%,70% 100%,30% 100%,30% 30%,0 30%)}.trk-pip.thrown.on{background:#6b6f75;border-color:#3b3e42}",
    ".trk-pip.charge{border-radius:3px;color:#7a5a2e}.trk-pip.charge.on{background:#2f6f8f;border-color:#18435a;color:#e8f6ff}",
    ".trk-pip.item{width:10px;height:14px;border-radius:3px 3px 5px 5px;cursor:default}.trk-pip.item.on{background:#a33a2a;border-color:#62201a}.trk-pip.item.explosive.on{background:#b0302a}.trk-pip.item.scroll.on{background:#c9b27a}",
    ".trk-arrows{gap:6px}.trk-agrp{display:inline-flex;align-items:flex-end;gap:1px;padding:1px 3px 0;border-radius:4px;border:1px solid transparent}",
    ".trk-agrp.nocked{border-color:#7a5a2e;background:rgba(181,131,42,.14)}",
    ".trk-arrow{display:inline-block;width:10px;height:28px;line-height:0}.trk-arrow svg{display:block}.trk-arrow.spent{opacity:.22;filter:grayscale(1)}",
    ".trk-atag{font-size:9.5px;font-weight:700;color:#5b2d0e;margin-left:2px;align-self:center;white-space:nowrap}",
    ".trk-nock-l{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#5b2d0e;margin:0}",
    ".trk-weap select.trk-nock{width:auto!important;flex:0 0 auto;display:inline-block;padding:1px 4px;font-size:12px;text-transform:none;letter-spacing:0}",
    ".trk-count{font-variant-numeric:tabular-nums;font-weight:700;color:#3d2a16}",
    ".trk-rest{font-size:11px;color:#7a6a55;text-transform:uppercase;letter-spacing:.04em}",
    ".trk-turn{border:2px solid #6b4a14;border-radius:12px;padding:1px 9px;font-size:12px;background:#efe3c7;cursor:pointer}.trk-turn.on{background:#2e7d32;color:#fff;border-color:#1b5e20}",
    ".trk-sneak.spent .trk-turn{background:#8d1c14;color:#fff;border-color:#5e110c}",
    ".trk-slots{display:inline-flex;gap:10px;flex-wrap:wrap}.trk-slot{display:inline-flex;gap:3px;align-items:center}.trk-slv{font-size:11px;color:#5b3b8c;font-weight:700}",
    ".trk-weap{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:4px 0;padding:4px 6px;border:1px dashed #c4ad83;border-radius:5px;background:rgba(255,248,230,.6);font-size:12.5px}",
    ".trk-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#5b2d0e}",
    ".trk-shot{background:#efe3c7;border-radius:10px;padding:0 7px;font-size:11.5px}",
    ".trk-bolt{border:2px solid #7a5a2e;border-radius:4px;padding:1px 8px;font-weight:800;font-size:11.5px;letter-spacing:.06em;color:#7a5a2e}.trk-bolt.on{background:#2e7d32;border-color:#1b5e20;color:#fff}",
    ".trk-stepper{display:inline-flex;gap:2px}.trk-warn{color:#8d1c14}",
    ".trk-more{font-size:11px;color:#5b2d0e;font-weight:700}",
    ".trk-item{display:inline-flex;gap:2px;align-items:center;margin-left:6px;vertical-align:middle}.trk-sub{font-size:10px;color:#7a6a55;margin:0 2px 0 6px}",
    ".trk-dm{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}.trk-chip{font-size:11.5px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.15);border-radius:10px;padding:1px 8px}.trk-chip.spent{opacity:.6}.trk-chip.weap{border-color:#5e8a55}.trk-dots{letter-spacing:1px;color:#e2c56a}",
    ".trk-arm{border:2px solid #7a1f1f;background:#fff8ef;color:#7a1f1f;border-radius:14px;padding:2px 10px;font-weight:700;font-size:12px;cursor:pointer}.trk-arm.on{background:#7a1f1f;color:#fff;box-shadow:0 0 0 2px rgba(122,31,31,.25)}.trk-arm:disabled{opacity:.45;cursor:not-allowed}",
    "[data-trk-shoot]{cursor:pointer;border-radius:5px;transition:background .12s,box-shadow .12s;user-select:none;-webkit-user-select:none}",
    "[data-trk-shoot]:hover{background:rgba(122,31,31,.09);box-shadow:0 0 0 1px rgba(122,31,31,.4)}",
    "[data-trk-shoot]:focus-visible{outline:2px solid #7a1f1f;outline-offset:2px}",
    "[data-trk-shoot]:active{background:rgba(122,31,31,.16)}",
    "[data-trk-shoot].trk-arrows{min-height:30px;min-width:24px;padding:1px 3px}",
    ".trk-unl{font-weight:700;color:#7a5a2e;font-size:12px}",
    "@media (max-width:480px){.trk-name{min-width:0;width:100%}}"
  ].join("\n");
  function injectCss() {
    if (typeof document === "undefined" || document.getElementById("trkCss")) return;
    var s = document.createElement("style"); s.id = "trkCss"; s.textContent = CSS; document.head.appendChild(s);
  }
  if (typeof document !== "undefined") {
    injectCss();
    document.addEventListener("click", onClick);
    document.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-trk-shoot]") : null;
      if (!t) return;
      e.preventDefault();
      shootFrom(num(t.getAttribute("data-trk-shoot")), e, false);
    });
    document.addEventListener("dblclick", function (e) {
      if (e.target && e.target.closest && e.target.closest("[data-trk-shoot]")) e.preventDefault();
    });
    document.addEventListener("keydown", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-trk-shoot]") : null;
      if (!t || (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar")) return;
      e.preventDefault();
      if (e.repeat) return;
      shootFrom(num(t.getAttribute("data-trk-shoot")), e, true);
    });
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.getAttribute) return;
      if (t.hasAttribute("data-trk-beast")) {
        var bv = !!t.checked;
        patch(function (cc) { cc.res = cc.res || {}; cc.res.arrowBeast = bv; });
      } else if (t.hasAttribute("data-trk-nock")) {
        var ni = num(t.getAttribute("data-trk-nock")), nv = ARROW_BY_ID[t.value] ? t.value : "standard";
        patch(function (cc) { if (cc.guns && cc.guns[ni]) cc.guns[ni].arrowType = nv; });
        if (root.SSDNSAudio) root.SSDNSAudio.play("ui-tick");
        paint(); refreshMap();
      } else if (t.hasAttribute("data-trk-smite-lv")) {
        var lvl = num(t.value, 1);
        patch(function (cc) { cc.res = cc.res || {}; cc.res.smiteLevel = lvl; if (num(cc.res.smiteArmed)) cc.res.smiteArmed = lvl; }); paint();
      } else if (t.hasAttribute("data-trk-smite-undead")) {
        var on = !!t.checked;
        patch(function (cc) { cc.res = cc.res || {}; cc.res.smiteUndead = on; });
      }
    });
    root.addEventListener("ssdns:pips-reset", function () {
      var c = ch();
      if (c && c.res && c.res.sneakUsed) { patch(function (cc) { cc.res.sneakUsed = false; }); paint(); }
      if (c && c.res && c.res.litUsed) { patch(function (cc) { cc.res.litUsed = false; }); paint(); } /* L0186: one lit arrow per turn */
    });
    var tries = 0;
    (function boot() { if (!wrapRest() && tries++ < 60) setTimeout(boot, 250); else paint(); })();
  }
  root.SSDNSTrackers = {
    XBOWS: XBOWS, BOLTS: BOLTS, AMMO_EXTRA: AMMO_EXTRA, ARROW_TYPES: ARROW_TYPES, arrowId: arrowId, arrowType: arrowType, arrowCount: arrowCount, arrowTotal: arrowTotal, nocked: nocked, arrowRecover: arrowRecover, arrowAdjust: arrowAdjust, arrowSvg: arrowSvg, shootDynamite: shootDynamite, litBlocked: litBlocked, nockedDtype: nockedDtype, nockedDie: nockedDie, arrowDieExpr: arrowDieExpr, shootFrom: shootFrom, makeDynamite: makeDynamite, canMakeDynamite: canMakeDynamite, isFirearm: isFirearm, weapon: weapon, kindOf: kindOf, resourcesFor: resourcesFor,
    spendShot: spendShot, onMeleeAttack: onMeleeAttack, itemPips: itemPips, tokenRows: tokenRows,
    snapshot: snapshot, dmHtml: dmHtml, paint: paint, onRest: onRest, resHtml: resHtml,
    toggle: toggle, rider: rider, riderText: riderText, refundPending: refundPending, mapActions: mapActions, canArm: canArm,
    coversFeature: coversFeature, rageMax: rageMax, recoverHalfThrown: recoverHalfThrown, halfBack: halfBack
  };
})(typeof window !== "undefined" ? window : this);

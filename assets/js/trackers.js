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
        src: "BOOK1 L1792-1793 (feature), L1806-1827 (dice by level)" });
    }
    if (c.calling === "martial-artist" && L >= 2) {
      var ki = num(progCol(c, "Ki"), L);
      out.push({ id: "ki", kind: "pips", name: "Breath Coins (Ki)", max: ki, rest: "short",
        tip: "Ki points equal to level. Flurry of Blows, Patient Defense, Step of the Wind, Stunning Strike (1). Rest: the PHB line doesn't say; 5e monk = short or long rest (assumed).",
        src: "BOOK1 L1463-1464, L1473 (Stunning Strike), table L1480-1500" });
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
        tip: "On a weapon hit (guns too), spend a spell slot: 2d8 radiant +1d8 per slot level above 1st (max 5d8), +1d8 vs unquiet dead or fiends." + (L >= 11 ? " Improved Smite Lead: +1d8 on every hit." : ""),
        src: "BOOK1 L1586-1587 (Smite Lead), L1611 (Improved, 11th), slots L1601-1620" });
    }
    return out;
  }
  function used(c, id) { return num(((c && c.res) || {})[id], 0); }
  function left(c, r) { return Math.max(0, r.max - used(c, r.id)); }
  function setUsed(id, n) { patch(function (c) { c.res = c.res || {}; c.res[id] = Math.max(0, n); }); paint(); }

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
      html += '<button type="button" class="trk-pip' + (on ? " on" : "") + (opts.cls ? " " + opts.cls : "") + '" data-trk-res="' + esc(id) + '" data-trk-on="' + (on ? 1 : 0) + '"' +
        (opts.ro ? " disabled" : "") + ' title="' + (on ? "Ready. Click to spend one." : "Spent. Click to get one back.") + '" aria-label="' + esc(opts.label || id) + " " + (k + 1) + (on ? " ready" : " spent") + '">' + (opts.glyph || "") + "</button>";
    }
    return html;
  }
  function restTag(r) { return r.rest === "turn" ? "1 / turn" : (r.rest === "short" ? "short rest" : "long rest"); }
  function resHtml(c, opts) {
    opts = opts || {};
    var list = resourcesFor(c);
    if (!list.length) return "";
    var body = list.map(function (r) {
      var head = '<span class="trk-name" title="' + esc(r.tip + " · " + r.src) + '">' + esc(r.name) + (r.die ? ' <span class="trk-die">' + esc(r.die) + "</span>" : "") + "</span>";
      if (r.kind === "sneak") {
        var spent = !!(c.res && c.res.sneakUsed);
        return '<div class="trk-res trk-sneak' + (spent ? " spent" : "") + '">' + head +
          '<span class="trk-dice">' + esc(r.dice) + "</span>" +
          '<button type="button" class="trk-turn' + (spent ? "" : " on") + '" data-trk-sneak="1" title="' + (spent ? "Used this turn. Click to clear (DM call)." : "Ready this turn") + '">' + (spent ? "Used this turn" : "Ready") + "</button>" +
          (opts.ro ? "" : '<button type="button" class="btn xs" data-trk-sneak-roll="1"' + (spent ? " disabled" : "") + ' title="Roll the Sneak Attack dice and mark it used for this turn">Roll ' + esc(r.dice) + "</button>") +
          '<span class="trk-rest">' + restTag(r) + "</span></div>";
      }
      if (r.kind === "smite") {
        var rows = opts.slots || slotRows();
        var badgeDull = c.badgeState === "dull";
        var slotHtml = rows.length ? rows.map(function (s) {
          return '<span class="trk-slot"><span class="trk-slv">' + s.level + (s.level === 1 ? "st" : s.level === 2 ? "nd" : s.level === 3 ? "rd" : "th") + '</span>' +
            pipRow("slot" + s.level, s.total, s.left, { ro: true, cls: "slot", label: "Level " + s.level + " slot" }) + "</span>";
        }).join("") : '<span class="fine">No spell slots yet.</span>';
        var pick = opts.ro || !rows.length ? "" : '<select class="trk-smite-lv" data-trk-smite-lv="1" aria-label="Slot level">' + rows.map(function (s) {
          return '<option value="' + s.level + '"' + (s.left ? "" : " disabled") + ">" + s.level + (s.level === 1 ? "st" : s.level === 2 ? "nd" : s.level === 3 ? "rd" : "th") + " · " + Math.min(5, s.level + 1) + "d8</option>";
        }).join("") + "</select>" +
          '<label class="tiny" title="+1d8 vs unquiet dead or fiends"><input type="checkbox" data-trk-smite-undead="1"> unquiet / fiend</label>' +
          '<button type="button" class="btn xs" data-trk-smite="1"' + (badgeDull ? " disabled title=\"Badge is Dull: no Smite Lead\"" : ' title="After a weapon hit: spend the slot and roll the radiant damage"') + ">Smite</button>";
        return '<div class="trk-res trk-smite">' + head + '<span class="trk-slots">' + slotHtml + "</span>" + pick + '<span class="trk-rest">spends a slot</span></div>';
      }
      var have = opts.ro ? Math.max(0, r.max - num(((c.res || {})[r.id]), 0)) : left(c, r);
      var roll = r.roll && !opts.ro ? '<button type="button" class="btn xs" data-trk-spend-roll="' + esc(r.id) + '"' + (have ? "" : " disabled") + ' title="Spend one and roll it">Use ' + esc(r.roll) + "</button>" : "";
      return '<div class="trk-res">' + head + '<span class="trk-pips">' + pipRow(r.id, r.max, have, { ro: opts.ro, label: r.name }) + "</span>" +
        '<span class="trk-count">' + have + "/" + r.max + "</span>" + roll + '<span class="trk-rest">' + restTag(r) + "</span></div>";
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
    if (k === "quiver") {
      var t = poolType(w), p = pool(c, t, false), have = p ? num(p.count) : 0, shot = num(g.spentAmmo);
      var show = Math.min(have, 30);
      var word = POOL_WORD[t] || t;
      var rec = Math.floor(shot / 2);
      return '<div class="trk-weap trk-quiver" data-trk-gun="' + i + '"><span class="trk-label">' + (t === "stones" ? "Pouch" : "Quiver") + "</span>" +
        '<span class="trk-pips ammo ' + esc(t) + '">' + pipRow("q" + i, show, show, { ro: true, cls: "ammo", label: word }) + (have > 30 ? '<span class="trk-more">+' + (have - 30) + "</span>" : "") + "</span>" +
        '<span class="trk-count">' + have + " " + esc(word) + "</span>" +
        (shot ? '<span class="trk-shot" title="Shot this fight and lying around">' + shot + " shot</span>" : "") +
        '<button type="button" class="btn xs" data-trk-recover="' + i + '"' + (rec ? "" : " disabled") + ' title="After the fight: recover half your spent ' + esc(word) + ' (PHB). The rest are broken or lost.">Recover ' + (rec ? "½ (+" + rec + ")" : "½") + "</button>" +
        (have ? "" : '<span class="fine trk-warn">Out of ' + esc(word) + ". Add them under Ammo.</span>") + "</div>";
    }
    if (k === "loaded") {
      var t2 = poolType(w), p2 = pool(c, t2, false), have2 = p2 ? num(p2.count) : 0, loaded = num(g.loaded) > 0;
      var word2 = POOL_WORD[t2] || t2;
      return '<div class="trk-weap trk-loaded" data-trk-gun="' + i + '"><span class="trk-label">Loading</span>' +
        '<span class="trk-bolt' + (loaded ? " on" : "") + '" title="' + (loaded ? "Loaded: one " + word2.replace(/s$/, "") + " ready" : "Empty") + '">' + (loaded ? "LOADED" : "EMPTY") + "</span>" +
        '<button type="button" class="btn xs" data-trk-load="' + i + '"' + (loaded || !have2 ? " disabled" : "") + ' data-cost="Free" title="Load one ' + esc(word2.replace(/s$/, "")) + '. Free. Loading: one shot per action, bonus action or reaction, even with Extra Attack.">Load (free)</button>' +
        '<span class="trk-count">' + have2 + " " + esc(word2) + " left</span>" +
        (num(g.spentAmmo) ? '<span class="trk-shot">' + num(g.spentAmmo) + ' shot</span><button type="button" class="btn xs" data-trk-recover="' + i + '" title="After the fight: recover half (PHB ammunition rule)">Recover ½ (+' + Math.floor(num(g.spentAmmo) / 2) + ")</button>" : "") + "</div>";
    }
    if (k === "thrown") return thrownHtml("gun", i, g, w);
    return "";
  }
  function thrownHtml(slot, i, row, w) {
    var owned = Math.max(1, num(row.count, 1)), out = Math.min(owned, num(row.out));
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
      '<button type="button" class="btn xs" data-trk-recall="' + slot + ":" + i + '"' + (out ? "" : " disabled") + ' title="After the fight: pick them all back up (Jessey: all thrown knives, hatchets and spears are recovered)">Recover all</button></div>';
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
    if (k === "quiver") {
      var t = poolType(w), p = pool(c, t, false);
      if (!p || num(p.count) <= 0) return { ok: false, reason: "Out of " + (POOL_WORD[t] || t) + ". Recover some after the fight, or buy more." };
      p.count = num(p.count) - 1;
      g.spentAmmo = num(g.spentAmmo) + 1;
      return { ok: true, left: num(p.count), unit: POOL_WORD[t] || t };
    }
    if (k === "loaded") {
      if (num(g.loaded) <= 0) return { ok: false, reason: "Not loaded. Load one (free), then fire." };
      var st = pipsState();
      if (g.loadShotKey && g.loadShotKey === (st.turnKey || "") + "|" + (st.attacks || 0) && st.action) {
        /* Loading: never blocked (the DM can allow it), just warned like the action pips */
        log("Loading: one shot per action, even with Extra Attack. Fired anyway; the DM can allow it.", "alert");
      }
      g.loaded = 0;
      g.spentAmmo = num(g.spentAmmo) + 1;
      g.loadShotKey = (st.turnKey || "") + "|" + ((st.attacks || 0) + 1);
      var pb = pool(c, poolType(w), false);
      return { ok: true, left: 0, unit: "empty now; " + (pb ? num(pb.count) : 0) + " " + (POOL_WORD[poolType(w)] || "bolts") + " to load" };
    }
    var owned = Math.max(1, num(g.count, 1));
    if (num(g.out) >= owned) return { ok: false, reason: "All thrown. Recover them after the fight." };
    g.out = num(g.out) + 1;
    return { ok: true, left: owned - g.out, unit: "of " + owned + " still in hand" };
  }
  /** sheet-playtest rollMeleeNow hook: a Throw spends one thrown weapon. */
  var throwing = -1;
  function onMeleeAttack(c, i) {
    if (throwing !== i) return null;
    throwing = -1;
    var row = c.melee && c.melee[i];
    if (!row) return null;
    var owned = Math.max(1, num(row.count, 1));
    if (num(row.out) >= owned) return { ok: false, reason: "All thrown. Recover them after the fight." };
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
      if (k === "quiver") { var p = pool(c, poolType(w), false); rows.push({ index: i, name: w.name, icon: "bow", text: String(p ? num(p.count) : 0), loaded: p ? num(p.count) : 0, cap: 0, kind: k }); }
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
      if (r.kind === "sneak") return { id: r.id, name: r.name, dice: r.dice, used: !!(c.res && c.res.sneakUsed), rest: r.rest };
      if (r.kind === "smite") return { id: r.id, name: r.name, slots: true, rest: r.rest };
      return { id: r.id, name: r.name, max: r.max, left: left(c, r), die: r.die || "", rest: r.rest };
    });
    return { res: res, tokenRows: tokenRows(c) };
  }
  /** Read-only chips for the DMCC player card. */
  function dmHtml(s) {
    var t = s && s.trackers;
    if (!t || (!(t.res || []).length && !(t.tokenRows || []).length)) return "";
    return '<div class="trk-dm">' + (t.res || []).map(function (r) {
      if (r.dice) return '<span class="trk-chip' + (r.used ? " spent" : "") + '" title="Once per turn">' + esc(r.name) + " " + esc(r.dice) + " · " + (r.used ? "used" : "ready") + "</span>";
      if (r.slots) return '<span class="trk-chip" title="Spends spell slots (see Shells line)">' + esc(r.name) + " · slots</span>";
      var dots = ""; for (var k = 0; k < r.max; k++) dots += k < r.left ? "●" : "○";
      return '<span class="trk-chip" title="' + esc(r.rest === "short" ? "Short or long rest" : "Long rest") + '">' + esc(r.name) + (r.die ? " " + esc(r.die) : "") + ' <b class="trk-dots">' + dots + "</b> " + r.left + "/" + r.max + "</span>";
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
    }
    $$("#meleeBox .melee-card").forEach(function (card, idx) {
      var slot2 = card.querySelector(".trk-slot-melee");
      if (!slot2) { slot2 = document.createElement("div"); slot2.className = "trk-slot-melee"; var act = card.querySelector(".g-actions"); card.insertBefore(slot2, act || null); }
      var mh = meleeTracker(c, idx);
      if (slot2.getAttribute("data-sig") !== mh) { slot2.innerHTML = mh; slot2.setAttribute("data-sig", mh); }
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
      patch(function (cc) { cc.res = cc.res || {}; cc.res.sneakUsed = !cc.res.sneakUsed; }); paint(); return;
    }
    if (t.hasAttribute("data-trk-sneak-roll")) {
      var dice = progCol(c, "Sneak Attack") || (Math.ceil(lv(c) / 2) + "d6");
      var m = dice.match(/(\d+)d(\d+)/); var got2 = rollDice(num(m && m[1], 1), num(m && m[2], 6));
      patch(function (cc) { cc.res = cc.res || {}; cc.res.sneakUsed = true; }); paint();
      log((c.name || "You") + " Sneak Attack: " + dice + " = " + got2.total + " extra damage (once this turn).", "roll");
      post("Sneak Attack", dice, got2.total, got2.list.join("+"));
      return;
    }
    if (t.hasAttribute("data-trk-smite")) {
      if (c.badgeState === "dull") { toast("Your badge is Dull: no Smite Lead."); return; }
      var lvSel = $("[data-trk-smite-lv]", t.parentNode), L = num(lvSel && lvSel.value, 1);
      var A = app();
      if (!A || !A.slotsLeft || A.slotsLeft(L) <= 0) { toast("No level-" + L + " slot left."); return; }
      if (!A.spendHexSlot(L)) { toast("No level-" + L + " slot left."); return; }
      var undead = !!($("[data-trk-smite-undead]", t.parentNode) || {}).checked;
      var nd = Math.min(5, 1 + L) + (undead ? 1 : 0);
      var got3 = rollDice(nd, 8);
      A.applyPatch(function () {});
      paint();
      log((c.name || "You") + " Smite Lead (" + L + (L === 1 ? "st" : L === 2 ? "nd" : L === 3 ? "rd" : "th") + " slot): " + nd + "d8 = " + got3.total + " radiant" + (undead ? " (unquiet/fiend +1d8)" : "") + ".", "roll");
      post("Smite Lead", nd + "d8", got3.total, got3.list.join("+") + " radiant");
      return;
    }
    var rec = t.getAttribute("data-trk-recover");
    if (rec != null) {
      var gi = num(rec), g = c.guns[gi], w = g && weapon(g.weapon);
      if (!g || !w) return;
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
      patch(function (cc) { var row = cc[list][oi]; row.count = Math.max(1, Math.min(20, Math.max(1, num(row.count, 1)) + d)); row.out = Math.min(num(row.out), row.count); });
      paint(); return;
    }
    var recall = t.getAttribute("data-trk-recall");
    if (recall) {
      var p2 = recall.split(":"), l2 = p2[0] === "melee" ? "melee" : "guns", ri = num(p2[1]);
      var n2 = num(c[l2][ri] && c[l2][ri].out);
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
  /* rests: short = short-rest resources (+4 sorcery at Hexslinger 20th), long = everything */
  function onRest(kind) {
    var c = ch();
    if (!c) return;
    patch(function (cc) {
      cc.res = cc.res || {};
      resourcesFor(cc).forEach(function (r) {
        if (r.kind !== "pips") return;
        if (kind === "long" || r.rest === "short") cc.res[r.id] = 0;
        else if (r.id === "sorc" && lv(cc) >= 20) cc.res[r.id] = Math.max(0, num(cc.res[r.id]) - 4);
      });
      cc.res.sneakUsed = false;
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
    "@media (max-width:480px){.trk-name{min-width:0;width:100%}}"
  ].join("\n");
  function injectCss() {
    if (typeof document === "undefined" || document.getElementById("trkCss")) return;
    var s = document.createElement("style"); s.id = "trkCss"; s.textContent = CSS; document.head.appendChild(s);
  }
  if (typeof document !== "undefined") {
    injectCss();
    document.addEventListener("click", onClick);
    root.addEventListener("ssdns:pips-reset", function () {
      var c = ch();
      if (c && c.res && c.res.sneakUsed) { patch(function (cc) { cc.res.sneakUsed = false; }); paint(); }
    });
    var tries = 0;
    (function boot() { if (!wrapRest() && tries++ < 60) setTimeout(boot, 250); else paint(); })();
  }
  root.SSDNSTrackers = {
    XBOWS: XBOWS, BOLTS: BOLTS, AMMO_EXTRA: AMMO_EXTRA, isFirearm: isFirearm, weapon: weapon, kindOf: kindOf, resourcesFor: resourcesFor,
    spendShot: spendShot, onMeleeAttack: onMeleeAttack, itemPips: itemPips, tokenRows: tokenRows,
    snapshot: snapshot, dmHtml: dmHtml, paint: paint, onRest: onRest, resHtml: resHtml
  };
})(typeof window !== "undefined" ? window : this);

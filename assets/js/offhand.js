/**
 * Off-hand attack (two-weapon fighting), sheet 0.3.78.
 * Rules (BOOK1.md Property Key "light: as PHB"; Feats › Dual Wielder, campaign house rule):
 *  - Without Dual Wielder: PHB two-weapon fighting. Both weapons are LIGHT one-handed MELEE weapons.
 *  - Pistols are one-handed but NOT light (Dual Wielder note), so twin irons need Dual Wielder.
 *  - Dual Wielder: any pair of qualifying weapons, light or not: any pistol, a one-handed Caster Gun
 *    (Blacksnake, Hognose), or a one-handed melee blade; pistol + blade mixes are fine.
 *  - The off-hand attack is a BONUS ACTION after you take the Attack action. It rolls like a normal attack
 *    (target picker incl. Free shot, range, adv/dis, misfire, ammo, sound, chat), but a positive ability
 *    modifier is NOT added to its damage. SSDNS has no Two-Weapon Fighting style, so nothing restores it.
 *  - Pistols use their own side: the Holster L / Holster R first-shot bonus already rides on each gun's row.
 * 0.3.78 (Jessey's rulings):
 *  - The Herringer Light Pocket Pistol, Light Double Derringer and Light Pepperbox ARE light weapons, so they pair
 *    for the off-hand attack without Dual Wielder (with each other or a light melee weapon). Other pistols still need
 *    Dual Wielder. Toggle: LIGHT_PISTOLS_ON below.
 *  - The off-hand attack REQUIRES the Attack action first that turn: the sheet blocks it with a message. A shot the
 *    DM sends while acting for the player overrides the block (logged).
 *  - "Holding two weapons" (wieldingTwo): a qualifying off-hand pair is in hand (not stowed with Stow both). While it
 *    is, Sidearm Duelling's +2 "single iron" is off, and Dual Wielder gives +1 AC.
 *  - Dual Wielder draws or stows both weapons at once (Draw both / Stow both on the Off-hand card).
 *  - Off-hand damage: a positive ability mod is dropped, a negative one stays. The Two-Gun fighting style
 *    (Jessey L0183: 5e Two-Weapon Fighting; Gunslinger incl. Additional Gun Style at 10th, Frontier Scout; not Lawman)
 *    adds the modifier back.
 */
(function (root) {
  "use strict";
  var TAG = "off-hand";
  /* Jessey 2026-10-19: these three Herringer rows have the Light property and count as light weapons. */
  var LIGHT_PISTOLS_ON = true;
  var LIGHT_PISTOLS = ["herringer-light-pocket-pistol", "herringer-light-double-derringer", "herringer-light-pepperbox"];
  function lightPistol(w) { return LIGHT_PISTOLS_ON && !!w && LIGHT_PISTOLS.indexOf(w.id) >= 0; }
  function R() { return root.SSDNS_RULES || root.SSDNSRules || {}; }
  function C() { try { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; } catch (e) { return null; } }
  function feats(c) { return (c && Array.isArray(c.feats)) ? c.feats : []; }
  function hasDualWielder(c) { return feats(c).indexOf("dual-wielder") >= 0; }
  function hasTwoGun(c) {
    c = c || C();
    var A = root.SSDNSApp;
    return !!(c && A && A.hasStyle && A.hasStyle("two-gun", c));
  }
  function props(w) { return String((w && w.properties) || ""); }
  function twoHanded(w) { return /two-handed/i.test(props(w)); }
  function lightMelee(w) { return /(^|[\s,(])light([\s,)]|$)/i.test(props(w)) && !twoHanded(w); }
  function meleeRow(id) {
    var list = R().melee || [];
    for (var k = 0; k < list.length; k++) if (list[k] && list[k].id === id) return list[k];
    return null;
  }
  function view() {
    try { return root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : null; } catch (e) { return null; }
  }
  function gunRow(id, i, v) {
    var st = v && v.guns && v.guns[i];
    if (st && st.w && st.w.id === id) return st.w;
    var lists = [].concat(R().firearms || [], R().casterGuns || []);
    for (var k = 0; k < lists.length; k++) if (lists[k] && lists[k].id === id) return lists[k];
    return null;
  }
  function isPistol(w) { return !!w && w.group === "pistol"; }
  function isCasterGun(w) { return !!w && (w.group === "caster" || !!w.hexShells) && !twoHanded(w) && w.id !== "borrowed-iron"; }
  function sideOf(c, i) {
    var E = root.SSDNSEquip;
    return E && E.pistolSide ? E.pistolSide(c, i) : "";
  }
  function labelName(w, fallback) { return String((w && w.name) || fallback || "").replace(/\s*\([^)]*\)\s*$/, ""); }
  /** Weapons that can make the off-hand attack right now, and why not when none can. */
  function options(c, lite) {
    c = c || C();
    var out = { ok: false, dualWielder: hasDualWielder(c), list: [], reason: "" };
    if (!c) { out.reason = "No character."; return out; }
    var dw = out.dualWielder;
    /* A shield fills the other hand: no weapon in each hand, no two-weapon fighting (PHB). */
    if (c.shield) { out.reason = "Off-hand needs a weapon in each hand; the shield fills one."; return out; }
    var v = lite ? null : view(); /* lite: no compute() (called from inside compute for AC / style damage) */
    (c.guns || []).forEach(function (g, i) {
      if (!g || !g.weapon || g.equipped === false || g.weapon === "borrowed-iron") return;
      var w = gunRow(g.weapon, i, v);
      if (!w || !(isPistol(w) || isCasterGun(w))) return;
      var lp = lightPistol(w);
      out.list.push({ kind: "gun", index: i, id: "gunroll:" + i, name: labelName(w, g.weapon), side: sideOf(c, i), light: lp, pistol: isPistol(w), caster: isCasterGun(w), counts: dw || lp });
    });
    (c.melee || []).forEach(function (m, i) {
      if (!m || !m.weapon || m.equipped === false) return;
      var w = meleeRow(m.weapon);
      if (!w || twoHanded(w)) return;
      if (m.twoHand && /versatile/i.test(props(w))) return; /* swung two-handed (Versatile grip): not a one-hand weapon now */
      var light = lightMelee(w);
      out.list.push({ kind: "melee", index: i, id: "melee:" + i, name: labelName(w, m.weapon), side: "", light: light, pistol: false, caster: false, counts: dw || light });
    });
    var held = out.list;
    out.list = held.filter(function (o) { return o.counts; });
    out.ok = out.list.length >= 2;
    if (!out.ok) {
      var pistols = held.filter(function (o) { return (o.pistol || o.caster) && !o.light; }).length;
      if (!dw && pistols >= 1 && held.length >= 2) out.reason = "That pistol needs the Dual Wielder feat for off-hand (only the Herringer Light pistols are light).";
      else if (!dw && held.length >= 2) out.reason = "Off-hand needs two light weapons, or the Dual Wielder feat.";
      else out.reason = "Off-hand needs a qualifying weapon in each hand.";
    }
    return out;
  }
  /** The off-hand pick: R-side pistol first (L is the drawing hand), then the last qualifying weapon. */
  function defaultPick(opts) {
    var list = (opts && opts.list) || [];
    var r = list.filter(function (o) { return o.side === "R"; })[0];
    return r || list[list.length - 1] || null;
  }
  function qualifies(c, kind, index) {
    var o = options(c);
    if (!o.ok) return { ok: false, reason: o.reason };
    var hit = o.list.filter(function (x) { return x.kind === kind && Number(x.index) === Number(index); })[0];
    return hit ? { ok: true, pick: hit, dualWielder: o.dualWielder } : { ok: false, reason: "That weapon doesn't qualify for an off-hand attack." };
  }
  /* ---- damage: drop a positive ability modifier ---- */
  function abilityMod(c, kind, index) {
    var v = null;
    try { v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : null; } catch (e) { v = null; }
    if (!v) return 0;
    if (kind === "gun") {
      var st = v.guns && v.guns[index];
      var p = st && st.dmgParts && st.dmgParts.filter(function (x) { return x && /^(STR|DEX)$/.test(x.label); })[0];
      return p ? Number(p.value) || 0 : 0;
    }
    var row = c && c.melee && c.melee[index];
    var w = row && meleeRow(row.weapon);
    if (!w) return 0;
    var mods = v.mods || {};
    return /finesse/i.test(props(w)) ? Math.max(mods.STR || 0, mods.DEX || 0) : (mods.STR || 0);
  }
  /** "1d8 +3 piercing" with mod 3 -> "1d8 piercing". A negative mod stays (PHB). */
  function stripMod(expr, mod) {
    mod = Number(mod) || 0;
    if (mod <= 0 || hasTwoGun()) return String(expr || "");
    var s = String(expr || "");
    var m = s.match(/(\d*)d(\d+)/i);
    if (!m) return s;
    var rest = s.replace(/(\d*)d(\d+)/i, "\u0000");
    var flatM = rest.match(/([+-])\s*(\d+)/);
    var flat = flatM ? parseInt(flatM[1] + flatM[2], 10) : 0;
    var next = flat - mod;
    var flatTxt = next ? (" " + (next > 0 ? "+" : "") + next) : "";
    var out = flatM ? rest.replace(/\s*[+-]\s*\d+/, flatTxt) : rest.replace("\u0000", "\u0000" + flatTxt);
    return out.replace("\u0000", m[0]).replace(/\s{2,}/g, " ").trim();
  }
  function stripParts(parts) {
    if (hasTwoGun()) return (parts || []).slice();
    return (parts || []).filter(function (p) { return !(p && /^(STR|DEX)$/.test(p.label) && Number(p.value) > 0); });
  }
  /* ---- holding two weapons: Sidearm Duelling off, Dual Wielder +1 AC ---- */
  function wieldingTwo(c) {
    c = c || C();
    if (!c || c.offhandStowed === true) return false;
    return options(c, true).ok;
  }
  function dualWielderAc(c) {
    c = c || C();
    return hasDualWielder(c) && wieldingTwo(c) ? 1 : 0;
  }
  /* ---- the Attack-action gate (Jessey: required; the DM can override) ---- */
  var BLOCK_MSG = "Off-hand attack: take the Attack action first this turn. The off-hand attack is the bonus action after it. (The DM can allow it.)";
  function attackTaken() {
    var P = root.SSDNSActionPips;
    var st = P && P.state ? P.state() : null;
    if (!st) return true; /* no pips loaded: nothing to check against */
    return st.actionBy === "attack" || (st.action && st.actionBy === "manual");
  }
  /** opts.dm: the DM is acting for this player, so a missing Attack action is overridden (and logged). */
  function gate(name, opts) {
    opts = opts || {};
    var log = root.SSDNSSheet && root.SSDNSSheet.addLog;
    /* 0.3.73: Fan the Hammer and the off-hand attack share the one bonus action */
    if (root.SSDNSFan && root.SSDNSFan.usedThisTurn && root.SSDNSFan.usedThisTurn()) {
      var fanMsg = "Off-hand attack: Fan the Hammer already used your bonus action this turn.";
      if (opts.dm) { if (log) log({ kind: "alert", text: "DM override: " + fanMsg }); return { ok: true, override: true }; }
      if (root.SSDNSToast) root.SSDNSToast(fanMsg);
      if (log) log({ kind: "alert", text: fanMsg });
      return { ok: false, reason: fanMsg };
    }
    if (attackTaken()) return { ok: true };
    if (opts.dm) {
      if (log) log({ kind: "alert", text: "DM override: " + (name || "Off-hand") + " off-hand attack before the Attack action." });
      return { ok: true, override: true };
    }
    if (root.SSDNSToast) root.SSDNSToast(BLOCK_MSG);
    if (log) log({ kind: "alert", text: BLOCK_MSG });
    return { ok: false, reason: BLOCK_MSG };
  }
  /* ---- the pip: Bonus action, after the Attack action ---- */
  function spendPip(name) {
    var P = root.SSDNSActionPips;
    if (!P) return null;
    if (root.SSDNSFan && root.SSDNSFan.noteOffhand) root.SSDNSFan.noteOffhand();
    return P.spend ? P.spend("bonus", (name || "Off-hand") + " off-hand attack") : null;
  }
  /* ---- Dual Wielder: draw or stow both weapons at once ---- */
  function bothHands(draw) {
    var c = C();
    if (!c) return false;
    var o = options(c, true);
    var who = c.name || "You";
    var names = o.list.slice(0, 2).map(function (x) { return x.name; }).join(" and ");
    if (draw) {
      c.offhandStowed = false;
    } else {
      c.offhandStowed = true;
      (c.guns || []).forEach(function (g) { if (g) g.drawn = false; });
    }
    var line = who + (draw ? " draws " : " stows ") + (names || "both weapons") + " at once (Dual Wielder).";
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "roll", text: line });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postChat) root.SSDNSDmJoin.postChat({ text: line });
    if (root.SSDNSApp && root.SSDNSApp.changed) root.SSDNSApp.changed();
    else if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function () {});
    paint(true);
    return true;
  }
  /* ---- fire: the normal attack path with the off-hand flag set ---- */
  function fire(kind, index, opts) {
    opts = opts || {};
    var c = C();
    var q = qualifies(c, kind, index);
    if (!q.ok) {
      var why = q.reason || "Not a qualifying off-hand weapon.";
      if (!opts.dm) { if (root.SSDNSToast) root.SSDNSToast(why); return false; }
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: "DM off-hand: " + why + " Rolled anyway." });
    }
    if (c && c.offhandStowed === true && !opts.dm) {
      var st = "Both weapons are stowed. Draw both first.";
      if (root.SSDNSToast) root.SSDNSToast(st);
      return false;
    }
    if (kind === "gun" && root.SSDNSGunRoll) {
      root.SSDNSGunRoll._offhand = true;
      try { root.SSDNSGunRoll(Number(index), opts.chamber); }
      finally { root.SSDNSGunRoll._offhand = null; }
      return true;
    }
    if (kind === "melee" && root.SSDNSPlaytest && root.SSDNSPlaytest.rollMelee) {
      root.SSDNSPlaytest.rollMelee(Number(index), { offhand: true });
      return true;
    }
    return false;
  }
  function parseId(id) {
    var m = String(id || "").match(/^offhand:(gun|melee):(\d+)$/);
    return m ? { kind: m[1], index: Number(m[2]) } : null;
  }
  /* ---- Gear tab card ---- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }
  function optionLabel(o) {
    return o.name + (o.side ? " (Holster " + o.side + ")" : "") + (o.kind === "melee" ? " · melee" : "");
  }
  function cardHtml(c) {
    var o = options(c);
    if (!o.ok) return "";
    var stowed = c && c.offhandStowed === true;
    var hands = o.dualWielder
      ? (stowed
        ? " <button type='button' class='btn sm' id='btnDrawBoth' title='Dual Wielder: draw both weapons at once.'>Draw both</button>"
        : " <button type='button' class='btn sm' id='btnStowBoth' title='Dual Wielder: stow both weapons at once.'>Stow both</button>")
      : "";
    var pick = defaultPick(o);
    var sel = "<select id='offhandPick' aria-label='Off-hand weapon'>" + o.list.map(function (x) {
      var v = x.kind + ":" + x.index;
      return "<option value='" + esc(v) + "'" + (pick && pick.kind === x.kind && pick.index === x.index ? " selected" : "") + ">" + esc(optionLabel(x)) + "</option>";
    }).join("") + "</select>";
    var why = o.dualWielder ? (stowed ? "Dual Wielder · stowed" : "Dual Wielder · +1 AC while holding both") : "two light weapons";
    return "<div class='offhand-card' id='offhandCard'>" +
      "<b>Off-hand</b> <span class='pip-tag'>Bonus</span> " + sel +
      " <button type='button' class='btn sm' id='btnOffhand'" + (stowed ? " disabled" : "") + " title='Bonus action after the Attack action. Rolls like a normal attack; no ability modifier on damage.'>Off-hand attack</button>" + hands +
      "<span class='fine offhand-note'>" + esc(why) + " · needs the Attack action first · " + (hasTwoGun(c) ? "Two-Gun: ability mod added to damage" : "no ability mod to damage") + (c && root.SSDNSApp && root.SSDNSApp.hasStyle && root.SSDNSApp.hasStyle("sidearm", c) && !stowed ? " · Sidearm Duelling +2 is off while holding two" : "") + "</span></div>";
  }
  function paint(force) {
    if (typeof document === "undefined") return;
    var box = document.querySelector("#meleeBox") || document.querySelector("#guns");
    if (!box) return;
    var host = document.querySelector("#offhandSlot");
    if (!host) {
      host = document.createElement("div");
      host.id = "offhandSlot";
      box.parentNode.insertBefore(host, box.nextSibling);
    }
    var c = C();
    var keep = document.querySelector("#offhandPick");
    var was = keep && keep.value;
    var html = cardHtml(c);
    if (!force && host.getAttribute("data-html") === html) return;
    host.setAttribute("data-html", html);
    host.innerHTML = html;
    var sel = document.querySelector("#offhandPick");
    if (sel && was) Array.prototype.forEach.call(sel.options, function (op) { if (op.value === was) sel.value = was; });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var hb = e.target && e.target.closest && e.target.closest("#btnDrawBoth, #btnStowBoth");
      if (hb) { bothHands(hb.id === "btnDrawBoth"); return; }
      var b = e.target && e.target.closest && e.target.closest("#btnOffhand");
      if (!b) return;
      var sel = document.querySelector("#offhandPick");
      var v = String((sel && sel.value) || "").split(":");
      if (v.length === 2) fire(v[0], Number(v[1]));
    });
    var tick = function () { try { paint(); } catch (e) {} };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick); else tick();
    document.addEventListener("input", function () { setTimeout(tick, 0); }, true);
    document.addEventListener("change", function () { setTimeout(tick, 0); }, true);
    setInterval(tick, 3000);
  }
  root.SSDNSOffhand = {
    TAG: TAG, options: options, defaultPick: defaultPick, qualifies: qualifies, abilityMod: abilityMod,
    stripMod: stripMod, stripParts: stripParts, spendPip: spendPip, fire: fire, parseId: parseId, paint: paint,
    hasDualWielder: hasDualWielder, hasTwoGun: hasTwoGun, lightMelee: lightMelee, lightPistol: lightPistol, LIGHT_PISTOLS: LIGHT_PISTOLS,
    wieldingTwo: wieldingTwo, dualWielderAc: dualWielderAc, gate: gate, attackTaken: attackTaken, bothHands: bothHands,
    BLOCK_MSG: BLOCK_MSG
  };
})(typeof window !== "undefined" ? window : this);

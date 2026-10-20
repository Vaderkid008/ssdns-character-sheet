/**
 * Off-hand attack (two-weapon fighting), sheet 0.3.72.
 * Rules (BOOK1.md Property Key "light: as PHB"; Feats › Dual Wielder, campaign house rule):
 *  - Without Dual Wielder: PHB two-weapon fighting. Both weapons are LIGHT one-handed MELEE weapons.
 *  - Pistols are one-handed but NOT light (Dual Wielder note), so twin irons need Dual Wielder.
 *  - Dual Wielder: any pair of qualifying weapons, light or not: any pistol, a one-handed Caster Gun
 *    (Blacksnake, Hognose), or a one-handed melee blade; pistol + blade mixes are fine.
 *  - The off-hand attack is a BONUS ACTION after you take the Attack action. It rolls like a normal attack
 *    (target picker incl. Free shot, range, adv/dis, misfire, ammo, sound, chat), but a positive ability
 *    modifier is NOT added to its damage. SSDNS has no Two-Weapon Fighting style, so nothing restores it.
 *  - Pistols use their own side: the Holster L / Holster R first-shot bonus already rides on each gun's row.
 * Never blocks: like every pip, a used Bonus action or a missing Attack action only warns.
 */
(function (root) {
  "use strict";
  var TAG = "off-hand";
  function R() { return root.SSDNS_RULES || root.SSDNSRules || {}; }
  function C() { try { var d = root.SSDNSApp && root.SSDNSApp.doc && root.SSDNSApp.doc(); return d && d.character; } catch (e) { return null; } }
  function feats(c) { return (c && Array.isArray(c.feats)) ? c.feats : []; }
  function hasDualWielder(c) { return feats(c).indexOf("dual-wielder") >= 0; }
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
  function options(c) {
    c = c || C();
    var out = { ok: false, dualWielder: hasDualWielder(c), list: [], reason: "" };
    if (!c) { out.reason = "No character."; return out; }
    var dw = out.dualWielder;
    /* A shield fills the other hand: no weapon in each hand, no two-weapon fighting (PHB). */
    if (c.shield) { out.reason = "Off-hand needs a weapon in each hand; the shield fills one."; return out; }
    var v = view();
    (c.guns || []).forEach(function (g, i) {
      if (!g || !g.weapon || g.equipped === false || g.weapon === "borrowed-iron") return;
      var w = gunRow(g.weapon, i, v);
      if (!w || !(isPistol(w) || isCasterGun(w))) return;
      out.list.push({ kind: "gun", index: i, id: "gunroll:" + i, name: labelName(w, g.weapon), side: sideOf(c, i), light: false, pistol: isPistol(w), caster: isCasterGun(w), counts: dw });
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
      var pistols = held.filter(function (o) { return o.pistol || o.caster; }).length;
      if (!dw && pistols >= 2) out.reason = "Twin pistols need the Dual Wielder feat (pistols are one-handed, not light).";
      else if (!dw && held.length >= 2) out.reason = "Off-hand needs two light melee weapons, or the Dual Wielder feat.";
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
    if (mod <= 0) return String(expr || "");
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
    return (parts || []).filter(function (p) { return !(p && /^(STR|DEX)$/.test(p.label) && Number(p.value) > 0); });
  }
  /* ---- the pip: Bonus action, after the Attack action ---- */
  function spendPip(name) {
    var P = root.SSDNSActionPips;
    if (!P) return null;
    var st = P.state ? P.state() : null;
    if (st && st.actionBy !== "attack" && !(st.action && st.actionBy === "manual")) {
      var msg = "Off-hand attack: take the Attack action first (PHB two-weapon fighting). Done anyway; the DM can allow it.";
      if (root.SSDNSToast) root.SSDNSToast(msg);
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: msg });
    }
    return P.spend ? P.spend("bonus", (name || "Off-hand") + " off-hand attack") : null;
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
    var pick = defaultPick(o);
    var sel = "<select id='offhandPick' aria-label='Off-hand weapon'>" + o.list.map(function (x) {
      var v = x.kind + ":" + x.index;
      return "<option value='" + esc(v) + "'" + (pick && pick.kind === x.kind && pick.index === x.index ? " selected" : "") + ">" + esc(optionLabel(x)) + "</option>";
    }).join("") + "</select>";
    var why = o.dualWielder ? "Dual Wielder" : "two light weapons";
    return "<div class='offhand-card' id='offhandCard'>" +
      "<b>Off-hand</b> <span class='pip-tag'>Bonus</span> " + sel +
      " <button type='button' class='btn sm' id='btnOffhand' title='Bonus action after the Attack action. Rolls like a normal attack; no ability modifier on damage.'>Off-hand attack</button>" +
      "<span class='fine offhand-note'>" + esc(why) + " · bonus action after you Attack · no ability mod to damage</span></div>";
  }
  function paint() {
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
    if (host.getAttribute("data-html") === html) return;
    host.setAttribute("data-html", html);
    host.innerHTML = html;
    var sel = document.querySelector("#offhandPick");
    if (sel && was) Array.prototype.forEach.call(sel.options, function (op) { if (op.value === was) sel.value = was; });
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
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
    hasDualWielder: hasDualWielder, lightMelee: lightMelee
  };
})(typeof window !== "undefined" ? window : this);

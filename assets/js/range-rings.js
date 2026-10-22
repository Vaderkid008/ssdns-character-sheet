/* Range rings and the range check for a map attack that has a target.
   Green is normal range. Orange is a disadvantage band. Red is the line
   you cannot shoot past. Purple is a spell ring. Rings stay off until a
   player or the DM turns them on. The check still runs when rings are hidden. */
(function (root) {
  "use strict";

  function rules() { return root.SSDNS_RULES || {}; }

  function numPair(range) {
    var m = String(range || "").match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (!m) return null;
    return { normal: Number(m[1]), long: Number(m[2]) };
  }

  function feetOf(range) {
    var m = String(range || "").match(/(\d+(?:\.\d+)?)\s*ft/i);
    return m ? Number(m[1]) : 0;
  }

  function catalog(spec) {
    spec = spec || {};
    var lists = [].concat(rules().firearms || [], rules().casterGuns || [], rules().melee || [], rules().otherRanged || []);
    var id = spec.weapon || spec.weaponId || "";
    var name = String(spec.name || "").toLowerCase();
    var i, row;
    for (i = 0; i < lists.length; i++) {
      row = lists[i];
      if (!row) continue;
      if (id && row.id === id) return row;
      if (name && String(row.name || "").toLowerCase() === name) return row;
    }
    if (root.SSDNSPeaceMaker && root.SSDNSPeaceMaker.lookup) {
      var peace = root.SSDNSPeaceMaker.lookup(id || name);
      if (peace) return peace;
    }
    return null;
  }

  function propsOf(spec, cat) {
    var p = spec.properties;
    if (Array.isArray(p)) p = p.join(", ");
    return String(p || (cat && cat.properties) || "");
  }

  function tierRow(cat, spec) {
    var tiers = cat && cat.tiers || {};
    if (spec.tier && tiers[spec.tier]) return tiers[spec.tier];
    var keys = Object.keys(tiers);
    return keys.length ? tiers[keys[0]] : null;
  }

  function rangeString(spec, cat) {
    if (spec.range) return String(spec.range);
    if (!cat) return "";
    if (cat.range && cat.range !== "—" && cat.range !== "-") return String(cat.range);
    var tier = tierRow(cat, spec);
    if (!tier) return "";
    if (cat.scatter || spec.scatter) {
      var load = spec.load === "slug" ? "slug" : "buck";
      var row = tier[load] || tier.buck || tier.slug || tier;
      return row.range || "";
    }
    return tier.range || "";
  }

  function spellRange(spec) {
    if (spec.range) return String(spec.range);
    var cast = root.SSDNSSpellCast;
    if (cast && typeof cast.rangeOf === "function") return cast.rangeOf(spec.name || "") || "";
    return "";
  }

  function empty(label) {
    return {
      close: 0, normal: 0, long: 0, melee: 0, meleeRed: 0,
      clearLong: false, cone: false, spell: false, thrown: false,
      purple: false, touch: false, doubled: false, self: false, label: label || ""
    };
  }

  function bands(spec) {
    spec = spec || {};
    var cat = catalog(spec);
    var group = String(spec.group || (cat && cat.group) || "").toLowerCase();
    var name = String(spec.name || (cat && cat.name) || "Range");
    var properties = propsOf(spec, cat);
    var kind = String(spec.kind || "");
    var spell = kind === "spell" || spec.spell === true;
    if (spell) {
      var rawSpell = spellRange(spec);
      var selfSpell = /^\s*self\b/i.test(rawSpell);
      var touchSpell = /^\s*touch\b/i.test(rawSpell);
      if (selfSpell) {
        var none = empty(name);
        none.self = true;
        none.spell = true;
        return none;
      }
      var attackSpell = !spec.spellKind || spec.spellKind === "attack";
      var ftSpell = touchSpell ? 5 : feetOf(rawSpell);
      if (!ftSpell) return empty(name);
      var doubled = !!(attackSpell && spec.longRangeHex && !touchSpell);
      if (doubled) ftSpell *= 2;
      var spellLabel = "Spell · " + ftSpell + " ft" + (doubled ? " · x2 Long-Range Hex" : "");
      return {
        close: 0, normal: ftSpell, long: ftSpell, melee: 0, meleeRed: 0,
        clearLong: false, cone: false, spell: true, thrown: false,
        purple: true, touch: !!touchSpell, doubled: doubled, self: false,
        label: spellLabel
      };
    }
    var range = rangeString(spec, cat);
    var pair = numPair(range);
    var coneFt = /cone/i.test(range) ? feetOf(range) : 0;
    var thrown = /thrown/i.test(properties) || /thrown/i.test(range);
    var rangedGroup = /pistol|rifle|carbine|shotgun|bigbore|ranged|caster/.test(group);
    var meleeGroup = /melee/.test(group);
    var melee = meleeGroup || kind === "melee" || thrown || (!pair && !coneFt && !rangedGroup && (!range || range === "—" || range === "-"));
    var reach = /reach/i.test(properties) ? 10 : 5;
    var scope = !!(spec.scope || /scope/i.test(String(spec.mod || "")));
    var carbine = group === "carbine" || /carbine/i.test(name);
    var handy = !!(spec.handy || (cat && cat.handy) || /handy/i.test(properties));
    var closeQuarters = /close quarters/i.test(properties);
    if (scope && carbine && !handy) closeQuarters = false;
    var unwieldy = !!(spec.unwieldy || /unwieldy/i.test(properties) || /big fifty/i.test(name));
    var rifle = group === "rifle" || group === "carbine" || group === "bigbore" || /\brifle\b|\bcarbine\b/i.test(name);
    var roundName = String(spec.round || spec.caliber || "").toLowerCase();
    var casterGun = group === "caster" || /caster/.test(group) || !!(cat && (cat.hexShells || cat.group === "caster"));
    var fiftyRound = /\.50-90|50-90/.test(roundName);
    var close = 0;
    if (casterGun && (fiftyRound || spec.spellMode || spec.hexlead)) close = 0;
    else if (unwieldy && !casterGun) close = 30;
    else if (rifle && !closeQuarters) close = 5;
    var normal = pair ? pair.normal : (coneFt || 0);
    var long = pair ? pair.long : (coneFt || 0);
    var sharp = !!spec.sharpshooter;
    var clearLong = long > normal && ((scope && !spec.moved) || sharp);
    var bits = [];
    if (melee) bits.push("reach " + reach + " ft");
    if (coneFt && !pair) bits.push(coneFt + " ft cone");
    else if (pair) bits.push(pair.normal + "/" + pair.long);
    if (close) bits.push("close " + close);
    if (handy && !melee) bits.push("handy: no close-quarters disadvantage, no horseback penalty");
    if (clearLong) bits.push(sharp && !(scope && !spec.moved) ? "sharpshooter" : "scope");
    return {
      close: close,
      normal: normal,
      long: long,
      melee: melee ? reach : 0,
      meleeRed: melee ? reach + 2.5 : 0,
      clearLong: clearLong,
      cone: !!(coneFt && !pair),
      spell: false,
      thrown: !!thrown,
      label: name + (bits.length ? " · " + bits.join(" · ") : "")
    };
  }

  function rings(spec) {
    spec = spec || {};
    var b = bands(spec);
    var greenF = "rgba(46,168,74,0.18)";
    var orangeF = "rgba(224,122,32,0.24)";
    var purpleF = "rgba(123,79,214,0.16)";
    var greenS = "#2ea84a";
    var orangeS = "#e07a20";
    var redS = "#e23b32";
    var purpleS = "#7b4fd6";
    var out = [];
    if (b.spell) {
      if (b.long && !b.self) {
        out.push({ feet: b.long, role: "spell", fill: purpleF, stroke: purpleS, width: 3 });
      }
      var near = spec.hostileFeet;
      if (near != null && near !== "" && isFinite(Number(near)) && Number(near) <= 5) {
        out.push({ feet: 5, role: "warn", fill: "", stroke: redS, width: 2 });
      }
      return { rings: out, label: b.label, bands: b };
    }
    if (b.long) {
      var same = b.normal === b.long;
      out.push({
        feet: b.long,
        role: "limit",
        fill: (b.clearLong || same) ? greenF : orangeF,
        stroke: redS,
        width: 3
      });
    }
    if (b.normal && b.long && b.normal < b.long && !b.clearLong) {
      out.push({ feet: b.normal, role: "normal", fill: greenF, stroke: greenS, width: 2 });
    }
    if (b.close) out.push({ feet: b.close, role: "close", fill: orangeF, stroke: orangeS, width: 2 });
    if (b.melee) {
      out.push({ feet: b.melee, role: "reach", fill: greenF, stroke: greenS, width: 2 });
      out.push({ feet: b.meleeRed, role: "past", fill: "", stroke: redS, width: 2 });
    }
    return { rings: out, label: b.label, bands: b };
  }

  var armed = null;
  function arm(verdict) { armed = verdict || null; return armed; }
  function peek() { return armed; }
  function take() { var v = armed; armed = null; return v; }
  function clearArm() { armed = null; }
  /* 0.3.67: an armed verdict belongs to the target it was measured against. Asking for a different
     target drops the stale verdict so the caller re-measures (a cancelled shot can't leak its
     verdict onto the next, farther target). No ref given: same as peek(). */
  function peekFor(ref) {
    if (!armed) return null;
    if (ref == null || ref === "") return armed;
    var refs = armed.targetRefs;
    if (refs && refs.length && refs.indexOf(String(ref)) < 0) { armed = null; return null; }
    return armed;
  }

  var CONFIRM_TEXT = "This attack is with Disadvantage.  Continue?";

  /** Ask before a disadvantaged attack. Cancel resolves false and plays nothing. */
  function confirmDisadvantage() {
    if (typeof root.SSDNSTestDisadvantage === "function") {
      var hooked = root.SSDNSTestDisadvantage();
      if (hooked && typeof hooked.then === "function") return hooked;
      return Promise.resolve(hooked !== false);
    }
    var doc = root.document;
    if (!doc || !doc.body) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var dlg = doc.createElement("dialog");
      dlg.className = "dlg ssm-dis-confirm";
      dlg.setAttribute("data-dis-confirm", "1");
      var form = doc.createElement("form");
      form.method = "dialog";
      var p = doc.createElement("p");
      p.className = "dis-confirm-text";
      p.textContent = CONFIRM_TEXT;
      var foot = doc.createElement("div");
      foot.className = "dlg-foot";
      var go = doc.createElement("button");
      go.type = "submit";
      go.className = "btn btn-primary";
      go.setAttribute("data-dis-continue", "1");
      go.textContent = "Continue";
      var cancel = doc.createElement("button");
      cancel.type = "button";
      cancel.className = "btn";
      cancel.setAttribute("data-dis-cancel", "1");
      cancel.textContent = "Cancel";
      foot.appendChild(go);
      foot.appendChild(cancel);
      form.appendChild(p);
      form.appendChild(foot);
      dlg.appendChild(form);
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        try { if (dlg.close) dlg.close(); } catch (e) {}
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(!!ok);
      }
      cancel.addEventListener("click", function () { finish(false); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        finish(true);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(false); });
      doc.body.appendChild(dlg);
      try { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
      catch (err) { dlg.setAttribute("open", ""); }
    });
  }

  /**
   * Map attack with a target. No target: apply false (today's roll).
   * override "ignore" skips the block and the range disadvantage.
   * override "force" adds disadvantage and still blocks past the limit.
   * override "adv" (0.3.103) forces advantage: it clears range disadvantage and still blocks past the limit.
   */
  function resolve(spec, feet, opts) {
    opts = opts || {};
    var hasTarget = opts.hasTarget !== false && feet != null && feet !== "" && isFinite(Number(feet));
    if (!hasTarget) return { apply: false, blocked: false, disadvantage: false, advantage: false, band: "", feet: null, note: "", button: "", spell: false, override: opts.override || "auto" };
    var dist = Math.round(Number(feet));
    var b = bands(spec || {});
    var override = OVERRIDES[opts.override] ? opts.override : "auto";
    var spell = !!b.spell;
    var limit = b.long || b.melee || 0;
    var past = limit > 0 && dist > limit;
    if (b.melee && b.long) past = dist > b.long;
    var blocked = past && override !== "ignore";
    var longBand = !spell && b.long > b.normal && dist > b.normal && dist <= b.long && !b.clearLong;
    var hostile = opts.hostileFeet;
    var hostileN = hostile != null && hostile !== "" && isFinite(Number(hostile)) ? Number(hostile) : null;
    var closeBand = !spell && b.close > 0 && hostileN != null && hostileN <= b.close;
    var spellWarn = spell && hostileN != null && hostileN <= 5 && !b.self;
    var disadvantage = !blocked && (longBand || closeBand || spellWarn || override === "force");
    if (override === "ignore" || override === "adv") disadvantage = false;
    var advantage = !blocked && override === "adv";
    var notes = [];
    if (disadvantage && longBand) notes.push("DIS: long range (" + dist + " ft)");
    if (disadvantage && closeBand) notes.push("DIS: close quarters (" + Math.round(hostileN) + " ft)");
    if (disadvantage && spellWarn) notes.push("DIS: hostile within 5 ft");
    if (disadvantage && override === "force" && !notes.length) notes.push("DIS: DM forced disadvantage");
    if (advantage) notes.push("ADV: DM forced advantage");
    var button = "";
    if (blocked) button = spell ? "out of range" : "Out of range";
    else if (longBand && disadvantage) button = "DIS · long range";
    else if (closeBand && disadvantage) button = "DIS · close quarters";
    else if (spellWarn && disadvantage) button = "DIS · hostile within 5 ft";
    else if (override === "force" && disadvantage) button = "DIS · forced";
    else if (advantage) button = "ADV · forced";
    var band = blocked ? "blocked" : (longBand ? "long" : (closeBand ? "close" : (spellWarn ? "warn" : "normal")));
    return {
      apply: true,
      blocked: blocked,
      disadvantage: disadvantage,
      advantage: advantage,
      band: band,
      feet: dist,
      note: notes.join(" · "),
      button: button,
      spell: spell,
      override: override,
      log: override === "ignore" ? "DM override: range ignored" : (override === "force" ? "DM override: disadvantage forced" : (override === "adv" ? "DM override: advantage forced" : ""))
    };
  }

  /* 0.3.68: one DM range override for the whole DM page (map drawer + DMCC Fight tab), kept for the
     browser session. Players never set it; the map passes "auto" for them. */
  var OVERRIDES = { auto: 1, ignore: 1, force: 1, adv: 1 };
  var OVERRIDE_KEY = "ssdns.dm.rangeOverride";
  var overrideNow = "auto";
  try {
    var stored = root.sessionStorage && root.sessionStorage.getItem(OVERRIDE_KEY);
    if (stored && OVERRIDES[stored]) overrideNow = stored;
  } catch (e) {}
  var overrideFns = [];
  function getOverride() { return overrideNow; }
  function setOverride(v) {
    var next = OVERRIDES[v] ? v : "auto";
    if (next === overrideNow) return overrideNow;
    overrideNow = next;
    try { if (root.sessionStorage) root.sessionStorage.setItem(OVERRIDE_KEY, next); } catch (e) {}
    overrideFns.slice().forEach(function (fn) { try { fn(next); } catch (e) {} });
    return overrideNow;
  }
  function onOverride(fn) {
    if (typeof fn !== "function") return function () {};
    overrideFns.push(fn);
    return function () { overrideFns = overrideFns.filter(function (f) { return f !== fn; }); };
  }
  /** Roll mode after a range verdict: forced advantage turns a straight roll into "adv" and cancels a "dis" pick. */
  function modeWith(chosen, verdict) {
    if (!verdict || !verdict.apply || verdict.blocked || !verdict.advantage) return chosen || "";
    return chosen === "dis" ? "" : "adv";
  }

  root.SSDNSRangeRings = {
    bands: bands, rings: rings, resolve: resolve, arm: arm, peek: peek, peekFor: peekFor, take: take, clear: clearArm,
    confirmDisadvantage: confirmDisadvantage, confirmText: CONFIRM_TEXT,
    getOverride: getOverride, setOverride: setOverride, onOverride: onOverride, modeWith: modeWith
  };
})(typeof window !== "undefined" ? window : globalThis);

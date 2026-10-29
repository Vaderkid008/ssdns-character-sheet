/* N61 — same taps, different graphics.
   Tap a charged slot token, pick a prepared spell of that level, cast.
   Cantrips are an always-ready chip on the focus (no slot token).
   Only Hexslinger casts from a gun. The cylinder and the N80 load/Cast gate stay on the Caster Gun.
   Soft lock from the mock. Not a beta blocker. rules.js is not touched. */
(function (root) {
  "use strict";

  var SKINS = {
    hexslinger: { id: "hex", gun: true, title: "Caster cylinder", focus: "Caster Gun", who: "Hex lead chambers on the gun are the slots. This card does not load them.", token: "", bg: "bg-hex" },
    scholar: { id: "scholar", title: "Ledger page tabs", focus: "Chemical Field Ledger", who: "Page tabs are slots. Spine pips mirror them.", token: "tab", bg: "bg-scholar" },
    "pact-seeker": { id: "pact", title: "Borrowed Iron", focus: "Borrowed Iron", who: "Focus and quick chips lead. Slots ride a thin sigil rail, not shells.", token: "sigil", bg: "bg-pact", quick: true },
    lawman: { id: "law", title: "Badges", focus: "Lawman's Star", who: "Tin stars pinned to the vest. Each badge is a slot.", token: "badge", bg: "bg-law" },
    "frontier-preacher": { id: "preach", title: "Bibles", focus: "Saddle Bible", who: "Pocket scripture. Each little bible is a slot.", token: "bible", bg: "bg-preach" },
    "nature-guide": { id: "nature", title: "Shrubbery / vines", focus: "Trail Staff", who: "Living sprigs on a trail staff. Each vine is a slot.", token: "vine", bg: "bg-nature" },
    "frontier-scout": { id: "scout", title: "Crosshairs", focus: "Spyglass", who: "Spotter's marks. Each crosshair is a slot.", token: "cross", bg: "bg-scout" },
    storyteller: { id: "story", title: "Music notes", focus: "Fiddle & Tales", who: "Verses on the staff. Each note is a slot.", token: "note", bg: "bg-story" },
    "martial-artist": { id: "martial", title: "Fists", focus: "Hand Wraps", who: "Wrapped knuckles. Each fist is a slot.", token: "fist", bg: "bg-martial" },
    foe: { id: "foe", title: "Spell slots", focus: "Focus", who: "Charged tokens open the spells of that level.", token: "sigil", bg: "bg-pact" }
  };
  var ICONS = {
    badge: '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 2l3.6 6.2h7.2l-3.6 6.2 3.6 6.2h-7.2L16 27l-3.6-6.4H5.2l3.6-6.2L5.2 8.2h7.2z"/></svg>',
    bible: '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M7 4h16a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H7V4z"/><path fill="#1b1f25" d="M15 8h2v5h5v2h-5v7h-2v-7H10v-2h5z"/></svg>',
    vine: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M8 28C12 18 14 12 24 4" stroke="currentColor" stroke-width="2.2" fill="none"/><path fill="currentColor" d="M14 18c-6 1-8-4-7-7 4 1 7 3 7 7zm2-6c1-6 6-8 9-7-1 4-4 7-9 7zM18 18c5-2 8 0 8 3-4 1-7 1-8-3z"/></svg>',
    cross: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 3v7M16 22v7M3 16h7M22 16h7" stroke="currentColor" stroke-width="2.2"/></svg>',
    note: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="11" cy="23" rx="5" ry="3.6" transform="rotate(-18 11 23)" fill="currentColor"/><path fill="currentColor" d="M15 6h2.4v16h-2.4z"/><path fill="currentColor" d="M17.2 6c5 1 8 4 7 9-1-3-3-4-7-4z"/></svg>',
    fist: '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M8 8h4v8H8zm5-2h4v10h-4zm5 1h4v9h-4zm5 2h3.5v7H23zM8 14h18v5c0 5-3 8-8 8h-2c-5 0-8-3-8-7z"/></svg>',
    sigil: '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 4l10 12-10 12L6 16z"/></svg>'
  };

  function skinFor(calling) {
    return SKINS[String(calling || "")] || null;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hidesLineCast(calling) {
    var skin = skinFor(calling);
    return !!(skin && !skin.gun);
  }
  function icon(token) {
    return ICONS[token] || ICONS.sigil;
  }
  function tokenButton(token, level, index, spent, open) {
    var cls = "n61-tok" + (spent ? " spent" : "") + (!spent && open ? " sel" : "");
    var label = "Level " + level + " slot " + (index + 1) + (spent ? ", spent" : ", charged");
    return '<button type="button" class="' + cls + '" data-skin-token="' + level + ":" + index + '"' +
      (spent ? ' disabled' : "") + ' aria-label="' + esc(label) + '">' + icon(token) + "</button>";
  }
  function popHtml(level, spells, castAttr, show) {
    var rows = (spells || []).map(function (sp) {
      var extra = "";
      if (castAttr) extra = castAttr(sp);
      else extra = 'data-cast="' + esc(sp.cast || (level + ":" + sp.name)) + '"';
      return '<button type="button" class="n61-spell" data-skin-pick ' + extra + ">" + esc(sp.name) + "</button>";
    }).join("");
    if (!rows) rows = '<p class="n61-empty">No prepared spell at this level.</p>';
    return '<div class="n61-pop" data-skin-pop="' + level + '"' + (show ? "" : " hidden") + '><h4>Level ' + level +
      '</h4>' + rows + '<button type="button" class="n61-go" data-skin-go>Cast</button></div>';
  }
  /**
   * model: { calling, cantrips:[{name,cast}], levels:[{level,total,spent,spells:[{name,cast,n}]}], quick:[{name,cast,first}] }
   * open: "level:index" or ""
   */
  function html(model, open) {
    model = model || {};
    var skin = skinFor(model.calling);
    if (!skin) return "";
    open = open || "";
    var openLevel = open ? String(open).split(":")[0] : "";
    var cantrips = (model.cantrips || []).map(function (sp) {
      var attr = model.castAttr ? model.castAttr(sp) : ('data-spell-cast="' + esc(sp.cast || ("0:" + sp.name)) + '"');
      return '<button type="button" class="n61-chip" ' + attr + ">Cantrip <i>" + esc(sp.name) + "</i></button>";
    }).join("");
    var body = "";
    if (skin.gun) {
      body = '<div class="n61-cyl" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
        '<p class="n61-gunnote">Load a hex lead on the Caster Gun, then Cast. Cantrips dry-fire. The cylinder is the only gun in this system.</p>' +
        (cantrips ? '<div class="n61-chips">' + cantrips + "</div>" : "");
    } else {
      var levels = (model.levels || []).filter(function (row) { return row && row.total > 0; });
      var rails = levels.map(function (row) {
        var toks = "";
        var i;
        for (i = 0; i < row.total; i++) toks += tokenButton(skin.token, row.level, i, i < (row.spent || 0), open === (row.level + ":" + i));
        var pop = popHtml(row.level, row.spells, model.castAttr, openLevel === String(row.level));
        return '<div class="n61-lvl"><b>L' + row.level + "</b><div class=\"n61-row\">" + toks + "</div>" + pop + "</div>";
      }).join("");
      var quick = "";
      if (skin.quick && model.quick && model.quick.length) {
        quick = '<div class="n61-quick">' + model.quick.map(function (q) {
          var cls = "n61-qc" + (q.first ? " first" : "");
          var attr = q.pact ? ' id="n61PactShot" data-spell-cast="' + esc(q.cast) + '"' : ' data-spell-cast="' + esc(q.cast) + '"';
          return '<button type="button" class="' + cls + '"' + attr + ">" + esc(q.name) + "</button>";
        }).join("") + "</div>";
      }
      body = '<div class="n61-focus"><div>' + esc(skin.focus) + "<small>focus</small></div>" +
        (cantrips ? '<div class="n61-chips">' + cantrips + "</div>" : '<span class="n61-chip dry">Cantrip <i>always ready</i></span>') +
        "</div>" + (rails ? '<div class="n61-slots">' + rails + "</div>" : "") + quick;
    }
    return '<section class="n61-card ' + skin.bg + (skin.gun ? " gun" : "") + '" data-calling="' + esc(model.calling) + '">' +
      '<div class="n61-tag">' + esc(model.calling) + "</div><h2>" + esc(skin.title) + "</h2>" +
      '<p class="n61-who">' + esc(skin.who) + "</p>" + body +
      '<p class="n61-cap">Tap a charged token, pick the spell, cast. Cantrips spend no token.</p></section>';
  }

  function enemyHtml(model) {
    model = model || {};
    var calling = model.calling && skinFor(model.calling) ? model.calling : "";
    var spells = model.spells || [];
    if (!spells.length && !model.slots) return "";
    var byLevel = {};
    spells.forEach(function (sp) {
      var lv = parseInt(sp.level, 10) || 0;
      if (lv <= 0) return;
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(sp);
    });
    var levels = [];
    var slots = model.slots || {};
    Object.keys(slots).forEach(function (lv) {
      var slot = slots[lv] || {};
      var total = parseInt(slot.max, 10) || 0;
      var left = slot.left == null ? total : parseInt(slot.left, 10) || 0;
      if (total > 0) levels.push({ level: parseInt(lv, 10), total: total, spent: Math.max(0, total - left), spells: byLevel[lv] || [] });
    });
    if (!levels.length) {
      Object.keys(byLevel).sort().forEach(function (lv) {
        levels.push({ level: parseInt(lv, 10), total: byLevel[lv].length, spent: 0, spells: byLevel[lv] });
      });
    }
    var cantrips = spells.filter(function (sp) { return !parseInt(sp.level, 10); }).map(function (sp) {
      return { name: sp.name, cast: "0:" + sp.name, n: sp.n, level: 0 };
    });
    if (!calling) calling = "foe";
    return '<div class="n61" data-cast-skin data-open="">' + html({
      calling: calling,
      cantrips: cantrips,
      levels: levels,
      castAttr: function (sp) {
        if (sp.n == null) return 'data-spell-cast="' + esc(sp.cast || "") + '"';
        if (!parseInt(sp.level, 10)) return 'data-sheet-cast="1" data-n="' + esc(sp.n) + '"';
        return 'data-sheet="1" data-n="' + esc(sp.n) + '"';
      }
    }, "") + "</div>";
  }

  var openKey = "";
  function sheetModel() {
    var app = root.SSDNSApp;
    if (!app || !app.doc) return null;
    var doc = app.doc();
    var c = doc && doc.character;
    if (!c || !skinFor(c.calling)) return null;
    if (app.casterInfo && !app.casterInfo()) return null;
    var prepared = { "frontier-preacher": 1, "nature-guide": 1, "lawman": 1, "scholar": 1 };
    var prep = !!prepared[c.calling];
    var bookKey = c.calling === "lawman" && c.lawlessSpells && c.lawlessSpells.seeded ? "lawlessSpells" : "spells";
    var book = c[bookKey] || {};
    var cantrips = [];
    (c.cantrips || []).forEach(function (n) { if (n) cantrips.push({ name: n, cast: "0:" + n }); });
    var levels = [];
    var lv;
    for (lv = 1; lv <= 9; lv++) {
      var boxes = app.compute ? (app.compute().hex || {}) : {};
      var n = boxes[lv] || 0;
      if (c.overrides && c.overrides["hex." + lv] !== undefined && c.overrides["hex." + lv] !== "") n = parseInt(c.overrides["hex." + lv], 10) || 0;
      var spent = 0;
      var marks = (c.hexLead && c.hexLead[lv]) || [];
      var i;
      for (i = 0; i < n; i++) if (marks[i]) spent++;
      var spells = [];
      ((book && book[lv]) || []).forEach(function (sp) {
        if (!sp || !sp.name) return;
        if (prep && !sp.prepared) return;
        spells.push({ name: sp.name, cast: lv + ":" + sp.name });
      });
      if (n > 0 || spells.length) levels.push({ level: lv, total: n, spent: spent, spells: spells });
    }
    var quick = [];
    var PS = root.SSDNSPactShot;
    if (c.calling === "pact-seeker" && PS && PS.quickSpells) {
      PS.quickSpells(c).forEach(function (q) {
        quick.push({ name: q.name, cast: q.value, first: !!q.pact, pact: !!q.pact });
      });
    }
    return { calling: c.calling, cantrips: cantrips, levels: levels, quick: quick };
  }
  function paintSheet() {
    var host = root.document && root.document.getElementById("castSkin");
    if (!host) return;
    var model = sheetModel();
    if (!model) {
      host.hidden = true;
      host.innerHTML = "";
      if (root.document.body) root.document.body.classList.remove("n61-picker", "n61-gun");
      return;
    }
    host.hidden = false;
    var skin = skinFor(model.calling);
    host.innerHTML = html(model, openKey);
    host.setAttribute("data-open", openKey);
    if (root.document.body) {
      root.document.body.classList.toggle("n61-picker", !skin.gun);
      root.document.body.classList.toggle("n61-gun", !!skin.gun);
    }
  }
  function toggleHost(host, id) {
    var next = host.getAttribute("data-open") === id ? "" : id;
    var lv = next ? String(next).split(":")[0] : "";
    host.setAttribute("data-open", next);
    host.querySelectorAll("[data-skin-pop]").forEach(function (pop) {
      pop.hidden = !lv || pop.getAttribute("data-skin-pop") !== lv;
    });
    host.querySelectorAll("[data-skin-token]").forEach(function (btn) {
      btn.classList.toggle("sel", !!next && btn.getAttribute("data-skin-token") === next);
    });
  }
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var pick = t.closest("[data-skin-pick]");
    if (pick) {
      e.preventDefault();
      e.stopPropagation();
      var pop = pick.closest(".n61-pop");
      if (!pop) return;
      pop.querySelectorAll(".n61-spell").forEach(function (btn) { btn.classList.toggle("hot", btn === pick); });
      return;
    }
    var go = t.closest("[data-skin-go]");
    if (go) {
      var box = go.closest(".n61-pop");
      var hot = box && (box.querySelector(".n61-spell.hot") || box.querySelector(".n61-spell"));
      if (!hot) { e.preventDefault(); e.stopPropagation(); return; }
      if (hot.hasAttribute("data-sheet")) {
        go.setAttribute("data-sheet-cast", "1");
        go.setAttribute("data-n", hot.getAttribute("data-n") || "");
      } else if (hot.getAttribute("data-cast")) {
        go.setAttribute("data-spell-cast", hot.getAttribute("data-cast"));
      }
      return;
    }
    var tok = t.closest("[data-skin-token]");
    if (!tok) return;
    var host = tok.closest("[data-cast-skin]");
    if (!host || tok.disabled) return;
    e.preventDefault();
    var id = tok.getAttribute("data-skin-token") || "";
    if (host.id === "castSkin") {
      openKey = openKey === id ? "" : id;
      paintSheet();
      return;
    }
    toggleHost(host, id);
  }
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener("click", onClick, true);
  }

  root.SSDNSCastSkins = {
    SKINS: SKINS,
    skinFor: skinFor,
    hidesLineCast: hidesLineCast,
    html: html,
    enemyHtml: enemyHtml,
    sheetModel: sheetModel,
    paintSheet: paintSheet
  };
})(typeof window !== "undefined" ? window : globalThis);

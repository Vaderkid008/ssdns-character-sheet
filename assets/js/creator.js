/**
 * Guided new-character creator. Steps read PHB data already on the sheet.
 * It applies onto a blank character and stays closed for a loaded one.
 */
(function (root) {
  "use strict";

  var AB = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  var STANDARD = [15, 14, 13, 12, 10, 8];
  var POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  var PREPARED = { "frontier-preacher": 1, "nature-guide": 1, "lawman": 1, "scholar": 1 };

  function rules() { return root.SSDNS_RULES || {}; }
  function $(s, r) { return (r || root.document).querySelector(s); }
  function mod(score) { return Math.floor(((Number(score) || 10) - 10) / 2); }
  function sign(n) { n = Number(n) || 0; return (n >= 0 ? "+" : "") + n; }
  function dieMax(hd) {
    var m = String(hd || "").match(/d(\d+)/i);
    return m ? parseInt(m[1], 10) : 8;
  }
  function callingById(id) {
    return (rules().callings || []).filter(function (c) { return c.id === id; })[0] || null;
  }
  function lineageById(id) {
    return (rules().lineages || []).filter(function (c) { return c.id === id; })[0] || null;
  }
  function backgroundById(id) {
    return (rules().backgrounds || []).filter(function (c) { return c.id === id; })[0] || null;
  }
  function primaryAbilities(cal) {
    var map = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" };
    var out = [];
    String((cal && cal.primary) || "").toLowerCase().split(/[^a-z]+/).forEach(function (w) {
      if (map[w] && out.indexOf(map[w]) < 0) out.push(map[w]);
    });
    return out.length ? out : ["STR"];
  }
  function abilityModName(cal) {
    var ab = String((cal && cal.spellAbility) || "").toUpperCase();
    if (AB.indexOf(ab) >= 0) return ab;
    return primaryAbilities(cal)[0];
  }
  function levelRow(cal) {
    var rows = cal && cal.progression && cal.progression.rows;
    var cols = cal && cal.progression && cal.progression.columns;
    if (!rows || !cols || !rows.length) return { cantrips: 0, known: 0, slots: 0 };
    var row = rows[0];
    var out = { cantrips: 0, known: 0, slots: 0 };
    cols.forEach(function (col, i) {
      var name = String(col || "").toLowerCase();
      var v = String(row[i] == null ? "" : row[i]).trim();
      if (!v || v === "—" || v === "-") return;
      var n = parseInt(v, 10);
      if (!isFinite(n)) return;
      if (name.indexOf("cantrip") === 0) out.cantrips = n;
      if (name.indexOf("spells known") === 0) out.known = n;
      if (name.indexOf("slots") === 0 && out.slots === 0) out.slots = n;
    });
    return out;
  }
  function casterAtFirst(cal) {
    if (!cal || !cal.caster) return false;
    if (cal.caster === "half") return false;
    var lim = levelRow(cal);
    return !!(lim.cantrips || lim.known || lim.slots);
  }
  function preparedMax(cal, scores) {
    if (!cal || !PREPARED[cal.id]) return 0;
    var ab = abilityModName(cal);
    return Math.max(1, mod(scores[ab]) + 1);
  }
  function spellEntries(callingId, level) {
    var list = (rules().spellLists || {})[callingId];
    var rows = list && list.levels && list.levels[String(level)];
    return (rows || []).map(function (raw) { return String(raw || "").trim(); }).filter(Boolean);
  }
  function focusFor(callingId) {
    var list = (rules().spellLists || {})[callingId];
    var blurb = (list && list.blurb) || "";
    if (callingId === "hexslinger") return { kind: "caster-gun", text: "Caster Gun. " + blurb };
    if (callingId === "pact-seeker") return { kind: "borrowed-iron", text: "Borrowed Iron. " + blurb };
    if (blurb) return { kind: "focus", text: blurb };
    return { kind: "none", text: "" };
  }
  function spellPageCopy(callingId, subclassName) {
    var cal = callingById(callingId);
    var focus = focusFor(callingId);
    var empty = "";
    if (!cal || !cal.caster) {
      var breath = subclassName && /tong hatchet|kung fu/i.test(subclassName);
      empty = breath
        ? "Breath Coins. " + subclassName + " casts with Breath Coins, not spell slots. Track those with your DM."
        : "No spell slots. This Calling doesn't use a spellbook.";
    }
    return {
      art: callingId === "hexslinger",
      gunSelect: callingId === "hexslinger",
      focus: focus.kind,
      blurb: focus.text,
      empty: empty
    };
  }
  function pointCost(scores) {
    return AB.reduce(function (sum, ab) {
      var n = Number(scores[ab]);
      return sum + (POINT_COST[n] == null ? 99 : POINT_COST[n]);
    }, 0);
  }
  function assignStandard(cal) {
    var scores = {};
    var pool = STANDARD.slice();
    primaryAbilities(cal).forEach(function (ab) {
      if (!pool.length) return;
      scores[ab] = pool.shift();
    });
    AB.forEach(function (ab) {
      if (scores[ab] == null) scores[ab] = pool.shift();
    });
    return scores;
  }
  function kitPick(callingId) {
    var kits = root.SSDNSKits;
    var branches = kits && kits.branches ? kits.branches(callingId) : [{}];
    return (branches && branches[0]) || {};
  }
  function emptyCharacter() {
    var kits = root.SSDNSKits;
    var c = kits && kits.blankCharacter ? kits.blankCharacter() : {
      guns: [], melee: [], ammo: [], equipment: "", armor: "", casterGun: ""
    };
    c.name = c.name || "";
    c.player = c.player || "";
    c.lineage = "";
    c.sublineage = "";
    c.calling = "";
    c.level = 1;
    c.subclass = "";
    c.background = "";
    c.abilities = { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 };
    c.saveProf = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false };
    c.skillProf = {};
    c.speed = "";
    c.speedAuto = true;
    c.hpAuto = true;
    c.hpMax = "";
    c.hpCurrent = "";
    c.hpTemp = "";
    c.cantrips = [];
    c.spells = {};
    for (var i = 1; i <= 9; i++) c.spells[i] = [];
    c.proficienciesLanguages = c.proficienciesLanguages || "";
    c.features = c.features || "";
    c.wizardDone = false;
    c.activeConditions = [];
    return c;
  }
  function armorClass(c) {
    var dex = mod(c.abilities.DEX);
    var arm = (rules().armor || []).filter(function (a) { return a.id === c.armor; })[0];
    var shield = c.shield ? 2 : 0;
    if (!arm) return 10 + dex + shield;
    var add = dex;
    if (arm.dexCap === 0) add = 0;
    else if (arm.dexCap != null && isFinite(Number(arm.dexCap))) add = Math.min(Math.max(0, dex), Number(arm.dexCap));
    else add = Math.max(0, dex);
    return (Number(arm.base) || 10) + add + shield;
  }
  function stepsFor(draft) {
    var cal = callingById(draft.calling);
    var steps = ["name", "lineage", "calling", "abilities", "background", "kit"];
    if (casterAtFirst(cal)) steps.push("spells");
    steps.push("vitals", "review");
    return steps;
  }
  function blankDraft() {
    var lin = (rules().lineages || [])[0] || {};
    var cal = (rules().callings || [])[0] || {};
    var bg = (rules().backgrounds || [])[0] || {};
    return {
      name: "",
      player: "",
      lineage: "",
      sublineage: "",
      calling: "",
      method: "standard",
      scores: assignStandard(cal),
      background: "",
      skills: [],
      kit: {},
      cantrips: [],
      spells: [],
      _linDefault: lin.id || "",
      _calDefault: cal.id || "",
      _bgDefault: bg.id || ""
    };
  }
  function skillList(bg) {
    return (bg && bg.skillList) || [];
  }
  function errorsFor(draft, step) {
    var errs = [];
    var cal = callingById(draft.calling);
    var bg = backgroundById(draft.background);
    if (step === "name" || step === "review") {
      if (!String(draft.name || "").trim()) errs.push("Enter a character name.");
    }
    if (step === "lineage" || step === "review") {
      if (!lineageById(draft.lineage)) errs.push("Pick a lineage.");
    }
    if (step === "calling" || step === "review") {
      if (!cal) errs.push("Pick a calling.");
    }
    if (step === "abilities" || step === "review") {
      var scores = draft.scores || {};
      AB.forEach(function (ab) {
        var n = Number(scores[ab]);
        if (!isFinite(n) || n < 3 || n > 18) errs.push(ab + " needs a score from 3 to 18.");
      });
      if (draft.method === "standard") {
        var got = AB.map(function (ab) { return Number(scores[ab]); }).sort(function (a, b) { return a - b; });
        var want = STANDARD.slice().sort(function (a, b) { return a - b; });
        if (got.join() !== want.join()) errs.push("Standard array uses 15, 14, 13, 12, 10, and 8, each once.");
      }
      if (draft.method === "point") {
        var cost = pointCost(scores);
        if (cost !== 27) errs.push("Point buy spends 27. This set spends " + cost + ".");
      }
    }
    if (step === "background" || step === "review") {
      if (!bg) errs.push("Pick a background.");
      else {
        var need = skillList(bg);
        var have = draft.skills || [];
        if (have.length !== need.length) errs.push("Pick " + need.length + " background skills.");
        need.forEach(function (sk) {
          if (have.indexOf(sk) < 0) errs.push("Include " + sk + ".");
        });
      }
    }
    if (step === "kit" || step === "review") {
      var kits = root.SSDNSKits;
      var open = kits && kits.openChoices ? kits.openChoices(draft.calling, draft.kit || {}) : [];
      if (open.length) errs.push("Finish the starting kit choices.");
    }
    if ((step === "spells" || step === "review") && casterAtFirst(cal)) {
      var lim = levelRow(cal);
      if ((draft.cantrips || []).length !== lim.cantrips) errs.push("Pick " + lim.cantrips + " cantrips.");
      if (PREPARED[cal.id]) {
        var cap = preparedMax(cal, draft.scores || {});
        if ((draft.spells || []).length !== cap) errs.push("Prepare " + cap + " spells.");
      } else if ((draft.spells || []).length !== lim.known) {
        errs.push("Pick " + lim.known + " spells.");
      }
    }
    return errs;
  }
  function applyDraft(c, draft) {
    var cal = callingById(draft.calling);
    var lin = lineageById(draft.lineage);
    var sub = lin && (lin.sublineages || []).filter(function (s) { return s.id === draft.sublineage; })[0];
    var bg = backgroundById(draft.background);
    c.name = String(draft.name || "").trim();
    c.player = String(draft.player || "").trim();
    c.lineage = lin ? lin.id : "";
    c.sublineage = sub ? sub.id : "";
    c.calling = cal ? cal.id : "";
    c.level = 1;
    c.background = bg ? bg.id : "";
    c.abilities = {};
    AB.forEach(function (ab) { c.abilities[ab] = Number(draft.scores[ab]) || 10; });
    c.saveProf = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false };
    (cal && cal.saves || []).forEach(function (ab) { c.saveProf[ab] = true; });
    c.skillProf = {};
    (draft.skills || []).forEach(function (sk) { c.skillProf[sk] = 1; });
    c.speedAuto = true;
    c.speed = (sub && sub.speed) || (lin && lin.speed) || 30;
    if (root.SSDNSKits && root.SSDNSKits.apply) root.SSDNSKits.apply(c, c.calling, draft.kit || {});
    var focus = focusFor(c.calling);
    if (focus.kind === "borrowed-iron") c.casterGun = "borrowed-iron";
    else if (focus.kind !== "caster-gun") c.casterGun = "";
    c.cantrips = (draft.cantrips || []).slice();
    for (var lv = 1; lv <= 9; lv++) c.spells[lv] = [];
    var prepared = !!PREPARED[c.calling];
    (draft.spells || []).forEach(function (name) {
      if (!c.spells[1]) c.spells[1] = [];
      c.spells[1].push({ name: name, prepared: prepared || true });
    });
    var sides = dieMax(cal && cal.hitDie);
    var hp = Math.max(1, sides + mod(c.abilities.CON));
    c.hpAuto = true;
    c.hpMax = hp;
    c.hpCurrent = hp;
    c.hitDiceLeft = "1d" + sides;
    var prof = [];
    if (cal && cal.armorProf) prof.push("Armor (" + cal.name + "): " + cal.armorProf);
    if (cal && cal.weaponProf) prof.push("Weapons (" + cal.name + "): " + cal.weaponProf);
    if (lin && lin.languages) prof.push(lin.languages);
    c.proficienciesLanguages = prof.join("\n");
    if (bg && bg.feature && bg.feature.name) {
      c.features = bg.feature.name + ": " + (bg.feature.text || "");
    }
    c.wizardDone = true;
    c._preview = {
      ac: armorClass(c),
      init: mod(c.abilities.DEX),
      speed: c.speed,
      hp: hp,
      focus: focus.text
    };
    return c;
  }
  function buildSheet(spec) {
    spec = spec || {};
    var draft = blankDraft();
    var cal = callingById(spec.calling) || (rules().callings || [])[0];
    var lin = lineageById(spec.lineage) || (rules().lineages || [])[0];
    var bg = backgroundById(spec.background) || (rules().backgrounds || [])[0];
    draft.name = spec.name || ("Tester " + (cal ? cal.name : ""));
    draft.player = spec.player || "Tester";
    draft.lineage = lin.id;
    draft.sublineage = spec.sublineage || ((lin.sublineages || [])[0] && lin.sublineages[0].id) || "";
    draft.calling = cal.id;
    draft.method = spec.method || "standard";
    draft.scores = spec.scores || assignStandard(cal);
    draft.background = bg.id;
    draft.skills = (spec.skills || skillList(bg)).slice();
    draft.kit = spec.kit || kitPick(cal.id);
    var lim = levelRow(cal);
    if (casterAtFirst(cal)) {
      draft.cantrips = (spec.cantrips || spellEntries(cal.id, 0).slice(0, lim.cantrips)).slice();
      var spellCount = PREPARED[cal.id] ? preparedMax(cal, draft.scores) : lim.known;
      draft.spells = (spec.spells || spellEntries(cal.id, 1).slice(0, spellCount)).slice();
    }
    var problems = [];
    stepsFor(draft).forEach(function (step) {
      errorsFor(draft, step).forEach(function (err) {
        if (problems.indexOf(err) < 0) problems.push(err);
      });
    });
    var character = emptyCharacter();
    applyDraft(character, draft);
    return { draft: draft, character: character, errors: problems, ok: problems.length === 0 };
  }

  var ui = { open: false, step: 0, draft: null, cancelled: false };

  function isExisting(doc) {
    var c = doc && doc.character;
    if (!c) return false;
    if (c.wizardDone) return true;
    return !!(c.name || c.calling || c.lineage || c.background);
  }
  function setModal(on) {
    if (!root.document || !root.document.body) return;
    root.document.body.classList.toggle("wizard-open", !!on);
    var sheet = $("#sheet");
    if (sheet) {
      if (on) sheet.setAttribute("inert", "");
      else sheet.removeAttribute("inert");
    }
  }
  function el(tag, attrs, kids) {
    var node = root.document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "class") node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (kid) { if (kid) node.appendChild(kid); });
    return node;
  }
  function field(label, node) {
    var wrap = el("label", { class: "wiz-field" });
    wrap.appendChild(el("span", { text: label }));
    wrap.appendChild(node);
    return wrap;
  }
  function option(value, text, selected) {
    var o = el("option", { value: value, text: text });
    if (selected) o.selected = true;
    return o;
  }
  function renderStep(body, draft, step) {
    body.innerHTML = "";
    var cal = callingById(draft.calling);
    if (step === "name") {
      body.appendChild(el("h2", { text: "Name" }));
      var name = el("input", { id: "wizName", value: draft.name || "" });
      var player = el("input", { id: "wizPlayer", value: draft.player || "" });
      name.addEventListener("input", function () { draft.name = name.value; });
      player.addEventListener("input", function () { draft.player = player.value; });
      body.appendChild(field("Character name", name));
      body.appendChild(field("Player name", player));
    } else if (step === "lineage") {
      body.appendChild(el("h2", { text: "Lineage" }));
      var sel = el("select", { id: "wizLineage" });
      sel.appendChild(option("", "Choose…", !draft.lineage));
      (rules().lineages || []).forEach(function (lin) {
        sel.appendChild(option(lin.id, lin.name, lin.id === draft.lineage));
      });
      var sub = el("select", { id: "wizSub" });
      function fillSub() {
        sub.innerHTML = "";
        var lin = lineageById(draft.lineage);
        sub.appendChild(option("", "No sublineage", !draft.sublineage));
        ((lin && lin.sublineages) || []).forEach(function (s) {
          sub.appendChild(option(s.id, s.name, s.id === draft.sublineage));
        });
      }
      sel.addEventListener("change", function () { draft.lineage = sel.value; draft.sublineage = ""; fillSub(); renderStep(body, draft, step); });
      sub.addEventListener("change", function () { draft.sublineage = sub.value; renderStep(body, draft, step); });
      fillSub();
      body.appendChild(field("Lineage", sel));
      body.appendChild(field("Sublineage", sub));
      var lin = lineageById(draft.lineage);
      var picked = lin && (lin.sublineages || []).filter(function (s) { return s.id === draft.sublineage; })[0];
      if (lin) {
        var traits = (lin.traits || []).map(function (t) { return t.name; }).join(", ");
        body.appendChild(el("p", { text: (lin.asi || "") + " Speed " + (picked && picked.speed || lin.speed || 30) + " ft. " + (lin.size || "") }));
        if (traits) body.appendChild(el("p", { class: "fine", text: traits }));
      }
    } else if (step === "calling") {
      body.appendChild(el("h2", { text: "Calling" }));
      var csel = el("select", { id: "wizCalling" });
      csel.appendChild(option("", "Choose…", !draft.calling));
      (rules().callings || []).forEach(function (row) {
        csel.appendChild(option(row.id, row.name, row.id === draft.calling));
      });
      csel.addEventListener("change", function () {
        draft.calling = csel.value;
        draft.scores = assignStandard(callingById(draft.calling) || {});
        draft.kit = {};
        draft.cantrips = [];
        draft.spells = [];
        renderStep(body, draft, step);
      });
      body.appendChild(field("Calling", csel));
      if (cal) {
        body.appendChild(el("p", { text: "Hit die " + cal.hitDie + ". Saves " + (cal.saves || []).join(", ") + ". Key ability " + (cal.primary || "—") + "." }));
        if (cal.armorProf) body.appendChild(el("p", { class: "fine", text: "Armor: " + cal.armorProf }));
        if (cal.weaponProf) body.appendChild(el("p", { class: "fine", text: "Weapons: " + cal.weaponProf }));
        if (cal.class5e) body.appendChild(el("p", { class: "fine", text: "PHB class: " + cal.class5e + (cal.src ? " · " + cal.src : "") }));
        else if (cal.src) body.appendChild(el("p", { class: "fine", text: cal.src }));
        var feat = (cal.features || [])[0];
        if (feat) body.appendChild(el("p", { text: feat.name + " — " + feat.text }));
      }
    } else if (step === "abilities") {
      body.appendChild(el("h2", { text: "Ability scores" }));
      var method = el("select", { id: "wizMethod" });
      [["standard", "Standard array"], ["point", "Point buy"], ["roll", "Roll 4d6 drop lowest"]].forEach(function (pair) {
        method.appendChild(option(pair[0], pair[1], draft.method === pair[0]));
      });
      method.addEventListener("change", function () {
        draft.method = method.value;
        if (draft.method === "standard" || draft.method === "point") draft.scores = assignStandard(cal || {});
        renderStep(body, draft, step);
      });
      body.appendChild(field("Method", method));
      if (cal) body.appendChild(el("p", { text: "Key ability for " + cal.name + ": " + (cal.primary || "—") + "." }));
      if (draft.method === "roll") {
        var rollBtn = el("button", { type: "button", class: "btn", text: "Roll six scores" });
        rollBtn.addEventListener("click", function () {
          var rolled = [];
          for (var n = 0; n < 6; n++) {
            var dice = [0, 0, 0, 0].map(function () { return 1 + Math.floor(Math.random() * 6); }).sort(function (a, b) { return a - b; });
            rolled.push(dice[1] + dice[2] + dice[3]);
          }
          draft._rolled = rolled;
          renderStep(body, draft, step);
        });
        body.appendChild(rollBtn);
      }
      var pool = draft.method === "standard" ? STANDARD.slice() : null;
      AB.forEach(function (ab) {
        var input = el("input", { type: "number", min: "3", max: "18", value: String(draft.scores[ab] || 8), "data-ab": ab });
        input.addEventListener("input", function () {
          draft.scores[ab] = parseInt(input.value, 10);
          paintMods();
          var left = errorsFor(draft, "abilities");
          var err = $("#wizError");
          if (!left.length) {
            draft._showErrors = false;
            if (err) { err.hidden = true; err.textContent = ""; }
          } else if (draft._showErrors && err) {
            err.hidden = false;
            err.textContent = left[0];
          }
        });
        body.appendChild(field(ab + " " + sign(mod(draft.scores[ab])), input));
      });
      var mods = el("p", { id: "wizMods", class: "fine" });
      function paintMods() {
        mods.textContent = AB.map(function (ab) { return ab + " " + sign(mod(draft.scores[ab])); }).join(" · ")
          + (draft.method === "point" ? " · points " + pointCost(draft.scores) + "/27" : "");
        AB.forEach(function (ab) {
          var lab = body.querySelector("[data-ab='" + ab + "']");
          if (!lab || !lab.parentNode) return;
          var span = lab.parentNode.querySelector("span");
          if (span) span.textContent = ab + " " + sign(mod(draft.scores[ab]));
        });
      }
      body.appendChild(mods);
      paintMods();
      if (pool) body.appendChild(el("p", { class: "fine", text: "Assign 15, 14, 13, 12, 10, and 8 once each." }));
    } else if (step === "background") {
      body.appendChild(el("h2", { text: "Background" }));
      var bsel = el("select", { id: "wizBg" });
      bsel.appendChild(option("", "Choose…", !draft.background));
      (rules().backgrounds || []).forEach(function (row) {
        bsel.appendChild(option(row.id, row.name, row.id === draft.background));
      });
      bsel.addEventListener("change", function () {
        draft.background = bsel.value;
        draft.skills = skillList(backgroundById(draft.background)).slice();
        renderStep(body, draft, step);
      });
      body.appendChild(field("Background", bsel));
      var bg = backgroundById(draft.background);
      if (bg) {
        if (bg.feature) body.appendChild(el("p", { text: bg.feature.name + " — " + bg.feature.text }));
        body.appendChild(el("p", { class: "fine", text: "Skills: " + skillList(bg).join(", ") + ". All " + skillList(bg).length + " are part of this background." }));
        skillList(bg).forEach(function (sk) {
          var box = el("label", { class: "wiz-check" });
          var input = el("input", { type: "checkbox", "data-skill": sk });
          input.checked = (draft.skills || []).indexOf(sk) >= 0;
          input.addEventListener("change", function () {
            var set = (draft.skills || []).filter(function (x) { return x !== sk; });
            if (input.checked) set.push(sk);
            draft.skills = set;
          });
          box.appendChild(input);
          box.appendChild(root.document.createTextNode(" " + sk));
          body.appendChild(box);
        });
      }
    } else if (step === "kit") {
      body.appendChild(el("h2", { text: "Starting kit" }));
      var kits = root.SSDNSKits;
      var choices = (kits && kits.choices && kits.choices[draft.calling]) || [];
      if (!choices.length) body.appendChild(el("p", { text: "This Calling's kit has no or-choices. Next applies it." }));
      choices.forEach(function (ch) {
        if (ch.when && !ch.when(draft.kit || {})) return;
        var ksel = el("select", { "data-kit": ch.id, "aria-label": ch.prompt });
        ksel.appendChild(option("", "Choose…", !(draft.kit && draft.kit[ch.id])));
        (ch.options || []).forEach(function (op) {
          ksel.appendChild(option(op.id, op.label, draft.kit && draft.kit[op.id] === op.id || (draft.kit && draft.kit[ch.id] === op.id)));
        });
        ksel.addEventListener("change", function () {
          draft.kit = draft.kit || {};
          draft.kit[ch.id] = ksel.value;
          renderStep(body, draft, step);
        });
        body.appendChild(field(ch.prompt, ksel));
      });
    } else if (step === "spells") {
      body.appendChild(el("h2", { text: "Spells" }));
      var focus = focusFor(draft.calling);
      if (focus.text) body.appendChild(el("p", { text: focus.text }));
      var lim = levelRow(cal);
      function picks(title, level, chosen, max) {
        body.appendChild(el("p", { text: title + " (" + chosen.length + "/" + max + ")" }));
        spellEntries(draft.calling, level).forEach(function (name) {
          var box = el("label", { class: "wiz-check" });
          var input = el("input", { type: "checkbox" });
          input.checked = chosen.indexOf(name) >= 0;
          input.addEventListener("change", function () {
            var set = chosen.filter(function (x) { return x !== name; });
            if (input.checked) {
              if (set.length >= max) { input.checked = false; return; }
              set.push(name);
            }
            if (level === 0) draft.cantrips = set;
            else draft.spells = set;
            renderStep(body, draft, step);
          });
          box.appendChild(input);
          box.appendChild(root.document.createTextNode(" " + name));
          body.appendChild(box);
        });
      }
      picks("Cantrips", 0, draft.cantrips || [], lim.cantrips);
      var cap = PREPARED[draft.calling] ? preparedMax(cal, draft.scores) : lim.known;
      picks(PREPARED[draft.calling] ? "Prepared" : "Spells known", 1, draft.spells || [], cap);
    } else if (step === "vitals" || step === "review") {
      var preview = emptyCharacter();
      var copy = JSON.parse(JSON.stringify(draft));
      applyDraft(preview, copy);
      preview.wizardDone = step === "review";
      body.appendChild(el("h2", { text: step === "review" ? "Review" : "HP, AC, initiative, speed" }));
      var pv = preview._preview || {};
      var bg = backgroundById(draft.background);
      body.appendChild(el("p", { text: preview.name + (preview.player ? " · " + preview.player : "") }));
      body.appendChild(el("p", { text: (cal ? cal.name : "") + " · " + ((lineageById(draft.lineage) || {}).name || "") }));
      if (step === "review") {
        body.appendChild(el("p", { text: AB.map(function (ab) {
          return ab + " " + (draft.scores[ab] || 0) + " (" + sign(mod(draft.scores[ab])) + ")";
        }).join(" · ") }));
        body.appendChild(el("p", { text: "Background: " + ((bg && bg.name) || "—") + ". Skills: " + ((draft.skills || []).join(", ") || "—") + "." }));
        var kitBits = Object.keys(draft.kit || {}).map(function (key) {
          var choice = ((root.SSDNSKits && root.SSDNSKits.choices && root.SSDNSKits.choices[draft.calling]) || []).filter(function (ch) { return ch.id === key; })[0];
          var op = choice && (choice.options || []).filter(function (row) { return row.id === draft.kit[key]; })[0];
          return (choice ? choice.prompt : key) + ": " + (op ? op.label : draft.kit[key]);
        });
        if (kitBits.length) body.appendChild(el("p", { text: "Kit: " + kitBits.join(". ") }));
        var spells = (draft.cantrips || []).concat(draft.spells || []);
        if (spells.length) body.appendChild(el("p", { text: "Spells: " + spells.join(", ") }));
        if (pv.focus) body.appendChild(el("p", { text: pv.focus }));
      }
      body.appendChild(el("p", { text: "HP " + pv.hp + " (max hit die + CON). AC " + pv.ac + ". Initiative " + sign(pv.init) + ". Speed " + pv.speed + " ft." }));
      if (step === "review") body.appendChild(el("p", { class: "fine", text: "Finish writes this onto the sheet. Back changes any step." }));
    }
  }
  function show() {
    if (!root.document || !root.document.body) return;
    var dlg = $("#wizDialog");
    if (!dlg) {
      dlg = el("dialog", { id: "wizDialog", class: "dlg ssdns-wizard" });
      dlg.innerHTML = "<div class='wiz-body'></div><p class='wiz-err' id='wizError' hidden></p><div class='dlg-foot'><button type='button' class='btn' id='wizCancel'>Cancel</button><button type='button' class='btn' id='wizBack'>Back</button><button type='button' class='btn btn-primary' id='wizNext'>Next</button></div>";
      root.document.body.appendChild(dlg);
      $("#wizCancel").addEventListener("click", function () { close(true); });
      $("#wizBack").addEventListener("click", function () { move(-1); });
      $("#wizNext").addEventListener("click", function () { move(1); });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); close(true); });
    }
    paint();
    setModal(true);
    if (dlg.showModal && !dlg.open) dlg.showModal();
    ui.open = true;
  }
  function paint() {
    var draft = ui.draft;
    var steps = stepsFor(draft);
    if (ui.step >= steps.length) ui.step = steps.length - 1;
    if (ui.step < 0) ui.step = 0;
    var step = steps[ui.step];
    var body = $("#wizDialog .wiz-body");
    if (body) renderStep(body, draft, step);
    var back = $("#wizBack");
    var next = $("#wizNext");
    if (back) back.disabled = ui.step === 0;
    if (next) next.textContent = step === "review" ? "Finish" : "Next";
    var err = $("#wizError");
    if (err) { err.hidden = true; err.textContent = ""; }
  }
  function move(dir) {
    var steps = stepsFor(ui.draft);
    var step = steps[ui.step];
    if (dir > 0) {
      var problems = errorsFor(ui.draft, step);
      if (problems.length && step !== "vitals") {
        ui.draft._showErrors = true;
        paint();
        var err = $("#wizError");
        if (err) { err.hidden = false; err.textContent = problems[0]; }
        return;
      }
      if (step === "review") { finish(); return; }
    }
    ui.step += dir;
    paint();
  }
  function finish() {
    var steps = stepsFor(ui.draft);
    var problems = [];
    steps.forEach(function (step) {
      if (step === "vitals") return;
      errorsFor(ui.draft, step).forEach(function (err) {
        if (problems.indexOf(err) < 0) problems.push(err);
      });
    });
    if (problems.length) {
      var err = $("#wizError");
      if (err) { err.hidden = false; err.textContent = problems[0]; }
      return;
    }
    var app = root.SSDNSApp;
    if (app && app.applyPatch && app.doc && app.doc()) {
      app.applyPatch(function (doc) { applyDraft(doc.character, ui.draft); });
    }
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.syncSheet) root.SSDNSPlaytest.syncSheet();
    close(false);
    if (root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice("Character created.");
  }
  function close(cancelled) {
    ui.open = false;
    ui.cancelled = !!cancelled;
    setModal(false);
    var dlg = $("#wizDialog");
    if (dlg && dlg.close) dlg.close();
    try { sessionStorage.setItem("ssdns.wizard.skip", cancelled ? "1" : ""); } catch (e) {}
  }
  function open(force) {
    if (!force && ui.open) return;
    ui.draft = blankDraft();
    ui.step = 0;
    ui.cancelled = false;
    show();
  }
  function maybeOpen(doc) {
    if (!root.document) return;
    try { if (/nowizard=1/.test(String(root.location && root.location.search || ""))) return; } catch (e) {}
    if (isExisting(doc)) return;
    try { if (sessionStorage.getItem("ssdns.wizard.skip") === "1") return; } catch (e) {}
    open(false);
  }

  if (root.addEventListener) {
    root.addEventListener("storage", function () {
      if (!ui.open) return;
      var dlg = $("#wizDialog");
      if (dlg && !dlg.open && dlg.showModal) dlg.showModal();
    });
  }

  root.SSDNSCreator = {
    stepsFor: stepsFor,
    errorsFor: errorsFor,
    buildSheet: buildSheet,
    applyDraft: applyDraft,
    spellPageCopy: spellPageCopy,
    focusFor: focusFor,
    isExisting: isExisting,
    casterAtFirst: casterAtFirst,
    open: open,
    maybeOpen: maybeOpen,
    close: close,
    isOpen: function () { return ui.open; }
  };
})(typeof window !== "undefined" ? window : globalThis);

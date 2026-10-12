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
  function ensureKitDefaults(draft) {
    var def = kitPick(draft && draft.calling);
    draft.kit = draft.kit || {};
    Object.keys(def).forEach(function (k) {
      if (draft.kit[k] == null || draft.kit[k] === "") draft.kit[k] = def[k];
    });
    return draft.kit;
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
    if (draft.calling === "gunslinger") steps.push("style");
    if (casterAtFirst(cal)) steps.push("spells");
    steps.push("level", "vitals", "review");
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
      fightingStyle: "",
      level: 1,
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
      var linPick = lineageById(draft.lineage);
      if (!linPick) errs.push("Pick a lineage.");
      else if (subRequired(linPick) && !draft.sublineage) errs.push("Pick a sublineage.");
      else if (linPick && SETTLER_ROW[linPick.id] && !draft.settlerLanguage) errs.push("Pick a settler language.");
      if (linPick && needsExtraLang(draft) && !draft.extraLanguage) errs.push("Pick an extra language.");
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
      if (draft.method === "roll" && draft.rolled && draft.rolled.length === 6 && !draft.rollManual) {
        var gotRoll = AB.map(function (ab) { return Number(scores[ab]); }).sort(function (a, b) { return a - b; });
        var wantRoll = draft.rolled.map(function (row) { return row.total; }).sort(function (a, b) { return a - b; });
        if (gotRoll.join() !== wantRoll.join()) errs.push("Assign each rolled total once, or mark the scores as DM-approved.");
      }
    }
    if (step === "background" || step === "review") {
      if (!bg) errs.push("Pick a background.");
    }
    if (step === "level" || step === "review") {
      var lv = Number(draft.level || 1);
      if (lv !== 1 && lv !== 2 && lv !== 3) errs.push("Starting level is 1, 2, or 3.");
    }
    if (step === "style" || step === "review") {
      if (draft.calling === "gunslinger" && !draft.fightingStyle) errs.push("Pick a Gunfighter style.");
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
    c.fightingStyle = draft.calling === "gunslinger" ? (draft.fightingStyle || "") : (c.fightingStyle || "");
    var level = Number(draft.level) || 1;
    if (level < 1) level = 1;
    if (level > 3) level = 3;
    c.level = level;
    c.background = bg ? bg.id : "";
    c.abilities = {};
    AB.forEach(function (ab) { c.abilities[ab] = Number(draft.scores[ab]) || 10; });
    c.saveProf = { STR: false, DEX: false, CON: false, INT: false, WIS: false, CHA: false };
    (cal && cal.saves || []).forEach(function (ab) { c.saveProf[ab] = true; });
    c.skillProf = {};
    (draft.skills || []).forEach(function (sk) { c.skillProf[sk] = 1; });
    c.speedAuto = true;
    c.speed = (sub && sub.speed) || (lin && lin.speed) || 30;
    ensureKitDefaults(draft);
    var kitPicks = Object.assign({}, draft.kit || {});
    if (draft.kitMode === "module") kitPicks._start = "module";
    if (draft.bedtime) kitPicks.bedtime = draft.bedtime;
    if (root.SSDNSKits && root.SSDNSKits.apply) root.SSDNSKits.apply(c, c.calling, kitPicks);
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
    var con = mod(c.abilities.CON);
    var average = Math.floor(sides / 2) + 1;
    var tough = sub && sub.id === "gold-miner" ? level : 0;
    var hp = Math.max(1, sides + con + (level - 1) * (average + con)) + tough;
    c.hpAuto = true;
    c.hpMax = hp;
    c.hpCurrent = hp;
    c.hitDiceLeft = level + "d" + sides;
    var prof = [];
    if (cal && cal.armorProf) prof.push("Armor (" + cal.name + "): " + cal.armorProf);
    if (cal && cal.weaponProf) prof.push("Weapons (" + cal.name + "): " + cal.weaponProf);
    if (lin) prof.push(languageLine(draft, lin));
    c.proficienciesLanguages = prof.join("\n");
    if (bg && bg.feature && bg.feature.name) {
      c.features = bg.feature.name + ": " + (bg.feature.text || "");
    }
    if (draft.kitMode !== "module") {
      var card = refById("backgrounds", c.background);
      var gear = card && (card.table || []).filter(function (row) { return row && /equipment/i.test(row[0] || ""); })[0];
      if (gear && gear[1]) addGearLine(c, gear[1]);
      var pouch = gear && String(gear[1] || "").match(/([\d,]+)\s*ES/);
      if (pouch) c._pouchEs = parseInt(pouch[1].replace(/,/g, ""), 10) || 0;
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
    draft.settlerLanguage = spec.settlerLanguage || defaultSettler(lin.id);
    if (needsExtraLang(draft)) draft.extraLanguage = spec.extraLanguage || "German";
    draft.calling = cal.id;
    draft.method = spec.method || "standard";
    draft.scores = spec.scores || assignStandard(cal);
    draft.background = bg.id;
    draft.skills = (spec.skills || skillList(bg)).slice();
    draft.kit = spec.kit || kitPick(cal.id);
    ensureKitDefaults(draft);
    draft.level = spec.level || 1;
    if (draft.calling === "gunslinger" && !draft.fightingStyle) draft.fightingStyle = spec.fightingStyle || "long-gun";
    var lim = levelRow(cal);
    if (casterAtFirst(cal)) {
      var cantripPool = spellEntries(cal.id, 0);
      if (!spec.cantrips && cal.id === "pact-seeker") {
        var pactName = cantripPool.filter(function (n) { return /pact shot|eldritch blast/i.test(n); })[0] || "Pact Shot";
        var other = cantripPool.filter(function (n) { return n !== pactName; })[0];
        draft.cantrips = [pactName, other].filter(Boolean).slice(0, lim.cantrips);
      } else draft.cantrips = (spec.cantrips || cantripPool.slice(0, lim.cantrips)).slice();
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
  var SUB_REQUIRED = { "mountain-folk": 1, aristocrats: 1, farmers: 1, merchants: 1 };
  var SETTLER_ROW = {
    "mountain-folk": ["German", "Welsh"],
    aristocrats: ["French", "Latin"],
    farmers: ["Irish Gaelic", "Spanish"],
    "camp-kin": ["German", "Russian"],
    merchants: ["Cantonese", "German", "Italian"],
    diplomats: ["Spanish", "French"],
    pioneers: ["Swedish", "Norwegian", "Dutch"],
    "street-folk": ["Italian", "Polish"]
  };
  var CHOICE_LANGS = ["Cantonese", "Dutch", "French", "German", "Irish Gaelic", "Italian", "Latin", "Norwegian", "Polish", "Russian", "Spanish", "Swedish", "Trail Tongue", "Welsh", "Dwarvish", "Elvish", "Halfling", "Gnomish", "Orc"];
  function needsExtraLang(draft) {
    if (!draft) return false;
    if (draft.lineage === "nomads" || draft.lineage === "diplomats") return true;
    return draft.sublineage === "high-house";
  }
  function defaultSettler(id) {
    var row = SETTLER_ROW[id];
    return row ? row[0] : "";
  }
  function subRequired(lin) {
    return !!(lin && SUB_REQUIRED[lin.id] && (lin.sublineages || []).length);
  }
  function refById(kind, id) {
    var cards = (root.SSDNS_REFCARDS && root.SSDNS_REFCARDS[kind]) || [];
    return cards.filter(function (row) { return row && row.id === id; })[0] || null;
  }
  function addGearLine(c, text) {
    if (!text) return;
    var cur = c.equipment || "";
    if (cur.indexOf(text) >= 0) return;
    c.equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + "• " + text;
  }
  function languageLine(draft, lin) {
    if (!lin) return "";
    if (lin.id === "nomads") {
      var nomad = ["Common", "Trail Tongue"];
      if (draft.extraLanguage) nomad.push(draft.extraLanguage);
      return "You can speak, read, and write " + nomad.join(", ") + ".";
    }
    var parts = ["Common"];
    if (draft.settlerLanguage) parts.push(draft.settlerLanguage);
    if (draft.extraLanguage) parts.push(draft.extraLanguage);
    if (parts.length < 2) return lin.languages || "";
    if (parts.length === 2) return "You can speak, read, and write " + parts[0] + " and " + parts[1] + ".";
    return "You can speak, read, and write " + parts.slice(0, -1).join(", ") + ", and " + parts[parts.length - 1] + ".";
  }
  function langSelect(id, current, choices, placeholder) {
    var sel = el("select", { id: id, "aria-label": placeholder || "Language" });
    sel.appendChild(option("", placeholder || "Choose…", !current));
    (choices || []).forEach(function (name) {
      sel.appendChild(option(name, name, name === current));
    });
    return sel;
  }
  function combinedAsi(lin, sub) {
    if (sub && sub.asi && lin && lin.asi && sub.id !== "variant-human") return lin.asi + " · " + sub.asi;
    if (sub && sub.asi) return sub.asi;
    return (lin && lin.asi) || "";
  }
  function aboutButton(kind, id, subId) {
    var b = el("button", { type: "button", class: "btn sm", text: "About" });
    b.addEventListener("click", function () { openRef(kind, id, subId); });
    return b;
  }
  function chartTable(rows) {
    var table = el("table", { class: "wiz-chart" });
    (rows || []).forEach(function (row) {
      if (!row) return;
      var tr = el("tr");
      tr.appendChild(el("th", { text: row[0] || "" }));
      tr.appendChild(el("td", { text: row[1] || "" }));
      table.appendChild(tr);
    });
    return table;
  }
  function accentRows(card) {
    var rows = [];
    if (!card || !card.accent) return rows;
    if (card.accent.accent) rows.push(["Accent", card.accent.accent]);
    if (card.accent.settlerLanguages && card.accent.settlerLanguages.length) rows.push(["Settler languages", card.accent.settlerLanguages.join(" or ")]);
    return rows;
  }
  function openRef(kind, id, subId) {
    var card = refById(kind, id);
    if (!card || !root.document) return;
    var dlg = el("dialog", { class: "dlg wiz-ref" });
    var body = el("div", { class: "wiz-body" });
    body.appendChild(el("h2", { text: card.name || "Reference" }));
    if (card.race5e || card.class5e || card.twin5e) body.appendChild(el("p", { class: "fine", text: "5E " + (kind === "callings" ? "class" : "lineage") + ": " + (card.race5e || card.class5e || card.twin5e) }));
    if (card.blurb) body.appendChild(el("p", { text: card.blurb }));
    var rows = (card.table || []).slice();
    accentRows(card).forEach(function (row) { rows.push(row); });
    if (rows.length) body.appendChild(chartTable(rows));
    if (card.languageNote) body.appendChild(el("p", { class: "fine", text: card.languageNote }));
    var subs = card.sublineages || [];
    var picked = subId && subs.filter(function (sub) { return sub.id === subId; })[0];
    if (picked) {
      body.appendChild(el("h3", { text: picked.name || "Sublineage" }));
      if (picked.blurb) body.appendChild(el("p", { text: picked.blurb }));
      if (picked.table) body.appendChild(chartTable(picked.table));
    } else if (subs.length) {
      if (card.subPick) body.appendChild(el("p", { text: card.subPick }));
      subs.forEach(function (sub) {
        body.appendChild(el("h3", { text: sub.name || "Sublineage" }));
        if (sub.blurb) body.appendChild(el("p", { text: sub.blurb }));
        if (sub.table) body.appendChild(chartTable(sub.table));
      });
    }
    if (card.feature && card.feature.name) body.appendChild(el("p", { text: "Feature — " + card.feature.name + ": " + (card.feature.text || "") }));
    if (card.moreInfo) body.appendChild(el("p", { class: "fine wiz-page", text: card.moreInfo }));
    var foot = el("div", { class: "dlg-foot" });
    var closeBtn = el("button", { type: "button", class: "btn", text: "Close" });
    closeBtn.addEventListener("click", function () { if (dlg.close) dlg.close(); });
    foot.appendChild(closeBtn);
    dlg.appendChild(body);
    dlg.appendChild(foot);
    dlg.addEventListener("click", function (e) { if (e.target === dlg && dlg.close) dlg.close(); });
    dlg.addEventListener("cancel", function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); });
    root.document.body.appendChild(dlg);
    if (dlg.showModal) dlg.showModal();
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
        var subs = (lin && lin.sublineages) || [];
        if (lin && lin.id === "nomads") sub.appendChild(option("", "Standard", !draft.sublineage));
        else if (!subRequired(lin)) sub.appendChild(option("", subs.length ? "No sublineage" : "None", !draft.sublineage));
        else sub.appendChild(option("", "Choose…", !draft.sublineage));
        subs.forEach(function (s) {
          sub.appendChild(option(s.id, s.name, s.id === draft.sublineage));
        });
      }
      sel.addEventListener("change", function () {
        draft.lineage = sel.value;
        draft.sublineage = "";
        draft.settlerLanguage = "";
        draft.extraLanguage = "";
        fillSub();
        renderStep(body, draft, step);
      });
      sub.addEventListener("change", function () { draft.sublineage = sub.value; renderStep(body, draft, step); });
      fillSub();
      var linRow = el("div", { class: "wiz-inline" });
      linRow.appendChild(field("Lineage", sel));
      if (draft.lineage) linRow.appendChild(aboutButton("lineages", draft.lineage, draft.sublineage));
      body.appendChild(linRow);
      var subRow = el("div", { class: "wiz-inline" });
      subRow.appendChild(field("Sublineage", sub));
      if (draft.sublineage) subRow.appendChild(aboutButton("lineages", draft.lineage, draft.sublineage));
      body.appendChild(subRow);
      var lin = lineageById(draft.lineage);
      var picked = lin && (lin.sublineages || []).filter(function (s) { return s.id === draft.sublineage; })[0];
      if (lin) {
        var speed = (picked && picked.speed) || lin.speed || 30;
        body.appendChild(el("p", { text: combinedAsi(lin, picked) + " · Speed " + speed + " ft. · " + (lin.size || "Medium") }));
        body.appendChild(el("h3", { text: "Languages" }));
        if (lin.id === "nomads") body.appendChild(el("p", { text: "Common and Trail Tongue. Trail Tongue is fixed for Nomads." }));
        else if (SETTLER_ROW[lin.id]) {
          var langSel = langSelect("wizSettler", draft.settlerLanguage, SETTLER_ROW[lin.id], "Settler language…");
          langSel.addEventListener("change", function () { draft.settlerLanguage = langSel.value; renderStep(body, draft, step); });
          body.appendChild(field("Settler language", langSel));
          body.appendChild(el("p", { class: "fine", text: lin.languages || "" }));
        }
        if (needsExtraLang(draft)) {
          var extraSel = langSelect("wizExtraLang", draft.extraLanguage, CHOICE_LANGS, "Extra language…");
          extraSel.addEventListener("change", function () { draft.extraLanguage = extraSel.value; renderStep(body, draft, step); });
          body.appendChild(field("Extra language of your choice", extraSel));
          body.appendChild(el("p", { class: "fine", text: "A settler language or an Old Tongue. Infernal and Celestial are not offered." }));
        }
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
        draft.fightingStyle = "";
        draft.cantrips = [];
        draft.spells = [];
        renderStep(body, draft, step);
      });
      var callRow = el("div", { class: "wiz-inline" });
      callRow.appendChild(field("Calling", csel));
      if (cal) callRow.appendChild(aboutButton("callings", cal.id));
      body.appendChild(callRow);
      if (cal) {
        body.appendChild(el("p", { text: "Hit die " + cal.hitDie + ". Saves " + (cal.saves || []).join(", ") + ". Key ability " + (cal.primary || "—") + "." }));
        if (cal.armorProf) body.appendChild(el("p", { class: "fine", text: "Armor: " + cal.armorProf }));
        if (cal.weaponProf) body.appendChild(el("p", { class: "fine", text: "Weapons: " + cal.weaponProf }));
        var callCard = refById("callings", cal.id);
        var firstLevel = callCard && (callCard.table || []).filter(function (row) { return row && /1st level/i.test(row[0] || ""); })[0];
        if (firstLevel) body.appendChild(el("p", { text: firstLevel[0] + ": " + firstLevel[1] }));
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
          if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
          var rolled = [];
          for (var n = 0; n < 6; n++) {
            var dice = [0, 0, 0, 0].map(function () { return 1 + Math.floor(Math.random() * 6); }).sort(function (a, b) { return a - b; });
            rolled.push({ total: dice[1] + dice[2] + dice[3], dice: dice });
          }
          draft.rolled = rolled;
          draft.rollPick = {};
          renderStep(body, draft, step);
        });
        body.appendChild(rollBtn);
        if (draft.rolled && draft.rolled.length === 6) {
          body.appendChild(el("p", { text: "Rolled: " + draft.rolled.map(function (row) {
            var dice = row.dice || [];
            var dropped = dice.length ? dice[0] : "";
            var kept = dice.slice(1);
            return row.total + " (" + kept.join("+") + (dropped !== "" ? ", drop " + dropped : "") + ")";
          }).join(" · ") }));
        }
        var manual = el("label", { class: "wiz-check" });
        var manualBox = el("input", { type: "checkbox" });
        manualBox.checked = !!draft.rollManual;
        manualBox.addEventListener("change", function () { draft.rollManual = manualBox.checked; renderStep(body, draft, step); });
        manual.appendChild(manualBox);
        manual.appendChild(root.document.createTextNode(" DM-approved manual scores"));
        body.appendChild(manual);
      }
      var pool = draft.method === "standard" ? STANDARD.slice() : null;
      var assigning = draft.method === "roll" && draft.rolled && draft.rolled.length === 6 && !draft.rollManual;
      AB.forEach(function (ab) {
        var input;
        if (assigning) {
          input = el("select", { "data-ab": ab });
          input.appendChild(option("", "Assign…", draft.rollPick[ab] == null));
          draft.rolled.forEach(function (row, idx) {
            var taken = Object.keys(draft.rollPick || {}).some(function (k) { return k !== ab && Number(draft.rollPick[k]) === idx; });
            if (taken) return;
            input.appendChild(option(String(idx), String(row.total), Number(draft.rollPick[ab]) === idx));
          });
          input.addEventListener("change", function () {
            draft.rollPick = draft.rollPick || {};
            if (input.value === "") delete draft.rollPick[ab];
            else {
              draft.rollPick[ab] = Number(input.value);
              draft.scores[ab] = draft.rolled[Number(input.value)].total;
            }
            renderStep(body, draft, step);
          });
        } else {
          input = el("input", { type: "number", min: "3", max: "18", value: String(draft.scores[ab] || 8), "data-ab": ab });
        }
        if (!assigning) input.addEventListener("input", function () {
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
      var bgRow = el("div", { class: "wiz-inline" });
      bgRow.appendChild(field("Background", bsel));
      if (draft.background) bgRow.appendChild(aboutButton("backgrounds", draft.background));
      body.appendChild(bgRow);
      var bg = backgroundById(draft.background);
      var bgCard = refById("backgrounds", draft.background);
      if (bgCard) {
        if (bgCard.blurb) body.appendChild(el("p", { text: bgCard.blurb }));
        (bgCard.table || []).forEach(function (row) {
          body.appendChild(el("p", { text: (row[0] || "") + ": " + (row[1] || "") }));
        });
        if (bgCard.feature) body.appendChild(el("p", { text: "Feature — " + bgCard.feature.name + ": " + (bgCard.feature.text || "") }));
        if (bgCard.moreInfo) body.appendChild(el("p", { class: "fine", text: bgCard.moreInfo }));
      } else if (bg && bg.feature) body.appendChild(el("p", { text: bg.feature.name + " — " + bg.feature.text }));
      if (bg) {
        draft.skills = skillList(bg).slice();
        body.appendChild(el("p", { text: "You gain proficiency in " + skillList(bg).join(", ") + "." }));
      }
    } else if (step === "style") {
      body.appendChild(el("h2", { text: "Gunfighter style" }));
      body.appendChild(el("p", { text: "Gunslingers pick a fighting style at 1st level." }));
      var styles = [
        ["long-gun", "Long-Gun Marksmanship (+2 to hit with rifles and carbines, including Big Bore; not shotguns)"],
        ["sidearm", "Sidearm Duelling (+2 damage with one gun)"],
        ["point-blank", "Point-Blank Defense (+1 AC)"]
      ];
      styles.forEach(function (pair) {
        var box = el("label", { class: "wiz-check" });
        var input = el("input", { type: "radio", name: "wizStyle", value: pair[0] });
        input.checked = draft.fightingStyle === pair[0];
        input.addEventListener("change", function () { if (input.checked) draft.fightingStyle = pair[0]; });
        box.appendChild(input);
        box.appendChild(root.document.createTextNode(" " + pair[1]));
        body.appendChild(box);
      });
    } else if (step === "kit") {
      body.appendChild(el("h2", { text: "Starting kit" }));
      ensureKitDefaults(draft);
      var kits = root.SSDNSKits;
      var choices = (kits && kits.choices && kits.choices[draft.calling]) || [];
      var mode = el("select", { id: "wizKitMode" });
      mode.appendChild(option("full", "Full kit", draft.kitMode !== "module"));
      mode.appendChild(option("module", "Module start", draft.kitMode === "module"));
      mode.addEventListener("change", function () { draft.kitMode = mode.value; renderStep(body, draft, step); });
      body.appendChild(field("Start", mode));
      if (draft.kitMode === "module") {
        var bed = el("input", { id: "wizBedtime", value: draft.bedtime || "", placeholder: "Bedtime item the DM approved" });
        bed.addEventListener("input", function () { draft.bedtime = bed.value; });
        body.appendChild(field("Bedtime item", bed));
      }
      body.appendChild(el("h3", { text: "Your starting kit" }));
      if (!choices.length) body.appendChild(el("p", { text: "No choices to make; this is your kit." }));
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
      var kitLines = root.SSDNSKits && root.SSDNSKits.describe
        ? root.SSDNSKits.describe(draft.calling, Object.assign({}, draft.kit || {}, draft.kitMode === "module" ? { _start: "module", bedtime: draft.bedtime || "" } : {}))
        : [];
      if (kitLines.length) {
        var list = el("ul", { class: "wiz-kit" });
        kitLines.forEach(function (line) { list.appendChild(el("li", { text: line })); });
        body.appendChild(list);
      }
      var kitCard = refById("callings", draft.calling);
      if (kitCard && kitCard.moreInfo) body.appendChild(el("p", { class: "fine wiz-page", text: kitCard.moreInfo }));
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
          var Cast = root.SSDNSSpellCast;
          if (Cast && Cast.describe) {
            var ability = ({ "storyteller": "CHA", "frontier-preacher": "WIS", "nature-guide": "WIS", "lawman": "CHA", "scholar": "INT", "hexslinger": "CHA", "pact-seeker": "CHA", "frontier-scout": "WIS" })[draft.calling] || "CHA";
            var score = (draft.scores && draft.scores[ability]) || 10;
            var modN = Math.floor((Number(score) - 10) / 2);
            var prof = (Number(draft.level) || 1) >= 5 ? 3 : 2;
            var text = Cast.describe(name, { spellDC: 8 + prof + modN, spellAtk: prof + modN, level: draft.level || 1, ability: ability });
            if (text) {
              body.appendChild(el("details", { class: "spell-more" }, [
                el("summary", { text: "About" }),
                el("p", { class: "spell-desc", text: text })
              ]));
            }
          }
        });
      }
      picks("Cantrips", 0, draft.cantrips || [], lim.cantrips);
      if (draft.calling === "pact-seeker" && !(draft.cantrips || []).some(function (n) { return /pact shot|eldritch blast/i.test(n); })) {
        body.appendChild(el("p", { text: "Pact Shot counts as one of your cantrips. It is not a free extra." }));
      }
      var cap = PREPARED[draft.calling] ? preparedMax(cal, draft.scores) : lim.known;
      picks(PREPARED[draft.calling] ? "Prepared" : "Spells known", 1, draft.spells || [], cap);
    } else if (step === "level") {
      body.appendChild(el("h2", { text: "Starting level" }));
      var lsel = el("select", { id: "wizLevel" });
      [1, 2, 3].forEach(function (n) {
        lsel.appendChild(option(String(n), "Level " + n, Number(draft.level || 1) === n));
      });
      lsel.addEventListener("change", function () { draft.level = Number(lsel.value) || 1; });
      body.appendChild(field("Level", lsel));
      body.appendChild(el("p", { class: "fine", text: "Level 1 takes the full hit die. Levels 2 and 3 add the average hit die plus Constitution. Spell lists stay at 1st level until you use Level up." }));
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
        body.appendChild(el("p", { text: "Level " + (preview.level || 1) }));
        body.appendChild(el("p", { text: AB.map(function (ab) {
          return ab + " " + (draft.scores[ab] || 0) + " (" + sign(mod(draft.scores[ab])) + ")";
        }).join(" · ") }));
        var prof = 2;
        var saveLine = (cal && cal.saves || []).map(function (ab) {
          return ab + " " + sign(mod(draft.scores[ab]) + prof);
        });
        body.appendChild(el("p", { text: "Saves: " + (saveLine.join(", ") || "—") }));
        var skillLine = (rules().skills || []).map(function (sk) {
          var bonus = mod(draft.scores[sk.ability]) + ((draft.skills || []).indexOf(sk.name) >= 0 ? prof : 0);
          return sk.name + " " + sign(bonus);
        });
        body.appendChild(el("p", { text: "Skills: " + skillLine.join(", ") }));
        var named = function (list, id) {
          return (list || []).filter(function (row) { return row.id === id; })[0];
        };
        var kitItems = [];
        (preview.melee || []).forEach(function (row) {
          var w = named(rules().melee, row.weapon);
          if (w) kitItems.push(w.name);
        });
        (preview.guns || []).forEach(function (row) {
          var w = named((rules().firearms || []).concat(rules().casterGuns || []), row.weapon);
          if (w) kitItems.push(w.name);
        });
        if (preview.equipment) kitItems.push(preview.equipment);
        body.appendChild(el("p", { text: "Kit: " + (kitItems.join(", ") || "—") }));
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
      app.applyPatch(function (doc) {
        applyDraft(doc.character, ui.draft);
        var pouch = doc.character && doc.character._pouchEs;
        if (pouch && ui.draft.kitMode !== "module" && root.SSDNSBridge && root.SSDNSBridge.breakdown) {
          var add = root.SSDNSBridge.breakdown(pouch);
          doc.shards = doc.shards || {};
          Object.keys(add).forEach(function (k) { doc.shards[k] = (parseInt(doc.shards[k], 10) || 0) + add[k]; });
        }
        if (doc.character) delete doc.character._pouchEs;
      });
    }
    if (root.SSDNSPlaytest && root.SSDNSPlaytest.syncSheet) root.SSDNSPlaytest.syncSheet();
    close(false);
    if (root.SSDNSSheet && root.SSDNSSheet.showNotice) root.SSDNSSheet.showNotice("Character created.");
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.consumeInvite) root.SSDNSDmJoin.consumeInvite();
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

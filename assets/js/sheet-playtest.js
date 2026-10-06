/**
 * Playtest pass: starting kits, features, fighting style, melee, rests, version banner.
 * Loaded last. Does not replace the sheet; it patches the live document.
 */
(function (root) {
  "use strict";
  var declined = "";
  var LOG_KEY = "ssdns.v1.tableLog";

  function $(s) { return document.querySelector(s); }
  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function ch() { var d = doc(); return d && d.character; }
  function rules() { return root.SSDNS_RULES || {}; }
  function byId(list) {
    var m = {};
    (list || []).forEach(function (x) { if (x && x.id) m[x.id] = x; });
    return m;
  }
  function toast(msg) {
    var t = $("#toastText"), box = $("#toast");
    if (t && box) { t.textContent = msg; box.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { box.hidden = true; }, 3200); }
  }
  function patch(fn) {
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(fn);
  }
  function hasId(c, id) {
    return (c.guns || []).some(function (g) { return g && g.weapon === id; }) ||
      (c.melee || []).some(function (g) { return g && g.weapon === id; });
  }
  function putGun(c, id, allowDup) {
    if (!id || (!allowDup && hasId(c, id))) return;
    var slot = (c.guns || []).filter(function (g) { return g && !g.weapon; })[0];
    if (!slot) return;
    slot.weapon = id;
    if (root.SSDNSApp && root.SSDNSApp.callingProficient) {
      var lists = [].concat(rules().firearms || [], rules().casterGuns || [], rules().melee || [], rules().otherRanged || []);
      var w = lists.filter(function (x) { return x.id === id; })[0];
      if (w) slot.proficient = root.SSDNSApp.callingProficient(w);
    }
  }
  function putMelee(c, id) {
    if (!id || hasId(c, id)) return;
    c.melee = c.melee || [{}, {}, {}, {}];
    var slot = c.melee.filter(function (g) { return g && !g.weapon; })[0];
    if (!slot) return;
    slot.weapon = id;
    slot.proficient = true;
  }
  function addAmmo(c, type, caliber, count) {
    c.ammo = c.ammo || [];
    var pool = null;
    c.ammo.forEach(function (a) {
      if (!pool && a.type === type && String(a.caliber || "").toLowerCase() === String(caliber || "").toLowerCase()) pool = a;
    });
    if (!pool) { pool = { type: type, caliber: caliber || "", count: 0 }; c.ammo.push(pool); }
    if (!pool._kit) { pool.count = (parseInt(pool.count, 10) || 0) + count; pool._kit = 1; }
  }
  function addLine(c, text) {
    if (!text) return;
    var cur = c.equipment || "";
    if (cur.indexOf(text) >= 0) return;
    c.equipment = (cur ? cur.replace(/\s+$/, "") + "\n" : "") + "• " + text;
  }
  function grantEs(c, amount, bgId) {
    c.kitGrants = c.kitGrants || {};
    if (c.kitGrants.es === bgId) return;
    var d = doc();
    if (!d) return;
    d.shards = d.shards || { white: 0, blue: 0, green: 0, yellow: 0, purple: 0 };
    var left = amount;
    [["purple", 500], ["yellow", 100], ["green", 50], ["blue", 10], ["white", 1]].forEach(function (row) {
      var n = Math.floor(left / row[1]);
      if (n) { d.shards[row[0]] = (parseInt(d.shards[row[0]], 10) || 0) + n; left -= n * row[1]; }
    });
    c.kitGrants.es = bgId;
  }

  var KIT_CHOICES = {
    gunslinger: [
      { id: "side", prompt: "Cavalry saber, or twin revolvers?", options: [
        { id: "saber", label: "Cavalry saber" },
        { id: "twins", label: "Twin revolvers (two Herringer Light Pepperboxes + 20 Light)" },
        { id: "navy", label: "One Navy / Army Ball n Cap + 20 percussion loads" }
      ]}
    ],
    "frontier-scout": [
      { id: "hunt", prompt: "Hunting rifle: longbow, or a carbine?", options: [
        { id: "bow", label: "Longbow + 20 arrows" },
        { id: "carbine", label: "Dullards Light Carbine + 20 Light cartridges" }
      ]}
    ],
    "frontier-preacher": [
      { id: "melee", prompt: "Mace, or chapel hammer?", options: [
        { id: "mace", label: "Trail mace" },
        { id: "hammer", label: "Chapel hammer (claim hammer)" }
      ]},
      { id: "armor", prompt: "Plated duster, or scale mail?", options: [
        { id: "duster", label: "Plated duster (heavy leather duster)" },
        { id: "scale", label: "Scale coat" }
      ]},
      { id: "gun", prompt: "Light rifle, or Farm Shotgun?", options: [
        { id: "rifle", label: "Light rifle — Dullards Tube Rifle + 20 Light cartridges" },
        { id: "carbine", label: "Light rifle — Dullards Light Carbine + 20 Light cartridges" },
        { id: "shotgun", label: "Single-Barrel Farm Shotgun, .410 + 10 shells" }
      ]}
    ],
    storyteller: [
      { id: "kit", prompt: "Diplomat's trunk, or saloon kit?", options: [
        { id: "trunk", label: "Diplomat's trunk" },
        { id: "saloon", label: "Saloon kit" }
      ]},
      { id: "voice", prompt: "Which instrument is the focus?", options: [
        { id: "fiddle", label: "Fiddle" },
        { id: "banjo", label: "Banjo" },
        { id: "guitar", label: "Guitar" },
        { id: "voice", label: "Voice" }
      ]}
    ],
    "nature-guide": [
      { id: "focus", prompt: "Focus taken from the land?", options: [
        { id: "stick", label: "Carved walking stick" },
        { id: "pouch", label: "Medicine pouch" },
        { id: "soil", label: "Pouch of home-spring soil" }
      ]}
    ],
    gambler: [
      { id: "blade", prompt: "Fencing iron, or Bowie knife?", options: [
        { id: "iron", label: "Fencing iron (sword cane)" },
        { id: "bowie", label: "Bowie knife" }
      ]},
      { id: "ranged", prompt: "Shortbow, or pocket pistol?", options: [
        { id: "bow", label: "Shortbow + 20 arrows" },
        { id: "pistol", label: "Herringer Light Pocket Pistol + 20 Light cartridges" }
      ]}
    ],
    hexslinger: [
      { id: "gun", prompt: "Blacksnake, or Hognose?", options: [
        { id: "blacksnake", label: "Blacksnake caster gun" },
        { id: "hognose", label: "Hognose caster gun" }
      ]}
    ]
  };
  var KITS = {
    "tribal-warrior": function (c) {
      putMelee(c, "buffalo-axe-greataxe");
      putMelee(c, "hatchet-handaxe");
      putMelee(c, "throwing-spear-javelin");
      addLine(c, "Hatchet (second)");
      addLine(c, "Throwing spears ×4");
      addLine(c, "Explorer's pack");
    },
    storyteller: function (c, p) {
      putMelee(c, "stiletto-dagger");
      addLine(c, "Boot knife");
      if (p && p.voice) addLine(c, "Instrument (" + p.voice + ") — focus");
      addLine(c, "Strap or spare strings");
      if ((p && p.kit) === "saloon") addLine(c, "Saloon kit");
      else if ((p && p.kit) === "trunk") addLine(c, "Diplomat's trunk");
      addLine(c, "Duster");
    },
    "frontier-preacher": function (c, p) {
      if ((p && p.melee) === "hammer") putMelee(c, "claim-hammer-light-hammer");
      else if ((p && p.melee) === "mace") putMelee(c, "trail-mace-chapel-mace-mace");
      if ((p && p.gun) === "shotgun") {
        putGun(c, "single-barrel-farm-shotgun");
        addAmmo(c, "buck", ".410", 10);
      } else if ((p && p.gun) === "carbine") {
        putGun(c, "dullards-light-carbine");
        addAmmo(c, "cartridge", "Light", 20);
      } else if ((p && p.gun) === "rifle") {
        putGun(c, "dullards-tube-rifle");
        addAmmo(c, "cartridge", "Light", 20);
      }
      if ((p && p.armor) === "duster") c.armor = "heavy-leather-duster";
      else if ((p && p.armor) === "scale") c.armor = "scale-coat";
      addLine(c, "Priest's kit");
      addLine(c, "Holy symbol");
    },
    "nature-guide": function (c, p) {
      putMelee(c, "machete-scimitar");
      c.shield = true;
      addLine(c, "Explorer's pack");
      addLine(c, "Herbalism kit");
      var focus = { stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" };
      if (p && focus[p.focus]) addLine(c, "Focus: " + focus[p.focus]);
    },
    gunslinger: function (c, p) {
      putGun(c, "dullards-tube-rifle");
      addAmmo(c, "cartridge", "Light", 20);
      c.holster = "mexican-loop";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, "Mexican Loop");
      addLine(c, "Dungeoneer's pack");
      addLine(c, "Duster");
      if ((p && p.side) === "twins") {
        putGun(c, "herringer-light-pepperbox");
        putGun(c, "herringer-light-pepperbox", true);
        addAmmo(c, "cartridge", "Light", 20);
      } else if ((p && p.side) === "navy") {
        putGun(c, "navy-army-ball-n-cap-revolver");
        addAmmo(c, "percussion", "", 20);
      } else if ((p && p.side) === "saber") putMelee(c, "cavalry-saber-longsword");
    },
    "martial-artist": function (c) {
      putMelee(c, "bowie-shortsword");
      addLine(c, "Throwing knives ×10");
      addLine(c, "Dungeoneer's pack");
      addLine(c, "Canvas shirt and boots");
    },
    lawman: function (c) {
      putMelee(c, "cavalry-saber-longsword");
      putMelee(c, "throwing-spear-javelin");
      c.shield = true;
      c.armor = c.armor || "mail-duster";
      addLine(c, "Badge / tin star (focus)");
      addLine(c, "Javelins ×5");
    },
    "frontier-scout": function (c, p) {
      putMelee(c, "bowie-shortsword");
      addLine(c, "Second Bowie knife");
      c.armor = c.armor || "scale-coat";
      c.gunBelt = true;
      addLine(c, "Gun belt");
      addLine(c, "Explorer's pack");
      addLine(c, "Compass (focus)");
      if ((p && p.hunt) === "carbine") {
        putGun(c, "dullards-light-carbine");
        addAmmo(c, "cartridge", "Light", 20);
      } else if ((p && p.hunt) === "bow") {
        putGun(c, "longbow");
        addLine(c, "Arrows ×20");
      }
    },
    gambler: function (c, p) {
      if ((p && p.blade) === "bowie") putMelee(c, "bowie-shortsword");
      else if ((p && p.blade) === "iron") putMelee(c, "sword-cane-rapier");
      if ((p && p.ranged) === "bow") {
        putGun(c, "shortbow");
        addLine(c, "Arrows ×20");
      } else if ((p && p.ranged) === "pistol") {
        putGun(c, "herringer-light-pocket-pistol");
        addAmmo(c, "cartridge", "Light", 20);
      }
      addLine(c, "Stilettos ×2");
      addLine(c, "Thieves' tools");
      addLine(c, "Duster");
      addLine(c, "Satchel");
    },
    hexslinger: function (c, p) {
      var gun = (p && p.gun) === "hognose" ? "hognose" : ((p && p.gun) === "blacksnake" ? "blacksnake" : "");
      if (gun) { putGun(c, gun); c.casterGun = gun; }
      c.gunBelt = true;
      addLine(c, "Gun belt");
      putMelee(c, "bowie-shortsword");
      addAmmo(c, "cartridge", "Light", 20);
      addLine(c, "Explorer's pack");
      addLine(c, "Daggers ×2");
    },
    "pact-seeker": function (c) {
      c.casterGun = "borrowed-iron";
      c.pactFocus = "borrowed-iron";
      addLine(c, "Borrowed Iron (pact focus)");
      addLine(c, "Dungeoneer's pack");
      addLine(c, "Duster");
    },
    scholar: function (c) {
      addLine(c, "Chemical Field Ledger (focus)");
      addLine(c, "Prism");
      addLine(c, "Galvanic reagents");
      addLine(c, "Scholar's pack");
      addLine(c, "Duster");
    }
  };
  function pickKitChoices(calling, done) {
    var choices = KIT_CHOICES[calling] || [];
    if (!choices.length) { done({}); return; }
    var dlg = document.getElementById("dlgKit");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "dlgKit";
      dlg.className = "dlg";
      document.body.appendChild(dlg);
    }
    var html = "<form method='dialog'><h2>Starting kit</h2><p class='fine'>These are the kit's or-lines. Pick one of each.</p>";
    choices.forEach(function (ch) {
      html += "<p><label class='fine'>" + ch.prompt + " <select data-kit-choice='" + ch.id + "'>";
      ch.options.forEach(function (op) { html += "<option value='" + op.id + "'>" + op.label + "</option>"; });
      html += "</select></label></p>";
    });
    html += "<div class='dlg-foot'><button class='btn' value='cancel'>Cancel</button><button class='btn' value='ok'>Apply these</button></div></form>";
    dlg.innerHTML = html;
    dlg.onclose = function () {
      var value = dlg.returnValue;
      dlg.onclose = null;
      if (value !== "ok") { done(null); return; }
      var picked = {};
      choices.forEach(function (ch) {
        var sel = dlg.querySelector("[data-kit-choice='" + ch.id + "']");
        picked[ch.id] = sel ? sel.value : ch.options[0].id;
      });
      done(picked);
    };
    if (dlg.showModal) dlg.showModal();
    else { toast("This browser can't show the kit choices."); done(null); }
  }

  function applyKit(force, picked) {
    var c = ch();
    if (!c || !c.calling || !KITS[c.calling]) { toast("Pick a Calling first."); return; }
    if (!force && c.kitStamp === c.calling) { toast("Starting kit is already on this sheet."); fillFeatures(); return; }
    var go = function (choice) {
      if (!choice) return;
      patch(function (d) {
        var cc = d.character;
        KITS[cc.calling](cc, choice);
        cc.kitStamp = cc.calling;
        var bg = byId(rules().backgrounds)[cc.background];
        if (bg && bg.equipment) {
          var m = String(bg.equipment).match(/pouch with ([\d,]+) ES/i);
          if (m) grantEs(cc, parseInt(m[1].replace(/,/g, ""), 10) || 0, cc.background);
        }
      });
      fillFeatures();
      paintPact();
      toast("Starting kit applied.");
    };
    if (picked) { go(picked); return; }
    pickKitChoices(c.calling, go);
  }
  function maybePrompt() {
    var c = ch();
    if (!c || !c.calling || !KITS[c.calling]) return;
    var key = c.calling + "|" + (c.background || "");
    if (c.kitStamp === c.calling) {
      var bg = byId(rules().backgrounds)[c.background];
      if (bg && /pouch with/i.test(bg.equipment || "") && !(c.kitGrants && c.kitGrants.es === c.background)) {
        patch(function (d) {
          var m = String(bg.equipment).match(/pouch with ([\d,]+) ES/i);
          if (m) grantEs(d.character, parseInt(m[1].replace(/,/g, ""), 10) || 0, d.character.background);
        });
      }
      fillFeatures();
      return;
    }
    if (declined === key) return;
    var cal = byId(rules().callings)[c.calling];
    if (window.confirm("Apply the starting kit for " + ((cal && cal.name) || "this Calling") + "?")) applyKit(false);
    else declined = key;
    fillFeatures();
  }

  function featureLevel(name) {
    var m = String(name || "").match(/(\d+)(?:st|nd|rd|th)\s*(?:lvl|level)/i);
    return m ? parseInt(m[1], 10) : null;
  }
  function collectFeatures(c) {
    var R = rules();
    var lines = [];
    function asList(arr) {
      if (!arr) return [];
      if (Array.isArray(arr)) return arr;
      if (typeof arr === "string") return [{ name: arr, text: "" }];
      if (typeof arr === "object") {
        if (arr.name) return [arr];
        return Object.keys(arr).map(function (k) { return arr[k]; });
      }
      return [];
    }
    function take(arr) {
      asList(arr).forEach(function (f) {
        if (!f || !f.name) return;
        var lv = featureLevel(f.name);
        if (lv != null && lv > (c.level || 1)) return;
        lines.push(f.name + (f.text ? "\n" + f.text : ""));
      });
    }
    var cal = byId(R.callings)[c.calling];
    var lin = byId(R.lineages)[c.lineage];
    var bg = byId(R.backgrounds)[c.background];
    if (cal) take(cal.features);
    if (lin) take(lin.features || lin.traits);
    if (lin && c.sublineage) {
      var sub = (lin.sublineages || []).filter(function (s) { return s.id === c.sublineage; })[0];
      if (sub) take(sub.features || sub.traits);
    }
    if (bg) take(bg.features || bg.traits);
    return lines.join("\n\n");
  }
  function useRule(text) {
    var s = String(text || "");
    if (/once per short\/long rest|once per short or long rest|once per short rest/i.test(s)) return { max: 1, rest: "short" };
    var n = s.match(/(\d+)\s*\+?\s*Cha/i);
    if (n && /long rest|per day/i.test(s)) return { max: parseInt(n[1], 10) || 1, rest: "long" };
    if (/once per long rest/i.test(s)) return { max: 1, rest: "long" };
    var times = s.match(/(\d+)\s+times per long rest/i);
    if (times) return { max: parseInt(times[1], 10) || 1, rest: "long" };
    return null;
  }
  function fillFeatures() {
    var c = ch();
    if (!c || c.featuresCustom) { renderUses(); return; }
    var text = collectFeatures(c);
    if (!text) { renderUses(); return; }
    patch(function (d) {
      d.character.features = text;
      var uses = d.character.featureUses || {};
      text.split("\n\n").forEach(function (block) {
        var name = (block.split("\n")[0] || "").trim();
        var rule = useRule(block);
        if (!name || !rule) return;
        var prev = uses[name] || {};
        uses[name] = { max: rule.max, used: prev.used || 0, rest: rule.rest };
      });
      d.character.featureUses = uses;
    });
    renderUses();
  }
  function renderUses() {
    var c = ch();
    var host = $("#featureUses");
    if (!host || !c) return;
    var uses = c.featureUses || {};
    var names = Object.keys(uses);
    if (!names.length) { host.innerHTML = ""; return; }
    host.innerHTML = names.map(function (name) {
      var u = uses[name];
      return "<label class='fine'>" + name.replace(/[&<>]/g, "") + " <input type='number' min='0' max='" + u.max + "' data-fuse='" + name.replace(/'/g, "") + "' value='" + (u.used || 0) + "' aria-label='Uses of " + name.replace(/'/g, "") + "'> / " + u.max + " (" + u.rest + " rest)</label>";
    }).join(" ");
  }

  function styleOptions(c) {
    if (!c) return [];
    var lv = c.level || 1;
    if (c.calling === "gunslinger") return [["long-gun", "Long-gun marksmanship (+2 ranged to hit)"], ["sidearm", "Sidearm (+2 pistol damage)"], ["point-blank", "Point-blank (+1 AC)"]];
    if (c.calling === "lawman" && lv >= 2) return [["defense", "Defense (+1 AC in armor)"], ["dueling", "Dueling (+2 one-handed melee damage)"]];
    if (c.calling === "frontier-scout" && lv >= 2) return [["archery", "Archery (+2 ranged to hit)"]];
    return [];
  }
  function renderStyle() {
    var sel = $("#selFightingStyle");
    var c = ch();
    if (!sel || !c) return;
    var opts = styleOptions(c);
    var wrap = $("#styleWrap");
    if (wrap) wrap.hidden = !opts.length;
    var keep = c.fightingStyle || "";
    sel.innerHTML = "<option value=''>Fighting style…</option>" + opts.map(function (o) {
      return "<option value='" + o[0] + "'" + (o[0] === keep ? " selected" : "") + ">" + o[1] + "</option>";
    }).join("");
    if (keep && !opts.some(function (o) { return o[0] === keep; })) {
      patch(function (d) { d.character.fightingStyle = ""; });
    }
  }

  function renderMelee() {
    var box = $("#meleeBox");
    var c = ch();
    if (!box || !c) return;
    var list = rules().melee || [];
    c.melee = c.melee || [{}, {}, {}, {}];
    var html = "<div class='gun-head'><span>Melee</span><span>Atk</span><span>Damage</span><span></span></div>";
    for (var i = 0; i < 4; i++) {
      var cur = (c.melee[i] && c.melee[i].weapon) || "";
      html += "<div class='gun'><select data-melee='" + i + "' aria-label='Melee " + (i + 1) + "'><option value=''>—</option>" +
        list.map(function (w) { return "<option value='" + w.id + "'" + (w.id === cur ? " selected" : "") + ">" + w.name + "</option>"; }).join("") +
        "</select><span data-melee-atk='" + i + "'></span><span data-melee-dmg='" + i + "'></span><button type='button' class='btn sm' data-melee-roll='" + i + "'>Roll</button></div>";
    }
    box.innerHTML = html;
    paintMelee();
  }
  function paintMelee() {
    var c = ch();
    var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    if (!c) return;
    var list = rules().melee || [];
    (c.melee || []).forEach(function (row, i) {
      var w = list.filter(function (x) { return x.id === row.weapon; })[0];
      var atk = $("#meleeBox [data-melee-atk='" + i + "']") || document.querySelector("[data-melee-atk='" + i + "']");
      var dmg = document.querySelector("[data-melee-dmg='" + i + "']");
      if (!w) { if (atk) atk.textContent = ""; if (dmg) dmg.textContent = ""; return; }
      var ability = /finesse/i.test(w.properties || "") ? Math.max(v.mods.STR || 0, v.mods.DEX || 0) : (v.mods.STR || 0);
      var prof = row.proficient || (root.SSDNSApp.callingProficient && root.SSDNSApp.callingProficient(w)) ? (v.prof || 0) : 0;
      var bonus = ability + prof + ((root.SSDNSApp.styleAttackBonus && root.SSDNSApp.styleAttackBonus(w)) || 0);
      var extra = (root.SSDNSApp.styleDamageBonus && root.SSDNSApp.styleDamageBonus(w)) || 0;
      if (atk) atk.textContent = (bonus >= 0 ? "+" : "") + bonus;
      if (dmg) dmg.textContent = (w.damage || "") + " " + ((ability + extra) >= 0 ? "+" : "") + (ability + extra);
    });
  }
  function rollMelee(i) {
    var c = ch();
    if (!c || !c.melee || !c.melee[i] || !c.melee[i].weapon) { toast("Pick a melee weapon."); return; }
    paintMelee();
    var atk = parseInt((document.querySelector("[data-melee-atk='" + i + "']") || {}).textContent, 10) || 0;
    var expr = (document.querySelector("[data-melee-dmg='" + i + "']") || {}).textContent || "1d4";
    var nat = 1 + Math.floor(Math.random() * 20);
    var Sheet = root.SSDNSSheet;
    var dmg = null;
    if (Sheet && Sheet.rollDamageExpr) dmg = null;
    var n = 1, sides = 4, flat = atk;
    var m = String(expr).match(/(\d*)d(\d+)/i);
    if (m) { n = Math.max(1, parseInt(m[1] || "1", 10)); sides = parseInt(m[2], 10); }
    if (nat === 20) n *= 2;
    var flatM = String(expr).replace(/(\d*)d(\d+)/i, " ").match(/([+-]\s*\d+)/);
    flat = flatM ? parseInt(flatM[1].replace(/\s/g, ""), 10) : 0;
    var rolls = [];
    for (var k = 0; k < n; k++) rolls.push(1 + Math.floor(Math.random() * sides));
    var total = rolls.reduce(function (a, b) { return a + b; }, 0) + flat;
    var name = (document.querySelector("[data-melee='" + i + "']") || {}).selectedOptions;
    name = name && name[0] ? name[0].text : "Melee";
    var line = name + " " + (atk >= 0 ? "+" : "") + atk + " = " + (nat + atk) + " · damage " + total;
    toast(line);
    if (Sheet && Sheet.addLog) Sheet.addLog({ kind: "roll", text: line, attack: true, nat: nat, crit: nat === 20, label: name });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.postRoll) {
      var quiet = $("#chkWhisper") && $("#chkWhisper").checked;
      root.SSDNSDmJoin.postRoll({ label: name + " attack", formula: "1d20" + (atk ? (atk >= 0 ? "+" : "") + atk : ""), result: nat + atk, detail: String(nat), attack: true, nat: nat, crit: nat === 20, damage: total, private: !!quiet, whisper: !!quiet });
    }
  }

  function buildUi() {
    var calling = document.querySelector(".tf-calling");
    if (calling && !$("#btnApplyKit")) {
      var actions = document.createElement("div");
      actions.className = "kit-actions";
      var kit = document.createElement("button");
      kit.type = "button"; kit.className = "btn sm"; kit.id = "btnApplyKit"; kit.textContent = "Apply starting kit";
      actions.appendChild(kit);
      var lvl = $("#btnLevelUp");
      if (lvl) actions.appendChild(lvl);
      calling.appendChild(actions);
    }
    if (!$("#pactFocus")) {
      var guns = $("#guns");
      if (guns) {
        var pact = document.createElement("div");
        pact.id = "pactFocus";
        pact.className = "pact-focus";
        pact.hidden = true;
        pact.innerHTML = "<b>Borrowed Iron</b> <span class='fine'>pact focus · no weapon stats</span> <button type='button' class='btn sm' id='btnPactShot'>Pact Shot</button>";
        guns.parentNode.insertBefore(pact, guns);
      }
    }
    if (!$("#turnPanel")) {
      var bar = $("#dmJoinBar");
      if (bar) {
        var panel = document.createElement("div");
        panel.id = "turnPanel";
        panel.className = "turn-panel";
        panel.hidden = true;
        panel.innerHTML = "<b id='turnRound'>Round 1</b> <span id='turnWho'></span> <div id='turnNames'></div>";
        bar.parentNode.insertBefore(panel, bar.nextSibling);
      }
    }
    if (calling && !$("#styleWrap")) {
      var wrap = document.createElement("label");
      wrap.id = "styleWrap"; wrap.className = "fine"; wrap.hidden = true;
      wrap.innerHTML = "Style <select id='selFightingStyle' aria-label='Fighting style'></select>";
      calling.appendChild(wrap);
    }
    var abil = document.querySelector(".abilities, #abilities, .abil");
    var anchor = $("#btnHpAuto");
    if (anchor && !$("#btnPointBuy")) {
      var pb = document.createElement("button");
      pb.type = "button"; pb.className = "btn sm"; pb.id = "btnPointBuy"; pb.textContent = "Point buy";
      anchor.parentNode.appendChild(pb);
    }
    var hpQuick = document.querySelector(".hp-quick");
    if (hpQuick && !$("#btnMainShort")) {
      var s = document.createElement("button");
      s.type = "button"; s.className = "btn sm"; s.id = "btnMainShort"; s.textContent = "Short rest"; s.title = "Spend hit dice. Short-rest features and pact slots come back.";
      var l = document.createElement("button");
      l.type = "button"; l.className = "btn sm"; l.id = "btnMainLong"; l.textContent = "Long rest"; l.title = "HP full, spell slots back, long-rest features reset.";
      hpQuick.appendChild(s); hpQuick.appendChild(l);
    }
    var init = $("#btnInit");
    if (init && !$("#globalAdv")) {
      var adv = document.createElement("label");
      adv.className = "fine";
      adv.innerHTML = "Roll <select id='globalAdv' aria-label='Advantage for checks, saves, and attacks'><option value=''>Normal</option><option value='adv'>Advantage</option><option value='dis'>Disadvantage</option></select>";
      var wh = document.createElement("label");
      wh.className = "fine";
      wh.innerHTML = "<input type='checkbox' id='chkWhisper'> Whisper to DM";
      var tgt = document.createElement("label");
      tgt.className = "fine";
      tgt.innerHTML = "Target <select id='atkTarget' aria-label='Attack target'><option value=''>No target</option></select>";
      init.parentNode.appendChild(adv);
      init.parentNode.appendChild(wh);
      init.parentNode.appendChild(tgt);
    }
    var guns = $("#guns");
    if (guns && !$("#meleeBox")) {
      var melee = document.createElement("div");
      melee.id = "meleeBox"; melee.className = "guns melee-box";
      guns.parentNode.insertBefore(melee, guns.nextSibling);
    }
    var feat = $("#taFeatures");
    if (feat && !$("#featureUses")) {
      var uses = document.createElement("div");
      uses.id = "featureUses"; uses.className = "feature-uses";
      feat.parentNode.insertBefore(uses, feat);
    }
    var dock = $("#sheetDockChat");
    if (dock && !$("#chatSendState")) {
      var st = document.createElement("span");
      st.id = "chatSendState"; st.className = "fine";
      dock.appendChild(st);
    }
    var bar = $("#dmJoinBar");
    if (bar && !$("#dmJoinBadge")) {
      var badge = document.createElement("span");
      badge.id = "dmJoinBadge"; badge.className = "dm-join-badge"; badge.hidden = true;
      bar.appendChild(badge);
    }
    if (bar && !$("#tableRoster")) {
      var roster = document.createElement("span");
      roster.id = "tableRoster"; roster.className = "fine";
      bar.appendChild(roster);
    }
    var save = $("#saveBar");
    if (save && !$("#versionBanner")) {
      var banner = document.createElement("button");
      banner.type = "button"; banner.id = "versionBanner"; banner.className = "version-banner"; banner.hidden = true;
      banner.textContent = "A newer sheet is published. Click to refresh. The page will not reload on its own.";
      save.parentNode.insertBefore(banner, save.nextSibling);
    }
    var ac = document.querySelector("[data-calc='ac']");
    if (ac) ac.title = "Armor class from armor, Dexterity, shield, and fighting style.";
    if (init) init.title = "Posts initiative to the DM turn order when you are joined.";
    var acBox = document.querySelector(".shield-box span");
    if (acBox) acBox.title = "Armor Class";
  }

  function pointBuy() {
    var c = ch();
    if (!c) return;
    var abilities = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
    var dlg = $("#dlgPoints");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "dlgPoints"; dlg.className = "dlg";
      document.body.appendChild(dlg);
    }
    var cost = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    dlg.innerHTML = "<form method='dialog'><h2>Ability scores</h2><p class='fine'>Standard array is 15, 14, 13, 12, 10, 8. Point buy starts at 8 and spends 27 points, up to 15.</p><div id='pointGrid'></div><p id='pointLeft'></p><div class='dlg-foot'><button type='button' class='btn' id='btnStandard'>Standard array</button><button type='button' class='btn' id='btnPointsOk'>Apply</button><button class='btn' value='close'>Close</button></div></form>";
    var grid = dlg.querySelector("#pointGrid");
    var scores = abilities.map(function (a) { return c.abilities && c.abilities[a] ? c.abilities[a] : 10; });
    function draw() {
      grid.innerHTML = abilities.map(function (a, i) {
        return "<label>" + a + " <input type='number' min='8' max='15' data-pb='" + i + "' value='" + scores[i] + "'></label>";
      }).join(" ");
      var spent = scores.reduce(function (sum, n) { return sum + (cost[n] || 0); }, 0);
      dlg.querySelector("#pointLeft").textContent = spent + " / 27 points";
    }
    draw();
    grid.addEventListener("input", function (e) {
      var i = e.target.getAttribute("data-pb");
      if (i == null) return;
      scores[i] = Math.max(8, Math.min(15, parseInt(e.target.value, 10) || 8));
      draw();
    });
    dlg.querySelector("#btnStandard").onclick = function () {
      scores = [15, 14, 13, 12, 10, 8];
      draw();
    };
    dlg.querySelector("#btnPointsOk").onclick = function () {
      var spent = scores.reduce(function (sum, n) { return sum + (cost[n] || 0); }, 0);
      if (spent > 27) { toast("That is more than 27 points."); return; }
      patch(function (d) {
        abilities.forEach(function (a, i) { d.character.abilities[a] = scores[i]; });
      });
      if (dlg.close) dlg.close();
    };
    if (dlg.showModal) dlg.showModal();
  }

  function offerHitDice() {
    var c = ch();
    if (!c) return;
    var raw = String(c.hitDiceLeft || "");
    var m = raw.match(/(\d+)\s*d\s*(\d+)/i);
    var left = m ? parseInt(m[1], 10) : parseInt(raw, 10);
    var sides = m ? parseInt(m[2], 10) : 8;
    if (!left) { toast("No hit dice left."); return; }
    if (!window.confirm("Spend one hit die? You have " + left + "d" + sides + " left.")) return;
    var roll = 1 + Math.floor(Math.random() * sides);
    var v = root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var gain = Math.max(1, roll + ((v.mods && v.mods.CON) || 0));
    patch(function (d) {
      var cc = d.character;
      var max = parseInt(cc.hpMax, 10) || 0;
      var cur = parseInt(cc.hpCurrent, 10) || 0;
      cc.hpCurrent = max ? Math.min(max, cur + gain) : cur + gain;
      cc.hitDiceLeft = (left - 1) + "d" + sides;
    });
    toast("Hit die " + roll + " + Con = " + gain + " HP.");
  }
  function wrapRest() {
    var Sheet = root.SSDNSSheet;
    if (!Sheet || !Sheet.applyRest || Sheet.applyRest._hit) return;
    var orig = Sheet.applyRest;
    Sheet.applyRest = function (kind) {
      orig(kind);
      var c = ch();
      if (c && c.featureUses) {
        patch(function (d) {
          Object.keys(d.character.featureUses || {}).forEach(function (name) {
            var u = d.character.featureUses[name];
            if (!u) return;
            if (kind === "long" || u.rest === "short") u.used = 0;
          });
        });
        renderUses();
      }
      if (kind === "short") offerHitDice();
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) {
        root.SSDNSSheet.addLog({
          id: "rest:" + kind + ":" + new Date().toISOString().slice(0, 16),
          kind: "alert",
          text: (kind === "long" ? "Long" : "Short") + " rest"
        });
      }
    };
    Sheet.applyRest._hit = true;
  }

  function logKey() {
    var id = "";
    try { id = (doc() && doc().id) || ""; } catch (e) {}
    return LOG_KEY + "." + (id || "local");
  }
  function readLogStore(key) {
    try {
      var raw = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function persistLogs() {
    var Sheet = root.SSDNSSheet;
    if (!Sheet || !Sheet.addLog || Sheet.addLog._persist) return;
    var key = logKey();
    var merged = readLogStore(key);
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf(LOG_KEY + ".") !== 0 || k === key) continue;
        readLogStore(k).forEach(function (row) {
          if (!row) return;
          if (!merged.some(function (e) { return e && row.id && e.id === row.id; })) merged.push(row);
        });
      }
    } catch (err) {}
    merged.sort(function (a, b) { return String(a && a.ts).localeCompare(String(b && b.ts)); });
    merged.forEach(function (row) { Sheet.addLog(row); });
    var orig = Sheet.addLog;
    Sheet.addLog = function (entry) {
      orig(entry);
      try {
        var storeKey = logKey();
        var raw = readLogStore(storeKey);
        if (entry && entry.id && raw.some(function (e) { return e && e.id === entry.id; })) return;
        raw.unshift(entry);
        localStorage.setItem(storeKey, JSON.stringify(raw.slice(0, 80)));
      } catch (e2) {}
    };
    Sheet.addLog._persist = true;
  }
  function paintDiamonds(count) {
    var c = ch();
    var n = Math.max(0, Math.min(10, Number(count) || 0));
    for (var i = 0; i < 10; i++) {
      var box = document.querySelector("[data-f='character.partyInspiration." + i + "']");
      if (box) box.checked = i < n;
      if (c && c.partyInspiration) c.partyInspiration[i] = i < n;
    }
  }

  function versionCheck() {
    var mine = (root.SSDNSApp && root.SSDNSApp.version) || "";
    fetch("version.json", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (data) {
      var live = data && data.sheet;
      var banner = $("#versionBanner");
      if (!banner || !live || !mine || live === mine) return;
      banner.hidden = false;
      banner.onclick = function () { location.reload(); };
    }).catch(function () {});
  }

  var shownTurn = "";
  function paintPact() {
    var box = $("#pactFocus");
    var c = ch();
    if (!box) return;
    box.hidden = !(c && c.calling === "pact-seeker");
  }
  function syncSheet() {
    renderMelee();
    renderStyle();
    renderUses();
    paintPact();
  }
  root.SSDNSPlaytest = {
    syncSheet: syncSheet,
    showTurn: function (init) {
      var panel = $("#turnPanel");
      if (!panel) return;
      var order = (init && Array.isArray(init.order) && init.order) || [];
      if (!order.length) { panel.hidden = true; shownTurn = ""; return; }
      panel.hidden = false;
      var round = init.round || 1;
      var turn = Number(init.turn) || 0;
      if (turn >= order.length) turn = 0;
      var cur = order[turn] || {};
      var roundEl = $("#turnRound");
      var whoEl = $("#turnWho");
      if (roundEl) roundEl.textContent = "Round " + round;
      if (whoEl) whoEl.textContent = (cur.name || "Someone") + " · " + (cur.status && cur.kind === "enemy" ? cur.status : (cur.kind === "player" ? "player" : ""));
      var names = $("#turnNames");
      if (names) {
        names.textContent = order.map(function (row, i) {
          var mark = i === turn ? "→ " : "";
          var st = row.kind === "enemy" && row.status ? " (" + row.status + ")" : "";
          return mark + (row.name || "Someone") + st;
        }).join("  ·  ");
      }
      var c = ch();
      var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
      var mine = (uid && cur.playerId && cur.playerId === uid) || (c && c.name && cur.kind === "player" && cur.name === c.name && !cur.playerId);
      panel.classList.toggle("your-turn", !!mine);
      var sig = String(round) + ":" + String(cur.id || turn);
      if (sig !== shownTurn) {
        shownTurn = sig;
        if (mine) {
          toast("Your turn");
          if (root.SSDNSAudio) root.SSDNSAudio.play("holster");
        }
      }
    },
    showRoster: function (rows) {
      var el = $("#tableRoster");
      if (!el) return;
      el.textContent = (rows || []).map(function (r) {
        return (r.online ? "● " : "○ ") + (r.name || "Someone");
      }).join("  ");
    },
    setTargets: function (map) {
      var sel = $("#atkTarget");
      if (!sel) return;
      var keep = sel.value;
      var html = "<option value=''>No target</option>";
      Object.keys(map || {}).forEach(function (id) {
        var row = map[id] || {};
        html += "<option value='" + id + "'>" + (row.name || id) + (row.status ? " (" + row.status + ")" : "") + "</option>";
      });
      sel.innerHTML = html;
      if (keep) sel.value = keep;
    },
    setDamageMode: function () {}
  };

  function boot() {
    if (!root.SSDNSApp) { setTimeout(boot, 50); return; }
    buildUi();
    renderStyle();
    renderMelee();
    renderUses();
    paintPact();
    wrapRest();
    persistLogs();
    versionCheck();
    var Sheet = root.SSDNSSheet;
    if (Sheet && Sheet.showInspiration && !Sheet.showInspiration._diamonds) {
      var orig = Sheet.showInspiration;
      Sheet.showInspiration = function (count, on) { orig(count, on); paintDiamonds(count); };
      Sheet.showInspiration._diamonds = true;
    }
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "selCalling" || t.id === "selBackground") setTimeout(maybePrompt, 0);
      if (t.id === "selCalling" || t.id === "selLineage" || t.id === "selSublineage" || t.id === "inLevel") {
        setTimeout(function () { fillFeatures(); renderStyle(); }, 0);
      }
      if (t.id === "selFightingStyle") patch(function (d) { d.character.fightingStyle = t.value; });
      if (t.id === "taFeatures") patch(function (d) { d.character.featuresCustom = true; });
      var melee = t.getAttribute && t.getAttribute("data-melee");
      if (melee != null) {
        patch(function (d) {
          d.character.melee = d.character.melee || [{}, {}, {}, {}];
          d.character.melee[melee] = d.character.melee[melee] || {};
          d.character.melee[melee].weapon = t.value;
          d.character.melee[melee].proficient = true;
        });
        paintMelee();
      }
      var fuse = t.getAttribute && t.getAttribute("data-fuse");
      if (fuse) patch(function (d) {
        if (d.character.featureUses && d.character.featureUses[fuse]) d.character.featureUses[fuse].used = parseInt(t.value, 10) || 0;
      });
    });
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "btnApplyKit") applyKit(true);
      if (t.id === "btnPactShot") {
        if (root.SSDNSSheet && root.SSDNSSheet.castNamed) root.SSDNSSheet.castNamed("Pact Shot");
        else toast("Pact Shot isn't ready.");
      }
      if (t.id === "btnPointBuy") pointBuy();
      if (t.id === "btnMainShort" && root.SSDNSSheet) root.SSDNSSheet.applyRest("short");
      if (t.id === "btnMainLong" && root.SSDNSSheet) root.SSDNSSheet.applyRest("long");
      var roll = t.getAttribute && t.getAttribute("data-melee-roll");
      if (roll != null) rollMelee(parseInt(roll, 10));
    });
    var saloon = $("#btnSaloon");
    if (saloon) saloon.addEventListener("click", function () {
      var box = $("#saloonShards");
      var c = ch();
      var Bridge = root.SSDNSBridge;
      if (!box || !c || !Bridge) return;
      var shards = Bridge.cleanShards ? Bridge.cleanShards(doc().shards) : (doc().shards || {});
      box.textContent = "Purse " + Bridge.cpValue(shards) + " ES · white " + (shards.white || 0) + " · blue " + (shards.blue || 0) + " · green " + (shards.green || 0) + " · yellow " + (shards.yellow || 0) + " · purple " + (shards.purple || 0);
    });
    var close = $("#btnSaloonClose");
    if (close) close.addEventListener("click", function () {
      var dlg = $("#dlgSaloon");
      if (dlg && dlg.close) dlg.close();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);

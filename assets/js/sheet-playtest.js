/**
 * Playtest pass: starting kits, features, fighting style, melee, rests, version banner.
 * Loaded last. Does not replace the sheet; it patches the live document.
 */
(function (root) {
  "use strict";
  var declined = "";
  var LOG_KEY = "ssdns.sheet.tableLog";
  var LOG_OLD = "ssdns.v1.tableLog";

  function $(s) { return document.querySelector(s); }
  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function ch() { var d = doc(); return d && d.character; }
  function rules() { return root.SSDNS_RULES || {}; }
  function byId(list) {
    var m = {};
    (list || []).forEach(function (x) { if (x && x.id) m[x.id] = x; });
    return m;
  }
  function toast(msg, actLabel, actFn, ms, opts) {
    if (root.SSDNSToast) return root.SSDNSToast(msg, actLabel, actFn, ms, opts);
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

  function kitApi() { return root.SSDNSKits || null; }
  var KIT_CHOICES = (kitApi() && kitApi().choices) || {
    gunslinger: [
      { id: "side", prompt: "Cavalry saber, or twin revolvers?", options: [
        { id: "saber", label: "Cavalry saber" },
        { id: "twins", label: "Twin revolvers" }
      ]},
      { id: "irons", prompt: "Which twin revolvers?", when: function (p) { return p.side === "twins"; }, options: [
        { id: "pepper", label: "Two Herringer Light Pepperboxes + 20 Light cartridges" },
        { id: "navy", label: "One Navy/Army Ball n Cap + 20 loads (powder, ball, and caps)" }
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
      var voice = (p && p.voice) || "fiddle";
      var voiceName = { fiddle: "Fiddle", banjo: "Banjo", guitar: "Guitar", voice: "Voice" };
      putMelee(c, "bowie-shortsword");
      putGun(c, "herringer-light-double-derringer");
      var derringer = (c.guns || []).filter(function (g) { return g && g.weapon === "herringer-light-double-derringer"; })[0];
      if (derringer) {
        derringer.tier = "light";
        derringer.chamber = "light|.32 Long";
        derringer.proficient = true;
      }
      addAmmo(c, "cartridge", "Light", 20);
      if (voice === "voice") addLine(c, "Voice — focus");
      else addLine(c, (voiceName[voice] || "Fiddle") + " with a strap and one spare set of strings");
      if ((p && p.kit) === "saloon") addLine(c, "Saloon kit");
      else addLine(c, "Diplomat trunk");
      addLine(c, "Duster");
      c.instrument = voice;
      if (voice !== "voice") {
        if (!c.instrumentQuality) c.instrumentQuality = "cheap";
        if (!c.instrumentStrings) c.instrumentStrings = "plain";
      }
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
      addLine(c, "Wooden shield");
      addLine(c, "Explorer pack");
      addLine(c, "Herbalism kit");
      var focus = { stick: "Carved walking stick", pouch: "Medicine pouch", soil: "Pouch of home-spring soil" };
      addLine(c, "Focus: " + (focus[p && p.focus] || focus.stick));
    },
    gunslinger: function (c, p) {
      if (kitApi()) { kitApi().apply(c, "gunslinger", p || {}); return; }
      putGun(c, "dullards-tube-rifle");
      addAmmo(c, "cartridge", "Light", 20);
      c.holster = "mexican-loop";
      c.gunBelt = true;
      addLine(c, "Duster");
      addLine(c, "Gun belt");
      addLine(c, "Mexican Loop holster");
      addLine(c, "Dungeoneer company kit");
      if ((p && p.side) === "twins" && (p && p.irons) === "navy") {
        putGun(c, "navy-army-ball-n-cap-revolver");
        addAmmo(c, "percussion", "", 20);
        addLine(c, "Powder, ball, and caps ×20");
      } else if ((p && p.side) === "twins") {
        putGun(c, "herringer-light-pepperbox");
        putGun(c, "herringer-light-pepperbox", true);
        addAmmo(c, "cartridge", "Light", 20);
      } else putMelee(c, "cavalry-saber-longsword");
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
  var kitDialogOpen = false;
  function pickKitChoices(calling, done) {
    if (kitDialogOpen) return;
    var all = KIT_CHOICES[calling] || [];
    if (!all.length) { done({}); return; }
    var picked = {};
    function pending() {
      return all.filter(function (ch) {
        if (picked[ch.id] != null) return false;
        if (ch.when && !ch.when(picked)) return false;
        if (ch.when) return true;
        return true;
      }).filter(function (ch) { return !ch.when; });
    }
    function step() {
      var choices = all.filter(function (ch) {
        if (picked[ch.id] != null) return false;
        if (!ch.when) return !Object.keys(picked).length;
        return ch.when(picked);
      });
      if (!choices.length) { kitDialogOpen = false; maybePrompt._pending = false; done(picked); return; }
      var dlg = document.getElementById("dlgKit");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "dlgKit";
        dlg.className = "dlg";
        document.body.appendChild(dlg);
      }
      kitDialogOpen = true;
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
        if (value !== "ok") { kitDialogOpen = false; maybePrompt._pending = false; done(null); return; }
        choices.forEach(function (ch) {
          var sel = dlg.querySelector("[data-kit-choice='" + ch.id + "']");
          picked[ch.id] = sel ? sel.value : ch.options[0].id;
        });
        step();
      };
      if (dlg.showModal) dlg.showModal();
      else { kitDialogOpen = false; maybePrompt._pending = false; toast("This browser can't show the kit choices."); done(null); }
    }
    void pending;
    step();
  }

  function applyKit(force, picked) {
    var c = ch();
    var known = KITS[c && c.calling] || (kitApi() && kitApi().callings.indexOf(c && c.calling) >= 0);
    if (!c || !c.calling || !known) { maybePrompt._pending = false; toast("Pick a Calling first."); return; }
    if (!force && c.kitStamp === c.calling) { maybePrompt._pending = false; toast("Starting kit is already on this sheet."); fillFeatures(); return; }
    var go = function (choice) {
      if (!choice) return;
      var keepScores = {};
      ["STR", "DEX", "CON", "INT", "WIS", "CHA"].forEach(function (id) {
        var el = document.querySelector("[data-f='character.abilities." + id + "']");
        if (el && String(el.value).trim() !== "") keepScores[id] = Number(el.value);
        else if (c.abilities && c.abilities[id] != null && c.abilities[id] !== "") keepScores[id] = c.abilities[id];
      });
      patch(function (d) {
        var cc = d.character;
        if (kitApi() && kitApi().apply) kitApi().apply(cc, cc.calling, choice);
        else if (KITS[cc.calling]) KITS[cc.calling](cc, choice);
        cc.abilities = cc.abilities || {};
        Object.keys(keepScores).forEach(function (id) { cc.abilities[id] = keepScores[id]; });
        cc.kitStamp = cc.calling;
        var bg = byId(rules().backgrounds)[cc.background];
        if (bg && bg.equipment) {
          var m = String(bg.equipment).match(/pouch with ([\d,]+) ES/i);
          if (m) grantEs(cc, parseInt(m[1].replace(/,/g, ""), 10) || 0, cc.background);
        }
      });
      fillFeatures();
      paintPact();
      renderMelee();
      if (root.SSDNSApp && root.SSDNSApp.applyAutoHp && c.hpAuto !== false) root.SSDNSApp.applyAutoHp();
      toast("Starting kit applied.");
    };
    if (picked) { go(picked); return; }
    pickKitChoices(c.calling, go);
  }
  function maybePrompt() {
    if (maybePrompt._pending || kitDialogOpen) return;
    var c = ch();
    if (!c || !c.calling || !(KITS[c.calling] || (kitApi() && kitApi().callings.indexOf(c.calling) >= 0))) return;
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
    var msg = "Apply the starting kit for " + ((cal && cal.name) || "this Calling") + "?";
    maybePrompt._pending = true;
    var ask = root.SSDNSAsk && root.SSDNSAsk.confirm ? root.SSDNSAsk.confirm(msg) : Promise.resolve(false);
    ask.then(function (ok) {
      if (!ok) {
        declined = key;
        if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: "Declined the starting kit." });
        fillFeatures();
        maybePrompt._pending = false;
        return;
      }
      applyKit(false);
      fillFeatures();
    }, function () { maybePrompt._pending = false; });
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
    if (c.calling === "gunslinger") return [["long-gun", "Long-Gun Marksmanship (+2 to hit with rifles and carbines, including Big Bore; not shotguns)"], ["sidearm", "Sidearm Duelling (+2 damage with one gun)"], ["point-blank", "Point-Blank Defense (+1 AC)"]];
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
      var finesse = /finesse/i.test(w.properties || "");
      var thrown = /thrown/i.test(w.properties || "");
      var ability = finesse ? Math.max(v.mods.STR || 0, v.mods.DEX || 0) : (v.mods.STR || 0);
      var usingDex = finesse && (v.mods.DEX || 0) > (v.mods.STR || 0);
      var prof = row.proficient || (root.SSDNSApp.callingProficient && root.SSDNSApp.callingProficient(w)) ? (v.prof || 0) : 0;
      var bonus = ability + prof + ((root.SSDNSApp.styleAttackBonus && root.SSDNSApp.styleAttackBonus(w)) || 0);
      var extra = (root.SSDNSApp.styleDamageBonus && root.SSDNSApp.styleDamageBonus(w)) || 0;
      if (c.raging && c.calling === "tribal-warrior" && !thrown && !usingDex) extra += 2;
      if (atk) atk.textContent = (bonus >= 0 ? "+" : "") + bonus;
      if (dmg) dmg.textContent = (w.damage || "") + " " + ((ability + extra) >= 0 ? "+" : "") + (ability + extra);
    });
  }
  function d20() {
    if (root.SSDNSTestRoll) {
      var forced = root.SSDNSTestRoll();
      if (forced) return forced;
    }
    return 1 + Math.floor(Math.random() * 20);
  }
  function rollMelee(i) {
    var c = ch();
    if (!c || !c.melee || !c.melee[i] || !c.melee[i].weapon) { toast("Pick a melee weapon."); return; }
    var ready = root.SSDNSSheet && root.SSDNSSheet.ensureAttackTarget;
    if (ready && !rollMelee._aimed) {
      ready().then(function (ok) {
        if (!ok) return;
        rollMelee._aimed = true;
        try { rollMelee(i); }
        finally { rollMelee._aimed = false; }
      });
      return;
    }
    var early = root.SSDNSPlaytest && root.SSDNSPlaytest.targetInfo && root.SSDNSPlaytest.targetInfo();
    var gate = root.SSDNSSheet && root.SSDNSSheet.attackGate && root.SSDNSSheet.attackGate(early);
    if (gate) { toast(gate); return; }
    if (root.SSDNSSheet && root.SSDNSSheet.attackCue) root.SSDNSSheet.attackCue("attack");
    else if (root.SSDNSAudio) root.SSDNSAudio.play("attack");
    rollMeleeNow(i);
  }
  function rollMeleeNow(i) {
    var c = ch();
    if (!c || !c.melee || !c.melee[i] || !c.melee[i].weapon) { toast("Pick a melee weapon."); return; }
    paintMelee();
    c.takingCover = false;
    var atk = parseInt((document.querySelector("[data-melee-atk='" + i + "']") || {}).textContent, 10) || 0;
    var expr = (document.querySelector("[data-melee-dmg='" + i + "']") || {}).textContent || "1d4";
    var chosen = (document.querySelector("#globalAdv") && document.querySelector("#globalAdv").value) || "";
    var faced = root.SSDNSSheet && root.SSDNSSheet.attackRoll
      ? root.SSDNSSheet.attackRoll(atk, (c && c.activeConditions) || [], chosen)
      : { nat: d20(), shown: "", note: "", n2: null };
    var nat = faced.nat;
    var miss = nat === 1;
    var crit = nat === 20;
    var n = 1, sides = 4;
    var m = String(expr).match(/(\d*)d(\d+)/i);
    if (m) { n = Math.max(1, parseInt(m[1] || "1", 10)); sides = parseInt(m[2], 10); }
    var flatM = String(expr).replace(/(\d*)d(\d+)/i, " ").match(/([+-]\s*\d+)/);
    var flat = flatM ? parseInt(flatM[1].replace(/\s/g, ""), 10) : 0;
    var diceN = crit ? n * 2 : n;
    var formula = diceN + "d" + sides + (flat ? ((flat >= 0 ? "+" : "") + flat) : "");
    var rolls = [];
    var total = 0;
    var detail = "";
    if (!miss) {
      for (var k = 0; k < diceN; k++) rolls.push(1 + Math.floor(Math.random() * sides));
      total = rolls.reduce(function (a, b) { return a + b; }, 0) + flat;
      detail = rolls.join("+") + (flat ? ((flat >= 0 ? "+" : "") + flat) : "");
    }
    var name = (document.querySelector("[data-melee='" + i + "']") || {}).selectedOptions;
    name = name && name[0] ? name[0].text : "Melee";
    var tgt = root.SSDNSPlaytest && root.SSDNSPlaytest.targetInfo && root.SSDNSPlaytest.targetInfo();
    if (tgt && tgt.id && tgt.kind !== "player") {
      var sel = $("#atkTarget");
      if (sel) sel.setAttribute("data-last-enemy", tgt.id);
    }
    var who = (c && c.name) || "You";
    var joined = root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined();
    var quiet = $("#chkWhisper") && $("#chkWhisper").checked;
    if (joined && !quiet && root.SSDNSSheet && root.SSDNSSheet.acHidden && root.SSDNSSheet.acHidden(tgt) && root.SSDNSSheet.sendPendingAttack) {
      var pendingRolls = [];
      var pendingTotal = 0;
      for (var p = 0; p < diceN; p++) pendingRolls.push(1 + Math.floor(Math.random() * sides));
      pendingTotal = pendingRolls.reduce(function (a, b) { return a + b; }, 0) + flat;
      var pendingDetail = pendingRolls.join("+") + (flat ? ((flat >= 0 ? "+" : "") + flat) : "");
      root.SSDNSSheet.sendPendingAttack({
        who: who,
        targetName: tgt.name,
        targetId: tgt.id,
        nat: nat,
        hitTotal: nat + atk,
        damage: nat === 1 ? 0 : pendingTotal,
        dice: nat === 1 ? "" : pendingDetail,
        formula: (faced.n2 == null ? "1d20" : "2d20") + ((atk >= 0 ? "+" : "") + atk),
        rollId: "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        label: name + " attack",
        weapon: name,
        sfx: "attack"
      });
      if (root.SSDNSSheet.consumeRollMode) root.SSDNSSheet.consumeRollMode();
      return;
    }
    var bonusTxt = (atk >= 0 ? "+" : "") + atk;
    var face = faced.shown || String(nat);
    var hitTotal = nat + atk;
    var haveAc = tgt && tgt.ac != null && isFinite(Number(tgt.ac));
    if (haveAc && hitTotal < Number(tgt.ac)) miss = true;
    var dmgTxt = (!miss && detail) ? (" · " + formula + " = " + total) : "";
    var verdict = (miss || haveAc) ? (miss ? "MISS" : "HIT") : "";
    var modeWord = chosen === "dis" ? " · disadvantage" : (chosen === "adv" ? " · advantage" : "");
    var line = (tgt && tgt.name ? (who + " → " + tgt.name) : who) + ": " + name + " · " + face + bonusTxt + " = " + hitTotal + (verdict ? (" → " + verdict) : "") + dmgTxt + (faced.note ? " · " + faced.note : "") + modeWord;
    if (root.SSDNSSheet && root.SSDNSSheet.consumeRollMode) root.SSDNSSheet.consumeRollMode();
    toast(line);
    var Sheet = root.SSDNSSheet;
    var rollId = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (Sheet && Sheet.addLog) Sheet.addLog({ id: "roll:" + rollId, kind: "roll", text: line, attack: true, nat: nat, crit: crit && !miss, label: name + " attack" });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined() && root.SSDNSDmJoin.postRoll) {
      var quiet = $("#chkWhisper") && $("#chkWhisper").checked;
      root.SSDNSDmJoin.postRoll({
        id: rollId,
        label: (tgt && tgt.name ? who + " → " + tgt.name : name + " attack"),
        formula: (faced.n2 == null ? "1d20" : "2d20") + bonusTxt,
        result: hitTotal,
        detail: line,
        ac: haveAc ? Number(tgt.ac) : null,
        attack: true,
        nat: nat,
        crit: crit && !miss,
        damage: miss ? 0 : total,
        targetId: tgt && tgt.id,
        targetName: tgt && tgt.name,
        private: !!quiet,
        whisper: !!quiet
      });
      if (!miss && total && tgt && tgt.id && !quiet && root.SSDNSDmJoin.postDamage) {
        root.SSDNSDmJoin.postDamage({ amount: total, label: name, type: "weapon", targetId: tgt.id, targetName: tgt.name, rollId: rollId });
      }
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
        panel.innerHTML = "<b id='turnRound'>Round 1</b> <span id='turnWho'></span> <div id='turnNames' class='turn-order-strip'></div><div id='turnDetail'></div>";
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
      adv.innerHTML = "Roll <select id='globalAdv' aria-label='Advantage for checks, saves, and attacks'><option value=''>Normal</option><option value='adv'>Advantage</option><option value='dis'>Disadvantage</option></select> <label class='fine'><input type='checkbox' id='advPin'> Pin</label>";
      var wh = document.createElement("label");
      wh.className = "fine";
      wh.innerHTML = "<input type='checkbox' id='chkWhisper'> Whisper to DM";
      var tgt = document.createElement("label");
      tgt.className = "fine";
      tgt.innerHTML = "Target <select id='atkTarget' aria-label='Attack target'><option value=''>No target</option></select> <span id='atkReveal' class='fine'></span>";
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
      if (root.SSDNSApp && root.SSDNSApp.applyAutoHp) {
        var cc = ch();
        if (cc && cc.hpAuto !== false) root.SSDNSApp.applyAutoHp();
      }
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
    var bar = $("#hitDieBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "hitDieBar";
      bar.className = "tab-warn";
      document.body.appendChild(bar);
    }
    bar.innerHTML = "";
    bar.appendChild(document.createTextNode("Short rest. Spend one hit die? " + left + "d" + sides + " left. "));
    var yes = document.createElement("button");
    yes.type = "button";
    yes.className = "btn sm";
    yes.textContent = "Spend";
    var no = document.createElement("button");
    no.type = "button";
    no.className = "btn sm";
    no.textContent = "Not now";
    yes.addEventListener("click", function () { bar.hidden = true; spendHitDie(left, sides); });
    no.addEventListener("click", function () {
      bar.hidden = true;
      if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ kind: "alert", text: "Declined spending a hit die." });
    });
    bar.appendChild(yes);
    bar.appendChild(no);
    bar.hidden = false;
  }
  function spendHitDie(left, sides) {
    if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
    var roll = 1 + Math.floor(Math.random() * sides);
    var v = root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
    var con = (v.mods && v.mods.CON) || 0;
    var gain = Math.max(1, roll + con);
    var before = 0;
    var after = 0;
    patch(function (d) {
      var cc = d.character;
      var max = parseInt(cc.hpMax, 10) || 0;
      var cur = parseInt(cc.hpCurrent, 10) || 0;
      before = cur;
      after = max ? Math.min(max, cur + gain) : cur + gain;
      cc.hpCurrent = after;
      cc.hitDiceLeft = (left - 1) + "d" + sides;
    });
    var conTxt = (con >= 0 ? "+" : "") + con;
    var detail = "1d" + sides + conTxt + " = " + gain + ", HP " + before + "→" + after;
    var line = "Hit die " + detail;
    toast(line);
    var hdId = "hd_" + Date.now().toString(36);
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ id: "roll:" + hdId, kind: "roll", text: line, label: "Hit die" });
    if (root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined() && root.SSDNSDmJoin.postRoll) {
      root.SSDNSDmJoin.postRoll({ id: hdId, label: "Hit die", formula: "1d" + sides + conTxt, result: gain, detail: detail });
    }
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
  function logSources() {
    var id = "";
    try { id = (doc() && doc().id) || ""; } catch (e) {}
    if (!id) return [LOG_KEY + ".local"];
    return [LOG_KEY + "." + id, LOG_OLD + "." + id];
  }
  function dropLogStore(skipClear) {
    try { logSources().forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    if (!skipClear && root.SSDNSSheet && root.SSDNSSheet.clearLog) root.SSDNSSheet.clearLog();
  }
  function dumpLogs() {
    var Sheet = root.SSDNSSheet;
    var rows = Sheet && Sheet.logRows ? Sheet.logRows() : [];
    var id = "";
    try { id = (doc() && doc().id) || ""; } catch (e) {}
    rows.forEach(function (row) { if (row && id && !row.characterId) row.characterId = id; });
    var mine = rows.filter(function (row) { return row && (!id || !row.characterId || row.characterId === id); });
    var json = JSON.stringify(mine.slice(0, 200));
    try { localStorage.setItem(logKey(), json); } catch (e) {}
  }
  function persistLogs() {
    var Sheet = root.SSDNSSheet;
    if (!Sheet || !Sheet.addLog || Sheet.addLog._persist) return;
    var cid = "";
    try { cid = (doc() && doc().id) || ""; } catch (e) {}
    var seen = {};
    var merged = [];
    logSources().forEach(function (k) {
      readLogStore(k).forEach(function (row) {
        if (!row) return;
        if (cid && row.characterId && row.characterId !== cid) return;
        var id = row.id || ((row.ts || "") + "|" + (row.text || ""));
        if (seen[id]) return;
        seen[id] = 1;
        if (cid) row.characterId = cid;
        merged.push(row);
      });
    });
    merged.sort(function (a, b) { return String(a && a.ts || "").localeCompare(String(b && b.ts || "")); });
    if (Sheet.mergeLog) Sheet.mergeLog(merged);
    else merged.forEach(function (row) { Sheet.addLog(row); });
    var orig = Sheet.addLog;
    Sheet.addLog = function (entry) {
      orig(entry);
      dumpLogs();
    };
    Sheet.addLog._persist = true;
    window.addEventListener("pagehide", dumpLogs);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") dumpLogs();
    });
    dumpLogs();
  }
  function showYourTurn() {
    var banner = $("#yourTurnBanner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "yourTurnBanner";
      banner.className = "your-turn-box";
      banner.textContent = "Your turn";
      document.body.appendChild(banner);
    }
    banner.hidden = false;
    toast("Your turn", "Go", function () {
      var panel = $("#turnPanel");
      if (panel) { try { panel.scrollIntoView({ block: "center" }); } catch (err) {} }
    }, 8000, { id: "your-turn" });
  }
  function hideYourTurn() {
    var banner = $("#yourTurnBanner");
    if (banner) banner.hidden = true;
    if (root.SSDNSToast && root.SSDNSToast.dismissId) root.SSDNSToast.dismissId("your-turn");
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
  var sawOrder = false;
  var lastTargets = {};
  function unusableRow(row) {
    return !!(root.SSDNSApplied && root.SSDNSApplied.isUnusableTarget && root.SSDNSApplied.isUnusableTarget(row));
  }
  function stripStatus(row) {
    var pub = (row && lastTargets[row.id]) || {};
    var revealed = pub.revealed || {};
    var copy = {
      kind: (pub.kind || (row && row.kind)) || "",
      status: pub.status || (row && row.status) || "",
      fled: !!(pub.fled || (row && row.fled) || pub.status === "Fled" || (row && row.status === "Fled")),
      hp: revealed.hp != null && revealed.hp !== "" ? revealed.hp : (pub.hp != null && pub.hp !== "" ? pub.hp : (row && row.hp)),
      maxHp: revealed.maxHp != null && revealed.maxHp !== "" ? revealed.maxHp : (pub.maxHp != null ? pub.maxHp : (row && row.maxHp)),
      conditions: pub.conditions || (row && row.conditions) || []
    };
    if (root.SSDNSApplied && root.SSDNSApplied.refreshCombatantStatus) return root.SSDNSApplied.refreshCombatantStatus(copy);
    return copy.status || "";
  }
  function turnSeenKey() {
    var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
    var code = root.SSDNSDmJoin && root.SSDNSDmJoin.roomCode && root.SSDNSDmJoin.roomCode();
    var cid = "";
    try { cid = (doc() && doc().id) || ""; } catch (e) {}
    return "ssdns.sheet.turnSeen." + (code || "none") + "." + (cid || uid || "local");
  }
  function loadTurnSeen() {
    try { return JSON.parse(localStorage.getItem(turnSeenKey()) || "{}") || {}; } catch (e) { return {}; }
  }
  function saveTurnSeen(seen) {
    try { localStorage.setItem(turnSeenKey(), JSON.stringify(seen || {})); } catch (e) {}
  }
  function markTurnSeen(id) {
    var seen = loadTurnSeen();
    seen[id] = 1;
    saveTurnSeen(seen);
  }
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
    showYourTurn: showYourTurn,
    showTurn: function (init) {
      var panel = $("#turnPanel");
      if (!panel) return;
      var order = (init && Array.isArray(init.order) && init.order) || [];
      var roundEl = $("#turnRound");
      var whoEl = $("#turnWho");
      var names = $("#turnNames");
      if (!order.length) {
        var inRoom = root.SSDNSDmJoin && root.SSDNSDmJoin.isJoined && root.SSDNSDmJoin.isJoined();
        var room = root.SSDNSDmJoin && root.SSDNSDmJoin.roomCode && root.SSDNSDmJoin.roomCode();
        var endedId = "combat-ended:" + (room || "");
        if (inRoom && room && sawOrder && !loadTurnSeen()[endedId]) {
          markTurnSeen(endedId);
          if (root.SSDNSSheet && root.SSDNSSheet.addLog) {
            root.SSDNSSheet.addLog({ id: endedId, kind: "alert", text: "Combat ended" });
          }
        }
        panel.hidden = true;
        panel.classList.remove("your-turn");
        if (roundEl) roundEl.textContent = "";
        if (whoEl) whoEl.textContent = "";
        if (names) names.textContent = "";
        shownTurn = "";
        sawOrder = false;
        hideYourTurn();
        return;
      }
      sawOrder = true;
      var seen = loadTurnSeen();
      Object.keys(seen).forEach(function (k) { if (k.indexOf("combat-ended:") === 0) delete seen[k]; });
      saveTurnSeen(seen);
      panel.hidden = false;
      var round = init.round || 1;
      var turn = Number(init.turn) || 0;
      if (turn >= order.length) turn = 0;
      var cur = order[turn] || {};
      var c = ch();
      var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
      var mine = (uid && cur.playerId && cur.playerId === uid) || (c && c.name && cur.kind === "player" && cur.name === c.name && !cur.playerId);
      if (roundEl) roundEl.textContent = "Round " + round;
      if (whoEl) whoEl.textContent = (cur.name || "Someone") + " · " + (cur.kind === "enemy" ? (stripStatus(cur) || "") : (cur.kind === "player" ? "player" : ""));
      if (names) {
        names.innerHTML = order.map(function (row, i) {
          var raw = String(row.name || "Someone");
          var letters = raw.replace(/[^A-Za-z]/g, "");
          var initials = (letters.slice(0, 1) + (letters.length > 1 ? letters.slice(-1) : "")).toUpperCase() || "?";
          var dist = (i - turn + order.length) % order.length;
          var cls = "turn-chip" + (i === turn ? " current" : "") + (dist > 0 && dist <= 2 ? " ondeck" : "") + (row.kind === "enemy" ? " enemy" : " player");
          return "<span class='" + cls + "' title='" + raw.replace(/'/g, "") + "'><b>" + initials + "</b> " + raw + "</span>";
        }).join("");
      }
      var detail = $("#turnDetail");
      if (detail) {
        var guns = cur.guns || [];
        var mineGuns = mine && ch() && ch().guns;
        detail.innerHTML = "<p class='fine'>" + (cur.name || "") + (mine ? " — your turn" : "") + "</p>" + (mineGuns || guns).map(function (g, i) {
          if (!g || !(g.name || g.weapon)) return "";
          var chambers = g.chambers || [];
          var dots = chambers.map(function (st, k) {
            var full = !!st;
            if (mine) return "<button type='button' class='chamber-dot" + (full ? " full" : "") + "' data-gunroll='" + i + "' data-k='" + k + "' aria-label='Chamber " + (k + 1) + "'></button>";
            return "<span class='chamber-dot" + (full ? " full" : "") + "'></span>";
          }).join("");
          return "<div class='cylinder-row'><span>" + (g.name || g.weapon) + "</span> " + dots + "</div>";
        }).join("");
      }
      panel.classList.toggle("your-turn", !!mine);
      var sig = "turn:" + String(round) + ":" + String(cur.id || turn);
      if (sig !== shownTurn) {
        shownTurn = sig;
        if (mine && !loadTurnSeen()[sig]) { markTurnSeen(sig); showYourTurn(); }
        else hideYourTurn();
      }
    },
    targetInfo: function () {
      var sel = $("#atkTarget");
      if (!sel || !sel.selectedOptions || !sel.selectedOptions[0] || !sel.value) return null;
      var opt = sel.selectedOptions[0];
      var acRaw = opt.getAttribute("data-ac");
      var ac = acRaw == null || acRaw === "" ? null : Number(acRaw);
      return { id: sel.value, name: opt.getAttribute("data-name") || opt.textContent || "", ac: isFinite(ac) ? ac : null, kind: opt.getAttribute("data-kind") || "" };
    },
    paintReveal: function () {
      var note = $("#atkReveal");
      var sel = $("#atkTarget");
      if (!note || !sel || !sel.selectedOptions || !sel.selectedOptions[0]) { if (note) note.textContent = ""; return; }
      var opt = sel.selectedOptions[0];
      note.textContent = opt.getAttribute("data-reveal") || "";
    },
    showRoster: function (rows) {
      var el = $("#tableRoster");
      if (!el) return;
      el.textContent = (rows || []).map(function (r) {
        return (r.online ? "● " : "○ ") + (r.name || "Someone");
      }).join("  ");
    },
    setTargets: function (map) {
      lastTargets = map || {};
      var sel = $("#atkTarget");
      if (!sel) return;
      var keep = sel.value;
      var uid = root.SSDNSDmJoin && root.SSDNSDmJoin.uid && root.SSDNSDmJoin.uid();
      var c = ch();
      var selfName = c && c.name;
      var rows = Object.keys(map || {}).map(function (id) {
        var row = map[id] || {};
        row.id = id;
        return row;
      });
      function rank(row) {
        var self = row.kind === "player" && ((uid && row.playerId === uid) || (selfName && row.name === selfName));
        if (self) return 2;
        if (row.kind === "player") return 1;
        return 0;
      }
      rows.sort(function (a, b) { return rank(a) - rank(b); });
      var html = "<option value=''>No target</option>";
      rows.forEach(function (row) {
        var revealed = row.revealed || {};
        var ac = revealed.ac == null || revealed.ac === "" ? "" : String(revealed.ac);
        var name = String(row.name || row.id);
        var hpAttr = revealed.hp == null || revealed.hp === "" ? "" : String(revealed.hp);
        var conds = Array.isArray(row.conditions) ? row.conditions.filter(Boolean).join(", ") : "";
        var bits = [];
        if (row.status) bits.push(String(row.status));
        if (conds) bits.push(conds);
        if (revealed.hp != null && revealed.hp !== "") bits.push(String(revealed.hp) + "/" + (revealed.maxHp == null || revealed.maxHp === "" ? "?" : revealed.maxHp) + " HP");
        if (ac) bits.push("AC " + ac);
        var blockNote = "";
        if (revealed.block) {
          var block = revealed.block;
          var attacks = Array.isArray(block.attacks) ? block.attacks.map(function (atk) { return (atk && atk.name) || ""; }).filter(Boolean).join(", ") : "";
          blockNote = [
            block.tactics ? ("Tactics. " + block.tactics) : "",
            attacks ? ("Attacks. " + attacks) : "",
            block.saves ? ("Saves. " + JSON.stringify(block.saves)) : ""
          ].filter(Boolean).join(" · ");
        }
        var label = name + (bits.length ? " (" + bits.join(" · ") + ")" : "");
        html += "<option value='" + String(row.id).replace(/'/g, "") + "' data-ac='" + ac.replace(/'/g, "") + "' data-hp='" + hpAttr.replace(/'/g, "") + "' data-status='" + String(row.status || "").replace(/'/g, "") + "' data-side='" + String(row.side || "").replace(/'/g, "") + "' data-fled='" + (row.fled || row.status === "Fled" ? "1" : "0") + "' data-conds='" + conds.replace(/'/g, "") + "' data-kind='" + String(row.kind || "").replace(/'/g, "") + "' data-name='" + name.replace(/[&<>"']/g, "") + "' data-reveal='" + blockNote.replace(/'/g, "") + "'>" +
          label.replace(/[&<>]/g, "") + "</option>";
      });
      sel.innerHTML = html;
      var kept = keep && rows.some(function (row) { return String(row.id) === String(keep) && !unusableRow(row); });
      if (kept) sel.value = keep;
      else sel.value = "";
      var last = sel.getAttribute("data-last-enemy") || "";
      if (last && rows.some(function (row) { return String(row.id) === String(last) && unusableRow(row); })) sel.removeAttribute("data-last-enemy");
      if (!sel._revealBound) {
        sel._revealBound = true;
        sel.addEventListener("change", function () { if (root.SSDNSPlaytest.paintReveal) root.SSDNSPlaytest.paintReveal(); });
      }
      if (root.SSDNSPlaytest.paintReveal) root.SSDNSPlaytest.paintReveal();
    },
    setDamageMode: function () {},
    dropLogStore: dropLogStore
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
      if (t.id === "selBackground") setTimeout(function () {
        var cnow = ch();
        var bg = cnow && byId(rules().backgrounds)[cnow.background];
        if (cnow && cnow.kitStamp === cnow.calling && bg && /pouch with/i.test(bg.equipment || "") && !(cnow.kitGrants && cnow.kitGrants.es === cnow.background)) {
          patch(function (d) {
            var m = String(bg.equipment).match(/pouch with ([\d,]+) ES/i);
            if (m) grantEs(d.character, parseInt(m[1].replace(/,/g, ""), 10) || 0, d.character.background);
          });
        }
      }, 0);
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

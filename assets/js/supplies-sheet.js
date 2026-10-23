/**
 * L0188 food & water + exhaustion on the player sheet.
 *   SSDNSCondFx       : exhaustion math shown on the sheet (speed, HP max, death) and a toast
 *                       that says what a new condition does. Runs after every renderConds.
 *   SSDNSSuppliesSheet: the read-only Supplies box, DM "supplies" commands, the DC 15 Con save popup.
 * Exhaustion stays the one Exhaustion condition (Conditions tab / DMCC / room conditions path).
 */
(function (root) {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function doc() { return root.SSDNSApp && root.SSDNSApp.doc ? root.SSDNSApp.doc() : null; }
  function ch() { var d = doc(); return d && d.character; }
  function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (x) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]; }); }
  function toast(msg, act, fn, ms, opts) {
    if (root.SSDNSToast) return root.SSDNSToast(msg, act, fn, ms, opts);
    var t = $("#toastText"), box = $("#toast");
    if (t && box) { t.textContent = msg; box.hidden = false; }
  }
  function log(text) {
    if (root.SSDNSSheet && root.SSDNSSheet.addLog) root.SSDNSSheet.addLog({ id: "supplies:" + Date.now() + Math.random().toString(36).slice(2, 5), kind: "alert", text: text });
  }
  function condList(c) {
    if (!c) return [];
    if (Array.isArray(c.activeConditions) && c.activeConditions.length) return c.activeConditions;
    return String(c.tableConditions || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function level(c) {
    var Cond = root.SSDNSConditions;
    return Cond && Cond.exhaustionLevel ? Cond.exhaustionLevel(condList(c)) : 0;
  }
  function rowsOf(c) {
    var Cond = root.SSDNSConditions;
    return condList(c).map(function (raw) {
      if (typeof raw === "string") {
        var m = /^exhaustion\s*(\d+)?/i.exec(raw);
        raw = m ? { name: "Exhaustion", level: parseInt(m[1] || "1", 10) } : { name: raw.replace(/\s+\d+r$/, "") };
      }
      return Cond ? Cond.normalize(raw) : raw;
    }).filter(Boolean);
  }

  /* ------------------------------------------------------------ condition effects + toasts */
  var fx = { c: null, map: null, lv: 0, reason: "" };
  function myUid() { return root.SSDNSDmJoin && root.SSDNSDmJoin.uid ? root.SSDNSDmJoin.uid() : ""; }
  function after(c) {
    c = c || ch();
    if (!c) return;
    var rows = rowsOf(c);
    var map = {};
    rows.forEach(function (r) { map[r.name] = r.level || 0; });
    var lv = level(c);
    if (fx.c !== c || !fx.map) {
      /* first look at this character (load, switch): no toasts for what was already on */
      fx.c = c; fx.map = map; fx.lv = lv;
      paint(c, lv);
      return;
    }
    var Cond = root.SSDNSConditions;
    var gained = rows.filter(function (r) {
      if (!(r.name in fx.map)) return true;
      return r.name === "Exhaustion" && r.level !== fx.map[r.name];
    });
    var before = fx.lv;
    fx.map = map; fx.lv = lv;
    var reason = fx.reason; fx.reason = "";
    gained.forEach(function (r) {
      var who = "";
      if (reason) who = reason;
      else if (r.by && r.by !== "self" && r.by !== "hp" && r.by !== myUid() && r.byName) who = r.byName + " applied";
      var text = Cond && Cond.effectText ? Cond.effectText(r) : r.name;
      if (r.name === "Exhaustion" && r.level < (before || 0)) who = (who ? who + " · " : "") + "down from " + before;
      condToast(who, r.name === "Exhaustion" ? "Exhaustion " + r.level : r.name, text.replace(/^[^:]*:\s*/, ""));
    });
    if (before && !lv && !("Exhaustion" in map)) condToast(reason || "", "Exhaustion cleared", "Back to normal.");
    if (lv >= 6 && before < 6) dieOfExhaustion();
    paint(c, lv);
  }
  /* A clear card of its own (not the shared toast queue): what you got and what it does. */
  function condToast(who, title, what) {
    if (!root.document || !document.body) return;
    var box = document.getElementById("condToast");
    if (!box) {
      box = document.createElement("div");
      box.id = "condToast";
      box.className = "cond-toast";
      box.setAttribute("role", "alert");
      box.setAttribute("aria-live", "assertive");
      document.body.appendChild(box);
      box.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("[data-cond-ok]") : null;
        if (!b) return;
        var card = b.closest(".cond-toast-card");
        if (card) card.remove();
        if (!box.children.length) box.hidden = true;
      });
    }
    var card = document.createElement("div");
    card.className = "cond-toast-card";
    card.innerHTML = '<div class="ct-text"><span class="ct-who"></span><b class="ct-title"></b><span class="ct-what"></span></div><button type="button" class="btn sm" data-cond-ok>OK</button>';
    card.querySelector(".ct-who").textContent = who || "";
    card.querySelector(".ct-title").textContent = title;
    card.querySelector(".ct-what").textContent = what;
    box.appendChild(card);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    box.hidden = false;
    setTimeout(function () { if (card.parentNode) card.remove(); if (!box.children.length) box.hidden = true; }, 10000);
  }
  function dieOfExhaustion() {
    var c = ch();
    if (!c) return;
    if (root.SSDNSSheet && root.SSDNSSheet.setHp) root.SSDNSSheet.setHp(0, 0);
    if (!c.deathSaves) c.deathSaves = { success: [false, false, false], fail: [false, false, false] };
    c.deathSaves.fail = [true, true, true];
    [0, 1, 2].forEach(function (i) {
      var box = document.querySelector('[data-f="character.deathSaves.fail.' + i + '"]');
      if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true })); }
    });
    log("Exhaustion 6: " + (c.name || "You") + " died.");
  }
  function effSpeed(c) {
    var Cond = root.SSDNSConditions;
    if (!c) return "";
    return Cond && Cond.exhaustedSpeed ? Cond.exhaustedSpeed(c.speed, level(c)) : c.speed;
  }
  function badge(host, id, text) {
    if (!host) return;
    var b = document.getElementById(id);
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement("span"); b.id = id; b.className = "exh-badge"; host.appendChild(b); }
    b.textContent = text;
  }
  function paint(c, lv) {
    if (!root.document || !document.body) return;
    var Cond = root.SSDNSConditions;
    for (var i = 1; i <= 6; i++) document.body.classList.toggle("exh-" + i, lv === i);
    document.body.classList.toggle("exh-on", lv > 0);
    var speedEl = document.querySelector("[data-f='character.speed']");
    var sp = num(c && c.speed, NaN);
    badge(speedEl && speedEl.parentNode, "exhSpeed", lv >= 2 && isFinite(sp) ? (lv >= 5 ? "0 ft (exhaustion " + lv + ")" : Math.floor(sp / 2) + " ft (halved)") : "");
    var maxEl = $("#inHPMax");
    var mx = num(c && c.hpMax, NaN);
    badge(document.querySelector("label[for='inHPMax']") || (maxEl && maxEl.parentNode), "exhHp", lv >= 4 && isFinite(mx) && mx > 0 ? "Counts as " + Math.max(1, Math.floor(mx / 2)) + " (halved)" : "");
    var note = $("#exhNote");
    if (!note) {
      var banner = $("#condBanner");
      if (banner && banner.parentNode) {
        note = document.createElement("div");
        note.id = "exhNote";
        note.className = "exh-note";
        banner.parentNode.insertBefore(note, banner.nextSibling);
      }
    }
    if (note) {
      if (!lv) { note.hidden = true; note.textContent = ""; }
      else {
        note.hidden = false;
        var e = Cond.exhaustionEffects(lv);
        var bits = [];
        if (e.checkDis) bits.push("Ability checks (and initiative) roll with disadvantage.");
        if (e.speedZero) bits.push("Speed is 0.");
        else if (e.speedHalf && isFinite(sp)) bits.push("Speed " + sp + " → " + Math.floor(sp / 2) + " ft.");
        if (e.attackDis) bits.push("Attacks and saves roll with disadvantage.");
        if (e.hpHalf && isFinite(mx)) bits.push("HP max " + mx + " → " + Math.max(1, Math.floor(mx / 2)) + ".");
        if (e.dead) bits = ["Dead of exhaustion."];
        note.innerHTML = "<b>Exhaustion " + lv + "</b> " + esc(bits.join(" "));
      }
    }
    /* 4+: current HP can't sit above the halved max */
    if (lv >= 4 && isFinite(mx) && mx > 0) {
      var cap = Math.max(1, Math.floor(mx / 2));
      var cur = num(c.hpCurrent, NaN);
      if (isFinite(cur) && cur > cap && !fx.clamping && root.SSDNSSheet && root.SSDNSSheet.setHp) {
        fx.clamping = true;
        c.hpCurrent = cap;
        try { root.SSDNSSheet.setHp(cap); } finally { fx.clamping = false; }
      }
    }
    paintSupplies(c);
  }

  /* ------------------------------------------------------------ supplies box */
  function waterWhere(c) {
    var I = root.SSDNSItems;
    var inC = 0, list = (c && c.items) || [];
    list.forEach(function (it) { if (it && Number(it.capacity) > 0) inC += Math.max(0, Number(it.fill) || 0); });
    var loose = c && c.supplies ? Number(c.supplies.water) || 0 : 0;
    if (!inC) return "";
    return "; " + (Math.round(inC * 100) / 100) + " in containers" + (loose ? ", " + loose + " loose" : "");
  }
  function paintSupplies(c) {
    var S = root.SSDNSSupplies;
    if (!S || !root.document) return;
    var box = $("#suppliesBox");
    if (!box) {
      var anchor = $("#exhNote") || $("#condBanner");
      if (!anchor || !anchor.parentNode) return;
      box = document.createElement("section");
      box.id = "suppliesBox";
      box.className = "supplies-box";
      box.setAttribute("aria-label", "Food and water");
      anchor.parentNode.insertBefore(box, anchor.nextSibling);
      /* the one thing the player sets here: whether their leftovers can feed the party */
      box.addEventListener("change", function (e) {
        if (!e.target || e.target.id !== "supShare") return;
        var on = !!e.target.checked;
        patch(function (ch2) { root.SSDNSSupplies.ensure(ch2).share = on; });
        log(on ? "You share your leftover food and water with the party." : "You keep your food and water to yourself.");
      });
      box.addEventListener("click", function (e) {
        var b = e.target.closest ? e.target.closest("#btnEat") : null;
        if (!b) return;
        var res = null;
        patch(function (ch2) { res = root.SSDNSSupplies.eatNow(ch2); });
        if (!res) return;
        if (!res.ok) { log(res.reason); return; }
        var bits = [];
        if (res.ate) bits.push(res.ate + " meal" + (res.ate === 1 ? "" : "s"));
        if (res.drank) bits.push(res.drank + " gal");
        log("You eat and drink now (" + bits.join(", ") + "). The end of the day won't spend that again.");
      });
    }
    if (!c) { box.hidden = true; return; }
    var v = S.view(c);
    if (v.mode === "off") { box.hidden = true; box.innerHTML = ""; return; }
    var conMod = 0;
    try { var cv = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : null; conMod = num(cv && cv.mods && cv.mods.CON); } catch (e) {}
    var limit = S.foodLimit(conMod);
    var fedPct = Math.max(0, Math.min(100, Math.round((1 - Math.min(v.daysHungry, limit) / limit) * 100)));
    var waterPct = Math.max(0, Math.min(100, Math.round(Math.min(1, v.water) * 100)));
    var prepaidTxt = (v.prepaid && (v.prepaid.food || v.prepaid.water))
      ? " Already eaten today: " + (v.prepaid.food || 0) + " meal, " + (v.prepaid.water || 0) + " gal."
      : "";
    var last = v.last;
    var lastTxt = "";
    if (last) {
      lastTxt = "Day " + last.day + ": " + (last.food === "full" ? "ate" : last.food === "half" ? "half rations" : "no food") +
        ", drank " + last.drank + "/" + last.need + " gal" + (last.hot ? " (hot)" : "") +
        (last.save === "pending" ? ", Con save waiting" : last.save ? ", Con save " + last.save : "") +
        (last.gain ? (v.mode === "strict" ? ", +" + last.gain + " exhaustion" : ", 5e says +" + last.gain + " exhaustion (DM decides)") : "") +
        (last.restDrop ? ", rest -1 exhaustion" : "") + ".";
    }
    box.hidden = false;
    box.innerHTML =
      '<div class="sup-head"><h3>Food &amp; water</h3><span class="fine">' + (v.mode === "strict" ? "Strict: the sheet tracks exhaustion" : "Loose: the DM hands out exhaustion") + " · the DM keeps these counts</span></div>" +
      '<div class="sup-row">' +
      '<div class="sup-cell" data-sup="rations"><b>' + esc(v.rations) + '</b><span>Rations</span><small>Meals in food items (Hardtack and Jerky, packs…), 1 a day</small></div>' +
      '<div class="sup-cell" data-sup="water"><b>' + esc(v.water) + ' gal</b><span>Water</span><small>1 gal a day (2 if hot), 8 lb a gal' + waterWhere(c) + '</small></div>' +
      '<div class="sup-cell' + (v.daysHungry > limit ? " bad" : "") + '" data-sup="hungry"><b>' + esc(v.daysHungry) + " / " + limit + '</b><span>Days without food</span><small>Safe for 3 + Con mod days</small></div>' +
      "</div>" +
      '<div class="sup-meters" aria-label="Hunger and thirst">' +
      '<div class="sup-meter"><span>Fed</span><span class="sup-track"><span class="sup-fill" style="width:' + fedPct + '%"></span></span><small>' + esc(v.daysHungry) + " / " + limit + " days without</small></div>" +
      '<div class="sup-meter"><span>Water</span><span class="sup-track"><span class="sup-fill water" style="width:' + waterPct + '%"></span></span><small>' + esc(v.water) + " gal (1 gal covers today)</small></div>" +
      "</div>" +
      '<div class="sup-eat"><button type="button" class="btn sm" id="btnEat">Eat</button><span class="fine">1 meal and up to 1 gal now. Counts toward today so the end of the day does not spend it twice.' + esc(prepaidTxt) + "</span></div>" +
      '<label class="toggle sup-share" title="On: at the end of a day, your leftover food and water can cover party members who are short. Off: yours stays yours (others who share can still cover you)."><input type="checkbox" id="supShare"' + (v.share !== false ? " checked" : "") + "> Share with party</label>" +
      (lastTxt ? '<p class="fine sup-last">' + esc(lastTxt) + "</p>" : "");
    if (v.pendingSave && v.mode === "strict" && !saveOpen) openSave();
  }

  /* ------------------------------------------------------------ exhaustion writes (existing condition path) */
  function setExhaustion(next, reason) {
    var c = ch();
    if (!c) return;
    var cur = level(c);
    next = Math.max(0, Math.min(6, Math.floor(num(next))));
    if (next === cur) return;
    fx.reason = reason || "";
    var UI = root.SSDNSConditionsUi;
    if (UI && UI.toggle) {
      if (next === 0) UI.toggle("Exhaustion", cur);
      else UI.toggle("Exhaustion", next, null, true);
    }
    log((reason ? reason + ": " : "") + "Exhaustion " + cur + " → " + next + ".");
  }

  function patch(fn) {
    if (root.SSDNSApp && root.SSDNSApp.applyPatch) root.SSDNSApp.applyPatch(function (d) { if (d && d.character) fn(d.character); });
    else { var c = ch(); if (c) fn(c); }
    if (root.SSDNSItems && root.SSDNSItems.paintSheet) { try { root.SSDNSItems.paintSheet(); } catch (e) {} }
    paintSupplies(ch());
  }
  function mods() {
    try {
      var v = root.SSDNSApp && root.SSDNSApp.compute ? root.SSDNSApp.compute() : {};
      return { con: num(v.mods && v.mods.CON), save: num(v.saves && v.saves.CON, num(v.mods && v.mods.CON)) };
    } catch (e) { return { con: 0, save: 0 }; }
  }

  function command(payload) {
    payload = payload || {};
    var S = root.SSDNSSupplies;
    var c = ch();
    if (!S || !c) return null;
    var op = payload.op || "";
    var out = null;
    if (payload.mode && { off: 1, loose: 1, strict: 1 }[payload.mode]) patch(function (ch2) { S.ensure(ch2).mode = payload.mode; });
    if (op === "mode") {
      log("DM set food & water to " + payload.mode + ".");
      return null;
    }
    if (op === "give") {
      var r = num(payload.rations), w = num(payload.water);
      patch(function (ch2) { if (r) S.giveRations(ch2, r); if (w) S.giveWater(ch2, w); });
      var bits = [];
      if (r) bits.push((r > 0 ? "+" : "") + r + " ration" + (Math.abs(r) === 1 ? "" : "s"));
      if (w) bits.push((w > 0 ? "+" : "") + w + " gal water");
      if (bits.length) { toast("DM: " + bits.join(", ") + "."); log("DM supplies: " + bits.join(", ") + "."); }
      return null;
    }
    if (op === "set_hungry") {
      patch(function (ch2) { S.ensure(ch2).daysHungry = Math.max(0, num(payload.days)); });
      return null;
    }
    if (op === "tick") {
      /* a save still waiting from an earlier day is rolled now with its saved dice, so none is lost */
      var old = S.ensure(c).pendingSave;
      if (old) {
        var openDlg = document.querySelector("dialog.supplies-save");
        if (openDlg) {
          document.body.classList.remove("ask-open");
          var sh = document.getElementById("sheet"); if (sh) sh.removeAttribute("inert");
          try { if (openDlg.close) openDlg.close(); } catch (e) {}
          if (openDlg.parentNode) openDlg.parentNode.removeChild(openDlg);
        }
        saveOpen = false;
        saveToken++;
        var oNat = old.dis ? Math.min(old.rolls[0], old.rolls[1]) : old.rolls[0];
        finishSave(old, oNat, S.resolveSave(oNat, old.mod, old));
      }
      var m = mods();
      var lv = level(c);
      var adj = payload.adjust || null;
      patch(function (ch2) {
        /* party sharing planned by the DMCC: what this player gives (-) or gets (+) before eating */
        if (adj) {
          if (Number(adj.rations)) S.giveRations(ch2, Number(adj.rations));
          if (Number(adj.water)) S.giveWater(ch2, Number(adj.water));
        }
        out = S.tick(ch2, { hot: !!payload.hot, half: !!payload.half, conMod: m.con, exhaustion: lv, longRest: !!payload.longRest });
        var s = S.ensure(ch2);
        if (out.save && s.mode === "strict") {
          var dis = root.SSDNSConditions && root.SSDNSConditions.rollMode && root.SSDNSConditions.rollMode(condList(ch2), "save", "") === "dis";
          s.pendingSave = { id: "sv_" + Date.now().toString(36), dc: out.save.dc, gain: out.save.gain, mod: m.save, dis: !!dis,
            rolls: [1 + Math.floor(Math.random() * 20), 1 + Math.floor(Math.random() * 20)], hot: !!payload.hot };
        } else if (out.save) {
          s.last.save = "the DM's call";
        }
      });
      var s2 = S.ensure(ch());
      (payload.shared || []).forEach(function (line) { log("Party: " + line + "."); });
      log("End of day " + s2.day + (payload.longRest ? " (long rest)" : "") + ": " + out.lines.join(" "));
      if (s2.mode === "strict") {
        var net = out.gain - out.restDrop;
        if (net) setExhaustion(lv + net, out.waterGain && out.foodGain ? "Hunger and thirst" : out.waterGain ? "Thirst" : out.foodGain ? "Hunger" : "Long rest");
        else if (!out.save) toast("End of day: " + out.lines.join(" "), "OK", null, 7000);
        if (s2.pendingSave) openSave();
      } else {
        toast("End of day: " + out.lines.join(" "), "OK", null, 8000);
      }
      return out;
    }
    return null;
  }

  /* ------------------------------------------------------------ DC 15 Con save popup (Fouled d4 pattern) */
  var saveOpen = false;
  var saveToken = 0;
  function openSave() {
    var c = ch();
    var S = root.SSDNSSupplies;
    if (!c || !S || !root.document || !document.body) return Promise.resolve(null);
    var pending = S.ensure(c).pendingSave;
    if (!pending || saveOpen) return Promise.resolve(null);
    saveOpen = true;
    var myToken = ++saveToken;
    return new Promise(function (resolve) {
      var dlg = document.createElement("dialog");
      dlg.className = "dlg d4-reveal supplies-save";
      dlg.innerHTML = "<form method='dialog'><h2>Thirst: Con save</h2>" +
        "<p class='fine sup-why'></p>" +
        "<p class='d4-face' id='supSaveFace'>Click the die</p>" +
        "<button type='button' class='btn btn-primary d4-die sup-d20' id='supSaveBtn'>d20</button></form>";
      var gain = pending.gain || 1;
      dlg.querySelector(".sup-why").textContent = "You only had half the water you need" + (pending.hot ? " on a hot day" : "") +
        ". DC " + pending.dc + " Constitution save (" + (pending.mod >= 0 ? "+" : "") + pending.mod + (pending.dis ? ", disadvantage from exhaustion" : "") +
        "). Fail: +" + gain + " exhaustion" + (gain === 2 ? " (you're already exhausted)" : "") + ".";
      var face = dlg.querySelector("#supSaveFace");
      var btn = dlg.querySelector("#supSaveBtn");
      var sheet = document.getElementById("sheet");
      document.body.classList.add("ask-open");
      if (sheet) sheet.setAttribute("inert", "");
      var done = false;
      btn.addEventListener("click", function () {
        if (done || myToken !== saveToken) return;
        done = true;
        var a = pending.rolls[0], b = pending.rolls[1];
        var nat = pending.dis ? Math.min(a, b) : a;
        var res = S.resolveSave(nat, pending.mod, pending);
        if (root.SSDNSAudio) root.SSDNSAudio.play("roll");
        btn.textContent = String(nat);
        face.textContent = (pending.dis ? "d20 " + a + " / " + b + " → " + nat : "d20 " + nat) + " " + (pending.mod >= 0 ? "+ " : "- ") + Math.abs(pending.mod) + " = " + res.total + (res.pass ? " — PASS" : " — FAIL");
        dlg.classList.add(res.pass ? "pass" : "fail");
        setTimeout(function () {
          if (myToken !== saveToken) { resolve(null); return; }
          document.body.classList.remove("ask-open");
          if (sheet) sheet.removeAttribute("inert");
          try { if (dlg.close) dlg.close(); } catch (e) {}
          if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
          saveOpen = false;
          finishSave(pending, nat, res);
          resolve(res);
        }, 1100);
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); });
      document.body.appendChild(dlg);
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    });
  }
  function finishSave(pending, nat, res) {
    var S = root.SSDNSSupplies;
    var lv = level(ch());
    patch(function (c) {
      var s = S.ensure(c);
      s.pendingSave = null;
      if (s.last) s.last.save = res.pass ? "passed" : "failed";
      if (s.last && !res.pass) s.last.gain = num(s.last.gain) + res.gain;
    });
    var detail = (pending.dis ? pending.rolls[0] + " / " + pending.rolls[1] + " → " + nat : String(nat)) + (pending.mod >= 0 ? "+" : "") + pending.mod + (pending.dis ? " (disadvantage)" : "");
    if (root.SSDNSSheet && root.SSDNSSheet.postCheck) root.SSDNSSheet.postCheck("CON save (thirst, DC " + res.dc + ")", (pending.dis ? "2d20" : "1d20") + (pending.mod >= 0 ? "+" : "") + pending.mod, res.total, detail + (res.pass ? " · pass" : " · fail"), nat === 1, false);
    if (!res.pass) setExhaustion(lv + res.gain, "Thirst (failed DC " + res.dc + " Con save)");
  }

  if (root.document) {
    var boot = function () {
      setInterval(function () { var c = ch(); if (c) after(c); }, 1500);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  root.SSDNSCondFx = { after: after, toast: condToast, level: level, speed: effSpeed, paint: function () { var c = ch(); if (c) paint(c, level(c)); } };
  root.SSDNSSuppliesSheet = { command: command, paint: function () { paintSupplies(ch()); }, openSave: openSave, setExhaustion: setExhaustion };
})(typeof window !== "undefined" ? window : globalThis);

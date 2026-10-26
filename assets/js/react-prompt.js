/**
 * N67: automated reaction window.
 * Leave-reach opportunity attacks, damage reactions (Hellish Rebuke), and
 * counterspell-on-cast share one queue: one card at a time, Cast/Attack or Pass,
 * plus a DM mirror. The reaction spell list is the B16 set, filtered by trigger.
 * rules.js is not a casting-time table; names and spell-fx text decide the trigger.
 */
(function (root) {
  "use strict";
  var WAIT = "Waiting on opportunity attacks…";
  var DAMAGE = { "hellish rebuke": 60, "absorb elements": 0 };
  var SPELL = { "counterspell": 60 };
  var REACTION_NAMES = ["shield", "absorb elements", "feather fall", "hellish rebuke", "counterspell"];

  function baseName(name) {
    var n = String(name || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+shell$/, "").trim();
    var A = root.SSDNS_RULES && root.SSDNS_RULES.spellAliases;
    if (A && typeof A === "object" && !Array.isArray(A)) {
      Object.keys(A).forEach(function (k) {
        if (k.toLowerCase() === n && typeof A[k] === "string") n = A[k].toLowerCase();
      });
    }
    return n.replace(/\s+/g, " ");
  }
  function spellBlurb(name) {
    var n = baseName(name);
    var fx = root.SSDNS_SPELL_FX && root.SSDNS_SPELL_FX[n];
    return String((fx && (fx.does || fx.text)) || "");
  }
  function isReaction(name) {
    var n = baseName(name);
    var P = root.SSDNSActionPips;
    if (P && typeof P.spellCost === "function" && P.spellCost(name) === "reaction") return true;
    if (REACTION_NAMES.indexOf(n) >= 0) return true;
    var text = spellBlurb(name);
    return /casting time\s*:\s*(?:1\s+)?reaction\b|\bas a reaction\b/i.test(text);
  }
  /** "damage" (Hellish Rebuke, Absorb Elements), "spell" (Counterspell), or "" (Shield and the rest stay on the R menu). */
  function triggerOf(name) {
    if (!isReaction(name)) return "";
    var n = baseName(name);
    var text = n + " " + spellBlurb(name);
    if (Object.prototype.hasOwnProperty.call(SPELL, n) || /counterspell|see a creature[^.]{0,120}cast(?:ing)? a spell/i.test(text)) return "spell";
    if (Object.prototype.hasOwnProperty.call(DAMAGE, n) || /when you take [^.]{0,48}damage|when you are damaged|a creature damages you|in response to (?:being|taking) [^.]{0,24}damage/i.test(text)) return "damage";
    return "";
  }
  function rangeFt(name) {
    var n = baseName(name);
    if (Object.prototype.hasOwnProperty.call(DAMAGE, n)) return DAMAGE[n];
    if (Object.prototype.hasOwnProperty.call(SPELL, n)) return SPELL[n];
    var fx = root.SSDNS_SPELL_FX && root.SSDNS_SPELL_FX[n];
    var range = String((fx && fx.range) || "");
    var m = range.match(/(\d+)\s*feet/i);
    if (m) return parseInt(m[1], 10) || 0;
    if (/self/i.test(range)) return 0;
    return triggerOf(name) === "spell" || triggerOf(name) === "damage" ? 60 : 0;
  }
  /** Self range (0) is always in range. Unknown distance still offers the card. */
  function inRange(feet, name) {
    var need = rangeFt(name);
    if (need <= 0) return true;
    if (feet == null || feet === "") return true;
    return Number(feet) <= need;
  }
  function eligible(spells, trigger, feet) {
    var out = [];
    var seen = {};
    (spells || []).forEach(function (sp) {
      if (!sp || !sp.name || triggerOf(sp.name) !== trigger) return;
      var key = baseName(sp.name);
      if (seen[key] || !inRange(feet, sp.name)) return;
      seen[key] = 1;
      out.push({ name: String(sp.name), level: parseInt(sp.level, 10) || 0 });
    });
    return out;
  }
  function withoutSpent(pauses) {
    var out = [];
    var toasts = [];
    (pauses || []).forEach(function (p) {
      var live = [];
      (p.reactors || []).forEach(function (r) {
        if (!r) return;
        if (r.reaction) toasts.push((r.name || r.label || "They") + " already used their reaction.");
        else live.push(r);
      });
      if (live.length) out.push({ index: p.index, reactors: live });
    });
    return { pauses: out, toasts: toasts };
  }
  /** N69: unconscious, dead, defeated, dying, or at 0 HP. A creature with no HP pool is not down from the number alone. */
  function isIneligibleReactor(row) {
    if (!row || typeof row !== "object") return false;
    if (row.reactorDown === true || row.unconscious === true || row.dead === true || row.defeated === true || row.down === true) return true;
    var status = String(row.status || row.reactorStatus || "");
    if (/^(down|dead|unconscious|dying|defeated)$/i.test(status)) return true;
    var lists = [row.conditions, row.activeConditions, row.reactorConditions];
    var i, j, list, arr, raw, name;
    for (i = 0; i < lists.length; i++) {
      list = lists[i];
      if (!list) continue;
      arr = Array.isArray(list) ? list : [list];
      for (j = 0; j < arr.length; j++) {
        raw = arr[j];
        name = raw && typeof raw === "object" ? (raw.name || raw.label || "") : raw;
        if (/\b(?:unconscious|dead|dying|defeated)\b/i.test(String(name || ""))) return true;
      }
    }
    if (row.noHpPool || row.noHp) return false;
    var hp = row.hp;
    if ((hp == null || hp === "") && row.hpCurrent != null && row.hpCurrent !== "") hp = row.hpCurrent;
    if ((hp == null || hp === "") && row.reactorHp != null && row.reactorHp !== "") hp = row.reactorHp;
    if (hp && typeof hp === "object") hp = hp.cur != null ? hp.cur : (hp.current != null ? hp.current : null);
    if (hp != null && hp !== "" && isFinite(Number(hp)) && Number(hp) <= 0) return true;
    return false;
  }
  function withoutIneligible(pauses) {
    var out = [];
    (pauses || []).forEach(function (p) {
      var live = (p.reactors || []).filter(function (r) { return r && !isIneligibleReactor(r); });
      if (live.length) out.push({ index: p.index, reactors: live });
    });
    return out;
  }
  /** Auto-pass every ineligible reactor already on a session so the mover is not held. */
  function skipIneligible(session) {
    var commits = [];
    if (!session || !session.pauses) return { done: true, commits: commits, waiting: "" };
    var guard = 0;
    var step;
    while (session.phase !== "done" && guard++ < 40) {
      var reactor = currentReactor(session);
      if (!reactor || !isIneligibleReactor(reactor)) break;
      step = answerLeave(session, "pass", {});
      if (step.commit) commits.push(step.commit);
      if (step.done || (!step.next && !step.commit)) break;
    }
    return { done: session.phase === "done", commits: commits, waiting: session.waiting || "" };
  }
  function livingOffers(offers) {
    return (offers || []).filter(function (o) { return o && !isIneligibleReactor(o); });
  }
  /** Unresolved type:"react" rows. DM load wipes these before any card is painted. */
  function orphanSweep(rows) {
    var wipe = [];
    var bag = rows || {};
    Object.keys(bag).forEach(function (id) {
      var req = bag[id];
      if (!req || req.type !== "react" || req.resolved) return;
      wipe.push({
        id: id,
        choice: "pass",
        promptId: req.promptId || "",
        moverPlayerId: req.moverPlayerId || req.from || "",
        from: req.from || "",
        oaId: req.oaId || ""
      });
    });
    return wipe;
  }
  function bootReactRoom(rows) {
    return { wipe: orphanSweep(rows), closeUi: true, paint: false };
  }
  function freshId(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function freshLeave(plan, pathLength) {
    var pauses = (plan && plan.pauses) || [];
    return {
      promptId: freshId("react"),
      pauses: pauses,
      pathLength: pathLength || 0,
      pi: 0,
      qi: 0,
      phase: pauses.length ? "ask" : "done",
      waiting: pauses.length ? WAIT : "",
      oaId: ""
    };
  }
  function currentReactor(session) {
    var pause = session && session.pauses && session.pauses[session.pi];
    return pause && pause.reactors ? pause.reactors[session.qi] : null;
  }
  /** Gunsmoke Caster (rules.js id gunsmoke-caster, PHB War Caster). */
  function hasGunsmoke(feats) {
    if (feats === true) return true;
    var list = Array.isArray(feats) ? feats : (feats ? [feats] : []);
    var i, raw, id;
    for (i = 0; i < list.length; i++) {
      raw = list[i];
      id = String(raw && typeof raw === "object" ? (raw.id || raw.name || "") : (raw || "")).toLowerCase().replace(/[_]+/g, " ").trim();
      if (id === "gunsmoke-caster" || id === "gunsmoke caster" || id === "war caster" || id === "war-caster") return true;
    }
    return false;
  }
  /**
   * War Caster / Gunsmoke Caster: 1 action, and the spell can target only the provoking creature.
   * Reaction spells stay on their own triggers. Areas and multi-target spells do not qualify.
   */
  function oaCastEligible(name) {
    if (!name || isReaction(name)) return false;
    var P = root.SSDNSActionPips;
    if (P && typeof P.spellCost === "function" && P.spellCost(name) !== "action") return false;
    var n = baseName(name);
    if (n === "magic missile" || n === "eldritch blast" || n === "pact shot" || n === "scorching ray" || n === "acid splash") return false;
    var fx = (root.SSDNS_SPELL_FX && root.SSDNS_SPELL_FX[n]) || {};
    var does = String(fx.does || fx.text || "");
    var area = String(fx.area || "");
    var range = String(fx.range || "");
    var blob = (does + " " + area).toLowerCase();
    if (area && area.toLowerCase() !== "one creature") return false;
    if (/\b(cone|cube|sphere|radius|square|line|wall)\b/.test(blob)) return false;
    if (/up to \d+|one or two|two or more|each creature|every creature|creatures of your choice|each beam|each dart|additional creature|creatures within|one or more creatures|any number of/.test(blob)) return false;
    if (/^self\b/i.test(range)) return false;
    return /\b(?:one|a|the)(?:\s+[a-z]+){0,2}\s+(?:creature|target|humanoid)\b/.test(does.toLowerCase());
  }
  function oaCastChoices(spells) {
    var out = [];
    var seen = {};
    (spells || []).forEach(function (sp) {
      if (!sp || !sp.name || !oaCastEligible(sp.name)) return;
      var key = baseName(sp.name);
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ name: String(sp.name), level: parseInt(sp.level, 10) || 0 });
    });
    out.sort(function (a, b) { return a.level - b.level || a.name.localeCompare(b.name); });
    return out;
  }
  /** A player who is acting for themselves owns Attack / Pass. DM-run tokens do not. */
  function playerOwnsReactor(reactor) {
    if (!reactor || reactor.dmRuns) return false;
    var kind = reactor.kind || reactor.reactorKind || "";
    return kind === "player" || !!(reactor.playerId || reactor.reactorPlayerId);
  }
  function playerOwns(view) {
    if (!view || view.dmRuns) return false;
    if (view.kind === "damage" || view.kind === "spell") return false;
    if (view.playerOwns === true) return true;
    if (view.playerOwns === false) return false;
    return view.reactorKind === "player" || !!view.reactorPlayerId;
  }
  function leaveView(session, moverName) {
    var reactor = currentReactor(session);
    if (!session || !reactor || session.phase === "done") return null;
    var striking = session.phase === "attacking" || session.phase === "casting";
    var approving = session.phase === "approving";
    var who = moverName || session.moverName || "Someone";
    var dmRuns = reactor.dmRuns != null ? !!reactor.dmRuns : reactor.kind !== "player";
    var owns = !dmRuns && playerOwnsReactor(reactor);
    var name = reactor.name || reactor.label || "Someone";
    var castName = session.castSpell || session.pendingSpell || "";
    var spellLine = castName ? ("Cast " + castName + " at " + who + ". It spends your reaction, not your action.") : "";
    return {
      promptId: session.promptId,
      kind: "leave",
      kicker: "Opportunity attack",
      text: striking
        ? (session.phase === "casting" && spellLine ? spellLine : ("Make the opportunity attack against " + who + ". It spends your reaction, not your action."))
        : (who + " is leaving your reach — Opportunity attack?"),
      choice: "attack",
      attackLabel: "Attack",
      passLabel: "Pass",
      hideAttack: striking,
      approving: approving,
      disabled: !!reactor.reaction,
      reactorId: reactor.id || "",
      reactorName: name,
      reactorKind: reactor.kind || (dmRuns ? "enemy" : "player"),
      reactorPlayerId: reactor.playerId || "",
      dmRuns: dmRuns,
      playerOwns: owns,
      gunsmoke: !!(reactor.gunsmoke || hasGunsmoke(reactor.feats)),
      self: !!reactor.self,
      status: reactor.status || "",
      hp: reactor.noHpPool ? null : reactor.hp,
      noHpPool: !!reactor.noHpPool,
      conditions: reactor.conditions || [],
      moverName: who,
      moverId: session.moverId || "",
      moverPlayerId: session.moverPlayerId || "",
      oaId: session.oaId || "",
      spellName: castName,
      spellLevel: session.castLevel || session.pendingLevel || 0,
      waiting: WAIT,
      mirrorText: owns && !striking
        ? (name + " is deciding on an opportunity attack…")
        : (striking
          ? (name + " is making an opportunity attack as " + who + " leaves reach.")
          : (name + " can take an opportunity attack as " + who + " leaves reach."))
    };
  }
  /**
   * N70: a DM-run Attack that successfully armed holds the leave.
   * A failed arm is a pass. A held attack is never rewritten to pass.
   */
  function attackDecision(armedOk) {
    if (!armedOk) return { choice: "pass", armed: false, hold: false };
    return { choice: "attack", armed: true, hold: true };
  }
  /**
   * choice "attack" arms and holds the leave step.
   * "pass" or "attacked" advances the queue. The leave step commits when that step's queue is empty.
   */
  function answerLeave(session, choice, meta) {
    meta = meta || {};
    if (choice === "cancel") choice = "pass";
    var pause = session.pauses[session.pi];
    var reactor = currentReactor(session);
    if (!pause || !reactor) return { done: true, commit: null, toast: "" };
    if (choice === "allow") {
      if (session.phase !== "ask" && session.phase !== "approving") return { done: false, commit: null, toast: "" };
      var allowedCast = session.pendingChoice === "cast" || !!(meta.spellName && (meta.gunsmoke || reactor.gunsmoke || hasGunsmoke(reactor.feats)));
      var allowedName = meta.spellName || session.pendingSpell || "";
      if (allowedCast && allowedName && !oaCastEligible(allowedName)) allowedCast = false;
      session.phase = allowedCast ? "casting" : "attacking";
      session.oaId = meta.oaId || session.oaId || freshId("oa");
      session.castSpell = allowedCast ? allowedName : "";
      session.castLevel = allowedCast ? (parseInt(meta.spellLevel, 10) || session.pendingLevel || 0) : 0;
      session.pendingChoice = "";
      session.waiting = WAIT;
      return {
        armed: true,
        cast: allowedCast,
        oaId: session.oaId,
        spellName: session.castSpell,
        spellLevel: session.castLevel,
        reactor: reactor,
        commit: null,
        done: false,
        toast: "",
        waiting: WAIT
      };
    }
    if (choice === "deny") {
      choice = "pass";
      if (!meta.toast) meta.toast = (reactor.name || reactor.label || "They") + " — the DM denied the opportunity attack.";
    }
    if (choice === "attack" || choice === "cast") {
      if (reactor.reaction) {
        choice = "pass";
        meta.toast = (reactor.name || "They") + " already used their reaction.";
      } else if (choice === "cast" && (!meta.spellName || !oaCastEligible(meta.spellName) || !(meta.gunsmoke || reactor.gunsmoke || hasGunsmoke(reactor.feats)))) {
        choice = "pass";
        meta.toast = meta.toast || "That spell can't be cast as an opportunity attack.";
      } else if (playerOwnsReactor(reactor) && !meta.allowed) {
        session.phase = "approving";
        session.pendingChoice = choice;
        session.pendingSpell = choice === "cast" ? (meta.spellName || "") : "";
        session.pendingLevel = choice === "cast" ? (parseInt(meta.spellLevel, 10) || 0) : 0;
        session.waiting = WAIT;
        return {
          pending: true,
          armed: false,
          hold: true,
          choice: choice,
          spellName: session.pendingSpell,
          spellLevel: session.pendingLevel,
          reactor: reactor,
          commit: null,
          done: false,
          toast: meta.toast || "",
          waiting: WAIT
        };
      } else {
        var casting = choice === "cast";
        session.phase = casting ? "casting" : "attacking";
        session.oaId = meta.oaId || session.oaId || freshId("oa");
        session.castSpell = casting ? (meta.spellName || "") : "";
        session.castLevel = casting ? (parseInt(meta.spellLevel, 10) || 0) : 0;
        session.waiting = WAIT;
        return {
          armed: true,
          cast: casting,
          oaId: session.oaId,
          spellName: session.castSpell,
          spellLevel: session.castLevel,
          reactor: reactor,
          commit: null,
          done: false,
          toast: "",
          waiting: WAIT
        };
      }
    }
    if (choice !== "pass" && choice !== "attacked") return { done: false, commit: null, toast: "" };
    session.pendingChoice = "";
    session.pendingSpell = "";
    session.pendingLevel = 0;
    session.castSpell = "";
    session.castLevel = 0;
    session.qi += 1;
    if (session.qi < pause.reactors.length) {
      session.phase = "ask";
      session.oaId = "";
      session.waiting = WAIT;
      return { done: false, commit: null, toast: meta.toast || "", next: true, waiting: WAIT };
    }
    var from = pause.index - 1;
    var next = session.pauses[session.pi + 1];
    var to = next ? (next.index - 1) : (session.pathLength - 1);
    session.pi += 1;
    session.qi = 0;
    session.phase = session.pi < session.pauses.length ? "ask" : "done";
    session.oaId = "";
    session.waiting = session.phase === "done" ? "" : WAIT;
    return {
      done: session.phase === "done",
      commit: { from: from, to: to },
      toast: meta.toast || "",
      next: session.phase === "ask",
      waiting: session.waiting
    };
  }
  function freshOffers(offers) {
    var list = offers || [];
    return { promptId: freshId("react"), offers: list, i: 0, spent: false, phase: list.length ? "ask" : "done" };
  }
  function offerView(session) {
    var o = session && session.offers && session.offers[session.i];
    if (!o || session.phase === "done") return null;
    var dmRuns = o.dmRuns != null ? !!o.dmRuns : o.reactorKind !== "player";
    return {
      promptId: session.promptId,
      kind: o.kind || "damage",
      kicker: o.kind === "spell" ? "Counterspell" : "Reaction",
      text: o.text || "",
      choice: "cast",
      attackLabel: "Cast",
      passLabel: "Pass",
      hideAttack: false,
      disabled: !!(o.reaction || session.spent),
      reactorId: o.reactorId || "",
      reactorName: o.reactorName || "Someone",
      reactorKind: o.reactorKind || "",
      reactorPlayerId: o.reactorPlayerId || "",
      dmRuns: dmRuns,
      self: !!o.self,
      spellName: o.spellName || "",
      spellLevel: o.spellLevel || 0,
      damagerId: o.damagerId || "",
      damagerName: o.damagerName || "",
      casterId: o.casterId || "",
      casterName: o.casterName || "",
      moverPlayerId: o.moverPlayerId || session.moverPlayerId || "",
      waiting: o.kind === "spell" ? "Waiting on reactions…" : WAIT,
      mirrorText: (o.reactorName || "Someone") + " — " + (o.text || "Reaction")
    };
  }
  function answerOffer(session, choice) {
    var cur = session.offers[session.i];
    if (!cur) return { done: true, choice: "pass", offer: null, toast: "" };
    if (choice === "cancel") choice = "pass";
    var made = choice === "cast" ? "cast" : "pass";
    var toast = "";
    if (made === "cast" && (cur.reaction || session.spent)) {
      toast = (cur.reactorName || "They") + " already used their reaction.";
      made = "pass";
    }
    if (made === "cast") session.spent = true;
    session.i += 1;
    var done = session.i >= session.offers.length;
    session.phase = done ? "done" : "ask";
    return { done: done, choice: made, offer: cur, toast: toast };
  }

  var binds = {};
  var spentWatch = {};
  function bind(id, fn) { if (id) binds[id] = fn; }
  function unbind(id) { if (id) delete binds[id]; }
  function deliver(id, choice, meta) {
    var fn = id && binds[id];
    if (!fn) return false;
    fn(choice, meta || {});
    return true;
  }
  function watchSpent(id, fn) {
    if (!id || !fn) return;
    var cur = spentWatch[id];
    if (!cur) spentWatch[id] = [fn];
    else if (typeof cur === "function") spentWatch[id] = [cur, fn];
    else cur.push(fn);
  }
  function forgetSpent(id) { if (id) delete spentWatch[id]; }
  function noteSpent(id) {
    var cur = id && spentWatch[id];
    if (!cur) return false;
    delete spentWatch[id];
    var list = typeof cur === "function" ? [cur] : cur;
    list.forEach(function (fn) { try { fn(id); } catch (e) {} });
    return true;
  }

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var modalEl = null;
  var mirrorEl = null;
  var waitEl = null;
  var onChoice = null;
  var suppressed = false;
  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
  }
  function closeMirror() {
    if (mirrorEl && mirrorEl.parentNode) mirrorEl.parentNode.removeChild(mirrorEl);
    mirrorEl = null;
  }
  function closeWait() {
    if (waitEl && waitEl.parentNode) waitEl.parentNode.removeChild(waitEl);
    waitEl = null;
  }
  function close() {
    closeModal();
    closeMirror();
    closeWait();
    onChoice = null;
  }
  function spellButtons(model) {
    if (!model || model.hideAttack || !model.spells || !model.spells.length) return "";
    var dis = model.disabled ? " disabled" : "";
    return '<div class="react-spells">' + model.spells.map(function (sp) {
      var lv = parseInt(sp.level, 10) || 0;
      var tag = lv ? (" · " + lv) : "";
      return '<button type="button" class="btn" data-react-choice="cast" data-spell="' + esc(sp.name) + '" data-level="' + lv + '"' + dis + ">Cast " + esc(sp.name) + esc(tag) + "</button>";
    }).join("") + "</div>";
  }
  function actionsHtml(model) {
    var attack = "";
    if (!model.hideAttack) {
      var dis = model.disabled ? " disabled" : "";
      attack = '<button type="button" class="btn btn-primary" data-react-choice="' + esc(model.choice || "attack") + '"' + dis + ">" + esc(model.attackLabel || "Attack") + "</button>";
    }
    return attack + spellButtons(model) + '<button type="button" class="btn" data-react-choice="pass">' + esc(model.passLabel || "Pass") + "</button>" +
      '<button type="button" class="btn" data-react-choice="cancel">Cancel</button>';
  }
  function paintModal(model) {
    closeModal();
    if (suppressed || !model || typeof document === "undefined" || !document.body) return;
    var wrap = document.createElement("div");
    wrap.className = "react-modal";
    wrap.setAttribute("data-react-modal", model.kind || "leave");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML = '<div class="react-modal-card" role="document"><p class="react-kicker">' + esc(model.kicker) + "</p><p class=\"react-text\">" + esc(model.text) + '</p><div class="react-actions">' + actionsHtml(model) + "</div></div>";
    document.body.appendChild(wrap);
    modalEl = wrap;
  }
  function paintMirror(model) {
    closeMirror();
    if (suppressed || !model || typeof document === "undefined" || !document.body) return;
    var owns = !!(model.playerOwns && !model.dmRuns);
    var buttons;
    if (model.approving && owns) {
      buttons = '<button type="button" class="btn btn-primary" data-react-choice="allow">Allow</button>' +
        '<button type="button" class="btn" data-react-choice="deny">Deny</button>';
    } else if (owns && !model.hideAttack) {
      /* N72: the player owns Attack / Pass. The DM waits. */
      buttons = '<button type="button" class="btn" data-react-choice="cancel">Cancel</button>';
    } else if (owns && model.hideAttack) {
      buttons = '<button type="button" class="btn" data-react-choice="cancel">Cancel</button>';
    } else {
      var showChoice = !!model.dmRuns && !model.hideAttack;
      var choiceBtn = showChoice
        ? '<button type="button" class="btn btn-primary" data-react-choice="' + esc(model.choice || "attack") + '"' + (model.disabled ? " disabled" : "") + ">" + esc(model.attackLabel || "Attack") + "</button>"
        : "";
      buttons = choiceBtn + (showChoice ? spellButtons(model) : "") + '<button type="button" class="btn" data-react-choice="pass">Pass</button><button type="button" class="btn" data-react-choice="cancel">Cancel</button>';
    }
    var wrap = document.createElement("div");
    wrap.className = "react-mirror";
    wrap.setAttribute("data-react-mirror", model.kind || "leave");
    wrap.setAttribute("role", "dialog");
    wrap.innerHTML = '<p class="react-kicker">DM · ' + esc(model.kicker) + "</p><p class=\"react-text\">" + esc(model.mirrorText || model.text) + '</p><div class="react-actions">' + buttons + "</div>";
    document.body.appendChild(wrap);
    mirrorEl = wrap;
  }
  function openModal(model, cb) { onChoice = cb || onChoice; paintModal(model); }
  function openMirror(model, cb) { onChoice = cb || onChoice; paintMirror(model); }
  function openWait(text) {
    closeWait();
    if (suppressed || typeof document === "undefined" || !document.body) return;
    var bar = document.createElement("div");
    bar.className = "react-wait";
    bar.setAttribute("data-react-wait", "1");
    bar.innerHTML = "<span></span>" + '<button type="button" class="btn" data-react-choice="cancel">Cancel</button>';
    bar.querySelector("span").textContent = text || "Waiting on reactions…";
    document.body.appendChild(bar);
    waitEl = bar;
  }
  function choose(choice, meta) {
    var fn = onChoice;
    if (fn) fn(choice, meta || {});
  }
  /** Escape / Cancel: drop the card first so the lobby is usable even if the handler throws. */
  function dismiss() {
    var fn = onChoice;
    close();
    try { if (fn) fn("cancel", { escape: true }); } catch (e) {}
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-react-choice]");
      if (!btn || btn.disabled) return;
      if (e.preventDefault) e.preventDefault();
      var picked = btn.getAttribute("data-react-choice") || "pass";
      if (picked === "cancel") { dismiss(); return; }
      var pickedMeta = {};
      if (picked === "cast") {
        pickedMeta.spellName = btn.getAttribute("data-spell") || "";
        pickedMeta.spellLevel = parseInt(btn.getAttribute("data-level"), 10) || 0;
        pickedMeta.gunsmoke = true;
        if (!pickedMeta.spellName) return;
      }
      choose(picked, pickedMeta);
    });
    document.addEventListener("keydown", function (e) {
      if (!e || e.key !== "Escape" || e.isComposing) return;
      if (!modalEl && !mirrorEl && !waitEl) return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      dismiss();
    });
  }

  function gateSpell(info, proceed) {
    if (root.SSDNSReact && root.SSDNSReact.castingReaction) return false;
    var host = root.SSDNSReactHost;
    if (!host || typeof host.askSpell !== "function") return false;
    return host.askSpell(info || {}, proceed) !== false;
  }

  root.SSDNSReact = {
    WAIT: WAIT,
    baseName: baseName,
    triggerOf: triggerOf,
    rangeFt: rangeFt,
    inRange: inRange,
    eligible: eligible,
    withoutSpent: withoutSpent,
    isIneligibleReactor: isIneligibleReactor,
    withoutIneligible: withoutIneligible,
    skipIneligible: skipIneligible,
    livingOffers: livingOffers,
    orphanSweep: orphanSweep,
    bootReactRoom: bootReactRoom,
    setSuppress: function (on) { suppressed = !!on; if (suppressed) close(); },
    suppressed: function () { return suppressed; },
    dismiss: dismiss,
    freshLeave: freshLeave,
    leaveView: leaveView,
    hasGunsmoke: hasGunsmoke,
    oaCastEligible: oaCastEligible,
    oaCastChoices: oaCastChoices,
    playerOwns: playerOwns,
    attackDecision: attackDecision,
    answerLeave: answerLeave,
    freshOffers: freshOffers,
    offerView: offerView,
    answerOffer: answerOffer,
    bind: bind,
    unbind: unbind,
    deliver: deliver,
    watchSpent: watchSpent,
    forgetSpent: forgetSpent,
    noteSpent: noteSpent,
    openModal: openModal,
    openMirror: openMirror,
    openWait: openWait,
    close: close,
    closeWait: closeWait,
    gateSpell: gateSpell,
    castingReaction: false,
    oaCast: null
  };
})(typeof window !== "undefined" ? window : globalThis);

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
  function leaveView(session, moverName) {
    var reactor = currentReactor(session);
    if (!session || !reactor || session.phase === "done") return null;
    var attacking = session.phase === "attacking";
    var who = moverName || session.moverName || "Someone";
    var dmRuns = reactor.dmRuns != null ? !!reactor.dmRuns : reactor.kind !== "player";
    return {
      promptId: session.promptId,
      kind: "leave",
      kicker: "Opportunity attack",
      text: attacking
        ? ("Make the opportunity attack against " + who + ". It spends your reaction, not your action.")
        : (who + " is leaving your reach — Opportunity attack?"),
      choice: "attack",
      attackLabel: "Attack",
      passLabel: "Pass",
      hideAttack: attacking,
      disabled: !!reactor.reaction,
      reactorId: reactor.id || "",
      reactorName: reactor.name || reactor.label || "Someone",
      reactorKind: reactor.kind || (dmRuns ? "enemy" : "player"),
      reactorPlayerId: reactor.playerId || "",
      dmRuns: dmRuns,
      self: !!reactor.self,
      moverName: who,
      moverId: session.moverId || "",
      moverPlayerId: session.moverPlayerId || "",
      oaId: session.oaId || "",
      waiting: WAIT,
      mirrorText: attacking
        ? ((reactor.name || reactor.label || "Someone") + " is making an opportunity attack as " + who + " leaves reach. Pass cancels it.")
        : ((reactor.name || reactor.label || "Someone") + " can take an opportunity attack as " + who + " leaves reach.")
    };
  }
  /**
   * choice "attack" arms and holds the leave step.
   * "pass" or "attacked" advances the queue. The leave step commits when that step's queue is empty.
   */
  function answerLeave(session, choice, meta) {
    meta = meta || {};
    var pause = session.pauses[session.pi];
    var reactor = currentReactor(session);
    if (!pause || !reactor) return { done: true, commit: null, toast: "" };
    if (choice === "attack") {
      if (reactor.reaction) {
        choice = "pass";
        meta.toast = (reactor.name || "They") + " already used their reaction.";
      } else {
        session.phase = "attacking";
        session.oaId = meta.oaId || session.oaId || freshId("oa");
        session.waiting = WAIT;
        return { armed: true, oaId: session.oaId, reactor: reactor, commit: null, done: false, toast: "", waiting: WAIT };
      }
    }
    if (choice !== "pass" && choice !== "attacked") return { done: false, commit: null, toast: "" };
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
  function watchSpent(id, fn) { if (id) spentWatch[id] = fn; }
  function noteSpent(id) {
    var fn = id && spentWatch[id];
    if (!fn) return false;
    delete spentWatch[id];
    fn(id);
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
  function actionsHtml(model) {
    var attack = "";
    if (!model.hideAttack) {
      var dis = model.disabled ? " disabled" : "";
      attack = '<button type="button" class="btn btn-primary" data-react-choice="' + esc(model.choice || "attack") + '"' + dis + ">" + esc(model.attackLabel || "Attack") + "</button>";
    }
    return attack + '<button type="button" class="btn" data-react-choice="pass">' + esc(model.passLabel || "Pass") + "</button>";
  }
  function paintModal(model) {
    closeModal();
    if (!model || typeof document === "undefined" || !document.body) return;
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
    if (!model || typeof document === "undefined" || !document.body) return;
    var showChoice = !!model.dmRuns && !model.hideAttack;
    var choiceBtn = showChoice
      ? '<button type="button" class="btn btn-primary" data-react-choice="' + esc(model.choice || "attack") + '"' + (model.disabled ? " disabled" : "") + ">" + esc(model.attackLabel || "Attack") + "</button>"
      : "";
    var wrap = document.createElement("div");
    wrap.className = "react-mirror";
    wrap.setAttribute("data-react-mirror", model.kind || "leave");
    wrap.setAttribute("role", "dialog");
    wrap.innerHTML = '<p class="react-kicker">DM · ' + esc(model.kicker) + "</p><p class=\"react-text\">" + esc(model.mirrorText || model.text) + '</p><div class="react-actions">' + choiceBtn + '<button type="button" class="btn" data-react-choice="pass">Pass</button></div>';
    document.body.appendChild(wrap);
    mirrorEl = wrap;
  }
  function openModal(model, cb) { onChoice = cb || onChoice; paintModal(model); }
  function openMirror(model, cb) { onChoice = cb || onChoice; paintMirror(model); }
  function openWait(text) {
    closeWait();
    if (typeof document === "undefined" || !document.body) return;
    var bar = document.createElement("div");
    bar.className = "react-wait";
    bar.setAttribute("data-react-wait", "1");
    bar.textContent = text || "Waiting on reactions…";
    document.body.appendChild(bar);
    waitEl = bar;
  }
  function choose(choice) {
    var fn = onChoice;
    if (fn) fn(choice, {});
  }
  if (typeof document !== "undefined") {
    document.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-react-choice]");
      if (!btn || btn.disabled) return;
      if (e.preventDefault) e.preventDefault();
      choose(btn.getAttribute("data-react-choice") || "pass");
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
    freshLeave: freshLeave,
    leaveView: leaveView,
    answerLeave: answerLeave,
    freshOffers: freshOffers,
    offerView: offerView,
    answerOffer: answerOffer,
    bind: bind,
    unbind: unbind,
    deliver: deliver,
    watchSpent: watchSpent,
    noteSpent: noteSpent,
    openModal: openModal,
    openMirror: openMirror,
    openWait: openWait,
    close: close,
    closeWait: closeWait,
    gateSpell: gateSpell,
    castingReaction: false
  };
})(typeof window !== "undefined" ? window : globalThis);

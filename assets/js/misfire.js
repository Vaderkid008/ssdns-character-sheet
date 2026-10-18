/**
 * Locked misfire rules. Pure helpers shared by the sheet and the DM Command Center.
 * A spark is never a misfire. Gun melee never touches the streak.
 * Only the kept d20 counts. A shot that fires (hit or plain miss) resets the streak to 0.
 * Clean and a short rest also reset it.
 * 1st and 2nd misfire: jammed. 3rd: lock the next chamber (capacity 1 = Fouled).
 * 4th and later: d4. 1 explodes, 2 Fouled, 3 locks another chamber (streak stays), 4 wild shot.
 * Rugged counts one step later and never fouls.
 * While any chamber is locked, misfires before the d4 lock another chamber.
 * Dirty starts the streak at 1. Both dice misfiring on a Dirty gun opens the d4 immediately.
 * On a clean gun, both dice misfiring count as one misfire.
 * Fouled and Ruined are one state. The sheet does not clear that state.
 */
(function (root) {
  "use strict";
  function inRange(n, ceiling) {
    n = Number(n);
    ceiling = Number(ceiling);
    if (!isFinite(n) || !isFinite(ceiling) || ceiling < 1) return false;
    return n >= 1 && n <= ceiling;
  }
  function isRugged(gun) {
    gun = gun || {};
    if (gun.rugged) return true;
    var id = gun.id || gun.weapon || gun.weaponId || "";
    if (id === "lancaster-heavy-saddle-carbine") return true;
    return /rugged/i.test(String(gun.properties || "") + " " + String(gun.name || ""));
  }
  function isBigFifty(gun) {
    gun = gun || {};
    var id = String(gun.id || gun.weapon || gun.weaponId || "");
    if (id === "bison-big-fifty-buffalo-rifle") return true;
    return /big fifty/i.test(String(gun.name || ""));
  }
  function hasMuzzleloader(gun) {
    gun = gun || {};
    if (gun.muzzleloader) return true;
    var feats = gun.feats || [];
    return feats.indexOf("muzzleloader") >= 0;
  }
  function unjamIsFree(gun) {
    gun = gun || {};
    if (isRugged(gun)) return true;
    if (hasMuzzleloader(gun)) return true;
    if (isBigFifty(gun)) return false;
    return /smoothed/i.test(String(gun.mod || ""));
  }
  function copyLocks(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (n) {
      n = Number(n);
      if (!isFinite(n) || n < 0 || Math.floor(n) !== n) return;
      if (out.indexOf(n) < 0) out.push(n);
    });
    return out;
  }
  function activeLocks(gun, cap) {
    var locks = copyLocks(gun && gun.lockedChambers);
    cap = Number(cap);
    if (!isFinite(cap) || cap < 1) return locks;
    return locks.filter(function (n) { return n < cap; });
  }
  function gunCapacity(gun, shot) {
    shot = shot || {};
    var cap = shot.capacity != null ? shot.capacity : (gun && gun.capacity);
    cap = Number(cap);
    if (isFinite(cap) && cap >= 0) return Math.floor(cap);
    if (gun && Array.isArray(gun.chambers)) return gun.chambers.length;
    return 0;
  }
  function copyGun(gun) {
    gun = gun || {};
    return {
      dirty: !!gun.dirty,
      fouled: !!gun.fouled,
      ruined: !!(gun.ruined || gun.broken),
      broken: !!(gun.ruined || gun.broken),
      jammed: !!gun.jammed,
      misStreak: Number(gun.misStreak) || 0,
      pendingD4: !!gun.pendingD4,
      pendingD4Rolls: gun.pendingD4Rolls || null,
      pendingD4Step: Number(gun.pendingD4Step) || 0,
      rugged: isRugged(gun),
      lockedChambers: copyLocks(gun.lockedChambers),
      capacity: gunCapacity(gun),
      mod: gun.mod || "",
      feats: gun.feats || [],
      muzzleloader: hasMuzzleloader(gun),
      id: gun.id || gun.weapon || gun.weaponId || "",
      weapon: gun.weapon || gun.id || "",
      name: gun.name || "",
      properties: gun.properties || ""
    };
  }
  function markFouled(next) {
    next.fouled = true;
    next.ruined = true;
    next.broken = true;
    next.jammed = false;
  }
  function nextLockIndex(gun, cap, after) {
    cap = Number(cap) || 0;
    if (cap < 1) return null;
    var locks = activeLocks(gun, cap);
    if (locks.length >= cap) return null;
    var start = 0;
    if (after != null && after !== "" && isFinite(Number(after))) start = (Math.floor(Number(after)) + 1) % cap;
    var i, k;
    for (i = 0; i < cap; i++) {
      k = (start + i) % cap;
      if (locks.indexOf(k) < 0) return k;
    }
    return null;
  }
  function applyLock(next, cap, after) {
    cap = Number(cap) || 0;
    if (cap === 1 && !next.rugged) {
      markFouled(next);
      next.lock = false;
      next.lockIndex = null;
      next.tier = "foul";
      return next;
    }
    if (cap < 1) {
      next.lock = true;
      next.lockIndex = null;
      next.jammed = false;
      next.tier = "lock";
      return next;
    }
    var idx = nextLockIndex(next, cap, after);
    if (idx == null) {
      next.lock = false;
      next.lockIndex = null;
      next.jammed = false;
      if (!next.rugged) {
        markFouled(next);
        next.tier = "foul";
      } else next.tier = "lock";
      return next;
    }
    var locks = copyLocks(next.lockedChambers);
    if (locks.indexOf(idx) < 0) locks.push(idx);
    next.lockedChambers = locks;
    next.lock = true;
    next.lockIndex = idx;
    next.jammed = false;
    next.tier = "lock";
    if (activeLocks(next, cap).length >= cap && !next.rugged) {
      markFouled(next);
      next.tier = "foul";
    }
    return next;
  }
  /** Tier for a streak that has already counted this misfire. */
  function outcome(gun, streak) {
    gun = gun || {};
    streak = Number(streak) || 0;
    var rugged = isRugged(gun);
    var cap = gunCapacity(gun);
    var locks = activeLocks(gun, cap);
    var d4At = rugged ? 5 : 4;
    var lockAt = rugged ? 4 : 3;
    if (streak >= d4At) return { tier: "d4", armD4: true, jammed: false, lock: false, fouled: false };
    if (locks.length) return { tier: "lock", lock: true, jammed: false, armD4: false, fouled: false, superseded: true };
    if (streak >= lockAt) return { tier: "lock", lock: true, jammed: false, armD4: false, fouled: false };
    if (streak >= 1) return { tier: "jam", jammed: true, lock: false, armD4: false, fouled: false };
    return { tier: "none", jammed: false, lock: false, armD4: false, fouled: false };
  }
  function freshFlags(next) {
    next.spark = false;
    next.misfire = false;
    next.both = false;
    next.armD4 = false;
    next.reset = false;
    next.lock = false;
    next.lockIndex = null;
    next.wild = false;
    next.explode = false;
    next.fire = "";
    next.tier = "none";
    next.wildAttack = false;
    next.streakIgnored = false;
    return next;
  }
  function resolveShot(gun, shot) {
    var next = copyGun(gun);
    shot = shot || {};
    next.capacity = gunCapacity(gun, shot);
    freshFlags(next);
    if (shot.spark) {
      next.spark = true;
      next.tier = "spark";
      next.misStreak = Number(gun && gun.misStreak) || 0;
      next.jammed = !!(gun && gun.jammed);
      return next;
    }
    if (shot.melee) {
      next.tier = "melee";
      next.misStreak = Number(gun && gun.misStreak) || 0;
      next.jammed = !!(gun && gun.jammed);
      return next;
    }
    var ceiling = Number(shot.ceiling);
    if (!isFinite(ceiling) || ceiling < 1) ceiling = 1;
    var n1 = shot.n1;
    var n2 = shot.n2;
    var nat = shot.nat != null ? shot.nat : n1;
    var both = n2 != null && n2 !== "" && inRange(n1, ceiling) && inRange(n2, ceiling);
    var keptBad = inRange(nat, ceiling);
    next.both = both;
    if (shot.wildAttack) {
      next.wildAttack = true;
      next.streakIgnored = true;
      next.misfire = !!(keptBad || both);
      next.misStreak = Number(gun && gun.misStreak) || 0;
      next.jammed = !!(gun && gun.jammed);
      next.tier = "wild-attack";
      return next;
    }
    if (!keptBad && !both) {
      next.misStreak = 0;
      next.reset = true;
      next.misfire = false;
      next.tier = "reset";
      next.jammed = !!(gun && gun.jammed);
      return next;
    }
    if (both && next.dirty) {
      next.misfire = true;
      next.armD4 = true;
      next.misStreak = (Number(gun && gun.misStreak) || 0) + 1;
      next.jammed = false;
      next.tier = "d4";
      return next;
    }
    var streak = (Number(gun && gun.misStreak) || 0) + 1;
    next.misStreak = streak;
    next.misfire = true;
    var face = outcome(next, streak);
    next.tier = face.tier;
    if (face.lock) {
      applyLock(next, next.capacity, shot.chamber);
      next.armD4 = false;
      next.jammed = false;
      return next;
    }
    if (face.armD4) {
      next.armD4 = true;
      next.jammed = false;
      next.tier = "d4";
      return next;
    }
    next.jammed = true;
    next.armD4 = false;
    next.tier = "jam";
    return next;
  }
  function unjamSpec(gun) {
    var free = unjamIsFree(gun);
    return {
      id: "unjam",
      label: free ? "Unjam (free action)" : "Unjam (bonus action)",
      cost: 0,
      clears: ["jammed"],
      resetStreak: false,
      free: !!free
    };
  }
  function cleanOptions(gun) {
    gun = gun || {};
    var ruined = !!(gun.ruined || gun.broken);
    var fouled = !!gun.fouled || ruined;
    if (fouled) return [];
    if (gun.jammed) return [unjamSpec(gun)];
    if (gun.dirty) {
      return [{
        id: "dirty-kit",
        label: "Clean (removes Dirty, resets streak, clears jam)",
        cost: 0,
        clears: ["dirty", "jammed"],
        resetStreak: true
      }];
    }
    return [];
  }
  function applyClean(gun, optionId) {
    var opt = cleanOptions(gun).filter(function (o) { return o.id === optionId; })[0];
    if (!opt && optionId === "dirty-kit") opt = cleanOptions(Object.assign({}, gun, { jammed: false, dirty: true })).filter(function (o) { return o.id === "dirty-kit"; })[0];
    if (!opt) return { ok: false, reason: "That clean isn't available." };
    var next = copyGun(gun);
    (opt.clears || []).forEach(function (k) { next[k] = false; });
    if (opt.resetStreak) next.misStreak = 0;
    if (kClearsPending(opt)) {
      next.pendingD4 = false;
      next.pendingD4Rolls = null;
      next.pendingD4Step = 0;
    }
    next.broken = !!next.ruined;
    return { ok: true, gun: next, option: opt };
  }
  function commitClean(gun, optionId) {
    var applied = applyClean(gun, optionId);
    if (!applied.ok || !gun) return applied;
    var next = applied.gun;
    gun.dirty = !!next.dirty;
    gun.fouled = !!next.fouled;
    gun.jammed = !!next.jammed;
    gun.ruined = !!next.ruined;
    gun.broken = !!next.broken;
    gun.misStreak = next.misStreak || 0;
    if (kClearsPending(applied.option)) {
      gun.pendingD4 = false;
      gun.pendingD4Rolls = null;
      gun.pendingD4Step = 0;
    }
    return applied;
  }
  function pickClean(gunName, options) {
    return new Promise(function (resolve) {
      var doc = root.document;
      if (!doc || !doc.body || !options || !options.length) { resolve(null); return; }
      var dlg = doc.createElement("dialog");
      dlg.className = "dlg clean-modal";
      var buttons = options.map(function (opt, n) {
        return "<button type='button' class='btn' data-clean-opt='" + n + "'>" + String(opt.label || "").replace(/</g, "") + "</button>";
      }).join("");
      dlg.innerHTML = "<form method='dialog'><h2>Clean " + String(gunName || "gun").replace(/</g, "") + "</h2><p>Pick a method. Nothing changes until you do.</p><div class='clean-opts'>" + buttons + "</div><button type='button' class='btn' value='no'>Cancel</button></form>";
      var settled = false;
      function finish(opt) {
        if (settled) return;
        settled = true;
        doc.body.classList.remove("ask-open");
        try { if (dlg.close) dlg.close(); } catch (e) {}
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
        resolve(opt || null);
      }
      dlg.querySelector("[value=no]").addEventListener("click", function () { finish(null); });
      dlg.querySelectorAll("[data-clean-opt]").forEach(function (btn) {
        btn.addEventListener("click", function () { finish(options[Number(btn.getAttribute("data-clean-opt"))]); });
      });
      dlg.addEventListener("cancel", function (e) { e.preventDefault(); finish(null); });
      doc.body.classList.add("ask-open");
      doc.body.appendChild(dlg);
      try {
        if (dlg.showModal) dlg.showModal();
        else dlg.setAttribute("open", "");
      } catch (e) {
        dlg.setAttribute("open", "");
      }
    });
  }
  function kClearsPending(opt) {
    return !!(opt && (opt.resetStreak || opt.comesClean));
  }
  function coupleFoul(next, on) {
    next.fouled = !!on;
    next.ruined = !!on;
    next.broken = !!on;
  }
  function applyOverride(gun, override) {
    var next = copyGun(gun);
    override = override || {};
    var notes = [];
    if (override.dirty != null && override.dirty !== "") {
      var dirtyOn = !!override.dirty;
      if (dirtyOn && !gun.dirty) {
        next.dirty = true;
        next.misStreak = (Number(gun.misStreak) || 0) + 1;
        notes.push("set dirty");
        notes.push("streak +1");
      } else {
        next.dirty = dirtyOn;
        notes.push((dirtyOn ? "set " : "cleared ") + "dirty");
      }
    }
    if ((override.fouled != null && override.fouled !== "") || (override.ruined != null && override.ruined !== "")) {
      var foulOn = override.fouled != null && override.fouled !== "" ? !!override.fouled : !!override.ruined;
      coupleFoul(next, foulOn);
      notes.push((foulOn ? "set " : "cleared ") + "fouled");
    }
    if (override.resetStreak || override.misStreak === 0) {
      next.misStreak = 0;
      notes.push("streak reset");
    } else if (override.misStreak != null && override.misStreak !== "" && isFinite(Number(override.misStreak))) {
      next.misStreak = Number(override.misStreak);
    }
    if (override.cancelD4) {
      next.pendingD4 = false;
      next.pendingD4Rolls = null;
      next.pendingD4Step = 0;
      next.misStreak = 0;
      notes.push("pending d4 cancelled");
    }
    next.broken = !!next.ruined;
    return { gun: next, notes: notes };
  }
  function d4Result(n, rugged) {
    n = Number(n);
    if (n === 1) {
      if (rugged) return { explode: true, fire: "1d4", lock: true, fouled: false, ruined: false, broken: false, jammed: false, wild: false, keepStreak: true };
      return { explode: true, fire: "1d4", fouled: true, ruined: true, broken: true, jammed: false, lock: false, wild: false, keepStreak: true };
    }
    if (n === 2) {
      if (rugged) return { lock: true, fouled: false, ruined: false, explode: false, jammed: false, wild: false, keepStreak: true };
      return { fouled: true, ruined: true, broken: true, jammed: false, explode: false, lock: false, wild: false, keepStreak: true };
    }
    if (n === 3) return { lock: true, fouled: false, explode: false, jammed: false, wild: false, keepStreak: true };
    if (n === 4) return { wild: true, fouled: false, explode: false, lock: false, jammed: false, wildShot: true, keepStreak: true };
    return {};
  }
  function applyD4(gun, n, opts) {
    opts = opts || {};
    var next = copyGun(gun);
    next.capacity = gunCapacity(gun, opts);
    var face = d4Result(n, isRugged(gun));
    next.pendingD4 = false;
    next.pendingD4Rolls = null;
    next.pendingD4Step = 0;
    next.jammed = !!face.jammed;
    next.explode = !!face.explode;
    next.fire = face.fire || "";
    next.wild = !!(face.wild || face.wildShot);
    next.lock = false;
    next.lockIndex = null;
    next.misStreak = Number(gun && gun.misStreak) || 0;
    if (face.fouled) markFouled(next);
    if (face.lock) applyLock(next, next.capacity, opts.chamber);
    return { gun: next, face: face };
  }
  function markDirty(gun) {
    if (!gun) return gun;
    if (!gun.dirty) {
      gun.dirty = true;
      gun.misStreak = (Number(gun.misStreak) || 0) + 1;
    } else gun.dirty = true;
    return gun;
  }
  function reopenIndex(gun) {
    var cap = gunCapacity(gun);
    var locks = activeLocks(gun, cap);
    return locks.length ? locks[0] : null;
  }
  function lockupCount(gun) {
    return activeLocks(gun, gunCapacity(gun)).length;
  }
  function lockupLabel(n) {
    return "LOCKED UP ×" + (Number(n) || 0);
  }
  /** Checkbox and cylinder marks a re-render paints from the gun as it stands. */
  function gunFace(gun) {
    var next = copyGun(gun);
    var n = lockupCount(next);
    var cap = next.capacity;
    var locks = activeLocks(next, cap);
    var marks = [];
    var k;
    for (k = 0; k < cap; k++) marks.push(locks.indexOf(k) >= 0 ? "X" : "");
    return {
      jammed: !!next.jammed,
      fouled: !!next.fouled,
      dirty: !!next.dirty,
      ruined: !!next.ruined,
      misStreak: next.misStreak,
      pendingD4: !!next.pendingD4,
      lockedChambers: next.lockedChambers.slice(),
      lockup: n,
      lockupLabel: lockupLabel(n),
      lockupChecked: n > 0,
      chamberMarks: marks
    };
  }
  /** Reopen one locked chamber, or every locked chamber. Streak and fouling stay. */
  function clearLocks(gun, mode, chamber) {
    var next = copyGun(gun);
    var all = copyLocks(next.lockedChambers);
    var locks = activeLocks(next, next.capacity);
    if (mode === "one") {
      var idx = null;
      if (chamber != null && chamber !== "" && isFinite(Number(chamber))) {
        var picked = Math.floor(Number(chamber));
        if (all.indexOf(picked) >= 0) idx = picked;
      }
      if (idx == null) idx = locks.length ? locks[0] : (all.length ? all[0] : null);
      next.cleared = idx == null ? [] : [idx];
      next.lockedChambers = idx == null ? all : all.filter(function (n) { return n !== idx; });
    } else {
      next.cleared = all.slice();
      next.lockedChambers = [];
    }
    return next;
  }
  function shortRest(guns, withTools) {
    return (guns || []).map(function (g) {
      var next = copyGun(g);
      next.misStreak = 0;
      next.lockedChambers = withTools ? [] : copyLocks(g && g.lockedChambers);
      return next;
    });
  }
  root.SSDNSMisfire = {
    inRange: inRange,
    isRugged: isRugged,
    isBigFifty: isBigFifty,
    hasMuzzleloader: hasMuzzleloader,
    unjamIsFree: unjamIsFree,
    unjamSpec: unjamSpec,
    activeLocks: activeLocks,
    copyLocks: copyLocks,
    nextLockIndex: nextLockIndex,
    outcome: outcome,
    resolveShot: resolveShot,
    cleanOptions: cleanOptions,
    applyClean: applyClean,
    commitClean: commitClean,
    pickClean: pickClean,
    applyOverride: applyOverride,
    d4Result: d4Result,
    applyD4: applyD4,
    markDirty: markDirty,
    reopenIndex: reopenIndex,
    lockupCount: lockupCount,
    lockupLabel: lockupLabel,
    gunFace: gunFace,
    clearLocks: clearLocks,
    shortRest: shortRest,
    WILD_TEXT: "Wild shot! DM picks a random creature in normal range (allies included); roll a new attack"
  };
})(typeof window !== "undefined" ? window : globalThis);

/**
 * Locked misfire rules. Pure helpers shared by the sheet and the DM Command Center.
 * A spark is never a misfire. Only the kept d20 counts toward the streak.
 * Both dice in the misfire range foul the gun and reset the streak.
 * A Dirty gun opens the d4 on every even consecutive misfire.
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
      rugged: isRugged(gun)
    };
  }
  function resolveShot(gun, shot) {
    var next = copyGun(gun);
    shot = shot || {};
    if (shot.spark) {
      next.spark = true;
      next.misfire = false;
      next.both = false;
      next.armD4 = false;
      next.reset = false;
      return next;
    }
    var ceiling = Number(shot.ceiling);
    if (!isFinite(ceiling) || ceiling < 1) ceiling = 1;
    var n1 = shot.n1;
    var n2 = shot.n2;
    var nat = shot.nat != null ? shot.nat : n1;
    var both = n2 != null && n2 !== "" && inRange(n1, ceiling) && inRange(n2, ceiling);
    next.spark = false;
    next.both = both;
    if (both) {
      next.fouled = true;
      next.jammed = false;
      next.misStreak = 0;
      next.misfire = true;
      next.armD4 = false;
      next.reset = true;
      return next;
    }
    if (!inRange(nat, ceiling)) {
      next.misStreak = 0;
      next.misfire = false;
      next.armD4 = false;
      next.reset = true;
      return next;
    }
    var streak = next.misStreak + 1;
    next.misfire = true;
    next.reset = false;
    if (next.dirty && streak % 2 === 0) {
      next.misStreak = streak;
      next.armD4 = true;
      next.jammed = false;
      return next;
    }
    next.misStreak = streak;
    next.jammed = true;
    next.armD4 = false;
    return next;
  }
  function cleanOptions(gun) {
    gun = gun || {};
    var ruined = !!(gun.ruined || gun.broken);
    var fouled = !!gun.fouled;
    var dirty = !!gun.dirty;
    var jammed = !!gun.jammed;
    var options = [];
    if (ruined) {
      options.push({
        id: "ruined-gunsmith",
        label: "gunsmith repair, 500 ES and a day",
        cost: 500,
        clears: ["ruined", "broken", "fouled", "dirty", "jammed"],
        resetStreak: true,
        comesClean: true
      });
      return options;
    }
    if (fouled) {
      options.push({
        id: "fouled-rest",
        label: "a short rest working on it with tinker's or gunsmith's tools",
        cost: 0,
        clears: ["fouled", "jammed"],
        resetStreak: true
      });
      options.push({
        id: "fouled-pay",
        label: "pay a gunsmith 500 ES",
        cost: 500,
        clears: ["fouled", "jammed"],
        resetStreak: true
      });
    }
    if (dirty) {
      options.push({
        id: "dirty-kit",
        label: "10 minutes with gunsmith's tools or a gun cleaning kit",
        cost: 0,
        clears: ["dirty", "jammed"],
        resetStreak: true
      });
    }
    if (jammed && !fouled) {
      options.push({
        id: "jam-action",
        label: "Clear the jam (an action)",
        cost: 0,
        clears: ["jammed"],
        resetStreak: false
      });
      options.push({
        id: "jam-bonus",
        label: "Bonus action and a DC 10 Dexterity check (add proficiency with tinker's or gunsmith's tools)",
        cost: 0,
        clears: ["jammed"],
        resetStreak: false,
        check: { dc: 10, ability: "DEX" }
      });
    }
    return options;
  }
  function applyClean(gun, optionId) {
    var opt = cleanOptions(gun).filter(function (o) { return o.id === optionId; })[0];
    if (!opt) return { ok: false, reason: "That clean isn't available." };
    var next = copyGun(gun);
    (opt.clears || []).forEach(function (k) { next[k] = false; });
    if (opt.comesClean) {
      next.dirty = false;
      next.fouled = false;
      next.ruined = false;
      next.broken = false;
      next.jammed = false;
    }
    if (opt.resetStreak) next.misStreak = 0;
    if (kClearsPending(opt)) {
      next.pendingD4 = false;
      next.pendingD4Rolls = null;
      next.pendingD4Step = 0;
    }
    next.broken = !!next.ruined;
    return { ok: true, gun: next, option: opt };
  }
  function kClearsPending(opt) {
    return !!(opt && (opt.resetStreak || opt.comesClean));
  }
  function applyOverride(gun, override) {
    var next = copyGun(gun);
    override = override || {};
    var notes = [];
    ["dirty", "fouled", "ruined"].forEach(function (k) {
      if (override[k] == null || override[k] === "") return;
      var on = !!override[k];
      next[k] = on;
      if (k === "ruined") next.broken = on;
      notes.push((on ? "set " : "cleared ") + k);
    });
    if (override.resetStreak || override.misStreak === 0) {
      next.misStreak = 0;
      notes.push("streak reset");
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
    if (n === 1) return { ruined: true, broken: true, jammed: false, fouled: false, explode: true, fire: "1d4" };
    if (n === 2) {
      if (rugged) return { jammed: true, fouled: false, explode: false };
      return { fouled: true, jammed: false, explode: false };
    }
    if (n === 3) return { jammed: true, fouled: false, explode: false };
    if (n === 4) return { again: true };
    return {};
  }
  root.SSDNSMisfire = {
    inRange: inRange,
    isRugged: isRugged,
    resolveShot: resolveShot,
    cleanOptions: cleanOptions,
    applyClean: applyClean,
    applyOverride: applyOverride,
    d4Result: d4Result
  };
})(typeof window !== "undefined" ? window : globalThis);

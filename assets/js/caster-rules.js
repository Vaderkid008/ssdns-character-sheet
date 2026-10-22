/* L0200 Caster Gun rules (DND Bot lock; Jessey rulings 2026-10-20 8:20-8:25 PM CT; sheet 0.3.105 / DMCC 0.2.118).
   BOOK1: Caster Guns / How channeling works, Plain rounds, Big Fifty, Wrecked.
   1. Shells: a Caster Gun (Blacksnake, Hognose, or any gun tagged caster) takes any cartridge, never shotgun shells.
      Override path for a later relic shotgun caster (DM Guide, L0199, not statted yet), checked in this order:
        gun row g.allowShells (true/false) -> weapon w.allowShells / w.relicShotgun -> SSDNSItemUI spec `casterShells`
        (true, or a function (w, g) => bool) registered for the weapon / item id.
   2. Big Fifty: a .50-90 round fired from a Caster Gun misfires on 1-5. On EACH such misfire roll 1d6 (logged). On a 1 the
      gun explodes, whatever the streak: the shooter takes 2d6 fire (rolled, logged, applied to HP) and the gun is Wrecked.
   3. Wrecked (g.wrecked): it can't fire and can't be cast through. Only a traveling merchant repairs it, never a gunsmith.
      The DM clears it from the DMCC gun panel (Merchant repair). The plain DM Repair and gunsmith paths leave it on.
   Pure helpers + small sheet actions. No database.rules.json change (the flag rides in the existing character doc). */
(function (root) {
  "use strict";
  var SHELL_NOTE = "Caster Guns don't take shotgun shells. Any cartridge works, the Big Fifty .50-90 included.";
  var WRECKED_NOTE = "Wrecked \u2014 repair: traveling merchant only (not a gunsmith)";
  var CANT_FIRE = "Wrecked: it can't fire. Only a traveling merchant can repair it, never a gunsmith.";
  var CANT_CAST = "Your Caster Gun is Wrecked, so you can't cast through it. Only a traveling merchant can repair it, never a gunsmith.";
  var BIG_FIFTY_MISFIRE = 5;

  function isCaster(w, g) {
    if (w && w.id === "borrowed-iron") return false;
    if (g && g.caster === true) return true;
    return !!(w && (w.group === "caster" || w.hexShells || w.caster === true || w.category === "caster"));
  }
  function itemSpec(w, g) {
    var U = root.SSDNSItemUI;
    if (!U || !U.specFor) return null;
    return U.specFor(w) || U.specFor(g && { id: g.weapon, weaponId: g.weapon, ui: g.ui }) || null;
  }
  /** Can this gun take shotgun shells? Ordinary guns: unchanged (true). Caster Guns: no, unless overridden. */
  function takesShells(w, g) {
    if (!isCaster(w, g)) return true;
    if (g && g.allowShells != null) return !!g.allowShells;
    if (w && (w.allowShells || w.relicShotgun)) return true;
    var spec = itemSpec(w, g);
    if (spec && spec.casterShells != null) {
      try { return typeof spec.casterShells === "function" ? !!spec.casterShells(w, g) : !!spec.casterShells; } catch (e) { return false; }
    }
    return false;
  }
  function isShellType(t) { t = String(t || ""); return t === "buck" || t === "slug" || t === "shell"; }
  /** "" = fine; else the reason this pool / chamber token can't go in this gun. */
  function shellBlock(w, g, poolOrType) {
    var t = typeof poolOrType === "string" ? poolOrType : (poolOrType && poolOrType.type);
    if (isShellType(t) && isCaster(w, g) && !takesShells(w, g)) return SHELL_NOTE;
    return "";
  }
  function parse(token) {
    var s = String(token || "");
    var p = s.split(":");
    if (p[0] === "k") return { kind: p[1] || "", caliber: p[2] || "", tier: p[3] || "" };
    return { kind: s ? "plain" : "", caliber: "", tier: "" };
  }
  /** A Big Fifty .50-90 round: a bigfifty pool token or any token stamped .50-90. */
  function isBigFiftyRound(token, g) {
    var p = parse(token);
    if (p.kind === "bigfifty" || /50-90/.test(p.caliber)) return true;
    /* a legacy plain chamber follows the gun's chosen round */
    if (p.kind === "plain" && g && /\|\.?50-90$/.test(String(g.chamber || ""))) return true;
    return false;
  }
  /** Misfire ceiling for a shot: a .50-90 from a Caster Gun misfires on 1-5. */
  function misfireCeiling(w, g, token, base) {
    base = Number(base) || 0;
    if (isCaster(w, g) && isBigFiftyRound(token, g)) return Math.max(base, BIG_FIFTY_MISFIRE);
    return base;
  }
  /** Does this misfire call for the d6? */
  function needsBoomRoll(w, g, token, misfired) {
    return !!misfired && isCaster(w, g) && isBigFiftyRound(token, g);
  }
  function die(sides, rng) {
    var r = typeof rng === "function" ? rng : (api.rng || Math.random);
    var n = Math.floor(Number(r()) * sides) + 1;
    if (!isFinite(n) || n < 1) n = 1;
    if (n > sides) n = sides;
    return n;
  }
  /** Roll the d6 (and the 2d6 fire on a 1). Mutates g: Wrecked on a 1 (jam / pending d4 dropped, nothing else wiped). */
  function rollBoom(g, rng) {
    var d6 = die(6, rng);
    var out = { d6: d6, exploded: d6 === 1, fire: [], fireTotal: 0 };
    if (out.exploded) {
      out.fire = [die(6, rng), die(6, rng)];
      out.fireTotal = out.fire[0] + out.fire[1];
      if (g) {
        g.wrecked = true;
        g.jammed = false;
        g.pendingD4 = false;
        g.pendingD4Rolls = null;
        g.pendingD4Step = 0;
      }
    }
    return out;
  }
  function isWrecked(g) { return !!(g && g.wrecked); }
  /** Traveling merchant repair (DM, from the DMCC): clears Wrecked and every misfire mark. */
  function merchantRepair(g) {
    if (!g) return false;
    var was = !!g.wrecked;
    g.wrecked = false;
    g.fouled = false; g.ruined = false; g.broken = false; g.jammed = false; g.dirty = false; g.cracked = false;
    g.misStreak = 0; g.lockedChambers = []; g.pendingD4 = false; g.pendingD4Rolls = null; g.pendingD4Step = 0; g.exploded = false;
    return was;
  }
  function d6Line(who, gun, d6) {
    return who + " · " + gun + " · Big Fifty misfire in a Caster Gun: 1d6 = " + d6 + (d6 === 1 ? " — EXPLODES" : " — holds");
  }
  function boomLine(who, gun, fire, total) {
    return who + " · " + gun + " explodes: 2d6 fire = " + fire.join("+") + " = " + total + " to " + who + ". The gun is Wrecked (repair: traveling merchant only).";
  }

  /* ---- sheet side (needs SSDNSApp / SSDNSSheet) ---- */
  function addLog(entry) { if (root.SSDNSSheet && root.SSDNSSheet.addLog) { try { root.SSDNSSheet.addLog(entry); } catch (e) {} } }
  function feed(entry) { if (root.SSDNSDmJoin && root.SSDNSDmJoin.postFeed) { try { root.SSDNSDmJoin.postFeed(entry); } catch (e) {} } }
  function showDie(sides, face, formula, total) { if (root.SSDNSDice && root.SSDNSDice.show) { try { root.SSDNSDice.show({ sides: sides, face: face, formula: formula, total: total }); } catch (e) {} } }
  /** Called right after a Caster Gun shot misfired on a .50-90. Logs the d6; on a 1: 2d6 fire to the shooter + Wrecked.
      Returns the roll (or null when no roll was needed). opts: { who, gunName, w } */
  function afterMisfire(g, token, misfired, opts) {
    opts = opts || {};
    if (!needsBoomRoll(opts.w, g, token, misfired)) return null;
    var who = opts.who || "You", gun = opts.gunName || "Caster Gun";
    var r = rollBoom(g);
    /* the gun state changes now; the d6 / fire lines land just after the shot's own log line */
    if (opts.sync || typeof root.setTimeout !== "function") tellBoom(r, who, gun);
    else root.setTimeout(function () { tellBoom(r, who, gun); }, 0);
    return r;
  }
  function tellBoom(r, who, gun) {
    var t1 = d6Line(who, gun, r.d6);
    addLog({ kind: "roll", text: t1, formula: "1d6", result: r.d6, face: r.d6 });
    feed({ kind: "d6", text: t1, result: r.d6, formula: "1d6" });
    showDie(6, r.d6, "1d6", r.d6);
    if (r.exploded) {
      var t2 = boomLine(who, gun, r.fire, r.fireTotal);
      if (root.SSDNSAudio && root.SSDNSAudio.play) { try { root.SSDNSAudio.play("explode"); } catch (e) {} }
      addLog({ kind: "roll", text: t2, formula: "2d6", result: r.fireTotal, rolls: r.fire.slice() });
      feed({ kind: "d6", text: t2, result: r.fireTotal, formula: "2d6" });
      if (root.SSDNSSheet && root.SSDNSSheet.applyDelta) { try { root.SSDNSSheet.applyDelta(-r.fireTotal, t2); } catch (e) {} }
      if (root.SSDNSToast) { try { root.SSDNSToast(gun + " exploded: " + r.fireTotal + " fire. It's Wrecked."); } catch (e) {} }
    }
  }
  /** DM merchant repair command (op "merchant") on the sheet. */
  function merchantRepairGun(i, hint) {
    var app = root.SSDNSApp, d = app && app.doc && app.doc();
    var guns = (d && d.character && d.character.guns) || [];
    var g = guns[i];
    hint = hint || {};
    if ((!g || !g.weapon) && hint.weapon) g = guns.filter(function (x) { return x && x.weapon === hint.weapon; })[0];
    if (!g) return false;
    var name = hint.name || g.name || g.weapon || "Gun";
    if (app && app.applyPatch) app.applyPatch(function () { merchantRepair(g); }); else merchantRepair(g);
    addLog({ kind: "alert", text: "A traveling merchant repaired " + name + ". It's no longer Wrecked." });
    if (app && app.refreshGunFace) app.refreshGunFace();
    if (root.SSDNSFocus && root.SSDNSFocus.paintCastBlock) { try { root.SSDNSFocus.paintCastBlock(); } catch (e) {} }
    return true;
  }

  var api = {
    SHELL_NOTE: SHELL_NOTE, WRECKED_NOTE: WRECKED_NOTE, CANT_FIRE: CANT_FIRE, CANT_CAST: CANT_CAST, BIG_FIFTY_MISFIRE: BIG_FIFTY_MISFIRE,
    isCaster: isCaster, takesShells: takesShells, isShellType: isShellType, shellBlock: shellBlock,
    isBigFiftyRound: isBigFiftyRound, misfireCeiling: misfireCeiling, needsBoomRoll: needsBoomRoll,
    rollBoom: rollBoom, isWrecked: isWrecked, merchantRepair: merchantRepair, d6Line: d6Line, boomLine: boomLine,
    afterMisfire: afterMisfire, merchantRepairGun: merchantRepairGun,
    rng: null /* tests: set to a function returning [0,1) */
  };
  root.SSDNSCasterRules = api;
})(typeof window !== "undefined" ? window : globalThis);

/* Disarm and Rob. The sheet rules have no contested-disarm entry, so this
   follows the 5e contest: an attack roll against Athletics or Acrobatics.
   Ties leave the weapon where it was. No book text lives here. */
(function (root) {
  "use strict";

  var REACH = 5;
  var NPC_PASSIVE = 15;

  function signed(n) {
    var v = Number(n) || 0;
    return (v >= 0 ? "+" : "") + v;
  }

  function skillBonus(creature, name) {
    creature = creature || {};
    var skills = creature.skills || {};
    var raw = skills[name];
    if (raw && typeof raw === "object") raw = raw.bonus != null ? raw.bonus : raw.mod;
    if (raw != null && raw !== "" && isFinite(Number(raw))) return Number(raw);
    var ability = name === "Athletics" ? "STR"
      : (name === "Acrobatics" || name === "Sleight of Hand" ? "DEX"
        : (name === "Perception" ? "WIS" : ""));
    var mods = creature.mods || {};
    if (ability && mods[ability] != null && mods[ability] !== "" && isFinite(Number(mods[ability]))) return Number(mods[ability]);
    var scores = creature.abilities || creature.scores || {};
    if (ability && scores[ability] != null && scores[ability] !== "" && isFinite(Number(scores[ability]))) {
      return Math.floor((Number(scores[ability]) - 10) / 2);
    }
    return null;
  }

  function defensePick(creature, chosen) {
    if (chosen === "Athletics" || chosen === "Acrobatics") {
      var picked = skillBonus(creature, chosen);
      return { skill: chosen, mod: picked == null ? 0 : picked };
    }
    var ath = skillBonus(creature, "Athletics");
    var acr = skillBonus(creature, "Acrobatics");
    if (ath == null && acr == null) return { skill: "Athletics", mod: 0, generic: true };
    if (acr == null || (ath != null && ath >= acr)) return { skill: "Athletics", mod: ath || 0 };
    return { skill: "Acrobatics", mod: acr };
  }

  function twoHanded(weapon) {
    weapon = weapon || {};
    var props = Array.isArray(weapon.properties) ? weapon.properties.join(" ") : String(weapon.properties || "");
    var group = String(weapon.group || "");
    var slot = String(weapon.slot || "");
    if (/two-handed|two handed/i.test(props)) return true;
    if (slot === "long") return true;
    if (group === "rifle" || group === "shotgun" || group === "carbine" || group === "bigbore") return true;
    return false;
  }

  function inReach(feet) {
    if (feet == null || feet === "" || !isFinite(Number(feet))) return { ok: true, unknown: true };
    var n = Number(feet);
    return { ok: n <= REACH, unknown: false, feet: n };
  }

  function rollD20(rng, adv) {
    var roll = rng || Math.random;
    var a = 1 + Math.floor(roll() * 20);
    if (a < 1) a = 1;
    if (a > 20) a = 20;
    if (adv !== "adv" && adv !== "dis") return { faces: [a], kept: a };
    var b = 1 + Math.floor(roll() * 20);
    if (b < 1) b = 1;
    if (b > 20) b = 20;
    var kept = adv === "dis" ? Math.min(a, b) : Math.max(a, b);
    return { faces: [a, b], kept: kept };
  }

  function faceText(faces, kept) {
    if (!faces || faces.length < 2) return String(kept);
    return faces[0] + "/" + faces[1] + " keep " + kept;
  }

  function contest(opts) {
    opts = opts || {};
    var mode = opts.mode || "disarm";
    var reach = inReach(opts.feet);
    if (opts.override) {
      return { ok: true, override: true, mode: mode, line: "DM override" };
    }
    if (!reach.ok) {
      return { ok: false, outOfRange: true, mode: mode, feet: reach.feet, line: "Out of reach (" + reach.feet + " ft)" };
    }
    if (opts.downed) {
      return { ok: true, downed: true, mode: mode, line: "Downed: no contest" };
    }
    if (mode === "rob-pocket" || mode === "rob-es") {
      var sohRaw = skillBonus(opts.actor, "Sleight of Hand");
      var sohMod = sohRaw == null ? 0 : sohRaw;
      var passive = opts.passive;
      if (passive == null || passive === "" || !isFinite(Number(passive))) {
        var perc = skillBonus(opts.target, "Perception");
        passive = perc == null ? NPC_PASSIVE : (10 + perc);
      } else passive = Number(passive);
      var sneak = rollD20(opts.rng, opts.advantage || "");
      var sneakTotal = sneak.kept + sohMod;
      var sneaked = sneakTotal >= passive;
      return {
        ok: sneaked,
        mode: mode,
        attack: { faces: sneak.faces, kept: sneak.kept, mod: sohMod, total: sneakTotal, skill: "Sleight of Hand" },
        defense: { passive: passive, skill: "passive Perception" },
        line: "Sleight of Hand " + faceText(sneak.faces, sneak.kept) + signed(sohMod) + " = " + sneakTotal + " vs passive Perception " + passive + (sneaked ? " — success" : " — fail")
      };
    }
    var atkMod = opts.attackMod != null && opts.attackMod !== "" && isFinite(Number(opts.attackMod)) ? Number(opts.attackMod) : 0;
    var def = defensePick(opts.target, opts.defenseSkill);
    var defAdv = (opts.twoHanded || twoHanded(opts.weapon)) ? "adv" : "";
    var atk = rollD20(opts.rng, opts.advantage || "");
    var defRoll = rollD20(opts.rng, defAdv);
    var atkTotal = atk.kept + atkMod;
    var defTotal = defRoll.kept + def.mod;
    var success = atkTotal > defTotal;
    var advNote = defAdv ? " (advantage, two-handed)" : "";
    return {
      ok: success,
      tie: atkTotal === defTotal,
      mode: mode,
      attack: { faces: atk.faces, kept: atk.kept, mod: atkMod, total: atkTotal },
      defense: { faces: defRoll.faces, kept: defRoll.kept, mod: def.mod, total: defTotal, skill: def.skill, advantage: defAdv === "adv" },
      line: "Attack " + faceText(atk.faces, atk.kept) + signed(atkMod) + " = " + atkTotal + " vs " + def.skill + " " + faceText(defRoll.faces, defRoll.kept) + signed(def.mod) + " = " + defTotal + advNote + (success ? " — success" : " — fail")
    };
  }

  function actionCost(opts) {
    opts = opts || {};
    if (opts.downed) return "free action";
    var take = opts.take || "weapon";
    var calling = String(opts.calling || "");
    if (opts.mode === "rob" && (take === "gear" || take === "es") && (calling === "gambler" || calling === "gambler-burglar")) return "bonus action";
    return "action";
  }

  function plan(opts) {
    opts = opts || {};
    var actor = opts.actor || {};
    var target = opts.target || {};
    var weapon = opts.weapon || {};
    var mode = opts.mode === "rob" ? "rob" : "disarm";
    var take = mode === "disarm" ? "weapon" : (opts.take || "weapon");
    var success = !!(opts.success || opts.override);
    var who = actor.name || "Someone";
    var whom = target.name || "someone";
    var itemName = take === "es" ? ((Math.max(0, Math.floor(Number(opts.es) || 0))) + " ES")
      : (take === "gear" ? (String(opts.gearText || "an item").replace(/^•\s*/, "").trim() || "an item")
        : (weapon.name || "weapon"));
    var verb = mode === "rob" ? "robs" : "disarms";
    var failVerb = mode === "rob" ? "rob" : "disarm";
    var cost = actionCost({ mode: mode, take: take, downed: opts.downed, calling: actor.calling });
    var head = success
      ? (who + " " + verb + " " + whom + (mode === "disarm" || take === "weapon" ? " of " + itemName : " (" + itemName + ")"))
      : (who + " fails to " + failVerb + " " + whom + (mode === "disarm" || take === "weapon" ? " of " + itemName : " (" + itemName + ")"));
    var bits = [];
    if (opts.contestLine) bits.push(opts.contestLine);
    bits.push(cost);
    if (opts.override && success) bits.push("DM override");
    var chat = head + ": " + bits.join(" · ");
    if (!success) return { commands: [], enemy: {}, chat: chat + "." };

    var commands = [];
    var enemy = {};
    var combat = !!opts.combat;
    var slotFree = opts.slotFree !== false;
    var weaponKind = weapon.kind === "melee" ? "melee" : "gun";

    if (mode === "disarm") {
      chat += ". The " + itemName + " drops, unequipped.";
      if (target.kind === "player") {
        commands.push({
          type: "gun",
          to: target.id,
          payload: { op: "equip", kind: weaponKind, index: weapon.index, equipped: false }
        });
      } else {
        enemy.dropAttackId = weapon.id || weapon.name || "";
      }
      return { commands: commands, enemy: enemy, chat: chat };
    }

    if (take === "es") {
      var es = Math.max(0, Math.floor(Number(opts.es) || 0));
      chat += ". DM approved.";
      if (es && target.kind === "player") {
        commands.push({ type: "reward_es", to: target.id, payload: { delta: -es, reason: who + " robs " + es + " ES" } });
      }
      if (es && actor.kind === "player") {
        commands.push({ type: "reward_es", to: actor.id, payload: { delta: es, reason: "Robbed " + es + " ES from " + whom } });
      }
      return { commands: commands, enemy: enemy, chat: chat };
    }

    if (take === "gear") {
      var text = String(opts.gearText || "").replace(/^•\s*/, "").trim();
      chat += ". DM approved.";
      if (text && target.kind === "player") commands.push({ type: "take_gear", to: target.id, payload: { text: text } });
      if (text && actor.kind === "player") commands.push({ type: "reward_item", to: actor.id, payload: { text: text } });
      if (text && actor.kind !== "player") enemy.gear = text;
      return { commands: commands, enemy: enemy, chat: chat };
    }

    var enemyTaker = actor.kind !== "player";
    var stowed = combat || !slotFree || enemyTaker;
    chat += stowed
      ? ". Taken and stowed" + (combat ? " (loadout stays locked in the fight)" : (enemyTaker ? "" : " (that slot is full)")) + "."
      : ". Taken and equipped.";
    if (target.kind === "player") {
      commands.push({ type: "gun", to: target.id, payload: { op: "take", kind: weaponKind, index: weapon.index } });
    } else {
      enemy.removeAttackId = weapon.id || weapon.name || "";
    }
    if (actor.kind === "player") {
      commands.push({
        type: "gun",
        to: actor.id,
        payload: {
          op: "receive",
          kind: weaponKind,
          weapon: weapon.weaponId || "",
          name: weapon.name || "",
          equipped: !stowed,
          dm: true
        }
      });
    } else {
      enemy.give = {
        name: weapon.name || "Taken weapon",
        weapon: weapon.weaponId || "",
        toHit: weapon.toHit,
        damage: weapon.damage || "",
        group: weapon.group || "",
        properties: weapon.properties || "",
        equipped: false
      };
    }
    return { commands: commands, enemy: enemy, chat: chat };
  }

  /* Run work one at a time. A call during an in-flight run is not dropped;
     work() runs again with whatever the caller closed over, so a gun reload
     that lands mid-publish still goes out. */
  function coalesce(work) {
    var busy = false;
    var again = false;
    var run = function () {
      if (busy) { again = true; return Promise.resolve(false); }
      busy = true;
      var loop = function () {
        again = false;
        return Promise.resolve().then(work).then(function () {
          if (again) return loop();
        });
      };
      return loop().then(function () {
        busy = false;
        if (again) return run();
        return true;
      }, function (err) {
        busy = false;
        if (again) run();
        return Promise.reject(err);
      });
    };
    return run;
  }

  root.SSDNSGrab = {
    REACH: REACH,
    NPC_PASSIVE: NPC_PASSIVE,
    skillBonus: skillBonus,
    defensePick: defensePick,
    twoHanded: twoHanded,
    inReach: inReach,
    contest: contest,
    actionCost: actionCost,
    plan: plan,
    coalesce: coalesce
  };
})(typeof window !== "undefined" ? window : globalThis);

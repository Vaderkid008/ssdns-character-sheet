(function () {
  "use strict";

  var BASE_ANTE = 5;
  var BET_MULTS = [1, 2, 5, 10, 20, 50, 75];
  var PAYOUT_TWO_MULT = 2;
  var PAYOUT_THREE_MULT = 10;
  var WILD_TWO_MULT = 5;
  var WILD_THREE_MULT = 25;

  var CRYSTALS = [
    { id: "clear", css: "crystal-clear", label: "Clear", value: 1, kind: "crystal" },
    { id: "amber", css: "crystal-amber", label: "Amber", value: 5, kind: "crystal" },
    { id: "blue", css: "crystal-blue", label: "Blue", value: 20, kind: "crystal" },
    { id: "green", css: "crystal-green", label: "Green", value: 50, kind: "crystal" },
    { id: "violet", css: "crystal-violet", label: "Violet", value: 100, kind: "crystal" },
    { id: "crimson", css: "crystal-crimson", label: "Crimson", value: 500, kind: "crystal" },
  ];

  var OUTLAW_WILD = { id: "bar", label: "Outlaw WILD", kind: "bar", value: 0 };

  var balance = 0;
  var betMult = 1;
  var allIn = false;
  var spinning = false;
  var muted = false;
  var audioCtx = null;

  var balanceEl = document.getElementById("balance");
  var statusEl = document.getElementById("status");
  var spinBtn = document.getElementById("spinBtn");
  var muteBtn = document.getElementById("muteBtn");
  var tierKeyEl = document.getElementById("tierKey");
  var jackpotBanner = document.getElementById("jackpotBanner");
  var chipInput = document.getElementById("chipInput");
  var setChipsBtn = document.getElementById("setChipsBtn");
  var addChipsBtn = document.getElementById("addChipsBtn");
  var betBtnsEl = document.getElementById("betBtns");
  var anteDisplay = document.getElementById("anteDisplay");
  var reelEls = [
    document.getElementById("reel0"),
    document.getElementById("reel1"),
    document.getElementById("reel2"),
  ];

  function ante() {
    if (allIn) return Math.max(0, balance);
    return BASE_ANTE * betMult;
  }

  /** 0 = casual … 3 = high roller / all-in — mild volatility only */
  function volatilityTier() {
    if (allIn) return 3;
    if (betMult >= 50) return 3;
    if (betMult >= 20) return 2;
    if (betMult >= 5) return 1;
    return 0;
  }

  function buildReelPool() {
    var tier = volatilityTier();
    var weights = {
      clear: 3 + tier,
      amber: 3 + tier,
      blue: 2,
      green: Math.max(1, 2 - Math.floor(tier / 2)),
      violet: Math.max(1, 2 - Math.floor(tier / 2)),
      crimson: Math.max(1, 2 - tier),
      bar: Math.max(1, 2 - Math.floor(tier / 2)),
    };
    var pool = [];
    var map = {};
    for (var i = 0; i < CRYSTALS.length; i++) {
      map[CRYSTALS[i].id] = CRYSTALS[i];
    }
    map.bar = OUTLAW_WILD;
    var keys = Object.keys(weights);
    for (var k = 0; k < keys.length; k++) {
      var id = keys[k];
      var n = weights[id];
      for (var w = 0; w < n; w++) {
        pool.push(map[id]);
      }
    }
    return pool;
  }

  function randomSymbol() {
    var pool = buildReelPool();
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function noiseBuffer(ctx, duration, decay) {
    var len = Math.floor(ctx.sampleRate * duration);
    var buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay || 2);
    }
    return buffer;
  }

  function playNoise(duration, volume, filterFreq, filterType, when) {
    if (muted) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime + (when || 0);
    var src = ctx.createBufferSource();
    var gain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    src.buffer = noiseBuffer(ctx, duration, 2.4);
    filter.type = filterType || "bandpass";
    filter.frequency.setValueAtTime(filterFreq || 1200, t0);
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(volume || 0.12, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  function tone(freq, duration, type, volume, when, slideTo) {
    if (muted) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    var t0 = ctx.currentTime + (when || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.1, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playChipClink() {
    tone(1800, 0.04, "triangle", 0.07);
    tone(2400, 0.05, "triangle", 0.05, 0.03);
    playNoise(0.04, 0.03, 4000, "highpass", 0.02);
  }

  function playBetSelect() {
    if (allIn) {
      tone(100, 0.1, "sawtooth", 0.08, 0, 60);
      playNoise(0.08, 0.06, 400, "lowpass", 0.02);
      tone(220, 0.08, "square", 0.05, 0.08);
      return;
    }
    tone(320 + Math.min(betMult, 75) * 2, 0.06, "square", 0.06);
    tone(480 + Math.min(betMult, 75) * 2, 0.08, "triangle", 0.05, 0.04);
  }

  function playSpinStart() {
    tone(90, 0.12, "sawtooth", 0.07, 0, 55);
    playNoise(0.1, 0.06, 400, "lowpass", 0.02);
    tone(180, 0.08, "square", 0.05, 0.08);
    var tier = volatilityTier();
    if (tier >= 2) {
      tone(55, 0.22, "sawtooth", 0.06, 0.04, 35);
      playNoise(0.12, 0.05, 200, "lowpass", 0.05);
    }
  }

  function playReelTick() {
    playNoise(0.025, 0.03, 2200, "highpass", 0);
    tone(700 + Math.random() * 120, 0.02, "triangle", 0.022);
  }

  function playReelStop() {
    playNoise(0.06, 0.08, 280, "lowpass", 0);
    tone(110, 0.07, "square", 0.08);
    tone(70, 0.1, "sine", 0.05, 0.03);
  }

  /** Layered six-shooter crack + body boom (+ optional chamber ring) */
  function playGunshot(when, heavy) {
    var w = when || 0;
    var punch = heavy ? 1.35 : 1;
    playNoise(0.07, 0.2 * punch, 2400, "bandpass", w);
    playNoise(0.1, 0.18 * punch, 1400, "highpass", w);
    playNoise(0.22, 0.16 * punch, 180, "lowpass", w);
    tone(200, 0.04, "square", 0.12 * punch, w, 50);
    tone(70, 0.2, "sine", 0.14 * punch, w + 0.01);
    if (heavy) {
      tone(45, 0.28, "sine", 0.1, w + 0.02);
      playNoise(0.12, 0.08, 900, "bandpass", w + 0.05);
    }
  }

  function playRicochet(when) {
    var w = when || 0;
    tone(1400, 0.05, "sine", 0.06, w, 2200);
    tone(2200, 0.08, "triangle", 0.05, w + 0.04, 900);
    playNoise(0.05, 0.04, 3500, "highpass", w + 0.02);
  }

  function playWhistle() {
    tone(900, 0.15, "sine", 0.05, 0, 1400);
    tone(1400, 0.2, "sine", 0.04, 0.12, 700);
  }

  function playWin(kind) {
    if (kind === "bar") {
      playGunshot(0, true);
      playRicochet(0.1);
      playGunshot(0.18, true);
      playGunshot(0.34, true);
      playWhistle();
      tone(523, 0.12, "triangle", 0.07, 0.42);
      tone(784, 0.25, "triangle", 0.08, 0.55);
    } else if (kind === "crimson") {
      playGunshot(0, true);
      playGunshot(0.12, true);
      playRicochet(0.2);
      playGunshot(0.28, true);
      tone(523, 0.12, "triangle", 0.06, 0.35);
      tone(784, 0.2, "triangle", 0.07, 0.45);
    } else if (kind === "triple") {
      playGunshot(0, true);
      playRicochet(0.1);
      playGunshot(0.16, false);
      tone(440, 0.1, "triangle", 0.05, 0.1);
      tone(660, 0.14, "triangle", 0.06, 0.18);
    } else {
      playGunshot(0, false);
      playRicochet(0.08);
      tone(440, 0.08, "triangle", 0.05, 0.06);
    }
  }

  function playLose() {
    tone(900, 0.03, "square", 0.04);
    tone(200, 0.06, "square", 0.03, 0.04);
    playNoise(0.2, 0.04, 600, "lowpass", 0.05);
    tone(140, 0.16, "sawtooth", 0.035, 0.08, 80);
  }

  function outlawEl() {
    var wrap = document.createElement("div");
    wrap.className = "outlaw-wild";
    wrap.title = "Outlaw WILD";
    wrap.setAttribute("aria-label", "Outlaw WILD");
    wrap.innerHTML = '<div class="wild-text">WILD</div><div class="wild-sub">Outlaw</div>';
    return wrap;
  }

  function crystalEl(crystal) {
    var el = document.createElement("span");
    el.className = "crystal " + crystal.css;
    el.title = crystal.label + " Eldorite";
    el.setAttribute("aria-label", crystal.label + " Eldorite crystal");
    return el;
  }

  function setReel(index, symbol) {
    reelEls[index].innerHTML = "";
    if (symbol.kind === "bar") {
      reelEls[index].appendChild(outlawEl());
    } else {
      reelEls[index].appendChild(crystalEl(symbol));
    }
    reelEls[index].dataset.symbol = symbol.id;
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function updateBalance() {
    balanceEl.textContent = String(balance);
    if (window.SSDNSWallet) window.SSDNSWallet.seen(balance); // SSDNS shards hook (v0.2.1)
    if (anteDisplay) {
      anteDisplay.textContent = allIn ? (balance > 0 ? "ALL (" + balance + ")" : "ALL") : String(ante());
    }
    if (spinBtn && !spinning) {
      spinBtn.disabled = balance < (allIn ? 1 : ante()) || (allIn && balance <= 0);
    }
  }

  function clearWinHighlight() {
    for (var i = 0; i < reelEls.length; i++) {
      reelEls[i].classList.remove("win");
    }
  }

  function evaluate(results) {
    var cost = evaluate._spinCost != null ? evaluate._spinCost : ante();
    var barCount = 0;
    var i;
    for (i = 0; i < results.length; i++) {
      if (results[i].id === "bar") barCount += 1;
    }

    if (barCount === 3) {
      return {
        payout: cost * WILD_THREE_MULT,
        message: "THREE OUTLAW WILDS! Saloon jackpot +" + cost * WILD_THREE_MULT + "!",
        kind: "win",
        winKind: "bar",
        banner: "Outlaw Jackpot!",
      };
    }

    var candidates = [];
    for (i = 0; i < CRYSTALS.length; i++) {
      var crystal = CRYSTALS[i];
      var matches = 0;
      for (var r = 0; r < results.length; r++) {
        var s = results[r];
        if (s.id === crystal.id || s.id === "bar") matches += 1;
      }
      if (matches === 3) {
        var tripPay = cost * PAYOUT_THREE_MULT;
        var msg;
        if (crystal.id === "crimson" && barCount) {
          msg = "Wild + Crimson — CRIMSON JACKPOT! +" + tripPay + "!";
        } else if (barCount) {
          msg = "Outlaw WILD completes triple " + crystal.label + " — +" + tripPay + "!";
        } else {
          msg = "ELDORITE STRIKE! Triple " + crystal.label + " — +" + tripPay + "!";
        }
        candidates.push({
          payout: tripPay,
          message: msg,
          kind: "win",
          winKind: crystal.id === "crimson" ? "crimson" : "triple",
          banner: crystal.id === "crimson" ? "Crimson Jackpot!" : null,
          rank: 300 + crystal.value,
          paidId: crystal.id,
        });
      } else if (matches === 2) {
        var pairPay = cost * PAYOUT_TWO_MULT;
        candidates.push({
          payout: pairPay,
          message:
            (barCount ? "Outlaw WILD pairs " : "Pair of ") +
            crystal.label +
            " — bang! +" +
            pairPay +
            "!",
          kind: "win",
          winKind: "pair",
          banner: null,
          rank: 100 + crystal.value,
          paidId: crystal.id,
        });
      }
    }

    if (barCount === 2) {
      candidates.push({
        payout: cost * WILD_TWO_MULT,
        message: "Double Outlaw WILD — +" + cost * WILD_TWO_MULT + "!",
        kind: "win",
        winKind: "pair",
        banner: null,
        rank: 200,
        paidId: "bar",
      });
    }

    if (!candidates.length) {
      return {
        payout: 0,
        message: "Empty chamber — nothing but dust.",
        kind: "lose",
        winKind: null,
        banner: null,
        paidId: null,
      };
    }

    candidates.sort(function (x, y) {
      if (y.payout !== x.payout) return y.payout - x.payout;
      return y.rank - x.rank;
    });
    var best = candidates[0];
    return {
      payout: best.payout,
      message: best.message,
      kind: best.kind,
      winKind: best.winKind,
      banner: best.banner,
      paidId: best.paidId,
    };
  }

  function highlightWins(results, outcome) {
    if (!outcome || outcome.kind !== "win") return;
    var i;
    if (outcome.winKind === "bar" || outcome.paidId === "bar") {
      for (i = 0; i < results.length; i++) {
        if (results[i].id === "bar") reelEls[i].classList.add("win");
      }
      return;
    }
    var paidId = outcome.paidId;
    for (i = 0; i < results.length; i++) {
      var s = results[i];
      if (s.id === "bar" || (paidId && s.id === paidId)) {
        reelEls[i].classList.add("win");
      }
    }
  }

  function stopReel(index, symbol) {
    reelEls[index].classList.remove("spinning");
    setReel(index, symbol);
    playReelStop();
  }

  function spin() {
    if (spinning) return;

    var cost = ante();
    if (allIn) {
      if (balance <= 0) {
        setStatus("All In needs chips on the table — set or add Eldorite.", "lose");
        playLose();
        return;
      }
      cost = balance;
    } else if (balance < cost) {
      setStatus("Need " + cost + " Eldorite for this bet — set/add chips or lower bet.", "lose");
      spinBtn.disabled = true;
      playLose();
      return;
    }

    ensureAudio();
    spinning = true;
    spinBtn.disabled = true;
    balance -= cost;
    evaluate._spinCost = cost;
    updateBalance();
    clearWinHighlight();
    if (jackpotBanner) jackpotBanner.classList.remove("show", "bar-jackpot");

    var vol = volatilityTier();
    var volNote = vol >= 2 ? " · high-stakes odds" : "";
    setStatus(
      (allIn ? "ALL IN " + cost : betMult + "× bet · ante " + cost) +
        " — cylinder spinning" +
        volNote +
        "…",
      "idle"
    );
    playSpinStart();

    for (var i = 0; i < reelEls.length; i++) {
      reelEls[i].classList.add("spinning");
    }

    var tickCount = 0;
    var tick = setInterval(function () {
      for (var i = 0; i < reelEls.length; i++) {
        if (reelEls[i].classList.contains("spinning")) {
          setReel(i, randomSymbol());
        }
      }
      tickCount += 1;
      if (tickCount % 2 === 0) playReelTick();
    }, 80);

    var results = [randomSymbol(), randomSymbol(), randomSymbol()];

    setTimeout(function () { stopReel(0, results[0]); }, 600);
    setTimeout(function () { stopReel(1, results[1]); }, 1000);
    setTimeout(function () {
      stopReel(2, results[2]);
      clearInterval(tick);

      var outcome = evaluate(results);
      balance += outcome.payout;
      evaluate._spinCost = null;
      updateBalance();
      setStatus(outcome.message, outcome.kind);

      if (outcome.kind === "win") {
        highlightWins(results, outcome);
        playWin(outcome.winKind);
        if (outcome.banner && jackpotBanner) {
          jackpotBanner.textContent = outcome.banner;
          jackpotBanner.classList.add("show");
          if (outcome.winKind === "bar") jackpotBanner.classList.add("bar-jackpot");
        }
      } else {
        playLose();
      }

      spinning = false;
      // Stay on All In after a win if they still have chips; ante updates live
      if (allIn && balance > 0) {
        spinBtn.disabled = false;
        updateBalance();
      } else if (!allIn && balance >= ante()) {
        spinBtn.disabled = false;
      } else {
        spinBtn.disabled = true;
        if (balance <= 0) {
          setStatus(outcome.message + " Busted — set/add chips to ride again.", "lose");
        } else {
          setStatus(outcome.message + " Not enough for this bet — lower multiplier or add chips.", "lose");
        }
      }
    }, 1400);
  }

  function parseChipAmount() {
    var raw = chipInput && chipInput.value != null ? String(chipInput.value).trim() : "";
    if (raw === "") return null;
    var n = Number(raw);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
    return n;
  }

  function setChipsFromInput() {
    if (spinning) return;
    var n = parseChipAmount();
    if (n === null) {
      setStatus("Enter a whole number of Eldorite chips (0 or more).", "lose");
      return;
    }
    balance = n;
    updateBalance();
    if (jackpotBanner) jackpotBanner.classList.remove("show", "bar-jackpot");
    clearWinHighlight();
    playChipClink();
    var need = allIn ? 1 : ante();
    if (balance < need) {
      setStatus("Balance set to " + balance + ". Need more for current bet.", "idle");
    } else {
      setStatus("Balance set to " + balance + " Eldorite. Ready to spin.", "win");
    }
  }

  function addChipsFromInput() {
    if (spinning) return;
    var n = parseChipAmount();
    if (n === null || n === 0) {
      setStatus("Enter how many Eldorite chips to add.", "lose");
      return;
    }
    balance += n;
    updateBalance();
    playChipClink();
    setStatus("Added " + n + " — balance now " + balance + " Eldorite.", "win");
  }

  function toggleMute() {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
    if (!muted) {
      ensureAudio();
      playGunshot(0, true);
    }
  }

  function syncBetButtons() {
    var buttons = betBtnsEl.querySelectorAll(".bet-btn");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var isAll = btn.dataset.allIn === "1";
      var active = isAll ? allIn : (!allIn && Number(btn.dataset.mult) === betMult);
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setBetMult(m) {
    if (spinning) return;
    allIn = false;
    betMult = m;
    syncBetButtons();
    updateBalance();
    playBetSelect();
    var tip =
      volatilityTier() >= 2
        ? " Higher stakes: wilds & top crystals a bit rarer."
        : "";
    setStatus("Bet set to " + m + "× — ante " + ante() + " Eldorite." + tip, "idle");
  }

  function setAllIn() {
    if (spinning) return;
    allIn = true;
    syncBetButtons();
    updateBalance();
    playBetSelect();
    if (balance <= 0) {
      setStatus("All In armed — set your Eldorite chips first.", "idle");
    } else {
      setStatus(
        "ALL IN — ante " + balance + ". High-stakes odds (milder wilds / top crystals).",
        "idle"
      );
    }
  }

  function buildBetButtons() {
    betBtnsEl.innerHTML = "";
    for (var i = 0; i < BET_MULTS.length; i++) {
      (function (m) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bet-btn" + (!allIn && m === betMult ? " active" : "");
        btn.dataset.mult = String(m);
        btn.textContent = m + "×";
        btn.addEventListener("click", function () { setBetMult(m); });
        betBtnsEl.appendChild(btn);
      })(BET_MULTS[i]);
    }
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "bet-btn all-in" + (allIn ? " active" : "");
    allBtn.dataset.allIn = "1";
    allBtn.textContent = "ALL IN";
    allBtn.title = "Wager your entire Eldorite stack";
    allBtn.addEventListener("click", setAllIn);
    betBtnsEl.appendChild(allBtn);
  }

  function buildTierKey() {
    if (!tierKeyEl) return;
    tierKeyEl.innerHTML = "";
    for (var i = 0; i < CRYSTALS.length; i++) {
      var c = CRYSTALS[i];
      var chip = document.createElement("div");
      chip.className = "tier-chip";
      var sw = document.createElement("span");
      sw.className = "swatch " + c.css;
      chip.appendChild(sw);
      chip.appendChild(document.createTextNode(c.label + " = " + c.value));
      tierKeyEl.appendChild(chip);
    }
    var wildChip = document.createElement("div");
    wildChip.className = "tier-chip";
    var barSw = document.createElement("span");
    barSw.className = "swatch-bar";
    wildChip.appendChild(barSw);
    wildChip.appendChild(document.createTextNode("Outlaw WILD"));
    tierKeyEl.appendChild(wildChip);
  }

  setReel(0, CRYSTALS[3]);
  setReel(1, OUTLAW_WILD);
  setReel(2, CRYSTALS[1]);
  buildBetButtons();
  buildTierKey();
  updateBalance();

  spinBtn.addEventListener("click", spin);
  muteBtn.addEventListener("click", toggleMute);
  setChipsBtn.addEventListener("click", setChipsFromInput);
  addChipsBtn.addEventListener("click", addChipsFromInput);
  chipInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      setChipsFromInput();
    }
  });
  // SSDNS shards hook (v0.2.1): lets games/ssdns-wallet.js read/set the chip balance.
  window.SSDNSGame = { id: "slot-machine", get: function () { return balance; }, set: function (n) { balance = n; updateBalance(); }, busy: function () { return spinning; } };
})();

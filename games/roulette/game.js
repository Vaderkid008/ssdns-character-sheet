(function () {
  "use strict";

  // Compact western wheel: 0 green, 1–12 alternate red / charcoal
  var POCKETS = [
    { n: 0, color: "green" },
    { n: 1, color: "red" },
    { n: 2, color: "black" },
    { n: 3, color: "red" },
    { n: 4, color: "black" },
    { n: 5, color: "red" },
    { n: 6, color: "black" },
    { n: 7, color: "red" },
    { n: 8, color: "black" },
    { n: 9, color: "red" },
    { n: 10, color: "black" },
    { n: 11, color: "red" },
    { n: 12, color: "black" },
  ];

  var STAKE_PRESETS = [5, 10, 25, 50];
  var PAY_EVEN = 2;   // red/black/odd/even — full credit includes stake
  var PAY_STRAIGHT = 12;

  var POCKET_ANGLE = 360 / POCKETS.length;

  var balance = 0;
  var stake = 5;
  var allIn = false;
  var betType = null;       // red | black | green | odd | even | straight
  var straightNum = null;
  var spinning = false;
  var muted = false;
  var audioCtx = null;
  var wheelRotation = 0;    // degrees, cumulative
  var clackTimer = null;

  var balanceEl = document.getElementById("balance");
  var statusEl = document.getElementById("status");
  var spinBtn = document.getElementById("spinBtn");
  var muteBtn = document.getElementById("muteBtn");
  var chipInput = document.getElementById("chipInput");
  var setChipsBtn = document.getElementById("setChipsBtn");
  var addChipsBtn = document.getElementById("addChipsBtn");
  var stakeBtnsEl = document.getElementById("stakeBtns");
  var stakeDisplay = document.getElementById("stakeDisplay");
  var customStake = document.getElementById("customStake");
  var betTypesEl = document.getElementById("betTypes");
  var straightPicks = document.getElementById("straightPicks");
  var numGrid = document.getElementById("numGrid");
  var canvas = document.getElementById("wheel");
  var ctx2d = canvas.getContext("2d");
  var resultPip = document.getElementById("resultPip");
  var ballEl = document.getElementById("ball");

  /* ---------- audio (procedural) ---------- */

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function noiseBuffer(actx, duration, decay) {
    var len = Math.floor(actx.sampleRate * duration);
    var buffer = actx.createBuffer(1, len, actx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay || 2);
    }
    return buffer;
  }

  function playNoise(duration, volume, filterFreq, filterType, when) {
    if (muted) return;
    var actx = ensureAudio();
    if (!actx) return;
    var t0 = actx.currentTime + (when || 0);
    var src = actx.createBufferSource();
    var gain = actx.createGain();
    var filter = actx.createBiquadFilter();
    src.buffer = noiseBuffer(actx, duration, 2.2);
    filter.type = filterType || "bandpass";
    filter.frequency.setValueAtTime(filterFreq || 1400, t0);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(volume || 0.1, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(actx.destination);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
  }

  function tone(freq, duration, type, volume, when, slideTo) {
    if (muted) return;
    var actx = ensureAudio();
    if (!actx) return;
    var t0 = actx.currentTime + (when || 0);
    var osc = actx.createOscillator();
    var gain = actx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume || 0.1, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function sfxChip() {
    playNoise(0.05, 0.08, 2200, "highpass");
    tone(880, 0.06, "triangle", 0.05, 0);
  }

  function sfxBet() {
    tone(440, 0.07, "square", 0.06);
    tone(660, 0.08, "square", 0.05, 0.05);
  }

  function sfxClack() {
    playNoise(0.035, 0.09, 1800, "bandpass");
    tone(220 + Math.random() * 80, 0.04, "triangle", 0.04);
  }

  function sfxLand() {
    playNoise(0.12, 0.12, 600, "lowpass");
    tone(180, 0.15, "sine", 0.08, 0, 90);
  }

  function sfxWin() {
    // western hit — short “gunshot” + chime
    playNoise(0.08, 0.22, 400, "lowpass");
    playNoise(0.15, 0.1, 3000, "highpass", 0.02);
    tone(520, 0.12, "sawtooth", 0.07, 0.05, 260);
    tone(784, 0.25, "triangle", 0.09, 0.12);
    tone(1046, 0.35, "triangle", 0.07, 0.22);
  }

  function sfxLose() {
    playNoise(0.18, 0.14, 280, "lowpass");
    tone(140, 0.28, "sine", 0.08, 0, 70);
  }

  function startClacks(durationMs) {
    stopClacks();
    var start = performance.now();
    var interval = 90;
    function tick() {
      var elapsed = performance.now() - start;
      if (elapsed >= durationMs) return;
      sfxClack();
      // slow the clacks as spin settles
      var t = elapsed / durationMs;
      interval = 90 + t * t * 220;
      clackTimer = setTimeout(tick, interval);
    }
    clackTimer = setTimeout(tick, 60);
  }

  function stopClacks() {
    if (clackTimer) {
      clearTimeout(clackTimer);
      clackTimer = null;
    }
  }

  /* ---------- helpers ---------- */

  function pocketColor(n) {
    for (var i = 0; i < POCKETS.length; i++) {
      if (POCKETS[i].n === n) return POCKETS[i].color;
    }
    return "black";
  }

  function effectiveStake() {
    if (allIn) return Math.max(0, balance);
    return Math.max(0, Math.floor(stake) || 0);
  }

  function canSpin() {
    if (spinning) return false;
    if (balance <= 0) return false;
    var s = effectiveStake();
    if (s <= 0 || s > balance) return false;
    if (!betType) return false;
    if (betType === "straight" && (straightNum == null || straightNum < 0 || straightNum > 12)) {
      return false;
    }
    return true;
  }

  function updateSpinBtn() {
    spinBtn.disabled = !canSpin();
  }

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function refreshBalance() {
    balanceEl.textContent = String(balance);
    if (window.SSDNSWallet) window.SSDNSWallet.seen(balance); // SSDNS shards hook (v0.2.1)
    updateSpinBtn();
  }

  function refreshStakeDisplay() {
    var s = effectiveStake();
    stakeDisplay.textContent = allIn ? s + " (All In)" : String(s);
    updateSpinBtn();
  }

  /* ---------- canvas wheel ---------- */

  function drawWheel(rotationDeg) {
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(cx, cy) - 4;

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate((rotationDeg * Math.PI) / 180);

    // Outer rim
    ctx2d.beginPath();
    ctx2d.arc(0, 0, r, 0, Math.PI * 2);
    ctx2d.fillStyle = "#3a2818";
    ctx2d.fill();

    // Pockets — index 0 centered at top (−90°) when rotation = 0
    for (var i = 0; i < POCKETS.length; i++) {
      var start = ((i * POCKET_ANGLE) - 90 - POCKET_ANGLE / 2) * Math.PI / 180;
      var end = ((i * POCKET_ANGLE) - 90 + POCKET_ANGLE / 2) * Math.PI / 180;
      var p = POCKETS[i];
      ctx2d.beginPath();
      ctx2d.moveTo(0, 0);
      ctx2d.arc(0, 0, r - 6, start, end);
      ctx2d.closePath();
      if (p.color === "green") {
        ctx2d.fillStyle = "#6a9a20";
      } else if (p.color === "red") {
        ctx2d.fillStyle = "#8a2020";
      } else {
        ctx2d.fillStyle = "#1a1a1a";
      }
      ctx2d.fill();

      // Divider
      ctx2d.strokeStyle = "#c9a66b";
      ctx2d.lineWidth = 1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(0, 0);
      ctx2d.lineTo(Math.cos(start) * (r - 6), Math.sin(start) * (r - 6));
      ctx2d.stroke();

      // Number label
      var mid = (start + end) / 2;
      var lr = r * 0.72;
      ctx2d.save();
      ctx2d.translate(Math.cos(mid) * lr, Math.sin(mid) * lr);
      ctx2d.rotate(mid + Math.PI / 2);
      ctx2d.fillStyle = p.color === "green" ? "#1a1008" : "#f0e4cf";
      ctx2d.font = "bold 16px Segoe UI, Georgia, serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText(String(p.n), 0, 0);
      ctx2d.restore();
    }

    // Inner hub
    ctx2d.beginPath();
    ctx2d.arc(0, 0, r * 0.28, 0, Math.PI * 2);
    var hub = ctx2d.createRadialGradient(0, 0, 4, 0, 0, r * 0.28);
    hub.addColorStop(0, "#e8c878");
    hub.addColorStop(0.55, "#8a6a3a");
    hub.addColorStop(1, "#2a1c14");
    ctx2d.fillStyle = hub;
    ctx2d.fill();
    ctx2d.strokeStyle = "#c9a66b";
    ctx2d.lineWidth = 2;
    ctx2d.stroke();

    // Eldorite glow ring on hub
    ctx2d.beginPath();
    ctx2d.arc(0, 0, r * 0.1, 0, Math.PI * 2);
    ctx2d.fillStyle = "#b8e050";
    ctx2d.shadowColor = "rgba(160, 220, 60, 0.7)";
    ctx2d.shadowBlur = 12;
    ctx2d.fill();
    ctx2d.shadowBlur = 0;

    ctx2d.restore();
  }

  /**
   * Angle (degrees) to rotate the wheel so pocket `index` sits under the top pointer.
   * Pocket i center is at i * POCKET_ANGLE from the top reference when rotation = 0.
   * To bring pocket i to top: rotate by −i * POCKET_ANGLE (mod 360), plus full spins.
   */
  function targetRotationForIndex(index, extraSpins) {
    var spins = (extraSpins == null ? 5 : extraSpins) * 360;
    var align = -index * POCKET_ANGLE;
    // Continue forward from current rotation (always spin clockwise)
    var current = ((wheelRotation % 360) + 360) % 360;
    var desired = ((align % 360) + 360) % 360;
    var delta = (desired - current + 360) % 360;
    if (delta < 0.5) delta = 360; // always travel at least nearly a full turn of the align portion
    return wheelRotation + spins + delta;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateSpin(toRotation, durationMs, onDone) {
    var from = wheelRotation;
    var start = performance.now();
    ballEl.classList.add("visible");

    function frame(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var e = easeOutCubic(t);
      wheelRotation = from + (toRotation - from) * e;
      drawWheel(wheelRotation);

      // Ball rides opposite-ish on the rim for show
      var ballAngle = -wheelRotation * 1.15;
      var rad = (ballAngle * Math.PI) / 180;
      var orbit = canvas.clientWidth * 0.38;
      var bx = Math.sin(rad) * orbit;
      var by = -Math.cos(rad) * orbit;
      ballEl.style.transform =
        "translate(" + bx + "px, " + (by + canvas.clientWidth * 0.42) + "px)";

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        wheelRotation = toRotation;
        drawWheel(wheelRotation);
        ballEl.classList.remove("visible");
        onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ---------- betting / resolve ---------- */

  function resolveBet(resultNum) {
    var color = pocketColor(resultNum);
    var won = false;

    switch (betType) {
      case "red":
        won = color === "red";
        break;
      case "black":
        won = color === "black";
        break;
      case "green":
        won = resultNum === 0;
        break;
      case "odd":
        won = resultNum !== 0 && resultNum % 2 === 1;
        break;
      case "even":
        won = resultNum !== 0 && resultNum % 2 === 0;
        break;
      case "straight":
        won = resultNum === straightNum;
        break;
      default:
        won = false;
    }

    var mult = (betType === "green" || betType === "straight") ? PAY_STRAIGHT : PAY_EVEN;
    return { won: won, mult: mult, color: color };
  }

  function betLabel() {
    if (betType === "straight") return "Straight " + straightNum;
    if (betType === "green") return "Green (0)";
    return betType ? betType.charAt(0).toUpperCase() + betType.slice(1) : "—";
  }

  function spin() {
    if (!canSpin()) return;
    ensureAudio();

    var wager = effectiveStake();
    balance -= wager;
    refreshBalance();
    spinning = true;
    updateSpinBtn();
    resultPip.className = "result-pip";
    resultPip.textContent = "";
    setStatus("Ball’s rolling… " + wager + " on " + betLabel() + ".", "");

    // Fair random pocket first, then spin to it
    var index = Math.floor(Math.random() * POCKETS.length);
    var result = POCKETS[index].n;
    var duration = 4200 + Math.floor(Math.random() * 800);
    var target = targetRotationForIndex(index, 5 + Math.floor(Math.random() * 2));

    startClacks(duration - 200);
    animateSpin(target, duration, function () {
      stopClacks();
      sfxLand();

      var outcome = resolveBet(result);
      resultPip.textContent = String(result);
      resultPip.className = "result-pip show " + outcome.color;

      if (outcome.won) {
        var payout = wager * outcome.mult;
        balance += payout;
        refreshBalance();
        sfxWin();
        setStatus(
          "Winner! " + result + " (" + outcome.color + "). " +
            betLabel() + " pays " + outcome.mult + "× → +" + payout + " Eldorite.",
          "win"
        );
      } else {
        sfxLose();
        setStatus(
          "No dice — landed " + result + " (" + outcome.color + "). " +
            wager + " chips stay on the felt.",
          "lose"
        );
      }

      spinning = false;
      // Clear all-in after a spin so the next wager needs a fresh choice
      if (allIn) {
        allIn = false;
        syncStakeButtons();
      }
      refreshStakeDisplay();
      updateSpinBtn();
    });
  }

  /* ---------- UI wiring ---------- */

  function syncStakeButtons() {
    var buttons = stakeBtnsEl.querySelectorAll(".stake-btn");
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var isAll = btn.getAttribute("data-allin") === "1";
      var val = parseInt(btn.getAttribute("data-stake"), 10);
      var active = isAll ? allIn : (!allIn && stake === val);
      btn.classList.toggle("active", active);
    }
  }

  function buildStakeButtons() {
    stakeBtnsEl.innerHTML = "";
    for (var i = 0; i < STAKE_PRESETS.length; i++) {
      (function (amt) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "stake-btn";
        btn.setAttribute("data-stake", String(amt));
        btn.textContent = String(amt);
        btn.addEventListener("click", function () {
          if (spinning) return;
          allIn = false;
          stake = amt;
          customStake.value = "";
          syncStakeButtons();
          refreshStakeDisplay();
          sfxBet();
        });
        stakeBtnsEl.appendChild(btn);
      })(STAKE_PRESETS[i]);
    }
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "stake-btn all-in";
    allBtn.setAttribute("data-allin", "1");
    allBtn.textContent = "All In";
    allBtn.addEventListener("click", function () {
      if (spinning) return;
      allIn = true;
      customStake.value = "";
      syncStakeButtons();
      refreshStakeDisplay();
      sfxBet();
    });
    stakeBtnsEl.appendChild(allBtn);
    syncStakeButtons();
  }

  function buildNumGrid() {
    numGrid.innerHTML = "";
    for (var n = 0; n <= 12; n++) {
      (function (num) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "num-btn " + pocketColor(num);
        btn.textContent = String(num);
        btn.setAttribute("data-num", String(num));
        btn.addEventListener("click", function () {
          if (spinning) return;
          straightNum = num;
          var nodes = numGrid.querySelectorAll(".num-btn");
          for (var i = 0; i < nodes.length; i++) {
            nodes[i].classList.toggle(
              "active",
              parseInt(nodes[i].getAttribute("data-num"), 10) === num
            );
          }
          updateSpinBtn();
          sfxBet();
        });
        numGrid.appendChild(btn);
      })(n);
    }
  }

  function setBetType(type) {
    betType = type;
    var buttons = betTypesEl.querySelectorAll(".type-btn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle(
        "active",
        buttons[i].getAttribute("data-type") === type
      );
    }
    if (type === "straight") {
      straightPicks.hidden = false;
    } else {
      straightPicks.hidden = true;
    }
    updateSpinBtn();
    sfxBet();
  }

  betTypesEl.addEventListener("click", function (e) {
    var btn = e.target.closest(".type-btn");
    if (!btn || spinning) return;
    setBetType(btn.getAttribute("data-type"));
  });

  customStake.addEventListener("input", function () {
    if (spinning) return;
    var v = parseInt(customStake.value, 10);
    if (!isNaN(v) && v > 0) {
      allIn = false;
      stake = v;
      syncStakeButtons();
      refreshStakeDisplay();
    }
  });

  setChipsBtn.addEventListener("click", function () {
    var v = parseInt(chipInput.value, 10);
    if (isNaN(v) || v < 0) {
      setStatus("Enter a valid Eldorite amount.", "");
      return;
    }
    balance = Math.floor(v);
    refreshBalance();
    refreshStakeDisplay();
    sfxChip();
    setStatus("Stack set to " + balance + " Eldorite.", "");
  });

  addChipsBtn.addEventListener("click", function () {
    var v = parseInt(chipInput.value, 10);
    if (isNaN(v) || v <= 0) {
      setStatus("Enter a positive amount to add.", "");
      return;
    }
    balance += Math.floor(v);
    refreshBalance();
    refreshStakeDisplay();
    sfxChip();
    setStatus("Added " + Math.floor(v) + ". Stack: " + balance + ".", "");
  });

  spinBtn.addEventListener("click", spin);

  muteBtn.addEventListener("click", function () {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.textContent = muted ? "🔇 Muted" : "🔊 Sound on";
  });

  /* ---------- boot ---------- */

  buildStakeButtons();
  buildNumGrid();
  drawWheel(0);
  refreshBalance();
  refreshStakeDisplay();
  setStatus("Set chips, pick a bet type & stake, then spin the Dust Wheel.", "");
  // SSDNS shards hook (v0.2.1): lets games/ssdns-wallet.js read/set the chip balance.
  window.SSDNSGame = { id: "roulette", get: function () { return balance; }, set: function (n) { balance = n; refreshBalance(); refreshStakeDisplay(); }, busy: function () { return spinning; } };
})();

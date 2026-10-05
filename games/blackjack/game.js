(function () {
  "use strict";

  var SUITS = [
    { sym: "♠", color: "black" },
    { sym: "♥", color: "red" },
    { sym: "♦", color: "red" },
    { sym: "♣", color: "black" },
  ];
  var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  var STAKE_PRESETS = [5, 10, 25, 50];
  var RESHUFFLE_AT = 20;

  var PHASE = { IDLE: "idle", PLAYER: "player", DEALER: "dealer", DONE: "done" };

  var balance = 0;
  var stake = 5;
  var allIn = false;
  var muted = false;
  var audioCtx = null;
  var phase = PHASE.IDLE;
  var deck = [];
  var playerHand = [];
  var dealerHand = [];
  var currentBet = 0;
  var holeHidden = true;
  var busy = false; // brief deal animation lock

  var balanceEl = document.getElementById("balance");
  var statusEl = document.getElementById("status");
  var muteBtn = document.getElementById("muteBtn");
  var chipInput = document.getElementById("chipInput");
  var setChipsBtn = document.getElementById("setChipsBtn");
  var addChipsBtn = document.getElementById("addChipsBtn");
  var stakeBtnsEl = document.getElementById("stakeBtns");
  var stakeDisplay = document.getElementById("stakeDisplay");
  var customStake = document.getElementById("customStake");
  var dealBtn = document.getElementById("dealBtn");
  var hitBtn = document.getElementById("hitBtn");
  var standBtn = document.getElementById("standBtn");
  var doubleBtn = document.getElementById("doubleBtn");
  var playerCardsEl = document.getElementById("playerCards");
  var dealerCardsEl = document.getElementById("dealerCards");
  var playerTotalEl = document.getElementById("playerTotal");
  var dealerTotalEl = document.getElementById("dealerTotal");

  /* ---------- audio ---------- */

  function ensureAudio() {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
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

  function noiseTick(volume, when) {
    if (muted) return;
    var actx = ensureAudio();
    if (!actx) return;
    var t0 = actx.currentTime + (when || 0);
    var len = Math.floor(actx.sampleRate * 0.045);
    var buffer = actx.createBuffer(1, len, actx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    var src = actx.createBufferSource();
    var gain = actx.createGain();
    var filter = actx.createBiquadFilter();
    src.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 2200;
    filter.Q.value = 0.9;
    gain.gain.setValueAtTime(volume || 0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(actx.destination);
    src.start(t0);
    src.stop(t0 + 0.06);
  }

  function sfxDeal() { noiseTick(0.09); tone(420, 0.04, "triangle", 0.04); }
  function sfxChip() { tone(880, 0.05, "square", 0.05); tone(660, 0.06, "triangle", 0.04, 0.04); }
  function sfxWin() {
    tone(523, 0.12, "triangle", 0.09);
    tone(659, 0.12, "triangle", 0.09, 0.1);
    tone(784, 0.18, "triangle", 0.1, 0.2);
  }
  function sfxBlackjack() {
    tone(523, 0.1, "square", 0.07);
    tone(659, 0.1, "square", 0.07, 0.08);
    tone(784, 0.1, "square", 0.08, 0.16);
    tone(1046, 0.22, "triangle", 0.1, 0.26);
  }
  function sfxLose() { tone(220, 0.22, "sawtooth", 0.07, 0, 90); }
  function sfxBust() { tone(180, 0.15, "sawtooth", 0.08); tone(120, 0.2, "sawtooth", 0.07, 0.1, 60); }
  function sfxPush() { tone(440, 0.1, "triangle", 0.06); tone(440, 0.12, "triangle", 0.05, 0.14); }

  /* ---------- deck / hand math ---------- */

  function buildDeck() {
    var d = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        d.push({ rank: RANKS[r], suit: SUITS[s].sym, color: SUITS[s].color });
      }
    }
    return d;
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function ensureDeck() {
    if (deck.length < RESHUFFLE_AT) {
      deck = shuffle(buildDeck());
      if (phase === PHASE.IDLE) {
        // quiet reshuffle notice only between hands
      }
    }
  }

  function drawCard() {
    ensureDeck();
    if (deck.length === 0) deck = shuffle(buildDeck());
    return deck.pop();
  }

  /** Best blackjack total + soft flag (ace counted as 11 when possible). */
  function handValue(hand) {
    var total = 0;
    var aces = 0;
    for (var i = 0; i < hand.length; i++) {
      var r = hand[i].rank;
      if (r === "A") { aces++; total += 11; }
      else if (r === "J" || r === "Q" || r === "K") total += 10;
      else total += parseInt(r, 10);
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    var soft = aces > 0 && total <= 21;
    return { total: total, soft: soft };
  }

  function isBlackjack(hand) {
    return hand.length === 2 && handValue(hand).total === 21;
  }

  function isBust(hand) {
    return handValue(hand).total > 21;
  }

  /* ---------- UI helpers ---------- */

  function setStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (kind ? " " + kind : "");
  }

  function updateBalance() {
    balanceEl.textContent = String(balance);
    if (window.SSDNSWallet) window.SSDNSWallet.seen(balance); // SSDNS shards hook (v0.2.1)
  }

  function effectiveStake() {
    if (allIn) return balance;
    return Math.min(stake, balance);
  }

  function updateStakeDisplay() {
    var shown = allIn ? (balance > 0 ? balance : 0) : stake;
    stakeDisplay.textContent = String(shown);
  }

  function cardEl(card, faceDown) {
    var el = document.createElement("div");
    if (faceDown) {
      el.className = "card back";
      el.setAttribute("aria-label", "Hole card");
      return el;
    }
    el.className = "card " + card.color;
    el.setAttribute("aria-label", card.rank + " of " + card.suit);
    el.innerHTML =
      '<span class="rank">' + card.rank + "</span>" +
      '<span class="suit">' + card.suit + "</span>" +
      '<span class="rank-br">' + card.rank + "</span>";
    return el;
  }

  function renderHands() {
    dealerCardsEl.innerHTML = "";
    playerCardsEl.innerHTML = "";

    for (var i = 0; i < dealerHand.length; i++) {
      var hide = holeHidden && i === 1;
      dealerCardsEl.appendChild(cardEl(dealerHand[i], hide));
    }
    for (var j = 0; j < playerHand.length; j++) {
      playerCardsEl.appendChild(cardEl(playerHand[j], false));
    }

    // totals
    if (playerHand.length === 0) {
      playerTotalEl.textContent = "—";
      playerTotalEl.className = "hand-total";
    } else {
      var pv = handValue(playerHand);
      var pLabel = pv.soft && pv.total < 21 ? pv.total + " soft" : String(pv.total);
      if (isBlackjack(playerHand) && phase !== PHASE.PLAYER) pLabel = "BJ";
      playerTotalEl.textContent = pLabel;
      playerTotalEl.className = "hand-total" + (isBust(playerHand) ? " bust" : "") +
        (isBlackjack(playerHand) ? " bj" : "");
    }

    if (dealerHand.length === 0) {
      dealerTotalEl.textContent = "—";
      dealerTotalEl.className = "hand-total";
    } else if (holeHidden) {
      var up = handValue([dealerHand[0]]);
      dealerTotalEl.textContent = String(up.total) + "+";
      dealerTotalEl.className = "hand-total";
    } else {
      var dv = handValue(dealerHand);
      var dLabel = dv.soft && dv.total < 21 ? dv.total + " soft" : String(dv.total);
      if (isBlackjack(dealerHand)) dLabel = "BJ";
      dealerTotalEl.textContent = dLabel;
      dealerTotalEl.className = "hand-total" + (isBust(dealerHand) ? " bust" : "") +
        (isBlackjack(dealerHand) ? " bj" : "");
    }
  }

  function inRound() {
    return phase === PHASE.PLAYER || phase === PHASE.DEALER;
  }

  function syncButtons() {
    var canBet = phase === PHASE.IDLE || phase === PHASE.DONE;
    var stakeAmt = effectiveStake();
    dealBtn.disabled = busy || !canBet || stakeAmt < 1 || balance < 1;

    hitBtn.disabled = busy || phase !== PHASE.PLAYER;
    standBtn.disabled = busy || phase !== PHASE.PLAYER;

    var canDouble =
      phase === PHASE.PLAYER &&
      playerHand.length === 2 &&
      balance >= currentBet;
    doubleBtn.disabled = busy || !canDouble;

    // stake controls during play
    var stakeDisabled = inRound() || busy;
    var btns = stakeBtnsEl.querySelectorAll(".stake-btn");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = stakeDisabled;
    customStake.disabled = stakeDisabled;
  }

  /* ---------- payouts ---------- */

  function creditWin(amount) {
    balance += amount;
    updateBalance();
  }

  function settle() {
    holeHidden = false;
    phase = PHASE.DONE;
    renderHands();

    var p = handValue(playerHand).total;
    var d = handValue(dealerHand).total;
    var bet = currentBet;

    if (isBust(playerHand)) {
      setStatus("Bust at " + p + ". Dealer takes " + bet + " Eldorite.", "lose");
      sfxBust();
    } else if (isBlackjack(playerHand) && !isBlackjack(dealerHand)) {
      // 3:2 — credit 2.5× stake (stake already deducted)
      var bjPay = Math.floor(bet * 2.5);
      creditWin(bjPay);
      setStatus("Blackjack! Pays 3:2 — +" + (bjPay - bet) + " net (" + bjPay + " credited).", "win");
      sfxBlackjack();
    } else if (isBlackjack(dealerHand) && !isBlackjack(playerHand)) {
      setStatus("Dealer blackjack. Lost " + bet + " Eldorite.", "lose");
      sfxLose();
    } else if (isBust(dealerHand)) {
      creditWin(bet * 2);
      setStatus("Dealer busts at " + d + ". You win " + bet + ".", "win");
      sfxWin();
    } else if (p > d) {
      creditWin(bet * 2);
      setStatus("You win " + p + " vs " + d + ". +" + bet + " Eldorite.", "win");
      sfxWin();
    } else if (p < d) {
      setStatus("Dealer wins " + d + " vs " + p + ". Lost " + bet + ".", "lose");
      sfxLose();
    } else {
      creditWin(bet);
      setStatus("Push at " + p + ". Stake returned.", "push");
      sfxPush();
    }

    currentBet = 0;
    updateStakeDisplay();
    syncButtons();
  }

  /* ---------- dealer play ---------- */

  function dealerPlay() {
    phase = PHASE.DEALER;
    holeHidden = false;
    renderHands();
    syncButtons();
    setStatus("Dealer reveals…");

    function step() {
      var v = handValue(dealerHand);
      // Stand on all 17s (including soft 17)
      if (v.total >= 17) {
        settle();
        return;
      }
      busy = true;
      syncButtons();
      setTimeout(function () {
        dealerHand.push(drawCard());
        sfxDeal();
        renderHands();
        busy = false;
        setTimeout(step, 380);
      }, 420);
    }

    setTimeout(step, 450);
  }

  /* ---------- player actions ---------- */

  function startDeal() {
    if (busy || (phase !== PHASE.IDLE && phase !== PHASE.DONE)) return;
    var bet = effectiveStake();
    if (bet < 1 || balance < bet) {
      setStatus("Need Eldorite chips — Set or Add a buy-in first.");
      return;
    }

    ensureAudio();
    balance -= bet;
    currentBet = bet;
    updateBalance();
    sfxChip();

    playerHand = [];
    dealerHand = [];
    holeHidden = true;
    phase = PHASE.PLAYER;
    busy = true;
    ensureDeck();
    setStatus("Dealing…");
    syncButtons();
    renderHands();

    var sequence = [
      function () { playerHand.push(drawCard()); sfxDeal(); renderHands(); },
      function () { dealerHand.push(drawCard()); sfxDeal(); renderHands(); },
      function () { playerHand.push(drawCard()); sfxDeal(); renderHands(); },
      function () { dealerHand.push(drawCard()); sfxDeal(); renderHands(); },
    ];
    var idx = 0;

    function next() {
      if (idx < sequence.length) {
        sequence[idx++]();
        setTimeout(next, 280);
        return;
      }
      busy = false;

      var pBJ = isBlackjack(playerHand);
      var dBJ = isBlackjack(dealerHand);

      if (pBJ || dBJ) {
        holeHidden = false;
        renderHands();
        settle();
        return;
      }

      setStatus("Your move — Hit, Stand, or Double.");
      syncButtons();
    }

    setTimeout(next, 200);
  }

  function doHit() {
    if (busy || phase !== PHASE.PLAYER) return;
    busy = true;
    syncButtons();
    playerHand.push(drawCard());
    sfxDeal();
    renderHands();

    if (isBust(playerHand)) {
      busy = false;
      settle();
      return;
    }
    if (handValue(playerHand).total === 21) {
      busy = false;
      setStatus("Twenty-one — standing.");
      setTimeout(dealerPlay, 400);
      return;
    }
    busy = false;
    setStatus("Hit or Stand?");
    syncButtons();
  }

  function doStand() {
    if (busy || phase !== PHASE.PLAYER) return;
    setStatus("Standing at " + handValue(playerHand).total + ".");
    syncButtons();
    dealerPlay();
  }

  function doDouble() {
    if (busy || phase !== PHASE.PLAYER) return;
    if (playerHand.length !== 2) return;
    if (balance < currentBet) {
      setStatus("Not enough chips to double.");
      return;
    }
    balance -= currentBet;
    currentBet *= 2;
    updateBalance();
    updateStakeDisplay();
    sfxChip();
    busy = true;
    syncButtons();
    setStatus("Double down — one card.");

    setTimeout(function () {
      playerHand.push(drawCard());
      sfxDeal();
      renderHands();
      busy = false;
      if (isBust(playerHand)) {
        settle();
      } else {
        dealerPlay();
      }
    }, 280);
  }

  /* ---------- buy-in / stakes ---------- */

  function parseChipInput() {
    var n = parseInt(chipInput.value, 10);
    if (isNaN(n) || n < 0) return null;
    return n;
  }

  setChipsBtn.addEventListener("click", function () {
    var n = parseChipInput();
    if (n == null) {
      setStatus("Enter a valid chip amount.");
      return;
    }
    if (inRound()) {
      setStatus("Finish the hand before changing chips.");
      return;
    }
    balance = n;
    updateBalance();
    updateStakeDisplay();
    sfxChip();
    setStatus("Chips set to " + balance + " Eldorite.");
    syncButtons();
  });

  addChipsBtn.addEventListener("click", function () {
    var n = parseChipInput();
    if (n == null || n === 0) {
      setStatus("Enter chips to add.");
      return;
    }
    balance += n;
    updateBalance();
    updateStakeDisplay();
    sfxChip();
    setStatus("Added " + n + " — stack is " + balance + " Eldorite.");
    syncButtons();
  });

  function buildStakeButtons() {
    stakeBtnsEl.innerHTML = "";
    STAKE_PRESETS.forEach(function (n) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stake-btn" + (!allIn && stake === n ? " active" : "");
      btn.textContent = String(n);
      btn.addEventListener("click", function () {
        if (inRound() || busy) return;
        allIn = false;
        stake = n;
        customStake.value = "";
        highlightStakes();
        updateStakeDisplay();
        syncButtons();
      });
      stakeBtnsEl.appendChild(btn);
    });
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "stake-btn all-in" + (allIn ? " active" : "");
    allBtn.textContent = "All In";
    allBtn.addEventListener("click", function () {
      if (inRound() || busy) return;
      allIn = true;
      customStake.value = "";
      highlightStakes();
      updateStakeDisplay();
      syncButtons();
    });
    stakeBtnsEl.appendChild(allBtn);
  }

  function highlightStakes() {
    var btns = stakeBtnsEl.querySelectorAll(".stake-btn");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var isAll = b.classList.contains("all-in");
      if (isAll) b.classList.toggle("active", allIn);
      else {
        var val = parseInt(b.textContent, 10);
        b.classList.toggle("active", !allIn && stake === val);
      }
    }
  }

  customStake.addEventListener("input", function () {
    if (inRound() || busy) return;
    var n = parseInt(customStake.value, 10);
    if (!isNaN(n) && n >= 1) {
      allIn = false;
      stake = n;
      highlightStakes();
      updateStakeDisplay();
      syncButtons();
    }
  });

  muteBtn.addEventListener("click", function () {
    muted = !muted;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.textContent = muted ? "🔇 Muted" : "🔊 Sound on";
    if (!muted) ensureAudio();
  });

  dealBtn.addEventListener("click", startDeal);
  hitBtn.addEventListener("click", doHit);
  standBtn.addEventListener("click", doStand);
  doubleBtn.addEventListener("click", doDouble);

  // init
  deck = shuffle(buildDeck());
  buildStakeButtons();
  updateBalance();
  updateStakeDisplay();
  renderHands();
  syncButtons();
  setStatus("Set chips, pick a stake, then Deal.");
  // SSDNS shards hook (v0.2.1): lets games/ssdns-wallet.js read/set the chip balance.
  window.SSDNSGame = { id: "blackjack", get: function () { return balance; }, set: function (n) { balance = n; updateBalance(); updateStakeDisplay(); syncButtons(); }, busy: function () { return inRound(); } };
})();

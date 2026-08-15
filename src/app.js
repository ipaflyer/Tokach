/**
 * Толкач — связь UI с правилами и логом.
 */

const Rules = window.TokachRules;
const Log = window.TokachLog;

let session = null;
let sessionLog = null;
let lastMoveText = "—";

const els = {
  resonanceSelect: document.getElementById("resonanceSelect"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  stoneNum: document.getElementById("stoneNum"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  currentPlayer: document.getElementById("currentPlayer"),
  toneLabel: document.getElementById("toneLabel"),
  board: document.getElementById("board"),
  lastMove: document.getElementById("lastMove"),
  handA: document.getElementById("handA"),
  handB: document.getElementById("handB"),
  discardA: document.getElementById("discardA"),
  discardB: document.getElementById("discardB"),
  buttonsA: document.getElementById("buttonsA"),
  buttonsB: document.getElementById("buttonsB"),
  panelA: document.getElementById("panelA"),
  panelB: document.getElementById("panelB"),
  sessionEnd: document.getElementById("sessionEnd"),
  notesForm: document.getElementById("notesForm"),
  winnerLabel: document.getElementById("winnerLabel"),
  finalScore: document.getElementById("finalScore"),
  selfCheckBtn: document.getElementById("selfCheckBtn"),
  selfCheckOut: document.getElementById("selfCheckOut"),
};

function formatHand(cards) {
  return cards.length ? cards.join(" ") : "(пусто)";
}

function formatDiscard(cards) {
  return cards.length ? cards.join(" ") : "—";
}

function formatTone(tone, locked) {
  if (tone === null) {
    return "молчит";
  }
  return locked ? `${tone} (закрыт)` : String(tone);
}

function describeMove(record) {
  const toneBefore = formatTone(record.toneBefore, false);
  const toneAfter = formatTone(record.toneAfter, false);
  const typeLabel =
    record.moveType === "opening"
      ? "opening (тон закрыт)"
      : record.moveType;
  const parts = [
    `Камень ${record.stoneIndex}, ход ${record.moveIndex}: ${record.player} сыграл ${record.card}`,
    `${typeLabel}, сдвиг ${record.shift}`,
    `поз. ${record.positionBefore} → ${record.positionAfter}`,
    `тон ${toneBefore} → ${toneAfter}`,
  ];
  if (record.couldStealButDidNot) {
    parts.push("мог украсть, не украл");
  }
  if (record.refilled) {
    parts.push("рефил");
  }
  if (record.stoneFinished) {
    parts.push(`камень → ${record.stoneWinner}`);
  }
  return parts.join(" · ");
}

function buildBoard(position) {
  els.board.innerHTML = "";
  for (let cell = -6; cell <= 6; cell += 1) {
    const div = document.createElement("div");
    div.className = "cell";
    if (cell === -6 || cell === 6) {
      div.classList.add("edge");
    }
    if (cell === position) {
      div.classList.add("stone");
      div.textContent = "●";
    } else {
      div.textContent = String(cell);
    }
    els.board.appendChild(div);
  }
}

function buildButtons(container, player, hand, enabled, tone, toneLocked) {
  container.innerHTML = "";
  const hasOther =
    toneLocked && tone !== null
      ? hand.some((value) => value !== tone)
      : false;
  for (let card = 1; card <= 4; card += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(card);
    const hasCard = hand.includes(card);
    const blockedByLock = toneLocked && tone !== null && card === tone && hasOther;
    btn.disabled = !enabled || !hasCard || blockedByLock;
    if (blockedByLock) {
      btn.title = "тон закрыт";
    }
    btn.addEventListener("click", () => onPlay(card));
    container.appendChild(btn);
  }
}

function render() {
  const state = Rules.getPublicState(session);
  const stone = state.stone;

  els.stoneNum.textContent = String(state.stoneIndex);
  els.scoreA.textContent = String(state.scores.A);
  els.scoreB.textContent = String(state.scores.B);
  els.currentPlayer.textContent = state.finished ? "—" : stone.currentPlayer;
  els.toneLabel.textContent = formatTone(stone.tone, stone.toneLocked);
  els.lastMove.textContent = lastMoveText;

  els.resonanceSelect.value = state.resonance;
  els.resonanceSelect.disabled = state.resonanceLocked || state.finished;

  buildBoard(stone.position);

  els.handA.textContent = formatHand(stone.hands.A);
  els.handB.textContent = formatHand(stone.hands.B);
  els.discardA.textContent = formatDiscard(stone.discards.A);
  els.discardB.textContent = formatDiscard(stone.discards.B);

  const playable = !state.finished;
  buildButtons(
    els.buttonsA,
    "A",
    stone.hands.A,
    playable && stone.currentPlayer === "A",
    stone.tone,
    stone.toneLocked
  );
  buildButtons(
    els.buttonsB,
    "B",
    stone.hands.B,
    playable && stone.currentPlayer === "B",
    stone.tone,
    stone.toneLocked
  );

  els.panelA.classList.toggle("active", playable && stone.currentPlayer === "A");
  els.panelB.classList.toggle("active", playable && stone.currentPlayer === "B");

  if (state.finished) {
    els.sessionEnd.style.display = "block";
    els.notesForm.style.display = "block";
    els.winnerLabel.textContent = state.winner;
    els.finalScore.textContent = `${state.scores.A}:${state.scores.B}`;
  } else {
    els.sessionEnd.style.display = "none";
    els.notesForm.style.display = "none";
  }
}

function startNewSession() {
  const resonance = els.resonanceSelect.value;
  session = Rules.createSession({ resonance });
  sessionLog = Log.createSessionLog(session.sessionId, session.resonance);
  lastMoveText = "—";
  els.notesForm.reset();
  render();
}

function onPlay(card) {
  if (!session || session.finished) {
    return;
  }
  const result = Rules.playCard(session, card);
  if (!result.ok) {
    lastMoveText = `Ошибка: ${result.error}`;
    render();
    return;
  }

  Log.appendMove(sessionLog, result.moveRecord);
  lastMoveText = describeMove(result.moveRecord);

  if (result.stoneSummary) {
    Log.appendStone(sessionLog, result.stoneSummary);
    lastMoveText += ` · камень ${result.stoneSummary.stoneIndex} выигран ${result.stoneSummary.winner}`;
  }

  if (result.sessionSummary) {
    session._pendingSessionSummary = result.sessionSummary;
  }

  render();
}

els.resonanceSelect.addEventListener("change", () => {
  if (!session || session.resonanceLocked) {
    render();
    return;
  }
  const result = Rules.setResonance(session, els.resonanceSelect.value);
  if (!result.ok) {
    lastMoveText = `Ошибка: ${result.error}`;
  }
  render();
});

els.newSessionBtn.addEventListener("click", () => {
  startNewSession();
});

els.notesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!session || !session.finished || !session._pendingSessionSummary) {
    return;
  }
  const form = new FormData(els.notesForm);
  const notes = {
    namedHeuristicThemselves: form.get("namedHeuristicThemselves") === "yes",
    askedForMoreSystems: form.get("askedForMoreSystems") === "yes",
    askedForMoreSystemsDetail: String(form.get("askedForMoreSystemsDetail") || ""),
    disputedSpecificMove: form.get("disputedSpecificMove") === "yes",
    disputeQuote: String(form.get("disputeQuote") || ""),
    disputeStoneMove: String(form.get("disputeStoneMove") || ""),
    feeling: String(form.get("feeling") || ""),
    wantedAnotherSession: form.get("wantedAnotherSession") === "yes",
  };
  Log.finalizeSession(sessionLog, session._pendingSessionSummary, notes);
  const filename = Log.downloadLog(sessionLog);
  lastMoveText = `Лог скачан: ${filename}`;
  render();
});

els.selfCheckBtn.addEventListener("click", () => {
  const results = Rules.runSelfChecks();
  const lines = results.map((item) => {
    return item.ok ? `OK  ${item.name}` : `FAIL ${item.name}: ${item.error}`;
  });
  const failed = results.filter((item) => !item.ok).length;
  lines.push(failed === 0 ? `\nВсе ${results.length} проверок прошли.` : `\nПровалено: ${failed}`);
  els.selfCheckOut.textContent = lines.join("\n");
});

startNewSession();

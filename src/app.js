/**
 * Толкач — связь UI с правилами и логом.
 */

const Rules = window.TokachRules;
const Log = window.TokachLog;

let session = null;
let sessionLog = null;
let lastMoveText = "—";
let animating = false;
let animToken = 0;
let lastBurst = { className: "", text: "" };

const CELL_MIN = -6;
const CELL_MAX = 6;

const els = {
  resonanceSelect: document.getElementById("resonanceSelect"),
  newSessionBtn: document.getElementById("newSessionBtn"),
  stoneNum: document.getElementById("stoneNum"),
  scoreA: document.getElementById("scoreA"),
  scoreB: document.getElementById("scoreB"),
  currentPlayer: document.getElementById("currentPlayer"),
  toneLabel: document.getElementById("toneLabel"),
  toneHint: document.getElementById("toneHint"),
  toneBanner: document.getElementById("toneBanner"),
  decisionHint: document.getElementById("decisionHint"),
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
  pushBurst: document.getElementById("pushBurst"),
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

function updateToneBanner(tone, locked) {
  els.toneBanner.classList.remove("silent", "locked", "open");
  if (tone === null) {
    els.toneBanner.classList.add("silent");
    els.toneLabel.textContent = "Тон молчит";
    els.toneHint.textContent = "первый удар задаст закрытый тон";
    return;
  }
  if (locked) {
    els.toneBanner.classList.add("locked");
    els.toneLabel.textContent = `Тон ${tone} · закрыт`;
    els.toneHint.textContent = "совпадение запрещено — сыграй другое число";
    return;
  }
  els.toneBanner.classList.add("open");
  els.toneLabel.textContent = `Тон ${tone} · открыт`;
  els.toneHint.textContent = "совпадение = кража ×2, иначе перепись";
}

function updateDecisionHint(state) {
  if (state.finished) {
    els.decisionHint.textContent = "сессия окончена — заполни заметки плейтеста";
    return;
  }
  const stone = state.stone;
  const hand = stone.hands[stone.currentPlayer];
  if (stone.tone === null) {
    els.decisionHint.textContent =
      stone.moveCount === 0
        ? "Opening: сила удара станет закрытым тоном"
        : "Тишина: любой удар — setup, тон откроется";
    return;
  }
  if (stone.toneLocked) {
    const blocked = hand.includes(stone.tone) && hand.some((card) => card !== stone.tone);
    els.decisionHint.textContent = blocked
      ? `Замок: карта ${stone.tone} недоступна, пока есть другое число`
      : `Замок: в руке только ${stone.tone} — можно сыграть (unlock через rewrite)`;
    return;
  }
  if (hand.includes(stone.tone)) {
    els.decisionHint.textContent = `Развилка: украсть ${stone.tone} (×2) или переписать другим числом`;
    return;
  }
  els.decisionHint.textContent = `Перепись: тон ${stone.tone} в руке нет — ставь свой крючок`;
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

function cellEl(position) {
  return els.board.querySelector(`[data-pos="${position}"]`);
}

function clampCell(position) {
  return Math.max(CELL_MIN, Math.min(CELL_MAX, position));
}

function buildBoardSkeleton() {
  if (els.board.dataset.ready === "1") {
    return;
  }
  els.board.innerHTML = "";
  for (let cell = CELL_MIN; cell <= CELL_MAX; cell += 1) {
    const div = document.createElement("div");
    div.className = "cell";
    div.dataset.pos = String(cell);
    if (cell === CELL_MIN || cell === CELL_MAX) {
      div.classList.add("edge");
    }
    if (cell < 0) {
      div.classList.add("neg-side");
    } else if (cell > 0) {
      div.classList.add("pos-side");
    }
    const label = document.createElement("span");
    label.className = "cell-label";
    label.textContent = String(cell);
    const token = document.createElement("span");
    token.className = "token";
    token.hidden = true;
    div.appendChild(label);
    div.appendChild(token);
    els.board.appendChild(div);
  }
  els.board.dataset.ready = "1";
}

function clearBoardMarks(kinds) {
  for (const el of els.board.children) {
    el.classList.remove(...kinds);
    if (kinds.includes("stone")) {
      const token = el.querySelector(".token");
      if (token) {
        token.hidden = true;
      }
    }
  }
}

function placeStone(position, extras) {
  const el = cellEl(clampCell(position));
  if (!el) {
    return;
  }
  el.classList.add("stone", ...(extras || []));
  const token = el.querySelector(".token");
  if (token) {
    token.hidden = false;
  }
}

function pathCells(from, to) {
  const cells = [];
  if (from === to) {
    return cells;
  }
  const step = to > from ? 1 : -1;
  for (let pos = from + step; pos !== to + step; pos += step) {
    if (pos < CELL_MIN || pos > CELL_MAX) {
      continue;
    }
    cells.push(pos);
  }
  return cells;
}

function moveKindLabel(moveType) {
  if (moveType === "steal") {
    return "кража";
  }
  if (moveType === "opening") {
    return "opening";
  }
  if (moveType === "rewrite") {
    return "перепись";
  }
  if (moveType === "setup") {
    return "setup";
  }
  return moveType;
}

function showPushBurst(record) {
  const dir = record.player === "A" ? "←" : "→";
  const kind = moveKindLabel(record.moveType);
  els.pushBurst.className = record.moveType;
  els.pushBurst.textContent = `${dir} ${record.shift} · ${kind}`;
  lastBurst = {
    className: els.pushBurst.className,
    text: els.pushBurst.textContent,
  };
}

function showPreview(preview) {
  clearBoardMarks(["preview", "preview-finish"]);
  if (!preview || !preview.ok || animating) {
    return;
  }
  const mark = preview.finishingMove ? "preview-finish" : "preview";
  const path = pathCells(preview.positionBefore, preview.positionAfter);
  for (const pos of path) {
    const el = cellEl(pos);
    if (el) {
      el.classList.add(mark);
    }
  }
  const dest = preview.finishingMove
    ? preview.positionAfter < 0
      ? CELL_MIN
      : CELL_MAX
    : preview.positionAfter;
  const destEl = cellEl(clampCell(dest));
  if (destEl) {
    destEl.classList.add(mark);
  }
  const dir = preview.player === "A" ? "←" : "→";
  const kind = moveKindLabel(preview.moveType);
  els.pushBurst.className = preview.moveType;
  els.pushBurst.textContent = preview.finishingMove
    ? `${dir} ${preview.shift} · ${kind} · за край`
    : `${dir} ${preview.shift} · ${kind} → ${preview.positionAfter}`;
}

function clearPreview() {
  if (animating) {
    return;
  }
  clearBoardMarks(["preview", "preview-finish"]);
  els.pushBurst.className = lastBurst.className;
  els.pushBurst.textContent = lastBurst.text;
}

function bindPreview(btn, card) {
  btn.addEventListener("mouseenter", () => {
    if (animating || !session) {
      return;
    }
    showPreview(Rules.previewCard(session, card));
  });
  btn.addEventListener("mouseleave", () => {
    clearPreview();
  });
}

function animatePush(record, done) {
  const token = (animToken += 1);
  buildBoardSkeleton();
  clearBoardMarks(["stone", "path", "path-steal", "impact", "fallen", "preview", "preview-finish"]);
  placeStone(record.positionBefore);
  showPushBurst(record);
  const path = pathCells(record.positionBefore, record.positionAfter);
  const steal = record.moveType === "steal";
  for (const pos of path) {
    const el = cellEl(pos);
    if (el) {
      el.classList.add(steal ? "path-steal" : "path");
    }
  }
  const offBoard = record.positionAfter < CELL_MIN || record.positionAfter > CELL_MAX;
  const interval = steal ? 120 : 170;
  let index = 0;

  function finish() {
    if (token !== animToken) {
      return;
    }
    done();
  }

  function step() {
    if (token !== animToken) {
      return;
    }
    if (index >= path.length) {
      clearBoardMarks(["stone", "impact", "fallen"]);
      if (offBoard) {
        placeStone(record.positionAfter < 0 ? CELL_MIN : CELL_MAX, ["impact", "fallen"]);
      } else {
        placeStone(record.positionAfter, ["impact"]);
      }
      window.setTimeout(finish, 380);
      return;
    }
    clearBoardMarks(["stone", "impact", "fallen"]);
    const extras = index === path.length - 1 && !offBoard ? ["impact"] : [];
    placeStone(path[index], extras);
    index += 1;
    window.setTimeout(step, interval);
  }

  window.setTimeout(step, 100);
}

function updateBoard(position) {
  buildBoardSkeleton();
  clearBoardMarks(["stone", "path", "path-steal", "impact", "fallen", "preview", "preview-finish"]);
  placeStone(position);
}

function disableAllCards() {
  for (const btn of [...els.buttonsA.children, ...els.buttonsB.children]) {
    btn.disabled = true;
  }
}

function markStrike(player, card) {
  const container = player === "A" ? els.buttonsA : els.buttonsB;
  for (const btn of container.children) {
    if (btn.dataset.force === String(card)) {
      btn.classList.add("striking");
    }
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
    btn.className = `card-btn force-${card} side-${player}`;
    btn.dataset.force = String(card);
    const force = document.createElement("span");
    force.className = "force";
    force.textContent = String(card);
    const forceLabel = document.createElement("span");
    forceLabel.className = "force-label";
    forceLabel.textContent = "удар";
    btn.appendChild(force);
    btn.appendChild(forceLabel);
    const hasCard = hand.includes(card);
    const blockedByLock = toneLocked && tone !== null && card === tone && hasOther;
    const stealReady =
      enabled &&
      hasCard &&
      !toneLocked &&
      tone !== null &&
      card === tone;
    const inactiveOrMissing = !enabled || !hasCard;
    btn.disabled = inactiveOrMissing || blockedByLock;
    if (!hasCard) {
      btn.classList.add("spent");
      forceLabel.textContent = "сброс";
    }
    if (enabled && blockedByLock) {
      btn.classList.add("locked-match");
      forceLabel.textContent = "замок";
      btn.title = "тон закрыт — сыграй другое число";
      btn.setAttribute("aria-label", `удар ${card}, замок тона`);
      // disabled не кликается — оставляем клик только для объяснения
      btn.disabled = false;
      btn.setAttribute("aria-disabled", "true");
      btn.addEventListener("click", () => {
        lastMoveText = `Тон ${tone} закрыт: карту ${card} сыграть нельзя, пока в руке есть другое число`;
        els.lastMove.textContent = lastMoveText;
      });
    } else if (stealReady) {
      btn.classList.add("steal-ready");
      forceLabel.textContent = "кража";
      btn.title = "кража: сдвиг ×2, тон сгорит";
      btn.setAttribute("aria-label", `удар ${card}, доступна кража`);
      btn.addEventListener("click", () => onPlay(card));
      bindPreview(btn, card);
    } else if (enabled && hasCard) {
      btn.addEventListener("click", () => onPlay(card));
      bindPreview(btn, card);
    } else {
      btn.addEventListener("click", () => onPlay(card));
    }
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
  updateToneBanner(stone.tone, stone.toneLocked);
  updateDecisionHint(state);
  els.lastMove.textContent = lastMoveText;

  els.resonanceSelect.value = state.resonance;
  els.resonanceSelect.disabled = state.resonanceLocked || state.finished;

  updateBoard(stone.position);

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
  animToken += 1;
  animating = false;
  const resonance = els.resonanceSelect.value;
  session = Rules.createSession({ resonance });
  sessionLog = Log.createSessionLog(session.sessionId, session.resonance);
  lastMoveText = "—";
  lastBurst = { className: "", text: "" };
  els.pushBurst.className = "";
  els.pushBurst.textContent = "";
  els.notesForm.reset();
  render();
}

function onPlay(card) {
  if (!session || session.finished || animating) {
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

  animating = true;
  markStrike(result.moveRecord.player, card);
  disableAllCards();
  els.lastMove.textContent = lastMoveText;
  animatePush(result.moveRecord, () => {
    animating = false;
    render();
  });
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

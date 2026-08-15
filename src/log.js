/**
 * Толкач — лог сессии по полям PROTOTYPE_SPEC.md
 */

function createSessionLog(sessionId, resonance) {
  return {
    sessionId,
    resonance,
    startedAt: new Date().toISOString(),
    moves: [],
    stones: [],
    session: null,
    notes: null,
  };
}

function appendMove(log, moveRecord) {
  log.moves.push({
    sessionId: moveRecord.sessionId,
    stoneIndex: moveRecord.stoneIndex,
    moveIndex: moveRecord.moveIndex,
    player: moveRecord.player,
    positionBefore: moveRecord.positionBefore,
    toneBefore: moveRecord.toneBefore,
    handBefore: moveRecord.handBefore.slice(),
    opponentHandBefore: moveRecord.opponentHandBefore.slice(),
    card: moveRecord.card,
    moveType: moveRecord.moveType,
    shift: moveRecord.shift,
    positionAfter: moveRecord.positionAfter,
    toneAfter: moveRecord.toneAfter,
    couldStealButDidNot: moveRecord.couldStealButDidNot,
    newToneInOpponentHand: moveRecord.newToneInOpponentHand,
    finishingMove: moveRecord.finishingMove,
    refilled: moveRecord.refilled,
    stoneFinished: moveRecord.stoneFinished,
  });
}

function appendStone(log, stoneSummary) {
  log.stones.push({
    stoneIndex: stoneSummary.stoneIndex,
    firstPlayer: stoneSummary.firstPlayer,
    winner: stoneSummary.winner,
    moveCount: stoneSummary.moveCount,
    durationMs: stoneSummary.durationMs,
    longStone: stoneSummary.longStone,
    moveTypes: { ...stoneSummary.moveTypes },
    couldStealButDidNot: stoneSummary.couldStealButDidNot,
    leftToneOpponentHad: stoneSummary.leftToneOpponentHad,
    finishedByCenterSteal34: stoneSummary.finishedByCenterSteal34,
    maxAbsPositionBeforeLast: stoneSummary.maxAbsPositionBeforeLast,
  });
}

function finalizeSession(log, sessionSummary, notes) {
  log.session = {
    sessionId: sessionSummary.sessionId,
    durationMs: sessionSummary.durationMs,
    scores: { ...sessionSummary.scores },
    winner: sessionSummary.winner,
    firstStoneStarter: sessionSummary.firstStoneStarter,
    resonance: sessionSummary.resonance,
    sessionTooFast: sessionSummary.sessionTooFast,
    longStones: sessionSummary.longStones.slice(),
  };
  log.notes = {
    namedHeuristicThemselves: notes.namedHeuristicThemselves,
    askedForMoreSystems: notes.askedForMoreSystems,
    askedForMoreSystemsDetail: notes.askedForMoreSystemsDetail || "",
    disputedSpecificMove: notes.disputedSpecificMove,
    disputeQuote: notes.disputeQuote || "",
    disputeStoneMove: notes.disputeStoneMove || "",
    feeling: notes.feeling,
    wantedAnotherSession: notes.wantedAnotherSession,
  };
  log.endedAt = new Date().toISOString();
  return log;
}

function downloadLog(log) {
  const filename = `tokach-${log.sessionId}.json`;
  const blob = new Blob([JSON.stringify(log, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}

window.TokachLog = {
  createSessionLog,
  appendMove,
  appendStone,
  finalizeSession,
  downloadLog,
};

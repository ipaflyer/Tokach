/**
 * Толкач — ядро правил (без DOM).
 * Спека: PROTOTYPE_SPEC.md
 */

const FULL_HAND = Object.freeze([1, 2, 3, 4]);
const STONES_PER_SESSION = 5;
const EDGE = 6;
const RESONANCE_DOUBLE = "double";
const RESONANCE_PLUS2 = "plus2";
const RESONANCE_PLUS1 = "plus1";

function cloneHand(hand) {
  return hand.slice().sort((a, b) => a - b);
}

function fullHand() {
  return FULL_HAND.slice();
}

function firstPlayerForStone(stoneIndex) {
  // stoneIndex 1..5 → A, B, A, B, A
  return stoneIndex % 2 === 1 ? "A" : "B";
}

function opponentOf(player) {
  return player === "A" ? "B" : "A";
}

function createStoneState(stoneIndex) {
  const now = Date.now();
  const firstPlayer = firstPlayerForStone(stoneIndex);
  // Лёгкий задел первому: иначе при открытых руках отвечающий на тон забирает темп.
  const startBias = 1;
  const position = firstPlayer === "A" ? -startBias : startBias;
  return {
    stoneIndex,
    position,
    tone: null,
    toneLocked: false,
    currentPlayer: firstPlayer,
    firstPlayer,
    hands: { A: fullHand(), B: fullHand() },
    discards: { A: [], B: [] },
    moveCount: 0,
    startedAt: now,
    maxAbsPositionBeforeLast: 0,
    moveTypes: { opening: 0, setup: 0, steal: 0, rewrite: 0 },
    couldStealButDidNot: 0,
    leftToneOpponentHad: 0,
    finishedByCenterSteal34: false,
  };
}

function createSession(options = {}) {
  let resonance = RESONANCE_DOUBLE;
  if (options.resonance === RESONANCE_PLUS1) {
    resonance = RESONANCE_PLUS1;
  } else if (options.resonance === RESONANCE_PLUS2) {
    resonance = RESONANCE_PLUS2;
  } else if (options.resonance === RESONANCE_DOUBLE) {
    resonance = RESONANCE_DOUBLE;
  }
  const sessionId = options.sessionId || `s-${Date.now()}`;
  const startedAt = Date.now();
  return {
    sessionId,
    resonance,
    resonanceLocked: false,
    stoneIndex: 1,
    scores: { A: 0, B: 0 },
    startedAt,
    finished: false,
    winner: null,
    stone: createStoneState(1),
    stoneSummaries: [],
    flags: {
      sessionTooFast: false,
      longStones: [],
    },
  };
}

function setResonance(session, resonance) {
  if (session.resonanceLocked) {
    return { ok: false, error: "калибровка уже зафиксирована" };
  }
  if (
    resonance !== RESONANCE_DOUBLE &&
    resonance !== RESONANCE_PLUS2 &&
    resonance !== RESONANCE_PLUS1
  ) {
    return { ok: false, error: "неизвестная калибровка" };
  }
  session.resonance = resonance;
  return { ok: true };
}

function stealShiftFor(card, resonance) {
  if (resonance === RESONANCE_DOUBLE) {
    return card * 2;
  }
  if (resonance === RESONANCE_PLUS2) {
    return card + 2;
  }
  return card + 1;
}

function computeShift(card, tone, toneLocked, resonance, isOpening) {
  // Opening задаёт закрытый тон: ответить кражей нельзя один ход.
  // Обычный setup из тишины тон не закрывает — иначе жадная политика
  // «всегда кради» зацикливает камень на рефилах.
  if (isOpening) {
    return {
      shift: card,
      nextTone: card,
      nextLocked: true,
      moveType: "opening",
    };
  }
  if (tone === null) {
    return {
      shift: card,
      nextTone: card,
      nextLocked: false,
      moveType: "setup",
    };
  }
  if (card === tone && !toneLocked) {
    return {
      shift: stealShiftFor(card, resonance),
      nextTone: null,
      nextLocked: false,
      moveType: "steal",
    };
  }
  return {
    shift: card,
    nextTone: card,
    nextLocked: false,
    moveType: "rewrite",
  };
}

function wouldPushOut(player, position, shift) {
  if (player === "A") {
    return position - shift < -EDGE;
  }
  return position + shift > EDGE;
}

function applyShift(player, position, shift) {
  return player === "A" ? position - shift : position + shift;
}

function previewCard(session, card) {
  if (session.finished) {
    return { ok: false, error: "сессия окончена" };
  }
  const stone = session.stone;
  const player = stone.currentPlayer;
  const hand = stone.hands[player];
  if (hand.indexOf(card) === -1) {
    return { ok: false, error: "карты нет в руке" };
  }
  if (stone.toneLocked && stone.tone !== null && card === stone.tone && stone.moveCount > 0) {
    const hasOther = hand.some((value) => value !== stone.tone);
    if (hasOther) {
      return { ok: false, error: "тон закрыт — сыграй другое число", blocked: true };
    }
  }
  const isOpening = stone.moveCount === 0;
  const { shift, nextTone, nextLocked, moveType } = computeShift(
    card,
    stone.tone,
    stone.toneLocked,
    session.resonance,
    isOpening
  );
  const finishingMove = wouldPushOut(player, stone.position, shift);
  const positionAfter = applyShift(player, stone.position, shift);
  return {
    ok: true,
    player,
    card,
    shift,
    moveType,
    positionBefore: stone.position,
    positionAfter,
    finishingMove,
    nextTone,
    nextLocked,
  };
}

function playCard(session, card) {
  if (session.finished) {
    return { ok: false, error: "сессия окончена" };
  }
  const stone = session.stone;
  const player = stone.currentPlayer;
  const hand = stone.hands[player];
  const cardIndex = hand.indexOf(card);
  if (cardIndex === -1) {
    return { ok: false, error: "карты нет в руке" };
  }
  if (stone.toneLocked && stone.tone !== null && card === stone.tone && stone.moveCount > 0) {
    const hasOther = hand.some((value) => value !== stone.tone);
    if (hasOther) {
      return { ok: false, error: "тон закрыт — сыграй другое число" };
    }
  }

  session.resonanceLocked = true;

  const opponent = opponentOf(player);
  const positionBefore = stone.position;
  const toneBefore = stone.tone;
  const handBefore = cloneHand(hand);
  const opponentHandBefore = cloneHand(stone.hands[opponent]);

  const couldSteal =
    toneBefore !== null &&
    !stone.toneLocked &&
    hand.includes(toneBefore);
  const isOpening = stone.moveCount === 0;
  const { shift, nextTone, nextLocked, moveType } = computeShift(
    card,
    toneBefore,
    stone.toneLocked,
    session.resonance,
    isOpening
  );
  const finishingMove = wouldPushOut(player, positionBefore, shift);
  const positionAfter = applyShift(player, positionBefore, shift);

  hand.splice(cardIndex, 1);
  stone.discards[player].push(card);
  let refilled = false;
  if (hand.length === 0) {
    stone.hands[player] = fullHand();
    stone.discards[player] = [];
    refilled = true;
  }

  stone.position = positionAfter;
  stone.tone = nextTone;
  stone.toneLocked = nextLocked;
  stone.moveCount += 1;

  const absBefore = Math.abs(positionBefore);
  if (stone.moveCount === 1) {
    stone.maxAbsPositionBeforeLast = 0;
  } else {
    stone.maxAbsPositionBeforeLast = Math.max(stone.maxAbsPositionBeforeLast, absBefore);
  }

  stone.moveTypes[moveType] += 1;

  const couldStealButDidNot = couldSteal && moveType !== "steal";
  if (couldStealButDidNot) {
    stone.couldStealButDidNot += 1;
  }

  let newToneInOpponentHand = null;
  if (moveType === "setup" || moveType === "rewrite" || moveType === "opening") {
    newToneInOpponentHand =
      nextTone !== null && opponentHandBefore.includes(nextTone);
    if (newToneInOpponentHand && moveType !== "opening") {
      stone.leftToneOpponentHad += 1;
    }
  }

  const stoneFinished = finishingMove;
  let stoneWinner = null;
  if (stoneFinished) {
    stoneWinner = player;
    if (
      moveType === "steal" &&
      positionBefore === 0 &&
      (toneBefore === 3 || toneBefore === 4)
    ) {
      stone.finishedByCenterSteal34 = true;
    }
  }

  const moveRecord = {
    sessionId: session.sessionId,
    stoneIndex: stone.stoneIndex,
    moveIndex: stone.moveCount,
    player,
    positionBefore,
    toneBefore,
    handBefore,
    opponentHandBefore,
    card,
    moveType,
    shift,
    positionAfter,
    toneAfter: nextTone,
    couldStealButDidNot,
    newToneInOpponentHand,
    finishingMove,
    refilled,
    stoneFinished,
    stoneWinner,
  };

  let stoneSummary = null;
  let sessionSummary = null;

  if (stoneFinished) {
    session.scores[player] += 1;
    const endedAt = Date.now();
    const durationMs = endedAt - stone.startedAt;
    stoneSummary = {
      stoneIndex: stone.stoneIndex,
      firstPlayer: stone.firstPlayer,
      winner: stoneWinner,
      moveCount: stone.moveCount,
      durationMs,
      longStone: durationMs > 6 * 60 * 1000,
      moveTypes: { ...stone.moveTypes },
      couldStealButDidNot: stone.couldStealButDidNot,
      leftToneOpponentHad: stone.leftToneOpponentHad,
      finishedByCenterSteal34: stone.finishedByCenterSteal34,
      maxAbsPositionBeforeLast: stone.maxAbsPositionBeforeLast,
    };
    session.stoneSummaries.push(stoneSummary);
    if (stoneSummary.longStone) {
      session.flags.longStones.push(stone.stoneIndex);
    }

    if (stone.stoneIndex >= STONES_PER_SESSION) {
      session.finished = true;
      const scoreA = session.scores.A;
      const scoreB = session.scores.B;
      session.winner = scoreA > scoreB ? "A" : "B";
      const sessionDurationMs = endedAt - session.startedAt;
      session.flags.sessionTooFast = sessionDurationMs < 10 * 60 * 1000;
      sessionSummary = {
        sessionId: session.sessionId,
        durationMs: sessionDurationMs,
        scores: { ...session.scores },
        winner: session.winner,
        firstStoneStarter: firstPlayerForStone(1),
        resonance: session.resonance,
        sessionTooFast: session.flags.sessionTooFast,
        longStones: session.flags.longStones.slice(),
        stoneSummaries: session.stoneSummaries.slice(),
      };
    } else {
      session.stoneIndex += 1;
      session.stone = createStoneState(session.stoneIndex);
    }
  } else {
    stone.currentPlayer = opponent;
  }

  return {
    ok: true,
    moveRecord,
    stoneSummary,
    sessionSummary,
    state: getPublicState(session),
  };
}

function getPublicState(session) {
  const stone = session.stone;
  return {
    sessionId: session.sessionId,
    resonance: session.resonance,
    resonanceLocked: session.resonanceLocked,
    stoneIndex: session.stoneIndex,
    scores: { ...session.scores },
    finished: session.finished,
    winner: session.winner,
    flags: {
      sessionTooFast: session.flags.sessionTooFast,
      longStones: session.flags.longStones.slice(),
    },
    stone: {
      stoneIndex: stone.stoneIndex,
      position: stone.position,
      tone: stone.tone,
      toneLocked: stone.toneLocked,
      currentPlayer: stone.currentPlayer,
      firstPlayer: stone.firstPlayer,
      hands: {
        A: cloneHand(stone.hands.A),
        B: cloneHand(stone.hands.B),
      },
      discards: {
        A: stone.discards.A.slice(),
        B: stone.discards.B.slice(),
      },
      moveCount: stone.moveCount,
    },
  };
}

function runSelfChecks() {
  const results = [];

  function check(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (error) {
      results.push({ name, ok: false, error: String(error.message || error) });
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  check("preview совпадает с фактическим ходом", () => {
    const session = createSession();
    const preview = previewCard(session, 2);
    assert(preview.ok, "preview opening");
    assert(preview.moveType === "opening", "preview opening type");
    assert(preview.shift === 2, "preview shift 2");
    assert(preview.positionAfter === -3, "preview −1−2");
    const result = playCard(session, 2);
    assert(result.moveRecord.shift === preview.shift, "shift совпал");
    assert(result.moveRecord.positionAfter === preview.positionAfter, "посадка совпала");
    const locked = previewCard(session, 2);
    assert(locked.ok === false && locked.blocked === true, "preview видит замок");
  });

  check("opening: задаёт закрытый тон", () => {
    const session = createSession();
    assert(session.stone.position === -1, "задел первому A: −1");
    const result = playCard(session, 2);
    assert(result.ok, "ход должен пройти");
    assert(result.moveRecord.moveType === "opening", "ожидался opening");
    assert(result.moveRecord.shift === 2, "сдвиг должен быть 2");
    assert(result.moveRecord.toneAfter === 2, "тон задан");
    assert(session.stone.toneLocked === true, "тон закрыт");
    assert(result.moveRecord.positionAfter === -3, "−1 − 2 = −3");
  });

  check("на закрытый тон красть нельзя", () => {
    const session = createSession();
    playCard(session, 2);
    const blocked = playCard(session, 2);
    assert(blocked.ok === false, "совпадение на закрытом тоне запрещено");
    const result = playCard(session, 3);
    assert(result.moveRecord.moveType === "rewrite", "нужен rewrite другим числом");
    assert(session.stone.toneLocked === false, "замок снят");
    assert(result.moveRecord.toneAfter === 3, "новый тон 3");
  });

  check("setup из тишины не закрывает тон", () => {
    const session = createSession();
    playCard(session, 1);
    playCard(session, 3);
    playCard(session, 3); // steal → silence
    const result = playCard(session, 2); // setup from silence
    assert(result.moveRecord.moveType === "setup", "setup");
    assert(session.stone.toneLocked === false, "обычный setup открыт для кражи");
  });

  check("после opening чужой удар открывает тон для кражи", () => {
    const session = createSession();
    playCard(session, 1); // opening tone 1 locked
    playCard(session, 3); // rewrite tone 3 open
    const result = playCard(session, 3); // steal ×2
    assert(result.moveRecord.moveType === "steal", "ожидался steal");
    assert(result.moveRecord.shift === 6, "3×2=6");
    assert(result.moveRecord.toneAfter === null, "тон сгорает");
  });

  check("steal ×2 и тишина (default)", () => {
    const session = createSession({ resonance: RESONANCE_DOUBLE });
    playCard(session, 1);
    playCard(session, 2);
    const result = playCard(session, 2);
    assert(result.moveRecord.moveType === "steal", "ожидался steal");
    assert(result.moveRecord.shift === 4, "2×2=4");
    assert(result.moveRecord.toneAfter === null, "тон сгорает");
  });

  check("steal +1 (калибровка)", () => {
    const session = createSession({ resonance: RESONANCE_PLUS1 });
    playCard(session, 1);
    playCard(session, 2);
    const result = playCard(session, 2);
    assert(result.moveRecord.moveType === "steal", "ожидался steal");
    assert(result.moveRecord.shift === 3, "2+1=3");
  });

  check("rewrite", () => {
    const session = createSession();
    playCard(session, 1);
    const result = playCard(session, 3);
    assert(result.moveRecord.moveType === "rewrite", "ожидался rewrite");
    assert(result.moveRecord.shift === 3, "сдвиг 3");
    assert(result.moveRecord.toneAfter === 3, "новый тон 3");
    assert(session.stone.toneLocked === false, "замок снят");
  });

  check("рефил после 4-й карты", () => {
    const session = createSession();
    playCard(session, 1); // A opening
    playCard(session, 2); // B rewrite
    playCard(session, 2); // A steal
    playCard(session, 3); // B setup lock
    playCard(session, 4); // A rewrite
    playCard(session, 4); // B steal
    const result = playCard(session, 3); // A setup — 4-я карта A
    assert(result.moveRecord.refilled === true, "A должен рефилнуться");
    assert(
      JSON.stringify(session.stone.hands.A) === JSON.stringify([1, 2, 3, 4]),
      "рука A снова 1-4"
    );
    assert(session.stone.discards.A.length === 0, "сброс A пуст после рефила");
  });

  check("победа A", () => {
    const session = createSession();
    session.stone.position = -5;
    session.stone.tone = 2;
    session.stone.toneLocked = false;
    session.stone.currentPlayer = "A";
    session.stone.hands.A = [1, 2, 3, 4];
    session.stone.moveCount = 2;
    const result = playCard(session, 2);
    assert(result.moveRecord.stoneFinished === true, "камень должен кончиться");
    assert(result.moveRecord.stoneWinner === "A", "победитель A");
    assert(result.moveRecord.shift === 4, "steal 2×2");
  });

  check("победа B", () => {
    const session = createSession();
    session.stone.position = 5;
    session.stone.tone = 3;
    session.stone.toneLocked = false;
    session.stone.currentPlayer = "B";
    session.stone.hands.B = [1, 2, 3, 4];
    session.stone.moveCount = 2;
    const result = playCard(session, 3);
    assert(result.moveRecord.stoneFinished === true, "камень должен кончиться");
    assert(result.moveRecord.stoneWinner === "B", "победитель B");
    assert(result.moveRecord.shift === 6, "steal 3×2");
  });

  check("первый ход 5 камней A/B/A/B/A", () => {
    const starters = [];
    for (let i = 1; i <= 5; i += 1) {
      starters.push(firstPlayerForStone(i));
    }
    assert(starters.join(",") === "A,B,A,B,A", `получили ${starters.join(",")}`);
  });

  check("калибровка +2", () => {
    const session = createSession({ resonance: RESONANCE_PLUS2 });
    playCard(session, 1);
    playCard(session, 3);
    const result = playCard(session, 3);
    assert(result.moveRecord.moveType === "steal", "steal");
    assert(result.moveRecord.shift === 5, "3+2=5");
  });

  check("калибровка не меняется после первого хода", () => {
    const session = createSession({ resonance: RESONANCE_DOUBLE });
    playCard(session, 1);
    const locked = setResonance(session, RESONANCE_PLUS1);
    assert(locked.ok === false, "смена должна быть запрещена");
    assert(session.resonance === RESONANCE_DOUBLE, "остаётся double");
  });

  check("сессия из 5 камней", () => {
    const session = createSession();
    let stonesFinished = 0;
    let guard = 0;
    while (!session.finished && guard < 500) {
      guard += 1;
      const stone = session.stone;
      const hand = stone.hands[stone.currentPlayer];
      const hasOther = hand.some((card) => card !== stone.tone);
      let card = null;
      for (let i = hand.length - 1; i >= 0; i -= 1) {
        if (stone.toneLocked && hand[i] === stone.tone && hasOther) {
          continue;
        }
        card = hand[i];
        break;
      }
      assert(card !== null, "нет легальной карты");
      const result = playCard(session, card);
      assert(result.ok, result.error || "ход");
      if (result.stoneSummary) {
        stonesFinished += 1;
      }
    }
    assert(session.finished === true, "сессия должна закончиться");
    assert(stonesFinished === 5, `ожидалось 5 камней, получили ${stonesFinished}`);
    assert(session.scores.A + session.scores.B === 5, "сумма счёта 5");
  });

  check("жадная кража не зацикливает; humanish не 0/100", () => {
    function stealElseMax(session) {
      const st = session.stone;
      const hand = st.hands[st.currentPlayer];
      if (st.tone !== null && !st.toneLocked && hand.includes(st.tone)) {
        return st.tone;
      }
      const hasOther = hand.some((card) => card !== st.tone);
      const legal = hand.filter(
        (card) => !(st.toneLocked && card === st.tone && hasOther)
      );
      return Math.max(...(legal.length ? legal : hand));
    }

    function humanish(session) {
      const st = session.stone;
      const player = st.currentPlayer;
      const hand = st.hands[player].slice();
      const opp = player === "A" ? "B" : "A";
      const oppHand = st.hands[opp];
      const tone = st.tone;
      const pos = st.position;
      const res = session.resonance;
      function shiftFor(card) {
        if (st.moveCount === 0) {
          return card;
        }
        if (tone === null) {
          return card;
        }
        if (card === tone && !st.toneLocked) {
          return stealShiftFor(card, res);
        }
        return card;
      }
      const hasOther = hand.some((card) => card !== tone);
      const legal = hand.filter(
        (card) => !(st.toneLocked && card === tone && hasOther)
      );
      for (const card of [...legal].sort((a, b) => b - a)) {
        const finish =
          player === "A"
            ? pos - shiftFor(card) < -EDGE
            : pos + shiftFor(card) > EDGE;
        if (finish) {
          return card;
        }
      }
      if (st.moveCount === 0) {
        const small = legal.filter((card) => card <= 2);
        return small.length
          ? small[Math.floor(Math.random() * small.length)]
          : legal[0];
      }
      const behind = player === "A" ? pos > 0 : pos < 0;
      if (behind && tone !== null && !st.toneLocked && legal.includes(tone)) {
        return tone;
      }
      const nonSteal = legal.filter((card) => card !== tone || st.toneLocked);
      const pool = nonSteal.length ? nonSteal : legal;
      const dead = pool.filter((card) => !oppHand.includes(card));
      if (dead.length && Math.random() < 0.65) {
        return dead[Math.floor(Math.random() * dead.length)];
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }

    for (let i = 0; i < 10; i += 1) {
      const session = createSession({ resonance: RESONANCE_DOUBLE });
      let guard = 0;
      while (!session.finished && guard < 400) {
        guard += 1;
        const result = playCard(session, stealElseMax(session));
        assert(result.ok, result.error || "ход");
      }
      assert(
        session.finished === true,
        `жадный завис на сессии ${i}, ходов ${guard}`
      );
    }

    let firstWins = 0;
    let stones = 0;
    for (let i = 0; i < 80; i += 1) {
      const session = createSession({ resonance: RESONANCE_DOUBLE });
      while (!session.finished) {
        const firstPlayer = session.stone.firstPlayer;
        const result = playCard(session, humanish(session));
        assert(result.ok, result.error || "ход");
        if (result.stoneSummary) {
          stones += 1;
          if (result.stoneSummary.winner === firstPlayer) {
            firstWins += 1;
          }
        }
      }
    }
    const rate = firstWins / stones;
    assert(
      rate > 0.35 && rate < 0.65,
      `humanish first-win rate ${rate} вне коридора`
    );
  });

  return results;
}

window.TokachRules = {
  FULL_HAND,
  STONES_PER_SESSION,
  EDGE,
  RESONANCE_DOUBLE,
  RESONANCE_PLUS2,
  RESONANCE_PLUS1,
  createSession,
  setResonance,
  playCard,
  previewCard,
  getPublicState,
  firstPlayerForStone,
  runSelfChecks,
};

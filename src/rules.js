/**
 * Обвод — правила забега. Без DOM.
 * Спека: PROTOTYPE_SPEC.md, концепция: GAME_DESIGN.md
 */

const G = window.ObvodGeometry;

const BALANCE = Object.freeze({
  playerRadius: 13,
  playerSpeed: 208,
  trailSample: 9,
  maxTrailLen: 920,
  minLoopArea: 4800,
  minLoopPath: 240,
  closeRadius: 20,
  wallAssistDist: 30,
  wallAssistThreshold: 0.5,
  sealDuration: 7.2,
  weakSealDuration: 2.1,
  spentDuration: 11,
  collapseDelay: 13,
  collapseSpeed: 8.6,
  leakSpeed: 42,
  leakRadius: 20,
  leakTouchTime: 0.55,
  ghostSpeed: 195,
  ghostRadius: 12,
  snapSpentRadius: 22,
});

const WORLD = Object.freeze({
  w: 2100,
  h: 980,
});

function rect(x, y, w, h) {
  return { x, y, w, h };
}

function buildDistrict() {
  const walls = [
    rect(0, 0, 2100, 46),
    rect(0, 934, 2100, 46),
    rect(0, 0, 46, 980),
    rect(2054, 0, 46, 980),
    rect(390, 46, 36, 270),
    rect(390, 560, 36, 374),
    rect(1188, 46, 36, 280),
    rect(1188, 560, 36, 374),
    rect(620, 700, 36, 234),
    rect(1000, 700, 36, 234),
    rect(656, 700, 344, 28),
    rect(760, 350, 96, 96),
    rect(1580, 220, 70, 220),
    rect(1760, 620, 90, 160),
  ];
  const lanterns = [
    { x: 120, y: 90 },
    { x: 330, y: 90 },
    { x: 120, y: 880 },
    { x: 540, y: 90 },
    { x: 1100, y: 90 },
    { x: 820, y: 640 },
    { x: 1320, y: 90 },
    { x: 1980, y: 90 },
    { x: 1980, y: 880 },
    { x: 1320, y: 880 },
  ];
  return {
    walls,
    lanterns,
    spawn: { x: 188, y: 448 },
    exit: rect(70, 330, 250, 230),
    cargo: { x: 1860, y: 470, r: 16 },
    leaks: [
      { x: 820, y: 250, vx: 28, vy: 10 },
      { x: 780, y: 820, vx: -16, vy: 12 },
      { x: 1380, y: 470, vx: 10, vy: -22 },
    ],
  };
}

function cloneLeaks(leaks) {
  return leaks.map((leak) => ({
    x: leak.x,
    y: leak.y,
    vx: leak.vx,
    vy: leak.vy,
    alive: true,
  }));
}

function loadGhost() {
  try {
    const raw = localStorage.getItem("obvod.lastPath");
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.won || !Array.isArray(parsed.points)) {
      return [];
    }
    return parsed.points
      .filter((p) => typeof p.x === "number" && typeof p.y === "number")
      .slice(0, 2400);
  } catch (error) {
    return [];
  }
}

function saveGhost(points, won) {
  try {
    localStorage.setItem(
      "obvod.lastPath",
      JSON.stringify({
        won: Boolean(won),
        points: points.slice(0, 2400),
      })
    );
  } catch (error) {
    // ignore quota
  }
}

function createRun(options = {}) {
  const district = buildDistrict();
  const ghostPoints = options.ghostPoints || loadGhost();
  return {
    district,
    player: { x: district.spawn.x, y: district.spawn.y },
    trail: [],
    trailLen: 0,
    seals: [],
    spent: [],
    leaks: cloneLeaks(district.leaks),
    cargo: { x: district.cargo.x, y: district.cargo.y, held: false },
    collapseX: 0,
    time: 0,
    leakTouch: 0,
    ghostPoints,
    ghostIndex: 0,
    ghost: ghostPoints.length
      ? { x: ghostPoints[0].x, y: ghostPoints[0].y, alive: true }
      : null,
    recorded: [],
    status: "running",
    failReason: null,
    lastEvent: null,
    events: [],
    stats: {
      closes: 0,
      seals: 0,
      burns: 0,
      captures: 0,
      weak: 0,
      snaps: 0,
      cancels: 0,
    },
  };
}

function emit(run, event) {
  run.lastEvent = event;
  run.events.push(event);
  if (run.events.length > 24) {
    run.events.shift();
  }
}

function blockedAt(run, x, y, radius, ignoreSeals) {
  const walls = run.district.walls;
  for (let i = 0; i < walls.length; i += 1) {
    if (G.circleHitsAabb(x, y, radius, walls[i])) {
      return true;
    }
  }
  if (x < run.collapseX + radius * 0.4) {
    return true;
  }
    if (!ignoreSeals) {
    const p = { x, y };
    for (let i = 0; i < run.seals.length; i += 1) {
      const seal = run.seals[i];
      if (seal.grace > 0) {
        continue;
      }
      if (G.pointInPolygon(p, seal.poly) && !G.pointInPolygon(run.player, seal.poly)) {
        return true;
      }
    }
  }
  return false;
}

function moveBody(run, body, dx, dy, radius) {
  const nextX = body.x + dx;
  if (!blockedAt(run, nextX, body.y, radius, false)) {
    body.x = nextX;
  }
  const nextY = body.y + dy;
  if (!blockedAt(run, body.x, nextY, radius, false)) {
    body.y = nextY;
  }
  body.x = G.clamp(body.x, 50, WORLD.w - 50);
  body.y = G.clamp(body.y, 50, WORLD.h - 50);
}

function inSpent(run, p) {
  for (let i = 0; i < run.spent.length; i += 1) {
    if (G.pointInPolygon(p, run.spent[i].poly)) {
      return true;
    }
  }
  return false;
}

function spentOverlap(run, poly) {
  return G.samplePolygonOverlap(poly, (p) => inSpent(run, p), 8);
}

function addSpent(run, poly, extraTtl) {
  run.spent.push({
    poly: poly.map((p) => ({ x: p.x, y: p.y })),
    ttl: BALANCE.spentDuration + (extraTtl || 0),
  });
  if (run.spent.length > 14) {
    run.spent.shift();
  }
}

function spentAlongTrail(run, points) {
  const dense = G.densifyPolyline(points, 14);
  for (let i = 0; i < dense.length; i += 8) {
    const cluster = [];
    const c = dense[i];
    const r = BALANCE.snapSpentRadius;
    cluster.push({ x: c.x - r, y: c.y });
    cluster.push({ x: c.x, y: c.y - r });
    cluster.push({ x: c.x + r, y: c.y });
    cluster.push({ x: c.x, y: c.y + r });
    addSpent(run, cluster, -4);
  }
}

function snapTrail(run, reason) {
  if (run.trail.length > 2) {
    spentAlongTrail(run, run.trail);
    run.stats.snaps += 1;
    emit(run, { type: "snap", reason, x: run.player.x, y: run.player.y });
  }
  run.trail = [];
  run.trailLen = 0;
}

function cancelTrail(run) {
  if (run.trail.length < 2) {
    run.trail = [];
    run.trailLen = 0;
    return;
  }
  run.stats.cancels += 1;
  snapTrail(run, "cancel");
}

function classifyInterior(run, poly) {
  const cargoInside =
    !run.cargo.held &&
    G.pointInPolygon({ x: run.cargo.x, y: run.cargo.y }, poly);
  const leaksInside = [];
  for (let i = 0; i < run.leaks.length; i += 1) {
    const leak = run.leaks[i];
    if (leak.alive && G.pointInPolygon(leak, poly)) {
      leaksInside.push(leak);
    }
  }
  const ghostInside =
    run.ghost &&
    run.ghost.alive &&
    G.pointInPolygon(run.ghost, poly);
  return { cargoInside, leaksInside, ghostInside };
}

function closeLoop(run, startIndex, forced) {
  const loop = run.trail.slice(startIndex);
  loop.push({ x: run.player.x, y: run.player.y });
  if (loop.length < 5) {
    return false;
  }
  const area = G.polygonArea(loop);
  if (area < BALANCE.minLoopArea) {
    return false;
  }
  const spentRatio = spentOverlap(run, loop);
  if (spentRatio > 0.42) {
    emit(run, {
      type: "reject",
      reason: "spent",
      x: run.player.x,
      y: run.player.y,
    });
    return false;
  }
  const assist = G.wallAssistRatio(
    loop,
    run.district.walls,
    BALANCE.wallAssistDist
  );
  const weak = assist >= BALANCE.wallAssistThreshold;
  const interior = classifyInterior(run, loop);
  const threat = interior.leaksInside.length > 0 || interior.ghostInside;
  let kind = "seal";
  if (interior.cargoInside && threat) {
    kind = "mix";
  } else if (interior.cargoInside) {
    kind = "capture";
  } else if (threat) {
    kind = "burn";
  }

  run.stats.closes += 1;
  if (weak) {
    run.stats.weak += 1;
  }

  if (kind === "seal") {
    const ttl = weak ? BALANCE.weakSealDuration : BALANCE.sealDuration;
    run.seals.push({ poly: loop, ttl, weak, grace: 0.25 });
    run.stats.seals += 1;
    addSpent(run, loop, 0);
    emit(run, {
      type: "seal",
      weak,
      forced: Boolean(forced),
      x: run.player.x,
      y: run.player.y,
      area,
    });
  } else if (kind === "capture") {
    if (weak) {
      emit(run, {
        type: "weak-capture",
        x: run.cargo.x,
        y: run.cargo.y,
        area,
      });
      addSpent(run, loop, -3);
    } else {
      run.cargo.held = true;
      run.stats.captures += 1;
      addSpent(run, loop, 0);
      emit(run, {
        type: "capture",
        x: run.cargo.x,
        y: run.cargo.y,
        area,
      });
    }
  } else {
    if (weak) {
      emit(run, {
        type: "weak-burn",
        x: run.player.x,
        y: run.player.y,
        area,
      });
      addSpent(run, loop, -3);
    } else {
      for (let i = 0; i < interior.leaksInside.length; i += 1) {
        interior.leaksInside[i].alive = false;
      }
      if (interior.ghostInside && run.ghost) {
        run.ghost.alive = false;
      }
      run.stats.burns += 1;
      addSpent(run, loop, 0);
      emit(run, {
        type: "burn",
        x: run.player.x,
        y: run.player.y,
        area,
        ghost: Boolean(interior.ghostInside),
      });
    }
  }

  run.trail = [];
  run.trailLen = 0;
  return true;
}

function tryClose(run, forcedByGhost) {
  const idx = G.findClosingIndex(
    run.trail,
    run.player,
    BALANCE.closeRadius,
    BALANCE.minLoopPath
  );
  if (idx < 0) {
    return false;
  }
  return closeLoop(run, idx, forcedByGhost);
}

function ghostTouchesTrail(run) {
  if (!run.ghost || !run.ghost.alive || run.trail.length < 6) {
    return false;
  }
  for (let i = 0; i < run.trail.length - 4; i += 3) {
    if (G.dist(run.ghost, run.trail[i]) <= BALANCE.closeRadius) {
      return true;
    }
  }
  return false;
}

function stepGhost(run, dt) {
  if (!run.ghost || !run.ghost.alive || run.ghostPoints.length < 2) {
    return;
  }
  const pts = run.ghostPoints;
  let idx = run.ghostIndex;
  let remaining = BALANCE.ghostSpeed * dt;
  while (remaining > 0 && idx < pts.length - 1) {
    const a = pts[idx];
    const b = pts[idx + 1];
    const seg = Math.max(0.01, G.dist(a, b));
    if (remaining >= seg) {
      remaining -= seg;
      idx += 1;
      run.ghost.x = b.x;
      run.ghost.y = b.y;
    } else {
      const t = remaining / seg;
      run.ghost.x = a.x + (b.x - a.x) * t;
      run.ghost.y = a.y + (b.y - a.y) * t;
      remaining = 0;
    }
  }
  run.ghostIndex = idx;
  if (idx >= pts.length - 1) {
    run.ghostIndex = 0;
    run.ghost.x = pts[0].x;
    run.ghost.y = pts[0].y;
  }
}

function bounceLeak(run, leak, dt) {
  if (!leak.alive) {
    return;
  }
  const nx = leak.x + leak.vx * dt;
  const ny = leak.y + leak.vy * dt;
  if (blockedAt(run, nx, leak.y, BALANCE.leakRadius, true) || nx < run.collapseX + 30) {
    leak.vx *= -1;
  } else {
    leak.x = nx;
  }
  if (blockedAt(run, leak.x, ny, BALANCE.leakRadius, true)) {
    leak.vy *= -1;
  } else {
    leak.y = ny;
  }
}

function finish(run, status, reason) {
  if (run.status !== "running") {
    return;
  }
  run.status = status;
  run.failReason = reason || null;
  const won = status === "won";
  saveGhost(run.recorded, won);
  emit(run, { type: status, reason: reason || null, x: run.player.x, y: run.player.y });
}

function stepRun(run, input, dt) {
  if (run.status !== "running") {
    return run.lastEvent;
  }
  const sliced = Math.min(dt, 0.05);
  run.time += sliced;

  if (run.time > BALANCE.collapseDelay) {
    run.collapseX += BALANCE.collapseSpeed * sliced;
  }

  if (input.cancel) {
    cancelTrail(run);
  }

  const ax = input.ax || 0;
  const ay = input.ay || 0;
  const len = Math.hypot(ax, ay) || 1;
  const dx = (ax / len) * BALANCE.playerSpeed * sliced * (ax || ay ? 1 : 0);
  const dy = (ay / len) * BALANCE.playerSpeed * sliced * (ax || ay ? 1 : 0);
  if (ax || ay) {
    moveBody(run, run.player, dx, dy, BALANCE.playerRadius);
  }

  run.recorded.push({ x: run.player.x, y: run.player.y });
  if (run.recorded.length > 2400) {
    run.recorded.shift();
  }

  const last = run.trail[run.trail.length - 1];
  if (!last || G.dist(last, run.player) >= BALANCE.trailSample) {
    run.trail.push({ x: run.player.x, y: run.player.y });
    if (run.trail.length > 1) {
      run.trailLen += G.dist(run.trail[run.trail.length - 2], run.player);
    }
  }
  if (run.trailLen > BALANCE.maxTrailLen) {
    snapTrail(run, "length");
  } else {
    tryClose(run, false);
  }

  for (let i = run.seals.length - 1; i >= 0; i -= 1) {
    run.seals[i].ttl -= sliced;
    run.seals[i].grace = Math.max(0, (run.seals[i].grace || 0) - sliced);
    if (run.seals[i].ttl <= 0) {
      run.seals.splice(i, 1);
    }
  }
  for (let i = run.spent.length - 1; i >= 0; i -= 1) {
    run.spent[i].ttl -= sliced;
    if (run.spent[i].ttl <= 0) {
      run.spent.splice(i, 1);
    }
  }

  for (let i = 0; i < run.leaks.length; i += 1) {
    bounceLeak(run, run.leaks[i], sliced);
  }

  stepGhost(run, sliced);
  if (ghostTouchesTrail(run)) {
    const closed = tryClose(run, true);
    if (!closed) {
      snapTrail(run, "ghost");
    }
  }

  let touchingLeak = false;
  for (let i = 0; i < run.leaks.length; i += 1) {
    const leak = run.leaks[i];
    if (!leak.alive) {
      continue;
    }
    if (G.dist(run.player, leak) < BALANCE.playerRadius + BALANCE.leakRadius) {
      touchingLeak = true;
    }
  }
  if (touchingLeak) {
    run.leakTouch += sliced;
    if (run.leakTouch >= BALANCE.leakTouchTime) {
      finish(run, "lost", "leak");
      return run.lastEvent;
    }
  } else {
    run.leakTouch = Math.max(0, run.leakTouch - sliced * 1.6);
  }

  if (run.player.x < run.collapseX + BALANCE.playerRadius) {
    finish(run, "lost", "collapse");
    return run.lastEvent;
  }

  if (run.cargo.held && G.pointInAabb(run.player, run.district.exit)) {
    finish(run, "won", null);
  }

  return run.lastEvent;
}

function getPublicState(run) {
  return {
    status: run.status,
    failReason: run.failReason,
    time: run.time,
    player: { x: run.player.x, y: run.player.y },
    trail: run.trail,
    trailLen: run.trailLen,
    maxTrailLen: BALANCE.maxTrailLen,
    seals: run.seals,
    spent: run.spent,
    leaks: run.leaks,
    cargo: run.cargo,
    collapseX: run.collapseX,
    ghost: run.ghost,
    lastEvent: run.lastEvent,
    stats: { ...run.stats },
    district: run.district,
    world: WORLD,
    balance: BALANCE,
    hasGhost: Boolean(run.ghost && run.ghost.alive),
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

  function assert(cond, message) {
    if (!cond) {
      throw new Error(message);
    }
  }

  function walkTo(run, target, guard) {
    let n = 0;
    while (n < guard && G.dist(run.player, target) > 10) {
      n += 1;
      stepRun(
        run,
        {
          ax: target.x - run.player.x,
          ay: target.y - run.player.y,
          cancel: false,
        },
        0.02
      );
    }
  }

  function walkSquare(run, cx, cy, half) {
    const corners = [
      { x: cx - half, y: cy - half },
      { x: cx + half, y: cy - half },
      { x: cx + half, y: cy + half },
      { x: cx - half, y: cy + half },
      { x: cx - half, y: cy - half },
    ];
    run.player.x = corners[0].x;
    run.player.y = corners[0].y;
    run.trail = [{ x: corners[0].x, y: corners[0].y }];
    run.trailLen = 0;
    for (let c = 1; c < corners.length; c += 1) {
      walkTo(run, corners[c], 400);
    }
    walkTo(run, corners[0], 80);
  }

  check("микрокруг не замыкается", () => {
    const run = createRun({ ghostPoints: [] });
    walkSquare(run, run.player.x, run.player.y, 18);
    assert(run.stats.closes === 0, `закрытий ${run.stats.closes}`);
  });

  check("пустой контур → печать", () => {
    const run = createRun({ ghostPoints: [] });
    run.player.x = 240;
    run.player.y = 240;
    run.trail = [];
    walkSquare(run, 240, 240, 70);
    assert(run.stats.seals >= 1, "должна быть печать");
    assert(run.seals.length >= 1, "печать жива");
  });

  check("контур вокруг течи → выжигание", () => {
    const run = createRun({ ghostPoints: [] });
    const leak = run.leaks[0];
    leak.vx = 0;
    leak.vy = 0;
    run.player.x = leak.x - 80;
    run.player.y = leak.y - 80;
    run.trail = [];
    walkSquare(run, leak.x, leak.y, 80);
    assert(run.stats.burns >= 1, "ожидалось выжигание");
    assert(leak.alive === false, "течь должна сгореть");
  });

  check("контур вокруг груза → захват", () => {
    const run = createRun({ ghostPoints: [] });
    run.leaks.forEach((leak) => {
      leak.alive = false;
    });
    run.player.x = run.cargo.x - 80;
    run.player.y = run.cargo.y - 80;
    run.trail = [];
    walkSquare(run, run.cargo.x, run.cargo.y, 80);
    assert(run.cargo.held === true, "груз должен взяться");
    assert(run.stats.captures >= 1, "захват");
  });

  check("смесь груз+течь не берёт груз", () => {
    const run = createRun({ ghostPoints: [] });
    run.leaks.forEach((leak) => {
      leak.alive = false;
    });
    const leak = run.leaks[0];
    leak.alive = true;
    leak.x = run.cargo.x + 10;
    leak.y = run.cargo.y;
    leak.vx = 0;
    leak.vy = 0;
    run.player.x = run.cargo.x - 90;
    run.player.y = run.cargo.y - 90;
    run.trail = [];
    walkSquare(run, run.cargo.x, run.cargo.y, 90);
    assert(run.cargo.held === false, "смесь не должна брать груз");
    assert(leak.alive === false, "течь выжигается");
  });

  check("переполнение длины рвёт черту", () => {
    const run = createRun({ ghostPoints: [] });
    run.player.x = 200;
    run.player.y = 200;
    for (let i = 0; i < 220; i += 1) {
      stepRun(run, { ax: 1, ay: 0.02, cancel: false }, 0.05);
    }
    assert(run.stats.snaps >= 1 || run.trailLen < BALANCE.maxTrailLen + 40, "должен быть срыв");
  });

  check("отмирание убивает слева", () => {
    const run = createRun({ ghostPoints: [] });
    run.collapseX = 400;
    run.player.x = 200;
    stepRun(run, { ax: 0, ay: 0, cancel: false }, 0.05);
    assert(run.status === "lost", "должен проиграть отмиранию");
    assert(run.failReason === "collapse", run.failReason);
  });

  return results;
}

window.ObvodRules = {
  BALANCE,
  WORLD,
  createRun,
  stepRun,
  getPublicState,
  runSelfChecks,
  buildDistrict,
  loadGhost,
  saveGhost,
};

/**
 * Обвод — ввод, кадр, отрисовка.
 */

const Rules = window.ObvodRules;
const G = window.ObvodGeometry;

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hud = {
  trailFill: document.getElementById("trailFill"),
  event: document.getElementById("eventLog"),
  cargo: document.getElementById("cargoState"),
  hint: document.getElementById("hint"),
  overlay: document.getElementById("overlay"),
  overlayTitle: document.getElementById("overlayTitle"),
  overlayText: document.getElementById("overlayText"),
  overlayBtn: document.getElementById("overlayBtn"),
  selfCheckBtn: document.getElementById("selfCheckBtn"),
  selfCheckOut: document.getElementById("selfCheckOut"),
};

const keys = new Set();
const particles = [];
const floaters = [];
const dust = [];

let run = null;
let cam = { x: 0, y: 0 };
let started = false;
let last = 0;
let shake = 0;
let flash = null;
let demo = new URLSearchParams(window.location.search).has("demo");
let demoT = 0;
let cancelArmed = false;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function addFloater(text, x, y, color) {
  floaters.push({ text, x, y, color, ttl: 1.15, vy: -38 });
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      ttl: 0.4 + Math.random() * 0.5,
      color,
      r: 2 + Math.random() * 4,
    });
  }
}

function blip(freq, dur, type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!blip.ctx) {
      blip.ctx = new AudioCtx();
    }
    const ctxA = blip.ctx;
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = type || "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.07, ctxA.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctxA.currentTime + dur);
    osc.connect(gain);
    gain.connect(ctxA.destination);
    osc.start();
    osc.stop(ctxA.currentTime + dur);
  } catch (error) {
    // autoplay
  }
}

function react(event) {
  if (!event) {
    return;
  }
  const labels = {
    seal: event.forced ? "тень замкнула" : event.weak ? "слабо: печать" : "печать",
    burn: event.ghost ? "выжигание тени" : "выжигание",
    capture: "захват",
    "weak-burn": "слабо — слишком много стен",
    "weak-capture": "слабо — груз не взялся",
    snap: event.reason === "cancel" ? "черта брошена" : "черта лопнула",
    "leak-warn": "обводи — не стой в сгустке",
    won: "ты вышел с грузом",
    lost:
      event.reason === "collapse"
        ? "отмирание догнало"
        : "сгусток закрыл тебя",
  };
  const text = labels[event.type];
  if (text) {
    hud.event.textContent = text;
    addFloater(text, event.x, event.y - 20, "#fff6d8");
  }
  if (event.type === "seal") {
    burst(event.x, event.y, "#e879f9", 18);
    blip(event.weak ? 220 : 320, 0.16, "sine");
    flash = { color: "rgba(216, 70, 239, 0.18)", ttl: 0.18 };
  } else if (event.type === "burn") {
    burst(event.x, event.y, "#7cff6b", 28);
    blip(520, 0.2, "sawtooth");
    flash = { color: "rgba(124, 255, 107, 0.2)", ttl: 0.22 };
    shake = 7;
  } else if (event.type === "capture") {
    burst(event.x, event.y, "#ffd166", 36);
    blip(440, 0.12, "triangle");
    blip(660, 0.18, "triangle");
    flash = { color: "rgba(255, 209, 102, 0.22)", ttl: 0.25 };
    shake = 5;
  } else if (event.type === "snap") {
    burst(event.x, event.y, "#94a3b8", 12);
    blip(90, 0.22, "square");
  } else if (event.type === "leak-warn") {
    burst(event.x, event.y, "#86efac", 8);
    blip(180, 0.12, "sine");
  } else if (event.type === "won") {
    blip(523, 0.3, "triangle");
  } else if (event.type === "lost") {
    shake = 10;
    blip(70, 0.4, "sine");
  }
}

function showOverlay(title, text, btn) {
  if (!hud.overlayTitle || !hud.overlayText || !hud.overlayBtn) {
    return;
  }
  hud.overlay.classList.add("show");
  hud.overlayTitle.textContent = title;
  hud.overlayText.textContent = text;
  hud.overlayBtn.textContent = btn;
}

function hideOverlay() {
  hud.overlay.classList.remove("show");
}

function startRun() {
  run = Rules.createRun();
  started = true;
  last = performance.now();
  hideOverlay();
  hud.event.textContent = run.ghost
    ? "в доме ходит твой прошлый обвод"
    : "замкни черту вокруг сгустка";
  hud.hint.textContent = "WASD / стрелки — идти · Пробел — бросить черту";
  cam.x = run.player.x;
  cam.y = run.player.y;
  particles.length = 0;
  floaters.length = 0;
}

function inputFromKeys() {
  let ax = 0;
  let ay = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) {
    ay -= 1;
  }
  if (keys.has("KeyS") || keys.has("ArrowDown")) {
    ay += 1;
  }
  if (keys.has("KeyA") || keys.has("ArrowLeft")) {
    ax -= 1;
  }
  if (keys.has("KeyD") || keys.has("ArrowRight")) {
    ax += 1;
  }
  const cancel = keys.has("Space") && !cancelArmed;
  if (keys.has("Space")) {
    cancelArmed = true;
  } else {
    cancelArmed = false;
  }
  return { ax, ay, cancel };
}

function demoInput(dt) {
  demoT += dt;
  if (!run) {
    return { ax: 0, ay: 0, cancel: false };
  }
  const leak = run.leaks.find((item) => item.alive) || run.cargo;
  const phase = demoT % 6;
  const half = 88;
  const corners = [
    { x: leak.x - half, y: leak.y - half },
    { x: leak.x + half, y: leak.y - half },
    { x: leak.x + half, y: leak.y + half },
    { x: leak.x - half, y: leak.y + half },
  ];
  const idx = Math.min(3, Math.floor(phase));
  const target = corners[idx];
  return {
    ax: target.x - run.player.x,
    ay: target.y - run.player.y,
    cancel: false,
  };
}

function worldToScreen(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: x - cam.x + w / 2,
    y: y - cam.y + h / 2,
  };
}

function drawPoly(poly, fill, stroke, width) {
  if (!poly || poly.length < 2) {
    return;
  }
  ctx.beginPath();
  const a = worldToScreen(poly[0].x, poly[0].y);
  ctx.moveTo(a.x, a.y);
  for (let i = 1; i < poly.length; i += 1) {
    const p = worldToScreen(poly[i].x, poly[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width || 2;
    ctx.stroke();
  }
}

function drawWorld(state) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const t = state.time;

  ctx.fillStyle = "#070815";
  ctx.fillRect(0, 0, w, h);

  const floor = worldToScreen(0, 0);
  ctx.fillStyle = "#15203a";
  ctx.fillRect(floor.x, floor.y, state.world.w, state.world.h);

  ctx.save();
  ctx.beginPath();
  ctx.rect(floor.x, floor.y, state.world.w, state.world.h);
  ctx.clip();

  for (let x = 0; x < state.world.w; x += 48) {
    for (let y = 0; y < state.world.h; y += 48) {
      const flicker = 0.04 * Math.sin(t * 2 + x * 0.01 + y * 0.013);
      ctx.fillStyle = `rgba(232, 176, 92, ${0.045 + flicker})`;
      const p = worldToScreen(x + 18, y + 18);
      ctx.fillRect(p.x, p.y, 14, 14);
    }
  }

  for (let i = 0; i < state.spent.length; i += 1) {
    drawPoly(state.spent[i].poly, "rgba(24, 26, 40, 0.72)", "rgba(90, 96, 120, 0.4)", 1);
  }
  for (let i = 0; i < state.seals.length; i += 1) {
    const pulse = 0.18 + 0.08 * Math.sin(t * 6 + i);
    drawPoly(
      state.seals[i].poly,
      `rgba(217, 70, 239, ${pulse})`,
      state.seals[i].weak ? "#f0abfc" : "#f5d0fe",
      3
    );
  }

  const collapse = worldToScreen(0, 0);
  const grad = ctx.createLinearGradient(collapse.x, 0, collapse.x + state.collapseX, 0);
  grad.addColorStop(0, "rgba(80, 4, 28, 0.92)");
  grad.addColorStop(0.7, "rgba(190, 18, 60, 0.55)");
  grad.addColorStop(1, "rgba(255, 45, 85, 0.08)");
  ctx.fillStyle = grad;
  ctx.fillRect(collapse.x, collapse.y, state.collapseX, state.world.h);
  ctx.strokeStyle = "rgba(255, 80, 120, 0.85)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  const edge = worldToScreen(state.collapseX, 0);
  ctx.moveTo(edge.x, edge.y);
  ctx.lineTo(edge.x, edge.y + state.world.h);
  ctx.stroke();

  const walls = state.district.walls;
  for (let i = 0; i < walls.length; i += 1) {
    const box = walls[i];
    const p = worldToScreen(box.x, box.y);
    ctx.fillStyle = "#3a2760";
    ctx.fillRect(p.x, p.y, box.w, box.h);
    ctx.fillStyle = "rgba(240, 195, 106, 0.35)";
    ctx.fillRect(p.x, p.y, box.w, 4);
    ctx.fillStyle = "rgba(8, 6, 16, 0.45)";
    ctx.fillRect(p.x, p.y + box.h - 6, box.w, 6);
  }

  for (let i = 0; i < state.district.lanterns.length; i += 1) {
    const lantern = state.district.lanterns[i];
    const p = worldToScreen(lantern.x, lantern.y);
    const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 70);
    glow.addColorStop(0, "rgba(255, 214, 120, 0.55)");
    glow.addColorStop(1, "rgba(255, 160, 40, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  const trail = state.trail;
  if (trail.length > 1) {
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#5eead4";
    ctx.beginPath();
    const s0 = worldToScreen(trail[0].x, trail[0].y);
    ctx.moveTo(s0.x, s0.y);
    for (let i = 1; i < trail.length; i += 1) {
      const p = worldToScreen(trail[i].x, trail[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(94, 234, 212, 0.35)";
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.strokeStyle = "#ecfeff";
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (state.closeHint) {
    const hint = state.closeHint;
    const hp = worldToScreen(hint.x, hint.y);
    const pl2 = worldToScreen(state.player.x, state.player.y);
    const pulse = 10 + Math.sin(t * 7) * 4 + (hint.near ? 6 : 0);
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = hint.near ? "rgba(253, 224, 71, 0.95)" : "rgba(253, 224, 71, 0.45)";
    ctx.lineWidth = hint.near ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(pl2.x, pl2.y);
    ctx.lineTo(hp.x, hp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 22;
    ctx.shadowColor = "#fde047";
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fef9c3";
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 15px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#fef08a";
    ctx.fillText("замкни", hp.x, hp.y - pulse - 8);
  }

  for (let i = 0; i < state.leaks.length; i += 1) {
    const leak = state.leaks[i];
    if (!leak.alive) {
      continue;
    }
    const p = worldToScreen(leak.x, leak.y);
    const g2 = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 34);
    g2.addColorStop(0, "#d8ff9a");
    g2.addColorStop(0.4, "#4ade80");
    g2.addColorStop(1, "rgba(22, 163, 74, 0)");
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 34 + Math.sin(t * 5 + i) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!state.cargo.held) {
    const p = worldToScreen(state.cargo.x, state.cargo.y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t * 0.6);
    ctx.fillStyle = "#ffd166";
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(14, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  if (state.ghost && state.ghost.alive) {
    const p = worldToScreen(state.ghost.x, state.ghost.y);
    ctx.fillStyle = "rgba(255, 80, 120, 0.55)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 200, 210, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const pl = worldToScreen(state.player.x, state.player.y);
  ctx.shadowBlur = 16;
  ctx.shadowColor = "#67e8f9";
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.arc(pl.x, pl.y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 3;
  ctx.stroke();

  const exit = state.district.exit;
  const ep = worldToScreen(exit.x, exit.y);
  ctx.strokeStyle = state.cargo.held ? "rgba(255, 209, 102, 0.9)" : "rgba(125, 211, 252, 0.45)";
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(ep.x, ep.y, exit.w, exit.h);
  ctx.setLineDash([]);
  ctx.fillStyle = state.cargo.held ? "rgba(255, 209, 102, 0.12)" : "rgba(56, 189, 248, 0.08)";
  ctx.fillRect(ep.x, ep.y, exit.w, exit.h);

  ctx.fillStyle = "rgba(186, 230, 253, 0.5)";
  ctx.font = "700 22px 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  const labels = [
    { t: "вход", x: 220, y: 300 },
    { t: "зал", x: 780, y: 220 },
    { t: "течь", x: 820, y: 820 },
    { t: "кладовая", x: 1620, y: 160 },
  ];
  for (let i = 0; i < labels.length; i += 1) {
    const p = worldToScreen(labels[i].x, labels[i].y);
    ctx.fillText(labels[i].t, p.x, p.y);
  }

  ctx.restore();

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    const s = worldToScreen(p.x, p.y);
    ctx.globalAlpha = Math.max(0, p.ttl);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const f = floaters[i];
    const s = worldToScreen(f.x, f.y);
    ctx.globalAlpha = Math.max(0, f.ttl);
    ctx.fillStyle = f.color;
    ctx.font = "700 16px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(f.text, s.x, s.y);
    ctx.globalAlpha = 1;
  }

  if (flash && flash.ttl > 0) {
    ctx.fillStyle = flash.color;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.fillStyle = "rgba(4, 6, 14, 0.55)";
  ctx.fillRect(0, 0, w, 70);
  ctx.fillRect(0, h - 64, w, 64);
}

function drawMinimap(state) {
  const mmW = 220;
  const mmH = 104;
  const x = window.innerWidth - mmW - 18;
  const y = 16;
  ctx.fillStyle = "rgba(8, 10, 22, 0.72)";
  ctx.fillRect(x, y, mmW, mmH);
  ctx.strokeStyle = "rgba(125, 211, 252, 0.4)";
  ctx.strokeRect(x, y, mmW, mmH);
  const sx = mmW / state.world.w;
  const sy = mmH / state.world.h;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(x, y, mmW, mmH);
  ctx.fillStyle = "rgba(190, 18, 60, 0.55)";
  ctx.fillRect(x, y, state.collapseX * sx, mmH);
  ctx.fillStyle = "#67e8f9";
  ctx.beginPath();
  ctx.arc(x + state.player.x * sx, y + state.player.y * sy, 3, 0, Math.PI * 2);
  ctx.fill();
  if (!state.cargo.held) {
    ctx.fillStyle = "#ffd166";
    ctx.fillRect(x + state.cargo.x * sx - 2, y + state.cargo.y * sy - 2, 5, 5);
  }
}

function ensurePreview() {
  if (!run) {
    run = Rules.createRun({ ghostPoints: [] });
  }
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  if (!started) {
    ensurePreview();
    const state = Rules.getPublicState(run);
    cam.x += (state.player.x - cam.x) * 0.08;
    cam.y += (state.player.y - cam.y) * 0.08;
    drawWorld(state);
    drawMinimap(state);
    requestAnimationFrame(tick);
    return;
  }

  const input = demo ? demoInput(dt) : inputFromKeys();
  const before = run.events.length;
  Rules.stepRun(run, input, dt);
  if (run.events.length > before) {
    react(run.lastEvent);
  }

  const state = Rules.getPublicState(run);
  cam.x += (state.player.x - cam.x) * Math.min(1, dt * 6);
  cam.y += (state.player.y - cam.y) * Math.min(1, dt * 6);
  if (shake > 0) {
    cam.x += (Math.random() - 0.5) * shake;
    cam.y += (Math.random() - 0.5) * shake;
    shake *= 0.86;
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.ttl -= dt;
    if (p.ttl <= 0) {
      particles.splice(i, 1);
    }
  }
  for (let i = floaters.length - 1; i >= 0; i -= 1) {
    const f = floaters[i];
    f.y += f.vy * dt;
    f.ttl -= dt;
    if (f.ttl <= 0) {
      floaters.splice(i, 1);
    }
  }
  if (flash) {
    flash.ttl -= dt;
    if (flash.ttl <= 0) {
      flash = null;
    }
  }

  if (Math.random() < dt * 8) {
    dust.push({
      x: state.player.x + (Math.random() - 0.5) * 900,
      y: state.player.y + (Math.random() - 0.5) * 500,
      ttl: 1.4,
    });
  }

  hud.trailFill.style.width = `${Math.round((state.trailLen / state.maxTrailLen) * 100)}%`;
  hud.cargo.textContent = state.cargo.held ? "груз у тебя — к выходу" : "груз в кладовой";
  hud.cargo.classList.toggle("held", state.cargo.held);
  if (state.closeHint) {
    hud.hint.textContent = state.closeHint.near
      ? "ещё чуть — замкнёшь контур"
      : "жёлтая точка — вернись туда и замкни";
  }

  drawWorld(state);
  drawMinimap(state);

  if (state.status !== "running") {
    started = false;
    if (state.status === "won") {
      showOverlay("Выход", "Дом отпустил. Следующий забег — чистый пол.", "Ещё забег");
    } else {
      const why =
        state.failReason === "collapse"
          ? "Отмирание съело вход, пока черта была открыта."
          : "Сгусток закрыл тебя. Обводи его, не стой в нём.";
      showOverlay("Забег оборван", `${why} Тень запомнит эту линию.`, "Снова");
    }
  }

  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space") {
    event.preventDefault();
  }
  if (!started && (event.code === "Enter" || event.code === "Space")) {
    startRun();
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
hud.overlayBtn.addEventListener("click", () => {
  startRun();
});
hud.selfCheckBtn.addEventListener("click", () => {
  const results = Rules.runSelfChecks();
  const failed = results.filter((item) => !item.ok);
  hud.selfCheckOut.textContent = results
    .map((item) => (item.ok ? `OK  ${item.name}` : `FAIL ${item.name}: ${item.error}`))
    .concat(failed.length ? `\nПровалено: ${failed.length}` : `\nВсе ${results.length} проверок прошли.`)
    .join("\n");
});

window.addEventListener("error", (event) => {
  if (hud.event) {
    hud.event.textContent = `ошибка: ${event.message}`;
  }
});
resize();
if (!demo) {
  hud.overlay.classList.add("show");
}
ensurePreview();
cam.x = run.player.x;
cam.y = run.player.y;
drawWorld(Rules.getPublicState(run));
drawMinimap(Rules.getPublicState(run));
requestAnimationFrame(tick);

if (demo) {
  startRun();
}
if (new URLSearchParams(window.location.search).has("selfcheck")) {
  const results = Rules.runSelfChecks();
  const failed = results.filter((item) => !item.ok);
  hud.selfCheckOut.textContent = results
    .map((item) => (item.ok ? `OK  ${item.name}` : `FAIL ${item.name}: ${item.error}`))
    .concat(failed.length ? `\nПровалено: ${failed.length}` : `\nВсе ${results.length} проверок прошли.`)
    .join("\n");
  document.body.dataset.selfcheck = failed.length ? "fail" : "ok";
}

window.ObvodApp = {
  startRun,
  getRun: () => run,
};

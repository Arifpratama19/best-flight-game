// main.js — Skyline Archipelago: boot, game loop, state machine (menu,
// flying, paused, ended), mission flow and the screenshot hooks.
// The game is a complete island flight game: ring courses, runway landings,
// fuel and hull management, rounds that get harder, and three missions.
import { createRenderer, renderScene, chaseCamera, spawnRingBurst, spawnSpray } from './render.js';
import { createPlane, resetPlane, stepFlight, headingDegrees } from './flight.js';
import { buildMission, nextRing, checkRingPass, checkStars, allRingsDone, ringsRemaining } from './missions.js';
import { terrainHeight, makeClouds, RUNWAYS, SEA_LEVEL } from './terrain.js';
import { createInput, attachInput, readControls, clearKeys } from './input.js';
import { createAudio, startAudio, updateEngineSound, playRingChime, playFuelChime, playLandingThud, playCrashSound, playClick, setMuted } from './audio.js';
import { updateHud, showMessage, showPopup, showScreen, showEndScreen } from './hud.js';
import { loadBest, saveBest, loadOverallBest } from './scores.js';

const canvas = document.getElementById('scene');
const renderer = createRenderer(canvas);
const plane = createPlane();
const input = createInput();
const audio = createAudio();
const clouds = makeClouds(46, 20261126);

const game = {
  phase: 'menu', // menu | flying | paused | ended
  missionId: 'ringrun',
  round: 1,
  state: null,
  cameraMode: 'chase',
  camSmooth: null,
  time: 0,
  elapsed: 0,
  muted: false,
  bestScore: 0,
  shake: 0,
  sprayTimer: 0,
};

function fitCanvas() {
  canvas.width = Math.floor(window.innerWidth * window.devicePixelRatio);
  canvas.height = Math.floor(window.innerHeight * window.devicePixelRatio);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

function currentObjective() {
  const s = game.state;
  if (!s) return '';
  if (!allRingsDone(s)) {
    const left = ringsRemaining(s);
    return `Fly through ring ${s.ringsHit + 1} of ${s.totalRings} — ${left} to go`;
  }
  const target = s.landingsDone === 0 ? s.landAt : s.secondLandAt;
  return target ? `All rings done — land on ${target.name}` : 'All rings done — land!';
}

function startMission(missionId, round = 1) {
  game.missionId = missionId;
  game.round = round;
  game.state = buildMission(missionId, round);
  game.state.totalRings = game.state.rings.filter((r) => !r.fuel).length;
  game.state.bestScore = Math.max(loadBest(missionId), loadOverallBest());
  game.state.objective = currentObjective();
  game.state.nextRing = nextRing(game.state);
  resetPlane(plane, game.state.mission.spawn);
  input.throttle = 0.55;
  game.camSmooth = null;
  game.elapsed = 0;
  game.shake = 0;
  game.sprayTimer = 0;
  game.phase = 'flying';
  showScreen(null);
  startAudio(audio);
  showMessage(`${game.state.mission.name} — ROUND ${round}`, 2.6);
}

function endGame(title, subtitle, rows, score) {
  game.phase = 'ended';
  const best = saveBest(game.missionId, score);
  game.bestScore = best;
  showEndScreen({ title, subtitle, rows, score, bestScore: best });
  updateEngineSound(audio, 0, 0, false);
}

function finishLanding() {
  const s = game.state;
  const smooth = Math.max(0, 100 - Math.abs(plane.verticalSpeed) * 8 - Math.abs(plane.pitch) * 60);
  const landingPoints = 400 + Math.round(smooth * 2) + Math.round(s.timeLeft * 2);
  s.landingScore += landingPoints;
  s.score += landingPoints;
  s.landingsDone += 1;
  playLandingThud(audio);
  showPopup(`LANDED +${landingPoints}`, 'score');
  if (s.landingsDone < s.landingsNeeded && s.secondLandAt) {
    // Island Hop: refuel, take off again for the second runway.
    plane.fuel = 100;
    plane.landed = false;
    plane.y = terrainHeight(plane.x, plane.z) + 4;
    plane.speed = 30;
    plane.throttle = 0.6;
    input.throttle = 0.6;
    s.objective = `Refuelled — now land on ${s.secondLandAt.name}`;
    showMessage(`LANDED! +${landingPoints} — refuelled, on to ${s.secondLandAt.name}`, 3);
    return;
  }
  const rows = [
    ['Rings flown', `${s.ringsHit} × up to 140+ pts`],
    ['Ring points', String(s.ringScore)],
    ['Bonus stars', `${s.starsHit} × 150 = ${s.starScore}`],
    ['Near misses', String(s.nearMissScore)],
    ['Best combo', s.bestCombo > 1 ? `×${s.bestCombo}` : '—'],
    ['Fuel rings', String(s.fuelRingsHit)],
    ['Landing bonus', String(s.landingScore)],
    ['Time left', `${Math.round(s.timeLeft)} s`],
    ['Round', String(s.round)],
  ];
  endGame(
    s.round > 1 || s.landingsDone > 1 ? 'MISSION COMPLETE!' : 'LANDED!',
    `You flew ${s.mission.name} and put her down on ${s.landAt.name}.`,
    rows,
    s.score,
  );
}

function finishCrash(reason) {
  const s = game.state;
  playCrashSound(audio);
  const rows = [
    ['Rings flown', `${s.ringsHit} / ${s.totalRings}`],
    ['Ring points', String(s.ringScore)],
    ['Fuel rings', String(s.fuelRingsHit)],
    ['Hull', '0% — wrecked'],
    ['Round', String(s.round)],
  ];
  endGame('CRASHED!', reason, rows, s.score);
}

function finishOutOfTime() {
  const s = game.state;
  const rows = [
    ['Rings flown', `${s.ringsHit} / ${s.totalRings}`],
    ['Ring points', String(s.ringScore)],
    ['Fuel rings', String(s.fuelRingsHit)],
    ['Time left', '0 s — out of time'],
    ['Round', String(s.round)],
  ];
  endGame('OUT OF TIME', 'The clock beat you this sortie. Fly faster through the rings.', rows, s.score);
}

function finishOutOfFuel() {
  const s = game.state;
  const rows = [
    ['Rings flown', `${s.ringsHit} / ${s.totalRings}`],
    ['Ring points', String(s.ringScore)],
    ['Fuel rings', String(s.fuelRingsHit)],
    ['Fuel', '0% — tanks dry'],
    ['Round', String(s.round)],
  ];
  endGame('OUT OF FUEL', 'The tanks ran dry. Green fuel rings and runway landings refuel you.', rows, s.score);
}

function step(dt) {
  game.time += dt;
  game.shake = Math.max(0, game.shake - dt * 1.6);
  if (game.phase !== 'flying') return;
  const s = game.state;
  game.elapsed += dt;
  s.timeLeft -= dt;
  s.comboTimer = Math.max(0, s.comboTimer - dt);
  if (s.comboTimer <= 0) s.combo = 0;
  if (s.timeLeft <= 0) { s.timeLeft = 0; finishOutOfTime(); return; }
  if (plane.fuel <= 0 && !plane.landed) { finishOutOfFuel(); return; }

  const controls = readControls(input, dt);
  const event = stepFlight(plane, controls, s.wind, dt);
  // Hard banking rattles the camera a little; impacts rattle it a lot.
  if (Math.abs(plane.roll) > 0.85) game.shake = Math.max(game.shake, 0.25);
  if (event === 'landed') {
    if (allRingsDone(s)) { finishLanding(); return; }
    // Landed early: refuel and take off again, rings still waiting.
    plane.fuel = 100;
    plane.landed = false;
    plane.y = terrainHeight(plane.x, plane.z) + 4;
    plane.speed = 28;
    showMessage('LANDED EARLY — refuelled! Rings still waiting.', 3);
  } else if (event === 'crashed') {
    game.shake = 1;
    finishCrash('You hit the ground too hard. Mind your descent rate and speed.');
    return;
  } else if (event === 'impact') {
    game.shake = 0.9;
    playCrashSound(audio);
    showMessage(`HARD HIT! Hull ${Math.round(plane.hull)}%`, 1.6);
  } else if (event === 'scrape') {
    game.shake = 0.5;
    showMessage(`Scraped the ground — hull ${Math.round(plane.hull)}%`, 1.4);
  }

  // Low over the sea: spray kicks up behind the plane.
  if (plane.y < 7 && terrainHeight(plane.x, plane.z) < SEA_LEVEL + 0.5) {
    game.sprayTimer -= dt;
    if (game.sprayTimer <= 0) {
      game.sprayTimer = 0.12;
      spawnSpray(plane.x, SEA_LEVEL + 0.5, plane.z);
    }
  }

  const res = checkRingPass(s, plane);
  if (res.points > 0) {
    const ring = s.rings.find((r) => r.passed && !r.counted);
    if (res.kind === 'fuel') {
      playFuelChime(audio);
      if (ring) { spawnRingBurst(ring, true); ring.counted = true; }
      showPopup(`+${res.points}`, 'fuel');
      showMessage(`FUEL RING! +${res.points} — tanks topped up`, 1.8);
    } else if (res.kind === 'near') {
      showPopup('NEAR MISS +20', 'near');
      showMessage('NEAR MISS! +20 — thread it next time', 1.4);
    } else {
      playRingChime(audio);
      if (ring) { spawnRingBurst(ring, false); ring.counted = true; }
      showPopup(s.combo > 1 ? `+${res.points}  COMBO ×${s.combo}` : `+${res.points}`, 'score');
      showMessage(s.combo > 1 ? `RING! +${res.points} — COMBO ×${s.combo}` : `RING! +${res.points}`, 1.6);
    }
  }
  const star = checkStars(s, plane);
  if (star.points > 0) {
    playFuelChime(audio);
    if (star.star) spawnRingBurst({ x: star.star.x, y: star.star.y, z: star.star.z, radius: 8 }, false);
    showPopup('★ +150', 'star');
    showMessage('BONUS STAR! +150', 1.6);
  }
  s.nextRing = nextRing(s);
  s.objective = currentObjective();
  updateEngineSound(audio, plane.throttle, plane.speed, true);
}

function draw() {
  document.getElementById('stage').classList.toggle('cockpit-mode', game.cameraMode === 'cockpit' && game.phase === 'flying');
  const cam = chaseCamera(plane, game.cameraMode, game.camSmooth);
  game.camSmooth = cam;
  renderScene(renderer, {
    plane,
    cam,
    clouds,
    rings: game.state ? game.state.rings : [],
    stars: game.state ? game.state.stars : [],
    nextRing: game.state ? game.state.nextRing : null,
    time: game.time,
    cameraMode: game.cameraMode,
    timeOfDay: game.state ? game.state.mission.timeOfDay : 'sunset',
    shake: game.shake,
  });
  if (game.phase === 'flying' && game.state) updateHud(plane, game.state);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  draw();
  requestAnimationFrame(loop);
}

// ---- Menu wiring ----
document.querySelectorAll('.mission-card').forEach((card) => {
  card.addEventListener('click', () => {
    playClick(audio);
    startAudio(audio);
    startMission(card.dataset.mission, 1);
  });
});
document.getElementById('resume-btn').addEventListener('click', () => {
  game.phase = 'flying';
  showScreen(null);
});
document.getElementById('quit-btn').addEventListener('click', () => {
  game.phase = 'menu';
  document.getElementById('start-best').textContent = String(loadOverallBest());
  showScreen('start-screen');
});
document.getElementById('again-btn').addEventListener('click', () => {
  playClick(audio);
  // Next round if the last sortie ended well, otherwise retry the same round.
  const won = game.state && game.state.landingsDone >= game.state.landingsNeeded;
  startMission(game.missionId, won ? game.round + 1 : game.round);
});
document.getElementById('menu-btn').addEventListener('click', () => {
  game.phase = 'menu';
  document.getElementById('start-best').textContent = String(loadOverallBest());
  showScreen('start-screen');
});

attachInput(input, canvas, {
  onPause: () => {
    if (game.phase === 'flying') { game.phase = 'paused'; showScreen('pause-screen'); }
    else if (game.phase === 'paused') { game.phase = 'flying'; showScreen(null); }
  },
  onRestart: () => {
    if (game.phase === 'flying' || game.phase === 'ended' || game.phase === 'paused') startMission(game.missionId, game.round);
  },
  onMute: () => {
    game.muted = !game.muted;
    setMuted(audio, game.muted);
    showMessage(game.muted ? 'Sound off' : 'Sound on', 1.2);
  },
  onCamera: () => {
    game.cameraMode = game.cameraMode === 'chase' ? 'cockpit' : 'chase';
    game.camSmooth = null;
    showMessage(game.cameraMode === 'chase' ? 'Chase camera' : 'Cockpit camera', 1.2);
  },
  onConfirm: () => {
    if (game.phase === 'menu') startMission('ringrun', 1);
    else if (game.phase === 'ended') document.getElementById('again-btn').click();
  },
});

document.getElementById('start-best').textContent = String(loadOverallBest());
showScreen('start-screen');

// ---- Screenshot / test hooks: auto-start a photogenic in-flight moment ----
// ?shot=ring    — flying toward the first ring, chase view
// ?shot=runway  — on final approach to Coral Runway
// ?shot=cockpit — cockpit view mid-flight toward a ring
// ?shot=storm   — Storm Courier in the rain, toward a ring
// ?shot=slalom  — Sunset Slalom, low through the gates
// ?shot=menu    — the start screen
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot === 'ring' || shot === 'cockpit' || shot === 'runway' || shot === 'storm' || shot === 'slalom') {
  const mission = shot === 'storm' ? 'stormcourier' : shot === 'slalom' ? 'slalom' : 'ringrun';
  startMission(mission, 1);
  const s = game.state;
  if (shot === 'cockpit') {
    game.cameraMode = 'cockpit';
    plane.x = -30; plane.y = 42; plane.z = 560; plane.heading = 0.05; plane.speed = 44;
  } else if (shot === 'ring' || shot === 'storm' || shot === 'slalom') {
    const ring = s.rings[0];
    plane.x = ring.x - 60; plane.y = ring.y + 6; plane.z = ring.z - 260;
    plane.heading = Math.atan2(ring.x - plane.x, ring.z - plane.z);
    plane.speed = 46; plane.throttle = 0.7; input.throttle = 0.7;
  } else {
    const runway = RUNWAYS[0];
    plane.x = runway.x + 40; plane.y = 46; plane.z = runway.z - 420;
    plane.heading = Math.atan2(runway.x - plane.x, runway.z - plane.z);
    plane.speed = 40; plane.throttle = 0.45; input.throttle = 0.45;
  }
  game.camSmooth = null;
  // Let the camera settle behind the plane before the screenshot is taken.
  for (let i = 0; i < 40; i++) { game.camSmooth = chaseCamera(plane, game.cameraMode, game.camSmooth); }
}

// Test hooks for automated play-testing (not part of the visible game).
window.__flight = {
  game,
  plane,
  startMission,
  headingDegrees: () => headingDegrees(plane),
  groundAt: (x, z) => terrainHeight(x, z),
  setPlane: (patch) => Object.assign(plane, patch),
  state: () => ({ phase: game.phase, score: game.state?.score ?? 0, ringsHit: game.state?.ringsHit ?? 0, fuel: plane.fuel, hull: plane.hull, x: plane.x, y: plane.y, z: plane.z, speed: plane.speed, combo: game.state?.combo ?? 0, starsHit: game.state?.starsHit ?? 0, nextRing: game.state?.nextRing ? { x: game.state.nextRing.x, y: game.state.nextRing.y, z: game.state.nextRing.z } : null, landAt: game.state?.landAt ? { x: game.state.landAt.x, z: game.state.landAt.z, name: game.state.landAt.name } : null }),
};

requestAnimationFrame(loop);

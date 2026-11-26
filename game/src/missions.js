// missions.js — the four sorties, their ring courses, runways, winds and
// difficulty ramps. Completing a mission starts the next round, harder.
// Scoring depth: chained rings build a combo multiplier, a near miss on a
// ring still pays a little, and golden stars off the racing line are worth
// a detour.
import { RUNWAYS } from './terrain.js';

export const MISSIONS = {
  ringrun: {
    id: 'ringrun',
    name: 'SUNSET RING RUN',
    short: 'Ring Run',
    description: '6 glowing rings, then land on Coral Runway.',
    ringCount: 6,
    timeLimit: 240,
    windBase: 0,
    fuelRings: 1,
    landAt: 'coral',
    timeOfDay: 'sunset',
    spawn: { x: 0, y: 34, z: 180, heading: 0, speed: 34 },
  },
  islandhop: {
    id: 'islandhop',
    name: 'ISLAND HOP',
    short: 'Island Hop',
    description: 'Land at two island runways, rings between them.',
    ringCount: 5,
    timeLimit: 360,
    windBase: 2,
    fuelRings: 2,
    landAt: 'palm',
    secondLandAt: 'sunset',
    timeOfDay: 'morning',
    spawn: { x: 0, y: 34, z: 180, heading: 0, speed: 34 },
  },
  stormcourier: {
    id: 'stormcourier',
    name: 'STORM COURIER',
    short: 'Storm Courier',
    description: '8 tight rings in a crosswind, against the clock.',
    ringCount: 8,
    timeLimit: 200,
    windBase: 6,
    fuelRings: 2,
    landAt: 'sunset',
    timeOfDay: 'storm',
    spawn: { x: 0, y: 40, z: 180, heading: 0, speed: 40 },
  },
  slalom: {
    id: 'slalom',
    name: 'SUNSET SLALOM',
    short: 'Slalom',
    description: '10 tight gates, low and fast. Chain them — combos pay double.',
    ringCount: 10,
    timeLimit: 170,
    windBase: 1,
    fuelRings: 1,
    landAt: 'coral',
    timeOfDay: 'sunset',
    spawn: { x: 0, y: 30, z: 180, heading: 0, speed: 40 },
  },
};

function ringPath(mission, round) {
  // A winding path down the course: rings alternate sides, climb and dip.
  const rings = [];
  const n = mission.ringCount + Math.min(3, round - 1);
  const startZ = 700;
  const stepZ = Math.min(560, (4300 - startZ) / Math.max(1, n - 1));
  const tight = mission.id === 'slalom';
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const sway = side * (tight ? 60 + ((i * 41) % 70) : 90 + ((i * 37) % 90));
    // Slalom gates fly low but stay above the island crests on the line.
    const altitude = tight ? 36 + ((i * 31) % 28) : 30 + ((i * 53) % 55);
    rings.push({
      x: sway,
      y: altitude,
      z: startZ + i * stepZ,
      radius: Math.max(10, (tight ? 14 : 17) - round * 1.2 - (mission.id === 'stormcourier' ? 2 : 0)),
      fuel: false,
      passed: false,
    });
  }
  // Fuel rings sit between regular rings, low and green.
  for (let f = 0; f < mission.fuelRings; f++) {
    const idx = 1 + f * 2;
    if (idx < rings.length) {
      rings.splice(idx, 0, {
        x: rings[idx].x * 0.3,
        y: 26,
        z: rings[idx].z - stepZ / 2,
        radius: 14,
        fuel: true,
        passed: false,
      });
    }
  }
  return rings;
}

function starField(mission, rings) {
  // Golden bonus stars, deliberately off the racing line: a detour that
  // pays 150 points each. Slalom hides them between the gates.
  const stars = [];
  const count = mission.id === 'slalom' ? 6 : 5;
  for (let i = 0; i < count; i++) {
    const base = rings[Math.min(rings.length - 1, 1 + i * 2)] ?? { x: 0, y: 40, z: 900 + i * 600 };
    const side = i % 2 === 0 ? 1 : -1;
    stars.push({
      x: base.x + side * 95,
      y: Math.max(18, base.y + 14 - (i % 3) * 8),
      z: base.z + 130,
      taken: false,
    });
  }
  return stars;
}

export function buildMission(missionId, round) {
  const mission = MISSIONS[missionId] ?? MISSIONS.ringrun;
  const rings = ringPath(mission, round);
  const windStrength = mission.windBase + (round - 1) * 1.5;
  const windAngle = mission.id === 'stormcourier' ? 1.1 : 0.5;
  return {
    mission,
    round,
    rings,
    stars: starField(mission, rings),
    ringIndex: 0,
    ringsHit: 0,
    fuelRingsHit: 0,
    starsHit: 0,
    timeLeft: mission.timeLimit - (round - 1) * 12,
    timeLimit: mission.timeLimit,
    wind: { x: Math.sin(windAngle) * windStrength, z: Math.cos(windAngle) * windStrength * 0.3 },
    windStrength,
    landAt: RUNWAYS.find((r) => r.id === mission.landAt),
    secondLandAt: mission.secondLandAt ? RUNWAYS.find((r) => r.id === mission.secondLandAt) : null,
    landingsDone: 0,
    landingsNeeded: mission.secondLandAt ? 2 : 1,
    score: 0,
    ringScore: 0,
    starScore: 0,
    nearMissScore: 0,
    landingScore: 0,
    timeBonus: 0,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
  };
}

export function nextRing(state) {
  for (const ring of state.rings) if (!ring.passed) return ring;
  return null;
}

export function ringsRemaining(state) {
  return state.rings.filter((r) => !r.passed && !r.fuel).length;
}

// Check the plane against the next unpassed ring.
// Returns { points, kind } — kind is 'ring', 'fuel', 'near' or 'none'.
// A ring passed within 15 s of the previous one extends the combo: each
// chained ring pays +25% (up to double). Brushing the rim of a ring —
// crossing its plane just outside it — pays a 20-point near miss.
export function checkRingPass(state, plane) {
  const ring = nextRing(state);
  if (!ring) return { points: 0, kind: 'none' };
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  // The ring is a vertical disc facing the course; pass when crossing its plane.
  if (Math.abs(dz) > 9) return { points: 0, kind: 'none' };
  const radial = Math.hypot(dx, dy);
  if (radial > ring.radius) {
    if (radial <= ring.radius + 10 && !ring.nearMissed) {
      ring.nearMissed = true;
      state.nearMissScore += 20;
      state.score += 20;
      return { points: 20, kind: 'near' };
    }
    return { points: 0, kind: 'none' };
  }
  ring.passed = true;
  const centreBonus = Math.max(0, Math.round((1 - radial / ring.radius) * 40));
  if (ring.fuel) {
    state.fuelRingsHit += 1;
    plane.fuel = Math.min(100, plane.fuel + 35);
    state.score += 50;
    return { points: 50, kind: 'fuel' };
  }
  state.ringsHit += 1;
  state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
  state.comboTimer = 15;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const mult = Math.min(2, 1 + 0.25 * (state.combo - 1));
  const timeBonus = Math.max(0, Math.round(state.timeLeft / 6));
  const points = Math.round((100 + centreBonus + timeBonus) * mult);
  state.ringScore += points;
  state.score += points;
  return { points, kind: 'ring' };
}

// Golden stars: fly within 10 m to collect 150 points each.
export function checkStars(state, plane) {
  for (const star of state.stars) {
    if (star.taken) continue;
    const d = Math.hypot(star.x - plane.x, star.y - plane.y, star.z - plane.z);
    if (d < 11) {
      star.taken = true;
      state.starsHit += 1;
      state.starScore += 150;
      state.score += 150;
      return { points: 150, star };
    }
  }
  return { points: 0, star: null };
}

export function allRingsDone(state) {
  return state.rings.filter((r) => !r.fuel).every((r) => r.passed);
}

export function windLabel(state) {
  if (state.windStrength < 1) return 'calm';
  if (state.windStrength < 4) return `breeze ${state.windStrength.toFixed(0)} m/s`;
  if (state.windStrength < 7) return `crosswind ${state.windStrength.toFixed(0)} m/s`;
  return `gale ${state.windStrength.toFixed(0)} m/s`;
}

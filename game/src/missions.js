// missions.js — the three sorties, their ring courses, runways, winds and
// difficulty ramps. Completing a mission starts the next round, harder.
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
    spawn: { x: 0, y: 40, z: 180, heading: 0, speed: 40 },
  },
};

function ringPath(mission, round) {
  // A winding path down the course: rings alternate sides, climb and dip.
  const rings = [];
  const n = mission.ringCount + Math.min(3, round - 1);
  const startZ = 700;
  const stepZ = Math.min(560, (4300 - startZ) / Math.max(1, n - 1));
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const sway = side * (90 + ((i * 37) % 90));
    const altitude = 30 + ((i * 53) % 55);
    rings.push({
      x: sway,
      y: altitude,
      z: startZ + i * stepZ,
      radius: Math.max(11, 17 - round * 1.2 - (mission.id === 'stormcourier' ? 2 : 0)),
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

export function buildMission(missionId, round) {
  const mission = MISSIONS[missionId] ?? MISSIONS.ringrun;
  const rings = ringPath(mission, round);
  const windStrength = mission.windBase + (round - 1) * 1.5;
  const windAngle = mission.id === 'stormcourier' ? 1.1 : 0.5;
  return {
    mission,
    round,
    rings,
    ringIndex: 0,
    ringsHit: 0,
    fuelRingsHit: 0,
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
    landingScore: 0,
    timeBonus: 0,
  };
}

export function nextRing(state) {
  for (const ring of state.rings) if (!ring.passed) return ring;
  return null;
}

export function ringsRemaining(state) {
  return state.rings.filter((r) => !r.passed && !r.fuel).length;
}

// Check the plane against the next unpassed ring. Returns points or 0.
export function checkRingPass(state, plane) {
  const ring = nextRing(state);
  if (!ring) return 0;
  const dx = plane.x - ring.x;
  const dy = plane.y - ring.y;
  const dz = plane.z - ring.z;
  // The ring is a vertical disc facing the course; pass when crossing its plane.
  if (Math.abs(dz) > 9) return 0;
  const radial = Math.hypot(dx, dy);
  if (radial > ring.radius) return 0;
  ring.passed = true;
  const centreBonus = Math.max(0, Math.round((1 - radial / ring.radius) * 40));
  if (ring.fuel) {
    state.fuelRingsHit += 1;
    plane.fuel = Math.min(100, plane.fuel + 35);
    state.score += 50;
    return 50;
  }
  state.ringsHit += 1;
  const timeBonus = Math.max(0, Math.round(state.timeLeft / 6));
  const points = 100 + centreBonus + timeBonus;
  state.ringScore += points;
  state.score += points;
  return points;
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

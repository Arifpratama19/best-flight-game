// terrain.js — procedural island archipelago: seeded value noise, island
// bumps, a sea level, and two flattened runways. Pure functions, no DOM.
export const SEA_LEVEL = 0;
export const WORLD_LENGTH = 5200;

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smooth(x - ix);
  const fz = smooth(z - iz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function fbm(x, z, seed) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < 4; o++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + o * 101);
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / 1.875;
}

// Island centres: [x, z, radius, peakHeight]. The course runs down +z.
export const ISLANDS = [
  { x: -280, z: 420, r: 220, h: 42 },
  { x: 190, z: 900, r: 300, h: 62 },
  { x: -210, z: 1300, r: 280, h: 38 },
  { x: 60, z: 1750, r: 340, h: 78 },
  { x: -360, z: 2100, r: 240, h: 48 },
  { x: 220, z: 2700, r: 320, h: 66 },
  { x: -60, z: 3200, r: 300, h: 44 },
  { x: 180, z: 3700, r: 340, h: 80 },
  { x: -200, z: 4200, r: 300, h: 58 },
  { x: 40, z: 4700, r: 360, h: 70 },
  { x: -320, z: 800, r: 200, h: 30 },
  { x: 330, z: 2000, r: 210, h: 34 },
  { x: -340, z: 3100, r: 200, h: 28 },
  { x: 340, z: 4300, r: 220, h: 36 },
];

// Runways sit on flattened ground. heading is the runway direction (radians).
export const RUNWAYS = [
  { id: 'coral', name: 'Coral Runway', x: 0, z: 620, heading: 0, length: 340, width: 30, altitude: 3 },
  { id: 'palm', name: 'Palm Runway', x: -140, z: 2450, heading: 0.35, length: 320, width: 30, altitude: 3 },
  { id: 'sunset', name: 'Sunset Runway', x: 120, z: 4400, heading: -0.3, length: 340, width: 30, altitude: 3 },
];

function runwayBlend(x, z) {
  let best = 0;
  for (const r of RUNWAYS) {
    const dx = x - r.x;
    const dz = z - r.z;
    const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    if (Math.abs(along) < r.length / 2 + 90 && Math.abs(across) < r.width / 2 + 60) {
      const edge = Math.max(
        Math.abs(along) / (r.length / 2 + 90),
        Math.abs(across) / (r.width / 2 + 60),
      );
      best = Math.max(best, 1 - smooth(Math.max(0, Math.min(1, (edge - 0.45) / 0.55))));
    }
  }
  return best;
}

export function terrainHeight(x, z) {
  let h = -6;
  for (const isl of ISLANDS) {
    const dx = (x - isl.x) / isl.r;
    const dz = (z - isl.z) / isl.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1.6) {
      const fall = Math.exp(-d2 * 2.2);
      h += isl.h * fall;
    }
  }
  const n = fbm(x * 0.004 + 7.3, z * 0.004 + 2.9, 41);
  h += (n - 0.5) * 26 * Math.max(0, Math.min(1, (h + 6) / 30));
  const blend = runwayBlend(x, z);
  if (blend > 0) h = h * (1 - blend) + RUNWAYS[0].altitude * blend;
  return h;
}

export function groundColor(height, x, z) {
  if (height < 1.2) return '#e8d49a'; // beach sand
  if (height < 6) return '#8fb573'; // low grass
  if (height < 18) {
    const n = valueNoise(x * 0.02, z * 0.02, 7);
    return n > 0.55 ? '#3f7a44' : '#5d9a52'; // forest / meadow
  }
  if (height < 34) return '#6f7f5e'; // scrub
  if (height < 52) return '#8a8378'; // rock
  return '#e9edf2'; // snowy peaks
}

export function shadeColor(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `rgb(${r},${g},${b})`;
}

// Is a point over a runway strip (for landing checks)? Returns the runway or null.
export function runwayAt(x, z) {
  for (const r of RUNWAYS) {
    const dx = x - r.x;
    const dz = z - r.z;
    const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    if (Math.abs(along) < r.length / 2 && Math.abs(across) < r.width / 2) return r;
  }
  return null;
}

// Deterministic cloud puffs scattered over the course.
export function makeClouds(count, seed) {
  const clouds = [];
  let s = seed;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    clouds.push({
      x: (rnd() - 0.5) * 1400,
      y: 95 + rnd() * 90,
      z: 150 + rnd() * WORLD_LENGTH,
      size: 26 + rnd() * 42,
    });
  }
  return clouds;
}

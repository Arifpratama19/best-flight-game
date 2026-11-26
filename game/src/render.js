// render.js — the chase / cockpit view: a small 3D projector, procedural sky,
// sea, island terrain, runways, glowing rings and a hand-drawn prop plane.
// Everything is drawn on one 2D canvas; no images, no network.
//
// Visual upgrades: per-mission palettes (sunset / morning / storm), a low
// sun with a shimmering reflection streak on the water, height-and-slope
// shaded terrain with distant haze, layered clouds with soft shading,
// a bigger shaded plane with spinning prop, wingtip trails, speed lines,
// ring-burst particles, rain, low-altitude spray and camera shake.
import { terrainHeight, groundColor, shadeColor, mixColor, RUNWAYS, SEA_LEVEL } from './terrain.js';

const FOCAL = 620;

// Sky / sea / light palettes per time of day. The sun sits low at sunset so
// its reflection streak reads across the water; high and pale by morning;
// gone behind storm cloud in the courier mission.
const PALETTES = {
  sunset: {
    skyTop: '#2b3a6e', skyMid: '#7a6bb0', skyLow: '#ff9a5c', skyHorizon: '#ffc46b',
    seaTop: '#2f7fa8', seaMid: '#1d5f86', seaDeep: '#123f5e',
    sun: '#fff3c4', sunGlow: '255, 190, 100', sunX: 0.68, sunY: 130,
    haze: [255, 170, 110], cloudTop: '255,255,255', cloudShade: '214, 178, 205',
    cloudAlpha: 0.85, rain: false,
  },
  morning: {
    skyTop: '#2f6fc4', skyMid: '#6fb2e8', skyLow: '#bfe3f7', skyHorizon: '#e8f4fb',
    seaTop: '#2e8fb5', seaMid: '#1c6f96', seaDeep: '#14506e',
    sun: '#fffbe8', sunGlow: '255, 244, 190', sunX: 0.24, sunY: 210,
    haze: [190, 220, 240], cloudTop: '255,255,255', cloudShade: '196, 214, 232',
    cloudAlpha: 0.9, rain: false,
  },
  storm: {
    skyTop: '#232c3d', skyMid: '#3d4a5e', skyLow: '#5c6675', skyHorizon: '#8a8f96',
    seaTop: '#2c4a58', seaMid: '#1e3742', seaDeep: '#12242e',
    sun: '#d8dee6', sunGlow: '180, 190, 205', sunX: 0.7, sunY: 90,
    haze: [120, 128, 138], cloudTop: '96,104,118', cloudShade: '58, 64, 76',
    cloudAlpha: 0.92, rain: true,
  },
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return { canvas, ctx, focal: FOCAL };
}

function project(renderer, cam, point) {
  const dx = point.x - cam.x;
  const dy = point.y - cam.y;
  const dz = point.z - cam.z;
  // Yaw (heading), then pitch, then roll.
  const ch = Math.cos(-cam.heading);
  const sh = Math.sin(-cam.heading);
  let rx = dx * ch - dz * sh;
  let rz = dx * sh + dz * ch;
  let ry = dy;
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const ry2 = ry * cp - rz * sp;
  const rz2 = ry * sp + rz * cp;
  ry = ry2; rz = rz2;
  const cr = Math.cos(cam.roll);
  const sr = Math.sin(cam.roll);
  const rx2 = rx * cr - ry * sr;
  const ry3 = rx * sr + ry * cr;
  rx = rx2; ry = ry3;
  if (rz < 4) return null;
  const w = renderer.canvas.width;
  const h = renderer.canvas.height;
  const scale = renderer.focal / rz;
  return {
    x: w / 2 + rx * scale,
    y: h * 0.52 - ry * scale,
    depth: rz,
    scale,
  };
}

// ---- Particles: ring bursts, spray, rain splash. World-space, projected
// each frame, so they sit correctly in the 3D scene. ----
const particles = [];
let lastTime = 0;

export function spawnRingBurst(ring, fuel) {
  const color = fuel ? '90, 255, 140' : '255, 201, 60';
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * ring.radius * 0.9;
    particles.push({
      x: ring.x + Math.cos(a) * r,
      y: ring.y + Math.sin(a) * r,
      z: ring.z + (Math.random() - 0.5) * 6,
      vx: Math.cos(a) * 14, vy: Math.sin(a) * 14, vz: 6 + Math.random() * 10,
      life: 1, decay: 0.65 + Math.random() * 0.7, size: 1.8 + Math.random() * 2.8,
      color,
    });
  }
  // A few bright core sparks.
  for (let i = 0; i < 10; i++) {
    particles.push({
      x: ring.x, y: ring.y, z: ring.z,
      vx: (Math.random() - 0.5) * 26, vy: (Math.random() - 0.5) * 26, vz: 10 + Math.random() * 14,
      life: 1, decay: 1.0 + Math.random() * 0.8, size: 2.4 + Math.random() * 2,
      color: '255, 255, 240',
    });
  }
}

export function spawnSpray(x, y, z) {
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 8, y: y + Math.random() * 1.5, z: z + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 6, vy: 4 + Math.random() * 7, vz: -8 - Math.random() * 8,
      life: 1, decay: 1.8 + Math.random(), size: 1.8 + Math.random() * 2.4,
      color: '235, 245, 255',
    });
  }
}

function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= p.decay * dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vy -= 6 * dt;
  }
  if (particles.length > 500) particles.splice(0, particles.length - 500);
}

function drawParticles(renderer, cam) {
  const { ctx } = renderer;
  for (const p of particles) {
    const pr = project(renderer, cam, p);
    if (!pr) continue;
    // Cap the on-screen size and fade particles right in front of the
    // camera — a burst the plane just flew through must not fill the frame.
    const r = Math.min(22, Math.max(1, p.size * pr.scale * 0.9));
    const nearFade = Math.min(1, pr.depth / 30);
    ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.life) * 0.9 * nearFade})`;
    ctx.beginPath();
    ctx.arc(pr.x, pr.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSky(renderer, cam, pal, time) {
  const { ctx, canvas } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  const horizonY = h * 0.52 + Math.tan(cam.pitch) * FOCAL + cam.roll * 40;
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(0, horizonY));
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.45, pal.skyMid);
  sky.addColorStop(0.8, pal.skyLow);
  sky.addColorStop(1, pal.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, Math.max(0, horizonY + 2));
  // Sun: low, big, with a wide warm glare.
  const sunX = w * pal.sunX;
  const sunY = Math.max(36, horizonY - pal.sunY);
  const glowR = pal.rain ? 90 : 170;
  const glow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, glowR);
  glow.addColorStop(0, `rgba(${pal.sunGlow}, 0.95)`);
  glow.addColorStop(0.3, `rgba(${pal.sunGlow}, 0.5)`);
  glow.addColorStop(1, `rgba(${pal.sunGlow}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - glowR - 10, sunY - glowR - 10, (glowR + 10) * 2, (glowR + 10) * 2);
  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(sunX, sunY, pal.rain ? 22 : 34, 0, Math.PI * 2);
  ctx.fill();
  // Sea below the horizon.
  const sea = ctx.createLinearGradient(0, horizonY, 0, h);
  sea.addColorStop(0, pal.seaTop);
  sea.addColorStop(0.25, pal.seaMid);
  sea.addColorStop(1, pal.seaDeep);
  ctx.fillStyle = sea;
  ctx.fillRect(0, Math.max(0, horizonY), w, h - Math.max(0, horizonY));
  // Sun reflection: a shimmering vertical streak on the water under the sun.
  if (!pal.rain) {
    const streakW = 150;
    const top = Math.max(0, horizonY + 4);
    const rows = 26;
    for (let i = 0; i < rows; i++) {
      const t = i / rows;
      const y = top + t * (h - top);
      const wob = Math.sin(time * 1.7 + i * 1.9) * 26 * (0.4 + t);
      const ww = streakW * (0.35 + t * 0.9);
      const alpha = (1 - t) * 0.34 * (0.6 + 0.4 * Math.sin(time * 2.3 + i * 2.7));
      ctx.fillStyle = `rgba(255, 205, 120, ${Math.max(0, alpha)})`;
      ctx.fillRect(sunX - ww / 2 + wob, y, ww, 3 + t * 4);
    }
  }
  return horizonY;
}

function drawClouds(renderer, cam, clouds, pal) {
  const { ctx } = renderer;
  const projected = [];
  for (const c of clouds) {
    const p = project(renderer, cam, c);
    if (!p) continue;
    projected.push({ ...c, ...p });
  }
  projected.sort((a, b) => b.depth - a.depth);
  for (const c of projected) {
    // Cap the size and fade clouds that drift right over the camera, so a
    // close cloud never swallows the frame.
    const r = Math.min(240, Math.max(4, c.size * c.scale * 0.9));
    const nearFade = Math.min(1, c.depth / 80);
    // Far clouds fade into the haze.
    const hazeFade = Math.max(0.25, 1 - c.depth / 1400);
    const top = `rgba(${pal.cloudTop}, ${pal.cloudAlpha * hazeFade * nearFade})`;
    const shade = `rgba(${pal.cloudShade}, ${pal.cloudAlpha * 0.85 * hazeFade * nearFade})`;
    // Soft shaded underside first, then the lit top — layered, not flat.
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y + r * 0.16, r * 1.05, r * 0.4, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - r * 0.55, c.y + r * 0.2, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + r * 0.55, c.y + r * 0.18, r * 0.65, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - r * 0.55, c.y + r * 0.06, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + r * 0.55, c.y + r * 0.04, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain(renderer, cam, plane, pal) {
  const { ctx } = renderer;
  const cell = 40;
  const ahead = 560;
  const side = 420;
  const z0 = Math.max(0, Math.floor((plane.z - 80) / cell) * cell);
  const x0 = Math.floor((plane.x - side) / cell) * cell;
  const quads = [];
  for (let iz = 0; iz < ahead / cell; iz++) {
    for (let ix = 0; ix < (side * 2) / cell; ix++) {
      const x = x0 + ix * cell;
      const z = z0 + iz * cell;
      const corners = [
        { x, y: terrainHeight(x, z), z },
        { x: x + cell, y: terrainHeight(x + cell, z), z },
        { x: x + cell, y: terrainHeight(x + cell, z + cell), z: z + cell },
        { x, y: terrainHeight(x, z + cell), z: z + cell },
      ];
      const pts = corners.map((c) => project(renderer, cam, c));
      if (pts.some((p) => p === null)) continue;
      const depth = (corners[0].z + corners[2].z) / 2 - plane.z;
      const avgH = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      if (avgH < SEA_LEVEL + 0.4 && depth > 60) continue; // open sea: the sea fill shows
      // Slope shading: faces tilted away from the low sun read darker, so
      // hills get real relief instead of one flat green.
      const slopeX = (corners[1].y - corners[0].y) / cell;
      const slopeZ = (corners[3].y - corners[0].y) / cell;
      let shade = 0.86 + 0.16 * Math.max(-1, Math.min(1, (slopeZ * 1.4 - slopeX * 0.9)));
      shade = Math.max(0.62, Math.min(1.12, shade));
      let color = shadeColor(groundColor(avgH, x, z), shade);
      // Distant haze: far ground melts into the sky colour.
      const hazeT = Math.max(0, Math.min(0.72, (depth - 260) / 900));
      if (hazeT > 0) color = mixColor(color, pal.haze, hazeT);
      quads.push({ pts, depth, color });
    }
  }
  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.moveTo(q.pts[0].x, q.pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.pts[i].x, q.pts[i].y);
    ctx.closePath();
    ctx.fill();
  }
  // Far pass: coarse cells out to the horizon so distant islands read.
  const farCell = 140;
  const farQuads = [];
  for (let iz = 0; iz < 7; iz++) {
    for (let ix = 0; ix < 10; ix++) {
      const x = Math.floor((plane.x - 700) / farCell) * farCell + ix * farCell;
      const z = z0 + ahead + iz * farCell;
      const corners = [
        { x, y: terrainHeight(x, z), z },
        { x: x + farCell, y: terrainHeight(x + farCell, z), z },
        { x: x + farCell, y: terrainHeight(x + farCell, z + farCell), z: z + farCell },
        { x, y: terrainHeight(x, z + farCell), z: z + farCell },
      ];
      const avgH = (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4;
      if (avgH < SEA_LEVEL + 0.4) continue;
      const pts = corners.map((c) => project(renderer, cam, c));
      if (pts.some((p) => p === null)) continue;
      const depth = z - plane.z;
      const hazeT = Math.max(0, Math.min(0.8, (depth - 200) / 900));
      farQuads.push({ pts, depth, color: mixColor(shadeColor(groundColor(avgH, x, z), 0.92), pal.haze, hazeT) });
    }
  }
  farQuads.sort((a, b) => b.depth - a.depth);
  for (const q of farQuads) {
    ctx.fillStyle = q.color;
    ctx.beginPath();
    ctx.moveTo(q.pts[0].x, q.pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(q.pts[i].x, q.pts[i].y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRunway(renderer, cam, runway) {
  const { ctx } = renderer;
  const halfL = runway.length / 2;
  const halfW = runway.width / 2;
  const sin = Math.sin(runway.heading);
  const cos = Math.cos(runway.heading);
  const corner = (along, across) => ({
    x: runway.x + sin * along + cos * across,
    y: runway.altitude + 0.4,
    z: runway.z + cos * along - sin * across,
  });
  const pts = [
    project(renderer, cam, corner(-halfL, -halfW)),
    project(renderer, cam, corner(halfL, -halfW)),
    project(renderer, cam, corner(halfL, halfW)),
    project(renderer, cam, corner(-halfL, halfW)),
  ];
  if (pts.some((p) => p === null)) return;
  ctx.fillStyle = '#3a3f46';
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.fillStyle = '#f5f7fa';
  for (let d = -halfL + 18; d < halfL - 10; d += 36) {
    const a = project(renderer, cam, corner(d, -1.2));
    const b = project(renderer, cam, corner(d + 18, -1.2));
    const c = project(renderer, cam, corner(d + 18, 1.2));
    const e = project(renderer, cam, corner(d, 1.2));
    if (!a || !b || !c || !e) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y);
    ctx.closePath(); ctx.fill();
  }
  // Threshold bars and a windsock mast at the near end.
  const label = project(renderer, cam, { x: runway.x, y: runway.altitude + 16, z: runway.z });
  const distToRunway = Math.hypot(runway.x - cam.x, runway.z - cam.z);
  if (label && distToRunway < 900) {
    ctx.font = '700 15px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(runway.name.toUpperCase(), label.x, label.y);
  }
}

function drawRing(renderer, cam, ring, isNext, time) {
  const { ctx } = renderer;
  const pts = [];
  const segments = 28;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const p = project(renderer, cam, {
      x: ring.x + Math.cos(a) * ring.radius,
      y: ring.y + Math.sin(a) * ring.radius,
      z: ring.z,
    });
    if (p) pts.push(p);
  }
  if (pts.length < 8) return;
  const pulse = 0.75 + 0.25 * Math.sin(time * 3 + ring.z);
  const glowColor = ring.fuel ? 'rgba(90, 255, 140, 0.35)' : 'rgba(255, 190, 60, 0.35)';
  const coreColor = ring.fuel ? '#5aff8c' : '#ffc93c';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = isNext ? 16 * pulse + 6 : 8;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.strokeStyle = coreColor;
  ctx.lineWidth = isNext ? 5 : 3;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  if (isNext) {
    const centre = project(renderer, cam, ring);
    if (centre) {
      ctx.font = '800 15px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = ring.fuel ? '#b8ffc9' : '#ffe9a8';
      ctx.fillText(ring.fuel ? 'FUEL +35' : 'NEXT RING', centre.x, centre.y - ring.radius * centre.scale - 14);
    }
  }
}

function drawStar(renderer, cam, star, time) {
  const { ctx } = renderer;
  const bob = Math.sin(time * 2 + star.z * 0.01) * 2;
  const p = project(renderer, cam, { x: star.x, y: star.y + bob, z: star.z });
  if (!p) return;
  const r = Math.max(5, 9 * p.scale * 1.4);
  const tw = 0.7 + 0.3 * Math.sin(time * 4 + star.z);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.sin(time * 1.2 + star.z) * 0.2);
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.4);
  glow.addColorStop(0, `rgba(255, 220, 90, ${0.55 * tw})`);
  glow.addColorStop(1, 'rgba(255, 220, 90, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffd83d';
  ctx.strokeStyle = '#fff3b0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlaneChase(renderer, plane, time) {
  const { ctx, canvas } = renderer;
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.66;
  const bank = plane.roll;
  // Wingtip trails: two fading contrails streaming back from the wingtips.
  const trailLen = 150 + plane.speed * 1.1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.9);
  const trailGrad = ctx.createLinearGradient(0, 10, 0, 10 + trailLen);
  trailGrad.addColorStop(0, 'rgba(255,255,255,0.38)');
  trailGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = trailGrad;
  ctx.lineCap = 'round';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-152, 12); ctx.lineTo(-172, 12 + trailLen * 0.85); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(152, 12); ctx.lineTo(172, 12 + trailLen * 0.85); ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.9);
  const s = 1.35;
  ctx.scale(s, s);
  // Wings: red with a sunlit top edge and a darker trailing edge.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-14, -4); ctx.lineTo(14, -4); ctx.lineTo(118, 6);
  ctx.lineTo(112, 16); ctx.lineTo(0, 12); ctx.lineTo(-112, 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ff7a4d';
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-14, -4); ctx.lineTo(-14, 0); ctx.lineTo(-112, 10); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(118, 6); ctx.lineTo(14, -4); ctx.lineTo(14, 0); ctx.lineTo(112, 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-14, -4); ctx.lineTo(14, -4); ctx.lineTo(118, 6);
  ctx.lineTo(112, 9); ctx.lineTo(0, 3); ctx.lineTo(-112, 9);
  ctx.closePath(); ctx.fill();
  // White wingtip stripes.
  ctx.fillStyle = '#f7f3ea';
  ctx.fillRect(-118, 4, 14, 8);
  ctx.fillRect(104, 4, 14, 8);
  // Tail.
  ctx.fillStyle = '#c73e1d';
  ctx.beginPath();
  ctx.moveTo(-34, -52); ctx.lineTo(-8, -58); ctx.lineTo(-6, -40); ctx.lineTo(-30, -38); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(34, -52); ctx.lineTo(8, -58); ctx.lineTo(6, -40); ctx.lineTo(30, -38); ctx.closePath(); ctx.fill();
  // Fuselage with a sun-side highlight.
  const body = ctx.createLinearGradient(0, -62, 0, 26);
  body.addColorStop(0, '#fff7e8');
  body.addColorStop(0.55, '#ffd98a');
  body.addColorStop(1, '#e8542f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -64);
  ctx.quadraticCurveTo(13, -58, 14, -30);
  ctx.quadraticCurveTo(15, 4, 9, 24);
  ctx.quadraticCurveTo(0, 30, -9, 24);
  ctx.quadraticCurveTo(-15, 4, -14, -30);
  ctx.quadraticCurveTo(-13, -58, 0, -64);
  ctx.closePath(); ctx.fill();
  // Canopy.
  ctx.fillStyle = '#9fd8ff';
  ctx.beginPath();
  ctx.ellipse(0, -34, 8.5, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-2.5, -40, 3, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Spinning propeller: a translucent disc with two blurred blades turning.
  const propA = time * 34;
  ctx.fillStyle = 'rgba(70, 70, 80, 0.22)';
  ctx.beginPath();
  ctx.ellipse(0, 28, 6, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(50, 50, 60, 0.5)';
  ctx.lineWidth = 2.5;
  for (const off of [0, Math.PI / 2]) {
    const a = propA + off;
    ctx.beginPath();
    ctx.moveTo(-Math.sin(a) * 12, 28 - Math.cos(a) * 12);
    ctx.lineTo(Math.sin(a) * 12, 28 + Math.cos(a) * 12);
    ctx.stroke();
  }
  // Navigation lights with a soft glow.
  for (const [lx, col] of [[-118, '255,77,77'], [118, '77,255,136']]) {
    const g = ctx.createRadialGradient(lx, 10, 1, lx, 10, 10);
    g.addColorStop(0, `rgba(${col}, 0.9)`);
    g.addColorStop(1, `rgba(${col}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(lx, 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${col})`;
    ctx.beginPath(); ctx.arc(lx, 10, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCockpit(renderer, plane) {
  const { ctx, canvas } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  // Nose and cowling.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 90, h);
  ctx.quadraticCurveTo(w / 2, h * 0.62, w / 2 + 90, h);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 46, h);
  ctx.quadraticCurveTo(w / 2, h * 0.72, w / 2 + 46, h);
  ctx.closePath(); ctx.fill();
  // Dashboard panel — slimmer than before, dials up front.
  const panelY = h * 0.84;
  ctx.fillStyle = '#1c2733';
  ctx.beginPath();
  ctx.roundRect(0, panelY, w, h - panelY, [18, 18, 0, 0]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,210,255,0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Three lit dials: airspeed, attitude, altitude.
  const dials = [
    { x: w * 0.3, label: 'SPD', value: Math.round(plane.speed * 3.6), max: 330 },
    { x: w * 0.5, label: 'ATT', value: null, max: 0 },
    { x: w * 0.7, label: 'ALT', value: Math.round(plane.y), max: 300 },
  ];
  for (const d of dials) {
    const cy = panelY + (h - panelY) / 2;
    ctx.fillStyle = '#0d1620';
    ctx.beginPath(); ctx.arc(d.x, cy, 46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7ef0c1'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#7ef0c1';
    ctx.font = '800 19px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    if (d.value === null) {
      // Attitude ball: horizon line tilts with roll, shifts with pitch.
      ctx.save();
      ctx.beginPath(); ctx.arc(d.x, cy, 39, 0, Math.PI * 2); ctx.clip();
      ctx.translate(d.x, cy + plane.pitch * 80);
      ctx.rotate(plane.roll);
      ctx.fillStyle = '#4d9de0'; ctx.fillRect(-50, -50, 100, 50);
      ctx.fillStyle = '#8a6b45'; ctx.fillRect(-50, 0, 100, 50);
      ctx.fillStyle = '#fff'; ctx.fillRect(-50, -1, 100, 2);
      ctx.restore();
    } else {
      ctx.fillText(String(d.value), d.x, cy + 2);
      const frac = Math.min(1, d.value / d.max);
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(d.x, cy, 46, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#9fd0ff';
    ctx.font = '700 11px "Segoe UI", Arial, sans-serif';
    ctx.fillText(d.label, d.x, cy + 62);
  }
}

function drawSpeedLines(renderer, plane) {
  const { ctx, canvas } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  const frac = Math.max(0, Math.min(1, (plane.speed - 52) / 40));
  if (frac <= 0.02) return;
  const cx = w / 2;
  const cy = h * 0.52;
  ctx.strokeStyle = `rgba(255,255,255,${0.5 * frac})`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.13 * i;
    const r0 = Math.min(w, h) * (0.42 + 0.05 * ((i * 37) % 10) / 10);
    const len = 26 + frac * 60 + ((i * 53) % 30);
    const x0 = cx + Math.cos(a) * r0;
    const y0 = cy + Math.sin(a) * r0;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    ctx.stroke();
  }
}

function drawRain(renderer, time) {
  const { ctx, canvas } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  ctx.strokeStyle = 'rgba(200, 215, 235, 0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 90; i++) {
    const seed = i * 137.5;
    const x = ((seed * 7.3 + time * 320) % (w + 80)) - 40;
    const y = ((seed * 3.1 + time * 640) % (h + 40)) - 20;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 9, y + 26);
    ctx.stroke();
  }
}

function drawWake(renderer, cam, plane) {
  const { ctx } = renderer;
  const ground = terrainHeight(plane.x, plane.z);
  if (ground > SEA_LEVEL + 0.5) return; // over land: no wake
  if (plane.y > 9) return; // too high to touch the water
  // A widening foam streak on the sea behind the plane.
  for (let i = 0; i < 5; i++) {
    const back = 6 + i * 9;
    const p = project(renderer, cam, {
      x: plane.x - Math.sin(plane.heading) * back,
      y: SEA_LEVEL + 0.4,
      z: plane.z - Math.cos(plane.heading) * back,
    });
    if (!p) continue;
    const r = (3 + i * 2.4) * p.scale * 0.8;
    ctx.fillStyle = `rgba(235, 248, 255, ${0.5 - i * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 2.2, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function renderScene(renderer, view) {
  const { ctx, canvas } = renderer;
  const { plane, cam, clouds, rings, stars, nextRing, time, cameraMode, timeOfDay, shake } = view;
  const pal = PALETTES[timeOfDay] || PALETTES.sunset;
  // Speed widens the view a little: the world rushes past faster.
  const speedFrac = Math.max(0, Math.min(1, (plane.speed - 40) / 55));
  renderer.focal = FOCAL * (1 + speedFrac * 0.22);
  // Camera shake on hard manoeuvres and impacts.
  const dt = Math.max(0.001, Math.min(0.1, time - lastTime));
  lastTime = time;
  stepParticles(dt);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  if (shake > 0.01) {
    ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
  }
  drawSky(renderer, cam, pal, time);
  drawClouds(renderer, cam, clouds, pal);
  drawTerrain(renderer, cam, plane, pal);
  for (const r of RUNWAYS) drawRunway(renderer, cam, r);
  const sortedRings = [...rings].filter((r) => !r.passed).sort((a, b) => b.z - a.z);
  for (const ring of sortedRings) drawRing(renderer, cam, ring, ring === nextRing, time);
  for (const star of stars || []) if (!star.taken) drawStar(renderer, cam, star, time);
  drawWake(renderer, cam, plane);
  drawParticles(renderer, cam);
  if (cameraMode === 'cockpit') drawCockpit(renderer, plane);
  else drawPlaneChase(renderer, plane, time);
  drawSpeedLines(renderer, plane);
  if (pal.rain) drawRain(renderer, time);
  ctx.restore();
}

// Camera sits behind and slightly above the plane, looking along its heading.
export function chaseCamera(plane, cameraMode, smoothing) {
  const back = cameraMode === 'cockpit' ? 1.5 : 16;
  const up = cameraMode === 'cockpit' ? 1.6 : 4.2;
  const cx = plane.x - Math.sin(plane.heading) * back;
  const cz = plane.z - Math.cos(plane.heading) * back;
  const cy = plane.y + up + plane.pitch * 6;
  if (!smoothing) return { x: cx, y: cy, z: cz, heading: plane.heading, pitch: plane.pitch * 0.55, roll: plane.roll * 0.35 };
  const s = smoothing;
  return {
    x: s.x + (cx - s.x) * 0.18,
    y: s.y + (cy - s.y) * 0.18,
    z: s.z + (cz - s.z) * 0.18,
    heading: plane.heading,
    pitch: plane.pitch * 0.55,
    roll: plane.roll * 0.35,
  };
}

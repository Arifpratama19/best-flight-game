// render.js — the chase / cockpit view: a small 3D projector, procedural sky,
// sea, island terrain, runways, glowing rings and a hand-drawn prop plane.
// Everything is drawn on one 2D canvas; no images, no network.
import { terrainHeight, groundColor, shadeColor, RUNWAYS, SEA_LEVEL } from './terrain.js';

const FOCAL = 620;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
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
  const scale = FOCAL / rz;
  return {
    x: w / 2 + rx * scale,
    y: h * 0.52 - ry * scale,
    depth: rz,
    scale,
  };
}

function drawSky(renderer, cam, timeOfDay) {
  const { ctx, canvas } = renderer;
  const w = canvas.width;
  const h = canvas.height;
  const horizonY = h * 0.52 + Math.tan(cam.pitch) * FOCAL + cam.roll * 40;
  const sky = ctx.createLinearGradient(0, 0, 0, Math.max(0, horizonY));
  if (timeOfDay === 'sunset') {
    sky.addColorStop(0, '#2b3a6e');
    sky.addColorStop(0.45, '#7a6bb0');
    sky.addColorStop(0.8, '#ff9a5c');
    sky.addColorStop(1, '#ffc46b');
  } else {
    sky.addColorStop(0, '#3d7ac8');
    sky.addColorStop(0.7, '#8ec4ee');
    sky.addColorStop(1, '#cfe9f7');
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, Math.max(0, horizonY + 2));
  // Sun low over the sea, warm and big.
  const sunX = w * 0.68;
  const sunY = Math.max(40, horizonY - 130);
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 150);
  glow.addColorStop(0, 'rgba(255, 214, 130, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 170, 90, 0.55)');
  glow.addColorStop(1, 'rgba(255, 150, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 160, sunY - 160, 320, 320);
  ctx.fillStyle = '#fff3c4';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();
  // Sea below the horizon.
  const sea = ctx.createLinearGradient(0, horizonY, 0, h);
  sea.addColorStop(0, '#2f7fa8');
  sea.addColorStop(0.25, '#1d5f86');
  sea.addColorStop(1, '#123f5e');
  ctx.fillStyle = sea;
  ctx.fillRect(0, Math.max(0, horizonY), w, h - Math.max(0, horizonY));
  return horizonY;
}

function drawClouds(renderer, cam, clouds) {
  const { ctx } = renderer;
  const projected = [];
  for (const c of clouds) {
    const p = project(renderer, cam, c);
    if (!p) continue;
    projected.push({ ...c, ...p });
  }
  projected.sort((a, b) => b.depth - a.depth);
  for (const c of projected) {
    const r = Math.max(4, c.size * c.scale * 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, r, r * 0.42, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - r * 0.55, c.y + r * 0.08, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + r * 0.55, c.y + r * 0.06, r * 0.65, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTerrain(renderer, cam, plane) {
  const { ctx, canvas } = renderer;
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
      const shade = 0.82 + 0.18 * Math.max(0, Math.min(1, (corners[2].y - corners[0].y) / 12 + 0.5));
      quads.push({ pts, depth, color: shadeColor(groundColor(avgH, x, z), shade) });
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
      farQuads.push({ pts, depth: z - plane.z, color: shadeColor(groundColor(avgH, x, z), 0.92) });
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
  void canvas;
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

function drawPlaneChase(renderer, plane, time) {
  const { ctx, canvas } = renderer;
  const cx = canvas.width / 2;
  const cy = canvas.height * 0.66;
  const bank = plane.roll;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.9);
  const s = 1.15;
  ctx.scale(s, s);
  // Shadow on the ground far below is drawn by the caller; here is the aircraft.
  // Wings.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-14, -4); ctx.lineTo(14, -4); ctx.lineTo(118, 6);
  ctx.lineTo(112, 16); ctx.lineTo(0, 12); ctx.lineTo(-112, 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f7f3ea';
  ctx.beginPath();
  ctx.moveTo(-118, 6); ctx.lineTo(-14, -4); ctx.lineTo(-14, 2); ctx.lineTo(-112, 12); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(118, 6); ctx.lineTo(14, -4); ctx.lineTo(14, 2); ctx.lineTo(112, 12); ctx.closePath(); ctx.fill();
  // Tail.
  ctx.fillStyle = '#c73e1d';
  ctx.beginPath();
  ctx.moveTo(-34, -52); ctx.lineTo(-8, -58); ctx.lineTo(-6, -40); ctx.lineTo(-30, -38); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(34, -52); ctx.lineTo(8, -58); ctx.lineTo(6, -40); ctx.lineTo(30, -38); ctx.closePath(); ctx.fill();
  // Fuselage.
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
  // Spinning prop blur at the tail (we see the plane from behind).
  ctx.fillStyle = `rgba(60, 60, 70, ${0.25 + 0.12 * Math.sin(time * 30)})`;
  ctx.beginPath();
  ctx.ellipse(0, 28, 5, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // Navigation lights.
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath(); ctx.arc(-118, 10, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4dff88';
  ctx.beginPath(); ctx.arc(118, 10, 3.5, 0, Math.PI * 2); ctx.fill();
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
  // Dashboard panel.
  const panelY = h * 0.78;
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
    ctx.beginPath(); ctx.arc(d.x, cy, 52, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7ef0c1'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#7ef0c1';
    ctx.font = '800 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    if (d.value === null) {
      // Attitude ball: horizon line tilts with roll, shifts with pitch.
      ctx.save();
      ctx.beginPath(); ctx.arc(d.x, cy, 44, 0, Math.PI * 2); ctx.clip();
      ctx.translate(d.x, cy + plane.pitch * 90);
      ctx.rotate(plane.roll);
      ctx.fillStyle = '#4d9de0'; ctx.fillRect(-50, -50, 100, 50);
      ctx.fillStyle = '#8a6b45'; ctx.fillRect(-50, 0, 100, 50);
      ctx.fillStyle = '#fff'; ctx.fillRect(-50, -1, 100, 2);
      ctx.restore();
    } else {
      ctx.fillText(String(d.value), d.x, cy + 2);
      const frac = Math.min(1, d.value / d.max);
      ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(d.x, cy, 52, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#9fd0ff';
    ctx.font = '700 12px "Segoe UI", Arial, sans-serif';
    ctx.fillText(d.label, d.x, cy + 72);
  }
}

export function renderScene(renderer, view) {
  const { ctx, canvas } = renderer;
  const { plane, cam, clouds, rings, nextRing, time, cameraMode, timeOfDay } = view;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky(renderer, cam, timeOfDay);
  drawClouds(renderer, cam, clouds);
  drawTerrain(renderer, cam, plane);
  for (const r of RUNWAYS) drawRunway(renderer, cam, r);
  const sortedRings = [...rings].filter((r) => !r.passed).sort((a, b) => b.z - a.z);
  for (const ring of sortedRings) drawRing(renderer, cam, ring, ring === nextRing, time);
  if (cameraMode === 'cockpit') drawCockpit(renderer, plane);
  else drawPlaneChase(renderer, plane, time);
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

// hud.js — the DOM instrument panel: altitude, speed, heading, fuel,
// score, timer, compass strip, attitude ball and the next-ring pointer.
import { headingDegrees, speedKmh } from './flight.js';
import { windLabel } from './missions.js';

const $ = (id) => document.getElementById(id);

export function updateHud(plane, state) {
  $('hud-score').textContent = String(state.score);
  $('hud-best').textContent = `BEST ${state.bestScore}`;
  $('hud-mission').textContent = state.mission.name;
  $('hud-rings').textContent = `${state.ringsHit} / ${state.totalRings}`;
  $('hud-round').textContent = `ROUND ${state.round}`;
  const mins = Math.max(0, Math.floor(state.timeLeft / 60));
  const secs = Math.max(0, Math.floor(state.timeLeft % 60));
  $('hud-timer').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  $('hud-timer').style.color = state.timeLeft < 30 ? '#ff8a7a' : '#fff';
  $('hud-objective').textContent = state.objective;
  $('hud-alt').textContent = String(Math.max(0, Math.round(plane.y)));
  $('hud-spd').textContent = String(Math.round(speedKmh(plane)));
  $('hud-hdg').textContent = String(Math.round(headingDegrees(plane))).padStart(3, '0');
  $('hud-thr').textContent = String(Math.round(plane.throttle * 100));
  $('hud-fuel').textContent = String(Math.round(plane.fuel));
  $('hud-hull').textContent = String(Math.round(plane.hull));
  $('alt-fill').style.width = `${Math.min(100, (plane.y / 220) * 100)}%`;
  $('spd-fill').style.width = `${Math.min(100, (speedKmh(plane) / 330) * 100)}%`;
  $('hdg-fill').style.width = `${(headingDegrees(plane) / 360) * 100}%`;
  $('thr-fill').style.width = `${plane.throttle * 100}%`;
  const fuelFill = $('fuel-fill');
  fuelFill.style.width = `${plane.fuel}%`;
  fuelFill.classList.toggle('low', plane.fuel < 25);
  const hullFill = $('hull-fill');
  hullFill.style.width = `${plane.hull}%`;
  hullFill.classList.toggle('low', plane.hull < 35);
  $('hud-wind').textContent = windLabel(state);
  // Stall warning: flashing banner when the wing stops flying.
  $('stall-warning').classList.toggle('show', !!plane.stalled && !plane.landed && plane.fuel > 0);
  // Combo badge under the score.
  const comboEl = $('hud-combo');
  if (state.combo > 1 && state.comboTimer > 0) {
    comboEl.textContent = `COMBO ×${state.combo} — ${Math.ceil(state.comboTimer)}s`;
    comboEl.classList.add('hot');
  } else {
    comboEl.textContent = state.bestCombo > 1 ? `BEST COMBO ×${state.bestCombo}` : '';
    comboEl.classList.remove('hot');
  }
  $('hud-stars').textContent = `★ ${state.starsHit}`;
  // Attitude ball: horizon line rolls with the plane and shifts with pitch.
  const ball = $('horizon-ball');
  ball.style.background = 'linear-gradient(#6db9ff 50%, #7a5a3a 50%)';
  const line = $('horizon-line');
  line.style.transform = `translateY(${plane.pitch * 34}px) rotate(${-plane.roll}rad)`;
  // Compass strip: cardinal points slide past the needle.
  const strip = $('compass-strip');
  const heading = headingDegrees(plane);
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  let html = '';
  for (let d = 0; d < 360; d += 45) {
    const label = points[d / 45];
    const rel = ((d - heading + 540) % 360) - 180;
    const px = 170 + rel * 2.1;
    if (px > -20 && px < 360) html += `<span style="position:absolute;left:${px}px">${label} ${d}°</span>`;
  }
  strip.innerHTML = html;
  // Next-ring pointer.
  const ring = state.nextRing;
  if (ring) {
    $('next-ring-dist').textContent = `${Math.max(0, Math.round(Math.hypot(ring.x - plane.x, ring.y - plane.y, ring.z - plane.z)))} m`;
    const targetHeading = Math.atan2(ring.x - plane.x, ring.z - plane.z);
    let rel = targetHeading - plane.heading;
    rel = ((rel + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    $('next-ring-arrow').style.transform = `rotate(${rel}rad)`;
    $('next-ring-label').textContent = ring.fuel ? 'FUEL RING' : 'NEXT RING';
  } else {
    $('next-ring-dist').textContent = '—';
    $('next-ring-label').textContent = 'LAND NOW';
  }
}

let messageTimer = 0;
export function showMessage(text, seconds = 2.2) {
  const el = $('message');
  el.textContent = text;
  window.clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => { el.textContent = ''; }, seconds * 1000);
}

// Floating score popup: drifts up and fades, one per event. Used for ring
// passes, stars, near misses and landings so the score gain reads on screen.
export function showPopup(text, kind = 'score') {
  const layer = $('popups');
  if (!layer) return;
  const el = document.createElement('div');
  el.className = `popup popup-${kind}`;
  el.textContent = text;
  el.style.left = `${46 + Math.random() * 8}%`;
  layer.appendChild(el);
  window.setTimeout(() => el.remove(), 1500);
  while (layer.children.length > 6) layer.firstChild.remove();
}

export function showScreen(id) {
  for (const name of ['start-screen', 'pause-screen', 'end-screen']) {
    $(name).classList.toggle('hidden', name !== id);
  }
  $('hud').classList.toggle('hidden', id !== null);
}

export function showEndScreen(result) {
  $('end-title').textContent = result.title;
  $('end-subtitle').textContent = result.subtitle;
  $('end-best').textContent = String(result.bestScore);
  const rows = result.rows.map(([label, value]) => `<div class="row"><span>${label}</span><span>${value}</span></div>`).join('');
  $('end-breakdown').innerHTML = rows + `<div class="row total"><span>TOTAL SCORE</span><span>${result.score}</span></div>`;
  showScreen('end-screen');
}

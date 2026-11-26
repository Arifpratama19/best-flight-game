// flight.js — arcade flight model: throttle, pitch, roll, yaw, lift and
// stall, fuel burn, hull damage, landing and crash detection. No DOM.
import { terrainHeight, runwayAt } from './terrain.js';

export const MAX_SPEED = 92; // m/s
export const STALL_SPEED = 17; // m/s
export const CRUISE_SPEED = 46;

export function createPlane() {
  return {
    x: 0, y: 34, z: 180,
    heading: 0, // radians, 0 = +z (down the course)
    pitch: 0, // radians, positive = nose up
    roll: 0,
    speed: 34,
    throttle: 0.55,
    verticalSpeed: 0,
    fuel: 100,
    hull: 100,
    onGround: false,
    landed: false,
  };
}

export function resetPlane(plane, spawn) {
  plane.x = spawn.x;
  plane.y = spawn.y;
  plane.z = spawn.z;
  plane.heading = spawn.heading ?? 0;
  plane.pitch = 0;
  plane.roll = 0;
  plane.speed = spawn.speed ?? 34;
  plane.throttle = 0.55;
  plane.verticalSpeed = 0;
  plane.fuel = 100;
  plane.hull = 100;
  plane.onGround = false;
  plane.landed = false;
}

// controls: { pitch, roll, yaw, throttle, brake } each -1..1 (throttle 0..1 absolute)
// wind: { x, z } crosswind in m/s. Returns an event string or null.
export function stepFlight(plane, controls, wind, dt) {
  if (plane.landed) return null;
  const p = plane;

  // Throttle: smooth toward target, engine dies without fuel.
  const targetThrottle = p.fuel <= 0 ? 0 : controls.throttle;
  p.throttle += (targetThrottle - p.throttle) * Math.min(1, dt * 2.2);

  // Speed: thrust minus drag, plus brake.
  const thrust = p.throttle * 34;
  const drag = 0.16 * p.speed + 0.0042 * p.speed * p.speed;
  const brakeDrag = controls.brake ? 26 : 0;
  p.speed += (thrust - drag - brakeDrag) * dt;
  if (p.speed < 0) p.speed = 0;
  if (p.speed > MAX_SPEED) p.speed = MAX_SPEED;

  // Pitch and roll ease toward the pilot's input (heavier feel at low speed).
  const authority = 0.35 + 0.65 * Math.min(1, p.speed / 40);
  const pitchTarget = controls.pitch * 0.42 * authority;
  const rollTarget = controls.roll * 1.05 * authority;
  p.pitch += (pitchTarget - p.pitch) * Math.min(1, dt * 2.6);
  p.roll += (rollTarget - p.roll) * Math.min(1, dt * 3.2);

  // Turn: banked turns change heading; rudder adds a little direct yaw.
  const turnRate = -Math.sin(p.roll) * 0.55 * Math.min(1, p.speed / 30) + controls.yaw * 0.22 * Math.min(1, p.speed / 25);
  p.heading += turnRate * dt;

  // Vertical speed: lift from speed and pitch, sink when stalled or slow.
  const stalled = p.speed < STALL_SPEED;
  const lift = stalled ? -1 : Math.sin(p.pitch) * p.speed;
  const sink = stalled ? (STALL_SPEED - p.speed) * 0.55 : 0;
  const targetVs = lift - sink - (p.speed < 8 ? 2.5 : 0);
  p.verticalSpeed += (targetVs - p.verticalSpeed) * Math.min(1, dt * 1.8);
  p.y += p.verticalSpeed * dt;

  // Horizontal motion along heading, plus wind drift.
  const vx = Math.sin(p.heading) * p.speed + wind.x;
  const vz = Math.cos(p.heading) * p.speed + wind.z;
  p.x += vx * dt;
  p.z += vz * dt;

  // Fuel burn grows with throttle and speed.
  p.fuel -= (0.22 + p.throttle * 0.55 + p.speed * 0.004) * dt;
  if (p.fuel < 0) p.fuel = 0;

  // Ground contact.
  const ground = terrainHeight(p.x, p.z);
  const runway = runwayAt(p.x, p.z);
  const clearance = p.y - ground;
  if (clearance <= 0.6) {
    const hard = p.verticalSpeed < -7 || p.speed > 62;
    const steep = Math.abs(p.pitch) > 0.35 || Math.abs(p.roll) > 0.7;
    if (runway && !hard && !steep && p.speed < 58 && p.speed > 10) {
      // Smooth touchdown on the runway.
      p.y = ground + 0.6;
      p.landed = true;
      p.onGround = true;
      p.verticalSpeed = 0;
      p.speed *= 0.85;
      return 'landed';
    }
    if (p.verticalSpeed < -3.5 || p.speed > 55) {
      // Slammed into terrain or water.
      p.hull -= Math.min(100, Math.abs(p.verticalSpeed) * 9 + p.speed * 0.55);
      p.y = ground + 0.6;
      if (p.hull <= 0) { p.hull = 0; return 'crashed'; }
      p.verticalSpeed = 0;
      p.speed *= 0.45;
      p.pitch = 0;
      return 'impact';
    }
    // Gentle scrape: bounce off, lose a little hull.
    p.y = ground + 0.6;
    p.verticalSpeed = Math.abs(p.verticalSpeed) * 0.25;
    p.hull = Math.max(0, p.hull - 4);
    p.speed *= 0.8;
    if (p.hull <= 0) return 'crashed';
    return 'scrape';
  }
  // Out of the world: turn the pilot back toward the course.
  if (p.z < 60) { p.z = 60; p.heading = 0; }
  if (p.z > 5050) { p.z = 5050; p.heading = Math.PI; }
  if (Math.abs(p.x) > 620) { p.x = Math.sign(p.x) * 620; p.heading = -p.heading * 0.4; }
  return null;
}

export function headingDegrees(plane) {
  let d = (plane.heading * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}

export function speedKmh(plane) { return plane.speed * 3.6; }

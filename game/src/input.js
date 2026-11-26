// input.js — keyboard plus mouse steering for the flight game.
// Arrow keys / WASD fly the plane; dragging the mouse steers; the wheel
// works the throttle. Every control answers at any speed.
export function createInput() {
  return {
    keys: new Set(),
    throttle: 0.55,
    mouseSteerX: 0,
    mouseSteerY: 0,
    dragging: false,
    handlers: [],
  };
}

export function attachInput(input, canvas, callbacks) {
  const keyDown = (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    input.keys.add(event.code);
    if (event.code === 'KeyP' && callbacks.onPause) callbacks.onPause();
    if (event.code === 'KeyR' && callbacks.onRestart) callbacks.onRestart();
    if (event.code === 'KeyM' && callbacks.onMute) callbacks.onMute();
    if (event.code === 'KeyC' && callbacks.onCamera) callbacks.onCamera();
    if (event.code === 'Enter' && callbacks.onConfirm) callbacks.onConfirm();
  };
  const keyUp = (event) => { input.keys.delete(event.code); };
  const mouseDown = (event) => {
    input.dragging = true;
    input.dragStartX = event.clientX;
    input.dragStartY = event.clientY;
    input.mouseSteerX = 0;
    input.mouseSteerY = 0;
  };
  const mouseMove = (event) => {
    if (!input.dragging) return;
    const dx = (event.clientX - (input.dragStartX ?? event.clientX)) / 220;
    const dy = (event.clientY - (input.dragStartY ?? event.clientY)) / 220;
    input.mouseSteerX = Math.max(-1, Math.min(1, dx));
    input.mouseSteerY = Math.max(-1, Math.min(1, dy));
  };
  const mouseUp = () => {
    input.dragging = false;
    input.mouseSteerX = 0;
    input.mouseSteerY = 0;
  };
  const wheel = (event) => {
    event.preventDefault();
    input.throttle = Math.max(0, Math.min(1, input.throttle + (event.deltaY < 0 ? 0.06 : -0.06)));
  };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousedown', mouseDown);
  window.addEventListener('mousemove', mouseMove);
  window.addEventListener('mouseup', mouseUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
  input.handlers.push(
    () => window.removeEventListener('keydown', keyDown),
    () => window.removeEventListener('keyup', keyUp),
  );
}

// Read the current control state from keys and mouse. Throttle is sticky:
// W/S nudge it, the wheel sets it, and it holds between frames.
export function readControls(input, dt) {
  const k = input.keys;
  if (k.has('KeyW')) input.throttle = Math.min(1, input.throttle + dt * 0.7);
  if (k.has('KeyS')) input.throttle = Math.max(0, input.throttle - dt * 0.7);
  let pitch = 0;
  let roll = 0;
  if (k.has('ArrowUp')) pitch += 1;
  if (k.has('ArrowDown')) pitch -= 1;
  if (k.has('ArrowLeft')) roll -= 1;
  if (k.has('ArrowRight')) roll += 1;
  // Mouse drag steers: horizontal drag banks, vertical drag pitches.
  roll += input.mouseSteerX * 0.9;
  pitch += -input.mouseSteerY * 0.7;
  let yaw = 0;
  if (k.has('KeyQ')) yaw -= 1;
  if (k.has('KeyE')) yaw += 1;
  return {
    pitch: Math.max(-1, Math.min(1, pitch)),
    roll: Math.max(-1, Math.min(1, roll)),
    yaw,
    throttle: input.throttle,
    brake: k.has('Space'),
  };
}

export function clearKeys(input) { input.keys.clear(); }

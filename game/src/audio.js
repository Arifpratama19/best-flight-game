// audio.js — synthesized WebAudio sound: engine hum, wind, ring chime,
// fuel pickup, landing thud and crash noise. No audio files.
export function createAudio() {
  const state = { ctx: null, muted: false, engineOsc: null, engineGain: null, windGain: null, windSrc: null };
  return state;
}

function ensureContext(audio) {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended') void audio.ctx.resume();
    return audio.ctx;
  }
  const Ctx = window.AudioContext ?? window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  audio.ctx = ctx;
  // Engine: two detuned sawtooth oscillators through a low-pass filter.
  const oscA = ctx.createOscillator();
  oscA.type = 'sawtooth';
  oscA.frequency.value = 62;
  const oscB = ctx.createOscillator();
  oscB.type = 'sawtooth';
  oscB.frequency.value = 93;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  oscA.connect(filter);
  oscB.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  oscA.start();
  oscB.start();
  audio.engineOsc = [oscA, oscB];
  audio.engineGain = gain;
  audio.engineFilter = filter;
  // Wind: looped filtered noise.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 500;
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  src.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(ctx.destination);
  src.start();
  audio.windGain = windGain;
  return ctx;
}

export function startAudio(audio) { ensureContext(audio); }

export function updateEngineSound(audio, throttle, speed, flying) {
  if (!audio.ctx || audio.muted) {
    if (audio.engineGain) audio.engineGain.gain.value = 0;
    if (audio.windGain) audio.windGain.gain.value = 0;
    return;
  }
  const t = audio.ctx.currentTime;
  const base = 52 + throttle * 68 + speed * 0.35;
  audio.engineOsc[0].frequency.setTargetAtTime(base, t, 0.08);
  audio.engineOsc[1].frequency.setTargetAtTime(base * 1.5, t, 0.08);
  audio.engineFilter.frequency.setTargetAtTime(240 + throttle * 700, t, 0.1);
  audio.engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.05 : 0, t, 0.1);
  audio.windGain.gain.setTargetAtTime(flying ? Math.min(0.06, speed * 0.0007) : 0, t, 0.15);
}

function tone(audio, freq, duration, type, volume, delay = 0) {
  if (!audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function playRingChime(audio) {
  tone(audio, 880, 0.35, 'sine', 0.22);
  tone(audio, 1318, 0.5, 'sine', 0.18, 0.07);
  tone(audio, 1760, 0.6, 'sine', 0.12, 0.14);
}

export function playFuelChime(audio) {
  tone(audio, 660, 0.25, 'triangle', 0.2);
  tone(audio, 990, 0.4, 'triangle', 0.18, 0.08);
}

export function playLandingThud(audio) {
  if (!audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t0);
  osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.25);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.4, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.35);
  tone(audio, 523, 0.5, 'sine', 0.15, 0.12);
}

export function playCrashSound(audio) {
  if (!audio.ctx || audio.muted) return;
  const ctx = audio.ctx;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
  tone(audio, 90, 0.8, 'sawtooth', 0.2);
}

export function playClick(audio) { tone(audio, 740, 0.08, 'square', 0.08); }

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.ctx && muted) {
    if (audio.engineGain) audio.engineGain.gain.value = 0;
    if (audio.windGain) audio.windGain.gain.value = 0;
  }
}

/**
 * Safe dial sounds, synthesized with Web Audio (no sound files).
 * Nothing plays until start() is called from a click or key press.
 */

let ctx = null;
let master = null;
let noise = null;
let muted = false;
let lastTick = 0;

/** Creates the audio context. Call from a user gesture. */
export function start() {
  if (ctx) return ctx.resume();
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.6;
  master.connect(ctx.destination);

  // A short burst of white noise, filtered into different clicks below.
  noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.08), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ctx.currentTime, 0.01);
}

/** A filtered noise click: the body of every dial sound. */
function click(time, { frequency, q, decay, gain }) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, time);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  source.connect(filter).connect(envelope).connect(master);
  source.start(time);
  source.stop(time + decay + 0.02);
}

/** A short pitched ring under a click, for the unlock sound. */
function ring(time, { frequency, endFrequency = frequency, decay, gain }) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(frequency, time);
  osc.frequency.exponentialRampToValueAtTime(endFrequency, time + decay);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, time);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  osc.connect(envelope).connect(master);
  osc.start(time);
  osc.stop(time + decay + 0.02);
}

/** The time for the next tick, spaced out so fast drags don't pile up into noise. */
function nextTime() {
  const time = Math.max(ctx.currentTime, lastTick + 0.012);
  lastTick = time;
  return time;
}

/** One notch of the dial. */
export function tick() {
  if (!ctx || muted) return;
  click(nextTime(), { frequency: 3000 + Math.random() * 400, q: 9, decay: 0.018, gain: 0.55 });
}

/** A row landing in its right place: a tick, slightly lower, longer and firmer. */
export function inPlace() {
  if (!ctx || muted) return;
  click(nextTime(), { frequency: 3000, q: 9, decay: 0.03, gain: 0.7 });
}

/** The lock opening: a heavy thud and the bolt drawing back. */
export function unlock() {
  if (!ctx || muted) return;
  const time = nextTime() + 0.08;
  ring(time, { frequency: 140, endFrequency: 55, decay: 0.3, gain: 0.7 });
  click(time, { frequency: 500, q: 2, decay: 0.12, gain: 1 });
  click(time + 0.16, { frequency: 2200, q: 5, decay: 0.03, gain: 0.8 });
  click(time + 0.24, { frequency: 1300, q: 5, decay: 0.06, gain: 0.9 });
}

/**
 * "Not Found in A Minor": the score, synthesized with Web Audio (no sound files). A slow progression
 * in A minor: warm pads under the title cards, then bass and a bell arpeggio
 * join for the roll, and a last chord rings out on "The End".
 *
 * Nothing plays until setEnabled(true) is called from a click or key press.
 * The music follows the film through setSection(): "intro", "roll" or "end".
 */

const BPM = 68;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const LOOKAHEAD = 0.25; // seconds of music scheduled ahead of time
const VOLUME = 0.8;

/** One chord per bar: bass note and pad voicing, as MIDI note numbers. */
const PROGRESSION = [
  { bass: 45, pad: [57, 60, 64] }, // Am
  { bass: 41, pad: [57, 60, 65] }, // F
  { bass: 48, pad: [55, 60, 64] }, // C
  { bass: 43, pad: [55, 59, 62] }, // G
  { bass: 45, pad: [57, 60, 64] }, // Am
  { bass: 41, pad: [57, 60, 65] }, // F
  { bass: 38, pad: [57, 62, 65] }, // Dm
  { bass: 40, pad: [56, 59, 64] }, // E
];
/** A held note over each bar, on every other pass through the progression. */
const MELODY = [76, 77, 79, 79, 76, 77, 74, 76];
/** Which chord tone each eighth note of the arpeggio plays (3 = top octave). */
const ARPEGGIO = [0, 1, 2, 3, 2, 1, 2, 1];

const frequency = (note) => 440 * 2 ** ((note - 69) / 12);

let ctx = null;
let master = null;
let reverb = null;
let enabled = false;
let section = 'intro';

/** Everything for the current section plays through a bus, so it can fade out as one. */
let bus = null;
let nextBar = 0; // index into the progression
let nextBarTime = 0; // AudioContext time the next bar starts
let timer = 0;
let scoring = false; // the scheduler is writing bars

/* Setup ---------------------------------------------------------------------- */

function setup() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return false;
  ctx = new AudioContext();

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 8;
  limiter.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(limiter);

  // A long hall: stereo noise that decays over a few seconds.
  const seconds = 4;
  const impulse = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
    }
  }
  reverb = ctx.createConvolver();
  reverb.buffer = impulse;
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  reverb.connect(wet).connect(master);

  // The context pauses with the tab, and the film with it.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume();
  });
  return true;
}

function newBus() {
  if (bus) {
    const old = bus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    setTimeout(() => old.disconnect(), 4000);
  }
  bus = ctx.createGain();
  bus.connect(master);
  bus.connect(reverb);
  return bus;
}

/* Instruments ---------------------------------------------------------------- */

/** An envelope: rises to `level` over `attack`, holds, then dies away over `release`. */
function envelope(time, duration, { level, attack, release }) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(level, time + attack);
  gain.gain.setValueAtTime(level, time + Math.max(attack, duration - release));
  gain.gain.linearRampToValueAtTime(0, time + duration);
  return gain;
}

/** Two detuned saws through a soft low-pass: a string-like pad. */
function pad(note, time, duration, level = 0.035) {
  const out = envelope(time, duration, { level, attack: 1.4, release: 1.6 });
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.4;
  filter.connect(out).connect(bus);
  for (const detune of [-7, 7]) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency(note);
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + duration + 0.05);
  }
}

function bass(note, time, duration) {
  const out = envelope(time, duration, { level: 0.16, attack: 0.08, release: 0.8 });
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 280;
  filter.connect(out).connect(bus);
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = frequency(note);
  osc.connect(filter);
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

/** A soft bell: a sine and a quiet octave above it, struck and left to ring. */
function bell(note, time, level = 0.05, ring = 2.2) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, time);
  out.gain.linearRampToValueAtTime(level, time + 0.01);
  out.gain.exponentialRampToValueAtTime(0.0001, time + ring);
  out.connect(bus);
  for (const [ratio, gain] of [[1, 1], [2, 0.25], [3, 0.08]]) {
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency(note) * ratio;
    const partial = ctx.createGain();
    partial.gain.value = gain;
    osc.connect(partial).connect(out);
    osc.start(time);
    osc.stop(time + ring + 0.05);
  }
}

/** A deep cinematic hit: a falling sine with a thud of low noise. */
function boom(time, level = 0.5) {
  const out = ctx.createGain();
  out.gain.setValueAtTime(level, time);
  out.gain.exponentialRampToValueAtTime(0.0001, time + 2.5);
  out.connect(bus);

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(90, time);
  osc.frequency.exponentialRampToValueAtTime(32, time + 1.5);
  osc.connect(out);
  osc.start(time);
  osc.stop(time + 2.6);

  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  const gain = ctx.createGain();
  gain.gain.value = 0.6;
  source.connect(filter).connect(gain).connect(out);
  source.start(time);
}

/* The score ------------------------------------------------------------------ */

function scheduleBar(index, time) {
  const chord = PROGRESSION[index % PROGRESSION.length];
  const pass = Math.floor(index / PROGRESSION.length);
  const full = section === 'roll';

  for (const note of chord.pad) pad(note, time, BAR + 1.2, full ? 0.03 : 0.035);
  bass(chord.bass, time, BAR + 0.2);
  if (!full) return;

  const tones = [...chord.pad.map((note) => note + 12), chord.pad[0] + 24];
  ARPEGGIO.forEach((tone, i) => bell(tones[tone], time + (i * BEAT) / 2, 0.035, 1.6));
  if (pass % 2 === 1) bell(MELODY[index % MELODY.length], time, 0.06, BAR * 1.2);
}

function scheduler() {
  while (nextBarTime < ctx.currentTime + LOOKAHEAD) {
    scheduleBar(nextBar, nextBarTime);
    nextBar++;
    nextBarTime += BAR;
  }
  timer = setTimeout(scheduler, 100);
}

function stopScore() {
  clearTimeout(timer);
  scoring = false;
}

function startScore() {
  stopScore();
  scoring = true;
  newBus();
  nextBar = 0;
  nextBarTime = ctx.currentTime + 0.1;
  scheduler();
}

/**
 * The last chord, a plain A minor left to ring and fade. If the score is
 * playing, the bar already under way finishes and the chord lands on the next
 * downbeat, so the music resolves instead of being cut off.
 */
function finalChord() {
  let time = ctx.currentTime + 0.1;
  if (scoring) time = Math.max(time, nextBarTime);
  else newBus();
  stopScore();
  bass(33, time, 9);
  for (const note of [45, 57, 60, 64]) pad(note, time, 9, 0.03);
  bell(69, time, 0.05, 6);
  bell(81, time + 0.6, 0.035, 6);
}

/* Public --------------------------------------------------------------------- */

/** Turns the music on or off. Call from a click or key press. */
export function setEnabled(value) {
  enabled = value;
  if (!ctx && (!value || !setup())) return;
  if (value) {
    ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.3);
    if (section === 'end') finalChord();
    else startScore();
  } else {
    stopScore();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  }
}

/** Follows the film: "intro" starts the score over, "roll" adds the arpeggio, "end" resolves. */
export function setSection(value) {
  const previous = section;
  section = value;
  if (!enabled || !ctx || value === previous) return;
  if (value === 'intro') startScore();
  if (value === 'end') finalChord();
  // "roll" needs nothing: the next bar the scheduler writes is the full one.
}

/** A hit under the title card. */
export function cue() {
  if (enabled && ctx) boom(ctx.currentTime + 0.05);
}

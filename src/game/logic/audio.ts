/**
 * Tiny WebAudio synth for match SFX.
 *
 * No asset files: every sound is generated from oscillators and noise buffers,
 * so the game stays a single bundle and nothing has to be preloaded. All
 * nodes hang off one lazily-created AudioContext that is only started after a
 * user gesture (browsers block autoplay otherwise).
 */

export const AUDIO_TUNING = {
  /** master gain for every SFX */
  master: 0.55,
  /** steady crowd murmur level */
  crowdBed: 0.05,
  /** crowd level at the peak of a goal roar */
  crowdRoar: 0.32,
  /** seconds for the roar to swell and decay */
  roarAttack: 0.25,
  roarDecay: 2.6,
  /** kick click length */
  kickDecay: 0.12,
  /** whistle tone */
  whistleHz: 2100,
  whistleDecay: 0.42,
} as const;

type Rig = {
  ctx: AudioContext;
  master: GainNode;
  crowdGain: GainNode;
};

let rig: Rig | null = null;
let enabled = true;

/** White-noise buffer reused by the crowd bed and kick transient. */
function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Creates (once) and resumes the audio graph. Safe to call repeatedly. */
export function initAudio(): void {
  if (typeof window === "undefined") return;
  if (!rig) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();

    const master = ctx.createGain();
    master.gain.value = AUDIO_TUNING.master;
    master.connect(ctx.destination);

    // Crowd bed: looped noise pushed through a low-pass so it reads as a
    // distant murmur rather than static.
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 4);
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.4;
    const crowdGain = ctx.createGain();
    crowdGain.gain.value = AUDIO_TUNING.crowdBed;
    src.connect(filter).connect(crowdGain).connect(master);
    src.start();

    rig = { ctx, master, crowdGain };
  }
  void rig.ctx.resume();
}

export function setAudioEnabled(on: boolean): void {
  enabled = on;
  if (rig) rig.master.gain.value = on ? AUDIO_TUNING.master : 0;
}

export const isAudioEnabled = () => enabled;

const live = (): Rig | null => (enabled && rig && rig.ctx.state === "running" ? rig : null);

/** Short percussive thump whose brightness scales with strike power (0..1). */
export function playKick(power = 0.6): void {
  const r = live();
  if (!r) return;
  const { ctx, master } = r;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180 + power * 120, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + AUDIO_TUNING.kickDecay);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35 + power * 0.35, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + AUDIO_TUNING.kickDecay);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + AUDIO_TUNING.kickDecay + 0.02);

  // Leather "snap" on top of the body.
  const snap = ctx.createBufferSource();
  snap.buffer = noiseBuffer(ctx, 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.25 + power * 0.2, t);
  sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  snap.connect(hp).connect(sg).connect(master);
  snap.start(t);
}

/** Referee whistle — two stacked detuned tones with a warble. */
export function playWhistle(): void {
  const r = live();
  if (!r) return;
  const { ctx, master } = r;
  const t = ctx.currentTime;
  const d = AUDIO_TUNING.whistleDecay;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
  gain.gain.setValueAtTime(0.3, t + d * 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
  gain.connect(master);

  // Warble LFO gives it the pea-in-the-whistle flutter.
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 26;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 55;
  lfo.connect(lfoGain);

  for (const detune of [0, 12]) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = AUDIO_TUNING.whistleHz + detune * 8;
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + d + 0.02);
  }
  lfo.start(t);
  lfo.stop(t + d + 0.02);
}

/** Swells the crowd bed into a roar, then settles back. */
export function playCrowdRoar(): void {
  const r = live();
  if (!r) return;
  const { ctx, crowdGain } = r;
  const t = ctx.currentTime;
  const g = crowdGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(g.value, 0.0001), t);
  g.linearRampToValueAtTime(AUDIO_TUNING.crowdRoar, t + AUDIO_TUNING.roarAttack);
  g.linearRampToValueAtTime(AUDIO_TUNING.crowdBed, t + AUDIO_TUNING.roarAttack + AUDIO_TUNING.roarDecay);
}

/** Short disappointed dip for a conceded goal. */
export function playCrowdGroan(): void {
  const r = live();
  if (!r) return;
  const { ctx, crowdGain } = r;
  const t = ctx.currentTime;
  const g = crowdGain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(g.value, 0.0001), t);
  g.linearRampToValueAtTime(AUDIO_TUNING.crowdBed * 2.4, t + 0.3);
  g.linearRampToValueAtTime(AUDIO_TUNING.crowdBed * 0.4, t + 1.6);
  g.linearRampToValueAtTime(AUDIO_TUNING.crowdBed, t + 3.2);
}

/**
 * Card sting for a booking. Yellow is a single mid chirp; red is a lower,
 * harsher double stab so a sending-off is unmistakable even without looking.
 */
export function playCard(color: "yellow" | "red"): void {
  const r = live();
  if (!r) return;
  const { ctx, master } = r;
  const t0 = ctx.currentTime;
  const hits = color === "red" ? [0, 0.17] : [0];
  const base = color === "red" ? 320 : 640;

  for (const offset of hits) {
    const t = t0 + offset;
    const osc = ctx.createOscillator();
    osc.type = color === "red" ? "sawtooth" : "square";
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.6, t + 0.16);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(color === "red" ? 0.3 : 0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}

/** Rising two-note fanfare when a corner or penalty is awarded. */
export function playAward(kind: "corner" | "penalty" | "freekick" = "corner"): void {
  const r = live();
  if (!r) return;
  const { ctx, master } = r;
  const t0 = ctx.currentTime;
  const notes = kind === "penalty" ? [440, 660, 880] : [520, 780];

  notes.forEach((hz, i) => {
    const t = t0 + i * 0.11;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + 0.24);
  });
}

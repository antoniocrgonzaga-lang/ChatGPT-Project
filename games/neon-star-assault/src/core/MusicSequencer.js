const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORD = { min: [0, 3, 7, 12], maj: [0, 4, 7, 12], sus: [0, 5, 7, 12] };

const X = 1;
const _ = 0;

/**
 * Track data. `prog` lists [rootOffset, chordQuality] per bar, patterns are 16 steps (1/16 notes).
 * `bass` entries are semitone offsets from the bar root (null = rest).
 */
const TRACKS = {
  title: {
    bpm: 92, root: 45, arpOctave: 2, arpWave: 'triangle', leadWave: 'sine',
    prog: [[0, 'min'], [-4, 'maj'], [-7, 'maj'], [-2, 'maj']],
    bass: [0, null, null, null, null, null, null, null, 0, null, null, null, 7, null, null, null],
    kick: [X, _, _, _, _, _, _, _, X, _, _, _, _, _, _, _],
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hat: [_, _, X, _, _, _, X, _, _, _, X, _, _, _, X, _],
    arpEvery: 2,
  },
  stage1: {
    bpm: 116, root: 45, arpOctave: 2, arpWave: 'square', leadWave: 'triangle',
    prog: [[0, 'min'], [-4, 'maj'], [-2, 'maj'], [-5, 'min']],
    bass: [0, null, 0, null, 12, null, 0, null, 0, null, 0, 12, null, 7, null, 10],
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [_, _, X, _, _, _, X, _, _, _, X, _, _, _, X, X],
    arpEvery: 1,
  },
  boss1: {
    bpm: 138, root: 45, arpOctave: 2, arpWave: 'sawtooth', leadWave: 'square',
    prog: [[0, 'min'], [0, 'min'], [1, 'maj'], [-2, 'maj']],
    bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 13, 12, 10, 7],
    kick: [X, _, _, _, X, _, _, _, X, _, _, _, X, _, X, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, X],
    hat: [X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    arpEvery: 1,
  },
  stage2: {
    bpm: 128, root: 38, arpOctave: 3, arpWave: 'sawtooth', leadWave: 'square',
    prog: [[0, 'min'], [1, 'maj'], [-2, 'maj'], [0, 'sus']],
    bass: [0, null, 0, 0, null, 0, 12, null, 0, null, 0, 0, null, 1, 0, null],
    kick: [X, _, _, X, X, _, _, _, X, _, _, X, X, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [_, X, X, _, _, X, X, _, _, X, X, _, _, X, X, X],
    arpEvery: 1,
  },
  boss2: {
    bpm: 146, root: 38, arpOctave: 3, arpWave: 'sawtooth', leadWave: 'sawtooth',
    prog: [[0, 'min'], [1, 'maj'], [0, 'min'], [-1, 'maj']],
    bass: [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 1, 13, 1, 12],
    kick: [X, _, X, _, X, _, X, _, X, _, X, _, X, _, X, X],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, X, _],
    hat: [X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    arpEvery: 1,
  },
  stage3: {
    bpm: 122, root: 40, arpOctave: 2, arpWave: 'triangle', leadWave: 'square',
    prog: [[0, 'min'], [3, 'maj'], [-2, 'maj'], [5, 'sus']],
    bass: [0, null, 0, 7, null, 0, 12, null, 0, null, 0, 7, 10, null, 7, null],
    kick: [X, _, _, _, X, _, _, X, X, _, _, _, X, _, _, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [_, _, X, X, _, _, X, _, _, _, X, X, _, _, X, _],
    arpEvery: 1,
  },
  boss3: {
    bpm: 150, root: 40, arpOctave: 3, arpWave: 'sawtooth', leadWave: 'square',
    prog: [[0, 'min'], [-4, 'maj'], [-2, 'maj'], [-1, 'maj']],
    bass: [0, 0, 12, 0, 0, 12, 7, 0, 0, 0, 12, 0, 10, 12, 7, 3],
    kick: [X, _, _, X, X, _, X, _, X, _, _, X, X, _, X, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, X],
    hat: [X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    arpEvery: 1,
  },
  stage4: {
    bpm: 112, root: 38, arpOctave: 2, arpWave: 'triangle', leadWave: 'sawtooth',
    prog: [[0, 'min'], [1, 'maj'], [-4, 'maj'], [-2, 'sus']],
    bass: [0, null, null, 0, null, null, 7, null, 0, null, null, 0, null, 12, 10, null],
    kick: [X, _, _, _, _, _, X, _, X, _, _, _, _, _, X, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [_, _, X, _, _, _, X, _, _, _, X, _, _, _, X, X],
    arpEvery: 1,
  },
  boss4: {
    bpm: 154, root: 38, arpOctave: 3, arpWave: 'sawtooth', leadWave: 'square',
    prog: [[0, 'min'], [1, 'maj'], [0, 'min'], [-2, 'maj']],
    bass: [0, 0, 12, 0, 1, 0, 12, 0, 0, 0, 12, 0, 13, 12, 10, 7],
    kick: [X, _, X, _, X, _, _, X, X, _, X, _, X, _, X, X],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, X],
    hat: [X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    arpEvery: 1,
  },
  escape: {
    bpm: 160, root: 40, arpOctave: 3, arpWave: 'square', leadWave: 'sawtooth',
    prog: [[0, 'min'], [-2, 'maj'], [-4, 'maj'], [-5, 'maj']],
    bass: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12],
    kick: [X, _, X, _, X, _, X, _, X, _, X, _, X, _, X, _],
    snare: [_, _, _, _, X, _, _, _, _, _, _, _, X, _, _, _],
    hat: [X, X, X, X, X, X, X, X, X, X, X, X, X, X, X, X],
    arpEvery: 1,
  },
};

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

/**
 * Small step sequencer that renders the soundtrack procedurally.
 * Intensity 0 = pad + bass, 1 = + drums & arpeggio, 2 = + lead and slightly faster tempo.
 */
export class MusicSequencer {
  constructor(ctx, output, noiseBuffer) {
    this.ctx = ctx;
    this.noiseBuffer = noiseBuffer;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(output);

    // shared echo for the arpeggio / lead
    this.delay = ctx.createDelay(1);
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.32;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.35;
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFeedback).connect(this.delay);
    this.delay.connect(this.out);

    this.track = null;
    this.timer = null;
    this.intensity = 1;
    this.step = 0;
    this.nextTime = 0;
  }

  play(name) {
    const track = TRACKS[name];
    if (!track) return;
    if (this.track === track && this.timer) return;
    this.track = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.delay.delayTime.value = (60 / track.bpm) * 0.75;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(1, t, 0.3);
    if (!this.timer) this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  setIntensity(level) {
    this.intensity = level;
  }

  get stepDuration() {
    const speedUp = this.intensity >= 2 ? 1.08 : 1;
    return 60 / (this.track.bpm * speedUp) / 4;
  }

  schedule() {
    if (!this.track) return;
    // if the tab was suspended, skip ahead instead of firing a burst of notes
    if (this.nextTime < this.ctx.currentTime - 0.3) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDuration;
      this.step++;
    }
  }

  playStep(step, t) {
    const tr = this.track;
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % tr.prog.length;
    const [rootOffset, quality] = tr.prog[bar];
    const root = tr.root + rootOffset;
    const chord = CHORD[quality];
    const lvl = this.intensity;

    if (s16 === 0) this.pad(root + 12, chord, t, this.stepDuration * 16);
    if (tr.bass[s16] !== null) this.bass(root + tr.bass[s16], t, this.stepDuration * 1.8, lvl);

    if (lvl >= 1) {
      if (tr.kick[s16]) this.kick(t);
      if (tr.snare[s16]) this.snare(t);
      if (tr.hat[s16]) this.hat(t, s16 % 4 === 2 ? 0.07 : 0.04);
      if (s16 % tr.arpEvery === 0) {
        const idx = Math.floor(step / tr.arpEvery) % 8;
        const note = root + 12 * tr.arpOctave + chord[[0, 1, 2, 3, 2, 1, 2, 3][idx]];
        this.pluck(note, t, tr.arpWave, 0.035);
      }
    }
    if (lvl >= 2 && (s16 === 0 || s16 === 6 || s16 === 10)) {
      const note = root + 12 * (tr.arpOctave + 1) + chord[(bar + s16) % 3];
      this.lead(note, t, this.stepDuration * (s16 === 10 ? 6 : 5), tr.leadWave);
    }
  }

  voice(type, freq, t, dur, peak, { filter = null, send = false, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      node.connect(filter);
      node = filter;
    }
    node.connect(g);
    g.connect(this.out);
    if (send) g.connect(this.delaySend);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  lowpass(freq, q = 1) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  pad(root, chord, t, dur) {
    for (let i = 0; i < 3; i++) {
      const f = midiToFreq(root + chord[i]);
      this.voice('sawtooth', f, t, dur, 0.018, { filter: this.lowpass(900), detune: -7 });
      this.voice('sawtooth', f, t, dur, 0.018, { filter: this.lowpass(900), detune: 7 });
    }
  }

  bass(note, t, dur, lvl) {
    this.voice('sawtooth', midiToFreq(note), t, dur, 0.11, { filter: this.lowpass(320 + lvl * 260, 6) });
    this.voice('sine', midiToFreq(note - 12), t, dur, 0.08);
  }

  pluck(note, t, wave, peak) {
    this.voice(wave, midiToFreq(note), t, 0.16, peak, { filter: this.lowpass(3200), send: true });
  }

  lead(note, t, dur, wave) {
    this.voice(wave, midiToFreq(note), t, dur, 0.035, { filter: this.lowpass(2400, 2), send: true, detune: 5 });
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  noiseHit(t, dur, peak, type, freq) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  snare(t) {
    this.noiseHit(t, 0.16, 0.16, 'bandpass', 1900);
    this.voice('triangle', 190, t, 0.1, 0.07);
  }

  hat(t, peak) {
    this.noiseHit(t, 0.045, peak, 'highpass', 7500);
  }
}

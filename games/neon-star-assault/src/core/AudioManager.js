import { AUDIO } from '../config/gameConfig.js';
import { MusicSequencer } from './MusicSequencer.js';

/**
 * Optional audio files. Any name listed here replaces the procedural version once decoded.
 * Example: { explosion: 'assets/audio/explosion.ogg', 'music:stage1': 'assets/audio/stage1.ogg' }
 * Missing or broken files are reported in the console and the procedural sound is kept.
 */
export const AUDIO_FILES = {};

const MIN_INTERVAL = { enemyShoot: 0.05, hit: 0.03, shoot: 0.03, explosionSmall: 0.04 };

/**
 * Procedural sound effects (Web Audio API) with a hook for sample overrides.
 * The AudioContext is created lazily on the first user interaction (browser autoplay rules).
 */
export class AudioManager {
  constructor(settings = {}) {
    this.ctx = null;
    this.volumes = {
      master: settings.master ?? AUDIO.master,
      sfx: settings.sfx ?? AUDIO.sfx,
      music: settings.music ?? AUDIO.music,
    };
    this.muted = settings.muted ?? AUDIO.muted;
    this.samples = new Map();
    this.lastPlayed = {};
    this.charge = null;
    this.music = null;
    this.musicSource = null;
    this.pendingTrack = null;
  }

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      console.warn('Web Audio API indisponível — jogo seguirá sem som.');
      return;
    }
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -14;
    this.compressor.ratio.value = 4;
    this.masterGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.musicGain.connect(this.masterGain);
    this.masterGain.connect(this.compressor).connect(ctx.destination);
    this.applyVolumes();

    this.noiseBuffer = this.createNoiseBuffer(2);
    this.music = new MusicSequencer(ctx, this.musicGain, this.noiseBuffer);
    this.loadFiles();
    if (this.pendingTrack) this.playMusic(this.pendingTrack);
  }

  createNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  async loadFiles() {
    for (const [name, url] of Object.entries(AUDIO_FILES)) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.samples.set(name, buf);
      } catch (err) {
        console.warn(`Áudio "${name}" (${url}) não carregou; usando som procedural.`, err);
      }
    }
  }

  // ------------------------------------------------------------ volume
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.03);
    this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, t, 0.03);
    this.musicGain.gain.setTargetAtTime(this.volumes.music, t, 0.03);
  }

  setVolume(kind, value) {
    this.volumes[kind] = Math.max(0, Math.min(1, value));
    this.applyVolumes();
  }

  setMuted(muted) {
    this.muted = muted;
    this.applyVolumes();
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // ------------------------------------------------------------ primitives
  env(gainNode, t, attack, peak, decay, sustainEnd = 0.0001) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.exponentialRampToValueAtTime(sustainEnd, t + attack + decay);
  }

  osc(type, freqStart, freqEnd, duration, peak, { attack = 0.005, dest = this.sfxGain, delay = 0, detune = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + duration);
    this.env(g, t, attack, peak, duration);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + duration + 0.05);
    return o;
  }

  noise(duration, peak, { type = 'lowpass', freqStart = 2000, freqEnd = 200, q = 0.8, attack = 0.005, delay = 0 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freqStart, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 20), t + duration);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, duration);
    src.connect(filter).connect(g).connect(this.sfxGain);
    src.start(t, Math.random());
    src.stop(t + attack + duration + 0.05);
  }

  playBuffer(buffer, volume = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfxGain);
    src.start();
  }

  // ------------------------------------------------------------ public sfx API
  play(name, options = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const minGap = MIN_INTERVAL[name];
    if (minGap && now - (this.lastPlayed[name] ?? -1) < minGap) return;
    this.lastPlayed[name] = now;

    const sample = this.samples.get(name);
    if (sample) {
      this.playBuffer(sample, options.volume ?? 1);
      return;
    }
    const fn = this.sfx[name];
    if (fn) fn.call(this, options);
    else console.warn(`Som desconhecido: ${name}`);
  }

  sfx = {
    shoot({ pitch = 1 } = {}) {
      const p = pitch * (1 + (Math.random() - 0.5) * 0.08);
      this.osc('square', 1300 * p, 260 * p, 0.07, 0.07);
      this.osc('sawtooth', 2600 * p, 900 * p, 0.04, 0.025);
    },
    enemyShoot() {
      this.osc('triangle', 520, 190, 0.12, 0.05);
    },
    chargedShot({ power = 1 } = {}) {
      this.osc('sawtooth', 260, 55, 0.45 + power * 0.2, 0.22);
      this.osc('square', 520, 110, 0.3, 0.08);
      this.noise(0.45, 0.25, { freqStart: 5000, freqEnd: 300 });
    },
    hit() {
      this.noise(0.05, 0.08, { type: 'highpass', freqStart: 3000, freqEnd: 2000 });
    },
    deflect() {
      this.osc('sine', 1800, 2400, 0.08, 0.06);
    },
    explosionSmall() {
      this.noise(0.35, 0.35, { freqStart: 2400, freqEnd: 120 });
      this.osc('sine', 140, 40, 0.25, 0.3);
    },
    explosion({ size = 1 } = {}) {
      const d = 0.5 + size * 0.5;
      this.noise(d, 0.45, { freqStart: 1800, freqEnd: 60 });
      this.osc('sine', 110, 30, d * 0.8, 0.5);
      this.noise(d * 0.6, 0.2, { type: 'bandpass', freqStart: 900, freqEnd: 150, q: 2, delay: 0.06 });
    },
    explosionHuge() {
      this.noise(2.6, 0.6, { freqStart: 1500, freqEnd: 40, attack: 0.02 });
      this.osc('sine', 80, 22, 2.2, 0.7);
      this.osc('sawtooth', 60, 25, 1.6, 0.12);
      this.noise(1.2, 0.3, { type: 'bandpass', freqStart: 600, freqEnd: 100, q: 3, delay: 0.3 });
    },
    pickup() {
      [0, 0.06, 0.12].forEach((d, i) => this.osc('square', 660 * Math.pow(1.26, i), 660 * Math.pow(1.26, i), 0.09, 0.07, { delay: d }));
      this.osc('sine', 1760, 1760, 0.25, 0.05, { delay: 0.18 });
    },
    hurt() {
      this.osc('sawtooth', 320, 70, 0.4, 0.3);
      this.noise(0.3, 0.3, { freqStart: 3000, freqEnd: 300 });
    },
    shield() {
      this.osc('sine', 900, 1600, 0.3, 0.14);
      this.osc('sine', 1350, 2200, 0.3, 0.08, { detune: 12 });
    },
    shieldBreak() {
      this.osc('triangle', 1600, 300, 0.4, 0.2);
      this.noise(0.3, 0.2, { type: 'highpass', freqStart: 6000, freqEnd: 1500 });
    },
    dodge() {
      this.noise(0.32, 0.25, { type: 'bandpass', freqStart: 350, freqEnd: 3200, q: 1.5 });
    },
    bomb() {
      this.osc('sine', 200, 30, 1.4, 0.6);
      this.noise(1.6, 0.45, { freqStart: 6000, freqEnd: 80, attack: 0.03 });
      this.osc('sawtooth', 90, 40, 1.0, 0.1);
    },
    alert() {
      for (let i = 0; i < 3; i++) {
        this.osc('square', 880, 880, 0.13, 0.07, { delay: i * 0.32 });
        this.osc('square', 660, 660, 0.13, 0.07, { delay: i * 0.32 + 0.16 });
      }
    },
    warning() {
      this.osc('sawtooth', 440, 440, 0.18, 0.05);
      this.osc('sawtooth', 440, 440, 0.18, 0.05, { delay: 0.25 });
    },
    telegraph() {
      this.osc('sine', 300, 1200, 0.6, 0.08);
    },
    beam() {
      this.osc('sawtooth', 90, 70, 0.9, 0.2);
      this.noise(0.9, 0.25, { type: 'bandpass', freqStart: 1200, freqEnd: 800, q: 4 });
    },
    ring() {
      this.osc('sine', 1318, 1318, 0.35, 0.09);
      this.osc('sine', 1976, 1976, 0.35, 0.06, { delay: 0.05 });
    },
    lock() {
      this.osc('square', 1500, 1500, 0.05, 0.04);
      this.osc('square', 2000, 2000, 0.05, 0.04, { delay: 0.06 });
    },
    stageChange() {
      [0, 4, 7, 12].forEach((s, i) => this.osc('sawtooth', 220 * Math.pow(2, s / 12), 440 * Math.pow(2, s / 12), 1.2, 0.05, { delay: i * 0.12 }));
      this.noise(2, 0.15, { type: 'bandpass', freqStart: 200, freqEnd: 6000, q: 1 });
    },
    warp() {
      this.osc('sawtooth', 60, 900, 2.5, 0.12, { attack: 0.6 });
      this.noise(2.8, 0.2, { type: 'bandpass', freqStart: 300, freqEnd: 5000, q: 2, attack: 0.5 });
    },
    victory() {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.osc('square', 523 * Math.pow(2, s / 12), 523 * Math.pow(2, s / 12), 0.3, 0.06, { delay: i * 0.11 }));
      this.osc('triangle', 1046, 1046, 1.4, 0.1, { delay: 0.8 });
    },
    defeat() {
      [0, -3, -7, -12].forEach((s, i) => this.osc('sawtooth', 330 * Math.pow(2, s / 12), 300 * Math.pow(2, s / 12), 0.45, 0.08, { delay: i * 0.3 }));
    },
    menuMove() {
      this.osc('square', 900, 900, 0.04, 0.04);
    },
    menuSelect() {
      this.osc('square', 700, 1400, 0.12, 0.06);
    },
    pause() {
      this.osc('triangle', 600, 300, 0.15, 0.08);
    },
  };

  // ------------------------------------------------------------ charge loop
  startCharge() {
    if (!this.ctx || this.charge) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o2.type = 'sine';
    o.frequency.value = 120;
    o2.frequency.value = 240;
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.05);
    o.connect(g);
    o2.connect(g);
    g.connect(this.sfxGain);
    o.start();
    o2.start();
    this.charge = { o, o2, g };
  }

  setChargeLevel(level) {
    if (!this.charge) return;
    const t = this.ctx.currentTime;
    this.charge.o.frequency.setTargetAtTime(120 + level * 380, t, 0.05);
    this.charge.o2.frequency.setTargetAtTime(240 + level * 900 + (level >= 1 ? Math.sin(t * 40) * 40 : 0), t, 0.02);
  }

  stopCharge() {
    if (!this.charge) return;
    const { o, o2, g } = this.charge;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.03);
    o.stop(t + 0.2);
    o2.stop(t + 0.2);
    this.charge = null;
  }

  // ------------------------------------------------------------ music
  playMusic(track) {
    this.pendingTrack = track;
    if (!this.ctx) return;
    this.stopMusicSource();
    const file = this.samples.get(`music:${track}`);
    if (file) {
      this.music.stop();
      const src = this.ctx.createBufferSource();
      src.buffer = file;
      src.loop = true;
      src.connect(this.musicGain);
      src.start();
      this.musicSource = src;
      return;
    }
    this.music.play(track);
  }

  setMusicIntensity(level) {
    if (this.music) this.music.setIntensity(level);
  }

  stopMusic() {
    this.pendingTrack = null;
    this.stopMusicSource();
    if (this.music) this.music.stop();
  }

  stopMusicSource() {
    if (this.musicSource) {
      this.musicSource.stop();
      this.musicSource = null;
    }
  }
}

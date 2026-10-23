import * as THREE from 'three';

export const TAU = Math.PI * 2;

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (p) => Math.random() < p;

/** Deterministic PRNG (mulberry32) used for scenery so layouts stay stable between runs. */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
  };
}

const _seg = new THREE.Vector3();
const _toC = new THREE.Vector3();

/** Squared distance from point c to segment a-b. */
export function segmentPointDistSq(a, b, c) {
  _seg.subVectors(b, a);
  _toC.subVectors(c, a);
  const lenSq = _seg.lengthSq();
  let t = lenSq > 1e-8 ? _toC.dot(_seg) / lenSq : 0;
  t = clamp(t, 0, 1);
  _seg.multiplyScalar(t).add(a);
  return _seg.distanceToSquared(c);
}

/** Approximate shortest distance between two segments by sampling (good enough for beams). */
export function segmentSegmentDistSq(a0, a1, b0, b1, samples = 8) {
  let best = Infinity;
  const p = _sample;
  for (let i = 0; i <= samples; i++) {
    p.lerpVectors(a0, a1, i / samples);
    const d = segmentPointDistSq(b0, b1, p);
    if (d < best) best = d;
  }
  return best;
}
const _sample = new THREE.Vector3();

export function formatScore(n) {
  return Math.floor(n).toString().padStart(8, '0');
}

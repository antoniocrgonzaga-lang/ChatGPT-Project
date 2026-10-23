import { createRng } from './math.js';

/**
 * Seeded 2D value noise + fractal helpers for CPU-side texture generation (loading time only).
 */
export function createNoise2D(seed = 1) {
  const rng = createRng(seed);
  const SIZE = 256;
  const values = new Float32Array(SIZE);
  const perm = new Uint8Array(SIZE * 2);
  for (let i = 0; i < SIZE; i++) {
    values[i] = rng.next();
    perm[i] = i;
  }
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < SIZE; i++) perm[i + SIZE] = perm[i];

  const lattice = (x, y) => values[perm[(x & 255) + perm[y & 255]]];
  const fade = (t) => t * t * (3 - 2 * t);

  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const a = lattice(xi, yi);
    const b = lattice(xi + 1, yi);
    const c = lattice(xi, yi + 1);
    const d = lattice(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Fractal sum, roughly 0..1. Octaves are rotated to hide the lattice. */
  function fbm(x, y, octaves = 5) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noise(x, y);
      norm += amp;
      const nx = x * 1.6 - y * 1.2;
      y = x * 1.2 + y * 1.6;
      x = nx;
      amp *= 0.5;
    }
    return sum / norm;
  }

  /** Ridged fractal: bright thin creases, used for gas filaments. */
  function ridged(x, y, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      let r = 1 - Math.abs(noise(x, y) * 2 - 1);
      r *= r;
      sum += amp * r;
      norm += amp;
      const nx = x * 1.6 - y * 1.2;
      y = x * 1.2 + y * 1.6;
      x = nx;
      amp *= 0.5;
    }
    return sum / norm;
  }

  return { noise, fbm, ridged };
}

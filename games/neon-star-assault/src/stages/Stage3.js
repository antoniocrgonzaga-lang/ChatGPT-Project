import * as THREE from 'three';
import { RailFrame } from '../systems/Rail.js';
import { EclipseSovereign } from '../entities/bosses/EclipseSovereign.js';
import { BlackHole } from '../scenery/BlackHole.js';
import { COLORS, PLAYER } from '../config/gameConfig.js';
import { rand, smoothstep, clamp, TAU } from '../utils/math.js';

/*
 * STAGE 3 — SINGULARITY CROWN
 * Art direction: cold space (navy, teal, ice-white) around the black hole Nyx, whose gold/orange
 * accretion disk is harvested by the Sovereign's crystal lattice. Enemy tech is gold/amber so it
 * reads against the cool palette. Shape language: crystals, rings, halos, concentric circles.
 */

const MAIN_LENGTH = 9800;
const S = (d) => d + 200;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const B = PLAYER.bounds;
const WELL_RADIUS = 2.2;
const WELL_PULL = 12; // peak pull (units/s) of a gravity well at close range (ship max speed is 21)
const COOL = [0x3ad8ff, 0x7af0ff, 0x2d6bff];

/** Baked sky (see scenery/NebulaSkybox.js): teal gas ahead around Nyx, gold dust aside, blue behind. */
const SINGULARITY_SKY = {
  id: 'singularity-crown',
  seed: 7.3,
  spaceTop: [0x0a2a4a, 0.3],
  spaceBottom: [0x02060e, 0.6],
  bandNormal: [-0.4, 1, 0.2],
  bandColor: [0x5a8ad0, 0.13],
  filament: [0x7af0ff, 0.9],
  dust: 0.75,
  regions: [
    { dir: [0.1, 0.15, -1], cone: [0.2, 0.85], strength: 1, deep: [0x06304a, 0.45], mid: [0x1a8ab0, 0.65], hot: [0x7af0ff, 0.95], core: [0xf0ffff, 1.5] },
    { dir: [1, 0.3, -0.2], cone: [0.35, 0.85], strength: 0.8, deep: [0x2a1a06, 0.45], mid: [0x8a5a1a, 0.6], hot: [0xffc070, 0.85], core: [0xfff0d0, 1.3] },
    { dir: [-0.3, -0.2, 1], cone: [0.3, 0.85], strength: 0.85, deep: [0x061a4a, 0.4], mid: [0x2a4ae8, 0.55], hot: [0x70a0ff, 0.75], core: [0xe0e8ff, 1.3] },
  ],
};

// ------------------------------------------------------------------ path
function buildPath() {
  const points = [];
  for (let d = -200; d <= MAIN_LENGTH; d += 250) {
    const dd = Math.max(0, d);
    const calm = 1 - smoothstep(6800, 7100, dd);
    const x = (Math.sin(dd * 0.001 + 0.7) * 130 + Math.sin(dd * 0.00037) * 170) * (0.25 + 0.75 * calm);
    const y = (Math.sin(dd * 0.0007 + 1.2) * 40 - dd * 0.006) * calm - (1 - calm) * 42;
    points.push(new THREE.Vector3(x, y, -d));
  }
  return { main: points };
}

// ------------------------------------------------------------------ scenery pieces
function farCrystals(kit, c, count, min = 45, max = 160) {
  const rng = c.rng;
  for (let i = 0; i < count; i++) {
    const cr = kit.crystal(rng, rng.range(3, 9));
    c.at(rng.range(0, c.length), rng.sign() * rng.range(min, max), rng.range(-50, 60), 0, cr.position);
    c.add(cr);
    const spin = rng.range(-0.2, 0.2);
    c.animate((dt) => (cr.rotation.y += spin * dt));
  }
}

/** Decorative halo far off the lane (`lateral` is measured from the ring's edge, not its centre). */
function haloRing(kit, c, radius, lateral, y, mat) {
  const ring = kit.mesh(kit.G.torusThin, mat, null, radius);
  kit.place(ring, c.frame(c.rng.range(0, c.length)), Math.sign(lateral) * (Math.abs(lateral) + radius), y, 0);
  ring.rotateY(c.rng.range(-1.2, 1.2));
  c.add(ring);
  const spin = c.rng.range(-0.15, 0.15);
  c.animate((dt) => ring.rotateZ(spin * dt));
  return ring;
}

function horizonZone(kit, c) {
  const rng = c.rng;
  farCrystals(kit, c, 3);
  if (rng.chance(0.5)) haloRing(kit, c, rng.range(40, 80), rng.sign() * rng.range(120, 200), rng.range(-20, 50), rng.chance(0.5) ? kit.M.dimCyan : kit.M.dimGold);
  if (rng.chance(0.25)) {
    const wreck = kit.wreck(rng, rng.range(80, 140), kit.M.glowCyan);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(120, 220), rng.range(-40, 40), 0, wreck.position);
    c.add(wreck);
  }
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineCyan, step: 14 }));
}

function crystalField(kit, c) {
  const rng = c.rng;
  farCrystals(kit, c, 5, 32, 130);
  if (c.s0 < S(1360)) return;
  const p = c.progress;
  const count = 3 + Math.floor(p * 3);
  for (let i = 0; i < count; i++) {
    const o = ((i + rng.range(0.1, 0.9)) / count) * c.length;
    kit.crystalObstacle(c, o, rng.range(-15, 15), rng.range(-9, 9), rng.range(1.3, 2.6), rng);
  }
  if (p > 0.7) {
    // the field closes in: tall crystal walls on both sides of the lane
    for (let i = 0; i < 4; i++) kit.crystalObstacle(c, rng.range(0, c.length), (i % 2 ? 1 : -1) * rng.range(17, 22), rng.range(-9, 9), rng.range(3.5, 5), rng);
  }
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineCyan, step: 18 }));
}

/** Halo gate: a ring frame with two crystal bars rotating across it — fly between the bars. */
function haloGate(kit, c, ctx, o) {
  const M = kit.M;
  const G = kit.G;
  const gate = new THREE.Group();
  kit.place(gate, c.frame(o), 0, 0, 0);
  gate.add(kit.mesh(G.torus, M.enemyHull, null, [30, 30, 40]));
  gate.add(kit.mesh(G.torusThin, M.trimGold, null, 28.6));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    gate.add(kit.mesh(G.octa, M.glowGold, [Math.cos(a) * 30, Math.sin(a) * 30, 0], [0.7, 1.4, 0.7], [0, 0, a]));
  }
  const rotor = new THREE.Group();
  gate.add(rotor);
  const colliders = [];
  for (const a of [0, Math.PI / 2]) {
    const bar = kit.mesh(G.box, M.crystal, null, [58, 2.6, 2]);
    bar.rotation.z = a;
    rotor.add(bar);
    colliders.push({ type: 'box', node: bar });
  }
  const hub = kit.mesh(G.octa, M.crystal, null, 3.2);
  rotor.add(hub);
  colliders.push({ type: 'sphere', node: hub, radius: 3 });
  const speed = (c.rng.chance(0.5) ? 1 : -1) * c.rng.range(0.35, 0.6);
  rotor.rotation.z = c.rng.range(0, Math.PI);
  ctx.game.obstacles.add(gate, { colliders, damage: 1, update: (dt) => (rotor.rotation.z += speed * dt) });
  const gatePos = gate.position.clone();
  let warned = false;
  c.animate(() => {
    if (warned || gatePos.distanceTo(ctx.game.player.worldPosition) > ctx.game.rail.speed * 3.2) return;
    warned = true;
    ctx.game.hud.warning('HALO GATE — FLY BETWEEN THE BARS', 1.4);
    ctx.game.audio.play('warning');
  });
}

function haloGates(kit, c, ctx) {
  const rng = c.rng;
  farCrystals(kit, c, 2, 60, 170);
  if (rng.chance(0.4)) haloRing(kit, c, rng.range(50, 90), rng.sign() * rng.range(120, 200), rng.range(-10, 60), kit.M.dimGold);
  if (c.s0 > S(2950) && Math.floor(c.s0 / 100) % 3 === 0) haloGate(kit, c, ctx, 50);
  else kit.bonusRing(c, 50, Math.sin(c.s0 * 0.004) * 8, Math.cos(c.s0 * 0.003) * 5, 4.5, kit.M.glowCyan);
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineOrange, step: 16 }));
}

/** A small singularity in the lane; its pull is applied in Stage3.update. */
function gravityWell(kit, c, ctx, o, x, y) {
  const bh = new BlackHole(ctx.game.assets, { radius: WELL_RADIUS, diskInner: 3, diskOuter: 7.5, tilt: 1.1, intensity: 1 });
  const group = bh.group;
  c.at(o, x, y, 0, group.position);
  const obs = ctx.game.obstacles.add(group, {
    colliders: [{ type: 'sphere', node: group, radius: WELL_RADIUS }],
    damage: 1,
    update: (dt) => bh.update(dt, ctx.game.camera, 1.5),
  });
  obs.disposeFn = () => bh.dispose();
  obs.cullBehind = 40;
  ctx.state.wells.push({ obs, warned: false });
}

function wellsZone(kit, c, ctx) {
  const rng = c.rng;
  farCrystals(kit, c, 3);
  if (c.s0 > S(4380) && rng.chance(0.6)) gravityWell(kit, c, ctx, 50, rng.range(-9, 9), rng.range(-5, 5));
  if (rng.chance(0.5)) {
    // crystal platforms with turrets bolted on (turrets come from events; these are the anchors)
    const plat = kit.mesh(kit.G.cylinderHex, kit.M.enemyPlate, null, [12, 2, 12]);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(40, 80), rng.range(-25, -10), 0, plat.position);
    c.add(plat);
    const cr = kit.crystal(rng, 4);
    cr.position.copy(plat.position).add(_v.set(0, 5, 0));
    c.add(cr);
  }
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineViolet, step: 15 }));
}

/** Open crystal lattice tunnel: hexagonal frames of glowing bars with gold joints. */
function latticeTunnel(kit, c) {
  const M = kit.M;
  const G = kit.G;
  const radius = 26;
  const side = 2 * radius * Math.tan(Math.PI / 6);
  for (let o = 0; o < c.length; o += 30) {
    const frame = new THREE.Group();
    kit.place(frame, c.frame(o), 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 6) * TAU + Math.PI / 6;
      pivot.add(kit.mesh(G.box, M.crystal, [0, radius, 0], [side, 0.9, 0.9]));
      pivot.add(kit.mesh(G.octa, M.glowGold, [side / 2, radius, 0], 1.1));
      frame.add(pivot);
    }
    if (Math.floor((c.s0 + o) / 30) % 2 === 0) frame.add(kit.mesh(G.torusThin, M.dimCyan, null, radius * 0.9));
    c.add(frame);
  }
  farCrystals(kit, c, 2, 50, 120);
}

function crownZone(kit, c) {
  const rng = c.rng;
  // kept sparse on purpose: the boss and Nyx are the focus of the arena
  farCrystals(kit, c, 2, 90, 180);
  c.add(kit.vectorGrid(c, { y: -26, mat: kit.M.lineOrange, step: 12, halfWidth: 70 }));
}

// ------------------------------------------------------------------ set pieces
function latticeBeams({ game }, axis) {
  const f = game.rail.frameAhead(game.rail.speed * 1.75, new RailFrame());
  const lanes = axis === 'h' ? [-6, 0, 6] : [-10, 0, 10];
  const safe = Math.floor(Math.random() * 3);
  lanes.forEach((lane, i) => {
    if (i === safe) return;
    const start = axis === 'h' ? f.localToWorld(-40, lane, 0, new THREE.Vector3()) : f.localToWorld(lane, -30, 0, new THREE.Vector3());
    const end = axis === 'h' ? f.localToWorld(40, lane, 0, new THREE.Vector3()) : f.localToWorld(lane, 30, 0, new THREE.Vector3());
    game.obstacles.fireBeam({ start, end, local: false, warn: 1.25, fire: 0.8, radius: 1.5, color: 0x7af0ff });
  });
  game.hud.warning('LATTICE BEAMS!', 1.2);
  game.audio.play('telegraph');
}

const wave = (at, enemy, formation, count, extra = {}) => ({ at: S(at), type: 'wave', enemy, formation, count, ...extra });
const ev = (at, type, extra = {}) => ({ at: S(at), type, ...extra });
const lancer = (at, x, y, extra = {}) => ev(at, 'enemy', { enemy: 'prismLancer', x, y, z: -240, ...extra });

export const Stage3 = {
  id: 3,
  name: 'SINGULARITY CROWN',
  subtitle: 'Nyx event horizon',
  seed: 3301,
  bossMusic: 'boss3',
  outro: 'cutscene', // Nyx collapses, then the warp tunnel leads to Stage 4
  ending: 'singularity',
  buildPath,
  createBoss: (game) => new EclipseSovereign(game),
  theme: {
    speed: 46,
    warpColor: 0x3ad8ff,
    // final stage: enemies fire more often, faster and are a bit tougher (on top of the chosen difficulty)
    aggression: { fireRate: 1.2, bulletSpeed: 1.1, enemyHp: 1.1 },
    background: 0x02050a,
    backgroundFactor: 0.4,
    fog: 0x06141e,
    fogNear: 60,
    env: 'singularity',
    hemiSky: 0x5ac8ff,
    hemiGround: 0x061018,
    key: 0xd0f0ff,
    keyIntensity: 2.4,
    rim: 0xffc070,
    rimIntensity: 1.4,
    enemyRim: 0xffb030,
    enemyTrim: 'trimGold',
    enemyAccent: 'glowGold',
    enemyShot: COLORS.enemyShotStage3,
    dust: 0xa8f0ff,
    sky: { stars: [0xffffff, 0xcfe8ff, 0xfff0d0, 0xa8f0ff], nebula: COOL, nebulaCount: 0, skybox: SINGULARITY_SKY },
  },

  sections: [
    { id: 'horizon', start: 0, end: S(1300), title: 'Edge of Nyx', speed: 46, fog: 0x06141e, chunk: horizonZone },
    { id: 'crystals', start: S(1300), end: S(2900), title: 'Crystal field', warning: 'CRYSTALS AHEAD — DESTROY OR DODGE', speed: 42, fog: 0x081a26, sky: { tint: 0xd0f0ff, intensity: 0.9 }, chunk: crystalField },
    { id: 'gates', start: S(2900), end: S(4300), title: 'Halo gates', speed: 46, fog: 0x0a1620, dust: 0xffe0a0, sky: { tint: 0xfff0d0, intensity: 1 }, chunk: haloGates },
    { id: 'wells', start: S(4300), end: S(5700), title: 'Gravity wells', warning: 'GRAVITY WELLS — RESIST THE PULL', speed: 40, fog: 0x060c1e, dust: 0xa0c0ff, sky: { tint: 0xa0c8ff, intensity: 0.8 }, chunk: wellsZone },
    { id: 'lattice', start: S(5700), end: S(7000), title: 'Sovereign lattice', warning: 'HIGH SPEED!', speed: 70, fog: 0x08202a, dust: 0xc8ffff, bloom: 1.1, sky: { tint: 0xc8ffff, intensity: 1.15 }, chunk: latticeTunnel },
    { id: 'crown', start: S(7000), end: MAIN_LENGTH + 400, title: 'The Crown', speed: 32, fog: 0x0a1418, sky: { tint: 0xffe0c0, intensity: 1.2 }, chunk: crownZone },
  ],

  events: [
    ev(0, 'music', { track: 'stage3', intensity: 1, persistent: true }),
    ev(0, 'banner', { title: 'STAGE 3', subtitle: 'SINGULARITY CROWN' }),
    wave(150, 'scout', 'V', 5, { pattern: 'swoop' }),
    wave(350, 'scout', 'line', 5, { pattern: 'cross', side: -1, z: -90, y: 3, spacing: 6 }),
    ev(500, 'enemy', { enemy: 'interceptor', x: -8, y: 3, z: -260, opts: { entry: 'front' } }),
    ev(510, 'enemy', { enemy: 'interceptor', x: 8, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(650, 'warning', { text: 'NEW SIGNATURE: PRISM LANCER', duration: 2.5 }),
    lancer(680, 0, 3),
    wave(850, 'scout', 'column', 5, { pattern: 'dive', x: 6, y: 16 }),
    ev(1000, 'enemy', { enemy: 'heavy', x: 0, y: 2, z: -260, opts: { drop: 'dualCannon' } }),
    ev(1150, 'powerup', { item: 'rapidFire', x: -4 }),

    lancer(1450, -8, 2),
    lancer(1470, 8, -2),
    ev(1600, 'mines', { ahead: 300, list: [{ x: -6, y: 2 }, { x: 7, y: -3, dz: 40 }, { x: 0, y: 6, dz: 90 }] }),
    wave(1800, 'scout', 'V', 5, { pattern: 'swoop', x: -4 }),
    ev(1900, 'enemy', { enemy: 'heavy', x: 5, y: 2, z: -260 }),
    ev(2000, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(2010, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(2200, 'powerup', { item: 'shield', x: 0 }),
    lancer(2350, 0, 4),
    wave(2380, 'scout', 'line', 4, { pattern: 'cross', side: 1, z: -85, y: -3, spacing: 6 }),
    ev(2550, 'mines', { ahead: 300, list: [{ x: -9, y: -4 }, { x: 9, y: 4, dz: 30 }, { x: 0, y: 0, dz: 70 }] }),
    ev(2700, 'powerup', { item: 'repair', x: 3 }),

    ev(2890, 'checkpoint'),
    ev(3000, 'enemy', { enemy: 'carrier', x: 8, y: 5, z: -300, opts: { drop: 'bomb' } }),
    wave(3200, 'scout', 'arc', 6, { pattern: 'swoop' }),
    ev(3400, 'enemy', { enemy: 'heavy', x: -6, y: 1, z: -260 }),
    ev(3420, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    lancer(3600, -9, 3),
    lancer(3620, 9, -1),
    wave(3800, 'scout', 'column', 6, { pattern: 'dive', y: 16 }),
    lancer(3900, 0, 6),
    ev(3920, 'enemy', { enemy: 'interceptor', x: -8, y: 3, z: -260, opts: { entry: 'front' } }),
    ev(3930, 'enemy', { enemy: 'interceptor', x: 8, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(4000, 'powerup', { item: 'bomb', x: -3 }),
    ev(4200, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(4210, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(4220, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),

    ev(4450, 'turrets', { ahead: 320, spread: 3, list: [{ x: -14, y: -9 }, { x: 14, y: -9, dz: 60 }] }),
    ev(4600, 'enemy', { enemy: 'phaseHunter', x: -8, y: 2, z: -240 }),
    ev(4620, 'enemy', { enemy: 'phaseHunter', x: 8, y: -2, z: -240 }),
    lancer(4800, 0, 5),
    ev(5000, 'enemy', { enemy: 'heavy', x: 6, y: 1, z: -260, opts: { drop: 'repair' } }),
    ev(5200, 'mines', { ahead: 280, list: [{ x: -5, y: 5 }, { x: 5, y: -5, dz: 30 }] }),
    ev(5400, 'enemy', { enemy: 'phaseHunter', x: 0, y: 4, z: -240 }),
    wave(5420, 'scout', 'V', 5, { pattern: 'swoop' }),
    lancer(5500, -9, 2),
    lancer(5520, 9, 2),
    ev(5600, 'powerup', { item: 'repair', x: -2 }),

    ev(5690, 'checkpoint'),
    ev(5850, 'custom', { run: (ctx) => latticeBeams(ctx, 'h') }),
    wave(6050, 'scout', 'column', 5, { pattern: 'swoop', opts: { speed: 50 } }),
    ev(6250, 'custom', { run: (ctx) => latticeBeams(ctx, 'v') }),
    lancer(6400, -8, 2),
    lancer(6420, 8, -2),
    ev(6500, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(6510, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(6600, 'custom', { run: (ctx) => latticeBeams(ctx, 'h') }),
    ev(6800, 'powerup', { item: 'shield', x: 4 }),
    ev(6820, 'powerup', { item: 'rapidFire', x: -4 }),

    ev(7000, 'warning', { text: 'WARNING: THE ECLIPSE SOVEREIGN AWAKENS', duration: 3 }),
    ev(7020, 'music', { intensity: 0 }),
    ev(7040, 'checkpoint'),
    ev(7100, 'boss'),
  ],

  setup({ game, state }) {
    state.wells = [];
    // Nyx in the sky: infinitely far (lives in the sky group) and growing as the stage progresses
    state.nyx = new BlackHole(game.assets, { radius: 1, diskInner: 1.4, diskOuter: 3.4, tilt: 1.32, intensity: 0.7 });
    state.nyx.setRenderOrder(-15);
    state.nyx.group.position.set(0.12, 0.2, -1).normalize().multiplyScalar(1350);
    state.nyx.group.scale.setScalar(130);
    game.sky.group.add(state.nyx.group);
  },

  teardown({ game, state }) {
    if (state.nyx) {
      game.sky.group.remove(state.nyx.group);
      state.nyx.dispose();
    }
    state.wells = [];
  },

  update({ game, state }, dt) {
    const progress = clamp(game.rail.s / S(7100), 0, 1);
    state.nyx.group.scale.setScalar(130 + progress * 170);
    state.nyx.update(dt, game.camera, 0.6);
    this.updateWells(game, state, dt);
  },

  /** Gravity wells drag the ship sideways while they are near its plane; particles show the inflow. */
  updateWells(game, state, dt) {
    const p = game.player;
    for (let i = state.wells.length - 1; i >= 0; i--) {
      const w = state.wells[i];
      if (!w.obs.alive) {
        state.wells.splice(i, 1);
        continue;
      }
      _v.copy(w.obs.boundCenter);
      game.rig.worldToLocal(_v);
      if (_v.z < -260 || _v.z > 20) continue;
      if (!w.warned && _v.z > -200) {
        w.warned = true;
        game.hud.warning('GRAVITY WELL!', 1.2);
        game.audio.play('warning');
      }
      if (Math.random() < 0.6) {
        const a = rand(0, TAU);
        const r = rand(6, 11);
        _w.set(Math.cos(a) * r, Math.sin(a) * r, 0).add(w.obs.boundCenter);
        const vx = (w.obs.boundCenter.x - _w.x) * 1.6 + game.rail.velocity.x;
        const vy = (w.obs.boundCenter.y - _w.y) * 1.6 + game.rail.velocity.y;
        const vz = (w.obs.boundCenter.z - _w.z) * 1.6 + game.rail.velocity.z;
        _c.set(Math.random() < 0.5 ? 0xffc070 : 0x7af0ff).multiplyScalar(1.5);
        game.effects.particles.emit(_w.x, _w.y, _w.z, vx, vy, vz, _c, 0.6, 0.6, 0.1, 0);
      }
      if (!p.alive || !p.controllable || _v.z < -70) continue;
      const dx = _v.x - p.local.x;
      const dy = _v.y - p.local.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.3 || d > 26) continue;
      const depth = 1 - Math.min(1, Math.abs(_v.z) / 70);
      const pull = (WELL_PULL * depth * dt) / (1 + d * 0.12);
      p.local.x = clamp(p.local.x + (dx / d) * pull, -B.x, B.x);
      p.local.y = clamp(p.local.y + (dy / d) * pull, -B.y, B.y);
    }
  },
};

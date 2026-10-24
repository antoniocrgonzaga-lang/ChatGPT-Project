import * as THREE from 'three';
import { RailPath, RailFrame } from '../systems/Rail.js';
import { NebulaWarden } from '../entities/bosses/NebulaWarden.js';
import { LightningPool } from '../scenery/SceneryKit.js';
import { COLORS } from '../config/gameConfig.js';
import { rand, smoothstep } from '../utils/math.js';

const MAIN_LENGTH = 11400;
const FORK_S = 5600;
const MERGE_S = 6700;
const BARRIER_ALT_S = 260;
const NEBULA_COLORS = [0x7a3cff, 0xff3dc8, 0x2d7bff, 0x9a4dff];

/**
 * Baked skybox design for the Violet Expanse (see scenery/NebulaSkybox.js).
 * Three gas complexes share one turbulent density field but get their own palette:
 * a magenta emission nebula ahead, a blue/cyan reflection nebula to the left and a
 * violet cloud behind (seen on the title screen). Colours: 0xRRGGBB or [hex, gain].
 */
const NEBULA_SKY = {
  id: 'neon-nebula',
  seed: 3.7,
  spaceTop: [0x2a1a6a, 0.32],
  spaceBottom: [0x0a0418, 0.6],
  bandNormal: [0.35, 1, 0.3],
  bandColor: [0x7a5ad0, 0.14],
  filament: [0x5ff2ff, 0.9],
  dust: 0.8,
  regions: [
    { dir: [0.3, 0.35, -1], cone: [0.15, 0.8], strength: 1, deep: [0x3a0f7a, 0.45], mid: [0xc02aa8, 0.72], hot: [0xff5ab8, 1.05], core: [0xffe6f6, 1.7] },
    { dir: [-1, 0.05, -0.35], cone: [0.35, 0.85], strength: 0.85, deep: [0x0a2a70, 0.4], mid: [0x2a6ae8, 0.55], hot: [0x40d8ff, 0.75], core: [0xe0faff, 1.3] },
    { dir: [0.35, -0.25, 1], cone: [0.3, 0.85], strength: 0.9, deep: [0x2a0c60, 0.4], mid: [0x7a30e0, 0.55], hot: [0xc080ff, 0.75], core: [0xf6e6ff, 1.3] },
  ],
};
const _v = new THREE.Vector3();

// ------------------------------------------------------------------ path
function mainOffset(d) {
  // gentle S-curves; flattened for the boss arena so the fight happens on a straight
  const calm = 1 - smoothstep(8200, 8500, d);
  const x = (Math.sin(d * 0.0011) * 110 + Math.sin(d * 0.00041 + 1) * 180) * (0.25 + 0.75 * calm);
  const y = Math.sin(d * 0.0008 + 0.5) * 32 * calm;
  return [x, y];
}

function buildPath() {
  const points = [];
  for (let d = -200; d <= MAIN_LENGTH; d += 250) {
    const [x, y] = mainOffset(Math.max(0, d));
    points.push(new THREE.Vector3(x, y, -d));
  }
  // alternate route branching left from the fork and rejoining at the merge
  const main = new RailPath(points);
  const f = new RailFrame();
  const P = (s, lateral = 0, up = 0) => {
    main.frameAt(s + 200, f); // +200 because the path starts 200 units before s=0
    return f.localToWorld(lateral, up, 0, new THREE.Vector3());
  };
  const alt = [P(FORK_S), P(FORK_S + 110, -35, 2), P(FORK_S + 260, -120, 8), P(FORK_S + 500, -210, 18), P(FORK_S + 760, -200, 12), P(FORK_S + 960, -110, 4), P(MERGE_S - 60, -25), P(MERGE_S)];
  return { main: points, alt: { points: alt, forkS: FORK_S + 200, mergeS: MERGE_S + 200 } };
}

// Sections and events use "stage distance" (path s minus the 200 unit run-up).
const S = (d) => d + 200;

// ------------------------------------------------------------------ scenery builders
function openSpace(kit, c) {
  const rng = c.rng;
  for (let i = 0; i < 2; i++) {
    const cloud = kit.nebulaCloud(rng, rng.pick(NEBULA_COLORS), rng.range(160, 320), c);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(70, 240), rng.range(-60, 90), 0, cloud.position);
    c.add(cloud);
  }
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineViolet }));
  if (rng.chance(0.35)) {
    const sat = kit.satellite(rng);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(28, 60), rng.range(-12, 20), 0, sat.position);
    c.add(sat);
    const spin = rng.range(-0.3, 0.3);
    c.animate((dt, t) => {
      sat.rotation.y += spin * dt;
      sat.userData.blink.visible = Math.sin(t * 5) > 0;
    });
  }
  if (rng.chance(0.2)) {
    const tri = kit.triangleStructure(rng.range(35, 60), kit.M.dimViolet);
    kit.place(tri, c.frame(rng.range(0, c.length)), rng.sign() * rng.range(150, 230), rng.range(-20, 60));
    c.add(tri);
    c.animate((dt) => (tri.rotation.z += dt * 0.05));
  }
  for (let i = 0; i < 2; i++) {
    if (!rng.chance(0.6)) continue;
    const rock = kit.asteroid(rng, rng.range(3, 9));
    c.at(rng.range(0, c.length), rng.sign() * rng.range(40, 110), rng.range(-40, 40), 0, rock.position);
    c.add(rock);
  }
}

function asteroidField(kit, c) {
  const rng = c.rng;
  const p = c.progress;
  for (let i = 0; i < 6; i++) {
    const rock = kit.asteroid(rng, rng.range(4, 15));
    c.at(rng.range(0, c.length), rng.sign() * rng.range(32, 130), rng.range(-60, 60), 0, rock.position);
    c.add(rock);
  }
  if (rng.chance(0.6)) {
    const cloud = kit.nebulaCloud(rng, rng.pick(NEBULA_COLORS), rng.range(150, 250), c);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(80, 200), rng.range(-30, 60), 0, cloud.position);
    c.add(cloud);
  }
  if (c.s0 < S(1560)) return; // keep the first seconds of the field clear
  const narrowing = p > 0.72;
  const count = 2 + Math.floor(p * 3);
  for (let i = 0; i < count; i++) {
    const o = ((i + rng.range(0.1, 0.9)) / count) * c.length;
    const small = rng.chance(0.4);
    const scale = small ? rng.range(1.4, 2.1) : rng.range(2.6, 4.2);
    kit.asteroidObstacle(c, o, rng.range(-15, 15), rng.range(-9, 9), scale, rng);
  }
  if (narrowing) {
    // tight corridor: big rocks close in from both sides
    for (let i = 0; i < 4; i++) {
      const o = rng.range(0, c.length);
      const side = i % 2 ? 1 : -1;
      kit.asteroidObstacle(c, o, side * rng.range(17, 22), rng.range(-10, 10), rng.range(5, 7), rng);
    }
  }
}

function fleetZone(kit, c) {
  const rng = c.rng;
  if (rng.chance(0.55)) {
    const wreck = kit.wreck(rng, rng.range(90, 170));
    c.at(rng.range(0, c.length), rng.sign() * rng.range(110, 220), rng.range(-50, 50), 0, wreck.position);
    c.add(wreck);
  }
  for (let i = 0; i < 2; i++) {
    const cloud = kit.nebulaCloud(rng, rng.pick([0x2d7bff, 0x7a3cff]), rng.range(180, 320), c);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(90, 240), rng.range(-50, 80), 0, cloud.position);
    c.add(cloud);
  }
  c.add(kit.vectorGrid(c, { y: -32, mat: kit.M.lineCyan, step: 16 }));
}

function stationDebris(kit, c) {
  const rng = c.rng;
  const M = kit.M;
  const G = kit.G;
  for (let i = 0; i < 4; i++) {
    const piece = rng.chance(0.5)
      ? kit.mesh(G.box, M.structure, null, [rng.range(2, 5), rng.range(2, 5), rng.range(20, 60)])
      : kit.mesh(G.box, M.hullViolet, null, [rng.range(8, 20), 0.6, rng.range(8, 16)]);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(26, 90), rng.range(-40, 40), 0, piece.position);
    piece.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    c.add(piece);
    if (rng.chance(0.5)) {
      const strip = kit.mesh(G.box, rng.chance(0.5) ? M.glowCyan : M.glowOrange, null, [0.2, 0.2, piece.scale.z * 0.8]);
      piece.add(strip);
      strip.scale.divide(piece.scale);
      strip.scale.z = 0.8;
      strip.position.set(0.52, 0.5, 0);
    }
  }
  if (rng.chance(0.3)) {
    const ring = kit.mesh(G.torusThick, M.structure, null, rng.range(30, 60));
    kit.place(ring, c.frame(rng.range(0, c.length)), rng.sign() * rng.range(90, 150), rng.range(-20, 30));
    ring.rotateY(rng.range(-1, 1));
    c.add(ring);
    c.animate((dt) => ring.rotateZ(dt * 0.04));
  }
  if (c.s0 > S(4500) && rng.chance(0.55)) {
    const axis = rng.chance(0.5) ? 'h' : 'v';
    kit.girderObstacle(c, rng.range(20, 80), axis, rng.sign() * rng.range(4, 9), 70);
  }
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineCyan }));
}

function ringTunnel(kit, c) {
  const rng = c.rng;
  const p = c.progress;
  const radius = 26 - p * 7;
  for (let o = 0; o < c.length; o += 50) {
    const s = c.s0 + o;
    const mat = Math.floor(s / 50) % 2 ? kit.M.dimMagenta : kit.M.dimCyan;
    const f = c.frame(o);
    const ring = kit.mesh(kit.G.torusThin, mat, null, radius);
    kit.place(ring, f, 0, 0, 0);
    c.add(ring);
    const frame = kit.mesh(kit.G.torus, kit.M.structure, null, [radius * 1.1, radius * 1.1, radius * 0.5]);
    kit.place(frame, f, 0, 0, 0.6);
    c.add(frame);
  }
  const bx = Math.sin(c.s0 * 0.004) * 8;
  const by = Math.cos(c.s0 * 0.003) * 5;
  const bonus = kit.bonusRing(c, 25, bx, by);
  c.add(bonus);
  c.animate((dt) => bonus.rotateZ(dt * 1.5));
  const cloud = kit.nebulaCloud(rng, rng.pick(NEBULA_COLORS), rng.range(200, 320), c);
  c.at(rng.range(0, c.length), rng.sign() * rng.range(80, 200), rng.range(-40, 80), 0, cloud.position);
  c.add(cloud);
}

function stormZone(kit, c, ctx) {
  const rng = c.rng;
  for (let i = 0; i < 4; i++) {
    const cloud = kit.nebulaCloud(rng, rng.pick([0x9a4dff, 0xff3dc8, 0x5a6dff]), rng.range(120, 260), c);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(45, 170), rng.range(-50, 80), 0, cloud.position);
    c.add(cloud);
    ctx.state.cloudPoints?.push(cloud.position);
  }
  if (rng.chance(0.4)) {
    const rock = kit.asteroid(rng, rng.range(5, 12));
    c.at(rng.range(0, c.length), rng.sign() * rng.range(35, 90), rng.range(-30, 30), 0, rock.position);
    c.add(rock);
  }
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineMagenta, step: 15 }));
}

function arenaZone(kit, c) {
  const rng = c.rng;
  if (rng.chance(0.6)) {
    const tri = kit.triangleStructure(rng.range(35, 60), kit.M.dimMagenta);
    kit.place(tri, c.frame(rng.range(0, c.length)), rng.sign() * rng.range(120, 180), rng.range(-10, 50));
    tri.rotateY(rng.range(-0.6, 0.6));
    c.add(tri);
    c.animate((dt) => tri.rotateZ(dt * 0.08));
  }
  c.add(kit.vectorGrid(c, { y: -26, mat: kit.M.lineMagenta, step: 10, halfWidth: 70 }));
  const cloud = kit.nebulaCloud(rng, rng.pick(NEBULA_COLORS), rng.range(220, 380), c);
  c.at(rng.range(0, c.length), rng.sign() * rng.range(120, 260), rng.range(-40, 100), 0, cloud.position);
  c.add(cloud);
}

function hiddenRelay(kit, c) {
  const rng = c.rng;
  const M = kit.M;
  const G = kit.G;
  for (let o = 0; o < c.length; o += 25) {
    const f = c.frame(o);
    for (const side of [-1, 1]) {
      const wall = kit.mesh(G.box, M.structure, null, [4, 36, 24]);
      kit.place(wall, f, side * 30, 0, 0);
      c.add(wall);
      const strip = kit.mesh(G.box, (o / 25) % 2 ? M.glowRed : M.glowViolet, null, [0.3, 30, 0.4]);
      kit.place(strip, f, side * 27.8, 0, 0);
      c.add(strip);
    }
    const beam = kit.mesh(G.box, M.structure, null, [64, 3, 3]);
    kit.place(beam, f, 0, 20, 0);
    c.add(beam);
  }
  if (rng.chance(0.5)) kit.girderObstacle(c, rng.range(30, 70), 'v', rng.sign() * rng.range(5, 10), 40);
}

// ------------------------------------------------------------------ set pieces
function spawnGenerators({ manager, state, game }) {
  state.generatorsAlive = 3;
  state.generatorsKilled = 0;
  const spots = [[-15, 7, 0], [15, -5, 120], [0, 11, 240]];
  for (const [x, y, dz] of spots) {
    const g = manager.spawnWorldEnemy('generator', 300 + dz, x, y, {});
    if (g) g.isRouteGenerator = true;
  }
  game.hud.warning('BARRIER GENERATORS DETECTED — DESTROY ALL 3', 3);
}

function buildBarrier({ game, kit, state }) {
  const alt = game.rail.alt;
  const f = alt.path.frameAt(BARRIER_ALT_S, new RailFrame());
  const group = new THREE.Group();
  kit.place(group, f, 0, 0, 0);
  const M = kit.M;
  const G = kit.G;
  const fieldMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x2de2ff).multiplyScalar(1.4),
    map: kit.T.hex,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const halves = [];
  for (const side of [-1, 1]) {
    const half = new THREE.Group();
    half.add(kit.mesh(G.plane, fieldMat, [side * 11, 0, 0], [22, 34, 1]));
    half.add(kit.mesh(G.box, M.structure, [side * 22.5, 0, 0], [3, 38, 3]));
    half.add(kit.mesh(G.box, M.glowCyan, [side * 21, 0, 1.6], [0.4, 34, 0.3]));
    group.add(half);
    halves.push({ half, side });
  }
  group.add(kit.mesh(G.box, M.structure, [0, 18.5, 0], [52, 3, 3]));
  group.add(kit.mesh(G.box, M.structure, [0, -18.5, 0], [52, 3, 3]));
  game.scene.add(group);
  state.barrier = { group, halves, fieldMat, open: 0, opening: false };
}

function lockRouteDecision({ game, state }) {
  if (game.rail.decisionLocked) return;
  game.rail.chooseAlt(false);
  if (state.generatorsKilled > 0) game.hud.toast('BARRIER INTACT', '#ff8a6a');
}

// ------------------------------------------------------------------ stage definition
const wave = (at, enemy, formation, count, extra = {}) => ({ at: S(at), type: 'wave', enemy, formation, count, ...extra });
const ev = (at, type, extra = {}) => ({ at: S(at), type, ...extra });

export const Stage1 = {
  id: 1,
  name: 'NEON NEBULA RUN',
  subtitle: 'Sector 7 · Violet Expanse',
  seed: 1701,
  bossMusic: 'boss1',
  buildPath,
  createBoss: (game) => new NebulaWarden(game),
  theme: {
    speed: 42,
    warpColor: 0xb070ff,
    background: 0x04020c,
    backgroundFactor: 0.4,
    fog: 0x120828,
    fogNear: 60,
    env: 'nebula',
    hemiSky: 0x7060d0,
    hemiGround: 0x140a24,
    key: 0xcdb8ff,
    keyIntensity: 2.4,
    rim: 0x2de2ff,
    rimIntensity: 1.6,
    enemyRim: 0x8a5cff,
    enemyTrim: 'trimMagenta',
    enemyAccent: 'glowMagenta',
    enemyShot: COLORS.enemyShotStage1,
    dust: 0xb9a6ff,
    sky: { stars: [0xffffff, 0xbcd4ff, 0xffd6f5, 0xa8f0ff], nebula: NEBULA_COLORS, nebulaCount: 0, skybox: NEBULA_SKY },
  },

  sections: [
    { id: 'open', start: 0, end: S(1500), title: 'Open space', speed: 42, fog: 0x120828, chunk: openSpace },
    { id: 'asteroids', start: S(1500), end: S(3000), title: 'Asteroid field', warning: 'ASTEROID FIELD — DODGE!', speed: 40, fog: 0x0e0a20, sky: { tint: 0xd8d0ff, intensity: 0.8 }, chunk: asteroidField },
    { id: 'fleet', start: S(3000), end: S(4400), title: 'Interceptor fleet', speed: 44, fog: 0x0a0c26, dust: 0x9fc4ff, sky: { tint: 0xb8c8ff, intensity: 0.9 }, chunk: fleetZone },
    { id: 'station', start: S(4400), end: S(5700), title: 'Lyra Station debris', speed: 40, fog: 0x0b1022, dust: 0xa8f0ff, sky: { tint: 0xc8e8ff, intensity: 0.85 }, chunk: stationDebris },
    { id: 'rings', start: S(5700), end: S(7100), title: 'Energy ring tunnel', warning: 'FLY THROUGH THE GOLDEN RINGS', speed: 46, fog: 0x150828, dust: 0xffb0f0, bloom: 1.1, sky: { tint: 0xffd0f0, intensity: 1.1 }, chunk: ringTunnel },
    { id: 'storm', start: S(7100), end: S(8500), title: 'Electromagnetic storm', warning: 'ELECTROMAGNETIC STORM', speed: 42, fog: 0x22103e, dust: 0xd6b0ff, bloom: 1.15, sky: { tint: 0xe0c0ff, intensity: 1.3 }, chunk: stormZone },
    { id: 'arena', start: S(8500), end: MAIN_LENGTH + 400, title: 'Warden arena', speed: 34, fog: 0x180628, sky: { tint: 0xffb8e8, intensity: 1.05 }, chunk: arenaZone },
  ],
  altSections: [{ id: 'relay', start: 0, end: 5000, title: 'Hidden relay', speed: 44, fog: 0x200614, dust: 0xff9a9a, bloom: 1.1, sky: { tint: 0xffb0b8, intensity: 0.8 }, chunk: hiddenRelay }],

  events: [
    ev(0, 'music', { track: 'stage1', intensity: 1, persistent: true }),
    ev(0, 'banner', { title: 'STAGE 1', subtitle: 'NEON NEBULA RUN' }),
    wave(150, 'scout', 'V', 5, { pattern: 'swoop', x: 0 }),
    wave(360, 'scout', 'line', 4, { pattern: 'cross', side: 1, z: -85, y: 4, spacing: 6 }),
    wave(520, 'scout', 'V', 5, { pattern: 'swoop', x: -8 }),
    ev(600, 'powerup', { item: 'dualCannon', x: 6, y: 2 }),
    wave(700, 'scout', 'column', 5, { pattern: 'dive', x: 7, y: 16 }),
    wave(860, 'scout', 'line', 4, { pattern: 'cross', side: -1, z: -95, y: -3, spacing: 6 }),
    wave(1000, 'scout', 'V', 7, { pattern: 'swoop', x: 0, spacing: 4.5 }),
    ev(1150, 'enemy', { enemy: 'interceptor', x: 0, opts: { entry: 'behind', side: 1 } }),
    ev(1170, 'enemy', { enemy: 'interceptor', x: 0, opts: { entry: 'behind', side: -1 } }),
    wave(1300, 'scout', 'arc', 6, { pattern: 'swoop', spacing: 5 }),
    ev(1420, 'powerup', { item: 'rapidFire', x: -5 }),

    ev(1650, 'mines', { ahead: 300, list: [{ x: -6, y: 2 }, { x: 7, y: -3, dz: 40 }, { x: 0, y: 6, dz: 90 }] }),
    wave(1800, 'scout', 'V', 5, { pattern: 'swoop', x: 5 }),
    ev(2000, 'mines', { ahead: 300, list: [{ x: -10, y: -4 }, { x: 10, y: 4, dz: 30 }] }),
    wave(2150, 'scout', 'line', 5, { pattern: 'cross', side: 1, z: -90, y: 0, spacing: 6 }),
    ev(2300, 'powerup', { item: 'shield', x: 0, y: -3 }),
    wave(2420, 'scout', 'column', 5, { pattern: 'dive', x: -6, y: 15 }),
    ev(2550, 'mines', { ahead: 300, list: [{ x: -4, y: 0 }, { x: 5, y: 5, dz: 25 }, { x: 9, y: -6, dz: 55 }, { x: -9, y: 6, dz: 85 }] }),
    ev(2700, 'warning', { text: 'NARROW PASSAGE!' }),
    ev(2860, 'powerup', { item: 'repair', x: 3 }),

    ev(2990, 'checkpoint'),
    ev(3000, 'warning', { text: 'INTERCEPTOR FLEET DETECTED' }),
    ev(3050, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind', side: 1 } }),
    ev(3070, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind', side: -1 } }),
    ev(3090, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind', side: 1 } }),
    wave(3300, 'scout', 'V', 5, { pattern: 'swoop', x: -4 }),
    ev(3450, 'enemy', { enemy: 'heavy', x: 0, y: 2, z: -260, opts: { drop: 'bomb' } }),
    ev(3700, 'enemy', { enemy: 'interceptor', x: -10, y: 4, z: -260, opts: { entry: 'front' } }),
    ev(3710, 'enemy', { enemy: 'interceptor', x: 10, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(3850, 'enemy', { enemy: 'carrier', x: -8, y: 4, z: -300, opts: { drop: 'rapidFire' } }),
    wave(4000, 'scout', 'line', 4, { pattern: 'cross', side: 1, z: -80, y: 6, spacing: 6 }),
    wave(4060, 'scout', 'line', 4, { pattern: 'cross', side: -1, z: -100, y: -5, spacing: 6 }),
    ev(4150, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(4170, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(4300, 'powerup', { item: 'bomb', x: -4, y: 3 }),

    ev(4450, 'turrets', { ahead: 360, list: [{ x: -14, y: -10 }, { x: 14, y: -10, dz: 60 }] }),
    ev(4600, 'custom', { run: spawnGenerators }),
    ev(4650, 'custom', { run: buildBarrier }),
    wave(4720, 'scout', 'V', 5, { pattern: 'swoop' }),
    ev(4900, 'turrets', { ahead: 360, list: [{ x: -12, y: 10, flip: true }, { x: 12, y: -10, dz: 50 }] }),
    ev(5000, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(5020, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(5250, 'custom', { run: lockRouteDecision }),
    wave(5300, 'scout', 'line', 5, { pattern: 'cross', side: -1, z: -90, spacing: 6 }),
    ev(5450, 'powerup', { x: 0, y: 0 }),

    ev(5760, 'checkpoint'),
    wave(5900, 'scout', 'V', 5, { pattern: 'swoop' }),
    wave(6200, 'scout', 'column', 6, { pattern: 'dive', x: 0, y: 16 }),
    ev(6500, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(6520, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    wave(6820, 'scout', 'V', 7, { pattern: 'swoop', spacing: 4.5 }),
    ev(7000, 'powerup', { x: 4, y: 2 }),

    ev(7200, 'mines', { ahead: 300, list: [{ x: -8, y: 3 }, { x: 8, y: -3, dz: 30 }, { x: 0, y: 7, dz: 70 }] }),
    ev(7300, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(7320, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(7340, 'custom', { run: (ctx) => energyArcs(ctx, 'h') }),
    ev(7500, 'enemy', { enemy: 'heavy', x: 6, y: 0, z: -260, opts: { drop: 'repair' } }),
    ev(7700, 'custom', { run: (ctx) => energyArcs(ctx, 'v') }),
    wave(7800, 'scout', 'arc', 6, { pattern: 'swoop' }),
    ev(8000, 'enemy', { enemy: 'carrier', x: 8, y: 3, z: -300 }),
    ev(8200, 'custom', { run: (ctx) => energyArcs(ctx, 'h') }),
    ev(8350, 'powerup', { item: 'repair', x: 0 }),

    ev(8500, 'warning', { text: 'WARNING: MASSIVE SIGNATURE AHEAD', duration: 3 }),
    ev(8520, 'music', { intensity: 0 }),
    ev(8540, 'checkpoint'),
    ev(8600, 'boss'),
  ],

  altEvents: [
    { at: 100, type: 'turrets', ahead: 320, spread: 3, list: [{ x: -14, y: -9 }, { x: 14, y: -9, dz: 40 }, { x: -14, y: 9, dz: 80, flip: true }, { x: 14, y: 9, dz: 120, flip: true }] },
    { at: 220, type: 'enemy', enemy: 'interceptor', x: -8, y: 3, z: -240, opts: { entry: 'front' } },
    { at: 230, type: 'enemy', enemy: 'interceptor', x: 8, y: -3, z: -240, opts: { entry: 'front' } },
    { at: 240, type: 'enemy', enemy: 'interceptor', x: 0, y: 6, z: -260, opts: { entry: 'front' } },
    { at: 380, type: 'enemy', enemy: 'heavy', x: -8, y: 0, z: -260, opts: { drop: 'multiplier' } },
    { at: 400, type: 'enemy', enemy: 'heavy', x: 8, y: 3, z: -280 },
    { at: 560, type: 'wave', enemy: 'scout', formation: 'arc', count: 8, pattern: 'swoop' },
    { at: 680, type: 'turrets', ahead: 320, spread: 3, list: [{ x: -13, y: -9 }, { x: 13, y: 9, dz: 60, flip: true }] },
    { at: 720, type: 'enemy', enemy: 'carrier', x: 0, y: 5, z: -300, opts: { drop: 'bomb' } },
    { at: 860, type: 'enemy', enemy: 'interceptor', opts: { entry: 'behind' } },
    { at: 870, type: 'enemy', enemy: 'interceptor', opts: { entry: 'behind' } },
    { at: 880, type: 'enemy', enemy: 'interceptor', opts: { entry: 'behind' } },
    { at: 890, type: 'enemy', enemy: 'interceptor', opts: { entry: 'behind' } },
    { at: 1000, type: 'powerup', item: 'repair', x: -4 },
    { at: 1010, type: 'powerup', item: 'multiplier', x: 4 },
    { at: 1100, type: 'wave', enemy: 'scout', formation: 'V', count: 7, pattern: 'swoop' },
  ],

  setup({ game, state }) {
    state.lightning = new LightningPool(game.scene, 5);
    state.cloudPoints = [];
    state.lightningTimer = 3;
  },

  teardown({ state, game }) {
    state.lightning?.dispose();
    if (state.barrier) {
      game.scene.remove(state.barrier.group);
      state.barrier.fieldMat.dispose();
    }
  },

  update({ game, state }, dt) {
    state.lightning.update(dt);
    const inStorm = game.stageManager.section?.id === 'storm';
    state.lightningTimer -= dt;
    if (state.lightningTimer <= 0) {
      state.lightningTimer = inStorm ? rand(0.3, 1.2) : rand(4, 9);
      const f = game.rail.frameAhead(rand(180, 420), new RailFrame());
      const from = f.localToWorld(rand(-160, 160), rand(50, 110), 0, new THREE.Vector3());
      const to = _v.copy(from).add(new THREE.Vector3(rand(-40, 40), -rand(60, 130), rand(-30, 30)));
      const color = Math.random() < 0.5 ? 0xd8b0ff : 0x9ad8ff;
      state.lightning.strike(from, to, color);
      game.sky.flash(inStorm ? 0.55 : 0.25, color); // the nebula lights up from within
      game.effects.flash(to, inStorm ? 40 : 30, 0.22, color, 0.9);
      if (inStorm && Math.random() < 0.3) game.postfx.boost(0.06);
    }
    if (state.cloudPoints.length > 64) state.cloudPoints.splice(0, state.cloudPoints.length - 64);

    // barrier: opens when all generators are gone
    const b = state.barrier;
    if (b) {
      b.fieldMat.opacity = (0.6 + 0.2 * Math.sin(game.time * 6)) * (1 - b.open);
      if (b.opening) {
        b.open = Math.min(1, b.open + dt * 0.6);
        for (const h of b.halves) h.half.position.x = h.side * b.open * 26;
      }
    }
  },

  onEnemyKilled({ game, state }, enemy, byPlayer) {
    if (!enemy.isRouteGenerator) return;
    state.generatorsAlive--;
    if (byPlayer) state.generatorsKilled++;
    if (state.generatorsKilled >= 3 && !game.rail.decisionLocked) {
      game.rail.chooseAlt(true);
      if (state.barrier) state.barrier.opening = true;
      game.hud.warning('BARRIER OPEN — HIDDEN ROUTE UNLOCKED!', 2.5);
      game.audio.play('stageChange');
    } else if (byPlayer) {
      game.hud.toast(`GENERATOR ${state.generatorsKilled}/3`, '#2de2ff');
    }
  },
};

/** Storm hazard: electric arcs across the route, always leaving a safe lane. */
function energyArcs({ game }, axis) {
  const ahead = game.rail.speed * 1.75;
  const f = game.rail.frameAhead(ahead, new RailFrame());
  const lanes = axis === 'h' ? [-6, 0, 6] : [-10, 0, 10];
  const safe = Math.floor(Math.random() * 3);
  lanes.forEach((lane, i) => {
    if (i === safe) return;
    const start = axis === 'h' ? f.localToWorld(-45, lane, 0, new THREE.Vector3()) : f.localToWorld(lane, -35, 0, new THREE.Vector3());
    const end = axis === 'h' ? f.localToWorld(45, lane, 0, new THREE.Vector3()) : f.localToWorld(lane, 35, 0, new THREE.Vector3());
    game.obstacles.fireBeam({ start, end, local: false, warn: 1.25, fire: 0.8, radius: 1.5, color: 0xb070ff });
  });
  game.hud.warning('ELECTRIC ARCS!', 1.2);
  game.audio.play('telegraph');
}

import * as THREE from 'three';
import { RailFrame } from '../systems/Rail.js';
import { AbyssalMatriarch } from '../entities/bosses/AbyssalMatriarch.js';
import { ContainmentGrid } from '../entities/ContainmentGrid.js';
import { CapitalShip } from '../scenery/Mothership.js';
import { StaticBatch } from '../scenery/SceneryKit.js';
import { ModelBuilder } from '../entities/models/ModelBuilder.js';
import { hullFromOutline, symmetricOutline } from '../entities/models/shapes.js';
import { createFlowMaterial, scrollFlowMaterial } from '../effects/materials.js';
import { COLORS, OBSTACLES } from '../config/gameConfig.js';
import { rand, smoothstep, clamp, lerp, TAU } from '../utils/math.js';

/*
 * STAGE 4 — ABYSSAL ARMADA
 * Art direction: the void between galaxies. Near-black space, a whole spiral galaxy in the sky,
 * and the mothership LEVIATÃ: a city-sized dagger of gunmetal decks carrying thousands of tiny
 * lights. Enemy tech is emerald green (a colour no earlier stage used). Shape language: long
 * stepped blades, monumental scale, hangar ribs and launch rails. See docs/CONCEPT_STAGE4.md.
 */

const MAIN_LENGTH = 11200;
const S = (d) => d + 200;
const HULL_S = S(4400); // trench run over the mothership starts here
const DOOR_S = S(6100); // hangar blast doors
const TRENCH = { floor: -18, wall: 25, deck: 4 };
const HANGAR = { floor: -26, ceiling: 46, wall: 96 };
const CONDUIT_R = 26;
const GREEN = 0x35ff8a;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Baked sky: deep intergalactic void with a whole spiral galaxy and a faint blue haze. */
const ABYSS_SKY = {
  id: 'abyssal-armada',
  seed: 9.1,
  spaceTop: [0x081420, 0.22],
  spaceBottom: [0x010205, 0.5],
  bandNormal: [0.3, 1, -0.2],
  bandColor: [0x2a3a5a, 0.05],
  filament: [0x6a8aff, 0.25],
  dust: 0.6,
  regions: [
    { dir: [-0.6, 0.1, -1], cone: [0.45, 0.95], strength: 0.3, deep: [0x0a1a3a, 0.3], mid: [0x2a4a8a, 0.35], hot: [0x6a8aff, 0.45], core: [0xc0d0ff, 0.5] },
    { dir: [0.2, -0.6, 1], cone: [0.5, 0.95], strength: 0.22, deep: [0x1a0a2a, 0.3], mid: [0x4a2a6a, 0.3], hot: [0x9a6aff, 0.35], core: [0xe0d0ff, 0.4] },
  ],
  galaxy: { dir: [0.32, 0.22, -1], size: 0.46, angle: 0.5, tilt: 0.42, pitch: 2.2, strength: 1, core: [0xffe0b0, 1.25], arm: [0x8ab0ff, 1.15], hii: [0xff6aa8, 1.3] },
};

// ------------------------------------------------------------------ path
function buildPath() {
  const points = [];
  for (let d = -200; d <= MAIN_LENGTH; d += 250) {
    const dd = Math.max(0, d);
    // open space sweeps wide; over and inside the mothership the route straightens out
    const k = 1 - 0.85 * smoothstep(4000, 4500, dd);
    const x = (Math.sin(dd * 0.0008 + 0.4) * 140 + Math.sin(dd * 0.00029) * 190) * k;
    const y = Math.sin(dd * 0.0006 + 2) * 35 * k;
    points.push(new THREE.Vector3(x, y, -d));
  }
  return { main: points };
}

// ------------------------------------------------------------------ shared pieces
const kitGeo = (kit) => kit.G;

/** Navigation buoys marking the armada's route: blinking green / white lights in pairs. */
function routeBuoys(kit, c, batch, every = 50, lateral = 30) {
  const G = kitGeo(kit);
  const first = every - ((c.s0 % every) + every) % every;
  for (let o = first; o < c.length; o += every) {
    const f = c.frame(o);
    const idx = Math.round((c.s0 + o) / every);
    for (const s of [-1, 1]) {
      batch.addInFrame(G.octa, kit.M.hullAbyssLight, f, s * lateral, -12, 0, [0.9, 1.8, 0.9]);
      batch.addInFrame(G.box, kit.M.trimGreen, f, s * lateral, -12, 0, [1.95, 0.14, 0.14]);
      const light = kit.sprite(idx % 2 ? GREEN : 0xcfe0ff, idx % 2 ? 0.9 : 0.55);
      c.at(o, s * lateral, -10, 0, light.position);
      light.scale.setScalar(2.4);
      c.add(light);
      const phase = idx * 0.6;
      c.animate((dt, t) => (light.visible = Math.sin(t * 5 - phase) > 0.1));
    }
  }
}

/** Drifting hull fragment on the route: tumbles, breaks after a few shots. */
function hullFragment(kit, c, o, x, y, scale, rng) {
  const M = kit.M;
  const g = new THREE.Group();
  g.add(kit.mesh(kit.G.box, M.hullAbyss, null, [2.2 * scale, 0.7 * scale, 1.6 * scale]));
  g.add(kit.mesh(kit.G.box, M.hullAbyssLight, [0.3 * scale, 0.45 * scale, 0], [1.2 * scale, 0.35 * scale, 1.1 * scale], [0, 0.4, 0]));
  g.add(kit.mesh(kit.G.box, M.trimGreen, [0, -0.05 * scale, 0.82 * scale], [1.8 * scale, 0.08, 0.06]));
  g.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
  c.at(o, x, y, 0, g.position);
  const spin = new THREE.Vector3(rng.range(-0.8, 0.8), rng.range(-0.8, 0.8), rng.range(-0.5, 0.5));
  const H = OBSTACLES.hullFragment;
  const obs = c.manager.game.obstacles.add(g, {
    colliders: [{ type: 'sphere', node: g, radius: 1.15 * scale, offset: new THREE.Vector3() }],
    hp: Math.ceil(H.hpPerScale * scale),
    score: Math.round(H.score * scale),
    dropChance: H.dropChance,
    damage: H.damage,
    update: (dt) => {
      g.rotation.x += spin.x * dt;
      g.rotation.y += spin.y * dt;
      g.rotation.z += spin.z * dt;
    },
  });
  obs.explosionColor = 0x8affb0;
  obs.explosionSize = Math.min(2.4, scale * 0.9);
}

// ------------------------------------------------------------------ sections
function voidZone(kit, c, ctx) {
  const batch = new StaticBatch();
  routeBuoys(kit, c, batch, 60, 32);
  if (c.rng.chance(0.3)) {
    const wreck = kit.wreck(c.rng, c.rng.range(70, 120), kit.M.dimGreen);
    c.at(c.rng.range(0, c.length), c.rng.sign() * c.rng.range(140, 240), c.rng.range(-50, 40), 0, wreck.position);
    c.add(wreck);
  }
  batch.flush(c.group);
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineGreen, step: 16, halfWidth: 72 }));
}

function armadaZone(kit, c, ctx) {
  const batch = new StaticBatch();
  routeBuoys(kit, c, batch, 80, 36);
  batch.flush(c.group);
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineGreen, step: 14, halfWidth: 66 }));
}

function shadowZone(kit, c, ctx) {
  const rng = c.rng;
  const batch = new StaticBatch();
  const G = kitGeo(kit);
  // slow storm of debris shed by the mothership: far decor + a few destructible fragments in the lane
  for (let i = 0; i < 10; i++) {
    const f = c.frame(rng.range(0, c.length));
    const sc = rng.range(1.5, 7);
    _q.setFromEuler(_e.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6)));
    f.localToWorld(rng.sign() * rng.range(30, 160), rng.range(-50, 60), 0, _v);
    batch.add(G.box, rng.chance(0.6) ? kit.M.hullAbyss : kit.M.hullAbyssLight, _v, _s.set(sc * 1.8, sc * 0.5, sc * 1.2), _q);
  }
  if (c.s0 > S(3560)) {
    const n = 2 + Math.floor(c.progress * 3);
    for (let i = 0; i < n; i++) hullFragment(kit, c, ((i + rng.range(0.15, 0.85)) / n) * c.length, rng.range(-13, 13), rng.range(-7, 7), rng.range(1.2, 2.2), rng);
  }
  batch.flush(c.group);
  c.add(kit.vectorGrid(c, { y: -30, mat: kit.M.lineGreen, step: 18, halfWidth: 60 }));
}

/** Trench cut into the mothership's hull: plated floor and walls, deck structures beyond. */
function hullZone(kit, c, ctx) {
  const rng = c.rng;
  const M = kit.M;
  const G = kitGeo(kit);
  const T = TRENCH;
  const batch = new StaticBatch();
  const seg = 20;
  const wallH = T.deck - T.floor;
  for (let o = 0; o < c.length; o += seg) {
    const f = c.frame(o + seg / 2);
    const k = Math.floor((c.s0 + o) / seg);
    batch.addInFrame(G.box, M.deckPlate, f, 0, T.floor - 1, 0, [T.wall * 2, 2, seg + 0.6]);
    for (const s of [-1, 1]) {
      batch.addInFrame(G.box, M.deckPlate, f, s * (T.wall + 1), T.floor + wallH / 2, 0, [2, wallH, seg + 0.6]);
      // hull deck stretching away from the trench lip
      batch.addInFrame(G.box, M.deckPlate, f, s * (T.wall + 2 + 110), T.deck - 1, 0, [220, 2, seg + 0.6]);
      // wall ribs, pipes and light strips
      batch.addInFrame(G.box, M.hullAbyssLight, f, s * (T.wall - 0.4), T.floor + wallH / 2, -seg / 2 + 2, [1.4, wallH, 2.2]);
      batch.addInFrame(G.cylinder, M.hullAbyss, f, s * (T.wall - 1.2), T.floor + 2.4, 0, [0.9, seg + 0.6, 0.9], [Math.PI / 2, 0, 0]);
      batch.addInFrame(G.cylinder, M.hullAbyss, f, s * (T.wall - 1), T.floor + 5, 0, [0.5, seg + 0.6, 0.5], [Math.PI / 2, 0, 0]);
      if (k % 2 === 0) batch.addInFrame(G.box, M.trimGreen, f, s * (T.wall - 0.05), T.deck - 3, 0, [0.12, 0.25, seg * 0.9]);
      batch.addInFrame(G.box, M.dimGreen, f, s * (T.wall - 0.05), T.floor + 9, 0, [0.12, 0.18, seg * 0.6]);
      batch.addInFrame(G.box, M.trimGreen, f, s * (T.wall + 0.2), T.deck + 0.05, 0, [1, 0.12, seg * 0.95]);
    }
    // floor guide lights (chevrons every other segment)
    if (k % 2 === 0) for (const s of [-1, 1]) batch.addInFrame(G.box, M.trimGreen, f, s * 8, T.floor + 0.05, 0, [0.6, 0.12, 6], [0, s * 0.35, 0]);
  }
  // deck superstructure beyond the trench: blocks, towers with beacons, domes, antenna masts
  for (let i = 0; i < 9; i++) {
    const o = rng.range(0, c.length);
    const f = c.frame(o);
    const x = rng.sign() * rng.range(T.wall + 14, 240);
    const kind = rng.next();
    if (kind < 0.45) {
      const w = rng.range(10, 30);
      const h = rng.range(6, 30);
      batch.addInFrame(G.box, M.hullAbyss, f, x, T.deck + h / 2, 0, [w, h, rng.range(10, 30)]);
      batch.addInFrame(G.box, M.deckPlate, f, x, T.deck + h + 1.5, 0, [w * 0.6, 3, w * 0.5]);
      if (rng.chance(0.7)) batch.addInFrame(G.box, M.dimGreen, f, x, T.deck + h * 0.6, 0, [w + 0.1, 0.4, 0.4]);
    } else if (kind < 0.75) {
      const h = rng.range(30, 90);
      batch.addInFrame(G.cylinderHex, M.hullAbyssLight, f, x, T.deck + h / 2, 0, [3, h, 3]);
      batch.addInFrame(G.cylinderHex, M.hullAbyss, f, x, T.deck + h, 0, [6, 4, 6]);
      const beacon = kit.sprite(rng.chance(0.5) ? 0xff3a3a : GREEN, 0.95);
      c.at(o, x, T.deck + h + 4, 0, beacon.position);
      beacon.scale.setScalar(5);
      c.add(beacon);
      const ph = rng.range(0, 6);
      c.animate((dt, t) => (beacon.visible = Math.sin(t * 3 + ph) > 0));
    } else if (kind < 0.9) {
      const r = rng.range(6, 14);
      batch.addInFrame(G.sphere, M.hullAbyssLight, f, x, T.deck, 0, [r, r * 0.6, r]);
      batch.addInFrame(G.torus, M.trimGreen, f, x, T.deck + 0.3, 0, [r * 1.02, r * 1.02, r], [Math.PI / 2, 0, 0]);
    } else {
      batch.addInFrame(G.cylinder, M.hullAbyss, f, x, T.deck + 40, 0, [0.6, 80, 0.6]);
      batch.addInFrame(G.box, M.hullAbyssLight, f, x, T.deck + 60, 0, [14, 0.5, 0.5]);
    }
  }
  batch.flush(c.group);

  // hazards in the trench: bridges to fly over / under and pylons to slalom
  if (c.s0 > S(4600) && c.s0 < DOOR_S - 200) {
    const pick = Math.floor(c.s0 / 100) % 3;
    if (pick === 0) trenchBridge(kit, c, ctx, rng.range(30, 70));
    else if (pick === 1 && rng.chance(0.7)) trenchPylons(kit, c, ctx, rng.range(25, 75));
  }
  if (c.s0 <= DOOR_S && c.s0 + c.length > DOOR_S) hangarDoor(kit, c, ctx, DOOR_S - c.s0);
}

function trenchBridge(kit, c, ctx, o) {
  const M = kit.M;
  const y = c.rng.range(-9, 5);
  const g = new THREE.Group();
  kit.place(g, c.frame(o), 0, y, 0);
  const beam = kit.mesh(kit.G.box, M.hullAbyssLight, null, [TRENCH.wall * 2, 3.2, 4]);
  g.add(beam);
  g.add(kit.mesh(kit.G.box, M.trimGreen, [0, 1.65, 2.05], [TRENCH.wall * 2 - 2, 0.2, 0.1]));
  g.add(kit.mesh(kit.G.box, M.trimGreen, [0, -1.65, 2.05], [TRENCH.wall * 2 - 2, 0.2, 0.1]));
  for (const s of [-1, 1]) g.add(kit.mesh(kit.G.box, M.hullAbyss, [s * (TRENCH.wall - 2), 0, 0], [4, 6, 5]));
  const B = OBSTACLES.bridge;
  const obs = ctx.game.obstacles.add(g, { colliders: [{ type: 'box', node: beam }], damage: 1, hp: B.hp, score: B.score, dropChance: B.dropChance });
  obs.explosionSize = 2.4;
  obs.explosionColor = 0x8affb0;
  warnOnce(c, ctx, g.position, 'PASSARELA À FRENTE — PASSE POR CIMA OU POR BAIXO');
}

function trenchPylons(kit, c, ctx, o) {
  const M = kit.M;
  const xs = c.rng.chance(0.5) ? [-7, 7] : [0];
  for (const x of xs) {
    const g = new THREE.Group();
    kit.place(g, c.frame(o + (x > 0 ? 18 : 0)), x, (TRENCH.floor + TRENCH.deck) / 2, 0);
    const pylon = kit.mesh(kit.G.cylinderHex, M.hullAbyssLight, null, [2.4, TRENCH.deck - TRENCH.floor, 2.4]);
    g.add(pylon);
    g.add(kit.mesh(kit.G.torus, M.trimGreen, [0, 6, 0], [2.6, 2.6, 2.6], [Math.PI / 2, 0, 0]));
    g.add(kit.mesh(kit.G.torus, M.trimGreen, [0, -6, 0], [2.6, 2.6, 2.6], [Math.PI / 2, 0, 0]));
    const collider = kit.mesh(kit.G.box, M.hullAbyss, null, [4.4, TRENCH.deck - TRENCH.floor, 4.4]);
    collider.visible = false;
    g.add(collider);
    ctx.game.obstacles.add(g, { colliders: [{ type: 'box', node: collider }], damage: 1 });
  }
  warnOnce(c, ctx, c.at(o, 0, 0, 0, new THREE.Vector3()), 'PILARES NA TRINCHEIRA — DESVIE!');
}

function warnOnce(c, ctx, pos, text) {
  const at = pos.clone();
  let warned = false;
  c.animate(() => {
    if (warned || at.distanceTo(ctx.game.player.worldPosition) > ctx.game.rail.speed * 3.2) return;
    warned = true;
    ctx.game.hud.warning(text, 1.4);
    ctx.game.audio.play('warning');
  });
}

/** The hangar blast doors at the end of the trench slide apart as the ship approaches. */
function hangarDoor(kit, c, ctx, o) {
  const M = kit.M;
  const G = kitGeo(kit);
  const door = new THREE.Group();
  kit.place(door, c.frame(o), 0, 0, 0);
  const frame = new StaticBatch();
  const F = new THREE.Vector3();
  const add = (geo, mat, x, y, z, sc) => frame.add(geo, mat, F.set(x, y, z), _s.set(...sc));
  add(G.box, M.hullAbyss, 0, 36, 0, [200, 22, 8]);
  add(G.box, M.hullAbyss, 0, TRENCH.floor - 6, 0, [200, 10, 8]);
  for (const s of [-1, 1]) add(G.box, M.hullAbyss, s * 58, 10, 0, [36, 74, 8]);
  add(G.box, M.trimGreen, 0, 25.2, 4.1, [80, 0.4, 0.2]);
  for (const s of [-1, 1]) add(G.box, M.trimGreen, s * 40.2, 4, 4.1, [0.4, 42, 0.2]);
  frame.flush(door);
  door.children.forEach((m) => (m.matrixAutoUpdate = true)); // the batch is in door-local space here
  const halves = [];
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    half.add(kit.mesh(G.box, M.deckPlate, [0, 0, 0], [40, 46, 3]));
    for (let i = 0; i < 4; i++) half.add(kit.mesh(G.box, M.trimGreen, [s * -16, -15 + i * 10, 1.6], [6, 0.35, 0.1], [0, 0, s * 0.6]));
    half.add(kit.mesh(G.box, M.hullAbyssLight, [s * -19.5, 0, 1.2], [1, 46, 1]));
    half.position.set(s * 20, 3, 0);
    door.add(half);
    halves.push({ half, s });
  }
  const glow = kit.sprite(GREEN, 0.5);
  glow.scale.setScalar(120);
  glow.position.set(0, 3, -30);
  door.add(glow);
  c.add(door);
  const doorPos = door.position.clone();
  let announced = false;
  c.animate(() => {
    const dist = doorPos.distanceTo(ctx.game.player.worldPosition);
    const open = clamp(1 - (dist - 70) / 260, 0, 1);
    for (const h of halves) h.half.position.x = h.s * (20 + open * 44);
    glow.material.opacity = 0.2 + open * 0.5;
    if (!announced && dist < 380) {
      announced = true;
      ctx.game.hud.warning('COMPORTAS DO HANGAR ABRINDO', 2);
      ctx.game.audio.play('warning');
    }
  });
}

/** Colossal launch hall: arched ribs, launch rails with scrolling chevrons, docked fighters. */
function hangarZone(kit, c, ctx) {
  const rng = c.rng;
  const M = kit.M;
  const G = kitGeo(kit);
  const H = HANGAR;
  const state = ctx.state;
  const batch = new StaticBatch();
  const seg = 20;
  const height = H.ceiling - H.floor;
  for (let o = 0; o < c.length; o += seg) {
    const f = c.frame(o + seg / 2);
    batch.addInFrame(G.box, M.deckPlate, f, 0, H.floor - 1, 0, [H.wall * 2, 2, seg + 0.6]);
    batch.addInFrame(G.box, M.hullAbyss, f, 0, H.ceiling + 1, 0, [H.wall * 2, 2, seg + 0.6]);
    for (const s of [-1, 1]) {
      batch.addInFrame(G.box, M.deckPlate, f, s * (H.wall + 1), (H.floor + H.ceiling) / 2, 0, [2, height, seg + 0.6]);
      // racks on the walls (three levels) and launch rails on the floor
      for (const y of [H.floor + 18, H.floor + 36, H.floor + 54]) {
        batch.addInFrame(G.box, M.hullAbyssLight, f, s * (H.wall - 6), y, 0, [12, 1, seg + 0.6]);
        batch.addInFrame(G.box, M.dimGreen, f, s * (H.wall - 0.2), y + 0.6, 0, [0.12, 0.12, seg * 0.9]);
      }
      for (const x of [18, 48]) {
        batch.addInFrame(G.box, M.hullAbyss, f, s * x, H.floor + 0.3, 0, [4, 0.6, seg + 0.6]);
        batch.addInFrame(G.box, state.railMat, f, s * x, H.floor + 0.65, 0, [0.7, 0.05, seg + 0.6]);
      }
    }
  }
  // arched ribs every 40 units with floodlights
  const first = 40 - (c.s0 % 40);
  for (let o = first; o < c.length; o += 40) {
    const f = c.frame(o);
    for (const s of [-1, 1]) {
      batch.addInFrame(G.box, M.hullAbyssLight, f, s * (H.wall - 3), (H.floor + H.ceiling) / 2, 0, [6, height, 6]);
      batch.addInFrame(G.box, M.dimGreen, f, s * (H.wall - 6.1), (H.floor + H.ceiling) / 2, 0, [0.15, height - 6, 0.4]);
      batch.addInFrame(G.box, M.hullAbyss, f, s * (H.wall - 18), H.ceiling - 6, 0, [30, 4, 4], [0, 0, s * -0.55]);
      const lamp = kit.sprite(0xe8f4ff, 0.5);
      c.at(o, s * 40, H.ceiling - 4, 0, lamp.position);
      lamp.scale.setScalar(22);
      c.add(lamp);
    }
    batch.addInFrame(G.box, M.hullAbyssLight, f, 0, H.ceiling - 3, 0, [H.wall * 2, 5, 6]);
    batch.addInFrame(G.box, M.dimGreen, f, 0, H.ceiling - 5.6, 0, [H.wall * 2 - 12, 0.2, 0.2]);
  }
  batch.flush(c.group);

  // docked fighters: floor rows and wall racks, one instanced mesh per material slot
  const spots = [];
  for (let i = 0; i < 14; i++) {
    const o = rng.range(2, c.length - 2);
    const s = rng.sign();
    const onRack = rng.chance(0.5);
    const y = onRack ? H.floor + 18 + 18 * Math.floor(rng.range(0, 3)) + 1.4 : H.floor + 1.4;
    const x = onRack ? s * (H.wall - 7) : s * rng.range(60, 82);
    spots.push({ f: c.frame(o), x, y, yaw: onRack ? 0 : rng.range(-0.3, 0.3) });
  }
  for (const { geometry, slot } of state.fighterSlots) {
    const mesh = new THREE.InstancedMesh(geometry, state.fighterMats[slot], spots.length);
    spots.forEach((p, i) => {
      p.f.localToWorld(p.x, p.y, 0, _v);
      _q.copy(p.f.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.yaw));
      mesh.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(1)));
    });
    mesh.userData.ownsInstances = true;
    c.add(mesh);
  }

  // overhead crane sweeping a cargo container across the route
  if (c.s0 > S(6250) && c.s0 < S(7400) && Math.floor(c.s0 / 100) % 2 === 1) cargoCrane(kit, c, ctx, rng.range(30, 70));
}

function cargoCrane(kit, c, ctx, o) {
  const M = kit.M;
  const H = HANGAR;
  const rail = new THREE.Group();
  kit.place(rail, c.frame(o), 0, 0, 0);
  rail.add(kit.mesh(kit.G.box, M.hullAbyss, [0, H.ceiling - 9, 0], [H.wall * 2 - 10, 3, 5]));
  c.add(rail);
  const dir = c.rng.sign();
  const y = c.rng.range(-3, 4);
  const crate = new THREE.Group();
  crate.add(kit.mesh(kit.G.box, M.hullAbyssLight, null, [9, 7, 9]));
  crate.add(kit.mesh(kit.G.box, M.trimGreen, [0, 3.55, 0], [9.1, 0.2, 9.1]));
  crate.add(kit.mesh(kit.G.box, M.glowRed, [0, -3.55, 4.6], [6, 0.3, 0.1]));
  const cable = kit.mesh(kit.G.cylinder, M.hullAbyss, [0, (H.ceiling - 9 - y) / 2 + 3.5, 0], [0.35, H.ceiling - 12 - y, 0.35]);
  crate.add(cable);
  const collider = crate.children[0];
  kit.place(crate, c.frame(o), -dir * 70, y, 0);
  const frame = c.frame(o);
  const start = -dir * 70;
  let x = start;
  let moving = false;
  let warned = false;
  ctx.game.obstacles.add(crate, {
    colliders: [{ type: 'box', node: collider }],
    damage: 1,
    update: (dt) => {
      const dist = crate.position.distanceTo(ctx.game.player.worldPosition);
      if (!moving && Math.abs(frame.position.distanceTo(ctx.game.player.worldPosition)) < ctx.game.rail.speed * 3.4) moving = true;
      if (moving && Math.abs(x) <= 75) {
        x += dir * 24 * dt;
        frame.localToWorld(x, y, 0, crate.position);
      }
      if (!warned && dist < ctx.game.rail.speed * 3.6) {
        warned = true;
        ctx.game.hud.warning('CARGA EM MOVIMENTO!', 1.3);
        ctx.game.audio.play('warning');
      }
    },
  });
}

/** Circular conduit to the core: octagonal frames, energy channels and spinning rotor rings. */
function conduitZone(kit, c, ctx) {
  const M = kit.M;
  const G = kitGeo(kit);
  const batch = new StaticBatch();
  const R = CONDUIT_R;
  const sides = 8;
  const side = 2 * R * Math.tan(Math.PI / sides);
  const step = 16;
  for (let o = 0; o < c.length; o += step) {
    const f = c.frame(o);
    const k = Math.floor((c.s0 + o) / step);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU + Math.PI / sides;
      const x = Math.cos(a) * R;
      const y = Math.sin(a) * R;
      const rot = [0, 0, a + Math.PI / 2];
      batch.addInFrame(G.box, M.hullAbyssLight, f, x, y, 0, [side + 1.2, 1.8, 2.6], rot);
      batch.addInFrame(G.box, M.deckPlate, f, Math.cos(a) * (R + 1.4), Math.sin(a) * (R + 1.4), -step / 2, [side, 1, step + 0.4], rot);
      if (k % 2 === 0) batch.addInFrame(G.box, i % 2 ? M.trimGreen : M.dimGreen, f, Math.cos(a) * (R - 1), Math.sin(a) * (R - 1), 0, [side * 0.6, 0.2, 0.3], rot);
      // energy channels running along the walls
      if (i % 2 === 0) batch.addInFrame(G.box, ctx.state.railMat, f, Math.cos(a) * (R + 0.7), Math.sin(a) * (R + 0.7), -step / 2, [1.2, 0.1, step + 0.4], rot);
    }
  }
  batch.flush(c.group);
  if (Math.floor(c.s0 / 100) % 2 === 0) {
    const rotor = new THREE.Group();
    kit.place(rotor, c.frame(50), 0, 0, 0);
    rotor.add(kit.mesh(G.torusThick, M.hullAbyss, null, [R - 1.5, R - 1.5, R - 1.5]));
    rotor.add(kit.mesh(G.torus, M.trimGreen, null, [R - 2.5, R - 2.5, R]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      rotor.add(kit.mesh(G.box, M.hullAbyssLight, [Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), 0], [4, 1.2, 2], [0, 0, a]));
    }
    c.add(rotor);
    const spin = (c.rng.chance(0.5) ? 1 : -1) * 0.6;
    c.animate((dt) => rotor.rotateZ(spin * dt));
  }
}

function heartZone(kit, c, ctx) {
  const M = kit.M;
  const G = kitGeo(kit);
  const batch = new StaticBatch();
  const first = 50 - (c.s0 % 50);
  for (let o = first; o < c.length; o += 50) {
    const f = c.frame(o);
    batch.addInFrame(G.torusThick, M.hullAbyss, f, 0, 0, 0, [90, 90, 40]);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      batch.addInFrame(G.box, M.hullAbyssLight, f, Math.cos(a) * 80, Math.sin(a) * 80, 0, [10, 3, 8], [0, 0, a + Math.PI / 2]);
      batch.addInFrame(G.box, M.dimGreen, f, Math.cos(a) * 77.8, Math.sin(a) * 77.8, 0, [5, 0.3, 0.3], [0, 0, a + Math.PI / 2]);
    }
  }
  batch.flush(c.group);
  c.add(kit.vectorGrid(c, { y: -40, mat: kit.M.lineGreen, step: 16, halfWidth: 80 }));
}

// ------------------------------------------------------------------ set pieces
/**
 * Capital ships of the armada: bigger than a scenery chunk, so the stage spawns and retires
 * them itself. `at` is where they are when first placed; they cruise forward slower than the player.
 */
const CRUISERS = [
  { at: S(1300), x: -125, y: -6, length: 420, speed: 18, seed: 11 },
  { at: S(1700), x: 130, y: 8, length: 380, speed: 22, seed: 12 },
  { at: S(2150), x: -105, y: 4, length: 460, speed: 16, seed: 13 },
  { at: S(2600), x: 118, y: -8, length: 400, speed: 20, seed: 14 },
  { at: S(3050), x: -128, y: 10, length: 440, speed: 18, seed: 15 },
  { at: S(3420), x: 108, y: 0, length: 360, speed: 22, seed: 16 },
  { at: S(3850), x: -175, y: 26, length: 520, speed: 14, seed: 17 },
  { at: S(4150), x: 170, y: -20, length: 480, speed: 16, seed: 18 },
];

function updateCruisers(game, state, dt) {
  const rail = game.rail;
  const player = game.player.worldPosition;
  const fwd = rail.frame.forward;
  while (state.cruiserIndex < CRUISERS.length && rail.pathId === 'main' && rail.s > CRUISERS[state.cruiserIndex].at - 760) {
    const d = CRUISERS[state.cruiserIndex++];
    const ship = new CapitalShip(game.assets, { kind: 'cruiser', length: d.length, seed: d.seed });
    const f = rail.main.frameAt(d.at, new RailFrame());
    f.localToWorld(d.x, d.y, 0, ship.group.position);
    ship.group.quaternion.copy(f.quaternion);
    ship.group.rotateZ(d.x < 0 ? -0.06 : 0.06);
    ship.def = d;
    ship.velocity = f.forward.clone().multiplyScalar(d.speed);
    ship.flakTimer = rand(1.5, 3);
    game.scene.add(ship.group);
    state.cruisers.push(ship);
  }
  for (let i = state.cruisers.length - 1; i >= 0; i--) {
    const ship = state.cruisers[i];
    ship.group.position.addScaledVector(ship.velocity, dt);
    ship.update(dt);
    _v.subVectors(ship.group.position, player);
    const ahead = _v.dot(fwd);
    if (ahead < -ship.length * 0.6 - 160) {
      ship.dispose();
      state.cruisers.splice(i, 1);
      continue;
    }
    // flak from the inner hardpoints while the ship is alongside
    ship.flakTimer -= dt;
    if (ship.flakTimer <= 0 && Math.abs(ahead) < ship.length * 0.5 && game.combatActive && game.player.alive) {
      ship.flakTimer = rand(2.2, 3.6) / game.difficulty.fireRate;
      const inner = ship.hardpoints.map((h, k) => k).filter((k) => ship.hardpoints[k].side === (ship.def.x < 0 ? 1 : -1));
      const k = inner[Math.floor(Math.random() * inner.length)];
      ship.hardpointWorld(k, _w);
      _v.subVectors(_w, player);
      if (_v.dot(fwd) > 20) {
        for (const spread of [-0.08, 0, 0.08]) game.projectiles.fireEnemyAt(_w, player, { speed: 38, spreadAngle: spread, size: 1.1 });
        game.effects.flash(_w, 8, 0.15, 0x8aff3a, 1.2);
        game.audio.play('enemyShoot');
      }
    }
  }
}

/**
 * Broadside: the cruiser alongside on `side` fires beams across the play area from its flank at
 * two of three heights (the third lane is safe). The beams live on the player plane (rail-local)
 * like boss lane attacks, so they travel with the ship; the cruiser's turrets flash as they fire.
 */
function broadside({ game, state }, side) {
  const player = game.player.worldPosition;
  const fwd = game.rail.frame.forward;
  const ship = state.cruisers.find((s) => Math.sign(s.def.x) === side && Math.abs(_v.subVectors(s.group.position, player).dot(fwd)) < s.length * 0.55);
  const reach = ship ? Math.abs(ship.def.x) - 6 : 110;
  const lanes = [-6, 0, 6];
  const safe = Math.floor(Math.random() * 3);
  lanes.forEach((lane, i) => {
    if (i === safe) return;
    const start = new THREE.Vector3(side * reach, lane, -1);
    const end = new THREE.Vector3(-side * 60, lane, -1);
    game.obstacles.fireBeam({ start, end, local: true, warn: 1.5, fire: 0.8, radius: 1.2, color: 0x8aff3a, intensity: 0.5 });
  });
  if (ship) {
    // muzzle flashes along the cruiser's inner flank
    ship.hardpoints.forEach((h, k) => h.side === -side && game.effects.flash(ship.hardpointWorld(k, _w), 14, 0.5, 0x8aff3a, 1.5));
  }
  game.hud.warning(side < 0 ? 'SALVA DO CRUZADOR — BOMBORDO!' : 'SALVA DO CRUZADOR — ESTIBORDO!', 1.4);
  game.audio.play('telegraph');
}

function containmentGrid({ game, state }) {
  state.grids.push(new ContainmentGrid(game, { warn: 1.7, fire: 0.8 }));
}

/** Docked-fighter model for the hangar racks (built once, instanced per chunk). */
function buildFighterSlots() {
  const b = new ModelBuilder();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const wing = hullFromOutline(symmetricOutline([[0, 1.6], [1.2, 0.2], [3.4, -1.6], [3.4, -2.2], [0, -1.8]]), 0.25, 0.05, 1);
  b.add(box, 'hull', { pos: [0, 0, 0.2], scale: [1.4, 1, 5.2] });
  b.add(wing, 'plate', { pos: [0, -0.1, 0.4] });
  b.add(box, 'plate', { pos: [0, 0.65, -0.8], scale: [0.8, 0.5, 1.6] });
  b.add(box, 'glow', { pos: [0, 0.2, 2.85], scale: [1, 0.4, 0.1] });
  b.add(box, 'glow', { pos: [0, -0.15, -2.3], scale: [0.2, 0.1, 0.4] });
  const slots = b.finish();
  box.dispose();
  wing.dispose();
  return slots;
}

const wave = (at, enemy, formation, count, extra = {}) => ({ at: S(at), type: 'wave', enemy, formation, count, ...extra });
const ev = (at, type, extra = {}) => ({ at: S(at), type, ...extra });
const lancer = (at, x, y, extra = {}) => ev(at, 'enemy', { enemy: 'prismLancer', x, y, z: -240, ...extra });
const hunter = (at, x, y, extra = {}) => ev(at, 'enemy', { enemy: 'phaseHunter', x, y, z: -240, ...extra });
const wall = (x, y, dz = 0) => ({ x: x < 0 ? -21 : 21, y, dz, roll: x < 0 ? -Math.PI / 2 : Math.PI / 2, strut: 1.5 });
const grid = (at) => ev(at, 'custom', { run: containmentGrid });
const salvo = (at, side) => ev(at, 'custom', { run: (ctx) => broadside(ctx, side) });

export const Stage4 = {
  id: 4,
  name: 'ABYSSAL ARMADA',
  subtitle: 'Nave-mãe Leviatã · Espaço profundo',
  seed: 4417,
  bossMusic: 'boss4',
  outro: 'final',
  ending: 'mothership',
  victory: 'A Abyssal Matriarch caiu e a Leviatã se partiu no vazio. A armada não existe mais.',
  buildPath,
  createBoss: (game) => new AbyssalMatriarch(game),
  theme: {
    speed: 48,
    warpColor: 0x35ff8a,
    // the last stage: on top of the chosen difficulty, enemies fire more, faster and are tougher
    aggression: { fireRate: 1.25, bulletSpeed: 1.12, enemyHp: 1.15 },
    background: 0x010205,
    backgroundFactor: 0.5,
    fog: 0x02040a,
    fogNear: 80,
    env: 'abyss',
    hemiSky: 0x56606e,
    hemiGround: 0x05070a,
    key: 0xffe8cc,
    keyIntensity: 2.6,
    rim: 0x9ab0d0,
    rimIntensity: 0.7,
    enemyRim: 0x35ff8a,
    enemyTrim: 'trimGreen',
    enemyAccent: 'glowGreen',
    enemyShot: COLORS.enemyShotStage4,
    dust: 0xc8d8ff,
    sky: { stars: [0xd0dcff, 0xffffff, 0xffe8d0, 0x9ab0e0], nebula: [0x3a5aa0], nebulaCount: 0, skybox: ABYSS_SKY },
  },

  sections: [
    { id: 'void', start: 0, end: S(1400), title: 'O Vazio', speed: 48, fog: 0x02040a, chunk: voidZone },
    { id: 'armada', start: S(1400), end: S(3500), title: 'A Armada', warning: 'ARMADA INIMIGA — CUIDADO COM AS SALVAS', speed: 46, fog: 0x030610, sky: { tint: 0xe0e8ff, intensity: 0.95 }, chunk: armadaZone },
    { id: 'shadow', start: S(3500), end: HULL_S, title: 'A Sombra da Leviatã', warning: 'A NAVE-MÃE LEVIATÃ', speed: 44, fog: 0x02050a, dust: 0xa8ffd0, sky: { tint: 0xc8d4ff, intensity: 0.75 }, chunk: shadowZone },
    { id: 'hull', start: HULL_S, end: DOOR_S, title: 'Casco da Leviatã', warning: 'VOO RASANTE — ENTRE NA TRINCHEIRA', speed: 52, fog: 0x050b10, dust: 0xd0ffe0, bloom: 1.05, sky: { tint: 0xffffff, intensity: 1.05 }, chunk: hullZone },
    { id: 'hangar', start: DOOR_S, end: S(7500), title: 'Hangar da Leviatã', warning: 'DENTRO DA NAVE-MÃE', speed: 40, fog: 0x040a0a, dust: 0xb0ffd0, chunk: hangarZone },
    { id: 'conduit', start: S(7500), end: S(8700), title: 'Conduto do núcleo', warning: 'ALTA VELOCIDADE!', speed: 72, fog: 0x041008, dust: 0x4a8a6a, bloom: 1.05, chunk: conduitZone },
    { id: 'heart', start: S(8700), end: MAIN_LENGTH + 400, title: 'Coração da Leviatã', speed: 30, fog: 0x030a08, bloom: 1.1, chunk: heartZone },
  ],

  events: [
    ev(0, 'music', { track: 'stage4', intensity: 0, persistent: true }),
    ev(0, 'banner', { title: 'STAGE 4', subtitle: 'ABYSSAL ARMADA' }),
    ev(260, 'warning', { text: 'FORA DA GALÁXIA — ESPAÇO PROFUNDO', duration: 2.5 }),
    wave(330, 'scout', 'V', 5, { pattern: 'swoop' }),
    ev(420, 'music', { intensity: 1 }),
    wave(560, 'scout', 'line', 5, { pattern: 'cross', side: 1, z: -90, y: 2, spacing: 6 }),
    ev(720, 'enemy', { enemy: 'interceptor', x: -8, y: 3, z: -260, opts: { entry: 'front' } }),
    ev(730, 'enemy', { enemy: 'interceptor', x: 8, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(900, 'mines', { ahead: 300, list: [{ x: -7, y: 2 }, { x: 7, y: -3, dz: 40 }, { x: 0, y: 5, dz: 90 }] }),
    wave(1050, 'scout', 'column', 5, { pattern: 'dive', y: 16 }),
    ev(1150, 'powerup', { item: 'rapidFire', x: 3 }),
    ev(1250, 'enemy', { enemy: 'heavy', x: 0, y: 2, z: -260, opts: { drop: 'dualCannon' } }),

    salvo(1560, -1),
    wave(1660, 'scout', 'V', 6, { pattern: 'swoop', x: 4 }),
    ev(1800, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(1810, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    salvo(1960, 1),
    ev(2060, 'enemy', { enemy: 'carrier', x: -6, y: 6, z: -300, opts: { drop: 'shield' } }),
    lancer(2220, 8, 2),
    salvo(2420, -1),
    wave(2520, 'scout', 'arc', 6, { pattern: 'swoop' }),
    ev(2660, 'powerup', { item: 'repair', x: -3 }),
    ev(2790, 'checkpoint'),
    salvo(2860, 1),
    ev(2960, 'enemy', { enemy: 'heavy', x: -5, y: 2, z: -260 }),
    ev(3020, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(3030, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    hunter(3160, 0, 4),
    salvo(3300, -1),
    ev(3420, 'powerup', { item: 'bomb', x: 2 }),

    ev(3600, 'mines', { ahead: 300, list: [{ x: -8, y: -3 }, { x: 8, y: 3, dz: 40 }, { x: 0, y: 0, dz: 80 }] }),
    ev(3700, 'enemy', { enemy: 'carrier', x: 7, y: 5, z: -300, opts: { drop: 'bomb' } }),
    wave(3850, 'scout', 'V', 7, { pattern: 'swoop', spacing: 4.5 }),
    lancer(4000, -8, 3),
    lancer(4020, 8, -1),
    ev(4150, 'mines', { ahead: 280, list: [{ x: -5, y: 5 }, { x: 5, y: -5, dz: 30 }] }),
    ev(4300, 'powerup', { item: 'shield', x: 0 }),
    ev(4390, 'checkpoint'),

    ev(4520, 'turrets', { ahead: 320, list: [wall(-1, -6), wall(1, -10, 60)] }),
    wave(4650, 'scout', 'column', 5, { pattern: 'dive', y: 14 }),
    ev(4800, 'turrets', { ahead: 320, list: [wall(1, -4), wall(-1, -12, 50), wall(1, -14, 110)] }),
    ev(4960, 'enemy', { enemy: 'interceptor', x: -6, y: 3, z: -260, opts: { entry: 'front' } }),
    ev(4970, 'enemy', { enemy: 'interceptor', x: 6, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(5100, 'turrets', { ahead: 320, spread: 3, list: [wall(-1, -8), wall(1, -8, 70)] }),
    hunter(5250, 0, 3),
    ev(5400, 'turrets', { ahead: 320, list: [wall(-1, -3), wall(1, -3, 40), wall(-1, -13, 90)] }),
    ev(5520, 'enemy', { enemy: 'heavy', x: 0, y: 3, z: -260, opts: { drop: 'repair' } }),
    ev(5660, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(5800, 'turrets', { ahead: 300, spread: 3, list: [wall(1, -6), wall(-1, -6, 60)] }),
    ev(5950, 'powerup', { item: 'rapidFire', x: -2 }),
    ev(6080, 'checkpoint'),

    wave(6250, 'scout', 'line', 6, { pattern: 'cross', side: -1, z: -100, y: -2, spacing: 6 }),
    wave(6420, 'scout', 'line', 6, { pattern: 'cross', side: 1, z: -110, y: 4, spacing: 6 }),
    ev(6560, 'turrets', { ahead: 300, list: [{ x: -10, y: 13, flip: true, strut: 30 }, { x: 10, y: 13, dz: 50, flip: true, strut: 30 }] }),
    ev(6660, 'enemy', { enemy: 'interceptor', x: -7, y: 3, z: -260, opts: { entry: 'front' } }),
    ev(6670, 'enemy', { enemy: 'interceptor', x: 7, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(6820, 'enemy', { enemy: 'carrier', x: 0, y: 6, z: -280, opts: { drop: 'bomb' } }),
    lancer(6980, -8, 2),
    wave(7120, 'scout', 'line', 6, { pattern: 'cross', side: -1, z: -95, y: 1, spacing: 6 }),
    ev(7260, 'powerup', { item: 'repair', x: 3 }),
    ev(7360, 'enemy', { enemy: 'heavy', x: 4, y: 2, z: -260 }),
    ev(7490, 'checkpoint'),

    grid(7640),
    ev(7800, 'mines', { ahead: 300, list: [{ x: -6, y: -4 }, { x: 6, y: 4, dz: 40 }, { x: 0, y: -6, dz: 90 }] }),
    grid(7960),
    hunter(8100, 0, 0),
    grid(8260),
    ev(8420, 'powerup', { item: 'shield', x: -3 }),
    ev(8440, 'powerup', { item: 'repair', x: 3 }),

    ev(8700, 'warning', { text: 'O CORAÇÃO DA LEVIATÃ — ABYSSAL MATRIARCH', duration: 3 }),
    ev(8720, 'music', { intensity: 0 }),
    ev(8740, 'checkpoint'),
    ev(8800, 'boss'),
  ],

  setup({ game, state }) {
    state.game = game;
    state.cruisers = [];
    state.cruiserIndex = 0;
    while (state.cruiserIndex < CRUISERS.length && CRUISERS[state.cruiserIndex].at < game.rail.s - 300) state.cruiserIndex++;
    state.grids = [];
    state.railMat = createFlowMaterial(GREEN, game.assets.textures.energyFlow, { intensity: 0.55, speed: 1.6, repeat: [1, 4] });
    state.fighterSlots = buildFighterSlots();
    const M = game.assets.materials;
    state.fighterMats = { hull: M.hullAbyss, plate: M.hullAbyssLight, glow: M.dimGreen };

    // the mothership in the sky: infinitely far (sky group) and growing as the armada closes in
    state.leviathan = new CapitalShip(game.assets, { kind: 'leviathan', length: 1, fog: false, seed: 4, lights: 3200, lightScale: 2.2, rim: 0x2a4868 });
    game.sky.group.add(state.leviathan.group);

    // a dark rogue planet hanging in the void, rim-lit by the galaxy
    const planetMat = new THREE.MeshStandardMaterial({ color: 0x0a0d14, roughness: 0.9, metalness: 0.1, fog: false });
    planetMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float atm = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 4.0);
        totalEmissiveRadiance += vec3(0.25, 0.45, 0.9) * atm * 1.3;`,
      );
    };
    planetMat.customProgramCacheKey = () => 'rogue-planet';
    state.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), planetMat);
    state.planet.position.set(-0.75, -0.32, -0.58).normalize().multiplyScalar(1500);
    state.planet.scale.setScalar(320);
    game.sky.group.add(state.planet);
  },

  teardown({ game, state }) {
    for (const s of state.cruisers ?? []) s.dispose();
    state.cruisers = [];
    for (const g of state.grids ?? []) g.dispose();
    state.grids = [];
    state.leviathan?.dispose();
    if (state.planet) {
      game.sky.group.remove(state.planet);
      state.planet.geometry.dispose();
      state.planet.material.dispose();
    }
    state.railMat?.map.dispose();
    state.railMat?.dispose();
    for (const { geometry } of state.fighterSlots ?? []) geometry.dispose();
  },

  update({ game, state }, dt) {
    scrollFlowMaterial(state.railMat, dt);
    updateCruisers(game, state, dt);
    for (let i = state.grids.length - 1; i >= 0; i--) if (state.grids[i].update(dt)) state.grids.splice(i, 1);

    // LEVIATÃ grows from a distant dagger to a hull that fills the sky, sliding over the galaxy
    const lev = state.leviathan;
    const s = game.rail.s;
    lev.group.visible = s < HULL_S + 40;
    if (lev.group.visible) {
      const p = clamp(s / HULL_S, 0, 1);
      const e = p * p;
      lev.model.scale.setScalar(lerp(8.5, 26, e)); // design units (length 100) -> 850..2600
      _v.set(lerp(-0.5, 0.12, p), lerp(0.02, 0.22, p), -1).normalize().multiplyScalar(lerp(1250, 1050, p));
      lev.group.position.copy(_v);
      // broadside, nose to the left, the city-lit top decks tilted towards the player
      lev.group.rotation.set(lerp(0.5, 0.38, p), lerp(1.95, 1.75, p), 0);
      lev.update(dt);
    }
    state.planet.visible = s < S(3500);
  },
};

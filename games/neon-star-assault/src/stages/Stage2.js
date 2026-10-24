import * as THREE from 'three';
import { RailFrame } from '../systems/Rail.js';
import { CrimsonArchitect } from '../entities/bosses/CrimsonArchitect.js';
import { LightningPool } from '../scenery/SceneryKit.js';
import { createFlowMaterial, scrollFlowMaterial } from '../effects/materials.js';
import { COLORS } from '../config/gameConfig.js';
import { rand, smoothstep, clamp } from '../utils/math.js';

const MAIN_LENGTH = 13600;
const GROUND_Y = -45;
const S = (d) => d + 200;
const _v = new THREE.Vector3();
const _rel = new THREE.Vector3();

// ------------------------------------------------------------------ path
function altitude(d) {
  const orbit = 300 * (1 - smoothstep(0, 1300, d));
  const dive = -240 * smoothstep(4150, 4750, d);
  const wiggle = d > 4750 && d < 8600 ? Math.sin(d * 0.004) * 12 : d < 4150 ? Math.sin(d * 0.003) * 5 : 0;
  return orbit + dive + wiggle;
}

function lateral(d) {
  const calm = 1 - smoothstep(8400, 8700, d);
  return (Math.sin(d * 0.0009) * 110 + Math.sin(d * 0.00031 + 2) * 160) * (0.2 + 0.8 * calm);
}

function buildPath() {
  const points = [];
  for (let d = -200; d <= MAIN_LENGTH; d += 200) {
    const dd = Math.max(0, d);
    points.push(new THREE.Vector3(lateral(dd), altitude(dd), -d));
  }
  return { main: points };
}

// ------------------------------------------------------------------ shared pieces
function addGround(kit, c, state) {
  c.add(kit.groundPlane(c, GROUND_Y, 1000));
  // energy rivers carved into the plating
  if (c.rng.chance(0.5)) {
    const f = c.frame(c.length / 2);
    const river = kit.energyRiver(c.length + 6, c.rng.range(8, 16), state.riverMat);
    river.position.copy(f.position);
    river.position.y = GROUND_Y + 0.3;
    river.position.addScaledVector(f.right, c.rng.sign() * c.rng.range(40, 120));
    river.rotation.set(-Math.PI / 2, Math.atan2(-f.forward.x, -f.forward.z), 0, 'YXZ');
    c.add(river);
  }
}

/** Place an object standing on the ground at rail-local lateral x. */
function onGround(c, obj, o, x) {
  c.at(o, x, 0, 0, obj.position);
  obj.position.y = GROUND_Y;
  const f = c.frame(o);
  obj.rotation.set(0, Math.atan2(-f.forward.x, -f.forward.z), 0);
  return obj;
}

function surfaceProps(kit, c, state, { towers = 0 } = {}) {
  const rng = c.rng;
  const M = kit.M;
  for (let i = 0; i < 5; i++) {
    const block = kit.factoryBlock(rng, rng.range(14, 36), rng.range(8, 40), rng.range(14, 36), rng.chance(0.3) ? M.glowGold : M.glowOrange);
    onGround(c, block, rng.range(0, c.length), rng.sign() * rng.range(40, 220));
    c.add(block);
    if (block.userData.smoke) {
      const smokeAt = block.userData.smoke;
      c.animate(() => {
        if (Math.random() < 0.08) state.game.effects.trail(block.localToWorld(_v.copy(smokeAt)), 0x552018, 4, 1.6);
      });
    }
  }
  if (rng.chance(0.6)) {
    const gear = kit.gear(rng.range(10, 22));
    onGround(c, gear, rng.range(0, c.length), rng.sign() * rng.range(40, 140));
    gear.position.y = GROUND_Y + gear.scale.x * 0.6;
    gear.rotateY(Math.PI / 2);
    c.add(gear);
    const speed = rng.range(0.2, 0.5) * rng.sign();
    c.animate((dt) => gear.rotateZ(dt * speed));
  }
  if (rng.chance(0.5)) {
    const fan = kit.fan(rng.range(8, 14));
    onGround(c, fan, rng.range(0, c.length), rng.sign() * rng.range(30, 110));
    fan.position.y = GROUND_Y + 0.5;
    c.add(fan);
    c.animate((dt) => (fan.userData.rotor.rotation.y += dt * 3));
  }
  for (let i = 0; i < towers; i++) {
    const t = kit.tower(rng, rng.range(60, 150), rng.range(4, 7), M.glowRed);
    onGround(c, t, rng.range(0, c.length), rng.sign() * rng.range(24, 70));
    c.add(t);
  }
  // red vector lines marking defence sectors
  c.add(kit.vectorGrid(c, { y: GROUND_Y + 0.5 - c.frame(0).position.y, halfWidth: 80, step: 20, mat: M.lineRed }));
}

function orbitApproach(kit, c, ctx) {
  const rng = c.rng;
  if (c.s0 > S(500)) addGround(kit, c, ctx.state);
  if (c.s0 > S(700)) surfaceProps(kit, c, ctx.state);
  for (let i = 0; i < 2; i++) {
    if (!rng.chance(0.6)) continue;
    const sat = kit.satellite(rng);
    sat.scale.setScalar(rng.range(1.5, 3));
    c.at(rng.range(0, c.length), rng.sign() * rng.range(40, 120), rng.range(-30, 40), 0, sat.position);
    c.add(sat);
    c.animate((dt, t) => (sat.userData.blink.visible = Math.sin(t * 4) > 0));
  }
  if (rng.chance(0.4)) {
    const plat = kit.mesh(kit.G.cylinderHex, kit.M.structureRed, null, [14, 3, 14]);
    c.at(rng.range(0, c.length), rng.sign() * rng.range(50, 90), rng.range(-20, 10), 0, plat.position);
    c.add(plat);
    const ring = kit.energyRing(15, kit.M.glowOrange);
    ring.rotation.x = Math.PI / 2;
    plat.add(ring);
    ring.scale.set(15 / 14, 15 / 14, 15 / 3);
  }
}

function surfaceCombat(kit, c, ctx) {
  addGround(kit, c, ctx.state);
  surfaceProps(kit, c, ctx.state, { towers: 1 });
}

function towerForest(kit, c, ctx) {
  const rng = c.rng;
  addGround(kit, c, ctx.state);
  surfaceProps(kit, c, ctx.state, { towers: 3 });
  // towers standing inside the flight lane: a slalom
  if (c.s0 > S(2900) && rng.chance(0.7)) {
    const o = rng.range(20, 80);
    const x = rng.sign() * rng.range(3, 10);
    const t = kit.tower(rng, rng.range(90, 140), 3.4, kit.M.glowRed);
    onGround(c, t, o, x);
    c.add(t);
    const collider = kit.mesh(kit.G.box, kit.M.structureRed, null, [6.4, 400, 6.4]);
    collider.visible = false;
    collider.position.copy(t.position);
    collider.rotation.copy(t.rotation);
    ctx.game.obstacles.add(collider, { colliders: [{ type: 'box', node: collider }], damage: 1 });
    // warning beacon at flight height
    const beacon = kit.sprite(0xff3020, 0.9);
    c.at(o, x, 0, 0, beacon.position);
    beacon.scale.setScalar(6);
    c.add(beacon);
    c.animate((dt, time) => (beacon.visible = Math.sin(time * 8) > 0));
  }
  // cables between tall structures
  if (rng.chance(0.5)) {
    const f0 = c.frame(0);
    const f1 = c.frame(c.length);
    const a = f0.localToWorld(-60, 30, 0, new THREE.Vector3());
    const b = f1.localToWorld(60, 25, 0, new THREE.Vector3());
    const cable = kit.mesh(kit.G.cylinder, kit.M.hullDark, null, [0.5, a.distanceTo(b), 0.5]);
    cable.position.copy(a).add(b).multiplyScalar(0.5);
    cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    c.add(cable);
  }
}

function mechanicalOpening(kit, c, ctx) {
  const rng = c.rng;
  const M = kit.M;
  const G = kit.G;
  const gateS = S(4150);
  if (c.s0 + c.length < gateS) {
    addGround(kit, c, ctx.state);
    surfaceProps(kit, c, ctx.state, { towers: 1 });
  }
  if (c.s0 <= gateS && c.s0 + c.length > gateS) {
    // colossal iris gate: blades retract as the player approaches
    const o = gateS - c.s0;
    const gate = new THREE.Group();
    kit.place(gate, c.frame(o), 0, 0, 0);
    gate.add(kit.mesh(G.torusThick, M.structureRed, null, 42));
    gate.add(kit.mesh(G.torus, M.glowOrange, [0, 0, 1], 38));
    const blades = [];
    for (let i = 0; i < 8; i++) {
      const pivot = new THREE.Group();
      pivot.rotation.z = (i / 8) * Math.PI * 2;
      const blade = kit.mesh(G.box, M.hullRed, [0, 20, 0], [17, 40, 2]);
      const stripe = kit.mesh(G.box, M.glowRed, [0, 12, 1.1], [1, 20, 0.2]);
      pivot.add(blade, stripe);
      gate.add(pivot);
      blades.push({ blade, stripe });
    }
    c.add(gate);
    const gatePos = gate.position.clone();
    c.animate(() => {
      const dist = gatePos.distanceTo(ctx.game.player.worldPosition);
      const open = clamp(1 - (dist - 60) / 260, 0, 1);
      for (const b of blades) {
        b.blade.position.y = 20 + open * 30;
        b.stripe.position.y = 12 + open * 30;
      }
    });
  }
  if (c.s0 + c.length > gateS) tunnelSegment(kit, c, ctx, { start: Math.max(0, gateS - c.s0) });
}

/** Hexagonal tunnel frames and wall panels. */
function tunnelSegment(kit, c, ctx, { start = 0, radius = 30, damaged = false, spacing = 25 } = {}) {
  const M = kit.M;
  const G = kit.G;
  const sides = 6;
  const side = 2 * radius * Math.tan(Math.PI / sides);
  for (let o = start; o < c.length; o += spacing) {
    const f = c.frame(o);
    const ring = new THREE.Group();
    kit.place(ring, f, 0, 0, 0);
    const lit = Math.floor((c.s0 + o) / spacing) % 3 === 0;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + Math.PI / 6;
      const pivot = new THREE.Group();
      pivot.rotation.z = a;
      pivot.add(kit.mesh(G.box, M.structureRed, [0, radius, 0], [side + 1.5, 2.2, 3]));
      pivot.add(kit.mesh(G.box, M.metalPlate, [0, radius + 1.6, -spacing / 2], [side, 1, spacing]));
      if (lit) pivot.add(kit.mesh(G.box, damaged && Math.random() < 0.4 ? M.dimRed : M.glowOrange, [0, radius - 1.2, 0], [side * 0.7, 0.2, 0.3]));
      ring.add(pivot);
    }
    if (lit) ring.add(kit.mesh(G.box, M.glowRed, [0, radius - 0.5, 0], [4, 0.3, 0.3]));
    c.add(ring);
  }
}

/** Spinning fan blades across the tunnel — the gaps between blades are the safe path. */
function tunnelFan(kit, c, ctx, o) {
  const M = kit.M;
  const G = kit.G;
  const fan = new THREE.Group();
  kit.place(fan, c.frame(o), 0, 0, 0);
  const rotor = new THREE.Group();
  fan.add(rotor);
  const colliders = [];
  const blades = 3;
  for (let i = 0; i < blades; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i / blades) * Math.PI * 2;
    const blade = kit.mesh(G.box, M.hullRed, [0, 16, 0], [4, 30, 1.6]);
    const edge = kit.mesh(G.box, M.glowOrange, [2.1, 16, 0], [0.25, 28, 1.7]);
    holder.add(blade, edge);
    rotor.add(holder);
    colliders.push({ type: 'box', node: blade });
  }
  const hub = kit.mesh(G.cylinder, M.hullDark, null, [3, 3, 3], [Math.PI / 2, 0, 0]);
  rotor.add(hub);
  colliders.push({ type: 'sphere', node: hub, radius: 3 });
  const speed = (c.rng.chance(0.5) ? 1 : -1) * c.rng.range(0.5, 0.9);
  rotor.rotation.z = c.rng.range(0, Math.PI);
  ctx.game.obstacles.add(fan, {
    colliders,
    damage: 1,
    update: (dt) => (rotor.rotation.z += speed * dt),
  });
  const fanPos = fan.position.clone();
  let warned = false;
  c.animate(() => {
    if (warned) return;
    _rel.subVectors(fanPos, ctx.game.player.worldPosition);
    if (_rel.length() < ctx.game.rail.speed * 3.2) {
      warned = true;
      ctx.game.hud.warning('FAN AHEAD — FLY BETWEEN THE BLADES', 1.4);
      ctx.game.audio.play('warning');
    }
  });
}

/** Occasional sparks spitting from damaged wall panels. */
function wallSparks(c, ctx, count, color) {
  for (let i = 0; i < count; i++) {
    const a = c.rng.range(0, Math.PI * 2);
    const pos = c.at(c.rng.range(0, c.length), Math.cos(a) * 27, Math.sin(a) * 27, 0, new THREE.Vector3());
    c.animate(() => {
      if (Math.random() < 0.03) ctx.game.effects.burst(pos, { count: 8, color, speed: 12, life: 0.35, size: 0.6, drag: 1 });
    });
  }
}

function innerTunnel(kit, c, ctx) {
  tunnelSegment(kit, c, ctx);
  wallSparks(c, ctx, 2, 0xffc060);
  if (c.s0 > S(4850) && c.s0 < S(6100) && Math.floor(c.s0 / 100) % 3 === 0) tunnelFan(kit, c, ctx, 50);
}

function reactorRoom(kit, c, ctx) {
  const rng = c.rng;
  const M = kit.M;
  const G = kit.G;
  for (const side of [-1, 1]) {
    if (!rng.chance(0.7)) continue;
    const o = rng.range(0, c.length);
    const reactor = new THREE.Group();
    kit.place(reactor, c.frame(o), side * rng.range(42, 70), 0, 0);
    reactor.add(kit.mesh(G.cylinderHex, M.structureRed, null, [11, 140, 11]));
    const coreMat = ctx.state.reactorMat;
    for (let i = -2; i <= 2; i++) reactor.add(kit.mesh(G.torus, coreMat, [0, i * 22, 0], [12, 12, 12], [Math.PI / 2, 0, 0]));
    reactor.add(kit.mesh(G.cylinder, coreMat, null, [2, 150, 2]));
    c.add(reactor);
  }
  for (let o = 0; o < c.length; o += 50) {
    const f = c.frame(o);
    for (const y of [-26, 30]) {
      const walk = kit.mesh(G.box, M.structure, null, [150, 1.5, 6]);
      kit.place(walk, f, 0, y, 0);
      c.add(walk);
      const light = kit.mesh(G.box, M.glowOrange, null, [140, 0.2, 0.3]);
      kit.place(light, f, 0, y + 0.9, 0);
      c.add(light);
    }
  }
  c.add(kit.vectorGrid(c, { y: -26, halfWidth: 75, step: 15, mat: M.lineOrange }));
}

function defenseCorridor(kit, c, ctx) {
  const M = kit.M;
  const G = kit.G;
  for (let o = 0; o < c.length; o += 20) {
    const f = c.frame(o);
    for (const side of [-1, 1]) {
      const wall = kit.mesh(G.box, M.metalPlate, null, [2, 36, 20.5]);
      kit.place(wall, f, side * 25, 1, 0);
      c.add(wall);
      if ((Math.floor((c.s0 + o) / 20) % 2) === 0) {
        const strip = kit.mesh(G.box, M.glowRed, null, [0.3, 0.3, 18]);
        kit.place(strip, f, side * 23.8, 12, 0);
        c.add(strip);
      }
    }
    const floor = kit.mesh(G.box, M.metalPlate, null, [50, 2, 20.5]);
    kit.place(floor, f, 0, -17, 0);
    c.add(floor);
    const ceil = kit.mesh(G.box, M.structureRed, null, [50, 2, 20.5]);
    kit.place(ceil, f, 0, 19, 0);
    c.add(ceil);
  }
  c.add(kit.vectorGrid(c, { y: -15.8, halfWidth: 22, step: 5.5, mat: M.lineRed }));
  if (c.s0 > S(7500) && c.s0 < S(8700) && c.rng.chance(0.55)) closingDoor(kit, c, ctx, 50);
}

/** Two halves close towards a gap as the player approaches; the gap is outlined in advance. */
function closingDoor(kit, c, ctx, o) {
  const M = kit.M;
  const G = kit.G;
  const rng = c.rng;
  const vertical = rng.chance(0.65); // halves slide in from left/right
  const half = vertical ? 24 : 18;
  const gapCenter = rng.range(-half + 9, half - 9);
  const gap = 11;
  const door = new THREE.Group();
  kit.place(door, c.frame(o), 0, 0, 0);
  const halves = [];
  for (const side of [-1, 1]) {
    const inner = gapCenter + (side * gap) / 2;
    const outer = side * (half + 1);
    const size = Math.abs(outer - inner);
    const center = (outer + inner) / 2;
    const mesh = kit.mesh(G.box, M.hullRed, null, vertical ? [size, 40, 3] : [52, size, 3]);
    const open = vertical ? center + side * size : center + side * size;
    halves.push({ mesh, open, closed: center });
    const lamp = kit.mesh(G.box, M.glowRed, vertical ? [(-side * 0.5), 0, 1.6] : [0, -side * 0.5, 1.6], vertical ? [0.02, 0.9, 0.1] : [0.9, 0.02, 0.1]);
    mesh.add(lamp);
    door.add(mesh);
  }
  const outline = kit.outline(vertical ? new THREE.Vector3(gap, 34, 1) : new THREE.Vector3(46, gap, 1), M.lineCyan);
  outline.position.set(vertical ? gapCenter : 0, vertical ? 0 : gapCenter, 0);
  door.add(outline);
  const doorPos = door.position.clone();
  const colliders = halves.map((h) => ({ type: 'box', node: h.mesh }));
  const setPos = (h, v) => (vertical ? (h.mesh.position.x = v) : (h.mesh.position.y = v));
  for (const h of halves) setPos(h, h.open);
  let warned = false;
  ctx.game.obstacles.add(door, {
    colliders,
    damage: 1,
    update: () => {
      _rel.subVectors(doorPos, ctx.game.player.worldPosition);
      const dist = _rel.length();
      const speed = Math.max(20, ctx.game.rail.speed);
      const k = clamp(1 - (dist - speed * 0.8) / (speed * 1.8), 0, 1);
      for (const h of halves) setPos(h, h.open + (h.closed - h.open) * k);
      outline.visible = k < 1 && Math.sin(ctx.game.time * 14) > -0.3;
      if (!warned && dist < speed * 3) {
        warned = true;
        ctx.game.hud.warning('DOOR CLOSING — AIM FOR THE GAP', 1.3);
        ctx.game.audio.play('warning');
      }
    },
  });
}

function bossChamber(kit, c, ctx) {
  tunnelSegment(kit, c, ctx, { radius: 60, spacing: 50 });
}

function escapeTunnel(kit, c, ctx) {
  tunnelSegment(kit, c, ctx, { radius: 32, damaged: true, spacing: 30 });
  const rng = c.rng;
  for (let i = 0; i < 3; i++) {
    const o = rng.range(0, c.length);
    const pos = c.at(o, rng.sign() * rng.range(14, 28), rng.range(-20, 20), 0, new THREE.Vector3());
    c.animate(() => {
      if (Math.random() < 0.15) ctx.game.effects.trail(pos, Math.random() < 0.5 ? 0xff7a1a : 0xffc23a, 3, 0.7);
    });
  }
}

// ------------------------------------------------------------------ set pieces
function towerBeams({ game }, axis) {
  const ahead = game.rail.speed * 1.8;
  const f = game.rail.frameAhead(ahead, new RailFrame());
  const lanes = axis === 'h' ? [-6, 0, 6] : [-10, 0, 10];
  const safe = Math.floor(Math.random() * 3);
  lanes.forEach((lane, i) => {
    if (i === safe) return;
    const start = axis === 'h' ? f.localToWorld(-50, lane, 0, new THREE.Vector3()) : f.localToWorld(lane, -40, 0, new THREE.Vector3());
    const end = axis === 'h' ? f.localToWorld(50, lane, 0, new THREE.Vector3()) : f.localToWorld(lane, 40, 0, new THREE.Vector3());
    game.obstacles.fireBeam({ start, end, local: false, warn: 1.3, fire: 0.8, radius: 1.6, color: 0xff3a1a });
  });
  game.hud.warning(axis === 'h' ? 'HORIZONTAL BEAMS!' : 'VERTICAL BEAMS!', 1.2);
  game.audio.play('telegraph');
}

const wave = (at, enemy, formation, count, extra = {}) => ({ at: S(at), type: 'wave', enemy, formation, count, ...extra });
const ev = (at, type, extra = {}) => ({ at: S(at), type, ...extra });
const hunter = (at, x, y, extra = {}) => ev(at, 'enemy', { enemy: 'phaseHunter', x, y, z: -240, ...extra });

export const Stage2 = {
  id: 2,
  name: 'CRIMSON MACHINE WORLD',
  subtitle: 'Artificial planet Kharon-9',
  seed: 2903,
  bossMusic: 'boss2',
  outro: 'escape', // boss -> 30 s escape -> planet explosion cutscene -> next stage
  ending: 'planet',
  buildPath,
  createBoss: (game) => new CrimsonArchitect(game),
  theme: {
    speed: 50,
    warpColor: 0xff4a1a,
    background: 0x050102,
    backgroundFactor: 0.35,
    fog: 0x220a06,
    fogNear: 60,
    env: 'crimson',
    hemiSky: 0xff7a40,
    hemiGround: 0x2a0a05,
    key: 0xffb58a,
    keyIntensity: 2.6,
    rim: 0x2de2ff,
    rimIntensity: 1.1,
    enemyRim: 0xff6a2a,
    enemyTrim: 'trimRed',
    enemyAccent: 'glowRed',
    enemyShot: COLORS.enemyShotStage2,
    dust: 0xffa070,
    sky: { stars: [0xffffff, 0xffe0c0, 0xffb080], nebula: [0xff4a1a, 0xff9a2a, 0x8a1020], nebulaCount: 7 },
  },

  sections: [
    { id: 'orbit', start: 0, end: S(1300), title: 'Orbital approach', speed: 52, fog: 0x2a0c08, chunk: orbitApproach },
    { id: 'surface', start: S(1300), end: S(2800), title: 'Kharon-9 surface', warning: 'SURFACE DEFENSES ACTIVE', speed: 50, fog: 0x2a0d06, chunk: surfaceCombat },
    { id: 'towers', start: S(2800), end: S(4100), title: 'Tower forest', warning: 'TOWERS AHEAD — DODGE!', speed: 46, fog: 0x301006, chunk: towerForest },
    { id: 'opening', start: S(4100), end: S(4750), title: 'Mechanical opening', warning: 'ENTERING THE PLANET', speed: 42, fog: 0x1c0804, chunk: mechanicalOpening },
    { id: 'tunnel', start: S(4750), end: S(6200), title: 'Inner tunnel', warning: 'HIGH SPEED!', speed: 74, fog: 0x200604, dust: 0xffc080, bloom: 1.1, chunk: innerTunnel },
    { id: 'reactor', start: S(6200), end: S(7400), title: 'Reactor room', speed: 46, fog: 0x2c1004, dust: 0xffd080, bloom: 1.15, chunk: reactorRoom },
    { id: 'corridor', start: S(7400), end: S(8800), title: 'Defense corridor', warning: 'SECURITY DOORS ACTIVE', speed: 44, fog: 0x1e0404, chunk: defenseCorridor },
    { id: 'arena', start: S(8800), end: MAIN_LENGTH + 400, title: 'Architect core', speed: 30, fog: 0x260804, chunk: bossChamber },
  ],
  // activated by the escape sequence from wherever the boss fight ended
  escapeSection: { id: 'escape', start: 0, end: Infinity, fog: 0x3a1004, dust: 0xffb060, bloom: 1.2, chunk: escapeTunnel },

  events: [
    ev(0, 'music', { track: 'stage2', intensity: 1, persistent: true }),
    ev(0, 'banner', { title: 'STAGE 2', subtitle: 'CRIMSON MACHINE WORLD' }),
    wave(150, 'scout', 'V', 5, { pattern: 'swoop' }),
    ev(350, 'enemy', { enemy: 'interceptor', x: -8, y: 3, z: -260, opts: { entry: 'front' } }),
    ev(360, 'enemy', { enemy: 'interceptor', x: 8, y: -2, z: -260, opts: { entry: 'front' } }),
    ev(500, 'turrets', { ahead: 320, list: [{ x: -16, y: -8 }, { x: 16, y: -8, dz: 50 }] }),
    ev(650, 'warning', { text: 'NEW SIGNATURE: PHASE HUNTER', duration: 2.5 }),
    hunter(680, 0, 3),
    wave(850, 'scout', 'line', 5, { pattern: 'cross', side: 1, z: -90, y: 3, spacing: 6 }),
    ev(1000, 'enemy', { enemy: 'heavy', x: 0, y: 2, z: -260, opts: { drop: 'dualCannon' } }),
    ev(1150, 'powerup', { item: 'rapidFire', x: 4 }),

    ev(1400, 'turrets', { ahead: 340, strut: 33, list: [{ x: -15, y: -12 }, { x: 15, y: -12, dz: 40 }, { x: 0, y: -12, dz: 100 }] }),
    ev(1550, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(1560, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(1570, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(1700, 'enemy', { enemy: 'carrier', x: 8, y: 5, z: -300, opts: { drop: 'shield' } }),
    hunter(1850, -8, 2),
    hunter(1880, 8, -2),
    ev(2000, 'enemy', { enemy: 'heavy', x: -6, y: 1, z: -260 }),
    wave(2050, 'scout', 'V', 5, { pattern: 'swoop', x: 6 }),
    ev(2150, 'turrets', { ahead: 340, strut: 33, spread: 3, list: [{ x: -12, y: -12 }, { x: 12, y: -12, dz: 60 }] }),
    wave(2300, 'scout', 'column', 6, { pattern: 'dive', y: 16 }),
    ev(2450, 'powerup', { item: 'shield', x: 0 }),
    ev(2600, 'enemy', { enemy: 'interceptor', x: 0, y: 5, z: -260, opts: { entry: 'front' } }),
    ev(2610, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),

    ev(2790, 'checkpoint'),
    ev(2900, 'turrets', { ahead: 340, strut: 33, spread: 3, list: [{ x: -15, y: -12 }, { x: 15, y: -12, dz: 70 }] }),
    ev(3050, 'custom', { run: (ctx) => towerBeams(ctx, 'h') }),
    hunter(3200, 5, 4),
    ev(3350, 'enemy', { enemy: 'heavy', x: 0, y: 3, z: -260, opts: { drop: 'bomb' } }),
    ev(3380, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(3500, 'custom', { run: (ctx) => towerBeams(ctx, 'v') }),
    ev(3650, 'turrets', { ahead: 340, strut: 33, spread: 3, list: [{ x: -14, y: -12 }, { x: 14, y: -12, dz: 40 }, { x: 0, y: -12, dz: 90 }] }),
    ev(3800, 'enemy', { enemy: 'carrier', x: -6, y: 5, z: -300 }),
    ev(3900, 'custom', { run: (ctx) => towerBeams(ctx, 'h') }),
    ev(3960, 'powerup', { item: 'repair', x: -3 }),

    wave(4200, 'scout', 'V', 7, { pattern: 'swoop', spacing: 4.5 }),
    ev(4420, 'mines', { ahead: 260, list: [{ x: -7, y: 0 }, { x: 7, y: 4, dz: 30 }, { x: 0, y: -5, dz: 70 }] }),
    ev(4600, 'powerup', { item: 'rapidFire', x: 0 }),

    ev(4760, 'checkpoint'),
    wave(4950, 'scout', 'column', 5, { pattern: 'swoop', x: 0, opts: { speed: 50 } }),
    ev(5200, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(5210, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    ev(5350, 'speed', { speed: 88, lerp: 1.5 }),
    ev(5550, 'mines', { ahead: 300, list: [{ x: -8, y: -4 }, { x: 8, y: 4, dz: 40 }, { x: -3, y: 6, dz: 90 }] }),
    ev(5700, 'speed', { speed: 74 }),
    hunter(5800, 0, 0),
    ev(6050, 'powerup', { x: 0 }),

    hunter(6300, -9, 3),
    hunter(6320, 9, -3),
    ev(6450, 'custom', { run: (ctx) => towerBeams(ctx, 'v') }),
    ev(6600, 'enemy', { enemy: 'heavy', x: -8, y: 2, z: -260, opts: { drop: 'repair' } }),
    ev(6620, 'enemy', { enemy: 'heavy', x: 8, y: -2, z: -280 }),
    ev(6800, 'mines', { ahead: 300, list: [{ x: -6, y: 5 }, { x: 6, y: -5, dz: 30 }, { x: 0, y: 0, dz: 80 }] }),
    ev(6900, 'custom', { run: (ctx) => towerBeams(ctx, 'h') }),
    ev(7050, 'enemy', { enemy: 'carrier', x: 0, y: 6, z: -300, opts: { drop: 'bomb' } }),
    ev(7250, 'powerup', { item: 'multiplier', x: 3 }),

    ev(7390, 'checkpoint'),
    ev(7500, 'turrets', { ahead: 300, spread: 3, list: [{ x: -14, y: -13 }, { x: 14, y: 16, dz: 60, flip: true }] }),
    ev(7700, 'custom', { run: (ctx) => towerBeams(ctx, 'h') }),
    ev(7900, 'enemy', { enemy: 'interceptor', x: -6, y: 2, z: -240, opts: { entry: 'front' } }),
    ev(7910, 'enemy', { enemy: 'interceptor', x: 6, y: -2, z: -240, opts: { entry: 'front' } }),
    ev(7920, 'enemy', { enemy: 'interceptor', opts: { entry: 'behind' } }),
    hunter(8100, 0, 4),
    ev(8120, 'turrets', { ahead: 300, spread: 3, list: [{ x: 14, y: -13 }, { x: -14, y: 16, dz: 50, flip: true }] }),
    ev(8300, 'custom', { run: (ctx) => towerBeams(ctx, 'v') }),
    ev(8500, 'powerup', { item: 'repair', x: -4 }),
    ev(8520, 'powerup', { item: 'shield', x: 4 }),

    ev(8800, 'warning', { text: 'PLANET CORE — THE CRIMSON ARCHITECT', duration: 3 }),
    ev(8820, 'music', { intensity: 0 }),
    ev(8840, 'checkpoint'),
    ev(8900, 'boss'),
  ],

  setup({ game, kit, state }) {
    state.game = game;
    state.riverMat = createFlowMaterial(0xff4a10, kit.T.energyFlow, { intensity: 1.1, speed: 0.8, repeat: [1, 6] });
    state.reactorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa030).multiplyScalar(2.5) });
    state.lightning = new LightningPool(game.scene, 4);
    state.lightningTimer = 4;

    // the planet itself: a huge sphere under the surface plating (fog turns it into a silhouette)
    const f = game.rail.main.frameAt(S(2500), new RailFrame());
    const radius = 9000;
    state.planet = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), new THREE.MeshStandardMaterial({ color: 0x3a1208, roughness: 0.8, metalness: 0.4 }));
    state.planet.position.set(f.position.x, GROUND_Y - radius - 3, f.position.z);
    game.scene.add(state.planet);
  },

  teardown({ game, state }) {
    state.riverMat?.map.dispose();
    state.riverMat?.dispose();
    state.reactorMat?.dispose();
    state.lightning?.dispose();
    if (state.planet) {
      game.scene.remove(state.planet);
      state.planet.geometry.dispose();
      state.planet.material.dispose();
    }
  },

  update({ game, state }, dt) {
    scrollFlowMaterial(state.riverMat, dt);
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 3);
    state.reactorMat.color.setRGB(1, 0.45, 0.12).multiplyScalar(0.9 + pulse * 0.9);
    state.lightning.update(dt);
    const sec = game.stageManager.section?.id;
    state.lightningTimer -= dt;
    if (state.lightningTimer <= 0 && (sec === 'surface' || sec === 'towers' || sec === 'reactor' || sec === 'escape')) {
      state.lightningTimer = rand(1.5, 4);
      const f = game.rail.frameAhead(rand(150, 350), new RailFrame());
      const from = f.localToWorld(rand(-120, 120), rand(40, 90), 0, new THREE.Vector3());
      const to = f.localToWorld(rand(-120, 120), -40, 0, new THREE.Vector3());
      state.lightning.strike(from, to, 0xffb070);
      game.effects.flash(to, 26, 0.2, 0xffa050, 0.9);
    }
  },
};

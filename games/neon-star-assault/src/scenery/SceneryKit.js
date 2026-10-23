import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand } from '../utils/math.js';
import { OBSTACLES } from '../config/gameConfig.js';

const _v = new THREE.Vector3();
// sphere colliders are centred on their node (the node's scale is not applied to the radius)
const ZERO_OFFSET = new THREE.Vector3();

/**
 * Shared procedural building blocks for stage scenery. Everything reuses AssetManager
 * geometries/materials; per-chunk objects are cheap Groups/Meshes removed with their chunk.
 */
export class SceneryKit {
  constructor(game) {
    this.game = game;
    this.assets = game.assets;
    this.M = game.assets.materials;
    this.G = game.assets.geometries;
    this.T = game.assets.textures;
    this.edgeGeo = new THREE.EdgesGeometry(this.G.box);
    this.spriteMats = new Map();
  }

  /** Cached additive sprite material per colour/texture (shared by all clouds of that tint). */
  sprite(color, opacity = 1, texture = this.T.glow) {
    const key = `${color}_${opacity}_${texture.uuid}`;
    if (!this.spriteMats.has(key)) {
      const m = this.assets.spriteMaterial(color, opacity, texture);
      m.fog = false;
      this.spriteMats.set(key, m);
    }
    return new THREE.Sprite(this.spriteMats.get(key));
  }

  place(obj, frame, x, y, z = 0) {
    frame.localToWorld(x, y, z, obj.position);
    obj.quaternion.copy(frame.quaternion);
    return obj;
  }

  mesh(geo, mat, pos = null, scale = null, rot = null) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (scale !== null) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
    if (rot) m.rotation.set(...rot);
    return m;
  }

  // ------------------------------------------------------------ space pieces
  /** Big additive cloud billboard; fades out when the camera gets close so it never blows out the frame. */
  nebulaCloud(rng, color, size, chunk) {
    const base = rng.range(0.22, 0.4);
    const mat = this.assets.spriteMaterial(new THREE.Color(color).multiplyScalar(0.6), base, rng.pick(this.T.nebula));
    mat.fog = false;
    mat.rotation = rng.range(0, Math.PI * 2);
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    s.userData.ownsMaterial = true;
    const camera = this.game.camera;
    const near = size * 0.45;
    const far = size * 1.1;
    chunk.animate(() => {
      const d = s.position.distanceTo(camera.position);
      mat.opacity = base * Math.min(1, Math.max(0, (d - near) / (far - near)));
    });
    return s;
  }

  asteroid(rng, scale) {
    const m = this.mesh(rng.pick(this.G.asteroids), this.M.rock, null, scale);
    m.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
    m.scale.x *= rng.range(0.8, 1.2);
    m.scale.z *= rng.range(0.8, 1.3);
    return m;
  }

  /** Asteroid on the flight path: sphere collider; can be shot apart (bigger = tougher). */
  asteroidObstacle(chunk, offset, x, y, scale, rng) {
    const a = this.asteroid(rng, scale);
    chunk.at(offset, x, y, 0, a.position);
    const spin = new THREE.Vector3(rng.range(-0.6, 0.6), rng.range(-0.6, 0.6), 0);
    const obs = this.game.obstacles.add(a, {
      colliders: [{ type: 'sphere', node: a, radius: 0.85 * scale, offset: ZERO_OFFSET }],
      hp: Math.ceil(OBSTACLES.asteroid.hpPerScale * scale),
      score: Math.round(OBSTACLES.asteroid.score * scale),
      dropChance: OBSTACLES.asteroid.dropChance,
      damage: OBSTACLES.asteroid.damage,
      update: (dt) => {
        a.rotation.x += spin.x * dt;
        a.rotation.y += spin.y * dt;
      },
    });
    obs.explosionSize = Math.min(2.5, scale * 0.7);
    return obs;
  }

  /** Cluster of 1-3 faceted crystal shards (rng optional: falls back to Math.random). */
  crystal(rng, scale = 1) {
    const r = rng ?? { range: rand, next: Math.random };
    const g = new THREE.Group();
    const count = 1 + Math.floor(r.next() * 3);
    for (let i = 0; i < count; i++) {
      const main = i === 0;
      const s = scale * (main ? 1 : r.range(0.45, 0.7));
      const shard = this.mesh(this.G.octa, this.M.crystal, null, [0.42 * s, 1.6 * s, 0.42 * s]);
      if (!main) shard.position.set(r.range(-0.6, 0.6) * scale, r.range(-0.8, 0.2) * scale, r.range(-0.6, 0.6) * scale);
      shard.rotation.set(r.range(-0.5, 0.5), r.range(0, Math.PI), r.range(-0.5, 0.5));
      g.add(shard);
    }
    return g;
  }

  /** Crystal shard on the flight path: breaks after a few shots and may drop a power-up. */
  crystalObstacle(chunk, offset, x, y, scale, rng) {
    const c = this.crystal(rng, scale);
    chunk.at(offset, x, y, 0, c.position);
    c.rotation.z = rng.range(-0.6, 0.6);
    const spin = rng.range(-0.5, 0.5);
    const C = OBSTACLES.crystal;
    const obs = this.game.obstacles.add(c, {
      colliders: [{ type: 'sphere', node: c, radius: 1.15 * scale, offset: ZERO_OFFSET }],
      hp: Math.ceil(C.hpPerScale * scale),
      score: Math.round(C.score * scale),
      dropChance: C.dropChance,
      damage: C.damage,
      update: (dt) => (c.rotation.y += spin * dt),
    });
    obs.explosionSize = Math.min(2.5, scale * 0.8);
    obs.explosionColor = 0x7af0ff;
    return obs;
  }

  satellite(rng) {
    const g = new THREE.Group();
    g.add(this.mesh(this.G.box, this.M.hullLight, [0, 0, 0], [2, 2, 3]));
    for (const s of [-1, 1]) {
      g.add(this.mesh(this.G.box, this.M.hullViolet, [s * 4, 0, 0], [5, 0.1, 2.2]));
      g.add(this.mesh(this.G.box, this.M.dimCyan, [s * 4, 0.08, 0], [4.6, 0.05, 0.1]));
    }
    g.add(this.mesh(this.G.cylinder, this.M.hull, [0, 1.8, 0], [0.1, 2, 0.1]));
    const light = this.sprite(0xff3040, 0.9);
    light.position.set(0, 2.9, 0);
    light.scale.setScalar(2);
    g.add(light);
    g.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
    g.userData.blink = light;
    return g;
  }

  /** Derelict capital ship silhouette with emissive window rows. */
  wreck(rng, length, windowMat = this.M.glowOrange) {
    const g = new THREE.Group();
    g.add(this.mesh(this.G.box, this.M.hullDark, [0, 0, 0], [length * 0.18, length * 0.12, length]));
    g.add(this.mesh(this.G.box, this.M.hull, [0, length * 0.09, length * 0.1], [length * 0.1, length * 0.08, length * 0.5]));
    g.add(this.mesh(this.G.coneHex, this.M.hullViolet, [0, 0, -length * 0.62], [length * 0.12, length * 0.25, length * 0.08], [-Math.PI / 2, 0, 0]));
    for (let i = 0; i < 6; i++) {
      const z = -length * 0.4 + i * length * 0.14;
      for (const s of [-1, 1]) {
        if (rng.chance(0.7)) g.add(this.mesh(this.G.box, windowMat, [s * length * 0.091, rng.range(-0.3, 0.3) * length * 0.1, z], [0.2, 0.3, length * 0.08]));
      }
    }
    // broken section
    g.add(this.mesh(this.G.box, this.M.hull, [length * 0.12, -length * 0.05, length * 0.35], [length * 0.05, length * 0.2, length * 0.05], [0.4, 0, 0.6]));
    g.rotation.set(rng.range(-0.3, 0.3), rng.range(-0.5, 0.5), rng.range(-0.6, 0.6));
    return g;
  }

  triangleStructure(size, edgeMat = this.M.glowViolet, bodyMat = this.M.structure) {
    const g = new THREE.Group();
    const r = size;
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const a1 = ((i + 1) / 3) * Math.PI * 2 + Math.PI / 2;
      const p0 = new THREE.Vector3(Math.cos(a0) * r, Math.sin(a0) * r, 0);
      const p1 = new THREE.Vector3(Math.cos(a1) * r, Math.sin(a1) * r, 0);
      const mid = p0.clone().add(p1).multiplyScalar(0.5);
      const len = p0.distanceTo(p1);
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      g.add(this.mesh(this.G.box, bodyMat, mid.toArray(), [len, size * 0.08, size * 0.12], [0, 0, ang]));
      g.add(this.mesh(this.G.box, edgeMat, [mid.x * 1.02, mid.y * 1.02, size * 0.07], [len * 0.9, size * 0.015, size * 0.015], [0, 0, ang]));
    }
    return g;
  }

  energyRing(radius, mat = this.M.glowCyan, thickness = 1) {
    const ring = this.mesh(this.G.torus, mat, null, [radius, radius, radius * thickness]);
    return ring;
  }

  /** Vector grid under the route ("ancient space lanes"), sampled along the chunk. */
  vectorGrid(chunk, { y = -28, halfWidth = 60, step = 12, samples = 5, mat = this.M.lineViolet } = {}) {
    const pts = [];
    const frames = [];
    for (let i = 0; i < samples; i++) frames.push(chunk.frame((i / (samples - 1)) * chunk.length));
    for (let x = -halfWidth; x <= halfWidth; x += step) {
      for (let i = 0; i < samples - 1; i++) {
        frames[i].localToWorld(x, y, 0, _v);
        pts.push(_v.x, _v.y, _v.z);
        frames[i + 1].localToWorld(x, y, 0, _v);
        pts.push(_v.x, _v.y, _v.z);
      }
    }
    for (let i = 0; i < samples - 1; i++) {
      frames[i].localToWorld(-halfWidth, y, 0, _v);
      pts.push(_v.x, _v.y, _v.z);
      frames[i].localToWorld(halfWidth, y, 0, _v);
      pts.push(_v.x, _v.y, _v.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, mat);
    lines.userData.ownsGeometry = true;
    return lines;
  }

  /** Crossing girder with hazard stripes. `axis` 'h' spans left-right, 'v' spans up-down. */
  girderObstacle(chunk, offset, axis, pos, length = 60) {
    const g = new THREE.Group();
    const beam = this.mesh(this.G.box, this.M.structure, null, axis === 'h' ? [length, 2.6, 2.6] : [2.6, length, 2.6]);
    g.add(beam);
    const stripeCount = Math.floor(length / 6);
    for (let i = 0; i < stripeCount; i++) {
      const t = -length / 2 + 3 + i * 6;
      const p = axis === 'h' ? [t, 0, 1.35] : [0, t, 1.35];
      g.add(this.mesh(this.G.box, i % 2 ? this.M.glowOrange : this.M.glowRed, p, axis === 'h' ? [2.8, 2.7, 0.1] : [2.7, 2.8, 0.1]));
    }
    const f = chunk.frame(offset);
    this.place(g, f, axis === 'h' ? 0 : pos, axis === 'h' ? pos : 0, 0);
    const G = OBSTACLES.girder;
    const obs = this.game.obstacles.add(g, {
      colliders: [{ type: 'box', node: beam }],
      damage: 1,
      hp: G.hp,
      score: G.score,
      dropChance: G.dropChance,
    });
    obs.explosionSize = 2.4;
    return g;
  }

  bonusRing(chunk, offset, x, y, radius = 4.5, mat = this.M.glowGold) {
    const ring = this.energyRing(radius, mat, 1);
    this.place(ring, chunk.frame(offset), x, y, 0);
    const halo = this.sprite(0xffc23a, 0.35);
    halo.scale.setScalar(radius * 3);
    ring.add(halo);
    halo.scale.divideScalar(radius);
    this.game.obstacles.addRing(ring, radius);
    return ring;
  }

  // ------------------------------------------------------------ machine-world pieces
  groundPlane(chunk, y, width = 900, mat = this.M.metalPlate) {
    const f = chunk.frame(chunk.length / 2);
    const plane = this.mesh(this.G.plane, mat, null, [width, chunk.length + 4, 1]);
    plane.position.copy(f.position);
    plane.position.y = y;
    // lay flat (normal +Y) with its length along the rail heading
    plane.rotation.set(-Math.PI / 2, Math.atan2(-f.forward.x, -f.forward.z), 0, 'YXZ');
    plane.receiveShadow = true;
    return plane;
  }

  factoryBlock(rng, w, h, d, windowMat) {
    const g = new THREE.Group();
    g.add(this.mesh(this.G.box, this.M.structureRed, [0, h / 2, 0], [w, h, d]));
    g.add(this.mesh(this.G.box, this.M.hullDark, [0, h + 1, 0], [w * 0.6, 2, d * 0.6]));
    const rows = Math.max(1, Math.floor(h / 5));
    for (let r = 0; r < rows; r++) {
      if (rng.chance(0.6)) g.add(this.mesh(this.G.box, windowMat, [0, 3 + r * 5, d / 2 + 0.05], [w * 0.8, 0.5, 0.1]));
    }
    if (rng.chance(0.5)) {
      const stack = this.mesh(this.G.cylinder, this.M.hullDark, [w * 0.3, h + 5, 0], [1.2, 10, 1.2]);
      g.add(stack);
      g.userData.smoke = new THREE.Vector3(w * 0.3, h + 10.5, 0);
    }
    return g;
  }

  tower(rng, height, radius, lightMat) {
    const g = new THREE.Group();
    g.add(this.mesh(this.G.cylinderHex, this.M.structureRed, [0, height / 2, 0], [radius, height, radius]));
    g.add(this.mesh(this.G.cylinderHex, this.M.hullDark, [0, height + 2, 0], [radius * 1.5, 4, radius * 1.5]));
    for (let i = 1; i < 5; i++) {
      g.add(this.mesh(this.G.torus, lightMat, [0, (height * i) / 5, 0], [radius * 1.1, radius * 1.1, radius * 1.1], [Math.PI / 2, 0, 0]));
    }
    const beacon = this.sprite(0xff3020, 0.9);
    beacon.position.set(0, height + 5, 0);
    beacon.scale.setScalar(radius * 3);
    g.add(beacon);
    return g;
  }

  gear(radius, mat = this.M.hullGold) {
    const m = this.mesh(this.G.gear, mat, null, [radius, radius, radius * 2]);
    return m;
  }

  fan(radius, bladeMat = this.M.hullDark) {
    const g = new THREE.Group();
    const rotor = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const blade = this.mesh(this.G.box, bladeMat, [radius * 0.5, 0, 0], [radius, 0.3, radius * 0.25], [0.35, 0, 0]);
      const holder = new THREE.Group();
      holder.rotation.y = (i / 5) * Math.PI * 2;
      holder.add(blade);
      rotor.add(holder);
    }
    rotor.add(this.mesh(this.G.cylinder, this.M.glowOrange, null, [radius * 0.15, 0.6, radius * 0.15]));
    g.add(this.mesh(this.G.torusThick, this.M.structureRed, null, [radius * 1.05, radius * 1.05, radius * 1.05], [Math.PI / 2, 0, 0]));
    g.add(rotor);
    g.userData.rotor = rotor;
    return g;
  }

  /** Emissive strip with a scrolling texture — rivers of energy. */
  energyRiver(length, width, mat) {
    const m = this.mesh(this.G.plane, mat, null, [width, length, 1]);
    return m;
  }

  /** Box outline for telegraphing obstacles. */
  outline(size, mat = this.M.lineWarning) {
    const l = new THREE.LineSegments(this.edgeGeo, mat);
    l.scale.copy(size);
    return l;
  }
}

/**
 * Collects static decor in world space and merges it into one mesh per material, so a chunk with
 * hundreds of ribs, plates and light strips costs a handful of draw calls. Use for things that
 * never move or collide; obstacles and animated parts stay separate objects.
 */
export class StaticBatch {
  constructor() {
    this.byMaterial = new Map();
  }

  /** Adds `geo` transformed by position / quaternion (or Euler `rot`) / scale. */
  add(geo, mat, pos, scale = null, quat = null) {
    // non-indexed copies: kit geometries mix indexed (boxes) and non-indexed (octahedra) buffers
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const key of Object.keys(g.attributes)) if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _bm.compose(pos, quat ?? _bq.identity(), typeof scale === 'number' ? _bs.setScalar(scale) : scale ? _bs.copy(scale) : _bs.set(1, 1, 1));
    g.applyMatrix4(_bm);
    if (!this.byMaterial.has(mat)) this.byMaterial.set(mat, []);
    this.byMaterial.get(mat).push(g);
    return this;
  }

  /** Same, positioned in a rail frame at local (x, y, z) with an extra local rotation. */
  addInFrame(geo, mat, frame, x, y, z, scale = null, rot = null) {
    frame.localToWorld(x, y, z, _bp);
    _bq2.copy(frame.quaternion);
    if (rot) _bq2.multiply(_bq3.setFromEuler(_be.set(rot[0], rot[1], rot[2])));
    return this.add(geo, mat, _bp, scale === null ? null : typeof scale === 'number' ? scale : _bs2.set(...scale), _bq2);
  }

  /** Merges everything into meshes added to `parent` (marked so the chunk disposes them). */
  flush(parent) {
    for (const [mat, geos] of this.byMaterial) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.userData.ownsGeometry = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    this.byMaterial.clear();
  }
}

const _bm = new THREE.Matrix4();
const _bq = new THREE.Quaternion();
const _bq2 = new THREE.Quaternion();
const _bq3 = new THREE.Quaternion();
const _be = new THREE.Euler();
const _bs = new THREE.Vector3();
const _bs2 = new THREE.Vector3();
const _bp = new THREE.Vector3();

/** Short-lived jagged lightning bolts used by storms and the machine world. */
export class LightningPool {
  constructor(scene, count = 4) {
    this.bolts = [];
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.bolts.push({ line, life: 0 });
    }
    this.scene = scene;
  }

  strike(from, to, color) {
    const bolt = this.bolts.find((b) => b.life <= 0);
    if (!bolt) return;
    const pos = bolt.line.geometry.attributes.position;
    const n = pos.count;
    const len = from.distanceTo(to);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      _v.lerpVectors(from, to, t);
      const jitter = i === 0 || i === n - 1 ? 0 : len * 0.06;
      pos.setXYZ(i, _v.x + rand(-jitter, jitter), _v.y + rand(-jitter, jitter), _v.z + rand(-jitter, jitter));
    }
    pos.needsUpdate = true;
    bolt.line.material.color.set(color).multiplyScalar(4);
    bolt.life = 0.18;
    bolt.line.visible = true;
  }

  update(dt) {
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.line.material.opacity = Math.random() < 0.3 ? 0.2 : 1;
      if (b.life <= 0) b.line.visible = false;
    }
  }

  dispose() {
    for (const b of this.bolts) {
      this.scene.remove(b.line);
      b.line.geometry.dispose();
      b.line.material.dispose();
    }
  }
}

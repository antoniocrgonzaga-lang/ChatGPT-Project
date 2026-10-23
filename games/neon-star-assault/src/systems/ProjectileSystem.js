import * as THREE from 'three';
import { WEAPONS, ENEMY_BULLET, COLORS } from '../config/gameConfig.js';

const MAX_PLAYER = 260;
const MAX_ENEMY = 520;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _aim = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Color();

function makeShot() {
  return {
    pos: new THREE.Vector3(),
    prev: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    life: 0,
    radius: 0.5,
    damage: 1,
    charged: false,
    power: 0,
    target: null,
    size: 1,
    coreWhite: 0.45,
    color: new THREE.Color(),
    alive: false,
    age: 0,
  };
}

/**
 * All projectiles, drawn with four InstancedMeshes (core + glow for each side).
 * Projectile records are preallocated and recycled — the fixed arrays are the object pool.
 */
export class ProjectileSystem {
  constructor(game) {
    this.game = game;
    this.playerShots = Array.from({ length: MAX_PLAYER }, makeShot);
    this.enemyShots = Array.from({ length: MAX_ENEMY }, makeShot);
    this.playerCount = 0;
    this.enemyCount = 0;
    this.nextShotId = 0;
    this.enemyColor = new THREE.Color(COLORS.enemyShotStage1);

    const geo = game.assets.geometries.sphereLow;
    const coreMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
    const glowMat = () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    this.meshes = {
      playerCore: new THREE.InstancedMesh(geo, coreMat(), MAX_PLAYER),
      playerGlow: new THREE.InstancedMesh(geo, glowMat(), MAX_PLAYER),
      enemyCore: new THREE.InstancedMesh(geo, coreMat(), MAX_ENEMY),
      enemyGlow: new THREE.InstancedMesh(geo, glowMat(), MAX_ENEMY),
    };
    for (const mesh of Object.values(this.meshes)) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, _c.set(0xffffff)); // allocates instanceColor
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      game.scene.add(mesh);
    }
    this.meshes.enemyGlow.renderOrder = 2;
  }

  setEnemyColor(hex) {
    this.enemyColor.set(hex);
  }

  // ------------------------------------------------------------ spawning
  /** `shot` / `color` let each ship fire its own kind of bolt (defaults: WEAPONS.shot, cyan). */
  firePlayer(pos, dir, { charged = false, power = 0, target = null, dual = false, shot = WEAPONS.shot, color = null }) {
    if (this.playerCount >= MAX_PLAYER) return null;
    const s = this.playerShots[this.playerCount++];
    const W = WEAPONS;
    const speed = charged ? W.charged.speed : shot.speed;
    s.pos.copy(pos);
    s.prev.copy(pos);
    s.vel.copy(dir).multiplyScalar(speed).add(this.game.rail.velocity);
    s.life = charged ? W.charged.life : shot.life;
    s.charged = charged;
    s.power = power;
    s.target = target;
    s.age = 0;
    s.size = charged ? W.charged.scaleMin + (W.charged.scaleMax - W.charged.scaleMin) * power : shot.visualScale;
    s.coreWhite = shot.coreWhite;
    s.radius = charged ? 0.8 * s.size : shot.radius;
    s.damage = charged ? W.charged.damageMin + (W.charged.damageMax - W.charged.damageMin) * power : shot.damage;
    s.color.set(charged ? COLORS.playerCharged : (color ?? (dual ? 0x7dfcff : COLORS.playerShot)));
    s.alive = true;
    return s;
  }

  /** Enemy shot. Velocity inherits the rail motion so relative speed is always what we designed. */
  fireEnemy(pos, dir, { speed = ENEMY_BULLET.speed, size = 1, color = null, inherit = true } = {}) {
    if (this.enemyCount >= MAX_ENEMY) return null;
    const s = this.enemyShots[this.enemyCount++];
    const diff = this.game.difficulty;
    s.pos.copy(pos);
    s.prev.copy(pos);
    s.vel.copy(dir).normalize().multiplyScalar(speed * diff.bulletSpeed);
    if (inherit) s.vel.add(this.game.rail.velocity);
    s.life = ENEMY_BULLET.life;
    s.radius = ENEMY_BULLET.radius * size;
    s.size = size;
    s.damage = 1;
    s.age = 0;
    s.color.copy(color ? _c.set(color) : this.enemyColor);
    s.alive = true;
    // records are recycled: callers that keep a reference (e.g. splitting orbs) compare this id
    s.id = ++this.nextShotId;
    return s;
  }

  /** Fires at the player's current position (relative motion makes this exact for inherited shots). */
  fireEnemyAt(pos, target, opts = {}) {
    _aim.subVectors(target, pos);
    if (opts.spreadAngle) {
      _aim.normalize();
      _aim.applyAxisAngle(opts.axis ?? this.game.rail.frame.up, opts.spreadAngle);
    }
    return this.fireEnemy(pos, _aim, opts);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    const player = this.game.player.worldPosition;
    const railVel = this.game.rail.velocity;
    const maxDistSq = ENEMY_BULLET.maxDistance * ENEMY_BULLET.maxDistance;

    for (let i = 0; i < this.playerCount; i++) {
      const s = this.playerShots[i];
      if (s.alive && s.charged && s.target) this.home(s, dt, railVel);
      this.integrate(s, dt);
      if (s.charged && s.alive && Math.random() < 0.7) {
        this.game.effects.spark(s.pos, s.color, 0.5 + s.power);
      }
    }
    for (let i = 0; i < this.enemyCount; i++) {
      const s = this.enemyShots[i];
      this.integrate(s, dt);
      if (s.pos.distanceToSquared(player) > maxDistSq) s.alive = false;
    }
    this.playerCount = this.compact(this.playerShots, this.playerCount);
    this.enemyCount = this.compact(this.enemyShots, this.enemyCount);
    this.writeInstances();
  }

  integrate(s, dt) {
    if (!s.alive) return;
    s.prev.copy(s.pos);
    s.pos.addScaledVector(s.vel, dt);
    s.life -= dt;
    s.age += dt;
    if (s.life <= 0) s.alive = false;
  }

  home(s, dt, railVel) {
    const t = s.target;
    if (!t.alive) {
      s.target = null;
      return;
    }
    t.getAimPoint(_desired);
    _rel.subVectors(s.vel, railVel);
    const speed = _rel.length();
    _desired.sub(s.pos).normalize().multiplyScalar(speed);
    _rel.lerp(_desired, 1 - Math.exp(-WEAPONS.charged.homingRate * dt)).setLength(speed);
    s.vel.copy(_rel).add(railVel);
  }

  compact(list, count) {
    let n = count;
    for (let i = 0; i < n; ) {
      if (!list[i].alive) {
        n--;
        const tmp = list[i];
        list[i] = list[n];
        list[n] = tmp;
      } else i++;
    }
    return n;
  }

  writeInstances() {
    const M = this.meshes;
    const railVel = this.game.rail.velocity;
    const time = this.game.time;

    for (let i = 0; i < this.playerCount; i++) {
      const s = this.playerShots[i];
      _rel.subVectors(s.vel, railVel).normalize();
      _q.setFromUnitVectors(Z_AXIS, _rel);
      if (s.charged) {
        const pulse = 1 + Math.sin(time * 40 + i) * 0.12;
        _m.compose(s.pos, _q, _s.set(0.45, 0.45, 0.6).multiplyScalar(s.size * pulse));
        M.playerCore.setMatrixAt(i, _m);
        M.playerCore.setColorAt(i, _c.copy(s.color).lerp(WHITE, 0.6).multiplyScalar(4));
        _m.compose(s.pos, _q, _s.set(1.1, 1.1, 1.8).multiplyScalar(s.size * pulse));
        M.playerGlow.setMatrixAt(i, _m);
        M.playerGlow.setColorAt(i, _c.copy(s.color).multiplyScalar(1.5));
      } else {
        _m.compose(s.pos, _q, _s.set(0.11 * s.size, 0.11 * s.size, 1.25));
        M.playerCore.setMatrixAt(i, _m);
        M.playerCore.setColorAt(i, _c.copy(s.color).lerp(WHITE, s.coreWhite).multiplyScalar(3.5));
        _p.copy(s.pos).addScaledVector(_rel, -1.3);
        _m.compose(_p, _q, _s.set(0.3 * s.size, 0.3 * s.size, 2.6));
        M.playerGlow.setMatrixAt(i, _m);
        M.playerGlow.setColorAt(i, _c.copy(s.color).multiplyScalar(1.1));
      }
    }
    for (let i = 0; i < this.enemyCount; i++) {
      const s = this.enemyShots[i];
      _rel.subVectors(s.vel, railVel);
      const relSpeed = _rel.length();
      _rel.multiplyScalar(1 / Math.max(relSpeed, 0.001));
      _q.setFromUnitVectors(Z_AXIS, _rel);
      const stretch = 1 + Math.min(relSpeed / 40, 1.2);
      const pulse = 1 + Math.sin(time * 18 + i * 1.7) * 0.18;
      _m.compose(s.pos, _q, _s.set(0.34, 0.34, 0.34 * stretch).multiplyScalar(s.size));
      M.enemyCore.setMatrixAt(i, _m);
      M.enemyCore.setColorAt(i, _c.copy(s.color).lerp(WHITE, 0.55).multiplyScalar(3));
      _m.compose(s.pos, _q, _s.set(0.8, 0.8, 0.8 * stretch).multiplyScalar(s.size * pulse));
      M.enemyGlow.setMatrixAt(i, _m);
      M.enemyGlow.setColorAt(i, _c.copy(s.color).multiplyScalar(1.3));
    }
    for (const key of ['playerCore', 'playerGlow']) this.flush(M[key], this.playerCount);
    for (const key of ['enemyCore', 'enemyGlow']) this.flush(M[key], this.enemyCount);
  }

  flush(mesh, count) {
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /** Bomb / phase change: remove enemy shots near a point, with small pops. */
  clearEnemyShots(center, radius, effects = true) {
    const r2 = radius * radius;
    let cleared = 0;
    for (let i = 0; i < this.enemyCount; i++) {
      const s = this.enemyShots[i];
      if (s.alive && s.pos.distanceToSquared(center) <= r2) {
        s.alive = false;
        cleared++;
        if (effects && cleared % 2 === 0) this.game.effects.spark(s.pos, s.color, 1.5);
      }
    }
    return cleared;
  }

  clear() {
    for (const s of this.playerShots) (s.alive = false), (s.target = null);
    for (const s of this.enemyShots) s.alive = false;
    this.playerCount = 0;
    this.enemyCount = 0;
    this.writeInstances();
  }
}

const WHITE = new THREE.Color(1, 1, 1);

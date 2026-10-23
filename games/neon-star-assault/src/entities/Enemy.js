import * as THREE from 'three';
import { ENEMIES, ENEMY_MODEL_SCALE } from '../config/gameConfig.js';
import { cachedModel, instantiate } from './models/ModelBuilder.js';

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * Base enemy. Enemies live either in `local` mode (positioned relative to the rail rig, so they
 * fly alongside the player) or `world` mode (fixed in the level, e.g. turrets and mines).
 * Subclasses implement buildModel(), onSpawn(opts) and behave(dt).
 */
export class Enemy {
  constructor(game, type) {
    this.game = game;
    this.type = type;
    this.def = ENEMIES[type];
    this.object = new THREE.Group();
    this.object.name = `Enemy:${type}`;
    this.object.visible = false;
    this.local = new THREE.Vector3();
    this.localQuat = new THREE.Quaternion();
    this.modelScale = this.def.modelScale ?? ENEMY_MODEL_SCALE;
    this.radius = this.def.radius * this.modelScale;
    this.alive = false;
    this.accentMeshes = [];
    this.trimMeshes = [];
    this.flames = [];
    this.model = this.buildModel(game.assets);
    this.model.scale.setScalar(this.modelScale);
    this.object.add(this.model);
    this.meshes = [];
    this.model.traverse((o) => {
      if (o.isMesh && !o.userData.noFlash) this.meshes.push(o);
    });
    this.savedMaterials = this.meshes.map((m) => m.material);
    game.scene.add(this.object);
  }

  /** Helper for model builders. */
  part(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(...scale);
    parent.add(m);
    return m;
  }

  accent(mesh) {
    this.accentMeshes.push(mesh);
    return mesh;
  }

  /**
   * Adds a cached, merged model (built once per `key`) to `parent`. Slots map to materials;
   * 'accent' (bright points) and 'trim' (softer edge lines) follow the stage colours and
   * 'glow' never flashes on hits.
   */
  mergedModel(parent, key, build, materials) {
    const slots = cachedModel(key, (b) => build(b, this.game.assets));
    const { group, bySlot } = instantiate(slots, materials);
    if (bySlot.accent) this.accent(bySlot.accent);
    if (bySlot.trim) this.trimMeshes.push(bySlot.trim);
    if (bySlot.glow) bySlot.glow.userData.noFlash = true;
    parent.add(group);
    return bySlot;
  }

  /** Engine exhaust: flickering additive flame pointing backwards (+Z) from `pos`. */
  addEngine(parent, pos, radius, length = radius * 5, flameMaterial = this.game.assets.materials.flameOrange) {
    const G = this.game.assets.geometries;
    const pivot = new THREE.Group();
    pivot.position.set(...pos);
    const flame = new THREE.Mesh(G.cone, flameMaterial);
    flame.rotation.x = Math.PI / 2; // cone tip (+Y) now points to +Z
    flame.position.z = 0.5;
    flame.scale.set(radius * 1.25, 1, radius * 1.25);
    flame.userData.noFlash = true;
    pivot.add(flame);
    pivot.scale.z = length;
    parent.add(pivot);
    this.flames.push({ pivot, length });
    return pivot;
  }

  // ------------------------------------------------------------ lifecycle
  spawn(opts = {}) {
    const game = this.game;
    this.alive = true;
    this.object.visible = true;
    this.t = 0;
    this.hpScale = opts.hpScale ?? 1;
    this.maxHp = this.hp = Math.ceil(this.def.hp * game.difficulty.enemyHp * this.hpScale);
    this.mode = opts.mode ?? 'local';
    this.wave = opts.wave ?? null;
    this.drop = opts.drop ?? null;
    this.flashTimer = 0;
    this.invulnerable = false;
    this.showIndicator = false;
    this.scoreValue = opts.score ?? this.def.score;
    this.localQuat.identity();
    this.model.rotation.set(0, 0, 0);
    this.model.scale.setScalar(this.modelScale);
    this.restoreMaterials();

    const accentMat = game.enemyAccentMaterial;
    if (accentMat) for (const m of this.accentMeshes) m.material = accentMat;
    const trimMat = game.enemyTrimMaterial;
    if (trimMat) for (const m of this.trimMeshes) m.material = trimMat;
    this.savedMaterials = this.meshes.map((m) => m.material);

    if (this.mode === 'world') {
      this.object.position.copy(opts.worldPos);
      if (opts.worldQuat) this.object.quaternion.copy(opts.worldQuat);
      else this.object.quaternion.copy(game.rig.quaternion);
    } else {
      this.local.copy(opts.local ?? _v.set(0, 0, -200));
    }
    this.onSpawn(opts);
    this.syncTransform();
  }

  onSpawn() {}
  behave() {}

  update(dt) {
    this.t += dt;
    this.behave(dt);
    if (!this.alive) return;
    this.syncTransform();
    for (const f of this.flames) f.pivot.scale.z = f.length * (0.8 + Math.random() * 0.4);
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.restoreMaterials();
    }
    if (this.mode === 'world' && this.isBehindPlayer(30)) this.despawn();
  }

  syncTransform() {
    if (this.mode !== 'local') return;
    const rig = this.game.rig;
    this.object.position.copy(this.local).applyMatrix4(rig.matrixWorld);
    this.object.quaternion.copy(rig.quaternion).multiply(this.localQuat);
  }

  /** Makes the model face a rail-local direction (model front is -Z). */
  faceLocal(dx, dy, dz) {
    _dir.set(dx, dy, dz).normalize();
    this.localQuat.setFromUnitVectors(FORWARD, _dir);
  }

  isBehindPlayer(margin = 20) {
    _v.subVectors(this.object.position, this.game.player.worldPosition);
    return _v.dot(this.game.rail.frame.forward) < -margin;
  }

  /** Distance ahead of the player along the rail (negative = behind). */
  aheadDistance() {
    _v.subVectors(this.object.position, this.game.player.worldPosition);
    return _v.dot(this.game.rail.frame.forward);
  }

  /** Only fire from a fair position: in front of the player and not point-blank. */
  canFire(minAhead = 14, maxDist = 320) {
    if (!this.game.player.alive || !this.game.combatActive) return false;
    const ahead = this.aheadDistance();
    return ahead > minAhead && this.object.position.distanceTo(this.game.player.worldPosition) < maxDist;
  }

  getAimPoint(out) {
    return out.copy(this.object.position);
  }

  get colliderCenter() {
    return this.object.position;
  }

  // ------------------------------------------------------------ combat
  fireAtPlayer(opts = {}, from = this.object.position) {
    this.game.projectiles.fireEnemyAt(from, this.game.player.worldPosition, opts);
    this.game.audio.play('enemyShoot');
  }

  /** Fan of shots centred on the player, spread around the rail's up axis (or a custom axis). */
  fireFan(count, spread, opts = {}, from = this.object.position, axis = null) {
    _dir.subVectors(this.game.player.worldPosition, from).normalize();
    _axis.copy(axis ?? this.game.rail.frame.up);
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
      _v.copy(_dir).applyAxisAngle(_axis, a);
      this.game.projectiles.fireEnemy(from, _v, opts);
    }
    this.game.audio.play('enemyShoot');
  }

  fireCooldown(base) {
    return base / this.game.difficulty.fireRate;
  }

  /** Returns 'blocked' | 'hit' | 'killed'. */
  damage(amount, hitPos) {
    if (!this.alive) return 'blocked';
    if (this.invulnerable) {
      this.game.effects.deflect(hitPos ?? this.object.position);
      this.game.audio.play('deflect');
      return 'blocked';
    }
    this.hp -= amount;
    this.flash();
    if (this.hp <= 0) {
      this.die(true);
      return 'killed';
    }
    this.game.audio.play('hit');
    return 'hit';
  }

  flash() {
    for (const m of this.meshes) m.material = this.game.assets.materials.flash;
    this.flashTimer = 0.06;
  }

  restoreMaterials() {
    for (let i = 0; i < this.meshes.length; i++) this.meshes[i].material = this.savedMaterials[i];
  }

  die(byPlayer) {
    if (!this.alive) return;
    this.alive = false;
    this.explode();
    this.game.onEnemyKilled(this, byPlayer);
    this.release();
  }

  explode() {
    this.game.effects.explosion(this.object.position, { size: this.radius * 0.7 });
  }

  despawn() {
    if (!this.alive) return;
    this.alive = false;
    this.game.onEnemyEscaped(this);
    this.release();
  }

  release() {
    this.restoreMaterials();
    this.object.visible = false;
    this.game.enemies.release(this);
  }

  /** Called by the bomb. */
  bombHit(damage) {
    const wasInvulnerable = this.invulnerable;
    this.invulnerable = false;
    const r = this.damage(damage, this.object.position);
    if (this.alive) this.invulnerable = wasInvulnerable;
    return r;
  }
}

const FORWARD = new THREE.Vector3(0, 0, -1);

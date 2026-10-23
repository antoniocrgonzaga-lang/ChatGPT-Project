import * as THREE from 'three';
import { rand } from '../utils/math.js';

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * Base class for bosses. A boss is a rail-local group made of damageable "parts"
 * (sphere colliders attached to nodes) plus contact "hazards". Subclasses build the model,
 * register parts and implement behave(dt) / onPhase(n).
 */
export class Boss {
  constructor(game, config) {
    this.game = game;
    this.cfg = config;
    this.name = config.name;
    this.object = new THREE.Group();
    this.object.name = `Boss:${config.name}`;
    this.local = new THREE.Vector3(0, 0, -config.distance);
    this.localQuat = new THREE.Quaternion();
    this.parts = [];
    this.hazards = [];
    this.ownedMaterials = [];
    this.alive = true;
    this.dying = false;
    this.phase = 0;
    this.phaseCount = 3;
    this.t = 0;
    this.phaseTime = 0;
    this.deathTime = 0;
    this.deathDuration = 3.6;
    this.scale = config.scale ?? 1; // subclasses apply it to their model root
    this.entering = true;
    this.enterTime = 0;
    game.scene.add(this.object);
  }

  /** Material owned by this boss (disposed with it). */
  own(material) {
    this.ownedMaterials.push(material);
    return material;
  }

  mesh(parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    if (typeof scale === 'number') m.scale.setScalar(scale);
    else m.scale.set(...scale);
    parent.add(m);
    return m;
  }

  addPart({ name, node, offset = [0, 0, 0], radius, hp = 1, blocker = false, vulnerable = () => true, onDestroyed = null, score = 0, bar = true, isCore = false }) {
    const meshes = [];
    node.traverse((o) => {
      if (o.isMesh && !o.userData.noFlash) meshes.push(o);
    });
    const hpScaled = Math.ceil(hp * this.game.difficulty.bossHp);
    const part = {
      name,
      node,
      offset: new THREE.Vector3(...offset),
      radius: radius * this.scale,
      hp: hpScaled,
      maxHp: hpScaled,
      alive: true,
      blocker,
      bar: bar && !blocker,
      isCore,
      score,
      collidable: true,
      targetable: !blocker,
      center: new THREE.Vector3(),
      onDestroyed,
      meshes,
      saved: meshes.map((m) => m.material),
      flashTimer: 0,
      isVulnerable: () => !blocker && vulnerable(),
      getAimPoint: (out) => out.copy(part.center),
    };
    this.parts.push(part);
    return part;
  }

  addHazard({ node, offset = [0, 0, 0], radius, damage = 1 }) {
    const h = { node, offset: new THREE.Vector3(...offset), radius: radius * this.scale, damage, active: true, center: new THREE.Vector3() };
    this.hazards.push(h);
    return h;
  }

  get healthFraction() {
    let hp = 0;
    let max = 0;
    for (const p of this.parts) {
      if (!p.bar) continue;
      hp += Math.max(0, p.hp);
      max += p.maxHp;
    }
    return max > 0 ? hp / max : 0;
  }

  // ------------------------------------------------------------ damage
  hitPart(part, amount, pos, charged = false) {
    const game = this.game;
    if (!this.alive || this.dying || this.entering) return 'blocked';
    if (part.blocker || !part.isVulnerable()) {
      game.effects.deflect(pos);
      game.audio.play('deflect');
      if (part.blocker) this.onShieldHit?.(pos);
      return 'blocked';
    }
    part.hp -= amount;
    game.score.registerHit();
    game.effects.hitSpark(pos, charged ? 0xb88cff : 0xffd0a0);
    game.audio.play('hit');
    this.flashPart(part);
    if (part.hp <= 0) {
      this.destroyPart(part);
      return 'killed';
    }
    return 'hit';
  }

  destroyPart(part) {
    if (!part.alive) return;
    part.alive = false;
    part.hp = 0;
    this.restorePart(part);
    const game = this.game;
    game.effects.explosion(part.center, { size: part.isCore ? 3 : 2.4 });
    game.cameraRig.shake(0.4);
    if (part.score) game.addScore(part.score, part.center);
    if (part.onDestroyed) part.onDestroyed(part);
    this.onPartDestroyed(part);
  }

  onPartDestroyed() {}

  /** Bombs hurt every vulnerable part but can never finish off a core. */
  bombHit(damage) {
    for (const p of this.parts) {
      if (!p.alive || !p.isVulnerable()) continue;
      if (p.isCore) {
        p.hp = Math.max(1, p.hp - damage);
        this.flashPart(p);
        this.checkPhase?.();
      } else {
        this.hitPart(p, damage, p.center);
      }
    }
  }

  flashPart(part) {
    const flash = this.game.assets.materials.flash;
    for (const m of part.meshes) m.material = flash;
    part.flashTimer = 0.06;
  }

  restorePart(part) {
    for (let i = 0; i < part.meshes.length; i++) part.meshes[i].material = part.saved[i];
  }

  // ------------------------------------------------------------ update
  update(dt) {
    this.t += dt;
    this.phaseTime += dt;
    if (this.entering) {
      this.enterTime += dt;
      this.updateEntrance(dt);
    } else if (this.dying) {
      this.updateDeath(dt);
    } else {
      this.behave(dt);
    }
    this.syncTransform();
    this.object.updateMatrixWorld(true);
    for (const p of this.parts) {
      p.node.localToWorld(p.center.copy(p.offset));
      if (p.flashTimer > 0) {
        p.flashTimer -= dt;
        if (p.flashTimer <= 0) this.restorePart(p);
      }
    }
    for (const h of this.hazards) h.node.localToWorld(h.center.copy(h.offset));
  }

  /** Default entrance: glide in from far ahead. */
  updateEntrance(dt) {
    const k = Math.min(1, this.enterTime / 3.2);
    const ease = 1 - Math.pow(1 - k, 3);
    this.local.z = -this.cfg.distance - (1 - ease) * 260;
    if (k >= 1) {
      this.entering = false;
      this.setPhase(1);
    }
  }

  syncTransform() {
    const rig = this.game.rig;
    this.object.position.copy(this.local).applyMatrix4(rig.matrixWorld);
    this.object.quaternion.copy(rig.quaternion).multiply(this.localQuat);
  }

  setPhase(n) {
    this.phase = n;
    this.phaseTime = 0;
    const game = this.game;
    if (n > 1) {
      game.audio.play('alert');
      game.postfx.pulseChromatic(0.05);
      game.cameraRig.shake(0.5);
      game.projectiles.clearEnemyShots(this.object.position, 400);
    }
    game.hud.setBossPhase(n, this.phaseCount);
    this.onPhase(n);
  }

  onPhase() {}
  behave() {}

  // ------------------------------------------------------------ attacks
  canAttack() {
    return this.game.player.alive && this.game.combatActive;
  }

  fireAt(from, opts = {}) {
    if (!this.canAttack()) return;
    this.game.projectiles.fireEnemyAt(from, this.game.player.worldPosition, opts);
  }

  fireFan(from, count, spread, opts = {}, axis = null) {
    if (!this.canAttack()) return;
    _dir.subVectors(this.game.player.worldPosition, from).normalize();
    _axis.copy(axis ?? this.game.rail.frame.up);
    for (let i = 0; i < count; i++) {
      const a = count === 1 ? 0 : -spread / 2 + (spread * i) / (count - 1);
      _v.copy(_dir).applyAxisAngle(_axis, a);
      this.game.projectiles.fireEnemy(from, _v, opts);
    }
    this.game.audio.play('enemyShoot');
  }

  /** Ring of shots in the plane facing the player (rotated by `offset`). */
  fireRing(from, count, opts = {}, offset = 0, tilt = 0.55) {
    if (!this.canAttack()) return;
    const f = this.game.rail.frame;
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * Math.PI * 2;
      _v.copy(f.right).multiplyScalar(Math.cos(a)).addScaledVector(f.up, Math.sin(a));
      _v.multiplyScalar(tilt).addScaledVector(f.forward, -1).normalize();
      this.game.projectiles.fireEnemy(from, _v, opts);
    }
    this.game.audio.play('enemyShoot');
  }

  // ------------------------------------------------------------ death
  startDeath() {
    if (this.dying) return;
    this.dying = true;
    this.deathTime = 0;
    this.nextBlast = 0;
    for (const h of this.hazards) h.active = false;
    this.game.onBossDying(this);
  }

  updateDeath(dt) {
    this.deathTime += dt;
    this.nextBlast -= dt;
    if (this.nextBlast <= 0) {
      this.nextBlast = rand(0.1, 0.22);
      const size = this.deathBlastSize ?? 4;
      _v.set(rand(-size, size) * 2, rand(-size, size), rand(-size, size)).applyMatrix4(this.object.matrixWorld);
      this.game.effects.explosion(_v, { size: rand(1.4, 2.6) });
      this.game.cameraRig.shake(0.25);
    }
    this.deathAnimation?.(dt, this.deathTime / this.deathDuration);
    if (this.deathTime >= this.deathDuration) {
      this.alive = false;
      this.game.effects.explosion(this.object.position, { size: 8, color: this.deathColor ?? 0xffffff });
      this.game.effects.shockwave(this.object.position, { radius: 90, duration: 1.4, color: this.deathColor ?? 0xffc0ff });
      this.game.audio.play('explosionHuge');
      this.game.postfx.boost(0.9);
      this.game.postfx.pulseChromatic(0.08);
      this.game.cameraRig.shake(1);
      this.object.visible = false;
      this.game.onBossDefeated(this);
    }
  }

  dispose() {
    if (this.object.parent) this.object.parent.remove(this.object);
    for (const m of this.ownedMaterials) m.dispose();
  }
}

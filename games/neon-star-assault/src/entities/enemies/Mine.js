import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { rand } from '../../utils/math.js';

/**
 * Pulse Mine: floats on the route (world mode) or drifts towards the player (local "drift" mode,
 * dropped by bosses). Arms when the player gets close, pulses fast, then detonates.
 * Shooting it early is always the safe answer.
 */
export class Mine extends Enemy {
  constructor(game) {
    super(game, 'mine');
  }

  buildModel(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const g = new THREE.Group();
    // gyroscopic cage of three rings around a pulsing core, six armoured spikes with hot tips
    this.mergedModel(g, 'mine-v2', (b, A) => {
      const GG = A.geometries;
      b.add(GG.torusThick, 'plate', { scale: [1.0, 1.0, 0.6] });
      b.add(GG.torusThick, 'plate', { rot: [Math.PI / 2, 0, 0], scale: [1.0, 1.0, 0.6] });
      b.add(GG.torusThick, 'plate', { rot: [0, Math.PI / 2, 0], scale: [1.0, 1.0, 0.6] });
      const up = new THREE.Vector3(0, 1, 0);
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (const d of dirs) {
        const dir = new THREE.Vector3(...d);
        const rot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
        b.add(GG.cylinderHex, 'dark', { pos: dir.clone().multiplyScalar(1.05).toArray(), rot: [rot.x, rot.y, rot.z], scale: [0.2, 0.3, 0.2] });
        b.add(GG.cone, 'hull', { pos: dir.clone().multiplyScalar(1.45).toArray(), rot: [rot.x, rot.y, rot.z], scale: [0.16, 0.6, 0.16] });
        b.add(GG.sphereLow, 'glow', { pos: dir.clone().multiplyScalar(1.78).toArray(), scale: 0.07 });
      }
    }, { hull: M.enemyHull, plate: M.enemyPlate, dark: M.enemyDark, glow: M.glowRed });
    this.core = this.part(g, G.sphereLow, M.glowRed, [0, 0, 0], [0, 0, 0], 0.55);
    this.core.userData.noFlash = true;
    this.halo = new THREE.Sprite(assets.spriteMaterial(0xff3040, 0.8));
    this.halo.scale.setScalar(3.2);
    g.add(this.halo);
    return g;
  }

  onSpawn(opts) {
    this.armed = false;
    this.fuse = this.def.fuse;
    this.drift = this.mode === 'local';
    this.driftSpeed = opts.speed ?? 16;
    this.spin = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
    this.halo.material.color.set(0xff3040);
  }

  behave(dt) {
    const d = this.def;
    this.model.rotation.x += this.spin.x * dt;
    this.model.rotation.y += this.spin.y * dt;

    if (this.drift) {
      const p = this.game.player.local;
      this.local.z += this.driftSpeed * dt;
      this.local.x += (p.x - this.local.x) * 0.25 * dt;
      this.local.y += (p.y - this.local.y) * 0.25 * dt;
      if (this.local.z > 20) this.despawn();
    }

    const dist = this.object.position.distanceTo(this.game.player.worldPosition);
    if (!this.armed && dist < d.triggerRange && this.game.player.alive) {
      this.armed = true;
      this.game.audio.play('warning');
    }
    const rate = this.armed ? 22 : 4;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * rate);
    this.core.scale.setScalar(0.45 + pulse * (this.armed ? 0.35 : 0.15));
    this.halo.scale.setScalar(2.6 + pulse * (this.armed ? 3 : 1));
    if (this.armed) {
      this.halo.material.color.setRGB(1, 0.35 + pulse * 0.6, 0.3);
      this.fuse -= dt;
      if (this.fuse <= 0) this.detonate();
    }
  }

  detonate() {
    if (!this.alive) return;
    const d = this.def;
    const dist = this.object.position.distanceTo(this.game.player.worldPosition);
    if (dist < d.blastRadius) this.game.player.hit(d.damage);
    this.alive = false;
    this.game.effects.explosion(this.object.position, { size: 2.2, color: 0xff3040 });
    this.game.effects.shockwave(this.object.position, { radius: d.blastRadius * 1.6, duration: 0.4, color: 0xff3040 });
    this.game.onEnemyEscaped(this);
    this.release();
  }

  explode() {
    this.game.effects.explosion(this.object.position, { size: 1.6, color: 0xff3040 });
  }
}

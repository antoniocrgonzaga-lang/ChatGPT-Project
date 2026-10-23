import * as THREE from 'three';
import { Obstacle } from '../entities/Obstacle.js';
import { Beam } from '../entities/Beam.js';
import { ObjectPool } from '../utils/ObjectPool.js';

const _rel = new THREE.Vector3();
const _box = new THREE.Box3();
const MAX_BEAMS = 12;

/**
 * Level hazards: collidable obstacles (optionally destructible or animated),
 * telegraphed beams and bonus rings. Everything is removed once it is behind the player.
 */
export class ObstacleSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rings = [];
    this.beams = new ObjectPool(
      () => {
        const b = new Beam(game.assets);
        game.scene.add(b.group);
        return b;
      },
      { max: MAX_BEAMS, onRelease: (b) => b.stop() },
    );
  }

  add(object, opts = {}) {
    const obs = new Obstacle(object, opts);
    if (!object.parent) (obs.local ? this.game.rig : this.game.scene).add(object);
    obs.update(0);
    // coarse bounding sphere around the object origin, used to skip far-away collision tests
    _box.setFromObject(object);
    if (!_box.isEmpty()) {
      obs.boundRadius = Math.max(
        _box.min.distanceTo(obs.boundCenter),
        _box.max.distanceTo(obs.boundCenter),
      ) + (opts.boundMargin ?? 2);
    }
    this.list.push(obs);
    return obs;
  }

  remove(obs) {
    obs.alive = false;
    if (obs.object.parent) obs.object.parent.remove(obs.object);
    if (obs.disposeFn) obs.disposeFn();
  }

  /** Bonus ring: flying through the centre awards points. */
  addRing(object, radius, { score = true } = {}) {
    if (!object.parent) this.game.scene.add(object);
    object.updateMatrixWorld(true);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
    const ring = { object, radius, normal, center: object.getWorldPosition(new THREE.Vector3()), lastSide: null, passed: false, score };
    this.rings.push(ring);
    return ring;
  }

  fireBeam(opts) {
    const beam = this.beams.acquire();
    if (beam) beam.launch(opts);
    return beam;
  }

  update(dt) {
    const game = this.game;
    const player = game.player.worldPosition;
    const forward = game.rail.frame.forward;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (!o.alive) {
        this.list.splice(i, 1);
        continue;
      }
      o.update(dt);
      if (!o.local) {
        _rel.subVectors(o.boundCenter, player);
        if (_rel.dot(forward) < -(o.cullBehind ?? 60)) {
          this.remove(o);
          this.list.splice(i, 1);
        }
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      _rel.subVectors(player, r.center);
      const side = Math.sign(_rel.dot(r.normal));
      if (r.lastSide !== null && side !== r.lastSide && !r.passed) {
        const along = _rel.dot(r.normal);
        const lateral = Math.sqrt(Math.max(0, _rel.lengthSq() - along * along));
        if (lateral < r.radius * 0.85) {
          r.passed = true;
          game.onRingPassed(r);
        }
      }
      r.lastSide = side;
      _rel.subVectors(r.center, player);
      if (_rel.dot(forward) < -60) {
        if (r.object.parent) r.object.parent.remove(r.object);
        this.rings.splice(i, 1);
      }
    }

    const beams = this.beams.active;
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      b.update(dt, game.rig, game.audio, game.camera);
      if (b.done) this.beams.release(b);
    }
  }

  /** Damage from the player's weapons. Returns 'blocked' | 'hit' | 'killed' | null (no contact). */
  damage(obs, amount, hitPos) {
    if (!obs.destructible) {
      this.game.effects.deflect(hitPos);
      return 'blocked';
    }
    obs.hp -= amount;
    if (obs.hp <= 0) {
      this.destroy(obs);
      return 'killed';
    }
    obs.flash(this.game.assets.materials.flash);
    this.game.effects.hitSpark(hitPos, 0xffaa66);
    this.game.audio.play('hit');
    return 'hit';
  }

  destroy(obs) {
    if (!obs.alive) return;
    obs.restoreFlash();
    const pos = obs.boundCenter;
    this.game.effects.explosion(pos, { size: obs.explosionSize ?? 1.5, color: obs.explosionColor ?? null });
    if (obs.onDestroyed) obs.onDestroyed(obs);
    this.game.onObstacleDestroyed(obs);
    this.remove(obs);
  }

  clear() {
    for (const o of this.list) this.remove(o);
    this.list.length = 0;
    for (const r of this.rings) if (r.object.parent) r.object.parent.remove(r.object);
    this.rings.length = 0;
    this.beams.releaseAll();
  }
}

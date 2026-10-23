import * as THREE from 'three';
import { PLAYER, WEAPONS } from '../config/gameConfig.js';
import { segmentPointDistSq } from '../utils/math.js';

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * All gameplay collisions, using spheres / oriented boxes / segments only.
 * Player shots use swept tests (previous -> current position) so fast bullets never tunnel.
 */
export class CollisionSystem {
  constructor(game) {
    this.game = game;
  }

  update() {
    this.playerShots();
    this.enemyShots();
    this.playerContacts();
  }

  // ------------------------------------------------------------ player weapons
  playerShots() {
    const game = this.game;
    const proj = game.projectiles;
    const enemies = game.enemies.active;
    const boss = game.boss;
    const obstacles = game.obstacles.list;

    for (let i = 0; i < proj.playerCount; i++) {
      const s = proj.playerShots[i];
      if (!s.alive) continue;
      let hit = false;

      if (boss && boss.alive) {
        for (const part of boss.parts) {
          if (!part.alive || part.collidable === false) continue;
          const r = part.radius + s.radius;
          if (segmentPointDistSq(s.prev, s.pos, part.center) <= r * r) {
            boss.hitPart(part, s.damage, s.pos, s.charged);
            hit = true;
            break;
          }
        }
      }

      if (!hit) {
        for (let k = enemies.length - 1; k >= 0; k--) {
          const e = enemies[k];
          if (!e.alive || !e.object.visible) continue;
          const r = e.radius + s.radius;
          if (segmentPointDistSq(s.prev, s.pos, e.colliderCenter) <= r * r) {
            const result = e.damage(s.damage, s.pos);
            if (result !== 'blocked') {
              game.score.registerHit();
              game.effects.hitSpark(s.pos, s.color);
            }
            hit = true;
            break;
          }
        }
      }

      if (!hit) {
        for (const o of obstacles) {
          if (!o.alive || !o.blocksShots) continue;
          if (o.boundCenter.distanceToSquared(s.pos) > (o.boundRadius + 6) ** 2) continue;
          if (o.intersectsSphere(s.pos, s.radius)) {
            game.obstacles.damage(o, s.damage, s.pos);
            hit = true;
            break;
          }
        }
      }

      if (hit) {
        if (s.charged) this.chargedImpact(s);
        s.alive = false;
      }
    }
  }

  chargedImpact(s) {
    const game = this.game;
    const C = WEAPONS.charged;
    const radius = C.aoeRadius * (0.6 + s.power * 0.6);
    const splash = s.damage * C.aoeDamageFactor;
    for (let k = game.enemies.active.length - 1; k >= 0; k--) {
      const e = game.enemies.active[k];
      if (e.alive && e.colliderCenter.distanceTo(s.pos) < radius + e.radius) e.damage(splash, e.colliderCenter);
    }
    game.effects.explosion(s.pos, { size: 1 + s.power, color: 0x9d5cff, debris: false, sound: false });
    game.effects.shockwave(s.pos, { radius: radius * 1.4, duration: 0.35, color: 0xb88cff });
    game.audio.play('explosion', { size: 0.6 });
  }

  // ------------------------------------------------------------ enemy weapons
  enemyShots() {
    const game = this.game;
    const player = game.player;
    if (!player.alive) return;
    const proj = game.projectiles;
    const center = player.worldPosition;
    for (let i = 0; i < proj.enemyCount; i++) {
      const s = proj.enemyShots[i];
      if (!s.alive) continue;
      const r = s.radius + PLAYER.hitRadius;
      if (segmentPointDistSq(s.prev, s.pos, center) <= r * r) {
        if (player.hit(s.damage)) {
          s.alive = false;
          game.effects.hitSpark(s.pos, s.color);
        }
      }
    }
  }

  // ------------------------------------------------------------ bodies
  playerContacts() {
    const game = this.game;
    const player = game.player;
    if (!player.alive) return;
    const center = player.worldPosition;
    const pr = PLAYER.hitRadius;

    for (let k = game.enemies.active.length - 1; k >= 0; k--) {
      const e = game.enemies.active[k];
      if (!e.alive || !e.object.visible || e.contactDamage === 0) continue;
      const r = e.radius * 0.8 + pr;
      if (e.colliderCenter.distanceToSquared(center) <= r * r) {
        if (e.type === 'mine') {
          e.detonate();
        } else if (player.hit(1)) {
          if (e.maxHp <= 8) e.damage(99, center);
        }
      }
    }

    for (const o of game.obstacles.list) {
      if (!o.alive || o.damage <= 0) continue;
      if (o.boundCenter.distanceToSquared(center) > (o.boundRadius + 2) ** 2) continue;
      if (o.intersectsSphere(center, pr)) {
        if (player.hit(o.damage)) game.cameraRig.shake(0.35);
      }
    }

    for (const b of game.obstacles.beams.active) {
      if (b.hits(center, pr)) player.hit(b.damage);
    }

    const boss = game.boss;
    if (boss && boss.alive) {
      for (const h of boss.hazards) {
        if (h.active === false) continue;
        const r = h.radius + pr;
        if (h.center.distanceToSquared(center) <= r * r) {
          player.hit(h.damage ?? 1);
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ aiming helpers
  /** Anything roughly under the reticle? Used to tint the reticle. */
  aimHasTarget(origin, dir, range = 260) {
    const test = (center, radius) => {
      _v.subVectors(center, origin);
      const t = _v.dot(dir);
      if (t <= 0 || t > range) return false;
      _p.copy(dir).multiplyScalar(t).add(origin);
      return _p.distanceToSquared(center) < (radius + 1.5) ** 2;
    };
    for (const e of this.game.enemies.active) {
      if (e.alive && e.object.visible && test(e.colliderCenter, e.radius)) return true;
    }
    const boss = this.game.boss;
    if (boss && boss.alive) {
      for (const part of boss.parts) if (part.alive && part.targetable !== false && test(part.center, part.radius)) return true;
    }
    return false;
  }

  /** Best homing target for the charged shot: closest to the aim direction inside the cone. */
  findLockTarget(origin, dir) {
    const C = WEAPONS.charged;
    let best = null;
    let bestScore = -Infinity;
    const consider = (target, center) => {
      _aim.subVectors(center, origin);
      const dist = _aim.length();
      if (dist > C.lockRange || dist < 8) return;
      const cos = _aim.dot(dir) / dist;
      if (cos < 1 - C.lockCone) return;
      const score = cos * 2 - dist / C.lockRange;
      if (score > bestScore) {
        bestScore = score;
        best = target;
      }
    };
    for (const e of this.game.enemies.active) {
      if (e.alive && e.object.visible && !e.invulnerable) consider(e, e.colliderCenter);
    }
    const boss = this.game.boss;
    if (boss && boss.alive) {
      for (const part of boss.parts) {
        if (part.alive && part.targetable !== false && part.isVulnerable()) consider(part, part.center);
      }
    }
    return best;
  }
}

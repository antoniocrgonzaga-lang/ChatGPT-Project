import * as THREE from 'three';
import { ObjectPool } from '../utils/ObjectPool.js';
import { ENEMY_TYPES } from '../entities/enemies/index.js';
import { rand } from '../utils/math.js';

/**
 * Owns the enemy pools, spawns individual enemies and choreographed formations,
 * and tracks formation completion for the bonus.
 */
export class SpawnSystem {
  constructor(game) {
    this.game = game;
    this.pools = {};
    this.active = [];
    this.pending = []; // delayed spawns from formations
    for (const [type, { cls, prewarm }] of Object.entries(ENEMY_TYPES)) {
      this.pools[type] = new ObjectPool(() => new cls(game), { initial: prewarm });
    }
  }

  spawn(type, opts = {}) {
    const pool = this.pools[type];
    if (!pool) {
      console.warn(`Tipo de inimigo desconhecido: ${type}`);
      return null;
    }
    const enemy = pool.acquire();
    if (!enemy) return null;
    enemy.spawn(opts);
    this.active.push(enemy);
    return enemy;
  }

  release(enemy) {
    const i = this.active.indexOf(enemy);
    if (i !== -1) {
      this.active[i] = this.active[this.active.length - 1];
      this.active.pop();
    }
    this.pools[enemy.type].release(enemy);
  }

  /**
   * Formation spawn. desc: { enemy, formation, count, x, y, z, spacing, stagger, pattern, ...opts }
   * All members share a wave record so killing the whole group awards a bonus.
   */
  spawnWave(desc) {
    const count = desc.count ?? 5;
    const wave = { total: count, killed: 0, resolved: 0, bonus: desc.bonus ?? true, drop: desc.drop ?? null };
    const spacing = desc.spacing ?? 5;
    const baseX = (desc.x ?? 0) + rand(-2, 2);
    const baseY = (desc.y ?? 0) + rand(-1.5, 1.5);
    const baseZ = desc.z ?? -220;
    for (let i = 0; i < count; i++) {
      const c = i - (count - 1) / 2;
      const offset = new THREE.Vector3();
      switch (desc.formation) {
        case 'line':
          offset.set(c * spacing, 0, 0);
          break;
        case 'column':
          offset.set(0, 0, -i * spacing * 1.6);
          break;
        case 'arc': {
          const a = (i / count) * Math.PI * 2;
          offset.set(Math.cos(a) * spacing * 1.4, Math.sin(a) * spacing, 0);
          break;
        }
        case 'random':
          offset.set(rand(-14, 14), rand(-7, 8), rand(-40, 0));
          break;
        default: // 'V'
          offset.set(c * spacing, Math.abs(c) * 0.6, -Math.abs(c) * spacing * 0.9);
      }
      const opts = {
        ...desc.opts,
        local: new THREE.Vector3(baseX + offset.x, baseY + offset.y, baseZ + offset.z),
        pattern: desc.pattern,
        side: desc.side,
        phase: desc.syncPhase ? i * 0.4 : undefined,
        wave,
      };
      const delay = (desc.stagger ?? 0) * i;
      if (delay > 0) this.pending.push({ t: delay, type: desc.enemy, opts });
      else this.spawn(desc.enemy, opts);
    }
    return wave;
  }

  update(dt) {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pending.splice(i, 1);
        this.spawn(p.type, p.opts);
      }
    }
    // iterate over a snapshot-safe backwards loop: enemies may release themselves
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      if (e) e.update(dt);
    }
  }

  /** Notify formation bookkeeping; returns true if this kill completed the whole formation. */
  resolveWave(enemy, killed) {
    const wave = enemy.wave;
    if (!wave) return false;
    wave.resolved++;
    if (killed) wave.killed++;
    return wave.resolved === wave.total && wave.killed === wave.total && wave.bonus;
  }

  countOf(type) {
    let n = 0;
    for (const e of this.active) if (e.type === type) n++;
    return n;
  }

  clear() {
    this.pending.length = 0;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.alive = false;
      e.release();
    }
    this.active.length = 0;
  }
}

import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { hullFromOutline, symmetricOutline, finFromOutline, stripBetween, nacelle } from '../models/shapes.js';
import { rand, randSign, chance } from '../../utils/math.js';

/**
 * Scout "Needle": small, fast, flies scripted curved paths in formation.
 * Patterns: swoop (head-on weave), cross (side to side), dive (from above), drone (launched, homes briefly).
 */
export class Scout extends Enemy {
  constructor(game) {
    super(game, 'scout');
  }

  buildModel(assets) {
    const M = assets.materials;
    const g = new THREE.Group();
    // "Needle": dart hull with swept wings, raised spine, canted tip fins and twin micro engines
    this.mergedModel(g, 'scout-v2', (b, A) => {
      const G = A.geometries;
      b.add(hullFromOutline(symmetricOutline([[0, 1.9], [0.28, 1.1], [0.55, 0.2], [1.55, -0.75], [1.5, -1.05], [0.6, -0.7], [0.45, -1.15], [0, -1.0]]), 0.3, 0.07), 'hull');
      b.add(hullFromOutline(symmetricOutline([[0, 1.3], [0.2, 0.5], [0.22, -0.4], [0.12, -0.95], [0, -0.95]]), 0.22, 0.05), 'plate', { pos: [0, 0.2, 0] });
      b.add(G.sphere, 'glass', { pos: [0, 0.3, -0.55], scale: [0.13, 0.08, 0.35] });
      b.addMirrored(finFromOutline([[-0.35, 0], [0.25, 0], [-0.05, 0.45], [-0.35, 0.4]], 0.05), 'plate', { pos: [1.2, 0.12, 0.8], rot: [0, 0, -0.35] });
      b.addMirrored(nacelle(0.17, 0.9, 10), 'dark', { pos: [0.33, -0.02, 0.85] });
      b.addMirrored(G.sphereLow, 'glow', { pos: [0.33, -0.02, 1.3], scale: [0.13, 0.13, 0.04] });
      b.addMirrored(stripBetween([0.3, 0.16, -1.05], [0.56, 0.16, -0.25], 0.028, 0.03), 'trim');
      b.addMirrored(stripBetween([0.6, 0.16, -0.15], [1.5, 0.16, 0.72], 0.028, 0.03), 'trim');
      b.add(G.box, 'accent', { pos: [0, 0.2, -1.35], scale: [0.05, 0.03, 0.55] });
    }, { hull: M.enemyHull, plate: M.enemyPlate, dark: M.enemyDark, glass: M.enemyGlass, glow: M.glowOrange, accent: M.glowMagenta, trim: M.trimMagenta });
    for (const s of [-1, 1]) this.addEngine(g, [s * 0.33, -0.02, 1.32], 0.12, 0.8);
    return g;
  }

  onSpawn(opts) {
    const d = this.def;
    this.pattern = opts.pattern ?? 'swoop';
    this.speed = (opts.speed ?? d.speed) * rand(0.92, 1.08);
    this.origin = this.local.clone();
    this.phase = opts.phase ?? rand(0, Math.PI * 2);
    this.amp = opts.amp ?? rand(4, 8);
    this.side = opts.side ?? randSign();
    this.fired = !chance(d.fireChance * (opts.fireScale ?? 1));
    this.fireAt = rand(-150, -90);
    this.vel = new THREE.Vector3();
    if (this.pattern === 'drone') {
      this.vel.set(rand(-6, 6), rand(-4, 4), this.speed * 0.3);
      this.fired = true;
    }
  }

  behave(dt) {
    const L = this.local;
    const t = this.t;
    const prevX = L.x;
    const prevY = L.y;
    const prevZ = L.z;
    const player = this.game.player.local;

    switch (this.pattern) {
      case 'cross': {
        L.x = this.origin.x - this.side * this.speed * 0.9 * t;
        L.y = this.origin.y + Math.sin(t * 2 + this.phase) * 3;
        L.z = this.origin.z + t * this.speed * 0.25;
        if (Math.abs(L.x) > 70) this.despawn();
        break;
      }
      case 'dive': {
        L.z = this.origin.z + this.speed * t;
        const k = Math.min(1, t / 2.2);
        L.y = this.origin.y + (player.y - 2 - this.origin.y) * k * k;
        L.x = this.origin.x + Math.sin(t * 1.5 + this.phase) * this.amp * 0.5;
        break;
      }
      case 'drone': {
        if (t < 1.4) {
          // steer towards the player lane during the first moments after launch
          this.vel.x += (player.x - L.x) * 2.2 * dt;
          this.vel.y += (player.y - L.y) * 2.2 * dt;
          this.vel.z = Math.min(this.speed, this.vel.z + this.speed * 1.5 * dt);
        }
        L.addScaledVector(this.vel, dt);
        break;
      }
      default: {
        // swoop: head-on weave that pinches towards the player lane
        L.z = this.origin.z + this.speed * t;
        L.x = this.origin.x + Math.sin(t * 1.8 + this.phase) * this.amp;
        L.y = this.origin.y + Math.cos(t * 1.3 + this.phase) * this.amp * 0.4;
      }
    }

    // bank into the turn and face the travel direction
    const dx = (L.x - prevX) / Math.max(dt, 1e-4);
    const dz = (L.z - prevZ) / Math.max(dt, 1e-4);
    const dy = (L.y - prevY) / Math.max(dt, 1e-4);
    this.faceLocal(dx, dy, dz);
    this.model.rotation.z = -dx * 0.03;

    if (!this.fired && L.z > this.fireAt && this.canFire()) {
      this.fired = true;
      this.fireAtPlayer({ speed: 30 });
    }
    if (L.z > 25) this.despawn();
  }
}

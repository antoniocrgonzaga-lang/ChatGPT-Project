import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { hullFromOutline, symmetricOutline, finFromOutline, stripBetween, nacelle, latheAlongZ } from '../models/shapes.js';
import { rand, randSign, damp, chance, clamp } from '../../utils/math.js';
import { PLAYER } from '../../config/gameConfig.js';

/**
 * Interceptor "Talon": overtakes the player from behind (or enters from the front), then hovers
 * ahead tracking the player's lane, firing 3-shot bursts and occasionally juking away from fire.
 */
export class Interceptor extends Enemy {
  constructor(game) {
    super(game, 'interceptor');
  }

  buildModel(assets) {
    const M = assets.materials;
    const g = new THREE.Group();
    // "Talon": round fuselage, forward mandibles with weapon emitters, swept wings with dihedral
    this.mergedModel(g, 'interceptor-v2', (b, A) => {
      const G = A.geometries;
      b.add(latheAlongZ([[0.2, 1.7], [0.42, 1.5], [0.5, 0.6], [0.46, -0.4], [0.32, -1.3], [0.12, -1.8]], 10), 'hull');
      b.add(hullFromOutline(symmetricOutline([[0, 0.9], [0.18, 0.2], [0.2, -1.2], [0, -1.45]]), 0.18, 0.04), 'plate', { pos: [0, 0.42, 0] });
      b.add(G.sphere, 'glass', { pos: [0, 0.38, -0.55], scale: [0.22, 0.15, 0.55] });
      // mandibles
      b.addMirrored(hullFromOutline([[0.3, -0.2], [0.72, -0.1], [0.68, 2.2], [0.5, 2.75], [0.34, 2.0]], 0.22, 0.05), 'plate');
      b.addMirrored(G.sphereLow, 'accent', { pos: [0.52, 0, -2.55], scale: 0.11 });
      b.addMirrored(stripBetween([0.72, 0.12, 0.1], [0.66, 0.12, -2.15], 0.025, 0.03), 'trim');
      // wings (dihedral) with leading-edge light and wingtip gun pods
      const wingRot = [0, 0, 0.14];
      b.addMirrored(hullFromOutline([[0.35, 0.6], [2.5, -0.9], [2.55, -1.35], [2.1, -1.35], [0.35, -0.6]], 0.12, 0.03), 'hull', { rot: wingRot });
      b.addMirrored(stripBetween([0.45, 0.07, -0.6], [2.45, 0.07, 0.85], 0.028, 0.03), 'trim', { rot: wingRot });
      b.addMirrored(latheAlongZ([[0.06, 0.5], [0.09, 0.4], [0.09, -0.3], [0.03, -0.55]], 8), 'dark', { pos: [2.45, 0.34, 1.0], rot: wingRot });
      // tail fins
      b.addMirrored(finFromOutline([[-0.5, 0], [0.3, 0], [-0.25, 0.6], [-0.5, 0.55]], 0.05), 'plate', { pos: [0.3, 0.3, 1.25], rot: [0, 0, -0.3] });
      // engines
      b.addMirrored(nacelle(0.2, 1.0, 10), 'dark', { pos: [0.32, 0, 1.3] });
      b.addMirrored(G.sphereLow, 'glow', { pos: [0.32, 0, 1.8], scale: [0.16, 0.16, 0.05] });
    }, { hull: M.enemyHull, plate: M.enemyPlate, dark: M.enemyDark, glass: M.enemyGlass, glow: M.glowOrange, accent: M.glowMagenta, trim: M.trimMagenta });
    for (const s of [-1, 1]) this.addEngine(g, [s * 0.32, 0, 1.82], 0.15, 1.0);
    return g;
  }

  onSpawn(opts) {
    const d = this.def;
    this.entry = opts.entry ?? 'behind';
    this.holdZ = -(opts.hold ?? d.holdDistance) * rand(0.85, 1.15);
    this.side = opts.side ?? randSign();
    this.state = 'enter';
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.cooldown = this.fireCooldown(d.burstCooldown) * rand(0.6, 1.2);
    this.dodgeTimer = 0;
    this.dodgeVel = 0;
    this.checkTimer = 0;
    this.offset = new THREE.Vector2(rand(-6, 6), rand(-3, 4));
    this.lifeTime = opts.lifeTime ?? d.lifeTime;
    this.showIndicator = this.entry === 'behind';
    if (this.entry === 'behind') this.local.set(this.side * rand(8, 13), rand(-4, 5), 35);
  }

  behave(dt) {
    const L = this.local;
    const p = this.game.player.local;
    const prevX = L.x;

    if (this.state === 'enter') {
      L.z = damp(L.z, this.holdZ, this.entry === 'behind' ? 1.6 : 1.2, dt);
      L.x = damp(L.x, clamp(p.x + this.offset.x, -18, 18), 1.2, dt);
      if (L.z < 0) this.showIndicator = false;
      if (Math.abs(L.z - this.holdZ) < 6) this.state = 'hold';
    } else if (this.state === 'hold') {
      const tx = clamp(p.x + this.offset.x + Math.sin(this.t * 1.3) * 4, -18, 18);
      const ty = clamp(p.y + this.offset.y + Math.cos(this.t * 1.1) * 2, -10, 10);
      L.x = damp(L.x, tx, 1.1, dt) + this.dodgeVel * dt;
      L.y = damp(L.y, ty, 1.1, dt);
      L.z = damp(L.z, this.holdZ + Math.sin(this.t * 0.7) * 8, 1, dt);
      this.updateDodge(dt);
      this.updateFiring(dt);
      if (this.t > this.lifeTime) this.state = 'exit';
    } else {
      L.z -= 90 * dt;
      L.y += 10 * dt;
      if (L.z < -420) this.despawn();
    }

    const vx = (L.x - prevX) / Math.max(dt, 1e-4);
    this.faceLocal(vx * 0.02, 0, -1);
    this.model.rotation.z = damp(this.model.rotation.z, clamp(-vx * 0.05, -1, 1), 6, dt);
  }

  updateDodge(dt) {
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    if (this.dodgeTimer <= 0) this.dodgeVel = damp(this.dodgeVel, 0, 6, dt);
    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = 0.35;
    const p = this.game.player.local;
    const aligned = Math.abs(p.x - this.local.x) < 2.5 && Math.abs(p.y - this.local.y) < 2.5;
    if (aligned && this.game.player.fireCooldown > 0 && chance(this.def.dodgeChance)) {
      this.dodgeTimer = 0.35;
      this.dodgeVel = (this.local.x > p.x ? 1 : -1) * 26;
      if (Math.abs(this.local.x) > PLAYER.bounds.x) this.dodgeVel *= -1;
    }
  }

  updateFiring(dt) {
    const d = this.def;
    if (this.burstLeft > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstLeft--;
        this.burstTimer = d.burstInterval;
        if (this.canFire()) this.fireAtPlayer({ speed: 36 });
      }
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = this.fireCooldown(d.burstCooldown);
      this.burstLeft = d.burstCount;
      this.burstTimer = 0;
    }
  }
}

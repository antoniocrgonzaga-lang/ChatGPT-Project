import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { finFromOutline, stripBetween, latheAlongZ, nacelle } from '../models/shapes.js';
import { rand, randSign, damp, clamp } from '../../utils/math.js';

const _v = new THREE.Vector3();
const ORB_COLOR = 0xfff0a0;

/**
 * Prism Lancer (Stage 3 only): a spinning crystal lance with golden fins. It charges its tip
 * (clear glow telegraph), fires a slow prism orb and, a moment later, the orb shatters into a
 * spread of shots aimed where the player is at that instant. Shooting it while it charges is ideal.
 */
export class PrismLancer extends Enemy {
  constructor(game) {
    super(game, 'prismLancer');
  }

  buildModel(assets) {
    const M = assets.materials;
    const g = new THREE.Group();
    this.spinner = new THREE.Group();
    g.add(this.spinner);
    this.mergedModel(this.spinner, 'prism-lancer-v1', (b, A) => {
      const G = A.geometries;
      // hexagonal crystal lance (6-sided lathe) with a golden collar
      b.add(latheAlongZ([[0.05, 1.7], [0.42, 1.2], [0.55, 0.2], [0.45, -1.2], [0.04, -2.5]], 6), 'crystal');
      b.add(G.torusThick, 'gold', { pos: [0, 0, 0.35], scale: [0.62, 0.62, 0.9] });
      b.add(G.torusThick, 'gold', { pos: [0, 0, -0.9], scale: [0.48, 0.48, 0.7] });
      // four fins in an X
      const fin = finFromOutline([[-0.9, 0], [0.5, 0], [-0.4, 1.25], [-0.9, 1.15]], 0.07);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2;
        b.add(fin, 'hull', { pos: [Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0.6], rot: [0, 0, -a] });
        b.add(stripBetween([0, 0, 0.1], [0, 1.2, 1.1], 0.03, 0.03), 'trim', { pos: [Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0.6], rot: [0, 0, -a] });
      }
      b.add(nacelle(0.28, 0.8, 8), 'dark', { pos: [0, 0, 1.85] });
      b.add(G.sphereLow, 'glow', { pos: [0, 0, 2.25], scale: [0.22, 0.22, 0.05] });
      b.add(G.sphereLow, 'accent', { pos: [0, 0, -2.45], scale: 0.14 });
    }, {
      crystal: M.crystal,
      gold: M.hullGold,
      hull: M.enemyHull,
      dark: M.enemyDark,
      glow: M.glowOrange,
      accent: M.glowGold,
      trim: M.trimGold,
    });
    this.addEngine(g, [0, 0, 2.28], 0.2, 1.1);

    // charge telegraph at the tip
    this.chargeGlow = new THREE.Sprite(assets.spriteMaterial(ORB_COLOR, 0.9));
    this.chargeGlow.position.set(0, 0, -2.6);
    this.chargeGlow.visible = false;
    g.add(this.chargeGlow);
    return g;
  }

  onSpawn(opts) {
    const d = this.def;
    this.state = 'enter';
    this.holdZ = -(opts.hold ?? d.holdDistance) * rand(0.9, 1.1);
    this.side = randSign();
    this.cooldown = this.fireCooldown(d.fireInterval) * rand(0.4, 0.8);
    this.charge = 0;
    this.orb = null;
    this.orbId = 0;
    this.splitTimer = 0;
    this.lifeTime = opts.lifeTime ?? d.lifeTime;
    this.chargeGlow.visible = false;
  }

  behave(dt) {
    const L = this.local;
    const p = this.game.player.local;
    this.spinner.rotation.z += dt * (1.2 + this.charge * 8);

    if (this.state === 'enter') {
      L.z = damp(L.z, this.holdZ, 1.3, dt);
      if (Math.abs(L.z - this.holdZ) < 6) this.state = 'hold';
    } else if (this.state === 'hold') {
      L.x = damp(L.x, clamp(p.x + this.side * 7 + Math.sin(this.t * 0.9) * 4, -18, 18), 0.9, dt);
      L.y = damp(L.y, clamp(p.y + 3 + Math.cos(this.t * 0.7) * 2, -9, 11), 0.9, dt);
      this.updateAttack(dt);
      if (this.t > this.lifeTime && this.charge === 0) this.state = 'exit';
    } else {
      L.z -= 70 * dt;
      if (L.z < -420) this.despawn();
    }
    // point the lance at the player
    this.faceLocal(p.x - L.x, p.y - L.y, -L.z);
    this.updateOrb(dt);
  }

  updateAttack(dt) {
    const d = this.def;
    if (this.charge > 0) {
      this.charge += dt / d.chargeTime;
      const pulse = 1 + Math.sin(this.t * 40) * 0.15;
      this.chargeGlow.visible = true;
      this.chargeGlow.scale.setScalar((0.6 + this.charge * 2.4) * pulse);
      if (this.charge >= 1) {
        this.charge = 0;
        this.chargeGlow.visible = false;
        this.fireOrb();
      }
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0 && this.canFire(25)) {
      this.cooldown = this.fireCooldown(d.fireInterval);
      this.charge = 0.001;
      this.game.audio.play('telegraph');
    }
  }

  fireOrb() {
    this.model.localToWorld(_v.set(0, 0, -2.6));
    const orb = this.game.projectiles.fireEnemyAt(_v, this.game.player.worldPosition, { speed: 15, size: 2, color: ORB_COLOR });
    if (!orb) return;
    this.orb = orb;
    this.orbId = orb.id;
    this.splitTimer = this.def.splitDelay;
    this.game.audio.play('enemyShoot');
  }

  /** The orb shatters into a spread aimed at the player's position at that moment. */
  updateOrb(dt) {
    if (!this.orb) return;
    this.splitTimer -= dt;
    const orb = this.orb;
    if (!orb.alive || orb.id !== this.orbId) {
      this.orb = null;
      return;
    }
    if (this.splitTimer > 0) return;
    orb.alive = false;
    this.orb = null;
    const n = this.def.splitShots;
    const from = _v.copy(orb.pos);
    this.fireFan(n, 0.7, { speed: 30, color: ORB_COLOR }, from);
    this.fireFan(3, 0.45, { speed: 28, color: ORB_COLOR }, from, this.game.rail.frame.right);
    this.game.effects.burst(from, { count: 14, color: ORB_COLOR, speed: 10, life: 0.3, size: 1 });
    this.game.audio.play('deflect');
  }

  release() {
    this.orb = null;
    this.chargeGlow.visible = false;
    super.release();
  }
}

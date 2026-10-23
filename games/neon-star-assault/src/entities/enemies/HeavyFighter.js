import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { hullFromOutline, symmetricOutline, stripBetween, nacelle, latheAlongZ } from '../models/shapes.js';
import { rand, damp } from '../../utils/math.js';
import { createShieldMaterial } from '../../effects/materials.js';

const _p = new THREE.Vector3();

/**
 * Heavy Fighter "Bulwark": large armoured gunship. Cycles an energy shield (immune while up)
 * and fires wide fans. Breaks apart with secondary explosions before the final blast.
 */
export class HeavyFighter extends Enemy {
  constructor(game) {
    super(game, 'heavy');
  }

  buildModel(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const g = new THREE.Group();
    // "Bulwark": layered armoured hull, bridge with visor, drooping armour skirts,
    // twin gun sponsons, chin cannon and a triple engine block
    this.mergedModel(g, 'heavy-v2', (b, A) => {
      const GG = A.geometries;
      b.add(hullFromOutline(symmetricOutline([[0, 4.4], [0.9, 3.9], [1.9, 2.2], [2.1, -1.5], [1.7, -3.4], [0.9, -3.9], [0, -3.9]]), 1.5, 0.22, 2), 'hull');
      b.add(hullFromOutline(symmetricOutline([[0, 3.2], [0.9, 2.6], [1.3, 0.5], [1.2, -2.8], [0, -3.2]]), 0.6, 0.12), 'plate', { pos: [0, 0.85, 0] });
      b.add(hullFromOutline(symmetricOutline([[0, 1.2], [0.5, 0.8], [0.55, -0.6], [0, -0.8]]), 0.55, 0.1), 'hull', { pos: [0, 1.35, 0.6] });
      b.add(GG.box, 'accent', { pos: [0, 1.42, -0.55], scale: [0.62, 0.1, 0.06] });
      for (const z of [-1.6, -0.2, 1.6]) b.add(GG.box, 'dark', { pos: [0, 1.17, z], scale: [2.1, 0.06, 0.22] });
      // armour skirts
      b.addMirrored(hullFromOutline([[1.9, 1.8], [4.1, 0.5], [4.2, -1.6], [1.9, -2.4]], 0.35, 0.08), 'plate', { pos: [0, -0.2, 0], rot: [0, 0, -0.12] });
      b.addMirrored(stripBetween([2.2, 0.0, -1.7], [4.05, -0.23, -0.45], 0.04, 0.03), 'trim');
      // sponsons with long barrels and muzzle rings
      b.addMirrored(latheAlongZ([[0.35, 2.1], [0.6, 1.8], [0.62, -1.2], [0.4, -2.0]], 12), 'hull', { pos: [3.1, -0.35, -0.2] });
      b.addMirrored(GG.cylinder, 'dark', { pos: [3.1, -0.35, -3.2], rot: [Math.PI / 2, 0, 0], scale: [0.15, 2.2, 0.15] });
      b.addMirrored(GG.torus, 'glow', { pos: [3.1, -0.35, -4.3], scale: 0.22 });
      b.add(GG.cylinder, 'dark', { pos: [0, -0.75, -3.6], rot: [Math.PI / 2, 0, 0], scale: [0.22, 2.0, 0.22] });
      b.add(GG.torus, 'glow', { pos: [0, -0.75, -4.6], scale: 0.3 });
      // deck and hull trims
      b.addMirrored(stripBetween([1.28, 1.17, -0.4], [1.18, 1.17, 2.7], 0.04, 0.03), 'trim');
      b.addMirrored(stripBetween([0.95, 0.4, -3.85], [1.95, 0.4, -2.2], 0.04, 0.03), 'trim');
      // engine block
      for (const [x, y] of [[-1.15, 0], [0, 0.15], [1.15, 0]]) {
        b.add(nacelle(0.5, 1.6, 12), 'dark', { pos: [x, y, 4.1] });
        b.add(GG.sphereLow, 'glow', { pos: [x, y, 4.9], scale: [0.38, 0.38, 0.08] });
      }
    }, { hull: M.enemyHull, plate: M.enemyPlate, dark: M.enemyDark, glow: M.glowOrange, accent: M.glowMagenta, trim: M.trimMagenta });
    for (const [x, y] of [[-1.15, 0], [0, 0.15], [1.15, 0]]) this.addEngine(g, [x, y, 4.95], 0.36, 2.6);

    this.shieldMat = createShieldMaterial(0x7aa8ff, { hexTexture: assets.textures.hex, intensity: 2.4 });
    this.shield = new THREE.Mesh(G.sphere, this.shieldMat);
    this.shield.scale.set(5.6, 2.9, 5.8);
    this.shield.userData.noFlash = true;
    g.add(this.shield);
    return g;
  }

  onSpawn(opts) {
    this.state = 'enter';
    this.holdZ = -(opts.hold ?? this.def.holdDistance);
    this.shieldTimer = rand(0.5, 1.5);
    this.shieldUp = false;
    this.cooldown = this.fireCooldown(this.def.fireInterval) * 0.6;
    this.baseX = this.local.x;
    this.baseY = this.local.y;
    this.pattern = 0;
    this.setShield(false);
  }

  setShield(on) {
    this.shieldUp = on;
    this.invulnerable = on;
    this.shield.visible = on;
    if (on) this.game.audio.play('shield');
  }

  behave(dt) {
    const d = this.def;
    const L = this.local;
    if (this.state === 'enter') {
      L.z = damp(L.z, this.holdZ, 1.1, dt);
      if (Math.abs(L.z - this.holdZ) < 4) this.state = 'hold';
    } else if (this.state === 'hold') {
      L.x = damp(L.x, this.baseX + Math.sin(this.t * 0.5) * 7, 1.5, dt);
      L.y = damp(L.y, this.baseY + Math.sin(this.t * 0.8) * 2.5, 1.5, dt);
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.setShield(!this.shieldUp);
        this.shieldTimer = this.shieldUp ? d.shieldOn : d.shieldOff;
      }
      this.cooldown -= dt;
      if (this.cooldown <= 0 && this.canFire(20)) {
        this.cooldown = this.fireCooldown(d.fireInterval);
        this.firePattern();
      }
      if (this.t > d.lifeTime) {
        this.state = 'exit';
        this.setShield(true);
      }
    } else {
      L.z -= 60 * dt;
      if (L.z < -450) this.despawn();
    }
    this.faceLocal(0, 0, -1);
    this.model.rotation.z = Math.sin(this.t * 0.9) * 0.08;
    this.shieldMat.uniforms.uTime.value = this.t;
  }

  firePattern() {
    const d = this.def;
    this.pattern++;
    this.object.localToWorld(_p.set(0, -0.5, -4.4));
    if (this.pattern % 3 === 0) {
      // vertical fan for variety
      this.fireFan(5, 0.5, { speed: 28, size: 1.1 }, _p, this.game.rail.frame.right);
    } else {
      this.fireFan(d.fanCount, d.fanSpread, { speed: 26, size: 1.1 }, _p);
    }
  }

  explode() {
    const center = this.object.position.clone();
    const effects = this.game.effects;
    effects.explosion(center, { size: 1.6 });
    effects.chainExplosions(
      (out) => out.set(rand(-3, 3), rand(-1, 1), rand(-3, 3)).add(center),
      { count: 4, interval: 0.14, size: 1.3, finalSize: 3.2 },
    );
    this.shield.visible = false;
  }
}

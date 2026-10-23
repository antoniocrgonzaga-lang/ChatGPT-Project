import * as THREE from 'three';
import { Enemy } from '../Enemy.js';

/**
 * Luminous generator powering the Stage 1 barrier. Harmless, but destroying all three
 * before the fork opens the hidden route.
 */
export class Generator extends Enemy {
  constructor(game) {
    super(game, 'generator');
  }

  buildModel(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const g = new THREE.Group();
    this.part(g, G.cylinderHex, M.structure, [0, -2.2, 0], [0, 0, 0], [1.8, 1.2, 1.8]);
    this.part(g, G.cylinder, M.hullDark, [0, 0, 0], [0, 0, 0], [0.5, 4, 0.5]);
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const r = this.part(g, G.torus, M.glowCyan, [0, -0.8 + i * 1.1, 0], [Math.PI / 2, 0, 0], 1.3 - i * 0.2);
      this.rings.push(r);
    }
    this.orb = this.part(g, G.sphere, M.glowCyan, [0, 2.6, 0], [0, 0, 0], 0.9);
    this.halo = new THREE.Sprite(assets.spriteMaterial(0x2de2ff, 0.9));
    this.halo.position.set(0, 2.6, 0);
    this.halo.scale.setScalar(7);
    g.add(this.halo);
    return g;
  }

  onSpawn() {
    this.showIndicator = false;
  }

  behave() {
    for (let i = 0; i < this.rings.length; i++) this.rings[i].rotation.z = this.t * (1 + i);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    this.orb.scale.setScalar(0.8 + pulse * 0.2);
    this.halo.scale.setScalar(6 + pulse * 2);
  }

  getAimPoint(out) {
    return out.copy(this.object.position).addScaledVector(this.game.rail.frame.up, 1);
  }

  explode() {
    this.game.effects.explosion(this.object.position, { size: 2.2, color: 0x2de2ff });
  }
}

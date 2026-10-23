import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { rand } from '../../utils/math.js';

const _toPlayer = new THREE.Vector3();
const _inv = new THREE.Quaternion();
const _muzzle = new THREE.Vector3();

/**
 * Drone Turret "Sentry Pod": bolted to level structures (world mode). Tracks the player and
 * lobs slow, very visible shots while the player approaches. Can be destroyed before passing it.
 */
export class DroneTurret extends Enemy {
  constructor(game) {
    super(game, 'turret');
  }

  buildModel(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const g = new THREE.Group();
    const mats = { hull: M.enemyHull, plate: M.enemyPlate, dark: M.enemyDark, glow: M.glowOrange, accent: M.glowOrange, trim: M.trimMagenta };
    // mount: hex armour base with a lit collar (the long pylon below is a separate, resizable mesh)
    this.mount = new THREE.Group();
    this.mergedModel(this.mount, 'turret-mount-v2', (b, A) => {
      const GG = A.geometries;
      b.add(GG.cylinderHex, 'plate', { pos: [0, -1.55, 0], scale: [1.7, 0.45, 1.7] });
      b.add(GG.cylinderHex, 'dark', { pos: [0, -1.9, 0], scale: [1.3, 0.35, 1.3] });
      b.add(GG.torus, 'trim', { pos: [0, -1.3, 0], rot: [Math.PI / 2, 0, 0], scale: 1.45 });
    }, mats);
    this.strut = this.part(this.mount, G.box, M.enemyDark, [0, -3.2, 0], [0, 0, 0], [0.7, 3, 0.7]);
    g.add(this.mount);

    // head: armoured dome, collar, shrouded twin barrels with muzzle rings and a sensor lens
    this.head = new THREE.Group();
    this.mergedModel(this.head, 'turret-head-v2', (b, A) => {
      const GG = A.geometries;
      b.add(GG.sphere, 'hull', { scale: [1.15, 0.8, 1.15] });
      b.add(GG.torusThick, 'plate', { pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0], scale: 1.05 });
      b.add(GG.box, 'plate', { pos: [0, 0.55, 0.1], scale: [0.5, 0.3, 1.2] });
      for (const s of [-1, 1]) {
        b.add(GG.cylinderHex, 'plate', { pos: [s * 0.4, -0.05, -0.8], rot: [Math.PI / 2, 0, 0], scale: [0.24, 0.8, 0.24] });
        b.add(GG.cylinder, 'dark', { pos: [s * 0.4, -0.05, -1.55], rot: [Math.PI / 2, 0, 0], scale: [0.13, 1.4, 0.13] });
        b.add(GG.torus, 'glow', { pos: [s * 0.4, -0.05, -2.25], scale: 0.17 });
      }
      b.add(GG.sphereLow, 'accent', { pos: [0, 0.22, -1.02], scale: [0.3, 0.2, 0.12] });
    }, mats);
    g.add(this.head);
    return g;
  }

  onSpawn(opts) {
    this.cooldown = this.fireCooldown(this.def.fireInterval) * rand(0.3, 1);
    this.spread = opts.spread ?? 1;
    this.mount.visible = opts.showMount ?? true;
    // optional long pylon reaching down to the ground / structure it is bolted to
    const strut = opts.strut ?? 3;
    this.strut.scale.y = strut;
    this.strut.position.y = -1.7 - strut / 2;
  }

  behave(dt) {
    // aim the head at the player in the turret's local frame
    _toPlayer.subVectors(this.game.player.worldPosition, this.object.position);
    _inv.copy(this.object.quaternion).invert();
    _toPlayer.applyQuaternion(_inv).normalize();
    this.head.quaternion.setFromUnitVectors(FORWARD, _toPlayer);

    this.cooldown -= dt;
    const d = this.def;
    if (this.cooldown <= 0 && this.canFire(d.minRange, d.range)) {
      this.cooldown = this.fireCooldown(d.fireInterval);
      this.head.localToWorld(_muzzle.set(0, 0, -2.2));
      if (this.spread > 1) this.fireFan(this.spread, 0.3, { speed: 26, size: 1.2 }, _muzzle);
      else this.fireAtPlayer({ speed: 26, size: 1.25 }, _muzzle);
    }
  }
}

const FORWARD = new THREE.Vector3(0, 0, -1);

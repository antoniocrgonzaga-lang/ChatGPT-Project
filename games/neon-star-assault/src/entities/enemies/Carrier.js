import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { hullFromOutline, symmetricOutline, stripBetween, nacelle, latheAlongZ } from '../models/shapes.js';
import { rand, damp, randSign } from '../../utils/math.js';

const _v = new THREE.Vector3();

/**
 * Carrier "Hive": slow mid-size ship that launches scout drones. Its bay lights ramp up
 * (and the bay doors open) before each launch so the player can prepare.
 */
export class Carrier extends Enemy {
  constructor(game) {
    super(game, 'carrier');
  }

  buildModel(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const g = new THREE.Group();
    // "Hive": long armoured hull, keel, command tower, twin hangar pods and a triple drive
    this.mergedModel(g, 'carrier-v2', (b, A) => {
      const GG = A.geometries;
      b.add(hullFromOutline(symmetricOutline([[0, 7.4], [1.2, 6.4], [2.3, 3.5], [2.4, -5.5], [1.8, -7.2], [0, -7.2]]), 2.2, 0.3, 2), 'hull');
      b.add(hullFromOutline(symmetricOutline([[0, 5.5], [1.4, 4.0], [1.6, -5.0], [0, -6.0]]), 0.8, 0.15), 'dark', { pos: [0, -1.2, 0] });
      b.add(hullFromOutline(symmetricOutline([[0, 4.6], [1.0, 3.6], [1.5, 0], [1.4, -4.8], [0, -5.4]]), 0.5, 0.1), 'plate', { pos: [0, 1.25, 0] });
      // command tower
      b.add(hullFromOutline(symmetricOutline([[0, 1.2], [0.9, 0.6], [0.9, -1.4], [0, -1.8]]), 1.8, 0.15), 'plate', { pos: [0, 2.3, 3.8] });
      b.add(GG.box, 'accent', { pos: [0, 2.75, 2.58], scale: [1.1, 0.14, 0.06] });
      b.add(GG.cylinder, 'dark', { pos: [0, 3.9, 4.3], scale: [0.06, 1.6, 0.06] });
      b.add(GG.sphereLow, 'accent', { pos: [0, 4.75, 4.3], scale: 0.14 });
      // hangar pods
      b.addMirrored(hullFromOutline([[2.5, 4.2], [3.9, 3.6], [3.9, -4.2], [2.5, -4.6]], 1.5, 0.15), 'plate', { pos: [0, -0.2, 0.2] });
      b.addMirrored(latheAlongZ([[0.4, 0.4], [0.55, 0.2], [0.35, -0.5]], 10), 'dark', { pos: [3.2, -0.2, -4.2] });
      // deck panels and running lights
      for (let i = 0; i < 5; i++) b.add(GG.box, 'dark', { pos: [0, 1.52, -3.5 + i * 1.6], scale: [2.2, 0.05, 0.2] });
      b.addMirrored(stripBetween([2.45, 0.55, -5.3], [2.45, 0.55, 3.3], 0.05, 0.04), 'trim');
      b.addMirrored(stripBetween([1.25, 0.7, -6.3], [2.25, 0.7, -3.6], 0.05, 0.04), 'trim');
      // triple drive
      for (const [x, y] of [[-1.3, 0], [1.3, 0], [0, 0.45]]) {
        b.add(nacelle(0.85, 2.0, 12), 'dark', { pos: [x, y, 7.4] });
        b.add(GG.sphereLow, 'glow', { pos: [x, y, 8.4], scale: [0.65, 0.65, 0.1] });
      }
    }, { hull: M.enemyHull, plate: M.enemyPlate, dark: M.enemyDark, glow: M.glowOrange, accent: M.glowMagenta, trim: M.trimMagenta });
    for (const [x, y] of [[-1.3, 0], [1.3, 0], [0, 0.45]]) this.addEngine(g, [x, y, 8.45], 0.62, 4);

    // bay lights use their own material so their intensity can telegraph the launch
    this.bayMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffaa33) });
    this.bays = [];
    this.doors = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const z = -2.2 + i * 2.6;
        const light = this.part(g, G.box, this.bayMaterial, [s * 4.06, -0.2, z], [0, 0, 0], [0.1, 0.9, 1.6]);
        light.userData.noFlash = true;
        const door = this.part(g, G.box, M.enemyPlate, [s * 4.1, -0.2, z], [0, 0, 0], [0.1, 1.0, 1.7]);
        this.doors.push({ mesh: door, side: s, z });
        this.bays.push(new THREE.Vector3(s * 4.6, -0.2, z));
      }
    }
    return g;
  }

  onSpawn(opts) {
    this.state = 'enter';
    this.holdZ = -(opts.hold ?? this.def.holdDistance);
    this.drift = opts.drift ?? randSign() * rand(2, 4);
    this.launchTimer = this.def.launchInterval * 0.6;
    this.warn = 0;
    this.showIndicator = false;
  }

  behave(dt) {
    const d = this.def;
    const L = this.local;
    if (this.state === 'enter') {
      L.z = damp(L.z, this.holdZ, 0.9, dt);
      if (Math.abs(L.z - this.holdZ) < 6) this.state = 'hold';
    } else if (this.state === 'hold') {
      L.x += this.drift * dt;
      if (Math.abs(L.x) > 20) this.drift *= -1;
      L.y = damp(L.y, Math.sin(this.t * 0.4) * 4 + 3, 1, dt);
      this.launchTimer -= dt;
      if (this.launchTimer <= d.launchWarn && this.launchTimer > 0) this.warn = 1 - this.launchTimer / d.launchWarn;
      if (this.launchTimer <= 0) {
        this.launch();
        this.launchTimer = d.launchInterval / this.game.difficulty.fireRate;
        this.warn = 0;
      }
      if (this.t > d.lifeTime) this.state = 'exit';
    } else {
      L.z -= 40 * dt;
      if (L.z < -450) this.despawn();
    }
    this.faceLocal(0, 0, -1);
    this.model.rotation.z = Math.sin(this.t * 0.6) * 0.05;

    const pulse = this.warn > 0 ? 0.5 + 0.5 * Math.sin(this.t * (10 + this.warn * 20)) : 0;
    const intensity = 0.6 + this.warn * 4 * pulse;
    this.bayMaterial.color.setRGB(1 * intensity, 0.55 * intensity, 0.15 * intensity);
    for (const door of this.doors) door.mesh.position.x = door.side * (4.1 + this.warn * 0.6);
  }

  launch() {
    if (!this.canFire(30)) return;
    const n = this.def.dronesPerLaunch;
    for (let i = 0; i < n; i++) {
      const bay = this.bays[Math.floor(Math.random() * this.bays.length)];
      _v.copy(bay).applyQuaternion(this.localQuat).add(this.local);
      this.game.enemies.spawn('scout', { local: _v.clone(), pattern: 'drone', speed: 45, hpScale: 0.5, score: 50 });
    }
    this.game.effects.burst(this.object.position, { count: 10, color: 0xffaa33, speed: 10, life: 0.4 });
  }

  explode() {
    const center = this.object.position.clone();
    this.game.effects.explosion(center, { size: 2 });
    this.game.effects.chainExplosions(
      (out) => out.set(rand(-4, 4), rand(-1.5, 1.5), rand(-6, 6)).add(center),
      { count: 6, interval: 0.12, size: 1.4, finalSize: 3.8 },
    );
  }
}

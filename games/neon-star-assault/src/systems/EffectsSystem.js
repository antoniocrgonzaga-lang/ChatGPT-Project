import * as THREE from 'three';
import { ParticleSystem } from './ParticleSystem.js';
import { ObjectPool } from '../utils/ObjectPool.js';
import { rand, TAU } from '../utils/math.js';

const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

const FIRE = [0xffffff, 0xffd27a, 0xff8a2a, 0xff3d6e];
const MAX_RINGS = 24;
const MAX_FLASHES = 24;

/**
 * High-level visual effects: explosions, sparks, shockwaves, flashes, debris and flash lights.
 * Everything is pooled; nothing is allocated per frame.
 */
export class EffectsSystem {
  constructor(game, quality) {
    this.game = game;
    this.assets = game.assets;
    this.scene = game.scene;
    this.particles = new ParticleSystem(quality.maxParticles);
    this.scene.add(this.particles.points);
    this.buildDebris(quality.maxDebris);
    this.buildRings();
    this.buildFlashes();
    this.buildLights(quality.flashLights);
    this.delayed = [];
  }

  dispose() {
    this.scene.remove(this.particles.points);
    this.particles.dispose();
    this.scene.remove(this.debrisMesh);
    this.debrisMesh.dispose();
    this.debrisMesh.material.dispose();
    for (const r of [...this.rings.free, ...this.rings.active]) {
      this.scene.remove(r.mesh);
      r.mesh.material.dispose();
    }
    for (const f of [...this.flashes.free, ...this.flashes.active]) {
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
    }
    for (const l of this.lights) this.scene.remove(l.light);
  }

  // ------------------------------------------------------------ construction
  buildDebris(max) {
    this.debrisMax = max;
    this.debris = Array.from({ length: max }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      rot: new THREE.Euler(),
      spin: new THREE.Vector3(),
      scale: 1,
      life: 0,
      maxLife: 1,
      hot: new THREE.Color(),
    }));
    this.debrisCount = 0;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.debrisMesh = new THREE.InstancedMesh(this.assets.geometries.tetra, mat, max);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    this.debrisMesh.setColorAt(0, _c.set(0xffffff));
    this.scene.add(this.debrisMesh);
  }

  buildRings() {
    this.rings = new ObjectPool(
      () => {
        const mesh = new THREE.Mesh(
          this.assets.geometries.ring,
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        mesh.visible = false;
        mesh.renderOrder = 4;
        this.scene.add(mesh);
        return { mesh, t: 0, duration: 1, radius: 1, color: new THREE.Color(), billboard: true };
      },
      { max: MAX_RINGS, onRelease: (r) => (r.mesh.visible = false) },
    );
  }

  buildFlashes() {
    this.flashes = new ObjectPool(
      () => {
        const sprite = new THREE.Sprite(this.assets.spriteMaterial(0xffffff, 1, this.assets.textures.flare));
        sprite.visible = false;
        sprite.renderOrder = 5;
        this.scene.add(sprite);
        return { sprite, t: 0, duration: 0.3, size: 1 };
      },
      { max: MAX_FLASHES, onRelease: (f) => (f.sprite.visible = false) },
    );
  }

  buildLights(count) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffa040, 0, 60, 2);
      this.scene.add(light);
      this.lights.push({ light, t: 0, duration: 0.4, peak: 0 });
    }
    this.nextLight = 0;
  }

  // ------------------------------------------------------------ public API
  /** Generic radial burst of particles. */
  burst(pos, { count = 12, color = 0xffffff, speed = 10, life = 0.5, size = 1, drag = 2, spread = 1, colorVar = 0.15 } = {}) {
    _c.set(color);
    for (let i = 0; i < count; i++) {
      _v.randomDirection().multiplyScalar(speed * rand(0.3, 1) * spread);
      _c2.copy(_c).offsetHSL(rand(-colorVar, colorVar) * 0.2, 0, rand(-colorVar, colorVar)).multiplyScalar(2.2);
      this.particles.emit(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, _c2, life * rand(0.6, 1.2), size * rand(0.6, 1.3), 0, drag);
    }
  }

  spark(pos, color, size = 1) {
    _c.set(color).multiplyScalar(2.5);
    _v.randomDirection().multiplyScalar(3);
    this.particles.emit(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, _c, rand(0.15, 0.3), size, 0, 3);
  }

  /** Small impact: used for every bullet hit so feedback is immediate. */
  hitSpark(pos, color = 0xffffff) {
    this.burst(pos, { count: 6, color, speed: 14, life: 0.22, size: 0.7, drag: 4 });
    this.flash(pos, 1.6, 0.08, color);
  }

  /** Blocked by a shield: bright white/blue sparks. */
  deflect(pos) {
    this.burst(pos, { count: 5, color: 0xa8d8ff, speed: 18, life: 0.2, size: 0.6, drag: 3 });
  }

  explosion(pos, { size = 1, color = null, debris = true, sound = true, shake = true, ring = true, light = true } = {}) {
    const n = Math.round(16 + 26 * size);
    for (let i = 0; i < n; i++) {
      const hex = color && i % 3 === 0 ? color : FIRE[i % FIRE.length];
      _c.set(hex).multiplyScalar(2.4);
      _v.randomDirection().multiplyScalar(rand(4, 16) * Math.sqrt(size));
      this.particles.emit(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, _c, rand(0.3, 0.8) * (0.7 + size * 0.3), rand(1, 2.4) * size, 0.3 * size, 2.5);
    }
    // stylised space smoke: slow, large, dim violet
    const smoke = Math.round(6 + 8 * size);
    for (let i = 0; i < smoke; i++) {
      _c.setRGB(0.25, 0.12, 0.35);
      _v.randomDirection().multiplyScalar(rand(1, 4) * size);
      this.particles.emit(pos.x, pos.y, pos.z, _v.x, _v.y, _v.z, _c, rand(0.8, 1.6), rand(2, 3.5) * size, 5 * size, 1.5);
    }
    this.flash(pos, 5 * size, 0.18 + size * 0.08, color ?? 0xffc080);
    if (ring) this.shockwave(pos, { radius: 5 * size, duration: 0.45 + size * 0.1, color: color ?? 0xff9a50 });
    if (debris) this.spawnDebris(pos, Math.round(4 + size * 6), size);
    if (light) this.flashLight(pos, 18 * size, 0.35 + size * 0.1, color ?? 0xff9040);
    if (sound) this.game.audio.play(size > 1.6 ? 'explosion' : 'explosionSmall', { size });
    if (shake) this.game.cameraRig.shake(Math.min(0.5, 0.06 * size));
    this.game.postfx.boost(Math.min(0.35, 0.05 * size));
    if (size >= 3) this.game.postfx.pulseChromatic(Math.min(0.05, 0.012 * size)); // big blasts only
  }

  /** Several explosions over time — used by heavies and bosses. */
  chainExplosions(getPoint, { count = 6, interval = 0.18, size = 1.2, color = null, finalSize = 0 }) {
    for (let i = 0; i < count; i++) {
      this.delayed.push({ t: i * interval * rand(0.7, 1.3), fn: () => this.explosion(getPoint(_v), { size: size * rand(0.7, 1.2), color, shake: true }) });
    }
    if (finalSize > 0) {
      this.delayed.push({ t: count * interval + 0.1, fn: () => this.explosion(getPoint(_v, true), { size: finalSize, color }) });
    }
  }

  shockwave(pos, { radius = 5, duration = 0.5, color = 0xffffff, normal = null } = {}) {
    const r = this.rings.acquire();
    if (!r) return;
    r.mesh.position.copy(pos);
    r.t = 0;
    r.duration = duration;
    r.radius = radius;
    r.color.set(color).multiplyScalar(2);
    r.billboard = !normal;
    if (normal) r.mesh.quaternion.setFromUnitVectors(Z, normal);
    r.mesh.visible = true;
  }

  flash(pos, size, duration, color = 0xffffff, intensity = 2.5) {
    const f = this.flashes.acquire();
    if (!f) return;
    f.sprite.position.copy(pos);
    f.sprite.material.color.set(color).multiplyScalar(intensity);
    f.t = 0;
    f.duration = duration;
    f.size = size;
    f.sprite.visible = true;
  }

  flashLight(pos, peak, duration, color) {
    if (!this.lights.length) return;
    const l = this.lights[this.nextLight];
    this.nextLight = (this.nextLight + 1) % this.lights.length;
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.t = 0;
    l.duration = duration;
    l.peak = peak;
  }

  spawnDebris(pos, count, size = 1) {
    for (let i = 0; i < count; i++) {
      let idx = this.debrisCount;
      if (idx >= this.debrisMax) idx = Math.floor(Math.random() * this.debrisMax);
      else this.debrisCount++;
      const d = this.debris[idx];
      d.pos.copy(pos);
      d.vel.randomDirection().multiplyScalar(rand(5, 18) * Math.sqrt(size));
      d.vel.add(this.game.rail.velocity);
      d.rot.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
      d.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      d.scale = rand(0.15, 0.45) * size;
      d.life = d.maxLife = rand(0.8, 1.6);
      d.hot.set(Math.random() < 0.5 ? 0xff9a3a : 0xffd080);
    }
  }

  /** Energy bomb: huge ring + particle shell. */
  bombWave(pos) {
    this.shockwave(pos, { radius: 70, duration: 1.1, color: 0xff3dd8 });
    this.shockwave(pos, { radius: 45, duration: 0.8, color: 0x39f0ff });
    this.flash(pos, 40, 0.5, 0xffb0ff);
    this.flashLight(pos, 60, 0.9, 0xff60e0);
    for (let i = 0; i < 160; i++) {
      _v.randomDirection();
      _c.set(i % 2 ? 0xff3dd8 : 0x39f0ff).multiplyScalar(2.5);
      const sp = rand(35, 60);
      this.particles.emit(pos.x, pos.y, pos.z, _v.x * sp, _v.y * sp, _v.z * sp, _c, rand(0.6, 1.1), rand(1.5, 3), 0.5, 1.2);
    }
  }

  /** Charged-shot style trail puffs, also used by homing projectiles and engines. */
  trail(pos, color, size = 1, life = 0.3) {
    _c.set(color).multiplyScalar(1.6);
    this.particles.emit(pos.x, pos.y, pos.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), _c, life, size, 0, 1);
  }

  // ------------------------------------------------------------ update
  update(dt) {
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.delayed.splice(i, 1);
        d.fn();
      }
    }
    this.particles.update(dt);
    this.updateDebris(dt);
    this.updateRings(dt);
    this.updateFlashes(dt);
    for (const l of this.lights) {
      l.t += dt;
      const k = Math.max(0, 1 - l.t / l.duration);
      l.light.intensity = l.peak * k * k * 40;
    }
  }

  updateDebris(dt) {
    let n = this.debrisCount;
    for (let i = 0; i < n; ) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) {
        n--;
        this.debris[i] = this.debris[n];
        this.debris[n] = d;
        continue;
      }
      d.pos.addScaledVector(d.vel, dt);
      d.rot.x += d.spin.x * dt;
      d.rot.y += d.spin.y * dt;
      d.rot.z += d.spin.z * dt;
      const t = d.life / d.maxLife;
      _m.compose(d.pos, _q.setFromEuler(d.rot), _s.setScalar(d.scale));
      this.debrisMesh.setMatrixAt(i, _m);
      _c.setRGB(0.05, 0.05, 0.07).lerp(_c2.copy(d.hot).multiplyScalar(3), t * t);
      this.debrisMesh.setColorAt(i, _c);
      i++;
    }
    this.debrisCount = n;
    this.debrisMesh.count = n;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  updateRings(dt) {
    const cam = this.game.camera;
    const list = this.rings.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      r.t += dt;
      const k = r.t / r.duration;
      if (k >= 1) {
        this.rings.release(r);
        continue;
      }
      const ease = 1 - Math.pow(1 - k, 3);
      r.mesh.scale.setScalar(0.5 + r.radius * ease);
      if (r.billboard) r.mesh.quaternion.copy(cam.quaternion);
      r.mesh.material.color.copy(r.color).multiplyScalar(1 - k);
    }
  }

  updateFlashes(dt) {
    const list = this.flashes.active;
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.t += dt;
      const k = f.t / f.duration;
      if (k >= 1) {
        this.flashes.release(f);
        continue;
      }
      f.sprite.scale.setScalar(f.size * (0.6 + k * 0.8));
      f.sprite.material.opacity = 1 - k;
    }
  }

  clear() {
    this.delayed.length = 0;
    this.particles.clear();
    this.debrisCount = 0;
    this.debrisMesh.count = 0;
    this.rings.releaseAll();
    this.flashes.releaseAll();
    for (const l of this.lights) {
      l.peak = 0;
      l.light.intensity = 0;
    }
  }
}

const Z = new THREE.Vector3(0, 0, 1);

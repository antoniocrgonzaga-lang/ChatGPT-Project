import * as THREE from 'three';
import { CAMERA } from '../config/gameConfig.js';
import { damp, clamp } from '../utils/math.js';

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

/**
 * Chase camera. Works in rail-local space so the lag never turns into "falling behind" the rail;
 * adds banking, FOV kicks and trauma-based screen shake.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.local = new THREE.Vector3(0, CAMERA.offsetY, CAMERA.offsetZ);
    this.lookLocal = new THREE.Vector3(0, 0, -CAMERA.lookAhead);
    this.roll = 0;
    this.trauma = 0;
    this.fovKick = 0;
    this.fovBase = CAMERA.fov;
    this.extraFov = 0;
    this.speedFov = 0;
    this.smoothSpeedFov = 0;
    this.time = 0;
    this.mode = 'chase'; // chase | showcase | cutscene
    this.showcaseAngle = 0;
    this.cutscene = null;
  }

  reset() {
    this.local.set(0, CAMERA.offsetY, CAMERA.offsetZ);
    this.lookLocal.set(0, 0, -CAMERA.lookAhead);
    this.roll = 0;
    this.trauma = 0;
    this.fovKick = 0;
    this.extraFov = 0;
    this.mode = 'chase';
  }

  shake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  kickFov(amount) {
    this.fovKick = Math.max(this.fovKick, amount);
  }

  update(dt, rig, player) {
    this.time += dt;
    if (this.mode === 'showcase') return this.updateShowcase(dt, rig);
    if (this.mode === 'cutscene' && this.cutscene) return this.updateCutscene(dt);

    const p = player.local;
    const tx = p.x * CAMERA.follow;
    const ty = p.y * CAMERA.follow + CAMERA.offsetY;
    this.local.x = damp(this.local.x, tx, CAMERA.lag, dt);
    this.local.y = damp(this.local.y, ty, CAMERA.lag, dt);
    this.local.z = damp(this.local.z, CAMERA.offsetZ, CAMERA.lag, dt);
    this.lookLocal.x = damp(this.lookLocal.x, p.x * 0.8, CAMERA.lag * 1.3, dt);
    this.lookLocal.y = damp(this.lookLocal.y, p.y * 0.8, CAMERA.lag * 1.3, dt);

    const targetRoll = -player.velocity.x * CAMERA.rollFactor * 0.1;
    this.roll = damp(this.roll, targetRoll, 4, dt);

    rig.localToWorld(_pos.copy(this.local));
    rig.localToWorld(_look.copy(this.lookLocal));
    this.applyShake(_pos, dt);

    this.camera.position.copy(_pos);
    _up.set(0, 1, 0).applyQuaternion(rig.quaternion);
    _axis.subVectors(_look, _pos).normalize();
    _q.setFromAxisAngle(_axis, this.roll);
    _up.applyQuaternion(_q);
    this.camera.up.copy(_up);
    this.camera.lookAt(_look);

    this.updateFov(dt);
  }

  applyShake(pos, dt) {
    this.trauma = Math.max(0, this.trauma - CAMERA.shakeDecay * dt);
    const s = this.trauma * this.trauma * CAMERA.shakeMax;
    if (s <= 0.0001) return;
    const t = this.time * 38;
    pos.x += (Math.sin(t * 1.1) + Math.sin(t * 2.3)) * 0.5 * s;
    pos.y += (Math.sin(t * 1.7 + 1.3) + Math.sin(t * 2.9)) * 0.5 * s;
    pos.z += Math.sin(t * 1.3 + 2.1) * 0.3 * s;
  }

  updateFov(dt) {
    this.fovKick = damp(this.fovKick, 0, 5, dt);
    this.smoothSpeedFov = damp(this.smoothSpeedFov, this.mode === 'chase' ? this.speedFov : 0, 2, dt);
    const fov = this.fovBase + this.extraFov + this.fovKick + this.smoothSpeedFov;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Slow orbit around the player ship for the title screen. */
  updateShowcase(dt, rig) {
    this.showcaseAngle += dt * 0.18;
    const a = this.showcaseAngle;
    _pos.set(Math.sin(a) * 9, 2.2 + Math.sin(a * 0.7) * 1.2, Math.cos(a) * 9);
    rig.localToWorld(_pos);
    // aim below the ship so it sits in the upper part of the frame, clear of the title menu
    rig.localToWorld(_look.set(0, 0.3 - CAMERA.showcaseLift, 0));
    this.camera.position.copy(_pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(_look);
    this.updateFov(dt);
  }

  /** Cutscene: callback fills position/target each frame. */
  startCutscene(fn) {
    this.mode = 'cutscene';
    this.cutscene = fn;
  }

  updateCutscene(dt) {
    this.cutscene(dt, _pos, _look);
    this.applyShake(_pos, dt);
    this.camera.position.copy(_pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(_look);
    this.updateFov(dt);
  }
}

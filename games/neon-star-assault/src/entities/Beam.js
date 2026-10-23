import * as THREE from 'three';
import { segmentPointDistSq } from '../utils/math.js';

/**
 * Additive material whose brightness falls off towards the cylinder's silhouette, so a beam reads
 * as a soft glowing line instead of a flat tube (matters most when it crosses close to the camera).
 * Exposes `color` like the built-in materials.
 */
function softBeamMaterial(power) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = abs(dot(normalize(vNormal), normalize(vView)));
        gl_FragColor = vec4(uColor * pow(f, ${power.toFixed(1)}), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mat.color = mat.uniforms.uColor.value;
  return mat;
}

const _mid = new THREE.Vector3();
const _dir = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

/**
 * Telegraphed energy beam: a thin flickering warning line first, then the damaging beam.
 * Endpoints are rail-local when `local` is true (boss beams) or world positions otherwise.
 */
export class Beam {
  constructor(assets) {
    this.group = new THREE.Group();
    this.coreMat = softBeamMaterial(1.2);
    this.glowMat = softBeamMaterial(3.0);
    this.core = new THREE.Mesh(assets.geometries.cylinder, this.coreMat);
    this.glow = new THREE.Mesh(assets.geometries.cylinder, this.glowMat);
    this.group.add(this.core, this.glow);
    this.group.visible = false;
    this.startLocal = new THREE.Vector3();
    this.endLocal = new THREE.Vector3();
    this.start = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.color = new THREE.Color();
    this.active = false;
  }

  /** `intensity` scales the look only (bright hues such as green bloom far more than red). */
  launch({ start, end, local = false, warn = 1.2, fire = 0.9, radius = 1.2, color = 0xff2a60, damage = 1, sweep = null, intensity = 1 }) {
    this.intensity = intensity;
    this.startLocal.copy(start);
    this.endLocal.copy(end);
    this.local = local;
    this.warnTime = warn;
    this.fireTime = fire;
    this.radius = radius;
    this.damage = damage;
    this.color.set(color);
    this.sweep = sweep; // optional (t, startOut, endOut) animation in the same space as start/end
    this.t = 0;
    this.active = true;
    this.firing = false;
    this.soundPlayed = false;
    this.group.visible = true;
  }

  get done() {
    return this.t >= this.warnTime + this.fireTime + 0.25;
  }

  update(dt, rig, audio, camera = null) {
    this.t += dt;
    if (this.sweep) this.sweep(this.t, this.startLocal, this.endLocal);
    if (this.local) {
      this.start.copy(this.startLocal).applyMatrix4(rig.matrixWorld);
      this.end.copy(this.endLocal).applyMatrix4(rig.matrixWorld);
    } else {
      this.start.copy(this.startLocal);
      this.end.copy(this.endLocal);
    }

    const inWarn = this.t < this.warnTime;
    const fireT = this.t - this.warnTime;
    this.firing = !inWarn && fireT < this.fireTime;
    if (this.firing && !this.soundPlayed) {
      this.soundPlayed = true;
      audio.play('beam');
    }

    let r;
    let coreBright;
    let glowBright;
    if (inWarn) {
      const k = this.t / this.warnTime;
      const blink = Math.sin(this.t * (18 + k * 30)) > 0 ? 1 : 0.35;
      r = 0.06 + k * 0.1;
      coreBright = 1.2 * blink;
      glowBright = 0.3 * blink;
    } else if (this.firing) {
      const flick = 0.9 + Math.random() * 0.2;
      const grow = Math.min(1, fireT / 0.08);
      r = this.radius * grow * flick;
      coreBright = 2;
      glowBright = 0.7;
    } else {
      const k = Math.max(0, 1 - (fireT - this.fireTime) / 0.25);
      r = this.radius * k;
      coreBright = 2 * k;
      glowBright = k;
    }

    // a beam that ends up right in front of the lens (after the ship passes it) would flood the
    // screen through bloom: fade its look (not its collision) when it is very close to the camera
    if (camera) {
      const camDist = Math.sqrt(segmentPointDistSq(this.start, this.end, camera.position));
      // long beams crossing the whole view (world-space salvos and grids) need a wide fade margin
      const near = Math.min(1, Math.max(0.03, (camDist - 3) / 22));
      coreBright *= near;
      glowBright *= near * near;
    }

    _mid.addVectors(this.start, this.end).multiplyScalar(0.5);
    _dir.subVectors(this.end, this.start);
    const len = _dir.length();
    this.group.position.copy(_mid);
    this.group.quaternion.setFromUnitVectors(Y, _dir.normalize());
    this.core.scale.set(Math.max(r * 0.45, 0.03), len, Math.max(r * 0.45, 0.03));
    this.glow.scale.set(Math.max(r * 1.3, 0.08), len, Math.max(r * 1.3, 0.08));
    this.coreMat.color.copy(this.color).lerp(WHITE, 0.6).multiplyScalar(coreBright * this.intensity);
    this.glowMat.color.copy(this.color).multiplyScalar(glowBright * this.intensity);
  }

  hits(point, radius) {
    if (!this.firing) return false;
    const r = this.radius * 0.8 + radius;
    return segmentPointDistSq(this.start, this.end, point) <= r * r;
  }

  stop() {
    this.active = false;
    this.group.visible = false;
  }
}

const WHITE = new THREE.Color(1, 1, 1);

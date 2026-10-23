import * as THREE from 'three';
import { rand, pick, damp } from '../utils/math.js';
import { bakeNebulaCubemap, NebulaSky } from './NebulaSkybox.js';

const _tint = new THREE.Color();

const starVertex = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    float tw = 0.65 + 0.35 * sin(uTime * (1.0 + aPhase * 2.0) + aPhase * 30.0);
    vColor = aColor * tw;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }`;

const starFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 2.0);
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

/**
 * Background layers that follow the camera position (infinitely far away):
 * an optional baked nebula skybox, a twinkling star sphere and nebula billboards.
 * Rebuilt when quality or stage palette changes; the skybox bake is cached per preset/size.
 */
export class SkyDome {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'Sky';
    game.scene.add(this.group);
    this.stars = null;
    this.nebulae = [];
    this.skybox = null;
    this.bakes = new Map(); // "presetId:size" -> WebGLCubeRenderTarget
    this.mood = { tint: new THREE.Color(1, 1, 1), intensity: 1 };
    this.moodTarget = { tint: new THREE.Color(1, 1, 1), intensity: 1 };
    this.flashAmount = 0;
    this.flashColor = new THREE.Color(1, 1, 1);
  }

  build(quality, palette) {
    this.clear();
    this.buildSkybox(quality, palette.skybox);
    const count = quality.stars;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const c = new THREE.Color();
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(1800);
      pos.set([v.x, v.y, v.z], i * 3);
      c.set(pick(palette.stars)).multiplyScalar(rand(0.5, 1.6));
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = Math.random() < 0.03 ? rand(3, 4.5) : rand(1, 2.4);
      phase[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: this.game.renderer.getPixelRatio() } },
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, this.starMaterial);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -10;
    this.group.add(this.stars);

    // distant nebula billboards
    const textures = this.game.assets.textures.nebula;
    for (let i = 0; i < palette.nebulaCount; i++) {
      const mat = new THREE.SpriteMaterial({
        map: pick(textures),
        color: new THREE.Color(pick(palette.nebula)).multiplyScalar(rand(0.25, 0.55)),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        rotation: rand(0, Math.PI * 2),
      });
      const sprite = new THREE.Sprite(mat);
      v.randomDirection();
      v.y *= 0.5;
      v.normalize().multiplyScalar(1500);
      sprite.position.copy(v);
      sprite.scale.setScalar(rand(700, 1500));
      sprite.renderOrder = -9;
      this.group.add(sprite);
      this.nebulae.push(sprite);
    }
  }

  buildSkybox(quality, preset) {
    if (!preset) {
      if (this.skybox) this.group.remove(this.skybox.mesh);
      return;
    }
    const key = `${preset.id}:${quality.skyboxSize}`;
    if (!this.bakes.has(key)) {
      // only one resolution per preset is kept around
      for (const [k, rt] of this.bakes) {
        if (k.startsWith(`${preset.id}:`)) {
          rt.dispose();
          this.bakes.delete(k);
        }
      }
      this.bakes.set(key, bakeNebulaCubemap(this.game.renderer, preset, quality.skyboxSize));
    }
    const tex = this.bakes.get(key).texture;
    if (!this.skybox) this.skybox = new NebulaSky(tex);
    else this.skybox.texture = tex;
    this.skybox.mesh.rotation.set(0, 0, 0);
    this.group.add(this.skybox.mesh);
    this.setMood(null, true);
  }

  /** Section mood: { tint, intensity } blended over a couple of seconds (null = neutral). */
  setMood(mood, immediate = false) {
    this.moodTarget.tint.set(mood?.tint ?? 0xffffff);
    this.moodTarget.intensity = mood?.intensity ?? 1;
    if (immediate) {
      this.mood.tint.copy(this.moodTarget.tint);
      this.mood.intensity = this.moodTarget.intensity;
    }
  }

  /** Lights the nebula from within (lightning). */
  flash(amount, color = 0xffffff) {
    this.flashAmount = Math.max(this.flashAmount, amount);
    this.flashColor.set(color);
  }

  update(dt, camera) {
    this.group.position.copy(camera.position);
    if (this.starMaterial) this.starMaterial.uniforms.uTime.value += dt;
    if (this.skybox && this.skybox.mesh.parent) {
      const k = 1 - Math.exp(-1.2 * dt);
      this.mood.tint.lerp(this.moodTarget.tint, k);
      this.mood.intensity = damp(this.mood.intensity, this.moodTarget.intensity, 1.2, dt);
      this.flashAmount = damp(this.flashAmount, 0, 6, dt);
      _tint.copy(this.mood.tint).lerp(this.flashColor, Math.min(1, this.flashAmount * 0.6));
      this.skybox.tint.copy(_tint);
      this.skybox.intensity = this.mood.intensity * (1 + this.flashAmount);
      this.skybox.mesh.rotation.y += dt * 0.004; // barely perceptible drift
    }
  }

  clear() {
    if (this.stars) {
      this.group.remove(this.stars);
      this.stars.geometry.dispose();
      this.starMaterial.dispose();
      this.stars = null;
    }
    for (const n of this.nebulae) {
      this.group.remove(n);
      n.material.dispose();
    }
    this.nebulae = [];
  }
}

/**
 * Near-field dust and speed streaks in rail-local space. Recycled forever: particles that
 * pass the camera wrap back to the far end, giving constant parallax at any rail speed.
 */
export class SpaceDust {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.rig.add(this.group);
    this.points = null;
    this.streaks = null;
  }

  build(count, color) {
    this.dispose();
    this.count = count;
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.respawn(i, rand(-320, 20));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.PointsMaterial({
      color: new THREE.Color(color).multiplyScalar(1.5),
      map: this.game.assets.textures.glow,
      size: 0.45,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.streakCount = Math.floor(count / 5);
    this.streakPos = new Float32Array(this.streakCount * 6);
    this.streakBase = new Float32Array(this.streakCount * 3);
    for (let i = 0; i < this.streakCount; i++) this.respawnStreak(i, rand(-300, 20));
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.streakMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.2),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.streaks = new THREE.LineSegments(sgeo, this.streakMaterial);
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);
  }

  setColor(color) {
    if (!this.material) return;
    this.material.color.set(color).multiplyScalar(1.5);
    this.streakMaterial.color.set(color).multiplyScalar(1.2);
  }

  respawn(i, z) {
    let x;
    let y;
    do {
      x = rand(-70, 70);
      y = rand(-45, 45);
    } while (Math.abs(x) < 4 && Math.abs(y) < 3); // keep the ship's nose clear
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
  }

  respawnStreak(i, z) {
    this.streakBase[i * 3] = rand(-50, 50);
    this.streakBase[i * 3 + 1] = rand(-35, 35);
    this.streakBase[i * 3 + 2] = z;
  }

  update(dt, speed, boost = 0) {
    if (!this.points) return;
    const dz = speed * dt;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3 + 2;
      this.pos[k] += dz;
      if (this.pos[k] > 20) this.respawn(i, this.pos[k] - 340);
    }
    this.points.geometry.attributes.position.needsUpdate = true;

    const len = Math.min(18, speed * 0.06 + boost * 10);
    for (let i = 0; i < this.streakCount; i++) {
      const b = i * 3;
      this.streakBase[b + 2] += dz * 1.4;
      if (this.streakBase[b + 2] > 20) this.respawnStreak(i, this.streakBase[b + 2] - 320);
      const o = i * 6;
      this.streakPos[o] = this.streakPos[o + 3] = this.streakBase[b];
      this.streakPos[o + 1] = this.streakPos[o + 4] = this.streakBase[b + 1];
      this.streakPos[o + 2] = this.streakBase[b + 2];
      this.streakPos[o + 5] = this.streakBase[b + 2] - len;
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
    this.streakMaterial.opacity = Math.min(0.9, Math.max(0, (speed - 30) / 60) + boost);
  }

  dispose() {
    if (!this.points) return;
    this.group.remove(this.points, this.streaks);
    this.points.geometry.dispose();
    this.streaks.geometry.dispose();
    this.material.dispose();
    this.streakMaterial.dispose();
    this.points = this.streaks = null;
  }
}

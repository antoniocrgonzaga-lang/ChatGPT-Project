import * as THREE from 'three';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uScale;
  varying vec3 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 300.0);
    gl_Position = projectionMatrix * mv;
  }`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 1.6);
    gl_FragColor = vec4(vColor * a, 1.0);
  }`;

/**
 * CPU-simulated additive point particles in a single BufferGeometry.
 * Live particles are kept densely packed (swap-remove) so only `count` vertices are drawn.
 */
export class ParticleSystem {
  constructor(max) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.baseCol = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.gravity = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setViewportHeight(heightPx, fovDeg) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  emit(x, y, z, vx, vy, vz, color, life, size0, size1 = 0, drag = 0, gravity = 0) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max); // overwrite a random one when full
    else this.count++;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.baseCol[i3] = color.r;
    this.baseCol[i3 + 1] = color.g;
    this.baseCol[i3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size0;
    this.size1[i] = size1;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
  }

  update(dt) {
    let n = this.count;
    for (let i = 0; i < n; ) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        n--;
        this.copyParticle(n, i);
        continue;
      }
      const i3 = i * 3;
      const k = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.gravity[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i]; // 1 -> 0
      const fade = t * t * (3 - 2 * t);
      this.col[i3] = this.baseCol[i3] * fade;
      this.col[i3 + 1] = this.baseCol[i3 + 1] * fade;
      this.col[i3 + 2] = this.baseCol[i3 + 2] * fade;
      this.size[i] = this.size1[i] + (this.size0[i] - this.size1[i]) * t;
      i++;
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    if (n > 0) {
      this.posAttr.clearUpdateRanges();
      this.posAttr.addUpdateRange(0, n * 3);
      this.colAttr.clearUpdateRanges();
      this.colAttr.addUpdateRange(0, n * 3);
      this.sizeAttr.clearUpdateRanges();
      this.sizeAttr.addUpdateRange(0, n);
      this.posAttr.needsUpdate = this.colAttr.needsUpdate = this.sizeAttr.needsUpdate = true;
    }
  }

  copyParticle(from, to) {
    if (from === to) return;
    const f3 = from * 3;
    const t3 = to * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[t3 + k] = this.pos[f3 + k];
      this.vel[t3 + k] = this.vel[f3 + k];
      this.col[t3 + k] = this.col[f3 + k];
      this.baseCol[t3 + k] = this.baseCol[f3 + k];
    }
    this.size[to] = this.size[from];
    this.size0[to] = this.size0[from];
    this.size1[to] = this.size1[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.drag[to] = this.drag[from];
    this.gravity[to] = this.gravity[from];
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

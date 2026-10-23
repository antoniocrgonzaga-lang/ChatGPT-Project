import * as THREE from 'three';

/*
 * Stylised black hole: a pitch-black event horizon, an animated accretion disk (white-blue
 * inner edge -> gold -> orange, faster near the centre, brighter on the approaching side),
 * a lensed "Einstein ring" halo and a thin photon ring. Used in the Stage 3 sky, inside the
 * Eclipse Sovereign boss, as gravity wells and in the final cutscene.
 */

const diskVertex = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const diskFragment = /* glsl */ `
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  uniform float uIntensity;
  uniform vec3 uHot;
  uniform vec3 uMid;
  uniform vec3 uCool;
  varying vec2 vPos;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    float r = length(vPos);
    float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
    float ang = atan(vPos.y, vPos.x);
    // differential rotation: inner gas orbits faster (cos/sin avoid the atan seam)
    float swirl = ang + uTime * (0.9 / (0.25 + t));
    vec2 q = vec2(cos(swirl), sin(swirl)) * (1.5 + t * 3.0);
    float n = fbm(q * 1.6 + t * 5.0);
    float streaks = 0.6 + 0.4 * sin(t * 46.0 + n * 7.0);
    vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.3, t));
    col = mix(col, uCool, smoothstep(0.3, 1.0, t));
    float fade = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.55, 1.0, t));
    float doppler = 0.55 + 0.45 * cos(ang - 0.7);
    float a = fade * (0.3 + 0.7 * n) * streaks * doppler;
    gl_FragColor = vec4(col * a * uIntensity, 1.0);
  }`;

const lensFragment = /* glsl */ `
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  varying vec2 vPos;
  void main() {
    float r = length(vPos) / uRadius;
    float ang = atan(vPos.y, vPos.x);
    // bright photon ring hugging the horizon + the lensed far side of the disk bending over it
    float photon = exp(-pow((r - 1.04) / 0.03, 2.0)) * 1.3;
    float arc = exp(-pow((r - 1.35) / 0.2, 2.0)) * (0.55 + 0.45 * sin(ang)) * 0.55;
    float haze = exp(-(r - 1.0) * 3.0) * 0.12;
    float flick = 0.9 + 0.1 * sin(ang * 7.0 + uTime * 2.3);
    vec3 c = uEdge * photon + uColor * (arc + haze);
    gl_FragColor = vec4(c * flick * uIntensity, 1.0);
  }`;

const _q = new THREE.Quaternion();

export class BlackHole {
  /**
   * @param {object} opts radius, diskInner, diskOuter (world units), tilt (disk inclination),
   *                      intensity, colors { hot, mid, cool, edge }
   */
  constructor(assets, { radius = 1, diskInner = 1.4, diskOuter = 3.2, tilt = 1.2, intensity = 1, colors = {} } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'BlackHole';
    this.time = Math.random() * 10;
    const hot = new THREE.Color(colors.hot ?? 0xe8f6ff).multiplyScalar(2.2);
    const mid = new THREE.Color(colors.mid ?? 0xffb040).multiplyScalar(1.7);
    const cool = new THREE.Color(colors.cool ?? 0xff5a1a).multiplyScalar(1.1);
    const edge = new THREE.Color(colors.edge ?? 0xf0f8ff).multiplyScalar(1.8);

    this.horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    this.horizon = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), this.horizonMat);
    this.group.add(this.horizon);

    this.diskMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uInner: { value: diskInner },
        uOuter: { value: diskOuter },
        uIntensity: { value: intensity },
        uHot: { value: hot },
        uMid: { value: mid },
        uCool: { value: cool },
      },
      vertexShader: diskVertex,
      fragmentShader: diskFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.disk = new THREE.Mesh(new THREE.RingGeometry(diskInner, diskOuter, 160, 2), this.diskMat);
    this.disk.rotation.x = tilt;
    this.group.add(this.disk);

    this.lensMat = new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: radius },
        uIntensity: { value: intensity },
        uTime: { value: 0 },
        uColor: { value: mid.clone().multiplyScalar(0.6) },
        uEdge: { value: edge },
      },
      vertexShader: diskVertex,
      fragmentShader: lensFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.lens = new THREE.Mesh(new THREE.RingGeometry(radius * 1.0, radius * 2.3, 128, 1), this.lensMat);
    this.group.add(this.lens);
    this.baseIntensity = intensity;
  }

  /** Render order helpers for use inside the sky (behind everything else). */
  setRenderOrder(base) {
    this.horizon.renderOrder = base;
    this.lens.renderOrder = base + 1;
    this.disk.renderOrder = base + 2;
  }

  setIntensity(v) {
    this.diskMat.uniforms.uIntensity.value = v;
    this.lensMat.uniforms.uIntensity.value = v;
  }

  update(dt, camera, spin = 1) {
    this.time += dt * spin;
    this.diskMat.uniforms.uTime.value = this.time;
    this.lensMat.uniforms.uTime.value = this.time;
    // the lensing halo always faces the camera
    this.group.getWorldQuaternion(_q).invert();
    this.lens.quaternion.copy(_q).multiply(camera.quaternion);
  }

  dispose() {
    this.horizon.geometry.dispose();
    this.horizonMat.dispose();
    this.disk.geometry.dispose();
    this.diskMat.dispose();
    this.lens.geometry.dispose();
    this.lensMat.dispose();
  }
}

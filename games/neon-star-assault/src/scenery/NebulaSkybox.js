import * as THREE from 'three';

/*
 * Procedural nebula skybox.
 * A heavy fragment shader (domain-warped fbm gas, dust lanes, filaments, galactic band,
 * thousands of stars, optionally a whole spiral galaxy) is rendered ONCE into a cube render target
 * at load time. In game the sky is a cheap cubemap lookup with a tint/intensity that the stage can animate.
 */

const MAX_REGIONS = 3;

const bakeVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const bakeFragment = /* glsl */ `
  precision highp float;
  varying vec3 vDir;

  uniform float uSeed;
  uniform float uPixelAngle;
  uniform vec3 uSpaceTop;
  uniform vec3 uSpaceBottom;
  uniform vec3 uBandNormal;
  uniform vec3 uBandColor;
  uniform vec3 uFilamentColor;
  uniform float uDust;
  uniform vec3 uRegionDir[${MAX_REGIONS}];
  uniform vec2 uRegionCone[${MAX_REGIONS}];      // (cos outer, cos inner)
  uniform float uRegionStrength[${MAX_REGIONS}];
  uniform vec3 uRegionDeep[${MAX_REGIONS}];
  uniform vec3 uRegionMid[${MAX_REGIONS}];
  uniform vec3 uRegionHot[${MAX_REGIONS}];
  uniform vec3 uRegionCore[${MAX_REGIONS}];
  uniform float uGalaxyStrength;   // 0 = no galaxy
  uniform vec3 uGalaxyDir;
  uniform vec3 uGalaxyE1;
  uniform vec3 uGalaxyE2;
  uniform float uGalaxySize;       // angular radius (tangent) of the disk
  uniform float uGalaxyAngle;      // position angle of the major axis
  uniform float uGalaxyTilt;       // minor/major axis ratio (inclination)
  uniform float uGalaxyPitch;      // how tightly the arms wind
  uniform vec3 uGalaxyCore;
  uniform vec3 uGalaxyArm;
  uniform vec3 uGalaxyHII;

  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = hash13(i);
    float b = hash13(i + vec3(1.0, 0.0, 0.0));
    float c = hash13(i + vec3(0.0, 1.0, 0.0));
    float d = hash13(i + vec3(1.0, 1.0, 0.0));
    float e = hash13(i + vec3(0.0, 0.0, 1.0));
    float f1 = hash13(i + vec3(1.0, 0.0, 1.0));
    float g = hash13(i + vec3(0.0, 1.0, 1.0));
    float h = hash13(i + vec3(1.0, 1.0, 1.0));
    return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
  }

  const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

  float fbm(vec3 p, int octaves) {
    float s = 0.0;
    float a = 0.5;
    float n = 0.0;
    for (int i = 0; i < 7; i++) {
      if (i >= octaves) break;
      s += a * vnoise(p);
      n += a;
      p = ROT * p * 2.03;
      a *= 0.5;
    }
    return s / n;
  }

  float ridged(vec3 p, int octaves) {
    float s = 0.0;
    float a = 0.5;
    float n = 0.0;
    for (int i = 0; i < 6; i++) {
      if (i >= octaves) break;
      float r = 1.0 - abs(vnoise(p) * 2.0 - 1.0);
      s += a * r * r;
      n += a;
      p = ROT * p * 2.07;
      a *= 0.5;
    }
    return s / n;
  }

  // One layer of point stars. Cells live in 3D; stars are anti-aliased to at least ~1 pixel.
  vec3 stars(vec3 d, float scale, float threshold, float sizePx, float brightness) {
    vec3 p = d * scale;
    vec3 id = floor(p);
    vec3 f = fract(p) - 0.5;
    float h = hash13(id + uSeed);
    if (h < threshold) return vec3(0.0);
    vec3 offset = vec3(hash13(id + 1.7), hash13(id + 3.1), hash13(id + 5.3)) - 0.5;
    float dist = length(f - offset * 0.5);
    float sigma = max(sizePx, 0.7) * uPixelAngle * scale;
    float k = exp(-dist * dist / (sigma * sigma));
    float power = pow((h - threshold) / (1.0 - threshold), 2.0);
    float temp = hash13(id + 9.7);
    vec3 tint = temp < 0.33 ? vec3(0.7, 0.8, 1.0) : temp < 0.66 ? vec3(1.0, 0.92, 0.98) : vec3(1.0, 0.75, 0.9);
    return tint * k * (0.25 + power) * brightness;
  }

  // A whole spiral galaxy seen from outside: bright bulge, two logarithmic arms with clumpy star
  // clouds and pink H II knots, dust lanes trailing the arms, faint halo. Returns its light and how
  // much of the sky behind it is covered (to dim the background stars).
  vec3 galaxy(vec3 d, out float cover) {
    cover = 0.0;
    float facing = dot(d, uGalaxyDir);
    if (uGalaxyStrength <= 0.0 || facing <= 0.2) return vec3(0.0);
    vec2 p = vec2(dot(d, uGalaxyE1), dot(d, uGalaxyE2)) / facing / uGalaxySize;
    float ca = cos(uGalaxyAngle);
    float sa = sin(uGalaxyAngle);
    p = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y);
    p.y /= uGalaxyTilt;
    float r = length(p);
    if (r > 1.7) return vec3(0.0);
    float th = atan(p.y, p.x);
    float warp = fbm(vec3(p * 2.6, uSeed * 1.7), 4);
    float swirl = th - log(max(r, 0.015)) * uGalaxyPitch + warp * 1.6;
    float arms = pow(0.5 + 0.5 * cos(2.0 * swirl), 2.5);
    float disk = exp(-r * 2.9);
    float bulge = exp(-r * r * 160.0);
    float inner = exp(-r * 9.0);
    float clumps = smoothstep(0.42, 0.86, fbm(vec3(p * 13.0, uSeed + 3.0), 5));
    float lane = pow(0.5 + 0.5 * cos(2.0 * swirl - 0.85), 7.0) * smoothstep(0.04, 0.22, r);
    float laneNoise = 0.6 + 0.4 * fbm(vec3(p * 9.0, uSeed + 8.0), 4);
    vec3 col = uGalaxyArm * disk * (0.18 + arms * (0.8 + clumps * 1.3));
    col += uGalaxyHII * disk * arms * pow(clumps, 2.5) * 1.6 * smoothstep(0.12, 0.45, r);
    col *= 1.0 - lane * laneNoise * 0.8 * (1.0 - bulge);
    col += uGalaxyCore * (bulge * 1.6 + inner * 0.55);
    col += uGalaxyArm * exp(-r * 1.6) * 0.06; // stellar halo
    // resolved stars scattered over the disk
    col += stars(d, 900.0, 0.93, 0.7, 0.35) * disk * (0.4 + arms) * 1.4;
    float fade = smoothstep(1.7, 1.15, r);
    cover = clamp((disk * 1.6 + bulge) * fade, 0.0, 1.0);
    return col * uGalaxyStrength * fade;
  }

  void main() {
    vec3 d = normalize(vDir);

    // ---- deep space base
    vec3 col = mix(uSpaceBottom, uSpaceTop, smoothstep(-0.8, 0.9, d.y));
    col += uSpaceTop * 0.35 * fbm(d * 1.3 + uSeed, 4);

    // ---- galactic band: dense faint stars and a soft dusty glow along a great circle
    float bandDist = dot(d, uBandNormal);
    float band = exp(-bandDist * bandDist / 0.045);
    float bandNoise = fbm(d * 4.0 + 7.0, 5);
    float rift = smoothstep(0.55, 0.75, ridged(d * 6.0 + 3.0, 4));
    col += uBandColor * band * (0.35 + bandNoise) * (1.0 - rift * 0.8);

    // ---- shared turbulent gas field (two levels of domain warping)
    vec3 p = d * 1.6; // large billowing shapes; detail comes from the warp
    vec3 q = vec3(fbm(p + uSeed, 5), fbm(p + vec3(5.2, 1.3, 2.8), 5), fbm(p + vec3(1.7, 9.2, 3.4), 5));
    vec3 r = vec3(fbm(p + 3.0 * q + vec3(1.7, 9.2, 0.0), 5), fbm(p + 3.0 * q + vec3(8.3, 2.8, 4.1), 5), fbm(p + 3.0 * q + vec3(2.1, 6.4, 7.7), 4));
    float n = fbm(p + 2.6 * r, 5);
    float edge = fbm(d * 1.7 + 11.0, 4) - 0.5;

    float gas = smoothstep(0.42, 0.86, n);
    float hot = smoothstep(0.6, 0.92, n);
    float core = pow(smoothstep(0.7, 0.97, n), 3.0);
    float totalMask = 0.0;

    for (int i = 0; i < ${MAX_REGIONS}; i++) {
      float m = smoothstep(uRegionCone[i].x, uRegionCone[i].y, dot(d, uRegionDir[i]) + edge * 0.45);
      m *= uRegionStrength[i];
      if (m <= 0.001) continue;
      vec3 neb = mix(uRegionDeep[i], uRegionMid[i], smoothstep(0.0, 0.7, gas));
      neb = mix(neb, uRegionHot[i], hot);
      neb += uRegionCore[i] * core;
      col += neb * gas * m;
      // faint outer haze so each complex fades into space instead of stopping abruptly
      col += uRegionDeep[i] * 0.2 * m * (1.0 - gas);
      totalMask = max(totalMask, m);
    }

    // ---- dark dust lanes cutting through the bright gas
    float lanes = smoothstep(0.52, 0.8, ridged(d * 3.4 + q * 1.6, 5));
    float blotch = smoothstep(0.55, 0.8, fbm(d * 5.5 + r * 1.2, 4));
    col *= 1.0 - uDust * totalMask * clamp(lanes * 0.8 + blotch * 0.55, 0.0, 1.0);

    // ---- thin glowing filaments / shock fronts on the rims of the gas
    float fil = pow(ridged(d * 5.0 + r * 2.2, 5), 9.0);
    col += uFilamentColor * fil * totalMask * smoothstep(0.05, 0.4, gas) * (1.0 - core) * 0.8;

    // ---- stars: dense faint field, extra density in the band, a few bright ones
    col += stars(d, 520.0, 0.985 - band * 0.03, 0.8, 0.45) * (1.0 - totalMask * gas * 0.5);
    col += stars(d, 260.0, 0.99, 1.0, 0.9) * (1.0 - totalMask * gas * 0.5);
    vec3 bright = stars(d, 60.0, 0.994, 1.5, 3.0);
    col += bright;

    // ---- optional spiral galaxy (drawn over the far background, which it partly hides)
    float cover;
    vec3 gal = galaxy(d, cover);
    col = col * (1.0 - cover * 0.6) + gal;

    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }`;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const skyFragment = /* glsl */ `
  uniform samplerCube uSky;
  uniform vec3 uTint;
  uniform float uIntensity;
  varying vec3 vDir;
  void main() {
    vec3 c = textureCube(uSky, normalize(vDir)).rgb;
    gl_FragColor = vec4(c * uTint * uIntensity, 1.0);
  }`;

/** Colour spec: 0xRRGGBB or [0xRRGGBB, gain] (gain > 1 = HDR glow picked up by bloom). */
const vec3Of = (spec) => {
  const [hex, gain] = Array.isArray(spec) ? spec : [spec, 1];
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b).multiplyScalar(gain);
};

/**
 * Renders the nebula preset into a cube render target (called once per preset/size).
 * @returns {THREE.WebGLCubeRenderTarget}
 */
export function bakeNebulaCubemap(renderer, preset, size) {
  const regions = preset.regions.slice(0, MAX_REGIONS);
  const G = preset.galaxy ?? null;
  const gDir = new THREE.Vector3(...(G?.dir ?? [0, 0, -1])).normalize();
  const gE1 = new THREE.Vector3().crossVectors(gDir, Math.abs(gDir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
  const gE2 = new THREE.Vector3().crossVectors(gE1, gDir).normalize();
  while (regions.length < MAX_REGIONS) regions.push({ ...regions[0], strength: 0 });
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSeed: { value: preset.seed ?? 1 },
      uPixelAngle: { value: Math.PI / 2 / size },
      uSpaceTop: { value: vec3Of(preset.spaceTop) },
      uSpaceBottom: { value: vec3Of(preset.spaceBottom) },
      uBandNormal: { value: new THREE.Vector3(...preset.bandNormal).normalize() },
      uBandColor: { value: vec3Of(preset.bandColor) },
      uFilamentColor: { value: vec3Of(preset.filament) },
      uDust: { value: preset.dust ?? 0.75 },
      uRegionDir: { value: regions.map((r) => new THREE.Vector3(...r.dir).normalize()) },
      uRegionCone: { value: regions.map((r) => new THREE.Vector2(r.cone[0], r.cone[1])) },
      uRegionStrength: { value: regions.map((r) => r.strength ?? 1) },
      uRegionDeep: { value: regions.map((r) => vec3Of(r.deep)) },
      uRegionMid: { value: regions.map((r) => vec3Of(r.mid)) },
      uRegionHot: { value: regions.map((r) => vec3Of(r.hot)) },
      uRegionCore: { value: regions.map((r) => vec3Of(r.core)) },
      uGalaxyStrength: { value: G ? G.strength ?? 1 : 0 },
      uGalaxyDir: { value: gDir },
      uGalaxyE1: { value: gE1 },
      uGalaxyE2: { value: gE2 },
      uGalaxySize: { value: G?.size ?? 0.4 },
      uGalaxyAngle: { value: G?.angle ?? 0 },
      uGalaxyTilt: { value: G?.tilt ?? 0.5 },
      uGalaxyPitch: { value: G?.pitch ?? 2.4 },
      uGalaxyCore: { value: vec3Of(G?.core ?? 0xffffff) },
      uGalaxyArm: { value: vec3Of(G?.arm ?? 0xffffff) },
      uGalaxyHII: { value: vec3Of(G?.hii ?? 0xffffff) },
    },
    vertexShader: bakeVertex,
    fragmentShader: bakeFragment,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  scene.add(new THREE.Mesh(geometry, material));

  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
  });
  const camera = new THREE.CubeCamera(0.1, 10, target);
  camera.update(renderer, scene);

  geometry.dispose();
  material.dispose();
  return target;
}

/** Camera-centred sky sphere showing a baked nebula cubemap with an animatable tint. */
export class NebulaSky {
  constructor(cubeTexture) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSky: { value: cubeTexture },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uIntensity: { value: 1 },
      },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.geometry = new THREE.SphereGeometry(1900, 48, 24);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -20;
  }

  set texture(tex) {
    this.material.uniforms.uSky.value = tex;
  }

  get tint() {
    return this.material.uniforms.uTint.value;
  }

  set intensity(v) {
    this.material.uniforms.uIntensity.value = v;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

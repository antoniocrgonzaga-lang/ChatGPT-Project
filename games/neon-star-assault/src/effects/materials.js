import * as THREE from 'three';

/** Fresnel energy bubble used for shields (player, heavy fighters, boss). */
export function createShieldMaterial(color, { intensity = 2.2, hexTexture = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uHit: { value: 0 },
      uHex: { value: hexTexture },
      uUseHex: { value: hexTexture ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uOpacity;
      uniform float uTime;
      uniform float uHit;
      uniform sampler2D uHex;
      uniform float uUseHex;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec2 vUv;
      void main() {
        float f = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(f, 2.2);
        float bands = 0.5 + 0.5 * sin(vUv.y * 60.0 - uTime * 6.0);
        float hex = uUseHex > 0.5 ? texture2D(uHex, vUv * vec2(6.0, 3.0)).r : 0.0;
        float a = rim * (0.8 + 0.2 * bands) + hex * 0.18 * (0.4 + rim) + uHit * 0.5;
        gl_FragColor = vec4(uColor * uIntensity * a * uOpacity, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Scrolling additive energy material (portal / warp tunnel / beams). */
export function createFlowMaterial(color, texture, { intensity = 2, speed = 1, repeat = [1, 1], opacity = 1 } = {}) {
  const tex = texture.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(intensity),
    map: tex,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.userData.flowSpeed = speed;
  return mat;
}

export function scrollFlowMaterial(mat, dt) {
  if (mat.map) mat.map.offset.y -= (mat.userData.flowSpeed ?? 1) * dt;
}

/**
 * MeshStandardMaterial with a fresnel rim glow, so dark hulls keep a readable silhouette
 * against dark skies. `rimColor` is a shared uniform object ({ value: THREE.Color }) that the
 * game re-tints per stage; all materials using it update together.
 */
export function createRimMaterial(params, rimColor, { power = 2.6, strength = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial(params);
  const rimPower = { value: power };
  const rimStrength = { value: strength };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = rimColor;
    shader.uniforms.uRimPower = rimPower;
    shader.uniforms.uRimStrength = rimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), uRimPower);
        totalEmissiveRadiance += uRimColor * rimF * uRimStrength;`,
      );
  };
  mat.customProgramCacheKey = () => 'rim-standard';
  mat.userData.rimStrength = rimStrength;
  return mat;
}

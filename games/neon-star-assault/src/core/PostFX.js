import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BLOOM } from '../config/gameConfig.js';
import { damp } from '../utils/math.js';

/** Final grading pass: chromatic aberration (special moments only), vignette and screen flashes. */
const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uChromatic: { value: 0 },
    uVignette: { value: 0.9 },
    uFlashColor: { value: new THREE.Color(1, 0.1, 0.15) },
    uFlash: { value: 0 },
    uWhite: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uChromatic;
    uniform float uVignette;
    uniform vec3 uFlashColor;
    uniform float uFlash;
    uniform float uWhite;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);
      vec3 col;
      if (uChromatic > 0.0001) {
        vec2 dir = center * uChromatic * dist;
        col.r = texture2D(tDiffuse, vUv + dir).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - dir).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      float vig = smoothstep(0.85, 0.25, dist * uVignette);
      col *= mix(0.55, 1.0, vig);
      // damage flash hugs the edges so the centre stays readable
      col = mix(col, uFlashColor * 1.5, uFlash * smoothstep(0.15, 0.75, dist) * 0.8);
      col = mix(col, vec3(1.6), uWhite);
      col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.012;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = null;
    this.bloomBoost = 0;
    this.chromaticPulse = 0;
    this.flash = 0;
    this.white = 0;
    this.whiteTarget = 0;
    this.chromaticEnabled = true;
    this.baseStrength = BLOOM.strength;
    this.stageBloomFactor = 1;
  }

  build(quality) {
    if (this.composer) this.dispose();
    const size = this.renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomRes = new THREE.Vector2(size.x * quality.bloomScale, size.y * quality.bloomScale);
    this.bloom = new UnrealBloomPass(bloomRes, quality.bloomStrength, BLOOM.radius, BLOOM.threshold);
    this.bloomScale = quality.bloomScale;
    this.baseStrength = quality.bloomStrength;
    this.composer.addPass(this.bloom);

    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.chromaticEnabled = quality.chromatic;
  }

  setSize(w, h, pixelRatio) {
    if (!this.composer) return;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * this.bloomScale, h * this.bloomScale);
  }

  /** Short bloom surge for explosions and bombs. */
  boost(amount) {
    this.bloomBoost = Math.min(BLOOM.maxBoost, this.bloomBoost + amount);
  }

  pulseChromatic(amount) {
    if (this.chromaticEnabled) this.chromaticPulse = Math.max(this.chromaticPulse, amount);
  }

  damageFlash(amount = 1, color = null) {
    this.flash = Math.max(this.flash, amount);
    this.final.uniforms.uFlashColor.value.set(color ?? 0xff1a2a);
  }

  /** White-out used by portal / planet explosion. Target 0..1 approached smoothly. */
  setWhite(target, immediate = false) {
    this.whiteTarget = target;
    if (immediate) this.white = target;
  }

  update(dt, time) {
    this.bloomBoost = damp(this.bloomBoost, 0, BLOOM.boostDecay, dt);
    this.chromaticPulse = damp(this.chromaticPulse, 0, 3.5, dt);
    this.flash = damp(this.flash, 0, 4, dt);
    this.white = damp(this.white, this.whiteTarget, 3, dt);
    this.bloom.strength = this.baseStrength * this.stageBloomFactor + this.bloomBoost;
    const u = this.final.uniforms;
    u.uChromatic.value = this.chromaticPulse;
    u.uFlash.value = this.flash;
    u.uWhite.value = this.white;
    u.uTime.value = time % 100;
  }

  reset() {
    this.bloomBoost = 0;
    this.chromaticPulse = 0;
    this.flash = 0;
    this.white = 0;
    this.whiteTarget = 0;
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose();
    this.composer = null;
  }
}

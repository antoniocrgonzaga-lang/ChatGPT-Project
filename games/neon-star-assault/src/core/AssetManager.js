import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHIPS } from '../config/gameConfig.js';
import { createNoise2D } from '../utils/noise.js';
import { createRimMaterial } from '../effects/materials.js';

/**
 * Builds and caches every shared procedural resource: canvas textures, materials, geometries
 * and environment maps. Nothing is downloaded, so the game works fully offline.
 * Shared resources are never disposed during play; per-instance clones are the owner's job.
 */
const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap',
  'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
];

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.textures = {};
    this.materials = {};
    this.geometries = {};
    this.envMaps = {};
    this.models = {};
    this.warnings = [];
  }

  async load(onProgress = () => {}) {
    const steps = [
      ['textures', () => this.buildTextures()],
      ['materials', () => this.buildMaterials()],
      ['geometries', () => this.buildGeometries()],
      ['environment', () => this.buildEnvironments()],
      ['models', () => this.loadModels()],
    ];
    for (let i = 0; i < steps.length; i++) {
      const [name, fn] = steps[i];
      try {
        await fn();
      } catch (err) {
        throw new Error(`Failed to generate assets (${name}): ${err.message}`);
      }
      onProgress((i + 1) / steps.length, name);
      // yield so the loading bar can repaint
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  // ------------------------------------------------------------ textures
  canvasTexture(size, draw, { repeat = false, srgb = true } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    draw(ctx, size);
    const tex = new THREE.CanvasTexture(canvas);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  buildTextures() {
    const T = this.textures;

    T.glow = this.canvasTexture(128, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    });

    T.flare = this.canvasTexture(128, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.1, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(0, s / 2 - 1, s, 2);
      c.fillRect(s / 2 - 1, 0, 2, s);
    });

    T.nebula = [0, 1, 2, 3].map((seed) => this.canvasTexture(256, (c, s) => this.drawCloud(c, s, seed)));

    T.asteroidVeins = this.canvasTexture(256, (c, s) => {
      c.fillStyle = '#000';
      c.fillRect(0, 0, s, s);
      c.lineCap = 'round';
      for (let i = 0; i < 26; i++) {
        let x = Math.random() * s;
        let y = Math.random() * s;
        c.strokeStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
        c.lineWidth = 1 + Math.random() * 2.2;
        c.beginPath();
        c.moveTo(x, y);
        for (let k = 0; k < 6; k++) {
          x += (Math.random() - 0.5) * 50;
          y += (Math.random() - 0.5) * 50;
          c.lineTo(x, y);
        }
        c.stroke();
      }
    });

    T.rock = this.canvasTexture(256, (c, s) => {
      c.fillStyle = '#3a3440';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 900; i++) {
        const v = 30 + Math.random() * 50;
        c.fillStyle = `rgba(${v},${v - 6},${v + 8},0.5)`;
        const r = Math.random() * 6;
        c.beginPath();
        c.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2);
        c.fill();
      }
    });

    T.panelBase = this.canvasTexture(512, (c, s) => this.drawPanels(c, s, false), { repeat: true });
    T.panelEmissive = this.canvasTexture(512, (c, s) => this.drawPanels(c, s, true), { repeat: true });
    T.deckBase = this.canvasTexture(512, (c, s) => this.drawDeck(c, s, false), { repeat: true });
    T.deckEmissive = this.canvasTexture(512, (c, s) => this.drawDeck(c, s, true), { repeat: true });

    T.stripes = this.canvasTexture(256, (c, s) => {
      c.fillStyle = '#000';
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 18; i++) {
        const y = Math.random() * s;
        const h = 2 + Math.random() * 10;
        const a = 0.25 + Math.random() * 0.75;
        c.fillStyle = `rgba(255,255,255,${a})`;
        c.fillRect(Math.random() * s * 0.3, y, s * (0.3 + Math.random() * 0.7), h);
      }
    }, { repeat: true });

    T.energyFlow = this.canvasTexture(256, (c, s) => {
      const g = c.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.1)');
      g.addColorStop(0.5, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0.1)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      c.globalCompositeOperation = 'multiply';
      for (let y = 0; y < s; y += 4) {
        const v = 120 + Math.floor(Math.random() * 135);
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(0, y, s, 4);
      }
    }, { repeat: true });

    T.hex = this.canvasTexture(256, (c, s) => {
      c.fillStyle = '#000';
      c.fillRect(0, 0, s, s);
      c.strokeStyle = 'rgba(255,255,255,0.9)';
      c.lineWidth = 2;
      const r = s / 8;
      const h = Math.sqrt(3) * r;
      for (let row = -1; row < 6; row++) {
        for (let col = -1; col < 6; col++) {
          const cx = col * r * 3 + (row % 2 ? r * 1.5 : 0);
          const cy = row * h * 0.5 * 2;
          c.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          c.stroke();
        }
      }
    }, { repeat: true });
  }

  /**
   * Wispy gas cloud: domain-warped fbm for the billowing body, ridged noise for bright
   * filaments, and a noise-distorted radial falloff so the silhouette is never a circle.
   * Greyscale + alpha, tinted by the sprite material.
   */
  drawCloud(c, s, seed) {
    const { fbm, ridged } = createNoise2D(1000 + seed * 7919);
    const img = c.createImageData(s, s);
    const d = img.data;
    const stretch = [1, 0.7, 1.25, 0.85][seed % 4]; // some clouds are elongated
    const smooth = (a, b, v) => {
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const u = (x / s) * 2 - 1;
        const v = ((y / s) * 2 - 1) / stretch;
        // warp field
        const qx = fbm(u * 1.8 + seed * 3.1, v * 1.8, 4);
        const qy = fbm(u * 1.8 + 5.2, v * 1.8 + 1.3 + seed, 4);
        const wx = u * 2.6 + qx * 2.4;
        const wy = v * 2.6 + qy * 2.4;
        const n = fbm(wx, wy, 5);
        // silhouette: radial falloff pushed around by low-frequency noise
        const rawR = Math.sqrt(u * u + (v * stretch) * (v * stretch));
        const r = Math.sqrt(u * u + v * v) + (qx - 0.5) * 0.55;
        // noisy silhouette, but always fully transparent before the texture border
        const falloff = smooth(1.05, 0.15, r) * smooth(1.0, 0.82, rawR);
        const body = smooth(0.32, 0.78, n) * falloff;
        const fil = Math.pow(ridged(wx * 1.9, wy * 1.9, 4), 5) * smooth(0.95, 0.3, r) * smooth(1.0, 0.82, rawR) * 0.9;
        const alpha = Math.min(1, body * 0.9 + fil * 0.55);
        const lum = Math.min(1, 0.45 + n * 0.55 + fil * 0.6);
        const i = (y * s + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = lum * 255;
        d[i + 3] = alpha * 255;
      }
    }
    c.putImageData(img, 0, 0);
  }

  /** Stage 4 hull plating: cold gunmetal panels, white window slits and green service lights. */
  drawDeck(c, s, emissive) {
    c.fillStyle = emissive ? '#000' : '#14171c';
    c.fillRect(0, 0, s, s);
    const cells = 8;
    const cell = s / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const px = x * cell;
        const py = y * cell;
        if (!emissive) {
          const v = 26 + Math.floor(Math.random() * 26);
          c.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
          const split = Math.random() < 0.35;
          if (split) {
            c.fillRect(px + 2, py + 2, cell / 2 - 3, cell - 4);
            c.fillRect(px + cell / 2 + 1, py + 2, cell / 2 - 3, cell - 4);
          } else c.fillRect(px + 2, py + 2, cell - 4, cell - 4);
          c.fillStyle = 'rgba(0,0,0,0.45)';
          c.fillRect(px + 5, py + cell - 12, cell * 0.4, 4);
        } else {
          const r = Math.random();
          if (r < 0.16) {
            c.fillStyle = `rgba(60,255,140,${0.55 + Math.random() * 0.45})`;
            if (Math.random() < 0.5) c.fillRect(px, py + cell / 2 - 1, cell, 2);
            else c.fillRect(px + cell / 2 - 1, py, 2, cell);
          } else if (r < 0.3) {
            c.fillStyle = `rgba(255,240,215,${0.5 + Math.random() * 0.5})`;
            for (let k = 0; k < 4; k++) c.fillRect(px + 8 + k * (cell / 5), py + cell * 0.3, cell / 10, 3);
          }
        }
      }
    }
    if (emissive) {
      c.strokeStyle = 'rgba(60,255,140,0.18)';
      c.lineWidth = 1;
      for (let i = 0; i <= cells; i++) {
        c.beginPath();
        c.moveTo(i * cell, 0);
        c.lineTo(i * cell, s);
        c.moveTo(0, i * cell);
        c.lineTo(s, i * cell);
        c.stroke();
      }
    }
  }

  drawPanels(c, s, emissive) {
    c.fillStyle = emissive ? '#000' : '#1b1618';
    c.fillRect(0, 0, s, s);
    const cells = 8;
    const cell = s / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const px = x * cell;
        const py = y * cell;
        if (!emissive) {
          const v = 22 + Math.floor(Math.random() * 22);
          c.fillStyle = `rgb(${v + 6},${v},${v})`;
          c.fillRect(px + 2, py + 2, cell - 4, cell - 4);
          c.fillStyle = 'rgba(0,0,0,0.4)';
          c.fillRect(px + 6, py + 6, cell * 0.3, cell * 0.12);
        } else if (Math.random() < 0.3) {
          c.fillStyle = `rgba(255,${60 + Math.random() * 80},20,${0.5 + Math.random() * 0.5})`;
          if (Math.random() < 0.5) c.fillRect(px, py + cell / 2 - 1.5, cell, 3);
          else c.fillRect(px + cell / 2 - 1.5, py, 3, cell);
        } else if (Math.random() < 0.12) {
          c.fillStyle = 'rgba(80,240,255,0.8)';
          c.fillRect(px + cell * 0.4, py + cell * 0.4, cell * 0.2, cell * 0.2);
        }
      }
    }
    if (emissive) {
      c.strokeStyle = 'rgba(255,40,20,0.35)';
      c.lineWidth = 1;
      for (let i = 0; i <= cells; i++) {
        c.beginPath();
        c.moveTo(i * cell, 0);
        c.lineTo(i * cell, s);
        c.moveTo(0, i * cell);
        c.lineTo(s, i * cell);
        c.stroke();
      }
    }
  }

  // ------------------------------------------------------------ materials
  buildMaterials() {
    const M = this.materials;
    const std = (color, metalness, roughness, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

    M.hull = std(0x2a2f3c, 0.75, 0.35);
    M.hullLight = std(0x6a7488, 0.7, 0.3);
    M.hullDark = std(0x12141b, 0.8, 0.4);
    M.hullRed = std(0x3a1414, 0.7, 0.4);
    M.hullBlack = std(0x07070a, 0.9, 0.25);
    M.hullGold = std(0x6b4f1d, 0.9, 0.3);
    M.hullViolet = std(0x2c1f44, 0.75, 0.35);
    M.canopy = std(0x0b2a3a, 0.3, 0.1, { emissive: 0x0a5a7a, emissiveIntensity: 0.6 });
    M.rock = std(0x4a4452, 0.1, 0.9, {
      map: this.textures.rock,
      emissive: 0xff3cc8,
      emissiveMap: this.textures.asteroidVeins,
      emissiveIntensity: 1.6,
      flatShading: true,
    });
    M.metalPlate = std(0x3b3033, 0.6, 0.55, {
      map: this.textures.panelBase,
      emissive: 0xffffff,
      emissiveMap: this.textures.panelEmissive,
      emissiveIntensity: 1.4,
    });
    M.structure = std(0x1d1f29, 0.6, 0.55);
    M.structureRed = std(0x2a1512, 0.65, 0.5);
    // Stage 4 (abyssal armada): cold gunmetal plating with green service lights
    M.deckPlate = std(0x9aa6b4, 0.7, 0.5, {
      map: this.textures.deckBase,
      emissive: 0xffffff,
      emissiveMap: this.textures.deckEmissive,
      emissiveIntensity: 1.3,
    });
    M.hullAbyss = std(0x1a1f26, 0.82, 0.4);
    M.hullAbyssLight = std(0x3a414c, 0.75, 0.34);
    M.flash = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 4, 4) });

    // enemy hulls: rim-lit so they read against dark skies (rim colour follows the stage theme)
    this.enemyRim = { value: new THREE.Color(0x8a5cff) };
    M.enemyHull = createRimMaterial({ color: 0x2b2a3a, metalness: 0.8, roughness: 0.32 }, this.enemyRim, { strength: 0.9 });
    M.enemyPlate = createRimMaterial({ color: 0x585a70, metalness: 0.75, roughness: 0.28 }, this.enemyRim, { strength: 0.7 });
    M.enemyDark = createRimMaterial({ color: 0x0f0e16, metalness: 0.85, roughness: 0.45 }, this.enemyRim, { strength: 0.6 });
    M.enemyGlass = new THREE.MeshStandardMaterial({ color: 0x0a0a12, metalness: 0.2, roughness: 0.05, emissive: 0xff3a6a, emissiveIntensity: 0.35 });

    // Emissive "neon" materials: colour values above 1 are what the bloom threshold picks up.
    const glow = (hex, intensity = 3) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity) });
    M.glowCyan = glow(0x2de2ff);
    M.glowMagenta = glow(0xff2bd6);
    M.glowViolet = glow(0x9a4dff);
    M.glowRed = glow(0xff2a2a);
    M.glowOrange = glow(0xff7a1a);
    M.glowGold = glow(0xffc23a);
    M.glowWhite = glow(0xffffff, 2.5);
    M.glowGreen = glow(0x35ff8a);
    M.glowBlue = glow(0x4a7dff);
    M.dimCyan = glow(0x2de2ff, 0.8);
    M.dimRed = glow(0xff2a2a, 0.7);
    M.dimViolet = glow(0x9a4dff, 0.7);
    M.dimMagenta = glow(0xff2bd6, 1.1);
    M.trimMagenta = glow(0xff2bd6, 1.5);
    M.trimRed = glow(0xff2a2a, 1.5);
    M.trimGold = glow(0xffb030, 1.5);
    M.trimCyan = glow(0x2de2ff, 1.5);
    M.dimGold = glow(0xffb030, 0.9);
    M.trimGreen = glow(0x35ff8a, 1.5);
    M.dimGreen = glow(0x35ff8a, 0.75);
    // faceted self-lit crystal (Stage 3 shards, Prism Lancer, Eclipse Sovereign)
    M.crystal = new THREE.MeshStandardMaterial({
      color: 0x9ff0ff,
      metalness: 0.25,
      roughness: 0.08,
      emissive: 0x2a7aff,
      emissiveIntensity: 0.9,
      flatShading: true,
    });

    const additive = (hex, opacity) =>
      new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    M.flameCyan = additive(0x3ad8ff, 0.8);
    M.flameViolet = additive(0xa25cff, 0.8);
    M.flameOrange = additive(0xff8a2a, 0.8);
    M.flameRed = additive(0xff3030, 0.8);

    const lines = (hex, opacity) =>
      new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    M.lineCyan = lines(0x2de2ff, 0.55);
    M.lineMagenta = lines(0xff2bd6, 0.5);
    M.lineViolet = lines(0x9a4dff, 0.45);
    M.lineRed = lines(0xff3322, 0.6);
    M.lineOrange = lines(0xff8a2a, 0.5);
    M.lineWarning = lines(0xff2040, 0.9);
    M.lineGreen = lines(0x35ff8a, 0.4);
    M.lineSafe = lines(0x7dff4a, 0.95);
  }

  /** Additive sprite material with the shared glow texture. */
  spriteMaterial(color, opacity = 1, texture = this.textures.glow) {
    return new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  // ------------------------------------------------------------ geometries
  buildGeometries() {
    const G = this.geometries;
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.sphereLow = new THREE.IcosahedronGeometry(1, 1);
    G.sphere = new THREE.SphereGeometry(1, 20, 14);
    G.cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
    G.cylinderHex = new THREE.CylinderGeometry(1, 1, 1, 6);
    G.cone = new THREE.ConeGeometry(1, 1, 8);
    G.coneHex = new THREE.ConeGeometry(1, 1, 6);
    G.octa = new THREE.OctahedronGeometry(1, 0);
    G.tetra = new THREE.TetrahedronGeometry(1, 0);
    G.ico = new THREE.IcosahedronGeometry(1, 0);
    G.torus = new THREE.TorusGeometry(1, 0.08, 8, 48);
    G.torusThick = new THREE.TorusGeometry(1, 0.2, 8, 32);
    G.torusThin = new THREE.TorusGeometry(1, 0.035, 6, 72);
    G.ring = new THREE.RingGeometry(0.85, 1, 48);
    G.plane = new THREE.PlaneGeometry(1, 1);
    G.asteroids = [0, 1, 2, 3].map((i) => this.makeAsteroidGeometry(i));
    G.gear = this.makeGearGeometry(14, 1, 0.78, 0.25);
    G.squareLine = this.makeSquareLine();
  }

  makeAsteroidGeometry(seed) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const k1 = 1.3 + seed * 0.4;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n =
        Math.sin(v.x * 3.1 * k1 + seed) * 0.12 +
        Math.sin(v.y * 4.3 + seed * 2.1) * 0.1 +
        Math.sin(v.z * 5.7 * k1 + seed * 0.7) * 0.08;
      v.multiplyScalar(1 + n);
      v.y *= 0.8 + seed * 0.05;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }

  makeGearGeometry(teeth, outer, inner, depth) {
    const shape = new THREE.Shape();
    const steps = teeth * 4;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = i % 4 < 2 ? outer : inner;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner * 0.45, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  makeSquareLine() {
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap(([x, y]) => [x, y, 0]), 3));
    return g;
  }

  // ------------------------------------------------------------ models
  /** Loads every selectable ship in parallel; a ship that fails falls back to the procedural model. */
  async loadModels() {
    this.models.ships = {};
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(SHIPS).map(async ([id, ship]) => {
        const def = ship.model;
        try {
          const gltf = await loader.loadAsync(def.url);
          this.models.ships[id] = this.preparePlayerShip(gltf.scene, def);
        } catch (err) {
          // Keeps the game playable (e.g. when opened via file:// or the asset was moved).
          const msg = `Ship model ${ship.name} (${def.url}) failed to load — using a procedural ship.`;
          console.warn(msg, err);
          this.warnings.push(msg);
          this.models.ships[id] = null;
        }
      }),
    );
  }

  /**
   * Blender exports can have hundreds of separate meshes. They are baked into one mesh per
   * material (a handful of draw calls), scaled to gameplay size, and the socket empties are kept
   * as points. UVs / tangents are kept only for materials that actually use textures.
   */
  preparePlayerShip(root, def) {
    if (def.rotationY) root.rotation.y = def.rotationY;
    root.updateMatrixWorld(true);
    const findNode = (name) => {
      let found = null;
      root.traverse((o) => {
        if (!found && (o.userData.name === name || o.name === name)) found = o;
      });
      return found;
    };
    const nodePosition = (name) => {
      if (Array.isArray(name)) return new THREE.Vector3(...name).applyMatrix4(root.matrixWorld);
      const node = findNode(name);
      if (!node) {
        this.warnings.push(`Node "${name}" is missing from model ${def.url}.`);
        return null;
      }
      return node.getWorldPosition(new THREE.Vector3());
    };

    const groups = new Map(); // material + attribute layout -> geometries
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const keep = new Set(['position', 'normal']);
      if (TEXTURE_SLOTS.some((slot) => mat[slot])) keep.add('uv');
      if (mat.normalMap) keep.add('tangent');
      if (mat.vertexColors) keep.add('color');
      const geo = o.geometry.clone();
      for (const key of Object.keys(geo.attributes)) {
        if (!keep.has(key)) geo.deleteAttribute(key);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.index) {
        const idx = new Uint32Array(geo.attributes.position.count);
        for (let i = 0; i < idx.length; i++) idx[i] = i;
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }
      geo.applyMatrix4(o.matrixWorld);
      const key = `${mat.uuid}|${Object.keys(geo.attributes).sort().join(',')}`;
      if (!groups.has(key)) groups.set(key, { mat, geos: [] });
      groups.get(key).geos.push(geo);
    });
    if (!groups.size) throw new Error('GLB contains no meshes');

    const group = new THREE.Group();
    group.name = 'PlayerShipModel';
    for (const { mat, geos } of groups.values()) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) throw new Error(`could not merge meshes for material ${mat.name}`);
      mat.envMapIntensity = def.envMapIntensity;
      if (def.emissiveIntensity !== undefined) mat.emissiveIntensity = def.emissiveIntensity;
      // Real transmission makes three.js render the whole scene an extra time every frame;
      // a small tinted canopy doesn't justify that cost, so it is rendered as opaque glass.
      if (mat.transmission > 0) mat.transmission = 0;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = mat.name;
      mesh.castShadow = true;
      group.add(mesh);
    }

    const box = new THREE.Box3().setFromObject(group);
    const scale = def.wingspan / Math.max(0.001, box.max.x - box.min.x);
    group.scale.setScalar(scale);
    const scaled = (v) => (v ? v.multiplyScalar(scale) : null);
    const points = (names) => names.map((n) => scaled(nodePosition(n))).filter(Boolean);

    const template = {
      group,
      scale,
      length: (box.max.z - box.min.z) * scale,
      primarySockets: points(def.primarySockets),
      dualSockets: points(def.dualSockets),
      engines: points(def.engineNodes),
      engineRadius: def.engineRadius * scale,
    };
    // a model without sockets must still shoot and show thrust: nose tip / tail centre stand-ins
    if (!template.primarySockets.length) template.primarySockets.push(new THREE.Vector3(0, 0, box.min.z * scale));
    if (!template.engines.length) template.engines.push(new THREE.Vector3(0, 0, box.max.z * scale));
    return template;
  }

  // ------------------------------------------------------------ environment
  buildEnvironments() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMaps.nebula = this.makeEnv(pmrem, 0x120a2a, 0x2a0f44, [0x2de2ff, 0xff2bd6, 0x9a4dff]);
    this.envMaps.crimson = this.makeEnv(pmrem, 0x1a0606, 0x3a1206, [0xff5a1a, 0xffc23a, 0x2de2ff]);
    this.envMaps.singularity = this.makeEnv(pmrem, 0x06202e, 0x02080e, [0x7af0ff, 0xffc070, 0x4a7dff]);
    this.envMaps.abyss = this.makeEnv(pmrem, 0x0c1622, 0x020306, [0xffe8c8, 0x35ff8a, 0x6a8aff]);
    pmrem.dispose();
  }

  makeEnv(pmrem, top, bottom, panelColors) {
    const scene = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const colors = [];
    const cTop = new THREE.Color(top);
    const cBottom = new THREE.Color(bottom);
    const c = new THREE.Color();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) / 10) * 0.5 + 0.5;
      c.copy(cBottom).lerp(cTop, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    scene.add(shell);
    panelColors.forEach((hex, i) => {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(3), side: THREE.DoubleSide }),
      );
      const a = (i / panelColors.length) * Math.PI * 2;
      panel.position.set(Math.cos(a) * 8, 3 - i * 2, Math.sin(a) * 8);
      panel.lookAt(0, 0, 0);
      scene.add(panel);
    });
    const rt = pmrem.fromScene(scene, 0.03);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    return rt.texture;
  }
}

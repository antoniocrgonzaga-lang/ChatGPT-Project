import * as THREE from 'three';
import { ModelBuilder } from '../entities/models/ModelBuilder.js';
import { hullFromOutline, symmetricOutline, latheAlongZ } from '../entities/models/shapes.js';
import { createRng } from '../utils/math.js';

/*
 * Procedural capital ships for Stage 4: the mothership LEVIATÃ and the cruisers of its armada.
 * Models are built in "design units" (length 100, nose at -Z, up +Y) and scaled to their real
 * size. Static parts are merged per material; the city of tiny lights that sells the scale is a
 * single InstancedMesh. Everything is owned per ship and released by dispose().
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Right half of a top-view outline ([x, forward] from nose to tail) -> half width at `forward`. */
function halfWidthAt(rightHalf, f) {
  for (let i = 0; i < rightHalf.length - 1; i++) {
    const [x0, f0] = rightHalf[i];
    const [x1, f1] = rightHalf[i + 1];
    if ((f <= f0 && f >= f1) || (f >= f0 && f <= f1)) {
      const t = f0 === f1 ? 0 : (f - f0) / (f1 - f0);
      return x0 + (x1 - x0) * t;
    }
  }
  return 0;
}

const DESIGNS = {
  leviathan: {
    decks: [
      // [right-half outline, thickness, y]
      [[[0, 50], [5, 34], [11, 14], [16, -8], [18, -30], [18, -44], [14, -50], [0, -50]], 4.5, -2],
      [[[0, 36], [6, 20], [11, 0], [13.5, -20], [14, -40], [11, -47], [0, -47]], 3.2, 1.6],
      [[[0, 14], [5, 2], [8.5, -14], [9.5, -34], [8, -44], [0, -44]], 2.6, 4.3],
    ],
    spine: { width: 1.6, height: 1.6, from: -38, to: 30, y: 6.3 },
    tower: { z: 37, scale: 1 },
    engines: { big: [[0, 0], [-7, 0], [7, 0]], small: [[-11.5, 2.6], [11.5, 2.6], [-3.6, 3.6], [3.6, 3.6]], radius: 3, z: 50 },
    bays: { from: 8, to: 42, count: 5, height: 2.4 },
    ventralHangar: true,
    cannons: 0,
    lights: 2600,
  },
  cruiser: {
    decks: [
      [[[0, 50], [7, 24], [12, -6], [12.5, -40], [9, -50], [0, -50]], 5.5, -1.5],
      [[[0, 22], [5.5, 6], [8, -18], [8.5, -40], [0, -42]], 3.4, 2.6],
    ],
    spine: { width: 1.4, height: 1.4, from: -20, to: 24, y: 4.8 },
    tower: { z: 30, scale: 0.85 },
    engines: { big: [[0, 0], [-5.5, 0.6], [5.5, 0.6]], small: [], radius: 2.6, z: 50 },
    bays: { from: -4, to: 26, count: 3, height: 2.2 },
    ventralHangar: false,
    cannons: 4, // broadside turrets per side
    lights: 420,
  },
};

/** Builds the merged static geometry of a design, plus the anchor data used for lights. */
function buildGeometry(design, seed) {
  const b = new ModelBuilder();
  const rng = createRng(seed);
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    hex: new THREE.CylinderGeometry(1, 1, 1, 6),
    sphere: new THREE.SphereGeometry(1, 16, 10),
  };
  const lightSpots = []; // { pos: Vector3, normal: 'up' | 'side', w, h } surfaces that get window lights

  // stacked decks: each a bevelled blade extruded from its top-view outline
  design.decks.forEach(([half, thickness, y], i) => {
    const geo = hullFromOutline(symmetricOutline(half), thickness, Math.min(0.6, thickness * 0.15), 1);
    b.add(geo, i === 0 ? 'hull' : 'plate', { pos: [0, y, 0] });
    geo.dispose();
    const top = y + thickness / 2;
    const fNose = half[0][1];
    const fTail = half[half.length - 1][1];
    // green running lights along both deck edges
    for (const s of [-1, 1]) {
      const steps = 14;
      for (let k = 0; k < steps; k++) {
        const f0 = fNose + ((fTail - fNose) * (k + 0.15)) / steps;
        const f1 = fNose + ((fTail - fNose) * (k + 0.85)) / steps;
        const x0 = halfWidthAt(half, f0) * s;
        const x1 = halfWidthAt(half, f1) * s;
        if (Math.abs(x0) < 1.5 || Math.abs(x1) < 1.5) continue;
        const len = Math.hypot(x1 - x0, f1 - f0);
        const ang = Math.atan2(x1 - x0, -(f1 - f0));
        b.add(G.box, i === 0 ? 'trim' : 'trimDim', { pos: [(x0 + x1) / 2 - s * 0.15, top - 0.05, -(f0 + f1) / 2], rot: [0, ang, 0], scale: [0.14, 0.1, len * 0.9] });
      }
    }
    // deck greebles: armour plates, vents and turret domes scattered on the top surface
    const plates = i === 0 ? 46 : 30;
    for (let k = 0; k < plates; k++) {
      const f = rng.range(fTail + 3, fNose - 4);
      const hw = halfWidthAt(half, f) - 1.2;
      if (hw < 1) continue;
      const x = rng.range(-hw, hw);
      const kind = rng.next();
      if (kind < 0.62) b.add(G.box, rng.chance(0.5) ? 'plate' : 'dark', { pos: [x, top + 0.2, -f], scale: [rng.range(1, 3.5), rng.range(0.2, 0.7), rng.range(1.5, 6)] });
      else if (kind < 0.85) b.add(G.hex, 'dark', { pos: [x, top + 0.3, -f], scale: [rng.range(0.5, 1.1), 0.6, rng.range(0.5, 1.1)] });
      else b.add(G.sphere, 'plate', { pos: [x, top, -f], scale: [0.9, 0.55, 0.9] });
    }
    lightSpots.push({ deck: i, half, top, y, thickness, fNose, fTail });

    // continuous rows of windows along the flanks: they read as lines of light from very far away
    const rows = i === 0 ? 3 : 2;
    for (const s of [-1, 1]) {
      for (let r = 0; r < rows; r++) {
        const yRow = y + (r - (rows - 1) / 2) * thickness * 0.26;
        for (let f = fNose - 6; f > fTail + 3; f -= rng.range(3, 6)) {
          if (rng.chance(0.3)) continue;
          const len = rng.range(1.5, 4);
          const fa = f;
          const fb = f - len;
          const xa = halfWidthAt(half, fa) * s;
          const xb = halfWidthAt(half, fb) * s;
          if (Math.abs(xa) < 2) continue;
          const ang = Math.atan2(xb - xa, -(fb - fa));
          b.add(G.box, 'window', { pos: [(xa + xb) / 2 + s * 0.06, yRow, -(fa + fb) / 2], rot: [0, ang, 0], scale: [0.08, 0.16, Math.hypot(xb - xa, fb - fa)] });
        }
      }
    }
  });

  // dorsal spine
  const sp = design.spine;
  b.add(G.box, 'dark', { pos: [0, sp.y, -(sp.from + sp.to) / 2], scale: [sp.width, sp.height, Math.abs(sp.to - sp.from)] });
  b.add(G.box, 'trim', { pos: [0, sp.y + sp.height / 2 + 0.05, -(sp.from + sp.to) / 2], scale: [0.2, 0.1, Math.abs(sp.to - sp.from) * 0.95] });

  // command tower near the stern
  const T = design.tower;
  const ts = T.scale;
  const tz = T.z;
  const baseY = design.decks[design.decks.length - 1][2] + design.decks[design.decks.length - 1][1] / 2;
  b.add(G.box, 'plate', { pos: [0, baseY + 2 * ts, tz], scale: [9 * ts, 4 * ts, 7 * ts] });
  b.add(G.box, 'hull', { pos: [0, baseY + 5 * ts, tz + 0.5], scale: [6 * ts, 3 * ts, 4.5 * ts] });
  b.add(G.box, 'plate', { pos: [0, baseY + 7.2 * ts, tz + 0.5], scale: [15 * ts, 1.5 * ts, 3.2 * ts] });
  b.add(G.box, 'window', { pos: [0, baseY + 7.3 * ts, tz - 1.15 * ts], scale: [13 * ts, 0.35 * ts, 0.1] });
  for (const s of [-1, 1]) {
    b.add(G.sphere, 'plate', { pos: [s * 4.6 * ts, baseY + 8.8 * ts, tz + 0.8], scale: 1.4 * ts });
    b.add(G.cyl, 'dark', { pos: [s * 2 * ts, baseY + 10.5 * ts, tz + 1.2], scale: [0.12, 5 * ts, 0.12] });
  }
  b.add(G.cyl, 'dark', { pos: [0, baseY + 12 * ts, tz + 1.5], scale: [0.18, 8 * ts, 0.18] });

  // engine block: big and small bells with glowing throats
  const E = design.engines;
  const bell = latheAlongZ([[0.8, 1.6], [1.0, 1.0], [0.95, 0], [0.7, -0.6]], 18);
  const addBell = ([x, y], r) => {
    b.add(bell, 'dark', { pos: [x, y, E.z - 1], scale: r });
    b.add(G.cyl, 'engine', { pos: [x, y, E.z - 0.1 * r], rot: [Math.PI / 2, 0, 0], scale: [r * 0.62, 0.1, r * 0.62] });
  };
  for (const e of E.big) addBell(e, E.radius);
  for (const e of E.small) addBell(e, E.radius * 0.55);
  bell.dispose();

  // hangar bays glowing green along both flanks
  const lower = design.decks[0];
  const half0 = lower[0];
  const B = design.bays;
  for (let k = 0; k < B.count; k++) {
    const z = B.from + ((B.to - B.from) * (k + 0.5)) / B.count;
    const hw = halfWidthAt(half0, -z);
    for (const s of [-1, 1]) {
      b.add(G.box, 'green', { pos: [s * (hw + 0.06), lower[2], z], scale: [0.12, B.height, ((B.to - B.from) / B.count) * 0.7] });
      b.add(G.box, 'dark', { pos: [s * (hw + 0.25), lower[2] + B.height * 0.7, z], scale: [0.5, 0.3, ((B.to - B.from) / B.count) * 0.85] });
    }
  }
  if (design.ventralHangar) {
    // the launch mouth under the prow: a long green slot (seen when flying beneath)
    const y = lower[2] - lower[1] / 2 - 0.08;
    b.add(G.box, 'green', { pos: [0, y, -18], scale: [7, 0.12, 26] });
    for (let k = 0; k < 6; k++) b.add(G.box, 'dark', { pos: [0, y - 0.1, -6 - k * 5], scale: [7.6, 0.25, 0.6] });
  }

  // broadside turrets (cruisers): base + twin barrels pointing out of each flank
  const hardpoints = [];
  for (let k = 0; k < design.cannons; k++) {
    const z = -24 + (k * 48) / Math.max(1, design.cannons - 1);
    const hw = halfWidthAt(half0, -z);
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.6);
      const y = lower[2] + 0.4;
      b.add(G.hex, 'plate', { pos: [x, y, z], rot: [0, 0, Math.PI / 2], scale: [1.3, 1.4, 1.3] });
      for (const dz of [-0.45, 0.45]) b.add(G.cyl, 'dark', { pos: [x + s * 2.2, y, z + dz], rot: [0, 0, Math.PI / 2], scale: [0.22, 3.2, 0.22] });
      b.add(G.box, 'green', { pos: [x + s * 0.75, y + 0.6, z], scale: [0.15, 0.15, 1.2] });
      hardpoints.push({ pos: new THREE.Vector3(x + s * 3.9, y, z), side: s });
    }
  }

  for (const g of Object.values(G)) g.dispose();
  return { slots: b.finish(), lightSpots, hardpoints };
}

/** Random window lights on deck tops and in rows along the flanks (design units). */
function placeLights(mesh, design, lightSpots, seed, lightScale = 1) {
  const rng = createRng(seed + 17);
  const count = mesh.count;
  const lower = design.decks[0];
  for (let i = 0; i < count; i++) {
    const roll = rng.next();
    let x;
    let y;
    let z;
    if (roll < 0.55) {
      // deck tops (more on the upper decks: they are the "city")
      const spot = lightSpots[Math.min(lightSpots.length - 1, Math.floor(rng.next() * lightSpots.length * 1.2))];
      const f = rng.range(spot.fTail + 1, spot.fNose - 2);
      const hw = halfWidthAt(spot.half, f) - 0.5;
      if (hw < 0.3) {
        i--;
        continue;
      }
      x = rng.range(-hw, hw);
      y = spot.top + 0.12;
      z = -f;
      _s.set(rng.range(0.08, 0.18), 0.08, rng.range(0.08, 0.3));
    } else {
      // flank window rows on the lower hull and second deck
      const deck = roll < 0.85 ? lower : design.decks[1];
      const half = deck[0];
      const row = Math.floor(rng.range(0, 3));
      const f = rng.range(half[half.length - 1][1] + 2, half[0][1] - 6);
      const hw = halfWidthAt(half, f);
      if (hw < 2) {
        i--;
        continue;
      }
      const s = rng.chance(0.5) ? -1 : 1;
      x = s * (hw + 0.04);
      y = deck[2] + (row - 1) * deck[1] * 0.25;
      z = -f;
      _s.set(0.06, 0.09, rng.range(0.15, 0.55));
    }
    _p.set(x, y, z);
    mesh.setMatrixAt(i, _m.compose(_p, _q.identity(), _s.multiplyScalar(lightScale)));
    const tint = rng.next();
    if (tint < 0.7) _c.setRGB(1, 0.95, 0.85);
    else if (tint < 0.88) _c.setRGB(1, 0.62, 0.25);
    else _c.setRGB(0.3, 1, 0.55);
    mesh.setColorAt(i, _c.multiplyScalar(rng.range(0.7, 1.9)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
}

/**
 * A capital ship of the abyssal armada.
 * @param {object} opts kind ('leviathan' | 'cruiser'), length (world units), fog (false for sky /
 *        cutscene copies), seed, rim (fresnel colour), lights (override the light count)
 */
export class CapitalShip {
  constructor(assets, { kind = 'cruiser', length = 350, fog = true, seed = 1, rim = 0x34567a, lights = null, lightScale = 1 } = {}) {
    const design = DESIGNS[kind];
    this.kind = kind;
    this.length = length;
    this.group = new THREE.Group();
    this.group.name = `CapitalShip:${kind}`;
    this.model = new THREE.Group();
    this.model.scale.setScalar(length / 100);
    this.group.add(this.model);

    const { slots, lightSpots, hardpoints } = buildGeometry(design, seed);
    this.geometries = slots.map((s) => s.geometry);
    const rimUniform = { value: new THREE.Color(rim) };
    const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), fog });
    // hull plating: the shared deck textures, re-scaled for these giants (UVs are in design units)
    this.textures = [assets.textures.deckBase, assets.textures.deckEmissive].map((t) => {
      const c = t.clone();
      c.repeat.set(0.35, 0.35);
      c.needsUpdate = true;
      return c;
    });
    const [panelMap, panelLights] = this.textures;
    const std = (color, metalness, roughness, strength, plated = false) => {
      const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness, fog });
      if (plated) {
        mat.map = panelMap;
        mat.emissive.set(0xffffff);
        mat.emissiveMap = panelLights;
        mat.emissiveIntensity = 0.55;
      }
      // fresnel rim keeps the colossal dark silhouette readable against the void
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uRimColor = rimUniform;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;')
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float rimF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 3.0); // abs: lathe parts face inwards
            totalEmissiveRadiance += uRimColor * rimF * ${strength.toFixed(2)};`,
          );
      };
      mat.customProgramCacheKey = () => `capital-rim-${strength}-${plated}`;
      return mat;
    };
    this.materials = {
      hull: std(0xb4bcc8, 0.6, 0.5, 0.22, true),
      plate: std(0xd0d6de, 0.55, 0.45, 0.18, true),
      dark: std(0x101318, 0.7, 0.55, 0.12),
      trim: glow(0x35ff8a, 1.25),
      trimDim: glow(0x35ff8a, 0.55),
      green: glow(0x4dffa0, 1.3),
      window: glow(0xfff0d8, 1.6),
      engine: glow(0xbfe4ff, 1.8),
    };
    for (const { slot, geometry } of slots) this.model.add(new THREE.Mesh(geometry, this.materials[slot]));

    // the city of lights
    this.lightGeo = new THREE.BoxGeometry(1, 1, 1);
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog });
    const n = lights ?? design.lights;
    this.lights = new THREE.InstancedMesh(this.lightGeo, this.lightMat, n);
    placeLights(this.lights, design, lightSpots, seed, lightScale);
    this.lights.frustumCulled = false;
    this.model.add(this.lights);

    // engine halos and blinking beacons (sprites stay readable at any distance)
    this.sprites = [];
    const E = design.engines;
    const halo = (pos, size, color, opacity) => {
      const mat = assets.spriteMaterial(color, opacity);
      mat.fog = fog;
      const sp = new THREE.Sprite(mat);
      sp.position.copy(pos);
      sp.scale.setScalar(size);
      this.model.add(sp);
      this.sprites.push(sp);
      return sp;
    };
    for (const [x, y] of E.big) halo(new THREE.Vector3(x, y, E.z + 1.2), E.radius * 4.2, 0x9fd0ff, 0.85);
    for (const [x, y] of E.small) halo(new THREE.Vector3(x, y, E.z + 1), E.radius * 2.6, 0x9fd0ff, 0.75);
    this.beacons = [];
    const lastDeck = design.decks[design.decks.length - 1];
    const towerTop = lastDeck[2] + lastDeck[1] / 2 + 16 * design.tower.scale;
    this.beacons.push(halo(new THREE.Vector3(0, towerTop, design.tower.z + 1.5), 2.2, 0xff3a3a, 1));
    for (const s of [-1, 1]) this.beacons.push(halo(new THREE.Vector3(s * (halfWidthAt(design.decks[0][0], -40) + 0.4), design.decks[0][2], 40), 1.6, 0x35ff8a, 1));
    this.beacons.push(halo(new THREE.Vector3(0, design.decks[0][2], -50.5), 1.8, 0xffffff, 1));

    this.engineHalos = this.sprites.filter((s) => !this.beacons.includes(s));
    this.hardpoints = hardpoints; // design units; see hardpointWorld()
    this.time = Math.random() * 10;
  }

  /** World position of broadside hardpoint `i` (cruisers). */
  hardpointWorld(i, out) {
    return this.model.localToWorld(out.copy(this.hardpoints[i].pos));
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.beacons.length; i++) this.beacons[i].visible = Math.sin(t * 2.4 + i * 1.7) > 0.2;
    const flicker = 0.85 + Math.sin(t * 23) * 0.05 + Math.random() * 0.1;
    for (const h of this.engineHalos) h.material.opacity = 0.8 * flicker;
  }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const g of this.geometries) g.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
    this.lightGeo.dispose();
    this.lightMat.dispose();
    this.lights.dispose();
    for (const s of this.sprites) s.material.dispose();
    for (const t of this.textures) t.dispose();
  }
}

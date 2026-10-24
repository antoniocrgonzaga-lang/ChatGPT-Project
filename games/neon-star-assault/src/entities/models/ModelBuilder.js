import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Keeps only the attributes every part has, so geometries of different kinds can be merged. */
function normalize(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const key of Object.keys(g.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') g.deleteAttribute(key);
  }
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/**
 * Collects static model parts per material "slot" and merges each slot into a single geometry.
 * The merged result is cached per model key, so every enemy of a type shares the same buffers
 * and costs one draw call per slot instead of one per part.
 */
export class ModelBuilder {
  constructor() {
    this.slots = new Map();
  }

  /**
   * @param {THREE.BufferGeometry} geo  source geometry (not modified)
   * @param {string} slot               material slot name ('hull', 'plate', 'accent', 'glow', ...)
   * @param {object} t                  { pos:[x,y,z], rot:[x,y,z], scale:number|[x,y,z] }
   */
  add(geo, slot, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
    const g = normalize(geo);
    _p.set(...pos);
    _q.setFromEuler(_e.set(...rot));
    if (typeof scale === 'number') _s.setScalar(scale);
    else _s.set(...scale);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    if (!this.slots.has(slot)) this.slots.set(slot, []);
    this.slots.get(slot).push(g);
    return this;
  }

  /** Mirror helper: adds the part and its copy reflected across X (for symmetric ships). */
  addMirrored(geo, slot, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
    this.add(geo, slot, { pos, rot, scale });
    const mirrored = geo.clone();
    mirrored.scale(-1, 1, 1);
    flipWinding(mirrored);
    this.add(mirrored, slot, { pos: [-pos[0], pos[1], pos[2]], rot: [rot[0], -rot[1], -rot[2]], scale });
    mirrored.dispose();
    return this;
  }

  /** Returns [{ slot, geometry }] with one merged geometry per slot. */
  finish() {
    const out = [];
    for (const [slot, geos] of this.slots) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      out.push({ slot, geometry: merged });
    }
    return out;
  }
}

/** Reversing triangle order keeps mirrored parts front-facing (normals were already mirrored by scale()). */
function flipWinding(geo) {
  const g = geo.index ? geo : null;
  if (g) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.index.needsUpdate = true;
    return;
  }
  const attrs = Object.values(geo.attributes);
  const count = geo.attributes.position.count;
  for (let i = 0; i < count; i += 3) {
    for (const a of attrs) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k];
        a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        a.array[(i + 2) * a.itemSize + k] = t;
      }
    }
  }
}

const cache = new Map();

/** Builds (once) and caches the merged slots of a model. */
export function cachedModel(key, build) {
  if (!cache.has(key)) {
    const b = new ModelBuilder();
    build(b);
    cache.set(key, b.finish());
  }
  return cache.get(key);
}

/**
 * Creates meshes for a cached model. `materials` maps slot -> material.
 * Returns { group, bySlot } so callers can flag accent / glow meshes.
 */
export function instantiate(slots, materials) {
  const group = new THREE.Group();
  const bySlot = {};
  for (const { slot, geometry } of slots) {
    const material = materials[slot];
    if (!material) throw new Error(`No material defined for slot "${slot}"`);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = slot;
    group.add(mesh);
    bySlot[slot] = mesh;
  }
  return { group, bySlot };
}

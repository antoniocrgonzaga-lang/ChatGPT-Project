import * as THREE from 'three';

/**
 * Glowing engine trail built as two crossed ribbons (visible from any angle).
 * Points live in the parent's (rail rig) local space, trailing behind the engine along +Z
 * with a fixed segment length, so the trail length does not depend on rail speed or FPS.
 */
export class TrailRibbon {
  constructor(color, { segments = 12, width = 0.35, segmentLength = 0.32, follow = 18 } = {}) {
    this.segments = segments;
    this.width = width;
    this.segmentLength = segmentLength;
    this.follow = follow;
    this.color = new THREE.Color(color);
    this.points = Array.from({ length: segments }, () => new THREE.Vector3());
    this.initialized = false;
    this.intensity = 1;

    const vertsPerPoint = 4; // 2 for the horizontal strip, 2 for the vertical one
    this.positions = new Float32Array(segments * vertsPerPoint * 3);
    this.colors = new Float32Array(segments * vertsPerPoint * 3);
    const indices = [];
    for (let strip = 0; strip < 2; strip++) {
      for (let i = 0; i < segments - 1; i++) {
        const a = i * 4 + strip * 2;
        const b = a + 1;
        const c = a + 4;
        const d = a + 5;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setIndex(indices);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  reset(head) {
    for (const p of this.points) p.copy(head);
    this.initialized = true;
  }

  update(dt, head) {
    if (!this.initialized) this.reset(head);
    const pts = this.points;
    // each point springs towards "one segment behind" the previous one: fixed length at any FPS
    const k = 1 - Math.exp(-this.follow * dt);
    pts[0].copy(head);
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      pts[i].x += (prev.x - pts[i].x) * k;
      pts[i].y += (prev.y - pts[i].y) * k;
      pts[i].z = prev.z + this.segmentLength;
    }

    const pos = this.positions;
    const col = this.colors;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const w = this.width * (1 - t);
      const fade = (1 - t) * (1 - t) * this.intensity * 1.4;
      const p = pts[i];
      const o = i * 12;
      pos[o] = p.x - w; pos[o + 1] = p.y; pos[o + 2] = p.z;
      pos[o + 3] = p.x + w; pos[o + 4] = p.y; pos[o + 5] = p.z;
      pos[o + 6] = p.x; pos[o + 7] = p.y - w; pos[o + 8] = p.z;
      pos[o + 9] = p.x; pos[o + 10] = p.y + w; pos[o + 11] = p.z;
      for (let k = 0; k < 4; k++) {
        col[o + k * 3] = this.color.r * fade;
        col[o + k * 3 + 1] = this.color.g * fade;
        col[o + k * 3 + 2] = this.color.b * fade;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

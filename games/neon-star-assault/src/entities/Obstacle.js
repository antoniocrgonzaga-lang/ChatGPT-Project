import * as THREE from 'three';

const _p = new THREE.Vector3();
const _world = new THREE.Vector3();

/**
 * Static or animated piece of level geometry that can hurt the player.
 * Colliders are simplified shapes, never the render mesh:
 *  - { type: 'sphere', node, offset, radius }
 *  - { type: 'box', node }  where node is a mesh built on the unit box geometry (its scale = size)
 */
export class Obstacle {
  constructor(object, { colliders = [], damage = 1, hp = 0, score = 0, dropChance = 0, update = null, blocksShots = true, onDestroyed = null, local = false } = {}) {
    this.object = object;
    this.colliders = colliders;
    this.damage = damage;
    this.hp = hp;
    this.destructible = hp > 0;
    this.score = score;
    this.dropChance = dropChance;
    this.flashMeshes = null;
    this.updateFn = update;
    this.blocksShots = blocksShots;
    this.onDestroyed = onDestroyed;
    this.local = local; // attached to the rig instead of the world
    this.alive = true;
    this.t = 0;
    this.flashTimer = 0;
    this.enabled = true;
    this.inverse = colliders.map(() => new THREE.Matrix4());
    this.boundCenter = new THREE.Vector3();
    this.boundRadius = 1;
  }

  /** White hit flash (materials are shared, so each mesh is swapped and restored). */
  flash(material) {
    if (!this.flashMeshes) {
      this.flashMeshes = [];
      this.object.traverse((o) => {
        if (o.isMesh) this.flashMeshes.push({ mesh: o, material: o.material });
      });
    }
    for (const f of this.flashMeshes) f.mesh.material = material;
    this.flashTimer = 0.06;
  }

  restoreFlash() {
    if (!this.flashMeshes) return;
    for (const f of this.flashMeshes) f.mesh.material = f.material;
  }

  update(dt) {
    this.t += dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.restoreFlash();
    }
    if (this.updateFn) this.updateFn(dt, this);
    this.object.updateMatrixWorld(true);
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.type === 'box') this.inverse[i].copy(c.node.matrixWorld).invert();
    }
    this.object.getWorldPosition(this.boundCenter);
  }

  /** Signed penetration test: returns true if a sphere at `point` with `radius` touches any collider. */
  intersectsSphere(point, radius) {
    if (!this.enabled) return false;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.enabled === false) continue;
      if (c.type === 'sphere') {
        c.node.localToWorld(_world.copy(c.offset ?? ZERO));
        const r = c.radius + radius;
        if (_world.distanceToSquared(point) <= r * r) return true;
      } else {
        const s = c.node.scale;
        _p.copy(point).applyMatrix4(this.inverse[i]);
        // back to metric units along each box axis
        const dx = Math.max(Math.abs(_p.x) - 0.5, 0) * s.x;
        const dy = Math.max(Math.abs(_p.y) - 0.5, 0) * s.y;
        const dz = Math.max(Math.abs(_p.z) - 0.5, 0) * s.z;
        if (dx * dx + dy * dy + dz * dz <= radius * radius) return true;
      }
    }
    return false;
  }
}

const ZERO = new THREE.Vector3();

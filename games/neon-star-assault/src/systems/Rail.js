import * as THREE from 'three';
import { clamp, damp } from '../utils/math.js';
import { RAIL } from '../config/gameConfig.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const _basis = new THREE.Matrix4();
const _back = new THREE.Vector3();

/** Position + orthonormal basis at a point of the rail. Local -Z is "forward". */
export class RailFrame {
  constructor() {
    this.position = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.quaternion = new THREE.Quaternion();
  }

  /** Rail-local (x right, y up, z backwards) to world. */
  localToWorld(x, y, z, out) {
    return out
      .copy(this.position)
      .addScaledVector(this.right, x)
      .addScaledVector(this.up, y)
      .addScaledVector(this.forward, -z);
  }

  copy(f) {
    this.position.copy(f.position);
    this.forward.copy(f.forward);
    this.right.copy(f.right);
    this.up.copy(f.up);
    this.quaternion.copy(f.quaternion);
    return this;
  }
}

/** A single CatmullRom path sampled by arc length. */
export class RailPath {
  constructor(points) {
    this.curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const rough = points.reduce((sum, p, i) => (i ? sum + p.distanceTo(points[i - 1]) : 0), 0);
    this.curve.arcLengthDivisions = Math.max(200, Math.ceil(rough / 4));
    this.length = this.curve.getLength();
  }

  frameAt(s, out) {
    const u = clamp(s / this.length, 0, 1);
    this.curve.getPointAt(u, out.position);
    this.curve.getTangentAt(u, out.forward);
    out.right.crossVectors(out.forward, WORLD_UP).normalize();
    out.up.crossVectors(out.right, out.forward).normalize();
    _back.copy(out.forward).negate();
    _basis.makeBasis(out.right, out.up, _back);
    out.quaternion.setFromRotationMatrix(_basis);
    return out;
  }
}

/**
 * The rail the camera rides on. Supports one optional alternate branch that leaves the main
 * path at `forkS` and rejoins it at `mergeS`. The branch is only taken when `altChosen` is set
 * before the fork; `decisionLocked` tells scenery streaming it can look past the fork.
 */
export class Rail {
  constructor() {
    this.frame = new RailFrame();
    this.velocity = new THREE.Vector3();
    this._resolved = { pathId: 'main', s: 0 };
    this.onPathChange = null;
    this.reset();
  }

  reset() {
    this.main = null;
    this.alt = null;
    this.pathId = 'main';
    this.s = 0;
    this.travel = 0;
    this.speed = 0;
    this.targetSpeed = 0;
    this.speedLerp = RAIL.speedLerp;
    this.altChosen = false;
    this.altTaken = false;
    this.decisionLocked = true;
    this.atEnd = false;
  }

  setup(mainPath, alt = null) {
    this.reset();
    this.main = mainPath;
    this.alt = alt; // { path, forkS, mergeS }
    this.decisionLocked = !alt;
  }

  pathById(id) {
    return id === 'alt' ? this.alt.path : this.main;
  }

  setSpeed(target, immediate = false, lerpRate = RAIL.speedLerp) {
    this.targetSpeed = target;
    this.speedLerp = lerpRate;
    if (immediate) this.speed = target;
  }

  jumpTo(s) {
    this.pathId = 'main';
    this.s = s;
    this.travel = s;
    this.atEnd = false;
    this.main.frameAt(s, this.frame);
  }

  chooseAlt(value) {
    if (!this.alt || this.decisionLocked) return;
    this.altChosen = value;
    this.decisionLocked = true;
  }

  /** Resolves the (path, s) that lies `offset` units ahead along the route that will be travelled. */
  resolve(offset) {
    let id = this.pathId;
    let s = this.s + offset;
    const alt = this.alt;
    if (alt) {
      if (id === 'main' && this.altChosen && !this.altTaken && this.s <= alt.forkS && s > alt.forkS) {
        id = 'alt';
        s -= alt.forkS;
      }
      if (id === 'alt' && s > alt.path.length) {
        s = alt.mergeS + (s - alt.path.length);
        id = 'main';
      }
    }
    this._resolved.pathId = id;
    this._resolved.s = s;
    return this._resolved;
  }

  frameAhead(offset, out) {
    const r = this.resolve(offset);
    return this.pathById(r.pathId).frameAt(r.s, out);
  }

  /** How far ahead scenery may be generated (stops at an undecided fork). */
  lookaheadLimit() {
    if (this.alt && !this.decisionLocked && this.pathId === 'main' && this.s < this.alt.forkS) {
      return this.alt.forkS - this.s;
    }
    return Infinity;
  }

  update(dt) {
    this.speed = damp(this.speed, this.targetSpeed, this.speedLerp, dt);
    this.advance(this.speed * dt);
    this.pathById(this.pathId).frameAt(this.s, this.frame);
    this.velocity.copy(this.frame.forward).multiplyScalar(this.speed);
  }

  advance(ds) {
    this.s += ds;
    this.travel += ds;
    const alt = this.alt;
    if (alt && this.pathId === 'main' && this.altChosen && !this.altTaken && this.s >= alt.forkS) {
      this.pathId = 'alt';
      this.s -= alt.forkS;
      this.altTaken = true;
      if (this.onPathChange) this.onPathChange('alt');
    }
    if (alt && this.pathId === 'alt' && this.s >= alt.path.length) {
      this.s = alt.mergeS + (this.s - alt.path.length);
      this.pathId = 'main';
      if (this.onPathChange) this.onPathChange('merge');
    }
    const len = this.pathById(this.pathId).length;
    if (this.s >= len) {
      this.s = len;
      this.atEnd = true;
    }
  }
}

import * as THREE from 'three';
import { Enemy } from '../Enemy.js';
import { createRimMaterial } from '../../effects/materials.js';
import { hullFromOutline, symmetricOutline, finFromOutline, stripBetween } from '../models/shapes.js';
import { rand, damp, clamp } from '../../utils/math.js';

const _v = new THREE.Vector3();
const _target = new THREE.Vector3();
const AFTERIMAGES = 3;
const HUNTER_RIM = { value: new THREE.Color(0xff1a3a) }; // stealth hull: only a faint red silhouette

/**
 * Phase Hunter (Stage 2 only): black hull with red emissive lines. Fades out, telegraphs its
 * next position with a red marker, reappears there, and fires three converging shots.
 */
export class PhaseHunter extends Enemy {
  constructor(game) {
    super(game, 'phaseHunter');
  }

  buildModel(assets) {
    const G = assets.geometries;
    // per-instance materials so each hunter can fade independently
    this.hullMat = createRimMaterial(
      { color: 0x050507, metalness: 0.95, roughness: 0.2, transparent: true },
      HUNTER_RIM,
      { power: 3, strength: 0.6 },
    );
    this.lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1830).multiplyScalar(2.2), transparent: true });
    const g = new THREE.Group();
    // crescent blade body, dorsal crest, forward wing daggers and red seams (shared geometry,
    // per-instance materials so each hunter can phase out on its own)
    const parts = this.mergedModel(g, 'phase-hunter-v2', (b, A) => {
      const GG = A.geometries;
      b.add(hullFromOutline(symmetricOutline([[0, 2.4], [0.35, 1.2], [0.7, 0.3], [2.3, -0.9], [2.35, -1.25], [1.2, -0.8], [0.5, -1.3], [0, -0.9]]), 0.34, 0.06), 'hull');
      b.add(finFromOutline([[-1.0, 0], [1.4, 0], [-0.6, 0.55], [-1.0, 0.5]], 0.06), 'hull', { pos: [0, 0.14, 0] });
      b.addMirrored(GG.cone, 'hull', { pos: [2.25, 0, -0.1], rot: [-Math.PI / 2, 0, 0], scale: [0.09, 1.5, 0.09] });
      b.addMirrored(stripBetween([0.36, 0.19, -1.2], [2.3, 0.19, 0.88], 0.024, 0.025), 'line');
      b.addMirrored(stripBetween([0.52, 0.19, 1.28], [2.33, 0.19, 1.22], 0.024, 0.025), 'line');
      b.addMirrored(stripBetween([0.05, 0.2, -2.2], [0.5, 0.2, 1.1], 0.022, 0.025), 'line');
      b.add(GG.sphereLow, 'line', { pos: [0, 0.22, -1.45], scale: [0.2, 0.07, 0.28] });
    }, { hull: this.hullMat, line: this.lineMat });
    this.addEngine(g, [0, 0, 1.0], 0.18, 1.2, assets.materials.flameRed);

    // telegraph marker (lives in the rig frame, not attached to the hunter)
    this.markerMat = new THREE.MeshBasicMaterial({
      color: 0xff2040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.marker = new THREE.Mesh(G.ring, this.markerMat);
    this.marker.visible = false;
    this.marker.userData.noFlash = true;

    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0xff2040, wireframe: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ghosts = [];
    for (let i = 0; i < AFTERIMAGES; i++) {
      const ghost = new THREE.Mesh(parts.hull.geometry, this.ghostMat.clone());
      ghost.scale.setScalar(this.modelScale);
      ghost.visible = false;
      this.ghosts.push({ mesh: ghost, life: 0 });
    }
    return g;
  }

  spawn(opts) {
    if (!this.marker.parent) {
      this.game.rig.add(this.marker);
      for (const gh of this.ghosts) this.game.scene.add(gh.mesh);
    }
    super.spawn(opts);
  }

  onSpawn(opts) {
    const d = this.def;
    this.state = 'enter';
    this.stateTime = 0;
    this.holdZ = -(opts.hold ?? d.holdDistance);
    this.opacity = 1;
    this.next = new THREE.Vector3();
    this.lifeTime = opts.lifeTime ?? d.lifeTime;
    this.setOpacity(1);
  }

  setOpacity(a) {
    this.opacity = a;
    this.hullMat.opacity = a;
    this.lineMat.opacity = Math.min(1, a * 1.3);
    this.object.visible = a > 0.02;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  behave(dt) {
    const d = this.def;
    const L = this.local;
    this.stateTime += dt;
    this.updateGhosts(dt);

    switch (this.state) {
      case 'enter':
        L.z = damp(L.z, this.holdZ, 1.5, dt);
        if (Math.abs(L.z - this.holdZ) < 5) this.setState('visible');
        break;
      case 'visible':
        L.x += Math.sin(this.t * 2.5) * 4 * dt;
        if (this.stateTime > 0.5 && !this.firedThisCycle) {
          this.firedThisCycle = true;
          this.fireConverging();
        }
        if (this.stateTime > d.visibleTime) {
          if (this.t > this.lifeTime) {
            this.setState('leave');
          } else {
            this.setState('fading');
            this.invulnerable = true;
            this.game.audio.play('telegraph');
          }
        }
        break;
      case 'fading':
        this.setOpacity(clamp(1 - this.stateTime / d.fadeTime, 0, 1) * 0.9 + 0.1 * Math.random());
        if (Math.random() < 0.5) this.leaveGhost();
        if (this.stateTime > d.fadeTime) {
          this.setOpacity(0);
          this.pickNextPosition();
          this.setState('hidden');
        }
        break;
      case 'hidden':
        if (this.stateTime > d.hiddenTime) {
          this.marker.visible = true;
          this.setState('telegraph');
        }
        break;
      case 'telegraph': {
        const k = this.stateTime / d.telegraphTime;
        this.marker.position.copy(this.next);
        this.marker.scale.setScalar(4.5 - k * 3);
        this.marker.rotation.z += dt * 6;
        this.markerMat.color.setRGB(2.5, 0.2 + k, 0.4).multiplyScalar(0.6 + 0.4 * Math.sin(this.stateTime * 30));
        if (k >= 1) {
          this.marker.visible = false;
          L.copy(this.next);
          this.setOpacity(1);
          this.invulnerable = false;
          this.firedThisCycle = false;
          this.syncTransform();
          this.game.effects.burst(this.object.position, { count: 16, color: 0xff2040, speed: 12, life: 0.35 });
          this.setState('visible');
        }
        break;
      }
      case 'leave':
        L.z -= 80 * dt;
        if (L.z < -420) this.despawn();
        break;
    }
    this.faceLocal(0, 0, -1);
    this.model.rotation.z = Math.sin(this.t * 3) * 0.2;
  }

  pickNextPosition() {
    const p = this.game.player.local;
    const side = this.local.x > p.x ? -1 : 1;
    this.next.set(
      clamp(p.x + side * rand(6, 14), -18, 18),
      clamp(p.y + rand(-5, 6), -9, 10),
      -rand(45, 80),
    );
    this.marker.position.copy(this.next);
  }

  fireConverging() {
    if (!this.canFire(20)) return;
    const player = this.game.player.worldPosition;
    // three shots from spread-out points that meet at the player's current position
    const offsets = [[-3, 0], [3, 0], [0, 2.5]];
    for (const [ox, oy] of offsets) {
      _v.set(ox, oy, -1).applyMatrix4(this.object.matrixWorld);
      _target.copy(player);
      this.game.projectiles.fireEnemyAt(_v, _target, { speed: 32, color: 0xff2050 });
    }
    this.game.audio.play('enemyShoot');
  }

  leaveGhost() {
    const g = this.ghosts.find((x) => x.life <= 0);
    if (!g) return;
    g.life = 0.5;
    g.mesh.position.copy(this.object.position);
    g.mesh.quaternion.copy(this.object.quaternion);
    g.mesh.visible = true;
  }

  updateGhosts(dt) {
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      g.mesh.material.opacity = Math.max(0, g.life / 0.5);
      g.mesh.position.addScaledVector(this.game.rail.velocity, dt);
      if (g.life <= 0) g.mesh.visible = false;
    }
  }

  release() {
    this.marker.visible = false;
    for (const g of this.ghosts) {
      g.life = 0;
      g.mesh.visible = false;
    }
    super.release();
  }
}

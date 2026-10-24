import * as THREE from 'three';
import { Boss } from '../Boss.js';
import { BOSSES, PLAYER, OBSTACLES } from '../../config/gameConfig.js';
import { damp, rand, pick, clamp } from '../../utils/math.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const B = PLAYER.bounds;

/**
 * THE CRIMSON ARCHITECT — final boss, fused with its arena. Model faces +Z (the player).
 * Phase 1: four defence towers + punching arms.
 * Phase 2: towers gone -> sensor eyes open, crushing walls and lane beams reshape the arena.
 * Phase 3: core half exposed (reduced damage), projectile waves, reinforcements, alternating attacks.
 * Phase 4: core fully exposed, arena collapses, overload countdown ending in a charged blast
 *          that must be dodged (Shift i-frames) or absorbed by a shield.
 */
export class CrimsonArchitect extends Boss {
  constructor(game) {
    super(game, BOSSES.crimsonArchitect);
    this.phaseCount = 4;
    this.deathBlastSize = 12;
    this.deathDuration = 4.5;
    this.deathColor = 0xffa040;
    this.arms = [];
    this.walls = [];
    this.markers = [];
    this.build(game.assets);
    this.timers = { tower: 1.5, punch: 4, cannons: 3, wall: 2, beams: 5, eyes: 2, attack: 2, spawn: 6, chunk: 1, spiral: 0 };
    this.plateOpen = 0;
    this.eyeOpen = 0;
    this.attackIndex = 0;
    this.overload = null;
  }

  // ------------------------------------------------------------ model
  build(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const root = new THREE.Group();
    this.object.add(root);
    this.root = root;
    this.edgeGeo = new THREE.EdgesGeometry(G.box);

    this.buildArena(root, M, G);

    // the face: layered armour plates around a central core
    this.mesh(root, G.box, M.structureRed, [0, 0, -3], [0, 0, 0], [40, 28, 6]);
    this.mesh(root, G.box, M.hullRed, [0, 9, 1], [0.25, 0, 0], [30, 6, 3]);
    this.mesh(root, G.box, M.hullRed, [0, -11, 1], [-0.3, 0, 0], [26, 5, 3]);
    for (const s of [-1, 1]) {
      this.mesh(root, G.box, M.hullRed, [s * 15, 0, 0.5], [0, s * -0.35, 0], [8, 24, 3]);
      this.mesh(root, G.box, M.glowRed, [s * 11.2, 0, 2.3], [0, s * -0.35, 0], [0.25, 20, 0.25]);
      this.mesh(root, G.box, M.glowOrange, [s * 6, -8.6, 2.8], [0, 0, 0], [7, 0.2, 0.2]);
    }
    for (let i = 0; i < 5; i++) this.mesh(root, G.box, M.glowOrange, [0, -9.5 - i * 0.9, 2.6], [0, 0, 0], [12 - i * 1.6, 0.25, 0.3]);
    this.mesh(root, G.box, M.glowGold, [0, 12.2, 2.2], [0, 0, 0], [16, 0.3, 0.3]);

    // core behind four sliding plates
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, -2, 1);
    root.add(this.coreGroup);
    this.coreMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(3) }));
    this.mesh(this.coreGroup, G.sphere, this.coreMat, [0, 0, 0], [0, 0, 0], 3.2);
    this.mesh(this.coreGroup, G.sphere, M.glowWhite, [0, 0, 1.4], [0, 0, 0], 1.6);
    this.coreHalo = new THREE.Sprite(assets.spriteMaterial(0xff9a3a, 0.9));
    this.coreHalo.scale.setScalar(14);
    this.coreGroup.add(this.coreHalo);
    this.mesh(root, G.torusThick, M.hullGold, [0, -2, 2.2], [0, 0, 0], 4.4);
    this.plates = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pivot = new THREE.Group();
      pivot.position.set(0, -2, 4);
      pivot.rotation.z = a;
      const plate = this.mesh(pivot, G.box, M.hullRed, [2.3, 0, 0], [0, 0, 0], [4.6, 4.6, 1]);
      plate.userData.noFlash = true;
      const stripe = this.mesh(pivot, G.box, M.glowRed, [2.3, 0, 0.55], [0, 0, 0], [3.6, 0.2, 0.1]);
      stripe.userData.noFlash = true;
      root.add(pivot);
      this.plates.push({ pivot, angle: a });
    }

    // sensor eyes with shutters
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 8, 5, 1.5);
      root.add(eye);
      this.mesh(eye, G.torusThick, M.hullDark, [0, 0, 0], [0, 0, 0], 2.6);
      const mat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(3) }));
      this.mesh(eye, G.sphere, mat, [0, 0, 0], [0, 0, 0], 2);
      const halo = new THREE.Sprite(assets.spriteMaterial(0xff2a2a, 0.8));
      halo.scale.setScalar(8);
      eye.add(halo);
      const shutterTop = this.mesh(root, G.box, M.hullRed, [s * 8, 6.3, 3.5], [0, 0, 0], [5.6, 2.6, 0.8]);
      const shutterBottom = this.mesh(root, G.box, M.hullRed, [s * 8, 3.7, 3.5], [0, 0, 0], [5.6, 2.6, 0.8]);
      shutterTop.userData.noFlash = shutterBottom.userData.noFlash = true;
      this.eyes.push({ group: eye, mat, halo, side: s, shutterTop, shutterBottom });
    }

    // defence towers (phase 1 targets)
    this.towers = [];
    const towerPos = [[-16, 10], [16, 10], [-16, -10], [16, -10]];
    for (const [x, y] of towerPos) {
      const tower = new THREE.Group();
      tower.position.set(x, y, 2);
      root.add(tower);
      this.mesh(tower, G.cylinderHex, M.hullDark, [0, 0, 3], [Math.PI / 2, 0, 0], [2, 8, 2]);
      this.mesh(tower, G.torus, M.glowOrange, [0, 0, 6.5], [0, 0, 0], 2.2);
      this.mesh(tower, G.sphere, M.hullRed, [0, 0, 7.5], [0, 0, 0], 1.8);
      this.mesh(tower, G.cylinder, M.hull, [0, 0, 9.4], [Math.PI / 2, 0, 0], [0.4, 2.6, 0.4]);
      const tip = this.mesh(tower, G.sphereLow, M.glowOrange, [0, 0, 10.8], [0, 0, 0], 0.5);
      tip.userData.noFlash = true;
      this.towers.push(tower);
    }

    // face cannons (indestructible emitters)
    this.cannons = [[-5, 9.5], [5, 9.5], [-12, -6], [12, -6], [0, 12]].map(([x, y]) => {
      const c = new THREE.Group();
      c.position.set(x, y, 3);
      root.add(c);
      this.mesh(c, G.cylinder, M.hullDark, [0, 0, 0.8], [Math.PI / 2, 0, 0], [0.7, 2, 0.7]);
      this.mesh(c, G.sphereLow, M.glowRed, [0, 0, 1.9], [0, 0, 0], 0.45);
      return c;
    });

    for (const s of [-1, 1]) this.arms.push(this.buildArm(root, M, G, s));

    // parts
    this.towerParts = this.towers.map((tower) =>
      this.addPart({
        name: 'tower',
        node: tower,
        offset: [0, 0, 7.5],
        radius: 2.8,
        hp: this.cfg.towerHp,
        score: this.cfg.score.tower,
        onDestroyed: () => this.onTowerDestroyed(tower),
      }),
    );
    this.eyeParts = this.eyes.map((eye) =>
      this.addPart({
        name: 'eye',
        node: eye.group,
        radius: 2.6,
        hp: this.cfg.eyeHp,
        score: this.cfg.score.eye,
        vulnerable: () => this.phase >= 2 && this.eyeOpen > 0.8,
        onDestroyed: () => this.onEyeDestroyed(eye),
      }),
    );
    this.corePart = this.addPart({
      name: 'core',
      node: this.coreGroup,
      radius: 3.4,
      hp: this.cfg.coreHp,
      isCore: true,
      score: this.cfg.score.core,
      vulnerable: () => this.phase >= 3 && this.plateOpen > 0.3,
      onDestroyed: () => this.startDeath(),
    });
  }

  buildArena(root, M, G) {
    this.arena = new THREE.Group();
    root.add(this.arena);
    const wallMat = M.metalPlate;
    const len = 150;
    const zc = this.cfg.distance - len / 2 + 30; // walls reach from behind the boss to past the camera
    this.mesh(this.arena, G.box, wallMat, [-36, 0, zc], [0, 0, 0], [2, 50, len]);
    this.mesh(this.arena, G.box, wallMat, [36, 0, zc], [0, 0, 0], [2, 50, len]);
    this.mesh(this.arena, G.box, wallMat, [0, -22, zc], [0, 0, 0], [72, 2, len]);
    this.mesh(this.arena, G.box, wallMat, [0, 24, zc], [0, 0, 0], [72, 2, len]);
    for (let i = 0; i < 8; i++) {
      const z = zc - len / 2 + 10 + i * (len / 8);
      for (const s of [-1, 1]) {
        this.mesh(this.arena, G.box, M.glowRed, [s * 34.8, 0, z], [0, 0, 0], [0.2, 44, 0.4]);
      }
      this.mesh(this.arena, G.box, M.glowOrange, [0, -20.8, z], [0, 0, 0], [66, 0.2, 0.4]);
      this.mesh(this.arena, G.box, M.structureRed, [0, 22, z], [0, 0, 0], [70, 3, 3]);
    }
    // vector lines marking the defensive grid
    const lines = [];
    for (let i = -6; i <= 6; i++) lines.push(i * 5, -20.5, zc - len / 2, i * 5, -20.5, zc + len / 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.arena.add(new THREE.LineSegments(geo, M.lineRed));
    this.arenaLineGeo = geo;
  }

  buildArm(root, M, G, side) {
    const shoulder = new THREE.Vector3(side * 21, -4, 2);
    const base = this.mesh(root, G.sphere, M.hullDark, shoulder.toArray(), [0, 0, 0], 3);
    base.userData.noFlash = true;
    const segments = [];
    for (let i = 0; i < 6; i++) {
      const seg = this.mesh(root, G.box, i % 2 ? M.hullRed : M.hullDark, [0, 0, 0], [0, 0, 0], [2.4 - i * 0.2, 2.4 - i * 0.2, 5]);
      seg.userData.noFlash = true;
      segments.push(seg);
    }
    const hand = new THREE.Group();
    root.add(hand);
    this.mesh(hand, G.box, M.hullRed, [0, 0, 0], [0, 0, 0], [4, 4, 3]);
    const glowMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3020).multiplyScalar(1) }));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const claw = this.mesh(hand, G.cone, M.hull, [Math.cos(a) * 1.6, Math.sin(a) * 1.6, 2.6], [Math.PI / 2, 0, 0], [0.6, 3, 0.6]);
      claw.rotation.z = a;
    }
    this.mesh(hand, G.sphereLow, glowMat, [0, 0, 1.6], [0, 0, 0], 1.2);
    const rest = new THREE.Vector3(side * 26, -12, 14);
    hand.position.copy(rest);
    const arm = {
      side, shoulder, segments, hand, glowMat, rest,
      pos: rest.clone(), from: rest.clone(), target: new THREE.Vector3(),
      state: 'idle', t: 0,
    };
    arm.hazard = this.addHazard({ node: hand, radius: 3.6, damage: 1 });
    arm.hazard.active = false;
    arm.marker = this.createMarker();
    return arm;
  }

  createMarker() {
    const mat = this.own(new THREE.LineBasicMaterial({ color: 0xff2040, transparent: true, depthTest: false }));
    const marker = new THREE.Group();
    const outer = new THREE.LineLoop(this.game.assets.geometries.squareLine, mat);
    const inner = new THREE.LineLoop(this.game.assets.geometries.squareLine, mat);
    inner.scale.setScalar(0.5);
    inner.rotation.z = Math.PI / 4;
    marker.add(outer, inner);
    marker.visible = false;
    marker.renderOrder = 20;
    marker.userData.mat = mat;
    this.game.rig.add(marker);
    this.markers.push(marker);
    return marker;
  }

  /** Boss-local <-> rail-local helpers (the Architect never rotates, only translates). */
  toBossLocal(railLocal, out) {
    return out.copy(railLocal).sub(this.local);
  }

  // ------------------------------------------------------------ phases
  onTowerDestroyed(tower) {
    tower.visible = false;
    if (this.towerParts.every((p) => !p.alive) && this.phase === 1) this.setPhase(2);
  }

  onEyeDestroyed(eye) {
    eye.group.visible = false;
    if (this.eyeParts.every((p) => !p.alive) && this.phase === 2) this.setPhase(3);
  }

  checkPhase() {
    if (this.phase === 3 && this.corePart.hp / this.corePart.maxHp <= this.cfg.phase4CoreFraction) this.setPhase(4);
  }

  hitPart(part, amount, pos, charged) {
    // the half-open core in phase 3 only takes partial damage
    const scaled = part === this.corePart && this.phase === 3 ? amount * 0.6 : amount;
    const r = super.hitPart(part, scaled, pos, charged);
    if (part === this.corePart && r === 'hit') this.checkPhase();
    return r;
  }

  onPhase(n) {
    const hud = this.game.hud;
    if (n === 2) {
      hud.warning('TOWERS DESTROYED — SENSORS EXPOSED');
      this.timers.wall = 2.5;
      this.timers.beams = 5;
    } else if (n === 3) {
      hud.warning('CORE PARTIALLY EXPOSED');
      this.clearWalls();
      this.timers.attack = 2;
      this.timers.spawn = 4;
    } else if (n === 4) {
      hud.warning('CORE FULLY EXPOSED!');
      this.game.audio.setMusicIntensity(2);
      this.game.postfx.stageBloomFactor = 1.15;
      this.overload = { t: this.cfg.overloadCountdown, charging: false, chargeT: 0 };
    }
  }

  // ------------------------------------------------------------ behaviour
  updateEntrance(dt) {
    super.updateEntrance(dt);
    this.animate(dt);
    this.updateArms(dt);
  }

  behave(dt) {
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    const L = this.local;
    L.x = damp(L.x, Math.sin(this.t * 0.35) * (this.phase >= 4 ? 5 : 3), 1.5, dt);
    L.y = damp(L.y, Math.sin(this.t * 0.5) * 1.5, 1.5, dt);
    this.animate(dt);
    this.updateArms(dt);
    this.updateWalls(dt);

    const rate = this.game.difficulty.fireRate * (this.phase >= 4 ? 1.3 : 1);
    if (this.phase === 1) {
      if (T.tower <= 0) {
        T.tower = 1.7 / rate;
        this.towerVolley();
      }
      if (T.punch <= 0) {
        T.punch = 5.5 / rate;
        this.punch();
      }
      if (T.cannons <= 0) {
        T.cannons = 4.2 / rate;
        this.cannonSpread();
      }
    } else if (this.phase === 2) {
      if (T.eyes <= 0) {
        T.eyes = 2.2 / rate;
        this.eyeBurst();
      }
      if (T.wall <= 0) {
        T.wall = 7.5 / rate;
        this.crushWall();
      }
      if (T.beams <= 0) {
        T.beams = 6.5 / rate;
        this.laneBeams();
      }
      if (T.punch <= 0) {
        T.punch = 8 / rate;
        this.punch();
      }
    } else {
      this.alternatingAttacks(rate);
      if (T.spawn <= 0) {
        T.spawn = this.phase === 4 ? 9 : 11;
        this.reinforcements();
      }
      if (this.phase === 4) this.updateCollapse(dt, rate);
    }
  }

  animate(dt) {
    const targetPlates = this.phase >= 4 ? 1 : this.phase === 3 ? 0.5 : 0;
    this.plateOpen = damp(this.plateOpen, targetPlates, 1.2, dt);
    for (const p of this.plates) {
      const d = this.plateOpen * 4.5;
      p.pivot.position.set(Math.cos(p.angle) * d, -2 + Math.sin(p.angle) * d, 4 + this.plateOpen);
    }
    this.eyeOpen = damp(this.eyeOpen, this.phase >= 2 ? 1 : 0, 2, dt);
    for (const eye of this.eyes) {
      eye.shutterTop.position.y = 6.3 + this.eyeOpen * 2.8;
      eye.shutterBottom.position.y = 3.7 - this.eyeOpen * 2.8;
      const flick = 0.7 + 0.3 * Math.sin(this.t * 7 + eye.side);
      eye.mat.color.setRGB(3 * flick, 0.25, 0.2);
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (this.phase >= 4 ? 12 : 3));
    const charge = this.overload?.charging ? this.overload.chargeT : 0;
    this.coreMat.color.setRGB(1, 0.55 + charge * 0.4, 0.2 + charge * 0.8).multiplyScalar(2 + pulse * 1.5 + charge * 4);
    this.coreHalo.scale.setScalar(12 + pulse * 4 + charge * 30);
    for (const tower of this.towers) tower.children[1].rotation.z = this.t * 2;
    // the arena is part of the boss but must not sway with it
    this.arena.position.set(-this.local.x, -this.local.y, 0);
  }

  // ------------------------------------------------------------ phase 1 attacks
  towerVolley() {
    this.towers.forEach((tower, i) => {
      if (!this.towerParts[i].alive) return;
      tower.localToWorld(_v.set(0, 0, 11));
      this.fireAt(_v, { speed: 28, size: 1.1 });
    });
    this.game.audio.play('enemyShoot');
  }

  cannonSpread() {
    const c = pick(this.cannons);
    c.localToWorld(_v.set(0, 0, 2));
    this.fireFan(_v, 7, 1.0, { speed: 24 });
  }

  punch() {
    const idle = this.arms.filter((a) => a.state === 'idle');
    if (!idle.length || !this.canAttack()) return;
    const arm = pick(idle);
    const p = this.game.player.local;
    arm.targetRail = new THREE.Vector3(clamp(p.x, -B.x, B.x), clamp(p.y, -B.y, B.y), 0);
    arm.state = 'aim';
    arm.t = 0;
    arm.from.copy(arm.pos);
    arm.marker.visible = true;
    arm.marker.position.set(arm.targetRail.x, arm.targetRail.y, -6);
    this.game.audio.play('telegraph');
  }

  updateArms(dt) {
    for (const arm of this.arms) {
      arm.t += dt;
      switch (arm.state) {
        case 'aim': {
          // raise the fist behind the target lane while the marker blinks
          this.toBossLocal(arm.targetRail, _w);
          _w.z = 30;
          arm.pos.lerpVectors(arm.from, _w, Math.min(1, arm.t / 1.2));
          const blink = Math.sin(arm.t * 25) > 0;
          arm.marker.userData.mat.opacity = blink ? 1 : 0.3;
          arm.marker.scale.setScalar(5.5 - Math.min(arm.t, 1.3));
          arm.glowMat.color.setRGB(3, 0.3, 0.2).multiplyScalar(0.5 + arm.t);
          if (arm.t > 1.35) {
            arm.state = 'strike';
            arm.t = 0;
            arm.from.copy(arm.pos);
            arm.hazard.active = true;
          }
          break;
        }
        case 'strike': {
          this.toBossLocal(arm.targetRail, _w);
          _w.z += 3; // punch through the player's plane
          arm.pos.lerpVectors(arm.from, _w, Math.min(1, arm.t / 0.3));
          if (arm.t > 0.3) {
            arm.state = 'hold';
            arm.t = 0;
            arm.marker.visible = false;
            this.game.cameraRig.shake(0.35);
            this.game.audio.play('explosionSmall');
          }
          break;
        }
        case 'hold':
          if (arm.t > 0.25) {
            arm.state = 'retract';
            arm.t = 0;
            arm.from.copy(arm.pos);
            arm.hazard.active = false;
          }
          break;
        case 'retract':
          arm.pos.lerpVectors(arm.from, arm.rest, Math.min(1, arm.t / 1));
          arm.glowMat.color.setRGB(1, 0.2, 0.1);
          if (arm.t > 1) arm.state = 'idle';
          break;
        default:
          arm.pos.copy(arm.rest).add(_v.set(0, Math.sin(this.t + arm.side) * 1.5, 0));
      }
      this.layoutArm(arm);
    }
  }

  layoutArm(arm) {
    arm.hand.position.copy(arm.pos);
    const n = arm.segments.length;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const seg = arm.segments[i];
      seg.position.lerpVectors(arm.shoulder, arm.pos, k);
      seg.position.y += Math.sin(k * Math.PI) * 3; // slight elbow arc
      seg.lookAt(_v.copy(arm.pos).applyMatrix4(this.root.matrixWorld));
      const span = arm.shoulder.distanceTo(arm.pos) / n;
      seg.scale.z = span * 1.1;
    }
    arm.hand.lookAt(_v.set(arm.pos.x, arm.pos.y, arm.pos.z + 10).applyMatrix4(this.root.matrixWorld));
  }

  // ------------------------------------------------------------ phase 2 attacks
  eyeBurst() {
    this.eyes.forEach((eye, i) => {
      if (!this.eyeParts[i].alive) return;
      eye.group.localToWorld(_v.set(0, 0, 2.2));
      this.fireFan(_v, 3, 0.25, { speed: 32 });
    });
  }

  /** A slab slides into one half of the play field after a clear outline warning. */
  crushWall() {
    if (!this.canAttack()) return;
    const p = this.game.player.local;
    const vertical = Math.random() < 0.6;
    const sideSign = vertical ? (p.x >= 0 ? 1 : -1) : p.y >= 0 ? 1 : -1;
    const size = vertical ? new THREE.Vector3(20, 30, 12) : new THREE.Vector3(40, 12, 12);
    const final = vertical ? new THREE.Vector3(sideSign * 11, 0, -2) : new THREE.Vector3(0, sideSign * 7, -2);
    const start = vertical ? new THREE.Vector3(sideSign * 45, 0, -2) : new THREE.Vector3(0, sideSign * 36, -2);
    const M = this.game.assets.materials;

    const slab = new THREE.Mesh(this.game.assets.geometries.box, M.structureRed);
    slab.scale.copy(size);
    slab.position.copy(start);
    const edges = new THREE.LineSegments(this.edgeGeo, M.lineRed);
    slab.add(edges);
    const outline = new THREE.LineSegments(this.edgeGeo, M.lineWarning);
    outline.scale.copy(size);
    outline.position.copy(final);
    this.game.rig.add(outline);

    const wall = { slab, outline, start, final, t: 0, warn: 1.5, inTime: 0.35, hold: 2.3, outTime: 0.6 };
    wall.obstacle = this.game.obstacles.add(slab, {
      local: true,
      colliders: [{ type: 'box', node: slab, enabled: false }],
      damage: 1,
      blocksShots: false,
    });
    this.walls.push(wall);
    this.game.hud.warning('WALL CLOSING IN!', 1.3);
    this.game.audio.play('warning');
  }

  updateWalls(dt) {
    for (let i = this.walls.length - 1; i >= 0; i--) {
      const w = this.walls[i];
      w.t += dt;
      const collider = w.obstacle.colliders[0];
      if (w.t < w.warn) {
        w.outline.visible = Math.sin(w.t * 22) > -0.2;
      } else if (w.t < w.warn + w.inTime) {
        w.outline.visible = false;
        collider.enabled = true;
        w.slab.position.lerpVectors(w.start, w.final, (w.t - w.warn) / w.inTime);
        if (w.t - dt < w.warn) this.game.cameraRig.shake(0.3);
      } else if (w.t < w.warn + w.inTime + w.hold) {
        w.slab.position.copy(w.final);
      } else if (w.t < w.warn + w.inTime + w.hold + w.outTime) {
        const k = (w.t - w.warn - w.inTime - w.hold) / w.outTime;
        w.slab.position.lerpVectors(w.final, w.start, k);
        if (k > 0.3) collider.enabled = false;
      } else {
        this.removeWall(w);
        this.walls.splice(i, 1);
      }
    }
  }

  removeWall(w) {
    this.game.obstacles.remove(w.obstacle);
    if (w.outline.parent) w.outline.parent.remove(w.outline);
  }

  clearWalls() {
    for (const w of this.walls) this.removeWall(w);
    this.walls.length = 0;
  }

  /** Horizontal or vertical beams across the player plane, always leaving a safe lane. */
  laneBeams() {
    if (!this.canAttack()) return;
    const horizontal = Math.random() < 0.5;
    const lanes = horizontal ? [-6, 0, 6] : [-10, 0, 10];
    const safe = Math.floor(Math.random() * lanes.length);
    lanes.forEach((lane, i) => {
      if (i === safe) return;
      const start = horizontal ? new THREE.Vector3(-40, lane, -1) : new THREE.Vector3(lane, -30, -1);
      const end = horizontal ? new THREE.Vector3(40, lane, -1) : new THREE.Vector3(lane, 30, -1);
      this.game.obstacles.fireBeam({ start, end, local: true, warn: 1.5, fire: 1.1, radius: 1.8, color: 0xff3a1a });
    });
    this.game.audio.play('telegraph');
  }

  // ------------------------------------------------------------ phase 3 & 4 attacks
  alternatingAttacks(rate) {
    const T = this.timers;
    if (this.spiralLeft > 0) {
      if (T.spiral <= 0) {
        T.spiral = 0.16;
        this.spiralLeft--;
        this.coreGroup.localToWorld(_v.set(0, 0, 3.5));
        this.fireRing(_v, 8, { speed: 20, size: 1.05 }, this.t * 2.2, 0.5);
      }
      return;
    }
    if (T.attack > 0) return;
    const sequence = ['spiral', 'punch', 'fan', 'beams'];
    const attack = sequence[this.attackIndex++ % sequence.length];
    T.attack = (attack === 'spiral' ? 4 : 3) / rate;
    if (attack === 'spiral') this.spiralLeft = this.phase === 4 ? 16 : 11;
    else if (attack === 'punch') this.punch();
    else if (attack === 'beams') this.laneBeams();
    else {
      for (const c of this.cannons) {
        c.localToWorld(_v.set(0, 0, 2));
        this.fireFan(_v, 3, 0.3, { speed: 28 });
      }
    }
  }

  reinforcements() {
    if (!this.canAttack()) return;
    if (this.phase === 4 || Math.random() < 0.5) {
      this.game.enemies.spawn('phaseHunter', { local: new THREE.Vector3(rand(-12, 12), rand(-4, 6), -140), hold: 55, lifeTime: 10 });
    } else {
      this.game.enemies.spawnWave({ enemy: 'scout', formation: 'V', count: 4, z: -110, pattern: 'dive', y: 12, opts: { speed: 50 } });
    }
  }

  /** Phase 4: falling debris and the overload countdown. */
  updateCollapse(dt, rate) {
    const T = this.timers;
    if (T.chunk <= 0) {
      T.chunk = 1.8 / rate;
      this.dropChunk();
    }
    if (Math.random() < 0.3) {
      _v.set(rand(-34, 34), 22, rand(-40, 20)).applyMatrix4(this.game.rig.matrixWorld);
      this.game.effects.trail(_v, 0xff7a2a, 1.5, 0.9);
    }
    const o = this.overload;
    if (!o) return;
    if (!o.charging) {
      o.t -= dt;
      this.game.hud.setCountdown(`CORE OVERLOAD`, Math.max(0, o.t));
      if (o.t <= 0) {
        o.charging = true;
        o.chargeT = 0;
        this.game.hud.warning('FINAL ATTACK — DODGE (SHIFT)!', 2.4);
        this.game.audio.play('alert');
      }
    } else {
      o.chargeT += dt / 2.5;
      this.game.hud.setCountdown('DODGE NOW!', Math.max(0, 2.5 - o.chargeT * 2.5));
      this.game.cameraRig.shake(0.05 + o.chargeT * 0.1);
      if (o.chargeT >= 1) {
        this.overloadBlast();
        o.charging = false;
        o.chargeT = 0;
        o.t = this.cfg.overloadRepeat;
      }
    }
  }

  overloadBlast() {
    const game = this.game;
    game.postfx.setWhite(0.85, true);
    game.postfx.setWhite(0);
    game.postfx.pulseChromatic(0.1);
    game.cameraRig.shake(1);
    game.audio.play('explosionHuge');
    this.coreGroup.getWorldPosition(_v);
    game.effects.shockwave(_v, { radius: 120, duration: 1, color: 0xffd0a0 });
    const p = game.player;
    if (p.isDodging || p.dodgeInvuln > 0) {
      game.hud.toast('PERFECT DODGE!', '#6dffb0');
      game.addScore(5000, p.worldPosition);
    } else {
      p.hit(2);
    }
  }

  dropChunk() {
    if (!this.canAttack()) return;
    const x = clamp(this.game.player.local.x + rand(-6, 6), -B.x, B.x);
    const marker = this.createTemporaryMarker(x);
    const G = this.game.assets.geometries;
    const chunk = new THREE.Mesh(G.asteroids[Math.floor(Math.random() * 4)], this.game.assets.materials.structureRed);
    chunk.scale.setScalar(rand(2.2, 3.2));
    chunk.position.set(x, 34, -2);
    const state = { t: 0, delay: 1.0, speed: rand(28, 36), marker };
    this.game.obstacles.add(chunk, {
      local: true,
      colliders: [{ type: 'sphere', node: chunk, radius: chunk.scale.x * 0.85 }],
      damage: 1,
      hp: OBSTACLES.fallingChunk.hp,
      score: OBSTACLES.fallingChunk.score,
      dropChance: OBSTACLES.fallingChunk.dropChance,
      onDestroyed: () => marker.parent && marker.parent.remove(marker),
      update: (dt, obs) => {
        state.t += dt;
        if (state.t < state.delay) {
          marker.visible = Math.sin(state.t * 30) > 0;
          return;
        }
        marker.visible = false;
        chunk.position.y -= state.speed * dt;
        chunk.rotation.x += dt * 2;
        chunk.rotation.z += dt;
        if (chunk.position.y < -34) {
          if (marker.parent) marker.parent.remove(marker);
          this.game.obstacles.remove(obs);
        }
      },
    });
  }

  createTemporaryMarker(x) {
    const M = this.game.assets.materials;
    const geo = this.game.assets.geometries.box;
    const marker = new THREE.Mesh(geo, M.dimRed);
    marker.scale.set(0.3, 40, 0.3);
    marker.position.set(x, 0, -2);
    this.game.rig.add(marker);
    this.markers.push(marker);
    return marker;
  }

  // ------------------------------------------------------------ death & cleanup
  startDeath() {
    this.clearWalls();
    for (const arm of this.arms) arm.marker.visible = false;
    this.game.hud.setCountdown(null);
    super.startDeath();
  }

  deathAnimation(dt, k) {
    this.root.rotation.z = Math.sin(this.deathTime * 20) * 0.02 * k;
    this.local.y -= dt * k * 4;
  }

  dispose() {
    this.clearWalls();
    for (const m of this.markers) if (m.parent) m.parent.remove(m);
    this.edgeGeo.dispose();
    this.arenaLineGeo.dispose();
    this.game.hud.setCountdown(null);
    super.dispose();
  }
}

import * as THREE from 'three';
import { Boss } from '../Boss.js';
import { BOSSES } from '../../config/gameConfig.js';
import { damp, rand, randSign } from '../../utils/math.js';
import { createShieldMaterial } from '../../effects/materials.js';

const _v = new THREE.Vector3();
const _target = new THREE.Vector3();

/**
 * NEBULA WARDEN — Stage 1 guardian. Model faces +Z (towards the player).
 * Phase 1: shielded core, fan-firing wing cannons, drone launches (shield drops briefly after).
 * Phase 2: shield shatters, wings open, focused streams and drifting mines.
 * Phase 3: armour opens, faster movement, telegraphed core beam, hull bursts.
 */
export class NebulaWarden extends Boss {
  constructor(game) {
    super(game, BOSSES.nebulaWarden);
    this.phaseCount = 3;
    this.deathBlastSize = 5;
    this.deathColor = 0xd9a0ff;
    this.build(game.assets);
    this.timers = { fan: 2, drones: 6, shield: 0, stream: 2, mines: 4, beam: 3, ring: 5, burst: 0.5 };
    this.shieldUp = true;
    this.shieldWarn = 0;
    this.wingOpen = 0;
    this.armorOpen = 0;
    this.moveSpeed = 0.5;
  }

  // ------------------------------------------------------------ model
  build(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const root = new THREE.Group();
    root.scale.setScalar(this.scale);
    this.object.add(root);
    this.root = root;

    // hull: elongated flattened hexagon prism
    const hex = new THREE.Shape();
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const x = Math.cos(a) * 4.2;
      const y = Math.sin(a) * 2.6;
      if (i === 0) hex.moveTo(x, y);
      else hex.lineTo(x, y);
    }
    const hullGeo = new THREE.ExtrudeGeometry(hex, { depth: 12, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1 });
    hullGeo.translate(0, 0, -6.5);
    const hull = this.mesh(root, hullGeo, M.hullLight);
    hull.castShadow = true;
    this.mesh(root, G.box, M.hullViolet, [0, 2.8, -1], [0, 0, 0], [3, 1.2, 8]);
    this.mesh(root, G.box, M.hullViolet, [0, -2.8, -1], [0, 0, 0], [3, 1.2, 8]);
    for (const y of [-1.2, 0, 1.2]) this.mesh(root, G.box, M.glowViolet, [0, y, 6.1], [0, 0, 0], [7.4, 0.12, 0.12]);
    for (const s of [-1, 1]) {
      this.mesh(root, G.box, M.glowViolet, [s * 3.9, 0, 0], [0, 0, 0], [0.12, 0.35, 10]);
      this.mesh(root, G.box, M.glowMagenta, [s * 1.6, 3.45, -1], [0, 0, 0], [0.1, 0.1, 7]);
    }

    // core
    this.coreGroup = new THREE.Group();
    this.coreGroup.position.set(0, 0, 5.6);
    root.add(this.coreGroup);
    this.coreMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd24dff).multiplyScalar(3) }));
    this.core = this.mesh(this.coreGroup, G.sphere, this.coreMat, [0, 0, 0], [0, 0, 0], 1.7);
    this.mesh(this.coreGroup, G.sphere, M.glowWhite, [0, 0, 0.6], [0, 0, 0], 0.9);
    this.coreHalo = new THREE.Sprite(assets.spriteMaterial(0xd24dff, 0.9));
    this.coreHalo.scale.setScalar(9);
    this.coreGroup.add(this.coreHalo);
    this.mesh(root, G.torusThick, M.hull, [0, 0, 6], [0, 0, 0], 2.6);
    this.mesh(root, G.torus, M.glowViolet, [0, 0, 6.3], [0, 0, 0], 2.9);

    // armour plates in front of the core
    this.plates = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 7);
      pivot.rotation.z = a;
      const plate = this.mesh(pivot, G.box, M.hull, [0.4, 0, 0], [0, 0, 0], [1.8, 2.6, 0.4]);
      plate.userData.noFlash = true;
      root.add(pivot);
      this.plates.push({ pivot, angle: a });
    }

    // frontal shield dome
    this.shieldMat = this.own(createShieldMaterial(0xb070ff, { hexTexture: assets.textures.hex, intensity: 2 }));
    const domeGeo = new THREE.SphereGeometry(4.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    this.shield = this.mesh(root, domeGeo, this.shieldMat, [0, 0, 5.2], [Math.PI / 2, 0, 0], [1, 1, 0.8]);
    this.shield.userData.noFlash = true;

    // articulated wings with cannons at the tips
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 4, 0, 0.5);
      root.add(pivot);
      const pts = [[0, -5], [13, -2.5], [13.5, 1], [2, 4.5], [0, 4.5]];
      const shape = new THREE.Shape();
      const ordered = s > 0 ? pts : [...pts].reverse();
      ordered.forEach(([x, y], i) => (i ? shape.lineTo(x * s, y) : shape.moveTo(x * s, y)));
      const wingGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false });
      wingGeo.translate(0, 0, -0.35);
      const wing = this.mesh(pivot, wingGeo, M.hullLight, [0, 0, 0], [-Math.PI / 2, 0, 0]);
      wing.castShadow = true;
      this.mesh(pivot, G.box, M.glowViolet, [s * 7, 0.4, 3.6], [0, s * -0.26, 0], [11, 0.15, 0.2]);
      this.mesh(pivot, G.box, M.glowMagenta, [s * 6.5, 0.4, -1.2], [0, s * 0.18, 0], [9, 0.1, 0.12]);

      const cannon = new THREE.Group();
      cannon.position.set(s * 12.4, 0, 1.5);
      pivot.add(cannon);
      this.mesh(cannon, G.cylinderHex, M.hullDark, [0, 0, 0], [0, 0, 0], [1.4, 2.4, 1.4]);
      for (const b of [-0.5, 0.5]) {
        this.mesh(cannon, G.cylinder, M.hull, [b, 0, 2], [Math.PI / 2, 0, 0], [0.3, 3, 0.3]);
        this.mesh(cannon, G.sphereLow, M.glowMagenta, [b, 0, 3.6], [0, 0, 0], 0.32);
      }
      const light = this.mesh(cannon, G.sphereLow, M.glowMagenta, [0, 1.3, 0.3], [0, 0, 0], [0.5, 0.2, 0.5]);
      light.userData.noFlash = true;
      this.wings.push({ pivot, cannon, side: s });
    }

    // thrusters
    for (const x of [-2.2, 0, 2.2]) {
      const flame = this.mesh(root, G.cone, M.flameViolet, [x, 0, -8.5], [-Math.PI / 2, 0, 0], [0.9, 4, 0.9]);
      flame.userData.noFlash = true;
      const halo = new THREE.Sprite(assets.spriteMaterial(0xa25cff, 0.9));
      halo.position.set(x, 0, -7);
      halo.scale.setScalar(5);
      root.add(halo);
    }

    // parts (shield first so it blocks shots aimed at the core)
    this.shieldPart = this.addPart({ name: 'shield', node: root, offset: [0, 0, 7], radius: 4.6, blocker: true });
    this.corePart = this.addPart({
      name: 'core',
      node: this.coreGroup,
      radius: 2.2,
      hp: this.cfg.coreHp,
      isCore: true,
      vulnerable: () => !this.shieldUp,
      onDestroyed: () => this.startDeath(),
      score: this.cfg.score.core,
    });
    this.cannonParts = this.wings.map((w) =>
      this.addPart({
        name: `cannon${w.side}`,
        node: w.cannon,
        offset: [0, 0, 1],
        radius: 2.4,
        hp: this.cfg.cannonHp,
        score: this.cfg.score.cannon,
        onDestroyed: () => this.onCannonDestroyed(w),
      }),
    );
    this.addHazard({ node: root, offset: [0, 0, 0], radius: 5, damage: 1 });
    for (const w of this.wings) this.addHazard({ node: w.pivot, offset: [w.side * 7, 0, 0], radius: 2.5 });
  }

  onCannonDestroyed(wing) {
    wing.cannon.visible = false;
    wing.burning = true;
    if (this.cannonParts.every((p) => !p.alive) && this.phase === 1) this.setPhase(2);
  }

  // ------------------------------------------------------------ phases
  onPhase(n) {
    if (n === 2) {
      this.setShield(false);
      this.game.effects.explosion(this.shieldPart.center, { size: 3, color: 0xb070ff, debris: false });
      this.game.effects.burst(this.shieldPart.center, { count: 60, color: 0xb070ff, speed: 20, life: 0.8, size: 1.4 });
      this.shieldPart.alive = false;
      this.game.hud.warning('SHIELD DESTROYED — ATTACK THE CORE');
      this.timers.stream = 1.5;
      this.timers.mines = 3;
    } else if (n === 3) {
      this.game.hud.warning('CORE EXPOSED');
      this.moveSpeed = 0.9;
      this.timers.beam = 2;
      this.timers.ring = 4;
    }
  }

  checkPhase() {
    const f = this.corePart.hp / this.corePart.maxHp;
    if (this.phase === 1 && f <= this.cfg.phase2CoreFraction) this.setPhase(2);
    if (this.phase === 2 && f <= this.cfg.phase3CoreFraction) this.setPhase(3);
  }

  onPartDestroyed() {
    this.checkPhase();
  }

  hitPart(part, amount, pos, charged) {
    const result = super.hitPart(part, amount, pos, charged);
    if (part === this.corePart && result === 'hit') this.checkPhase();
    return result;
  }

  setShield(on) {
    this.shieldUp = on;
    this.shield.visible = on;
    this.shieldPart.collidable = on;
  }

  // ------------------------------------------------------------ behaviour
  behave(dt) {
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    const L = this.local;
    const amp = this.phase === 3 ? 11 : 6;
    L.x = damp(L.x, Math.sin(this.t * this.moveSpeed) * amp, 2, dt);
    L.y = damp(L.y, Math.sin(this.t * this.moveSpeed * 1.4) * (this.phase === 3 ? 4 : 2.5), 2, dt);
    L.z = damp(L.z, -this.cfg.distance + (this.phase === 3 ? Math.sin(this.t * 0.8) * 8 : 0), 1, dt);
    this.localQuat.setFromEuler(_euler.set(0, Math.sin(this.t * this.moveSpeed) * -0.12, Math.cos(this.t * this.moveSpeed) * 0.08));

    this.animateModel(dt);
    if (this.phase === 1) this.phase1(dt);
    else if (this.phase === 2) this.phase2(dt);
    else this.phase3();
  }

  animateModel(dt) {
    this.wingOpen = damp(this.wingOpen, this.phase >= 2 ? 1 : 0, 1.5, dt);
    this.armorOpen = damp(this.armorOpen, this.phase >= 3 ? 1 : 0, 1.2, dt);
    for (const w of this.wings) {
      w.pivot.rotation.y = w.side * (0.45 - this.wingOpen * 0.6) + Math.sin(this.t * 1.5) * 0.03;
      w.pivot.rotation.z = w.side * this.wingOpen * 0.18;
      if (w.burning && Math.random() < 0.3) {
        w.pivot.localToWorld(_v.set(w.side * 12, 0, 1.5));
        this.game.effects.trail(_v, 0xff8a2a, 2, 0.6);
      }
    }
    for (const p of this.plates) {
      p.pivot.position.set(Math.cos(p.angle) * (1.4 + this.armorOpen * 2.2), Math.sin(p.angle) * (1.4 + this.armorOpen * 2.2), 7 - this.armorOpen * 1.2);
      p.pivot.rotation.y = this.armorOpen * 0.9;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.t * (this.phase === 3 ? 9 : 4));
    this.coreMat.color.setRGB(0.82, 0.3, 1).multiplyScalar(2.2 + pulse * 1.6);
    this.coreHalo.scale.setScalar(8 + pulse * 3);

    // shield warn flicker before a window opens
    if (this.phase === 1) {
      const flicker = this.shieldWarn > 0 ? (Math.sin(this.t * 40) > 0 ? 1 : 0.2) : 1;
      this.shieldMat.uniforms.uOpacity.value = flicker;
    }
    this.shieldMat.uniforms.uTime.value = this.t;
  }

  cannonMuzzle(w, out) {
    return w.cannon.localToWorld(out.set(0, 0, 3.8));
  }

  phase1(dt) {
    const T = this.timers;
    if (T.fan <= 0) {
      T.fan = 2.4 / this.game.difficulty.fireRate;
      for (const [i, w] of this.wings.entries()) {
        if (!this.cannonParts[i].alive) continue;
        this.fireFan(this.cannonMuzzle(w, _v), 7, 0.85, { speed: 24, size: 1.1 });
      }
    }
    if (T.drones <= 0) {
      T.drones = 8;
      this.launchDrones(4);
      this.shieldWarn = 0.7;
    }
    if (this.shieldWarn > 0) {
      this.shieldWarn -= dt;
      if (this.shieldWarn <= 0) {
        this.setShield(false);
        T.shield = this.cfg.shieldWindow;
        this.shieldOpenWindow = true;
        this.game.hud.warning('SHIELD OPENING!', 1.2);
      }
    } else if (this.shieldOpenWindow && T.shield <= 0) {
      this.shieldOpenWindow = false;
      this.setShield(true);
      this.game.audio.play('shield');
    }
  }

  phase2(dt) {
    const T = this.timers;
    if (T.stream <= 0) {
      T.stream = 3.2 / this.game.difficulty.fireRate;
      this.streamShots = 8;
      this.streamTimer = 0;
    }
    if (this.streamShots > 0) {
      this.streamTimer -= dt;
      if (this.streamTimer <= 0) {
        this.streamTimer = 0.09;
        this.streamShots--;
        this.coreGroup.localToWorld(_v.set(0, 0, 2));
        this.fireAt(_v, { speed: 38, color: 0xff5ae0 });
        this.game.audio.play('enemyShoot');
      }
    }
    if (T.mines <= 0) {
      T.mines = 6;
      for (let i = 0; i < 3; i++) {
        this.game.enemies.spawn('mine', {
          mode: 'local',
          local: new THREE.Vector3(this.local.x + (i - 1) * 7, this.local.y + rand(-3, 3), this.local.z + 8),
          speed: 13,
          score: 100,
        });
      }
    }
    if (T.fan <= 0) {
      T.fan = 3.4 / this.game.difficulty.fireRate;
      for (const [i, w] of this.wings.entries()) {
        if (this.cannonParts[i].alive) this.fireFan(this.cannonMuzzle(w, _v), 5, 0.6, { speed: 26 });
      }
    }
  }

  phase3() {
    const T = this.timers;
    if (T.beam <= 0) {
      T.beam = 6.5 / this.game.difficulty.fireRate;
      this.fireCoreBeam();
    }
    if (T.ring <= 0) {
      T.ring = 3.6 / this.game.difficulty.fireRate;
      this.coreGroup.localToWorld(_v.set(0, 0, 2));
      this.fireRing(_v, 14, { speed: 22, size: 1.1 }, this.t);
    }
    if (T.fan <= 0) {
      T.fan = 2.2 / this.game.difficulty.fireRate;
      this.coreGroup.localToWorld(_v.set(0, 0, 2));
      this.fireFan(_v, 5, 0.5, { speed: 30 });
    }
    if (T.burst <= 0) {
      T.burst = rand(0.35, 0.8);
      _v.set(rand(-8, 8), rand(-2, 2), rand(-5, 5)).applyMatrix4(this.object.matrixWorld);
      this.game.effects.explosion(_v, { size: 1, sound: false, shake: false });
    }
  }

  launchDrones(n) {
    for (let i = 0; i < n; i++) {
      this.game.enemies.spawn('scout', {
        local: new THREE.Vector3(this.local.x + randSign() * rand(2, 5), this.local.y + rand(-2, 2), this.local.z + 6),
        pattern: 'drone',
        speed: 40,
        hpScale: 0.5,
        score: 50,
      });
    }
    this.game.audio.play('telegraph');
  }

  fireCoreBeam() {
    // lock the target lane now; the beam fires after a clear warning
    const p = this.game.player.local;
    _target.set(p.x, p.y, 0);
    const start = new THREE.Vector3(this.local.x, this.local.y, this.local.z + 6);
    const end = _target.clone().sub(start).setLength(160).add(start);
    this.game.obstacles.fireBeam({ start, end, local: true, warn: 1.3, fire: 0.9, radius: 1.6, color: 0xd24dff });
    this.game.audio.play('telegraph');
  }
}

const _euler = new THREE.Euler();

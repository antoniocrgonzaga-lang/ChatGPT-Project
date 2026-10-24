import * as THREE from 'three';
import { Boss } from '../Boss.js';
import { ContainmentGrid } from '../ContainmentGrid.js';
import { BOSSES } from '../../config/gameConfig.js';
import { createShieldMaterial } from '../../effects/materials.js';
import { damp, rand, TAU } from '../../utils/math.js';

const _v = new THREE.Vector3();
const GREEN = 0x35ff8a;
const PYLONS = 4;
const PETALS = 4;
// pylon ring radius (design units): small enough that the pylons stay inside the area the
// player's shots can reach (about ±25 x ±17 at boss distance) at every angle of the turning ring
const RING_R = 12;

/**
 * ABYSSAL MATRIARCH — Stage 4 guardian, the mind of the mothership LEVIATÃ: a spherical core
 * with a green iris, closed behind four armoured petals and circled by a containment ring.
 * Model faces +Z (towards the player).
 * Phase 1: four ring pylons project a hex shield over the core and fire in turn; side bays launch drones.
 * Phase 2: the shield is down, the petals open halfway and expose four nodes; containment grids,
 *          node fans and rotating streams.
 * Phase 3: the petals fold back, the core is exposed; faster grids, spirals, iris volleys, interceptors.
 */
export class AbyssalMatriarch extends Boss {
  constructor(game) {
    super(game, BOSSES.abyssalMatriarch);
    this.phaseCount = 3;
    this.deathBlastSize = 10;
    this.deathDuration = 4.8;
    this.deathColor = 0x9affc8;
    this.grids = [];
    this.open = 0;
    this.pylonIndex = 0;
    this.streamLeft = 0;
    this.streamTimer = 0;
    this.timers = { pylon: 1.2, ring: 3.5, drones: 6, grid: 3, fan: 2, stream: 4.5, spiral: 3, iris: 2, reinforce: 10 };
    this.build(game.assets);
  }

  // ------------------------------------------------------------ model
  build(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const root = new THREE.Group();
    root.scale.setScalar(this.scale);
    this.object.add(root);
    this.root = root;

    // the chamber wall behind her: a dark disc with concentric green rings frames the silhouette
    // matte on purpose: a metallic disc this big mirrors the green env panel into a haze
    const backMat = this.own(new THREE.MeshStandardMaterial({ color: 0x0a0d10, metalness: 0.2, roughness: 0.95, envMapIntensity: 0.15 }));
    this.backGeo = new THREE.CircleGeometry(70, 64);
    const back = this.mesh(root, this.backGeo, backMat, [0, 0, -34]);
    back.userData.noFlash = true;
    // thin light rings on the wall (own geometry: the shared torus would scale its tube with the radius)
    this.backRings = [];
    this.ringGeos = [];
    this.ringMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN).multiplyScalar(0.9) }));
    for (const r of [30, 44, 58, 68]) {
      const geo = new THREE.TorusGeometry(r, 0.22, 6, 128);
      this.ringGeos.push(geo);
      const ring = this.mesh(root, geo, this.ringMat, [0, 0, -33]);
      ring.userData.noFlash = true;
      this.backRings.push(ring);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const spoke = this.mesh(root, G.box, M.hullAbyss, [Math.cos(a) * 46, Math.sin(a) * 46, -30], [0, 0, a], [40, 2.2, 3]);
      spoke.userData.noFlash = true;
    }

    // core: armoured sphere with the iris
    this.coreGroup = new THREE.Group();
    root.add(this.coreGroup);
    this.mesh(this.coreGroup, G.sphere, M.hullAbyss, [0, 0, 0], [0, 0, 0], 6.2);
    for (let i = 0; i < 3; i++) this.mesh(this.coreGroup, G.torusThick, M.hullAbyssLight, [0, 0, 0], [i * 1.05, i * 0.6, 0], 6.4);
    this.irisMat = this.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN).multiplyScalar(3) }));
    this.iris = this.mesh(this.coreGroup, G.sphere, this.irisMat, [0, 0, 4.6], [0, 0, 0], [2.6, 2.6, 1.6]);
    this.iris.userData.noFlash = true;
    const irisRing = this.mesh(this.coreGroup, G.torus, M.trimGreen, [0, 0, 5.4], [0, 0, 0], 3.4);
    irisRing.userData.noFlash = true;
    this.pupil = this.mesh(this.coreGroup, G.sphere, M.hullBlack, [0, 0, 6.05], [0, 0, 0], [0.7, 1.9, 0.4]);
    this.pupil.userData.noFlash = true;
    this.coreGlow = new THREE.Sprite(this.own(assets.spriteMaterial(GREEN, 0.3)));
    this.coreGlow.scale.setScalar(24);
    this.coreGroup.add(this.coreGlow);

    // four armoured petals closing over the front of the core, each carrying a node
    this.petals = [];
    for (let i = 0; i < PETALS; i++) {
      const a = Math.PI / 4 + (i / PETALS) * TAU;
      const hinge = new THREE.Group();
      hinge.rotation.z = a;
      root.add(hinge);
      const petal = new THREE.Group();
      hinge.add(petal);
      this.mesh(petal, G.box, M.hullAbyssLight, [4.6, 0, 0], [0, -0.35, 0], [9.5, 7.5, 1.6]);
      this.mesh(petal, G.box, M.hullAbyss, [7.4, 0, -0.8], [0, -0.5, 0], [5, 8.5, 1.4]);
      const seam = this.mesh(petal, G.box, M.trimGreen, [4.6, 3.8, 0.4], [0, -0.35, 0], [9, 0.2, 0.2]);
      seam.userData.noFlash = true;
      const node = new THREE.Group();
      node.position.set(5.2, 0, 1.4);
      petal.add(node);
      this.mesh(node, G.octa, M.enemyPlate, [0, 0, 0], [0, 0, 0], 1.8);
      const eye = this.mesh(node, G.sphere, M.glowGreen, [0, 0, 1.1], [0, 0, 0], 0.9);
      eye.userData.noFlash = true;
      this.petals.push({ hinge, petal, node, angle: a });
    }

    // containment ring with four pylons
    this.ring = new THREE.Group();
    root.add(this.ring);
    this.mesh(this.ring, G.torusThick, M.hullAbyssLight, [0, 0, -2], [0, 0, 0], [RING_R, RING_R, 20]);
    const ringTrim = this.mesh(this.ring, G.torus, M.trimGreen, [0, 0, -0.8], [0, 0, 0], [RING_R - 0.8, RING_R - 0.8, 6]);
    ringTrim.userData.noFlash = true;
    this.pylons = [];
    for (let i = 0; i < PYLONS; i++) {
      const a = (i / PYLONS) * TAU;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0);
      g.rotation.z = a - Math.PI / 2;
      this.ring.add(g);
      // the pylon points outwards from the ring, its emitter towards the player
      this.mesh(g, G.cylinderHex, M.hullAbyss, [0, 2, 0], [0, 0, 0], [2, 4, 2]);
      this.mesh(g, G.coneHex, M.hullAbyssLight, [0, 4.8, 0], [0, 0, 0], [1.8, 2, 1.8]);
      const emitter = this.mesh(g, G.sphere, M.glowGreen, [0, 2, 1.8], [0, 0, 0], 1.1);
      emitter.userData.noFlash = true;
      this.pylons.push(g);
    }
    // launch bays on both sides
    this.bays = [];
    for (const s of [-1, 1]) {
      const bay = new THREE.Group();
      bay.position.set(s * 30, -4, -6);
      root.add(bay);
      this.mesh(bay, G.box, M.hullAbyss, [0, 0, 0], [0, 0, 0], [12, 10, 14]);
      const mouth = this.mesh(bay, G.box, M.dimGreen, [-s * 0.5, 0, 7.05], [0, 0, 0], [8, 5.5, 0.1]);
      mouth.userData.noFlash = true;
      this.bays.push(bay);
    }

    // hex shield over the core (phase 1)
    this.shieldMat = this.own(createShieldMaterial(GREEN, { intensity: 0.8, hexTexture: assets.textures.hex }));
    this.shieldGeo = new THREE.SphereGeometry(10, 40, 24);
    this.shield = new THREE.Mesh(this.shieldGeo, this.shieldMat);
    this.shield.userData.noFlash = true;
    root.add(this.shield);

    // ---- parts
    this.pylonParts = this.pylons.map((g) =>
      this.addPart({
        name: 'pylon',
        node: g,
        offset: [0, 2, 1],
        radius: 3,
        hp: this.cfg.pylonHp,
        score: this.cfg.score.pylon,
        onDestroyed: () => {
          g.visible = false;
          this.game.effects.explosion(g.getWorldPosition(_v), { size: 2.6, color: 0x8affb0 });
        },
      }),
    );
    this.shieldPart = this.addPart({ name: 'shield', node: this.shield, radius: 9.5, blocker: true });
    this.nodeParts = this.petals.map((p) =>
      this.addPart({
        name: 'node',
        node: p.node,
        radius: 2.6,
        hp: this.cfg.nodeHp,
        score: this.cfg.score.node,
        vulnerable: () => this.phase >= 2 && this.open > 0.35,
        onDestroyed: () => {
          p.node.visible = false;
          p.blown = true;
        },
      }),
    );
    this.corePart = this.addPart({
      name: 'core',
      node: this.coreGroup,
      radius: 6,
      hp: this.cfg.coreHp,
      isCore: true,
      score: this.cfg.score.core,
      vulnerable: () => this.phase >= 3 && this.open > 0.8,
      onDestroyed: () => this.startDeath(),
    });
    this.addHazard({ node: this.coreGroup, radius: 7 });
  }

  checkPhase() {
    if (this.phase === 1 && this.pylonParts.every((p) => !p.alive)) this.setPhase(2);
    else if (this.phase === 2 && this.nodeParts.every((p) => !p.alive)) this.setPhase(3);
  }

  onPartDestroyed() {
    this.checkPhase();
  }

  onShieldHit() {
    this.shieldMat.uniforms.uHit.value = 1;
  }

  onPhase(n) {
    const game = this.game;
    if (n === 2) {
      // the shield collapses with a shockwave
      this.shieldPart.alive = false;
      this.shieldPart.collidable = false;
      this.shieldCollapse = 1;
      game.effects.shockwave(this.coreGroup.getWorldPosition(_v), { radius: 26, duration: 0.7, color: 0x8affb0 });
      game.hud.warning('SHIELD DISABLED — DESTROY THE PETAL NODES', 2.6);
      this.timers.grid = 2.5;
      this.timers.fan = 1.5;
    } else if (n === 3) {
      game.hud.warning('MATRIARCH CORE EXPOSED!', 3);
      game.audio.setMusicIntensity(2);
      game.postfx.stageBloomFactor = 1.2;
      this.timers.grid = 4;
      this.timers.spiral = 1.5;
      this.timers.iris = 2.5;
    }
  }

  // ------------------------------------------------------------ animation
  updateEntrance(dt) {
    super.updateEntrance(dt);
    this.animate(dt);
  }

  animate(dt) {
    const t = this.t;
    const targetOpen = this.phase >= 3 ? 1 : this.phase === 2 ? 0.5 : 0;
    this.open = damp(this.open, targetOpen, 1.4, dt);
    for (const p of this.petals) {
      // petals swing out on their hinge and slide outwards; blown petals drift away
      const o = p.blown ? Math.max(this.open, 0.5) + 0.6 : this.open;
      p.petal.rotation.y = -o * 1.25;
      p.petal.position.x = o * 6;
      p.petal.visible = !p.blown || this.open < 2;
    }
    this.ring.rotation.z = t * 0.18;
    this.backRings.forEach((r, i) => (r.rotation.z = t * (i % 2 ? -0.05 : 0.07)));
    const pulse = 0.5 + 0.5 * Math.sin(t * (2.2 + this.open * 5));
    this.irisMat.color.setHex(GREEN).multiplyScalar(2.2 + pulse * (1.5 + this.open * 2));
    this.coreGlow.material.opacity = 0.15 + this.open * 0.25 + pulse * 0.1;
    this.pupil.scale.x = 0.7 - this.open * 0.35 + pulse * 0.1;
    // the pupil follows the player
    const p = this.game.player.local;
    this.iris.position.x = damp(this.iris.position.x, (p.x - this.local.x) * 0.06, 3, dt);
    this.iris.position.y = damp(this.iris.position.y, (p.y - this.local.y) * 0.06, 3, dt);
    this.pupil.position.x = this.iris.position.x * 1.15;
    this.pupil.position.y = this.iris.position.y * 1.15;
    // shield shimmer and collapse
    const sh = this.shieldMat.uniforms;
    sh.uTime.value = t;
    sh.uHit.value = Math.max(0, sh.uHit.value - dt * 3);
    if (this.phase <= 1) sh.uOpacity.value = 0.75 + 0.15 * Math.sin(t * 3);
    else {
      this.shieldCollapse = Math.max(0, (this.shieldCollapse ?? 0) - dt * 1.5);
      sh.uOpacity.value = this.shieldCollapse;
      this.shield.scale.setScalar(1 + (1 - this.shieldCollapse) * 0.6);
      this.shield.visible = this.shieldCollapse > 0;
    }
  }

  // ------------------------------------------------------------ behaviour
  behave(dt) {
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    const L = this.local;
    L.x = damp(L.x, Math.sin(this.t * 0.25) * 4, 1, dt);
    L.y = damp(L.y, Math.sin(this.t * 0.37) * 2, 1, dt);
    this.animate(dt);
    for (let i = this.grids.length - 1; i >= 0; i--) if (this.grids[i].update(dt)) this.grids.splice(i, 1);

    const rate = this.game.difficulty.fireRate;
    if (this.phase === 1) this.phase1(rate);
    else if (this.phase === 2) this.phase2(dt, rate);
    else this.phase3(dt, rate);
  }

  phase1(rate) {
    const T = this.timers;
    if (T.pylon <= 0) {
      T.pylon = 0.55 / rate;
      const alive = this.pylonParts.filter((p) => p.alive);
      if (alive.length) {
        const part = alive[this.pylonIndex++ % alive.length];
        this.fireAt(part.center, { speed: 27, size: 1.1 });
        this.game.audio.play('enemyShoot');
      }
    }
    if (T.ring <= 0) {
      T.ring = 4.5 / rate;
      this.fireRing(this.coreGroup.getWorldPosition(_v), 16, { speed: 22 }, rand(0, TAU), 0.5);
    }
    if (T.drones <= 0) {
      T.drones = 8;
      this.launchDrones(3);
    }
  }

  phase2(dt, rate) {
    const T = this.timers;
    if (T.grid <= 0) {
      T.grid = 7 / rate;
      this.grid(1.7);
    }
    if (T.fan <= 0) {
      T.fan = 2.8 / rate;
      this.petals.forEach((p, i) => {
        if (!this.nodeParts[i].alive) return;
        p.node.localToWorld(_v.set(0, 0, 1.5));
        this.fireFan(_v, 4, 0.45, { speed: 28 });
      });
    }
    this.streams(dt, rate, 3, 0.2);
    if (T.drones <= 0) {
      T.drones = 11;
      this.launchDrones(2);
    }
  }

  phase3(dt, rate) {
    const T = this.timers;
    if (T.grid <= 0) {
      T.grid = 6 / rate;
      this.grid(1.4);
    }
    if (T.iris <= 0) {
      T.iris = 2.6 / rate;
      this.iris.getWorldPosition(_v);
      this.fireFan(_v, 3, 0.18, { speed: 34, size: 1.5 });
    }
    this.streams(dt, rate, 4, 0.16);
    if (T.reinforce <= 0) {
      T.reinforce = 12;
      if (this.canAttack()) {
        for (const s of [-1, 1]) {
          this.game.enemies.spawn('interceptor', { local: new THREE.Vector3(s * 30, -4, this.local.z + 4), entry: 'front', hold: 50, lifeTime: 9 });
        }
      }
    }
  }

  /** Rotating streams: `arms` jets from the core sweeping around, fired in short bursts. */
  streams(dt, rate, arms, interval) {
    const T = this.timers;
    if (this.streamLeft > 0) {
      this.streamTimer -= dt;
      if (this.streamTimer <= 0) {
        this.streamTimer = interval;
        this.streamLeft--;
        this.fireRing(this.coreGroup.getWorldPosition(_v), arms, { speed: 21, size: 1.05 }, this.t * 1.9, 0.45);
      }
    } else if (T.spiral <= 0) {
      T.spiral = 6.5 / rate;
      this.streamLeft = 12;
    }
  }

  grid(warn) {
    if (!this.canAttack()) return;
    this.grids.push(new ContainmentGrid(this.game, { warn, fire: 1 }));
  }

  launchDrones(n) {
    if (!this.canAttack()) return;
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      this.game.enemies.spawn('scout', {
        local: new THREE.Vector3(this.local.x + s * 27, this.local.y - 4 + rand(-2, 2), this.local.z + 8),
        pattern: 'drone',
        speed: 44,
        hpScale: 0.5,
        score: 50,
      });
    }
    this.game.audio.play('telegraph');
  }

  // ------------------------------------------------------------ death & cleanup
  startDeath() {
    this.clearGrids();
    super.startDeath();
  }

  deathAnimation(dt, k) {
    // the petals and ring collapse into the core, the iris flares, then everything implodes
    this.open = 1 + k * 0.5;
    this.root.scale.setScalar(this.scale * (1 - 0.55 * k * k));
    this.ring.rotation.z += dt * (1 + k * 10);
    this.irisMat.color.setHex(GREEN).multiplyScalar(4 + k * 8);
    this.coreGlow.material.opacity = 0.6 + k * 0.4;
    this.coreGlow.scale.setScalar(24 + k * 40);
    if (Math.random() < 0.3) this.game.effects.shockwave(this.coreGroup.getWorldPosition(_v), { radius: 10 + k * 20, duration: 0.4, color: 0x8affb0 });
  }

  clearGrids() {
    for (const g of this.grids) g.dispose();
    this.grids.length = 0;
  }

  dispose() {
    this.clearGrids();
    this.backGeo.dispose();
    for (const g of this.ringGeos) g.dispose();
    this.shieldGeo.dispose();
    super.dispose();
  }
}

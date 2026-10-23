import * as THREE from 'three';
import { Boss } from '../Boss.js';
import { BOSSES, PLAYER, OBSTACLES } from '../../config/gameConfig.js';
import { BlackHole } from '../../scenery/BlackHole.js';
import { damp, rand, clamp, TAU } from '../../utils/math.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _c = new THREE.Color();
const B = PLAYER.bounds;
const SATELLITES = 6;
const NODES = 3;
const SWEEP_WARN = 1.4;
const SWEEP_FIRE = 2.6;
const SWEEP_SPEED = 0.9; // rad/s

/**
 * ECLIPSE SOVEREIGN — Stage 3 guardian: a colossal gyroscope of three rings around a living
 * singularity. Model faces +Z (towards the player).
 * Phase 1: six crystal satellites orbit in front of the core and fire in sequence; halo rings
 *          of shots with a single gap; drone launches.
 * Phase 2: satellites gone -> the middle ring turns to face the player and exposes three nodes;
 *          "horizon sweep" beams rotate around a safe circle in the centre.
 * Phase 3: nodes gone -> the rings open, the core is exposed and its gravity pulls the ship in;
 *          spiral volleys, gapped halo rings and a rain of crystal shards.
 */
export class EclipseSovereign extends Boss {
  constructor(game) {
    super(game, BOSSES.eclipseSovereign);
    this.phaseCount = 3;
    this.deathBlastSize = 9;
    this.deathDuration = 4.5;
    this.deathColor = 0x9fe8ff;
    this.shards = [];
    this.build(game.assets);
    this.timers = { volley: 1.5, ring: 4, drones: 7, sweep: 2.5, fan: 2, spiral: 3, shards: 2, lancer: 9 };
    this.satIndex = 0;
    this.open = 0;
    this.spiralLeft = 0;
    this.spiralTimer = 0;
  }

  // ------------------------------------------------------------ model
  build(assets) {
    const M = assets.materials;
    const G = assets.geometries;
    const root = new THREE.Group();
    root.scale.setScalar(this.scale);
    this.object.add(root);
    this.root = root;

    // the singularity
    this.coreGroup = new THREE.Group();
    root.add(this.coreGroup);
    this.hole = new BlackHole(assets, { radius: 4, diskInner: 5.4, diskOuter: 12.5, tilt: 1.2, intensity: 1.1 });
    this.coreGroup.add(this.hole.group);
    this.hole.horizon.userData.noFlash = true;
    this.hole.disk.userData.noFlash = true;
    this.hole.lens.userData.noFlash = true;

    // gyroscopic rings: inner tilted, middle faces the player (carries the nodes), outer crown
    this.rings = [14, 18.5, 24].map((r, i) => {
      const group = new THREE.Group();
      root.add(group);
      this.mesh(group, G.torus, M.enemyHull, [0, 0, 0], [0, 0, 0], [r, r, r * 1.6]);
      const inner = this.mesh(group, G.torusThin, M.trimGold, [0, 0, 0], [0, 0, 0], r * 0.955);
      inner.userData.noFlash = true;
      const studs = 10 + i * 4;
      for (let k = 0; k < studs; k++) {
        const a = (k / studs) * TAU;
        const pos = [Math.cos(a) * r, Math.sin(a) * r, 0];
        if (i === 2) {
          // crown of crystal spikes pointing outwards
          const spike = this.mesh(group, G.octa, M.crystal, [Math.cos(a) * (r + 1.6), Math.sin(a) * (r + 1.6), 0], [0, 0, a - Math.PI / 2], [0.55, 2.4, 0.55]);
          spike.userData.noFlash = true;
        } else {
          const stud = this.mesh(group, G.octa, M.glowGold, pos, [0, 0, a], [0.35, 0.7, 0.35]);
          stud.userData.noFlash = true;
        }
      }
      return { group, radius: r };
    });

    // phase 1: orbiting crystal satellites
    this.satellites = [];
    for (let i = 0; i < SATELLITES; i++) {
      const g = new THREE.Group();
      root.add(g);
      this.mesh(g, G.octa, M.crystal, [0, 0, 0], [0, 0, 0], [1.0, 2.6, 1.0]);
      this.mesh(g, G.torusThick, M.hullGold, [0, 0, 0], [Math.PI / 2, 0, 0], 1.05);
      const halo = new THREE.Sprite(this.own(assets.spriteMaterial(0x7af0ff, 0.7)));
      halo.scale.setScalar(6);
      g.add(halo);
      this.satellites.push({ group: g, index: i });
    }

    // phase 2: nodes mounted on the middle ring
    this.nodes = [];
    for (let i = 0; i < NODES; i++) {
      const a = Math.PI / 2 + (i / NODES) * TAU;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 18.5, Math.sin(a) * 18.5, 1.5);
      this.rings[1].group.add(g);
      this.mesh(g, G.octa, M.enemyPlate, [0, 0, 0], [0, 0, 0], 2.1);
      const eye = this.mesh(g, G.sphere, M.glowGold, [0, 0, 1.2], [0, 0, 0], 1.0);
      eye.userData.noFlash = true;
      this.nodes.push(g);
    }

    // parts
    this.satParts = this.satellites.map((s) =>
      this.addPart({
        name: 'satellite',
        node: s.group,
        radius: 2.4,
        hp: this.cfg.satelliteHp,
        score: this.cfg.score.satellite,
        onDestroyed: () => this.onSatelliteDestroyed(s),
      }),
    );
    this.nodeParts = this.nodes.map((n) =>
      this.addPart({
        name: 'node',
        node: n,
        radius: 2.8,
        hp: this.cfg.nodeHp,
        score: this.cfg.score.node,
        vulnerable: () => this.phase >= 2,
        onDestroyed: () => {
          n.visible = false;
          this.checkPhase();
        },
      }),
    );
    this.corePart = this.addPart({
      name: 'core',
      node: this.coreGroup,
      radius: 5,
      hp: this.cfg.coreHp,
      isCore: true,
      score: this.cfg.score.core,
      vulnerable: () => this.phase >= 3 && this.open > 0.6,
      onDestroyed: () => this.startDeath(),
    });

    // safe-zone marker shown during horizon sweeps (lives in the rail frame, not on the boss)
    this.safeMat = this.own(new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.safeRing = new THREE.Mesh(G.ring, this.safeMat);
    this.safeRing.scale.setScalar(this.cfg.sweepSafeRadius - 1);
    this.safeRing.position.set(0, 0, -3);
    this.safeRing.visible = false;
    this.game.rig.add(this.safeRing);
  }

  onSatelliteDestroyed(s) {
    s.group.visible = false;
    this.game.effects.explosion(s.group.getWorldPosition(_v), { size: 2.4, color: 0x7af0ff });
    this.checkPhase();
  }

  checkPhase() {
    if (this.phase === 1 && this.satParts.every((p) => !p.alive)) this.setPhase(2);
    else if (this.phase === 2 && this.nodeParts.every((p) => !p.alive)) this.setPhase(3);
  }

  onPartDestroyed() {
    this.checkPhase();
  }

  onPhase(n) {
    const game = this.game;
    if (n === 2) {
      game.hud.warning('SATÉLITES DESTRUÍDOS — ATAQUE OS NÓS DO ANEL', 2.5);
      this.timers.sweep = 2;
    } else if (n === 3) {
      game.hud.warning('NÚCLEO DO ECLIPSE EXPOSTO — RESISTA À GRAVIDADE!', 3);
      game.audio.setMusicIntensity(2);
      game.postfx.stageBloomFactor = 1.15;
      this.timers.spiral = 2;
      this.timers.shards = 1.5;
    }
  }

  // ------------------------------------------------------------ animation
  update(dt) {
    super.update(dt);
    const spin = 1 + this.open * 1.5 + (this.dying ? this.deathTime * 2 : 0);
    this.hole.update(dt, this.game.camera, spin);
  }

  updateEntrance(dt) {
    super.updateEntrance(dt);
    this.animate(dt);
  }

  animate(dt) {
    const t = this.t;
    this.open = damp(this.open, this.phase >= 3 ? 1 : 0, 1.2, dt);
    const o = this.open;
    const [inner, middle, outer] = this.rings;
    inner.group.rotation.set(0.9 + Math.sin(t * 0.3) * 0.3 + o * 0.5, t * 0.35, 0);
    inner.group.scale.setScalar(1 + o * 0.35);
    middle.group.rotation.set(o * 0.9, 0, -t * 0.22);
    outer.group.rotation.set(0.35 + o * 0.4, t * 0.12, 0.2);
    outer.group.scale.setScalar(1 + o * 0.2);

    for (const s of this.satellites) {
      const a = (s.index / SATELLITES) * TAU + t * 0.45;
      s.group.position.set(Math.cos(a) * 11, Math.sin(a) * 8.5, 5);
      s.group.rotation.set(t * 0.8, t * 1.3, 0);
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * (2 + o * 6));
    this.hole.setIntensity(0.7 + o * 0.45 + pulse * 0.18 * (1 + o));
  }

  // ------------------------------------------------------------ behaviour
  behave(dt) {
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    const L = this.local;
    L.x = damp(L.x, Math.sin(this.t * 0.28) * 4, 1, dt);
    L.y = damp(L.y, Math.sin(this.t * 0.4) * 2, 1, dt);
    this.animate(dt);
    this.updateShards(dt);

    const rate = this.game.difficulty.fireRate;
    if (this.phase === 1) this.phase1(rate);
    else if (this.phase === 2) this.phase2(rate);
    else this.phase3(dt, rate);
  }

  corePosition(out) {
    return this.coreGroup.getWorldPosition(out);
  }

  phase1(rate) {
    const T = this.timers;
    if (T.volley <= 0) {
      T.volley = 0.5 / rate;
      const alive = this.satParts.filter((p) => p.alive);
      if (alive.length) {
        const part = alive[this.satIndex++ % alive.length];
        this.fireAt(part.center, { speed: 26, size: 1.1 });
        this.game.audio.play('enemyShoot');
      }
    }
    if (T.ring <= 0) {
      T.ring = 5 / rate;
      this.fireRingGap(22, 9, rand(0, TAU), 1.1);
    }
    if (T.drones <= 0) {
      T.drones = 9;
      this.launchDrones(3);
    }
  }

  phase2(rate) {
    const T = this.timers;
    if (T.sweep <= 0) {
      T.sweep = 8 / rate;
      this.horizonSweep();
    }
    if (T.fan <= 0) {
      T.fan = 2.6 / rate;
      this.nodes.forEach((n, i) => {
        if (!this.nodeParts[i].alive) return;
        n.localToWorld(_v.set(0, 0, 1.5));
        this.fireFan(_v, 5, 0.5, { speed: 28 });
      });
    }
    if (T.lancer <= 0) {
      T.lancer = 13;
      this.game.enemies.spawn('prismLancer', { local: new THREE.Vector3(rand(-12, 12), rand(-4, 6), -170), hold: 55, lifeTime: 10 });
    }
    this.safeRing.visible = this.sweepEnd > this.t;
    if (this.safeRing.visible) this.safeMat.color.setRGB(1, 0.75, 0.25).multiplyScalar(0.6 + 0.4 * Math.sin(this.t * 10));
  }

  phase3(dt, rate) {
    const T = this.timers;
    this.gravityPull(dt);
    this.safeRing.visible = false;
    if (this.spiralLeft > 0) {
      this.spiralTimer -= dt;
      if (this.spiralTimer <= 0) {
        this.spiralTimer = 0.22;
        this.spiralLeft--;
        this.fireRingAt(6, 12, this.t * 2.4, { speed: 22 });
      }
    } else if (T.spiral <= 0) {
      T.spiral = 7 / rate;
      this.spiralLeft = 8;
    }
    if (T.ring <= 0) {
      T.ring = 5 / rate;
      this.fireRingGap(22, rand(6, 11), rand(0, TAU), 1.1);
    }
    if (T.shards <= 0) {
      T.shards = 2.4 / rate;
      this.spawnShard();
    }
  }

  /** Ring of shots that reaches the player's plane as a circle of `radius`, with one gap. */
  fireRingGap(count, radius, gapAngle, gapWidth) {
    if (!this.canAttack()) return;
    const from = this.corePosition(_w);
    const f = this.game.rail.frame;
    _v.subVectors(from, this.game.player.worldPosition);
    const dist = Math.max(10, _v.dot(f.forward));
    const tilt = radius / dist;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      let diff = Math.abs(a - gapAngle) % TAU;
      if (diff > Math.PI) diff = TAU - diff;
      if (diff < gapWidth / 2) continue;
      _v.copy(f.right).multiplyScalar(Math.cos(a) * tilt).addScaledVector(f.up, Math.sin(a) * tilt).addScaledVector(f.forward, -1);
      this.game.projectiles.fireEnemy(from, _v, { speed: 24, size: 1.05 });
    }
    this.game.audio.play('enemyShoot');
  }

  /** Full ring reaching the player plane at `radius` (used for the spiral). */
  fireRingAt(count, radius, offset, opts) {
    if (!this.canAttack()) return;
    const from = this.corePosition(_w);
    const f = this.game.rail.frame;
    _v.subVectors(from, this.game.player.worldPosition);
    const tilt = radius / Math.max(10, _v.dot(f.forward));
    for (let i = 0; i < count; i++) {
      const a = offset + (i / count) * TAU;
      _v.copy(f.right).multiplyScalar(Math.cos(a) * tilt).addScaledVector(f.up, Math.sin(a) * tilt).addScaledVector(f.forward, -1);
      this.game.projectiles.fireEnemy(from, _v, opts);
    }
  }

  /** Two beams rotate around the centre of the play area; a small circle in the middle is safe. */
  horizonSweep() {
    if (!this.canAttack()) return;
    const safe = this.cfg.sweepSafeRadius;
    const a0 = rand(0, Math.PI);
    for (const offset of [0, Math.PI]) {
      const base = a0 + offset;
      this.game.obstacles.fireBeam({
        start: new THREE.Vector3(Math.cos(base) * safe, Math.sin(base) * safe, -3),
        end: new THREE.Vector3(Math.cos(base) * 48, Math.sin(base) * 48, -3),
        local: true,
        warn: SWEEP_WARN,
        fire: SWEEP_FIRE,
        radius: 1.05,
        color: 0xffa020,
        sweep: (t, start, end) => {
          const a = base + Math.max(0, t - SWEEP_WARN) * SWEEP_SPEED;
          start.set(Math.cos(a) * safe, Math.sin(a) * safe, -3);
          end.set(Math.cos(a) * 48, Math.sin(a) * 48, -3);
        },
      });
    }
    this.sweepEnd = this.t + SWEEP_WARN + SWEEP_FIRE;
    this.game.hud.warning('VARREDURA DO HORIZONTE — FIQUE NO CENTRO!', 2.2);
    this.game.audio.play('telegraph');
  }

  /** Phase 3: the singularity drags the ship towards it (the player can out-thrust it). */
  gravityPull(dt) {
    const p = this.game.player;
    if (!p.alive || !p.controllable || !this.canAttack()) return;
    const tx = clamp(this.local.x, -B.x, B.x);
    const ty = clamp(this.local.y, -B.y, B.y);
    const dx = tx - p.local.x;
    const dy = ty - p.local.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.5) {
      const k = (this.cfg.pullSpeed * Math.min(1, d / 5) * dt) / d;
      p.local.x = clamp(p.local.x + dx * k, -B.x, B.x);
      p.local.y = clamp(p.local.y + dy * k, -B.y, B.y);
    }
    // visible inflow of particles so the pull is always readable
    if (Math.random() < 0.7) {
      const a = rand(0, TAU);
      const r = rand(14, 20);
      _v.set(tx + Math.cos(a) * r, ty + Math.sin(a) * r, rand(-30, -4)).applyMatrix4(this.game.rig.matrixWorld);
      _w.set(tx, ty, -10).applyMatrix4(this.game.rig.matrixWorld).sub(_v).multiplyScalar(1.4);
      _w.add(this.game.rail.velocity);
      _c.set(Math.random() < 0.5 ? 0xffc040 : 0x7af0ff).multiplyScalar(1.6);
      this.game.effects.particles.emit(_v.x, _v.y, _v.z, _w.x, _w.y, _w.z, _c, 0.7, 0.7, 0.1, 0);
    }
  }

  launchDrones(n) {
    if (!this.canAttack()) return;
    for (let i = 0; i < n; i++) {
      this.game.enemies.spawn('scout', {
        local: new THREE.Vector3(this.local.x + rand(-6, 6), this.local.y + rand(-4, 4), this.local.z + 8),
        pattern: 'drone',
        speed: 42,
        hpScale: 0.5,
        score: 50,
      });
    }
    this.game.audio.play('telegraph');
  }

  /** Phase 3 crystal rain: destructible shards drifting at the player from the core. */
  spawnShard() {
    if (!this.canAttack()) return;
    const game = this.game;
    const scale = rand(1.5, 2.3);
    const shard = game.kit.crystal(null, scale);
    shard.position.set(rand(-B.x, B.x), rand(-B.y, B.y), -110);
    const speed = rand(28, 36);
    const spin = rand(-2, 2);
    const C = OBSTACLES.crystal;
    const obs = game.obstacles.add(shard, {
      local: true,
      colliders: [{ type: 'sphere', node: shard, radius: 1.15 * scale }],
      hp: Math.ceil(C.hpPerScale * scale),
      score: Math.round(C.score * scale),
      dropChance: C.dropChance,
      damage: 1,
      update: (dt, o) => {
        shard.position.z += speed * dt;
        shard.rotation.y += spin * dt;
        if (Math.random() < 0.3) game.effects.trail(shard.getWorldPosition(_v), 0x7af0ff, 1.2, 0.4);
        if (shard.position.z > 25) game.obstacles.remove(o);
      },
    });
    obs.explosionColor = 0x7af0ff;
    this.shards.push(obs);
  }

  updateShards() {
    for (let i = this.shards.length - 1; i >= 0; i--) if (!this.shards[i].alive) this.shards.splice(i, 1);
  }

  // ------------------------------------------------------------ death & cleanup
  startDeath() {
    this.safeRing.visible = false;
    super.startDeath();
  }

  deathAnimation(dt, k) {
    // implosion: the rings collapse into the singularity before it detonates
    this.root.scale.setScalar(this.scale * (1 - 0.65 * k));
    this.hole.setIntensity(1.5 + k * 3);
    for (const r of this.rings) r.group.rotation.z += dt * (2 + k * 8);
  }

  dispose() {
    for (const s of this.shards) if (s.alive) this.game.obstacles.remove(s);
    this.shards.length = 0;
    if (this.safeRing.parent) this.safeRing.parent.remove(this.safeRing);
    this.hole.dispose();
    super.dispose();
  }
}

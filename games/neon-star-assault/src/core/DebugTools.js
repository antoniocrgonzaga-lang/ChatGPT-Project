import * as THREE from 'three';
import { PLAYER } from '../config/gameConfig.js';

const MAX_SPHERES = 400;
const MAX_BOXES = 160;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Optional debug mode, enabled with `?debug` in the URL.
 *   H  show / hide hitboxes       G  god mode          N  skip to next section
 *   B  jump to the boss           K  damage the boss   T  toggle slow motion
 *   Y  test bot (auto aim + fire)   1-4  start stage 1-4
 * URL options: ?debug&stage=2&boss  starts directly at a stage / boss.
 */
export class DebugTools {
  constructor(game) {
    this.game = game;
    const params = new URLSearchParams(window.location.search);
    this.enabled = params.has('debug');
    this.params = params;
    this.godMode = false;
    this.showHitboxes = false;
    this.timeScale = 1;
    this.fps = 60;
    this.frames = 0;
    this.fpsTimer = 0;
    this.lastError = null;
    this.bot = params.has('bot');
    if (this.enabled) window.addEventListener('keydown', (e) => this.onKey(e));
  }

  applyUrlOptions() {
    if (!this.enabled) return;
    window.__game = this.game;
    const stage = parseInt(this.params.get('stage') ?? '0', 10);
    if (stage >= 1) {
      this.game.audio.init();
      this.game.score.reset(0);
      this.game.player.reset();
      this.game.startStage(stage - 1, 0);
      if (this.params.has('boss')) this.jumpToBoss();
    }
    if (this.params.has('gallery')) this.showGallery();
    if (this.params.has('god')) this.godMode = true;
    if (this.params.has('hitbox')) this.showHitboxes = true;
  }

  onKey(e) {
    const game = this.game;
    if (!game.renderer) return;
    switch (e.code) {
      case 'KeyH':
        this.showHitboxes = !this.showHitboxes;
        break;
      case 'KeyG':
        this.godMode = !this.godMode;
        game.hud.toast(`GOD MODE ${this.godMode ? 'ON' : 'OFF'}`, '#ffffff');
        break;
      case 'KeyN':
        this.skipSection();
        break;
      case 'KeyB':
        this.jumpToBoss();
        break;
      case 'KeyK':
        this.damageBoss();
        break;
      case 'KeyT':
        this.timeScale = this.timeScale === 1 ? 0.25 : 1;
        break;
      case 'KeyY':
        this.bot = !this.bot;
        game.hud.toast(`BOT ${this.bot ? 'ON' : 'OFF'}`, '#ffffff');
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        game.score.reset(0);
        game.player.reset();
        game.startStage(Number(e.code.slice(-1)) - 1, 0);
        break;
      default:
        break;
    }
  }

  skipSection() {
    const sm = this.game.stageManager;
    if (!sm.stage || this.game.boss) return;
    const s = this.game.rail.s;
    const next = sm.stage.sections.find((sec) => sec.start > s + 1);
    if (next) this.game.startStage(this.game.stageIndex, next.start);
  }

  jumpToBoss() {
    const sm = this.game.stageManager;
    if (!sm.stage) return;
    const bossEv = sm.stage.events.find((e) => e.type === 'boss');
    if (bossEv) this.game.startStage(this.game.stageIndex, bossEv.at - 30);
  }

  damageBoss() {
    const boss = this.game.boss;
    if (!boss || !boss.alive || boss.entering || boss.dying) return;
    // destroy the first vulnerable part, or chip a core
    const part = boss.parts.find((p) => p.alive && !p.blocker && p.isVulnerable() && !p.isCore);
    if (part) boss.hitPart(part, part.hp + 1, part.center);
    else {
      const core = boss.parts.find((p) => p.alive && p.isCore);
      if (!core) return;
      if (core.isVulnerable()) boss.hitPart(core, core.maxHp * 0.25, core.center);
      else {
        core.hp = Math.max(1, core.hp - core.maxHp * 0.25);
        boss.checkPhase?.();
      }
    }
  }

  /**
   * Fast-forward the game logic without rendering (console: __game.debug.simulate(30)).
   * Returns a small status snapshot. Useful when the tab is hidden or for regression checks.
   */
  simulate(seconds, step = 1 / 60) {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) this.game.step(step);
    return this.snapshot();
  }

  snapshot() {
    const g = this.game;
    return {
      state: g.state,
      stage: g.stageManager.stage?.id ?? null,
      path: g.rail.pathId,
      s: Math.round(g.rail.s),
      section: g.stageManager.section?.id ?? null,
      lives: g.player.lives,
      hp: g.player.hp,
      score: g.score.score,
      kills: g.score.stats.kills,
      enemies: g.enemies.active.length,
      enemyShots: g.projectiles.enemyCount,
      playerShots: g.projectiles.playerCount,
      particles: g.effects.particles.count,
      obstacles: g.obstacles.list.length,
      chunks: g.stageManager.chunks.length,
      boss: g.boss ? { phase: g.boss.phase, hp: +g.boss.healthFraction.toFixed(3), entering: g.boss.entering, dying: g.boss.dying } : null,
      sequence: g.sequence?.constructor.name ?? null,
    };
  }

  /** Test bot (key Y or ?bot): steers towards the best target and keeps firing. */
  applyBot() {
    if (!this.bot) return;
    const g = this.game;
    if (g.state !== 'playing') return;
    const input = g.input;
    input.state.fire = true;
    let target = null;
    if (g.boss && g.boss.alive && !g.boss.entering) {
      const part = g.boss.parts.find((p) => p.alive && !p.blocker && p.isVulnerable());
      if (part) target = part.center;
    }
    if (!target) {
      let best = Infinity;
      for (const e of g.enemies.active) {
        if (!e.alive || !e.object.visible) continue;
        const ahead = e.aheadDistance();
        if (ahead < 15 || ahead > 260) continue;
        if (ahead < best) {
          best = ahead;
          target = e.object.position;
        }
      }
    }
    if (!target) {
      input.moveX = input.moveY = 0;
      return;
    }
    _p.copy(target);
    g.rig.worldToLocal(_p);
    const pl = g.player.local;
    const clampAxis = (v) => Math.max(-1, Math.min(1, v));
    input.moveX = clampAxis((Math.max(-PLAYER.bounds.x, Math.min(PLAYER.bounds.x, _p.x)) - pl.x) / 2.5);
    input.moveY = clampAxis((Math.max(-PLAYER.bounds.y, Math.min(PLAYER.bounds.y, _p.y)) - pl.y) / 2.5);
  }

  /**
   * Model gallery (?debug&gallery): every enemy type side by side on a neutral background,
   * slowly turning, to inspect geometry and materials.
   */
  showGallery() {
    const g = this.game;
    g.state = 'gallery';
    g.screens.hide();
    g.hud.hide();
    g.sky.group.visible = false;
    g.dust.group.visible = false;
    g.player.root.visible = false;
    for (const t of g.player.trails) t.mesh.visible = false;
    g.scene.background = new THREE.Color(0x1a1826);
    g.scene.fog.near = 400;
    g.scene.fog.far = 2000;
    g.rig.position.set(0, 0, 0);
    g.rig.quaternion.identity();
    g.rig.updateMatrixWorld(true);
    const layout = [
      ['scout', -15, 5, 2.2], ['interceptor', -7.5, 5, 1.7], ['prismLancer', 0, 5, 1.6], ['turret', 7.5, 5, 1.5], ['mine', 15, 5, 1.8],
      ['phaseHunter', -13, -4.5, 1.7], ['heavy', -3, -4.5, 0.85], ['carrier', 7.5, -4.5, 0.55], ['generator', 15, -4.5, 0.8],
    ];
    this.gallery = layout.map(([type, x, y, s]) => {
      const e = g.enemies.pools[type].acquire();
      e.spawn({ mode: 'world', worldPos: new THREE.Vector3(x, y, 0), worldQuat: new THREE.Quaternion() });
      e.alive = false; // purely decorative: never updated by the spawn system
      e.object.scale.setScalar(s);
      return e;
    });
    g.cameraRig.startCutscene((dt, pos, look) => {
      pos.set(1, 1, 31);
      look.set(1, 0.3, 0);
    });
    this.galleryAngle = 2.3;
  }

  updateGallery(dt) {
    const g = this.game;
    this.galleryAngle += dt * 0.35;
    for (const e of this.gallery) {
      e.object.rotation.set(0.42, this.galleryAngle, 0);
      for (const f of e.flames) f.pivot.scale.z = f.length * (0.8 + Math.random() * 0.4);
      e.object.updateMatrixWorld(true);
    }
    g.cameraRig.update(dt, g.rig, g.player);
    g.postfx.update(dt, g.time);
  }

  reportError(err) {
    if (this.lastError === err.message) return;
    this.lastError = err.message;
    this.game.hud.toast(`Erro: ${err.message}`, '#ff6060');
  }

  // ------------------------------------------------------------ hitboxes
  ensureMeshes() {
    if (this.sphereMesh) return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6, depthTest: false });
    this.sphereMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat, MAX_SPHERES);
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat.clone(), MAX_BOXES);
    for (const m of [this.sphereMesh, this.boxMesh]) {
      m.frustumCulled = false;
      m.renderOrder = 100;
      m.setColorAt(0, _c.set(0xffffff));
      this.game.scene.add(m);
    }
  }

  drawHitboxes() {
    this.ensureMeshes();
    const game = this.game;
    let ns = 0;
    let nb = 0;
    const sphere = (center, radius, color) => {
      if (ns >= MAX_SPHERES) return;
      _m.compose(center, _q.identity(), _s.setScalar(radius));
      this.sphereMesh.setMatrixAt(ns, _m);
      this.sphereMesh.setColorAt(ns, _c.set(color));
      ns++;
    };
    sphere(game.player.worldPosition, PLAYER.hitRadius, 0x00ff66);
    for (const e of game.enemies.active) if (e.alive) sphere(e.colliderCenter, e.radius, 0xff3030);
    for (let i = 0; i < game.projectiles.enemyCount; i++) {
      const s = game.projectiles.enemyShots[i];
      sphere(s.pos, s.radius, 0xffaa00);
    }
    if (game.boss) {
      for (const p of game.boss.parts) if (p.alive) sphere(p.center, p.radius, p.blocker ? 0x66aaff : 0xffff00);
      for (const h of game.boss.hazards) if (h.active) sphere(h.center, h.radius, 0xff00ff);
    }
    for (const o of game.obstacles.list) {
      if (!o.alive) continue;
      for (const c of o.colliders) {
        if (c.enabled === false) continue;
        if (c.type === 'sphere') {
          c.node.localToWorld(_p.copy(c.offset ?? ZERO));
          sphere(_p, c.radius, 0xff8800);
        } else if (nb < MAX_BOXES) {
          this.boxMesh.setMatrixAt(nb, c.node.matrixWorld);
          this.boxMesh.setColorAt(nb, _c.set(0xff8800));
          nb++;
        }
      }
    }
    for (const b of game.obstacles.beams.active) {
      if (!b.firing) continue;
      for (let i = 0; i <= 10; i++) sphere(_p.lerpVectors(b.start, b.end, i / 10), b.radius * 0.8, 0xff00aa);
    }
    this.sphereMesh.count = ns;
    this.boxMesh.count = nb;
    for (const m of [this.sphereMesh, this.boxMesh]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = true;
    }
  }

  update(dt) {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    if (!this.enabled || !this.game.renderer) return;
    if (this.gallery && this.game.state === 'gallery') {
      this.updateGallery(dt);
      return;
    }
    if (this.showHitboxes) this.drawHitboxes();
    else if (this.sphereMesh) this.sphereMesh.visible = this.boxMesh.visible = false;
    const g = this.game;
    const info = g.renderer.info;
    g.hud.setDebug(
      `FPS ${this.fps} · draw ${info.render.calls} · tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
        `state ${g.state} · path ${g.rail.pathId} s=${g.rail.s.toFixed(0)} v=${g.rail.speed.toFixed(0)}\n` +
        `section ${g.stageManager.section?.id ?? '-'} · enemies ${g.enemies.active.length} · shots ${g.projectiles.playerCount}/${g.projectiles.enemyCount} · particles ${g.effects?.particles.count}\n` +
        `obstacles ${g.obstacles.list.length} · chunks ${g.stageManager.chunks.length}${this.godMode ? ' · GOD' : ''}\n` +
        `[H] hitbox [G] god [N] section [B] boss [K] boss damage [T] slow [Y] bot [1-4] stage`,
    );
  }
}

const ZERO = new THREE.Vector3();

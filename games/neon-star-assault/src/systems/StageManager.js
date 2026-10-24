import * as THREE from 'three';
import { RailFrame, RailPath } from './Rail.js';
import { CHUNK_LENGTH, RAIL, SCORING } from '../config/gameConfig.js';
import { createRng, rand } from '../utils/math.js';

const _rel = new THREE.Vector3();
const _color = new THREE.Color();

/** Helper handed to chunk builders: frames and positions along the chunk's stretch of rail. */
class ChunkContext {
  constructor(manager) {
    this.manager = manager;
  }

  setup(offset, length, pathId, s0, section, rng, group) {
    this.offset = offset;
    this.length = length;
    this.pathId = pathId;
    this.s0 = s0;
    this.section = section;
    this.rng = rng;
    this.group = group;
    this.animators = [];
  }

  /** Register a per-frame animation callback (dt, time) living as long as the chunk. */
  animate(fn) {
    this.animators.push(fn);
  }

  /** New RailFrame `o` units into the chunk. */
  frame(o) {
    return this.manager.game.rail.frameAhead(this.offset + o, new RailFrame());
  }

  at(o, x, y, z, out) {
    const f = this.manager.game.rail.frameAhead(this.offset + o, this.manager.tmpFrame);
    return f.localToWorld(x, y, z, out);
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  /** 0..1 progress of this chunk through its section (for "narrowing" effects). */
  get progress() {
    const s = this.section;
    return Math.min(1, Math.max(0, (this.s0 - s.start) / Math.max(1, s.end - s.start)));
  }
}

/**
 * Runs a stage definition: builds its rail, streams scenery chunks ahead of the camera,
 * fires distance-based events, blends section palettes and handles the boss.
 */
export class StageManager {
  constructor(game) {
    this.game = game;
    this.stage = null;
    this.chunks = [];
    this.tmpFrame = new RailFrame();
    this.chunkCtx = new ChunkContext(this);
    this.fogTarget = new THREE.Color();
    this.state = {};
  }

  get kit() {
    return this.game.kit;
  }

  // ------------------------------------------------------------ load / unload
  load(stage, startAt = 0) {
    const game = this.game;
    this.unload();
    this.stage = stage;
    this.state = {};
    this.bossSpawned = false;
    this.bossDone = false;
    this.supportTimer = 25;
    this.section = null;
    this.checkpoint = startAt;
    this.sectionOverrideData = null;

    const rng = createRng(stage.seed);
    const paths = stage.buildPath(rng);
    const main = new RailPath(paths.main);
    let alt = null;
    if (paths.alt) alt = { path: new RailPath(paths.alt.points), forkS: paths.alt.forkS, mergeS: paths.alt.mergeS };
    game.rail.setup(main, alt);
    game.rail.onPathChange = (kind) => this.onPathChange(kind);
    game.rail.jumpTo(startAt);

    this.eventIndex = { main: 0, alt: 0 };
    while (this.eventIndex.main < stage.events.length && stage.events[this.eventIndex.main].at < startAt) {
      const ev = stage.events[this.eventIndex.main];
      if (ev.persistent) this.runEvent(ev); // e.g. music / palette setup
      this.eventIndex.main++;
    }

    this.applyTheme(stage.theme, true);
    const sec = this.sectionAt('main', startAt);
    game.rail.setSpeed(sec?.speed ?? stage.theme.speed, true);
    this.enterSection(sec, startAt === 0);
    this.fogColor(sec, true);

    // stage state (e.g. Stage 3's gravity-well list) must exist before the first chunks are built
    stage.setup?.(this.stageContext());
    this.genCursor = game.rail.travel - 60;
    this.streamChunks();
  }

  unload() {
    const game = this.game;
    for (const c of this.chunks) this.disposeChunk(c);
    this.chunks.length = 0;
    if (game.boss) {
      game.boss.dispose();
      game.boss = null;
    }
    game.hud.hideBoss();
    game.enemies.clear();
    game.obstacles.clear();
    game.projectiles.clear();
    game.powerups.clear();
    game.effects.clear();
    if (this.stage?.teardown) this.stage.teardown(this.stageContext());
    this.stage = null;
  }

  stageContext() {
    return { game: this.game, kit: this.kit, manager: this, state: this.state };
  }

  applyTheme(theme, immediate) {
    const game = this.game;
    game.setTheme(theme);
    if (immediate) {
      game.scene.fog.color.set(theme.fog);
      game.scene.background.set(theme.background);
    }
  }

  // ------------------------------------------------------------ sections
  sectionsFor(pathId) {
    return pathId === 'alt' ? this.stage.altSections : this.stage.sections;
  }

  /** Replace the scenery/palette from `fromS` onwards (escape sequence). */
  overrideSection(section, fromS) {
    this.sectionOverrideData = { section, fromS };
  }

  sectionAt(pathId, s) {
    const o = this.sectionOverrideData;
    if (o && pathId === 'main' && s >= o.fromS) return o.section;
    const list = this.sectionsFor(pathId) ?? [];
    if (list.length && s < list[0].start) return list[0];
    for (const sec of list) if (s >= sec.start && s < sec.end) return sec;
    return list[list.length - 1] ?? null;
  }

  enterSection(sec, showBanner = true) {
    if (!sec || sec === this.section) return;
    this.section = sec;
    const game = this.game;
    if (sec.speed && !this.bossSpawned) game.rail.setSpeed(sec.speed);
    if (sec.dust) game.dust.setColor(sec.dust);
    if (sec.title) game.hud.sectionTitle(sec.title, showBanner);
    if (sec.warning) {
      game.hud.warning(sec.warning, 2.2);
      game.audio.play('warning');
    }
    game.postfx.stageBloomFactor = sec.bloom ?? 1;
    game.sky.setMood(sec.sky ?? null);
  }

  fogColor(sec, immediate = false) {
    const target = this.fogTarget.set(sec?.fog ?? this.stage.theme.fog);
    const fog = this.game.scene.fog;
    if (immediate) fog.color.copy(target);
    return target;
  }

  // ------------------------------------------------------------ update
  update(dt) {
    if (!this.stage) return;
    const game = this.game;
    const rail = game.rail;

    const sec = this.sectionAt(rail.pathId, rail.s);
    if (sec !== this.section) this.enterSection(sec);
    const target = this.fogColor(sec);
    game.scene.fog.color.lerp(target, 1 - Math.exp(-1.2 * dt));
    _color.copy(game.scene.fog.color).multiplyScalar(this.stage.theme.backgroundFactor ?? 0.45);
    game.scene.background.copy(_color);

    this.runEvents();
    this.streamChunks();
    this.cullChunks();
    this.animateChunks(dt);
    this.stage.update?.(this.stageContext(), dt);
    this.updateBossSupport(dt);
  }

  runEvents() {
    const rail = this.game.rail;
    const id = rail.pathId;
    const list = id === 'alt' ? this.stage.altEvents : this.stage.events;
    if (!list) return;
    while (this.eventIndex[id] < list.length && list[this.eventIndex[id]].at <= rail.s) {
      this.runEvent(list[this.eventIndex[id]]);
      this.eventIndex[id]++;
    }
  }

  onPathChange(kind) {
    const game = this.game;
    if (kind === 'alt') {
      this.eventIndex.alt = 0;
      const gained = game.score.add(SCORING.altRoute, false);
      game.hud.banner('HIDDEN ROUTE', `High-risk sector · +${gained}`);
      game.audio.play('stageChange');
    } else if (kind === 'merge') {
      const events = this.stage.events;
      const mergeS = game.rail.alt.mergeS;
      while (this.eventIndex.main < events.length && events[this.eventIndex.main].at < mergeS) this.eventIndex.main++;
      game.hud.sectionTitle('Back on the main route');
    }
  }

  // ------------------------------------------------------------ events
  runEvent(ev) {
    const game = this.game;
    const ctx = this.stageContext();
    switch (ev.type) {
      case 'wave':
        game.enemies.spawnWave(ev);
        break;
      case 'enemy':
        game.enemies.spawn(ev.enemy, { ...ev.opts, local: new THREE.Vector3(ev.x ?? 0, ev.y ?? 0, ev.z ?? -220) });
        break;
      case 'turrets':
        for (const t of ev.list) {
          this.spawnWorldEnemy('turret', ev.ahead + (t.dz ?? 0), t.x, t.y, { spread: ev.spread ?? 1, flip: t.flip, roll: t.roll, strut: t.strut ?? ev.strut });
        }
        break;
      case 'mines':
        for (const m of ev.list) this.spawnWorldEnemy('mine', ev.ahead + (m.dz ?? 0), m.x, m.y, {});
        break;
      case 'powerup':
        game.powerups.spawnLocal(ev.item ?? null, new THREE.Vector3(ev.x ?? 0, ev.y ?? 0, -170), 30);
        break;
      case 'banner':
        game.hud.banner(ev.title, ev.subtitle);
        break;
      case 'warning':
        game.hud.warning(ev.text, ev.duration ?? 2);
        game.audio.play('warning');
        break;
      case 'speed':
        game.rail.setSpeed(ev.speed, false, ev.lerp);
        break;
      case 'music':
        if (ev.track) game.audio.playMusic(ev.track);
        if (ev.intensity !== undefined) game.audio.setMusicIntensity(ev.intensity);
        break;
      case 'checkpoint':
        this.checkpoint = ev.at;
        game.onCheckpoint();
        break;
      case 'boss':
        this.spawnBoss();
        break;
      case 'custom':
        ev.run(ctx);
        break;
      default:
        console.warn('Evento de estágio desconhecido:', ev.type);
    }
  }

  /** World-mode enemy placed `ahead` units down the rail at rail-local (x, y). */
  spawnWorldEnemy(type, ahead, x, y, opts) {
    const f = this.game.rail.frameAhead(ahead, this.tmpFrame);
    const pos = f.localToWorld(x, y, 0, new THREE.Vector3());
    const quat = f.quaternion.clone();
    if (opts.flip) quat.multiply(FLIP);
    if (opts.roll) quat.multiply(_roll.setFromAxisAngle(Z_AXIS, opts.roll)); // wall mounts (±PI/2)
    return this.game.enemies.spawn(type, { ...opts, mode: 'world', worldPos: pos, worldQuat: quat });
  }

  // ------------------------------------------------------------ boss
  spawnBoss() {
    if (this.bossSpawned) return;
    const game = this.game;
    this.bossSpawned = true;
    this.checkpoint = game.rail.s - 1;
    game.onCheckpoint();
    game.rail.setSpeed(RAIL.bossSpeed, false, 0.8);
    game.boss = this.stage.createBoss(game);
    game.hud.showBoss(game.boss.name);
    game.hud.warning('WARNING — COLOSSAL TARGET APPROACHING', 3);
    game.audio.play('alert');
    game.audio.playMusic(this.stage.bossMusic);
    game.audio.setMusicIntensity(1);
  }

  /** Occasional help during long boss fights. */
  updateBossSupport(dt) {
    const boss = this.game.boss;
    if (!boss || !boss.alive || boss.dying || boss.entering) return;
    this.supportTimer -= dt;
    if (this.supportTimer <= 0) {
      this.supportTimer = 28;
      const p = this.game.player;
      const item = p.hp < p.maxHp ? 'repair' : p.bombs < 1 ? 'bomb' : null;
      this.game.powerups.spawnLocal(item, new THREE.Vector3(rand(-10, 10), rand(-5, 5), -90), 14);
    }
  }

  // ------------------------------------------------------------ scenery streaming
  streamChunks() {
    const game = this.game;
    const rail = game.rail;
    const draw = game.quality.drawDistance;
    const forkLimit = rail.lookaheadLimit();
    const target = rail.travel + Math.min(draw, forkLimit);
    let guard = 0;
    while (guard++ < 12) {
      let len = CHUNK_LENGTH;
      const room = target - this.genCursor;
      if (room < len) {
        // only an undecided fork justifies a partial chunk (fill exactly up to it)
        if (forkLimit < draw && room >= 10) len = room;
        else break;
      }
      const offset = this.genCursor - rail.travel;
      const r = rail.resolve(offset);
      const pathId = r.pathId;
      const s0 = r.s;
      if (pathId === 'main' && s0 >= rail.main.length) break;
      this.buildChunk(offset, len, pathId, s0, this.sectionAt(pathId, s0));
      this.genCursor += len;
    }
  }

  buildChunk(offset, length, pathId, s0, section) {
    const game = this.game;
    const group = new THREE.Group();
    group.name = `chunk:${section?.id ?? 'none'}:${Math.round(s0)}`;
    const rng = createRng(((this.stage.seed * 7919) ^ Math.floor(s0 * 13) ^ (pathId === 'alt' ? 99991 : 0)) >>> 0);
    this.chunkCtx.setup(offset, length, pathId, s0, section, rng, group);
    try {
      section?.chunk?.(this.kit, this.chunkCtx, this.stageContext());
    } catch (err) {
      console.error(`Erro ao gerar cenário (${section?.id})`, err);
    }
    game.scene.add(group);
    const end = game.rail.frameAhead(offset + length, new RailFrame());
    this.chunks.push({ group, animators: this.chunkCtx.animators, endPos: end.position.clone(), endForward: end.forward.clone() });
  }

  cullChunks() {
    const player = this.game.player.worldPosition;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      _rel.subVectors(player, c.endPos);
      if (_rel.dot(c.endForward) > 80) {
        this.disposeChunk(c);
        this.chunks.splice(i, 1);
      }
    }
  }

  disposeChunk(c) {
    this.game.scene.remove(c.group);
    c.group.traverse((o) => {
      if (o.userData.ownsGeometry && o.geometry) o.geometry.dispose();
      if (o.userData.ownsMaterial && o.material) o.material.dispose();
      if (o.isInstancedMesh && o.userData.ownsInstances) o.dispose(); // frees the per-chunk instance buffers
    });
  }

  animateChunks(dt) {
    const time = this.game.time;
    for (const c of this.chunks) for (const fn of c.animators) fn(dt, time);
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const FLIP = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, Math.PI);
const _roll = new THREE.Quaternion();

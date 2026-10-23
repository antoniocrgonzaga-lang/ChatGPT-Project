import * as THREE from 'three';
import {
  GAME_TITLE, QUALITY, DEFAULT_QUALITY, DIFFICULTY, DEFAULT_DIFFICULTY, CAMERA, WEAPONS,
  SCORING, POWERUPS, AUDIO, SETTINGS_STORAGE_KEY, PLAYER, SHIPS, DEFAULT_SHIP,
} from '../config/gameConfig.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { AssetManager } from './AssetManager.js';
import { CameraRig } from './CameraRig.js';
import { PostFX } from './PostFX.js';
import { DebugTools } from './DebugTools.js';
import { Rail } from '../systems/Rail.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { ObstacleSystem } from '../systems/ObstacleSystem.js';
import { PowerUpSystem } from '../systems/PowerUpSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { EffectsSystem } from '../systems/EffectsSystem.js';
import { ScoreSystem } from '../systems/ScoreSystem.js';
import { StageManager } from '../systems/StageManager.js';
import { PortalTransition, EscapeSequence, EndingCutscene } from '../systems/Sequences.js';
import { PlayerShip } from '../entities/PlayerShip.js';
import { SkyDome, SpaceDust } from '../scenery/Sky.js';
import { SceneryKit } from '../scenery/SceneryKit.js';
import { HUD } from '../ui/HUD.js';
import { Screens } from '../ui/Screens.js';
import { Stage1 } from '../stages/Stage1.js';
import { Stage2 } from '../stages/Stage2.js';
import { Stage3 } from '../stages/Stage3.js';
import { Stage4 } from '../stages/Stage4.js';
import { chance } from '../utils/math.js';

/** Stage order. Add new stage definitions here. */
export const STAGES = [Stage1, Stage2, Stage3, Stage4];

const MAX_DT = 1 / 20;
const _dir = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

function loadSettings() {
  const defaults = { quality: DEFAULT_QUALITY, difficulty: DEFAULT_DIFFICULTY, ship: DEFAULT_SHIP, volume: AUDIO.master, muted: AUDIO.muted };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    const s = { ...defaults, ...JSON.parse(raw) };
    if (!QUALITY[s.quality]) s.quality = DEFAULT_QUALITY;
    if (!DIFFICULTY[s.difficulty]) s.difficulty = DEFAULT_DIFFICULTY;
    if (!SHIPS[s.ship]) s.ship = DEFAULT_SHIP;
    return s;
  } catch {
    return defaults;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Owns the renderer, the single animation loop, the game state machine and all systems.
 * Systems talk back through the on*() callbacks below, which keeps scoring/audio/UI
 * reactions in one place.
 */
export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.state = 'loading';
    this.time = 0;
    this.loopStarted = false;
    this.lastFrame = 0;
    this.combatActive = false;
    this.aimHasTarget = false;
    this.dustBoost = 0;
    this.sequence = null;
    this.boss = null;
    this.stageIndex = 0;
    this.stateTimer = 0;

    this.input = new InputManager(window);
    this.audio = new AudioManager({ master: this.settings.volume, muted: this.settings.muted });
    this.input.onFirstInteraction = () => this.audio.init();
    this.hud = new HUD(uiRoot);
    this.screens = new Screens(uiRoot, this.uiHandlers());
    this.debug = new DebugTools(this);
    window.addEventListener('resize', () => this.resize());
  }

  /** Selected difficulty preset combined with the current stage's aggression (later stages hit harder). */
  get difficulty() {
    const base = DIFFICULTY[this.settings.difficulty];
    const aggro = this.theme?.aggression;
    if (!aggro) return base;
    const key = `${this.settings.difficulty}:${this.theme.warpColor}`;
    if (this._difficultyKey !== key) {
      this._difficultyKey = key;
      this._difficulty = {
        ...base,
        fireRate: base.fireRate * (aggro.fireRate ?? 1),
        bulletSpeed: base.bulletSpeed * (aggro.bulletSpeed ?? 1),
        enemyHp: base.enemyHp * (aggro.enemyHp ?? 1),
      };
    }
    return this._difficulty;
  }

  get quality() {
    return QUALITY[this.settings.quality];
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable (private mode) — settings just won't persist */
    }
  }

  // ------------------------------------------------------------ boot
  async boot() {
    document.title = GAME_TITLE;
    this.screens.showLoading();
    if (!webglAvailable()) {
      this.screens.showFatal('WebGL não está disponível neste navegador.');
      return;
    }
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.info.autoReset = false; // several passes per frame; reset once per frame in tick()
      this.assets = new AssetManager(this.renderer);
      await this.assets.load((p, label) => this.screens.setLoadingProgress(p, label));
      this.createWorld();
      this.applyQuality(this.settings.quality);
      this.setTheme(Stage1.theme);
      this.screens.setLoadingProgress(1, 'shaders');
      await this.prewarmShaders();
    } catch (err) {
      console.error(err);
      this.screens.showFatal(err.message ?? String(err));
      return;
    }
    this.startLoop();
    this.debug.applyUrlOptions();
    if (this.state === 'loading') this.goToTitle();
  }

  createWorld() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x04020c);
    this.scene.fog = new THREE.Fog(0x120828, 60, 700);
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);

    this.rig = new THREE.Group();
    this.rig.name = 'RailRig';
    this.scene.add(this.rig);

    this.hemi = new THREE.HemisphereLight(0x7060d0, 0x140a24, 0.9);
    this.keyLight = new THREE.DirectionalLight(0xcdb8ff, 2.4);
    this.keyLight.position.set(20, 40, 10);
    this.rimLight = new THREE.DirectionalLight(0x2de2ff, 1.6);
    this.rimLight.position.set(-30, -10, -40);
    this.scene.add(this.hemi, this.keyLight, this.keyLight.target, this.rimLight);

    this.rail = new Rail();
    this.cameraRig = new CameraRig(this.camera);
    this.postfx = new PostFX(this.renderer, this.scene, this.camera);
    this.kit = new SceneryKit(this);
    this.projectiles = new ProjectileSystem(this);
    this.enemies = new SpawnSystem(this);
    this.obstacles = new ObstacleSystem(this);
    this.score = new ScoreSystem(this);
    this.player = new PlayerShip(this);
    this.rig.add(this.player.root);
    this.player.attachTrails(this.rig);
    this.powerups = new PowerUpSystem(this);
    this.collisions = new CollisionSystem(this);
    this.stageManager = new StageManager(this);
    this.sky = new SkyDome(this);
    this.dust = new SpaceDust(this);
  }

  applyQuality(key) {
    this.settings.quality = key;
    const q = this.quality;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.keyLight.castShadow = q.shadows;
    if (q.shadows) {
      this.keyLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      const cam = this.keyLight.shadow.camera;
      cam.left = cam.bottom = -40;
      cam.right = cam.top = 40;
      cam.near = 1;
      cam.far = 200;
      this.keyLight.shadow.bias = -0.0005;
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }
    if (this.effects) this.effects.dispose();
    this.effects = new EffectsSystem(this, q);
    this.player.setEngineLights(q.engineLights);
    this.postfx.build(q);
    this.scene.fog.far = q.drawDistance;
    this.dust.build(q.dust, this.theme?.dust ?? 0xb9a6ff);
    if (this.theme) this.sky.build(q, this.theme.sky);
    this.scene.traverse((o) => {
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
    });
    this.resize();
    this.saveSettings();
  }

  /**
   * Compiles every shader variant the game will need up front (enemies, bosses, all shared
   * materials) so the first explosion / boss / stage-2 prop doesn't stall a frame.
   */
  async prewarmShaders() {
    const group = new THREE.Group();
    const geo = this.assets.geometries.box;
    for (const mat of Object.values(this.assets.materials)) {
      const mesh = mat.isLineBasicMaterial ? new THREE.LineSegments(this.kit.edgeGeo, mat) : new THREE.Mesh(geo, mat);
      mesh.position.set(0, 0, -20);
      group.add(mesh);
    }
    // the other selectable ships are compiled too, so switching ships on the title never stalls
    const idleShips = Object.values(this.assets.models.ships).filter((t) => t && t.group.parent !== this.player.body);
    for (const t of idleShips) group.add(t.group);
    this.scene.add(group);
    const bosses = STAGES.map((stage) => stage.createBoss(this));
    const hidden = [];
    for (const pool of Object.values(this.enemies.pools)) {
      for (const e of pool.free) {
        if (!e.object.visible) {
          e.object.visible = true;
          hidden.push(e.object);
        }
      }
    }
    for (const item of this.powerups.items) {
      item.object.visible = true;
      hidden.push(item.object);
      for (const v of Object.values(item.variants)) v.group.visible = v.label.visible = true;
    }
    try {
      if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
      else this.renderer.compile(this.scene, this.camera);
      this.postfx.render();
    } catch (err) {
      console.warn('Pré-compilação de shaders falhou (seguindo mesmo assim):', err);
    }
    for (const o of hidden) o.visible = false;
    for (const item of this.powerups.items) item.release();
    for (const b of bosses) b.dispose();
    for (const t of idleShips) group.remove(t.group);
    this.scene.remove(group);
  }

  setTheme(theme) {
    this.theme = theme;
    this.scene.environment = this.assets.envMaps[theme.env];
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.keyLight.color.set(theme.key);
    this.keyLight.intensity = theme.keyIntensity;
    this.rimLight.color.set(theme.rim);
    this.rimLight.intensity = theme.rimIntensity;
    this.enemyAccentMaterial = this.assets.materials[theme.enemyAccent];
    this.enemyTrimMaterial = this.assets.materials[theme.enemyTrim ?? theme.enemyAccent];
    this.assets.enemyRim.value.set(theme.enemyRim ?? 0x8a5cff);
    this.projectiles.setEnemyColor(theme.enemyShot);
    this.scene.fog.near = theme.fogNear;
    this.scene.fog.far = this.quality.drawDistance;
    this.sky.build(this.quality, theme.sky);
    this.dust.setColor(theme.dust);
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === 0 || h === 0) return; // minimised / hidden: keep the last valid size (zero-size targets are invalid)
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.postfx.setSize(w, h, pr);
    this.effects?.particles.setViewportHeight(h * pr, CAMERA.fov);
    if (this.sky.starMaterial) this.sky.starMaterial.uniforms.uPixelRatio.value = pr;
  }

  // ------------------------------------------------------------ loop
  startLoop() {
    if (this.loopStarted) return; // exactly one requestAnimationFrame chain, ever
    this.loopStarted = true;
    this.lastFrame = performance.now();
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min((now - this.lastFrame) / 1000, MAX_DT);
      this.lastFrame = now;
      try {
        this.tick(dt);
      } catch (err) {
        console.error('Erro no loop principal:', err);
        this.debug.reportError(err);
      }
    };
    requestAnimationFrame(frame);
  }

  tick(dt) {
    this.renderer.info.reset();
    this.step(dt);
    if (this.state !== 'loading' && this.renderer.domElement.width > 0) this.postfx.render();
    this.debug.update(dt);
  }

  /** One logic step (no rendering). Also used by the debug fast-forward simulation. */
  step(dt) {
    this.input.poll();
    this.debug.applyBot();
    this.handleStateInput();
    const scaled = dt * this.debug.timeScale;
    switch (this.state) {
      case 'playing':
      case 'transition':
      case 'dying':
        this.updateWorld(scaled);
        break;
      case 'ending':
      case 'victory':
        this.updateEnding(scaled);
        break;
      case 'title':
      case 'instructions':
        this.updateAttract(dt);
        break;
      case 'gameover':
        this.effects.update(dt);
        this.postfx.update(dt, this.time);
        break;
      default:
        break;
    }
    this.input.endFrame();
  }

  updateWorld(dt) {
    this.time += dt;
    this.combatActive = this.state === 'playing' && !(this.sequence instanceof PortalTransition);

    this.rail.update(dt);
    this.rig.position.copy(this.rail.frame.position);
    this.rig.quaternion.copy(this.rail.frame.quaternion);
    this.rig.updateMatrixWorld(true);

    this.stageManager.update(dt);
    this.player.update(dt, this.state === 'playing' ? this.input : NULL_INPUT);
    this.aimHasTarget = this.player.alive && this.collisions.aimHasTarget(this.player.worldPosition, this.player.aimWorld(_dir));
    this.enemies.update(dt);
    if (this.boss) this.boss.update(dt);
    this.obstacles.update(dt);
    this.projectiles.update(dt);
    this.powerups.update(dt);
    if (this.combatActive || this.state === 'transition') this.collisions.update();
    this.effects.update(dt);
    this.score.update(dt, this.combatActive && !!this.stageManager.stage);
    this.updateSequence(dt);
    this.updateStateTimers(dt);

    this.updateShadowCamera();
    this.cameraRig.speedFov = Math.max(0, this.rail.speed - (this.theme?.speed ?? 45)) * CAMERA.fovSpeed;
    this.cameraRig.update(dt, this.rig, this.player);
    this.dust.update(dt, this.rail.speed + this.dustBoost * 200, this.dustBoost);
    this.sky.update(dt, this.camera);
    this.postfx.update(dt, this.time);
    this.hud.update(dt, this);
  }

  /** Title / instructions background: the ship in a slow orbit shot. */
  updateAttract(dt) {
    this.time += dt;
    this.rig.updateMatrixWorld(true);
    this.player.update(dt, NULL_INPUT);
    this.effects.update(dt);
    this.cameraRig.update(dt, this.rig, this.player);
    this.dust.update(dt, 26, 0);
    this.sky.update(dt, this.camera);
    this.postfx.update(dt, this.time);
  }

  updateEnding(dt) {
    this.time += dt;
    this.rig.updateMatrixWorld(true);
    this.player.update(dt, NULL_INPUT);
    this.effects.update(dt);
    if (this.sequence) {
      const done = this.sequence.update(dt);
      if (done && this.state === 'ending') {
        if (this.endingIsFinal) this.setState('victory');
        else this.continueToNextStage();
      }
    }
    this.cameraRig.update(dt, this.rig, this.player);
    this.dust.update(dt, 90, 0.3);
    this.sky.update(dt, this.camera);
    this.postfx.update(dt, this.time);
  }

  updateShadowCamera() {
    if (!this.keyLight.castShadow) return;
    const p = this.player.worldPosition;
    this.keyLight.target.position.copy(p);
    this.keyLight.position.copy(p).add(_shadowOffset);
    this.keyLight.target.updateMatrixWorld();
  }

  updateSequence(dt) {
    if (!this.sequence) return;
    const done = this.sequence.update(dt);
    if (!done) return;
    const seq = this.sequence;
    this.sequence = null;
    if (seq instanceof PortalTransition) {
      this.setState('playing');
    } else if (seq instanceof EscapeSequence) {
      seq.dispose();
      this.startEnding(STAGES[this.stageIndex].ending ?? 'planet');
    }
  }

  updateStateTimers(dt) {
    if (this.state === 'dying') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.setState('gameover');
    }
    if (this.pendingEnding && this.state === 'playing') {
      this.pendingEnding.t -= dt;
      if (this.pendingEnding.t <= 0) this.startEnding(this.pendingEnding.variant);
    }
  }

  // ------------------------------------------------------------ state machine
  setState(next) {
    const prev = this.state;
    this.state = next;
    this.stateTimer = 0;
    switch (next) {
      case 'title':
        this.hud.hide();
        this.screens.showTitle(this.settingsView(), this.assets?.warnings ?? []);
        break;
      case 'instructions':
        this.screens.showInstructions();
        break;
      case 'playing':
        this.screens.hide();
        this.hud.show();
        if (prev === 'paused') this.audio.play('pause');
        break;
      case 'paused':
        this.player.stopCharge();
        this.screens.showPause(this.settingsView());
        this.audio.play('pause');
        break;
      case 'transition':
        this.screens.hide();
        break;
      case 'dying':
        this.stateTimer = 2.2;
        break;
      case 'gameover':
        this.hud.hide();
        this.audio.stopMusic();
        this.audio.play('defeat');
        this.screens.showGameOver({ score: this.score.score });
        break;
      case 'ending':
        this.hud.hide();
        break;
      case 'victory':
        this.audio.play('victory');
        this.audio.playMusic('title');
        this.stateTimer = 1.5;
        this.screens.showVictory(this.victoryData());
        break;
      default:
        break;
    }
  }

  handleStateInput() {
    const input = this.input;
    if (input.pressed('mute')) this.toggleMute();
    switch (this.state) {
      case 'title':
        if (input.pressed('start')) this.newGame();
        else if (input.pressed('left')) this.cycleShip(-1);
        else if (input.pressed('right')) this.cycleShip(1);
        break;
      case 'instructions':
        if (input.pressed('start') || input.pressed('pause')) this.goToTitle();
        break;
      case 'playing':
      case 'transition':
        if (input.pressed('pause')) {
          input.consume('pause');
          this.pausedFrom = this.state;
          this.setState('paused');
        }
        break;
      case 'paused':
        if (input.pressed('pause')) {
          input.consume('pause');
          this.resume();
        }
        break;
      case 'gameover':
        if (input.pressed('start')) this.continueFromCheckpoint();
        else if (input.pressed('pause')) this.goToTitle();
        break;
      case 'victory':
        if (input.pressed('start') && this.time > 0 && this.victoryReadyAt <= performance.now()) this.newGame();
        break;
      default:
        break;
    }
  }

  resume() {
    this.state = this.pausedFrom ?? 'playing';
    this.screens.hide();
    this.hud.show();
    this.audio.play('pause');
    this.lastFrame = performance.now();
  }

  settingsView() {
    return { ...this.settings, volume: this.audio.volumes.master, muted: this.audio.muted };
  }

  uiHandlers() {
    return {
      onUiSound: () => {
        this.audio.init();
        this.audio.play('menuSelect');
      },
      onStart: () => this.newGame(),
      onInstructions: () => this.setState('instructions'),
      onBack: () => this.goToTitle(),
      onResume: () => this.resume(),
      onRestartStage: () => this.restartStage(),
      onMenu: () => this.goToTitle(),
      onContinue: () => this.continueFromCheckpoint(),
      onQuality: (key) => {
        this.applyQuality(key);
        this.setState('title');
      },
      onShip: (key) => this.selectShip(key),
      onDifficulty: (key) => {
        this.settings.difficulty = key;
        this.saveSettings();
        this.setState('title');
      },
      onVolume: (v) => {
        this.audio.setVolume('master', v);
        this.settings.volume = v;
        this.saveSettings();
      },
      onMute: () => {
        this.toggleMute();
        if (this.state === 'title') this.setState('title');
        else if (this.state === 'paused') this.screens.showPause(this.settingsView());
      },
    };
  }

  /** Title-screen ship choice: swaps the showcase model and is remembered for the next session. */
  selectShip(key) {
    if (!SHIPS[key] || this.state !== 'title') return;
    if (key !== this.settings.ship) {
      this.settings.ship = key;
      this.saveSettings();
      this.player.setShip(key);
      this.player.reset();
      this.player.controllable = false;
      this.audio.play('menuSelect');
    }
    this.setState('title');
  }

  cycleShip(dir) {
    const ids = Object.keys(SHIPS);
    const i = ids.indexOf(this.settings.ship);
    this.selectShip(ids[(i + dir + ids.length) % ids.length]);
  }

  toggleMute() {
    this.settings.muted = this.audio.toggleMute();
    this.saveSettings();
  }

  // ------------------------------------------------------------ flow
  goToTitle() {
    this.clearSequence();
    this.stageManager.unload();
    this.boss = null;
    this.player.reset();
    this.player.controllable = false;
    this.rig.position.set(0, 0, 0);
    this.rig.quaternion.identity();
    this.setTheme(Stage1.theme);
    this.scene.fog.color.set(Stage1.theme.fog);
    this.scene.background.set(Stage1.theme.background);
    this.cameraRig.reset();
    this.cameraRig.mode = 'showcase';
    this.postfx.reset();
    this.hud.reset();
    this.audio.playMusic('title');
    this.setState('title');
  }

  newGame() {
    this.audio.init();
    this.score.reset(0);
    this.player.reset();
    this.stageIndex = 0;
    this.startStage(0, 0);
  }

  /** Starts STAGES[index] at distance `startAt` (0 = beginning, or a checkpoint). */
  startStage(index, startAt = 0) {
    this.clearSequence();
    this.stageIndex = index;
    this.player.controllable = true;
    this.player.autopilot = null;
    this.cameraRig.reset();
    this.postfx.reset();
    this.hud.reset();
    this.loadStage(STAGES[index], startAt);
    this.setState('playing');
  }

  loadStage(stage, startAt = 0, { gradualPalette = false } = {}) {
    this.stageIndex = STAGES.indexOf(stage);
    const fog = this.scene.fog.color.clone();
    this.stageManager.load(stage, startAt); // unloads the previous stage (and disposes a live boss)
    if (gradualPalette) this.scene.fog.color.copy(fog); // StageManager then blends to the new palette
    this.rig.position.copy(this.rail.frame.position);
    this.rig.quaternion.copy(this.rail.frame.quaternion);
    this.rig.updateMatrixWorld(true);
    // culling uses the player's world position: refresh it before the first update on the new rail
    this.player.root.getWorldPosition(this.player.worldPosition);
    for (const t of this.player.trails) t.initialized = false;
    if (startAt === 0) this.stageStart = { score: this.score.score, player: this.player.snapshot() };
    this.onCheckpoint();
  }

  restartStage() {
    const snap = this.stageStart;
    if (snap) {
      this.score.reset(snap.score);
      this.player.reset(snap.player);
    } else {
      this.player.reset();
    }
    this.startStage(this.stageIndex, 0);
  }

  onCheckpoint() {
    this.checkpointData = { score: this.score.score, player: this.player.snapshot(), s: this.stageManager.checkpoint, stage: this.stageIndex };
  }

  continueFromCheckpoint() {
    const cp = this.checkpointData;
    this.audio.init();
    this.score.reset(cp?.score ?? 0);
    const keep = cp?.player ?? null;
    // a continue restores all lives (weapon power-ups are lost with the ship)
    this.player.reset(keep ? { bombs: Math.max(keep.bombs, PLAYER.startBombs) } : null);
    this.startStage(cp?.stage ?? 0, cp?.s ?? 0);
  }

  clearSequence() {
    if (this.sequence?.dispose) this.sequence.dispose();
    this.sequence = null;
    this.pendingEnding = null;
  }

  /** Stage-end cutscene. Only the last stage's ending leads to victory (and the clear bonus). */
  startEnding(variant = 'planet') {
    this.pendingEnding = null;
    this.stageManager.unload();
    this.setState('ending');
    this.sequence = new EndingCutscene(this, variant);
    this.endingIsFinal = this.stageIndex >= STAGES.length - 1;
    if (this.endingIsFinal) {
      const p = this.player;
      const gained = this.score.add(SCORING.gameClear + p.hp * SCORING.hpBonus + (p.lives - 1) * SCORING.lifeBonus, false);
      this.finalBonus = gained;
    }
  }

  /** After a non-final ending cutscene: jump straight into the warp tunnel towards the next stage. */
  continueToNextStage() {
    const next = STAGES[this.stageIndex + 1];
    this.sequence.dispose();
    this.state = 'transition';
    this.sequence = new PortalTransition(this, next, { startInWarp: true });
  }

  victoryData() {
    const s = this.score.stats;
    this.victoryReadyAt = performance.now() + 1500;
    return {
      score: this.score.score,
      subtitle: STAGES[STAGES.length - 1].victory,
      breakdown: [
        ['Inimigos destruídos', s.kills],
        ['Anéis atravessados', s.rings],
        ['Formações completas', s.formations],
        ['Danos sofridos', s.damageTaken],
        ['Vidas restantes', this.player.lives],
        ['Bônus de conclusão', `+${this.finalBonus ?? 0}`],
        ['Dificuldade', this.difficulty.label],
      ],
    };
  }

  // ------------------------------------------------------------ gameplay callbacks
  addScore(points, worldPos = null, useCombo = true) {
    const gained = this.score.add(points, useCombo);
    if (worldPos && gained >= 1000) this.hud.toast(`+${gained}`, '#ffd23d');
    return gained;
  }

  onEnemyKilled(enemy, byPlayer) {
    if (byPlayer) {
      this.score.registerKill();
      this.addScore(enemy.scoreValue, enemy.object.position);
      if (this.enemies.resolveWave(enemy, true)) {
        this.score.stats.formations++;
        const gained = this.score.add(SCORING.formationBonus, false);
        this.hud.toast(`FORMAÇÃO COMPLETA +${gained}`, '#6dffb0');
        if (chance(0.5)) this.powerups.spawnAtWorld(null, enemy.object.position);
      }
      if (enemy.drop) this.powerups.spawnAtWorld(enemy.drop === true ? null : enemy.drop, enemy.object.position);
      else if (!enemy.wave && chance(POWERUPS.dropChance)) this.powerups.spawnAtWorld(null, enemy.object.position);
    } else {
      this.enemies.resolveWave(enemy, false);
    }
    this.stageManager.stage?.onEnemyKilled?.(this.stageManager.stageContext(), enemy, byPlayer);
  }

  onEnemyEscaped(enemy) {
    this.enemies.resolveWave(enemy, false);
    this.stageManager.stage?.onEnemyKilled?.(this.stageManager.stageContext(), enemy, false);
  }

  onObstacleDestroyed(obs) {
    if (obs.score) {
      this.score.registerKill();
      this.addScore(obs.score);
    }
    if (obs.dropChance && chance(obs.dropChance)) this.powerups.spawnAtWorld(null, obs.boundCenter);
  }

  /** Every SCORING.hullRegenEvery points: repair one hull block (if the ship is alive and damaged). */
  onHullMilestone() {
    const p = this.player;
    if (!p.alive || !p.heal(1)) return;
    this.hud.toast('CASCO REPARADO +1', '#6dffb0');
    this.audio.play('pickup');
    this.effects.burst(p.worldPosition, { count: 20, color: 0x3dff8a, speed: 8, life: 0.5, size: 1 });
  }

  /** Every SCORING.extraLifeEvery points: one extra life (capped at PLAYER.maxLives). */
  onExtraLifeMilestone() {
    const p = this.player;
    if (p.lives >= PLAYER.maxLives) return;
    p.lives++;
    this.hud.banner('VIDA EXTRA!', `${p.lives} vidas`);
    this.audio.play('stageChange');
    this.effects.shockwave(p.worldPosition, { radius: 10, duration: 0.6, color: 0x39f0ff });
  }

  onRingPassed(ring) {
    this.score.stats.rings++;
    const gained = this.score.add(SCORING.ring, true);
    this.hud.toast(`ANEL +${gained}`, '#ffc23a');
    this.audio.play('ring');
    this.effects.shockwave(ring.center, { radius: ring.radius * 2, duration: 0.4, color: 0xffc23a });
  }

  onPlayerDamaged() {
    this.score.onDamage();
    this.audio.play('hurt');
    this.postfx.damageFlash(1);
    this.postfx.pulseChromatic(0.04);
    this.cameraRig.shake(0.55);
    this.effects.burst(this.player.worldPosition, { count: 24, color: 0xff5040, speed: 14, life: 0.5, size: 1.2 });
  }

  onPlayerShieldHit() {
    this.audio.play('shieldBreak');
    this.postfx.damageFlash(0.5, 0x4a7dff);
    this.cameraRig.shake(0.3);
    this.effects.burst(this.player.worldPosition, { count: 30, color: 0x5b8cff, speed: 16, life: 0.5, size: 1.2 });
  }

  onPlayerLifeLost() {
    this.score.onDamage();
    this.effects.explosion(this.player.worldPosition, { size: 3.5, color: 0x39f0ff });
    this.cameraRig.shake(0.9);
    this.postfx.damageFlash(1);
    this.audio.stopCharge();
    const left = this.player.lives;
    this.hud.warning(left === 1 ? 'NAVE DESTRUÍDA — ÚLTIMA VIDA!' : `NAVE DESTRUÍDA — ${left} VIDAS RESTANTES`, 2);
  }

  onPlayerRespawn() {
    // clear the area so the new ship never reappears inside a bullet
    this.projectiles.clearEnemyShots(this.player.worldPosition, 90);
    this.effects.shockwave(this.player.worldPosition, { radius: 8, duration: 0.5, color: 0x39f0ff });
    this.effects.burst(this.player.worldPosition, { count: 30, color: 0x39f0ff, speed: 10, life: 0.6, size: 1.2 });
    this.audio.play('shield');
  }

  onPlayerDeath() {
    this.score.onDamage();
    this.effects.explosion(this.player.worldPosition, { size: 3.5, color: 0x39f0ff });
    this.cameraRig.shake(1);
    this.postfx.damageFlash(1);
    this.audio.stopCharge();
    this.setState('dying');
  }

  onBossDying() {
    this.projectiles.clearEnemyShots(this.player.worldPosition, 1000);
    for (let i = this.enemies.active.length - 1; i >= 0; i--) {
      const e = this.enemies.active[i];
      if (e.alive) e.die(false);
    }
    this.obstacles.beams.releaseAll();
    this.hud.warning('ALVO DESTRUÍDO', 2);
  }

  onBossDefeated(boss) {
    this.hud.hideBoss();
    const gained = this.score.add(SCORING.stageClear, false);
    this.hud.banner('ESTÁGIO CONCLUÍDO', `Bônus +${gained}`);
    this.audio.setMusicIntensity(0);
    boss.dispose(); // safe mid-update: the boss only touches its own (now detached) objects afterwards
    this.boss = null;
    // each stage declares how it ends: 'portal' (default), 'escape' run, a 'cutscene' that warps on to
    // the next stage, or the 'final' cutscene (victory)
    const stage = STAGES[this.stageIndex];
    const next = STAGES[this.stageIndex + 1];
    if (stage.outro === 'escape') {
      this.sequence = new EscapeSequence(this, stage);
    } else if (stage.outro === 'final' || stage.outro === 'cutscene' || !next) {
      this.pendingEnding = { t: 2.2, variant: stage.ending ?? 'planet' }; // let the last blast play out
    } else {
      this.state = 'transition';
      this.sequence = new PortalTransition(this, next);
    }
  }

  triggerBomb(pos) {
    const W = WEAPONS.bomb;
    this.effects.bombWave(pos);
    this.audio.play('bomb');
    this.cameraRig.shake(0.7);
    this.postfx.boost(0.9);
    this.postfx.pulseChromatic(0.06);
    this.projectiles.clearEnemyShots(pos, W.clearRadius);
    _pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    for (let i = this.enemies.active.length - 1; i >= 0; i--) {
      const e = this.enemies.active[i];
      if (e.alive && e.object.visible && _frustum.containsPoint(e.object.position)) e.bombHit(W.damage);
    }
    if (this.boss && this.boss.alive && !this.boss.dying && !this.boss.entering) this.boss.bombHit(W.bossDamage);
    for (const o of this.obstacles.list) {
      if (o.alive && o.destructible && o.boundCenter.distanceTo(pos) < W.clearRadius) this.obstacles.damage(o, W.damage, o.boundCenter);
    }
  }

  findLockTarget(origin, dir) {
    return this.collisions.findLockTarget(origin, dir);
  }
}

/** Input stand-in used when the player must not react (menus, cutscenes). */
const NULL_INPUT = {
  moveX: 0,
  moveY: 0,
  held: () => false,
  pressed: () => false,
  released: () => false,
};

const _shadowOffset = new THREE.Vector3(20, 40, 10);

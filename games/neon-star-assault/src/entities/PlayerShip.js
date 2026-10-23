import * as THREE from 'three';
import { PLAYER, WEAPONS, POWERUPS, COLORS, CAMERA, SHIPS, DEFAULT_SHIP } from '../config/gameConfig.js';
import { clamp, damp } from '../utils/math.js';
import { TrailRibbon } from '../effects/TrailRibbon.js';
import { createShieldMaterial } from '../effects/materials.js';
import { buildFallbackShip } from './models/FallbackShip.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

/**
 * Player ship: model, movement inside the rail-local play area, weapons, dodge, damage state.
 * `root` is a child of the rail rig, so `local` is the offset from the rail centre.
 */
export class PlayerShip {
  constructor(game) {
    this.game = game;
    const assets = game.assets;
    this.root = new THREE.Group();
    this.root.name = 'Player';
    this.body = new THREE.Group();
    this.body.rotation.order = 'YXZ';
    this.root.add(this.body);


    this.local = this.root.position;
    this.velocity = new THREE.Vector3();
    this.aimDirLocal = new THREE.Vector3(0, 0, -1);
    this.aimInput = new THREE.Vector2();
    this.worldPosition = new THREE.Vector3();
    this.engines = [];
    this.trails = [];
    this.lights = [];
    this.lightCount = 0;
    this.trailParent = null;

    this.buildShield(assets);
    this.buildReticle(assets);
    this.buildChargeOrb(assets);
    this.setShip(game.settings.ship);
    this.reset();
  }

  /**
   * Swaps the ship model and stats (title-screen selection). Engines, trails, lights, shield
   * and charge orb are rebuilt around the new model's sockets.
   */
  setShip(id) {
    const assets = this.game.assets;
    this.shipId = SHIPS[id] ? id : DEFAULT_SHIP;
    this.ship = SHIPS[this.shipId];
    this.stats = this.ship.stats;
    this.shot = { ...WEAPONS.shot, ...this.ship.shot };
    this.colors = { shot: COLORS.playerShot, dualShot: 0x7dfcff, engine: COLORS.playerEngine, flame: 'flameCyan', glow: 'glowCyan', ...this.ship.colors };

    if (this.template) this.body.remove(this.template.group);
    for (const e of this.engines) {
      this.body.remove(e.group);
      e.halo.material.dispose();
    }
    for (const t of this.trails) {
      t.mesh.parent?.remove(t.mesh);
      t.dispose();
    }

    this.template = assets.models.ships[this.shipId] ?? (this.fallbackTemplate ??= buildFallbackShip(assets));
    this.template.group.rotation.set(0, 0, 0);
    this.body.add(this.template.group);
    this.buildEngines(assets);
    if (this.trailParent) this.attachTrails(this.trailParent);
    this.setEngineLights(this.lightCount);

    const len = this.template.length;
    this.shieldMesh.scale.set(len * 0.5, len * 0.28, len * 0.62);
    this.chargeOrb.position.copy(this.noseCenter(_v)).add(_v2.set(0, 0, -0.4));
    this.chargeCore.position.copy(this.chargeOrb.position);
  }

  get maxHp() {
    return this.stats.maxHp;
  }

  // ------------------------------------------------------------ construction
  buildEngines(assets) {
    const r = this.template.engineRadius;
    this.engines = [];
    for (const pos of this.template.engines) {
      const group = new THREE.Group();
      group.position.copy(pos);
      const disc = new THREE.Mesh(assets.geometries.sphere, assets.materials[this.colors.glow]);
      disc.scale.set(r * 0.85, r * 0.85, r * 0.25);
      const flame = new THREE.Mesh(assets.geometries.cone, assets.materials[this.colors.flame]);
      flame.rotation.x = Math.PI / 2;
      const core = new THREE.Mesh(assets.geometries.cone, assets.materials.glowWhite);
      core.rotation.x = Math.PI / 2;
      const halo = new THREE.Sprite(assets.spriteMaterial(this.colors.engine, 0.55));
      halo.scale.setScalar(r * 4);
      group.add(disc, flame, core, halo);
      this.body.add(group);
      this.engines.push({ group, flame, core, halo, base: pos.clone() });
    }
    this.trails = this.template.engines.map(() => new TrailRibbon(this.colors.engine, { width: r * 0.7 }));
  }

  /** Engine point lights depend on the quality preset, so they are (re)built separately. */
  setEngineLights(count) {
    this.lightCount = count;
    for (const l of this.lights) l.parent.remove(l);
    this.lights = [];
    const engines = this.template.engines;
    if (!engines.length) return;
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(this.colors.engine, 8, 9, 2);
      if (count === 1) light.position.set(0, engines[0].y, engines[0].z + 0.8);
      else light.position.copy(engines[i % engines.length]).add(_v.set(0, 0, 0.8));
      this.body.add(light);
      this.lights.push(light);
    }
  }

  buildShield(assets) {
    this.shieldMaterial = createShieldMaterial(POWERUPS.shield.color, { hexTexture: assets.textures.hex });
    this.shieldMesh = new THREE.Mesh(assets.geometries.sphere, this.shieldMaterial); // sized in setShip()
    this.shieldMesh.visible = false;
    this.root.add(this.shieldMesh);
  }

  buildReticle(assets) {
    this.reticleMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(COLORS.reticle).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      depthTest: false,
    });
    this.reticle = new THREE.Group();
    this.reticleNear = new THREE.LineLoop(assets.geometries.squareLine, this.reticleMaterial);
    this.reticleFar = new THREE.LineLoop(assets.geometries.squareLine, this.reticleMaterial);
    this.reticleNear.scale.setScalar(0.9);
    this.reticleFar.scale.setScalar(1.3);
    this.reticleNear.renderOrder = this.reticleFar.renderOrder = 10;
    this.reticle.add(this.reticleNear, this.reticleFar);
    this.root.add(this.reticle);
  }

  buildChargeOrb(assets) {
    this.chargeOrb = new THREE.Sprite(assets.spriteMaterial(COLORS.playerCharged, 1));
    this.chargeCore = new THREE.Sprite(assets.spriteMaterial(0xffffff, 1));
    this.chargeOrb.visible = this.chargeCore.visible = false; // placed at the nose in setShip()
    this.body.add(this.chargeOrb, this.chargeCore);
  }

  noseCenter(out) {
    const s = this.template.primarySockets;
    if (!s.length) return out.set(0, 0, -2);
    out.set(0, 0, 0);
    for (const p of s) out.add(p);
    return out.multiplyScalar(1 / s.length);
  }

  attachTrails(rig) {
    this.trailParent = rig;
    for (const t of this.trails) rig.add(t.mesh);
  }

  // ------------------------------------------------------------ state
  reset(keep = null) {
    this.lives = keep?.lives ?? PLAYER.lives;
    this.hp = keep?.hp ?? this.maxHp;
    this.bombs = keep?.bombs ?? PLAYER.startBombs;
    this.shield = keep?.shield ?? false;
    // weapon power-ups are permanent for the current life
    this.weapons = {
      rapidFire: keep?.weapons?.rapidFire ?? false,
      dualCannon: keep?.weapons?.dualCannon ?? false,
    };
    this.respawnTimer = 0;
    this.local.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.aimInput.set(0, 0);
    this.invuln = 0;
    this.dodgeTimer = 0;
    this.dodgeInvuln = 0;
    this.dodgeCooldown = 0;
    this.dodgeDir = 1;
    this.dodgeSpin = 0;
    this.fireCooldown = 0;
    this.holdTime = 0;
    this.charging = false;
    this.charge = 0;
    this.lockTarget = null;
    this.bombCooldown = 0;
    this.alive = true;
    this.controllable = true;
    this.autopilot = null;
    this.time = 0;
    this.hitFlash = 0;
    this.root.visible = true;
    this.body.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.shieldMesh.visible = this.shield;
    this.shieldHit = 0;
    for (const t of this.trails) t.initialized = false;
    this.stopCharge();
  }

  snapshot() {
    return { lives: this.lives, hp: this.hp, bombs: this.bombs, shield: this.shield, weapons: { ...this.weapons } };
  }

  get invulnerable() {
    return this.invuln > 0 || this.dodgeInvuln > 0 || this.game.debug.godMode || !this.controllable;
  }

  get isDodging() {
    return this.dodgeTimer > 0;
  }

  get dodgeReady() {
    return 1 - clamp(this.dodgeCooldown / PLAYER.dodge.cooldown, 0, 1);
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.time += dt;
    this.tickTimers(dt);
    if (!this.alive) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
      }
      return;
    }

    if (this.autopilot) this.autopilot(dt, this);
    else if (this.controllable) {
      this.updateMovement(dt, input);
      this.updateWeapons(dt, input);
      if (input.pressed('dodge')) this.tryDodge(input);
      if (input.pressed('bomb')) this.tryBomb();
    } else {
      this.velocity.multiplyScalar(Math.exp(-4 * dt));
    }

    this.updateOrientation(dt);
    this.updateVisuals(dt);
    this.root.getWorldPosition(this.worldPosition);
  }

  tickTimers(dt) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);
    this.dodgeInvuln = Math.max(0, this.dodgeInvuln - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.bombCooldown = Math.max(0, this.bombCooldown - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.shieldHit = Math.max(0, this.shieldHit - dt * 2);
  }

  updateMovement(dt, input) {
    const P = PLAYER;
    const S = this.stats;
    this.aimInput.x = damp(this.aimInput.x, input.moveX, 7, dt);
    this.aimInput.y = damp(this.aimInput.y, input.moveY, 7, dt);
    if (this.dodgeTimer > 0) {
      const k = this.dodgeTimer / P.dodge.duration;
      this.velocity.x = this.dodgeDir * P.dodge.speed * (0.35 + 0.65 * k);
      this.velocity.y = damp(this.velocity.y, input.moveY * S.moveSpeed, S.accel, dt);
    } else {
      const tx = input.moveX * S.moveSpeed;
      const ty = input.moveY * S.moveSpeed;
      this.velocity.x = damp(this.velocity.x, tx, input.moveX ? S.accel : S.decel, dt);
      this.velocity.y = damp(this.velocity.y, ty, input.moveY ? S.accel : S.decel, dt);
    }
    this.move(dt);
  }

  move(dt) {
    const b = PLAYER.bounds;
    this.local.x += this.velocity.x * dt;
    this.local.y += this.velocity.y * dt;
    if (Math.abs(this.local.x) > b.x) {
      this.local.x = clamp(this.local.x, -b.x, b.x);
      this.velocity.x = 0;
    }
    if (Math.abs(this.local.y) > b.y) {
      this.local.y = clamp(this.local.y, -b.y, b.y);
      this.velocity.y = 0;
    }
  }

  updateOrientation(dt) {
    const P = PLAYER;
    const nx = this.velocity.x / this.stats.moveSpeed;
    const ny = this.velocity.y / this.stats.moveSpeed;
    if (this.dodgeTimer > 0) {
      this.dodgeSpin = (1 - this.dodgeTimer / P.dodge.duration) * Math.PI * 2 * -this.dodgeDir;
    } else {
      this.dodgeSpin = 0;
    }
    const roll = clamp(-nx, -1.2, 1.2) * P.bank.roll * (this.dodgeTimer > 0 ? 0.3 : 1);
    this.body.rotation.z = damp(this.body.rotation.z, roll, 10, dt);
    this.body.rotation.x = damp(this.body.rotation.x, ny * P.bank.pitch, 8, dt);
    this.body.rotation.y = damp(this.body.rotation.y, -nx * P.bank.yaw, 8, dt);
    this.template.group.rotation.z = this.dodgeSpin;

    // shots lean towards where the stick is pushed, clamped so aiming stays predictable
    const aim = P.aimMaxAngle;
    this.aimDirLocal.set(clamp(this.aimInput.x, -1, 1) * aim, clamp(this.aimInput.y, -1, 1) * aim * 0.8, -1).normalize();
  }

  updateVisuals(dt) {
    // blink while invulnerable after a hit
    this.body.visible = this.invuln > 0 && this.dodgeTimer <= 0 ? Math.floor(this.time * PLAYER.blinkRate) % 2 === 0 : true;

    const thrust = this.dodgeTimer > 0 ? 1.8 : 1;
    const flicker = 0.85 + Math.sin(this.time * 60) * 0.08 + Math.random() * 0.1;
    const r = this.template.engineRadius;
    for (const e of this.engines) {
      const len = r * 4.5 * thrust * flicker;
      e.flame.scale.set(r * 0.8, len, r * 0.8);
      e.flame.position.z = len / 2;
      e.core.scale.set(r * 0.35, len * 0.55, r * 0.35);
      e.core.position.z = len * 0.275;
      e.halo.scale.setScalar(r * (3.2 + flicker));
    }
    for (const l of this.lights) l.intensity = 6 + flicker * 3;

    // engine trails live in rig space
    for (let i = 0; i < this.trails.length; i++) {
      _v.copy(this.template.engines[i]).applyQuaternion(this.body.quaternion).add(this.local);
      this.trails[i].intensity = this.body.visible ? 1 : 0.2;
      this.trails[i].update(dt, _v);
    }

    this.shieldMesh.visible = this.shield || this.shieldHit > 0;
    this.shieldMaterial.uniforms.uTime.value = this.time;
    this.shieldMaterial.uniforms.uHit.value = this.shieldHit;
    this.shieldMaterial.uniforms.uOpacity.value = this.shield ? 0.8 : this.shieldHit;

    // reticle along the aim direction
    this.reticle.visible = this.controllable && this.alive;
    this.reticleNear.position.copy(this.aimDirLocal).multiplyScalar(22);
    this.reticleFar.position.copy(this.aimDirLocal).multiplyScalar(44);
    const locked = !!this.game.aimHasTarget;
    this.reticleMaterial.color.set(locked ? COLORS.reticleLocked : COLORS.reticle).multiplyScalar(1.6);

    const showOrb = this.charging && this.charge > 0;
    this.chargeOrb.visible = this.chargeCore.visible = showOrb;
    if (showOrb) {
      const full = this.charge >= 1;
      const pulse = full ? 1 + Math.sin(this.time * 30) * 0.15 : 1;
      this.chargeOrb.scale.setScalar((0.5 + this.charge * 2.2) * pulse);
      this.chargeCore.scale.setScalar((0.25 + this.charge * 0.8) * pulse);
    }
  }

  // ------------------------------------------------------------ weapons
  updateWeapons(dt, input) {
    const W = WEAPONS;
    const interval = this.weapons.rapidFire ? this.shot.rapidInterval : this.shot.interval;

    // primary: holding the button keeps firing; quick taps may shoot slightly faster than the hold rate
    if (!this.charging) {
      if (input.pressed('fire') && this.fireCooldown <= interval * 0.4) this.fireShot();
      else if (input.held('fire') && this.fireCooldown <= 0) this.fireShot();
    }

    // charged shot: separate button — hold to charge, release to fire
    if (input.pressed('charge')) this.holdTime = 0;
    if (input.held('charge')) {
      this.holdTime += dt;
      if (this.holdTime > W.charged.holdDelay) {
        if (!this.charging) {
          this.charging = true;
          this.game.audio.startCharge();
        }
        const prev = this.charge;
        this.charge = clamp((this.holdTime - W.charged.holdDelay) / W.charged.chargeTime, 0, 1);
        if (prev < 1 && this.charge >= 1) this.game.audio.play('lock');
        this.game.audio.setChargeLevel(this.charge);
        this.lockTarget = this.game.findLockTarget(this.worldPosition, this.aimWorld(_dir));
      }
    }
    if (input.released('charge')) {
      if (this.charging && this.charge >= W.charged.minCharge) this.fireCharged();
      this.stopCharge();
    }
  }

  stopCharge() {
    if (this.charging) this.game.audio.stopCharge();
    this.charging = false;
    this.charge = 0;
    this.holdTime = 0;
    this.lockTarget = null;
  }

  aimWorld(out) {
    return out.copy(this.aimDirLocal).applyQuaternion(this.game.rig.quaternion).normalize();
  }

  muzzleWorld(socket, out) {
    return this.template.group.localToWorld(out.copy(socket).divideScalar(this.template.scale));
  }

  fireShot() {
    const W = this.shot;
    this.fireCooldown = this.weapons.rapidFire ? W.rapidInterval : W.interval;
    this.aimWorld(_dir);
    this.root.updateMatrixWorld(true);
    for (const socket of this.template.primarySockets) {
      this.game.projectiles.firePlayer(this.muzzleWorld(socket, _muzzle), _dir, { shot: W, color: this.colors.shot });
    }
    if (this.weapons.dualCannon) {
      const right = _v2.set(1, 0, 0).applyQuaternion(this.game.rig.quaternion);
      this.template.dualSockets.forEach((socket) => {
        const side = Math.sign(socket.x) || 1;
        _v.copy(_dir).addScaledVector(right, side * W.dualAngle).normalize();
        this.game.projectiles.firePlayer(this.muzzleWorld(socket, _muzzle), _v, { dual: true, shot: W, color: this.colors.dualShot });
      });
    }
    this.game.audio.play('shoot', { pitch: W.pitch });
  }

  fireCharged() {
    const power = this.charge;
    this.root.updateMatrixWorld(true);
    this.chargeOrb.getWorldPosition(_muzzle);
    this.aimWorld(_dir);
    this.game.projectiles.firePlayer(_muzzle, _dir, {
      charged: true,
      power,
      target: this.lockTarget,
    });
    this.fireCooldown = this.shot.interval;
    this.game.audio.play('chargedShot', { power });
    this.game.cameraRig.shake(0.15 + power * 0.15);
    this.game.postfx.boost(0.2 * power);
    this.game.effects.burst(_muzzle, { count: 18, color: COLORS.playerCharged, speed: 14, life: 0.35, size: 1.6 });
  }

  tryDodge(input) {
    const D = PLAYER.dodge;
    if (this.dodgeCooldown > 0 || this.dodgeTimer > 0) return;
    this.dodgeDir = input.moveX !== 0 ? Math.sign(input.moveX) : this.velocity.x !== 0 ? Math.sign(this.velocity.x) : 1;
    this.dodgeTimer = D.duration;
    this.dodgeInvuln = D.invuln;
    this.dodgeCooldown = D.cooldown;
    this.game.audio.play('dodge');
    this.game.cameraRig.kickFov(CAMERA.fovDodge);
    this.game.postfx.pulseChromatic(0.035);
    this.game.effects.burst(this.worldPosition, { count: 14, color: this.colors.engine, speed: 8, life: 0.4, size: 0.9 });
  }

  tryBomb() {
    if (this.bombs <= 0 || this.bombCooldown > 0) return;
    this.bombs--;
    this.bombCooldown = WEAPONS.bomb.cooldown;
    this.game.triggerBomb(this.worldPosition);
  }

  // ------------------------------------------------------------ damage & items
  /** Returns true if the hit was registered (not blocked by invulnerability). */
  hit(amount = 1) {
    if (!this.alive || this.invulnerable) return false;
    if (this.shield) {
      this.shield = false;
      this.shieldHit = 1;
      this.invuln = 1.0;
      this.game.onPlayerShieldHit();
      return true;
    }
    this.hp = Math.max(0, this.hp - amount);
    this.invuln = PLAYER.invulnAfterHit;
    this.hitFlash = 0.3;
    if (this.hp <= 0) {
      this.loseLife();
    } else {
      this.game.onPlayerDamaged(amount);
    }
    return true;
  }

  /** Hull destroyed: costs one life and the weapon power-ups of that life. */
  loseLife() {
    this.alive = false;
    this.stopCharge();
    this.root.visible = false;
    this.lives = Math.max(0, this.lives - 1);
    this.weapons.rapidFire = false;
    this.weapons.dualCannon = false;
    this.shield = false;
    if (this.lives > 0) {
      this.respawnTimer = PLAYER.respawnDelay;
      this.game.onPlayerLifeLost();
    } else {
      this.game.onPlayerDeath();
    }
  }

  respawn() {
    this.alive = true;
    this.hp = this.maxHp;
    this.local.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.aimInput.set(0, 0);
    this.body.rotation.set(0, 0, 0);
    this.invuln = PLAYER.respawnInvuln;
    this.dodgeTimer = this.dodgeCooldown = 0;
    this.root.visible = true;
    for (const t of this.trails) t.initialized = false;
    this.root.getWorldPosition(this.worldPosition);
    this.game.onPlayerRespawn();
  }

  heal(amount = 1) {
    if (this.hp >= this.maxHp) return false;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return true;
  }

  giveShield() {
    this.shield = true;
    this.shieldHit = 1;
  }

  addBomb() {
    if (this.bombs >= PLAYER.maxBombs) return false;
    this.bombs++;
    return true;
  }
}

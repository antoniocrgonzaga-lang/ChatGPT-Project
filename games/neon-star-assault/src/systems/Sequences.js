import * as THREE from 'three';
import { createFlowMaterial, scrollFlowMaterial, createShieldMaterial } from '../effects/materials.js';
import { RAIL, PLAYER, OBSTACLES } from '../config/gameConfig.js';
import { damp, rand, clamp, lerp } from '../utils/math.js';
import { BlackHole } from '../scenery/BlackHole.js';
import { CapitalShip } from '../scenery/Mothership.js';

const _v = new THREE.Vector3();

/** Autopilot that eases the ship back to the centre of the play area. */
function centerShip(dt, p) {
  p.local.x = damp(p.local.x, 0, 2, dt);
  p.local.y = damp(p.local.y, 0, 2, dt);
  p.velocity.set(0, 0, 0);
}

/**
 * Jump between stages: a portal opens ahead, the ship flies in, a warp tunnel hides the swap
 * of rails/scenery and the palette shifts from the current stage's warp colour to the next one.
 * With `startInWarp` the portal is skipped (used right after a cutscene).
 */
export class PortalTransition {
  constructor(game, nextStage, { startInWarp = false } = {}) {
    this.game = game;
    this.next = nextStage;
    this.t = 0;
    this.phase = 'approach';
    const A = game.assets;
    this.fromColor = new THREE.Color(game.theme?.warpColor ?? 0xb070ff);
    this.toColor = new THREE.Color(nextStage.theme.warpColor ?? 0xff4a1a);

    this.portal = new THREE.Group();
    this.ringMat = new THREE.MeshBasicMaterial({ color: this.fromColor.clone().multiplyScalar(3) });
    this.portal.add(new THREE.Mesh(A.geometries.torusThick, this.ringMat));
    this.portal.children[0].scale.setScalar(16);
    this.discMat = createFlowMaterial(this.fromColor, A.textures.nebula[0], { intensity: 1.6, speed: 0.4 });
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(15, 48), this.discMat);
    this.portal.add(this.disc);
    this.halo = new THREE.Sprite(A.spriteMaterial(this.fromColor, 0.8));
    this.halo.scale.setScalar(70);
    this.portal.add(this.halo);
    this.portal.position.set(0, 0, -260);
    game.rig.add(this.portal);

    this.tunnelMat = createFlowMaterial(this.fromColor, A.textures.stripes, { intensity: 2.2, speed: 3.5, repeat: [6, 2], opacity: 0 });
    this.tunnelMat.side = THREE.BackSide;
    this.tunnel = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 420, 32, 1, true), this.tunnelMat);
    this.tunnel.rotation.x = Math.PI / 2;
    this.tunnel.position.z = -150;
    this.tunnel.visible = false;
    game.rig.add(this.tunnel);

    game.player.autopilot = centerShip;
    game.player.stopCharge();
    game.rail.setSpeed(20, false, 1.5);
    game.audio.setMusicIntensity(0);
    if (startInWarp) {
      game.hud.banner('SALTO DIMENSIONAL', 'Rastreando a origem da frota…');
      this.enterWarp();
    } else {
      game.hud.banner('PORTAL DIMENSIONAL', 'Estabilizando rota de salto…');
    }
  }

  update(dt) {
    const game = this.game;
    this.t += dt;
    this.disc.rotation.z += dt * 1.5;
    scrollFlowMaterial(this.discMat, dt);
    scrollFlowMaterial(this.tunnelMat, dt);

    if (this.phase === 'approach') {
      this.portal.position.z = lerp(-260, 5, clamp(this.t / 6, 0, 1) ** 1.6);
      const s = 1 + Math.sin(this.t * 3) * 0.03;
      this.portal.scale.setScalar(s);
      if (this.portal.position.z > -6) this.enterWarp();
    } else if (this.phase === 'warp') {
      this.warpT += dt;
      const k = clamp(this.warpT / 3.6, 0, 1);
      this.tunnelMat.opacity = Math.min(1, this.warpT * 3) * (k > 0.85 ? (1 - k) / 0.15 : 1);
      // palette shifts from the current stage to the next during the jump
      this.tunnelMat.color.copy(this.fromColor).lerp(this.toColor, k).multiplyScalar(2.2);
      game.cameraRig.extraFov = damp(game.cameraRig.extraFov, k < 0.85 ? 22 : 0, 3, dt);
      game.dustBoost = 1;
      if (!this.loaded && this.warpT > 0.4) {
        this.loaded = true;
        game.loadStage(this.next, 0, { keepPlayer: true, gradualPalette: true });
        game.rail.setSpeed(0, true);
        game.player.autopilot = centerShip;
      }
      if (k >= 1) this.finish();
    }
    return this.phase === 'done';
  }

  enterWarp() {
    const game = this.game;
    this.phase = 'warp';
    this.warpT = 0;
    this.portal.visible = false;
    this.tunnel.visible = true;
    game.postfx.setWhite(0.9, true);
    game.postfx.setWhite(0);
    game.postfx.pulseChromatic(0.09);
    game.cameraRig.shake(0.4);
    game.audio.play('warp');
  }

  finish() {
    const game = this.game;
    this.phase = 'done';
    game.postfx.setWhite(0.7, true);
    game.postfx.setWhite(0);
    game.cameraRig.extraFov = 0;
    game.dustBoost = 0;
    game.player.autopilot = null;
    const sec = game.stageManager.section;
    game.rail.setSpeed(sec?.speed ?? 50, false, 1);
    game.audio.play('stageChange');
    this.dispose();
  }

  dispose() {
    this.game.rig.remove(this.portal, this.tunnel);
    this.disc.geometry.dispose();
    this.tunnel.geometry.dispose();
    this.discMat.map.dispose();
    this.discMat.dispose();
    this.tunnelMat.map.dispose();
    this.tunnelMat.dispose();
    this.ringMat.dispose();
    this.halo.material.dispose();
  }
}

/**
 * After the final boss: 30 s escape through the collapsing interior. Speed climbs,
 * burning debris (telegraphed by glow and trails) and collapsing girders must be dodged.
 */
export class EscapeSequence {
  constructor(game, stage) {
    this.game = game;
    this.t = 0;
    this.duration = RAIL.escapeDuration;
    this.nextDebris = 1.5;
    this.nextBlast = 0.5;
    this.nextGirder = 6;
    game.stageManager.overrideSection(stage.escapeSection, game.rail.s);
    game.rail.setSpeed(RAIL.escapeStartSpeed, false, 0.8);
    game.audio.playMusic('escape');
    game.audio.setMusicIntensity(2);
    game.hud.banner('FUJA!', 'O planeta está entrando em colapso');
    game.audio.play('alert');
  }

  update(dt) {
    const game = this.game;
    this.t += dt;
    const k = clamp(this.t / this.duration, 0, 1);
    game.rail.setSpeed(lerp(RAIL.escapeStartSpeed, RAIL.escapeEndSpeed, k), false, 0.8);
    game.hud.setCountdown('ESCAPE', Math.max(0, this.duration - this.t));
    game.cameraRig.shake(0.03 + k * 0.05);
    game.cameraRig.extraFov = damp(game.cameraRig.extraFov, k * 12, 1, dt);
    game.dustBoost = k * 0.6;

    this.nextDebris -= dt;
    if (this.nextDebris <= 0 && this.t < this.duration - 2) {
      this.nextDebris = lerp(0.9, 0.42, k);
      this.spawnDebris();
    }
    this.nextGirder -= dt;
    if (this.nextGirder <= 0 && this.t < this.duration - 3) {
      this.nextGirder = rand(4, 6);
      this.spawnGirder();
    }
    this.nextBlast -= dt;
    if (this.nextBlast <= 0) {
      this.nextBlast = rand(0.15, 0.4);
      const f = game.rail.frameAhead(rand(20, 160), game.stageManager.tmpFrame);
      const side = Math.random() < 0.5 ? -1 : 1;
      f.localToWorld(side * rand(18, 30), rand(-22, 22), 0, _v);
      game.effects.explosion(_v, { size: rand(1.2, 2.4), shake: false, sound: Math.random() < 0.3 });
    }
    return this.t >= this.duration;
  }

  spawnDebris() {
    const game = this.game;
    const ahead = game.rail.speed * 2.3;
    const B = PLAYER.bounds;
    const x = clamp(game.player.local.x + rand(-10, 10), -B.x, B.x);
    const y = clamp(game.player.local.y + rand(-6, 6), -B.y, B.y);
    const f = game.rail.frameAhead(ahead, game.stageManager.tmpFrame);
    const mesh = new THREE.Mesh(game.assets.geometries.asteroids[Math.floor(Math.random() * 4)], game.assets.materials.structureRed);
    const scale = rand(2.2, 3.8);
    mesh.scale.setScalar(scale);
    f.localToWorld(x, y, 0, mesh.position);
    const glow = new THREE.Sprite(game.kit.sprite(0xff7a1a, 0.9).material);
    glow.scale.setScalar(2.2);
    mesh.add(glow);
    const spin = new THREE.Vector3(rand(-2, 2), rand(-2, 2), rand(-2, 2));
    const D = OBSTACLES.escapeDebris;
    game.obstacles.add(mesh, {
      colliders: [{ type: 'sphere', node: mesh, radius: scale * 0.85 }],
      hp: D.hp,
      score: D.score,
      dropChance: D.dropChance,
      damage: 1,
      update: (dt) => {
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        if (Math.random() < 0.4) game.effects.trail(mesh.position, 0xff8a2a, 2.2, 0.5);
      },
    });
  }

  spawnGirder() {
    const game = this.game;
    const f = game.rail.frameAhead(game.rail.speed * 2.6, game.stageManager.tmpFrame);
    const horizontal = Math.random() < 0.5;
    const pos = (Math.random() < 0.5 ? -1 : 1) * rand(3, 7);
    const g = new THREE.Group();
    const beam = new THREE.Mesh(game.assets.geometries.box, game.assets.materials.structureRed);
    beam.scale.set(horizontal ? 70 : 3, horizontal ? 3 : 70, 3);
    g.add(beam);
    const hot = new THREE.Mesh(game.assets.geometries.box, game.assets.materials.glowOrange);
    hot.scale.set(horizontal ? 68 : 0.4, horizontal ? 0.4 : 68, 3.1);
    g.add(hot);
    f.localToWorld(horizontal ? 0 : pos, horizontal ? pos : 0, 0, g.position);
    g.quaternion.copy(f.quaternion);
    g.rotateZ(rand(-0.25, 0.25));
    const EG = OBSTACLES.escapeGirder;
    const obs = game.obstacles.add(g, { colliders: [{ type: 'box', node: beam }], damage: 1, hp: EG.hp, score: EG.score, dropChance: EG.dropChance });
    obs.explosionSize = 2.4;
    game.hud.warning('ESTRUTURA DESABANDO!', 1);
  }

  dispose() {
    this.game.hud.setCountdown(null);
    this.game.cameraRig.extraFov = 0;
    this.game.dustBoost = 0;
  }
}

const ENDINGS = {
  planet: { blast: 0xffa050, flare: 0xffc890, light: 0xff9a50, wave: 0xffb070 },
  singularity: { blast: 0x9fe8ff, flare: 0xe0f6ff, light: 0x9fdcff, wave: 0xbfe8ff },
  mothership: { blast: 0x8affc0, flare: 0xe8fff4, light: 0x9affc8, wave: 0xb0ffd8 },
};

/**
 * Stage-end cutscene: the ship races away while the subject detonates behind it.
 *  - 'planet': the artificial planet Kharon-9 cracks open and explodes (end of Stage 2)
 *  - 'singularity': Nyx spins up, collapses and releases a blinding nova (end of Stage 3)
 *  - 'mothership': the LEVIATÃ breaks apart in chain explosions before the galaxy (end of the game)
 * Built far away from the level so nothing else is in frame.
 */
export class EndingCutscene {
  constructor(game, variant = 'planet') {
    this.game = game;
    this.variant = ENDINGS[variant] ? variant : 'planet';
    this.t = 0;
    this.exploded = false;
    const A = game.assets;
    const palette = ENDINGS[this.variant];
    this.origin = new THREE.Vector3(0, 40000, 0);
    this.set = new THREE.Group();
    this.set.position.copy(this.origin);
    game.scene.add(this.set);

    if (this.variant === 'singularity') {
      this.hole = new BlackHole(A, { radius: 110, diskInner: 160, diskOuter: 470, tilt: 1.25, intensity: 1.3 });
      this.hole.group.position.set(0, -40, 560);
      this.set.add(this.hole.group);
      this.subject = this.hole.group;
    } else if (this.variant === 'mothership') {
      this.leviathan = new CapitalShip(A, { kind: 'leviathan', length: 1150, fog: false, seed: 4, lights: 3200, rim: 0x2a4868 });
      this.leviathan.group.position.set(-60, -70, 640);
      // decks tilted towards the camera (which looks back along +Z) so the city of lights shows
      this.leviathan.group.rotation.set(-0.5, Math.PI / 2 - 0.3, 0);
      // turn the baked sky around so the galaxy hangs behind the dying mothership
      if (game.sky.skybox) game.sky.skybox.mesh.rotation.y = Math.PI + 0.25;
      this.set.add(this.leviathan.group);
      this.subject = this.leviathan.group;
      this.nextChain = 0.5;
    }

    this.planetMat = new THREE.MeshStandardMaterial({
      color: 0x4a2014,
      metalness: 0.6,
      roughness: 0.5,
      map: A.textures.panelBase,
      emissive: 0xffffff,
      emissiveMap: A.textures.panelEmissive,
      emissiveIntensity: 1.5,
      fog: false,
    });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), this.planetMat);
    this.planet.position.set(0, -60, 520);
    this.set.add(this.planet);
    if (this.subject) this.planet.visible = false;
    else this.subject = this.planet;
    this.coreGlow = new THREE.Sprite(A.spriteMaterial(0xff8a2a, 0));
    this.coreGlow.material.fog = false;
    this.coreGlow.scale.setScalar(900);
    this.planet.add(this.coreGlow);

    // expanding shock shell (rim-lit) + a huge flare for the detonation
    this.blastMat = createShieldMaterial(palette.blast, { intensity: 3.2 });
    this.blastMat.uniforms.uOpacity.value = 0;
    this.blastGeo = new THREE.SphereGeometry(1, 48, 32);
    this.blast = new THREE.Mesh(this.blastGeo, this.blastMat);
    this.blast.position.copy(this.subject.position);
    this.blast.visible = false;
    this.set.add(this.blast);
    this.flare = new THREE.Sprite(A.spriteMaterial(palette.flare, 0, A.textures.flare));
    this.flare.material.fog = false;
    this.flare.position.copy(this.subject.position);
    this.set.add(this.flare);

    this.light = new THREE.PointLight(palette.light, 0, 3000, 1.2);
    this.light.position.copy(this.subject.position);
    this.set.add(this.light);

    const p = game.player;
    p.autopilot = (dt, pl) => {
      pl.local.x = damp(pl.local.x, Math.sin(this.t * 0.8) * 3, 1.5, dt);
      pl.local.y = damp(pl.local.y, 2 + Math.sin(this.t * 0.6) * 1.5, 1.5, dt);
      pl.velocity.x = Math.cos(this.t * 0.8) * 3;
    };
    game.rig.position.copy(this.origin);
    game.rig.quaternion.identity();
    this.shipZ = 200;
    game.cameraRig.startCutscene((dt, pos, look) => this.camera(dt, pos, look));
    game.scene.fog.color.set(0x000000);
  }

  camera(dt, pos, look) {
    // camera ahead of the ship, looking back at it and the planet
    const ship = this.game.player.worldPosition;
    pos.set(ship.x + 5 + Math.sin(this.t * 0.3) * 3, ship.y + 2.5, ship.z - 13);
    look.copy(ship).lerp(this.subject.getWorldPosition(_v), clamp((this.t - 0.5) / 4, 0.25, 0.6));
  }

  update(dt) {
    const game = this.game;
    this.t += dt;
    // the ship flees along -Z (towards the camera)
    this.shipZ -= (60 + this.t * 20) * dt;
    game.rig.position.set(this.origin.x, this.origin.y, this.origin.z + this.shipZ - 200);

    const crack = clamp(this.t / 3.5, 0, 1);
    if (this.leviathan) {
      // chain explosions race along the hull while it buckles
      this.leviathan.update(dt);
      this.leviathan.group.rotation.z += dt * 0.03 * crack;
      this.nextChain -= dt;
      if (!this.exploded && this.nextChain <= 0) {
        this.nextChain = Math.max(0.05, 0.22 - crack * 0.17);
        _v.set(rand(-15, 15), rand(-3, 7), rand(-48, 48));
        this.leviathan.model.localToWorld(_v);
        game.effects.explosion(_v, { size: rand(8, 16) * (0.6 + crack), sound: Math.random() < 0.25, shake: false, light: false, color: Math.random() < 0.5 ? 0x8affc0 : null });
      }
    } else if (this.hole) {
      // the singularity spins up, flares and shrinks just before the nova
      this.hole.setIntensity(1.3 + crack * 3 + Math.random() * crack);
      this.hole.update(dt, game.camera, 1 + crack * 8);
      this.hole.group.scale.setScalar(1 - crack * crack * 0.6);
    } else {
      this.planetMat.emissiveIntensity = 1.5 + crack * 6 + Math.random() * crack * 2;
      this.coreGlow.material.opacity = crack * 0.9;
      this.planet.rotation.y += dt * 0.05;
    }
    if (this.t > 1.5 && this.t < 3.6) game.cameraRig.shake(0.02 + crack * 0.04);

    if (!this.exploded && this.t > 3.6) {
      this.exploded = true;
      game.postfx.setWhite(1, true);
      game.postfx.setWhite(0);
      game.postfx.pulseChromatic(0.12);
      game.postfx.boost(0.9);
      game.cameraRig.shake(1);
      game.audio.play('explosionHuge');
      this.subject.visible = false;
      this.blast.visible = true;
      game.effects.shockwave(this.subject.getWorldPosition(_v), { radius: 1400, duration: 3, color: ENDINGS[this.variant].wave });
      for (let i = 0; i < 6; i++) game.effects.explosion(_v.clone().add(new THREE.Vector3(rand(-200, 200), rand(-150, 150), rand(-100, 100))), { size: 20, sound: false, shake: false, light: false });
    }
    if (this.exploded) {
      const e = this.t - 3.6;
      this.blast.scale.setScalar(300 + e * 420);
      this.blastMat.uniforms.uOpacity.value = Math.max(0, 1 - e / 3.2);
      this.blastMat.uniforms.uTime.value = this.t;
      this.flare.scale.setScalar(900 + e * 1600);
      this.flare.material.opacity = Math.max(0, 1 - e / 2.2);
      this.light.intensity = Math.max(0, 1 - e / 3) * 400000;
    }
    return this.t > 7.5;
  }

  dispose() {
    const game = this.game;
    game.scene.remove(this.set);
    this.planet.geometry.dispose();
    this.planetMat.dispose();
    this.blastMat.dispose();
    this.blastGeo.dispose();
    this.flare.material.dispose();
    this.coreGlow.material.dispose();
    if (this.hole) this.hole.dispose();
    if (this.leviathan) this.leviathan.dispose();
    game.player.autopilot = null;
    game.cameraRig.mode = 'chase';
  }
}

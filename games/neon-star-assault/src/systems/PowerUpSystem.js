import * as THREE from 'three';
import { PowerUp, POWERUP_TYPES, powerUpName } from '../entities/PowerUp.js';
import { POWERUPS, SCORING, PLAYER } from '../config/gameConfig.js';
import { pick, clamp } from '../utils/math.js';

const MAX_POWERUPS = 8;
const _local = new THREE.Vector3();

/** Spawning, collection and effects of power-ups. */
export class PowerUpSystem {
  constructor(game) {
    this.game = game;
    this.items = Array.from({ length: MAX_POWERUPS }, () => new PowerUp(game));
  }

  /** Spawn in rail-local coordinates. */
  spawnLocal(type, local, drift) {
    const item = this.items.find((p) => !p.alive);
    if (!item) return null;
    item.spawn(type ?? this.randomType(), local, drift);
    return item;
  }

  /** Spawn where an enemy died (world position converted to rail space). */
  spawnAtWorld(type, worldPos) {
    _local.copy(worldPos);
    this.game.rig.worldToLocal(_local);
    _local.x = clamp(_local.x, -PLAYER.bounds.x, PLAYER.bounds.x);
    _local.y = clamp(_local.y, -PLAYER.bounds.y, PLAYER.bounds.y);
    _local.z = Math.min(_local.z, -30);
    return this.spawnLocal(type, _local, 16);
  }

  /** Weighted towards what the player currently needs. */
  randomType() {
    const p = this.game.player;
    const bag = ['multiplier'];
    // weapon upgrades are permanent per life, so favour the ones the player is missing
    if (!p.weapons.rapidFire) bag.push('rapidFire', 'rapidFire');
    if (!p.weapons.dualCannon) bag.push('dualCannon', 'dualCannon');
    if (p.hp < p.maxHp) bag.push('repair', 'repair');
    if (!p.shield) bag.push('shield');
    if (p.bombs < 2) bag.push('bomb');
    return pick(bag);
  }

  update(dt) {
    const player = this.game.player;
    const r = POWERUPS.radius;
    for (const item of this.items) {
      if (!item.alive) continue;
      item.update(dt);
      if (!item.alive || !player.alive) continue;
      const dx = item.local.x - player.local.x;
      const dy = item.local.y - player.local.y;
      const dz = item.local.z - player.local.z;
      if (dx * dx + dy * dy + dz * dz < r * r * 1.6) this.collect(item);
    }
  }

  collect(item) {
    const game = this.game;
    const p = game.player;
    const type = item.type;
    let extraScore = 0;
    switch (type) {
      case 'rapidFire':
      case 'dualCannon':
        if (p.weapons[type]) extraScore = POWERUPS.ownedBonus;
        p.weapons[type] = true;
        break;
      case 'shield':
        p.giveShield();
        game.audio.play('shield');
        break;
      case 'repair':
        if (!p.heal(1)) extraScore = SCORING.repairFullBonus;
        break;
      case 'bomb':
        if (!p.addBomb()) extraScore = SCORING.repairFullBonus;
        break;
      case 'multiplier':
        game.score.activateMultiplier(POWERUPS.multiplier.duration, POWERUPS.multiplier.factor);
        break;
    }
    item.object.getWorldPosition(_local);
    game.effects.burst(_local, { count: 30, color: item.color, speed: 12, life: 0.5, size: 1.2 });
    game.effects.shockwave(_local, { radius: 4, duration: 0.35, color: item.color });
    game.audio.play('pickup');
    game.score.add(SCORING.powerup + extraScore, false);
    game.hud.toast(powerUpName(type), '#' + item.color.getHexString());
    item.release();
  }

  clear() {
    for (const item of this.items) item.release();
  }
}

export { POWERUP_TYPES };

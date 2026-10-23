import { SCORING } from '../config/gameConfig.js';

/** Score, combo multiplier (chain kills), timed score multiplier and no-damage streak bonus. */
export class ScoreSystem {
  constructor(game) {
    this.game = game;
    this.reset(0);
  }

  reset(score = 0) {
    this.score = score;
    this.combo = 1;
    this.chain = 0;
    this.sinceHit = 0;
    this.decayTimer = 0;
    this.bonusFactor = 1;
    this.bonusTimer = 0;
    this.noDamageTimer = 0;
    this.stats = { kills: 0, shots: 0, rings: 0, damageTaken: 0, formations: 0 };
    // next score milestones (restarting from a checkpoint never re-awards passed ones)
    this.nextHullAt = (Math.floor(score / SCORING.hullRegenEvery) + 1) * SCORING.hullRegenEvery;
    this.nextLifeAt = (Math.floor(score / SCORING.extraLifeEvery) + 1) * SCORING.extraLifeEvery;
  }

  get totalMultiplier() {
    return this.combo * this.bonusFactor;
  }

  /** Adds points; the combo applies to combat points, the power-up factor to everything. */
  add(points, useCombo = true) {
    const gained = Math.round(points * (useCombo ? this.combo : 1) * this.bonusFactor);
    this.score += gained;
    this.checkMilestones();
    return gained;
  }

  checkMilestones() {
    while (this.score >= this.nextHullAt) {
      this.nextHullAt += SCORING.hullRegenEvery;
      this.game.onHullMilestone();
    }
    while (this.score >= this.nextLifeAt) {
      this.nextLifeAt += SCORING.extraLifeEvery;
      this.game.onExtraLifeMilestone();
    }
  }

  registerHit() {
    this.sinceHit = 0;
    this.decayTimer = 0;
  }

  registerKill() {
    this.stats.kills++;
    this.registerHit();
    this.chain++;
    const C = SCORING.combo;
    if (this.chain % C.killsPerStep === 0 && this.combo < C.max) {
      this.combo++;
      this.game.hud.pulseCombo();
    }
  }

  onDamage() {
    this.combo = 1;
    this.chain = 0;
    this.noDamageTimer = 0;
    this.stats.damageTaken++;
  }

  activateMultiplier(duration, factor) {
    this.bonusFactor = factor;
    this.bonusTimer = duration;
  }

  update(dt, combatActive) {
    const C = SCORING.combo;
    this.sinceHit += dt;
    if (this.combo > 1 && this.sinceHit > C.decayDelay) {
      this.decayTimer += dt;
      if (this.decayTimer >= C.decayStep) {
        this.decayTimer = 0;
        this.combo--;
        this.chain = 0;
      }
    }
    if (this.bonusTimer > 0) {
      this.bonusTimer -= dt;
      if (this.bonusTimer <= 0) this.bonusFactor = 1;
    }
    if (combatActive) {
      this.noDamageTimer += dt;
      if (this.noDamageTimer >= SCORING.noDamageInterval) {
        this.noDamageTimer = 0;
        const gained = this.add(SCORING.noDamageBonus, false);
        this.game.hud.toast(`SEM DANO +${gained}`, '#6dffb0');
      }
    }
  }
}

import * as THREE from 'three';
import { PLAYER, POWERUPS, SCORING, MAX_SHIP_HP } from '../config/gameConfig.js';
import { formatScore, clamp } from '../utils/math.js';

const _p = new THREE.Vector3();
const MAX_INDICATORS = 6;

const el = (tag, cls, parent, html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};

/**
 * In-game HUD built with DOM elements over the canvas (unaffected by bloom).
 * Values are written only when they change to keep layout work minimal.
 */
export class HUD {
  constructor(root) {
    this.root = el('div', 'hud hidden', root);
    this.cache = {};

    const tl = el('div', 'hud-panel hud-tl', this.root);
    el('div', 'hud-label', tl, 'SCORE');
    this.score = el('div', 'hud-score', tl, '00000000');
    const mult = el('div', 'hud-mult', tl);
    this.combo = el('span', 'hud-combo', mult, 'x1');
    this.comboBar = el('div', 'hud-combo-bar', mult);
    this.comboFill = el('div', 'fill', this.comboBar);
    this.bonus = el('span', 'hud-bonus', mult, '');

    const tr = el('div', 'hud-panel hud-tr', this.root);
    this.stageName = el('div', 'hud-stage', tr, '');
    this.sectionName = el('div', 'hud-section', tr, '');
    const bombs = el('div', 'hud-bombs', tr);
    el('span', 'hud-label', bombs, 'BOMB');
    this.bombIcons = el('span', 'icons', bombs);

    const bl = el('div', 'hud-panel hud-bl', this.root);
    const livesRow = el('div', 'hud-lives', bl);
    el('span', 'hud-label', livesRow, 'LIVES');
    this.livesIcons = el('span', 'icons', livesRow);
    el('div', 'hud-label', bl, 'HULL');
    this.hpCells = el('div', 'hud-hp', bl);
    this.hpEls = [];
    for (let i = 0; i < MAX_SHIP_HP; i++) this.hpEls.push(el('div', 'cell', this.hpCells));
    this.shield = el('div', 'hud-shield', bl, 'SHIELD');

    const bc = el('div', 'hud-bc', this.root);
    this.powerRow = el('div', 'hud-powers', bc);
    this.powerEls = {
      rapidFire: el('div', 'power', this.powerRow, 'RAPID'),
      dualCannon: el('div', 'power', this.powerRow, 'DUAL'),
    };
    this.powerEls.rapidFire.style.setProperty('--c', '#' + new THREE.Color(POWERUPS.rapidFire.color).getHexString());
    this.powerEls.dualCannon.style.setProperty('--c', '#' + new THREE.Color(POWERUPS.dualCannon.color).getHexString());
    const bars = el('div', 'hud-bars', bc);
    const charge = el('div', 'bar-wrap', bars);
    el('span', 'hud-label', charge, 'CHARGE');
    this.chargeBar = el('div', 'bar charge', charge);
    this.chargeFill = el('div', 'fill', this.chargeBar);
    const dodge = el('div', 'bar-wrap', bars);
    el('span', 'hud-label', dodge, 'DODGE');
    this.dodgeBar = el('div', 'bar dodge', dodge);
    this.dodgeFill = el('div', 'fill', this.dodgeBar);

    this.bossWrap = el('div', 'hud-boss hidden', this.root);
    this.bossName = el('div', 'boss-name', this.bossWrap, '');
    const bb = el('div', 'boss-bar', this.bossWrap);
    this.bossFill = el('div', 'fill', bb);
    this.bossLag = el('div', 'lag', bb);
    this.bossPhases = el('div', 'boss-phases', this.bossWrap);

    this.center = el('div', 'hud-center', this.root);
    this.bannerEl = el('div', 'hud-banner', this.center);
    this.warningEl = el('div', 'hud-warning', this.center);
    this.countdownEl = el('div', 'hud-countdown', this.center);
    this.toasts = el('div', 'hud-toasts', this.root);

    this.lock = el('div', 'hud-lock hidden', this.root);
    this.indicators = [];
    for (let i = 0; i < MAX_INDICATORS; i++) this.indicators.push(el('div', 'hud-indicator hidden', this.root, '▲'));

    this.debugEl = el('div', 'hud-debug hidden', this.root);
    this.bannerTimer = 0;
    this.warningTimer = 0;
    this.bossLagValue = 1;
  }

  set(key, elem, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    elem[prop] = value;
  }

  show() {
    this.root.classList.remove('hidden');
    requestAnimationFrame(() => this.root.classList.add('visible'));
  }

  hide() {
    this.root.classList.remove('visible');
    this.root.classList.add('hidden');
  }

  reset() {
    this.cache = {};
    this.hideBoss();
    this.setCountdown(null);
    this.bannerEl.classList.remove('show');
    this.warningEl.classList.remove('show');
    this.toasts.innerHTML = '';
    this.lock.classList.add('hidden');
    for (const i of this.indicators) i.classList.add('hidden');
  }

  // ------------------------------------------------------------ messages
  banner(title, subtitle = '') {
    this.bannerEl.innerHTML = `<div class="t">${title}</div>${subtitle ? `<div class="s">${subtitle}</div>` : ''}`;
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    this.bannerTimer = 3.2;
  }

  sectionTitle(text, flash = true) {
    this.set('section', this.sectionName, text);
    if (!flash) return;
    this.sectionName.classList.remove('flash');
    void this.sectionName.offsetWidth;
    this.sectionName.classList.add('flash');
  }

  warning(text, duration = 2) {
    this.warningEl.textContent = `⚠ ${text}`;
    this.warningEl.classList.add('show');
    this.warningTimer = duration;
  }

  toast(text, color = '#ffffff') {
    const t = el('div', 'toast', this.toasts, text);
    t.style.color = color;
    setTimeout(() => t.remove(), 1600);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
  }

  setCountdown(label, value = 0) {
    if (label === null) {
      this.set('countdown', this.countdownEl, '', 'innerHTML');
      this.countdownEl.classList.remove('show');
      return;
    }
    const secs = Math.ceil(value);
    this.set('countdown', this.countdownEl, `<div class="l">${label}</div><div class="n">${secs}</div>`, 'innerHTML');
    this.countdownEl.classList.add('show');
    this.countdownEl.classList.toggle('urgent', secs <= 5);
  }

  pulseCombo() {
    this.combo.classList.remove('pulse');
    void this.combo.offsetWidth;
    this.combo.classList.add('pulse');
  }

  // ------------------------------------------------------------ boss
  showBoss(name) {
    this.bossName.textContent = name;
    this.bossWrap.classList.remove('hidden');
    this.bossLagValue = 1;
    this.bossPhases.innerHTML = '';
  }

  setBossPhase(phase, total) {
    let html = '';
    for (let i = 1; i <= total; i++) html += `<span class="${i < phase ? 'done' : i === phase ? 'active' : ''}">${i}</span>`;
    this.bossPhases.innerHTML = `PHASE ${html}`;
  }

  hideBoss() {
    this.bossWrap.classList.add('hidden');
  }

  // ------------------------------------------------------------ per frame
  update(dt, game) {
    const p = game.player;
    const s = game.score;
    this.set('score', this.score, formatScore(s.score));
    this.set('combo', this.combo, `x${s.combo}`);
    const decay = s.combo > 1 ? 1 - clamp(s.sinceHit / SCORING.combo.decayDelay, 0, 1) : 0;
    this.comboFill.style.transform = `scaleX(${decay.toFixed(3)})`;
    this.set('bonus', this.bonus, s.bonusFactor > 1 ? `SCORE x${s.bonusFactor} ${Math.ceil(s.bonusTimer)}s` : '');

    this.set('stage', this.stageName, game.stageManager.stage ? `STAGE ${game.stageManager.stage.id} · ${game.stageManager.stage.name}` : '');
    this.set('bombs', this.bombIcons, '◆'.repeat(p.bombs) + '◇'.repeat(Math.max(0, PLAYER.maxBombs - p.bombs)));
    for (let i = 0; i < this.hpEls.length; i++) {
      this.hpEls[i].classList.toggle('on', i < p.hp);
      this.hpEls[i].classList.toggle('hidden', i >= p.maxHp); // ships have different hull sizes
    }
    this.hpCells.classList.toggle('critical', p.hp === 1);
    this.shield.classList.toggle('on', p.shield);

    this.set('lives', this.livesIcons, '▲'.repeat(p.lives) + '△'.repeat(Math.max(0, PLAYER.lives - p.lives)));
    for (const key of ['rapidFire', 'dualCannon']) this.powerEls[key].classList.toggle('on', p.weapons[key]);
    this.chargeFill.style.transform = `scaleX(${p.charge.toFixed(3)})`;
    this.chargeBar.classList.toggle('full', p.charge >= 1);
    this.dodgeFill.style.transform = `scaleX(${p.dodgeReady.toFixed(3)})`;
    this.dodgeBar.classList.toggle('ready', p.dodgeReady >= 1);

    const boss = game.boss;
    if (boss && !this.bossWrap.classList.contains('hidden')) {
      const f = boss.healthFraction;
      this.bossFill.style.transform = `scaleX(${f.toFixed(4)})`;
      this.bossLagValue = Math.max(f, this.bossLagValue - dt * 0.25);
      this.bossLag.style.transform = `scaleX(${this.bossLagValue.toFixed(4)})`;
    }

    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    this.warningTimer -= dt;
    if (this.warningTimer <= 0) this.warningEl.classList.remove('show');

    this.updateLock(game);
    this.updateIndicators(game);
  }

  project(worldPos, camera, out) {
    _p.copy(worldPos).project(camera);
    out.x = (_p.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-_p.y * 0.5 + 0.5) * window.innerHeight;
    out.behind = _p.z > 1;
    return out;
  }

  updateLock(game) {
    const target = game.player.lockTarget;
    if (!target || !target.alive) {
      this.lock.classList.add('hidden');
      return;
    }
    target.getAimPoint(_lockWorld);
    const s = this.project(_lockWorld, game.camera, _screen);
    if (s.behind) {
      this.lock.classList.add('hidden');
      return;
    }
    this.lock.classList.remove('hidden');
    this.lock.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%) rotate(${(game.time * 180) % 360}deg)`;
  }

  /** Edge arrows for threats outside the view (interceptors approaching from behind). */
  updateIndicators(game) {
    let n = 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const e of game.enemies.active) {
      if (n >= MAX_INDICATORS) break;
      if (!e.alive || !e.showIndicator) continue;
      const s = this.project(e.object.position, game.camera, _screen);
      let x = s.x - w / 2;
      let y = s.y - h / 2;
      if (s.behind) {
        x = -x;
        y = Math.abs(y) + h * 0.3; // behind the camera: show at the bottom edge
      }
      const onScreen = !s.behind && Math.abs(x) < w / 2 - 30 && Math.abs(y) < h / 2 - 30;
      if (onScreen) continue;
      const scale = Math.min((w / 2 - 40) / Math.max(Math.abs(x), 1), (h / 2 - 40) / Math.max(Math.abs(y), 1));
      const ix = w / 2 + x * scale;
      const iy = h / 2 + y * scale;
      const ang = Math.atan2(y, x) + Math.PI / 2;
      const ind = this.indicators[n++];
      ind.classList.remove('hidden');
      ind.style.transform = `translate(${ix.toFixed(0)}px, ${iy.toFixed(0)}px) translate(-50%, -50%) rotate(${ang.toFixed(2)}rad)`;
    }
    for (let i = n; i < MAX_INDICATORS; i++) this.indicators[i].classList.add('hidden');
  }

  setDebug(text) {
    this.debugEl.classList.toggle('hidden', !text);
    if (text) this.debugEl.textContent = text;
  }
}

const _lockWorld = new THREE.Vector3();
const _screen = { x: 0, y: 0, behind: false };

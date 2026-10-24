import { GAME_TITLE, GAME_SUBTITLE, QUALITY, DIFFICULTY, SHIPS, MAX_SHIP_HP, WEAPONS } from '../config/gameConfig.js';
import { formatScore } from '../utils/math.js';

const CONTROLS = [
  ['WASD / Arrow keys', 'Move the ship'],
  ['Space (hold)', 'Continuous primary fire'],
  ['C / J (hold)', 'Charge a special shot (release to fire)'],
  ['Shift', 'Quick dodge (brief invulnerability)'],
  ['E', 'Energy bomb'],
  ['P / Esc', 'Pause'],
  ['Enter', 'Start / restart'],
  ['M', 'Mute audio'],
  ['Gamepad', 'Stick moves · A fires · RT/LT charges · B/RB/LB dodges · X/Y drops a bomb · Start pauses'],
];

const POWERUP_INFO = [
  ['R', '#33e6ff', 'Rapid Fire', 'increases fire rate until you lose a life'],
  ['D', '#ff9a2e', 'Dual Cannon', 'activates wing cannons until you lose a life'],
  ['S', '#5b8cff', 'Shield', 'absorbs one hit'],
  ['+', '#3dff8a', 'Repair Core', 'restores 1 hull block'],
  ['B', '#ff3dd8', 'Energy Bomb', '+1 bomb'],
  ['×2', '#ffd23d', 'Score Multiplier', 'doubles your score for 15 seconds'],
];

/** Full-screen overlay screens (loading, title, instructions, pause, game over, victory). */
export class Screens {
  constructor(root, handlers) {
    this.handlers = handlers;
    this.root = document.createElement('div');
    this.root.className = 'screens';
    root.appendChild(this.root);
    this.current = null;
  }

  mount(name, html) {
    this.root.innerHTML = `<div class="screen screen-${name}">${html}</div>`;
    this.current = name;
    const screen = this.root.firstElementChild;
    requestAnimationFrame(() => screen.classList.add('in'));
    screen.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', () => {
        this.handlers.onUiSound?.();
        this.handlers[b.dataset.action]?.(b.dataset.value);
      });
    });
    return screen;
  }

  hide() {
    this.root.innerHTML = '';
    this.current = null;
  }

  titleBlock() {
    return `<h1 class="game-title">${GAME_TITLE}</h1><div class="game-subtitle">${GAME_SUBTITLE}</div>`;
  }

  // ------------------------------------------------------------ loading
  showLoading() {
    this.mount('loading', `${this.titleBlock()}
      <div class="loading-bar"><div class="fill"></div></div>
      <div class="loading-label">Initializing…</div>`);
  }

  setLoadingProgress(p, label) {
    const fill = this.root.querySelector('.loading-bar .fill');
    if (fill) fill.style.transform = `scaleX(${p})`;
    const l = this.root.querySelector('.loading-label');
    if (l && label) l.textContent = `Generating ${label}…`;
  }

  // ------------------------------------------------------------ settings widgets
  settingsHtml(settings, { quality = true } = {}) {
    const q = quality
      ? `<div class="setting"><span>Quality</span><div class="seg">${Object.entries(QUALITY)
          .map(([k, v]) => `<button data-action="onQuality" data-value="${k}" class="${settings.quality === k ? 'sel' : ''}">${v.label}</button>`)
          .join('')}</div></div>
        <div class="setting"><span>Difficulty</span><div class="seg">${Object.entries(DIFFICULTY)
          .map(([k, v]) => `<button data-action="onDifficulty" data-value="${k}" class="${settings.difficulty === k ? 'sel' : ''}">${v.label}</button>`)
          .join('')}</div></div>`
      : '';
    return `<div class="settings">${q}
      <div class="setting"><span>Volume</span><input type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" class="volume">
      <button data-action="onMute" class="mute ${settings.muted ? 'sel' : ''}">${settings.muted ? 'Sound: OFF' : 'Sound: ON'}</button></div>
    </div>`;
  }

  bindVolume(screen) {
    const slider = screen.querySelector('.volume');
    if (slider) slider.addEventListener('input', () => this.handlers.onVolume?.(slider.value / 100));
  }

  // ------------------------------------------------------------ title
  /** One card per selectable ship: hull blocks, agility and firepower (relative to the best ship). */
  shipSelectHtml(selected) {
    const BARS = 8;
    const ships = Object.values(SHIPS);
    const firepower = (ship) => (ship.shot?.damage ?? WEAPONS.shot.damage) / (ship.shot?.interval ?? WEAPONS.shot.interval);
    const fastest = Math.max(...ships.map((s) => s.stats.moveSpeed));
    const strongest = Math.max(...ships.map(firepower));
    const meter = (on, total, cls = '') => `<span class="meter ${cls}">${'<i class="on"></i>'.repeat(on)}${'<i></i>'.repeat(total - on)}</span>`;
    const cards = Object.entries(SHIPS)
      .map(([id, ship]) => {
        const agility = Math.round((ship.stats.moveSpeed / fastest) * BARS);
        const fire = Math.round((firepower(ship) / strongest) * BARS);
        return `<button class="ship-card ${id === selected ? 'sel' : ''}" data-action="onShip" data-value="${id}">
          <span class="ship-card-name">${ship.name}</span>
          <span class="ship-card-role">${ship.role}</span>
          <span class="ship-card-stat"><span>HULL</span>${meter(ship.stats.maxHp, MAX_SHIP_HP, 'blocks')}</span>
          <span class="ship-card-stat"><span>AGILITY</span>${meter(agility, BARS)}</span>
          <span class="ship-card-stat"><span>FIREPOWER</span>${meter(fire, BARS)}</span>
        </button>`;
      })
      .join('');
    return `<div class="ship-select">${cards}</div>`;
  }

  showTitle(settings, warnings = []) {
    const screen = this.mount('title', `${this.titleBlock()}
      ${this.shipSelectHtml(settings.ship)}
      <div class="menu">
        <button class="primary" data-action="onStart">▶ START</button>
        <button data-action="onInstructions">INSTRUCTIONS</button>
      </div>
      ${this.settingsHtml(settings)}
      <div class="hint"><b>←</b> / <b>→</b> selects your ship · <b>Enter</b> to start</div>
      ${warnings.length ? `<div class="warn-list">${warnings.map((w) => `<div>⚠ ${w}</div>`).join('')}</div>` : ''}`);
    this.bindVolume(screen);
  }

  showInstructions() {
    this.mount('instructions', `<h2>INSTRUCTIONS</h2>
      <div class="cols">
        <div><h3>Controls</h3><table>${CONTROLS.map(([k, v]) => `<tr><td class="key">${k}</td><td>${v}</td></tr>`).join('')}</table></div>
        <div><h3>Power-ups</h3><table>${POWERUP_INFO.map(([i, c, n, d]) => `<tr><td class="pu" style="color:${c}">${i}</td><td><b style="color:${c}">${n}</b> — ${d}</td></tr>`).join('')}</table>
        <h3>Tips</h3><ul>
          <li>You have <b>3 lives</b>, with 3 or 4 hull blocks per life depending on your ship. Each ship has its own agility and firepower. Rapid Fire and Dual Cannon are lost when your ship is destroyed.</li>
          <li>Every <b>10,000 points</b> restores 1 hull block; every <b>50,000 points</b> grants an extra life.</li>
          <li>Asteroids, girders and debris can be destroyed with a few shots and sometimes drop power-ups.</li>
          <li>Destroy enemies in a chain to raise your multiplier (up to x8). Taking damage resets your combo.</li>
          <li>Charged shots track the locked target and deal area damage.</li>
          <li>Dodging lets you pass through projectiles and the final attack of the last boss.</li>
          <li>In Stage 1, destroy the <b>3 generators</b> before the barrier to unlock the hidden route.</li>
          <li>In Stage 3, steer against the pull of <b>gravity wells</b> and destroy Prism Lancers while they charge.</li>
          <li>In Stage 4, <b>containment grids</b> leave one safe cell marked in green. Reach it before the beams fire.</li>
          <li>Flashing red lines and outlines show where an attack will strike.</li>
        </ul></div>
      </div>
      <div class="menu"><button class="primary" data-action="onBack">BACK</button></div>`);
  }

  // ------------------------------------------------------------ in game
  showPause(settings) {
    const screen = this.mount('pause', `<h2>PAUSED</h2>
      <div class="menu">
        <button class="primary" data-action="onResume">RESUME</button>
        <button data-action="onRestartStage">RESTART STAGE</button>
        <button data-action="onMenu">MAIN MENU</button>
      </div>
      ${this.settingsHtml(settings, { quality: false })}
      <div class="hint">P / Esc to resume</div>`);
    this.bindVolume(screen);
  }

  showGameOver(data) {
    this.mount('gameover', `<h2 class="bad">GAME OVER</h2>
      <div class="final-score">${formatScore(data.score)}</div>
      <div class="menu">
        <button class="primary" data-action="onContinue">CONTINUE FROM CHECKPOINT</button>
        <button data-action="onMenu">MAIN MENU</button>
      </div>
      <div class="hint">Enter: continue (score resets to the checkpoint) · Esc: menu</div>`);
  }

  showVictory(data) {
    const rows = data.breakdown.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    this.mount('victory', `<h2 class="good">MISSION ACCOMPLISHED</h2>
      <div class="sub">${data.subtitle ?? 'The enemy fleet has been defeated. The sector is clear.'}</div>
      <div class="final-score">${formatScore(data.score)}</div>
      <table class="breakdown">${rows}</table>
      <div class="menu"><button class="primary" data-action="onStart">PLAY AGAIN</button><button data-action="onMenu">MAIN MENU</button></div>
      <div class="hint">Enter: play again</div>`);
  }

  showFatal(message) {
    this.mount('fatal', `${this.titleBlock()}<h2 class="bad">Unable to start</h2><p>${message}</p>
      <p class="hint">Make sure your browser supports WebGL and open the game over HTTP or HTTPS (for local play, use npm run dev or Live Server).</p>`);
  }
}

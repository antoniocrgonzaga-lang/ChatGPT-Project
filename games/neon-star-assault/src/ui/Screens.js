import { GAME_TITLE, GAME_SUBTITLE, QUALITY, DIFFICULTY, SHIPS, MAX_SHIP_HP, WEAPONS } from '../config/gameConfig.js';
import { formatScore } from '../utils/math.js';

const CONTROLS = [
  ['WASD / Setas', 'Mover a nave'],
  ['Espaço (segurar)', 'Disparo principal contínuo'],
  ['C / J (segurar)', 'Carregar tiro especial (solte para disparar)'],
  ['Shift', 'Esquiva rápida (invulnerável por um instante)'],
  ['E', 'Bomba de energia'],
  ['P / Esc', 'Pausar'],
  ['Enter', 'Iniciar / reiniciar'],
  ['M', 'Silenciar áudio'],
  ['Gamepad', 'Analógico move · A atira · RT/LT carrega · B/RB/LB esquiva · X/Y bomba · Start pausa'],
];

const POWERUP_INFO = [
  ['R', '#33e6ff', 'Rapid Fire', 'cadência de tiro maior até perder a vida'],
  ['D', '#ff9a2e', 'Dual Cannon', 'ativa os canhões das asas até perder a vida'],
  ['S', '#5b8cff', 'Shield', 'absorve um impacto'],
  ['+', '#3dff8a', 'Repair Core', 'recupera 1 ponto de casco'],
  ['B', '#ff3dd8', 'Energy Bomb', '+1 bomba'],
  ['×2', '#ffd23d', 'Score Multiplier', 'pontuação dobrada por 15 s'],
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
      <div class="loading-label">Inicializando…</div>`);
  }

  setLoadingProgress(p, label) {
    const fill = this.root.querySelector('.loading-bar .fill');
    if (fill) fill.style.transform = `scaleX(${p})`;
    const l = this.root.querySelector('.loading-label');
    if (l && label) l.textContent = `Gerando ${label}…`;
  }

  // ------------------------------------------------------------ settings widgets
  settingsHtml(settings, { quality = true } = {}) {
    const q = quality
      ? `<div class="setting"><span>Qualidade</span><div class="seg">${Object.entries(QUALITY)
          .map(([k, v]) => `<button data-action="onQuality" data-value="${k}" class="${settings.quality === k ? 'sel' : ''}">${v.label}</button>`)
          .join('')}</div></div>
        <div class="setting"><span>Dificuldade</span><div class="seg">${Object.entries(DIFFICULTY)
          .map(([k, v]) => `<button data-action="onDifficulty" data-value="${k}" class="${settings.difficulty === k ? 'sel' : ''}">${v.label}</button>`)
          .join('')}</div></div>`
      : '';
    return `<div class="settings">${q}
      <div class="setting"><span>Volume</span><input type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" class="volume">
      <button data-action="onMute" class="mute ${settings.muted ? 'sel' : ''}">${settings.muted ? 'Som: OFF' : 'Som: ON'}</button></div>
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
          <span class="ship-card-stat"><span>CASCO</span>${meter(ship.stats.maxHp, MAX_SHIP_HP, 'blocks')}</span>
          <span class="ship-card-stat"><span>AGILIDADE</span>${meter(agility, BARS)}</span>
          <span class="ship-card-stat"><span>FOGO</span>${meter(fire, BARS)}</span>
        </button>`;
      })
      .join('');
    return `<div class="ship-select">${cards}</div>`;
  }

  showTitle(settings, warnings = []) {
    const screen = this.mount('title', `${this.titleBlock()}
      ${this.shipSelectHtml(settings.ship)}
      <div class="menu">
        <button class="primary" data-action="onStart">▶ INICIAR</button>
        <button data-action="onInstructions">INSTRUÇÕES</button>
      </div>
      ${this.settingsHtml(settings)}
      <div class="hint"><b>←</b> / <b>→</b> escolhe a nave · <b>Enter</b> para começar</div>
      ${warnings.length ? `<div class="warn-list">${warnings.map((w) => `<div>⚠ ${w}</div>`).join('')}</div>` : ''}`);
    this.bindVolume(screen);
  }

  showInstructions() {
    this.mount('instructions', `<h2>INSTRUÇÕES</h2>
      <div class="cols">
        <div><h3>Controles</h3><table>${CONTROLS.map(([k, v]) => `<tr><td class="key">${k}</td><td>${v}</td></tr>`).join('')}</table></div>
        <div><h3>Power-ups</h3><table>${POWERUP_INFO.map(([i, c, n, d]) => `<tr><td class="pu" style="color:${c}">${i}</td><td><b style="color:${c}">${n}</b> — ${d}</td></tr>`).join('')}</table>
        <h3>Dicas</h3><ul>
          <li>Você tem <b>3 vidas</b>; cada vida tem 3 ou 4 blocos de casco, conforme a nave escolhida (cada nave também tem agilidade e poder de fogo próprios). Ao perder uma vida, Rapid Fire e Dual Cannon são perdidos.</li>
          <li>A cada <b>10 000 pontos</b> o casco recupera 1 bloco; a cada <b>50 000</b> você ganha uma vida extra.</li>
          <li>Asteroides, vigas e destroços podem ser destruídos com alguns tiros e às vezes soltam power-ups.</li>
          <li>Destrua inimigos em sequência para subir o multiplicador (até x8). Receber dano zera o combo.</li>
          <li>O tiro carregado persegue o alvo marcado e causa dano em área.</li>
          <li>A esquiva atravessa projéteis e o ataque final do último chefe.</li>
          <li>No Stage 1, destrua os <b>3 geradores</b> antes da barreira para abrir a rota oculta.</li>
          <li>No Stage 3, mova-se contra a atração dos <b>poços gravitacionais</b> e destrua os Prism Lancers enquanto carregam.</li>
          <li>No Stage 4, as <b>grades de contenção</b> deixam uma única célula livre, marcada em verde: chegue até ela antes do disparo.</li>
          <li>Linhas e contornos vermelhos piscando indicam onde um ataque vai acontecer.</li>
        </ul></div>
      </div>
      <div class="menu"><button class="primary" data-action="onBack">VOLTAR</button></div>`);
  }

  // ------------------------------------------------------------ in game
  showPause(settings) {
    const screen = this.mount('pause', `<h2>PAUSA</h2>
      <div class="menu">
        <button class="primary" data-action="onResume">CONTINUAR</button>
        <button data-action="onRestartStage">REINICIAR ESTÁGIO</button>
        <button data-action="onMenu">MENU PRINCIPAL</button>
      </div>
      ${this.settingsHtml(settings, { quality: false })}
      <div class="hint">P / Esc para continuar</div>`);
    this.bindVolume(screen);
  }

  showGameOver(data) {
    this.mount('gameover', `<h2 class="bad">GAME OVER</h2>
      <div class="final-score">${formatScore(data.score)}</div>
      <div class="menu">
        <button class="primary" data-action="onContinue">CONTINUAR DO CHECKPOINT</button>
        <button data-action="onMenu">MENU PRINCIPAL</button>
      </div>
      <div class="hint">Enter: continuar (pontuação reiniciada no checkpoint) · Esc: menu</div>`);
  }

  showVictory(data) {
    const rows = data.breakdown.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
    this.mount('victory', `<h2 class="good">MISSÃO CUMPRIDA</h2>
      <div class="sub">${data.subtitle ?? 'A frota inimiga foi derrotada. O setor está livre.'}</div>
      <div class="final-score">${formatScore(data.score)}</div>
      <table class="breakdown">${rows}</table>
      <div class="menu"><button class="primary" data-action="onStart">JOGAR NOVAMENTE</button><button data-action="onMenu">MENU PRINCIPAL</button></div>
      <div class="hint">Enter: jogar novamente</div>`);
  }

  showFatal(message) {
    this.mount('fatal', `${this.titleBlock()}<h2 class="bad">Não foi possível iniciar</h2><p>${message}</p>
      <p class="hint">Verifique se o navegador suporta WebGL e se o jogo está sendo servido por um servidor local (npm run dev ou Live Server).</p>`);
  }
}

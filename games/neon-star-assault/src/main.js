import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const uiRoot = document.getElementById('ui-root');

function fatal(message) {
  uiRoot.innerHTML = `<div class="screens"><div class="screen screen-fatal in"><h2 class="bad">Erro ao iniciar</h2><p>${message}</p></div></div>`;
}

try {
  const game = new Game(canvas, uiRoot);
  game.boot().catch((err) => {
    console.error(err);
    fatal(err.message ?? String(err));
  });
} catch (err) {
  console.error(err);
  fatal(err.message ?? String(err));
}

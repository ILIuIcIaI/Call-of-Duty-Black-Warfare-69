import { Game } from './game.js';

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  document.getElementById('load-msg').textContent = 'Fehler: ' + e.message;
});

import { Game } from './game.js';

const failed = (e) => {
  console.error(e);
  document.getElementById('load-msg').textContent = /webgl/i.test(e && e.message) ? 'Dieser Browser kann die 3D-Grafik nicht starten (WebGL 2). Nimm ein aktuelles Chrome oder Edge, schalte die Hardwarebeschleunigung ein und aktualisiere den Grafiktreiber.' : 'Fehler: ' + (e && e.message);
};
try { new Game().init().catch(failed); } catch (e) { failed(e); }

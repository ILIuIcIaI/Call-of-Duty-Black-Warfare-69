// Minimal file server for Black Warfare 69 (no dependencies), and the multiplayer room, see server/mp.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { Service } = require('./server/mp.js');

let PORT = +(process.env.PORT || 8069);
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};
// the game and nothing else: this can be reached from the network once someone plays multiplayer
const ALLOWED = (p) => p === '/index.html' || p.startsWith('/src/') || p.startsWith('/node_modules/three/');

const service = new Service(PORT);

function handle(req, res) {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (p === '/mp/find') {
    // (only the game itself may ask: this opens the server to the network)
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin') { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    service.find().then((r) => res.end(JSON.stringify(r)), () => res.end('{"error":true}'));
    return;
  }
  if (p === '/mp/firewall') {
    // (only the game itself, and only for whoever sits at this very computer)
    const here = /^(::ffff:)?127\.|^::1$/.test(String(req.socket.remoteAddress)) && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host));
    if (!here || req.method !== 'POST' || req.headers['sec-fetch-site'] !== 'same-origin') { res.writeHead(403); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    service.openFirewall((r) => res.end(JSON.stringify(r)));
    return;
  }
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT + path.sep) || !ALLOWED(p.replace(/\\/g, '/')) || p.includes('..')) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}
const upgrade = (req, sock) => {
  if (req.url.split('?')[0] === '/mp') service.accept(req, sock);
  else sock.destroy();
};

// (start.bat leaves it to this to open the page: only here it is clear which port it ended up on)
function showGame() {
  if (!process.env.BW69_OPEN) return;
  try { spawn('cmd', ['/c', 'start', '', 'http://localhost:' + PORT], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch (e) { /* then by hand */ }
}

// Is that this game on the port, from a window left open? Then that's where to go. Anything else: the next port, unless someone asked for this one.
function portTaken(port) {
  const elsewhere = () => {
    if (process.env.PORT || port >= PORT + 10) { console.error(`Port ${port} ist belegt. Ein anderes Programm benutzt ihn.`); process.exit(1); }
    start(port + 1);
  };
  http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (r) => {
    let body = '';
    r.on('data', (d) => { body += d; });
    r.on('end', () => {
      if (!body.includes('Black Warfare 69')) return elsewhere();
      PORT = port;
      console.log(`Black Warfare 69 laeuft schon: http://localhost:${port}`);
      showGame();
      setTimeout(() => process.exit(0), 300);
    });
  }).on('error', elsewhere).on('timeout', function () { this.destroy(); });
}

function start(port) {
  const local = http.createServer(handle);
  local.on('upgrade', upgrade);
  local.once('error', (e) => { if (e.code === 'EADDRINUSE') portTaken(port); else throw e; });
  local.listen(port, '127.0.0.1', () => {
    PORT = port; service.port = port;
    console.log(`Black Warfare 69 running at http://localhost:${port}`);
    showGame();
  });
}

function open(host, done) {
  const s = http.createServer(handle);
  s.on('upgrade', upgrade);
  s.on('error', done);
  s.listen(PORT, host);
  return s;
}

// Until someone goes looking for a room nobody else can reach this. From then on it listens in the local network as well,
// on whatever addresses this computer has by then: a laptop changes networks, and a router hands out a new address.
const listening = new Set();
function openLan() {
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if ((a.family !== 'IPv4' && a.family !== 4) || a.internal || listening.has(a.address)) continue;
    listening.add(a.address);
    open(a.address, () => { listening.delete(a.address); /* this address is not to be had, maybe later */ });
  }
}
let lanTimer = null;
service.onLan = () => {
  openLan();
  if (!lanTimer) lanTimer = setInterval(openLan, 3000);
};

start(PORT);

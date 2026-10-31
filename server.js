// Minimal file server for Black Warfare 69 (no dependencies), and the multiplayer room, see server/mp.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Service } = require('./server/mp.js');

const PORT = +(process.env.PORT || 8069);
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
function open(host) {
  const s = http.createServer(handle);
  s.on('upgrade', upgrade);
  s.on('error', () => { /* this address is not to be had, the others still work */ });
  s.listen(PORT, host);
  return s;
}

const local = http.createServer(handle);
local.on('upgrade', upgrade);
local.listen(PORT, '127.0.0.1', () => console.log(`Black Warfare 69 running at http://localhost:${PORT}`));

// Until someone goes looking for a room nobody else can reach this. From then on it listens in the local network as well.
let onLan = false;
service.onLan = () => {
  if (onLan) return;
  onLan = true;
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) open(a.address);
};

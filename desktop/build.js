// =============================================================================
// Builds the two downloads of a release into dist/ (in the project folder):
//   Black-Warfare-69-<version>-Windows.zip : the Windows program, Node.js and Chromium inside
//   Black-Warfare-69-<version>-Browser.zip : index.html to open straight from the disk (alone
//                                            against bots), start.bat for its server with Node.js
// Both carry the game as one file, game.js, with three.js and PoolDay's map file inside.
// Run: cd desktop, npm install, npm run build
// =============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..'), DIST = path.join(ROOT, 'dist');
const V = require(path.join(ROOT, 'package.json')).version;
const NAME = 'Black Warfare 69';
const at = (...p) => path.join(ROOT, ...p);
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); };
const write = (to, text) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, text); };
const b64 = (file) => fs.readFileSync(file).toString('base64');

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });

  // ---- the game in one file. The modules use await at the top (PoolDay waits for its map), so the bundle stays a
  // module inside and is run as an async function: a plain script, which a page from the disk may load.
  const out = await esbuild.build({
    entryPoints: [at('src', 'main.js')], bundle: true, format: 'esm', minify: true, write: false, legalComments: 'eof',
    target: ['chrome110', 'edge110', 'firefox115', 'safari16'], define: { 'import.meta.url': 'location.href' }, logLevel: 'warning',
  });
  const files = { 'poolday.bsp': b64(at('src', 'world', 'maps', 'poolday.bsp')) };
  const game = `/* Black Warfare 69 ${V}: the whole game in one file, built by desktop/build.js. Licenses of three.js and the fonts in licenses/. */\n`
    + `globalThis.BW69_FILES = ${JSON.stringify(files)};\n`
    + `(async () => {\n'use strict';\n${out.outputFiles[0].text}\n})().catch((e) => { console.error(e); const m = document.getElementById('load-msg'); if (m) m.textContent = 'Fehler: ' + (e && e.message); });\n`;

  // ---- the page: styles and fonts inside it, the game next to it
  let css = fs.readFileSync(at('src', 'ui', 'styles.css'), 'utf8');
  css = css.replace(/url\('fonts\/([\w-]+\.woff2)'\)/g, (m, f) => `url(data:font/woff2;base64,${b64(at('src', 'ui', 'fonts', f))})`);
  let html = fs.readFileSync(at('index.html'), 'utf8');
  const swap = (a, b) => { if (!html.includes(a)) throw new Error('index.html: missing ' + a); html = html.replace(a, b); };
  swap('<link rel="icon" href="./src/ui/icon.ico">', `<link rel="icon" href="data:image/x-icon;base64,${b64(at('src', 'ui', 'icon.ico'))}">`);
  swap('<link rel="stylesheet" href="./src/ui/styles.css">', `<style>\n${css}\n</style>`);
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
  swap('<script type="module" src="./src/main.js"></script>', '<script src="game.js"></script>');

  const licenses = (dir) => {
    copy(at('node_modules', 'three', 'LICENSE'), path.join(dir, 'licenses', 'three.js.txt'));
    for (const f of ['OFL-Teko.txt', 'OFL-Rajdhani.txt']) copy(at('src', 'ui', 'fonts', f), path.join(dir, 'licenses', f));
  };
  const server = (dir) => {
    copy(at('server.js'), path.join(dir, 'server.js'));
    for (const f of fs.readdirSync(at('server'))) copy(at('server', f), path.join(dir, 'server', f));
  };

  // ---- browser version
  const web = path.join(DIST, 'browser', NAME);
  write(path.join(web, 'index.html'), html);
  write(path.join(web, 'game.js'), game);
  server(web);
  copy(at('start.bat'), path.join(web, 'start.bat'));
  licenses(web);
  write(path.join(web, 'README.txt'), [
    `${NAME} ${V}, browser version`, '',
    'Play alone against bots: double-click index.html. The game runs right in the browser (Chrome, Edge or Firefox),',
    'no installation and no internet connection needed.', '',
    'Multiplayer in the local network needs the game\'s server. Easiest is the Windows version, which has it built in.',
    'Here, start.bat runs the same server if Node.js is installed (https://nodejs.org).',
    'Joining someone else\'s game works without anything: open the address their lobby shows in your browser.', '',
    'https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69', '',
  ].join('\r\n'));

  // ---- Windows version: the same page and server, run by Electron
  const app = path.join(DIST, 'app');
  write(path.join(app, 'index.html'), html);
  write(path.join(app, 'game.js'), game);
  server(app);
  for (const f of ['main.js', 'preload.js', 'icon.ico']) copy(path.join(__dirname, f), path.join(app, 'desktop', f));
  write(path.join(app, 'package.json'), JSON.stringify({ name: 'black-warfare-69', productName: NAME, version: V, private: true, main: 'desktop/main.js', license: 'UNLICENSED' }, null, 2));
  const { packager } = await import('@electron/packager');
  const [built] = await packager({
    dir: app, out: path.join(DIST, 'pack'), name: NAME, executableName: NAME, platform: 'win32', arch: 'x64',
    electronVersion: require('electron/package.json').version, icon: path.join(__dirname, 'icon.ico'), asar: true, overwrite: true, prune: false, quiet: true,
    appVersion: V, buildVersion: V, appCopyright: '',
    win32metadata: { CompanyName: NAME, FileDescription: NAME, ProductName: NAME, InternalName: NAME, OriginalFilename: NAME + '.exe' },
  });
  // (Chromium brings every language of its own menus; the game speaks German and the window has no menus)
  const loc = path.join(built, 'locales');
  for (const f of fs.readdirSync(loc)) if (!['de.pak', 'en-US.pak'].includes(f)) fs.rmSync(path.join(loc, f));
  const win = path.join(DIST, 'windows', NAME);
  fs.mkdirSync(path.dirname(win), { recursive: true });
  fs.renameSync(built, win);
  licenses(win);
  write(path.join(win, 'README.txt'), [
    `${NAME} ${V}, Windows version`, '',
    `Start: double-click "${NAME}.exe". Nothing to install. F11 switches to full screen.`,
    'Windows may warn about an app from an unknown publisher the first time: "More info", then "Run anyway".',
    'For multiplayer Windows asks once whether the game may use the network: allow it for private networks.', '',
    'Others in the same network can join with this program or with any browser: the lobby shows the address.',
    `Settings are kept in %APPDATA%\\${NAME}.`, '',
    'https://github.com/ILIuIcIaI/Call-of-Duty-Black-Warfare-69', '',
  ].join('\r\n'));

  // ---- the zips
  const zip = (dir, name) => {
    const file = path.join(DIST, name);
    execFileSync('C:/Windows/System32/tar.exe', ['-a', '-c', '-f', file.replace(/\\/g, '/'), '-C', path.dirname(dir).replace(/\\/g, '/'), path.basename(dir)]);
    return { name, mb: +(fs.statSync(file).size / 1048576).toFixed(1) };
  };
  const zips = [zip(win, `Black-Warfare-69-${V}-Windows.zip`), zip(web, `Black-Warfare-69-${V}-Browser.zip`)];
  console.log(JSON.stringify({ version: V, gameKB: Math.round(game.length / 1024), zips }, null, 1));
}

main().catch((e) => { console.error(e); process.exit(1); });

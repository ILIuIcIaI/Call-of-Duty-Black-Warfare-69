// =============================================================================
// Black Warfare 69 as a Windows program: one window with no browser around it, and
// the game's own server inside (for the menu, multiplayer in the local network, and
// browsers on other computers that want to join). Nothing to install, Node.js and
// Chromium come with it. Built by desktop/build.js.
// =============================================================================
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');

// laptops with two graphics chips: the strong one, and no browser brakes on a game
app.commandLine.appendSwitch('force_high_performance_gpu');
// old graphics chips that Chromium would rather not use for 3D: used anyway (that is what makes a weak PC playable)
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// and with no usable graphics chip at all, the processor draws the picture instead of the game not starting
// (slow, so Auto picks Toaster then; the window only ever shows the game's own page, see will-navigate below)
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// started twice: the window that is there already comes to the front
if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  let port;
  try { port = await require('../server.js').serve(+process.env.BW69_PORT || 8069); } catch (e) {
    dialog.showErrorBox('Black Warfare 69', 'Der Spielserver lässt sich nicht starten: ' + e.message);
    app.quit();
    return;
  }
  const origin = 'http://localhost:' + port;
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540, show: false, backgroundColor: '#0a0b0c', title: 'Black Warfare 69',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // F11: full screen, as in a browser
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // the window only ever shows the game; a link elsewhere opens in the normal browser
  const outside = (url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { outside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(origin + '/')) { e.preventDefault(); outside(url); } });
  // a running match asks before the window closes (the page says so the way it does in a browser)
  win.webContents.on('will-prevent-unload', (e) => {
    const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Beenden', 'Weiterspielen'], defaultId: 1, cancelId: 1, title: 'Black Warfare 69', message: 'Das Match läuft noch. Wirklich beenden?' });
    if (r === 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; });
  win.loadURL(origin + '/');
});

ipcMain.on('quit', () => app.quit());
app.on('window-all-closed', () => app.quit());

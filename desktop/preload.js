// The page learns that it runs as the Windows program, and gets a way to close it (the menu's BEENDEN).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', { quit: () => ipcRenderer.send('quit') });

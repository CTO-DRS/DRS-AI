/**
 * DRS AI Desktop — Preload script
 *
 * Runs in an isolated context with Node access, exposes a safe
 * `drsAI` API to the renderer (the DRS AI frontend React app).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('drsAI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),

  // Settings
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, val) => ipcRenderer.invoke('settings:set', key, val),
    getAll: () => ipcRenderer.invoke('settings:getAll'),
  },

  // Native dialogs
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (defaultName) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  },

  // Notifications
  notify: (opts) => ipcRenderer.invoke('notification:show', opts),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Events from main process
  on: (channel, cb) => {
    const valid = ['deep-link', 'navigate'];
    if (valid.includes(channel)) {
      ipcRenderer.on(channel, (_e, payload) => cb(payload));
    }
  },
});

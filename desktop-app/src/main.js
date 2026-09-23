/**
 * DRS AI Desktop — Main process
 *
 * Responsibilities:
 *   - Create BrowserWindow(s) loading the DRS AI frontend
 *   - Native menu (Arabic / English / French / German labels via i18n)
 *   - System tray icon with quick actions
 *   - Auto-launch on boot (optional)
 *   - Deep-link registration (drsai://)
 *   - Auto-updater via electron-updater
 *   - IPC handlers for native-only actions (file dialogs, notifications)
 */
const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell, dialog, Notification } = require('electron');
const path = require('path');
const url = require('url');
const log = require('electron-log/main');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const { autoUpdater } = require('electron-updater');

log.initialize();
log.info('🚀 DRS AI Desktop starting...');

const store = new Store({
  defaults: {
    serverUrl: 'http://localhost:3000',
    language: 'en',
    launchOnBoot: false,
    minimizeToTray: true,
    enableAutoUpdate: true,
    windowBounds: { width: 1400, height: 900 },
  },
});

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ──────────────────────────────────────────────
// i18n (minimal — menu labels only)
// ──────────────────────────────────────────────

const i18n = {
  en: {
    file: 'File', newWindow: 'New Window', close: 'Close Window', quit: 'Quit',
    edit: 'Edit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
    view: 'View', reload: 'Reload', forceReload: 'Force Reload', devTools: 'Toggle Developer Tools',
    resetZoom: 'Actual Size', zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fullscreen: 'Toggle Full Screen',
    window: 'Window', minimize: 'Minimize', zoom: 'Zoom', front: 'Bring All to Front',
    help: 'Help', docs: 'Documentation', repo: 'GitHub Repository', reportIssue: 'Report Issue', about: 'About DRS AI',
    tray: { show: 'Show DRS AI', hide: 'Hide to Tray', quit: 'Quit', settings: 'Settings' },
    notifications: { ready: 'DRS AI is ready', readyBody: 'Click to open the dashboard' },
  },
  ar: {
    file: 'ملف', newWindow: 'نافذة جديدة', close: 'إغلاق النافذة', quit: 'إنهاء',
    edit: 'تحرير', undo: 'تراجع', redo: 'إعادة', cut: 'قص', copy: 'نسخ', paste: 'لصق', selectAll: 'تحديد الكل',
    view: 'عرض', reload: 'إعادة تحميل', forceReload: 'إعادة تحميل إجباري', devTools: 'أدوات المطور',
    resetZoom: 'الحجم الفعلي', zoomIn: 'تكبير', zoomOut: 'تصغير', fullscreen: 'ملء الشاشة',
    window: 'نافذة', minimize: 'تصغير', zoom: 'تكبير', front: 'إحضار الكل للأمام',
    help: 'مساعدة', docs: 'التوثيق', repo: 'مستودع GitHub', reportIssue: 'الإبلاغ عن مشكلة', about: 'حول DRS AI',
    tray: { show: 'إظهار DRS AI', hide: 'إخفاء إلى الشريط', quit: 'إنهاء', settings: 'الإعدادات' },
    notifications: { ready: 'DRS AI جاهز', readyBody: 'اضغط لفتح لوحة التحكم' },
  },
  fr: {
    file: 'Fichier', newWindow: 'Nouvelle fenêtre', close: 'Fermer', quit: 'Quitter',
    edit: 'Édition', undo: 'Annuler', redo: 'Rétablir', cut: 'Couper', copy: 'Copier', paste: 'Coller', selectAll: 'Tout sélectionner',
    view: 'Affichage', reload: 'Recharger', forceReload: 'Recharger (forcé)', devTools: 'Outils développeur',
    resetZoom: 'Taille réelle', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', fullscreen: 'Plein écran',
    window: 'Fenêtre', minimize: 'Réduire', zoom: 'Agrandir', front: 'Tout au premier plan',
    help: 'Aide', docs: 'Documentation', repo: 'Dépôt GitHub', reportIssue: 'Signaler un problème', about: 'À propos de DRS AI',
    tray: { show: 'Afficher DRS AI', hide: 'Réduire', quit: 'Quitter', settings: 'Paramètres' },
    notifications: { ready: 'DRS AI est prêt', readyBody: 'Cliquez pour ouvrir le tableau de bord' },
  },
  de: {
    file: 'Datei', newWindow: 'Neues Fenster', close: 'Schließen', quit: 'Beenden',
    edit: 'Bearbeiten', undo: 'Rückgängig', redo: 'Wiederholen', cut: 'Ausschneiden', copy: 'Kopieren', paste: 'Einfügen', selectAll: 'Alle auswählen',
    view: 'Ansicht', reload: 'Neu laden', forceReload: 'Neu laden (erzwungen)', devTools: 'Entwicklertools',
    resetZoom: 'Originalgröße', zoomIn: 'Vergrößern', zoomOut: 'Verkleinern', fullscreen: 'Vollbild',
    window: 'Fenster', minimize: 'Minimieren', zoom: 'Vergrößern', front: 'Alle nach vorne',
    help: 'Hilfe', docs: 'Dokumentation', repo: 'GitHub-Repository', reportIssue: 'Problem melden', about: 'Über DRS AI',
    tray: { show: 'DRS AI anzeigen', hide: 'In Tray ausblenden', quit: 'Beenden', settings: 'Einstellungen' },
    notifications: { ready: 'DRS AI ist bereit', readyBody: 'Klicken Sie, um das Dashboard zu öffnen' },
  },
};

function t() {
  const lang = store.get('language', 'en');
  return i18n[lang] || i18n.en;
}

// ──────────────────────────────────────────────
// Auto-launch on boot
// ──────────────────────────────────────────────

const autoLauncher = new AutoLaunch({
  name: 'DRS AI',
  path: app.getPath('exe'),
});

if (store.get('launchOnBoot')) {
  autoLauncher.enable().catch((e) => log.warn('auto-launch enable failed', e));
} else {
  autoLauncher.disable().catch(() => {});
}

// ──────────────────────────────────────────────
// Window
// ──────────────────────────────────────────────

function getFrontendUrl() {
  return store.get('serverUrl', 'http://localhost:3000');
}

function createMainWindow() {
  const bounds = store.get('windowBounds');
  mainWindow = new BrowserWindow({
    width: bounds?.width || 1400,
    height: bounds?.height || 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    title: 'DRS AI',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const target = process.env.DRS_FRONTEND_URL || (app.isPackaged ? getFrontendUrl() : 'http://localhost:8080');

  mainWindow.loadURL(target).catch((err) => {
    log.error('Failed to load frontend', err);
    // Fallback: show an error page
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <html><body style="background:#0a0a0a;color:#f5f5f5;font-family:system-ui;padding:40px;text-align:center">
        <h1 style="color:#6366f1">DRS AI</h1>
        <p>Could not reach the DRS AI frontend at <code>${target}</code></p>
        <p>Make sure the gateway / frontend service is running.</p>
      </body></html>
    `));
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (Notification.isSupported()) {
      new Notification({
        title: t().notifications.ready,
        body: t().notifications.readyBody,
        silent: true,
      }).show();
    }
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('http')) {
      shell.openExternal(targetUrl);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      store.set('windowBounds', { width, height });
    }
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting && store.get('minimizeToTray')) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
}

// ──────────────────────────────────────────────
// Menu
// ──────────────────────────────────────────────

function buildMenu() {
  const m = t();
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: m.about },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: m.quit },
      ],
    }] : []),
    {
      label: m.file,
      submenu: [
        { label: m.newWindow, accelerator: 'CmdOrCtrl+N', click: () => createMainWindow() },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: m.quit }]),
      ],
    },
    {
      label: m.edit,
      submenu: [
        { role: 'undo', label: m.undo },
        { role: 'redo', label: m.redo },
        { type: 'separator' },
        { role: 'cut', label: m.cut },
        { role: 'copy', label: m.copy },
        { role: 'paste', label: m.paste },
        { role: 'selectAll', label: m.selectAll },
      ],
    },
    {
      label: m.view,
      submenu: [
        { role: 'reload', label: m.reload },
        { role: 'forceReload', label: m.forceReload },
        { role: 'toggleDevTools', label: m.devTools },
        { type: 'separator' },
        { role: 'resetZoom', label: m.resetZoom },
        { role: 'zoomIn', label: m.zoomIn },
        { role: 'zoomOut', label: m.zoomOut },
        { type: 'separator' },
        { role: 'togglefullscreen', label: m.fullscreen },
      ],
    },
    {
      label: m.window,
      submenu: [
        { role: 'minimize', label: m.minimize },
        { role: 'zoom', label: m.zoom },
        ...(isMac ? [{ type: 'separator' }, { role: 'front', label: m.front }] : []),
      ],
    },
    {
      role: 'help',
      label: m.help,
      submenu: [
        { label: m.docs, click: () => shell.openExternal('https://github.com/CTO-DRS/DRS-AI#readme') },
        { label: m.repo, click: () => shell.openExternal('https://github.com/CTO-DRS/DRS-AI') },
        { label: m.reportIssue, click: () => shell.openExternal('https://github.com/CTO-DRS/DRS-AI/issues') },
        { label: m.about, click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'DRS AI',
            message: 'DRS AI Desktop',
            detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nPlatform: ${process.platform} ${process.arch}`,
            buttons: ['OK'],
          });
        } },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

// ──────────────────────────────────────────────
// Tray
// ──────────────────────────────────────────────

function createTray() {
  // 16x16 transparent icon — replace with build/icon.png
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let icon;
  try { icon = nativeImage.createFromPath(iconPath); if (icon.isEmpty()) icon = nativeImage.createEmpty(); }
  catch { icon = nativeImage.createEmpty(); }

  tray = new Tray(icon);
  tray.setToolTip('DRS AI');

  const m = t();
  const contextMenu = Menu.buildFromTemplate([
    { label: m.tray.show, click: () => { if (mainWindow) mainWindow.show(); else createMainWindow(); } },
    { label: m.tray.settings, click: () => { if (mainWindow) { mainWindow.show(); mainWindow.webContents.send('navigate', '/settings'); } } },
    { type: 'separator' },
    { label: m.tray.hide, click: () => mainWindow?.hide() },
    { label: m.tray.quit, click: () => { isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    } else {
      createMainWindow();
    }
  });
}

// ──────────────────────────────────────────────
// IPC handlers
// ──────────────────────────────────────────────

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => ({ platform: process.platform, arch: process.arch }));
ipcMain.handle('settings:get', (e, key) => store.get(key));
ipcMain.handle('settings:set', (e, key, val) => { store.set(key, val); return val; });
ipcMain.handle('settings:getAll', () => store.store);

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
  });
  return result;
});

ipcMain.handle('dialog:saveFile', async (e, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
  return result;
});

ipcMain.handle('notification:show', (e, opts) => {
  if (Notification.isSupported()) {
    new Notification(opts).show();
    return true;
  }
  return false;
});

ipcMain.handle('shell:openExternal', (e, target) => shell.openExternal(target));

// Deep link: drsai://...
app.setAsDefaultProtocolClient('drsai');
app.on('open-url', (e, urlStr) => {
  e.preventDefault();
  if (mainWindow) {
    mainWindow.show();
    mainWindow.webContents.send('deep-link', urlStr);
  }
});

// ──────────────────────────────────────────────
// Auto-updater
// ──────────────────────────────────────────────

if (store.get('enableAutoUpdate') && !process.env.DRS_DISABLE_UPDATER) {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update available',
      message: `DRS AI ${info.version} is available. Download now?`,
      buttons: ['Download', 'Later'],
    }).then((r) => {
      if (r.response === 0) autoUpdater.downloadUpdate();
    });
  });
  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: 'Update installed. Restart to apply?',
      buttons: ['Restart', 'Later'],
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
  });
  app.whenReady().then(() => autoUpdater.checkForUpdates().catch((e) => log.warn('updater check failed', e)));
}

// ──────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu());
    createMainWindow();
    createTray();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  app.on('before-quit', () => { isQuitting = true; });

  // Prevent app from quitting when window is closed on macOS unless explicit quit
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !store.get('minimizeToTray')) app.quit();
  });
}

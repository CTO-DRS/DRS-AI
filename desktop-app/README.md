# DRS AI Desktop 🖥️

Electron wrapper for the [DRS AI](https://github.com/CTO-DRS/DRS-AI) Enterprise AI Operating System.

Runs the DRS AI frontend as a native desktop application on macOS, Windows, and Linux with deep OS integration.

## ✨ Features

- 🪟 **Native window** — titlebar integration, dark theme, custom titlebar on macOS
- 📋 **Native menu** — full menu bar in English / Arabic / French / German
- 📍 **System tray** — quick actions, "hide to tray", one-click show
- 🚀 **Auto-launch on boot** (optional)
- 🔗 **Deep links** — register `drsai://` protocol
- 🔔 **Native notifications** — shown when the AI is ready
- ⬆️ **Auto-updater** — auto-check for new releases via electron-updater
- 🌐 **Multi-window** — open multiple DRS AI instances side-by-side
- 🗂️ **Native file dialogs** — open/save via OS picker
- 🔒 **Secure by default** — contextIsolation, no nodeIntegration, sandboxed renderer

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- The DRS AI frontend running locally (default: `http://localhost:8080` or `http://localhost:3000`)

### Install & Run

```bash
cd desktop-app
npm install
npm start
```

### Development with dev tools

```bash
npm run dev   # opens with DevTools enabled
```

### Build installers

```bash
# macOS (.dmg + .zip)
npm run build:mac

# Windows (.exe + portable)
npm run build:win

# Linux (AppImage + .deb + .snap)
npm run build:linux
```

Output goes to `dist/`.

## 🔌 Configuration

All settings are stored in `electron-store` (located at `%APPDATA%/drs-ai-desktop/config.json` on Windows, `~/Library/Application Support/drs-ai-desktop/config.json` on macOS, `~/.config/drs-ai-desktop/config.json` on Linux).

| Setting | Default | Description |
|---|---|---|
| `serverUrl` | `http://localhost:3000` | DRS AI Gateway URL |
| `language` | `en` | UI language (`ar`, `en`, `fr`, `de`) |
| `launchOnBoot` | `false` | Start when OS boots |
| `minimizeToTray` | `true` | Hide to tray on close |
| `enableAutoUpdate` | `true` | Check for new releases |
| `windowBounds` | `{1400, 900}` | Last window size |

## 🧩 Renderer Integration

The DRS AI frontend can detect it's running inside Electron via the `window.drsAI` global exposed by the preload script:

```ts
// In the React frontend
if (window.drsAI) {
  const version = await window.drsAI.getVersion();
  const platform = await window.drsAI.getPlatform();
  await window.drsAI.settings.set('language', 'ar');
  await window.drsAI.notify({ title: 'DRS AI', body: 'Hello!' });

  // React to deep-link navigations
  window.drsAI.on('deep-link', (url) => {
    console.log('User clicked drsai://', url);
  });
}
```

## 📁 Project Structure

```
desktop-app/
├── package.json             # scripts + electron-builder config
├── src/
│   ├── main.js              # main process (window, menu, tray, IPC, updater)
│   ├── preload.js           # context-isolated bridge to renderer
│   └── loader.html          # shown if frontend unreachable
├── build/
│   ├── entitlements.mac.plist
│   ├── icon.icns            # macOS icon (add)
│   ├── icon.ico             # Windows icon (add)
│   └── icon.png             # Linux icon (add)
└── assets/
    └── tray-icon.png        # 16x16 tray icon
```

## 📜 License
MIT — part of the DRS AI platform.

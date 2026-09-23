# DRS AI Mobile 📱

Cross-platform mobile client for the [DRS AI](https://github.com/CTO-DRS/DRS-AI) Enterprise AI Operating System.

Built with **React Native + Expo**, supporting Android, iOS, and Web from a single codebase.

## ✨ Features

- 🗣️ **Multilingual UI** — Arabic (RTL), English, French, German with instant switching
- 💬 **Chat** — streaming responses, confidence scores, source attribution
- 🎙️ **Voice** — speech-to-text + text-to-speech with wake-word detection
- 📁 **Files** — upload, list, download, delete
- 🧠 **Models** — pull, delete, inspect model capabilities
- ⚙️ **Settings** — server URL, language, brain mode (left/right/auto), notifications
- 🌙 **Dark-first design** with `expo-status-bar` integration
- 🔄 **Offline-aware** — automatic connection-status detection

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- Expo CLI (`npm i -g expo-cli`)
- Android Studio (for Android emulator) or Xcode (for iOS)

### Install & Run

```bash
cd mobile-app
npm install
npm start          # opens Expo DevTools
# press `a` for Android, `i` for iOS, `w` for web
```

### Build for Production

```bash
# Android APK
expo build:android -t apk

# iOS archive
expo build:ios -t archive
```

## 🌍 Internationalization

Locales live in `src/i18n/locales/`. To add a new language:

1. Create `src/i18n/locales/<code>.ts` exporting a translation object
2. Register it in `src/i18n/index.ts` (add to `i18n.translations` and `supportedLocales`)
3. RTL is automatically enabled for `ar`, `fa`, `ur`, `he`

## 🔌 Configuration

The app talks to your DRS AI Gateway (default `http://localhost:3000`).
Change it in **Settings → Server URL** at runtime.

| Setting | Default |
|---|---|
| Gateway URL | `http://localhost:3000` |
| Auth | JWT bearer via `expo-secure-store` |
| Streaming | SSE-style chunks |
| Storage | `AsyncStorage` for files/session |

## 📁 Project Structure

```
mobile-app/
├── app.json                 # Expo config
├── babel.config.js
├── tsconfig.json
├── index.ts                 # entry
└── src/
    ├── App.tsx              # root + navigation
    ├── screens/             # Login, Chat, Voice, Files, Models, Settings
    ├── contexts/            # AuthContext
    ├── services/            # api.ts (REST client)
    ├── i18n/                # translations (ar/en/fr/de)
    ├── theme/               # colors, spacing, typography
    └── types/               # shared TS types
```

## 📜 License
MIT — part of the DRS AI platform.

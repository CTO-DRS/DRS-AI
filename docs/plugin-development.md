# 🔌 Plugin Development

DRS AI's plugin system lets you extend the platform without modifying core services. Plugins are loaded dynamically by the **Plugin System service** (port 3012) and run in a sandboxed environment.

## Plugin Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Plugin System Service (port 3012)            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐│
│  │  Plugin A    │    │  Plugin B    │    │  Plugin C    ││
│  │  (weather)   │    │  (Jira)      │    │  (translate) ││
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘│
│         │                    │                    │       │
│         └───── sandboxed require ──────────────────┘       │
│                           │                               │
│                  ┌────────▼────────┐                       │
│                  │ Plugin Sandbox │                       │
│                  │  (vm2 + restrict)                      │
│                  └────────┬────────┘                       │
│                           │                               │
│                  ┌────────▼────────┐                       │
│                  │ Plugin Manager │                       │
│                  └─────────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

## Plugin Structure

A DRS AI plugin is a directory containing:

```
my-plugin/
├── package.json          # Plugin metadata
├── index.js              # Entry point (CommonJS)
├── routes.js             # Express routes (optional)
├── hooks.js              # Lifecycle hooks (optional)
└── README.md            # Documentation
```

### `package.json`

```json
{
  "name": "drs-ai-weather",
  "version": "1.0.0",
  "description": "Weather plugin for DRS AI",
  "main": "index.js",
  "drs-ai": {
    "type": "plugin",
    "apiVersion": "1.0",
    "permissions": ["http:get:api.open-meteo.com"],
    "hooks": ["chat:before", "chat:after"]
  }
}
```

### `index.js`

```javascript
// Plugin entry point — exports a factory that receives the DRS AI context
module.exports = function (context) {
  const { logger, config, services } = context;

  logger.info('Weather plugin initializing');

  return {
    name: 'weather',
    version: '1.0.0',

    // Register hooks
    hooks: {
      'chat:before': async (message, user) => {
        // Detect weather queries
        if (/weather in (.+)/i.test(message)) {
          const city = message.match(/weather in (.+)/i)[1];
          logger.info(`Weather query for ${city}`);
        }
        return message; // pass through
      },

      'chat:after': async (response, user) => {
        // Post-process AI response
        return response;
      }
    },

    // Register custom routes
    routes: require('./routes'),

    // Lifecycle
    async start() {
      logger.info('Weather plugin started');
    },

    async stop() {
      logger.info('Weather plugin stopped');
    }
  };
};
```

### `routes.js`

```javascript
const express = require('express');
const router = express.Router();

router.get('/weather/:city', async (req, res) => {
  const city = req.params.city;
  // Plugin has permission for api.open-meteo.com
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=52.5&longitude=13.4&current=temperature`
  );
  const data = await response.json();
  res.json({ city, temperature: data.current.temperature });
});

module.exports = router;
```

## Plugin Manager API

### List plugins

```bash
curl http://localhost:3012/api/v1/plugins
```

Response:

```json
{
  "plugins": [
    {
      "id": "weather",
      "name": "drs-ai-weather",
      "version": "1.0.0",
      "status": "running",
      "loadedAt": "2026-09-23T10:00:00Z"
    }
  ]
}
```

### Install a plugin

```bash
curl -X POST http://localhost:3012/api/v1/plugins/install \
  -H "Content-Type: application/json" \
  -d '{
    "source": "npm",
    "name": "@cto-drs/weather",
    "version": "1.0.0"
  }'
```

Or from a git repo:

```bash
curl -X POST http://localhost:3012/api/v1/plugins/install \
  -H "Content-Type: application/json" \
  -d '{
    "source": "git",
    "url": "https://github.com/user/drs-ai-my-plugin",
    "branch": "main"
  }'
```

Or upload directly:

```bash
curl -X POST http://localhost:3012/api/v1/plugins/upload \
  -F "plugin=@my-plugin-1.0.0.tgz"
```

### Enable / Disable

```bash
# Enable
curl -X POST http://localhost:3012/api/v1/plugins/weather/enable

# Disable (keeps installed, just stops)
curl -X POST http://localhost:3012/api/v1/plugins/weather/disable
```

### Uninstall

```bash
curl -X DELETE http://localhost:3012/api/v1/plugins/weather
```

## Permissions

Plugins run in a sandboxed environment. They must declare the permissions they need:

| Permission | Format | Example |
|------------|--------|---------|
| HTTP GET | `http:get:host` | `http:get:api.open-meteo.com` |
| HTTP POST | `http:post:host` | `http:post:api.github.com` |
| File read | `fs:read:path` | `fs:read:/data/files` |
| File write | `fs:write:path` | `fs:write:/data/files` |
| DB query | `db:query` | — |
| Send chat | `chat:send` | — |
| Use GPU | `gpu:use` | — |

Permissions are granted by the user at install time:

```bash
curl -X POST http://localhost:3012/api/v1/plugins/install \
  -H "Content-Type: application/json" \
  -d '{
    "source": "npm",
    "name": "@cto-drs/weather",
    "version": "1.0.0",
    "grantPermissions": [
      "http:get:api.open-meteo.com",
      "http:get:geocoding-api.open-meteo.com"
    ]
  }'
```

## Lifecycle Hooks

Plugins can register hooks that fire at specific points:

| Hook | When | Args |
|------|------|------|
| `plugin:loaded` | Right after plugin is loaded | `context` |
| `plugin:starting` | Plugin is being started | — |
| `plugin:started` | Plugin finished starting | — |
| `plugin:stopping` | Plugin is being stopped | — |
| `plugin:stopped` | Plugin finished stopping | — |
| `chat:before` | Before chat message is sent to LLM | `message`, `user` |
| `chat:after` | After LLM response is generated | `response`, `user` |
| `chat:stream:token` | On each streamed token | `token`, `user` |
| `file:before:upload` | Before file is uploaded | `file` |
| `file:after:upload` | After file is uploaded | `file` |
| `workflow:before:run` | Before workflow execution | `workflow` |
| `workflow:after:run` | After workflow execution | `workflow`, `result` |

## Example: Building a Translation Plugin

### 1. Create the plugin

```bash
mkdir drs-ai-translate && cd drs-ai-translate
npm init -y
```

### 2. Edit `package.json`

```json
{
  "name": "drs-ai-translate",
  "version": "1.0.0",
  "main": "index.js",
  "drs-ai": {
    "type": "plugin",
    "apiVersion": "1.0",
    "permissions": ["http:post:translate.drs-ai.localhost:3040"],
    "hooks": ["chat:before"]
  }
}
```

### 3. Write `index.js`

```javascript
module.exports = (ctx) => {
  const { logger } = ctx;

  return {
    name: 'translate',
    version: '1.0.0',

    hooks: {
      'chat:before': async (message, user) => {
        // Auto-detect language and translate to user's preferred language
        if (user.preferences?.language && user.preferences.language !== 'en') {
          // Use the translate service (or Ollama for translation)
          const translated = await translate(message, user.preferences.language);
          logger.info(`Translated to ${user.preferences.language}: ${translated}`);
          return translated;
        }
        return message;
      }
    },

    routes: require('./routes'),

    async start() {
      logger.info('Translate plugin ready');
    }
  };
};

async function translate(text, targetLang) {
  // Implementation
  return text; // placeholder
}
```

### 4. Add routes (`routes.js`)

```javascript
const express = require('express');
const router = express.Router();

router.post('/translate', async (req, res) => {
  const { text, target } = req.body;
  // Implementation
  res.json({ translated: text });
});

module.exports = router;
```

### 5. Package & install

```bash
npm pack
# Creates: drs-ai-translate-1.0.0.tgz

curl -X POST http://localhost:3012/api/v1/plugins/upload \
  -F "plugin=@drs-ai-translate-1.0.0.tgz"
```

## Publishing Plugins

### To npm

```bash
npm publish
```

Users install with:

```bash
curl -X POST http://localhost:3012/api/v1/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"source":"npm","name":"drs-ai-translate","version":"1.0.0"}'
```

### To the DRS AI Plugin Marketplace (planned)

```bash
drs plugin publish
```

## Plugin SDK

For TypeScript development, install the SDK:

```bash
npm install --save-dev @cto-drs/plugin-sdk
```

```typescript
import { definePlugin } from '@cto-drs/plugin-sdk';

export default definePlugin({
  name: 'my-plugin',
  version: '1.0.0',

  hooks: {
    'chat:before': async (message, user) => {
      // ...
      return message;
    }
  }
});
```

## Security Considerations

- Plugins run in a **sandboxed VM** (vm2) — they cannot access the host filesystem or run arbitrary commands
- Plugins must declare **permissions** in advance — the user approves at install time
- Plugins cannot `require()` arbitrary Node.js modules — only a whitelist is available
- Plugin HTTP requests are **proxied through the gateway** so they can be logged and rate-limited
- Each plugin runs in its own **process** — a crash doesn't bring down the platform

## Debugging

Enable debug logging for a specific plugin:

```bash
curl -X POST http://localhost:3012/api/v1/plugins/weather/log-level \
  -H "Content-Type: application/json" \
  -d '{"level":"debug"}'
```

View logs:

```bash
docker compose logs plugin-system | grep "weather"
```

## Examples

See the [`examples/plugins/`](https://github.com/CTO-DRS/DRS-AI/tree/main/examples/plugins) directory for complete working examples:

- **weather** — fetch weather forecasts
- **jira** — create Jira tickets from chat commands
- **slack** — send messages to Slack channels
- **translate** — auto-translate based on user language
- **summarize** — summarize uploaded documents

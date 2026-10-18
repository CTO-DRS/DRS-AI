# self-awareness-service

**DRS AI Self-Awareness & Transparency Service - Digital health, epistemic uncertainty, transparency dashboard, and decision explanation engine**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3037` |
| Default version | `1.0.0` |

## Technology

- Language: JavaScript (Node.js, CommonJS)

Key runtime dependencies:

- `axios`
- `compression`
- `cors`
- `decimal.js`
- `express`
- `helmet`
- `ioredis`
- `lodash`
- `morgan`
- `swagger-jsdoc`
- `swagger-ui-express`
- `uuid`
- … and 1 more (see `package.json`)

## Scripts

| Script | Command |
| --- | --- |
| `start` | `node src/server.js` |
| `dev` | `node src/server.js` |
| `test` | `jest` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up self-awareness
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

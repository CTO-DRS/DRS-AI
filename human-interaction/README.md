# human-interaction-service

**DRS AI Human-Centric Interaction Service - AR, Dual-Brain UI, Smart Glasses, Voice-First**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3034` |
| Default version | `1.0.0` |

## Technology

- Language: JavaScript (Node.js, CommonJS)

Key runtime dependencies:

- `compression`
- `cors`
- `dotenv`
- `express`
- `fluent-ffmpeg`
- `helmet`
- `ioredis`
- `joi`
- `morgan`
- `prom-client`
- `swagger-jsdoc`
- `swagger-ui-express`
- … and 4 more (see `package.json`)

## Scripts

| Script | Command |
| --- | --- |
| `start` | `node src/server.js` |
| `dev` | `nodemon src/server.js` |
| `test` | `jest --coverage` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up human-interaction
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

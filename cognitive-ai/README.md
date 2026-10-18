# cognitive-ai-service

**DRS AI Cognitive AI Service - Evolving Persona & Visual Reasoning Engine**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3030` |
| Default version | `1.0.0` |

## Technology

- Language: JavaScript (Node.js, CommonJS)

Key runtime dependencies:

- `@qdrant/js-client-rest`
- `@xenova/transformers`
- `axios`
- `bcryptjs`
- `brain.js`
- `bull`
- `bullmq`
- `compression`
- `compromise`
- `cors`
- `dotenv`
- `express`
- … and 22 more (see `package.json`)

## Scripts

| Script | Command |
| --- | --- |
| `start` | `node src/server.js` |
| `dev` | `nodemon src/server.js` |
| `test` | `jest --coverage` |
| `test:watch` | `jest --watch` |
| `lint` | `eslint src/` |
| `docs` | `swagger-jsdoc -d swaggerDef.js src/routes/*.js -o swagger.json` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up cognitive-ai
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

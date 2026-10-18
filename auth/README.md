# drs-auth

**Authentication Service for DRS AI Platform**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3001` |
| Default version | `1.0.0` |

## Technology

- Language: TypeScript (compiled with `tsc`)

Key runtime dependencies:

- `bcryptjs`
- `cors`
- `crypto-js`
- `dotenv`
- `express`
- `express-validator`
- `helmet`
- `ioredis`
- `jsonwebtoken`
- `pg`
- `pg-hstore`
- `qrcode`
- … and 4 more (see `package.json`)

## Scripts

| Script | Command |
| --- | --- |
| `build` | `tsc` |
| `start` | `node dist/index.js` |
| `dev` | `ts-node-dev --respawn src/index.ts` |
| `migrate` | `node dist/database/migrate.js` |
| `seed` | `node dist/database/seed.js` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up auth
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

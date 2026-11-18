# quantum-security-service

**DRS AI Post-Quantum Security Service - Crystal-Kyber, Dilithium, Honeypot AI**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3032` |
| Default version | `1.0.0` |

## Technology

- Language: JavaScript (Node.js, CommonJS)

Key runtime dependencies:

- `@noble/ciphers`
- `@noble/hashes`
- `axios`
- `compression`
- `cors`
- `crypto-js`
- `dotenv`
- `express`
- `express-rate-limit`
- `geoip-lite`
- `helmet`
- `ioredis`
- … and 12 more (see `package.json`)

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
docker compose up quantum-security
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

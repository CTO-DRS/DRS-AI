# oauth-oidc-service

**DRS AI OAuth2 / OIDC Integration Service — Keycloak, Auth0, Google, GitHub, Azure AD, Okta**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3042` |
| Default version | `1.0.0` |

## Technology

- Language: JavaScript (Node.js, CommonJS)

Key runtime dependencies:

- `axios`
- `compression`
- `cors`
- `express`
- `helmet`
- `ioredis`
- `jose`
- `morgan`
- `uuid`
- `winston`

## Scripts

| Script | Command |
| --- | --- |
| `start` | `node src/server.js` |
| `dev` | `node src/server.js` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up oauth-oidc
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

# @cto-drs/hybrid-rag

**𝑫𝑹𝑺.𝑽𝑰𝑷. Hybrid RAG Engine - Vector + Full-text Search with Auto-Tagging**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3022` |
| Default version | `2.0.0` |

## Technology

- Language: TypeScript (compiled with `tsc`)

Key runtime dependencies:

- `@xenova/transformers`
- `axios`
- `compromise`
- `cors`
- `express`
- `flexsearch`
- `helmet`
- `ioredis`
- `lodash`
- `lunr`
- `natural`
- `onnxruntime-node`
- … and 6 more (see `package.json`)

## Scripts

| Script | Command |
| --- | --- |
| `build` | `tsc` |
| `start` | `node dist/index.js` |
| `dev` | `ts-node-dev --respawn src/index.ts` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up hybrid-rag
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

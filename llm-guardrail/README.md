# @cto-drs/llm-guardrail

**𝑫𝑹𝑺.𝑽𝑰𝑷. LLM Guardrail & WAF - Prompt Injection Protection & Output Filtering**

Part of the [DRS AI](https://github.com/CTO-DRS/DRS-AI-Web) platform — an enterprise, self-hosted AI operating system composed of 40+ microservices.

## Service Port

| Property | Value |
| --- | --- |
| Container port | `3021` |
| Default version | `2.0.0` |

## Technology

- Language: TypeScript (compiled with `tsc`)

Key runtime dependencies:

- `axios`
- `bad-words`
- `compromise`
- `compromise-paragraphs`
- `cors`
- `express`
- `helmet`
- `ioredis`
- `js-yaml`
- `jsonwebtoken`
- `lodash`
- `natural`
- … and 7 more (see `package.json`)

## Scripts

| Script | Command |
| --- | --- |
| `build` | `tsc` |
| `start` | `node dist/index.js` |
| `dev` | `ts-node-dev --respawn src/index.ts` |
| `test` | `tsc --noEmit` |

## Run

### Standalone

```bash
npm install
npm start
```

### Docker Compose (recommended)

```bash
docker compose up llm-guardrail
```

## Configuration

Environment variables are centralized in the repository-level `.env.example`. Copy it to `.env` and adjust values before starting the stack.

## Health

The service exposes liveness/readiness endpoints consistent with the platform convention (`/health`), used by the gateway, docker-compose healthchecks, and the CI smoke test.

## License

MIT — see the repository-level [LICENSE](../LICENSE).

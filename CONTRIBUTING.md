# Contributing to DRS AI 🤝

First off — thank you for taking the time to contribute! 🎉

DRS AI is a community-driven project, and every contribution matters. This document explains how to propose changes, report bugs, and add new services to the platform.

## 📑 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Pull Request Workflow](#pull-request-workflow)
- [Coding Standards](#coding-standards)
- [Adding a New Microservice](#adding-a-new-microservice)
- [Testing](#testing)
- [Commit Message Convention](#commit-message-convention)
- [Release Process](#release-process)

## Code of Conduct

Participation in this project is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/<your-username>/DRS-AI.git
   cd DRS-AI
   ```
3. **Add upstream** remote:
   ```bash
   git remote add upstream https://github.com/CTO-DRS/DRS-AI.git
   ```
4. **Install dependencies** for the service you want to work on:
   ```bash
   cd <service-name>
   npm install
   ```
5. **Run the service** in dev mode:
   ```bash
   npm run dev
   ```

## How to Contribute

### 🐛 Reporting Bugs

Open a [Bug Report issue](https://github.com/CTO-DRS/DRS-AI/issues/new?template=bug_report.yml). Please include:
- DRS AI version
- Service(s) involved (with port number)
- Steps to reproduce
- Expected vs. actual behavior
- Logs (use `LOG_LEVEL=debug` if needed)

### ✨ Suggesting Enhancements

Open a [Feature Request issue](https://github.com/CTO-DRS/DRS-AI/issues/new?template=feature_request.yml). Describe:
- The problem you're trying to solve
- The proposed solution
- Alternatives considered

### 🔧 Submitting Code

See the Pull Request Workflow below.

## Pull Request Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. **Make changes** following the coding standards below
3. **Test locally**:
   ```bash
   cd <service>
   npm install
   npm start  # verify it boots
   curl http://localhost:<port>/health
   ```
4. **Commit** using the [conventional commit format](#commit-message-convention)
5. **Push** to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
6. **Open a Pull Request** against `CTO-DRS/DRS-AI:main`
7. **Address review feedback** — push additional commits to the same branch
8. **A maintainer will merge** once CI passes and review is approved

### PR Checklist

Before submitting:
- [ ] Code follows the [coding standards](#coding-standards)
- [ ] Service boots without errors (`npm start`)
- [ ] Health endpoint responds (`GET /health`)
- [ ] No `console.log` in production code paths (use the logger)
- [ ] No secrets / API keys in code
- [ ] No `node_modules/` committed (check `.gitignore`)
- [ ] Updated relevant docs
- [ ] Commit messages follow the convention

## Coding Standards

### TypeScript / Node.js Services

- **Node.js ≥ 18** required
- **TypeScript strict mode** for `.ts` files
- **ES Modules** preferred where possible (`.ts` files)
- Use **`async`/`await`**, not callbacks
- Use the **built-in `fetch`** (Node ≥ 18), not `axios` for new code
- **Validate inputs** at the route boundary using express middleware or explicit checks
- **No `any`** in TypeScript — use `unknown` + narrowing if truly unknown

### File Structure (per microservice)

```
<service-name>/
├── Dockerfile
├── package.json
├── tsconfig.json (if TypeScript)
├── README.md
└── src/
    ├── server.ts          # entry point, express setup
    ├── utils/
    │   ├── logger.ts
    │   ├── errorHandler.ts
    │   └── redis.ts
    ├── routes/
    │   ├── health.ts
    │   └── <feature>.ts
    └── <feature-domain>/
        └── <Feature>Service.ts
```

### Logger Usage

Always use the winston logger, never `console.log`:

```typescript
import { logger } from '../utils/logger';

logger.info('User signed in', { userId });
logger.warn('Rate limit approaching', { remaining });
logger.error('Database connection failed', err);
```

### Error Handling

Use the central `asyncHandler` wrapper so unhandled promise rejections don't crash the process:

```typescript
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/foo', asyncHandler(async (req, res) => {
  if (!req.body.id) throw new AppError('id required', 400, 'MISSING_PARAM');
  // ...
}));
```

### Health Endpoints

Every service must implement three health endpoints:
- `GET /health` — full status with sub-service checks
- `GET /health/live` — liveness probe (process is alive)
- `GET /health/ready` — readiness probe (deps are ready)

### Environment Variables

- All env vars must have a sensible default (or fail loudly on boot)
- Document new env vars in `.env.example`
- Never commit real secrets

## Adding a New Microservice

To add service `<name>` on port `<PORT>`:

1. **Create the directory** under repo root:
   ```bash
   mkdir -p <name>/src/{utils,routes}
   ```
2. **Copy `package.json`** from an existing service (e.g., `self-healing`) and update `name`, `description`, `version`
3. **Copy `src/utils/`** from an existing service (logger, errorHandler, redis)
4. **Write `src/server.js`** (or `.ts`) — follow the structure of `self-healing/src/server.js`
5. **Add `Dockerfile`** — follow `self-healing/Dockerfile` as a template
6. **Update `docker-compose.yml`** — add the service block:
   ```yaml
   <name>:
     build: ./<name>
     ports:
       - "<PORT>:<PORT>"
     environment:
       - NODE_ENV=production
       - PORT=<PORT>
       - REDIS_HOST=redis
       - REDIS_PORT=6379
     depends_on:
       - redis
     networks:
       - drs-network
     restart: unless-stopped
   ```
7. **Update `README.md`** — add the service to the services table
8. **Update `k8s/helm/drs-ai/values.yaml`** — add the service to `platformServices` (or whichever tier)
9. **Update `TRANSFORMATION_PROGRESS.md`** — add a new phase entry
10. **Add `.env.example`** variables if your service uses any

## Testing

We use Jest for unit tests. Run tests for a single service:

```bash
cd <service>
npm test
```

End-to-end tests are run via `docker-compose`:

```bash
docker-compose up -d
# Wait for health checks
curl http://localhost:3000/health
# Run e2e tests (TBD)
```

## Commit Message Convention

We follow [Conventional Commits](https://conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting only (no code change)
- `refactor` — code change that neither fixes a bug nor adds a feature
- `perf` — performance improvement
- `test` — adding or fixing tests
- `chore` — build process, tooling, dependencies
- `ci` — CI/CD changes

### Scopes

Use the service or feature name as scope:
- `feat(self-awareness): add uncertainty feedback endpoint`
- `fix(gpu-acceleration): handle missing nvidia-smi gracefully`
- `docs(readme): update roadmap with phase 35`

### Subject

- Imperative mood: "add" not "added"
- Lowercase, no trailing period
- Max 72 chars in the subject line

## Release Process

1. Maintainers bump the version in `package.json` files
2. A `release/vX.Y.Z` branch is created
3. CHANGELOG.md is updated
4. A GitHub Release is published with tag `vX.Y.Z`
5. Docker images are built and pushed to `ghcr.io/cto-drs/drs-ai-<service>:X.Y.Z`

## Questions?

- 💬 Open a [Discussion](https://github.com/CTO-DRS/DRS-AI/discussions)
- 📧 Email: support@drs-ai.com
- 📱 Telegram: [@drs_ai](https://t.me/drs_ai)

Happy coding! 🚀

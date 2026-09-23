## 📝 Pull Request Description

<!-- Provide a clear description of what this PR does -->

### Type of change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Refactor / code cleanup
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test addition / improvement
- [ ] 🍱 New microservice / new port allocation
- [ ] 🚀 CI/CD / build tooling

### Related Issue

<!-- If this PR addresses an existing issue, link it here -->
Closes #

### Service(s) affected

<!-- Which services does this change touch? -->

### Changes Made

<!-- Bullet list of changes -->
-
-
-

### Screenshots / Recordings

<!-- If the change affects UI, include screenshots or a short recording -->

### Testing

- [ ] I ran the affected service locally (`npm start`)
- [ ] All health endpoints respond (`GET /health`, `/health/live`, `/health/ready`)
- [ ] I ran the unit tests (`npm test`) and they pass
- [ ] I tested with both `async` and `sync` code paths where applicable
- [ ] No `console.log` in production code paths
- [ ] No new ESLint warnings
- [ ] TypeScript types are correct (`npm run typecheck` if applicable)

### Backward Compatibility

- [ ] This change is backward compatible
- [ ] This change requires documentation update (I have updated the docs)
- [ ] This change requires a migration (described below)
- [ ] This change requires a `.env` variable addition (added to `.env.example`)

### Checklist

- [ ] My code follows the [coding standards](https://github.com/CTO-DRS/DRS-AI/blob/main/CONTRIBUTING.md#coding-standards)
- [ ] I have committed using the [conventional commit format](https://github.com/CTO-DRS/DRS-AI/blob/main/CONTRIBUTING.md#commit-message-convention)
- [ ] I have NOT committed any secrets, API keys, or `.env` files
- [ ] I have NOT committed `node_modules/`, `dist/`, or build artifacts
- [ ] I have updated `docker-compose.yml` if I added a new service
- [ ] I have updated `README.md` services table if needed
- [ ] I have updated `TRANSFORMATION_PROGRESS.md` if a new phase was added
- [ ] I have updated `k8s/helm/drs-ai/values.yaml` if a new service was added
- [ ] I have read the [Code of Conduct](https://github.com/CTO-DRS/DRS-AI/blob/main/CODE_OF_CONDUCT.md)

### Additional Notes

<!-- Anything else reviewers should know -->

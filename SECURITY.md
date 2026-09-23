# Security Policy 🔒

## Supported Versions

DRS AI is actively maintained on the `main` branch. Security fixes are backported to the most recent release only.

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | ✅ Active support  |
| < 1.0   | ❌ Not supported   |

## Reporting a Vulnerability

The DRS AI team takes security bugs seriously. We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

### How to Report

**Please DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities privately using one of these channels:

1. **GitHub Security Advisories** (preferred):
   - Go to https://github.com/CTO-DRS/DRS-AI/security/advisories/new
   - Click "Report a vulnerability"
   - Fill in the details

2. **Email**: CTO-DRS@users.noreply.github.com
   - Use the subject line: `[SECURITY] DRS AI - <short description>`
   - Include a PGP-encrypted report if possible (public key below)

3. **Telegram**: [GitHub Security Advisories](https://github.com/CTO-DRS/DRS-AI/security/advisories/new) (for initial contact only)

### What to Include in the Report

To help us triage and fix the issue quickly, please include:

- **Description** of the vulnerability and its impact
- **Affected service(s)** — service name and port (e.g. `gateway:3000`)
- **Step-by-step reproduction** including:
  - The exact HTTP request(s) or sequence
  - Required authentication level (anonymous / authenticated / admin)
  - Any tools used (curl, Postman, etc.)
- **Proof of concept** (script, code, or HTTP transcript)
- **Suggested fix** if you have one
- **Your name / GitHub handle** for credit (optional)

### Response Timeline

| Step | Target SLA |
|------|------------|
| Acknowledgment of receipt | 48 hours |
| Initial assessment | 5 business days |
| Status update | Every 7 days until resolved |
| Fix release | 30 days for high severity, 90 days for medium |
| Public disclosure | After fix is released, coordinated with reporter |

### Scope

The following are **in scope** for security reports:

- All DRS AI microservices (40 services on ports 3000-3043)
- Authentication / authorization bypasses
- SQL / NoSQL / command injection
- SSRF, XSS, CSRF, path traversal
- Privilege escalation (vertical or horizontal)
- Sensitive data exposure (logs, error messages, responses)
- Cryptographic weaknesses (insecure randomness, weak ciphers, etc.)
- Misconfigurations that lead to security issues

The following are **out of scope**:

- Self-hosted infrastructure you control (your Kubernetes cluster, your DB passwords)
- Reports from automated scanners without a working PoC
- Social engineering attacks against DRS AI team members
- Denial-of-service attacks (we accept DoS reports only if they require very low resources)
- Issues in dependencies — report directly to the upstream project
- Bypass of security controls if you already have admin/root access

### Bug Bounty

DRS AI is a community project and currently does not offer monetary rewards. However, reporters of accepted vulnerabilities will receive:

- Public credit in our security advisories (if desired)
- A place in our [SECURITY_HALL_OF_FAME.md](./SECURITY_HALL_OF_FAME.md)
- An invitation to our private security contributors channel

## Security Measures

DRS AI implements the following security measures across all services:

### Authentication & Authorization
- **JWT-based authentication** via the `auth` service (port 3001)
- **RBAC** (Role-Based Access Control) with admin / user / guest roles
- **OAuth2 / OIDC** integration via `oauth-oidc` service (port 3042) — Keycloak, Auth0, Google, GitHub, Azure AD, Okta
- **Token rotation** and refresh-token mechanism
- **Session management** with secure cookie settings

### Encryption
- **At-rest**: AES-256-GCM for OAuth tokens, sensitive logs
- **In-transit**: TLS 1.3 recommended (configure via nginx)
- **Post-quantum**: Kyber + Dilithium in `quantum-security` service (port 3032)
- **Key management**: Master key via env var, rotation supported

### Network Security
- **Security sandbox** for executing untrusted code (`security-sandbox` port 3020)
- **Network policy** support in the Helm chart (zero-trust internal traffic)
- **Rate limiting** at the API gateway
- **CORS** configured per-service

### Input Validation
- **LLM guardrail** (`llm-guardrail` port 3021) — prompt injection detection, content moderation, output filtering
- **Cybersecurity** (`cybersecurity` port 3015) — phishing detection, malware analysis, threat detection
- **Honeypot AI** (`quantum-security` port 3032) — pattern-based attack detection
- All API routes validate inputs at the boundary

### Audit & Compliance
- **Transparency Dashboard** (`self-awareness` port 3037) — accountability ledger, model cards, data lineage
- **Compliance** with GDPR, CCPA, Saudi NDMO
- **Right-to-be-forgotten** endpoint
- **Bias/fairness audit log**

### Container Security
- All Docker images run as **non-root users**
- **Read-only root filesystem** supported (set in Helm chart)
- **Distroless images** planned for future release
- **Image scanning** recommended (Trivy, Snyk)

## Deployment Hardening Checklist

When deploying DRS AI to production, make sure to:

- [ ] Set strong `JWT_SECRET` (≥ 32 bytes, generated via `openssl rand -hex 32`)
- [ ] Set strong `POSTGRES_PASSWORD` (≥ 16 chars)
- [ ] Set `OAUTH_MASTER_KEY` (32-byte hex string)
- [ ] Enable HTTPS via nginx with a valid certificate (Let's Encrypt / cert-manager)
- [ ] Enable NetworkPolicy in Kubernetes (`networkPolicy.enabled: true`)
- [ ] Use a private container registry
- [ ] Configure PodSecurityPolicy / Pod Security Standards
- [ ] Enable audit logging
- [ ] Restrict egress traffic at the network level
- [ ] Regularly update Docker images and dependencies
- [ ] Set up alerts for security incidents (via self-awareness service)
- [ ] Configure backup encryption for PostgreSQL
- [ ] Disable unused services in `docker-compose.yml` / Helm values

## Disclosure Policy

When we receive a security report, we will:

1. Confirm the vulnerability and determine its severity
2. Develop a fix in a private branch
3. Coordinate with the reporter on a disclosure timeline
4. Release a patched version
5. Publish a security advisory on GitHub
6. Credit the reporter (if desired)

## Contact

- 📧 Email: CTO-DRS@users.noreply.github.com
- 💬 Telegram: [GitHub Security Advisories](https://github.com/CTO-DRS/DRS-AI/security/advisories/new)
- 🐛 GitHub Security Advisories: https://github.com/CTO-DRS/DRS-AI/security/advisories/new

---

Thank you for helping keep DRS AI and its users safe! 🛡️

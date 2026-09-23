# 🔒 Security Documentation

Comprehensive guide to DRS AI's security architecture, hardening, and compliance.

## Threat Model

DRS AI is designed to be deployed **on-premise** in enterprise environments. The primary threat actors we defend against:

| Threat Actor | Motivation | Primary Defenses |
|--------------|------------|------------------|
| External attacker | RCE, data exfiltration | Network policy, rate-limiting, sandboxing |
| Malicious internal user | Privilege escalation | RBAC, audit logs, least privilege |
| Compromised plugin | Lateral movement | Plugin sandbox, permission system |
| Model attacker | Prompt injection, jailbreak | LLM Guardrail, content moderation |
| Quantum-capable adversary | Future decryption of stored data | Post-quantum crypto (Kyber, Dilithium) |
| Supply chain attacker | Dependency compromise | Dependabot, CodeQL, image scanning |

## Security Architecture

### Defense in Depth (5 layers)

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 5: Identity & Access                                   │
│   JWT + RBAC (admin/user/guest) + OAuth2/OIDC                │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Application Security                                │
│   Input validation · LLM Guardrail · Content moderation      │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Network Security                                    │
│   Rate limiting · CORS · NetworkPolicy · mTLS (optional)     │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Code Execution Security                            │
│   Plugin sandbox · Code interpreter (Docker isolation)      │
├─────────────────────────────────────────────────────────────┤
│ Layer 1: Cryptographic Security                              │
│   AES-256-GCM at rest · TLS 1.3 in transit · PQ signatures  │
└─────────────────────────────────────────────────────────────┘
```

### Layer 1: Cryptographic Security

| Where | What | Algorithm |
|-------|------|----------|
| OAuth tokens at rest | Encryption | AES-256-GCM |
| LLM API keys at rest | Encryption | AES-256-GCM |
| Hibernation state (ultra-efficiency) | Encryption | AES-256-GCM |
| Network traffic (recommended) | Transport | TLS 1.3 |
| Post-quantum signatures | Signing | Crystal-Dilithium |
| Post-quantum key exchange | KEM | Crystal-Kyber |
| User passwords | Hashing | bcrypt (cost 12) |
| JWT signing | Signing | HS256 (HMAC-SHA256) |

**Key management**:
- Master key via `OAUTH_MASTER_KEY` env var (32-byte hex)
- Auto-rotated every hour for hibernation state
- Kyber/Dilithium keys generated per service instance

### Layer 2: Code Execution Security

#### Code Interpreter (port 3014)

 Executes untrusted Python code in a Docker container with:
- No network access (network mode: none)
- Memory limit (default 512 MB)
- CPU limit (default 0.5 cores)
- Timeout (default 30 seconds)
- Read-only root filesystem
- Temp directory per execution

#### Security Sandbox (port 3020)

For more complex untrusted workloads:
- Syscall monitoring (seccomp filter)
- Network traffic monitoring
- Behavioral analysis engine (detects anomalous patterns)
- Per-process resource limits
- Automatic kill on policy violation

#### Plugin System (port 3012)

Plugins run in a sandboxed VM (vm2):
- Cannot `require()` arbitrary Node.js modules
- Cannot access filesystem outside whitelist
- Cannot make HTTP calls outside declared permissions
- Cannot spawn child processes
- Memory and CPU limits enforced

### Layer 3: Network Security

#### API Gateway (port 3000)

- Rate limiting: 100 RPM per IP (configurable via `RATE_LIMIT_RPM`)
- Request size limit: 10 MB default
- CORS: configurable per-origin
- Request logging: every request logged with method, path, status, latency, IP
- Response compression: gzip / brotli

#### Kubernetes NetworkPolicy

When deployed via Helm chart with `networkPolicy.enabled: true`:

```yaml
# Default: deny all ingress + egress
# Then allow only:
#   - Intra-namespace traffic between DRS AI services
#   - Egress to kube-dns for service discovery
#   - Egress to external HTTPS (if configured)
```

#### Service Mesh (recommended for production)

For mTLS between services, install Istio or Linkerd and apply sidecar injection.

### Layer 4: Application Security

#### Input Validation

Every route validates inputs at the boundary:
- Express middleware for body parsing with size limits
- Type checking for path/query parameters
- SQL parameterization (no string concatenation)
- Output encoding (Helmet sets CSP, XSS-Protection headers)

#### LLM Guardrail (port 3021)

Three-layer defense against LLM attacks:

1. **Prompt Injection Filter** — detects:
   - "Ignore previous instructions..."
   - "You are now in maintenance mode..."
   - Encoded/obfuscated injection attempts
   - Multi-language injection patterns

2. **Content Moderator** — detects:
   - Hate speech
   - Violence
   - Self-harm
   - Sexual content
   - PII (SSN, credit cards, emails, phone numbers)

3. **Output Filter** — prevents:
   - Disclosure of system prompts
   - Generation of executable code in chat (use code-interpreter instead)
   - Personally identifiable information

#### Cybersecurity Service (port 3015)

- URL phishing detection (heuristic + ML)
- File malware analysis (YARA rules)
- Log threat detection (anomaly detection)
- Password strength analysis (zxcvbn)

### Layer 5: Identity & Access

#### Authentication

Multiple authentication mechanisms supported:

1. **Local (default)**: username + password, bcrypt hashed
2. **OAuth2 / OIDC**: via `oauth-oidc` service (port 3042)
   - 6 built-in providers: Keycloak, Auth0, Google, GitHub, Azure AD, Okta
   - Authorization Code + PKCE flow
   - Encrypted token storage

#### Authorization (RBAC)

Three roles with cascading permissions:

| Permission | admin | user | guest |
|------------|-------|------|-------|
| Chat with LLM | ✅ | ✅ | ✅ (limited) |
| Upload files | ✅ | ✅ | ❌ |
| View own data | ✅ | ✅ | ✅ |
| List all users | ✅ | ❌ | ❌ |
| Manage services | ✅ | ❌ | ❌ |
| View audit log | ✅ | ❌ | ❌ |
| Right-to-be-forgotten | ✅ | ✅ | ✅ |

#### Session Management

- JWT access tokens (default 1 hour expiry)
- Refresh tokens (default 7 days)
- Session revocation via Redis blacklist
- Concurrent session limit (configurable)

## Compliance

### GDPR (EU General Data Protection Regulation)

✅ **User Rights** (all implemented via `self-awareness` service port 3037):
- **Access**: `GET /api/v1/transparency/user/:userId`
- **Rectification**: `POST /api/v1/transparency/user/:userId/correct`
- **Erasure** (right to be forgotten): `DELETE /api/v1/transparency/user/:userId`
- **Portability**: `GET /api/v1/transparency/user/:userId/export`
- **Objection**: `POST /api/v1/transparency/user/:userId/object`

✅ **Data minimization**: Only collect data needed for the service
✅ **Purpose limitation**: All data uses documented in model cards
✅ **Storage limitation**: Configurable retention (default 365 days)
✅ **Integrity & confidentiality**: AES-256 at rest, TLS 1.3 in transit
✅ **Accountability**: Immutable audit ledger

### CCPA (California Consumer Privacy Act)

✅ Right to know what data is collected
✅ Right to delete
✅ Right to opt-out of sale (we don't sell data)
✅ Right to non-discrimination

### Saudi NDMO (National Data Management Office)

✅ Aligns with Personal Data Protection Law (PDPL)
✅ Cross-border data transfer controls (data stays on-premise by default)
✅ Data classification framework support

### HIPAA (Health Insurance Portability and Accountability Act)

⚠️ **Not applicable by default** — DRS AI does not process Protected Health Information (PHI). If you use DRS AI in a healthcare context, additional controls are required (BAA, audit logging configuration, etc.).

### SOC 2 (Service Organization Control 2)

DRS AI's design supports SOC 2 Type II audit:
- Security: defense-in-depth
- Availability: HA deployment, health checks, failover
- Processing integrity: decision explanations, audit logs
- Confidentiality: encryption at rest and in transit
- Privacy: GDPR/CCPA/NDMO compliance

## Audit & Transparency

### Accountability Ledger

Every significant AI decision is recorded in an immutable, append-only ledger:

```bash
# View recent decisions
curl http://localhost:3037/api/v1/transparency/ledger?limit=50
```

Example entry:

```json
{
  "id": "evt-abc123",
  "timestamp": "2026-09-23T10:30:45Z",
  "type": "model_selection",
  "userId": "u-1",
  "details": {
    "selectedModel": "llama3.2:3b",
    "alternativesConsidered": ["qwen2:7b", "mistral:7b"],
    "reason": "Best score across capability, latency, cost"
  }
}
```

### Model Cards

Every LLM has a published model card:

```bash
curl http://localhost:3037/api/v1/transparency/models/llama3.2:3b/card
```

Includes: training data sources, intended use, limitations, ethical considerations.

### Bias & Fairness Audits

```bash
# Submit a bias audit
curl -X POST http://localhost:3037/api/v1/transparency/bias-audits \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama3.2:3b",
    "category": "gender",
    "metric": "demographic_parity",
    "value": 0.92,
    "sample_size": 1000
  }'

# View past audits
curl http://localhost:3037/api/v1/transparency/bias-audits
```

### Decision Explanations

Every AI decision can be explained in natural language:

```bash
# Why was model X selected?
curl -X POST http://localhost:3037/api/v1/explanations/model-selection \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello",
    "selectedModel": "llama3.2:3b",
    "candidates": ["llama3.2:3b", "qwen2:7b"],
    "scores": [0.85, 0.72]
  }'
```

Response:

```json
{
  "decision": "Selected model \"llama3.2:3b\"",
  "naturalLanguage": "Selected model \"llama3.2:3b\". Reason: Highest overall score (0.85) across capability, latency, and cost dimensions. Additional factors: Short prompt — favored smaller/faster models; Outperformed qwen2:7b by 0.13 points. Confidence: 85.0%."
}
```

## Hardening Checklist

### Pre-deployment

- [ ] Set strong `JWT_SECRET` (≥ 32 bytes, `openssl rand -hex 32`)
- [ ] Set strong `POSTGRES_PASSWORD` (≥ 16 chars)
- [ ] Set `OAUTH_MASTER_KEY` (32-byte hex string)
- [ ] Configure HTTPS via nginx with valid certificate
- [ ] Set `NODE_ENV=production` for all services
- [ ] Disable unused services in docker-compose.yml
- [ ] Set `LOG_LEVEL=info` (not `debug`) in production
- [ ] Configure CORS to specific origins (not `*`)
- [ ] Set up rate limiting appropriate to your traffic

### Network hardening

- [ ] Enable NetworkPolicy in Kubernetes
- [ ] Restrict egress traffic at firewall level
- [ ] Use private subnets for service-to-service traffic
- [ ] Set up WAF (Web Application Firewall) in front of gateway
- [ ] Configure DDoS protection (Cloudflare, AWS Shield)

### Container hardening

- [ ] Use distroless or slim base images (already default)
- [ ] Run containers as non-root user (already default)
- [ ] Enable read-only root filesystem where possible
- [ ] Set `allowPrivilegeEscalation: false` in Pod security context
- [ ] Use signed images (Cosign)
- [ ] Scan images for vulnerabilities (Trivy, Snyk, Grype)

### Operational

- [ ] Set up centralized log collection (ELK, Loki, Splunk)
- [ ] Configure alerting (Prometheus Alertmanager)
- [ ] Regular security patches (subscribe to CVE feeds)
- [ ] Periodic penetration testing
- [ ] Incident response plan documented
- [ ] Backup encryption verified
- [ ] Disaster recovery tested

### Compliance

- [ ] Review compliance posture: `GET /api/v1/transparency/compliance`
- [ ] Document data flows
- [ ] Configure data retention policy
- [ ] Train users on data handling
- [ ] Establish data protection officer (DPO) contact

## Vulnerability Disclosure

See [SECURITY.md](../SECURITY.md) for full policy.

**Summary**:
- Report vulnerabilities privately via [GitHub Security Advisories](https://github.com/CTO-DRS/DRS-AI/security/advisories/new)
- We respond within 48 hours
- We credit reporters in security advisories (if desired)

## Security Contact

- 📧 Email: CTO-DRS@users.noreply.github.com
- 💬 Telegram: [GitHub Security Advisories](https://github.com/CTO-DRS/DRS-AI/security/advisories/new)
- 🔒 PGP: contact for public key

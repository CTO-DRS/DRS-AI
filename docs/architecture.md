# 🏗️ Architecture

## Overview

DRS AI is a **microservices-first** Enterprise AI Operating System organized into **5 tiers**, with each tier serving a clear architectural role. The system is **fully self-hosted** — no cloud dependencies — and designed for **horizontal scalability** from a single node to a multi-region active-active cluster.

![Architecture Diagram](../assets/diagrams/architecture.svg)

## Tier 1: Clients

| Client | Tech | Purpose |
|--------|------|---------|
| **Web Frontend** | React + Vite + Tailwind + shadcn/ui | Primary browser-based UI (port 8080) |
| **Mobile App** | React Native + Expo | Android, iOS, Web from one codebase |
| **Desktop App** | Electron | macOS, Windows, Linux native wrapper |
| **CLI** | TypeScript (Commander.js) | Scripting & automation |
| **Telegram Bot** | Telegraf | Chat via Telegram |

All clients talk to the platform via the **API Gateway** (port 3000) using REST + Server-Sent Events for streaming responses. JWT bearer tokens authenticate every request.

## Tier 2: Gateway & Auth

The gateway tier is the single entry point for all external traffic:

- **API Gateway** (port 3000) — routing, rate-limiting (token bucket), CORS, request logging, response compression. Forwards auth header to downstream services.
- **Auth Service** (port 3001) — JWT issuance, refresh tokens, RBAC (admin / user / guest roles), session management, audit log.
- **Self-Awareness Service** (port 3037) — passive observer. Logs every decision (model selection, routing, content filtering, security) into an immutable accountability ledger.

### Authentication Flow

```
Client → POST /api/auth/login { username, password }
       ← { token: JWT, refreshToken, expiresIn, user }
       → Subsequent requests carry Authorization: Bearer <token>
       → Gateway verifies JWT via Auth Service public key
       → Forwards request to downstream service with X-User-Id header
```

## Tier 3: AI OS Services

This tier contains the **business-logic services** that make DRS AI an "operating system" rather than a chatbot:

### LLM & Orchestration

- **Model Router** (3002) — selects best LLM per request based on prompt complexity, language, model capabilities, current load. Supports Ollama models out-of-the-box.
- **Agent Orchestrator** (3003) — coordinates multiple AI agents:
  - `ChatAgent` — general Q&A
  - `CodeAgent` — code generation & debugging
  - `FileAgent` — file analysis & manipulation
  - `BuilderAgent` — app generation
  - `ReasoningAgent` — multi-step reasoning (chain-of-thought)
  - `AutomationAgent` — scheduled tasks

### Memory & RAG

- **Memory Service** (3004) — vector DB with pgvector for semantic search. Stores conversation history, user preferences, knowledge base.
- **Advanced Memory** (3016) — context compression, hierarchical memory layers (short-term / working / long-term).
- **Hybrid RAG** (3022) — combines vector search (pgvector) with full-text search (PostgreSQL tsvector) for hybrid retrieval. Includes document processor + auto-tagging.

### Files & Voice

- **Files Service** (3005) — uploads via MinIO object storage. Document processing (PDF, DOCX, TXT). Image processing (Sharp).
- **Voice Service** (3006) — Whisper STT (via Ollama) + Piper TTS. Bilingual Arabic + English.

### Automation

- **Workflow Engine** (3011) — visual workflows via ReactFlow on frontend. Cron triggers, event triggers. Action types: ai_generate, http_call, send_message, run_code.
- **Plugin System** (3012) — dynamic plugin loading. Plugins run in isolated sandboxes (vm2 + restricted require).
- **Auto Agent** (3013) — autonomous agents that react to system events (file uploaded, error occurred) or run on schedule.
- **Code Interpreter** (3014) — Python execution via isolated Docker container. Resource limits (memory, CPU, timeout).
- **Auto Builder** (3018) — generates complete applications from natural-language descriptions. Outputs React + Express + Prisma code.

### Security

- **Cybersecurity** (3015) — URL phishing detection, file malware analysis, log threat detection, password strength scoring.
- **LLM Guardrail** (3021) — input filters (prompt injection detection, PII detection, jailbreak attempts) + output filters (PII redaction, toxicity scoring, content moderation policy enforcement).
- **Security Sandbox** (3020) — Docker-based isolation for executing untrusted code. Syscall monitoring, network policy enforcement, behavioral analysis engine.
- **Quantum Security** (3032) — Crystal-Kyber KEM (post-quantum key exchange), Dilithium signatures, AI-powered honeypot, real-time threat detection.

### Multi-lingual & Localization

- **Cultural Localization** (3036) — Arabic dialect support (Moroccan, Gulf, Egyptian, Levantine), full RTL pipeline, cultural context awareness (prayer times, Islamic calendar, regional customs).

## Tier 4: Global Platform Services

These services are unique to DRS AI and elevate it from "chat app" to "operating system":

### Cognitive AI (3030)

Evolving persona engine — tracks 16-dimensional user persona vectors over time, with drift detection and archetype classification (8 types). User embedding service uses Xenova Transformers + Qdrant for behavioral pattern recognition. Meta-learning orchestrator implements MAML-style few-shot learning for rapid domain adaptation.

### Web3 Mesh (3031)

Decentralized storage and compute via IPFS + libp2p. Agent contracts on Ethereum for verifiable AI agent reputation. Federated agent mesh for cross-organization collaboration.

### Ultra Efficiency (3033)

Smart hibernation of idle services (Intel SGX / AMD SEV secure enclaves). Model distillation pipeline (70B → 3B) with progressive quantization (FP16 → INT8 → INT4). Resource budgeting with auto-scaling.

### Human Interaction (3034)

AR service with object recognition + OCR overlay. Dual-brain service (analytical left vs creative right). Voice-first with wake-word detection. Gesture recognition (13 hand gestures, 4 head gestures). Smart glasses integration (Ray-Ban Meta).

### Self-Healing (3035)

Self-coding service detects 8 bug patterns (undefined vars, null deref, memory leaks, race conditions, infinite loops, unhandled promises, SQL injection, XSS). Code telepathy reads intent from comments/partial code. Auto-PR service generates pull requests with AI-written descriptions. Evolution tracker takes hourly codebase snapshots.

### Self-Awareness (3037)

The "conscience" of the platform. 4 sub-services:
1. **Digital Health** — continuous monitoring of all 40 microservices (heartbeat, latency, error rate, incidents)
2. **Epistemic Uncertainty** — confidence scoring per AI output (aleatoric + epistemic uncertainty)
3. **Transparency Dashboard** — accountability ledger, model cards, data lineage, compliance posture (GDPR/CCPA/Saudi NDMO)
4. **Decision Explanation** — natural-language explanations for every AI decision (6 categories)

### GPU Services (3038, 3043)

- **GPU Acceleration** (3038) — CUDA metrics polling, VRAM allocation tracking with LRU eviction, offload manager with 4 policies (always_gpu / prefer_gpu / adaptive / cpu_only)
- **GPU MIG** (3043) — NVIDIA MIG partitioning for Ampere/Hopper GPUs (13 profiles from 1g.5gb to 7g.40gb) + time-slicing for non-MIG GPUs with fairness tracking (60s rolling window)

### Distributed Systems (3039, 3040, 3041)

- **Distributed Deployment** (3039) — node registry, task router with 4 strategies (round_robin / least_loaded / capacity_first / affinity), cluster manager with failover + drain
- **Federated Learning** (3040) — participant manager, model aggregator (FedAvg / FedProx / FedSGD), secure aggregation via Bonawitz pairwise masking protocol
- **Multi-Region Replication** (3041) — region manager, replication engine (async / sync / quorum), conflict resolver (LWW / vector_clock / merge)

### OAuth2 / OIDC (3042)

Provider registry with 6 built-in providers (Keycloak, Auth0, Google, GitHub, Azure AD, Okta). Token store with AES-256-GCM at-rest encryption. Authorization Code + PKCE (RFC 7636) flow.

## Tier 5: Infrastructure

The foundation layer:

| Component | Image | Port | Purpose |
|-----------|-------|------|---------|
| PostgreSQL | `ankane/pgvector:latest` | 5432 | Relational DB + vector storage |
| Redis | `redis:7-alpine` | 6379 | Cache + pub/sub + session store |
| Ollama | `ollama/ollama:latest` | 11434 | Local LLM inference runtime |
| MinIO | `minio/minio:latest` | 9000, 9001 | Object storage (S3-compatible) |
| Qdrant | `qdrant/qdrant:latest` | 6333, 6334 | Vector database (used by cognitive-ai) |
| Nginx | `nginx:alpine` | 80, 443 | Reverse proxy / load balancer |
| Prometheus | `prom/prometheus:latest` | 9090 | Metrics collection |
| Grafana | `grafana/grafana:latest` | 3008 | Dashboards |

## Cross-Cutting Concerns

### Logging

Every service uses **Winston** with the same JSON log format. Logs are sent to stdout (Docker captures them via `docker logs`) and optionally to a central ELK/Loki stack.

```json
{
  "timestamp": "2026-09-23T12:34:56.789Z",
  "level": "info",
  "message": "User signed in",
  "service": "auth-service",
  "userId": "abc123"
}
```

### Health Checks

Every service exposes 3 endpoints:
- `GET /health` — full status with sub-service checks (200 healthy, 503 degraded)
- `GET /health/live` — liveness probe (process is alive)
- `GET /health/ready` — readiness probe (deps are ready)

### Configuration

12-factor app methodology:
- All configuration via environment variables
- `.env.example` committed as documentation
- Real secrets via Kubernetes secrets, Docker secrets, or external secret managers (Vault, AWS Secrets Manager)
- Per-service env vars documented in service's `README.md`

### Observability

- **Metrics**: Prometheus scrapes `/metrics` (or equivalent) on every service every 15s
- **Tracing**: OpenTelemetry-compatible (planned)
- **Audit**: every AI decision logged to the self-awareness service's accountability ledger

## Design Principles

1. **Microservices, not monolith** — each service has one job, can be deployed/scaled independently
2. **Defensive by default** — services fail closed (security-wise) and degraded (functionally)
3. **Self-hostable** — no cloud dependencies, no telemetry to vendor
4. **Polyglot persistence** — use the right DB for the job (Postgres for relations, Redis for cache, Qdrant for vectors, MinIO for blobs)
5. **Convention over configuration** — sensible defaults everywhere
6. **Fail loudly** — never silently swallow errors; always log + propagate
7. **Document everything** — every service has README, every endpoint is in Swagger
8. **Security is not optional** — auth, rate-limiting, input validation, sandboxing built-in from day one

## Sequence Diagrams

### Chat Request Flow

See [`request-flow.svg`](../assets/diagrams/request-flow.svg) for the full request lifecycle.

### Multi-Region Replication

```
[Client in KSA]
    → writes to local gateway
    → Replication Engine replicates to EU & US regions (async mode)
    → Each peer ingests the write
    → If concurrent writes occur, Conflict Resolver applies LWW/vector_clock policy
    → All regions converge within seconds (async) or synchronously (sync/quorum)
```

### Federated Learning Round

```
1. Coordinator POSTs /api/v1/fl/rounds → secure context created
2. Each participant computes local model update on private data
3. Each participant POSTs /api/v1/fl/participants/:id/updates (encrypted weights)
4. Coordinator POSTs /api/v1/fl/rounds/:id/aggregate
5. Secure Aggregation Service applies pairwise masks
6. Coordinator receives only the sum of masked updates (masks cancel)
7. Individual participant updates are NEVER revealed to coordinator
```

## Capacity Planning

| Component | Min | Recommended (small) | Recommended (medium) | Large enterprise |
|-----------|-----|---------------------|----------------------|------------------|
| RAM | 4 GB | 8 GB | 16 GB | 64 GB+ |
| CPU | 2 cores | 4 cores | 8 cores | 32+ cores |
| Disk | 20 GB | 100 GB | 500 GB | 5 TB+ |
| GPU | None | None or 8GB | 24 GB (RTX 3090) | 80 GB (A100) |
| Services enabled | 5 | 15 | 30 | 40+ |

## See Also

- [API Reference](./api-reference.md)
- [Deployment Guide](./deployment.md)
- [Security](./security.md)

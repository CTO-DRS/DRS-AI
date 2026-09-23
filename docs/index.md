# DRS AI 🤖

<div class="drx-hero" markdown>

# **DRS AI**

**Enterprise AI Operating System**

40+ microservices · Self-hosted · 100% offline · Multilingual

![DRS AI Banner](../assets/banners/banner.svg)

</div>

<div class="drx-badges" markdown>

[![Version](https://img.shields.io/badge/version-1.0.0-6366f1?style=flat-square)](https://github.com/CTO-DRS/DRS-AI/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](https://github.com/CTO-DRS/DRS-AI/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/CTO-DRS/DRS-AI/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/CTO-DRS/DRS-AI/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/github/actions/workflow/status/CTO-DRS/DRS-AI/docker.yml?branch=main&style=flat-square&label=Docker)](https://github.com/CTO-DRS/DRS-AI/actions/workflows/docker.yml)
[![Services](https://img.shields.io/badge/services-40+-8b5cf6?style=flat-square)](https://github.com/CTO-DRS/DRS-AI)
[![API endpoints](https://img.shields.io/badge/API%20endpoints-400+-10b981?style=flat-square)](https://github.com/CTO-DRS/DRS-AI/blob/main/docs/api-reference.md)

</div>

---

## 🎯 What is DRS AI?

DRS AI is a comprehensive, **locally-hosted AI Operating System** built on microservices architecture with **40+ integrated services**. It provides a complete enterprise AI solution without requiring internet connectivity or cloud dependencies.

### Why DRS AI?

<div class="drx-grid" markdown>

<div class="drx-card" markdown>

### 🏠 100% On-Premise

No cloud dependencies, no data leaves your network. Deploy in air-gapped environments.

</div>

<div class="drx-card" markdown>

### 🔒 Privacy-First

GDPR / CCPA / Saudi NDMO compliant by design. Every AI decision is audited and explainable.

</div>

<div class="drx-card" markdown>

### 🧠 Multi-Model

Supports any LLM via Ollama — Llama, Qwen, Mistral, Phi, Gemma, and more.

</div>

<div class="drx-card" markdown>

### 🌍 Multilingual

Arabic (full RTL), English, French, German UI with instant language switching.

</div>

<div class="drx-card" markdown>

### 🚀 Production-Ready

Kubernetes Helm chart with HPA, PDB, NetworkPolicy, and monitoring baked in.

</div>

<div class="drx-card" markdown>

### 🔐 Secure by Default

Post-quantum crypto, LLM guardrails, sandboxed code execution, RBAC auth.

</div>

<div class="drx-card" markdown>

### 📊 Self-Aware

Every AI decision is logged, explained, and auditable. Includes uncertainty quantification.

</div>

<div class="drx-card" markdown>

### 🌐 Multi-Region

Active-active replication across regions with vector-clock conflict resolution.

</div>

<div class="drx-card" markdown>

### 🤖 Federated Learning

Train across organizations without sharing raw data. Includes secure aggregation.

</div>

</div>

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/CTO-DRS/DRS-AI.git
cd DRS-AI

# Configure
cp .env.example .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env

# Start all services
docker compose up -d

# Pull a default LLM model
docker compose exec ollama ollama pull llama3.2:3b

# Access the UI
open http://localhost:8080  # admin / admin
```

📖 **Full guide**: [Quick Start](quick-start.md)

---

## 🏗️ Architecture

![Architecture](../assets/diagrams/architecture.svg)

DRS AI is organized into **5 tiers**:

1. **Clients** — Web, Mobile, Desktop, CLI, Telegram Bot
2. **Gateway** — API Gateway + Auth + Self-Awareness
3. **AI OS Services** — Router, Orchestrator, Memory, Files, Voice, Workflow, Plugins
4. **Global Platform Services** — Cognitive AI, Quantum Security, FL, Multi-Region, OAuth, GPU MIG
5. **Infrastructure** — PostgreSQL+pgvector, Redis, Ollama, MinIO, Qdrant

📖 **Deep dive**: [Architecture](architecture.md)

---

## 📊 Stats

| Metric | Value |
|--------|-------|
| Microservices | 40 |
| Clients | 2 (mobile + desktop) |
| Helm charts | 1 |
| Total components | 43 |
| Lines of code | ~100,000 |
| API endpoints | 400+ |
| Languages | Arabic, English, French, German |
| Compliance | GDPR, CCPA, Saudi NDMO |
| Federated Learning strategies | 3 (FedAvg, FedProx, FedSGD) |
| GPU offload policies | 4 |
| GPU sharing modes | 2 (MIG + time-slicing) |
| Task routing strategies | 4 |
| Replication modes | 3 (async, sync, quorum) |
| OAuth providers | 6 (Keycloak, Auth0, Google, GitHub, Azure AD, Okta) |
| MIG profiles | 13 |

---

## 📚 Documentation

- 🚀 [Quick Start](quick-start.md) — running in 5 minutes
- 🏗️ [Architecture](architecture.md) — 5-tier deep dive
- 🚢 [Deployment](deployment.md) — Docker, K8s, multi-region, Termux
- 🔌 [API Reference](api-reference.md) — all 400+ endpoints
- 🧩 [Plugin Development](plugin-development.md) — extend the platform
- 🔒 [Security](security.md) — threat model, hardening, compliance
- 🛠️ [Troubleshooting](troubleshooting.md) — common issues solved
- 🔄 [Changelog](https://github.com/CTO-DRS/DRS-AI/blob/main/CHANGELOG.md) — version history

---

## 🤝 Community

- 💬 [GitHub Discussions](https://github.com/CTO-DRS/DRS-AI/discussions) — questions & ideas
- 🐛 [Issues](https://github.com/CTO-DRS/DRS-AI/issues) — bug reports & feature requests
- 🔒 [Security Advisories](https://github.com/CTO-DRS/DRS-AI/security/advisories/new) — report vulnerabilities
- 🌐 [Homepage](https://drs.xo.je)
- 📧 [Email](mailto:CTO-DRS@users.noreply.github.com)

---

## 📄 License

DRS AI is licensed under the [MIT License](https://github.com/CTO-DRS/DRS-AI/blob/main/LICENSE).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/CTO-DRS">CTO.DRS</a>
</p>

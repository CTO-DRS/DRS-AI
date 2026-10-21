# Changelog

All notable changes to **DRS AI** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added — drSai-parity upgrades (agent framework capabilities merged from OpenDrSai)

#### Orchestrator v2 — agent teams, planning, HITL & MCP
- **Multi-agent Teams** (`POST /api/v1/teams`) — drSai group-chat engine parity:
  `round_robin` and `selector` (LLM speaker-selection) strategies, per-round transcript
  persistence, `TERMINATE` phrase auto-termination, max-rounds ceiling, cooperative run
  stop, full run history in Postgres.
- **LLM Task Planner** (`POST /api/v1/tasks/:id/plan`) — decomposes a task into
  agent-typed steps (drSai TaskPlanner), draft → approve → execute lifecycle,
  subtask execution with plan context, result aggregation.
- **Human-in-the-loop Approvals** (`/api/v1/approvals`) — drSai approval_guard parity:
  tasks/plans/MCP tool calls can park in `awaiting_approval` until a user decides;
  24h expiry sweep; approve → auto-resume execution.
- **MCP client** (`/api/v1/mcp`) — Model Context Protocol support for `stdio` and
  `http` transports (JSON-RPC 2.0, initialize/tools/list/tools/call), server registry,
  tool cache, connection probe, optional approval gating on tool calls.
- **Durable persistence** — tasks/teams/plans/approvals/MCP servers mirrored to
  Postgres (Redis stays the hot queue); automatic task recovery on restart;
  Redis-miss fallback reads.
- **Agent knowledge memory** (`/api/v1/knowledge`, drSai ListMemory/RAGFlowMemory
  parity) — text/Markdown ingestion with paragraph-aware chunking (~1200 chars,
  150 overlap), BM25-lite multilingual retrieval (Unicode tokenization incl.
  Arabic, IDF weighting, exact-substring boost), per-document enable/disable,
  retrieval preview endpoint; retrieved chunks are injected into team-run system
  context (drSai `memory=[...]` pattern) and counted in run metadata.
- **Keyless web search tool** (`/api/v1/tools/web-search`, drSai web_search/
  deepsearch parity) — DuckDuckGo HTML scraping (no API key), result titles/
  snippets/URLs with DDG-redirect resolution, HTML entity decoding, graceful
  degradation (runs continue when the network is unavailable),
  `WEB_SEARCH_ENABLED`/`WEB_SEARCH_REGION` env controls; opt-in per team run.
- **Structured output** (drSai structured_output parity) — `jsonOutput` run flag
  instructs the first speaker to converge on a single JSON object; the final
  result is JSON-extracted (direct parse → fenced block → balance scan) and
  stored in run `meta.structured`.

### Added — drSai round-3 upgrades (A2A, file ingestion, real voice)

#### Orchestrator — A2A protocol (Agent-to-Agent, drSai A2A parity)
- **Remote peer registry** (`/api/v1/a2a/agents`) — register A2A-compatible
  agent servers, probe their `/.well-known/agent.json` card (cached, with
  reachability status), enable/disable, delete.
- **Outbound messaging** (`POST /api/v1/a2a/message`) — JSON-RPC 2.0
  `message/send` with A2A wire format (`params.message.parts[].kind='text'`),
  task-state normalization (submitted/working/completed/failed), text
  extraction from artifacts/history/status messages, request timeouts,
  `a2a.message` events on the WS hub.
- **Inbound delegation** (`POST /api/v1/a2a/inbox`)
  — external A2A clients can delegate into a local team run; the result is
  returned in A2A task shape so generic clients keep working.
- **Local agent card** (`GET /.well-known/agent.json` on the orchestrator,
  `A2A_PUBLIC_URL` env) — the platform is itself discoverable as an A2A
  server advertising team-run/knowledge-search/web-search skills.
- Frontend: new **A2A Peers** tab in the Agents console (register, probe,
  delete, message with response viewer) fully localized in ar/en/fr/de.

#### Orchestrator — knowledge file ingestion (RAG upgrade)
- **File upload** (`POST /api/v1/knowledge/documents/upload`, multipart,
  10 MB) — dependency-free text extraction for txt/md/csv/tsv/json/yaml/
  html/xml/logs and 20+ code formats, plus **PDF text extraction** via zlib
  inflate on FlateDecode streams + BT/ET text-operator parsing (clear 422
  error for scanned/image PDFs); HTML tag/entity stripping; ingest path is
  identical to pasted docs (chunk → BM25 index → team-run injection).
- Frontend Knowledge page: **upload button + drag-and-drop** with chunk
  count feedback, localized in all four languages.

#### Voice — real voice loop (drSai voice parity, keyless-first)
- **Browser Web Speech path** (keyless default): live `SpeechRecognition`
  with interim results in ar/en/fr/de, `speechSynthesis` TTS with voice
  matching, session history (heard/spoken) with replay.
- **Server path** (when configured): voice service `/stt` proxies to any
  OpenAI-compatible `/v1/audio/transcriptions` (Whisper) and `/tts` to
  `/v1/audio/speech` (tts-1) via `STT_BASE_URL/STT_API_KEY/STT_MODEL` and
  `TTS_BASE_URL/TTS_API_KEY/TTS_MODEL/TTS_VOICE` env; descriptive 501 when
  unconfigured; `GET /voice/capabilities` lets the UI pick the best path.

#### Model Router — multi-provider fallback chain
- **Provider presets** (drSai provider_presets parity): OpenAI, Anthropic, DeepSeek,
  OpenRouter, Gemini (OpenAI-compatible), Groq, custom — `GET/POST/DELETE /api/v1/providers`,
  connection test with model-list cache (`POST /api/v1/providers/:id/test`).
- **Automatic fallback**: Ollama first; on failure/missing model, route to the first
  enabled provider serving the model (or explicit `provider/model` syntax).
  Works for both streaming and non-streaming chat/generate.

#### Auth — API keys (machine-to-machine)
- `drsk_...` API keys (SHA-256 stored, prefix display, scopes, expiry, revoke) —
  `POST/GET/DELETE /api/v1/auth/apikeys` + internal `/apikeys/validate`.
- Gateway accepts `X-API-Key` on any protected route with a 60s validation cache.

#### Gateway — real-time event hub
- **WebSocket hub** (`/ws`) replaces the echo stub: Redis pub/sub fan-out of
  orchestrator events (tasks, approvals, plan progress, team transcripts) to
  authenticated clients (JWT via `?token=` or `auth` message), heartbeat liveness.
- SSE-safe compression filter (streams no longer buffered); `X-API-Key` CORS header.
- **Env fixes**: proxy now honors `ROUTER_SERVICE_URL`/`ORCHESTRATOR_URL`; DB/Redis
  env aliases fixed across auth/orchestrator/memory/gateway (docker deployment bug).

#### Skills service (NEW, port 3044)
- **SKILL.md convention** (drSai Skills Square parity): upload `.tar.gz`/`.zip`/inline
  skill packages with YAML frontmatter (name/description/version/tags/author),
  catalog search by tag/query/owner, download as tar.gz, share tokens (7-day),
  tags index, usage stats, and `GET /api/v1/skills/:id/context` for agent prompt
  injection. Path-traversal-safe extraction; boot-time re-index from disk.

#### Frontend
- **i18n + RTL**: ar/en/fr/de with instant switching, RTL layout for Arabic,
  localized nav/auth/chat/header.
- **Streaming chat**: SSE token streaming with Stop button and graceful
  non-streaming fallback; Markdown rendering (GFM: code blocks, tables, links).
- **Agent Teams console** (`/agents`): new page managing orchestrator v2 —
  create/run/stop/delete teams (round-robin & selector strategies, agent picker),
  recent-run transcripts, HITL approval inbox (approve/reject with pending badge),
  and MCP server registry (stdio/http add, connection test, tool discovery).
- **Knowledge Base page** (`/knowledge`): document ingestion (paste text/
  Markdown, live size meter), metadata list with chunk counts, enable/disable
  switches, delete, and a retrieval preview that shows exactly which chunks a
  query would surface (score-labeled) — localized in all 4 languages.
- **Run enrichment options**: the team-run dialog gains Knowledge-memory /
  Web-search / JSON-output toggles; run cards show badges for retrieved memory
  chunks, web result counts and structured-JSON results.
- **Chat UX upgrades**: per-message copy button, one-click Markdown export of the
  conversation, multiline auto-resizing composer (Enter to send, Shift+Enter for
  newline), and localized suggested-prompt chips on the empty state.
- **Login & Settings fully localized** in all 4 languages; Settings language
  selector now wired to the live i18n provider (persists + RTL flip).
- **Route-level code splitting** (`React.lazy` + `Suspense`): initial bundle
  reduced from ~785 kB to ~500 kB (−36 %); every page loads on demand.
- **Live events (WebSocket)**: the frontend connects to the gateway WS hub
  (`/ws`, JWT `?token=` auth, auto-reconnect with capped backoff, client
  keepalive). High-signal events surface as localized toasts (approval
  requested, team run completed/failed, plan completed); every event is
  re-broadcast to the app, and the Agents console auto-refreshes its
  approval inbox and run list in real time.
- **Voice input in chat**: mic button records audio (MediaRecorder), sends it
  to the voice service STT endpoint and inserts the transcript into the
  composer (recording pulse state, mic-release on stop/unmount, localized
  errors).
- **Regenerate reply**: re-runs the last user prompt (drops the previous
  assistant reply, shares the same streaming + fallback path) via a hover
  action on the trailing message.
- **Conversation search**: instant client-side filter over the sidebar
  conversation list.

### Planned
- Multi-cloud federation (AWS / GCP / Azure)
- GPU multi-tenant quota with billing
- Edge / IoT gateway service

## [1.0.0] — 2026-09-23

### 🎉 Initial Release

First public release of DRS AI — Enterprise AI Operating System with 40+ microservices.

### Added — Core (Phases 1-21)

#### Core Infrastructure (4)
- **PostgreSQL** + pgvector — vector database
- **Redis** — caching & pub/sub
- **Ollama** — local LLM inference runtime
- **Nginx** — reverse proxy & load balancer

#### Core Services (8) — Ports 3000-3007
- **Gateway** (3000) — API gateway with routing, rate-limiting, auth
- **Auth** (3001) — JWT + RBAC authentication with session management
- **Model Router** (3002) — LLM routing & management
- **Agent Orchestrator** (3003) — multi-agent coordination (Code, File, Reasoning, Builder, Chat, Automation agents)
- **Memory** (3004) — vector database & RAG
- **Files** (3005) — file processing & MinIO storage
- **Voice** (3006) — speech-to-text & text-to-speech
- **Dashboard** (3007) — admin dashboard & metrics

#### AI OS Services (9) — Ports 3010-3018
- **Telegram Bot** (3010) — full-featured Telegram integration
- **Workflow Engine** (3011) — visual workflow builder with cron scheduling
- **Plugin System** (3012) — dynamic plugin loading with sandboxed execution
- **Auto Agent** (3013) — event-driven and scheduled autonomous agents
- **Code Interpreter** (3014) — safe Python code execution
- **Cybersecurity** (3015) — phishing detection, malware analysis, threat detection
- **Advanced Memory** (3016) — enhanced RAG with context compression
- **Multi-Model** (3017) — model intelligence with ensemble & voting
- **Auto Builder** (3018) — natural-language to full application generation

#### Advanced Infrastructure (6) — Ports 3020-3025
- **Security Sandbox** (3020) — Docker-based code execution sandbox
- **LLM Guardrail** (3021) — prompt injection filter, content moderator, output filter
- **Hybrid RAG** (3022) — hybrid search combining vector + full-text
- **Polyglot Interpreter** (3023) — multi-language code execution
- **Git Automator** (3024) — automated Git operations & PR management
- **Edge Optimizer** (3025) — edge deployment optimization

### Added — Global Platform (Phases 22-38)

#### Phase 22-23 — Cognitive AI & Web3 Mesh (Ports 3030-3031)
- **Cognitive AI** (3030) — evolving persona engine, visual reasoning, meta-learning orchestrator, user embeddings
- **Web3 Mesh** (3031) — IPFS, libp2p, agent contracts, agent mesh network

#### Phase 24-28 — Quantum, Efficiency, Human, Self-Healing, Cultural (Ports 3032-3036)
- **Quantum Security** (3032) — Crystal-Kyber KEM, Dilithium signatures, honeypot AI, threat detection
- **Ultra Efficiency** (3033) — smart hibernation, model distillation, auto-quantization, resource budgeting
- **Human Interaction** (3034) — AR service, dual-brain, voice-first, gesture recognition, smart glasses integration
- **Self-Healing** (3035) — self-coding (8 bug patterns), code telepathy, auto-PR, evolution tracker
- **Cultural Localization** (3036) — Arabic dialects, full RTL, cultural context, local customs

#### Phase 29 — Self-Awareness (Port 3037)
- **Digital Health Service** — continuous monitoring of all 40 microservices with heartbeat, incidents, trends
- **Epistemic Uncertainty Service** — confidence scoring (aleatoric + epistemic) with calibration loop
- **Transparency Dashboard** — accountability ledger, model cards, data lineage, GDPR/CCPA/NDMO compliance
- **Decision Explanation Engine** — 6 categories with natural-language rendering
- **25 API endpoints**

#### Phase 30 — Mobile App
- React Native + Expo client (Android / iOS / Web)
- 5 screens: Login, Chat, Voice, Files, Models, Settings
- Multilingual (Arabic RTL, English, French, German) with instant switching
- Voice (STT + TTS), file uploads, model management
- Streaming chat with confidence scores

#### Phase 31 — Desktop App
- Electron wrapper (macOS / Windows / Linux)
- Native menu bar in 4 languages
- System tray with quick actions
- Auto-launch on boot, auto-updater, deep links (`drsai://`)
- Context-isolated preload script exposing safe `drsAI` API
- macOS entitlements for notarization

#### Phase 32 — GPU Acceleration (Port 3038)
- CUDA Metrics Service — nvidia-smi polling (utilization, memory, temp, power)
- VRAM Monitor — per-model allocations with LRU eviction
- Offload Manager — 4 policies (always_gpu, prefer_gpu, adaptive, cpu_only)
- 11 API endpoints

#### Phase 33 — Distributed Deployment (Port 3039)
- Node Registry — self-registration with heartbeats, capacity, tags
- Task Router — 4 strategies (round_robin, least_loaded, capacity_first, affinity)
- Cluster Manager — status, failover, drain
- 15 API endpoints

#### Phase 34 — Federated Learning (Port 3040)
- Participant Manager — register, heartbeat, submit local updates
- Model Aggregator — 3 strategies (FedAvg, FedProx, FedSGD)
- Secure Aggregation — Bonawitz pairwise masking protocol
- 12 API endpoints

#### Phase 35 — Multi-Region Replication (Port 3041)
- Region Manager — track all regions, measure latency (30s poll), haversine proximity routing
- Replication Engine — 3 modes (async, sync, quorum) with vector-clock ordering
- Conflict Resolver — 3 policies (LWW, vector_clock, merge)
- 13 API endpoints

#### Phase 36 — OAuth2 / OIDC (Port 3042)
- Provider Registry — 6 built-in providers (Keycloak, Auth0, Google, GitHub, Azure AD, Okta)
- Token Store — AES-256-GCM encrypted at rest, per-user per-provider
- Authorization Code + PKCE (RFC 7636) flow
- State-based CSRF protection (10-minute TTL)
- 12 API endpoints

#### Phase 37 — Kubernetes Helm Charts
- Production-ready chart deploying all 40+ services parametrically
- 5 subchart dependencies (postgresql, redis, minio, prometheus, grafana)
- HPA, PDB, NetworkPolicy, Ingress templates
- GPU support via nodeSelector + tolerations + nvidia.com/gpu limits
- Example values: `production.yaml` (HA), `dev.yaml` (minimal)

#### Phase 38 — GPU MIG / Time-Slicing (Port 3043)
- MIG Manager — NVIDIA MIG partitioning for Ampere/Hopper GPUs, 13 profiles
- Time-Slice Manager — for non-MIG-capable GPUs with fairness tracking (60s rolling window)
- 15 API endpoints

### Infrastructure & Tooling

#### Docker Compose
- Single `docker-compose.yml` with 40+ services
- Health checks for every service
- Persistent volumes for postgres, redis, ollama, minio, qdrant
- Network isolation via `drs-network`

#### Termux (Android)
- Run DRS AI on Android without root
- Install script + start/stop helpers
- Optimized for ARM64 devices

#### Monitoring
- **Prometheus** (port 9090) — metrics collection with 15-day retention
- **Grafana** (port 3008) — pre-provisioned dashboards

#### Frontend
- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui components
- Dark-first design with RTL support
- ReactFlow for workflow visualization

#### CLI
- TypeScript CLI client (`cli/`)
- Commands: login, chat, model, workflow, agent, status, config

### Documentation
- Comprehensive `README.md` with badges, services table, quick-start guide
- `TRANSFORMATION_PROGRESS.md` with detailed phase-by-phase breakdown
- `CONTRIBUTING.md` with coding standards and PR workflow
- `SECURITY.md` with vulnerability reporting policy
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1)
- `CHANGELOG.md` (this file)
- `docs/` folder with architecture, API, deployment, plugin development, and troubleshooting guides

### Brand Assets
- Logo (SVG) — hexagonal microservice network emblem
- Favicon (SVG)
- Banner (SVG) — for GitHub social preview
- Architecture diagram (SVG) — 5-tier service topology
- Request-flow diagram (SVG) — chat request lifecycle

### GitHub Integration
- Issue templates: bug report, feature request, security report
- Pull request template
- GitHub Actions: CI (lint + test), CodeQL security analysis, Docker build
- Dependabot configuration
- Funding button
- Topics: ai, llm, ollama, rag, microservices, enterprise, self-hosted

### Stats

| Metric | Value |
|--------|-------|
| Microservices | 40 |
| Clients | 2 (mobile + desktop) |
| Helm charts | 1 |
| Total components | 43 |
| Lines of code | ~100,000 |
| API endpoints | 400+ |
| Languages | Arabic, English, French, German |
| Compliance frameworks | GDPR, CCPA, Saudi NDMO |
| Federated learning strategies | 3 (FedAvg, FedProx, FedSGD) |
| GPU offload policies | 4 |
| GPU sharing modes | 2 (MIG + time-slicing) |
| Task routing strategies | 4 |
| Replication modes | 3 |
| Conflict resolution policies | 3 |
| OAuth providers | 6 |
| MIG profiles | 13 |

## Versioning

DRS AI follows [Semantic Versioning](https://semver.org/):
- **MAJOR** — incompatible API changes
- **MINOR** — new services or features (backward-compatible)
- **PATCH** — bug fixes and small improvements

## Links

- [Releases](https://github.com/CTO-DRS/DRS-AI-Web/releases)
- [Tags](https://github.com/CTO-DRS/DRS-AI-Web/tags)
- [Compare versions](https://github.com/CTO-DRS/DRS-AI-Web/compare)

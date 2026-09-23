# 🔌 API Reference

Complete HTTP API reference for all 40+ DRS AI services.

## Conventions

### Base URL

All examples use `http://localhost:3000` (the API Gateway). In production, replace with your gateway URL.

### Authentication

All endpoints except `/health/*`, `/api/auth/login`, and `/api/auth/register` require a JWT bearer token:

```http
Authorization: Bearer <your-jwt-token>
```

Obtain a token:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)
```

### Standard Response Format

```json
{
  "data": "...",
  "error": null,
  "status": "ok"
}
```

Errors:

```json
{
  "status": "error",
  "message": "Human-readable message",
  "code": "MACHINE_CODE"
}
```

### Pagination

List endpoints support:

- `?limit=50` (default, max 500)
- `?offset=0`

### Rate Limiting

The gateway enforces 100 requests/minute per IP by default. Configure via `RATE_LIMIT_RPM` env var.

---

## Gateway (Port 3000)

The gateway proxies requests to downstream services. Endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Gateway health |
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/chat` | Send chat message |
| POST | `/api/chat/stream` | Stream chat response (SSE) |
| GET | `/api/models` | List available LLM models |
| POST | `/api/models/pull` | Pull a model into Ollama |
| GET | `/api/files` | List user files |
| POST | `/api/files/upload` | Upload a file |
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows/:id/run` | Execute a workflow |
| GET | `/api/agents` | List available agents |
| POST | `/api/agents/:id/invoke` | Invoke an agent |

---

## Auth Service (Port 3001)

JWT + RBAC authentication.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with username/password |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout (revoke session) |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/users` | List users (admin only) |
| POST | `/api/users/:id/roles` | Assign roles |
| GET | `/api/audit` | Get audit log |

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}
```

Response:

```json
{
  "token": "eyJhbGciOi...",
  "refreshToken": "rf_abc123...",
  "expiresIn": 3600,
  "user": {
    "id": "u-1",
    "username": "admin",
    "email": "admin@drs-ai.local",
    "role": "admin"
  }
}
```

---

## Self-Awareness Service (Port 3037)

### Digital Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health/snapshot` | Latest health snapshot of all services |
| POST | `/api/v1/health/snapshot` | Force a new snapshot |
| GET | `/api/v1/health/history?limit=50` | Historical snapshots |
| GET | `/api/v1/health/incidents` | Active incidents |
| GET | `/api/v1/health/incidents/history` | Resolved incidents |
| POST | `/api/v1/health/incidents/:id/resolve` | Resolve an incident |
| GET | `/api/v1/health/trends?window=24` | Trend metrics (24h) |

### Epistemic Uncertainty

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/uncertainty/quantify` | Quantify uncertainty of model output |
| POST | `/api/v1/uncertainty/feedback` | Submit feedback for recalibration |
| GET | `/api/v1/uncertainty/calibration` | Calibration metrics |
| GET | `/api/v1/uncertainty/threshold` | Current confidence threshold |
| POST | `/api/v1/uncertainty/threshold` | Set threshold (admin) |

**Quantify uncertainty:**

```http
POST /api/v1/uncertainty/quantify
Content-Type: application/json

{
  "logprobs": [-0.5, -0.7, -0.3, -1.2],
  "temperature": 0.7
}
```

Response:

```json
{
  "id": "u-abc123",
  "aleatoric": 0.31,
  "epistemic": 0.0,
  "total": 0.19,
  "confidence": 0.81,
  "threshold": 0.65,
  "abstain": false,
  "method": "logprob-entropy"
}
```

### Transparency Dashboard

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/transparency/dashboard` | Dashboard summary |
| GET | `/api/v1/transparency/compliance` | Compliance posture (GDPR/CCPA/NDMO) |
| GET | `/api/v1/transparency/ledger` | Accountability ledger |
| POST | `/api/v1/transparency/ledger` | Record event |
| GET | `/api/v1/transparency/bias-audits` | Bias audit log |
| GET | `/api/v1/transparency/models/:id/card` | Model card |
| POST | `/api/v1/transparency/lineage/:answerId` | Record data lineage |
| GET | `/api/v1/transparency/user-rights` | User rights (GDPR) |
| DELETE | `/api/v1/transparency/user/:userId` | Right-to-be-forgotten |

### Decision Explanations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/explanations/model-selection` | Explain model selection |
| POST | `/api/v1/explanations/content-filtering` | Explain content filter decision |
| POST | `/api/v1/explanations/routing` | Explain routing decision |
| POST | `/api/v1/explanations/security` | Explain security decision |
| POST | `/api/v1/explanations/resource-allocation` | Explain resource allocation |
| POST | `/api/v1/explanations/user-facing-message` | Explain user-facing message |
| GET | `/api/v1/explanations?category=routing&limit=50` | List explanations |
| GET | `/api/v1/explanations/:id` | Get single explanation |

---

## GPU Acceleration Service (Port 3038)

### CUDA Metrics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/gpu/metrics` | Per-GPU current metrics |
| GET | `/api/v1/gpu/metrics/aggregate` | Aggregated metrics |
| GET | `/api/v1/gpu/metrics/history?limit=60` | Historical samples |

### VRAM Management

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/gpu/vram` | List allocations |
| POST | `/api/v1/gpu/vram/allocate` | Allocate VRAM |
| DELETE | `/api/v1/gpu/vram/:id` | Deallocate |
| POST | `/api/v1/gpu/vram/evict` | Trigger LRU eviction |

### Offload Manager

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/gpu/offload/policy` | Current policy |
| POST | `/api/v1/gpu/offload/policy` | Set policy (always_gpu / prefer_gpu / adaptive / cpu_only) |
| POST | `/api/v1/gpu/offload/decide` | Decide offload for a model |
| POST | `/api/v1/gpu/offload/apply` | Apply decision to Ollama |

---

## Distributed Deployment Service (Port 3039)

### Node Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/distributed/nodes/register` | Register a worker node |
| POST | `/api/v1/distributed/nodes/:nodeId/heartbeat` | Send heartbeat |
| DELETE | `/api/v1/distributed/nodes/:nodeId` | Deregister node |
| GET | `/api/v1/distributed/nodes` | List all nodes |
| GET | `/api/v1/distributed/nodes/search?region=ksa&minCpu=4` | Search nodes |

### Task Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/distributed/tasks/submit` | Submit a task |
| POST | `/api/v1/distributed/tasks/:taskId/complete` | Mark task complete |
| GET | `/api/v1/distributed/tasks` | List tasks |
| GET | `/api/v1/distributed/tasks/strategy/get` | Get routing strategy |
| POST | `/api/v1/distributed/tasks/strategy/set` | Set strategy |

### Cluster Operations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/distributed/cluster/status` | Cluster status |
| POST | `/api/v1/distributed/cluster/failover/:nodeId` | Failover tasks from dead node |
| POST | `/api/v1/distributed/cluster/drain/:nodeId` | Gracefully drain a node |

---

## Federated Learning Service (Port 3040)

### Participants

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/fl/participants/register` | Register participant |
| POST | `/api/v1/fl/participants/:id/heartbeat` | Heartbeat |
| DELETE | `/api/v1/fl/participants/:id` | Deregister |
| POST | `/api/v1/fl/participants/:id/updates` | Submit local model update |
| GET | `/api/v1/fl/participants` | List participants |

### Federated Rounds

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/fl/rounds` | Create new round (sets up secure context) |
| GET | `/api/v1/fl/rounds/:roundId/updates` | Get round updates |
| POST | `/api/v1/fl/rounds/:roundId/aggregate` | Trigger aggregation |
| GET | `/api/v1/fl/aggregations` | List aggregations |
| GET | `/api/v1/fl/strategies` | List aggregation strategies |
| POST | `/api/v1/fl/strategies` | Set default strategy |

**Example: full FL round**

```bash
# 1. Register 3 participants
for i in 1 2 3; do
  curl -X POST http://localhost:3040/api/v1/fl/participants/register \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"p$i\",\"name\":\"Node $i\",\"datasetSize\":$((1000*i)),\"publicKey\":\"pub-$i\"}"
done

# 2. Create a round
ROUND_ID=$(curl -s -X POST http://localhost:3040/api/v1/fl/rounds \
  -H "Content-Type: application/json" \
  -d '{"participantIds":["p1","p2","p3"]}' | jq -r .id)

# 3. Each participant submits local updates
for i in 1 2 3; do
  curl -X POST http://localhost:3040/api/v1/fl/participants/p$i/updates \
    -H "Content-Type: application/json" \
    -d "{
      \"roundId\":\"$ROUND_ID\",
      \"update\":[0.1, 0.2, 0.3, 0.4],
      \"metrics\":{\"loss\":0.5,\"accuracy\":0.85}
    }"
done

# 4. Aggregate (with secure aggregation)
curl -X POST http://localhost:3040/api/v1/fl/rounds/$ROUND_ID/aggregate \
  -H "Content-Type: application/json" \
  -d '{"secure":true}'
```

---

## Multi-Region Replication Service (Port 3041)

### Regions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/replication/regions/register` | Register peer region |
| POST | `/api/v1/replication/regions/:code/heartbeat` | Region heartbeat |
| DELETE | `/api/v1/replication/regions/:code` | Deregister region |
| GET | `/api/v1/replication/regions` | List all regions |
| GET | `/api/v1/replication/regions/local` | Local region info |
| POST | `/api/v1/replication/regions/best` | Find best region for {lat,lon} |

### Replication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/replication` | Replicate a write |
| POST | `/api/v1/replication/ingest` | Receive a write from peer |
| GET | `/api/v1/replication/writes/local` | Local write history |
| GET | `/api/v1/replication/writes/ingested` | Ingested writes |
| GET | `/api/v1/replication/mode/get` | Get replication mode |
| POST | `/api/v1/replication/mode/set` | Set mode (async/sync/quorum) |
| GET | `/api/v1/replication/conflicts` | List resolved conflicts |
| GET | `/api/v1/replication/policy/get` | Get conflict policy |
| POST | `/api/v1/replication/policy/set` | Set policy (lww/vector_clock/merge) |

---

## OAuth2 / OIDC Service (Port 3042)

### Providers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/oauth/providers` | List all providers |
| GET | `/api/v1/oauth/providers/configured` | List configured providers |
| POST | `/api/v1/oauth/providers/:id/configure` | Configure provider credentials |
| DELETE | `/api/v1/oauth/providers/:id` | Remove configuration |
| GET | `/api/v1/oauth/providers/:id/authorize` | Get authorization URL |
| POST | `/api/v1/oauth/providers/:id/callback` | Exchange code for tokens |

### Tokens

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/oauth/tokens/:userId` | List user's tokens |
| GET | `/api/v1/oauth/tokens/:userId/:providerId` | Get specific token |
| DELETE | `/api/v1/oauth/tokens/:userId/:providerId` | Revoke single token |
| DELETE | `/api/v1/oauth/tokens/:userId` | Revoke all user's tokens |
| POST | `/api/v1/oauth/validate` | Validate a bearer token |

---

## GPU MIG / Time-Slicing Service (Port 3043)

### MIG (Ampere/Hopper GPUs)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/gpu-mig/gpus` | List MIG-capable GPUs |
| GET | `/api/v1/gpu-mig/profiles` | List 13 MIG profiles |
| POST | `/api/v1/gpu-mig/gpus/:gpuId/enable` | Enable MIG mode |
| POST | `/api/v1/gpu-mig/gpus/:gpuId/disable` | Disable MIG mode |
| GET | `/api/v1/gpu-mig/instances` | List MIG instances |
| POST | `/api/v1/gpu-mig/instances` | Create MIG instance |
| DELETE | `/api/v1/gpu-mig/instances/:id` | Destroy instance |

### Time-Slicing (non-MIG GPUs)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/gpu-ts/contexts` | List active contexts |
| GET | `/api/v1/gpu-ts/contexts/gpu/:gpuId` | Contexts on a specific GPU |
| POST | `/api/v1/gpu-ts/acquire` | Acquire a time-slice |
| POST | `/api/v1/gpu-ts/contexts/:id/heartbeat` | Heartbeat with utilization |
| DELETE | `/api/v1/gpu-ts/contexts/:id` | Release time-slice |
| GET | `/api/v1/gpu-ts/fairness` | Get fairness metrics |
| GET | `/api/v1/gpu-ts/max-clients` | Get max clients per GPU |
| POST | `/api/v1/gpu-ts/max-clients` | Set max clients per GPU |

---

## Other Services

For complete API documentation of all other services, see:

- **Cybersecurity** (3015): `http://localhost:3015/api-docs` (Swagger)
- **Workflow Engine** (3011): `http://localhost:3011/api-docs`
- **Self-Healing** (3035): `http://localhost:3035/api-docs`
- **Cultural Localization** (3036): `http://localhost:3036/api-docs`

Every service exposes a Swagger UI at `/api-docs` for interactive exploration.

## WebSocket Endpoints

For real-time features (streaming chat, AR overlays, gesture detection):

| Service | Endpoint | Events |
|---------|----------|--------|
| Gateway | `/ws/chat` | `message`, `token`, `done`, `error` |
| Voice | `/ws/voice` | `audio`, `transcript`, `response` |
| Human Interaction | `/ws/ar/:sessionId` | `ar:frame:processed` |
| Human Interaction | `/ws/gesture/:sessionId` | `gesture:detected` |
| Human Interaction | `/ws/glasses/:connectionId` | `glasses:tap`, `glasses:overlay` |

## Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_PARAM` | Required parameter missing |
| `INVALID_PARAM` | Parameter has wrong type/value |
| `NOT_FOUND` | Resource doesn't exist |
| `UNAUTHORIZED` | Missing or invalid JWT |
| `FORBIDDEN` | Insufficient role/permission |
| `CONFLICT` | Duplicate / state conflict |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Server error |
| `SERVICE_UNAVAILABLE` | Dependency down |
| `INSUFFICIENT_VRAM` | GPU VRAM allocation failed |
| `NO_MATCHING_NODE` | No worker node matches task requirements |
| `GPU_AT_CAPACITY` | GPU time-slicing full |
| `MIG_ENABLE_FAILED` | Failed to enable MIG (no root? GPU in use?) |
| `TOKEN_EXCHANGE_FAILED` | OAuth code → token exchange failed |
| `INVALID_STATE` | CSRF state invalid/expired |

## SDKs

### JavaScript / TypeScript

```typescript
import { DRSAIClient } from '@drs-ai/sdk';

const client = new DRSAIClient({
  baseUrl: 'http://localhost:3000',
  token: process.env.DRS_TOKEN,
});

// Chat
const response = await client.chat.send('Hello!', { stream: false });

// Stream chat
for await (const chunk of client.chat.stream('Tell me a story')) {
  process.stdout.write(chunk);
}

// List models
const models = await client.models.list();
```

### Python (community)

```python
from drs_ai import DRSAIClient

client = DRSAIClient(base_url='http://localhost:3000', token='...')
response = client.chat.send('Hello!')
```

### CLI

```bash
# Install
npm install -g @drs-ai/cli

# Use
drs login --username admin
drs chat "Hello DRS AI!"
drs models list
drs workflows run daily-report
```

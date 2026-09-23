# 🚀 Quick Start

Get DRS AI running in 5 minutes with Docker Compose.

## Prerequisites

- **Docker** 24+ and **Docker Compose** v2+
- **8 GB RAM** minimum (16 GB recommended)
- **50 GB free disk space**
- (Optional) **NVIDIA GPU** with Docker GPU support for LLM inference

Verify:
```bash
docker --version          # Docker version 24+
docker compose version    # v2+
```

## Step 1: Clone the Repository

```bash
git clone https://github.com/CTO-DRS/DRS-AI.git
cd DRS-AI
```

## Step 2: Configure Environment

```bash
cp .env.example .env

# Generate strong secrets
JWT_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -hex 16)

# Update .env with generated secrets
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG_PASSWORD|" .env

# Verify
cat .env | grep -E "(JWT_SECRET|POSTGRES_PASSWORD)"
```

## Step 3: Start Core Infrastructure First

PostgreSQL, Redis, and Ollama need to be healthy before the AI services start:

```bash
docker compose up -d postgres redis ollama

# Wait for them to be ready
docker compose ps
# All three should show "healthy" in the STATUS column

# Pull a default model into Ollama (one-time)
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text
```

The model pull takes ~2 GB of disk and ~5 minutes on a fast connection.

## Step 4: Start All Services

```bash
# Start everything else
docker compose up -d

# Watch progress
docker compose logs -f --tail=20 gateway
# You should see: "API Gateway running on port 3000"
```

## Step 5: Verify

```bash
# Gateway health
curl http://localhost:3000/health
# Expected: {"status":"healthy",...}

# Frontend
open http://localhost:8080
# Default credentials: admin / admin

# Grafana
open http://localhost:3008
# Default: admin / admin

# Self-Awareness dashboard
curl http://localhost:3037/api/v1/transparency/dashboard | jq .
```

## Step 6: Send Your First Chat

```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)

# Chat
curl -s -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello DRS AI! Tell me about yourself."}' | jq .
```

## Common Variations

### Minimal install (5 services only)

If you just want the chat UI without the full platform:

```bash
# Start only the essentials
docker compose up -d postgres redis ollama
docker compose up -d gateway auth router orchestrator memory frontend

# Skip everything else
```

This uses ~3 GB RAM.

### With GPU acceleration

If you have an NVIDIA GPU and Docker GPU support:

```bash
# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.4-base-ubuntu22.04 nvidia-smi

# Start with GPU services enabled
docker compose up -d
docker compose up -d gpu-acceleration gpu-mig
```

### Without Telegram / mobile / desktop

To skip optional clients:

```bash
# Comment out these services in docker-compose.yml:
# - telegram-bot
# - (mobile-app and desktop-app aren't in docker-compose — they run separately)

docker compose up -d
```

## Stopping the Platform

```bash
# Stop all services
docker compose stop

# Stop AND remove containers (keeps volumes/data)
docker compose down

# Stop AND remove data (DESTRUCTIVE!)
docker compose down -v
```

## Next Steps

- 📚 Read the [full documentation](./README.md)
- 🏗️ Understand the [architecture](./architecture.md)
- 🚀 Deploy to [Kubernetes](../k8s/README.md)
- 🔧 Customize via [environment variables](../.env.example)
- 🤝 [Contribute](../CONTRIBUTING.md) to the project

## Troubleshooting

If something doesn't work, see [troubleshooting.md](./troubleshooting.md).

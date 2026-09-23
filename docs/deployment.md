# 🚢 Deployment Guide

Comprehensive guide for deploying DRS AI in production environments.

## Table of Contents

1. [Docker Compose (Single Node)](#1-docker-compose-single-node)
2. [Kubernetes (Helm Chart)](#2-kubernetes-helm-chart)
3. [Multi-Region Active-Active](#3-multi-region-active-active)
4. [Termux (Android)](#4-termux-android)
5. [Bare Metal / VM (Manual)](#5-bare-metal--vm-manual)
6. [Production Hardening Checklist](#6-production-hardening-checklist)
7. [Backup & Restore](#7-backup--restore)
8. [Upgrades & Rollbacks](#8-upgrades--rollbacks)

---

## 1. Docker Compose (Single Node)

Best for: development, testing, small teams (< 50 users)

### Quick Deploy

```bash
git clone https://github.com/CTO-DRS/DRS-AI.git
cd DRS-AI

# Configure secrets
cp .env.example .env
sed -i "s|JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env

# Pull default LLM model (one-time)
docker compose up -d postgres redis ollama
docker compose exec ollama ollama pull llama3.2:3b

# Start everything
docker compose up -d
```

### Customizing

Override specific services with `docker-compose.override.yml`:

```yaml
# docker-compose.override.yml
version: '3.8'

services:
  gateway:
    environment:
      - LOG_LEVEL=debug
    ports:
      - "9090:3000"   # expose gateway on port 9090

  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

### Resource Limits

Edit `docker-compose.yml` to add resource limits per service:

```yaml
services:
  gateway:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.2'
          memory: 256M
```

---

## 2. Kubernetes (Helm Chart)

Best for: production, scalable deployments, enterprise

### Prerequisites

- Kubernetes 1.27+
- `helm` 3.12+
- `kubectl` configured for your cluster
- A storage class (e.g. `fast-ssd`)
- (Optional) NVIDIA GPU operator for GPU services

### Install

```bash
# Add dependency repos
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm dependency update k8s/helm/drs-ai

# Create namespace
kubectl create namespace drs-ai

# Install with defaults
helm install drs-ai k8s/helm/drs-ai \
  --namespace drs-ai \
  --set secrets.jwtSecret="$(openssl rand -hex 32)" \
  --set secrets.postgresPassword="$(openssl rand -hex 16)" \
  --set secrets.oauthMasterKey="$(openssl rand -hex 32)"

# Watch rollout
kubectl -n drs-ai rollout status deploy/gateway
```

### Production Configuration

Create `my-values.yaml`:

```yaml
global:
  storageClass: "fast-ssd"
  imageRegistry: "ghcr.io"
  imagePullSecrets:
    - name: ghcr-pull-secret

postgres:
  persistence:
    size: 100Gi
  resources:
    limits: { cpu: 2, memory: 4Gi }

ollama:
  gpu:
    enabled: true
    count: 1
  persistence:
    size: 200Gi

# Scale critical services
coreServices:
  gateway: { replicas: 3 }
  auth: { replicas: 3 }
  router: { replicas: 3 }

# Enable autoscaling
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 20

# Ingress with TLS
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: drs-ai.example.com
      paths:
        - { path: /, pathType: Prefix, service: frontend }
        - { path: /api, pathType: Prefix, service: gateway }
  tls:
    - hosts: [drs-ai.example.com]
      secretName: drs-ai-tls

# Zero-trust networking
networkPolicy:
  enabled: true
```

Install:

```bash
helm install drs-ai k8s/helm/drs-ai \
  --namespace drs-ai \
  -f my-values.yaml
```

### GPU Support

Install NVIDIA GPU operator first:

```bash
helm repo add nvidia https://helm.ngc.nvidia.com/nvidia
helm install gpu-operator nvidia/gpu-operator \
  --namespace gpu-operator --create-namespace
```

Then in your values:

```yaml
ollama:
  gpu: { enabled: true, count: 1 }

platformServices:
  gpuAcceleration: { enabled: true, gpu: true }
  gpuMig: { enabled: true, gpu: true }
```

---

## 3. Multi-Region Active-Active

Best for: global enterprises needing low-latency access from multiple regions.

### Architecture

```
                    ┌─────────────────────┐
                    │  Load Balancer      │
                    │  (GeoDNS / Route53) │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
┌───────▼────────┐    ┌────────▼───────┐    ┌─────────▼──────┐
│ Region: KSA    │    │ Region: EU     │    │ Region: US      │
│ (ksa-central)  │◄──►│ (eu-west-1)    │◄──►│ (us-east-1)     │
└────────────────┘    └────────────────┘    └─────────────────┘
        ▲                      ▲                      ▲
        │                      │                      │
        └──────Replication Engine (async/sync/quorum)─┘
```

### Deploy Each Region

```bash
# Region KSA
helm install drs-ai-ksa k8s/helm/drs-ai \
  --namespace drs-ai-ksa --create-namespace \
  --set global.environment=production \
  --set platformServices.multiRegionReplication.env\[0\].name=DRS_REGION \
  --set platformServices.multiRegionReplication.env\[0\].value=ksa-central \
  --set platformServices.multiRegionReplication.env\[1\].name=REPLICATION_MODE \
  --set platformServices.multiRegionReplication.env\[1\].value=async

# Region EU
helm install drs-ai-eu k8s/helm/drs-ai \
  --namespace drs-ai-eu --create-namespace \
  --set platformServices.multiRegionReplication.env\[0\].name=DRS_REGION \
  --set platformServices.multiRegionReplication.env\[0\].value=eu-west-1
```

### Register Peer Regions

After each region is deployed, register the others:

```bash
# From KSA, register EU and US
curl -X POST http://drs-ai-ksa:3041/api/v1/replication/regions/register \
  -H "Content-Type: application/json" \
  -d '{
    "code": "eu-west-1",
    "name": "Europe West",
    "gatewayUrl": "http://drs-ai-eu:3000",
    "lat": 50.1, "lon": 8.7
  }'

curl -X POST http://drs-ai-ksa:3041/api/v1/replication/regions/register \
  -H "Content-Type: application/json" \
  -d '{
    "code": "us-east-1",
    "name": "US East",
    "gatewayUrl": "http://drs-ai-us:3000",
    "lat": 38.9, "lon": -77.0
  }'

# Repeat from EU and US for the other regions
```

### Choose Replication Mode

| Mode | Consistency | Latency | Use Case |
|------|-------------|---------|----------|
| `async` | Eventual | Lowest | Read-heavy, tolerate brief inconsistency |
| `sync` | Strong | Highest | Financial / audit data |
| `quorum` | Majority | Balanced | Default — recommended for most workloads |

```bash
# Change mode (default: async)
curl -X POST http://drs-ai-ksa:3041/api/v1/replication/mode/set \
  -H "Content-Type: application/json" \
  -d '{"mode": "quorum"}'
```

---

## 4. Termux (Android)

Run DRS AI on Android without root!

### Install Termux

Install Termux from [F-Droid](https://f-droid.org/en/packages/com.termux/) (not Play Store — that version is outdated).

### Install DRS AI

```bash
# One-line installer
curl -fsSL https://raw.githubusercontent.com/CTO-DRS/DRS-AI/main/termux/scripts/install.sh | bash

# Start services
$HOME/start-drs.sh start

# Check status
$HOME/start-drs.sh status
```

See [`termux/README.md`](../termux/README.md) for details.

---

## 5. Bare Metal / VM (Manual)

For environments without Docker / K8s.

### Prerequisites

- Node.js 18+
- PostgreSQL 15+ with pgvector extension
- Redis 7+
- (Optional) Python 3.11+ for code-interpreter

### Install

```bash
git clone https://github.com/CTO-DRS/DRS-AI.git
cd DRS-AI

# Install each service
for service in gateway auth router orchestrator memory files voice; do
  cd $service
  npm install --production
  cd ..
done
```

### Run with PM2

```bash
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [
    { name: 'gateway',       cwd: './gateway',       script: 'src/server.js' },
    { name: 'auth',          cwd: './auth',          script: 'src/server.js' },
    { name: 'router',        cwd: './router',         script: 'src/server.js' },
    { name: 'orchestrator',  cwd: './orchestrator',  script: 'src/server.js' },
    { name: 'memory',        cwd: './memory',        script: 'src/server.js' },
    // ... add more as needed
  ]
};
EOF

pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 6. Production Hardening Checklist

### Security

- [ ] Set strong `JWT_SECRET` (32+ bytes)
- [ ] Set strong `POSTGRES_PASSWORD` (16+ chars)
- [ ] Set `OAUTH_MASTER_KEY` (32-byte hex)
- [ ] Enable HTTPS (Let's Encrypt / cert-manager)
- [ ] Enable NetworkPolicy in Kubernetes
- [ ] Configure CORS properly (don't use `*`)
- [ ] Enable audit logging (via self-awareness service)
- [ ] Disable unused services
- [ ] Run containers as non-root (default — verify)
- [ ] Use a private container registry
- [ ] Enable image scanning (Trivy / Snyk)
- [ ] Set up security alerts (CodeQL workflow is included)

### Performance

- [ ] Allocate sufficient RAM (16 GB+ recommended)
- [ ] Use SSD-backed storage for PostgreSQL
- [ ] Pull only the LLM models you need (each is 2-7 GB)
- [ ] Enable Redis persistence (`appendonly yes` — already in compose)
- [ ] Set resource limits per service
- [ ] Enable HPA in Kubernetes
- [ ] Use a fast reverse proxy (nginx / Caddy / Traefik)

### Reliability

- [ ] Set up automated PostgreSQL backups
- [ ] Configure Redis AOF persistence
- [ ] Use multi-AZ deployment (Kubernetes)
- [ ] Configure PodDisruptionBudget (in Helm chart)
- [ ] Set up alerting (Prometheus + Alertmanager)
- [ ] Configure log rotation
- [ ] Set up off-site backups

### Compliance

- [ ] Review GDPR / CCPA / Saudi NDMO posture via `/api/v1/transparency/compliance`
- [ ] Configure data retention policy
- [ ] Review user rights endpoints
- [ ] Document data flow for audits

---

## 7. Backup & Restore

### PostgreSQL Backup

```bash
# Manual backup
docker compose exec postgres pg_dump -U postgres drs_ai > backup-$(date +%F).sql

# Restore
cat backup-2026-09-23.sql | docker compose exec -T postgres psql -U postgres drs_ai
```

### Automated Backups

Use the included script:

```bash
# Set up daily backups via cron
echo "0 2 * * * /path/to/DRS-AI/scripts/backup.sh" | crontab -
```

### Redis Backup

```bash
# Trigger BGSAVE
docker compose exec redis redis-cli BGSAVE

# Copy the dump
docker compose cp redis:/data/dump.rdb ./redis-backup-$(date +%F).rdb
```

### MinIO (Files) Backup

```bash
# Use mc (MinIO Client)
mc alias set drs-local http://localhost:9000 minioadmin minioadmin
mc mirror drs-local/drs-ai-files ./minio-backup-$(date +%F)
```

### Full Cluster Backup (Kubernetes)

```bash
# Using Velero (recommended)
velero install \
  --provider aws \
  --bucket drs-ai-backups \
  --backup-location-config region=us-east-1

velero backup create drs-ai-$(date +%F) --include-namespaces drs-ai
```

---

## 8. Upgrades & Rollbacks

### Docker Compose

```bash
# Pull latest
git pull
docker compose pull

# Apply changes
docker compose up -d

# Rollback if needed
git checkout <previous-commit>
docker compose up -d
```

### Kubernetes

```bash
# Update the chart
git pull

# Dry-run to see changes
helm upgrade drs-ai k8s/helm/drs-ai --namespace drs-ai -f my-values.yaml --dry-run

# Apply
helm upgrade drs-ai k8s/helm/drs-ai --namespace drs-ai -f my-values.yaml

# Check rollout status
kubectl -n drs-ai rollout status deploy/gateway

# Rollback if needed
helm rollback drs-ai 1 --namespace drs-ai

# View history
helm history drs-ai --namespace drs-ai
```

### Database Migrations

DRS AI includes `database/init/01-init.sql` which is applied on first boot. For schema changes between releases:

1. The new release's init scripts are applied automatically on `docker compose up`
2. For manual migrations, use:
   ```bash
   docker compose exec postgres psql -U postgres drs_ai -f /docker-entrypoint-initdb.d/02-update.sql
   ```

### Zero-Downtime Upgrades (Kubernetes)

```yaml
# In values.yaml — set rolling update strategy
coreServices:
  gateway:
    strategy:
      type: RollingUpdate
      rollingUpdate:
        maxSurge: 1
        maxUnavailable: 0
```

This ensures new pods are ready before old pods are terminated.

---

## Monitoring & Observability

### Access Grafana

```bash
# Port-forward
kubectl -n drs-ai port-forward svc/grafana 3008:3000

# Open http://localhost:3008 (admin / admin)
```

### Key Dashboards

- **Service Overview** — health of all 40+ services
- **GPU Utilization** — per-GPU metrics (if GPU services enabled)
- **Federated Learning** — round progress, participant count, model accuracy
- **Multi-Region** — replication lag, conflict rate

### Prometheus Queries

```promql
# Request rate per service
rate(http_requests_total[1m])

# P99 latency per service
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# GPU memory usage
nvidia_smi_memory_used_bytes / nvidia_smi_memory_total_bytes
```

---

## Uninstall

### Docker Compose

```bash
# Stop & remove containers (keep data)
docker compose down

# Stop & remove data (DESTRUCTIVE)
docker compose down -v
docker volume prune
```

### Kubernetes

```bash
# Uninstall Helm release
helm uninstall drs-ai --namespace drs-ai

# Delete namespace (also deletes PVCs)
kubectl delete namespace drs-ai

# Optional: delete PVs (destructive!)
kubectl delete pv -l app.kubernetes.io/instance=drs-ai
```

# DRS AI Kubernetes Deployment

Production-ready Kubernetes manifests + Helm chart for deploying the DRS AI Enterprise AI Operating System to a cluster.

## 📦 Contents

```
k8s/
├── helm/
│   └── drs-ai/                  # Helm chart
│       ├── Chart.yaml
│       ├── values.yaml          # default configuration
│       └── templates/
│           ├── _helpers.tpl     # shared templates
│           ├── core/            # gateway, auth, router, orchestrator, memory, files, voice, dashboard
│           ├── ai-os/           # telegram-bot, workflow-engine, plugin-system, etc.
│           ├── platform/        # advanced + global platform services (Phase 22-38)
│           ├── infra/           # frontend, ingress, PDB, HPA, NetworkPolicy
│           └── monitoring/      # Prometheus + Grafana (via subcharts)
├── manifests/                   # plain K8s manifests (alternative to Helm)
└── examples/                    # example values.yaml for various deployment scenarios
```

## 🚀 Quick Start

### Option 1: Helm install (recommended)

```bash
# Add dependency charts
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm dependency update k8s/helm/drs-ai

# Create namespace
kubectl create namespace drs-ai

# Generate strong secrets
JWT_SECRET=$(openssl rand -hex 32)
PG_PASSWORD=$(openssl rand -hex 16)
OAUTH_KEY=$(openssl rand -hex 32)

# Install
helm install drs-ai k8s/helm/drs-ai \
  --namespace drs-ai \
  --set secrets.jwtSecret="$JWT_SECRET" \
  --set secrets.postgresPassword="$PG_PASSWORD" \
  --set secrets.oauthMasterKey="$OAUTH_KEY"

# Watch rollout
kubectl -n drs-ai rollout status deploy/gateway
```

### Option 2: Plain kubectl apply

```bash
kubectl apply -f k8s/manifests/
```

## ⚙️ Common Configurations

### GPU-enabled cluster

```bash
helm install drs-ai k8s/helm/drs-ai \
  --set ollama.gpu.enabled=true \
  --set platformServices.gpuAcceleration.enabled=true \
  --set platformServices.gpuMig.enabled=true
```

### Multi-region deployment

```bash
# Region KSA-Central
helm install drs-ai-ksa k8s/helm/drs-ai \
  --namespace drs-ai-ksa \
  --set global.environment=production \
  --set platformServices.multiRegionReplication.enabled=true \
  --set platformServices.multiRegionReplication.env\[0\].name=DRS_REGION \
  --set platformServices.multiRegionReplication.env\[0\].value=ksa-central

# Region EU-West
helm install drs-ai-eu k8s/helm/drs-ai \
  --namespace drs-ai-eu \
  --set global.environment=production \
  --set platformServices.multiRegionReplication.env\[0\].name=DRS_REGION \
  --set platformServices.multiRegionReplication.env\[0\].value=eu-west-1
```

### Enable autoscaling

```bash
helm install drs-ai k8s/helm/drs-ai \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=2 \
  --set autoscaling.maxReplicas=20
```

### Use external Postgres / Redis

```bash
helm install drs-ai k8s/helm/drs-ai \
  --set postgres.enabled=false \
  --set postgres.externalHost=postgres.internal \
  --set redis.enabled=false \
  --set redis.externalHost=redis.internal
```

### Ingress with TLS

```bash
helm install drs-ai k8s/helm/drs-ai \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=drs-ai.example.com \
  --set ingress.tls\[0\].hosts\[0\]=drs-ai.example.com \
  --set ingress.tls\[0\].secretName=drs-ai-tls
```

## 📊 Production Checklist

- [ ] Use an external secret manager (External Secrets, Sealed Secrets)
- [ ] Set `--set secrets.*` from a secret manager, NOT from CLI
- [ ] Configure `podDisruptionBudget.minAvailable` based on replication needs
- [ ] Enable `networkPolicy.enabled: true` for zero-trust
- [ ] Use `global.nodeSelector` to pin to specific node pools
- [ ] Configure `tolerations` for tainted nodes (e.g., GPU nodes)
- [ ] Set `global.imagePullSecrets` if using a private registry
- [ ] Set `persistence.storageClass` to a fast SSD-backed StorageClass
- [ ] Enable HPA only after validating resource limits are accurate
- [ ] Configure Prometheus/Grafana retention based on traffic volume
- [ ] Use a real LoadBalancer / Ingress controller (nginx-ingress, traefik, contour)

## 🔄 Upgrading

```bash
# Pull latest chart changes
git pull

# Upgrade
helm upgrade drs-ai k8s/helm/drs-ai --namespace drs-ai -f my-values.yaml

# Rollback if needed
helm rollback drs-ai 1 --namespace drs-ai
```

## 🧹 Uninstall

```bash
helm uninstall drs-ai --namespace drs-ai
kubectl delete namespace drs-ai
# Optional: delete PVs (destructive!)
kubectl delete pvc -l app.kubernetes.io/instance=drs-ai -n drs-ai
```

## 📈 Monitoring

After install, access dashboards via port-forwarding:

```bash
# Gateway
kubectl -n drs-ai port-forward svc/gateway 3000:3000

# Grafana
kubectl -n drs-ai port-forward svc/grafana 3008:3000

# Prometheus
kubectl -n drs-ai port-forward svc/prometheus 9090:9090

# Self-Awareness
kubectl -n drs-ai port-forward svc/self-awareness 3037:3037
```

## 🌍 Multi-Region Replication

The `multi-region-replication` service (port 3041) supports active-active replication across regions. To configure:

1. Deploy DRS AI to multiple regions with `DRS_REGION` env var set per region
2. From each region, register the others via:
   ```bash
   curl -X POST http://drs-ai-ksa:3041/api/v1/replication/regions/register \
     -d '{"code":"eu-west-1","gatewayUrl":"http://drs-ai-eu:3000","lat":50.1,"lon":8.7}'
   ```
3. Choose replication mode:
   - `async` (default) — eventual consistency, fastest
   - `sync` — strong consistency, slowest
   - `quorum` — majority consensus, balanced

## 🔐 Security

- All secrets (`jwtSecret`, `postgresPassword`, `oauthMasterKey`) live in a single Kubernetes Secret named `drs-ai-secrets`
- NetworkPolicy is disabled by default — enable for production
- Service accounts use minimal RBAC (no cluster-admin)
- Container images run as non-root users
- Pod-level resource limits are set for every service

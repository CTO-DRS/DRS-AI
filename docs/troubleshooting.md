# 🛠️ Troubleshooting

Common issues and their solutions. Search with `Ctrl+F` to find your problem.

## Table of Contents

- [Startup Issues](#startup-issues)
- [Service Won't Start](#service-wont-start)
- [Database Issues](#database-issues)
- [LLM / Ollama Issues](#llm--ollama-issues)
- [GPU Issues](#gpu-issues)
- [Network & Connectivity](#network--connectivity)
- [Performance Issues](#performance-issues)
- [Authentication Issues](#authentication-issues)
- [Docker / Kubernetes](#docker--kubernetes)
- [Mobile / Desktop App](#mobile--desktop-app)
- [Logging & Debugging](#logging--debugging)

---

## Startup Issues

### `docker compose up` fails with "no space left on device"

**Cause**: Docker is out of disk space.

**Fix**:
```bash
# Clean unused Docker data
docker system prune -a --volumes

# Check disk usage
df -h
docker system df
```

### `Cannot connect to the Docker daemon`

**Cause**: Docker daemon isn't running.

**Fix**:
```bash
# macOS / Windows: start Docker Desktop
# Linux:
sudo systemctl start docker
sudo systemctl status docker
```

### `permission denied while trying to connect to the Docker daemon socket`

**Cause**: User not in `docker` group.

**Fix**:
```bash
sudo usermod -aG docker $USER
newgrp docker
# Log out and back in for changes to take effect
```

---

## Service Won't Start

### Service container keeps restarting

**Diagnosis**:
```bash
docker compose logs <service-name> --tail=50
docker compose ps
```

Common causes:

1. **Redis not ready yet**: Add `depends_on: redis` (already in compose)
2. **PostgreSQL not ready**: Same as above
3. **Missing environment variables**: Check `.env` is loaded
4. **Port conflict**: Another process is using the port

```bash
# Check what's using a port
sudo lsof -i :3000
sudo netstat -tlnp | grep :3000
```

### Service starts but health check returns 503

```bash
# Check internal sub-service status
curl http://localhost:<port>/health | jq .
```

Look at the `checks` object — each sub-service should be `healthy`.

Common fixes:
- Redis connection: ensure `REDIS_HOST=redis` and `REDIS_PORT=6379`
- PostgreSQL: ensure `POSTGRES_HOST=postgres`
- Ollama: ensure `OLLAMA_HOST=http://ollama:11434`

### `EADDRINUSE: address already in use`

**Cause**: Port conflict.

**Fix**: Either kill the conflicting process or change the port:

```bash
# Find and kill process on port 3000
sudo lsof -ti :3000 | xargs sudo kill -9

# OR change port in docker-compose.yml
services:
  gateway:
    ports:
      - "4000:3000"   # Use port 4000 externally
```

---

## Database Issues

### `FATAL: password authentication failed for user "postgres"`

**Cause**: `POSTGRES_PASSWORD` in `.env` doesn't match the password stored in the volume.

**Fix**: The password is set on first boot. Either:

1. **Reset the volume** (loses data):
   ```bash
   docker compose down -v
   # Update .env with desired password
   docker compose up -d
   ```

2. **Change the password** (keep data):
   ```bash
   docker compose exec postgres psql -U postgres -c "ALTER USER postgres PASSWORD 'newpassword';"
   # Update .env to match
   ```

### `relation "users" does not exist`

**Cause**: Database initialization scripts didn't run.

**Fix**:
```bash
# Apply init scripts manually
docker compose exec postgres psql -U postgres drs_ai -f /docker-entrypoint-initdb.d/01-init.sql
```

### pgvector extension missing

**Cause**: Wrong PostgreSQL image.

**Fix**: Use `ankane/pgvector:latest` (not vanilla postgres):

```yaml
services:
  postgres:
    image: ankane/pgvector:latest  # NOT postgres:15
```

### Vector search returns no results

**Diagnosis**:
```bash
# Check if embeddings were stored
docker compose exec postgres psql -U postgres drs_ai -c \
  "SELECT COUNT(*) FROM memory_embeddings;"
```

If 0, the memory service isn't generating embeddings. Check:
- `OLLAMA_EMBED_MODEL=nomic-embed-text` is set
- `nomic-embed-text` is pulled in Ollama
- Memory service logs: `docker compose logs memory`

---

## LLM / Ollama Issues

### `ollama: connection refused`

**Cause**: Ollama isn't running or wrong URL.

**Fix**:
```bash
# Check Ollama is up
docker compose ps ollama
curl http://localhost:11434/api/tags

# If not running:
docker compose up -d ollama
# Wait for health check
docker compose ps ollama
```

### `model not found, try pulling it first`

**Cause**: LLM model not pulled into Ollama.

**Fix**:
```bash
# Pull the model
docker compose exec ollama ollama pull llama3.2:3b
docker compose exec ollama ollama pull nomic-embed-text

# List available models
curl http://localhost:11434/api/tags
```

### LLM is very slow

**Possible causes**:

1. **No GPU** — CPU inference is much slower. Add GPU support:
   ```yaml
   ollama:
     deploy:
       resources:
         reservations:
           devices:
             - driver: nvidia
               count: 1
               capabilities: [gpu]
   ```

2. **Model too large for RAM** — use a smaller model:
   ```bash
   docker compose exec ollama ollama pull llama3.2:1b  # smaller model
   ```

3. **Other processes using GPU**:
   ```bash
   nvidia-smi
   # Check what's using the GPU
   ```

### Ollama uses too much disk

**Cause**: Each model is 2-7 GB.

**Fix**: Delete unused models:
```bash
docker compose exec ollama ollama rm llama3.2:70b  # huge model
docker compose exec ollama ollama list
```

---

## GPU Issues

### `nvidia-smi: command not found`

**Cause**: NVIDIA drivers not installed on host.

**Fix** (Ubuntu):
```bash
sudo apt install nvidia-driver-535
sudo reboot
# Verify:
nvidia-smi
```

### Docker can't access GPU

**Cause**: NVIDIA Container Toolkit not installed.

**Fix**:
```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install -y nvidia-container-toolkit

# Configure Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify
docker run --rm --gpus all nvidia/cuda:12.4-base-ubuntu22.04 nvidia-smi
```

### GPU Acceleration service reports "Software Emulation"

```bash
curl http://localhost:3038/api/v1/gpu/metrics | jq '.gpus[0].softwareMode'
```

If `true`, the service can't find `nvidia-smi`. This is normal if you don't have a GPU. If you do:

```bash
# Verify nvidia-smi works inside the container
docker compose exec gpu-acceleration nvidia-smi
```

If that fails, add GPU device to the service in `docker-compose.yml`:

```yaml
gpu-acceleration:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: all
            capabilities: [gpu]
```

### MIG enable fails with "permission denied"

**Cause**: MIG operations require root.

**Fix**: Run the container as root (only for gpu-mig service):

```yaml
gpu-mig:
  user: root  # Required for nvidia-smi -mig operations
```

### Out of memory error during inference

**Cause**: Model larger than available VRAM.

**Fix**:
1. Use a smaller model (e.g. `llama3.2:1b` instead of `:3b`)
2. Enable offload manager with adaptive policy:
   ```bash
   curl -X POST http://localhost:3038/api/v1/gpu/offload/policy \
     -H "Content-Type: application/json" \
     -d '{"policy":"adaptive"}'
   ```
3. Use MIG to partition GPU (if Ampere/Hopper)
4. Add more GPUs

---

## Network & Connectivity

### Frontend can't reach API gateway (CORS error)

**Cause**: CORS not configured for frontend origin.

**Fix**: Edit `gateway/src/index.ts`:

```typescript
app.use(cors({
  origin: ['http://localhost:8080', 'https://drs-ai.example.com'],
  credentials: true,
}));
```

### Mobile app can't connect

**Cause**: Mobile device on different network.

**Fix**: Use your machine's LAN IP, not `localhost`:

```bash
# Find your LAN IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# In mobile-app Settings → Server URL:
# Use: http://192.168.1.100:3000
```

### Service-to-service call fails (`ECONNREFUSED`)

**Cause**: Trying to reach another service by `localhost` instead of service name.

**Fix**: Inside Docker network, use service names:
- ❌ `http://localhost:3001` (won't work)
- ✅ `http://auth:3001` (correct)

### Telegram bot doesn't respond

**Diagnosis**:
```bash
docker compose logs telegram-bot --tail=20
```

**Common fixes**:
1. Verify `TELEGRAM_BOT_TOKEN` is set in `.env`
2. Set `ENABLE_TELEGRAM=true`
3. Check the bot is registered with BotFather
4. Verify webhook/polling setup:
   ```bash
   curl https://api.telegram.org/bot$TOKEN/getMe
   ```

---

## Performance Issues

### System is slow / unresponsive

**Diagnosis**:
```bash
# Check resource usage
docker stats

# Check Redis memory
docker compose exec redis redis-cli INFO memory

# Check Postgres connections
docker compose exec postgres psql -U postgres -c \
  "SELECT count(*) FROM pg_stat_activity;"
```

**Fixes**:
1. **Reduce enabled services** — comment out unused services in `docker-compose.yml`
2. **Add resource limits** per service
3. **Use smaller LLM models**
4. **Increase available RAM**

### High CPU on PostgreSQL

**Diagnosis**: Check slow queries:
```bash
docker compose exec postgres psql -U postgres -c \
  "SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
```

**Fix**:
- Add indexes on frequently-queried columns
- Vacuum and analyze:
  ```bash
  docker compose exec postgres psql -U postgres -c "VACUUM ANALYZE;"
  ```

### Frontend loads slowly

**Fix**:
1. Use the pre-built image: `image: ghcr.io/cto-drs/drs-ai-frontend:latest`
2. Enable nginx gzip (already in `nginx.conf`)
3. Use a CDN for static assets in production

---

## Authentication Issues

### Login returns 401 even with correct credentials

**Cause**: Password is hashed at registration, but plain text at login (or vice versa).

**Fix**: Reset the admin user:
```bash
docker compose exec postgres psql -U postgres drs_ai -c \
  "DELETE FROM users WHERE username='admin';"
# Restart auth service to re-create default admin
docker compose restart auth
```

### JWT token expires too fast

**Fix**: Increase `JWT_EXPIRES_IN` in `.env`:
```bash
JWT_EXPIRES_IN=30d
```

### User can't access admin endpoints despite admin role

**Diagnosis**:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/auth/me | jq .role
```

If role isn't `admin`, fix it:
```bash
docker compose exec postgres psql -U postgres drs_ai -c \
  "UPDATE users SET role='admin' WHERE username='yourusername';"
```

---

## Docker / Kubernetes

### Pod stuck in `CrashLoopBackOff`

**Diagnosis**:
```bash
kubectl -n drs-ai logs <pod-name> --previous
kubectl -n drs-ai describe pod <pod-name>
```

**Common fixes**:
- Check `resources.limits` are sufficient
- Verify the image exists in your registry
- Check `livenessProbe` isn't too aggressive

### Pod stuck in `Pending`

**Cause**: No nodes match the pod's requirements (nodeSelector, tolerations, GPU).

**Diagnosis**:
```bash
kubectl -n drs-ai describe pod <pod-name> | tail -20
```

Look for `Events` section.

### Helm install fails: `template: drs-ai/templates/...: function not defined`

**Cause**: Outdated Helm version.

**Fix**:
```bash
# Helm 3.12+ required
helm version
# If older:
# Download latest from https://github.com/helm/helm/releases
```

### PV stuck in `Pending`

**Cause**: No storage class configured.

**Fix**:
```bash
# List storage classes
kubectl get storageclass

# Set a default
kubectl patch storageclass <fast-ssd> -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
```

### ImagePullBackOff

**Cause**: Can't pull from private registry.

**Fix**:
```bash
# Create image pull secret
kubectl -n drs-ai create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username=$GITHUB_USERNAME \
  --docker-password=$GITHUB_TOKEN

# Reference in values.yaml
global:
  imagePullSecrets:
    - name: ghcr-pull-secret
```

---

## Mobile / Desktop App

### Mobile app: "Cannot connect to server"

1. Make sure server is reachable: try opening `http://<server-ip>:3000/health` in a browser on the same device
2. In the mobile app Settings → Server URL, enter `http://<server-ip>:3000`
3. For Android emulator, use `http://10.0.2.2:3000` (alias for host's localhost)
4. For physical device, use your machine's LAN IP

### Desktop app: shows loader forever

**Cause**: Frontend service not running.

**Fix**:
1. Verify frontend is up: `curl http://localhost:8080`
2. In `desktop-app/src/main.js`, check the URL matches your frontend:
   ```javascript
   const target = process.env.DRS_FRONTEND_URL || 'http://localhost:8080';
   ```
3. Set `DRS_FRONTEND_URL` env var if different

### Desktop app: native notifications don't work on Linux

**Fix**: Install libnotify:
```bash
sudo apt install libnotify-bin
```

---

## Logging & Debugging

### Enable debug logging

```bash
# Per service (env var)
LOG_LEVEL=debug

# In docker-compose.yml:
services:
  gateway:
    environment:
      - LOG_LEVEL=debug
```

### View structured logs

```bash
# All services, last 100 lines
docker compose logs --tail=100 -f

# Single service
docker compose logs -f gateway

# Filter by text
docker compose logs gateway | grep "ERROR"

# JSON formatted logs (jq for pretty-printing)
docker compose logs gateway --no-log-prefix | jq .
```

### Enable request tracing

Add a request ID to every log:

```bash
# In gateway/.env:
REQUEST_TRACING=true
```

Every request will get an `X-Request-Id` header that you can grep for:

```bash
docker compose logs gateway | grep "req-abc123"
```

### Profile a slow request

```bash
# With timing
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"hi"}'
```

`curl-format.txt`:
```
time_namelookup:  %{time_namelookup}\n
time_connect:     %{time_connect}\n
time_appconnect:  %{time_appconnect}\n
time_pretransfer: %{time_pretransfer}\n
time_starttransfer: %{time_starttransfer}\n
time_total:       %{time_total}\n
```

### Check service dependencies

```bash
# Self-Awareness gives you a complete picture
curl http://localhost:3037/api/v1/health/snapshot | jq .
```

This shows the health of all 40 services, including latency and error rates.

---

## Still stuck?

1. 📖 Read the full [docs](./README.md)
2. 🔍 Search [existing issues](https://github.com/CTO-DRS/DRS-AI/issues?q=is%3Aissue)
3. 💬 Ask in [GitHub Discussions](https://github.com/CTO-DRS/DRS-AI/discussions)
4. 📧 Email: CTO-DRS@users.noreply.github.com
5. 📱 Telegram: [GitHub Discussions](https://github.com/CTO-DRS/DRS-AI/discussions)

When reporting an issue, include:
- DRS AI version (`git rev-parse --short HEAD`)
- Affected service + port
- Logs (use `LOG_LEVEL=debug`)
- Steps to reproduce
- Your `.env` (REMOVE SECRETS FIRST!)

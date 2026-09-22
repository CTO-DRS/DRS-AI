# DRS AI - Termux Setup Guide

This guide helps you set up DRS AI on Android using Termux without root access.

## Prerequisites

- Android 7.0+ (API level 24)
- At least 4GB RAM (8GB recommended)
- 10GB+ free storage
- Termux app from F-Droid (NOT Play Store version)

## Installation

### 1. Install Termux

Download and install Termux from F-Droid:
https://f-droid.org/packages/com.termux/

**Important:** Do NOT use the Play Store version as it's outdated and deprecated.

### 2. Run Installation Script

```bash
# Update packages
pkg update && pkg upgrade -y

# Install git
curl -fsSL https://raw.githubusercontent.com/drs-ai/termux/main/scripts/install.sh | bash
```

Or manually:

```bash
# Clone the repository
cd ~
git clone https://github.com/drs-ai/drs-ai.git
cd drs-ai/termux

# Run installer
bash scripts/install.sh
```

### 3. Optimize Performance

```bash
bash scripts/optimize.sh
```

### 4. Start Services

```bash
# Start all services
$HOME/start-drs.sh start

# Check status
$HOME/start-drs.sh status
```

## Quick Commands

After installation, these aliases are available:

| Command | Description |
|---------|-------------|
| `drs-start` | Start all DRS services |
| `drs-stop` | Stop all DRS services |
| `drs-restart` | Restart all services |
| `drs-status` | Check service status |
| `drs-monitor` | View system monitor |
| `drs-logs` | View logs |

## Services

The following services will be running:

| Service | Port | Description |
|---------|------|-------------|
| Gateway | 3000 | Main API Gateway |
| Auth | 3001 | Authentication Service |
| Model Router | 3002 | LLM Routing |
| Agent Orchestrator | 3003 | Multi-Agent System |
| Memory | 3004 | Vector Database |
| Files | 3005 | File Processing |
| Voice | 3006 | Voice Commands |
| Dashboard | 3007 | Admin Dashboard |
| Telegram Bot | 3010 | Telegram Integration |
| Workflow Engine | 3011 | Automation |
| Plugin System | 3012 | Plugin Manager |
| Auto Agent | 3013 | Auto Agents |
| Code Interpreter | 3014 | Code Execution |
| Cybersecurity | 3015 | Security Module |
| Advanced Memory | 3016 | Enhanced RAG |
| Multi-Model | 3017 | Model Intelligence |

## Accessing the UI

1. Start the services
2. Open your browser
3. Navigate to: `http://localhost:3000`

Or use the local IP to access from other devices on the same network:
```bash
# Get your IP
ifconfig wlan0
# Access via http://<your-ip>:3000
```

## Ollama Models

Default models installed:
- `llama3.2:3b` - General purpose
- `llama3.2:1b` - Fast inference
- `nomic-embed-text` - Embeddings
- `qwen2.5:3b` - Multilingual

To pull more models:
```bash
ollama pull <model-name>
```

## Troubleshooting

### Out of Memory

If you encounter memory issues:
```bash
# Increase swap
bash scripts/optimize.sh

# Or manually create larger swap
dd if=/dev/zero of=~/.swapfile bs=1M count=4096
mkswap ~/.swapfile
swapon ~/.swapfile
```

### PostgreSQL Won't Start

```bash
# Fix permissions
pg_ctl -D $PREFIX/var/lib/postgresql stop 2>/dev/null || true
rm -rf $PREFIX/var/lib/postgresql/postmaster.pid
pg_ctl -D $PREFIX/var/lib/postgresql start
```

### Port Already in Use

```bash
# Find and kill process
netstat -tulpn | grep <port>
kill -9 <pid>
```

### Slow Performance

1. Close other apps
2. Enable performance mode in Android settings
3. Reduce concurrent model loads
4. Use smaller models (1B instead of 3B)

## Auto-Start on Boot

1. Install Termux:Boot from F-Droid
2. Run once to setup
3. DRS will auto-start on device boot

## Backup & Restore

### Backup
```bash
# Backup data
tar -czf drs-backup-$(date +%Y%m%d).tar.gz \
  ~/drs-ai/data \
  ~/drs-ai/.env \
  ~/.ollama/models
```

### Restore
```bash
# Restore data
tar -xzf drs-backup-YYYYMMDD.tar.gz -C ~/
```

## Uninstall

```bash
# Stop services
$HOME/start-drs.sh stop

# Remove directories
rm -rf ~/drs-ai
rm -rf ~/.ollama
rm -rf ~/.drs-proot

# Remove aliases
sed -i '/DRS AI/d' ~/.bashrc
```

## Support

For issues and support:
- GitHub Issues: https://github.com/drs-ai/drs-ai/issues
- Telegram Group: https://t.me/drs_ai

## License

MIT License - See LICENSE file for details

# DRS AI 🤖

## AI Operating System - Enterprise AI Platform

DRS AI is a comprehensive, locally-hosted AI Operating System that runs entirely offline. Built on microservices architecture with 20+ integrated services, it provides a complete enterprise AI solution without requiring internet connectivity or cloud dependencies.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![Ollama](https://img.shields.io/badge/ollama-integrated-orange)

## 🌟 Features

### Core AI Capabilities
- **Multi-Model Support** - Automatic model selection, voting, and ensemble generation
- **Advanced RAG** - Hierarchical memory with context compression and knowledge graphs
- **Multi-Agent Orchestration** - Coordinated AI agents for complex tasks
- **Code Interpreter** - Safe Python code execution with data analysis
- **Voice Commands** - Speech-to-text and text-to-speech integration

### Integration & Automation
- **Telegram Bot** - Full-featured Telegram integration
- **Workflow Engine** - Visual workflow builder with cron scheduling
- **Plugin System** - Dynamic plugin loading with sandboxed execution
- **Auto Agents** - Event-driven and scheduled autonomous agents
- **Auto App Builder** - Generate full applications from natural language

### Security & Monitoring
- **Cybersecurity Module** - Phishing detection, malware analysis, threat detection
- **JWT + RBAC Authentication** - Role-based access control
- **Prometheus + Grafana** - Full monitoring and observability

### Deployment Options
- **Docker Compose** - One-command deployment
- **Kubernetes Ready** - K8s manifests included
- **Termux Support** - Run on Android without root
- **100% Offline** - No internet required

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DRS AI                               │
│                    AI Operating System                          │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   ┌────▼────┐            ┌────▼────┐            ┌────▼────┐
   │  Core   │            │   AI    │            │  Tools  │
   │Services │            │Services │            │         │
   └────┬────┘            └────┬────┘            └────┬────┘
        │                       │                       │
   ┌────┴───────────────────────┴───────────────────────┴────┐
   │                    Infrastructure                        │
   │  PostgreSQL + pgVector  │  Redis  │  Ollama  │  MinIO   │
   └──────────────────────────────────────────────────────────┘
```

## 📋 Services Overview

| Service | Port | Description |
|---------|------|-------------|
| **Core Services** |||
| Gateway | 3000 | API Gateway & Load Balancer |
| Auth | 3001 | JWT + RBAC Authentication |
| Model Router | 3002 | LLM Routing & Management |
| Agent Orchestrator | 3003 | Multi-Agent Coordination |
| Memory | 3004 | Vector Database & RAG |
| Files | 3005 | File Processing & Storage |
| Voice | 3006 | Voice Commands & TTS |
| Dashboard | 3007 | Admin Dashboard |
| **AI OS Services** |||
| Telegram Bot | 3010 | Telegram Integration |
| Workflow Engine | 3011 | Automation Workflows |
| Plugin System | 3012 | Plugin Management |
| Auto Agent | 3013 | Autonomous Agents |
| Code Interpreter | 3014 | Python Execution |
| Cybersecurity | 3015 | Security Analysis |
| Advanced Memory | 3016 | Enhanced RAG |
| Multi-Model | 3017 | Model Intelligence |
| Auto Builder | 3018 | App Generation |
| **Frontend & Monitoring** |||
| Frontend | 8080 | React Web UI |
| Grafana | 3008 | Monitoring Dashboard |
| Prometheus | 9090 | Metrics Collection |

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- 8GB+ RAM (16GB recommended)
- 50GB+ free disk space

### Installation

```bash
# Clone the repository
git clone https://github.com/drs-ai/drs-ai.git
cd drs-ai

# Set environment variables
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# Pull default models
docker-compose exec ollama ollama pull llama3.2:3b
docker-compose exec ollama ollama pull nomic-embed-text

# Access the UI
open http://localhost:8080
```

### Default Credentials
- **Admin Dashboard**: admin / admin
- **Grafana**: admin / admin

## 📱 Termux Installation (Android)

Run DRS AI on your Android device without root access!

```bash
# Install Termux from F-Droid
# Then run:
curl -fsSL https://raw.githubusercontent.com/drs-ai/termux/main/scripts/install.sh | bash

# Start services
$HOME/start-drs.sh start
```

See [Termux README](./termux/README.md) for detailed instructions.

## 🔧 Configuration

### Environment Variables

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=drs_ai

# JWT
JWT_SECRET=your-jwt-secret-key

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your-bot-token

# Ollama
OLLAMA_MODEL=llama3.2:3b
```

### Model Configuration

Edit `multi-model` service to add custom models:

```json
{
  "id": "custom-model",
  "name": "Custom Model",
  "provider": "ollama",
  "modelId": "custom-model:latest",
  "capabilities": ["chat", "completion"]
}
```

## 🛠️ Development

### Project Structure
```
drs-ai/
├── gateway/              # API Gateway
├── auth/                 # Authentication Service
├── model-router/         # LLM Router
├── agent-orchestrator/   # Multi-Agent System
├── memory/               # Vector Database
├── files/                # File Processing
├── voice/                # Voice Commands
├── dashboard/            # Admin Dashboard
├── telegram-bot/         # Telegram Integration
├── workflow-engine/      # Workflow Automation
├── plugin-system/        # Plugin Manager
├── auto-agent/           # Autonomous Agents
├── code-interpreter/     # Code Execution
├── cybersecurity/        # Security Module
├── advanced-memory/      # Enhanced RAG
├── multi-model/          # Model Intelligence
├── auto-builder/         # App Builder
├── frontend/             # React UI
├── termux/               # Android Scripts
├── monitoring/           # Prometheus/Grafana
└── docker-compose.yml
```

### Building from Source

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build gateway

# Development mode
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## 📊 Monitoring

Access monitoring dashboards:
- **Grafana**: http://localhost:3008
- **Prometheus**: http://localhost:9090

Default metrics collected:
- Request latency & throughput
- Model performance
- Memory usage
- Agent activity
- Workflow execution

## 🔒 Security

### Authentication
- JWT-based authentication
- Role-based access control (RBAC)
- Token refresh mechanism
- Session management

### Cybersecurity Features
- URL/Link phishing detection
- File malware analysis
- Log threat detection
- Password strength analysis

### Best Practices
- All services run in isolated containers
- No external network dependencies
- Secrets managed via environment variables
- Regular security updates

## 🤖 Using the AI OS

### Chat Interface
```bash
# Via CLI
drs chat "What is the weather today?"

# Via API
curl -X POST http://localhost:3000/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "Hello AI"}'
```

### Workflow Automation
```bash
# Create workflow
curl -X POST http://localhost:3011/api/workflows \
  -d '{
    "name": "Daily Report",
    "trigger": {"type": "schedule", "cron": "0 9 * * *"},
    "actions": [{"type": "ai_generate", "prompt": "Generate daily report"}]
  }'
```

### Auto App Builder
```bash
# Generate app from description
curl -X POST http://localhost:3018/api/builder/build \
  -d '{
    "description": "Create a task management app with user authentication, CRUD operations, and a modern dark UI"
  }'
```

## 📚 Documentation

- [API Documentation](./docs/api.md)
- [Architecture Guide](./docs/architecture.md)
- [Plugin Development](./docs/plugins.md)
- [Termux Setup](./termux/README.md)
- [Troubleshooting](./docs/troubleshooting.md)

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/your-username/drs-ai.git

# Create branch
git checkout -b feature/your-feature

# Make changes and commit
git commit -m "Add your feature"

# Push and create PR
git push origin feature/your-feature
```

## 📄 License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) file.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) - Local LLM inference
- [LangChain](https://langchain.com) - AI orchestration patterns
- [BullMQ](https://bullmq.io) - Job queues
- [ReactFlow](https://reactflow.dev) - Workflow visualization

## 📞 Support

- GitHub Issues: [github.com/drs-ai/drs-ai/issues](https://github.com/drs-ai/drs-ai/issues)
- Telegram Group: [@drs_ai](https://t.me/drs_ai)
- Email: support@drs-ai.com

## 🗺️ Roadmap

- [x] Core microservices architecture
- [x] Multi-model support
- [x] Advanced RAG with knowledge graphs
- [x] Workflow automation
- [x] Plugin system
- [x] Auto app builder
- [x] Termux support
- [ ] Mobile app (React Native)
- [ ] Desktop app (Electron)
- [ ] GPU acceleration
- [ ] Distributed deployment
- [ ] Federated learning

---

<p align="center">
  <strong>DRS AI</strong> - Your Local AI Operating System
  <br>
  Made with ❤️ by the DRS Team
</p>

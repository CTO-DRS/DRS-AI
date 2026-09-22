#!/data/data/com.termux/files/usr/bin/bash

# DRS AI - Termux Installation Script
# This script installs and configures DRS AI on Termux without root access

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DRS_DIR="$HOME/drs-ai"
PROOT_DIR="$HOME/.drs-proot"
UBUNTU_VERSION="jammy"

# Logging
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check Termux environment
check_termux() {
    log_info "Checking Termux environment..."
    
    if [ -z "$TERMUX_VERSION" ]; then
        log_error "This script must be run in Termux environment"
        exit 1
    fi
    
    # Check architecture
    ARCH=$(uname -m)
    log_info "Architecture: $ARCH"
    
    case $ARCH in
        aarch64|arm64)
            DOCKER_ARCH="arm64"
            ;;
        armv7l|armhf)
            DOCKER_ARCH="armhf"
            ;;
        x86_64|amd64)
            DOCKER_ARCH="amd64"
            ;;
        *)
            log_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
    
    log_success "Environment check passed"
}

# Update packages
update_packages() {
    log_info "Updating packages..."
    pkg update -y
    pkg upgrade -y
    log_success "Packages updated"
}

# Install required packages
install_packages() {
    log_info "Installing required packages..."
    
    pkg install -y \
        git \
        curl \
        wget \
        nodejs-lts \
        python \
        python-pip \
        postgresql \
        redis \
        proot-distro \
        tsu \
        termux-api \
        openssh \
        vim \
        nano \
        htop \
        jq \
        ffmpeg \
        libffi \
        clang \
        pkg-config \
        libjpeg-turbo \
        libpng \
        zlib
    
    log_success "Packages installed"
}

# Install Node.js packages
install_node_packages() {
    log_info "Installing global Node.js packages..."
    
    npm install -g \
        pm2 \
        typescript \
        ts-node \
        nodemon \
        @nestjs/cli \
        next \
        prisma \
        @prisma/client
    
    log_success "Node.js packages installed"
}

# Install Python packages
install_python_packages() {
    log_info "Installing Python packages..."
    
    pip install --upgrade pip
    pip install \
        numpy \
        pandas \
        matplotlib \
        seaborn \
        scikit-learn \
        transformers \
        torch \
        torchvision \
        pillow \
        opencv-python \
        requests \
        flask \
        fastapi \
        uvicorn \
        celery \
        redis \
        sqlalchemy \
        psycopg2-binary \
        python-multipart \
        python-jose \
        passlib \
        bcrypt
    
    log_success "Python packages installed"
}

# Setup storage
setup_storage() {
    log_info "Setting up storage..."
    
    # Request storage permission
    termux-setup-storage
    
    # Create directories
    mkdir -p "$DRS_DIR"/{data,logs,models,cache,uploads,plugins}
    mkdir -p "$HOME/.ollama"
    
    log_success "Storage setup complete"
}

# Setup proot Ubuntu
setup_proot() {
    log_info "Setting up PRoot Ubuntu environment..."
    
    # Install Ubuntu
    if ! proot-distro list | grep -q ubuntu; then
        proot-distro install ubuntu
    fi
    
    # Create startup script
    cat > "$HOME/start-drs.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash

# Start DRS AI in PRoot environment

PROOT_DIR="$HOME/.drs-proot"
DRS_DIR="$HOME/drs-ai"

# Function to start services
start_services() {
    echo "Starting DRS AI services..."
    
    # Start PostgreSQL
    if ! pgrep -x "postgres" > /dev/null; then
        echo "Starting PostgreSQL..."
        pg_ctl -D $PREFIX/var/lib/postgresql start
    fi
    
    # Start Redis
    if ! pgrep -x "redis-server" > /dev/null; then
        echo "Starting Redis..."
        redis-server --daemonize yes
    fi
    
    # Start Ollama
    if ! pgrep -x "ollama" > /dev/null; then
        echo "Starting Ollama..."
        ollama serve &
    fi
    
    echo "All services started!"
}

# Function to stop services
stop_services() {
    echo "Stopping DRS AI services..."
    
    pkill -f "node.*drs-ai" 2>/dev/null || true
    pkill -f "ollama" 2>/dev/null || true
    redis-cli shutdown 2>/dev/null || true
    pg_ctl -D $PREFIX/var/lib/postgresql stop 2>/dev/null || true
    
    echo "All services stopped!"
}

# Function to check status
status_services() {
    echo "Checking DRS AI services status..."
    
    echo -n "PostgreSQL: "
    pgrep -x "postgres" > /dev/null && echo "Running" || echo "Stopped"
    
    echo -n "Redis: "
    pgrep -x "redis-server" > /dev/null && echo "Running" || echo "Stopped"
    
    echo -n "Ollama: "
    pgrep -x "ollama" > /dev/null && echo "Running" || echo "Stopped"
    
    echo -n "DRS Services: "
    pgrep -f "node.*drs-ai" > /dev/null && echo "Running" || echo "Stopped"
}

# Main
case "$1" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        sleep 2
        start_services
        ;;
    status)
        status_services
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
EOF
    
    chmod +x "$HOME/start-drs.sh"
    
    log_success "PRoot environment configured"
}

# Install Ollama
install_ollama() {
    log_info "Installing Ollama..."
    
    # Download Ollama for ARM64
    OLLAMA_VERSION="0.3.0"
    OLLAMA_URL="https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-linux-${DOCKER_ARCH}"
    
    curl -L -o "$PREFIX/bin/ollama" "$OLLAMA_URL"
    chmod +x "$PREFIX/bin/ollama"
    
    # Create Ollama service script
    cat > "$PREFIX/bin/ollama-service" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
export OLLAMA_HOST=0.0.0.0:11434
export OLLAMA_MODELS=$HOME/.ollama/models
export OLLAMA_ORIGINS=*
ollama serve
EOF
    chmod +x "$PREFIX/bin/ollama-service"
    
    log_success "Ollama installed"
}

# Pull default models
pull_models() {
    log_info "Pulling default Ollama models..."
    
    # Start Ollama temporarily
    ollama serve &
    OLLAMA_PID=$!
    sleep 5
    
    # Pull models
    ollama pull llama3.2:3b
    ollama pull llama3.2:1b
    ollama pull nomic-embed-text
    ollama pull qwen2.5:3b
    
    # Stop Ollama
    kill $OLLAMA_PID 2>/dev/null || true
    
    log_success "Models pulled"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Initialize PostgreSQL
    if [ ! -d "$PREFIX/var/lib/postgresql" ]; then
        mkdir -p "$PREFIX/var/lib/postgresql"
        initdb "$PREFIX/var/lib/postgresql"
    fi
    
    # Start PostgreSQL
    pg_ctl -D "$PREFIX/var/lib/postgresql" start
    sleep 3
    
    # Create database and user
    createdb drs_ai 2>/dev/null || true
    createuser -s drs_user 2>/dev/null || true
    
    # Enable pgvector extension
    psql -d drs_ai -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || true
    
    log_success "Database setup complete"
}

# Create configuration
create_config() {
    log_info "Creating configuration..."
    
    cat > "$DRS_DIR/.env" << EOF
# DRS AI Configuration
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://drs_user@localhost:5432/drs_ai
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=drs_ai
POSTGRES_USER=drs_user
POSTGRES_PASSWORD=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# JWT
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=7d

# Security
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Paths
DATA_DIR=$DRS_DIR/data
LOGS_DIR=$DRS_DIR/logs
MODELS_DIR=$HOME/.ollama/models
CACHE_DIR=$DRS_DIR/cache
UPLOADS_DIR=$DRS_DIR/uploads
PLUGINS_DIR=$DRS_DIR/plugins

# Features
ENABLE_TELEGRAM=false
TELEGRAM_BOT_TOKEN=

# Memory
MEMORY_CONSOLIDATION_INTERVAL=86400000
MEMORY_CLEANUP_INTERVAL=3600000

# Performance
MAX_CONCURRENT_REQUESTS=10
REQUEST_TIMEOUT=60000
EOF
    
    log_success "Configuration created"
}

# Create systemd-style service
create_service() {
    log_info "Creating service scripts..."
    
    # Create termux-services directory
    mkdir -p "$HOME/.termux/boot"
    
    # Boot script
    cat > "$HOME/.termux/boot/start-drs" << 'EOF'
#!/data/data/com.termux/files/usr/bin/sh
termux-wake-lock
$HOME/start-drs.sh start
EOF
    chmod +x "$HOME/.termux/boot/start-drs"
    
    log_success "Service scripts created"
}

# Main installation
main() {
    echo "========================================"
    echo "  DRS AI Termux Installer"
    echo "========================================"
    echo ""
    
    check_termux
    update_packages
    install_packages
    install_node_packages
    install_python_packages
    setup_storage
    setup_proot
    install_ollama
    setup_database
    pull_models
    create_config
    create_service
    
    echo ""
    echo "========================================"
    log_success "DRS AI installation complete!"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "1. Clone the DRS AI repository:"
    echo "   git clone <repository-url> $DRS_DIR"
    echo ""
    echo "2. Start services:"
    echo "   $HOME/start-drs.sh start"
    echo ""
    echo "3. Check status:"
    echo "   $HOME/start-drs.sh status"
    echo ""
    echo "4. To auto-start on boot, install Termux:Boot from F-Droid"
    echo ""
}

# Run main function
main "$@"

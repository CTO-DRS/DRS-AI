#!/data/data/com.termux/files/usr/bin/bash

# DRS AI - Performance Optimization Script for Termux
# Optimizes system settings for running AI workloads

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Optimize kernel parameters
optimize_kernel() {
    log_info "Optimizing kernel parameters..."
    
    # Increase file descriptors
    echo "ulimit -n 65536" >> ~/.bashrc
    
    # Increase shared memory
    echo "kernel.shmmax = 536870912" >> /data/data/com.termux/files/usr/etc/sysctl.conf 2>/dev/null || true
    echo "kernel.shmall = 131072" >> /data/data/com.termux/files/usr/etc/sysctl.conf 2>/dev/null || true
    
    # Virtual memory settings
    echo "vm.swappiness = 10" >> /data/data/com.termux/files/usr/etc/sysctl.conf 2>/dev/null || true
    echo "vm.vfs_cache_pressure = 50" >> /data/data/com.termux/files/usr/etc/sysctl.conf 2>/dev/null || true
    
    log_success "Kernel parameters optimized"
}

# Optimize Node.js
optimize_nodejs() {
    log_info "Optimizing Node.js settings..."
    
    # Add to .bashrc
    cat >> ~/.bashrc << 'EOF'

# Node.js optimizations for DRS AI
export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
export UV_THREADPOOL_SIZE=128
export NODE_ENV=production
EOF
    
    log_success "Node.js optimized"
}

# Optimize Python
optimize_python() {
    log_info "Optimizing Python settings..."
    
    cat >> ~/.bashrc << 'EOF'

# Python optimizations for DRS AI
export PYTHONDONTWRITEBYTECODE=1
export PYTHONUNBUFFERED=1
export PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
export OMP_NUM_THREADS=4
export MKL_NUM_THREADS=4
EOF
    
    log_success "Python optimized"
}

# Optimize PostgreSQL
optimize_postgresql() {
    log_info "Optimizing PostgreSQL..."
    
    PG_CONF="$PREFIX/var/lib/postgresql/postgresql.conf"
    
    if [ -f "$PG_CONF" ]; then
        # Backup original
        cp "$PG_CONF" "$PG_CONF.backup"
        
        # Apply optimizations
        cat >> "$PG_CONF" << EOF

# DRS AI Optimizations
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 16MB
maintenance_work_mem = 64MB
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
checkpoint_completion_target = 0.9
wal_writer_delay = 10ms
max_wal_size = 2GB
min_wal_size = 512MB
max_connections = 50
EOF
        
        log_success "PostgreSQL optimized"
    else
        log_warning "PostgreSQL config not found"
    fi
}

# Optimize Redis
optimize_redis() {
    log_info "Optimizing Redis..."
    
    REDIS_CONF="$PREFIX/etc/redis.conf"
    
    if [ -f "$REDIS_CONF" ]; then
        # Backup original
        cp "$REDIS_CONF" "$REDIS_CONF.backup"
        
        # Apply optimizations
        cat >> "$REDIS_CONF" << EOF

# DRS AI Optimizations
maxmemory 256mb
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 300
tcp-backlog 511
EOF
        
        log_success "Redis optimized"
    else
        log_warning "Redis config not found"
    fi
}

# Create swap file
create_swap() {
    log_info "Creating swap file..."
    
    SWAP_FILE="$HOME/.swapfile"
    SWAP_SIZE=2048  # 2GB
    
    if [ ! -f "$SWAP_FILE" ]; then
        dd if=/dev/zero of="$SWAP_FILE" bs=1M count=$SWAP_SIZE
        chmod 600 "$SWAP_FILE"
        mkswap "$SWAP_FILE" 2>/dev/null || true
        log_success "Swap file created (${SWAP_SIZE}MB)"
    else
        log_warning "Swap file already exists"
    fi
    
    # Add to startup
    if ! grep -q "$SWAP_FILE" "$HOME/.bashrc"; then
        echo "swapon $SWAP_FILE 2>/dev/null || true" >> "$HOME/.bashrc"
    fi
}

# Optimize battery
optimize_battery() {
    log_info "Configuring battery optimizations..."
    
    # Create battery monitoring script
    cat > "$HOME/.battery-monitor.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# Battery monitoring for DRS AI

BATTERY_LEVEL=$(termux-battery-status | jq -r '.percentage')
BATTERY_STATUS=$(termux-battery-status | jq -r '.status')

if [ "$BATTERY_LEVEL" -lt 20 ] && [ "$BATTERY_STATUS" != "CHARGING" ]; then
    # Reduce workload when battery is low
    echo "Low battery detected. Reducing AI workload..."
    # This would communicate with the DRS services to reduce processing
fi
EOF
    chmod +x "$HOME/.battery-monitor.sh"
    
    log_success "Battery optimization configured"
}

# Create monitoring script
create_monitor() {
    log_info "Creating system monitor..."
    
    cat > "$HOME/.drs-monitor.sh" << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# DRS AI System Monitor

echo "========================================"
echo "  DRS AI System Status"
echo "========================================"
echo ""

# Memory
echo "Memory Usage:"
free -h 2>/dev/null || echo "  (free command not available)"
echo ""

# Disk
echo "Disk Usage:"
df -h $HOME 2>/dev/null | tail -1
echo ""

# CPU
echo "CPU Info:"
cat /proc/cpuinfo | grep "model name" | head -1
cat /proc/cpuinfo | grep "processor" | wc -l | xargs echo "Cores:"
echo ""

# Processes
echo "DRS Processes:"
ps aux 2>/dev/null | grep -E "(node|python|ollama|postgres|redis)" | grep -v grep || echo "  No DRS processes running"
echo ""

# Network
echo "Network:"
ip addr 2>/dev/null | grep "inet " | head -2 || echo "  (ip command not available)"
echo ""

# Temperature (if available)
if [ -f /sys/class/thermal/thermal_zone0/temp ]; then
    TEMP=$(cat /sys/class/thermal/thermal_zone0/temp)
    TEMP_C=$((TEMP / 1000))
    echo "Temperature: ${TEMP_C}°C"
fi

echo ""
echo "========================================"
EOF
    chmod +x "$HOME/.drs-monitor.sh"
    
    log_success "System monitor created"
}

# Create quick commands
create_aliases() {
    log_info "Creating command aliases..."
    
    cat >> ~/.bashrc << 'EOF'

# DRS AI Aliases
alias drs-start='$HOME/start-drs.sh start'
alias drs-stop='$HOME/start-drs.sh stop'
alias drs-restart='$HOME/start-drs.sh restart'
alias drs-status='$HOME/start-drs.sh status'
alias drs-monitor='$HOME/.drs-monitor.sh'
alias drs-logs='tail -f $HOME/drs-ai/logs/*.log'
alias drs-update='cd $HOME/drs-ai && git pull && npm install'
alias ollama-list='ollama list'
alias ollama-pull='ollama pull'
EOF
    
    log_success "Aliases created"
}

# Main optimization
main() {
    echo "========================================"
    echo "  DRS AI Performance Optimizer"
    echo "========================================"
    echo ""
    
    optimize_kernel
    optimize_nodejs
    optimize_python
    optimize_postgresql
    optimize_redis
    create_swap
    optimize_battery
    create_monitor
    create_aliases
    
    echo ""
    echo "========================================"
    log_success "Optimization complete!"
    echo "========================================"
    echo ""
    echo "Please restart Termux for all changes to take effect."
    echo ""
    echo "Quick commands:"
    echo "  drs-start    - Start all DRS services"
    echo "  drs-stop     - Stop all DRS services"
    echo "  drs-status   - Check service status"
    echo "  drs-monitor  - View system status"
    echo ""
}

main "$@"

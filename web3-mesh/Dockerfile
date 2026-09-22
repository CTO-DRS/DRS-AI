# DRS AI Web3 + AI Distributed Mesh Service

FROM node:18-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create non-root user
RUN groupadd -r web3mesh && useradd -r -g web3mesh web3mesh
RUN mkdir -p logs && chown -R web3mesh:web3mesh logs

USER web3mesh

# Expose ports
EXPOSE 3031 4001 4002/udp 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3031/health/live || exit 1

CMD ["node", "src/server.js"]

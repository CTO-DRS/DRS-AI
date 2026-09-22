# DRS AI Post-Quantum Security Service

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
RUN groupadd -r quantum && useradd -r -g quantum quantum
RUN mkdir -p logs && chown -R quantum:quantum logs

USER quantum

# Expose port
EXPOSE 3032

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3032/health/live || exit 1

CMD ["node", "src/server.js"]

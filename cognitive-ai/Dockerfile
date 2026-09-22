# DRS AI Cognitive AI Service
# Multi-stage build for optimized production image

# Stage 1: Dependencies
FROM node:18-slim AS dependencies

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production
FROM node:18-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r cognitive && useradd -r -g cognitive cognitive

# Copy dependencies from stage 1
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application code
COPY --chown=cognitive:cognitive . .

# Create logs directory
RUN mkdir -p logs && chown -R cognitive:cognitive logs

# Switch to non-root user
USER cognitive

# Expose port
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3030/health/live || exit 1

# Start command
CMD ["node", "src/server.js"]

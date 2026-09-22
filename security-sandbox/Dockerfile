# 𝑫𝑹𝑺.𝑽𝑰𝑷. Security Sandbox - Docker-in-Docker Container
# Multi-stage build for optimized production image

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Install required system packages
RUN apk add --no-cache \
    docker-cli \
    strace \
    tcpdump \
    iptables \
    iproute2 \
    ca-certificates

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create necessary directories
RUN mkdir -p /var/log/drs /tmp/sandbox /workspace && \
    chmod 755 /var/log/drs /tmp/sandbox /workspace

# Create non-root user for sandbox execution
RUN addgroup -g 1000 sandbox && \
    adduser -D -u 1000 -G sandbox sandbox

# Set up Docker socket access
RUN addgroup sandbox docker || true

# Environment variables
ENV NODE_ENV=production \
    PORT=3020 \
    DOCKER_SOCKET=/var/run/docker.sock \
    LOG_LEVEL=info \
    MAX_CONCURRENT_SANDBOXES=10 \
    DEFAULT_MEMORY_LIMIT=536870912 \
    DEFAULT_CPU_LIMIT=1.0 \
    DEFAULT_TIMEOUT=300000

# Expose port
EXPOSE 3020

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3020/api/v1/health/ready || exit 1

# Switch to non-root user
USER sandbox

# Start the service
CMD ["node", "dist/index.js"]

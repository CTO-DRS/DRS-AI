# 𝑫𝑹𝑺.𝑽𝑰𝑷. Polyglot Interpreter
# Multi-language Code Execution with Isolation

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src ./src

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

# Install Docker CLI for container management
RUN apk add --no-cache docker-cli

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    PORT=3023 \
    LOG_LEVEL=info \
    DOCKER_SOCKET=/var/run/docker.sock

EXPOSE 3023

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3023/api/v1/health/ready || exit 1

CMD ["node", "dist/index.js"]

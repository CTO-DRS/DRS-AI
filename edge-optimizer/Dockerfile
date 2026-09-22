# 𝑫𝑹𝑺.𝑽𝑰𝑷. Edge Optimizer
# Auto-Quantization & Resource Budgeting

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ linux-headers

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src ./src

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    PORT=3025 \
    LOG_LEVEL=info \
    OLLAMA_HOST=http://localhost:11434

EXPOSE 3025

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3025/api/v1/health/ready || exit 1

CMD ["node", "dist/index.js"]

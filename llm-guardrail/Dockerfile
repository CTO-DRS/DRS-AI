# 𝑫𝑹𝑺.𝑽𝑰𝑷. LLM Guardrail & WAF
# Prompt Injection Protection & Output Filtering

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

COPY package*.json ./

RUN npm ci --only=production && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN mkdir -p /var/log/drs

ENV NODE_ENV=production \
    PORT=3021 \
    LOG_LEVEL=info

EXPOSE 3021

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3021/api/v1/health/ready || exit 1

CMD ["node", "dist/index.js"]

# 𝑫𝑹𝑺.𝑽𝑰𝑷. Hybrid RAG Engine
# Vector + Full-text Search with Auto-Tagging

FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ postgresql-dev

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src ./src

RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache postgresql-client

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    PORT=3022 \
    LOG_LEVEL=info

EXPOSE 3022

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3022/api/v1/health/ready || exit 1

CMD ["node", "dist/index.js"]

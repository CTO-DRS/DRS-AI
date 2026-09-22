# 𝑫𝑹𝑺.𝑽𝑰𝑷. Git Automator
# Secure Git Operations

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

# Install Git
RUN apk add --no-cache git openssh-client

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production \
    PORT=3024 \
    LOG_LEVEL=info \
    REPOS_DIR=/tmp/drs-repos

EXPOSE 3024

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3024/api/v1/health/ready || exit 1

CMD ["node", "dist/index.js"]

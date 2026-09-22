FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN groupadd -r selfheal && useradd -r -g selfheal selfheal
RUN mkdir -p logs && chown -R selfheal:selfheal logs

USER selfheal

EXPOSE 3035

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3035/health/live || exit 1

CMD ["node", "src/server.js"]

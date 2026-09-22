FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libasound2-dev \
    libpulse-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN groupadd -r interaction && useradd -r -g interaction interaction
RUN mkdir -p logs && chown -R interaction:interaction logs

USER interaction

EXPOSE 3034

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3034/health/live || exit 1

CMD ["node", "src/server.js"]

FROM node:18-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN groupadd -r efficiency && useradd -r -g efficiency efficiency
RUN mkdir -p logs models && chown -R efficiency:efficiency logs models

USER efficiency

EXPOSE 3033

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3033/health/live || exit 1

CMD ["node", "src/server.js"]

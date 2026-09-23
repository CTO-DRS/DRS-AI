FROM node:25-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY . .

RUN groupadd -r aware && useradd -r -g aware aware
RUN mkdir -p logs && chown -R aware:aware logs

USER aware

EXPOSE 3037

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3037/health/live || exit 1

CMD ["node", "src/server.js"]

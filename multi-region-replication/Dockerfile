FROM node:18-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN groupadd -r mr && useradd -r -g mr mr && mkdir -p logs && chown -R mr:mr logs
USER mr
EXPOSE 3041
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3041/health/live || exit 1
CMD ["node", "src/server.js"]

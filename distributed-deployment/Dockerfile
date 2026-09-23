FROM node:18-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN groupadd -r dist && useradd -r -g dist dist && mkdir -p logs && chown -R dist:dist logs
USER dist
EXPOSE 3039
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3039/health/live || exit 1
CMD ["node", "src/server.js"]

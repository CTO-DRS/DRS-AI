FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# install devDeps too: 'npm run build' needs typescript (tsc);
# single-stage image keeps them at runtime by design
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# writable storage for skill packages (mount a volume here in compose/k8s)
ENV SKILLS_DIR=/app/data/skills
RUN mkdir -p /app/data/skills && chown -R node:node /app/data

EXPOSE 3044

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3044}/health || exit 1

USER node

CMD ["node", "dist/index.js"]

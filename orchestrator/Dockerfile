FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# install devDeps too: 'npm run build' needs typescript (tsc);
# single-stage image keeps them at runtime by design
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

EXPOSE 3003

USER node

CMD ["npm", "start"]

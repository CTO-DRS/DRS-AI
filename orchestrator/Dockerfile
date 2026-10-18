FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

EXPOSE 3003

USER node

CMD ["npm", "start"]

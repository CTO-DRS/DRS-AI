FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
RUN npm run build

EXPOSE 3003

USER node

CMD ["npm", "start"]

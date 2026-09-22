FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 py3-pip

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 3005

USER node

CMD ["npm", "start"]

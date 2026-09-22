FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 3006

USER node

CMD ["npm", "start"]

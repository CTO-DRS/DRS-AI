FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
EXPOSE 3037
CMD ["node","src/server.js"]

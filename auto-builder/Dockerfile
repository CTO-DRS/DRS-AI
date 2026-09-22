FROM node:20-alpine

WORKDIR /app

# Install git for template cloning
RUN apk add --no-cache git

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3018

CMD ["npm", "start"]

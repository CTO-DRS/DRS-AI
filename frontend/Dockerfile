# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
# install devDeps too: 'npm run build' needs typescript (tsc);
# single-stage image keeps them at runtime by design
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

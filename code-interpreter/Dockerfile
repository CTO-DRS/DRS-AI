FROM node:20-alpine

WORKDIR /app

# Install Python and common data science packages
# build-base/python3-dev: scipy & scikit-learn must compile from source on musl
RUN apk add --no-cache python3 py3-pip build-base python3-dev \
    py3-numpy py3-pandas py3-matplotlib

# Install additional Python packages
RUN pip3 install --break-system-packages \
    scipy \
    scikit-learn \
    requests \
    beautifulsoup4 \
    lxml \
    openpyxl \
    xlrd

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Create workspace for code execution
RUN mkdir -p /app/workspace && chmod 777 /app/workspace

EXPOSE 3014

USER node

CMD ["npm", "start"]

FROM node:20-alpine

WORKDIR /app

# Install Python and common data science packages
RUN apk add --no-cache python3 py3-pip py3-numpy py3-pandas py3-matplotlib

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
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Create workspace for code execution
RUN mkdir -p /app/workspace && chmod 777 /app/workspace

EXPOSE 3014

USER node

CMD ["npm", "start"]

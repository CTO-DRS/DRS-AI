#!/bin/bash

# DRS AI Setup Script

set -e

echo "================================"
echo "DRS AI Setup"
echo "================================"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed"
    exit 1
fi

# Create environment file
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please update .env with your configuration"
fi

# Create necessary directories
echo "Creating directories..."
mkdir -p logs
mkdir -p data/postgres
mkdir -p data/redis
mkdir -p data/minio
mkdir -p data/ollama

# Pull images
echo "Pulling Docker images..."
docker-compose pull

# Start infrastructure services first
echo "Starting infrastructure services..."
docker-compose up -d postgres redis minio

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
sleep 10

# Start remaining services
echo "Starting all services..."
docker-compose up -d

# Pull default models
echo "Pulling default Ollama models..."
sleep 5
docker-compose exec ollama ollama pull nomic-embed-text || true
docker-compose exec ollama ollama pull llama3.2 || true

echo "================================"
echo "Setup complete!"
echo "================================"
echo ""
echo "Access the platform:"
echo "  - Frontend: http://localhost"
echo "  - API: http://localhost:3000"
echo "  - Grafana: http://localhost:3008"
echo ""
echo "Default admin credentials:"
echo "  - Username: admin"
echo "  - Password: admin123"
echo ""
echo "Don't forget to change the default password!"

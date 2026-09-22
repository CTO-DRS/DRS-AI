#!/bin/bash

# DRS AI Backup Script

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="drs_backup_${TIMESTAMP}.tar.gz"

mkdir -p $BACKUP_DIR

echo "Creating backup..."

# Backup PostgreSQL
docker-compose exec -T postgres pg_dump -U drs drs_ai > $BACKUP_DIR/db_${TIMESTAMP}.sql

# Backup Redis
docker-compose exec -T redis redis-cli BGSAVE
sleep 2
docker cp $(docker-compose ps -q redis):/data/dump.rdb $BACKUP_DIR/redis_${TIMESTAMP}.rdb

# Create archive
tar -czf $BACKUP_DIR/$BACKUP_FILE -C $BACKUP_DIR db_${TIMESTAMP}.sql redis_${TIMESTAMP}.rdb

# Clean up temporary files
rm $BACKUP_DIR/db_${TIMESTAMP}.sql $BACKUP_DIR/redis_${TIMESTAMP}.rdb

echo "Backup created: $BACKUP_DIR/$BACKUP_FILE"

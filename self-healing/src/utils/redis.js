const Redis = require('ioredis');
const { logger } = require('./logger');

let redisClient = null;

async function getRedisClient() {
  if (redisClient) return redisClient;
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB) || 0,
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  redisClient.on('connect', () => logger.info('✅ Redis connected'));
  redisClient.on('error', (err) => logger.error('❌ Redis error:', err));
  return redisClient;
}

module.exports = { getRedisClient };

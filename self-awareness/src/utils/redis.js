/**
 * Redis client for the Self-Awareness service.
 * Falls back to in-memory store when REDIS_HOST is unavailable,
 * so the service can still start during local / CI runs.
 */
const Redis = require('ioredis');
const { logger } = require('./logger');

let client = null;
const memoryStore = new Map();
let useMemory = false;

function init() {
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT || 6379);

  if (!host) {
    logger.warn('⚠️  REDIS_HOST not set; falling back to in-memory store');
    useMemory = true;
    return null;
  }

  client = new Redis({
    host,
    port,
    retryStrategy: (times) => Math.min(times * 200, 2000),
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  client.on('connect', () => logger.info('🔌 Redis connected'));
  client.on('error', (err) => {
    logger.error('❌ Redis error:', err.message);
    if (!useMemory) {
      logger.warn('⚠️  Falling back to in-memory store');
      useMemory = true;
    }
  });

  return client;
}

async function get(key) {
  if (useMemory) return memoryStore.get(key) || null;
  const v = await client.get(key);
  return v;
}

async function set(key, value, ttl) {
  if (useMemory) {
    memoryStore.set(key, value);
    if (ttl) setTimeout(() => memoryStore.delete(key), ttl * 1000);
    return 'OK';
  }
  if (ttl) return client.set(key, value, 'EX', ttl);
  return client.set(key, value);
}

async function hset(key, field, value) {
  if (useMemory) {
    if (!memoryStore.has(key)) memoryStore.set(key, {});
    const o = memoryStore.get(key);
    o[field] = value;
    return 1;
  }
  return client.hset(key, field, value);
}

async function hgetall(key) {
  if (useMemory) return memoryStore.get(key) || {};
  return client.hgetall(key);
}

async function lpush(key, value) {
  if (useMemory) {
    if (!memoryStore.has(key)) memoryStore.set(key, []);
    memoryStore.get(key).unshift(value);
    return memoryStore.get(key).length;
  }
  return client.lpush(key, value);
}

async function lrange(key, start, stop) {
  if (useMemory) {
    const arr = memoryStore.get(key) || [];
    return arr.slice(start, stop === -1 ? undefined : stop + 1);
  }
  return client.lrange(key, start, stop);
}

async function ltrim(key, start, stop) {
  if (useMemory) {
    const arr = memoryStore.get(key) || [];
    const trimmed = arr.slice(start, stop === -1 ? undefined : stop + 1);
    memoryStore.set(key, trimmed);
    return 'OK';
  }
  return client.ltrim(key, start, stop);
}

async function keys(pattern) {
  if (useMemory) {
    const re = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(memoryStore.keys()).filter((k) => re.test(k));
  }
  return client.keys(pattern);
}

async function del(key) {
  if (useMemory) return memoryStore.delete(key) ? 1 : 0;
  return client.del(key);
}

module.exports = { init, get, set, hset, hgetall, lpush, lrange, ltrim, keys, del, client: () => client };

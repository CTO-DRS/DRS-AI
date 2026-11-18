const Redis = require('ioredis');
const { logger } = require('./logger');

let redisClient = null;
let initPromise = null;

/**
 * Build a "null client" that returns null for every Redis command.
 * Used when Redis is unreachable so the service can still boot.
 */
function makeNullClient() {
  const noop = async () => null;
  const noopArr = async () => [];
  const noopNum = async () => 0;
  const noopObj = async () => ({});
  const client = {
    status: 'ready',
    // Lifecycle
    init: noop, connect: noop, ready: true,
    // Strings
    get: noop, set: noop, setex: noop, setnx: noop, mset: noop, mget: noopArr,
    incr: noopNum, decr: noopNum, incrby: noopNum, expire: noop, persist: noop, ttl: noopNum, pttl: noopNum,
    del: noopNum, unlink: noopNum, exists: noopNum,
    // Hashes
    hget: noop, hset: noopNum, hgetall: noopObj, hdel: noopNum, hexists: noopNum,
    hmset: noop, hmget: noopArr, hincrby: noopNum, hkeys: noopArr, hvals: noopArr, hlen: noopNum,
    // Lists
    lpush: noopNum, rpush: noopNum, lpop: noop, rpop: noop, lrange: noopArr, ltrim: noop,
    llen: noopNum, lindex: noop, lset: noop, lrem: noopNum,
    // Sets
    sadd: noopNum, srem: noopNum, smembers: noopArr, sismember: noopNum, scard: noopNum,
    // Sorted sets
    zadd: noopNum, zrem: noopNum, zrange: noopArr, zrevrange: noopArr, zscore: noop, zcard: noopNum,
    // Pub/Sub
    publish: noopNum, subscribe: noop, unsubscribe: noop, psubscribe: noop, punsubscribe: noop,
    // Keys
    keys: noopArr, scan: noopObj, type: async () => 'none',
    // Streams
    xadd: noop, xlen: noopNum, xrange: noopArr, xread: noopArr,
    // Misc
    ping: async () => 'PONG',
    info: async () => 'redis_version:null_client',
    dbsize: noopNum,
    flushdb: noop, flushall: noop,
    multi: () => ({ exec: noopArr, discard: noop }),
    pipeline: () => ({ exec: noopArr }),
    batch: () => ({ exec: noopArr }),
    quit: async () => 'OK',
    end: noop,
    disconnect: () => {},
    on: () => client,
    once: () => client,
    off: () => client,
    emit: () => client,
    removeAllListeners: () => client,
  };
  return client;
}

/**
 * Get the shared Redis client. Returns a connection even when Redis is
 * unreachable — the client will keep retrying in the background but won't
 * block callers indefinitely.
 */
async function getRedisClient() {
  if (redisClient) return redisClient;
  if (initPromise) return initPromise;

  initPromise = doInit();
  return initPromise;
}

async function doInit() {
  const host = process.env.REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT) || 6379;

  // No Redis host → null client
  if (!host) {
    logger.warn('⚠️  REDIS_HOST not set; using in-memory null client');
    redisClient = makeNullClient();
    return redisClient;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (client) => {
      if (resolved) return;
      resolved = true;
      redisClient = client;
      resolve(client);
    };

    const client = new Redis({
      host,
      port,
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB) || 0,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn('⚠️  Redis unreachable after 5 retries; using null client');
          finish(makeNullClient());
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    client.on('connect', () => logger.info('✅ Redis connected'));
    client.on('ready', () => {
      logger.info('✅ Redis ready');
      finish(client);
    });
    client.on('error', (err) => {
      logger.error('❌ Redis error:', err.message);
    });

    // Resolve after 3s regardless so the service can boot
    setTimeout(() => {
      if (!resolved) {
        logger.warn('⚠️  Redis not ready after 3s; using best-effort client');
        finish(client);
      }
    }, 3000);
  });
}

module.exports = { getRedisClient };

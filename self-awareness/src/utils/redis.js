const Redis = require('ioredis');
const { logger } = require('./logger');

let client = null;
let initPromise = null;
let useMemory = false;
const memory = new Map();

function makeNullClient() {
  return {
    status: 'ready',
    // All commands are no-ops returning null
  };
}

async function init() {
  if (client) return client;
  if (initPromise) return initPromise;
  initPromise = doInit();
  return initPromise;
}

async function doInit() {
  const host = process.env.REDIS_HOST;

  if (!host) {
    logger.warn('⚠️  REDIS_HOST not set; using in-memory null client');
    useMemory = true;
    client = makeNullClient();
    return client;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (c) => {
      if (resolved) return;
      resolved = true;
      client = c;
      resolve(c);
    };

    const c = new Redis({
      host,
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn('⚠️  Redis unreachable after 5 retries; using null client');
          useMemory = true;
          finish(makeNullClient());
          return null;
        }
        return Math.min(times * 200, 1000);
      },
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    c.on('connect', () => logger.info('🔌 Redis connected'));
    c.on('ready', () => { logger.info('✅ Redis ready'); finish(c); });
    c.on('error', (err) => logger.error('❌ Redis error:', err.message));

    setTimeout(() => {
      if (!resolved) {
        logger.warn('⚠️  Redis not ready after 3s; using best-effort client');
        finish(c);
      }
    }, 3000);
  });
}

async function get(k) {
  if (useMemory) return memory.get(k) || null;
  if (!client) await init();
  try { return await client.get(k); } catch { return null; }
}

async function set(k, v, ttl) {
  if (useMemory) { memory.set(k, v); if (ttl) setTimeout(() => memory.delete(k), ttl * 1000); return 'OK'; }
  if (!client) await init();
  try {
    if (ttl) return await client.set(k, v, 'EX', ttl);
    return await client.set(k, v);
  } catch { return 'OK'; }
}

async function hset(k, f, v) {
  if (useMemory) { if (!memory.has(k)) memory.set(k, {}); memory.get(k)[f] = v; return 1; }
  if (!client) await init();
  try { return await client.hset(k, f, v); } catch { return 1; }
}

async function hget(k, f) {
  if (useMemory) return (memory.get(k) || {})[f] || null;
  if (!client) await init();
  try { return await client.hget(k, f); } catch { return null; }
}

async function hgetall(k) {
  if (useMemory) return memory.get(k) || {};
  if (!client) await init();
  try { return await client.hgetall(k); } catch { return {}; }
}

async function hdel(k, f) {
  if (useMemory) { const o = memory.get(k) || {}; delete o[f]; return 1; }
  if (!client) await init();
  try { return await client.hdel(k, f); } catch { return 1; }
}

async function lpush(k, v) {
  if (useMemory) { if (!memory.has(k)) memory.set(k, []); memory.get(k).unshift(v); return 1; }
  if (!client) await init();
  try { return await client.lpush(k, v); } catch { return 1; }
}

async function lrange(k, s, e) {
  if (useMemory) { const arr = memory.get(k) || []; return arr.slice(s, e === -1 ? undefined : e + 1); }
  if (!client) await init();
  try { return await client.lrange(k, s, e); } catch { return []; }
}

async function ltrim(k, s, e) {
  if (useMemory) { const arr = memory.get(k) || []; memory.set(k, arr.slice(s, e === -1 ? undefined : e + 1)); return 'OK'; }
  if (!client) await init();
  try { return await client.ltrim(k, s, e); } catch { return 'OK'; }
}

async function del(k) {
  if (useMemory) return memory.delete(k) ? 1 : 0;
  if (!client) await init();
  try { return await client.del(k); } catch { return 0; }
}

async function keys(pattern) {
  if (useMemory) { const re = new RegExp(pattern.replace(/\*/g, '.*')); return Array.from(memory.keys()).filter((k) => re.test(k)); }
  if (!client) await init();
  try { return await client.keys(pattern); } catch { return []; }
}

module.exports = { init, get, set, hset, hget, hgetall, hdel, lpush, lrange, ltrim, del, keys, client: () => client };

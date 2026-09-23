const Redis = require('ioredis');
const { logger } = require('./logger');
let client = null; const memory = new Map(); let useMemory = false;
function init() { const host = process.env.REDIS_HOST; const port = Number(process.env.REDIS_PORT || 6379); if (!host) { useMemory = true; logger.warn('⚠️  REDIS_HOST not set; using in-memory'); return null; } client = new Redis({ host, port, retryStrategy: (t) => Math.min(t * 200, 2000), maxRetriesPerRequest: 3, lazyConnect: false }); client.on('connect', () => logger.info('🔌 Redis connected')); client.on('error', (e) => { logger.error('❌ Redis error:', e.message); useMemory = true; }); return client; }
async function get(k) { return useMemory ? memory.get(k) || null : client.get(k); }
async function set(k, v, ttl) { if (useMemory) { memory.set(k, v); if (ttl) setTimeout(() => memory.delete(k), ttl * 1000); return 'OK'; } return ttl ? client.set(k, v, 'EX', ttl) : client.set(k, v); }
async function hset(k, f, v) { if (useMemory) { if (!memory.has(k)) memory.set(k, {}); memory.get(k)[f] = v; return 1; } return client.hset(k, f, v); }
async function hgetall(k) { return useMemory ? (memory.get(k) || {}) : client.hgetall(k); }
async function hdel(k, f) { if (useMemory) { const o = memory.get(k) || {}; delete o[f]; return 1; } return client.hdel(k, f); }
async function lpush(k, v) { if (useMemory) { if (!memory.has(k)) memory.set(k, []); memory.get(k).unshift(v); return 1; } return client.lpush(k, v); }
async function lrange(k, s, e) { if (useMemory) { const arr = memory.get(k) || []; return arr.slice(s, e === -1 ? undefined : e + 1); } return client.lrange(k, s, e); }
async function del(k) { return useMemory ? (memory.delete(k) ? 1 : 0) : client.del(k); }
module.exports = { init, get, set, hset, hgetall, hdel, lpush, lrange, del, client: () => client };

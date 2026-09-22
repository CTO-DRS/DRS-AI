const Redis = require('ioredis');
let client;
function getRedisClient() {
  if (!client) client = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT || 6379), lazyConnect: true, maxRetriesPerRequest: 1 });
  return client.connect().catch(() => client);
}
module.exports = { getRedisClient };

const { QdrantClient } = require('@qdrant/js-client-rest');
const { logger } = require('./logger');

let qdrantClient = null;

async function getQdrantClient() {
  if (qdrantClient) {
    return qdrantClient;
  }

  qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://qdrant:6333',
    apiKey: process.env.QDRANT_API_KEY || undefined,
  });

  logger.info('✅ Qdrant client initialized');
  return qdrantClient;
}

module.exports = { getQdrantClient };

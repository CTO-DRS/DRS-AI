const Minio = require('minio');
const { logger } = require('./logger');

let minioClient = null;

async function getMinioClient() {
  if (minioClient) {
    return minioClient;
  }

  minioClient = new Minio.Client({
    endPoint: process.env.MINIO_HOST || 'minio',
    port: parseInt(process.env.MINIO_PORT) || 9000,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  });

  logger.info('✅ MinIO client initialized');
  return minioClient;
}

module.exports = { getMinioClient };

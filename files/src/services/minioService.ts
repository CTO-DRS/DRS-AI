import { Client } from 'minio';
import logger from '../utils/logger';

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT?.split(':')[0] || 'localhost',
  port: parseInt(process.env.MINIO_ENDPOINT?.split(':')[1] || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'drs',
  secretKey: process.env.MINIO_SECRET_KEY || 'drs123'
});

const BUCKET = process.env.MINIO_BUCKET || 'drs-files';

export class MinioService {
  async initializeBucket(): Promise<void> {
    try {
      const exists = await minioClient.bucketExists(BUCKET);
      if (!exists) {
        await minioClient.makeBucket(BUCKET);
        logger.info(`Bucket ${BUCKET} created`);
      }
    } catch (error) {
      logger.error('Failed to initialize bucket:', error);
      throw error;
    }
  }

  async uploadFile(objectName: string, buffer: Buffer, metadata?: Record<string, any>): Promise<string> {
    try {
      await minioClient.putObject(BUCKET, objectName, buffer, buffer.length, metadata);
      return objectName;
    } catch (error) {
      logger.error('Failed to upload file:', error);
      throw error;
    }
  }

  async getFile(objectName: string): Promise<Buffer> {
    try {
      const stream = await minioClient.getObject(BUCKET, objectName);
      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      logger.error('Failed to get file:', error);
      throw error;
    }
  }

  async deleteFile(objectName: string): Promise<void> {
    try {
      await minioClient.removeObject(BUCKET, objectName);
    } catch (error) {
      logger.error('Failed to delete file:', error);
      throw error;
    }
  }

  getPublicUrl(objectName: string): string {
    return `http://${process.env.MINIO_ENDPOINT || 'localhost:9000'}/${BUCKET}/${objectName}`;
  }
}

export default new MinioService();

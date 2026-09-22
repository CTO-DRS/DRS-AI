import { Pool } from 'pg';
import logger from './logger';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'drs',
  password: process.env.DB_PASSWORD || 'drs123',
  database: process.env.DB_NAME || 'drs_ai',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected database error:', err);
});

export const query = async (text: string, params?: any[]) => {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
};

export const initVectorExtension = async () => {
  try {
    await query('CREATE EXTENSION IF NOT EXISTS vector');
    logger.info('Vector extension initialized');
  } catch (error) {
    logger.error('Failed to initialize vector extension:', error);
    throw error;
  }
};

export default pool;

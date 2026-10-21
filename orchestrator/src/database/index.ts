import { Sequelize } from 'sequelize';
import logger from '../utils/logger';

/**
 * Postgres persistence for the Orchestrator (v2).
 * Redis remains the hot store / queue; Postgres is the durable
 * source of truth so tasks, teams, plans and approvals survive restarts.
 */
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'drs',
  password: process.env.DB_PASSWORD || 'drs123',
  database: process.env.DB_NAME || 'drs_ai',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 15,
    min: 2,
    acquire: 60000,
    idle: 10000
  },
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  }
});

export const testConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    logger.info('Orchestrator database connection established');
  } catch (error) {
    logger.error('Orchestrator unable to connect to database:', error);
    throw error;
  }
};

export const syncDatabase = async (): Promise<void> => {
  try {
    await sequelize.sync();
    logger.info('Orchestrator database synchronized');
  } catch (error) {
    logger.error('Orchestrator database synchronization failed:', error);
    throw error;
  }
};

export default sequelize;

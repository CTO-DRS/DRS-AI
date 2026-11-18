import { Sequelize } from 'sequelize';
import logger from '../utils/logger';

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'drs',
  password: process.env.DB_PASSWORD || 'drs123',
  database: process.env.DB_NAME || 'drs_ai',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 20,
    min: 5,
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
    logger.info('Database connection established successfully');
  } catch (error) {
    logger.error('Unable to connect to database:', error);
    throw error;
  }
};

export const syncDatabase = async (force: boolean = false): Promise<void> => {
  try {
    await sequelize.sync({ force, alter: !force });
    logger.info('Database synchronized successfully');
  } catch (error) {
    logger.error('Database synchronization failed:', error);
    throw error;
  }
};

export default sequelize;

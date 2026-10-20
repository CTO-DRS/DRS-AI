import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [skills] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

export default logger;

const winston = require('winston');

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'cognitive-ai-service',
    version: '1.0.0'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(metadata).length > 0 && metadata.service !== 'cognitive-ai-service') {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      )
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/cognitive-ai-error.log', 
    level: 'error' 
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/cognitive-ai-combined.log' 
  }));
}

// Stream for Morgan HTTP logging
const stream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

module.exports = { logger, stream };

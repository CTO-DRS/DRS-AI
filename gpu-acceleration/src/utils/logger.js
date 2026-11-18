const winston = require('winston');
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'gpu-acceleration-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...m }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(m).length > 0) msg += ` ${JSON.stringify(m)}`;
          return msg;
        })
      )
    }),
  ],
});
const stream = { write: (m) => logger.info(m.trim()) };
module.exports = { logger, stream };

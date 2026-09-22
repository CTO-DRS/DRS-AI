import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const { combine, timestamp, json, errors, printf } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: combine(
      timestamp(),
      consoleFormat
    )
  })
];

if (process.env.NODE_ENV === 'production') {
  transports.push(
    new DailyRotateFile({
      filename: path.join('/app/logs', 'gateway-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: combine(
        timestamp(),
        json()
      )
    }),
    new DailyRotateFile({
      filename: path.join('/app/logs', 'gateway-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: combine(
        timestamp(),
        json()
      )
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'gateway' },
  transports,
  exceptionHandlers: [
    new winston.transports.Console()
  ],
  rejectionHandlers: [
    new winston.transports.Console()
  ]
});

export default logger;

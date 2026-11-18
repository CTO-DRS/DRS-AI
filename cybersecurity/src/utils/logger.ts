import winston from 'winston';
const { combine, timestamp, printf } = winston.format;
const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) msg += ` ${JSON.stringify(metadata)}`;
  return msg;
});
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'cybersecurity' },
  transports: [new winston.transports.Console({ format: combine(timestamp(), consoleFormat) })]
});
export default logger;

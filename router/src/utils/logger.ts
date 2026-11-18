import winston from 'winston';

const { combine, timestamp, printf } = winston.format;

// JSON.stringify throws on circular structures (e.g. raw axios errors carry a
// Node Agent in `request.agent`). Serializing an Error metadata field used to
// throw a TypeError from inside the printf format, aborting the log call and
// replacing the original error surfaced to callers. Sanitize instead.
const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (v instanceof Error) {
        return { name: v.name, message: v.message, stack: v.stack };
      }
      return v;
    });
  } catch {
    return '[unserializable metadata]';
  }
};

const consoleFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${safeStringify(metadata)}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: 'router' },
  transports: [
    new winston.transports.Console({
      format: combine(timestamp(), consoleFormat)
    })
  ]
});

export default logger;

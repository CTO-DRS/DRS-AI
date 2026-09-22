import winston from 'winston';

const { combine, timestamp, json, printf, colorize } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  const metaStr = Object.keys(metadata).length > 0 
    ? `\n${JSON.stringify(metadata, null, 2)}` 
    : '';
  return `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`;
});

export function createLogger(service: string) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: isDevelopment 
        ? combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            consoleFormat
          )
        : combine(timestamp(), json())
    })
  ];

  if (!isDevelopment) {
    transports.push(
      new winston.transports.File({
        filename: '/var/log/drs/llm-guardrail-error.log',
        level: 'error',
        format: combine(timestamp(), json())
      }),
      new winston.transports.File({
        filename: '/var/log/drs/llm-guardrail.log',
        format: combine(timestamp(), json())
      })
    );
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    transports,
    exitOnError: false
  });
}

export const logger = createLogger('LLMGuardrail');

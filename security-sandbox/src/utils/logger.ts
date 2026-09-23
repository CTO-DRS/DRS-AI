/**
 * Winston Logger Configuration
 * Centralized logging for Security Sandbox
 */

import winston from 'winston';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

// Custom format for console output
const consoleFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  const metaStr = Object.keys(metadata).length > 0 
    ? `\n${JSON.stringify(metadata, null, 2)}` 
    : '';
  return `[${timestamp}] [${service}] ${level}: ${message}${metaStr}`;
});

// Create logger factory
export function createLogger(service: string) {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const transports: winston.transport[] = [
    // Console transport
    new winston.transports.Console({
      format: isDevelopment 
        ? combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            consoleFormat
          )
        : combine(
            timestamp(),
            json()
          )
    })
  ];

  // Add file transport in production
  if (!isDevelopment) {
    transports.push(
      new winston.transports.File({
        filename: './logs/error.log',
        level: 'error',
        format: combine(timestamp(), json(), errors({ stack: true }))
      }),
      new winston.transports.File({
        filename: './logs/combined.log',
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

// Default logger
export const logger = createLogger('SecuritySandbox');

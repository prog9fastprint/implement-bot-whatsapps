import winston from 'winston';
import morgan from 'morgan';
import config from '../config/env.js';

// Mask phone number utility (e.g., 6281234567890 -> 628***67890 or 628***7890)
export const maskPhone = (phone) => {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/(\d{3})\d+(\d{4})/, '$1***$2');
};

// Configure Winston Logger
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If not in production, log to console with colored simple format
if (config.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Create custom stream for Morgan to log via Winston
const morganStream = {
  write: (message) => {
    logger.info(message.trim());
  },
};

// Express Morgan HTTP request logging middleware
export const httpLogger = morgan(
  config.NODE_ENV === 'production' ? 'combined' : 'dev',
  { stream: morganStream }
);

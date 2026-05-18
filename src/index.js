import app from './app.js';
import config from './config/env.js';
import { logger } from './middleware/requestLogger.js';

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running in [${config.NODE_ENV}] mode on port ${PORT}`);
});

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

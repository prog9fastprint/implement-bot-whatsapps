import { logger } from './requestLogger.js';

export function errorHandler(err, req, res, next) {
  // Log the unhandled error internally with full details including stack trace
  logger.error('Unhandled error occurred', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Check if headers have already been sent to client
  if (res.headersSent) {
    return next(err);
  }

  // Return generic JSON response - never expose stack trace in production or development responses
  res.status(err.status || 500).json({
    error: 'Internal server error',
  });
}

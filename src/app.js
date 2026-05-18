import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { httpLogger } from './middleware/requestLogger.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import webhookRouter from './routes/webhook.js';

const app = express();

// Apply global rate limiter
app.use(globalLimiter);

// Helmet security headers for production protection
app.use(helmet());

// CORS configuration - Disabled for cross-origin as webhook is strictly server-to-server (Meta to us)
app.use(cors({
  origin: false,
  methods: ['GET', 'POST'],
}));

// HTTP Morgan request logging (piped to Winston)
app.use(httpLogger);

// Capture raw body buffer for HMAC signature verification
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

// Standard URL-encoded parser
app.use(express.urlencoded({ extended: true }));

// Register routes
app.use(healthRouter);
app.use(webhookRouter);

// Global Error Handler Middleware (must be registered last)
app.use(errorHandler);

export default app;

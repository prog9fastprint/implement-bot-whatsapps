import crypto from 'crypto';
import config from '../config/env.js';
import { logger } from './requestLogger.js';

export function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];

  if (!signature) {
    logger.warn('Missing X-Hub-Signature-256 header in webhook request');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const rawBody = req.rawBody || Buffer.alloc(0);

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', config.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  // timingSafeEqual requires buffers of identical length, otherwise it throws a RangeError.
  // We check length equality first. This does not leak timing info of content itself.
  if (sigBuffer.length !== expectedBuffer.length) {
    logger.warn('Webhook signature verification failed due to length mismatch');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const isValid = crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    if (!isValid) {
      logger.warn('Webhook signature verification failed: invalid timingSafeEqual result');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch (err) {
    logger.error('Error during signature verification', { error: err.message });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

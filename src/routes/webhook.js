import express from 'express';
import config from '../config/env.js';
import { verifyWebhookSignature } from '../middleware/webhookSignature.js';
import { handleWebhookPost } from '../handlers/messageHandler.js';
import { logger } from '../middleware/requestLogger.js';

const router = express.Router();

/**
 * GET /webhook
 * Meta Developer handshake verification. Checks hub.verify_token and returns hub.challenge.
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info('Webhook verification successful with Meta.');
    return res.status(200).send(challenge);
  }

  logger.warn('Webhook verification failed due to invalid token or mode.');
  return res.status(403).json({ error: 'Verification failed' });
});

/**
 * POST /webhook
 * Receives incoming events from WhatsApp. Authenticated via HMAC signature validation.
 */
router.post('/webhook', verifyWebhookSignature, handleWebhookPost);

export default router;

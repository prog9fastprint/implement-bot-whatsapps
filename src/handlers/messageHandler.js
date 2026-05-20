import { MetaWebhookSchema, ParsedMessageSchema } from '../validators/messageValidator.js';
import { parseWebhook } from '../parsers/webhookParser.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';
import { sendTextMessage } from '../services/whatsapp.js';
import { routeMessageToAI } from '../services/aiRouter.js';

// In-memory set for deduplicating WhatsApp messages by transaction ID (wamid) in Step 5.
// Will be backed by PostgreSQL database unique constraints in Step 8.
const processedMessageIds = new Set();

/**
 * POST /webhook Route Handler.
 * Validates the raw Meta request, returns 200 OK instantly, and processes in background.
 */
export async function handleWebhookPost(req, res, next) {
  try {
    const rawBody = req.body;

    // 1. Zod validate structural envelope of Meta WhatsApp Business request
    const structuralCheck = MetaWebhookSchema.safeParse(rawBody);
    if (!structuralCheck.success) {
      logger.warn('Ignored structurally malformed Meta webhook payload', {
        errors: structuralCheck.error.format(),
      });
      // Silently return 200 OK to satisfy Meta webhook servers and prevent message retry loop
      return res.status(200).send('OK');
    }

    // 2. Instantly respond 200 OK to Meta to avoid retry loops (must respond within 5 seconds)
    res.status(200).send('OK');

    // 3. Kickoff asynchronous background processing of the events
    processWebhookEventAsync(structuralCheck.data).catch((err) => {
      logger.error('Failed to process WhatsApp webhook events asynchronously', {
        error: err.message,
        stack: err.stack,
      });
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Asynchronously processes status updates and user message notifications.
 */
async function processWebhookEventAsync(payload) {
  const { messages, statuses } = parseWebhook(payload);

  // 1. Process WhatsApp Message Delivery & Read Status Updates
  for (const status of statuses) {
    logger.info(`Received WhatsApp delivery status update`, {
      messageId: status.messageId,
      status: status.status,
      recipientId: maskPhone(status.recipientId),
    });
    // DB tracking of delivery status will be integrated in Step 8 (PostgreSQL Integration)
  }

  // 2. Process incoming User Messages
  for (const msg of messages) {
    // 2a. Zod validate parsed message variables
    const validatorCheck = ParsedMessageSchema.safeParse(msg);
    if (!validatorCheck.success) {
      logger.warn('Skipped parsed message due to schema validation failure', {
        errors: validatorCheck.error.format(),
      });
      continue;
    }

    const message = validatorCheck.data;

    // 2b. Check for duplicate messages (Deduplication)
    if (processedMessageIds.has(message.messageId)) {
      logger.info(`Duplicate message skipped: ${message.messageId}`);
      continue;
    }

    // Track ID in memory
    processedMessageIds.add(message.messageId);

    // Limit memory cache growth
    if (processedMessageIds.size > 10000) {
      const oldestId = processedMessageIds.keys().next().value;
      processedMessageIds.delete(oldestId);
    }

    // 2c. Dispatch to message processing router
    logger.info(`Routing message from ${maskPhone(message.from)} (type: ${message.type})`);
    dispatchMessageAsync(message).catch((err) => {
      logger.error(`Error handling message: ${message.messageId}`, {
        from: maskPhone(message.from),
        error: err.message,
      });
    });
  }
}

/**
 * Dispatches message logic. Routes text messages to AI Router.
 * Other types (audio, image) will be integrated in Phase 4.
 */
async function dispatchMessageAsync(message) {
  const to = message.from;

  switch (message.type) {
    case 'text':
      // Route to AI Core (Phase 2, Step 7)
      await routeMessageToAI(message);
      break;

    case 'audio':
      // Placeholder for Step 14
      await sendTextMessage(to, 'Pesan suara Anda telah kami terima. Kami akan segera memprosesnya.');
      break;

    case 'image':
      // Placeholder for Step 15
      await sendTextMessage(to, 'Pesan gambar Anda telah kami terima. Kami akan segera memprosesnya.');
      break;

    case 'location':
      await sendTextMessage(to, 'Terima kasih telah berbagi lokasi.');
      break;

    case 'interactive':
      // In Step 10+, we might want to handle button clicks differently, 
      // but for now, AI can handle the button title as text.
      await routeMessageToAI({
        ...message,
        body: `User clicked: ${message.interactive.title}`
      });
      break;

    default:
      await sendTextMessage(to, 'Maaf, tipe pesan ini belum didukung saat ini.');
      break;
  }
}


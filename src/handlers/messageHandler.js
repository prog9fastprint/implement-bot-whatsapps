import { MetaWebhookSchema, ParsedMessageSchema } from '../validators/messageValidator.js';
import { parseWebhook } from '../parsers/webhookParser.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';
import { sendTextMessage } from '../services/whatsapp.js';

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
 * Dispatches message logic. For Phase 1, it simply echos replies back to the user via WhatsApp.
 * (Will integrate OpenAI Assistant Routing in Phase 2, Step 7).
 */
async function dispatchMessageAsync(message) {
  const to = message.from;
  let replyText = '';

  switch (message.type) {
    case 'text':
      replyText = `Pesan Anda diterima: "${message.body}"`;
      break;

    case 'audio':
      replyText = `Pesan suara Anda telah kami terima (Media ID: ${message.mediaId}). Kami akan segera memprosesnya.`;
      break;

    case 'image':
      replyText = `Pesan gambar Anda telah kami terima (Media ID: ${message.mediaId}). Caption: "${message.caption || ''}"`;
      break;

    case 'location':
      replyText = `Lokasi Anda telah kami terima: Latitude ${message.location.latitude}, Longitude ${message.location.longitude}`;
      break;

    case 'interactive':
      replyText = `Anda memilih menu interaktif: [${message.interactive.title}] (ID: ${message.interactive.id})`;
      break;

    default:
      replyText = 'Maaf, tipe pesan ini belum didukung saat ini.';
      break;
  }

  // Send the reply back to the user via WhatsApp Cloud API client
  await sendTextMessage(to, replyText);
}

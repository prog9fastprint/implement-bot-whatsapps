import { logger } from '../middleware/requestLogger.js';

/**
 * Parses and extracts messages and statuses from Meta's nested webhook payload structure.
 *
 * @param {object} payload - The raw validated Meta webhook body payload
 * @returns {object} - { messages: Array, statuses: Array }
 */
export function parseWebhook(payload) {
  const parsedMessages = [];
  const parsedStatuses = [];

  const entries = payload.entry || [];
  for (const entry of entries) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const value = change.value || {};

      // 1. Process incoming message status updates (sent, delivered, read, failed)
      if (value.statuses && Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          parsedStatuses.push({
            messageId: status.id,
            status: status.status,
            recipientId: status.recipient_id,
            timestamp: status.timestamp,
            errors: status.errors || null,
          });
        }
      }

      // 2. Process incoming messages (user interactions)
      if (value.messages && Array.isArray(value.messages)) {
        // Resolve WhatsApp sender profile name from value.contacts list
        const contacts = value.contacts || [];
        const contactProfileMap = new Map(
          contacts.map((contact) => [contact.wa_id, contact.profile?.name || ''])
        );

        for (const message of value.messages) {
          const from = message.from;
          const profileName = contactProfileMap.get(from) || '';

          const parsedMsg = {
            from,
            messageId: message.id,
            timestamp: message.timestamp,
            type: message.type,
            profileName,
          };

          // Parse specific fields based on message type
          switch (message.type) {
            case 'text':
              parsedMsg.body = message.text?.body || '';
              break;

            case 'audio':
              parsedMsg.mediaId = message.audio?.id || '';
              break;

            case 'image':
              parsedMsg.mediaId = message.image?.id || '';
              parsedMsg.caption = message.image?.caption || '';
              break;

            case 'location':
              parsedMsg.location = {
                latitude: message.location?.latitude,
                longitude: message.location?.longitude,
                name: message.location?.name || '',
                address: message.location?.address || '',
              };
              break;

            case 'interactive':
              const type = message.interactive?.type;
              if (type === 'button_reply') {
                parsedMsg.interactive = {
                  type: 'button_reply',
                  id: message.interactive.button_reply?.id || '',
                  title: message.interactive.button_reply?.title || '',
                };
              } else if (type === 'list_reply') {
                parsedMsg.interactive = {
                  type: 'list_reply',
                  id: message.interactive.list_reply?.id || '',
                  title: message.interactive.list_reply?.title || '',
                };
              } else {
                logger.warn(`Unknown interactive type received: ${type}`);
              }
              break;

            default:
              logger.warn(`Unsupported message type ignored: ${message.type}`);
              break;
          }

          parsedMessages.push(parsedMsg);
        }
      }
    }
  }

  return {
    messages: parsedMessages,
    statuses: parsedStatuses,
  };
}

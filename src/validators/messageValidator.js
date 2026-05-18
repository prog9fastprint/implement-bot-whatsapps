import { z } from 'zod';

/**
 * Zod schema for validating the parsed, normalized message object
 * that gets routed to our business logic layers.
 */
export const ParsedMessageSchema = z.object({
  from: z.string().regex(/^\d{10,15}$/, 'Invalid phone number format (must be 10-15 digits without +)'),
  messageId: z.string().min(1, 'Message ID is required'),
  timestamp: z.string().min(1, 'Timestamp is required'),
  type: z.enum(['text', 'audio', 'image', 'interactive', 'location']),
  profileName: z.string().default(''),
  body: z.string().max(4096, 'Body exceeds 4096 characters').optional(),
  mediaId: z.string().optional(),
  caption: z.string().max(1024, 'Caption exceeds 1024 characters').optional(),
  interactive: z.object({
    type: z.enum(['button_reply', 'list_reply']),
    id: z.string(),
    title: z.string(),
  }).optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    name: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
});

/**
 * Zod schema for validating the high-level Meta webhook structural envelope.
 */
export const MetaWebhookSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.literal('whatsapp'),
            metadata: z.object({
              display_phone_number: z.string().optional(),
              phone_number_id: z.string().optional(),
            }).optional(),
            contacts: z.array(
              z.object({
                profile: z.object({
                  name: z.string(),
                }),
                wa_id: z.string(),
              })
            ).optional(),
            messages: z.array(
              z.object({
                id: z.string(),
                from: z.string(),
                timestamp: z.string(),
                type: z.enum(['text', 'audio', 'image', 'interactive', 'location']),
                text: z.object({ body: z.string() }).optional(),
                audio: z.object({ id: z.string() }).optional(),
                image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
                interactive: z.object({
                  type: z.enum(['button_reply', 'list_reply']),
                  button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
                  list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
                }).optional(),
                location: z.object({
                  latitude: z.number(),
                  longitude: z.number(),
                  name: z.string().optional(),
                  address: z.string().optional(),
                }).optional(),
              })
            ).optional(),
            statuses: z.array(
              z.object({
                id: z.string(),
                status: z.enum(['sent', 'delivered', 'read', 'failed']),
                timestamp: z.string(),
                recipient_id: z.string(),
                errors: z.array(z.any()).optional(),
              })
            ).optional(),
          }),
          field: z.literal('messages'),
        })
      ),
    })
  ),
});

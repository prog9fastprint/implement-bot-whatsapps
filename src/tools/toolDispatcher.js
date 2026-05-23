import { checkStock, getProductPrice } from '../services/productService.js';
import { checkOrderStatus, createOrder } from '../services/orderService.js';
import { createComplaintTicket, getTicketStatus } from '../services/complaintService.js';
import { getProductRecommendation } from '../services/recommendationService.js';
import memoryService from '../services/memoryService.js';
import { logger } from '../middleware/requestLogger.js';
import { z } from 'zod';

const schemas = {
  check_stock: z.object({
    product_name: z.string(),
    size: z.string().optional(),
    color: z.string().optional(),
  }),
  get_product_price: z.object({
    product_name: z.string(),
    size: z.string().optional(),
  }),
  check_order_status: z.object({
    order_number: z.string().optional(),
    phone_number: z.string().optional(),
  }),
  create_complaint_ticket: z.object({
    subject: z.string(),
    description: z.string(),
    order_number: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  }),
  get_ticket_status: z.object({
    ticket_number: z.string(),
  }),
  get_product_recommendation: z.object({
    category: z.string().optional(),
    budget_max: z.number().optional(),
    preferences: z.string().optional(),
  }),
  search_memory: z.object({
    query: z.string(),
  }),
  save_memory: z.object({
    key: z.string(),
    value: z.string(),
    memory_type: z.string().optional(),
  }),
  place_order: z.object({
    items: z.array(z.object({
      variant_id: z.union([z.string(), z.number()]),
      quantity: z.number(),
    })),
  }),
};

/**
 * Dispatches tool calls from OpenAI to the appropriate backend services.
 * @param {Array} toolCalls - The tool_calls array from OpenAI response
 * @param {object} context - Additional context (userId, phoneNumber, etc.)
 * @returns {Promise<Array>} - Array of tool results for OpenAI
 */
export async function dispatchToolCalls(toolCalls, context) {
  const results = [];

  logger.debug('Dispatching tool calls with context:', { context });

  for (const toolCall of toolCalls) {
    const { id, function: fn } = toolCall;
    let args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments;
    let result;

    logger.info(`Dispatching tool call: ${fn.name}`, { arguments: args, context });

    try {
      // Validate schema if exists
      if (schemas[fn.name]) {
        args = schemas[fn.name].parse(args);
      }

      switch (fn.name) {
        case 'check_stock':
          result = await checkStock(args);
          break;

        case 'get_product_price':
          result = await getProductPrice(args);
          break;

        case 'check_order_status':
          // Use phone number from context if not provided in args
          result = await checkOrderStatus({
            ...args,
            phone_number: args.phone_number || context.phoneNumber,
          });
          break;

        case 'create_complaint_ticket':
          result = await createComplaintTicket({
            ...args,
            user_id: context.userId,
          });
          break;

        case 'get_ticket_status':
          result = await getTicketStatus(args);
          break;

        case 'get_product_recommendation':
          result = await getProductRecommendation({
            ...args,
            userId: context.userId,
          });
          break;

        case 'search_memory':
          result = await memoryService.loadUserMemory(context.userId, args.query);
          break;

        case 'save_memory':
          await memoryService.saveUserMemory(
            context.userId,
            args.memory_type || 'preference',
            args.key,
            args.value
          );
          result = { status: 'success', message: 'Memori berhasil disimpan.' };
          break;

        case 'place_order':
          result = await createOrder({
            userId: context.userId,
            items: args.items
          });
          break;

        default:
          result = { error: `Tool ${fn.name} not implemented.` };
          break;
      }
    } catch (error) {
      logger.error(`Tool execution error: ${fn.name}`, { error: error.message });
      result = { error: 'Terjadi kesalahan saat menjalankan perintah sistem.' };
    }

    results.push({
      tool_call_id: id,
      role: 'tool',
      name: fn.name,
      content: JSON.stringify(result),
    });
  }

  return results;
}

export default { dispatchToolCalls };

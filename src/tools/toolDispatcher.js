import { checkStock, getProductPrice } from '../services/productService.js';
import { checkOrderStatus } from '../services/orderService.js';
import { createComplaintTicket, getTicketStatus } from '../services/complaintService.js';
import { getProductRecommendation } from '../services/recommendationService.js';
import { logger } from '../middleware/requestLogger.js';

/**
 * Dispatches tool calls from OpenAI to the appropriate backend services.
 * @param {Array} toolCalls - The tool_calls array from OpenAI response
 * @param {object} context - Additional context (user_id, phone_number, etc.)
 * @returns {Promise<Array>} - Array of tool results for OpenAI
 */
export async function dispatchToolCalls(toolCalls, context) {
  const results = [];

  for (const toolCall of toolCalls) {
    const { id, function: fn } = toolCall;
    const args = JSON.parse(fn.arguments);
    let result;

    logger.info(`Dispatching tool call: ${fn.name}`, { arguments: args });

    try {
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

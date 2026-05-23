import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { dispatchToolCalls } from "./toolDispatcher.js";

/**
 * Maps our existing toolDefinitions to LangChain DynamicStructuredTools.
 * Since the implementation relies on dispatchToolCalls, we map each tool to trigger that dispatcher.
 */

const toolNames = [
  "check_stock",
  "get_product_price",
  "check_order_status",
  "create_complaint_ticket",
  "get_ticket_status",
  "get_product_recommendation",
  "search_memory",
  "save_memory",
  "place_order"
];

// Reusing schema definition approach for Zod validation
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

export const langchainTools = toolNames.map((name) => {
  return new DynamicStructuredTool({
    name,
    description: `Invoke tool: ${name}`, // LangChain uses this for agent logic
    schema: schemas[name],
    func: async (args, runManager) => {
      // Extract config from runManager
      const userId = runManager?.config?.configurable?.userId;
      const phoneNumber = runManager?.config?.configurable?.phoneNumber;
      
      // Proxy call to existing tool dispatcher
      const toolResults = await dispatchToolCalls(
        [{ function: { name, arguments: JSON.stringify(args) } }],
        {
          userId,
          phoneNumber
        }
      );
      // Return the content directly (already a JSON string)
      return toolResults[0].content;
    },
  });
});

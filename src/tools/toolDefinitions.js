/**
 * OpenAI tool definitions for the Nike Indonesia Assistant.
 * These schemas follow the OpenAI Function Calling format.
 */
export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'check_stock',
      description: 'Check real-time stock availability for a specific Nike product.',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'The name of the Nike product (e.g., Nike Air Max 90)',
          },
          size: {
            type: 'string',
            description: 'The shoe or clothing size (e.g., 42, XL)',
          },
          color: {
            type: 'string',
            description: 'The product color',
          },
        },
        required: ['product_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_price',
      description: 'Get the current price for a Nike product.',
      parameters: {
        type: 'object',
        properties: {
          product_name: {
            type: 'string',
            description: 'The name of the Nike product',
          },
          size: {
            type: 'string',
            description: 'Optional size to get specific pricing',
          },
        },
        required: ['product_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_order_status',
      description: 'Retrieve the current status and tracking info for an order.',
      parameters: {
        type: 'object',
        properties: {
          order_number: {
            type: 'string',
            description: 'The order number (e.g., ORD-20240101-0001)',
          },
          phone_number: {
            type: 'string',
            description: 'User phone number to look up orders',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_complaint_ticket',
      description: 'Create a new support ticket for a customer complaint.',
      parameters: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'Short summary of the issue',
          },
          description: {
            type: 'string',
            description: 'Detailed explanation of the complaint',
          },
          order_number: {
            type: 'string',
            description: 'Optional related order number',
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'The urgency of the complaint',
          },
        },
        required: ['subject', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ticket_status',
      description: 'Check the status of an existing customer complaint/ticket by its ticket number.',
      parameters: {
        type: 'object',
        properties: {
          ticket_number: {
            type: 'string',
            description: 'The complaint ticket number (e.g., TKT-20260101-0001)',
          },
        },
        required: ['ticket_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_recommendation',
      description: 'Get personalized Nike product recommendations based on preferences.',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Product category (e.g., running, lifestyle, football)',
          },
          budget_max: {
            type: 'number',
            description: 'Maximum price limit in IDR',
          },
          preferences: {
            type: 'string',
            description: 'User preferences (e.g., minimalist, bright colors)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Search long-term user memories and preferences (e.g. shoe size, color preferences) using a search query.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Query to search for in memories (e.g., "ukuran sepatu" or "warna")',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description: 'Save a new user memory or preference (e.g. shoe size, name, favorite color).',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'The label for the memory (e.g., "nama", "ukuran_sepatu", "warna_favorit")',
          },
          value: {
            type: 'string',
            description: 'The information to remember',
          },
          memory_type: {
            type: 'string',
            description: 'Optional category of memory (default: "preference")',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'place_order',
      description: 'Place a new order for Nike products after confirming stock and price.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                variant_id: {
                  type: 'string',
                  description: 'The unique UUID of the product variant (retrieved from check_stock or recommendations)',
                },
                quantity: {
                  type: 'integer',
                  description: 'Number of items to order',
                },
              },
              required: ['variant_id', 'quantity'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
];

export default toolDefinitions;

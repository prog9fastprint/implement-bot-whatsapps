# Bugfix Requirements Document

## Introduction

The AI assistant is hallucinating non-existent tool names (e.g., `search_product`) instead of using the 7 defined tools in the system. This causes "Tool not found" errors and prevents users from getting proper assistance with product inquiries. The root cause is that the system prompt in `aiRouter.js` provides minimal tool descriptions (e.g., "Tool: check_stock, Desc: Invoke tool: check_stock") which doesn't give the AI model sufficient guidance on which exact tool names exist and when to use them.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the AI model receives a user query about product availability (e.g., "Nike warna biru ukuran 42") THEN the system invents a non-existent tool name `search_product` instead of using the defined `check_stock` tool

1.2 WHEN the AI model attempts to call the hallucinated tool name THEN the system returns a "Tool not found" error and fails to execute the user's request

1.3 WHEN the system prompt includes only minimal tool descriptions like "Tool: check_stock, Desc: Invoke tool: check_stock" THEN the AI model lacks sufficient context to understand which exact tool names are available and their appropriate use cases

### Expected Behavior (Correct)

2.1 WHEN the AI model receives a user query about product availability (e.g., "Nike warna biru ukuran 42") THEN the system SHALL call the `check_stock` tool with appropriate parameters (product_name, size, color)

2.2 WHEN the AI model needs to execute a tool call THEN the system SHALL only use tool names from the defined set: `check_stock`, `get_product_price`, `check_order_status`, `create_complaint_ticket`, `get_ticket_status`, `get_product_recommendation`, `search_memory`

2.3 WHEN the system prompt is constructed THEN it SHALL include explicit listings of all available tool names with detailed descriptions of their parameters and use cases to prevent tool name hallucination

2.4 WHEN the system prompt describes available tools THEN it SHALL include clear mappings between common user query patterns and the appropriate tool to use (e.g., "untuk cek stok produk → gunakan check_stock")

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the AI model successfully identifies the correct tool to use THEN the system SHALL CONTINUE TO execute the tool call and return results to the user

3.2 WHEN the system prompt includes conversation history, memory context, and channel information THEN these SHALL CONTINUE TO be included in the formatted prompt

3.3 WHEN the AI model needs to call multiple tools in sequence THEN the system SHALL CONTINUE TO support the multi-turn conversation loop (up to MAX_TURNS)

3.4 WHEN tool execution completes successfully THEN the system SHALL CONTINUE TO save the tool results to conversation history and provide them to the AI model for generating the final response

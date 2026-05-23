# Fix Tool Hallucination Bugfix Design

## Overview

The AI assistant hallucinates non-existent tool names (e.g., `search_product`) instead of using the 7 defined tools, causing "Tool not found" errors. The root cause is minimal tool descriptions in the system prompt that provide insufficient guidance to the AI model. The fix involves enhancing the system prompt with explicit tool listings, detailed descriptions, parameter specifications, and usage examples to prevent hallucination while preserving all existing functionality.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when the AI model receives a user query requiring tool usage but the system prompt contains only minimal tool descriptions (e.g., "Tool: check_stock, Desc: Invoke tool: check_stock")
- **Property (P)**: The desired behavior when the AI needs to use tools - it should only call tools from the defined set using exact tool names with appropriate parameters
- **Preservation**: Existing tool execution, conversation history, memory context, and multi-turn conversation functionality that must remain unchanged by the fix
- **toolDefinitions**: The array in `src/tools/toolDefinitions.js` containing the 7 OpenAI function definitions with complete schemas
- **langchainTools**: The array in `src/tools/langchainTools.js` that wraps toolDefinitions for LangChain compatibility
- **SYSTEM_PROMPT**: The template string in `src/services/aiRouter.js` that defines the AI assistant's identity, instructions, and available tools
- **toolsDesc**: The dynamically generated string that describes available tools, currently using minimal descriptions from langchainTools

## Bug Details

### Bug Condition

The bug manifests when the AI model receives a user query that requires tool usage (e.g., product search, stock check, order status) but the system prompt provides only minimal tool descriptions. The `SYSTEM_PROMPT` construction in `aiRouter.js` is generating insufficient tool context by mapping `langchainTools` to strings like "Tool: check_stock, Desc: Invoke tool: check_stock", which doesn't provide the AI model with enough information about tool parameters, use cases, or when to use each tool.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { userQuery: string, systemPrompt: string, availableTools: Tool[] }
  OUTPUT: boolean
  
  RETURN input.userQuery REQUIRES_TOOL_USAGE
         AND input.systemPrompt CONTAINS_MINIMAL_TOOL_DESCRIPTIONS
         AND NOT input.systemPrompt CONTAINS_EXPLICIT_TOOL_NAMES_AND_PARAMETERS
         AND NOT input.systemPrompt CONTAINS_USAGE_EXAMPLES
END FUNCTION

WHERE:
  REQUIRES_TOOL_USAGE = query asks about products, stock, orders, complaints, or recommendations
  CONTAINS_MINIMAL_TOOL_DESCRIPTIONS = descriptions like "Invoke tool: {name}" without parameter details
  CONTAINS_EXPLICIT_TOOL_NAMES_AND_PARAMETERS = lists exact tool names with parameter schemas
  CONTAINS_USAGE_EXAMPLES = includes mappings between query patterns and appropriate tools
```

### Examples

- **Example 1**: User asks "Nike warna biru ukuran 42" → AI hallucinates `search_product` instead of using `check_stock` with parameters `{product_name: "Nike", color: "biru", size: "42"}`
- **Example 2**: User asks "Cek harga Nike Air Max" → AI might hallucinate `get_price` or `search_price` instead of using `get_product_price` with parameter `{product_name: "Nike Air Max"}`
- **Example 3**: User asks "Status pesanan saya ORD-123" → AI might hallucinate `track_order` instead of using `check_order_status` with parameter `{order_number: "ORD-123"}`
- **Edge Case**: User asks "Rekomendasi sepatu lari budget 1 juta" → AI should use `get_product_recommendation` with parameters `{category: "running", budget_max: 1000000}` but might hallucinate `recommend_product` or `search_by_budget`

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Tool execution flow must continue to work exactly as before (tool call detection, parsing, invocation, result handling)
- Conversation history, memory context, and summary context must continue to be included in the system prompt
- Multi-turn conversation loop (up to MAX_TURNS) must continue to support sequential tool calls
- Tool result saving to conversation history must remain unchanged
- Final response extraction and message sending must remain unchanged
- Error handling for invalid tool calls must remain unchanged

**Scope:**
All inputs that do NOT involve the system prompt construction for tool descriptions should be completely unaffected by this fix. This includes:
- Tool dispatcher logic in `toolDispatcher.js`
- Tool definitions in `toolDefinitions.js` and `langchainTools.js`
- Message handling, conversation management, and memory service operations
- WhatsApp and Telegram message sending
- Summarization and retry logic

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Insufficient Tool Description Generation**: The current implementation generates tool descriptions using:
   ```javascript
   const toolsDesc = langchainTools.map(t => `Tool: ${t.name}, Desc: ${t.description}`).join('\n');
   ```
   This produces minimal descriptions like "Tool: check_stock, Desc: Invoke tool: check_stock" which doesn't provide parameter information or use case guidance.

2. **Missing Parameter Schema Information**: The `langchainTools` array contains Zod schemas with complete parameter definitions, but these are not being extracted and included in the system prompt. The AI model needs to know what parameters each tool accepts.

3. **Lack of Usage Examples**: The system prompt doesn't include mappings between common user query patterns (in Indonesian) and the appropriate tool to use, leaving the AI model to guess which tool name to use.

4. **No Explicit Tool Name Listing**: The system prompt doesn't explicitly list all 7 available tool names, making it easier for the AI model to hallucinate similar-sounding names.

## Correctness Properties

Property 1: Bug Condition - AI Uses Only Defined Tool Names

_For any_ user query that requires tool usage (product search, stock check, order status, complaints, recommendations, memory search), the fixed system prompt SHALL provide sufficient context (explicit tool names, parameter schemas, usage examples) such that the AI model calls only tools from the defined set: `check_stock`, `get_product_price`, `check_order_status`, `create_complaint_ticket`, `get_ticket_status`, `get_product_recommendation`, `search_memory`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Tool Execution and Conversation Flow

_For any_ system behavior that is NOT related to the tool description generation in the system prompt (tool execution, conversation history, memory context, multi-turn loops, message sending), the fixed code SHALL produce exactly the same behavior as the original code, preserving all existing functionality for tool invocation, result handling, and conversation management.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/services/aiRouter.js`

**Function**: `routeMessageToAI`

**Specific Changes**:

1. **Replace Minimal Tool Description Generation**: Replace the current line:
   ```javascript
   const toolsDesc = langchainTools.map(t => `Tool: ${t.name}, Desc: ${t.description}`).join('\n');
   ```
   With a comprehensive tool description generator that extracts information from `toolDefinitions.js` (which contains complete OpenAI function schemas with parameter details).

2. **Import toolDefinitions**: Add import at the top of the file:
   ```javascript
   import { toolDefinitions } from '../tools/toolDefinitions.js';
   ```

3. **Create Enhanced Tool Description Generator**: Implement a function that generates detailed tool descriptions including:
   - Explicit tool name
   - Clear description of what the tool does
   - Complete parameter list with types and descriptions
   - Required vs optional parameters
   - Usage examples in Indonesian

4. **Add Usage Pattern Mappings**: Include in the system prompt a section that maps common Indonesian query patterns to appropriate tools:
   ```
   PANDUAN PEMILIHAN TOOL:
   - Untuk cek stok/ketersediaan produk → gunakan check_stock
   - Untuk cek harga produk → gunakan get_product_price
   - Untuk cek status pesanan → gunakan check_order_status
   - Untuk buat keluhan/komplain → gunakan create_complaint_ticket
   - Untuk cek status tiket → gunakan get_ticket_status
   - Untuk rekomendasi produk → gunakan get_product_recommendation
   - Untuk cari memori/preferensi user → gunakan search_memory
   ```

5. **Update SYSTEM_PROMPT Template**: Modify the system prompt to include the enhanced tool descriptions and usage patterns, replacing the placeholder `${"TOOLS_DESC"}` with structured tool information.

**Implementation Approach**:
```javascript
// Generate enhanced tool descriptions from toolDefinitions
const generateToolDescriptions = () => {
  return toolDefinitions.map(tool => {
    const func = tool.function;
    const params = func.parameters.properties;
    const required = func.parameters.required || [];
    
    let desc = `\n**${func.name}**\n`;
    desc += `Deskripsi: ${func.description}\n`;
    desc += `Parameter:\n`;
    
    for (const [paramName, paramDef] of Object.entries(params)) {
      const isRequired = required.includes(paramName);
      desc += `  - ${paramName} (${paramDef.type})${isRequired ? ' [WAJIB]' : ' [OPSIONAL]'}: ${paramDef.description}\n`;
    }
    
    return desc;
  }).join('\n');
};

const toolsDesc = generateToolDescriptions();

// Add usage pattern guide
const toolUsageGuide = `
PANDUAN PEMILIHAN TOOL:
- Untuk cek stok/ketersediaan produk → gunakan check_stock
- Untuk cek harga produk → gunakan get_product_price
- Untuk cek status pesanan → gunakan check_order_status
- Untuk buat keluhan/komplain → gunakan create_complaint_ticket
- Untuk cek status tiket → gunakan get_ticket_status
- Untuk rekomendasi produk → gunakan get_product_recommendation
- Untuk cari memori/preferensi user → gunakan search_memory

TOOL YANG TERSEDIA (HANYA GUNAKAN NAMA INI):
check_stock, get_product_price, check_order_status, create_complaint_ticket, get_ticket_status, get_product_recommendation, search_memory
`;
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate user queries requiring tool usage and inspect the system prompt generated by the unfixed code. Verify that the system prompt contains only minimal tool descriptions. Then, send these queries to the AI model and observe tool call attempts to capture hallucinated tool names.

**Test Cases**:
1. **Product Search Test**: Send query "Nike warna biru ukuran 42" to unfixed code → Expect AI to hallucinate `search_product` or similar (will fail on unfixed code)
2. **Price Check Test**: Send query "Cek harga Nike Air Max" to unfixed code → Expect AI to hallucinate `get_price` or `search_price` (will fail on unfixed code)
3. **Order Status Test**: Send query "Status pesanan ORD-123" to unfixed code → Expect AI to hallucinate `track_order` or similar (will fail on unfixed code)
4. **System Prompt Inspection Test**: Generate system prompt with unfixed code → Verify it contains "Tool: check_stock, Desc: Invoke tool: check_stock" without parameter details (will confirm root cause)

**Expected Counterexamples**:
- AI model generates tool calls with non-existent tool names
- System logs show "Tool not found" errors
- System prompt inspection reveals minimal tool descriptions without parameter schemas
- Possible causes: insufficient tool context, missing parameter information, no usage examples

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds (user queries requiring tool usage), the fixed function produces the expected behavior (AI uses only defined tool names).

**Pseudocode:**
```
FOR ALL userQuery WHERE requiresToolUsage(userQuery) DO
  systemPrompt := generateSystemPrompt_fixed(userQuery)
  aiResponse := callAI(systemPrompt, userQuery)
  toolCall := extractToolCall(aiResponse)
  
  ASSERT toolCall.name IN ['check_stock', 'get_product_price', 'check_order_status', 
                            'create_complaint_ticket', 'get_ticket_status', 
                            'get_product_recommendation', 'search_memory']
  ASSERT systemPrompt CONTAINS_DETAILED_TOOL_DESCRIPTIONS
  ASSERT systemPrompt CONTAINS_PARAMETER_SCHEMAS
  ASSERT systemPrompt CONTAINS_USAGE_GUIDE
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (system behaviors unrelated to tool description generation), the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL operation WHERE NOT isToolDescriptionGeneration(operation) DO
  ASSERT routeMessageToAI_original(operation) = routeMessageToAI_fixed(operation)
END FOR

WHERE operations include:
  - Tool call parsing and execution
  - Conversation history loading
  - Memory context loading
  - Message saving
  - Multi-turn conversation loop
  - Final response extraction
  - Message sending (WhatsApp/Telegram)
  - Error handling
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for tool execution, conversation flow, and message handling, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Tool Execution Preservation**: Observe that tool calls with correct names execute successfully on unfixed code, then verify this continues after fix
2. **Conversation History Preservation**: Observe that conversation history is loaded and included in messages array on unfixed code, then verify this continues after fix
3. **Memory Context Preservation**: Observe that memory context is formatted and included in system prompt on unfixed code, then verify this continues after fix
4. **Multi-turn Loop Preservation**: Observe that sequential tool calls work correctly on unfixed code, then verify this continues after fix
5. **Message Sending Preservation**: Observe that final responses are sent via WhatsApp/Telegram on unfixed code, then verify this continues after fix

### Unit Tests

- Test enhanced tool description generation with all 7 tools
- Test that generated descriptions include tool names, parameters, types, and required/optional indicators
- Test that usage guide is correctly formatted and includes all tool names
- Test that system prompt construction includes enhanced tool descriptions
- Test edge cases (empty tool list, missing parameter descriptions)

### Property-Based Tests

- Generate random user queries requiring different tools and verify the fixed system prompt always includes detailed tool descriptions
- Generate random tool definition schemas and verify the description generator correctly extracts all parameter information
- Test that all tool names from toolDefinitions are present in the generated descriptions
- Test that the usage guide includes mappings for all 7 tools

### Integration Tests

- Test full message flow with product search query and verify AI uses `check_stock` (not hallucinated names)
- Test full message flow with price check query and verify AI uses `get_product_price`
- Test full message flow with order status query and verify AI uses `check_order_status`
- Test that tool execution, result handling, and final response generation work correctly with enhanced system prompt
- Test that conversation history and memory context are still properly included after fix

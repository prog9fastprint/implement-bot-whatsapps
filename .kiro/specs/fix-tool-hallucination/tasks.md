## Implementation Plan

## Overview
This task plan implements the fix for the tool hallucination bug where the AI assistant invents non-existent tool names (e.g., `search_product`) instead of using the 7 defined tools. The fix enhances the system prompt with detailed tool descriptions, parameter schemas, and usage examples to prevent hallucination while preserving all existing functionality.

---

## Tasks

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - AI Hallucinates Non-Existent Tool Names
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (AI calling hallucinated tool names like `search_product`, `get_price`, `track_order`)
  - **Scoped PBT Approach**: Scope the property to concrete failing cases - user queries requiring tool usage with minimal tool descriptions in system prompt
  - Test implementation details from Bug Condition in design:
    - User query requires tool usage (product search, stock check, order status, etc.)
    - System prompt contains only minimal tool descriptions (e.g., "Tool: check_stock, Desc: Invoke tool: check_stock")
    - System prompt does NOT contain explicit tool names with parameter schemas
    - System prompt does NOT contain usage examples
  - The test assertions should match the Expected Behavior Properties from design:
    - AI should call ONLY tools from defined set: `check_stock`, `get_product_price`, `check_order_status`, `create_complaint_ticket`, `get_ticket_status`, `get_product_recommendation`, `search_memory`
    - System prompt should contain detailed tool descriptions with parameter schemas
    - System prompt should contain usage guide mapping query patterns to tools
  - Test cases to implement:
    1. Product search query "Nike warna biru ukuran 42" → Verify AI attempts to call a tool (expect hallucinated name on unfixed code)
    2. Price check query "Cek harga Nike Air Max" → Verify AI attempts to call a tool (expect hallucinated name on unfixed code)
    3. Order status query "Status pesanan ORD-123" → Verify AI attempts to call a tool (expect hallucinated name on unfixed code)
    4. System prompt inspection → Verify it contains minimal descriptions without parameter details (confirms root cause)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found:
    - Which hallucinated tool names appear (e.g., `search_product`, `get_price`, `track_order`)
    - Which queries trigger hallucination
    - Confirm system prompt lacks parameter schemas and usage examples
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Tool Execution and Conversation Flow Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (operations NOT related to tool description generation):
    1. Tool call parsing and execution with correct tool names
    2. Conversation history loading and inclusion in messages array
    3. Memory context loading and formatting in system prompt
    4. Multi-turn conversation loop for sequential tool calls
    5. Final response extraction and message sending (WhatsApp/Telegram)
    6. Error handling for invalid tool calls
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements:
    - Tool execution flow works exactly as before (tool call detection, parsing, invocation, result handling)
    - Conversation history, memory context, and summary context are included in system prompt
    - Multi-turn conversation loop (up to MAX_TURNS) supports sequential tool calls
    - Tool result saving to conversation history remains unchanged
    - Final response extraction and message sending remain unchanged
    - Error handling for invalid tool calls remains unchanged
  - Property-based testing generates many test cases for stronger guarantees
  - Test cases to implement:
    1. Tool execution preservation: Simulate tool call with correct name (e.g., `check_stock`) → Verify execution succeeds
    2. Conversation history preservation: Load conversation history → Verify it's included in messages array
    3. Memory context preservation: Load memory context → Verify it's formatted and included in system prompt
    4. Multi-turn loop preservation: Simulate sequential tool calls → Verify loop handles multiple turns correctly
    5. Message sending preservation: Generate final response → Verify it's sent via WhatsApp/Telegram
    6. Error handling preservation: Simulate invalid tool call → Verify error handling works correctly
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 3. Fix for tool hallucination bug

  - [ ] 3.1 Implement enhanced tool description generation in aiRouter.js
    - Add import for toolDefinitions at top of file:
      ```javascript
      import { toolDefinitions } from '../tools/toolDefinitions.js';
      ```
    - Create `generateToolDescriptions()` function that extracts information from toolDefinitions:
      - Iterate through toolDefinitions array
      - For each tool, extract: name, description, parameters (with types, descriptions, required/optional indicators)
      - Format as structured text in Indonesian with clear sections
      - Include parameter list with type annotations and required/optional markers
      - Return formatted string with all 7 tools described in detail
    - Create `generateToolUsageGuide()` function that provides usage pattern mappings:
      - Map common Indonesian query patterns to appropriate tools
      - Include explicit list of all 7 tool names
      - Format as clear guide section in Indonesian
    - Replace the current minimal tool description generation line:
      ```javascript
      const toolsDesc = langchainTools.map(t => `Tool: ${t.name}, Desc: ${t.description}`).join('\n');
      ```
      With enhanced generation:
      ```javascript
      const toolsDesc = generateToolDescriptions();
      const toolUsageGuide = generateToolUsageGuide();
      ```
    - Update SYSTEM_PROMPT template to include both toolsDesc and toolUsageGuide
    - Ensure the enhanced descriptions are inserted at the `${"TOOLS_DESC"}` placeholder
    - Verify that all other parts of SYSTEM_PROMPT remain unchanged (persona, RAG strictness, memory instructions, tool call format)
    - _Bug_Condition: isBugCondition(input) where input.userQuery requires tool usage AND input.systemPrompt contains minimal tool descriptions without parameter schemas or usage examples_
    - _Expected_Behavior: For all user queries requiring tool usage, the system prompt SHALL include detailed tool descriptions with parameter schemas and usage guide, causing AI to call only defined tool names (check_stock, get_product_price, check_order_status, create_complaint_ticket, get_ticket_status, get_product_recommendation, search_memory)_
    - _Preservation: Tool execution flow, conversation history loading, memory context loading, multi-turn loop, message saving, final response extraction, message sending, and error handling SHALL remain unchanged_
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - AI Uses Only Defined Tool Names
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied:
      - AI calls only tools from defined set (no hallucinated names)
      - System prompt contains detailed tool descriptions with parameter schemas
      - System prompt contains usage guide mapping query patterns to tools
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify for all test cases:
      1. Product search query → AI calls `check_stock` (not `search_product`)
      2. Price check query → AI calls `get_product_price` (not `get_price`)
      3. Order status query → AI calls `check_order_status` (not `track_order`)
      4. System prompt inspection → Contains detailed descriptions with parameter schemas and usage guide
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Tool Execution and Conversation Flow Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      1. Tool execution preservation: Tool calls with correct names execute successfully
      2. Conversation history preservation: History is loaded and included in messages array
      3. Memory context preservation: Memory context is formatted and included in system prompt
      4. Multi-turn loop preservation: Sequential tool calls work correctly
      5. Message sending preservation: Final responses are sent via WhatsApp/Telegram
      6. Error handling preservation: Invalid tool calls are handled correctly
    - Verify no regressions in:
      - Tool dispatcher logic
      - Message handling and conversation management
      - Memory service operations
      - WhatsApp and Telegram message sending
      - Summarization and retry logic
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run all tests (bug condition + preservation) and verify they pass
  - Manually test with sample queries to confirm AI uses correct tool names
  - Review system prompt output to verify enhanced descriptions are present
  - Check logs for any "Tool not found" errors (should be eliminated)
  - If any issues arise, document them and ask the user for guidance

---

## Notes

### Testing Framework
- Tests should be written using the project's existing test framework (check package.json for test runner)
- If no test framework exists, set up Jest or Mocha for Node.js testing
- Property-based tests can use fast-check library for JavaScript

### Test File Location
- Create test file at: `src/services/__tests__/aiRouter.test.js`
- Or follow existing test directory structure if present

### Key Implementation Details
- The enhanced tool descriptions should be in Indonesian to match the system prompt language
- Parameter schemas should clearly indicate required vs optional parameters
- Usage guide should map common query patterns to exact tool names
- All 7 tools must be included: check_stock, get_product_price, check_order_status, create_complaint_ticket, get_ticket_status, get_product_recommendation, search_memory

### Success Criteria
- Bug condition test fails on unfixed code (confirms bug exists)
- Bug condition test passes on fixed code (confirms bug is fixed)
- Preservation tests pass on both unfixed and fixed code (confirms no regressions)
- Manual testing shows AI uses correct tool names for various query types
- No "Tool not found" errors in logs after fix

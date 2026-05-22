# LangChain & ChromaDB Integration Walkthrough

This document outlines the changes made to integrate LangChain and ChromaDB into the Nike Indonesia Assistant.

## 1. Core Architecture Changes
We moved from a raw OpenAI SDK implementation to LangChain's `ChatOpenAI` abstraction. This provides better scalability and standardizes our interface for future agentic workflows.

### Components
- **`src/services/openai.js`**: Now uses `ChatOpenAI`. Custom baseURL and headers are passed via the `configuration` object, maintaining compatibility with OpenRouter.
- **`src/tools/langchainTools.js`**: New registry that wraps legacy tool definitions as `DynamicStructuredTool` instances. This acts as a bridge between the LangChain agent loop and our existing tool dispatcher.
- **`src/services/memoryService.js`**: Integrated `Chroma` vector store. Long-term memory is now stored semantically, allowing `similaritySearch` based on user queries, improving contextual recall.

## 2. Updated AI Router Logic (`src/services/aiRouter.js`)
The router remains the orchestrator but now consumes LangChain-compatible tools. 
- **Tool Retrieval**: Tools are injected into the system prompt via `langchainTools` descriptions.
- **XML Parsing**: Maintained the `<tool_call>` loop for OpenRouter compatibility.
- **Memory Retrieval**: `loadUserMemory` now accepts a query parameter for semantic search in ChromaDB, falling back to SQL for exact matches.

## 3. ChromaDB Setup
We utilized the community Chroma implementation.
- **Implementation**: Local connection (default `http://localhost:8000`).
- **Embedding Model**: Used `OpenAIEmbeddings` for consistent vector generation.

## 4. How to Verify
1. **Tool Calling**: Send a message to the bot requiring stock lookup (e.g., "Cek stok Nike Air Max 90"). The bot should generate a `<tool_call>` block.
2. **Semantic Memory**: Send a preference message (e.g., "Saya suka sepatu warna biru"). Later, ask "Warna sepatu apa yang saya suka?". The bot should use `similaritySearch` via ChromaDB to recall this preference.

## 5. Potential Side Effects
- **Connection**: If the Chroma server at `localhost:8000` is down, semantic search will fail and fallback to SQL (if implemented). 
- **Latency**: Initial embedding calls may add slight latency.

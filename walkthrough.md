# AI Nike Assistant — Project Walkthrough

This document provides a comprehensive overview of the current state of the AI Nike Assistant project (Phases 1-3 Complete).

---

## 1. Project Overview
The **AI Nike Assistant** is a production-ready chatbot platform designed for Nike Indonesia. It leverages Meta's official WhatsApp Cloud API and Telegram Bot API to provide intelligent customer service, including product inquiries, order tracking, and complaint handling.

### Core Technologies
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **AI**: OpenAI GPT-4o (via OpenRouter/Direct)
- **Database**: PostgreSQL with `pgvector` for semantic memory
- **Embeddings**: Google Gemini (`gemini-embedding-001`)
- **Orchestration**: LangChain.js (Tools integration)
- **Validation**: Zod (Runtime schema safety)
- **Logging**: Winston (Structured JSON) + Morgan

---

## 2. Architecture & Message Flow
The system follows a modular architecture where the "AI Router" acts as the central brain.

### High-Level Flow:
1.  **Ingress**:
    - **WhatsApp**: Meta sends a POST request to `/webhook`. The signature is verified via HMAC-SHA256.
    - **Telegram**: The bot initializes via `telegraf` (in `src/services/telegram.js`) and listens for updates.
2.  **Parsing & Validation**: Messages are flattened and validated using Zod schemas in `src/parsers/` and `src/validators/`.
3.  **AI Routing**:
    - The `aiRouter.js` loads user context: Long-term memories (via semantic search in `ai_memories`), recent history, and conversation summary.
    - It constructs a rich system prompt including dynamic tool descriptions.
4.  **Reasoning Loop (Tool Calling)**:
    - AI determines if it needs a tool (e.g., `check_stock`).
    - It outputs a `<tool_call>` JSON block.
    - The router executes the tool via `langchainTools.js` and feeds the result back to the AI.
5.  **Persistence**: Every message, tool call, and result is saved to PostgreSQL to ensure full traceability and context retention.
6.  **Egress**: The final AI response is sent back to the user via the appropriate service (`whatsapp.js` or `telegram.js`).
7.  **Post-Processing**: `summarizationService.js` checks if the conversation needs to be summarized (default: after 50 messages) to maintain a lean context window.

---

## 3. Key Components & Features

### 🧠 AI & Memory
- **`src/services/aiRouter.js`**: Orchestrates the multi-turn interaction loop.
- **`src/services/memoryService.js`**: Manages user profiles and semantic memory. Uses `pgvector` for similarity search based on user queries, allowing the AI to "remember" facts like shoe size or color preferences.
- **`src/services/summarizationService.js`**: Automatically compresses long conversations into concise summaries stored in the database.

### 🛒 Business Logic (Tools)
- **`src/services/productService.js`**: Real-time stock and price lookups using fuzzy matching (`ILIKE`) against the `products` and `product_variants` tables.
- **`src/services/orderService.js`**: Secure order status tracking by order number or phone number.
- **`src/services/complaintService.js`**: Generates formal support tickets (`TKT-YYYYMMDD-XXXX`) and tracks their status in the `complaints` table.
- **`src/services/recommendationService.js`**: Combines user preferences (size, color) from memory with database stock to provide personalized suggestions.

### 🛡️ Security & Reliability
- **HMAC Verification**: Ensures only Meta can trigger the WhatsApp webhook.
- **Rate Limiting**: Global and per-user limits to protect the API from abuse.
- **Deduplication**: Prevents processing the same WhatsApp message multiple times using `whatsapp_msg_id`.
- **Retry Logic**: `src/utils/retry.js` handles transient API failures with exponential backoff.

---

## 4. Directory Structure
```
whatsapp-bot/
├── src/
│   ├── app.js               # Express configuration
│   ├── index.js             # Entry point (Server + Telegram start)
│   ├── config/              # Env validation & configuration
│   ├── handlers/            # Message & Telegram event handlers
│   ├── services/            # Core business logic & API clients
│   ├── tools/               # LangChain tool definitions & dispatcher
│   ├── database/            # Client, migrations, and seed data
│   ├── middleware/          # Security, Logging, Error handling
│   ├── parsers/             # Payload flattening (Meta)
│   └── validators/          # Zod schema definitions
├── database/                # SQL scripts (init, pgvector)
├── docs/                    # Detailed documentation suite (00-context to 08-step-by-step)
└── task/                    # Phase-specific walkthroughs & development tasks
```

---

## 5. Current Implementation Status
The project has successfully completed **Phase 3** of the implementation plan.

- ✅ **Phase 1: Foundation**: Webhook handshake, WhatsApp client, Logging, Security, and Echo tests.
- ✅ **Phase 2: AI Core**: OpenAI integration, Multi-turn reasoning loop, pgvector semantic memory.
- ✅ **Phase 3: Business Logic**: Real stock lookups, order tracking, complaint ticketing, and personalized recommendations.
- 🕒 **Phase 4: Advanced Features**: (Planned) Voice (Whisper), Vision (GPT-4o), RAG for Documents, and Redis caching.
- 🕒 **Phase 5: Infrastructure**: (Planned) Dockerization, Nginx setup, and Production deployment.

---

## 6. How to Run & Verify
1.  **Install Dependencies**: `npm install`
2.  **Environment Setup**: Fill in `.env` (refer to `.env.example`).
3.  **Database Migration**:
    - Execute `database/init.sql` to set up tables and triggers.
    - Execute `database/pgvector_migration.sql` to enable vector search.
4.  **Start Server**: `npm run dev`
5.  **Verify**:
    - `GET /health` should return `status: "ok"`.
    - Send a message like "Cek stok Nike Air Max" to verify the AI and database integration.

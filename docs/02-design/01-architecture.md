# 01 — System Architecture

## High-Level Architecture Diagram

```
WhatsApp User
     │
     ▼ (HTTPS)
WhatsApp Cloud API (Meta)
     │
     ▼ (Webhook POST)
┌─────────────────────────────────────────────┐
│            Express.js Webhook Server         │
│  ┌──────────────────────────────────────┐   │
│  │         Request Pipeline              │   │
│  │  1. Webhook Signature Verification   │   │
│  │  2. Rate Limiter                     │   │
│  │  3. Input Validator                  │   │
│  │  4. Message Parser                   │   │
│  └──────────────────────────────────────┘   │
└────────────────────┬────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────┐
│               AI Router                      │
│  Decides which services to invoke based on  │
│  message type and user intent               │
└──┬──────┬──────┬──────┬──────┬──────┬──────┘
   │      │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼      ▼
OpenAI  Memory Product  Order Complaint  RAG
Service Service Service Service Service Service
   │      │      │      │      │      │
   └──────┴──────┴──────┴──────┴──────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      Redis Cache          PostgreSQL
   (short-term memory,    (long-term memory,
    session data,          users, orders,
    rate limits)           products, complaints)
                                │
                                ▼
                           ChromaDB
                      (RAG vector store)
```

---

## Component Responsibilities

### Webhook Server (Express.js)
- Entry point for all WhatsApp events
- Handles webhook GET verification (Meta handshake)
- Handles webhook POST events (incoming messages, status updates)
- Applies rate limiting and input validation before any processing

### AI Router
- Determines message type: `text` | `audio` | `image` | `interactive`
- Extracts sender's WhatsApp number (used as user identity key)
- Dispatches to the correct service(s)
- Assembles the final reply and sends it via WhatsApp Cloud API

### OpenAI Service
- Manages conversation context (system prompt + history)
- Handles function/tool calling lifecycle
- Calls Whisper API for audio transcription
- Calls GPT-4o Vision for image understanding

### Memory Service
- **Short-term**: Redis — last N messages in current session
- **Long-term**: PostgreSQL `ai_memories` table — persisted facts
- **Summaries**: Periodic GPT summarization stored in `ai_summaries`
- Key: always the user's WhatsApp phone number

### Product Service
- Queries PostgreSQL for real-time stock and pricing
- Never estimates or guesses inventory — always DB-sourced
- Exposes `check_stock` and `get_product_price` tool functions

### Order Service
- Queries PostgreSQL for order status by order ID or user
- Exposes `check_order_status` tool function

### Complaint Service
- Creates, reads, and updates support tickets
- Exposes `create_complaint_ticket` tool function

### RAG Service
- Loads PDF/text documents into ChromaDB via LangChain
- Performs semantic similarity search on user queries
- Injects relevant context into OpenAI prompt

### Redis Cache
- Session short-term memory (TTL: configurable, default 1 hour)
- Rate limit counters per phone number
- Frequently queried product data (TTL: 5 minutes)

### PostgreSQL
- Source of truth for all persistent data
- See `03-database-schema.md` for full schema

### ChromaDB
- Vector store for RAG embeddings
- Stores embedded chunks from PDFs, FAQs, SOPs

---

## Data Flow: Typical Text Message

```
1. User sends "Apakah stok Nike Air size 42 masih ada?"
2. WhatsApp Cloud API sends POST to /webhook
3. Webhook server verifies signature → parses message
4. AI Router identifies: text message, extracts phone number
5. Memory Service loads conversation history from Redis + PostgreSQL
6. RAG Service searches ChromaDB for relevant product context
7. OpenAI Service receives: system prompt + memory + RAG context + user message
8. OpenAI decides to call tool: check_stock({ product: "Nike Air", size: "42" })
9. Product Service queries PostgreSQL → returns { stock: 8, unit: "pcs" }
10. OpenAI generates natural language reply using tool result
11. AI Router sends reply via WhatsApp Cloud API
12. Memory Service saves new exchange to Redis + PostgreSQL
```

---

## Data Flow: Voice Note

```
1. User sends voice note
2. Webhook receives audio message event
3. AI Router downloads audio file via WhatsApp Media API
4. OpenAI Service sends audio to Whisper API → gets transcript
5. Transcript treated as text → follows standard text flow above
```

---

## Data Flow: Image Message

```
1. User sends product image
2. Webhook receives image message event
3. AI Router downloads image via WhatsApp Media API
4. OpenAI Service sends image to GPT-4o Vision with prompt
5. Vision response: product identification + recommendations
6. Reply sent to user via WhatsApp Cloud API
```

---

## Scalability Design Decisions

| Decision | Reason |
|----------|--------|
| Stateless Express server | Can be horizontally scaled behind a load balancer |
| Redis for sessions | Fast, TTL-managed, shared across instances |
| PostgreSQL for persistence | ACID-compliant, relational integrity |
| ChromaDB for vectors | Dedicated vector search, not polluting main DB |
| Docker containers | Reproducible, portable, easy to orchestrate |
| Environment variables for all secrets | 12-factor app compliance |

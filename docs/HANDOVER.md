# Session Handover — AI WhatsApp Chatbot Project

> **Date**: 2026-05-18
> **Project Root**: `f:\prog9\plan-implement-whatsapps-bot`
> **Status**: Phase 1 (Foundation, Steps 1–6) complete. Ready to start Phase 2 (AI Core, Step 7).

---

## What This Project Is

A **production-ready AI-powered WhatsApp chatbot SaaS platform** that:
- Uses **only** Meta's official WhatsApp Cloud API (Baileys and all unofficial libraries are **banned**)
- Integrates OpenAI (GPT-4o for chat + function calling, Whisper for voice, Vision for images)
- Maintains persistent per-user memory (Redis short-term + PostgreSQL long-term)
- Supports real-time data queries (stock, orders, complaints) via function calling — **never hallucinated**
- Includes a RAG knowledge base (LangChain + ChromaDB) for PDF/FAQ document search
- Is containerized (Docker Compose) and deployable to Ubuntu VPS with Nginx + SSL

---

## Documentation Structure (Already Written — READ THESE FIRST)

All project specifications live in `docs/`. Load them in order:

```
docs/
├── 01-core/
│   ├── 00-context.md          ← AI role, non-negotiable rules, output format, code standards
│   └── 02-tech-stack.md       ← Full tech stack with versions and rationale
├── 02-design/
│   ├── 01-architecture.md     ← System architecture diagram, component responsibilities, data flows
│   └── 03-database-schema.md  ← Full PostgreSQL schema (9 tables, ENUMs, indexes, triggers, seed data)
├── 03-specifications/
│   ├── 04-api-contracts.md    ← WhatsApp Cloud API contracts (webhook, messages, media, dedup, rate limits)
│   ├── 05-features.md         ← 9 features: memory, tools, stock, orders, complaints, voice, image, RAG, recommendations
│   └── 06-security.md         ← HMAC verification, rate limiting, Zod validation, parameterized queries, Winston logging
├── 04-operations/
│   └── 07-deployment.md       ← Docker Compose (5 services), Dockerfile, Nginx, SSL, backups, scaling
└── 05-roadmap/
    └── 08-step-by-step-plan.md ← 21-step sequential build plan with acceptance criteria per step
```

---

## Key Technical Decisions (from docs)

| Decision | Choice | Reason |
|----------|--------|--------|
| Runtime | Node.js LTS (20+) | ES Modules, async/await |
| Framework | Express.js 4.x | Widest ecosystem, webhook pipeline fits middleware model |
| AI | OpenAI GPT-4o / GPT-4o-mini | Function calling + vision + Whisper in one API |
| Database | PostgreSQL 15+ | Relational integrity, JSONB for flexible AI memory |
| Cache | Redis 7+ | TTL sessions, rate limiting, pub/sub |
| Vector DB | ChromaDB | Runs locally in Docker, zero cost for dev |
| RAG | LangChain.js | Abstracts doc loaders and vector stores |
| Container | Docker + Docker Compose | All 5 services containerized |
| Proxy | Nginx + Certbot | SSL termination, reverse proxy |
| Module System | ES Modules (`"type": "module"`) | `import`/`export` throughout |
| Async | `async/await` with `try/catch` | No callback hell, no raw `.then()` |
| Validation | Zod | Runtime schema validation for webhook payloads |
| Logging | Winston | Structured JSON, no PII, phone masking |
| Security | HMAC-SHA256, Helmet, parameterized queries | See `06-security.md` |

---

## Database Schema Summary (9 tables)

```
users (phone_number UNIQUE, name, language, preferences JSONB)
 └── conversations (session_key, is_active)
      └── messages (role ENUM, type ENUM, content, whatsapp_msg_id UNIQUE, tool_calls JSONB)
 └── orders (order_number UNIQUE, status ENUM, shipping_address JSONB)
      └── order_items (variant_id FK, quantity, unit_price, subtotal GENERATED)
 └── complaints (ticket_number UNIQUE, status ENUM, priority ENUM)
 └── ai_memories (memory_type, key, value, confidence — UNIQUE(user_id, memory_type, key))
 └── ai_summaries (summary TEXT, message_range)

products (sku UNIQUE, name, category, brand, tags TEXT[])
 └── product_variants (variant_name, size, color, price NUMERIC, stock INT)
```

All tables use UUID PKs, `created_at`/`updated_at` with auto-update triggers.

---

## Architecture Flow

```
WhatsApp User → Meta Cloud API → Webhook POST → Express.js
  → Signature Verify → Rate Limit → Input Validate → Parse Message
  → AI Router → [OpenAI + Memory + RAG + Tools] → Response
  → Send via WhatsApp Cloud API

Tools (function calling):
  check_stock → ProductService → PostgreSQL
  get_product_price → ProductService → PostgreSQL
  check_order_status → OrderService → PostgreSQL
  create_complaint_ticket → ComplaintService → PostgreSQL
  get_product_recommendation → RecommendationService → PostgreSQL + ChromaDB + ai_memories
```

---

## Implementation Plan (21 Steps in 5 Phases)

### Phase 1 — Foundation (Steps 1–6)
1. Create project (package.json, .env, .gitignore)
2. Install all dependencies
3. Express server with health endpoint, middleware pipeline
4. WhatsApp webhook verification (GET handshake)
5. Receive and parse incoming messages (POST webhook, deduplication)
6. Send replies back via WhatsApp Cloud API

### Phase 2 — AI Core (Steps 7–10)
7. OpenAI integration (chat completions, system prompt)
8. PostgreSQL integration (schema migration, user/message persistence)
9. Persistent memory system (Redis short-term + PG long-term + auto-summarization)
10. Function calling system (tool definitions, dispatcher, result formatter)

### Phase 3 — Business Logic (Steps 11–13)
11. Real-time stock checking (ILIKE fuzzy match, never hallucinate)
12. Order tracking (by order number or phone number)
13. Complaint/ticket system (TKT-YYYYMMDD-XXXX format)

### Phase 4 — Advanced Features (Steps 14–18)
14. Voice notes (download OGG → convert to MP3 → Whisper transcription)
15. Image understanding (download → base64 → GPT-4o Vision)
16. RAG knowledge base (LangChain PDF loader → ChromaDB → semantic search)
17. Redis cache (session memory with TTL, per-user rate limiting)
18. Recommendation engine (DB + RAG + user memory combined)

### Phase 5 — Infrastructure (Steps 19–21)
19. Dockerization (Dockerfile + docker-compose.yml with 5 services)
20. Production deployment (Ubuntu VPS, SSL, monitoring, backups)
21. Scaling strategy (replicas, read replicas, BullMQ, managed services)

---

## Final Project Structure (Target)

```
whatsapp-bot/
├── src/
│   ├── index.js                     ← Entry point
│   ├── app.js                       ← Express app config
│   ├── config/env.js                ← Zod-validated env config
│   ├── middleware/
│   │   ├── rateLimiter.js           ← Global rate limiter
│   │   ├── requestLogger.js         ← Winston logger
│   │   ├── errorHandler.js          ← Global error handler
│   │   └── webhookSignature.js      ← HMAC-SHA256 verification
│   ├── routes/
│   │   ├── health.js                ← GET /health
│   │   └── webhook.js               ← GET + POST /webhook
│   ├── parsers/webhookParser.js     ← Extract data from webhook body
│   ├── validators/messageValidator.js ← Zod schemas
│   ├── handlers/
│   │   ├── messageHandler.js        ← Route by message type
│   │   ├── audioHandler.js          ← Voice note pipeline
│   │   └── imageHandler.js          ← Image pipeline
│   ├── services/
│   │   ├── whatsapp.js              ← WhatsApp Cloud API client
│   │   ├── openai.js                ← OpenAI client
│   │   ├── aiRouter.js              ← Central AI orchestrator
│   │   ├── memoryService.js         ← Short + long-term memory
│   │   ├── summarizationService.js  ← Auto-summarize conversations
│   │   ├── productService.js        ← Stock + price queries
│   │   ├── orderService.js          ← Order status queries
│   │   ├── complaintService.js      ← Ticket CRUD
│   │   ├── whisperService.js        ← Audio transcription
│   │   ├── visionService.js         ← GPT-4o Vision
│   │   ├── ragService.js            ← ChromaDB semantic search
│   │   ├── redisService.js          ← Session cache + rate limits
│   │   └── recommendationService.js ← Personalized recommendations
│   ├── tools/
│   │   ├── toolDefinitions.js       ← OpenAI tool schemas
│   │   ├── toolDispatcher.js        ← Route tool calls to services
│   │   └── toolResultFormatter.js   ← Format results for OpenAI
│   ├── database/
│   │   ├── client.js                ← PG connection pool
│   │   └── migrate.js               ← Run migrations
│   └── scripts/ingestDocuments.js   ← RAG document ingestion
├── database/
│   ├── init.sql                     ← Full schema
│   └── seed.sql                     ← Sample data
├── knowledge/                       ← RAG documents (PDFs, FAQs)
├── nginx/nginx.conf                 ← Reverse proxy config
├── logs/                            ← Winston log output
├── temp/                            ← Temporary media files
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.scale.yml
├── .dockerignore
├── .env / .env.example
├── .gitignore
└── package.json
```

---

## Critical Rules (Always Enforce)

1. ❌ **NEVER** use Baileys or any unofficial WhatsApp library
2. ❌ **NEVER** hallucinate stock, prices, or order data — always query PostgreSQL
3. ❌ **NEVER** skip steps or provide pseudo-code/placeholders
4. ❌ **NEVER** concatenate user input into SQL — always use `$1, $2` parameterized queries
5. ❌ **NEVER** log API keys, tokens, or full phone numbers in production
6. ✅ **ALWAYS** use ES Modules (`import`/`export`) and `async/await` with `try/catch`
7. ✅ **ALWAYS** validate incoming data with Zod before processing
8. ✅ **ALWAYS** verify webhook signatures with HMAC-SHA256
9. ✅ **ALWAYS** return `200 OK` immediately on webhook POST, then process async
10. ✅ **ALWAYS** deduplicate messages using `whatsapp_msg_id`

---

## Open Questions (Unanswered)

1. **ngrok or custom domain for development?** — WhatsApp webhook needs public HTTPS URL
2. **Meta Developer Account ready?** — Need Phone Number ID, Access Token, App Secret
3. **PostgreSQL local or Docker?** — Laragon is already running on the user's machine
4. **RAG documents available?** — Need PDFs/FAQs for knowledge base, or create samples

---

## How to Use This Handover

In a new session, paste this prompt:

```
Read the handover document at f:\prog9\plan-implement-whatsapps-bot\docs\HANDOVER.md first.
Then read the detailed specs in docs/01-core through docs/05-roadmap as needed.
The implementation plan is at the Gemini artifacts folder.
Continue from Step [N] of the implementation plan.
```

Replace `[N]` with the step number you want to start or continue from.
Current status: **Step 7 — OpenAI Integration (not yet started)**.

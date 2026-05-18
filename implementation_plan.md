# AI WhatsApp Chatbot — Implementation Plan

Build a production-ready, AI-powered WhatsApp chatbot SaaS platform using the official Meta Cloud API, OpenAI (GPT-4o, Whisper, Vision), PostgreSQL, Redis, ChromaDB, and Docker.

> [!IMPORTANT]
> This plan is derived directly from the project documentation suite (`docs/01-core` through `docs/05-roadmap`). Every decision, file path, and technology choice adheres strictly to those specifications.

---

## Guiding Principles (from `00-context.md`)

- **Only** Meta's official WhatsApp Cloud API — Baileys and all unofficial libraries are **banned**
- **Never** hallucinate real-time data — stock, prices, orders always come from PostgreSQL
- **Complete code only** — no pseudo-code, no placeholders, no skipped steps
- **ES Modules** (`import`/`export`), **async/await**, **try/catch** everywhere
- **Environment variables** for all secrets via `.env`

---

## Phase 1 — Foundation (Steps 1–6)

> Goal: A running Express server that can receive WhatsApp messages and send replies.

---

### Step 1 — Create Project

#### [NEW] [package.json](file:///f:/prog9/plan-implement-whatsapps-bot/package.json)
- Initialize with `npm init -y`
- Set `"type": "module"` for ES module support
- Add `"scripts"`: `"start"`, `"dev"` (with `--watch`)

#### [NEW] [.gitignore](file:///f:/prog9/plan-implement-whatsapps-bot/.gitignore)
- Ignore `.env`, `node_modules/`, `logs/`, `temp/`, `*.log`

#### [NEW] [.env.example](file:///f:/prog9/plan-implement-whatsapps-bot/.env.example)
- All env vars from `02-tech-stack.md` with placeholder values

#### [NEW] [.env](file:///f:/prog9/plan-implement-whatsapps-bot/.env)
- Copy of `.env.example` — user fills in real values

#### [NEW] [src/index.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/index.js)
- Minimal entry point that logs "Server starting..."

**Acceptance**: `node src/index.js` runs without error.

---

### Step 2 — Install Dependencies

Install all packages from `02-tech-stack.md` in a single command:

```bash
npm install express dotenv axios cors helmet express-rate-limit \
  openai langchain @langchain/openai @langchain/community \
  pg redis fluent-ffmpeg form-data sharp zod winston morgan
```

**Acceptance**: `npm ls --depth=0` shows all packages. No missing peer dependencies.

---

### Step 3 — Setup Express Server

#### [NEW] [src/app.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/app.js)
- Express app configuration with middleware pipeline
- Helmet security headers, CORS (disabled for webhook — server-to-server only), Morgan request logging

#### [NEW] [src/config/env.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/config/env.js)
- Loads and validates all environment variables using Zod
- Exports a frozen config object

#### [NEW] [src/middleware/rateLimiter.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/middleware/rateLimiter.js)
- Global rate limiter: 100 requests per 15 minutes per IP (from `06-security.md`)

#### [NEW] [src/middleware/requestLogger.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/middleware/requestLogger.js)
- Winston structured JSON logger (from `06-security.md`)
- Log files: `logs/error.log`, `logs/combined.log`
- Console output in development only
- Phone number masking utility

#### [NEW] [src/middleware/errorHandler.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/middleware/errorHandler.js)
- Global error handler — logs internally, never exposes stack traces

#### [NEW] [src/routes/health.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/routes/health.js)
- `GET /health` → `{ status: "ok", timestamp, uptime }`

#### [MODIFY] [src/index.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/index.js)
- Import app, start listening on `PORT` from config

**Acceptance**: `npm run dev` starts server. `GET /health` returns `{ status: "ok" }`.

---

### Step 4 — WhatsApp Webhook Verification

#### [NEW] [src/routes/webhook.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/routes/webhook.js)
- `GET /webhook` — Meta handshake: verify `hub.verify_token`, return `hub.challenge`
- `POST /webhook` — placeholder for incoming messages (Step 5)

#### [NEW] [src/middleware/webhookSignature.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/middleware/webhookSignature.js)
- HMAC-SHA256 signature verification using `X-Hub-Signature-256` header
- Uses `crypto.timingSafeEqual` for timing-attack-safe comparison
- Requires raw body buffer — `express.raw()` must be applied before `express.json()` on this route

#### [NEW] [src/services/whatsapp.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/whatsapp.js)
- WhatsApp Cloud API client using Axios
- Base URL: `https://graph.facebook.com/{WHATSAPP_API_VERSION}/{PHONE_NUMBER_ID}`
- Placeholder for `sendMessage()` (Step 6)

**Acceptance**: `GET /webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123` returns `test123` with status 200. Invalid token returns 403.

---

### Step 5 — Receive WhatsApp Messages

#### [NEW] [src/parsers/webhookParser.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/parsers/webhookParser.js)
- Extracts message data from the nested webhook body structure (`entry[].changes[].value`)
- Returns: `{ type, from, messageId, body, mediaId, caption, profileName, timestamp }`
- Handles all types: `text`, `audio`, `image`, `interactive`, `location`
- Separates `statuses` events from `messages` events

#### [NEW] [src/handlers/messageHandler.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/handlers/messageHandler.js)
- Routes parsed messages by type to appropriate handlers
- Implements **deduplication** check using `whatsapp_msg_id` (from `04-api-contracts.md`)
- Always returns `200 OK` immediately, processes asynchronously

#### [NEW] [src/validators/messageValidator.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/validators/messageValidator.js)
- Zod schema validation for incoming messages (from `06-security.md`)
- Invalid messages silently dropped with warning log

**Acceptance**: Send a WhatsApp message → server logs `{ type: "text", from: "628...", body: "Hello" }`. Status events logged separately. Duplicate messages ignored.

---

### Step 6 — Send WhatsApp Replies

#### [MODIFY] [src/services/whatsapp.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/whatsapp.js)
- `sendTextMessage(to, body)` — sends a plain text reply
- `sendInteractiveList(to, header, body, sections)` — sends interactive list
- `sendInteractiveButtons(to, body, buttons)` — sends interactive buttons (max 3)
- `downloadMedia(mediaId)` — downloads media by ID (needed for Steps 14-15)
- All calls use Axios with Bearer token auth

**Acceptance**: Send message to bot → bot replies "Pesan Anda diterima: {your message}". Message visible in WhatsApp.

---

## Phase 2 — AI Core (Steps 7–10)

> Goal: Intelligent AI responses with persistent memory and autonomous tool calling.

---

### Step 7 — OpenAI Integration

#### [NEW] [src/services/openai.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/openai.js)
- OpenAI client initialization with API key from env
- `chatCompletion(messages, tools?)` — wraps `openai.chat.completions.create()`
- System prompt defining the bot's persona (Indonesian e-commerce assistant)
- Error handling: catch OpenAI rate limits, return friendly user message

#### [NEW] [src/services/aiRouter.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/aiRouter.js)
- Central orchestrator: determines which services to invoke based on message type and intent
- Assembles context: system prompt + memory + RAG context + user message
- Dispatches to OpenAI and assembles final reply
- Sends reply via WhatsApp service

**Acceptance**: Send "Halo, apa kabar?" → receive natural AI response in Indonesian. Follow-up messages maintain context.

---

### Step 8 — PostgreSQL Integration

#### [NEW] [src/database/client.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/database/client.js)
- PostgreSQL connection pool using `pg` with config from env
- Exports `query(text, params)` function — **always parameterized** (`$1, $2, ...`)

#### [NEW] [src/database/migrate.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/database/migrate.js)
- Runnable script: `node src/database/migrate.js`
- Executes `database/init.sql`

#### [NEW] [database/init.sql](file:///f:/prog9/plan-implement-whatsapps-bot/database/init.sql)
- Full schema from `03-database-schema.md`:
  - `users`, `conversations`, `messages` (with ENUMs `message_role`, `message_type`)
  - `products`, `product_variants`
  - `orders`, `order_items` (with ENUM `order_status`)
  - `complaints` (with ENUMs `complaint_status`, `complaint_priority`)
  - `ai_memories`, `ai_summaries`
  - All indexes, the `update_updated_at()` trigger function, and triggers for all relevant tables

#### [NEW] [database/seed.sql](file:///f:/prog9/plan-implement-whatsapps-bot/database/seed.sql)
- Sample Nike products and variants from `03-database-schema.md`
- Sample test order for order tracking testing

#### [MODIFY] [src/handlers/messageHandler.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/handlers/messageHandler.js)
- On first message from a phone number → create `users` row
- Every message → create `messages` row with `whatsapp_msg_id` for deduplication

**Acceptance**: `node src/database/migrate.js` runs cleanly. First WhatsApp message creates a user row. `SELECT * FROM users;` shows the test phone number.

---

### Step 9 — Persistent Memory System

#### [NEW] [src/services/memoryService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/memoryService.js)
- `loadUserMemory(userId)` — loads from `ai_memories` table (long-term facts)
- `saveUserMemory(userId, type, key, value, confidence)` — upserts to `ai_memories`
- `loadConversationHistory(conversationId, limit)` — loads recent messages
- Builds context string: `[User Summary] + [User Memories] + [Recent Messages]`

#### [NEW] [src/services/summarizationService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/summarizationService.js)
- Monitors message count per conversation
- When count exceeds `SUMMARY_TRIGGER_COUNT` (default 50):
  1. Takes oldest 30 messages
  2. Sends to GPT: "Summarize these conversations into a concise user profile"
  3. Stores result in `ai_summaries`
  4. Removes summarized messages from active context

**Acceptance**: Tell the bot your name and coffee preference → verify `ai_memories` table has entries. Restart server → ask about your preference → AI remembers from PostgreSQL.

---

### Step 10 — Function Calling System

#### [NEW] [src/tools/toolDefinitions.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/tools/toolDefinitions.js)
- OpenAI tool schema array with 5 tools (from `05-features.md`):
  - `check_stock`, `get_product_price`, `check_order_status`, `create_complaint_ticket`, `get_product_recommendation`

#### [NEW] [src/tools/toolDispatcher.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/tools/toolDispatcher.js)
- Routes `tool_calls` from OpenAI response to the correct service function
- Handles the tool calling loop: AI → tool call → execute → result → back to AI → final reply

#### [NEW] [src/tools/toolResultFormatter.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/tools/toolResultFormatter.js)
- Formats raw DB query results into structured JSON for OpenAI consumption

**Acceptance**: Ask about stock → AI calls `check_stock` tool. Ask about weather → AI responds conversationally without calling any tool. Tool call chain completes end-to-end.

---

## Phase 3 — Business Logic (Steps 11–13)

> Goal: Real-time stock, order tracking, and complaint ticketing — all DB-sourced, never hallucinated.

---

### Step 11 — Real-Time Stock System

#### [NEW] [src/services/productService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/productService.js)
- `checkStock({ product_name, size?, color? })` — queries `products` + `product_variants` with `ILIKE` fuzzy matching
- `getProductPrice({ product_name, size? })` — returns price from `product_variants`
- All queries are parameterized

**Acceptance**: "Apakah stok Nike Air size 42 masih ada?" → returns actual DB stock count. Manually set stock=0 → bot says "stok kosong". Fuzzy matching works ("nike air" → "Nike Air Max 90").

---

### Step 12 — Order Tracking

#### [NEW] [src/services/orderService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/orderService.js)
- `checkOrderStatus({ order_number?, phone_number? })` — queries `orders` + `order_items` + joins
- Returns status with Indonesian-language messages (from `05-features.md`)
- Falls back to phone number search when no order number provided

**Acceptance**: Insert test order → ask "Status pesanan ORD-20240101-0001?" → returns correct status. Ask without order number → searches by phone number.

---

### Step 13 — Complaint System

#### [NEW] [src/services/complaintService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/complaintService.js)
- `createComplaintTicket({ subject, description, order_number?, priority? })` — creates ticket in `complaints` table
- Ticket number format: `TKT-YYYYMMDD-XXXX` (from `05-features.md`)
- `getTicketStatus(ticketNumber)` — returns current ticket status

**Acceptance**: "Saya mau komplen, produk rusak" → ticket created with `TKT-` number returned. Ticket visible in `complaints` table.

---

## Phase 4 — Advanced Features (Steps 14–18)

> Goal: Voice notes, image understanding, RAG knowledge base, Redis caching, and recommendations.

---

### Step 14 — Voice Note Support

#### [NEW] [src/handlers/audioHandler.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/handlers/audioHandler.js)
- Downloads audio via WhatsApp Media API (2-step: get URL → download binary)
- Converts `.ogg` → `.mp3` using `fluent-ffmpeg`
- Passes to Whisper service for transcription
- Feeds transcript into the standard text message flow
- Cleans up temp files after processing

#### [NEW] [src/services/whisperService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/whisperService.js)
- `transcribeAudio(filePath)` — calls `openai.audio.transcriptions.create()` with `model: "whisper-1"`, `language: "id"`

> [!NOTE]
> Media URLs from WhatsApp expire after ~5 minutes. Download must happen immediately upon receiving the webhook event (from `04-api-contracts.md`).

**Acceptance**: Send voice note asking about stock → bot transcribes and responds correctly. Temp audio file deleted after processing.

---

### Step 15 — Image AI Support

#### [NEW] [src/handlers/imageHandler.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/handlers/imageHandler.js)
- Downloads image via WhatsApp Media API
- Converts to base64 using `sharp` (resize/optimize if needed)
- Passes to Vision service

#### [NEW] [src/services/visionService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/visionService.js)
- `analyzeImage(base64Image, userCaption?)` — calls GPT-4o Vision
- System prompt: product identification specialist (from `05-features.md`)
- Returns product identification + recommendations

**Acceptance**: Send photo of a shoe → bot identifies brand and model. Send with caption "berapa harganya?" → bot combines vision + stock lookup.

---

### Step 16 — RAG Knowledge Base

#### [NEW] [src/services/ragService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/ragService.js)
- `queryKnowledgeBase(userQuery)` — embeds query, searches ChromaDB, returns top 3 chunks
- Injected into OpenAI prompt as contextual knowledge

#### [NEW] [src/scripts/ingestDocuments.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/scripts/ingestDocuments.js)
- Standalone script: `node src/scripts/ingestDocuments.js`
- Uses LangChain's `PDFLoader`, `RecursiveCharacterTextSplitter` (chunk size 500, overlap 50)
- Embeds via `OpenAIEmbeddings` (text-embedding-3-small)
- Stores in ChromaDB collection `product_knowledge`

#### [NEW] [knowledge/](file:///f:/prog9/plan-implement-whatsapps-bot/knowledge/)
- Directory for PDF catalogs, FAQ documents, SOPs

**Acceptance**: Run ingestion script. Ask a question answered in the FAQ document → response uses FAQ content. ChromaDB data persists across restarts.

---

### Step 17 — Redis Cache

#### [NEW] [src/services/redisService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/redisService.js)
- Redis client connection using `redis` v4 (node-redis)
- `getSession(phoneNumber)` / `setSession(phoneNumber, messages)` — short-term memory with TTL (default 1 hour from `SHORT_TERM_MEMORY_TTL`)
- `checkUserRateLimit(phoneNumber)` — max 20 messages/minute per user (from `06-security.md`)
- `cacheProductData(key, data, ttl)` — 5-minute TTL for frequently queried products

#### [MODIFY] [src/services/memoryService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/memoryService.js)
- Integrate Redis as the first layer of memory lookup (short-term)
- Fall back to PostgreSQL for long-term memory

**Acceptance**: Send 5 messages quickly → all share context. Send 21 messages in 1 minute → rate limit message. `redis-cli KEYS *` shows session and rate limit keys.

---

### Step 18 — Recommendation Engine

#### [NEW] [src/services/recommendationService.js](file:///f:/prog9/plan-implement-whatsapps-bot/src/services/recommendationService.js)
- `getProductRecommendation({ category?, budget_max?, preferences? })`
- Combines 3 data sources:
  1. PostgreSQL query (filter by category, price range)
  2. ChromaDB semantic search (match preference keywords)
  3. `ai_memories` (user's past purchases, size, brand preferences)
- AI ranks and explains recommendations

**Acceptance**: "Rekomendasikan sepatu untuk saya" → uses stored shoe size preference. "Sepatu lari budget 500 ribu" → filters by price. All results sourced from DB.

---

## Phase 5 — Infrastructure (Steps 19–21)

> Goal: Containerize, deploy to production, and prepare for scaling.

---

### Step 19 — Dockerization

#### [NEW] [Dockerfile](file:///f:/prog9/plan-implement-whatsapps-bot/Dockerfile)
- `node:20-alpine`, installs `ffmpeg`, runs as non-root `botuser`
- Layer caching: copy `package*.json` first, then `npm ci --only=production`

#### [NEW] [docker-compose.yml](file:///f:/prog9/plan-implement-whatsapps-bot/docker-compose.yml)
- 5 services: `app`, `postgres`, `redis`, `chromadb`, `nginx`
- Health checks on postgres and redis
- Named volumes: `postgres_data`, `redis_data`, `chroma_data`
- Bind mounts: `./logs`, `./knowledge`, `./temp`

#### [NEW] [docker-compose.dev.yml](file:///f:/prog9/plan-implement-whatsapps-bot/docker-compose.dev.yml)
- Dev overrides: bind mounts for source code, debug ports

#### [NEW] [.dockerignore](file:///f:/prog9/plan-implement-whatsapps-bot/.dockerignore)

#### [NEW] [nginx/nginx.conf](file:///f:/prog9/plan-implement-whatsapps-bot/nginx/nginx.conf)
- HTTP → HTTPS redirect, SSL termination, proxy to app:3000
- Security headers, `client_max_body_size 20M`

**Acceptance**: `docker compose up -d` starts all 5 services. `docker compose ps` shows all healthy. End-to-end WhatsApp test works through Docker.

---

### Step 20 — Production Deployment

Checklist-based deployment to Ubuntu VPS:

- [ ] VPS provisioned (Ubuntu 22.04 LTS)
- [ ] Docker and Docker Compose installed
- [ ] Domain DNS pointing to VPS IP
- [ ] SSL certificate via Certbot/Let's Encrypt
- [ ] `.env` configured on server
- [ ] `docker compose up -d --build`
- [ ] Database migrations run: `docker compose exec app node src/database/migrate.js`
- [ ] RAG documents ingested: `docker compose exec app node src/scripts/ingestDocuments.js`
- [ ] Webhook URL registered in Meta Developer Console
- [ ] End-to-end test: send WhatsApp message → receive AI reply
- [ ] Log monitoring configured
- [ ] Daily backup cron job: `pg_dump` with 30-day retention

**Acceptance**: Live bot on HTTPS domain responds to WhatsApp messages with AI-generated replies.

---

### Step 21 — Scaling Strategy

#### [NEW] [docker-compose.scale.yml](file:///f:/prog9/plan-implement-whatsapps-bot/docker-compose.scale.yml)
- App replicas: 3 instances behind Nginx upstream

**Deliverables**:
- Performance benchmarks (messages/second)
- Bottleneck analysis
- Scaling path: Redis pooling → PG read replicas → app replicas → BullMQ → managed RDS → ElastiCache → Kubernetes

---

## Final Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.js                    ← Entry point
│   ├── app.js                      ← Express app config
│   ├── config/
│   │   └── env.js                  ← Zod-validated env config
│   ├── middleware/
│   │   ├── rateLimiter.js          ← Global rate limiter
│   │   ├── requestLogger.js        ← Winston structured logger
│   │   ├── errorHandler.js         ← Global error handler
│   │   └── webhookSignature.js     ← HMAC-SHA256 verification
│   ├── routes/
│   │   ├── health.js               ← GET /health
│   │   └── webhook.js              ← GET + POST /webhook
│   ├── parsers/
│   │   └── webhookParser.js        ← Extract data from webhook body
│   ├── validators/
│   │   └── messageValidator.js     ← Zod schemas for messages
│   ├── handlers/
│   │   ├── messageHandler.js       ← Route by message type
│   │   ├── audioHandler.js         ← Voice note pipeline
│   │   └── imageHandler.js         ← Image pipeline
│   ├── services/
│   │   ├── whatsapp.js             ← WhatsApp Cloud API client
│   │   ├── openai.js               ← OpenAI chat/vision/whisper
│   │   ├── aiRouter.js             ← Central AI orchestrator
│   │   ├── memoryService.js        ← Short + long-term memory
│   │   ├── summarizationService.js ← Auto-summarize conversations
│   │   ├── productService.js       ← Stock + price queries
│   │   ├── orderService.js         ← Order status queries
│   │   ├── complaintService.js     ← Ticket CRUD
│   │   ├── whisperService.js       ← Audio transcription
│   │   ├── visionService.js        ← GPT-4o Vision
│   │   ├── ragService.js           ← ChromaDB semantic search
│   │   ├── redisService.js         ← Session cache + rate limits
│   │   └── recommendationService.js ← Personalized recommendations
│   ├── tools/
│   │   ├── toolDefinitions.js      ← OpenAI tool schemas
│   │   ├── toolDispatcher.js       ← Route tool calls to services
│   │   └── toolResultFormatter.js  ← Format results for OpenAI
│   ├── database/
│   │   ├── client.js               ← PG connection pool
│   │   └── migrate.js              ← Run migrations
│   └── scripts/
│       └── ingestDocuments.js      ← RAG document ingestion
├── database/
│   ├── init.sql                    ← Full schema
│   └── seed.sql                    ← Sample data
├── knowledge/                      ← RAG documents (PDFs, FAQs)
├── nginx/
│   └── nginx.conf                  ← Reverse proxy config
├── logs/                           ← Winston log output
├── temp/                           ← Temporary media files
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.scale.yml
├── .dockerignore
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Verification Plan

### Per-Step Verification
Each step has explicit acceptance criteria listed above. Every step must pass its criteria before moving to the next.

### End-to-End Tests (after Step 18)
1. **Text conversation** — Send greeting → receive AI reply → ask follow-up → context maintained
2. **Stock check** — Ask "stok Nike Air size 42?" → receive real DB data
3. **Order tracking** — Ask "status pesanan ORD-xxx?" → receive real order status
4. **Complaint** — Report a problem → receive ticket number → verify in DB
5. **Voice note** — Send voice note → receive correct transcription-based reply
6. **Image** — Send product photo → receive identification
7. **Memory persistence** — Share preference → restart server → preference remembered
8. **Rate limiting** — Send 21 messages in 1 minute → receive rate limit message
9. **RAG** — Ask FAQ question → receive answer sourced from document

### Docker Verification (Step 19)
- `docker compose up -d` → all 5 services healthy
- All 9 end-to-end tests pass through Docker

---

## Open Questions

> [!IMPORTANT]
> **1. ngrok or Custom Domain for Development?**
> The WhatsApp webhook requires a public HTTPS URL. During development, do you want to use **ngrok** (quick, temporary tunnel) or do you already have a **domain/VPS** ready?

> [!IMPORTANT]
> **2. Meta Developer Account Ready?**
> Do you already have a Meta Developer Account with a WhatsApp Business App created? We need the Phone Number ID, Access Token, and App Secret to proceed past Step 4.

> [!NOTE]
> **3. PostgreSQL Local or Docker?**
> For development, do you want to run PostgreSQL **locally** (e.g., via Laragon which you already have running) or spin it up in **Docker** from the start?

> [!NOTE]
> **4. RAG Documents**
> Do you have any PDF catalogs or FAQ documents ready to ingest, or should I create sample documents for testing?

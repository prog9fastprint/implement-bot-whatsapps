# 08 — Step-by-Step Build Plan (Steps 1–21)

> **For each step**: Follow the output format from `00-context.md` — Goal, Folder Structure, Commands, Source Code, Explanation, Testing, Debugging, Best Practices, Common Mistakes.

---

## Step Overview Table

| Step | Name | Builds On | Deliverable |
|------|------|-----------|-------------|
| 1 | Create project | — | Initialized Node.js ES module project |
| 2 | Install dependencies | Step 1 | All packages installed, .env configured |
| 3 | Setup Express server | Step 2 | Running HTTP server with health endpoint |
| 4 | Webhook verification | Step 3 | GET /webhook passes Meta handshake |
| 5 | Receive messages | Step 4 | POST /webhook parses incoming messages |
| 6 | Send replies | Step 5 | Bot sends text reply to WhatsApp |
| 7 | OpenAI integration | Step 6 | Bot replies with AI-generated text |
| 8 | PostgreSQL integration | Step 7 | DB connected, schema migrated |
| 9 | Persistent memory | Step 8 | Bot remembers users across sessions |
| 10 | Function calling | Step 9 | Bot calls tools instead of hallucinating |
| 11 | Real-time stock | Step 10 | Bot queries live stock from DB |
| 12 | Order tracking | Step 11 | Bot queries order status from DB |
| 13 | Complaint system | Step 12 | Bot creates support tickets |
| 14 | Voice note support | Step 13 | Bot transcribes and replies to audio |
| 15 | Image AI support | Step 14 | Bot understands and describes images |
| 16 | RAG knowledge base | Step 15 | Bot answers from PDF/FAQ documents |
| 17 | Redis cache | Step 16 | Session memory and rate limiting via Redis |
| 18 | Recommendation engine | Step 17 | Personalized product recommendations |
| 19 | Dockerization | Step 18 | Full app running in Docker Compose |
| 20 | Production deployment | Step 19 | Live on Ubuntu VPS with SSL |
| 21 | Scaling strategy | Step 20 | Architecture ready for growth |

---

## Step 1 — Create Project

**Goal**: Initialize a production-grade Node.js project with ES modules.

**Expected folder structure after this step:**
```
whatsapp-bot/
├── src/
│   └── index.js
├── .env
├── .env.example
├── .gitignore
└── package.json
```

**Key requirements:**
- `package.json` must have `"type": "module"`
- `.gitignore` must include `.env`, `node_modules/`, `logs/`, `temp/`
- Git initialized with initial commit

---

## Step 2 — Install Dependencies

**Goal**: Install and verify all required packages.

**Expected outcome:**
- All packages from `02-tech-stack.md` installed
- `node_modules/` present
- `package-lock.json` committed

**All packages in one command:**
```bash
npm install express dotenv axios cors helmet express-rate-limit \
  openai langchain @langchain/openai @langchain/community \
  pg redis fluent-ffmpeg form-data sharp zod winston morgan
```

---

## Step 3 — Setup Express Server

**Goal**: Running Express server with structured middleware pipeline.

**Expected folder structure:**
```
src/
├── index.js              ← Entry point, starts server
├── app.js                ← Express app configuration
├── config/
│   └── env.js            ← Validated environment config
├── middleware/
│   ├── helmet.js
│   ├── rateLimiter.js
│   └── requestLogger.js
└── routes/
    └── health.js
```

**Testing criteria:**
- `GET /health` returns `{ status: "ok" }`
- Server starts without errors on `npm run dev`

---

## Step 4 — WhatsApp Webhook Verification

**Goal**: Pass Meta's webhook verification handshake.

**Expected folder structure (additions):**
```
src/
├── routes/
│   └── webhook.js        ← GET + POST /webhook routes
├── middleware/
│   └── webhookVerify.js  ← Signature verification middleware
└── services/
    └── whatsapp.js       ← WhatsApp Cloud API client
```

**Testing criteria:**
- Register webhook URL in Meta Developer Console
- Console shows "Webhook verified successfully"
- `GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=test` returns `test`

---

## Step 5 — Receive WhatsApp Messages

**Goal**: Parse and log all incoming webhook events by type.

**New files:**
```
src/
├── handlers/
│   └── messageHandler.js ← Routes by message type
└── parsers/
    └── webhookParser.js  ← Extracts message data from webhook body
```

**Testing criteria:**
- Send a WhatsApp message to the bot number
- Server logs show: `{ type: "text", from: "628...", body: "Hello" }`
- Status events (delivered/read) are logged separately and not processed as messages
- Duplicate message IDs are silently ignored

---

## Step 6 — Send WhatsApp Replies

**Goal**: Bot sends a text reply back to the user.

**New files:**
```
src/
└── services/
    └── whatsapp.js       ← sendMessage(), sendInteractive()
```

**Testing criteria:**
- Send message to bot → bot replies "Pesan Anda diterima: {your message}"
- Verify message appears in WhatsApp
- Check Meta API response for `messages[0].id`

---

## Step 7 — OpenAI Integration

**Goal**: Bot replies with AI-generated conversational text.

**New files:**
```
src/
└── services/
    ├── openai.js         ← OpenAI client + chat completion
    └── aiRouter.js       ← Decides which AI service to call
```

**Testing criteria:**
- Send "Halo, apa kabar?" → receive natural AI response
- Send follow-up questions in same session → AI maintains context
- Rate limit error from OpenAI is caught and user receives friendly message

---

## Step 8 — PostgreSQL Integration

**Goal**: Database connected, schema migrated, user record created on first message.

**New files:**
```
src/
├── database/
│   ├── client.js         ← PostgreSQL connection pool
│   └── migrate.js        ← Run SQL migrations
database/
├── init.sql              ← Full schema from 03-database-schema.md
└── seed.sql              ← Sample products for testing
```

**Testing criteria:**
- `node src/database/migrate.js` runs without errors
- First WhatsApp message creates a row in `users` table
- Every message creates a row in `messages` table
- `SELECT * FROM users;` shows your test number

---

## Step 9 — Persistent Memory System

**Goal**: AI remembers user facts across sessions and days.

**New files:**
```
src/
└── services/
    ├── memoryService.js       ← Load/save user memory
    └── summarizationService.js ← Auto-summarize long histories
```

**Testing criteria:**
- Send "Nama saya Budi dan saya suka kopi arabica"
- Verify `ai_memories` table has entry `{ key: "coffee_preference", value: "arabica" }`
- Restart server (clear Redis)
- Send "Kopi apa yang cocok untuk saya?"
- AI responds with arabica reference from PostgreSQL long-term memory

---

## Step 10 — Function Calling System

**Goal**: AI decides autonomously when to call tools.

**New files:**
```
src/
└── tools/
    ├── toolDefinitions.js    ← OpenAI tool schema array
    ├── toolDispatcher.js     ← Routes tool calls to services
    └── toolResultFormatter.js ← Formats DB results for OpenAI
```

**Testing criteria:**
- Ask about stock → AI calls `check_stock`, NOT guesses
- Ask about price → AI calls `get_product_price`
- Ask about the weather → AI answers without calling any tool
- Tool call chain works: AI → tool → result → final reply

---

## Step 11 — Real-Time Stock System

**Goal**: Live stock data from PostgreSQL, never hallucinated.

**New files:**
```
src/
└── services/
    └── productService.js  ← check_stock(), get_product_price()
```

**Testing criteria:**
- "Apakah stok Nike Air size 42 masih ada?" → returns actual DB stock count
- Manually set `stock = 0` in DB → bot responds "stok sedang kosong"
- Fuzzy product name matching works: "nike air" matches "Nike Air Max 90"

---

## Step 12 — Order Tracking

**Goal**: Live order status from PostgreSQL.

**New files:**
```
src/
└── services/
    └── orderService.js    ← check_order_status()
```

**Testing criteria:**
- Insert a test order in DB
- Ask "Status pesanan ORD-20240101-0001?" → returns correct status
- Ask without order number → AI searches by phone number
- Unknown order number → AI says order not found, asks to double check

---

## Step 13 — Complaint System

**Goal**: Create and track support tickets.

**New files:**
```
src/
└── services/
    └── complaintService.js ← create_complaint_ticket(), get_ticket_status()
```

**Testing criteria:**
- "Saya mau komplen, produk rusak" → ticket created, number returned
- Ticket appears in `complaints` table
- Ask for ticket status using ticket number → returns current status

---

## Step 14 — Voice Note Support

**Goal**: Transcribe WhatsApp voice notes using Whisper.

**New files:**
```
src/
├── handlers/
│   └── audioHandler.js    ← Download, convert, transcribe
└── services/
    └── whisperService.js  ← OpenAI Whisper API wrapper
```

**Testing criteria:**
- Record and send voice note asking about stock
- Bot transcribes correctly (check logs)
- Bot responds appropriately to the transcribed content
- Audio temp file deleted after processing

---

## Step 15 — Image AI Support

**Goal**: GPT-4o Vision understands product images.

**New files:**
```
src/
├── handlers/
│   └── imageHandler.js    ← Download image, call Vision API
└── services/
    └── visionService.js   ← GPT-4o Vision wrapper
```

**Testing criteria:**
- Send photo of a Nike shoe → bot identifies brand, model, and style
- Send photo with caption "berapa harganya?" → bot combines vision + stock lookup
- Large image processed without timeout

---

## Step 16 — RAG Knowledge Base

**Goal**: Bot answers questions from PDF/FAQ documents via semantic search.

**New files:**
```
src/
└── services/
    └── ragService.js      ← Query ChromaDB, inject context
src/
└── scripts/
    └── ingestDocuments.js ← One-time document ingestion script
knowledge/
├── catalog.pdf
└── faq.txt
```

**Testing criteria:**
- Run `node src/scripts/ingestDocuments.js` — documents ingested
- Ask question that's answered in FAQ → response uses FAQ content
- Relevant chunk IDs logged for debugging
- ChromaDB collection persists after container restart

---

## Step 17 — Redis Cache

**Goal**: Redis handles short-term session memory and rate limiting.

**New files:**
```
src/
└── services/
    └── redisService.js    ← Redis client, get/set session, rate check
```

**Testing criteria:**
- Send 5 messages quickly → all processed with shared context
- Restart app → new session starts fresh (Redis TTL expired or cleared)
- Send 21 messages in 1 minute → rate limit message received
- Redis `KEYS *` shows session and rate limit keys

---

## Step 18 — Recommendation Engine

**Goal**: Personalized product recommendations using memory + RAG + DB.

**New files:**
```
src/
└── services/
    └── recommendationService.js ← get_product_recommendation()
```

**Testing criteria:**
- "Rekomendasikan sepatu untuk saya" → uses stored shoe size preference
- "Sepatu lari budget 500 ribu" → filters by price, returns relevant results
- Recommendations include product name, price, and brief reason
- Results sourced from DB only, not hallucinated

---

## Step 19 — Dockerization

**Goal**: All services running in Docker Compose locally.

**New files:**
```
Dockerfile
docker-compose.yml
docker-compose.dev.yml    ← Dev overrides (bind mounts, debug ports)
.dockerignore
nginx/
└── nginx.conf
```

**Testing criteria:**
- `docker compose up -d` starts all 5 services
- `docker compose ps` shows all healthy
- WhatsApp bot still works end-to-end via Docker
- PostgreSQL data persists across `docker compose restart`

---

## Step 20 — Production Deployment

**Goal**: Live on Ubuntu VPS with HTTPS and auto-restart.

**Checklist:**
- [ ] VPS provisioned (Ubuntu 22.04 LTS)
- [ ] Docker and Docker Compose installed
- [ ] Domain DNS pointing to VPS IP
- [ ] SSL certificate obtained via Certbot
- [ ] `.env` configured on server (never copied via public channel)
- [ ] `docker compose up -d` running
- [ ] Webhook URL registered in Meta Developer Console
- [ ] End-to-end test: send WhatsApp message → receive AI reply
- [ ] Log monitoring set up
- [ ] Backup cron job configured

---

## Step 21 — Scaling Strategy

**Goal**: Document and implement the path to scale.

**Deliverables:**
- `docker-compose.scale.yml` for multi-instance app
- Architecture diagram for next-scale level (Kubernetes)
- Performance benchmarks (messages/second current capacity)
- Bottleneck analysis: where the system slows first
- Checklist for moving to managed cloud services (RDS, ElastiCache, etc.)

**Scaling order (do these sequentially as load grows):**
1. Add Redis connection pooling
2. Add PostgreSQL read replica + route read queries to it
3. Scale app to 3 replicas behind Nginx upstream
4. Move to BullMQ job queue for async message processing
5. Move PostgreSQL to managed RDS
6. Move Redis to ElastiCache
7. Move to Kubernetes (EKS/GKE) when orchestration complexity justifies it

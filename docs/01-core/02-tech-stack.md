# 02 — Technology Stack

## Stack Overview

| Layer | Technology | Version | Role |
|-------|-----------|---------|------|
| Runtime | Node.js | LTS (20+) | Server runtime |
| Framework | Express.js | 4.x | HTTP server and routing |
| AI Model | OpenAI API | GPT-4o / GPT-4o-mini | Chat, vision, function calling |
| Transcription | OpenAI Whisper | whisper-1 | Voice note to text |
| Embeddings | OpenAI Embeddings | text-embedding-3-small | RAG vector generation |
| AI Orchestration | LangChain.js | 0.x | RAG pipeline, document loading |
| Vector Store | ChromaDB | Latest | Semantic search for RAG |
| Primary DB | PostgreSQL | 15+ | Persistent data store |
| Cache / Session | Redis | 7+ | Short-term memory, rate limits |
| Containerization | Docker + Compose | Latest | Dev and prod environments |
| Process Manager | PM2 | Latest | Production process management |
| Reverse Proxy | Nginx | Latest | SSL termination, load balancing |
| SSL | Certbot (Let's Encrypt) | Latest | Free SSL certificates |
| WhatsApp API | Meta Cloud API | v18.0+ | Official messaging API |

---

## Node.js Dependencies

### Core

```jsonc
{
  "express": "^4.18.2",          // HTTP framework
  "dotenv": "^16.3.1",           // Environment variable loader
  "axios": "^1.6.0",             // HTTP client for WhatsApp API calls
  "cors": "^2.8.5",              // CORS middleware
  "helmet": "^7.1.0",            // Security headers
  "express-rate-limit": "^7.1.5" // Rate limiting middleware
}
```

### AI / OpenAI

```jsonc
{
  "openai": "^4.20.0",           // Official OpenAI SDK
  "langchain": "^0.1.0",         // LangChain orchestration
  "@langchain/openai": "^0.0.10", // LangChain OpenAI integration
  "@langchain/community": "^0.0.20" // ChromaDB loader, PDF loader
}
```

### Database

```jsonc
{
  "pg": "^8.11.3",               // PostgreSQL client
  "redis": "^4.6.10"             // Redis client (node-redis v4)
}
```

### Media Processing

```jsonc
{
  "fluent-ffmpeg": "^2.1.2",     // Audio format conversion
  "form-data": "^4.0.0",         // Multipart form for Whisper upload
  "sharp": "^0.32.6"             // Image preprocessing before Vision API
}
```

### Validation & Security

```jsonc
{
  "zod": "^3.22.4",              // Runtime schema validation
  "winston": "^3.11.0",          // Structured logging
  "morgan": "^1.10.0"            // HTTP request logging
}
```

---

## Why Each Technology Was Chosen

### Express.js over Fastify / Koa
Express has the widest ecosystem support, most LangChain examples use it, and its middleware model maps cleanly to the webhook pipeline.

### OpenAI API (not local LLM)
GPT-4o provides function calling, vision, and Whisper in one API contract. For a production SaaS, reliability > cost at this stage.

### LangChain.js for RAG
Abstracts document loaders (PDF, text, CSV) and vector store integrations. Switching from ChromaDB to Pinecone later is a one-line config change.

### ChromaDB over Pinecone / Weaviate
ChromaDB runs locally in Docker — zero cost for development and small deployments. Can be swapped for a managed service when scaling.

### PostgreSQL over MySQL / MongoDB
Relational integrity matters: orders reference users, complaints reference orders. JSONB columns handle flexible AI memory without a separate document DB.

### Redis over Memcached
Redis supports TTL, pub/sub, and sorted sets. Needed for rate limiting, session memory, and future real-time features.

### node-redis v4 (not ioredis)
Official Redis client, actively maintained, full TypeScript types, Promise-native.

---

## Environment Variables Reference

All secrets must live in `.env`. Never commit `.env` to version control.

```dotenv
# ── WhatsApp Cloud API ────────────────────────────────────
WHATSAPP_PHONE_NUMBER_ID=        # From Meta Developer Console
WHATSAPP_ACCESS_TOKEN=           # Permanent or temporary token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=   # Your chosen random string
WHATSAPP_API_VERSION=v18.0       # Meta Graph API version

# ── OpenAI ───────────────────────────────────────────────
OPENAI_API_KEY=                  # sk-...

# ── PostgreSQL ───────────────────────────────────────────
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=whatsapp_bot
POSTGRES_USER=botuser
POSTGRES_PASSWORD=

# ── Redis ────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                  # Leave empty if no auth

# ── ChromaDB ─────────────────────────────────────────────
CHROMA_HOST=localhost
CHROMA_PORT=8000

# ── App ──────────────────────────────────────────────────
NODE_ENV=development             # development | production
PORT=3000
LOG_LEVEL=info                   # debug | info | warn | error

# ── Memory ───────────────────────────────────────────────
SHORT_TERM_MEMORY_TTL=3600       # Redis TTL in seconds (1 hour)
MAX_CONVERSATION_HISTORY=20      # Max messages kept in context
SUMMARY_TRIGGER_COUNT=50         # Messages before auto-summarize
```

# 🚀 AI Nike Assistant / Omnichannel WhatsApp & Telegram AI Chatbot

> **Comprehensive Overview**: This document explains the goals, system architecture, message flow, current progress, tech stack, and future migration path for the AI Chatbot platform.

---

## 📌 1. Project Goals & Core Vision

The primary goal of this repository is to provide a production-ready, enterprise-grade AI Chatbot for **Nike Indonesia** (and adaptable for e-commerce / SaaS operations).

It connects customer messaging channels (**WhatsApp Cloud API** and **Telegram Bot API**) to an intelligent AI agent capable of answering product queries, checking real-time stock, tracking orders, creating support tickets, maintaining personalized customer memory, and processing voice/image media.

### Non-Negotiable Rules & Constraints:
* ❌ **No Unofficial APIs**: Uses ONLY Meta's official WhatsApp Cloud API (no Baileys/Puppeteer wrappers) and official Telegram APIs.
* ❌ **Zero Data Hallucination**: AI must never invent real-time data (stock counts, prices, order statuses). All business data comes directly from PostgreSQL.
* 🔒 **Enterprise Security**: Webhook HMAC-SHA256 signature verification, Pydantic/Zod schema validation, and strict rate-limiting.

---

## 🏗️ 2. System Flow & Architecture

The chatbot operates as an event-driven, multi-turn conversational agent with real-time tool calling.

```
┌────────────────────────────────────────────────────────┐
│  WhatsApp User              Telegram User              │
│       │                           │                    │
│       ▼ POST /webhook             ▼ Webhook / Polling  │
│  Meta Cloud API              Telegram Bot API          │
└───────┬───────────────────────────┬────────────────────┘
        │                           │
        ▼                           ▼
┌────────────────────────────────────────────────────────┐
│             Web Application Layer (HTTP/Security)      │
│  - HMAC Signature / Secret Token Verification          │
│  - Rate Limiter & Sanitization                         │
│  - Payload Normalization (WhatsApp & Telegram → Standard format)
└───────────────────────┬────────────────────────────────┘
                        │
                        ▼
┌────────────────────────────────────────────────────────┐
│                  AI Router & Core Agent                │
│  1. Load Context: Long-term Memory (pgvector) +        │
│     Recent Messages + Conversation Summary             │
│  2. Build System Prompt with Dynamic Tool Schemas      │
│  3. Reasoning Loop: Execute Tool Calls <tool_call>     │
└───────┬───────────────────┬───────────────────┬────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐     ┌──────────────┐    ┌──────────────┐
│  PostgreSQL  │     │   AI Models  │    │ Redis Cache  │
│ - Products   │     │ (GPT-4o /    │    │ - Sessions   │
│ - Orders     │     │  Gemini 1.5) │    │ - Rate limits│
│ - Complaints │     └──────────────┘    └──────────────┘
│ - Vector Mem │
└──────────────┘
```

### Detailed Message Processing Pipeline:
1. **Ingress**: Meta or Telegram sends HTTP POST payload to `/webhook`.
2. **Security & Deduplication**: Signature verified; `whatsapp_msg_id` checked to avoid processing duplicate webhook retries.
3. **Payload Normalization**: Normalizes vendor-specific payload structures into a standard `NormalizedMessage` object (`user_id`, `type`, `text`/`media`).
4. **Context Gathering**: Memory Service retrieves user profile summaries, long-term preference facts via `pgvector` similarity search, and recent conversation history.
5. **AI Orchestration & Tool Execution**:
   - The AI evaluates user intent against available tools (`check_stock`, `check_order_status`, `create_complaint_ticket`, `get_product_recommendation`).
   - If a tool call is required, the system executes parameterized SQL queries or API functions and returns structured JSON to the LLM.
6. **Egress**: Final formatted response sent back via WhatsApp or Telegram API.
7. **Post-Processing**: Automatic summarizer triggers when context history reaches limits (e.g., >50 messages), condensing long histories into short profiles.

---

## 🛠️ 3. Tech Stack Overview

The repository features the current Node.js reference implementation as well as the planned Python + LangGraph enterprise architecture.

### Current Implementation (Node.js)
* **Runtime**: Node.js 20+ (ES Modules)
* **Web Framework**: Express.js
* **AI Provider**: OpenAI GPT-4o / OpenRouter / LangChain.js
* **Embeddings**: Google Gemini (`gemini-embedding-001`) / OpenAI Embeddings
* **Database**: PostgreSQL with `pgvector` extension
* **Caching & Sessions**: Redis v4
* **Vector Store**: ChromaDB / `pgvector`
* **Validation & Security**: Zod runtime validation, Helmet, Winston, Morgan
* **Media Handling**: `fluent-ffmpeg`, `sharp`, Axios

### Target Architecture (Python + LangGraph Handover Plan)
* **Runtime**: Python 3.11+ (Async/Await)
* **Web Framework**: FastAPI (Async webhook processing & Pydantic auto-validation)
* **AI Orchestration**: **LangGraph** (StateGraph replace manual while loops)
* **AI Model**: Google Gemini 1.5 Flash / Pro
* **Backend ERP**: Integration with Django ERP / PostgreSQL

---

## 📊 4. Progress & Implementation Status

| Feature / Phase | Description | Status |
|-----------------|-------------|--------|
| **Phase 1: Foundation** | Express server, WhatsApp Webhook verification, security headers, logger, error handling | ✅ Complete |
| **Phase 2: AI Core** | OpenAI/LangChain integration, reasoning loop, persistent memory with `pgvector` | ✅ Complete |
| **Phase 3: Business Logic** | Real stock queries, Order status tracking, Complaint ticket creation (`TKT-xxx`), Recommendations | ✅ Complete |
| **Phase 4: Advanced Features** | Voice transcription (Whisper), Image recognition (GPT-4o Vision), RAG document search, Redis session caching | 🕒 In Progress / Specified |
| **Phase 5: Infrastructure & Migration**| Docker containerization, Nginx setup, VPS deployment, Python/LangGraph architecture migration | 📋 Documented & Planned |

---

## 📂 5. Key Documentation & Directory Guide

* **`walkthrough.md`**: Quick consolidated overview of the current Node.js implementation status.
* **`HANDOVER.md`**: Technical specification for migrating AI orchestration to Python, FastAPI, and LangGraph.
* **`implementation_plan.md`**: Step-by-step roadmap for all 5 project phases.
* **`docs/`**: Complete specifications breakdown:
  * `01-core/`: Core role, context constraints, and tech stack details.
  * `02-design/`: System architecture diagrams and PostgreSQL schema specs.
  * `03-specifications/`: Meta WhatsApp API contracts, feature specs, and security rules.
  * `04-operations/`: Deployment guidelines (Docker, PM2, Nginx).
  * `05-roadmap/`: 21-step detailed build guide.
* **`docs-python/`**: Python/LangGraph specifications for the upcoming migration.

---

## ⚡ 6. How to Run & Test

1. **Environment Setup**: Copy `.env.example` to `.env` and fill in necessary keys.
2. **Database Migration**:
   - Run `database/init.sql` for PostgreSQL schema.
   - Run `database/pgvector_migration.sql` for semantic search support.
3. **Start Node Server**:
   ```bash
   npm install
   npm run dev
   ```
4. **Health Check**:
   - Test endpoint: `GET http://localhost:3000/health` (Returns `{"status": "ok"}`)

# 08 — Step-by-Step Build Plan (Omnichannel FastAPI Bot)

> **Goal**: Build a FastAPI microservice that handles BOTH WhatsApp and Telegram webhooks, communicates with Google Gemini via a unified AI Router, and calls existing Django ERP APIs for business logic.

---

## Phase 1: Foundation (FastAPI & Dual Webhooks)

### Step 1: Project Setup
- **Goal**: Initialize virtual environment and install core packages.
- **Action**: Create `requirements.txt` with `fastapi`, `uvicorn`, `httpx`, `pydantic`. Setup `.env`.

### Step 2: FastAPI Server Setup
- **Goal**: Running server with health endpoints.
- **Action**: Create `src/main.py`. Setup basic logging and exception handling. 

### Step 3: Webhook Verification (Dual Platform)
- **Goal**: Pass both Meta and Telegram security handshakes.
- **Action**: 
  - `GET/POST /webhook/whatsapp`: Implement HMAC verification.
  - `POST /webhook/telegram`: Implement Secret Token verification.

### Step 4: Omnichannel Payload Normalizer
- **Goal**: Create a generic message format.
- **Action**: Define Pydantic models for Meta and Telegram. Write a parser that takes either payload and returns a `NormalizedMessage` containing `platform`, `user_id`, `type`, and `text/media`.

### Step 5: Platform API Clients
- **Goal**: Send text replies back to the right platform.
- **Action**: Create `src/services/whatsapp.py` and `src/services/telegram.py` using `httpx.AsyncClient` to POST messages to their respective APIs.

---

## Phase 2: AI Core (Gemini Integration)

### Step 6: Gemini Integration
- **Goal**: Basic AI conversation capability.
- **Action**: Install `google-generativeai`. Route incoming `NormalizedMessage` objects to Gemini. Based on `platform`, use the right client to send the reply.

### Step 7: Redis Session Memory
- **Goal**: AI remembers the conversation.
- **Action**: Store session history in Redis using the key `<platform>:<user_id>`. Load this history when prompting Gemini.

### Step 8: Function Calling Setup
- **Goal**: Gemini can decide to execute external tools.
- **Action**: Define Python dictionaries for Gemini Tools. Handle the `function_call` response loop regardless of platform.

---

## Phase 3: ERP Integration

### Step 9: ERP API Client Construction
- **Goal**: FastAPI can talk to your Django ERP securely.
- **Action**: Create `src/services/erp_client.py`. Set up authentication headers using your `ERP_API_TOKEN`.

### Step 10: Stock & Order Tools
- **Goal**: Real-time business logic.
- **Action**: Wire the `check_stock` and `check_order_status` tools to call `GET /api/erp/stock` and `GET /api/erp/orders`. Feed the JSON results back to Gemini.

---

## Phase 4: Advanced Features

### Step 11: Omnichannel Media Downloading
- **Goal**: Process Voice Notes and Photos from either platform natively via Gemini.
- **Action**: Write a downloader that fetches the binary file depending on the `platform` (Meta vs Telegram APIs). Pass the bytes directly to Gemini 1.5 Flash.

### Step 12: RAG Querying via ERP
- **Goal**: Answer questions using `pgvector` hosted in Django.
- **Action**: Create a Gemini Tool `search_knowledge_base`. When called, request `POST /api/erp/rag/query` with the user's question, retrieve the context chunks, and pass them to the LLM.

---

## Phase 5: Infrastructure

### Step 13: Dockerization
- **Goal**: Run the FastAPI app in a container.
- **Action**: Write a `Dockerfile` using a lightweight Python 3.11 slim image. Write `docker-compose.yml` including a Redis container.

# 01 — System Architecture (Omnichannel FastAPI)

## High-Level Architecture Diagram

```
WhatsApp User                      Telegram User
      │                                  │
      ▼                                  ▼
 Meta Servers                      Telegram Servers
      │                                  │
      ▼ (POST /webhook/whatsapp)         ▼ (POST /webhook/telegram)
┌─────────────────────────────────────────────────────────┐
│                    FastAPI Webhook Server               │
│                                                         │
│  ┌────────────────────┐          ┌───────────────────┐  │
│  │ WhatsApp Validator │          │ Telegram Validator│  │
│  │ (HMAC Verify +     │          │ (Secret Token +   │  │
│  │  Pydantic)         │          │  Pydantic)        │  │
│  └─────────┬──────────┘          └─────────┬─────────┘  │
│            │                               │            │
│            ▼                               ▼            │
│  ┌───────────────────────────────────────────────────┐  │
│  │                  Payload Normalizer               │  │
│  │     Converts payloads into generic NormalizedMsg  │  │
│  └─────────────────────────┬─────────────────────────┘  │
└────────────────────────────┼────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│                      AI Orchestrator                    │
│                                                         │
│ 1. Fetch Session from Redis (using platform:user_id)    │
│ 2. Call Gemini API (with memory + tools)                │
│ 3. Call Django ERP APIs (if tool triggered)             │
│ 4. Route Response back to the correct platform client   │
└────────┬───────────────────┬───────────────────┬────────┘
         │                   │                   │
         ▼                   ▼                   ▼
       Redis           Google Gemini       Django ERP APIs
```

---

## Component Responsibilities

### Webhook Server (FastAPI)
- Exposes separate webhook endpoints for WhatsApp and Telegram.
- Applies the correct security validation per platform.

### Payload Normalizer
- Extracts text, media IDs, and sender ID from the raw payloads.
- Converts them into a generic format:
  ```python
  class NormalizedMessage:
      platform: Literal["whatsapp", "telegram"]
      user_id: str  # Phone number or Telegram chat ID
      type: Literal["text", "audio", "image"]
      text: Optional[str]
      media_id: Optional[str]
  ```

### AI Orchestrator
- **Platform Agnostic**: The AI logic only operates on `NormalizedMessage`. It doesn't care where the message came from.
- Uses `platform` and `user_id` as the key for Redis session memory (e.g., `whatsapp:+62812...` or `telegram:1234567`).

### Platform Clients (`src/services/whatsapp.py` & `src/services/telegram.py`)
- Provide uniform functions to send messages back.
- Example: `send_message(normalized_msg, text)` which internally branches to the correct `httpx` POST request based on the platform.

### Django ERP APIs (External Dependency)
- The source of truth for all tools (checking stock, orders, RAG pgvector queries).

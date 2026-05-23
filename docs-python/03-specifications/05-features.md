# 05 — Feature Specifications (Omnichannel & Django ERP)

## 1. Memory System (Redis)

- **Storage**: Redis
- **TTL**: 1 Hour
- **Flow**: The session key is `<platform>:<user_id>` (e.g., `whatsapp:+62812...` or `telegram:123456`). Fetch the last 15 exchanges for this key, pass them to Gemini, and append the new response.

---

## 2. Function / Tool Calling (Gemini)

We map the existing Django ERP endpoints to Gemini Tools. The LLM does not need to know which platform the user is on.

### Execution via HTTP
When Gemini invokes `check_stock`, the FastAPI app executes:
```python
async with httpx.AsyncClient() as client:
    response = await client.get(
        f"{ERP_BASE_URL}/stock",
        params={"name": args["product_name"]},
        headers={"Authorization": f"Bearer {ERP_API_TOKEN}"}
    )
    return response.json()
```

---

## 4. Voice Note and Image Support (Omnichannel)

Gemini 1.5 Flash natively understands audio bytes (`.ogg`, `.mp3`) and image bytes (`.jpeg`, `.png`). Our bot just needs to download the media from the respective platform before passing it to Gemini.

### Telegram Media Flow
1. Receive Telegram Update containing a `voice` or `photo` payload.
2. Get the file path via `https://api.telegram.org/bot<TOKEN>/getFile?file_id=...`.
3. Download media using `httpx`.
4. Pass binary to Gemini.

### WhatsApp Media Flow
1. Receive Meta payload with an `audio` or `image` ID.
2. Request the URL via `https://graph.facebook.com/v18.0/<MEDIA_ID>`.
3. Download the binary data using `httpx` and the Meta Bearer token.
4. Pass binary to Gemini.

---

## 5. RAG Knowledge Base (pgvector)

You store your document embeddings inside a Django model.
1. User asks a question on WA/TG.
2. FastAPI sends `POST /api/rag/query/` to the ERP.
3. Django returns chunks from `pgvector`.
4. FastAPI provides those chunks to Gemini as context.

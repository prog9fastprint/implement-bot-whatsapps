# 05 — Feature Specifications

## Feature Index

1. [Persistent Memory System](#1-persistent-memory-system)
2. [Function / Tool Calling](#2-function--tool-calling)
3. [Real-Time Stock Checking](#3-real-time-stock-checking)
4. [Order Tracking](#4-order-tracking)
5. [Complaint / Ticket System](#5-complaint--ticket-system)
6. [Voice Note to Text](#6-voice-note-to-text)
7. [Image Understanding](#7-image-understanding)
8. [RAG Knowledge Base](#8-rag-knowledge-base)
9. [Recommendation Engine](#9-recommendation-engine)

---

## 1. Persistent Memory System

### Goal
The AI must remember users permanently, identified by their WhatsApp phone number.

### Memory Layers

| Layer | Storage | TTL | Purpose |
|-------|---------|-----|---------|
| Short-term | Redis | 1 hour (configurable) | Current session messages |
| Long-term | PostgreSQL `ai_memories` | Permanent | Learned facts about user |
| Summaries | PostgreSQL `ai_summaries` | Permanent | Compressed old conversations |

### Memory Flow

```
New message arrives from +62812345678
  │
  ├─ 1. Load from Redis: last N messages (short-term session)
  ├─ 2. Load from PostgreSQL ai_memories: user facts/preferences
  ├─ 3. Load latest ai_summary (if message history > threshold)
  │
  ├─ Build context:
  │    [System Prompt]
  │    [User Summary: "Budi, prefers arabica coffee, size 42 shoes..."]
  │    [User Memories: { coffee: arabica, shoe_size: 42 }]
  │    [Recent Messages: last 20 exchanges]
  │    [Current Message]
  │
  ├─ AI generates response
  │
  └─ Save to Redis (session) + PostgreSQL (message)
       │
       └─ If new fact detected (name, preference, etc.):
            └─ Upsert to ai_memories table
```

### Expected Behavior Example

```
Week 1:
User: "Nama saya Budi dan saya suka kopi arabica."
AI: "Halo Budi! Saya akan ingat preferensi kopi Anda."
[Saved to ai_memories: { key: "coffee_preference", value: "arabica" }]

Week 4:
User: "Kopi apa yang cocok untuk saya?"
AI: "Karena kamu suka kopi arabica, saya rekomendasikan..."
```

### Auto-Summarization Trigger
When a user's conversation history exceeds `SUMMARY_TRIGGER_COUNT` (default: 50 messages), automatically:
1. Take the oldest 30 messages
2. Send to GPT with prompt: "Summarize these conversations into a concise user profile"
3. Store result in `ai_summaries`
4. Remove summarized messages from active context

---

## 2. Function / Tool Calling

### Goal
The AI automatically decides when to call tools instead of guessing real-time data.

### Tool Definitions (OpenAI format)

```javascript
const tools = [
  {
    type: "function",
    function: {
      name: "check_stock",
      description: "Check real-time stock availability for a product variant. Call this whenever a user asks about product availability or stock.",
      parameters: {
        type: "object",
        properties: {
          product_name: { type: "string", description: "Product name e.g. Nike Air Max 90" },
          size: { type: "string", description: "Size if applicable e.g. 42, XL" },
          color: { type: "string", description: "Color if specified" }
        },
        required: ["product_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_price",
      description: "Get current price for a product. Call this when user asks about price or cost.",
      parameters: {
        type: "object",
        properties: {
          product_name: { type: "string" },
          size: { type: "string" }
        },
        required: ["product_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_order_status",
      description: "Check the current status of a customer's order. Call when user asks about their order.",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string", description: "Order number e.g. ORD-20240101-0001" },
          phone_number: { type: "string", description: "User's phone number as fallback" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_complaint_ticket",
      description: "Create a support ticket for a customer complaint. Call when user reports a problem.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string" },
          description: { type: "string" },
          order_number: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }
        },
        required: ["subject", "description"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_product_recommendation",
      description: "Get AI-powered product recommendations based on user preferences.",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string" },
          budget_max: { type: "number" },
          preferences: { type: "string", description: "User preferences and requirements" }
        }
      }
    }
  }
];
```

### Tool Calling Flow

```
User: "Apakah stok Nike Air size 42 masih ada?"

1. Send to OpenAI with tools array
2. OpenAI responds with tool_call: check_stock({ product_name: "Nike Air", size: "42" })
3. Execute check_stock → query PostgreSQL → return { stock: 8, unit: "pcs", price: 1500000 }
4. Send tool result back to OpenAI
5. OpenAI generates: "Stok Nike Air ukuran 42 masih tersedia 8 pcs dengan harga Rp 1.500.000."
```

---

## 3. Real-Time Stock Checking

### Rule
**NEVER** estimate or guess stock. Always query the database.

### Query Logic
```sql
-- check_stock function implementation
SELECT
  p.name,
  pv.variant_name,
  pv.size,
  pv.color,
  pv.stock,
  pv.price
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE
  p.is_active = TRUE
  AND pv.is_active = TRUE
  AND p.name ILIKE '%Nike Air%'    -- fuzzy match from AI extraction
  AND (pv.size = '42' OR '42' IS NULL)
ORDER BY pv.stock DESC
LIMIT 5;
```

### Response Format
```
"Stok Nike Air ukuran 42 masih tersedia 8 pcs."
"Maaf, stok Nike Air ukuran 42 sedang kosong. Ukuran 41 dan 43 masih tersedia."
```

---

## 4. Order Tracking

### Query Logic
```sql
-- check_order_status function implementation
SELECT
  o.order_number,
  o.status,
  o.tracking_number,
  o.courier,
  o.created_at,
  o.updated_at,
  json_agg(json_build_object(
    'product', p.name,
    'variant', pv.variant_name,
    'quantity', oi.quantity,
    'price', oi.unit_price
  )) as items
FROM orders o
JOIN users u ON u.id = o.user_id
JOIN order_items oi ON oi.order_id = o.id
JOIN product_variants pv ON pv.id = oi.variant_id
JOIN products p ON p.id = pv.product_id
WHERE o.order_number = $1 OR u.phone_number = $2
GROUP BY o.id
ORDER BY o.created_at DESC
LIMIT 1;
```

### Status Messages (Indonesian)

| Status | Response |
|--------|----------|
| `pending` | "Pesanan Anda sedang menunggu konfirmasi." |
| `confirmed` | "Pesanan Anda sudah dikonfirmasi dan sedang diproses." |
| `shipped` | "Pesanan Anda sedang dalam pengiriman. No resi: {tracking}" |
| `delivered` | "Pesanan Anda sudah diterima." |
| `cancelled` | "Pesanan Anda telah dibatalkan." |

---

## 5. Complaint / Ticket System

### Flow
```
User: "Saya mau komplen, sepatu yang saya terima salah ukuran"

1. AI detects complaint intent
2. AI calls create_complaint_ticket({
     subject: "Produk salah ukuran",
     description: "Pelanggan menerima sepatu ukuran yang tidak sesuai pesanan",
     priority: "medium"
   })
3. System creates ticket: TKT-20240101-0001
4. AI responds: "Tiket keluhan Anda berhasil dibuat dengan nomor TKT-20240101-0001.
                  Tim kami akan menghubungi Anda dalam 1x24 jam."
```

### Ticket Number Generation
```javascript
// Format: TKT-YYYYMMDD-XXXX
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const sequence = String(await getNextSequence()).padStart(4, '0');
const ticketNumber = `TKT-${date}-${sequence}`;
```

---

## 6. Voice Note to Text

### Flow
```
User sends voice note (audio/ogg)
  │
  ├─ 1. Receive webhook: type=audio, media ID extracted
  ├─ 2. Get media URL from Meta API
  ├─ 3. Download binary audio file
  ├─ 4. Convert ogg → mp3 using ffmpeg (Whisper works better with mp3)
  ├─ 5. Upload to OpenAI Whisper API
  ├─ 6. Receive transcript text
  └─ 7. Process transcript as regular text message
```

### Whisper API Call
```javascript
const transcription = await openai.audio.transcriptions.create({
  file: fs.createReadStream(audioFilePath),
  model: "whisper-1",
  language: "id",  // Indonesian - improves accuracy
  response_format: "text"
});
```

### Supported Audio Formats from WhatsApp
- `audio/ogg` (opus codec) — default WhatsApp format
- `audio/mp4` — from some devices

---

## 7. Image Understanding

### Flow
```
User sends product image
  │
  ├─ 1. Download image from WhatsApp
  ├─ 2. Convert to base64
  ├─ 3. Send to GPT-4o Vision with system prompt
  └─ 4. Return product identification + recommendations
```

### GPT-4o Vision Prompt
```
You are a product identification specialist for an e-commerce platform.
When shown an image:
1. Identify the product (name, brand, type)
2. Describe key features visible in the image
3. Suggest similar products from our catalog
4. Answer any specific question the user has about the image

Respond in the same language the user is using.
```

### API Call Structure
```javascript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{
    role: "user",
    content: [
      { type: "text", text: userCaption || "Produk apa ini?" },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
          detail: "high"
        }
      }
    ]
  }]
});
```

---

## 8. RAG Knowledge Base

### Supported Document Types
- PDF product catalogs
- FAQ documents
- SOP/policy documents
- Product manuals

### Pipeline
```
Document Ingestion (one-time / on update):
  PDF file → LangChain PDFLoader → Text chunks (500 tokens, 50 overlap)
  → OpenAI Embeddings → ChromaDB storage

Query Flow (real-time):
  User message → Embed query → ChromaDB similarity search → Top 3 chunks
  → Inject into OpenAI prompt as context
```

### LangChain Setup
```javascript
// Ingestion
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Chroma } from "@langchain/community/vectorstores/chroma";

const loader = new PDFLoader("./knowledge/catalog.pdf");
const docs = await loader.load();
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 50 });
const chunks = await splitter.splitDocuments(docs);
const vectorStore = await Chroma.fromDocuments(chunks, new OpenAIEmbeddings(), {
  collectionName: "product_knowledge"
});
```

---

## 9. Recommendation Engine

### Logic Flow
```
User: "Rekomendasikan sepatu untuk lari marathon budget 1 juta"

1. AI calls get_product_recommendation({
     category: "footwear",
     budget_max: 1000000,
     preferences: "lari marathon"
   })
2. Query: SELECT * FROM products WHERE category='footwear' AND variants.price <= 1000000
3. Also: Similarity search in ChromaDB for "marathon running shoes"
4. Combine DB results + RAG results + user's past preferences (from ai_memories)
5. AI ranks and explains recommendations
```

### Personalization Layer
Always check `ai_memories` for the user before recommending:
- Past purchases
- Size preferences
- Brand preferences
- Budget range
- Activity type

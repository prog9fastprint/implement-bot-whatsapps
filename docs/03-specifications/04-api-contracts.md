# 04 — WhatsApp Cloud API Contracts

## Official API Only

> ❌ Do NOT use Baileys, whatsapp-web.js, or any unofficial library.
> ✅ Use ONLY Meta's WhatsApp Cloud API: `https://graph.facebook.com/{version}/`

---

## Setup Prerequisites

| Requirement | Where to Get It |
|-------------|----------------|
| Meta Developer Account | developers.facebook.com |
| WhatsApp Business App | Meta Developer Console |
| Phone Number ID | App → WhatsApp → Getting Started |
| Access Token | Temporary (dev) or System User token (prod) |
| Webhook Verify Token | You choose — any random string |
| Public HTTPS URL | ngrok (dev) or your VPS domain (prod) |

---

## 1. Webhook Verification (GET)

Meta sends a GET request to verify your webhook endpoint when you register it.

**Request from Meta:**
```
GET /webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE_STRING
```

**Your server must respond:**
```
Status: 200 OK
Body: hub.challenge value (plain text, not JSON)
```

**Implementation contract:**
```javascript
// Route: GET /webhook
// Verify hub.verify_token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN env var
// If match: respond with hub.challenge
// If no match: respond 403 Forbidden
```

---

## 2. Incoming Message Events (POST)

Meta sends all events as POST to `/webhook`. Your server must always respond `200 OK` immediately, then process asynchronously.

> ⚠️ If you don't respond 200 within 5 seconds, Meta will retry — causing duplicate processing.

**Webhook POST body structure:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "BUSINESS_ACCOUNT_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "DISPLAY_NUMBER",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": { "name": "User Display Name" },
          "wa_id": "6281234567890"
        }],
        "messages": [{
          "id": "wamid.xxxxx",
          "from": "6281234567890",
          "timestamp": "1234567890",
          "type": "text",
          "text": { "body": "Hello!" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**Message types you must handle:**

| `type` value | Payload field | Action |
|-------------|--------------|--------|
| `text` | `message.text.body` | Process as text |
| `audio` | `message.audio.id` | Download → Whisper |
| `image` | `message.image.id` | Download → Vision |
| `interactive` | `message.interactive` | Handle button/list reply |
| `location` | `message.location` | Extract lat/lng |
| `status` | Top-level status event | Update delivery status |

---

## 3. Sending Messages (POST)

**Endpoint:**
```
POST https://graph.facebook.com/{version}/{phone_number_id}/messages
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Send Text Message
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "6281234567890",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "Your reply message here"
  }
}
```

### Send Interactive List (for menus/options)
```json
{
  "messaging_product": "whatsapp",
  "to": "6281234567890",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "header": { "type": "text", "text": "Pilih Kategori" },
    "body": { "text": "Silakan pilih kategori produk:" },
    "action": {
      "button": "Lihat Pilihan",
      "sections": [{
        "title": "Kategori",
        "rows": [
          { "id": "cat_footwear", "title": "Sepatu", "description": "Nike, Adidas, dll" },
          { "id": "cat_apparel", "title": "Pakaian", "description": "Kaos, Jaket, dll" }
        ]
      }]
    }
  }
}
```

### Send Interactive Buttons (max 3 buttons)
```json
{
  "messaging_product": "whatsapp",
  "to": "6281234567890",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Apakah Anda ingin membuat tiket keluhan?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "yes_complaint", "title": "Ya, buat tiket" } },
        { "type": "reply", "reply": { "id": "no_complaint", "title": "Tidak perlu" } }
      ]
    }
  }
}
```

---

## 4. Media Download

When a user sends audio/image, you receive a media ID. Use it to:

**Step 1 — Get media URL:**
```
GET https://graph.facebook.com/{version}/{media_id}
Authorization: Bearer {access_token}
```
Response: `{ "url": "https://lookaside.fbsbx.com/...", "mime_type": "audio/ogg", "id": "..." }`

**Step 2 — Download the file:**
```
GET {url_from_step_1}
Authorization: Bearer {access_token}
```
Response: Raw binary file

> ⚠️ Media URLs expire after ~5 minutes. Download immediately upon receiving the webhook.

---

## 5. Message Status Events

Status updates arrive in the same POST webhook as messages, but in a `statuses` array:

```json
{
  "statuses": [{
    "id": "wamid.xxxxx",
    "status": "delivered",
    "timestamp": "1234567890",
    "recipient_id": "6281234567890"
  }]
}
```

| Status | Meaning |
|--------|---------|
| `sent` | Sent to WhatsApp servers |
| `delivered` | Delivered to user's device |
| `read` | User opened the message |
| `failed` | Delivery failed |

---

## 6. Deduplication

WhatsApp may send duplicate webhook events. Always:
1. Check `messages[0].id` (the `wamid`) against the `messages.whatsapp_msg_id` column
2. If it exists, return `200 OK` immediately and skip processing
3. Use a database UNIQUE constraint on `whatsapp_msg_id` as the final guard

---

## 7. Rate Limits (Meta-imposed)

| Limit | Value |
|-------|-------|
| Messages per second per phone number | ~80 |
| Conversations per 24h (free tier) | 1000 |
| Media file size | 16 MB (audio), 5 MB (image) |

Implement your own rate limiter to stay within these bounds (see `06-security.md`).

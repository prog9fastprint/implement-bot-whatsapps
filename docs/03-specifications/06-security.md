# 06 — Security Requirements

## Security Checklist

| Requirement | Implementation |
|-------------|---------------|
| Webhook signature verification | HMAC-SHA256 |
| Rate limiting | express-rate-limit per phone number |
| SQL injection prevention | Parameterized queries only |
| Input validation | Zod schemas |
| Secrets management | .env + environment variables |
| API key protection | Never in code, never logged |
| Error handling | Never expose stack traces in responses |
| Logging | Structured logs, no PII in log bodies |
| Helmet | Security headers on all responses |
| HTTPS only | Nginx + Let's Encrypt |

---

## 1. Webhook Signature Verification

Meta signs every webhook request using HMAC-SHA256 with your App Secret.

**How it works:**
- Meta sends header: `X-Hub-Signature-256: sha256=HASH`
- Hash is `HMAC-SHA256(rawBody, APP_SECRET)`
- You must verify this on every POST to `/webhook`

**Implementation:**
```javascript
import crypto from 'crypto';

export function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  
  if (!signature) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(req.rawBody)  // Must use raw body buffer, not parsed JSON
    .digest('hex');

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}
```

> ⚠️ You need the raw body buffer BEFORE JSON parsing. Use `express.raw()` before `express.json()` for the webhook route.

---

## 2. Rate Limiting

Apply two layers of rate limiting:

### Layer 1 — Global (per IP)
```javascript
import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

### Layer 2 — Per Phone Number (via Redis)
```javascript
// In message processing — before AI call
export async function checkUserRateLimit(phoneNumber) {
  const key = `rate:${phoneNumber}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60);  // 1 minute window
  }
  
  if (count > 20) {  // Max 20 messages per minute per user
    throw new RateLimitError('Rate limit exceeded');
  }
}
```

---

## 3. SQL Injection Prevention

**ALWAYS use parameterized queries. NEVER concatenate user input into SQL.**

```javascript
// ❌ WRONG — SQL injection vulnerable
const result = await db.query(`SELECT * FROM users WHERE phone = '${phoneNumber}'`);

// ✅ CORRECT — Parameterized
const result = await db.query('SELECT * FROM users WHERE phone_number = $1', [phoneNumber]);
```

All database queries must use the `$1, $2, ...` placeholder syntax with the `pg` client.

---

## 4. Input Validation with Zod

Validate all incoming webhook data before processing:

```javascript
import { z } from 'zod';

const WhatsAppMessageSchema = z.object({
  from: z.string().regex(/^\d{10,15}$/),  // E.164 without +
  id: z.string().min(1),
  timestamp: z.string(),
  type: z.enum(['text', 'audio', 'image', 'interactive', 'location']),
  text: z.object({ body: z.string().max(4096) }).optional(),
  audio: z.object({ id: z.string() }).optional(),
  image: z.object({ id: z.string(), caption: z.string().optional() }).optional(),
});

// Validate before processing
const validated = WhatsAppMessageSchema.safeParse(rawMessage);
if (!validated.success) {
  logger.warn('Invalid message schema', { errors: validated.error.errors });
  return;  // Silently drop invalid messages
}
```

---

## 5. Environment Variable Rules

```
✅ All secrets in .env
✅ .env listed in .gitignore
✅ .env.example committed with placeholder values
✅ Secrets accessed only via process.env
❌ Never log process.env values
❌ Never hardcode tokens, keys, or passwords
❌ Never commit .env to version control
```

**.env.example** (always commit this):
```dotenv
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_APP_SECRET=your_app_secret_here
WHATSAPP_WEBHOOK_VERIFY_TOKEN=choose_a_random_string
OPENAI_API_KEY=sk-your_key_here
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=whatsapp_bot
POSTGRES_USER=botuser
POSTGRES_PASSWORD=your_password_here
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## 6. Logging (Structured, No PII)

Use Winston for structured JSON logging. Never log:
- Full message content (could be PII)
- API keys or tokens
- Full phone numbers in production (mask them: `+628***7890`)

```javascript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    ...(process.env.NODE_ENV !== 'production'
      ? [new winston.transports.Console({ format: winston.format.simple() })]
      : [])
  ]
});

// Mask phone number utility
export const maskPhone = (phone) => phone.replace(/(\d{3})\d+(\d{4})/, '$1***$2');
```

---

## 7. Error Handling

Never expose internal errors to WhatsApp users or in API responses.

```javascript
// Global error handler in Express
export function errorHandler(err, req, res, next) {
  // Log internally with full detail
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path
  });

  // Return generic response — never expose stack trace
  res.status(500).json({ error: 'Internal server error' });
}

// In AI processing — send friendly message to user on failure
try {
  await processMessage(message);
} catch (err) {
  logger.error('Message processing failed', { error: err.message });
  await sendWhatsAppMessage(userPhone,
    "Maaf, terjadi gangguan sementara. Silakan coba lagi dalam beberapa saat."
  );
}
```

---

## 8. Helmet Security Headers

```javascript
import helmet from 'helmet';
app.use(helmet());
// Adds: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
//        Strict-Transport-Security, Content-Security-Policy, etc.
```

---

## 9. CORS Configuration

The webhook only needs to accept requests from Meta's servers. Restrict accordingly:

```javascript
import cors from 'cors';

app.use(cors({
  origin: false,  // Disable CORS for webhook — only server-to-server
  methods: ['GET', 'POST'],
}));
```

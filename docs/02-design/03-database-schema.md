# 03 — PostgreSQL Database Schema

## Schema Design Principles

- Every table has `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Every table has `created_at` and `updated_at` timestamps
- Foreign keys enforce referential integrity
- JSONB columns used for flexible/dynamic data (metadata, preferences, tool results)
- Indexes on all foreign keys and commonly queried columns

---

## Entity Relationship Overview

```
users
 └── conversations (1:many)
      └── messages (1:many)
 └── orders (1:many)
      └── order_items (1:many) ──→ product_variants
 └── complaints (1:many) ──→ orders (optional)
 └── ai_memories (1:many)
 └── ai_summaries (1:many)

products
 └── product_variants (1:many)
```

---

## Full Schema (SQL)

### `users`
Stores every WhatsApp user. Identified by phone number.

```sql
CREATE TABLE users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    VARCHAR(20) UNIQUE NOT NULL,  -- E.164 format e.g. +6281234567890
  name            VARCHAR(100),                 -- Learned from conversation
  language        VARCHAR(10) DEFAULT 'id',     -- Preferred language code
  preferences     JSONB       DEFAULT '{}',     -- { "coffee": "arabica", "size": "42" }
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);
```

---

### `conversations`
Groups messages into logical sessions per user.

```sql
CREATE TABLE conversations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_key     VARCHAR(100),                 -- Redis session key reference
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  message_count   INT         DEFAULT 0,
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_active ON conversations(user_id, is_active);
```

---

### `messages`
Individual messages within a conversation.

```sql
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'interactive', 'template');

CREATE TABLE messages (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID            NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  whatsapp_msg_id VARCHAR(200),              -- Meta's message ID (for deduplication)
  role            message_role    NOT NULL,
  type            message_type    DEFAULT 'text',
  content         TEXT            NOT NULL,  -- Text or transcribed audio
  media_url       TEXT,                      -- Original media URL (audio/image)
  tool_calls      JSONB,                     -- OpenAI tool call results
  tokens_used     INT,
  created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE UNIQUE INDEX idx_messages_wa_id ON messages(whatsapp_msg_id) WHERE whatsapp_msg_id IS NOT NULL;
```

---

### `products`

```sql
CREATE TABLE products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku             VARCHAR(50) UNIQUE NOT NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  category        VARCHAR(100),
  brand           VARCHAR(100),
  image_url       TEXT,
  tags            TEXT[],                    -- For search/recommendation
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
```

---

### `product_variants`
A product can have multiple variants (size, color, etc.).

```sql
CREATE TABLE product_variants (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_name    VARCHAR(100)  NOT NULL,   -- e.g. "Size 42 - Black"
  size            VARCHAR(20),
  color           VARCHAR(50),
  price           NUMERIC(12,2) NOT NULL,
  stock           INT           NOT NULL DEFAULT 0,
  weight_grams    INT,
  barcode         VARCHAR(100),
  is_active       BOOLEAN       DEFAULT TRUE,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_stock ON product_variants(stock) WHERE is_active = TRUE;
```

---

### `orders`

```sql
CREATE TYPE order_status AS ENUM (
  'pending', 'confirmed', 'processing',
  'shipped', 'delivered', 'cancelled', 'refunded'
);

CREATE TABLE orders (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    VARCHAR(50)   UNIQUE NOT NULL, -- Human-readable: ORD-20240101-0001
  user_id         UUID          NOT NULL REFERENCES users(id),
  status          order_status  DEFAULT 'pending',
  total_amount    NUMERIC(12,2) NOT NULL,
  shipping_address JSONB,                    -- { street, city, province, postal_code }
  tracking_number VARCHAR(100),
  courier         VARCHAR(50),
  notes           TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);
```

---

### `order_items`

```sql
CREATE TABLE order_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id      UUID          NOT NULL REFERENCES product_variants(id),
  quantity        INT           NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  subtotal        NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
```

---

### `complaints`

```sql
CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE complaints (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   VARCHAR(50)        UNIQUE NOT NULL, -- TKT-20240101-0001
  user_id         UUID               NOT NULL REFERENCES users(id),
  order_id        UUID               REFERENCES orders(id), -- Optional
  subject         VARCHAR(300)       NOT NULL,
  description     TEXT               NOT NULL,
  status          complaint_status   DEFAULT 'open',
  priority        complaint_priority DEFAULT 'medium',
  resolution      TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ        DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        DEFAULT NOW()
);

CREATE INDEX idx_complaints_user ON complaints(user_id);
CREATE INDEX idx_complaints_status ON complaints(status);
```

---

### `ai_memories`
Long-term facts the AI has learned about a user.

```sql
CREATE TABLE ai_memories (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_type     VARCHAR(50) NOT NULL, -- 'preference', 'fact', 'purchase_history', 'allergy'
  key             VARCHAR(100) NOT NULL, -- e.g. 'coffee_preference'
  value           TEXT        NOT NULL, -- e.g. 'arabica, medium roast'
  confidence      FLOAT       DEFAULT 1.0, -- 0.0 to 1.0
  source_msg_id   UUID        REFERENCES messages(id),
  expires_at      TIMESTAMPTZ,           -- NULL = permanent
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, memory_type, key)
);

CREATE INDEX idx_memories_user ON ai_memories(user_id);
CREATE INDEX idx_memories_type ON ai_memories(user_id, memory_type);
```

---

### `ai_summaries`
Periodic GPT-generated summaries of long conversation histories.

```sql
CREATE TABLE ai_summaries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id   UUID        REFERENCES conversations(id),
  summary           TEXT        NOT NULL,   -- GPT-generated summary
  message_range_start UUID      REFERENCES messages(id),
  message_range_end   UUID      REFERENCES messages(id),
  message_count     INT         NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_summaries_user ON ai_summaries(user_id);
```

---

## Auto-Update `updated_at` Trigger

```sql
-- Reusable trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables that have updated_at
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Repeat for: conversations, products, product_variants, orders, complaints, ai_memories
```

---

## Seed Data (Development)

```sql
-- Sample products
INSERT INTO products (sku, name, category, brand, tags) VALUES
  ('NIKE-AIR-001', 'Nike Air Max 90', 'footwear', 'Nike', ARRAY['sneakers', 'running', 'casual']),
  ('NIKE-AIR-002', 'Nike Air Force 1', 'footwear', 'Nike', ARRAY['sneakers', 'lifestyle']);

-- Sample variants
INSERT INTO product_variants (product_id, variant_name, size, price, stock)
SELECT id, 'Nike Air Max 90 - Size 42', '42', 1500000, 8
FROM products WHERE sku = 'NIKE-AIR-001';
```

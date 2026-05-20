-- 03 — PostgreSQL Database Schema for AI WhatsApp Chatbot

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ENUM TYPES ──────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'interactive', 'template');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM (
      'pending', 'confirmed', 'processing',
      'shipped', 'delivered', 'cancelled', 'refunded'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE complaint_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE complaint_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ── TABLES ──────────────────────────────────────────────

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    VARCHAR(20) UNIQUE NOT NULL,  -- E.164 format e.g. 6281234567890
  name            VARCHAR(100),                 -- Learned from conversation
  language        VARCHAR(10) DEFAULT 'id',     -- Preferred language code
  preferences     JSONB       DEFAULT '{}',     -- { "coffee": "arabica", "size": "42" }
  is_active       BOOLEAN     DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);

-- 2. Conversations
CREATE TABLE IF NOT EXISTS conversations (
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

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_active ON conversations(user_id, is_active);

-- 3. Messages
CREATE TABLE IF NOT EXISTS messages (
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

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(whatsapp_msg_id) WHERE whatsapp_msg_id IS NOT NULL;

-- 4. Products
CREATE TABLE IF NOT EXISTS products (
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

CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

-- 5. Product Variants
CREATE TABLE IF NOT EXISTS product_variants (
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

CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_stock ON product_variants(stock) WHERE is_active = TRUE;

-- 6. Orders
CREATE TABLE IF NOT EXISTS orders (
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

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);

-- 7. Order Items
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id      UUID          NOT NULL REFERENCES product_variants(id),
  quantity        INT           NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  subtotal        NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- 8. Complaints
CREATE TABLE IF NOT EXISTS complaints (
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

CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);

-- 9. AI Memories
CREATE TABLE IF NOT EXISTS ai_memories (
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

CREATE INDEX IF NOT EXISTS idx_memories_user ON ai_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_type ON ai_memories(user_id, memory_type);

-- 10. AI Summaries
CREATE TABLE IF NOT EXISTS ai_summaries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id   UUID        REFERENCES conversations(id),
  summary           TEXT        NOT NULL,   -- GPT-generated summary
  message_range_start UUID      REFERENCES messages(id),
  message_range_end   UUID      REFERENCES messages(id),
  message_count     INT         NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_user ON ai_summaries(user_id);

-- ── TRIGGERS ──────────────────────────────────────────

-- Reusable trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name IN (
            SELECT table_name 
            FROM information_schema.columns 
            WHERE column_name = 'updated_at' 
            AND table_schema = 'public'
        )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', t, t);
        EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
    END LOOP;
END $$;

-- ── SEED DATA ──────────────────────────────────────────

-- Seed Nike Products
INSERT INTO products (sku, name, category, brand, description, tags) 
VALUES
  ('NIKE-AIR-001', 'Nike Air Max 90', 'footwear', 'Nike', 'The classic Nike Air Max 90 with updated colors and materials.', ARRAY['sneakers', 'running', 'casual']),
  ('NIKE-AIR-002', 'Nike Air Force 1', 'footwear', 'Nike', 'Legendary street style meets basketball performance.', ARRAY['sneakers', 'lifestyle', 'classic'])
ON CONFLICT (sku) DO NOTHING;

-- Seed Product Variants
INSERT INTO product_variants (product_id, variant_name, size, color, price, stock)
SELECT id, 'Nike Air Max 90 - Size 42 - White', '42', 'White', 1500000, 10
FROM products WHERE sku = 'NIKE-AIR-001'
ON CONFLICT DO NOTHING;

INSERT INTO product_variants (product_id, variant_name, size, color, price, stock)
SELECT id, 'Nike Air Max 90 - Size 43 - White', '43', 'White', 1500000, 5
FROM products WHERE sku = 'NIKE-AIR-001'
ON CONFLICT DO NOTHING;

INSERT INTO product_variants (product_id, variant_name, size, color, price, stock)
SELECT id, 'Nike Air Force 1 - Size 42 - Black', '42', 'Black', 1300000, 15
FROM products WHERE sku = 'NIKE-AIR-002'
ON CONFLICT DO NOTHING;

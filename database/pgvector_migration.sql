-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Drop the existing vector column (if it exists) to fix dimensions
ALTER TABLE ai_memories DROP COLUMN IF EXISTS embedding;

-- 3. Add vector column with 3072 dimensions (Gemini text-embedding-004 standard)
ALTER TABLE ai_memories ADD COLUMN embedding vector(3072);

-- 4. Create an HNSW index for fast search
CREATE INDEX ON ai_memories USING hnsw (embedding vector_cosine_ops);

-- 5. Add vector column to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(3072);

-- 6. Skip index creation for products vector search (since dimensions > 2000 is not supported for indexing in this pgvector version, and catalog is small enough to perform sequential scans).
-- CREATE INDEX IF NOT EXISTS idx_products_embedding ON products USING ivfflat (embedding vector_cosine_ops);

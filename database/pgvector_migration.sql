-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Drop the existing vector column (if it exists) to fix dimensions
ALTER TABLE ai_memories DROP COLUMN IF EXISTS embedding;

-- 3. Add vector column with 3072 dimensions (Gemini text-embedding-004 standard)
ALTER TABLE ai_memories ADD COLUMN embedding vector(3072);

-- 4. Create an HNSW index for fast search
CREATE INDEX ON ai_memories USING hnsw (embedding vector_cosine_ops);

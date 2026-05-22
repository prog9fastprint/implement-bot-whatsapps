import db from '../database/client.js';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

// Initialize Gemini Embeddings (matching memoryService settings)
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: config.GOOGLE_API_KEY,
  modelName: "gemini-embedding-001",
  dimensions: 1536,
});

async function main() {
  try {
    logger.info('Starting product embedding migration & seeding...');

    // 1. Ensure columns and indexes exist in target database
    logger.info('Ensuring products table has embedding column...');
    await db.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding vector(3072);
    `);
    // No index is needed for products since the catalog is small and pgvector version limits index dimensions to 2000.
    logger.info('✅ Database schema verified.');

    // 2. Fetch all active products
    logger.info('Fetching products from database...');
    const res = await db.query('SELECT id, name, category, brand, description, tags FROM products WHERE is_active = TRUE');
    const products = res.rows;
    logger.info(`Found ${products.length} products to embed.`);

    // 3. Generate embeddings and update products
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      logger.info(`[${i + 1}/${products.length}] Embedding product: ${product.name}...`);

      const textToEmbed = `Name: ${product.name}
Category: ${product.category}
Brand: ${product.brand}
Description: ${product.description}
Tags: ${product.tags ? product.tags.join(', ') : ''}`;

      const embedding = await embeddings.embedQuery(textToEmbed);

      await db.query(
        'UPDATE products SET embedding = $1 WHERE id = $2',
        [JSON.stringify(embedding), product.id]
      );
    }

    logger.info('✅ Product embeddings seeded successfully.');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Failed to seed product embeddings:', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

main();

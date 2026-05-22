import db from '../database/client.js';
import { logger } from '../middleware/requestLogger.js';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import config from '../config/env.js';

// Initialize Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: config.GOOGLE_API_KEY,
  modelName: "gemini-embedding-001",
  dimensions: 1536,
});

/**
 * Check stock for a specific product and variant.
 * @param {object} params - { product_name, size, color }
 */
export async function checkStock({ product_name, size, color }) {
  try {
    logger.debug(`Checking stock for (semantic): ${product_name} ${size || ''}`);
    
    // Generate embedding for semantic matching
    const searchEmbedding = await embeddings.embedQuery(product_name);
    
    // Semantic search using pgvector
    const query = `
      SELECT p.name, v.variant_name, v.size, v.color, v.stock, v.price,
             1 - (p.embedding <=> $1::vector) AS similarity
      FROM products p
      JOIN product_variants v ON p.id = v.product_id
      WHERE p.is_active = TRUE AND v.is_active = TRUE
      AND ($2::VARCHAR IS NULL OR v.size = $2)
      AND ($3::VARCHAR IS NULL OR v.color = $3)
      ORDER BY similarity DESC
      LIMIT 5;
    `;
    const res = await db.query(query, [JSON.stringify(searchEmbedding), size || null, color || null]);
    
    // Filter matches with acceptable similarity
    const matches = res.rows.filter(item => item.similarity >= 0.35);
    
    if (matches.length === 0) {
      return { status: 'not_found', message: `Produk "${product_name}" tidak ditemukan.` };
    }

    return { status: 'success', data: matches };
  } catch (error) {
    logger.error('Error in checkStock service', { error: error.message });
    throw error;
  }
}

/**
 * Get the current price of a product.
 * @param {object} params - { product_name, size }
 */
export async function getProductPrice({ product_name, size }) {
  try {
    const res = await checkStock({ product_name, size });
    if (res.status === 'success') {
      return { status: 'success', data: res.data.map(item => ({ name: item.variant_name, price: item.price })) };
    }
    return res;
  } catch (error) {
    logger.error('Error in getProductPrice service', { error: error.message });
    throw error;
  }
}

export default {
  checkStock,
  getProductPrice,
};

import db from '../database/client.js';
import memoryService from './memoryService.js';
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
 * Get personalized product recommendations based on preferences, budget, and category.
 * Integrates user preferences/memories from PostgreSQL.
 * @param {object} params - { category, budget_max, preferences, userId }
 */
export async function getProductRecommendation({ category, budget_max, preferences, userId }) {
  try {
    logger.info(`Getting product recommendations (semantic). Category: ${category || 'any'}, Budget: ${budget_max || 'any'}, Preferences: ${preferences || 'none'}, User: ${userId || 'none'}`);

    // Load user memories to personalize recommendation
    let userMemories = [];
    if (userId) {
      userMemories = await memoryService.loadUserMemory(userId);
    }

    // Try to extract shoe/clothing size and color preference from memories
    let sizePref = null;
    let colorPref = null;

    for (const mem of userMemories) {
      const keyLower = mem.key.toLowerCase();
      if (keyLower.includes('size') || keyLower.includes('ukuran')) {
        sizePref = mem.value;
      }
      if (keyLower.includes('color') || keyLower.includes('warna')) {
        colorPref = mem.value;
      }
    }

    // Also look at preferences string passed by the AI model
    if (preferences) {
      const sizeMatch = preferences.match(/(?:size|ukuran)\s*(\d+|S|M|L|XL|XXL)/i);
      if (sizeMatch) sizePref = sizeMatch[1];
      
      const colorKeywords = ['hitam', 'putih', 'biru', 'merah', 'abu', 'gray', 'black', 'white', 'blue', 'red'];
      for (const kw of colorKeywords) {
        if (preferences.toLowerCase().includes(kw)) {
          colorPref = kw;
          break;
        }
      }
    }

    // Determine query text for semantic matching
    const searchTerms = [];
    if (category) searchTerms.push(category);
    if (preferences) searchTerms.push(preferences);
    const searchText = searchTerms.join(' ').trim();

    let query;
    let params = [];
    
    if (searchText) {
      // 1. Semantic Match
      const searchEmbedding = await embeddings.embedQuery(searchText);
      
      query = `
        SELECT p.id, p.name, p.category, p.description, p.tags,
               v.variant_name, v.size, v.color, v.price, v.stock,
               1 - (p.embedding <=> $1::vector) AS similarity
        FROM products p
        JOIN product_variants v ON p.id = v.product_id
        WHERE p.is_active = TRUE AND v.is_active = TRUE
      `;
      params.push(JSON.stringify(searchEmbedding));
      let paramIndex = 2;

      if (budget_max) {
        query += ` AND v.price <= $${paramIndex}`;
        params.push(budget_max);
        paramIndex++;
      }

      if (sizePref) {
        query += ` AND v.size = $${paramIndex}`;
        params.push(sizePref);
        paramIndex++;
      }

      query += ` ORDER BY similarity DESC, v.stock DESC, v.price ASC LIMIT 10;`;
    } else {
      // 2. Default fallback if no search terms
      query = `
        SELECT p.id, p.name, p.category, p.description, p.tags,
               v.variant_name, v.size, v.color, v.price, v.stock,
               1.0 AS similarity
        FROM products p
        JOIN product_variants v ON p.id = v.product_id
        WHERE p.is_active = TRUE AND v.is_active = TRUE
      `;
      let paramIndex = 1;

      if (budget_max) {
        query += ` AND v.price <= $${paramIndex}`;
        params.push(budget_max);
        paramIndex++;
      }

      if (sizePref) {
        query += ` AND v.size = $${paramIndex}`;
        params.push(sizePref);
        paramIndex++;
      }

      query += ` ORDER BY v.stock DESC, v.price ASC LIMIT 10;`;
    }

    let res = await db.query(query, params);

    // If no results found with size filter, retry without size filter to be helpful
    if (res.rowCount === 0 && sizePref) {
      logger.info(`No products found with size filter (${sizePref}), retrying without size filter...`);
      
      const fallbackParams = [];
      let queryFb;
      
      if (searchText) {
        const searchEmbedding = await embeddings.embedQuery(searchText);
        queryFb = `
          SELECT p.id, p.name, p.category, p.description, p.tags,
                 v.variant_name, v.size, v.color, v.price, v.stock,
                 1 - (p.embedding <=> $1::vector) AS similarity
          FROM products p
          JOIN product_variants v ON p.id = v.product_id
          WHERE p.is_active = TRUE AND v.is_active = TRUE
        `;
        fallbackParams.push(JSON.stringify(searchEmbedding));
        let paramIdx = 2;
        if (budget_max) {
          queryFb += ` AND v.price <= $${paramIdx}`;
          fallbackParams.push(budget_max);
          paramIdx++;
        }
        queryFb += ` ORDER BY similarity DESC, v.stock DESC, v.price ASC LIMIT 10;`;
      } else {
        queryFb = `
          SELECT p.id, p.name, p.category, p.description, p.tags,
                 v.variant_name, v.size, v.color, v.price, v.stock,
                 1.0 AS similarity
          FROM products p
          JOIN product_variants v ON p.id = v.product_id
          WHERE p.is_active = TRUE AND v.is_active = TRUE
        `;
        let paramIdx = 1;
        if (budget_max) {
          queryFb += ` AND v.price <= $${paramIdx}`;
          fallbackParams.push(budget_max);
          paramIdx++;
        }
        queryFb += ` ORDER BY v.stock DESC, v.price ASC LIMIT 10;`;
      }
      
      res = await db.query(queryFb, fallbackParams);
    }

    if (res.rowCount === 0) {
      return {
        status: 'success',
        message: 'Tidak ada produk yang cocok dengan kriteria pencarian Anda saat ini.',
        data: []
      };
    }

    // Rank / prioritize matches using color preferences if available
    let products = res.rows;
    if (colorPref) {
      const lowerColor = colorPref.toLowerCase();
      products = products.sort((a, b) => {
        const aColorMatch = a.color?.toLowerCase().includes(lowerColor) ? 1 : 0;
        const bColorMatch = b.color?.toLowerCase().includes(lowerColor) ? 1 : 0;
        if (aColorMatch !== bColorMatch) {
          return bColorMatch - aColorMatch;
        }
        return (b.similarity || 0) - (a.similarity || 0);
      });
    }

    return {
      status: 'success',
      data: products.slice(0, 5)
    };

  } catch (error) {
    logger.error('Error in getProductRecommendation service', { error: error.message });
    throw error;
  }
}

export default {
  getProductRecommendation,
};

import db from '../database/client.js';
import memoryService from './memoryService.js';
import { logger } from '../middleware/requestLogger.js';

/**
 * Get personalized product recommendations based on preferences, budget, and category.
 * Integrates user preferences/memories from PostgreSQL.
 * @param {object} params - { category, budget_max, preferences, userId }
 */
export async function getProductRecommendation({ category, budget_max, preferences, userId }) {
  try {
    logger.info(`Getting product recommendations. Category: ${category || 'any'}, Budget: ${budget_max || 'any'}, Preferences: ${preferences || 'none'}, User: ${userId || 'none'}`);

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

    // Build the SQL query
    let query = `
      SELECT p.id, p.name, p.category, p.description, p.tags,
             v.variant_name, v.size, v.color, v.price, v.stock
      FROM products p
      JOIN product_variants v ON p.id = v.product_id
      WHERE p.is_active = TRUE AND v.is_active = TRUE
    `;
    const params = [];
    let paramIndex = 1;

    if (category) {
      query += ` AND (p.category ILIKE $${paramIndex} OR p.name ILIKE $${paramIndex})`;
      params.push(`%${category}%`);
      paramIndex++;
    }

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

    let res = await db.query(query, params);

    // If no results found with size filter, retry without size filter
    if (res.rowCount === 0 && sizePref) {
      logger.info(`No products found with size filter (${sizePref}), retrying without size filter...`);
      let fallbackQuery = `
        SELECT p.id, p.name, p.category, p.description, p.tags,
               v.variant_name, v.size, v.color, v.price, v.stock
        FROM products p
        JOIN product_variants v ON p.id = v.product_id
        WHERE p.is_active = TRUE AND v.is_active = TRUE
      `;
      const fallbackParams = [];
      let fbParamIndex = 1;

      if (category) {
        fallbackQuery += ` AND (p.category ILIKE $${fbParamIndex} OR p.name ILIKE $${fbParamIndex})`;
        fallbackParams.push(`%${category}%`);
        fbParamIndex++;
      }

      if (budget_max) {
        fallbackQuery += ` AND v.price <= $${fbParamIndex}`;
        fallbackParams.push(budget_max);
        fbParamIndex++;
      }

      fallbackQuery += ` ORDER BY v.stock DESC, v.price ASC LIMIT 10;`;
      res = await db.query(fallbackQuery, fallbackParams);
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
        const aMatch = a.color?.toLowerCase().includes(lowerColor) ? 1 : 0;
        const bMatch = b.color?.toLowerCase().includes(lowerColor) ? 1 : 0;
        return bMatch - aMatch;
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

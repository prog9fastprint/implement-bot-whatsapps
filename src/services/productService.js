import db from '../database/client.js';
import { logger } from '../middleware/requestLogger.js';

/**
 * Check stock for a specific product and variant.
 * @param {object} params - { product_name, size, color }
 */
export async function checkStock({ product_name, size, color }) {
  try {
    logger.debug(`Checking stock for: ${product_name} ${size || ''}`);
    
    // Simple fuzzy search by product name
    const query = `
      SELECT p.name, v.variant_name, v.size, v.color, v.stock, v.price
      FROM products p
      JOIN product_variants v ON p.id = v.product_id
      WHERE p.name ILIKE $1
      AND ($2::VARCHAR IS NULL OR v.size = $2)
      AND ($3::VARCHAR IS NULL OR v.color = $3)
      LIMIT 5;
    `;
    const res = await db.query(query, [`%${product_name}%`, size || null, color || null]);
    
    if (res.rowCount === 0) {
      return { status: 'not_found', message: `Produk "${product_name}" tidak ditemukan.` };
    }

    return { status: 'success', data: res.rows };
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

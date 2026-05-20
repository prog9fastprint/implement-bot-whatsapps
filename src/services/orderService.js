import db from '../database/client.js';
import { logger } from '../middleware/requestLogger.js';

export async function checkOrderStatus({ order_number, phone_number }) {
  try {
    const query = `
      SELECT o.order_number, o.status, o.total_amount, o.tracking_number, o.courier
      FROM orders o
      JOIN users u ON o.user_id = u.id
      WHERE ($1::VARCHAR IS NULL OR o.order_number = $1)
      AND ($2::VARCHAR IS NULL OR u.phone_number = $2)
      ORDER BY o.created_at DESC
      LIMIT 1;
    `;
    const res = await db.query(query, [order_number || null, phone_number || null]);
    
    if (res.rowCount === 0) {
      return { status: 'not_found', message: 'Pesanan tidak ditemukan.' };
    }

    return { status: 'success', data: res.rows[0] };
  } catch (error) {
    logger.error('Error in checkOrderStatus service', { error: error.message });
    throw error;
  }
}

export default { checkOrderStatus };

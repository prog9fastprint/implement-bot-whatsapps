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

/**
 * Create a new order and update stock.
 * @param {object} params - { userId, items: [{ variant_id, quantity }] }
 */
export async function createOrder({ userId, items }) {
  logger.info('createOrder called', { userId, items, userIdType: typeof userId });

  // Validate userId
  if (!userId) {
    logger.error('createOrder: userId is missing or invalid', { userId });
    return { 
      status: 'error', 
      message: 'User ID tidak valid. Silakan hubungi customer service untuk bantuan.' 
    };
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let totalAmount = 0;
    const orderNumber = `ORD-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8)}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    const orderItemsDetails = [];

    for (const item of items) {
      // 1. Check stock and get price
      const variantRes = await client.query(
        'SELECT stock, price, variant_name FROM product_variants WHERE id = $1 FOR UPDATE',
        [item.variant_id]
      );

      if (variantRes.rowCount === 0) {
        throw new Error(`Variant with ID ${item.variant_id} not found.`);
      }

      const variant = variantRes.rows[0];
      if (variant.stock < item.quantity) {
        throw new Error(`Stok tidak mencukupi untuk ${variant.variant_name}. Tersedia: ${variant.stock}`);
      }

      // 2. Decrement stock
      await client.query(
        'UPDATE product_variants SET stock = stock - $1, updated_at = NOW() WHERE id = $2',
        [item.quantity, item.variant_id]
      );

      const itemTotal = variant.price * item.quantity;
      totalAmount += itemTotal;

      orderItemsDetails.push({
        variant_id: item.variant_id,
        quantity: item.quantity,
        price_at_purchase: variant.price
      });
    }

    // 3. Insert order
    const orderRes = await client.query(
      'INSERT INTO orders (user_id, order_number, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, orderNumber, totalAmount, 'pending']
    );
    const orderId = orderRes.rows[0].id;

    // 4. Insert order items
    for (const detail of orderItemsDetails) {
      await client.query(
        'INSERT INTO order_items (order_id, variant_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [orderId, detail.variant_id, detail.quantity, detail.price_at_purchase]
      );
    }

    await client.query('COMMIT');

    return {
      status: 'success',
      message: 'Pesanan berhasil dibuat.',
      data: {
        order_number: orderNumber,
        total_amount: totalAmount
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in createOrder service', { error: error.message });
    return { status: 'error', message: error.message };
  } finally {
    client.release();
  }
}

export default { checkOrderStatus, createOrder };

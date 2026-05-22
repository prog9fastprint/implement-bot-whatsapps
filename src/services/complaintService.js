import db from '../database/client.js';
import { logger } from '../middleware/requestLogger.js';

/**
 * Creates a complaint ticket in the database.
 * @param {object} params - { subject, description, order_number, priority, user_id }
 */
export async function createComplaintTicket({ subject, description, order_number, priority = 'medium', user_id }) {
  try {
    if (!user_id) {
      throw new Error('user_id is required to create a complaint ticket');
    }

    // Look up order_id if order_number is provided
    let orderId = null;
    if (order_number) {
      const orderRes = await db.query(
        'SELECT id FROM orders WHERE order_number = $1',
        [order_number]
      );
      if (orderRes.rowCount > 0) {
        orderId = orderRes.rows[0].id;
      }
    }

    // Generate ticket number: TKT-YYYYMMDD-XXXX
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `TKT-${today}-`;
    
    const seqRes = await db.query(
      `SELECT ticket_number FROM complaints 
       WHERE ticket_number LIKE $1 
       ORDER BY ticket_number DESC LIMIT 1`,
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (seqRes.rowCount > 0) {
      const lastTicket = seqRes.rows[0].ticket_number;
      const parts = lastTicket.split('-');
      if (parts.length === 3) {
        const lastSeq = parseInt(parts[2], 10);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }
    }
    const ticketNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    // Insert into complaints table
    await db.query(
      `INSERT INTO complaints (ticket_number, user_id, order_id, subject, description, priority)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ticketNumber, user_id, orderId, subject, description, priority]
    );

    logger.info(`Complaint ticket created: ${ticketNumber} for user ${user_id}`);

    return { 
      status: 'success', 
      message: 'Tiket keluhan berhasil dibuat.',
      ticket_number: ticketNumber
    };
  } catch (error) {
    logger.error('Error in createComplaintTicket service', { error: error.message });
    throw error;
  }
}

/**
 * Retrieves the status of a complaint ticket.
 * @param {object} params - { ticket_number }
 */
export async function getTicketStatus({ ticket_number }) {
  try {
    const res = await db.query(
      `SELECT c.ticket_number, c.subject, c.status, c.priority, c.created_at, o.order_number
       FROM complaints c
       LEFT JOIN orders o ON c.order_id = o.id
       WHERE c.ticket_number = $1`,
      [ticket_number]
    );

    if (res.rowCount === 0) {
      return { status: 'not_found', message: `Tiket "${ticket_number}" tidak ditemukan.` };
    }

    return { status: 'success', data: res.rows[0] };
  } catch (error) {
    logger.error('Error in getTicketStatus service', { error: error.message });
    throw error;
  }
}

export default {
  createComplaintTicket,
  getTicketStatus,
};


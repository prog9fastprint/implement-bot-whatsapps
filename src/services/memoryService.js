import db from '../database/client.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';

/**
 * Gets a user by phone number or creates a new one if it doesn't exist.
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<object>} - The user object
 */
export async function getOrCreateUser(phoneNumber) {
  try {
    const query = `
      INSERT INTO users (phone_number)
      VALUES ($1)
      ON CONFLICT (phone_number) DO UPDATE SET is_active = TRUE
      RETURNING *;
    `;
    const res = await db.query(query, [phoneNumber]);
    return res.rows[0];
  } catch (error) {
    logger.error('Error in getOrCreateUser', { phoneNumber: maskPhone(phoneNumber), error: error.message });
    throw error;
  }
}

/**
 * Gets the current active conversation for a user or creates a new one.
 * @param {string} userId - UUID of the user
 * @returns {Promise<object>} - The conversation object
 */
export async function getOrCreateConversation(userId) {
  try {
    // Look for an active conversation
    let res = await db.query(
      'SELECT * FROM conversations WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (res.rowCount > 0) {
      return res.rows[0];
    }

    // Create a new conversation if none active
    res = await db.query(
      'INSERT INTO conversations (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    return res.rows[0];
  } catch (error) {
    logger.error('Error in getOrCreateConversation', { userId, error: error.message });
    throw error;
  }
}

/**
 * Saves a message to the database.
 * @param {object} params - Message parameters { conversationId, userId, role, type, content, whatsappMsgId, toolCalls }
 * @returns {Promise<object>} - The saved message object
 */
export async function saveMessage({ conversationId, userId, role, type = 'text', content, whatsappMsgId = null, toolCalls = null }) {
  try {
    const query = `
      INSERT INTO messages (conversation_id, user_id, role, type, content, whatsapp_msg_id, tool_calls)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const res = await db.query(query, [conversationId, userId, role, type, content, whatsappMsgId, toolCalls]);
    
    // Increment message count in conversation
    await db.query(
      'UPDATE conversations SET message_count = message_count + 1, updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    return res.rows[0];
  } catch (error) {
    logger.error('Error in saveMessage', { conversationId, role, error: error.message });
    throw error;
  }
}

/**
 * Loads long-term memories/facts for a user.
 * @param {string} userId - UUID of the user
 * @returns {Promise<Array>} - List of memory objects
 */
export async function loadUserMemory(userId) {
  try {
    const res = await db.query(
      'SELECT memory_type, key, value FROM ai_memories WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [userId]
    );
    return res.rows;
  } catch (error) {
    logger.error('Error in loadUserMemory', { userId, error: error.message });
    throw error;
  }
}

/**
 * Saves or updates a long-term memory for a user.
 * @param {string} userId - UUID of the user
 * @param {string} type - Memory type (e.g., 'preference', 'fact')
 * @param {string} key - Memory key (e.g., 'name', 'coffee_preference')
 * @param {string} value - Memory value
 * @param {number} [confidence=1.0] - Confidence score
 */
export async function saveUserMemory(userId, type, key, value, confidence = 1.0) {
  try {
    const query = `
      INSERT INTO ai_memories (user_id, memory_type, key, value, confidence)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, memory_type, key) 
      DO UPDATE SET value = $4, confidence = $5, updated_at = NOW();
    `;
    await db.query(query, [userId, type, key, value, confidence]);
  } catch (error) {
    logger.error('Error in saveUserMemory', { userId, key, error: error.message });
    throw error;
  }
}

/**
 * Loads the recent conversation history for a specific conversation.
 * @param {string} conversationId - UUID of the conversation
 * @param {number} [limit=20] - Max messages to load
 * @returns {Promise<Array>} - List of message objects formatted for OpenAI
 */
export async function loadConversationHistory(conversationId, limit = 20) {
  try {
    const res = await db.query(
      `SELECT role, content, type, tool_calls 
       FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [conversationId, limit]
    );

    // Reverse to get chronological order and format for OpenAI
    return res.rows.reverse().map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.tool_calls && { tool_calls: msg.tool_calls })
    }));
  } catch (error) {
    logger.error('Error in loadConversationHistory', { conversationId, error: error.message });
    throw error;
  }
}

export default {
  getOrCreateUser,
  getOrCreateConversation,
  saveMessage,
  loadUserMemory,
  saveUserMemory,
  loadConversationHistory,
};

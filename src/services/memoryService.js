import db from '../database/client.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import config from '../config/env.js';

// Initialize Gemini Embeddings
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: config.GOOGLE_API_KEY,
  modelName: "gemini-embedding-001",
  dimensions: 1536,
});

/**
 * Gets a user by phone number or creates a new one if it doesn't exist.
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
 */
export async function getOrCreateConversation(userId) {
  try {
    let res = await db.query(
      'SELECT * FROM conversations WHERE user_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (res.rowCount > 0) {
      return res.rows[0];
    }

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
 */
export async function saveMessage({ conversationId, userId, role, type = 'text', content, whatsappMsgId = null, toolCalls = null }) {
  try {
    const toolCallsJson = toolCalls ? JSON.stringify(toolCalls) : null;
    const query = `
      INSERT INTO messages (conversation_id, user_id, role, type, content, whatsapp_msg_id, tool_calls)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const res = await db.query(query, [conversationId, userId, role, type, content, whatsappMsgId, toolCallsJson]);
    
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
 */
export async function loadUserMemory(userId, query = "") {
  try {
    if (query) {
      // 1. Generate embedding for query
      const queryEmbedding = await embeddings.embedQuery(query);
      
      // 2. Semantic search using pgvector
      const res = await db.query(
        `SELECT key, value, memory_type, 1 - (embedding <=> $1::vector) AS similarity 
         FROM ai_memories 
         WHERE user_id = $2 AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY similarity DESC LIMIT 3`,
        [JSON.stringify(queryEmbedding), userId]
      );
      return res.rows;
    }

    // Fallback to exact fetch
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
 */
export async function saveUserMemory(userId, type, key, value, confidence = 1.0) {
  try {
    // 1. Generate embedding for the value
    const embedding = await embeddings.embedQuery(value);

    // 2. DB Save with vector
    const query = `
      INSERT INTO ai_memories (user_id, memory_type, key, value, confidence, embedding)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, memory_type, key) 
      DO UPDATE SET value = $4, confidence = $5, embedding = $6, updated_at = NOW();
    `;
    await db.query(query, [userId, type, key, value, confidence, JSON.stringify(embedding)]);
  } catch (error) {
    logger.error('Error in saveUserMemory', { userId, key, error: error.message });
    throw error;
  }
}

/**
 * Loads the recent conversation history for a specific conversation.
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

    return res.rows.reverse().map(msg => {
      const sanitized = {
        role: msg.role,
        content: msg.content || '',
      };
      if (msg.tool_calls) {
        sanitized.tool_calls = typeof msg.tool_calls === 'string' 
          ? JSON.parse(msg.tool_calls) 
          : msg.tool_calls;
      }
      const allowedKeys = ['role', 'content', 'tool_calls', 'tool_call_id', 'name'];
      return Object.keys(sanitized)
        .filter(key => allowedKeys.includes(key))
        .reduce((obj, key) => {
          obj[key] = sanitized[key];
          return obj;
        }, {});
    });
  } catch (error) {
    logger.error('Error in loadConversationHistory', { conversationId, error: error.message });
    throw error;
  }
}

/**
 * Loads the latest conversation summary for a user.
 */
export async function loadLatestSummary(userId) {
  try {
    const res = await db.query(
      'SELECT summary FROM ai_summaries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    return res.rowCount > 0 ? res.rows[0].summary : null;
  } catch (error) {
    logger.error('Error in loadLatestSummary', { userId, error: error.message });
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
  loadLatestSummary,
};


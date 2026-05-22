import db from '../database/client.js';
import { chatCompletion } from './openai.js';
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

/**
 * Checks if a conversation needs summarization and performs it if necessary.
 * Summarizes the oldest 30 messages using OpenAI and persists it to PostgreSQL.
 * @param {object} conversation - The conversation object
 */
export async function checkAndSummarize(conversation) {
  try {
    if (!conversation?.id) return;

    // Reload conversation to get current message_count
    const convRes = await db.query('SELECT * FROM conversations WHERE id = $1', [conversation.id]);
    if (convRes.rowCount === 0) return;
    const currentConv = convRes.rows[0];

    const triggerLimit = config.SUMMARY_TRIGGER_COUNT || 50;
    if (currentConv.message_count < triggerLimit) {
      return;
    }

    logger.info(`Conversation ${currentConv.id} message count (${currentConv.message_count}) reached threshold (${triggerLimit}). Starting summarization...`);

    // Fetch the oldest 30 messages
    const oldestMsgsRes = await db.query(
      `SELECT id, role, content, created_at 
       FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC 
       LIMIT 30`,
      [currentConv.id]
    );

    if (oldestMsgsRes.rowCount < 30) {
      logger.info(`Not enough messages to summarize (${oldestMsgsRes.rowCount}/30)`);
      return;
    }

    const oldestMessages = oldestMsgsRes.rows;

    // Call GPT to summarize
    const formattedHistory = oldestMessages
      .map(m => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `Anda adalah asisten AI yang bertugas merangkum riwayat percakapan pelanggan dengan toko online Nike Indonesia.
Buatlah rangkuman singkat dan padat (maksimal 2-3 paragraf) dalam Bahasa Indonesia.
Rangkuman harus berisi fakta penting tentang pelanggan (seperti nama, preferensi produk, ukuran sepatu, keluhan yang sedang berlangsung, dll) serta status percakapan terakhir.`;

    const userPrompt = `Rangkum riwayat percakapan berikut secara ringkas:\n\n${formattedHistory}`;

    logger.info('Calling OpenAI for summarization...');
    const response = await chatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);

    const summaryText = response.content;
    if (!summaryText) {
      throw new Error('OpenAI returned empty content for summary');
    }

    // Run DB transaction to insert summary and delete messages
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const messageRangeStart = oldestMessages[0].id;
      const messageRangeEnd = oldestMessages[oldestMessages.length - 1].id;

      // Save summary
      await client.query(
        `INSERT INTO ai_summaries (user_id, conversation_id, summary, message_range_start, message_range_end, message_count)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [currentConv.user_id, currentConv.id, summaryText, messageRangeStart, messageRangeEnd, oldestMessages.length]
      );

      // Delete messages
      const messageIds = oldestMessages.map(m => m.id);
      await client.query(
        `DELETE FROM messages WHERE id = ANY($1::UUID[])`,
        [messageIds]
      );

      // Update conversation message count
      await client.query(
        `UPDATE conversations SET message_count = message_count - $1, updated_at = NOW() WHERE id = $2`,
        [oldestMessages.length, currentConv.id]
      );

      await client.query('COMMIT');
      logger.info(`✅ Successfully summarized 30 messages for conversation ${currentConv.id}.`);
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('Error in checkAndSummarize service', { error: error.message, stack: error.stack });
  }
}

export default { checkAndSummarize };

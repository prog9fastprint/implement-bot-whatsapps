import { message } from 'telegraf/filters';
import { routeMessageToAI } from '../services/aiRouter.js';
import { logger } from '../middleware/requestLogger.js';

/**
 * Registers handlers for the Telegram bot.
 * @param {import('telegraf').Telegraf} bot - The Telegraf bot instance
 */
export function registerTelegramHandlers(bot) {
  if (!bot) return;

  // Handle /start command
  bot.start((ctx) => {
    ctx.reply('Halo! Saya adalah asisten virtual Nike Indonesia. Silakan tanya apa saja tentang produk kami.');
  });

  // Handle text messages
  bot.on(message('text'), async (ctx) => {
    const { from, text, message_id } = ctx.message;
    
    logger.info(`Received Telegram message from ${from.id}: "${text}"`);

    const normalizedMessage = {
      from: from.id.toString(),
      body: text,
      type: 'text',
      messageId: message_id.toString(),
      profileName: from.first_name || from.username,
      timestamp: ctx.message.date,
    };

    try {
      await routeMessageToAI(normalizedMessage, 'telegram');
    } catch (error) {
      logger.error('Error in Telegram message handler', { error: error.message });
      ctx.reply('Maaf, terjadi kesalahan saat memproses pesan Anda.');
    }
  });

  // Handle other message types as placeholders
  bot.on([message('photo'), message('audio'), message('voice')], (ctx) => {
    ctx.reply('Maaf, saat ini saya baru bisa memproses pesan teks di Telegram.');
  });
}

export default {
  registerTelegramHandlers,
};

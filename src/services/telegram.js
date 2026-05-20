import { Telegraf } from 'telegraf';
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

let bot;

/**
 * Initializes the Telegram bot.
 */
export function initTelegramBot() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN is not defined. Telegram bot will not start.');
    return null;
  }

  bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

  bot.catch((err, ctx) => {
    logger.error(`Telegraf error for ${ctx.updateType}`, { error: err.message });
  });

  return bot;
}

/**
 * Sends a text message via Telegram.
 * @param {string|number} chatId - The Telegram chat ID
 * @param {string} text - The message content
 * @returns {Promise<object>} - The message object sent
 */
export async function sendTelegramMessage(chatId, text) {
  if (!bot) {
    throw new Error('Telegram bot is not initialized');
  }

  try {
    logger.info(`Sending Telegram message to chat ID: ${chatId}`);
    return await bot.telegram.sendMessage(chatId, text);
  } catch (error) {
    logger.error('Error sending Telegram message', {
      chatId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Launches the Telegram bot (Long Polling).
 */
export function launchTelegramBot() {
  if (!bot) return;

  bot.launch()
    .then(() => logger.info('✅ Telegram bot launched successfully.'))
    .catch((err) => logger.error('Failed to launch Telegram bot', { error: err.message }));

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

export default {
  initTelegramBot,
  sendTelegramMessage,
  launchTelegramBot,
};

import axios from 'axios';
import config from '../config/env.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';

// Axios instance pre-configured for WhatsApp Graph API calls
const client = axios.create({
  baseURL: `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Send a plain text message.
 * @param {string} to - The recipient's phone number in E.164 format without '+'
 * @param {string} body - The message content (maximum 4096 characters)
 * @returns {Promise<object>} - API response from Meta
 */
export async function sendTextMessage(to, body) {
  try {
    logger.info(`Sending WhatsApp text message to: ${maskPhone(to)}`);
    const response = await client.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body,
      },
    });
    return response.data;
  } catch (error) {
    logger.error('Error sending WhatsApp text message', {
      to: maskPhone(to),
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

/**
 * Send an interactive list message (maximum 10 rows total across all sections).
 * @param {string} to - The recipient's phone number
 * @param {string} header - The list header text
 * @param {string} body - The list body text
 * @param {string} buttonText - The text on the button that opens the list
 * @param {Array} sections - The sections array with rows
 * @returns {Promise<object>} - API response from Meta
 */
export async function sendInteractiveList(to, header, body, buttonText, sections) {
  try {
    logger.info(`Sending WhatsApp interactive list to: ${maskPhone(to)}`);
    const response = await client.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: header },
        body: { text: body },
        action: {
          button: buttonText,
          sections,
        },
      },
    });
    return response.data;
  } catch (error) {
    logger.error('Error sending WhatsApp interactive list', {
      to: maskPhone(to),
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

/**
 * Send interactive buttons (maximum 3 buttons).
 * @param {string} to - The recipient's phone number
 * @param {string} body - The buttons body text
 * @param {Array} buttons - Array of button objects: [{ id: 'btn_1', title: 'Button 1' }]
 * @returns {Promise<object>} - API response from Meta
 */
export async function sendInteractiveButtons(to, body, buttons) {
  try {
    logger.info(`Sending WhatsApp interactive buttons to: ${maskPhone(to)}`);
    if (buttons.length > 3) {
      throw new Error('Meta WhatsApp Cloud API supports a maximum of 3 interactive buttons.');
    }

    const formattedButtons = buttons.map((btn) => ({
      type: 'reply',
      reply: {
        id: btn.id,
        title: btn.title,
      },
    }));

    const response = await client.post('/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: body },
        action: {
          buttons: formattedButtons,
        },
      },
    });
    return response.data;
  } catch (error) {
    logger.error('Error sending WhatsApp interactive buttons', {
      to: maskPhone(to),
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

/**
 * Download media from Meta WhatsApp server by media ID.
 * @param {string} mediaId - The media ID received in the webhook payload
 * @returns {Promise<{buffer: Buffer, mimeType: string}>} - The media binary buffer and its MIME type
 */
export async function downloadMedia(mediaId) {
  try {
    logger.info(`Fetching WhatsApp media URL for media ID: ${mediaId}`);
    // Step 1: Query the media ID to get the download URL
    const metadataResponse = await axios.get(
      `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        },
      }
    );

    const { url, mime_type } = metadataResponse.data;
    if (!url) {
      throw new Error(`Meta Graph API did not return a download URL for media ID: ${mediaId}`);
    }

    logger.info(`Downloading binary media content from Meta CDN for ID: ${mediaId}`);
    // Step 2: Download binary data using the temporary authenticated download URL
    const fileResponse = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      },
      responseType: 'arraybuffer',
    });

    return {
      buffer: Buffer.from(fileResponse.data),
      mimeType: mime_type,
    };
  } catch (error) {
    logger.error('Error downloading WhatsApp media file', {
      mediaId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
}

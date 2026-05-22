import OpenAI from 'openai';
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
  defaultHeaders: config.OPENAI_BASE_URL.includes('openrouter.ai') ? {
    'HTTP-Referer': 'https://github.com/prog9/plan-implement-whatsapps-bot',
    'X-Title': 'Nike Chatbot',
  } : undefined,
});

/**
 * Sends a chat completion request to OpenAI.
 * @param {Array<object>} messages - Array of message objects [{role, content}]
 * @param {Array<object>} [tools] - Optional array of tool definitions
 * @param {string} [tool_choice] - Optional tool choice setting ('auto', 'none', or specific function)
 * @returns {Promise<object>} - The completion response choice message
 */
export async function chatCompletion(messages, tools = null, tool_choice = 'auto') {
  const fallbackList = config.OPENAI_FALLBACK_MODELS
    ? config.OPENAI_FALLBACK_MODELS.split(',').map(m => m.trim()).filter(Boolean)
    : [];
  const modelsToTry = [config.OPENAI_MODEL, ...fallbackList];

  let lastError = null;
  for (const currentModel of modelsToTry) {
    try {
      logger.debug(`Sending request to OpenAI Chat Completion API using model: ${currentModel}`);
      
      const params = {
        model: currentModel,
        messages,
        temperature: 0.7,
      };

      if (config.OPENAI_BASE_URL.includes('openrouter.ai')) {
        const remainingModels = modelsToTry.slice(modelsToTry.indexOf(currentModel));
        if (remainingModels.length > 1) {
          params.models = remainingModels;
        }
      }

      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = tool_choice;
      }

      const response = await openai.chat.completions.create(params);
      return response.choices[0].message;
    } catch (error) {
      lastError = error;
      logger.warn(`OpenAI Chat Completion failed for model ${currentModel}. Error: ${error.message}. Trying next...`);
    }
  }

  logger.error('All OpenAI Chat Completion models failed', {
    error: lastError.response?.data || lastError.message,
  });
  throw lastError;
}

/**
 * Transcribes audio using Whisper-1.
 * @param {ReadStream} audioFileStream - A readable stream of the audio file
 * @returns {Promise<string>} - The transcribed text
 */
export async function transcribeAudio(audioFileStream) {
  try {
    logger.info('Sending audio to OpenAI Whisper API for transcription');
    const response = await openai.audio.transcriptions.create({
      file: audioFileStream,
      model: 'whisper-1',
      language: 'id', // Default to Indonesian
    });
    return response.text;
  } catch (error) {
    logger.error('OpenAI Whisper Error', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Analyzes an image using GPT-4o Vision.
 * @param {string} base64Image - Base64 encoded image string
 * @param {string} [prompt] - Optional user prompt or caption
 * @returns {Promise<string>} - The AI's analysis of the image
 */
export async function analyzeImage(base64Image, prompt = 'Jelaskan gambar ini secara detail.') {
  const fallbackList = config.OPENAI_FALLBACK_MODELS
    ? config.OPENAI_FALLBACK_MODELS.split(',').map(m => m.trim()).filter(Boolean)
    : [];
  const modelsToTry = [config.OPENAI_MODEL, ...fallbackList];

  let lastError = null;
  for (const currentModel of modelsToTry) {
    try {
      logger.info(`Sending image to OpenAI Vision API using model: ${currentModel}`);
      
      const params = {
        model: currentModel,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      };

      if (config.OPENAI_BASE_URL.includes('openrouter.ai')) {
        const remainingModels = modelsToTry.slice(modelsToTry.indexOf(currentModel));
        if (remainingModels.length > 1) {
          params.models = remainingModels;
        }
      }

      const response = await openai.chat.completions.create(params);
      return response.choices[0].message.content;
    } catch (error) {
      lastError = error;
      logger.warn(`OpenAI Vision failed for model ${currentModel}. Error: ${error.message}. Trying next...`);
    }
  }

  logger.error('All OpenAI Vision models failed', {
    error: lastError.response?.data || lastError.message,
  });
  throw lastError;
}

export default openai;

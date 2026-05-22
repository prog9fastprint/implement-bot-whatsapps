import { ChatOpenAI } from '@langchain/openai';
import OpenAI from 'openai';
import config from '../config/env.js';
import { logger } from '../middleware/requestLogger.js';

// Initialize LangChain ChatOpenAI client
const chatModel = new ChatOpenAI({
  openAIApiKey: config.OPENAI_API_KEY,
  modelName: config.OPENAI_MODEL,
  temperature: 0.7,
  configuration: {
    baseURL: config.OPENAI_BASE_URL,
    defaultHeaders: config.OPENAI_BASE_URL.includes('openrouter.ai') ? {
      'HTTP-Referer': 'https://github.com/prog9/plan-implement-whatsapps-bot',
      'X-Title': 'Nike Chatbot',
    } : undefined,
  },
});

// Initialize native OpenAI client for specialized services
const openai = new OpenAI({
  apiKey: config.OPENAI_API_KEY,
  baseURL: config.OPENAI_BASE_URL,
});

/**
 * Sends a chat completion request using LangChain.
 */
export async function chatCompletion(messages) {
  try {
    logger.debug(`Sending request to LangChain ChatOpenAI, model: ${config.OPENAI_MODEL}`);
    const response = await chatModel.invoke(messages);
    return {
      role: 'assistant',
      content: response.content,
    };
  } catch (error) {
    logger.error(`LangChain ChatOpenAI failed. Error: ${error.message}`);
    throw error;
  }
}

/**
 * Transcribes audio using Whisper-1 via native OpenAI client.
 */
export async function transcribeAudio(audioFileStream) {
  try {
    logger.info('Sending audio to OpenAI Whisper API for transcription');
    const response = await openai.audio.transcriptions.create({
      file: audioFileStream,
      model: 'whisper-1',
      language: 'id',
    });
    return response.text;
  } catch (error) {
    logger.error('OpenAI Whisper Error', { error: error.message });
    throw error;
  }
}

/**
 * Analyzes an image using GPT-4o Vision via native OpenAI client.
 */
export async function analyzeImage(base64Image, prompt = 'Jelaskan gambar ini secara detail.') {
  try {
    const response = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      max_tokens: 500,
    });
    return response.choices[0].message.content;
  } catch (error) {
    logger.error('OpenAI Vision Error', { error: error.message });
    throw error;
  }
}

export default chatModel;

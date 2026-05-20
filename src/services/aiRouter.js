import { chatCompletion } from './openai.js';
import { sendTextMessage } from './whatsapp.js';
import { sendTelegramMessage } from './telegram.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';
import memoryService from './memoryService.js';
import { toolDefinitions } from '../tools/toolDefinitions.js';
import { dispatchToolCalls } from '../tools/toolDispatcher.js';
import { checkAndSummarize } from './summarizationService.js';

// The bot's core identity and instructions
const SYSTEM_PROMPT = `
Anda adalah asisten virtual cerdas untuk toko online Nike Indonesia.
Tugas Anda adalah membantu pelanggan dengan ramah, profesional, dan efisien dalam bahasa Indonesia.

Panduan Persona:
1. Gunakan bahasa Indonesia yang sopan dan natural (Gunakan 'Halo', 'Selamat siang', 'Terima kasih', dll).
2. Fokus pada produk Nike: sepatu, pakaian olahraga, dan aksesori.
3. Selalu berikan informasi berdasarkan data yang tersedia (jangan berhalusinasi).
4. Gunakan alat (tools) yang tersedia untuk memeriksa stok, harga, status pesanan, atau membuat tiket keluhan.

Konteks Memori Jangka Panjang:
\${"MEMORIES"}

Konteks saat ini: Anda sedang melayani pelanggan via \${"CHANNEL"}.
`;

/**
 * Routes and processes a user message through the AI pipeline.
 * @param {object} message - The normalized message object
 * @param {string} [channel='whatsapp'] - The communication channel
 */
export async function routeMessageToAI(message, channel = 'whatsapp') {
  const { from, body, messageId: whatsappMsgId } = message;

  try {
    logger.info(`Routing message from \${channel === 'whatsapp' ? maskPhone(from) : from} to AI Router via \${channel}`);

    // 1. Get or create User and Conversation
    const user = await memoryService.getOrCreateUser(from);
    const conversation = await memoryService.getOrCreateConversation(user.id);

    // 2. Load Memories and History
    const memories = await memoryService.loadUserMemory(user.id);
    const history = await memoryService.loadConversationHistory(conversation.id);

    // 3. Save User Message
    await memoryService.saveMessage({
      conversationId: conversation.id,
      userId: user.id,
      role: 'user',
      content: body || '(Pesan tanpa teks)',
      whatsappMsgId,
    });

    // 4. Prepare initial message array
    const memoryContext = memories.length > 0 
      ? memories.map(m => `- \${m.key}: \${m.value}`).join('\n')
      : 'Belum ada memori spesifik tentang pengguna ini.';

    const systemPromptFormatted = SYSTEM_PROMPT
      .replace('\${"MEMORIES"}', memoryContext)
      .replace('\${"CHANNEL"}', channel === 'whatsapp' ? 'WhatsApp' : 'Telegram');

    let messages = [
      { role: 'system', content: systemPromptFormatted },
      ...history,
      { role: 'user', content: body || '(Pesan tanpa teks)' },
    ];

    // 5. AI Reasoning & Tool Calling Loop (Max 5 turns)
    let turns = 0;
    let finalResponseContent = '';
    const MAX_TURNS = 5;

    while (turns < MAX_TURNS) {
      turns++;
      
      // Get completion from OpenAI
      const aiResponse = await chatCompletion(messages, toolDefinitions);
      
      // Add assistant response to history
      messages.push(aiResponse);

      // Save assistant message to DB
      await memoryService.saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: 'assistant',
        content: aiResponse.content || '(Panggilan Sistem)',
        toolCalls: aiResponse.tool_calls || null,
      });

      if (aiResponse.tool_calls) {
        // Execute tools
        const toolResults = await dispatchToolCalls(aiResponse.tool_calls, {
          userId: user.id,
          phoneNumber: from,
        });

        // Add tool results to messages for the next turn
        messages.push(...toolResults);

        // Save tool messages to DB
        for (const tr of toolResults) {
          await memoryService.saveMessage({
            conversationId: conversation.id,
            userId: user.id,
            role: 'tool',
            content: tr.content,
          });
        }
        
        // Loop back to AI to process tool results
        continue;
      }

      // No tool calls, we have the final content
      finalResponseContent = aiResponse.content;
      break;
    }

    // 6. Send response back to user via the correct channel
    if (finalResponseContent) {
      if (channel === 'whatsapp') {
        await sendTextMessage(from, finalResponseContent);
      } else if (channel === 'telegram') {
        await sendTelegramMessage(from, finalResponseContent);
      }
    } else {
      logger.warn(`AI Router failed to produce content for \${channel}`);
    }

    // 7. Post-processing: Check for summarization
    await checkAndSummarize(conversation);

  } catch (error) {
    logger.error(`AI Router Error for \${channel} user \${channel === 'whatsapp' ? maskPhone(from) : from}`, {
      error: error.message,
      stack: error.stack,
    });
    const errorMsg = 'Maaf, terjadi kesalahan saat memproses pesan Anda.';
    if (channel === 'whatsapp') {
      await sendTextMessage(from, errorMsg);
    } else if (channel === 'telegram') {
      await sendTelegramMessage(from, errorMsg);
    }
  }
}

import { chatCompletion } from './openai.js';
import { sendTextMessage } from './whatsapp.js';
import { sendTelegramMessage } from './telegram.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';
import memoryService from './memoryService.js';
import { langchainTools } from '../tools/langchainTools.js';
import { checkAndSummarize } from './summarizationService.js';
import { withRetry } from '../utils/retry.js';

// The bot's core identity and instructions
const SYSTEM_PROMPT = `
Anda adalah asisten virtual cerdas untuk toko online Nike Indonesia.
Tugas Anda adalah membantu pelanggan dengan ramah, profesional, dan efisien dalam bahasa Indonesia.

Panduan Persona:
1. Gunakan bahasa Indonesia yang sopan dan natural (Gunakan 'Halo', 'Selamat siang', 'Terima kasih', dll).
2. Fokus pada produk Nike: sepatu, pakaian olahraga, dan aksesori.
3. KETENTUAN PENTING (RAG STRICTNESS):
   - Gunakan HANYA informasi produk yang disediakan oleh tool/fungsi yang tersedia.
   - Dilarang menyebutkan, menyarankan, atau merekomendasikan produk yang tidak ada dalam hasil tool/fungsi.
   - Jika tidak ada produk yang ditemukan dalam hasil tool, nyatakan dengan jujur bahwa stok tidak tersedia atau tidak ditemukan.
   - Jangan pernah menambahkan produk dari pengetahuan internal Anda sendiri.
4. MEMORI PENGGUNA (MEMORIES):
   - Jika Anda perlu mengingat detail, riwayat, atau preferensi khusus tentang pengguna ini (seperti ukuran sepatu mereka, warna favorit, nama, dll), Anda WAJIB memanggil tool 'search_memory' dengan kata kunci pencarian yang sesuai.
   - Jangan menebak atau mengasumsikan preferensi pengguna tanpa mencari di memori terlebih dahulu.

Anda memiliki akses ke alat (tools) berikut untuk membantu pengguna:
${"TOOLS_DESC"}

INSTRUKSI PENGGUNAAN TOOL:
Jika Anda perlu menggunakan tool untuk mencari informasi, Anda WAJIB membalas HANYA dengan blok JSON yang dibungkus tag <tool_call>.
Contoh:
<tool_call>
{
  "name": "check_stock",
  "arguments": {
    "product_name": "Nike Air Max 90"
  }
}
</tool_call>

Tunggu sistem membalas dengan hasil tool sebelum memberikan jawaban akhir ke pengguna.
Jika Anda sudah memiliki cukup informasi (atau tidak perlu tool), jawab normal tanpa tag <tool_call>.

Rangkuman Riwayat Sebelumnya:
${"SUMMARY"}

Konteks Memori Jangka Panjang (Diambil jika Anda memanggil tool search_memory):
${"MEMORIES"}

Konteks saat ini: Anda sedang melayani pelanggan via ${"CHANNEL"}.
`;

export async function routeMessageToAI(message, channel = 'whatsapp') {
  const { from, body, messageId: whatsappMsgId } = message;

  try {
    logger.info(`Routing message from \${channel === 'whatsapp' ? maskPhone(from) : from} to AI Router via \${channel}`);

    const user = await memoryService.getOrCreateUser(from);
    const conversation = await memoryService.getOrCreateConversation(user.id);
    
    // Skip loading user memory on every message to avoid calling Gemini embeddings API on every incoming message.
    // Instead, the AI will use the search_memory tool when needed.
    const memories = [];
    
    const history = await memoryService.loadConversationHistory(conversation.id);
    const summary = await memoryService.loadLatestSummary(user.id);

    await memoryService.saveMessage({
      conversationId: conversation.id,
      userId: user.id,
      role: 'user',
      content: body || '(Pesan tanpa teks)',
      whatsappMsgId,
    });

    const memoryContext = memories.length > 0 
      ? memories.map(m => `- \${m.key}: \${m.value}`).join('\n')
      : 'Belum ada memori spesifik tentang pengguna ini.';

    const summaryContext = summary || 'Belum ada rangkuman riwayat percakapan sebelumnya.';
    const toolsDesc = langchainTools.map(t => `Tool: \${t.name}, Desc: \${t.description}`).join('\n');

    const systemPromptFormatted = SYSTEM_PROMPT
      .replace('\${"TOOLS_DESC"}', toolsDesc)
      .replace('\${"SUMMARY"}', summaryContext)
      .replace('\${"MEMORIES"}', memoryContext)
      .replace('\${"CHANNEL"}', channel === 'whatsapp' ? 'WhatsApp' : 'Telegram');

    let messages = [
      { role: 'system', content: systemPromptFormatted },
      ...history,
      { role: 'user', content: body || '(Pesan tanpa teks)' },
    ];

    let turns = 0;
    const MAX_TURNS = 5;

    while (turns < MAX_TURNS) {
      turns++;
      
      const aiResponse = await withRetry(() => chatCompletion(messages));
      messages.push(aiResponse);

      await memoryService.saveMessage({
        conversationId: conversation.id,
        userId: user.id,
        role: 'assistant',
        content: aiResponse.content || '(Panggilan Sistem)',
      });

      const toolCallMatch = aiResponse.content?.match(/<tool_call>([\s\S]*?)<\/tool_call>/);

      if (toolCallMatch) {
        try {
          const parsedCall = JSON.parse(toolCallMatch[1].trim());
          const tool = langchainTools.find(t => t.name === parsedCall.name);
          
          if (!tool) throw new Error("Tool not found");

          const result = await tool.invoke(parsedCall.arguments);

          const resultStr = `[System: Tool Result for '${parsedCall.name}']\n\${result}`;
          messages.push({ role: 'user', content: resultStr });

          await memoryService.saveMessage({
            conversationId: conversation.id,
            userId: user.id,
            role: 'system',
            content: resultStr,
          });

          continue;
        } catch (e) {
          logger.error('Failed to parse or execute tool call', { error: e.message, content: aiResponse.content });
          messages.push({ role: 'user', content: '[System Error]: Format JSON tool call tidak valid.' });
          continue;
        }
      }
      break;
    }

    const finalResponseContent = messages[messages.length - 1].content?.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

    if (finalResponseContent) {
      if (channel === 'whatsapp') await sendTextMessage(from, finalResponseContent);
      else if (channel === 'telegram') await sendTelegramMessage(from, finalResponseContent);
    }

    await checkAndSummarize(conversation);
  } catch (error) {
    logger.error('AI Router Error', { error: error.message });
    const errorMsg = 'Maaf, terjadi kesalahan saat memproses pesan Anda.';
    if (channel === 'whatsapp') await sendTextMessage(from, errorMsg);
    else if (channel === 'telegram') await sendTelegramMessage(from, errorMsg);
  }
}

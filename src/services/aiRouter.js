// src/services/aiRouter.js

import { chatCompletion } from './openai.js';
import { sendTextMessage } from './whatsapp.js';
import { sendTelegramMessage } from './telegram.js';
import { logger, maskPhone } from '../middleware/requestLogger.js';
import memoryService from './memoryService.js';
import { toolDefinitions } from '../tools/toolDefinitions.js';
import { dispatchToolCalls } from '../tools/toolDispatcher.js';
import { checkAndSummarize } from './summarizationService.js';
import { withRetry } from '../utils/retry.js';

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
   - Jika Anda perlu mengingat detail, riwayat, atau preferensi khusus tentang pengguna ini
     (seperti ukuran sepatu mereka, warna favorit, nama, dll),
     Anda WAJIB memanggil tool 'search_memory' dengan kata kunci pencarian yang sesuai.
   - Jangan menebak atau mengasumsikan preferensi pengguna tanpa mencari di memori terlebih dahulu.

Anda memiliki akses ke alat (tools) berikut untuk membantu pengguna:
__TOOLS_DESC__

INSTRUKSI PEMESANAN (PLACE ORDER):
1. Anda HANYA boleh memanggil tool 'place_order' SETELAH pengguna mengonfirmasi ingin membeli.
2. Anda WAJIB menggunakan 'variant_id' yang didapat dari hasil tool 'check_stock' atau 'get_product_recommendation'.
3. DILARANG menggunakan nama produk sebagai 'variant_id'. 'variant_id' harus berupa UUID/ID unik dari sistem.
4. Jika Anda belum tahu 'variant_id', Anda HARUS memanggil 'check_stock' terlebih dahulu.

INSTRUKSI PENGGUNAAN TOOL:
Jika Anda perlu menggunakan tool untuk mencari informasi,
Anda WAJIB membalas HANYA dengan blok JSON yang dibungkus tag <tool_call>.

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

Jika Anda sudah memiliki cukup informasi (atau tidak perlu tool),
jawab normal tanpa tag <tool_call>.

Rangkuman Riwayat Sebelumnya:
__SUMMARY__

Konteks Memori Jangka Panjang (Diambil jika Anda memanggil tool search_memory):
__MEMORIES__

Konteks saat ini:
Anda sedang melayani pelanggan via __CHANNEL__.
`;

/**
 * Generate detailed tool descriptions from toolDefinitions.
 */
const generateToolDescriptions = () => {
  return toolDefinitions
    .map((tool) => {
      const func = tool.function;
      const params = func.parameters.properties;
      const required = func.parameters.required || [];

      let desc = `\n--- TOOL: ${func.name} ---\n`;
      desc += `Deskripsi: ${func.description}\n`;
      desc += `Parameter:\n`;

      for (const [paramName, paramDef] of Object.entries(params)) {
        const isRequired = required.includes(paramName);

        desc += `  - ${paramName} (${paramDef.type})${
          isRequired ? ' [WAJIB]' : ' [OPSIONAL]'
        }: ${paramDef.description}\n`;
      }

      return desc;
    })
    .join('\n');
};

/**
 * Generate guide for tool usage.
 */
const generateToolUsageGuide = () => {
  return `
PANDUAN PEMILIHAN TOOL (HANYA GUNAKAN NAMA INI):

- Untuk cek stok/ketersediaan produk → gunakan check_stock
- Untuk cek harga produk → gunakan get_product_price
- Untuk cek status pesanan → gunakan check_order_status
- Untuk buat keluhan/komplain → gunakan create_complaint_ticket
- Untuk cek status tiket → gunakan get_ticket_status
- Untuk rekomendasi produk → gunakan get_product_recommendation
- Untuk cari memori/preferensi user → gunakan search_memory
- Untuk simpan memori/preferensi baru → gunakan save_memory
- Untuk membuat pesanan baru → gunakan place_order

DAFTAR TOOL YANG TERSEDIA:
check_stock,
get_product_price,
check_order_status,
create_complaint_ticket,
get_ticket_status,
get_product_recommendation,
search_memory,
save_memory,
place_order
`;
};

const formatSystemPrompt = ({
  toolsDesc,
  summaryContext,
  memoryContext,
  channel,
}) => {
  return SYSTEM_PROMPT
    .replace('__TOOLS_DESC__', toolsDesc)
    .replace('__SUMMARY__', summaryContext)
    .replace('__MEMORIES__', memoryContext)
    .replace(
      '__CHANNEL__',
      channel === 'whatsapp' ? 'WhatsApp' : 'Telegram',
    );
};

const saveAssistantMessage = async ({
  conversationId,
  userId,
  content,
}) => {
  await memoryService.saveMessage({
    conversationId,
    userId,
    role: 'assistant',
    content: content || '(Panggilan Sistem)',
  });
};

const sendResponseMessage = async ({
  channel,
  to,
  content,
}) => {
  if (!content) return;

  if (channel === 'whatsapp') {
    await sendTextMessage(to, content);
    return;
  }

  if (channel === 'telegram') {
    await sendTelegramMessage(to, content);
  }
};

const parseToolCall = (content) => {
  if (!content) return null;

  const match = content.match(
    /<tool_call>([\s\S]*?)<\/tool_call>/,
  );

  if (!match) return null;

  return JSON.parse(match[1].trim());
};

export async function routeMessageToAI(
  message,
  channel = 'whatsapp',
) {
  const {
    from,
    body,
    messageId: whatsappMsgId,
  } = message;

  try {
    logger.info(
      `Routing message from ${
        channel === 'whatsapp'
          ? maskPhone(from)
          : from
      } to AI Router via ${channel}`,
    );

    const user = await memoryService.getOrCreateUser(
      String(from),
    );

    const conversation =
      await memoryService.getOrCreateConversation(
        user.id,
      );

    // Skip loading memory every request.
    // AI can call search_memory tool when needed.
    const memories = [];

    const history =
      await memoryService.loadConversationHistory(
        conversation.id,
      );

    const summary =
      await memoryService.loadLatestSummary(
        user.id,
      );

    await memoryService.saveMessage({
      conversationId: conversation.id,
      userId: user.id,
      role: 'user',
      content: body || '(Pesan tanpa teks)',
      whatsappMsgId,
    });

    const memoryContext =
      memories.length > 0
        ? memories
            .map((m) => `- ${m.key}: ${m.value}`)
            .join('\n')
        : 'Belum ada memori spesifik tentang pengguna ini.';

    const summaryContext =
      summary ||
      'Belum ada rangkuman riwayat percakapan sebelumnya.';

    const toolsDesc =
      generateToolDescriptions() +
      '\n' +
      generateToolUsageGuide();

    const systemPromptFormatted =
      formatSystemPrompt({
        toolsDesc,
        summaryContext,
        memoryContext,
        channel,
      });

    const messages = [
      {
        role: 'system',
        content: systemPromptFormatted,
      },
      ...history,
      {
        role: 'user',
        content: body || '(Pesan tanpa teks)',
      },
    ];

    let turns = 0;
    const MAX_TURNS = 5;

    while (turns < MAX_TURNS) {
      turns += 1;

      const aiResponse = await withRetry(() =>
        chatCompletion(messages),
      );

      messages.push(aiResponse);

      await saveAssistantMessage({
        conversationId: conversation.id,
        userId: user.id,
        content: aiResponse.content,
      });

      const parsedCall = parseToolCall(
        aiResponse.content,
      );

      if (!parsedCall) {
        break;
      }

      try {
        const toolResults = await dispatchToolCalls(
          [{ 
            id: 'call_' + Date.now(), 
            function: { 
              name: parsedCall.name, 
              arguments: JSON.stringify(parsedCall.arguments) 
            } 
          }],
          { 
            userId: user.id, 
            phoneNumber: String(from)
          }
        );

        const resultStr =
          `[System: Tool Result for '${parsedCall.name}']\n${toolResults[0].content}`;

        messages.push({
          role: 'user',
          content: resultStr,
        });

        await memoryService.saveMessage({
          conversationId: conversation.id,
          userId: user.id,
          role: 'system',
          content: resultStr,
        });
      } catch (toolError) {
        logger.error({
          message: 'Failed to execute tool call',
          toolName: parsedCall?.name,
          toolArguments: parsedCall?.arguments,
          errorMessage:
            toolError instanceof Error
              ? toolError.message
              : String(toolError),
          stack:
            toolError instanceof Error
              ? toolError.stack
              : undefined,
          aiContent: aiResponse.content,
        });

        messages.push({
          role: 'user',
          content:
            '[System Error]: Format JSON tool call tidak valid.',
        });
        break;
      }
    }

    const assistantMessages = messages.filter(
      (m) => m.role === 'assistant',
    );

    const lastAssistantMessage =
      assistantMessages[assistantMessages.length - 1];

    const finalResponseContent =
      lastAssistantMessage?.content
        ?.replace(
          /<tool_call>[\s\S]*?<\/tool_call>/g,
          '',
        )
        .trim();

    await sendResponseMessage({
      channel,
      to: from,
      content: finalResponseContent,
    });

    await checkAndSummarize(conversation);
  } catch (error) {
    logger.error({
      message: 'AI Router Error',
      from,
      channel,
      errorMessage:
        error instanceof Error
          ? error.message
          : String(error),
      stack:
        error instanceof Error
          ? error.stack
          : undefined,
    });

    const errorMsg =
      'Maaf, terjadi kesalahan saat memproses pesan Anda.';

    await sendResponseMessage({
      channel,
      to: from,
      content: errorMsg,
    });
  }
}

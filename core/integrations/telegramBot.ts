import { Telegraf } from 'telegraf';
import { getVaultSecret, saveVaultSecret } from '../security/vault';
import { generateAssistantText } from '../ai/multiModelService';

let botInstance: Telegraf | null = null;
let currentBotToken: string = '';
let currentOwnerId: string = '';
let isBotRunning: boolean = false;

// Initialize or update the Telegram Bot instance
export async function setupTelegramBot(token: string, ownerChatId: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!token) {
      if (botInstance) {
        botInstance.stop('Token removed');
        botInstance = null;
      }
      isBotRunning = false;
      return { success: true, message: 'Telegram bot durduruldu.' };
    }

    if (botInstance && currentBotToken === token) {
      currentOwnerId = ownerChatId;
      return { success: true, message: 'Telegram bot ayarları güncellendi.' };
    }

    if (botInstance) {
      botInstance.stop('Restarting with new token');
    }

    const bot = new Telegraf(token);
    currentBotToken = token;
    currentOwnerId = ownerChatId;

    // Strict Whitelist Authorization Middleware
    bot.use(async (ctx, next) => {
      const fromId = ctx.from ? String(ctx.from.id) : '';
      const authorizedId = currentOwnerId || getVaultSecret('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID;

      if (!authorizedId) {
        await ctx.reply('⚠️ Sift Bot Güvenlik Uyarısı: Henüz bir yönetici Telegram ID tanımlanmadı. Lütfen web arayüzündeki Ayarlar panelinden Chat ID bilginizi kaydedin.');
        return;
      }

      if (fromId !== String(authorizedId)) {
        console.warn(`[Sift Telegram Security] Yetkisiz erişim denemesi: ID ${fromId} (${ctx.from?.username || 'isimsiz'})`);
        await ctx.reply('⛔ Yetkisiz Erişim: Bu Sift gelen kutusu botu yalnızca sahibine özel olarak şifrelenmiştir.');
        return;
      }

      return next();
    });

    // Start command
    bot.command('start', async (ctx) => {
      await ctx.reply(
        `👋 Merhaba! Sift AI-Powered Inbox Telegram Asistanınız devrede.\n\n` +
        `Buradan Sift Mail kullanım yardımı alabilirsiniz. Posta işlemleri uygulamada onayınızla yapılır.\n\n` +
        `Örnek Komutlar:\n` +
        `• "Sift Mail'de bir hesap nasıl eklenir?"\n` +
        `• "Uygulamada mail nasıl oluşturulur?"\n` +
        `• /status - Sistem durumu`
      );
    });

    // Status command
    bot.command('status', async (ctx) => {
      await ctx.reply(
        `📊 *Sift Sistem Durumu*\n\n` +
        `• Bot Durumu: Aktif & Çevrimiçi 🟢\n` +
        `• Güvenlik: Whitelist Korumalı\n` +
        `• Yetkili ID: \`${currentOwnerId}\`\n` +
        `• Posta erişimi: Bağlı değil; işlemleri Sift Mail içinde yapın`,
        { parse_mode: 'Markdown' }
      );
    });

    // Natural Language Query Handler
    bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      await ctx.sendChatAction('typing');

      try {
        const resultMessage = await processTelegramNaturalLanguageCommand(text);
        await ctx.reply(resultMessage, { parse_mode: 'Markdown' });
      } catch (err: any) {
        console.error('Telegram NLP hata:', err);
        await ctx.reply(`⚠️ Komut işlenirken hata oluştu: ${err.message || 'Bilinmeyen hata'}`);
      }
    });

    // Launch bot in background (non-blocking)
    bot.launch()
      .then(() => {
        isBotRunning = true;
        console.log('[Sift Telegram] Bot başarıyla başlatıldı ve dinlemeye alındı.');
      })
      .catch((err) => {
        console.error('[Sift Telegram] Bot başlatma hatası:', err.message);
        isBotRunning = false;
      });

    botInstance = bot;
    return { success: true, message: 'Telegram bot başarıyla başlatıldı.' };
  } catch (err: any) {
    console.error('Telegram bot kurulum hatası:', err);
    return { success: false, message: err.message || 'Telegram bot kurulumu başarısız.' };
  }
}

// Telegram has no connected mailbox action context. Never invent messages or completed actions.
export async function processTelegramNaturalLanguageCommand(query: string): Promise<string> {
  if (!query.trim() || query.length > 2000) return 'Geçerli ve kısa bir komut yazın.';
  if (/spam|temizle|sil|çöpe|özet|önemli|rapor|okunmamış/i.test(query)) {
    return 'Telegram üzerinden posta okuma ve değiştirme henüz bağlı değil. Hiçbir ileti okunmadı, gönderilmedi veya silinmedi. Bu işlemi Sift Mail içinde yapın.';
  }
  try {
    return await generateAssistantText({
      provider: 'gemini', prompt: query,
      systemInstruction: 'Sift Mail için kısa kullanım yardımı ver. Posta kutusuna erişimin yok. Mail okunduğunu, özetlendiğini, gönderildiğini, silindiğini veya ayar değiştirildiğini asla iddia etme.',
    }) || 'AI yardımcısı şu anda kullanılamıyor. Sift Mail Yardım bölümünü kullanın.';
  } catch { return 'AI yardımcısı şu anda kullanılamıyor. Sift Mail Yardım bölümünü kullanın.'; }
}

// Get current Telegram bot status
export function getTelegramStatus(): { isRunning: boolean; hasToken: boolean; ownerId: string } {
  const token = currentBotToken || getVaultSecret('telegram_bot_token') || process.env.TELEGRAM_BOT_TOKEN || '';
  const owner = currentOwnerId || getVaultSecret('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID || '';
  return {
    isRunning: isBotRunning,
    hasToken: Boolean(token),
    ownerId: owner,
  };
}

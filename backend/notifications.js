import { db } from './db.js';

// Escape HTML special characters for Telegram HTML mode
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sends a notification to Telegram.
 * @param {string} token - Telegram Bot Token
 * @param {string} chatId - Telegram Chat ID or Channel ID
 * @param {string} text - Message text in HTML format
 */
async function sendTelegramMessage(token, chatId, text, replyMarkup = null) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };
  
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `HTTP error! status: ${response.status}`);
  }
  return result;
}


/**
 * Sends a notification to Discord Webhook.
 * @param {string} webhookUrl - Discord Webhook URL
 * @param {object} embed - Discord Embed object
 */
async function sendDiscordMessage(webhookUrl, embed) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      embeds: [embed]
    })
  });

  if (!response.ok) {
    throw new Error(`Discord HTTP error! status: ${response.status}`);
  }
}

export const notifications = {
  /**
   * Expose sendTelegramMessage directly for scheduled jobs
   */
  async sendDirectTelegram(token, chatId, text, replyMarkup = null) {
    return sendTelegramMessage(token, chatId, text, replyMarkup);
  },

  /**
   * Send news notification to all enabled channels
   * @param {object} article - The article to notify about
   */
  async notifyArticle(article) {
    const settings = db.getSettings();
    let sentCount = 0;

    // 1. Telegram Notification
    if (settings.enableTelegram && settings.telegramToken && settings.telegramChatId) {
      try {
        const title = escapeHtml(article.title);
        const source = escapeHtml(article.source || 'Bilinmeyen Kaynak');
        const pubDate = escapeHtml(article.pubDate || new Date().toLocaleString('tr-TR'));
        const link = article.link;

        const message = [
          `🔔 <b>YENİ HABER: Kızıltepe</b>\n`,
          `📰 <b>${title}</b>\n`,
          `🏢 <b>Kaynak:</b> ${source}`,
          `📅 <b>Tarih:</b> ${pubDate}`
        ].join('\n');

        const replyMarkup = {
          inline_keyboard: [
            [
              { text: '📰 Haberi Oku', url: link },
              { text: '📢 Paylaş', url: `https://t.me/share/url?url=${encodeURIComponent(link)}` }
            ]
          ]
        };

        await sendTelegramMessage(settings.telegramToken, settings.telegramChatId, message, replyMarkup);
        db.addLog(`Telegram bildirimi gönderildi: "${article.title.slice(0, 40)}..."`, 'info');
        sentCount++;
      } catch (error) {
        db.addLog(`Telegram bildirimi başarısız: ${error.message}`, 'error');
      }
    }


    // 2. Discord Notification (Secondary channel)
    if (settings.enableDiscord && settings.discordWebhook) {
      try {
        const embed = {
          title: article.title,
          url: article.link,
          description: `Kızıltepe ile ilgili yeni bir haber yayınlandı!`,
          color: 3447003, // Blue
          fields: [
            { name: 'Kaynak', value: article.source || 'Bilinmeyen', inline: true },
            { name: 'Tarih', value: article.pubDate || 'Belirtilmemiş', inline: true }
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Kızıltepe Haber Takip Sistemi' }
        };

        await sendDiscordMessage(settings.discordWebhook, embed);
        db.addLog(`Discord bildirimi gönderildi: "${article.title.slice(0, 40)}..."`, 'info');
        sentCount++;
      } catch (error) {
        db.addLog(`Discord bildirimi başarısız: ${error.message}`, 'error');
      }
    }

    return sentCount > 0;
  },

  /**
   * Send a test Telegram notification
   */
  async testTelegram(token, chatId) {
    try {
      const message = [
        `🧪 <b>Mardin Kızıltepe Haber Takip Sistemi</b>\n`,
        `Telegram bildirim bağlantınız başarıyla doğrulandı!`,
        `Sistem her 30 dakikada bir Kızıltepe haberlerini kontrol edecek ve buraya gönderecektir.`,
        `\n📅 <i>Test Tarihi: ${new Date().toLocaleString('tr-TR')}</i>`
      ].join('\n');

      await sendTelegramMessage(token, chatId, message);
      db.addLog('Telegram test bildirimi başarıyla gönderildi.', 'info');
      return { success: true };
    } catch (error) {
      db.addLog(`Telegram test bildirimi başarısız: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  },

  /**
   * Send a test Discord notification
   */
  async testDiscord(webhookUrl) {
    try {
      const embed = {
        title: '🧪 Bağlantı Testi',
        description: 'Mardin Kızıltepe Haber Takip Sistemi Discord webhook bağlantısı başarıyla doğrulandı!',
        color: 65280, // Green
        timestamp: new Date().toISOString()
      };
      await sendDiscordMessage(webhookUrl, embed);
      db.addLog('Discord test bildirimi başarıyla gönderildi.', 'info');
      return { success: true };
    } catch (error) {
      db.addLog(`Discord test bildirimi başarısız: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  }
};

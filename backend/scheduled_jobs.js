import { db } from './db.js';
import { notifications } from './notifications.js';

/**
 * Fetch weather forecast for Kızıltepe (coordinates: 37.1926, 40.5872) from Open-Meteo API
 */
async function getWeather() {
  try {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.1926&longitude=40.5872&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Europe/Istanbul&forecast_days=1';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Weather API HTTP error: ${res.status}`);
    const data = await res.json();
    
    const maxTemp = data.daily.temperature_2m_max[0];
    const minTemp = data.daily.temperature_2m_min[0];
    const code = data.daily.weathercode[0];
    
    let desc = 'Bulutlu';
    if (code === 0) desc = '☀️ Açık / Güneşli';
    else if ([1, 2, 3].includes(code)) desc = '🌤️ Parçalı Bululutlu';
    else if ([45, 48].includes(code)) desc = '🌫️ Sisli';
    else if ([51, 53, 55].includes(code)) desc = '🌧️ Çiseleyen Yağmurlu';
    else if ([61, 63, 65, 80, 81, 82].includes(code)) desc = '🌧️ Yağmurlu';
    else if ([71, 73, 75, 77, 85, 86].includes(code)) desc = '❄️ Karlı';
    else if ([95, 96, 99].includes(code)) desc = '⚡ Gök Gürültülü Sağanak Yağışlı';
    
    return { success: true, maxTemp, minTemp, desc };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Scrape Kızıltepe duty pharmacies from eczaneler.org
 */
async function getPharmacies() {
  try {
    const url = 'https://www.eczaneler.org/mardin-kiziltepe-nobetci-eczaneleri';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) throw new Error(`Pharmacy web fetch HTTP error: ${res.status}`);
    const html = await res.text();
    
    const match = html.match(/\\"pharmacies\\"\s*:\s*(\[[\s\S]*?\])/);
    if (!match) throw new Error('HTML parsing failed (embedded pharmacies list not found)');
    
    let jsonStr = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const pharmacies = JSON.parse(jsonStr);
    return { success: true, list: pharmacies };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Checks time in Turkey (GMT+3) and fires daily morning/evening jobs if not already sent today
 */
export async function runScheduledJobs() {
  const settings = db.getSettings();
  if (!settings.enableTelegram || !settings.telegramToken || !settings.telegramChatId) {
    return; // Notifications disabled or credentials missing
  }

  // Calculate local Turkey time (permanent UTC+3)
  const tzOffset = 3 * 60; // 3 hours in minutes
  const turkeyTime = new Date(new Date().getTime() + tzOffset * 60000);
  const hours = turkeyTime.getUTCHours();
  
  const year = turkeyTime.getUTCFullYear();
  const month = String(turkeyTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(turkeyTime.getUTCDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  // 1. Morning Report: Sent after 08:00 AM local time
  if (hours >= 8 && settings.lastMorningReportDate !== todayStr) {
    db.addLog('Günlük sabah raporu (Kızıltepe Hava Durumu & Günün Özeti) gönderiliyor...', 'info');
    
    try {
      const weather = await getWeather();
      const articles = db.getArticles();
      
      // Get news from the last 24 hours
      const oneDayAgo = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
      const recentNews = articles.filter(a => a.crawledAt && a.crawledAt >= oneDayAgo).slice(0, 3);
      
      const formattedDate = turkeyTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      
      let message = [
        `🌅 <b>Kızıltepe Günaydın Raporu</b> 🌅\n`,
        `📅 <b>Tarih:</b> ${formattedDate}`,
        `📍 <b>Bölge:</b> Mardin / Kızıltepe\n`
      ];
      
      if (weather.success) {
        message.push(
          `☀️ <b>Bugünkü Hava Durumu:</b>`,
          `🌡️ En Yüksek: <b>${weather.maxTemp}°C</b>`,
          `🌡️ En Düşük: <b>${weather.minTemp}°C</b>`,
          `☁️ Durum: <b>${weather.desc}</b>\n`
        );
      } else {
        message.push(`⚠️ <i>Hava durumu bilgisi şu an alınamadı.</i>\n`);
      }
      
      message.push(`📰 <b>Günün Öne Çıkan Son Haberleri:</b>`);
      
      if (recentNews.length > 0) {
        recentNews.forEach((item, idx) => {
          message.push(`${idx + 1}. <b>${item.title}</b> (${item.source})`);
        });
      } else {
        message.push(`<i>Son 24 saat içinde yeni haber bulunmuyor.</i>`);
      }
      
      message.push(`\n✨ <i>İyi günler dileriz!</i>`);
      
      // Add inline button link to the live dashboard website
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: '🌐 Haber Paneline Git', url: 'https://paraburda20-alt.github.io/kiziltepe-haber1/' }
          ]
        ]
      };
      
      await notifications.sendDirectTelegram(settings.telegramToken, settings.telegramChatId, message.join('\n'), replyMarkup);
      
      db.saveSettings({ lastMorningReportDate: todayStr });
      db.addLog('Günlük sabah raporu başarıyla gönderildi.', 'info');
    } catch (error) {
      db.addLog(`Günlük sabah raporu gönderilemedi: ${error.message}`, 'error');
    }
  }

  // 2. Evening Pharmacy Report: Sent after 19:00 (7:00 PM) local time
  if (hours >= 19 && settings.lastPharmaciesDate !== todayStr) {
    db.addLog('Günlük nöbetçi eczaneler raporu (Kızıltepe Nöbetçi Eczaneleri) gönderiliyor...', 'info');
    
    try {
      const pharmacies = await getPharmacies();
      const formattedDate = turkeyTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      
      let message = [
        `🏥 <b>Kızıltepe Nöbetçi Eczaneleri</b> 🏥\n`,
        `📅 <b>Tarih:</b> ${formattedDate}`,
        `📍 <b>Bölge:</b> Mardin / Kızıltepe\n`,
        `Bugün Kızıltepe'de hizmet veren nöbetçi eczaneler listesi:\n`
      ];
      
      let inlineKeyboard = [];
      
      if (pharmacies.success && pharmacies.list.length > 0) {
        pharmacies.list.forEach((p, idx) => {
          message.push(
            `<b>${idx + 1}. ${p.name}</b>`,
            `📞 Tel: <code>${p.phone_formatted || p.phone}</code>`,
            `📍 Adres: <i>${p.address}</i>\n`
          );
          
          // Add a button pointing to Google Maps search for this pharmacy
          inlineKeyboard.push([
            { text: `📍 ${p.name} Haritası`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name + ' Eczanesi Kızıltepe')}` }
          ]);
        });
      } else {
        message.push(
          `⚠️ <i>Nöbetçi eczaneler listesi şu an alınamadı.</i>`,
          `<i>Lütfen eczaneler.org sitesinden kontrol edin.</i>`
        );
        inlineKeyboard.push([
          { text: '🌐 Eczaneler Sitesine Git', url: 'https://www.eczaneler.org/mardin-kiziltepe-nobetci-eczaneleri' }
        ]);
      }
      
      const replyMarkup = inlineKeyboard.length > 0 ? { inline_keyboard: inlineKeyboard } : null;
      
      await notifications.sendDirectTelegram(settings.telegramToken, settings.telegramChatId, message.join('\n'), replyMarkup);
      
      db.saveSettings({ lastPharmaciesDate: todayStr });
      db.addLog('Nöbetçi eczaneler raporu başarıyla gönderildi.', 'info');
    } catch (error) {
      db.addLog(`Nöbetçi eczaneler raporu gönderilemedi: ${error.message}`, 'error');
    }
  }
}

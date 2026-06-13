import Parser from 'rss-parser';
import { db } from './db.js';
import { notifications } from './notifications.js';

const parser = new Parser({
  customFields: {
    item: ['source']
  }
});

// Helper to extract source name from feed item
function getSourceName(item) {
  if (!item.source) return 'Google Haberler';
  if (typeof item.source === 'string') return item.source;
  if (item.source._) return item.source._;
  if (item.source.name) return item.source.name;
  return 'Bilinmeyen Kaynak';
}

// Helper to clean up titles (e.g. remove " - Kaynak" suffix if present)
function cleanTitle(title, sourceName) {
  if (!title) return '';
  const suffix = ` - ${sourceName}`;
  if (title.endsWith(suffix)) {
    return title.substring(0, title.length - suffix.length).trim();
  }
  return title;
}

export async function runScraper(forceNotify = false) {
  const settings = db.getSettings();
  const query = settings.query || 'Kızıltepe';
  db.addLog(`Tarama başlatıldı: "${query}" kelimesi taranıyor...`, 'info');
  
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=tr&gl=TR&ceid=TR:tr`;
    
    // Fetch RSS feed content using global fetch
    const response = await fetch(rssUrl);
    if (!response.ok) {
      throw new Error(`Google News RSS feed error: Status ${response.status}`);
    }
    const xml = await response.text();
    
    // Parse RSS XML
    const feed = await parser.parseString(xml);
    const items = feed.items || [];
    
    db.addLog(`Tarama tamamlandı. Google News üzerinde ${items.length} adet haber başlığı bulundu.`, 'info');
    
    if (items.length === 0) {
      return { success: true, count: 0 };
    }
    
    // Format feed items to our article schema
    const formattedArticles = items.map(item => {
      const source = getSourceName(item);
      return {
        title: cleanTitle(item.title, source),
        link: item.link,
        pubDate: item.pubDate,
        guid: item.guid || item.link,
        source: source
      };
    });
    
    const isFirstRun = db.getArticles().length === 0;
    
    // Add articles to DB, returns ONLY new unique articles
    const newArticles = db.addArticles(formattedArticles);
    
    db.addLog(`Veritabanına ${newArticles.length} adet yeni haber eklendi.`, 'info');
    
    if (newArticles.length > 0) {
      if (isFirstRun && !forceNotify) {
        db.addLog(`İlk çalıştırma: ${newArticles.length} haber veritabanına kaydedildi, bildirim gönderilmedi.`, 'warning');
      } else {
        // Send notifications for new articles
        db.addLog(`${newArticles.length} adet yeni haber için bildirimler gönderiliyor...`, 'info');
        
        // Notify in reverse order (oldest new article first) so they arrive in chronological order
        for (let i = newArticles.length - 1; i >= 0; i--) {
          const article = newArticles[i];
          await notifications.notifyArticle(article);
          // Wait 500ms between notifications to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    return {
      success: true,
      foundCount: items.length,
      newCount: newArticles.length,
      notified: !isFirstRun || forceNotify
    };
  } catch (error) {
    db.addLog(`Tarama hatası: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

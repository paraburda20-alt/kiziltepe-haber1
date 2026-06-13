import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db } from './db.js';
import { runScraper } from './scraper.js';
import { notifications } from './notifications.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Global state for scraper tracking
let lastRunTime = null;
let isScrapingNow = false;
let scraperIntervalId = null;

// Middleware
app.use(cors());
app.use(express.json());

// Helper to calculate next crawl time
function getNextRunTime() {
  if (!lastRunTime) return null;
  const settings = db.getSettings();
  const intervalMs = (settings.intervalMinutes || 30) * 60 * 1000;
  return new Date(lastRunTime.getTime() + intervalMs).toISOString();
}

// 1. API: Get Status
app.get('/api/status', (req, res) => {
  const settings = db.getSettings();
  const articles = db.getArticles();
  
  res.json({
    status: isScrapingNow ? 'scraping' : 'idle',
    lastRun: lastRunTime ? lastRunTime.toISOString() : null,
    nextRun: getNextRunTime(),
    totalArticles: articles.length,
    settings: {
      query: settings.query,
      intervalMinutes: settings.intervalMinutes,
      enableTelegram: settings.enableTelegram,
      enableDiscord: settings.enableDiscord
    }
  });
});

// 2. API: Get News
app.get('/api/news', (req, res) => {
  const articles = db.getArticles();
  res.json(articles);
});

// 3. API: Get Logs
app.get('/api/logs', (req, res) => {
  const logs = db.getLogs();
  res.json(logs);
});

// 4. API: Clear Logs
app.post('/api/logs/clear', (req, res) => {
  db.clearLogs();
  db.addLog('Sistem logları temizlendi.', 'info');
  res.json({ success: true });
});

// 5. API: Get Settings
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

// 6. API: Save Settings
app.post('/api/settings', (req, res) => {
  try {
    const oldSettings = db.getSettings();
    const newSettings = db.saveSettings(req.body);
    
    db.addLog('Sistem ayarları güncellendi.', 'info');
    
    // If interval has changed, restart the scheduler
    if (oldSettings.intervalMinutes !== newSettings.intervalMinutes || oldSettings.query !== newSettings.query) {
      db.addLog('Interval veya arama kelimesi değişti, planlayıcı yeniden başlatılıyor...', 'info');
      startScraperScheduler();
    }
    
    res.json({ success: true, settings: newSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. API: Trigger Manual Scrape
app.post('/api/scrape', async (req, res) => {
  if (isScrapingNow) {
    return res.status(400).json({ success: false, error: 'Tarama zaten şu anda çalışıyor.' });
  }
  
  isScrapingNow = true;
  db.addLog('Kullanıcı tarafından manuel tarama tetiklendi.', 'info');
  
  try {
    const result = await runScraper(true); // forceNotify = true for manual trigger
    lastRunTime = new Date();
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  } finally {
    isScrapingNow = false;
  }
});

// 8. API: Test Telegram Notification
app.post('/api/test/telegram', async (req, res) => {
  const { token, chatId } = req.body;
  if (!token || !chatId) {
    return res.status(400).json({ success: false, error: 'Token ve Chat ID bilgileri gereklidir.' });
  }
  
  const result = await notifications.testTelegram(token, chatId);
  res.json(result);
});

// 9. API: Test Discord Notification
app.post('/api/test/discord', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) {
    return res.status(400).json({ success: false, error: 'Webhook URL gereklidir.' });
  }
  
  const result = await notifications.testDiscord(webhookUrl);
  res.json(result);
});

// Serve Frontend Static Files in Production
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
  db.addLog('Üretim modu: Frontend statik dosyaları servis ediliyor.', 'info');
}

// Function to start the background scheduler
function startScraperScheduler() {
  if (scraperIntervalId) {
    clearInterval(scraperIntervalId);
  }
  
  const settings = db.getSettings();
  const intervalMs = (settings.intervalMinutes || 30) * 60 * 1000;
  
  db.addLog(`Otomatik tarayıcı planlandı: Her ${settings.intervalMinutes} dakikada bir taranacak.`, 'info');
  
  scraperIntervalId = setInterval(async () => {
    if (isScrapingNow) return;
    
    isScrapingNow = true;
    try {
      await runScraper();
      lastRunTime = new Date();
    } catch (err) {
      db.addLog(`Planlanmış taramada hata oluştu: ${err.message}`, 'error');
    } finally {
      isScrapingNow = false;
    }
  }, intervalMs);
}

// Server Startup
app.listen(PORT, async () => {
  db.addLog(`Sunucu başlatıldı. Port: ${PORT}`, 'info');
  
  // Start scheduler
  startScraperScheduler();
  
  // Run scraper once immediately on startup
  isScrapingNow = true;
  try {
    lastRunTime = new Date();
    await runScraper(false); // first run - don't notify to prevent spam
  } catch (error) {
    db.addLog(`Açılış taramasında hata oluştu: ${error.message}`, 'error');
  } finally {
    isScrapingNow = false;
  }
});

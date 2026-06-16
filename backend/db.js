import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, '..', 'db.json');

// Ensure database directory exists
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const DEFAULT_DB = {
  articles: [],
  settings: {
    query: 'Kızıltepe',
    intervalMinutes: 30,
    telegramToken: '',
    telegramChatId: '',
    enableTelegram: false,
    discordWebhook: '',
    enableDiscord: false,
    lastMorningReportDate: '',
    lastPharmaciesDate: ''
  },

  logs: []
};

// Read database from file
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      writeDb(DEFAULT_DB);
      return DEFAULT_DB;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(data);
    // Ensure all root keys exist
    return { ...DEFAULT_DB, ...parsed };
  } catch (error) {
    console.error('Error reading JSON DB, resetting to defaults:', error);
    writeDb(DEFAULT_DB);
    return DEFAULT_DB;
  }
}

// Write database to file
function writeDb(data) {
  try {
    // Write atomically using a temporary file to prevent corruption
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (error) {
    console.error('Error writing JSON DB:', error);
  }
}

export const db = {
  getArticles() {
    const data = readDb();
    return data.articles || [];
  },

  addArticles(newArticles) {
    const data = readDb();
    const existingUrls = new Set(data.articles.map(a => a.link));
    
    // Filter out articles that we already have
    const uniqueNewArticles = newArticles.filter(a => !existingUrls.has(a.link));
    
    if (uniqueNewArticles.length > 0) {
      // Add crawling timestamp
      const timestamped = uniqueNewArticles.map(a => ({
        ...a,
        id: a.guid || Math.random().toString(36).substring(2, 11),
        crawledAt: new Date().toISOString()
      }));
      
      // Merge and limit to 500 articles to prevent file size explosion
      data.articles = [...timestamped, ...data.articles].slice(0, 500);
      writeDb(data);
      return timestamped; // Return only newly added articles
    }
    
    return [];
  },

  getSettings() {
    const data = readDb();
    const settings = { ...DEFAULT_DB.settings, ...data.settings };
    
    // Environment variable overrides for GitHub Actions/Serverless environments
    if (process.env.TELEGRAM_TOKEN) {
      settings.telegramToken = process.env.TELEGRAM_TOKEN;
      settings.enableTelegram = true;
    }
    if (process.env.TELEGRAM_CHAT_ID) {
      settings.telegramChatId = process.env.TELEGRAM_CHAT_ID;
    }
    if (process.env.DISCORD_WEBHOOK) {
      settings.discordWebhook = process.env.DISCORD_WEBHOOK;
      settings.enableDiscord = true;
    }
    
    return settings;
  },

  saveSettings(newSettings) {
    const data = readDb();
    data.settings = { ...data.settings, ...newSettings };
    writeDb(data);
    return data.settings;
  },

  getLogs() {
    const data = readDb();
    return data.logs || [];
  },

  addLog(message, type = 'info') {
    const data = readDb();
    const newLog = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: new Date().toISOString(),
      message,
      type
    };
    
    // Keep last 150 logs
    data.logs = [newLog, ...(data.logs || [])].slice(0, 150);
    writeDb(data);
    
    // Also output to console
    const color = type === 'error' ? '\x1b[31m' : type === 'warning' ? '\x1b[33m' : '\x1b[32m';
    console.log(`${color}[${newLog.timestamp}] [${type.toUpperCase()}] ${message}\x1b[0m`);
    return newLog;
  },

  clearLogs() {
    const data = readDb();
    data.logs = [];
    writeDb(data);
  }
};

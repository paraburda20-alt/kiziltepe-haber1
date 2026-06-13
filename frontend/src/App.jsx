import React, { useState, useEffect } from 'react';
import { 
  Rss, Clock, Database, Play, Search, Settings, Terminal, Send, 
  RefreshCw, Trash2, Bell, ExternalLink, AlertTriangle, ShieldCheck
} from 'lucide-react';

function App() {
  const [news, setNews] = useState([]);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState({
    status: 'idle',
    lastRun: null,
    nextRun: null,
    totalArticles: 0,
    settings: {}
  });
  
  const [settings, setSettings] = useState({
    query: 'Kızıltepe',
    intervalMinutes: 30,
    telegramToken: '',
    telegramChatId: '',
    enableTelegram: false,
    discordWebhook: '',
    enableDiscord: false
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('telegram'); // telegram / settings / logs
  const [scraping, setScraping] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Fetch all initial data (supporting both Express API and static db.json fallback)
  const fetchData = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('API server is not reachable');
      
      const [resStatus, resNews, resLogs, resSettings] = await Promise.all([
        res.json(),
        fetch('/api/news').then(r => r.json()),
        fetch('/api/logs').then(r => r.json()),
        fetch('/api/settings').then(r => r.json())
      ]);

      setStatus({ ...resStatus, isStatic: false });
      setNews(resNews);
      setLogs(resLogs);
      setSettings(resSettings);
    } catch (error) {
      console.log('Backend API server not reachable, falling back to static db.json:', error.message);
      try {
        // Construct GitHub Raw URL if hosted on GitHub Pages for instant updates
        let dbUrl = '/db.json';
        if (window.location.hostname.endsWith('github.io')) {
          const parts = window.location.pathname.split('/').filter(Boolean);
          const username = window.location.hostname.split('.')[0];
          const repo = parts[0] || '';
          if (username && repo) {
            dbUrl = `https://raw.githubusercontent.com/${username}/${repo}/main/db.json`;
          }
        }

        const resDb = await fetch(dbUrl);
        if (!resDb.ok) throw new Error('Static db.json file not found');
        const dbData = await resDb.json();
        
        setNews(dbData.articles || []);
        setLogs(dbData.logs || []);
        setSettings(dbData.settings || {});
        
        setStatus({
          status: 'idle',
          lastRun: dbData.logs && dbData.logs[0] ? dbData.logs[0].timestamp : null,
          nextRun: null, // No active scheduler in static frontend
          totalArticles: dbData.articles ? dbData.articles.length : 0,
          settings: dbData.settings || {},
          isStatic: true // Static pages mode
        });
      } catch (staticErr) {
        console.error('Failed to load static db.json:', staticErr);
      }
    }
  };

  useEffect(() => {
    fetchData();
    // Poll data every 8 seconds for real-time status and logs updates
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Real-time Countdown Timer to next check
  useEffect(() => {
    if (!status.nextRun) {
      setCountdown('--:--');
      return;
    }

    const updateCountdown = () => {
      const now = new Date().getTime();
      const target = new Date(status.nextRun).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setCountdown('Taranıyor...');
        return;
      }

      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${minutes}dk ${seconds}sn`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [status.nextRun]);

  // Trigger manual scrape
  const handleScrape = async () => {
    setScraping(true);
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Tarama Başarılı!\nBulunan Haber: ${data.foundCount}\nYeni Eklenen: ${data.newCount}`);
      } else {
        alert(`Tarama Hatası: ${data.error}`);
      }
      fetchData();
    } catch (error) {
      alert(`Tarama tetiklenemedi: ${error.message}`);
    } finally {
      setScraping(false);
    }
  };

  // Handle Input Changes
  const handleSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Save System Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        alert('Ayarlar başarıyla kaydedildi!');
        fetchData();
      } else {
        alert(`Hata: ${data.error}`);
      }
    } catch (error) {
      alert(`Ayarlar kaydedilemedi: ${error.message}`);
    } finally {
      setSavingSettings(false);
    }
  };

  // Test Telegram Integration
  const handleTestTelegram = async () => {
    if (!settings.telegramToken || !settings.telegramChatId) {
      alert('Lütfen test etmeden önce Bot Token ve Chat ID giriniz!');
      return;
    }
    
    setTestingTelegram(true);
    try {
      const res = await fetch('/api/test/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: settings.telegramToken,
          chatId: settings.telegramChatId
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Test bildirimi Telegram botunuza gönderildi! Lütfen telefonunuzu kontrol edin.');
      } else {
        alert(`Test Başarısız: ${data.error}`);
      }
    } catch (error) {
      alert(`Hata: ${error.message}`);
    } finally {
      setTestingTelegram(false);
    }
  };

  // Clear system logs
  const handleClearLogs = async () => {
    if (!window.confirm('Tüm sistem loglarını silmek istediğinize emin misiniz?')) return;
    setClearingLogs(true);
    try {
      await fetch('/api/logs/clear', { method: 'POST' });
      fetchData();
    } catch (error) {
      console.error(error);
    } finally {
      setClearingLogs(false);
    }
  };

  // Filter news articles based on search query
  const filteredNews = news.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.source && item.source.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Helper: Format Dates
  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="app-container">
      <div className="bg-glow-orange"></div>
      <div className="bg-glow-blue"></div>

      {/* Header */}
      <header className="header">
        <div className="header-title-area">
          <div className="logo-container">
            <Rss size={28} color="#000" />
          </div>
          <div>
            <h1>Kızıltepe Haber Takip</h1>
            <p>Mardin Kızıltepe yerel ve ulusal haber izleme merkezi</p>
          </div>
        </div>
        <div className="mardin-badge">
          MARDİN / KIZILTEPE
        </div>
      </header>

      {/* Status Indicators Dashboard */}
      <section className="status-grid">
        <div className={`glass-card status-card ${status.status === 'scraping' ? 'active' : 'info'}`}>
          <div className="status-icon-wrapper">
            <RefreshCw size={24} className={status.status === 'scraping' ? 'spin' : ''} />
          </div>
          <div>
            <div className="status-label">Servis Durumu</div>
            <div className="status-value">
              {status.status === 'scraping' ? 'Taranıyor' : 'Beklemede'}
            </div>
          </div>
        </div>

        <div className="glass-card status-card success">
          <div className="status-icon-wrapper">
            <Database size={24} />
          </div>
          <div>
            <div className="status-label">Kayıtlı Haber</div>
            <div className="status-value">{status.totalArticles} adet</div>
          </div>
        </div>

        <div className="glass-card status-card">
          <div className="status-icon-wrapper">
            <Clock size={24} />
          </div>
          <div>
            <div className="status-label">Son Tarama</div>
            <div className="status-value">
              {status.lastRun ? formatTime(status.lastRun) : 'Belirtilmedi'}
            </div>
          </div>
        </div>

        <div className="glass-card status-card">
          <div className="status-icon-wrapper">
            <Send size={24} color="#ff9f00" />
          </div>
          <div>
            <div className="status-label">Sonraki Tarama</div>
            <div className="status-value">{countdown}</div>
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <main className="main-grid">
        {/* Left Column: News Feed */}
        <section className="glass-card">
          <div className="section-header">
            <h2>
              <Bell size={20} color="#ff9f00" />
              Haber Akışı
            </h2>
            <div className="search-container">
              <Search className="search-icon" />
              <input 
                type="text" 
                placeholder="Haberlerde ara..." 
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {filteredNews.length === 0 ? (
            <div className="empty-state">
              <AlertTriangle size={48} color="#868e96" />
              <p>Haber bulunamadı. Lütfen daha sonra kontrol edin veya üst menüden manuel tarama tetikleyin.</p>
            </div>
          ) : (
            <div className="news-list">
              {filteredNews.map((item) => (
                <a 
                  key={item.id} 
                  href={item.link} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="news-card"
                >
                  <div className="news-card-header">
                    <span className="news-source-tag">{item.source}</span>
                    <div className="news-time">
                      <Clock size={12} />
                      <span>{formatDate(item.pubDate)} {formatTime(item.pubDate)}</span>
                    </div>
                  </div>
                  <div className="news-title">{item.title}</div>
                  <div className="news-footer">
                    <span>Haberi Oku</span>
                    <ExternalLink size={12} />
                  </div>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Settings & Console Logs */}
        <div className="sidebar-container">
          <section className="glass-card">
            {/* Sidebar Tabs */}
            <div className="tab-container">
              <button 
                className={`tab-btn ${activeTab === 'telegram' ? 'active' : ''}`}
                onClick={() => setActiveTab('telegram')}
              >
                Telegram Bot
              </button>
              <button 
                className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                Tarayıcı Ayarı
              </button>
              <button 
                className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('logs')}
              >
                Sistem Logları
              </button>
            </div>

            {/* TAB: Telegram Settings */}
            {activeTab === 'telegram' && (
              <form onSubmit={handleSaveSettings}>
                {status.isStatic && (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(255, 159, 0, 0.08)', border: '1px solid rgba(255, 159, 0, 0.2)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    <span style={{ color: '#ff9f00', fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>⚠️ GitHub Actions Modu Etkin</span>
                    Canlı sunucu olmadan arayüzden Telegram ayarlarını kaydedemezsiniz. Telegram Token ve Chat ID bilgilerinizi GitHub deponuzun <b>Settings &gt; Secrets and variables &gt; Actions</b> bölümüne eklemelisiniz.
                  </div>
                )}

                <div className="toggle-container">
                  <div className="toggle-info">
                    <span className="toggle-title">Telegram Bildirimleri</span>
                    <span className="toggle-desc">Yeni haberleri anlık gönder</span>
                  </div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      name="enableTelegram"
                      checked={settings.enableTelegram}
                      onChange={handleSettingChange}
                      disabled={status.isStatic}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="form-group">
                  <label>Bot Token</label>
                  <input 
                    type="password" 
                    name="telegramToken"
                    placeholder="BotFather'dan aldığınız token"
                    className="form-input"
                    value={settings.telegramToken || ''}
                    onChange={handleSettingChange}
                    required={settings.enableTelegram}
                    disabled={status.isStatic}
                  />
                </div>

                <div className="form-group">
                  <label>Chat / Kanal ID</label>
                  <input 
                    type="text" 
                    name="telegramChatId"
                    placeholder="Gönderilecek Chat ID (Örn: 12345678)"
                    className="form-input"
                    value={settings.telegramChatId || ''}
                    onChange={handleSettingChange}
                    required={settings.enableTelegram}
                    disabled={status.isStatic}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ flex: 1 }}
                    disabled={savingSettings || status.isStatic}
                  >
                    {savingSettings ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary"
                    onClick={handleTestTelegram}
                    disabled={testingTelegram || status.isStatic}
                  >
                    {testingTelegram ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                    Test Et
                  </button>
                </div>

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255, 159, 0, 0.05)', borderRadius: '8px', border: '1px solid rgba(255,159,0,0.1)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', color: '#ff9f00', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    <ShieldCheck size={16} />
                    <span>Telegram Kurulumu Nasıl Yapılır?</span>
                  </div>
                  <ol style={{ fontSize: '0.75rem', color: var(--text-muted), paddingLeft: '1.2rem', lineHeight: '1.5' }}>
                    <li>Telegram'da <b>@BotFather</b> botuna gidin ve <code>/newbot</code> komutuyla yeni bir bot oluşturun.</li>
                    <li>Sırada verilen <b>HTTP API Token</b> değerini yukarıdaki "Bot Token" alanına yapıştırın.</li>
                    <li>Oluşturduğunuz botu başlatın (Start'a tıklayın).</li>
                    <li>Kendi <b>Chat ID</b> değerinizi öğrenmek için <b>@userinfobot</b> botuna mesaj gönderin. Alınan ID değerini yukarıya girip "Test Et" butonuna basın.</li>
                  </ol>
                </div>
              </form>
            )}

            {/* TAB: General Settings */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveSettings}>
                {status.isStatic && (
                  <div style={{ padding: '0.75rem 1rem', background: 'rgba(255, 159, 0, 0.08)', border: '1px solid rgba(255, 159, 0, 0.2)', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    <span style={{ color: '#ff9f00', fontWeight: 'bold', display: 'block', marginBottom: '0.25rem' }}>⚠️ GitHub Actions Modu Etkin</span>
                    Arama terimi ve tarama sıklığı ayarları GitHub Actions iş akış dosyası (workflow) içinde tanımlıdır. Bunları değiştirmek için kodunuzdaki <code>.github/workflows/scrape.yml</code> dosyasını düzenlemelisiniz.
                  </div>
                )}

                <div className="form-group">
                  <label>Arama Terimi (Kelime)</label>
                  <input 
                    type="text" 
                    name="query"
                    className="form-input"
                    value={settings.query}
                    onChange={handleSettingChange}
                    required
                    disabled={status.isStatic}
                  />
                </div>

                <div className="form-group">
                  <label>Tarama Sıklığı (Dakika)</label>
                  <input 
                    type="number" 
                    name="intervalMinutes"
                    className="form-input"
                    value={settings.intervalMinutes}
                    onChange={handleSettingChange}
                    min="5"
                    max="1440"
                    required
                    disabled={status.isStatic}
                  />
                </div>

                <div className="toggle-container">
                  <div className="toggle-info">
                    <span className="toggle-title">Discord Entegrasyonu</span>
                    <span className="toggle-desc">Yedek bildirim kanalı</span>
                  </div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      name="enableDiscord"
                      checked={settings.enableDiscord}
                      onChange={handleSettingChange}
                      disabled={status.isStatic}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {settings.enableDiscord && (
                  <div className="form-group">
                    <label>Discord Webhook URL</label>
                    <input 
                      type="text" 
                      name="discordWebhook"
                      placeholder="https://discord.com/api/webhooks/..."
                      className="form-input"
                      value={settings.discordWebhook || ''}
                      onChange={handleSettingChange}
                      required={settings.enableDiscord}
                      disabled={status.isStatic}
                    />
                  </div>
                )}

                <button 
                  type="submit" 
                  className="btn btn-primary" 
                  style={{ width: '100%', marginTop: '1rem' }}
                  disabled={savingSettings || status.isStatic}
                >
                  {savingSettings ? 'Kaydediliyor...' : 'Tarayıcı Ayarlarını Kaydet'}
                </button>
              </form>
            )}

            {/* TAB: Logs Console */}
            {activeTab === 'logs' && (
              <div className="log-panel">
                <div className="log-console">
                  {logs.length === 0 ? (
                    <div style={{ color: '#495057', fontStyle: 'italic' }}>Kayıtlı sistem logu bulunmuyor.</div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="log-row">
                        <span className="log-time">{formatTime(log.timestamp)}</span>
                        <span className={`log-type ${log.type}`}>{log.type}</span>
                        <span className="log-message">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button 
                    onClick={handleScrape} 
                    className="btn btn-primary" 
                    style={{ flex: 1 }}
                    disabled={scraping || status.isStatic}
                  >
                    {scraping ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
                    {status.isStatic ? 'Actions Modunda Devre Dışı' : 'Şimdi Tara'}
                  </button>
                  <button 
                    onClick={handleClearLogs} 
                    className="btn btn-danger"
                    disabled={clearingLogs || status.isStatic}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;

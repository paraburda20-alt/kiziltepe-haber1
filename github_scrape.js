import { runScraper } from './backend/scraper.js';
import { db } from './backend/db.js';

async function run() {
  db.addLog('GitHub Actions ortamında otomatik tarama başlatıldı.', 'info');
  
  try {
    const result = await runScraper(false); // forceNotify = false
    
    console.log('GitHub Actions Scraper tamamlandı:');
    console.log(`- Bulunan Haber: ${result.foundCount}`);
    console.log(`- Yeni Eklenen: ${result.newCount}`);
    console.log(`- Bildirim Durumu: ${result.notified ? 'Aktif' : 'Pasif (İlk Çalışma)'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('GitHub Actions Scraper hata verdi:', error);
    db.addLog(`GitHub Actions taramasında hata oluştu: ${error.message}`, 'error');
    process.exit(1);
  }
}

run();

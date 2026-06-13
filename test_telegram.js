import { notifications } from './backend/notifications.js';

const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !chatId) {
  console.error('Hata: TELEGRAM_TOKEN veya TELEGRAM_CHAT_ID ortam degiskenleri bulunamadi!');
  process.exit(1);
}

console.log('Telegram test mesaji gonderiliyor...');
notifications.testTelegram(token, chatId).then(res => {
  if (res.success) {
    console.log('Test mesaji basariyla gonderildi!');
    process.exit(0);
  } else {
    console.error('Test mesaji gonderilemedi:', res.error);
    process.exit(1);
  }
});

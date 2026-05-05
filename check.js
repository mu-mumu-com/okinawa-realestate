require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');
console.log('開始');
const imap = new Imap({
  user: process.env.GMAIL_USER,
  password: process.env.GMAIL_PASS,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});
imap.once('ready', () => {
  console.log('接続成功');
  imap.openBox('INBOX', false, (err, box) => {
    console.log('総メール数:', box.messages.total);
    const total = box.messages.total;
    const start = Math.max(1, total - 49);
    const f = imap.fetch(start + ':' + total, { bodies: '' });
    f.on('message', msg => {
      msg.on('body', stream => {
        simpleParser(stream, (err, parsed) => {
          const from = (parsed.from ? parsed.from.text : '').toLowerCase();
          const subject = parsed.subject || '';
          const body = parsed.text || '';
          const html = parsed.html || '';

          if (from.includes('suumo') || from.includes('recruit')) {
            console.log('\n=== SUUMO ===');
            console.log('件名:', subject);

            // リンク一覧
            const links = [...html.matchAll(/href="(https?:\/\/suumo\.jp\/[^"]+)"[^>]*>([^<]+)<\/a>/g)]
              .filter(m => (m[1].includes('/ms/') || m[1].includes('/jj/') || m[1].includes('/chintai')) && m[2].trim().length > 3);
            console.log('物件リンク数:', links.length);
            links.forEach((link, i) => {
              console.log(`\n--- 物件${i+1} ---`);
              console.log('URL:', link[1]);
              console.log('タイトル:', link[2].trim());
              // URL近辺のHTML（前後500文字）
              const pos = html.indexOf(link[1]);
              const segment = pos >= 0 ? html.substring(Math.max(0, pos - 300), pos + 800) : '';
              // 価格を全部抽出
              const prices = [...segment.matchAll(/(\d[\d,]*(?:\.\d+)?万円)/g)];
              console.log('近辺の価格:', prices.map(p => p[1]));
              // テキストボディの価格も確認
              const bodyPrices = [...body.matchAll(/(\d[\d,]*(?:\.\d+)?万円)/g)];
              console.log('本文の価格（全件）:', bodyPrices.map(p => p[1]).slice(0, 10));
            });
          }
        });
      });
    });
    f.once('end', () => setTimeout(() => imap.end(), 5000));
  });
});
imap.once('error', e => console.log('エラー:', e));
imap.connect();

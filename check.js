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
            const allUrls = [...(html.match(/https?:\/\/suumo\.jp\/[^\s"<>]+/g) || []),
                            ...(body.match(/https?:\/\/suumo\.jp\/[^\s\n"<>]+/g) || [])];
            console.log('URL一覧:', allUrls.slice(0, 5));
          }

          if (from.includes('athome')) {
            console.log('\n=== アットホーム ===');
            console.log('件名:', subject);
            const allUrls = body.match(/https:\/\/www\.athome\.co\.jp\/[^\s\n]+/g) || [];
            console.log('URL一覧:', allUrls.slice(0, 5));
          }
        });
      });
    });
    f.once('end', () => setTimeout(() => imap.end(), 3000));
  });
});
imap.once('error', e => console.log('エラー:', e));
imap.connect();

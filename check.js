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
          const from = parsed.from ? parsed.from.text : '';
          if (from.includes('homes') || from.includes('lifull')) {
            console.log('HOMES発見:', parsed.subject);
          }
        });
      });
    });
    f.once('end', () => setTimeout(() => imap.end(), 3000));
  });
});
imap.once('error', e => console.log('エラー:', e));
imap.connect();
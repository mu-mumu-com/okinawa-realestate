const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const imap = new Imap({
  user: process.env.GMAIL_USER,
  password: process.env.GMAIL_PASS,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

function openInbox(cb) {
  imap.openBox('INBOX', false, cb);
}

function parseProperty(subject, body, from, parsed) {
  const properties = [];

  let site = 'その他';
  let type = '売買';
  if (from.includes('athome')) site = 'アットホーム';
  else if (from.includes('homes') || from.includes('lifull')) site = "HOME'S";
  else if (from.includes('suumo') || from.includes('recruit')) site = 'SUUMO';
  else if (from.includes('kenbiya')) site = '健美家';

  // アットホームのメール解析
  if (site === 'アットホーム') {
    const blocks = body.split('================================');
    for (let i = 1; i < blocks.length; i += 2) {
      const block = blocks[i] + (blocks[i + 1] || '');
      const titleMatch = block.match(/】(.+)/);
      const priceMatch = block.match(/(\d[\d,]+万円)/);
      const urlMatch = block.match(/https:\/\/www\.athome\.co\.jp\/[^\s\n]+/);
      const addressMatch = block.match(/\n(.+[市町村].+)\n/);
      if (titleMatch && priceMatch) {
        properties.push({
          title: titleMatch[1].trim(),
          price: priceMatch[1],
          address: addressMatch ? addressMatch[1].trim() : '',
          url: urlMatch ? urlMatch[0] : '',
          site,
type: '売買',
          status: '販売中',
          received_at: new Date().toISOString()
        });
      }
    }
  }

  // HOME'Sのメール解析
  if (site === "HOME'S") {
    // 不要メールを除外
  if (subject.includes('閲覧') || subject.includes('おすすめ')) {
      return properties;
    }
    const priceMatch = subject.match(/(\d[\d,]+万円)/);
    if (!priceMatch) return properties;

    const htmlBody = parsed && parsed.html ? parsed.html : '';
    const allUrls = [
      ...(htmlBody.match(/https?:\/\/[^\s"<>]+/gi) || []),
      ...(body.match(/https?:\/\/[^\s\n"<>]+/gi) || [])
    ];
    const urlMatch = allUrls.find(u =>
      (u.includes('homes.co.jp') || u.includes('lifull.com')) &&
      !u.includes('.png') &&
      !u.includes('.jpg') &&
      !u.includes('.gif') &&
      !u.includes('img') &&
      !u.includes('assets') &&
      !u.includes('mail') &&
      !u.includes('click.ma')
    );

   const cleanTitle = subject
      .replace(/🌄朝の新着\d+件🔔/u, '')
      .replace(/｜LIFULL HOME'S新着お知らせメール/u, '')
      .replace(/\|LIFULL HOME'S新着お知らせメール/u, '')
      .trim();

    properties.push({
      title: cleanTitle,
      price: priceMatch[1],
      address: '',
      url: urlMatch || 'https://www.homes.co.jp/kodate/okinawa/',
      site,
      status: '販売中',
      type: '売買',
          status: '販売中',
      received_at: new Date().toISOString()
    });
  }

  // 健美家のメール解析
  if (site === '健美家' && subject.includes('新着物件')) {
    const priceMatch = subject.match(/(\d[\d,]+万円)/);
    const urlMatch = body.match(/https?:\/\/www\.kenbiya\.com\/[^\s\n]+/);
    properties.push({
      title: subject.replace('新着物件：', '').trim(),
      price: priceMatch ? priceMatch[1] : '',
      address: '',
      url: urlMatch ? urlMatch[0] : '',
      site,
      status: '販売中',
      type: '収益',
          status: '販売中',
      received_at: new Date().toISOString()
    });
  }

  // SUUMOのメール解析
  if (site === 'SUUMO') {
    const htmlBody = parsed && parsed.html ? parsed.html : '';

    // HTMLから物件リンクを全部取得
    const linkMatches = htmlBody.matchAll(/href="(https?:\/\/suumo\.jp\/[^"]+)"[^>]*>([^<]+)<\/a>/g);
    const priceMatches = body.matchAll(/(\d+(?:\.\d+)?万円)/g);
    const addressMatches = body.matchAll(/沖縄県([^\n\r]+)/g);

const links = [...linkMatches].filter(m => 
  (m[1].includes('/ms/') || m[1].includes('/jj/') || m[1].includes('/chintai/')) &&
  !m[2].includes('登録') &&
  !m[2].includes('停止') &&
  !m[2].includes('探す') &&
  m[2].trim().length > 3
);
    const prices = [...priceMatches];
    const addresses = [...addressMatches];

    if (links.length > 0) {
      links.forEach((link, i) => {
        properties.push({
          title: link[2].trim() || `SUUMO物件${i + 1}`,
          price: prices[i] ? prices[i][1] : '',
          address: addresses[i] ? `沖縄県${addresses[i][1].trim()}` : '',
          url: link[1],
          site,
          status: '販売中',
          received_at: new Date().toISOString()
        });
      });
    } else if (body.includes('新着')) {
      const priceMatch = body.match(/(\d+(?:\.\d+)?万円)/);
      properties.push({
        title: subject.replace(/【ＳＵＵＭＯ[^】]*】/, '').trim(),
        price: priceMatch ? priceMatch[1] : '',
        address: '',
        url: 'https://suumo.jp/okinawa/',
        site,
type: title.match(/^\d+(\.\d+)?万円/) ? '賃貸' : '売買',
          status: '販売中',        received_at: new Date().toISOString()
      });
    }
  }

  return properties;
}

async function saveToDB(property) {// 不要なタイトルを除外
if (!property.title || 
      property.title.includes('閲覧') ||
      property.title.includes('メルマガ') ||
      property.title.includes('会員登録') ||
      property.title.includes('物件を探す') ||
      property.title.includes('配信停止') ||
      property.title === '5,400万円/4LDK/築18年/') {
  console.log('除外:', property.title);
    return;
  }
  const { data: existing } = await supabase
    .from('properties')
    .select('id')
    .eq('title', property.title)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('既存物件スキップ:', property.title);
    return;
  }

  const { error } = await supabase
    .from('properties')
    .insert(property);

  if (error) {
    console.log('保存エラー:', error.message);
  } else {
    console.log('保存成功:', property.title, property.price);
  }
}

function fetchMails() {
  imap.connect();

  imap.once('ready', function () {
    openInbox(function (err, box) {
      if (err) throw err;

      const total = box.messages.total;
      if (total === 0) {
        console.log('メールなし');
        imap.end();
        return;
      }

      const start = Math.max(1, total - 49);
      const fetch = imap.fetch(`${start}:${total}`, { bodies: '' });

      fetch.on('message', function (msg) {
        msg.on('body', function (stream) {
          simpleParser(stream, async (err, parsed) => {
            if (err) return;
            const subject = parsed.subject || '';
            const body = parsed.text || '';
            const from = parsed.from ? parsed.from.text : '';

            if (
              from.includes('athome') ||
              from.includes('homes') ||
              from.includes('lifull') ||
              from.includes('suumo') ||
              from.includes('kenbiya')
            ) {
              const properties = parseProperty(subject, body, from, parsed);
              for (const property of properties) {
                await saveToDB(property);
              }
            }
          });
        });
      });

      fetch.once('end', function () {
        setTimeout(() => {
          console.log('取得完了！');
          imap.end();
        }, 3000);
      });
    });
  });

  imap.once('error', function (err) {
    console.log('エラー:', err);
  });
}

fetchMails();
const Imap = require('imap');
const { simpleParser } = require('mailparser');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { decrypt } = require('./crypto-utils');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function parseProperty(subject, body, from, parsed) {
  const properties = [];

  let site = 'その他';
  if (from.includes('athome')) site = 'アットホーム';
  else if (from.includes('homes') || from.includes('lifull')) site = "HOME'S";
  else if (from.includes('suumo') || from.includes('recruit')) site = 'SUUMO';
  else if (from.includes('kenbiya')) site = '健美家';

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

  if (site === "HOME'S") {
    if (subject.includes('閲覧') || subject.includes('おすすめ')) return properties;
    const priceMatch = subject.match(/(\d[\d,.]+万円)/);
    if (!priceMatch) return properties;

    const htmlBody = parsed && parsed.html ? parsed.html : '';
    const allUrls = [
      ...(htmlBody.match(/https?:\/\/[^\s"<>]+/gi) || []),
      ...(body.match(/https?:\/\/[^\s\n"<>]+/gi) || [])
    ];
    const urlMatch = allUrls.find(u =>
      (u.includes('homes.co.jp') || u.includes('lifull.com')) &&
      !u.includes('.png') && !u.includes('.jpg') && !u.includes('.gif') &&
      !u.includes('img') && !u.includes('assets') && !u.includes('click.ma')
    );

    const cleanTitle = subject
      .replace(/[☀-➿\uD83C-􏰀-\uDFFF]+\S*新着\d+件[☀-➿\uD83C-􏰀-\uDFFF]+\s*/gu, '')
      .replace(/｜LIFULL HOME'S新着お知らせメール/u, '')
      .replace(/\|LIFULL HOME'S新着お知らせメール/u, '')
      .replace(/\/ほか$/, '')
      .trim();

    const price = priceMatch[1];
    const isRental = parseFloat(price.replace(/,/g, '')) < 1000;
    properties.push({
      title: cleanTitle,
      price,
      address: '',
      url: urlMatch || 'https://www.homes.co.jp/kodate/okinawa/',
      site,
      status: '販売中',
      type: isRental ? '賃貸' : '売買',
      received_at: new Date().toISOString()
    });
  }

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
      received_at: new Date().toISOString()
    });
  }

  if (site === 'SUUMO') {
    const htmlBody = parsed && parsed.html ? parsed.html : '';
    const linkMatches = htmlBody.matchAll(/href="(https?:\/\/suumo\.jp\/[^"]+)"[^>]*>([^<]+)<\/a>/g);
    const priceMatches = body.matchAll(/(\d+(?:\.\d+)?万円)/g);
    const addressMatches = body.matchAll(/沖縄県([^\n\r]+)/g);

    const links = [...linkMatches].filter(m =>
      (m[1].includes('/ms/') || m[1].includes('/jj/') || m[1].includes('/chintai/')) &&
      !m[2].includes('登録') && !m[2].includes('停止') && !m[2].includes('探す') &&
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
        status: '販売中',
        received_at: new Date().toISOString()
      });
    }
  }

  return properties;
}

async function saveToDB(property, userId) {
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
    .eq('user_id', userId)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('既存物件スキップ:', property.title);
    return;
  }

  const { error } = await supabase
    .from('properties')
    .insert({ ...property, user_id: userId });

  if (error) {
    console.log('保存エラー:', error.message);
  } else {
    console.log('保存成功:', property.title, property.price);
  }
}

function fetchMailsForUser(userId, gmailUser, gmailPass) {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: gmailUser,
      password: gmailPass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: true }
    });

    imap.once('ready', function () {
      imap.openBox('INBOX', false, function (err, box) {
        if (err) { imap.end(); return reject(err); }

        const total = box.messages.total;
        if (total === 0) {
          console.log('メールなし');
          imap.end();
          return;
        }

        const start = Math.max(1, total - 49);
        const fetch = imap.fetch(`${start}:${total}`, { bodies: '' });
        const savePromises = [];

        fetch.on('message', function (msg) {
          msg.on('body', function (stream) {
            const p = new Promise((res) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) return res();
                const subject = parsed.subject || '';
                const body = parsed.text || '';
                const from = parsed.from ? parsed.from.text : '';

                if (
                  from.includes('athome') || from.includes('homes') ||
                  from.includes('lifull') || from.includes('suumo') ||
                  from.includes('kenbiya')
                ) {
                  const properties = parseProperty(subject, body, from, parsed);
                  for (const property of properties) {
                    await saveToDB(property, userId);
                  }
                }
                res();
              });
            });
            savePromises.push(p);
          });
        });

        fetch.once('end', function () {
          setTimeout(async () => {
            await Promise.all(savePromises);
            console.log('取得完了！');
            imap.end();
          }, 3000);
        });
      });
    });

    imap.once('error', function (err) {
      console.log('エラー:', err);
      reject(err);
    });

    imap.once('end', resolve);
    imap.connect();
  });
}

async function main() {
  const targetUserId = process.env.MAIL_USER_ID;

  if (targetUserId) {
    await fetchMailsForUser(targetUserId, process.env.GMAIL_USER, process.env.GMAIL_PASS);
  } else {
    const { data: users, error } = await supabase
      .from('user_settings')
      .select('user_id, gmail_user, gmail_pass')
      .not('gmail_user', 'is', null)
      .not('gmail_pass', 'is', null);

    if (error) {
      console.error('ユーザー設定取得エラー:', error);
      process.exit(1);
    }

    for (const user of users || []) {
      try {
        console.log(`ユーザー ${user.user_id} のメール取得開始`);
        await fetchMailsForUser(user.user_id, user.gmail_user, decrypt(user.gmail_pass));
      } catch (err) {
        console.error(`ユーザー ${user.user_id} エラー:`, err.message);
      }
    }
  }

  process.exit(0);
}

main();

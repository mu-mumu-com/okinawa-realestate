const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const cron = require('node-cron');
const nodemailer = require('nodemailer');

const contactTransporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'okinawa.realestate.notify@gmail.com', pass: process.env.CONTACT_GMAIL_PASS }
});
const { encrypt, decrypt } = require('./crypto-utils');

const app = express();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function getUserClient(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '認証が必要です' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: '無効なトークンです' });
  req.user = user;
  req.token = token;
  next();
}

const ALLOWED_ORIGINS = [
  'https://okinawa-realestate.vercel.app',
  'http://localhost:3000'
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.static('public'));

app.get('/api/check-access', requireAuth, (req, res) => {
  const allowedEmails = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowedEmails.length === 0) return res.json({ allowed: true });
  const allowed = allowedEmails.includes(req.user.email.toLowerCase());
  res.json({ allowed });
});

app.get('/api/properties', requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const supabase = getUserClient(req.token);
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('received_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/properties/:id/sold', requireAuth, async (req, res) => {
  const supabase = getUserClient(req.token);
  const { error } = await supabase
    .from('properties')
    .update({ status: '成約済み' })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/properties/:id/unsold', requireAuth, async (req, res) => {
  const supabase = getUserClient(req.token);
  const { error } = await supabase
    .from('properties')
    .update({ status: '販売中' })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/properties/:id/favorite', requireAuth, async (req, res) => {
  const supabase = getUserClient(req.token);
  const { data } = await supabase
    .from('properties')
    .select('favorite')
    .eq('id', req.params.id)
    .single();
  const { error } = await supabase
    .from('properties')
    .update({ favorite: !data.favorite })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

const fetchMailsLastRun = {};
app.post('/api/fetch-mails', requireAuth, async (req, res) => {
  const now = Date.now();
  const last = fetchMailsLastRun[req.user.id] || 0;
  if (now - last < 5 * 60 * 1000) {
    return res.status(429).json({ error: '5分以内に再度実行できません' });
  }
  fetchMailsLastRun[req.user.id] = now;

  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('gmail_user, gmail_pass')
    .eq('user_id', req.user.id)
    .single();
  if (!settings?.gmail_user || !settings?.gmail_pass) {
    return res.status(400).json({ error: 'Gmail設定が未登録です。設定画面からGmailを接続してください。' });
  }
  const { execFile } = require('child_process');
  const env = {
    ...process.env,
    MAIL_USER_ID: req.user.id,
    GMAIL_USER: settings.gmail_user,
    GMAIL_PASS: decrypt(settings.gmail_pass)
  };
  execFile('node', ['mail.js'], { env }, (error, stdout) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, log: stdout });
  });
});

app.get('/api/settings', requireAuth, async (req, res) => {
  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('gmail_user')
    .eq('user_id', req.user.id)
    .single();
  res.json(data || {});
});

app.post('/api/settings', requireAuth, async (req, res) => {
  const { gmail_user, gmail_pass } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!gmail_user || !emailRegex.test(gmail_user)) {
    return res.status(400).json({ error: '有効なメールアドレスを入力してください' });
  }
  if (!gmail_pass || gmail_pass.replace(/\s/g, '').length < 16) {
    return res.status(400).json({ error: 'アプリパスワードは16文字以上必要です' });
  }
  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: req.user.id, gmail_user, gmail_pass: encrypt(gmail_pass) }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

const contactLastRun = {};
app.post('/api/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: '全ての項目を入力してください' });
  }
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
  }
  const now = Date.now();
  if (contactLastRun[email] && now - contactLastRun[email] < 60 * 1000) {
    return res.status(429).json({ error: '送信間隔が短すぎます。しばらく待ってから再送してください。' });
  }
  contactLastRun[email] = now;
  try {
    await contactTransporter.sendMail({
      from: '"沖縄不動産まとめ" <okinawa.realestate.notify@gmail.com>',
      to: 'okinawa.realestate.notify@gmail.com',
      subject: `[お問い合わせ] ${subject}`,
      text: `お名前: ${name}\nメール: ${email}\n件名: ${subject}\n\n${message}`
    });
    await contactTransporter.sendMail({
      from: '"沖縄不動産まとめ" <okinawa.realestate.notify@gmail.com>',
      to: email,
      subject: '【自動返信】お問い合わせを受け付けました',
      text: `${name} 様\n\nお問い合わせいただきありがとうございます。\n内容を確認後、ご返信いたします。\n\n---\n件名: ${subject}\n\n${message}\n---\n\n沖縄不動産まとめ`
    });
    res.json({ success: true });
  } catch (err) {
    console.error('お問い合わせメール送信エラー:', err);
    res.status(500).json({ error: 'メールの送信に失敗しました' });
  }
});

cron.schedule('0 16 * * *', async () => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const { error } = await supabaseAdmin
    .from('properties')
    .delete()
    .lt('received_at', oneMonthAgo.toISOString());
  if (error) {
    console.error('自動削除エラー:', error);
  } else {
    console.log('1ヶ月以上古いデータを削除しました');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`サーバー起動中: port ${PORT}`);
});

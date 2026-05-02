const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const cron = require('node-cron');

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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.static('public'));

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

app.post('/api/fetch-mails', requireAuth, async (req, res) => {
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
    GMAIL_PASS: settings.gmail_pass
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
  const { error } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: req.user.id, gmail_user, gmail_pass }, { onConflict: 'user_id' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
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

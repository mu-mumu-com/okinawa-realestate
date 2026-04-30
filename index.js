const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const cron = require('node-cron');
const app = express();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());
app.use(express.static('public'));

app.get('/api/properties', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('received_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/properties/:id/sold', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('properties')
    .update({ status: '成約済み' })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/fetch-mails', async (req, res) => {
  const { execFile } = require('child_process');
  execFile('node', ['mail.js'], (error, stdout, stderr) => {
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, log: stdout });
  });
});

app.post('/api/properties/:id/unsold', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('properties')
    .update({ status: '販売中' })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.post('/api/properties/:id/favorite', async (req, res) => {
  const { id } = req.params;
  const { data } = await supabase
    .from('properties')
    .select('favorite')
    .eq('id', id)
    .single();
  const { error } = await supabase
    .from('properties')
    .update({ favorite: !data.favorite })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

cron.schedule('0 16 * * *', async () => {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const { error } = await supabase
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

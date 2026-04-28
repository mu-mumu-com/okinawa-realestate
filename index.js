const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

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

// 物件一覧取得
app.get('/api/properties', async (req, res) => {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('received_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json(data);
});

// 成約済みに変更
app.post('/api/properties/:id/sold', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('properties')
    .update({ status: '成約済み' })
    .eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ success: true });
});

// メール取得トリガー
app.post('/api/fetch-mails', async (req, res) => {
  const { execFile } = require('child_process');
  execFile('node', ['mail.js'], (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, log: stdout });
  });
});

app.listen(3000, () => {
  console.log('サーバー起動中: http://localhost:3000');
});
// 販売中に戻す
app.post('/api/properties/:id/unsold', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase
    .from('properties')
    .update({ status: '販売中' })
    .eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// お気に入りトグル
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
const express = require('express');
const RSSParser = require('rss-parser');

const app = express();
const parser = new RSSParser();

app.use(express.static('public'));

const RSS_FEEDS = [
  {
    name: 'SUUMO',
    url: 'https://suumo.jp/jj/bukken/rss/jj_bukken_rss.do?ra=64'
  }
];

app.get('/api/properties', async (req, res) => {
  try {
    const results = [];
    for (const feed of RSS_FEEDS) {
      const parsed = await parser.parseURL(feed.url);
      parsed.items.forEach(item => {
        results.push({
          title: item.title,
          link: item.link,
          date: item.pubDate,
          site: feed.name
        });
      });
    }
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '取得失敗' });
  }
});

app.listen(3000, () => {
  console.log('サーバー起動中: http://localhost:3000');
});
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ChannelType } = require('discord.js');
const { loadJSON, saveJSON } = require('./modules/fileStorage');
const { summarizeNews } = require('./modules/aiService');
const { getTKUCRate, getOrderBook } = require('./modules/economyService');
const { FILES } = require('./config/constants');

const newsConfigFile = path.join(__dirname, 'newsconfig.json');

/**
 * Webサーバーを起動する関数
 * @param {Client} client - Discordクライアント
 */
function startWebServer(client) {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // CORS設定
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'web')));

  // APIエンドポイント
  app.get('/api/guilds', (req, res) => {
    const guilds = client.guilds.cache.map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon
    }));
    res.json(guilds);
  });

  app.get('/api/channels/:guildId', (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: 'Guild not found' });

    const channels = guild.channels.cache
      .filter(channel => channel.type === ChannelType.GuildText)
      .map(channel => ({
        id: channel.id,
        name: channel.name
      }));
    res.json(channels);
  });

  app.get('/api/config/:guildId', (req, res) => {
    const config = loadJSON(newsConfigFile);
    const guildConfig = config[req.params.guildId] || { channelId: '', news: [] };
    res.json(guildConfig);
  });

  app.post('/api/config/:guildId', (req, res) => {
    const config = loadJSON(newsConfigFile);
    config[req.params.guildId] = req.body;
    saveJSON(newsConfigFile, config);
    res.json({ success: true });
  });

  // CDNアップロードエンドポイント
  const storage = multer.memoryStorage();
  const upload = multer({ storage: storage });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
      const uploadPath = req.query.path || '';
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      // アップロードディレクトリを作成
      const uploadDir = path.join(__dirname, 'uploads', uploadPath);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // ファイルを保存
      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, fileBuffer);

      console.log(`File uploaded: ${filePath}`);
      res.json({ success: true, fileName: fileName, path: uploadPath });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // AI要約エンドポイント (Perplexity)
  app.post('/api/summarize', async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: 'Content is required' });

      const summary = await summarizeNews(content);
      res.json({ summary });
    } catch (error) {
      console.error('Perplexity summarization error:', error);
      res.status(500).json({ error: 'Summarization failed' });
    }
  });

  // TKUCレートチャートAPI
  app.get('/api/current-rate', (req, res) => {
    try {
      const currentRate = getTKUCRate();
      res.json({
        success: true,
        rate: currentRate,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Current rate API error:', error);
      res.status(500).json({ success: false, error: 'Failed to get current rate' });
    }
  });

  app.get('/api/rate-history', (req, res) => {
    try {
      const points = parseInt(req.query.points) || 50;
      const rateData = loadJSON(FILES.TKUC_RATE);
      const history = rateData.history || [];

      // 最新points件を取得
      const recentHistory = history.slice(-points);

      res.json({
        success: true,
        history: recentHistory,
        currentRate: rateData.currentRate || 500
      });
    } catch (error) {
      console.error('Rate history API error:', error);
      res.status(500).json({ success: false, error: 'Failed to get rate history' });
    }
  });


  app.listen(PORT, () => {
    console.log(`Web panel running at http://localhost:${PORT}`);
  });
}

module.exports = { startWebServer };

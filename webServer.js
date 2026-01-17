const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ChannelType } = require('discord.js');
const { loadJSON, saveJSON } = require('./modules/fileStorage');
const { summarizeNews } = require('./modules/aiService');
const {
  getTKUCRate,
  getUserBalance,
  saveUserBalance,
  buyTKUC,
  recordTransaction
} = require('./modules/economyService');
const { resolveToken } = require('./modules/tokenService');
const { FILES } = require('./constants');

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

  // ユーティリティ -------------------------------------------------------

  const getUserDisplay = async (guild, userId) => {
    try {
      const member = await guild.members.fetch(userId);
      return {
        username: member.user.username,
        globalName: member.user.globalName || member.user.username,
        displayName: member.displayName
      };
    } catch {
      return { username: userId, globalName: userId, displayName: userId };
    }
  };

  const sendTradeNotification = async ({ guildId, userId, type, amount, tkupDiff, rate }) => {
    try {
      const botConfig = loadJSON(FILES.BOT_CHANNEL_CONFIG);
      const guildConfig = botConfig[guildId];
      if (!guildConfig || !guildConfig.botSpeakChannelId) return;

      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const channel = await client.channels.fetch(guildConfig.botSpeakChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const userInfo = await getUserDisplay(guild, userId);

      const embed = {
        title: type === 'buy' ? '🛒 TKUC購入通知' : '💱 TKUC売却通知',
        color: type === 'buy' ? 0x10B981 : 0xEF4444,
        fields: [
          { name: 'ユーザー', value: `<@${userId}> (${userInfo.displayName})`, inline: true },
          { name: '取引種別', value: type === 'buy' ? '購入 (Web)' : '売却 (Web)', inline: true },
          { name: '数量', value: `${amount.toFixed(2)} TKUC`, inline: true },
          { name: 'レート', value: `${rate} TKUP`, inline: true },
          { name: 'TKUP変動', value: `${tkupDiff >= 0 ? '+' : ''}${tkupDiff.toFixed(2)} TKUP`, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'TKUC Webパネル取引通知' }
      };

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Failed to send trade notification:', error);
    }
  };

  // 既存API --------------------------------------------------------------
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

  // CDNアップロード
  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
      const uploadPath = req.query.path || '';
      const fileName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      const uploadDir = path.join(__dirname, 'uploads', uploadPath);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      fs.writeFileSync(filePath, fileBuffer);

      console.log(`File uploaded: ${filePath}`);
      res.json({ success: true, fileName, path: uploadPath });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // AI要約
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

  // TKUCレートAPI
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
      const points = parseInt(req.query.points, 10) || 50;
      const rateData = loadJSON(FILES.TKUC_RATE);
      const history = rateData.history || [];
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

  // トークンAPI ----------------------------------------------------------
  app.post('/api/token-login', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ success: false, error: 'トークンを指定してください。' });
      }

      const resolved = resolveToken(token);
      if (!resolved) {
        return res.status(401).json({ success: false, error: 'トークンが無効です。' });
      }

      const { guildId, userId, tokenData } = resolved;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ success: false, error: 'ギルドが見つかりません。' });
      }

      const userInfo = await getUserDisplay(guild, userId);
      const balance = getUserBalance(userId);
      const rate = getTKUCRate();

      res.json({
        success: true,
        guild: { id: guildId, name: guild.name },
        user: { id: userId, ...userInfo },
        tokenIssuedAt: tokenData.createdAt,
        balance,
        rate,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('token-login error:', error);
      res.status(500).json({ success: false, error: 'ログイン処理に失敗しました。' });
    }
  });

  app.get('/api/token-balance', (req, res) => {
    try {
      const token = req.query.token;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ success: false, error: 'トークンを指定してください。' });
      }

      const resolved = resolveToken(token);
      if (!resolved) {
        return res.status(401).json({ success: false, error: 'トークンが無効です。' });
      }

      const { userId } = resolved;
      const balance = getUserBalance(userId);
      const rate = getTKUCRate();

      res.json({
        success: true,
        balance,
        rate,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('token-balance error:', error);
      res.status(500).json({ success: false, error: '残高取得に失敗しました。' });
    }
  });

  app.post('/api/token-order', async (req, res) => {
    try {
      const { token, type, amount } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ success: false, error: 'トークンを指定してください。' });
      }
      if (!['buy', 'sell'].includes(type)) {
        return res.status(400).json({ success: false, error: '取引タイプが不正です。' });
      }
      const numericAmount = Number(amount);
      if (!numericAmount || numericAmount <= 0) {
        return res.status(400).json({ success: false, error: '数量が不正です。' });
      }

      const resolved = resolveToken(token);
      if (!resolved) {
        return res.status(401).json({ success: false, error: 'トークンが無効です。' });
      }

      const { guildId, userId } = resolved;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return res.status(404).json({ success: false, error: 'ギルドが見つかりません。' });
      }

      let responseMessage;
      let tkupDiff = 0;
      const roundedAmount = Math.round(numericAmount * 100) / 100;

      if (type === 'buy') {
        const result = buyTKUC(userId, roundedAmount);
        if (!result.success) {
          return res.status(400).json({ success: false, error: result.message });
        }
        responseMessage = result.message;
        tkupDiff = -result.tkupSpent;
      } else {
        const balance = getUserBalance(userId);
        const currentRate = getTKUCRate();

        if (balance.tkuc < roundedAmount) {
          return res.status(400).json({ success: false, error: 'TKUC残高が不足しています。' });
        }

        const gross = roundedAmount * currentRate;
        const fee = Math.round(gross * 0.02 * 100) / 100;
        const tkupReceived = Math.round((gross - fee) * 100) / 100;

        balance.tkuc = Math.round((balance.tkuc - roundedAmount) * 100) / 100;
        balance.tkup = Math.round((balance.tkup + tkupReceived) * 100) / 100;
        saveUserBalance(userId, balance);

        recordTransaction(userId, 'sell', {
          tkucAmount: roundedAmount,
          tkupReceived,
          fee,
          rate: currentRate
        });

        responseMessage = `${roundedAmount} TKUCを売却しました。（受取 ${tkupReceived} TKUP, 手数料 ${fee} TKUP）`;
        tkupDiff = tkupReceived;
      }

      const updatedBalance = getUserBalance(userId);
      const rate = getTKUCRate();

      sendTradeNotification({
        guildId,
        userId,
        type,
        amount: roundedAmount,
        tkupDiff,
        rate
      });

      res.json({
        success: true,
        message: responseMessage,
        balance: updatedBalance,
        rate,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('token-order error:', error);
      res.status(500).json({ success: false, error: '取引処理に失敗しました。' });
    }
  });

  // サーバー起動 ---------------------------------------------------------
  app.listen(PORT, () => {
    console.log(`Web panel running at http://localhost:${PORT}`);
  });
}

module.exports = { startWebServer };

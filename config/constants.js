const path = require('path');

// ファイルパス定数
const FILES = {
  PINS: path.join(__dirname, '../pins.json'),
  NEWS_CONFIG: path.join(__dirname, '../newsconfig.json'),
  MUSIC_SETTINGS: path.join(__dirname, '../musicsettings.json'),
  AI_CHANNEL: path.join(__dirname, '../aichannel.json'),
  AI_CHAT: path.join(__dirname, '../aichat.json'),
  AI_USER: path.join(__dirname, '../aiuser.json'),
  USER_BALANCES: path.join(__dirname, '../userBalances.json'),
  TKUC_RATE: path.join(__dirname, '../tkucRate.json'),
  TRANSACTION_HISTORY: path.join(__dirname, '../transactionHistory.json'),
  ORDER_BOOK: path.join(__dirname, '../orderBook.json'),
  AI_CONFIG: path.join(__dirname, '../aiConfig.json'),
  BOT_CHANNEL_CONFIG: path.join(__dirname, '../botChannelConfig.json'),
};

// AIレートリミット管理: userId -> [timestamp1, timestamp2, ...]
const aiRateLimit = new Map();

// Lavalink設定
const LAVALINK_CONFIG = {
  nodes: [{
    host: "100.85.129.32",
    port: 2333,
    secure: false,
    region: "jp",
    authorization: "momizipcA",
    retryDelay: 30000,
    heartBeatInterval: 45000
  }],
  playerOptions: {
    defaultSearchPlatform: "spotify",
    volume: 30,
    applyVolumeAsFilter: true,
    audioQuality: "high",
    rasamplingQuality: "high"
  }
};

// Discordインテント
const DISCORD_INTENTS = [
  'Guilds',
  'GuildMessages',
  'MessageContent',
  'GuildVoiceStates',
];

// 管理者専用コマンド
const ADMIN_COMMANDS = ['news_now', 'news_fetch', 'news_timeset', 'ai-channel', 'ai-control', 'ai-stop', 'ai-start', 'ai-change', 'ai-provider'];

module.exports = {
  FILES,
  aiRateLimit,
  LAVALINK_CONFIG,
  DISCORD_INTENTS,
  ADMIN_COMMANDS,
};

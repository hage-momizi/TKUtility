// 定数定義ファイル

// ファイルパス定義
const FILES = {
  AI_CHANNEL: 'aichannel.json',
  AI_CHAT: 'aichat.json',
  AI_USER: 'aiuser.json',
  AI_CONFIG: 'aiConfig.json',
  NEWS_CONFIG: 'newsconfig.json',
  TKUC_RATE: 'tkucrate.json',
  TKUC_TRANSACTIONS: 'tkuctransactions.json',
  PINS: 'pins.json',
  EARTHQUAKE_CONFIG: 'earthquake.json',
  BOT_CHANNEL_CONFIG: 'botchannel.json',
  USER_BALANCES: 'userbalances.json',
  TRANSACTION_HISTORY: 'transactionhistory.json',
  ORDER_BOOK: 'orderbook.json',
  PRIVATE_TOKENS: 'privatetokens.json'
};

// Lavalink設定
const LAVALINK_CONFIG = {
  nodes: [
    {
      id: 'Node-1',
      host: 'localhost',
      port: 2333,
      authorization: 'momizipcA',
      secure: false,
      name: 'Node-1'
    }
  ],
  sendToShard: (guildId, payload) => {
    const client = global.client;
    if (client) {
      client.guilds.cache.get(guildId)?.shard.send(payload);
    }
  },
  client: {
    id: null, // 実行時に設定される
    username: null // 実行時に設定される
  }
};

// Discordインテント
const DISCORD_INTENTS = [
  'Guilds',
  'GuildMessages',
  'MessageContent',
  'GuildVoiceStates'
];

// AIレートリミット管理
const aiRateLimit = new Map();

// 管理者専用コマンド
const ADMIN_COMMANDS = [
  'tk-bot-run',
  'tk-bot-channel-set',
  'news_timeset'
];

module.exports = {
  FILES,
  LAVALINK_CONFIG,
  DISCORD_INTENTS,
  aiRateLimit,
  ADMIN_COMMANDS
};

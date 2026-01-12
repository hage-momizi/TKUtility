const { Client, DefaultWebSocketManagerOptions, GatewayIntentBits, Events } = require('discord.js');
const { initializeBot } = require('./initializers/initializeBot');
const { handleAIChat, handlePinUpdate, handleInteraction } = require('./handlers/messageHandler');
const { DISCORD_INTENTS } = require('./config/constants');

// Discord WebSocket設定
DefaultWebSocketManagerOptions.identifyProperties.browser = 'Discord iOS';

// 環境変数読み込み
require('dotenv').config();

// Discordクライアント作成
const client = new Client({
  intents: DISCORD_INTENTS.map(intent => GatewayIntentBits[intent]),
});

// ボット準備完了イベント
client.once(Events.ClientReady, () => initializeBot(client));

// インタラクションイベント（スラッシュコマンド）
client.on(Events.InteractionCreate, (interaction) => handleInteraction(interaction, client));

// メッセージイベント（ピン止め更新とAIチャット）
client.on(Events.MessageCreate, async (message) => {
  await handlePinUpdate(message);
  await handleAIChat(message);
});

// ボットをログイン
client.login(process.env.DISCORD_TOKEN);

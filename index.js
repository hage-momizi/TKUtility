// 環境変数読み込み
require('dotenv').config();

const { Client, DefaultWebSocketManagerOptions, GatewayIntentBits, Events } = require('discord.js');
const { initializeBot } = require('./initializers/initializeBot');
const { handleAIChat, handlePinUpdate, handleInteraction, handleTKUPGain, handleRevolutionFailure } = require('./handlers/messageHandler');
const { DISCORD_INTENTS } = require('./config/constants');

// Discord WebSocket設定
DefaultWebSocketManagerOptions.identifyProperties.browser = 'Discord iOS';

// Discordクライアント作成
const client = new Client({
  intents: DISCORD_INTENTS.map(intent => GatewayIntentBits[intent]),
});

// ボット準備完了イベント
client.once(Events.ClientReady, () => initializeBot(client));

// インタラクションイベント（スラッシュコマンド）
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    console.log(`[Command] ${interaction.commandName} by ${interaction.user.username}`);
    await handleInteraction(interaction, client);
  } catch (error) {
    console.error(`[Error] Command: ${interaction.commandName}`, error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'コマンド実行中にエラーが発生しました。',
        ephemeral: true
      }).catch(e => console.error('Reply error:', e));
    }
  }
});

// メッセージイベント（ピン止め更新、TKUP獲得、AIチャット、革命失敗監視）
client.on(Events.MessageCreate, async (message) => {
  await handlePinUpdate(message);
  await handleTKUPGain(message);
  await handleAIChat(message);
  await handleRevolutionFailure(message);
});

// ボットをログイン
client.login(process.env.DISCORD_TOKEN);

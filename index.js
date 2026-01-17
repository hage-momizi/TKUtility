// 環境変数読み込み
require('dotenv').config();

const { Client, DefaultWebSocketManagerOptions, GatewayIntentBits, Events } = require('discord.js');
const { initializeBot } = require('./initializers/initializeBot');
const { handleAIChat, handlePinUpdate, handleInteraction, handleTKUPGain, handleRevolutionFailure, handleYomiageMessage } = require('./handlers/messageHandler');
const { DISCORD_INTENTS } = require('./constants');

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

// メッセージイベント（ピン止め更新、TKUP獲得、AIチャット、革命失敗監視、読み上げ）
client.on(Events.MessageCreate, async (message) => {
  await handlePinUpdate(message);
  await handleTKUPGain(message);
  await handleAIChat(message);
  await handleRevolutionFailure(message);
  await handleYomiageMessage(message);
});

// ボイスステート更新イベント（読み上げボットの参加/退出通知）
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const { getActiveConnections, playText, loadUserSettings } = require('./modules/yomiageService');
  const activeConnections = getActiveConnections();

  console.log(`voiceStateUpdate: member ${oldState.member.user.username}, oldCh ${oldState.channelId}, newCh ${newState.channelId}`);

  // 1. Botの接続状態を確認
  const active = activeConnections[oldState.guild.id];
  if (!active) {
    console.log('no activeConnections for guild', oldState.guild.id);
    return;
  }

  const botVoiceChannelId = active.voiceChannelId; // Botが接続しているボイスチャンネルID
  const player = active.player;

  // 2. Bot自身の状態変化
  if (oldState.member.id === client.user.id) {
    // Botが切断された場合に接続情報を削除
    if (oldState.channelId && !newState.channelId) {
      const { leaveVoiceChannelForYomiage } = require('./modules/yomiageService');
      leaveVoiceChannelForYomiage(oldState.guild.id);
    }
    return;
  }

  // 3. 他のユーザーの参加/退出を判定

  // ユーザーがBot接続チャンネルに参加 (新規参加)
  if (!oldState.channelId && newState.channelId === botVoiceChannelId) {
    const userSettings = loadUserSettings();
    const speakerId = userSettings[newState.member.id]?.speaker || 0;
    const text = `${newState.member.displayName}さんが参加しました`;
    playText(text, speakerId, player, newState.guild.id);
  }
  // ユーザーがBot接続チャンネルから退出
  else if (oldState.channelId === botVoiceChannelId && !newState.channelId) {
    const userSettings = loadUserSettings();
    const speakerId = userSettings[oldState.member.id]?.speaker || 0;
    const text = `${oldState.member.displayName}さんが退出しました`;
    playText(text, speakerId, player, oldState.guild.id);
  }
  // チャンネル間移動 (Botが接続しているチャンネルに入ってきた場合)
  else if (oldState.channelId !== botVoiceChannelId && oldState.channelId !== null && newState.channelId === botVoiceChannelId) {
    const userSettings = loadUserSettings();
    const speakerId = userSettings[newState.member.id]?.speaker || 0;
    const text = `${newState.member.displayName}さんが移動してきました`;
    playText(text, speakerId, player, newState.guild.id);
  }
  // チャンネル間移動 (Botが接続しているチャンネルから出て行った場合)
  else if (oldState.channelId === botVoiceChannelId && newState.channelId !== botVoiceChannelId && newState.channelId !== null) {
    const userSettings = loadUserSettings();
    const speakerId = userSettings[oldState.member.id]?.speaker || 0;
    const text = `${oldState.member.displayName}さんが移動しました`;
    playText(text, speakerId, player, oldState.guild.id);
  }
});

// ボットをログイン
client.login(process.env.DISCORD_TOKEN);

const { EmbedBuilder } = require('discord.js');
const { FILES, aiRateLimit, ADMIN_COMMANDS } = require('../config/constants');
const { loadJSON, saveJSON } = require('../modules/fileStorage');
const { streamAIResponse, extractUserInfoFromChat } = require('../modules/aiService');
const { calculateTKUPGain, earnTKUP } = require('../modules/economyService');

// コマンドのインポート（自動化のため、execute時に動的に読み込み）
const commandModules = {};

// コマンドハンドラーマップ
const commandHandlers = {
  ping: () => require('../commands/ping'),
  'ping-host': () => require('../commands/ping-host'),
  pin: () => require('../commands/pin'),
  'pin-up': () => require('../commands/pin-up'),
  nslookup: () => require('../commands/nslookup'),
  iplookup: () => require('../commands/iplookup'),
  portcheck: () => require('../commands/portchecker'),
  news_now: () => require('../commands/news_now'),
  news_fetch: () => require('../commands/news_fetch'),
  news_timeset: () => require('../commands/news_timeset'),
  play: () => require('../commands/play'),
  'play-lofi': () => require('../commands/play-lofi'),
  skip: () => require('../commands/skip'),
  playlist: () => require('../commands/playlist'),
  stop: () => require('../commands/stop'),
  volume: () => require('../commands/volume'),
  'earthquake-latest': () => require('../commands/earthquake-latest'),
  'earthquake-set-eew': () => require('../commands/earthquake-set-eew'),
  'earthquake-history': () => require('../commands/earthquake-history'),
  'earthquake-watch': () => require('../commands/earthquake-watch'),
  'earthquake-settings': () => require('../commands/earthquake-settings'),
  'earthquake-vc': () => require('../commands/earthquake-vc'),
  'earthquake-vc-stop': () => require('../commands/earthquake-vc-stop'),
  'earthquake-vc-history': () => require('../commands/earthquake-vc-history'),
  'law-search': () => require('../commands/law-search'),
  'ai-channel': () => require('../commands/ai-channel'),
  'ai-control': () => require('../commands/ai-control'),
  'ai-stop': () => require('../commands/ai-stop'),
  'ai-start': () => require('../commands/ai-start'),
  'ai-change': () => require('../commands/ai-change'),
  'ai-provider': () => require('../commands/ai-provider'),
  'ai-user-clear': () => require('../commands/ai-user-clear'),
  'tk-balance': () => require('../commands/tk-balance'),
  'tk-buy': () => require('../commands/tk-buy'),
  'tk-send-tkup': () => require('../commands/tk-send-tkup'),
  'tk-send-tkuc': () => require('../commands/tk-send-tkuc'),
  'tk-withdraw': () => require('../commands/tk-withdraw'),
  'tk-market': () => require('../commands/tk-market'),
  'tk-gamble': () => require('../commands/tk-gamble'),
  'tk-leaderboard': () => require('../commands/tk-leaderboard'),
  'tk-settings': () => require('../commands/tk-settings'),
  'tk-buy-order': () => require('../commands/tk-buy-order'),
  'tk-sell-order': () => require('../commands/tk-sell-order'),
  'tk-orders': () => require('../commands/tk-orders'),
  'tk-cancel-order': () => require('../commands/tk-cancel-order'),
  'tk-kajino': () => require('../commands/tk-kajino')
};

/**
 * 会話の開始者を特定する
 * @param {Message} message - Discordメッセージ
 * @returns {string} 開始者のユーザーID
 */
async function getConversationStarter(message) {
  let current = message;
  while (current.reference) {
    try {
      current = await current.channel.messages.fetch(current.reference.messageId);
    } catch {
      break;
    }
  }
  return current.author.id;
}



/**
 * AIレートリミットチェック
 * @param {string} userId - ユーザーID
 * @returns {boolean} レートリミット内か
 */
function checkAIRateLimit(userId) {
  const now = Date.now();
  const oneMinute = 60 * 1000;
  const timestamps = aiRateLimit.get(userId) || [];

  // 1分以上前のタイムスタンプを削除
  const recentTimestamps = timestamps.filter(ts => now - ts < oneMinute);

  // 10回以上なら拒否
  if (recentTimestamps.length >= 10) {
    return false;
  }

  // 新しいタイムスタンプを追加
  recentTimestamps.push(now);
  aiRateLimit.set(userId, recentTimestamps);
  return true;
}

/**
 * AIチャット処理
 * @param {Message} message - Discordメッセージ
 */
async function handleAIChat(message) {
  if (message.author.bot) return;

  const config = loadJSON(FILES.AI_CHANNEL);
  const guildConfig = config[message.guild.id];
  if (!guildConfig || !guildConfig.channelId || guildConfig.channelId !== message.channel.id || !guildConfig.enabled) {
    return;
  }

  // 返信がある場合は会話の開始者をチェック（同じユーザーである場合のみ応答）
  if (message.reference) {
    const starterId = await getConversationStarter(message);
    if (starterId !== message.author.id) return;
  }

  // レートリミットチェック
  if (!checkAIRateLimit(message.author.id)) {
    await message.reply({ content: 'AIの使用回数が制限を超えています。1分後に再度お試しください。', ephemeral: true });
    return;
  }

  try {
    // 会話履歴を取得（返信の場合のみ継続）
    const chatData = loadJSON(FILES.AI_CHAT);
    const userKey = `${message.guild.id}-${message.author.id}`;
    let conversationHistory = [];

    if (message.reference) {
      // 返信の場合は会話履歴を継続
      conversationHistory = chatData[userKey] || [];
    } else {
      // 新しい会話の場合は履歴をクリア
      chatData[userKey] = [];
      saveJSON(FILES.AI_CHAT, chatData);
    }

    // 初期メッセージ送信
    const responseMessage = await message.reply('<a:telegramthink:1459933307725676658> 考え中...');

    // ユーザー情報を取得
    const userData = loadJSON(FILES.AI_USER);
    const guildUserKey = `${message.guild.id}.${message.author.id}`;
    let userInfo = userData[guildUserKey] || {};

    // ユーザー情報が不足している場合は取得
    if (!userInfo.username || !userInfo.nickname || !userInfo.guildNickname) {
      userInfo.username = message.author.username;
      userInfo.nickname = message.author.displayName;
      userInfo.guildNickname = message.member?.displayName || message.author.displayName;
      userData[guildUserKey] = userInfo;
      saveJSON(FILES.AI_USER, userData);
    }

    // ユーザー情報を含むコントロールメッセージを作成
    let enhancedControl = guildConfig.control || '';
    enhancedControl += `\n\nユーザー情報:\n- ユーザー名: ${userInfo.username}\n- ニックネーム: ${userInfo.nickname}\n- サーバー内ニックネーム: ${userInfo.guildNickname}`;
    if (userInfo.skills) {
      enhancedControl += `\n- 特技: ${userInfo.skills}`;
    }
    if (userInfo.personality) {
      enhancedControl += `\n- 性格: ${userInfo.personality}`;
    }

    let fullResponse = '';
    let lastEditTime = Date.now();
    const generator = streamAIResponse(message.content, enhancedControl, guildConfig.provider || 'openrouter', conversationHistory);

    for await (const chunk of generator) {
      fullResponse += chunk;
      // リアルタイム更新（200msごとに更新してレートリミットを回避）
      const now = Date.now();
      if (now - lastEditTime > 200) {
        await responseMessage.edit(`<a:reimuhakurei:1459951142506070178>${fullResponse}<a:loading:1459949561173901456>`);
        lastEditTime = now;
      }
    }

    // 最終更新（アニメーション除去）
    await responseMessage.edit(fullResponse);

    // 会話履歴を更新
    conversationHistory.push({ role: 'user', content: message.content });
    conversationHistory.push({ role: 'assistant', content: fullResponse });

    // 最新20件のみ保持
    if (conversationHistory.length > 40) { // user + assistant = 2 per turn, 20 turns = 40
      conversationHistory.splice(0, conversationHistory.length - 40);
    }

    chatData[userKey] = conversationHistory;
    saveJSON(FILES.AI_CHAT, chatData);

    // チャットからユーザー情報を抽出（非同期で実行）
    extractUserInfoFromChat(message.guild.id, message.author.id, conversationHistory).catch(err => {
      console.error('User info extraction error:', err);
    });
  } catch (error) {
    console.error('AI chat error:', error);
    await message.reply('申し訳ありませんが、エラーが発生しました。');
  }
}

/**
 * TKUP獲得処理
 * @param {Message} message - Discordメッセージ
 */
async function handleTKUPGain(message) {
  if (message.author.bot) return;

  // VC参加は対象外
  if (message.member?.voice?.channel) return;

  // 画像チェック
  const hasImage = message.attachments.some(att => att.contentType?.startsWith('image/'));

  // TKUP獲得計算
  const gain = calculateTKUPGain(message.content, hasImage);
  if (gain > 0) {
    earnTKUP(message.author.id, gain);
    console.log(`TKUP獲得: ${message.author.username} (+${gain} TKUP)`);
  }
}

/**
 * 革命失敗監視処理
 * @param {Message} message - Discordメッセージ
 */
async function handleRevolutionFailure(message) {
  // 特定のボットIDを監視
  const targetBotId = '1444221679176781915';

  if (message.author.id !== targetBotId) return;

  // embedに「革命失敗」が含まれているかチェック
  if (message.embeds && message.embeds.length > 0) {
    const hasRevolutionFailure = message.embeds.some(embed => {
      const title = embed.title || '';
      const description = embed.description || '';
      const fields = embed.fields || [];

      // タイトル、説明、フィールドに「革命失敗」が含まれるかチェック
      return title.includes('革命失敗') ||
             description.includes('革命失敗') ||
             fields.some(field => field.name?.includes('革命失敗') || field.value?.includes('革命失敗'));
    });

    if (hasRevolutionFailure) {
      console.log('🚨 革命失敗検知！レート暴落イベント発動');

      // レート暴落処理
      await triggerRateCrash();

      // 通知メッセージ
      try {
        await message.channel.send({
          embeds: [{
            title: '🚨 革命失敗イベント発生！',
            description: '外部ボットからの革命失敗信号を検知しました。\nTKUCレートが暴落します！',
            color: 0xdc3545,
            fields: [
              { name: '📉 影響', value: 'レートが大幅に下落', inline: true },
              { name: '⏰ 期間', value: '即時反映', inline: true },
              { name: '🎯 原因', value: '革命失敗イベント', inline: true }
            ],
            timestamp: new Date()
          }]
        });
      } catch (error) {
        console.error('革命失敗通知エラー:', error);
      }
    }
  }
}

/**
 * レート暴落処理
 */
async function triggerRateCrash() {
  try {
    const { loadJSON, saveJSON } = require('./fileStorage');
    const { FILES } = require('../config/constants');

    const rateData = loadJSON(FILES.TKUC_RATE);
    const currentRate = rateData.currentRate || 500;

    // 暴落率：-30%～-50%
    const crashPercent = -(30 + Math.random() * 20); // -30% to -50%
    const newRate = Math.max(100, currentRate * (1 + crashPercent / 100)); // 最低100 TKUP

    console.log(`💥 レート暴落: ${currentRate} → ${newRate.toFixed(2)} TKUP (${crashPercent.toFixed(1)}%)`);

    // レート更新
    rateData.currentRate = Math.round(newRate * 100) / 100;
    rateData.lastUpdate = Date.now();
    rateData.history = rateData.history || [];
    rateData.history.push({
      timestamp: Date.now(),
      rate: rateData.currentRate,
      event: 'revolution_failure'
    });

    // 履歴を最新50件に制限
    if (rateData.history.length > 50) {
      rateData.history = rateData.history.slice(-50);
    }

    saveJSON(FILES.TKUC_RATE, rateData);

    // 暴落イベント記録
    recordCrashEvent(crashPercent, currentRate, rateData.currentRate);

  } catch (error) {
    console.error('レート暴落処理エラー:', error);
  }
}

/**
 * 暴落イベント記録
 * @param {number} crashPercent - 暴落率
 * @param {number} beforeRate - 暴落前レート
 * @param {number} afterRate - 暴落後レート
 */
function recordCrashEvent(crashPercent, beforeRate, afterRate) {
  const { recordTransaction } = require('./economyService');

  // システムイベントとして記録
  recordTransaction('system', 'rate_crash', {
    crashPercent,
    beforeRate,
    afterRate,
    reason: 'revolution_failure'
  });

  console.log(`📊 暴落イベント記録: ${crashPercent.toFixed(1)}% (${beforeRate} → ${afterRate})`);
}

/**
 * ピン止めメッセージの更新処理
 * @param {Message} message - Discordメッセージ
 */
async function handlePinUpdate(message) {
  if (message.author.bot) return;

  const pins = loadJSON(FILES.PINS);

  // 同じチャンネルIDのピン止めを検索
  let pinnedForThisChannel = null;
  for (const [saveNumber, pinData] of Object.entries(pins)) {
    if (pinData && pinData.channelId === message.channel.id && pinData.url) {
      pinnedForThisChannel = { saveNumber, pinData };
      break;
    }
  }

  if (pinnedForThisChannel) {
    const { pinData } = pinnedForThisChannel;

    // 過去のピン止めメッセージを削除
    try {
      if (pinData.pinnedMessageId) {
        await message.channel.messages.delete(pinData.pinnedMessageId);
      }
    } catch (error) {
      // 削除失敗は無視
    }

    // 新しいピン止めメッセージを送信
    const urlMatch = pinData.url.match(/https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (urlMatch) {
      const [, , channelId, messageId] = urlMatch;
      try {
        const channel = await message.client.channels.fetch(channelId);
        const originalMessage = await channel.messages.fetch(messageId);

        const newMessage = await message.channel.send(originalMessage.content);
        pinData.pinnedMessageId = newMessage.id;
        saveJSON(FILES.PINS, pins);
      } catch (error) {
        console.error('Failed to send new pinned message:', error);
      }
    }
  }
}

/**
 * インタラクションイベント処理
 * @param {Interaction} interaction - Discordインタラクション
 * @param {Client} client - Discordクライアント
 */
async function handleInteraction(interaction, client) {
  if (interaction.isChatInputCommand()) {
    const commandName = interaction.commandName;
    const handler = commandHandlers[commandName];

    if (handler) {
      // 管理者コマンドの権限チェック
      if (ADMIN_COMMANDS.includes(commandName)) {
        if (!interaction.member.permissions.has('Administrator')) {
          await interaction.reply({ content: 'このコマンドは管理者専用です。', ephemeral: true });
          return;
        }
      }

      try {
        const module = handler();
        // volumeコマンドの場合は追加パラメータを渡す
        if (commandName === 'volume') {
          await module.execute(interaction, client, loadJSON, saveJSON);
        } else {
          await module.execute(interaction, client);
        }
      } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'コマンド実行中にエラーが発生しました。',
            ephemeral: true
          }).catch(e => console.error('Error replying:', e));
        }
      }
    } else {
      console.warn(`Command not found: ${commandName}`);
    }
  } else if (interaction.isButton()) {
    // ボタンクリック処理
    const customId = interaction.customId;

    if (customId.startsWith('kake_join_')) {
      const gameId = customId.replace('kake_join_', '');
      const { joinKakeGame } = require('../modules/casinoService');

      try {
        const result = joinKakeGame(interaction.user.id, gameId);

        const embed = new EmbedBuilder()
          .setTitle('🎲 掛け金ゲーム参加')
          .setColor(result.success ? 0x28a745 : 0xdc3545);

        if (result.success) {
          embed.setDescription(result.message);
        } else {
          embed.addFields({ name: 'エラー', value: result.message, inline: false });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });

      } catch (error) {
        console.error('Kake game join error:', error);
        await interaction.reply({
          content: 'ゲーム参加中にエラーが発生しました。',
          ephemeral: true
        });
      }
    } else if (customId.startsWith('bj_hit_') || customId.startsWith('bj_stand_')) {
      const sessionId = customId.replace(/^(bj_hit_|bj_stand_)/, '');
      const action = customId.startsWith('bj_hit_') ? 'hit' : 'stand';
      const { playBlackjackAction } = require('../modules/casinoService');

      try {
        const result = playBlackjackAction(sessionId, action);

        if (result.interactive) {
          // ゲーム継続
          const embed = new EmbedBuilder()
            .setTitle('🎰 カジノゲーム')
            .setDescription('🃏 ブラックジャック')
            .setColor(0xFFD700)
            .addFields({ name: '結果', value: result.message, inline: false });

          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setLabel('ヒット（追加カード）')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`bj_hit_${result.sessionId}`),
              new ButtonBuilder()
                .setLabel('スタンド（止める）')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId(`bj_stand_${result.sessionId}`)
            );

          await interaction.update({
            embeds: [embed],
            components: [row]
          });
        } else {
          // ゲーム終了
          const embed = new EmbedBuilder()
            .setTitle('🎰 カジノゲーム')
            .setDescription('🃏 ブラックジャック')
            .setColor(result.winnings > 0 ? 0x28a745 : result.winnings === 0 ? 0x6c757d : 0xdc3545)
            .addFields({ name: '結果', value: result.message, inline: false });

          await interaction.update({
            embeds: [embed],
            components: [] // ボタン削除
          });
        }

      } catch (error) {
        console.error('Blackjack action error:', error);
        await interaction.reply({
          content: 'ブラックジャック実行中にエラーが発生しました。',
          ephemeral: true
        });
      }
    }
  }
}

module.exports = {
  handleAIChat,
  handlePinUpdate,
  handleInteraction,
  handleTKUPGain,
  handleRevolutionFailure,
};

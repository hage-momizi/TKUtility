const { Client, DefaultWebSocketManagerOptions , GatewayIntentBits, EmbedBuilder, ActivityType, ChannelType, PermissionsBitField, REST, Routes, Events } = require('discord.js');
const path = require('path');
const { LavalinkManager } = require('lavalink-client');
const { loadJSON, saveJSON } = require('./modules/fileStorage');
const { summarizeNews, generateNewsTitle, generateFooterInfo, processNewsWithPerplexity, streamAIResponse } = require('./modules/aiService');
const { startWebServer } = require('./webServer');
const { fetchAndSaveNews, fetchRandomNews } = require('./modules/newsService');
const { startRealtimeMonitoring } = require('./modules/earthquakeService');

DefaultWebSocketManagerOptions.identifyProperties.browser = 'Discord iOS'; // or 'Discord Android'


// ボットのトークンを環境変数から取得（.envファイルから読み込む）
require('dotenv').config();

// コマンドのインポート
const pingCommand = require('./commands/ping');
const pingHostCommand = require('./commands/ping-host');
const pinCommand = require('./commands/pin');
const pinUpCommand = require('./commands/pin-up')
const nslookupCommand = require('./commands/nslookup');
const iplookupCommand = require('./commands/iplookup');
const portcheckerCommand = require('./commands/portchecker');
const newsNowCommand = require('./commands/news_now');
const newsFetchCommand = require('./commands/news_fetch');
const newsTimesetCommand = require('./commands/news_timeset');
const playCommand = require('./commands/play');
const playLofiCommand = require('./commands/play-lofi');
const skipCommand = require('./commands/skip');
const playlistCommand = require('./commands/playlist');
const stopCommand = require('./commands/stop');
const volumeCommand = require('./commands/volume');
const earthquakeLatestCommand = require('./commands/earthquake-latest');
const earthquakeSetEewCommand = require('./commands/earthquake-set-eew');
const earthquakeHistoryCommand = require('./commands/earthquake-history');
const earthquakeWatchCommand = require('./commands/earthquake-watch');
const earthquakeSettingsCommand = require('./commands/earthquake-settings');
const lawSearchCommand = require('./commands/law-search');
const aiChannelCommand = require('./commands/ai-channel');
const aiControlCommand = require('./commands/ai-control');
const aiStopCommand = require('./commands/ai-stop');
const aiStartCommand = require('./commands/ai-start');
const aiChangeCommand = require('./commands/ai-change');
const aiUserClearCommand = require('./commands/ai-user-clear');

const pinsFile = path.join(__dirname, 'pins.json');
const newsConfigFile = path.join(__dirname, 'newsconfig.json');
const musicSettingsFile = path.join(__dirname, 'musicsettings.json');
const aiChannelFile = path.join(__dirname, 'aichannel.json');
const aiChatFile = path.join(__dirname, 'aichat.json');
const aiUserFile = path.join(__dirname, 'aiuser.json');

// AIレートリミット管理: userId -> [timestamp1, timestamp2, ...]
const aiRateLimit = new Map();







// ニュースを配信する関数
async function sendNews(client, guildId, source = null, category = null, time = null) {
  const config = loadJSON(newsConfigFile);
  let guildConfig = config[guildId];
  if (!guildConfig || !guildConfig.channelId) return;

  // ニュースがない場合は自動取得
  if (!guildConfig.news || guildConfig.news.length === 0) {
    if (source === 'auto') {
      try {
        await fetchRandomNews(guildId, newsConfigFile);
        guildConfig = loadJSON(newsConfigFile)[guildId]; // 再読み込み
        if (!guildConfig.news || guildConfig.news.length === 0) return;
      } catch (error) {
        console.error('Auto fetch failed:', error);
        return;
      }
    } else {
      return;
    }
  }

  try {
    const channel = await client.channels.fetch(guildConfig.channelId);
    if (!channel || !channel.isTextBased()) return;

    // AIでタイトル生成 (Perplexity)
    const now = new Date();
    const hour = now.getHours();
    let timeOfDay;
    if (hour >= 6 && hour < 12) {
      timeOfDay = '朝';
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = '昼';
    } else if (hour >= 18 && hour < 24) {
      timeOfDay = '夜';
    } else {
      timeOfDay = '深夜';
    }

    // ニュースのタイトルを1個抽出してタイトル生成
    const firstNews = guildConfig.news[0];
    let embedTitle = '📢 今日のニュース'; // デフォルト値

    if (firstNews) {
      const titleResult = await processNewsWithPerplexity(timeOfDay, firstNews.title, firstNews.summary);
      embedTitle = titleResult.title;
    }

    const embed = new EmbedBuilder()
      .setTitle(embedTitle)
      .setColor(0x5865f2) // Discordの青色
      .setTimestamp();

    guildConfig.news.forEach((news, index) => {
      embed.addFields({
        name: `${index + 1}. ${news.title}`,
        value: `${news.summary}\n[詳細を読む](${news.url})`,
        inline: false
      });
    });

    // ニュースの中からランダムに画像があるものを選んで設定
    const newsWithImages = guildConfig.news.filter(news => news.imageUrl);
    if (newsWithImages.length > 0) {
      const randomNews = newsWithImages[Math.floor(Math.random() * newsWithImages.length)];
      embed.setImage(randomNews.imageUrl);
    }

    // フッター情報（AI生成）
    const footerText = await generateFooterInfo(time, source, category, guildConfig);
    embed.setFooter({ text: footerText });

    await channel.send({ embeds: [embed] });

    // 配信後にニュースをクリア（自動取得の場合はクリアしない）
    if (source !== 'auto') {
      const config = loadJSON(newsConfigFile);
      if (config[guildId]) {
        config[guildId].news = [];
        saveJSON(newsConfigFile, config);
      }
    }
  } catch (error) {
    console.error('Failed to send news:', error);
  }
}



const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

/**
 * ボットの初期化処理
 * @param {Client} client - Discordクライアント
 */
async function initializeBot(client) {
  console.log(`Logged in as ${client.user.tag}!`);

  // Lavalink初期化
  await initializeLavalink(client);

  // コマンド登録
  await registerCommands(client);

  // ステータス設定
  setupBotPresence(client);

  // スケジュール設定
  setupSchedules(client);

  // Webサーバー起動
  startWebServer(client);

  // 地震情報リアルタイム監視開始
  startRealtimeMonitoring(client);
}

/**
 * Lavalinkの初期化
 * @param {Client} client - Discordクライアント
 */
async function initializeLavalink(client) {
  client.lavalink = new LavalinkManager({
    nodes: [{
      host: "localhost",
      port: 2333,
      secure: false,
      region: "jp",
      authorization: "momizipcA",
      retryDelay: 30000,
      heartBeatInterval: 45000
    }],
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard.send(payload);
    },
    playerOptions: {
      defaultSearchPlatform: "spotify",
      volume: 30,
      applyVolumeAsFilter: true,
      audioQuality: "high",
      rasamplingQuality: "high"
    },
    client: {
      id: client.user.id,
      username: client.user.username
    }
  });

  await client.lavalink.init(client.user.id);
  client.on(Events.Raw, (d) => client.lavalink.sendRawData(d));

  // Lofi自動再生リスナー設定
  setupLofiListener(client);

  console.log('Lavalink nodes:', client.lavalink.nodeManager.nodes.map(n => ({
    id: n.id,
    connected: n.connected,
    sourceManagers: n.info?.sourceManagers
  })));
}

/**
 * Lofiリスナーの設定
 * @param {Client} client - Discordクライアント
 */
function setupLofiListener(client) {
  try {
    client.lavalink.on('trackEnd', async (player, track) => {
      console.log('[Lavalink Manager] trackEnd event:', track?.info?.title);
      const { lofiModeGuilds, lofiInteractionData } = playLofiCommand;

      if (lofiModeGuilds.has(player.guildId)) {
        console.log('[Lavalink Manager] Lofi mode active for guild:', player.guildId);
        try {
          const playLofiModule = require('./commands/play-lofi');
          if (playLofiModule.addRandomLofiTrack) {
            const nextTrack = await playLofiModule.addRandomLofiTrack(player, null, client, false, player.guildId);
            if (nextTrack) {
              console.log('[Lavalink Manager] Added next track:', nextTrack.info.title);
              await sendLofiNotification(client, player.guildId, nextTrack.info.title);
            }
          }
        } catch (err) {
          console.error('[Lavalink Manager] Error in trackEnd:', err.message);
        }
      }
    });
    console.log('[Lofi] Global trackEnd listener registered on manager');
  } catch (err) {
    console.warn('[Lofi] Warning: Could not register manager-level listener:', err.message);
  }
}

/**
 * Lofi通知の送信
 * @param {Client} client - Discordクライアント
 * @param {string} guildId - ギルドID
 * @param {string} trackTitle - 曲タイトル
 */
async function sendLofiNotification(client, guildId, trackTitle) {
  try {
    const { lofiInteractionData } = playLofiCommand;
    const savedInteraction = lofiInteractionData[guildId];
    if (savedInteraction && savedInteraction.interaction && savedInteraction.interaction.channelId) {
      const channel = client.channels.cache.get(savedInteraction.interaction.channelId);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle('🎵 再生中')
          .setDescription(trackTitle)
          .setColor(0x9d84b7);
        await channel.send({ embeds: [embed] });
        console.log('[Lavalink Manager] Notification sent');
      }
    }
  } catch (notifErr) {
    console.error('[Lavalink Manager] Error sending notification:', notifErr.message);
  }
}

/**
 * コマンドの登録
 * @param {Client} client - Discordクライアント
 */
async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    const commands = [
      pingCommand.command.toJSON(),
      pingHostCommand.command.toJSON(),
      pinCommand.command.toJSON(),
      pinUpCommand.command.toJSON(),
      nslookupCommand.command.toJSON(),
      iplookupCommand.command.toJSON(),
      portcheckerCommand.command.toJSON(),
      newsNowCommand.command.toJSON(),
      newsFetchCommand.command.toJSON(),
      newsTimesetCommand.command.toJSON(),
      playCommand.command.toJSON(),
      playLofiCommand.command.toJSON(),
      skipCommand.command.toJSON(),
      playlistCommand.command.toJSON(),
      stopCommand.command.toJSON(),
      volumeCommand.command.toJSON(),
      earthquakeLatestCommand.command.toJSON(),
      earthquakeSetEewCommand.command.toJSON(),
      earthquakeHistoryCommand.command.toJSON(),
      earthquakeWatchCommand.command.toJSON(),
      earthquakeSettingsCommand.command.toJSON(),
      lawSearchCommand.command.toJSON(),
      aiChannelCommand.command.toJSON(),
      aiControlCommand.command.toJSON(),
      aiStopCommand.command.toJSON(),
      aiStartCommand.command.toJSON(),
      aiChangeCommand.command.toJSON(),
      aiUserClearCommand.command.toJSON(),
    ];
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
}

/**
 * ボットのプレゼンス設定
 * @param {Client} client - Discordクライアント
 */
function setupBotPresence(client) {
  const update = () => client.user.setPresence({
    activities: [{name: `Ping: ${client.ws.ping}ms`, type: ActivityType.Watching}],
    status: 'online'
  });

  update();
  setInterval(update,60000);
}

/**
 * スケジュールの設定
 * @param {Client} client - Discordクライアント
 */
function setupSchedules(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    const config = loadJSON(newsConfigFile);
    const guildConfig = config[guildId];
    if (guildConfig && guildConfig.times && guildConfig.times.length > 0) {
      newsTimesetCommand.setupSchedules(client, guildId, guildConfig.times);
    }
  }
}

// ボットが準備完了したときのイベント
client.once(Events.ClientReady, () => initializeBot(client));

// コマンドハンドラーマップ
const commandHandlers = {
  ping: pingCommand,
  'ping-host': pingHostCommand,
  pin: pinCommand,
  'pin-up': pinUpCommand,
  nslookup: nslookupCommand,
  iplookup: iplookupCommand,
  portcheck: portcheckerCommand,
  news_now: newsNowCommand,
  news_fetch: newsFetchCommand,
  news_timeset: newsTimesetCommand,
  play: playCommand,
  'play-lofi': playLofiCommand,
  skip: skipCommand,
  playlist: playlistCommand,
  stop: stopCommand,
  volume: volumeCommand,
  'earthquake-latest': earthquakeLatestCommand,
  'earthquake-set-eew': earthquakeSetEewCommand,
  'earthquake-history': earthquakeHistoryCommand,
  'earthquake-watch': earthquakeWatchCommand,
  'earthquake-settings': earthquakeSettingsCommand,
  'law-search': lawSearchCommand,
  'ai-channel': aiChannelCommand,
  'ai-control': aiControlCommand,
  'ai-stop': aiStopCommand,
  'ai-start': aiStartCommand,
  'ai-change': aiChangeCommand,
  'ai-user-clear': aiUserClearCommand
};

// 管理者専用コマンド
const adminCommands = ['news_now', 'news_fetch', 'news_timeset', 'ai-channel', 'ai-control', 'ai-stop', 'ai-start', 'ai-change'];

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
 * チャットからユーザー情報を抽出
 * @param {string} guildId - ギルドID
 * @param {string} userId - ユーザーID
 * @param {Array} conversationHistory - 会話履歴
 */
async function extractUserInfoFromChat(guildId, userId, conversationHistory) {
  try {
    // 会話履歴が十分にある場合のみ抽出
    if (conversationHistory.length < 4) return; // 最低2往復

    const chatText = conversationHistory.map(item => `${item.role}: ${item.content}`).join('\n');

    // AIにユーザー情報を抽出させる
    const extractionPrompt = `以下の会話から、ユーザーについての情報を抽出してください。

会話:
${chatText}

以下の情報をJSON形式で抽出してください（該当しない場合はnull）:
{
  "skills": "ユーザーの特技や得意なこと",
  "personality": "ユーザーの性格や特徴",
  "interests": "ユーザーの興味や趣味",
  "other": "その他の情報"
}

該当情報がない場合はnullを入れてください。JSONのみ出力。`;

    const completion = await openRouterClient.chat.completions.create({
      model: 'openai/gpt-oss-120b:free',
      messages: [
        { role: 'system', content: 'あなたは会話分析アシスタントです。ユーザーの情報を正確に抽出してください。' },
        { role: 'user', content: extractionPrompt }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    const result = completion.choices[0].message.content.trim();
    let extractedInfo;
    try {
      extractedInfo = JSON.parse(result);
    } catch {
      return; // JSONパース失敗時は何もしない
    }

    // ユーザー情報を更新
    const userData = loadJSON(aiUserFile);
    const guildUserKey = `${guildId}.${userId}`;
    if (!userData[guildUserKey]) {
      userData[guildUserKey] = {};
    }

    if (extractedInfo.skills && !userData[guildUserKey].skills) {
      userData[guildUserKey].skills = extractedInfo.skills;
    }
    if (extractedInfo.personality && !userData[guildUserKey].personality) {
      userData[guildUserKey].personality = extractedInfo.personality;
    }
    if (extractedInfo.interests && !userData[guildUserKey].interests) {
      userData[guildUserKey].interests = extractedInfo.interests;
    }

    saveJSON(aiUserFile, userData);
  } catch (error) {
    console.error('User info extraction error:', error);
  }
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

  const config = loadJSON(aiChannelFile);
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
    const chatData = loadJSON(aiChatFile);
    const userKey = `${message.guild.id}-${message.author.id}`;
    let conversationHistory = [];

    if (message.reference) {
      // 返信の場合は会話履歴を継続
      conversationHistory = chatData[userKey] || [];
    } else {
      // 新しい会話の場合は履歴をクリア
      chatData[userKey] = [];
      saveJSON(aiChatFile, chatData);
    }

    // 初期メッセージ送信
    const responseMessage = await message.reply('<a:telegramthink:1459933307725676658> 考え中...');

    // ユーザー情報を取得
    const userData = loadJSON(aiUserFile);
    const guildUserKey = `${message.guild.id}.${message.author.id}`;
    let userInfo = userData[guildUserKey] || {};

    // ユーザー情報が不足している場合は取得
    if (!userInfo.username || !userInfo.nickname || !userInfo.guildNickname) {
      userInfo.username = message.author.username;
      userInfo.nickname = message.author.displayName;
      userInfo.guildNickname = message.member?.displayName || message.author.displayName;
      userData[guildUserKey] = userInfo;
      saveJSON(aiUserFile, userData);
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
    saveJSON(aiChatFile, chatData);

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
 * ピン止めメッセージの更新処理
 * @param {Message} message - Discordメッセージ
 */
async function handlePinUpdate(message) {
  if (message.author.bot) return;

  const pins = loadJSON(pinsFile);

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
        saveJSON(pinsFile, pins);
      } catch (error) {
        console.error('Failed to send new pinned message:', error);
      }
    }
  }
}

// インタラクションイベント（スラッシュコマンドの処理）
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const commandName = interaction.commandName;
  const handler = commandHandlers[commandName];

  if (handler) {
    // 管理者コマンドの権限チェック
    if (adminCommands.includes(commandName)) {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'このコマンドは管理者専用です。', ephemeral: true });
        return;
      }
    }

    // volumeコマンドの場合は追加パラメータを渡す
    if (commandName === 'volume') {
      await handler.execute(interaction, client, (file) => loadJSON(file), (file, data) => saveJSON(file, data));
    } else {
      await handler.execute(interaction, client);
    }
  }
});

// メッセージイベント（ピン止め更新とAIチャット）
client.on(Events.MessageCreate, async (message) => {
  await handlePinUpdate(message);
  await handleAIChat(message);
});

// ボットをログイン
client.login(process.env.DISCORD_TOKEN);



module.exports.sendNews = sendNews;

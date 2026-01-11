const { Client, DefaultWebSocketManagerOptions , GatewayIntentBits, EmbedBuilder, ActivityType, ChannelType, PermissionsBitField, REST, Routes, Events } = require('discord.js');
const path = require('path');
const { LavalinkManager } = require('lavalink-client');
const { loadJSON, saveJSON } = require('./modules/fileStorage');
const { summarizeNews, generateNewsTitle, generateFooterInfo, processNewsWithPerplexity } = require('./modules/aiService');
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

const pinsFile = path.join(__dirname, 'pins.json');
const newsConfigFile = path.join(__dirname, 'newsconfig.json');
const musicSettingsFile = path.join(__dirname, 'musicsettings.json');







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
  'law-search': lawSearchCommand
};

// 管理者専用コマンド
const adminCommands = ['news_now', 'news_fetch', 'news_timeset'];

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

// メッセージイベント（ピン止め更新）
client.on(Events.MessageCreate, handlePinUpdate);

// ボットをログイン
client.login(process.env.DISCORD_TOKEN);



module.exports.sendNews = sendNews;

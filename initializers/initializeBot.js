const { GatewayIntentBits, EmbedBuilder, ActivityType, REST, Routes, Events } = require('discord.js');
const { LavalinkManager } = require('lavalink-client');
const schedule = require('node-schedule');
const { startWebServer } = require('../webServer');
const { startRealtimeMonitoring } = require('../modules/earthquakeService');
const { updateTKUCRate, resetAllBalances } = require('../modules/economyService');
const { startBot } = require('../modules/marketBotService');
const { FILES, LAVALINK_CONFIG } = require('../constants');
const playLofiCommand = require('../commands/play-lofi');
const newsTimesetCommand = require('../commands/news_timeset');
const { loadJSON, saveJSON } = require('../modules/fileStorage');

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

  // MarketBot自動起動は無効化（手動起動のみ）
  console.log('🤖 MarketBot auto-start disabled (manual start only)');
}

/**
 * Lavalinkの初期化
 * @param {Client} client - Discordクライアント
 */
async function initializeLavalink(client) {
  client.lavalink = new LavalinkManager({
    ...LAVALINK_CONFIG,
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard.send(payload);
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
          const playLofiModule = require('../commands/play-lofi');
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
  console.log('[DEBUG] registerCommands function called');
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    // commands ディレクトリから自動でコマンドを読み込み
    const fs = require('fs');
    const path = require('path');
    const commandsDir = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));

    const commands = [];
    const failedCommands = [];

    for (const file of commandFiles) {
      try {
        const commandModule = require(path.join(commandsDir, file));
        if (commandModule.command) {
          commands.push(commandModule.command.toJSON());
          console.log(`✓ Loaded: ${file}`);
        } else {
          console.warn(`✗ No command export in: ${file}`);
          failedCommands.push(file);
        }
      } catch (err) {
        console.error(`✗ Error loading ${file}:`, err.message);
        failedCommands.push(file);
      }
    }

    console.log(`\nRegistering ${commands.length} commands...`);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✓ Successfully registered ${commands.length} slash commands.`);

    if (failedCommands.length > 0) {
      console.warn(`⚠ Failed to load ${failedCommands.length} commands: ${failedCommands.join(', ')}`);
    }
  } catch (error) {
    console.error('Error registering commands:', error);
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
  // ニューススケジュール設定
  for (const [guildId, guild] of client.guilds.cache) {
    const config = loadJSON(FILES.NEWS_CONFIG);
    const guildConfig = config[guildId];
    if (guildConfig && guildConfig.times && guildConfig.times.length > 0) {
      newsTimesetCommand.setupSchedules(client, guildId, guildConfig.times);
    }
  }

  // TKUCレート更新スケジュール（2秒毎 - 常時実行）
  setInterval(async () => {
    try {
      await updateTKUCRate();
    } catch (error) {
      console.error('TKUCレート更新スケジュールエラー:', error);
    }
  }, 2000);

  console.log('✅ 常時レート更新開始（2秒間隔）');

  // 月末リセットスケジュール（毎月1日の0時0分）
  schedule.scheduleJob('0 0 1 * *', () => {
    try {
      resetAllBalances();
      console.log('✅ 月末リセット実行完了');
    } catch (error) {
      console.error('月末リセットスケジュールエラー:', error);
    }
  });

  console.log('Scheduled jobs initialized: News notifications, TKUC rate updates, and monthly reset');
}

module.exports = {
  initializeBot,
};

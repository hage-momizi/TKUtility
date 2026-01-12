const axios = require('axios');
const WebSocket = require('ws');
const { EmbedBuilder } = require('discord.js');
const { loadJSON, saveJSON } = require('./fileStorage');
const path = require('path');
const gtts = require('gtts');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const fs = require('fs');

const earthquakeConfigFile = path.join(__dirname, '..', 'earthquake.json');
const API_BASE_URL = 'https://api.p2pquake.net/v2';

// ボイスチャンネル接続管理
const voiceConnections = new Map(); // guildId -> { connection, player }

// 地震情報のコードマップ
const CODE_MAP = {
  551: '地震情報',
  552: '津波予報',
  554: '緊急地震速報発表検出',
  555: '各地域ピア数',
  556: '緊急地震速報（警報）',
  561: '地震感知情報',
  9611: '地震感知情報解析結果'
};

// 震度マップ
const SCALE_MAP = {
  10: '震度1',
  20: '震度2',
  30: '震度3',
  40: '震度4',
  45: '震度5弱',
  50: '震度5強',
  55: '震度6弱',
  60: '震度6強',
  70: '震度7'
};

/**
 * 最新の地震情報を取得
 * @returns {Array} 地震情報配列
 */
async function fetchLatestEarthquake() {
  try {
    const response = await axios.get(`${API_BASE_URL}/history`, {
      params: { limit: 1 },
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch latest earthquake:', error.message);
    return [];
  }
}

/**
 * 過去の地震情報を取得
 * @param {Object} params - クエリパラメータ
 * @returns {Array} 地震情報配列
 */
async function fetchEarthquakeHistory(params = {}) {
  try {
    const response = await axios.get(`${API_BASE_URL}/jma/quake`, {
      params: { ...params, limit: params.limit || 10 },
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch earthquake history:', error.message);
    return [];
  }
}

/**
 * 津波情報を取得
 * @param {Object} params - クエリパラメータ
 * @returns {Array} 津波情報配列
 */
async function fetchTsunamiInfo(params = {}) {
  try {
    const response = await axios.get(`${API_BASE_URL}/jma/tsunami`, {
      params: { ...params, limit: params.limit || 10 },
      timeout: 5000
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch tsunami info:', error.message);
    return [];
  }
}

/**
 * 地震情報をEmbedに変換
 * @param {Object} data - 地震データ
 * @returns {EmbedBuilder} Discord Embed
 */
function createEarthquakeEmbed(data) {
  const embed = new EmbedBuilder()
    .setTitle(`🔔 ${CODE_MAP[data.code] || '地震情報'}`)
    .setColor(getColorByScale(data.earthquake?.maxScale))
    .setTimestamp(new Date(data.time));

  if (data.code === 551 && data.earthquake) {
    const eq = data.earthquake;
    embed.addFields(
      { name: '発生時刻', value: eq.time || '不明', inline: true },
      { name: '震源地', value: eq.hypocenter?.name || '不明', inline: true },
      { name: '最大震度', value: SCALE_MAP[eq.maxScale] || '不明', inline: true }
    );

    if (eq.hypocenter?.depth && eq.hypocenter.depth > 0) {
      embed.addFields({ name: '深さ', value: `${eq.hypocenter.depth}km`, inline: true });
    }
    if (eq.hypocenter?.magnitude && eq.hypocenter.magnitude > 0) {
      embed.addFields({ name: 'マグニチュード', value: `M${eq.hypocenter.magnitude}`, inline: true });
    }

    // 津波情報
    if (eq.domesticTsunami && eq.domesticTsunami !== 'None') {
      embed.addFields({ name: '国内津波', value: eq.domesticTsunami, inline: false });
    }

    // 観測地点情報
    if (data.points && data.points.length > 0) {
      // 震度順にソートして上位10件を表示
      const sortedPoints = data.points
        .filter(point => point.scale >= 10)
        .sort((a, b) => b.scale - a.scale)
        .slice(0, 10);

      if (sortedPoints.length > 0) {
        const pointsText = sortedPoints.map(point =>
          `${point.pref} ${point.addr}: ${SCALE_MAP[point.scale] || point.scale}`
        ).join('\n');
        embed.addFields({ name: '各地の震度', value: `\`\`\`${pointsText}\`\`\``, inline: false });
      }
    }
  } else if (data.code === 556 && data.earthquake) {
    // EEW情報
    const eq = data.earthquake;
    embed.setTitle('🚨 緊急地震速報（警報）')
      .setColor(0xff0000);

    embed.addFields(
      { name: '発生時刻', value: eq.originTime || '不明', inline: true },
      { name: '震源地', value: eq.hypocenter?.name || '不明', inline: true },
      { name: 'マグニチュード', value: eq.hypocenter?.magnitude ? `M${eq.hypocenter.magnitude}` : '不明', inline: true }
    );

    if (data.areas && data.areas.length > 0) {
      const areasText = data.areas.slice(0, 5).map(area =>
        `${area.pref} ${area.name}: ${SCALE_MAP[area.scaleFrom] || '不明'}`
      ).join('\n');
      embed.addFields({ name: '予想震度', value: areasText, inline: false });
    }
  } else if (data.code === 555 && data.areas) {
    // 各地域ピア数
    const totalPeers = data.areas.reduce((sum, area) => sum + (area.peer || 0), 0);
    embed.addFields(
      { name: '接続ピア数', value: `${totalPeers}ピア`, inline: true },
      { name: '地域数', value: `${data.areas.length}地域`, inline: true }
    );

    // 上位5地域を表示
    const topAreas = data.areas.sort((a, b) => b.peer - a.peer).slice(0, 5);
    const areasText = topAreas.map(area => `${area.id}: ${area.peer}ピア`).join('\n');
    embed.addFields({ name: '上位地域', value: areasText, inline: false });
  } else if (data.code === 561 && data.area) {
    // 地震感知情報
    embed.addFields({ name: '感知地域', value: `地域コード: ${data.area}`, inline: true });
  } else if (data.code === 9611 && data.confidence !== undefined) {
    // 地震感知情報解析結果
    embed.addFields(
      { name: '信頼度', value: `${(data.confidence * 100).toFixed(1)}%`, inline: true },
      { name: '件数', value: `${data.count}件`, inline: true }
    );
  } else if (data.code === 552 && data.areas) {
    // 津波予報
    embed.setTitle('🌊 津波予報')
      .setColor(0x0080ff);

    if (data.cancelled) {
      embed.addFields({ name: '状態', value: '津波予報解除', inline: false });
    } else {
      const areasText = data.areas.slice(0, 5).map(area =>
        `${area.name}: ${area.grade || '不明'}`
      ).join('\n');
      embed.addFields({ name: '津波予報区', value: areasText, inline: false });
    }
  } else if (data.code === 554) {
    // 緊急地震速報発表検出
    embed.addFields({ name: '検出タイプ', value: data.type || '不明', inline: true });
  }

  embed.setFooter({ text: `ID: ${data.id}` });
  return embed;
}

/**
 * 震度による色を取得
 * @param {number} scale - 震度
 * @returns {number} 色コード
 */
function getColorByScale(scale) {
  if (scale >= 60) return 0xff0000; // 赤
  if (scale >= 50) return 0xff8000; // オレンジ
  if (scale >= 40) return 0xffff00; // 黄
  if (scale >= 30) return 0x00ff00; // 緑
  return 0x0000ff; // 青
}

/**
 * テキストを音声ファイルに変換
 * @param {string} text - 読み上げるテキスト
 * @returns {Promise<string>} 音声ファイルのパス
 */
async function createTTSFile(text) {
  const fileName = `tts_${Date.now()}.mp3`;
  const filePath = path.join(__dirname, '..', 'temp', fileName);

  // tempディレクトリが存在しない場合は作成
  if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  const gttsInstance = new gtts(text, 'ja');

  return new Promise((resolve, reject) => {
    gttsInstance.save(filePath, (err) => {
      if (err) reject(err);
      else resolve(filePath);
    });
  });
}

/**
 * ボイスチャンネルに参加
 * @param {Client} client - Discordクライアント
 * @param {string} guildId - ギルドID
 * @param {string} channelId - チャンネルID
 */
function joinVoiceChannelForGuild(client, guildId, channelId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== 2) return; // GUILD_VOICE

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  voiceConnections.set(guildId, { connection, player });
  console.log(`Joined voice channel ${channel.name} in guild ${guild.name}`);
}

/**
 * ボイスチャンネルから切断
 * @param {string} guildId - ギルドID
 */
function leaveVoiceChannel(guildId) {
  const voiceData = voiceConnections.get(guildId);
  if (voiceData) {
    voiceData.connection.destroy();
    voiceConnections.delete(guildId);
    console.log(`Left voice channel for guild ${guildId}`);
  }
}

/**
 * 音声を再生
 * @param {string} guildId - ギルドID
 * @param {string} filePath - 音声ファイルのパス
 */
function playAudioFile(guildId, filePath) {
  const voiceData = voiceConnections.get(guildId);
  if (!voiceData) return;

  const resource = createAudioResource(filePath);
  voiceData.player.play(resource);

  voiceData.player.on(AudioPlayerStatus.Idle, () => {
    // 再生終了後にファイルを削除
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to delete TTS file:', err);
    });
  });
}

/**
 * 地震データを読み上げテキストに変換
 * @param {Object} data - 地震データ
 * @returns {string} 読み上げテキスト
 */
function createTTSMessage(data) {
  if (data.code === 551 && data.earthquake) {
    const eq = data.earthquake;
    const hypocenter = eq.hypocenter?.name || '不明';
    const maxScale = SCALE_MAP[eq.maxScale] || '不明';
    const magnitude = eq.hypocenter?.magnitude ? `マグニチュード${eq.hypocenter.magnitude}` : '';
    return `地震情報です。震源地は${hypocenter}、最大震度は${maxScale}です。${magnitude}`;
  } else if (data.code === 556 && data.earthquake) {
    const eq = data.earthquake;
    const hypocenter = eq.hypocenter?.name || '不明';
    const magnitude = eq.hypocenter?.magnitude ? `マグニチュード${eq.hypocenter.magnitude}` : '';
    return `緊急地震速報です。警報です。震源地は${hypocenter}。${magnitude}。強い揺れに注意してください。`;
  }
  return '';
}

/**
 * WebSocketでリアルタイム監視開始
 * @param {Client} client - Discordクライアント
 */
function startRealtimeMonitoring(client) {
  const ws = new WebSocket('wss://api.p2pquake.net/v2/ws');

  ws.on('open', () => {
    console.log('Connected to P2P Earthquake WebSocket');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleRealtimeData(client, message);
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  ws.on('close', () => {
    console.log('WebSocket closed, reconnecting in 5 seconds...');
    setTimeout(() => startRealtimeMonitoring(client), 5000);
  });
}

/**
 * リアルタイムデータ処理
 * @param {Client} client - Discordクライアント
 * @param {Object} data - 受信データ
 */
async function handleRealtimeData(client, data) {
  // 地震情報（551）またはEEW（556）の場合のみ処理
  if (data.code === 551 || data.code === 556) {
    const config = loadJSON(earthquakeConfigFile);

    for (const [guildId, guildConfig] of Object.entries(config)) {
      // テキストチャンネルへの送信（EEWの場合のみ、または地震情報も送信したい場合）
      if (data.code === 556 && guildConfig.eewChannelId && guildConfig.watchEnabled !== false) {
        try {
          const channel = await client.channels.fetch(guildConfig.eewChannelId);
          if (channel && channel.isTextBased()) {
            const embed = createEarthquakeEmbed(data);
            embed.setTitle('🚨 緊急地震速報（警報） - リアルタイム');
            await channel.send({ embeds: [embed] });
          }
        } catch (error) {
          console.error(`Failed to send EEW to guild ${guildId}:`, error);
        }
      }

      // 音声読み上げ
      if (guildConfig.vcChannelId && guildConfig.vcEnabled) {
        try {
          // vc参加チェック
          if (!voiceConnections.has(guildId)) {
            joinVoiceChannelForGuild(client, guildId, guildConfig.vcChannelId);
          }
          const ttsMessage = createTTSMessage(data);
          if (ttsMessage) {
            const filePath = await createTTSFile(ttsMessage);
            playAudioFile(guildId, filePath);
          }
        } catch (error) {
          console.error(`Failed to play TTS for guild ${guildId}:`, error);
        }
      }
    }
  }
}

/**
 * EEWチャンネル設定を取得
 * @param {string} guildId - ギルドID
 * @returns {Object} 設定
 */
function getGuildConfig(guildId) {
  const config = loadJSON(earthquakeConfigFile);
  return config[guildId] || {};
}

/**
 * EEWチャンネル設定を保存
 * @param {string} guildId - ギルドID
 * @param {Object} settings - 設定
 */
function saveGuildConfig(guildId, settings) {
  const config = loadJSON(earthquakeConfigFile);
  config[guildId] = { ...config[guildId], ...settings };
  saveJSON(earthquakeConfigFile, config);
}

module.exports = {
  fetchLatestEarthquake,
  fetchEarthquakeHistory,
  fetchTsunamiInfo,
  createEarthquakeEmbed,
  startRealtimeMonitoring,
  getGuildConfig,
  saveGuildConfig,
  joinVoiceChannelForGuild,
  leaveVoiceChannel,
  playAudioFile,
  createTTSMessage,
  voiceConnections
};

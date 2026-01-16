const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const musicSettingsFile = path.join(__dirname, '..', 'musicsettings.json');

// musicsettings.jsonを読み込む関数
function loadMusicSettings() {
  try {
    const data = fs.readFileSync(musicSettingsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

const command = new SlashCommandBuilder()
  .setName('play-lofi')
  .setDescription('ランダムなLofiを再生します。');

// LofiモードのguildIdを管理するセット
const lofiModeGuilds = new Set();

// trackEndリスナーを管理するマップ
const lofiTrackEndListeners = new Map();

// Lofi自動再生インターバル管理
const lofiAutoPlayIntervals = new Map(); // guildId -> { intervalId, lastTrack }
let lofiInteractionData = {}; // guildId -> { player, client, interaction }

function setupLofiAutoPlayInterval(guildId, player, client, interaction) {
  // 既存のインターバルがあれば削除
  if (lofiAutoPlayIntervals.has(guildId)) {
    const oldInterval = lofiAutoPlayIntervals.get(guildId);
    clearInterval(oldInterval.intervalId);
  }

  let lastQueueWasEmpty = false;

  const intervalId = setInterval(async () => {
    try {
      // Lofiモードが終了したらクリア
      if (!lofiModeGuilds.has(guildId)) {
        clearInterval(intervalId);
        lofiAutoPlayIntervals.delete(guildId);
        return;
      }

      // プレイヤー確認
      const currentPlayer = client.lavalink.getPlayer(guildId);
      if (!currentPlayer) {
        clearInterval(intervalId);
        lofiAutoPlayIntervals.delete(guildId);
        return;
      }

      // キューのサイズを取得
      const queueSize = currentPlayer.queue?.size ?? 0;
      const isPlaying = currentPlayer.playing;

      console.log('[Lofi AutoPlay] Check - Playing:', isPlaying, 'Queue size:', queueSize);

      // キューが空になった（前は空でなく、今空）場合
      if (queueSize === 0 && !lastQueueWasEmpty && isPlaying) {
        console.log('[Lofi AutoPlay] Queue became empty, adding next track...');
        const nextTrack = await addRandomLofiTrack(currentPlayer, interaction, client, false, guildId);
        if (nextTrack) {
          console.log('[Lofi AutoPlay] Added next track:', nextTrack.info.title);
        }
        lastQueueWasEmpty = true;
      }

      // キューの状態を更新
      if (queueSize > 0) {
        lastQueueWasEmpty = false;
      }
    } catch (err) {
      console.error('[Lofi AutoPlay] Error:', err.message);
    }
  }, 2000); // 2秒ごとにチェック

  lofiAutoPlayIntervals.set(guildId, { intervalId });
  console.log('[Lofi] AutoPlay interval started for guild:', guildId);
}

// Lofiキーワード
const lofiSearchKeywords = [
  'lofi hip hop',
  'lofi beats',
  'lofi chill',
  'lofi relaxing',
  'lofi study',
  'lofi jazz',
  'ambient lofi',
  'lofi lo-fi',
];

// ランダムなLofi曲を追加する関数（タイムアウト対策付き）
async function addRandomLofiTrack(player, interaction, client, sendNotification = false, guildId = null) {
  const randomKeyword = lofiSearchKeywords[Math.floor(Math.random() * lofiSearchKeywords.length)];
  const searchOptions = { query: randomKeyword };

  try {
    console.log('[Lofi] Searching for:', randomKeyword);
    // 検索をPromise.raceでタイムアウト処理
    const searchPromise = player.search(searchOptions, interaction?.user);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search timeout')), 10000)
    );

    const results = await Promise.race([searchPromise, timeoutPromise]);

    if (results.tracks.length > 0) {
      const randomTrack = results.tracks[Math.floor(Math.random() * Math.min(results.tracks.length, 10))];
      player.queue.add(randomTrack);
      console.log('[Lofi] Added to queue:', randomTrack.info.title);

      // 通知フラグが true の場合のみ、チャンネルに小さいEmbedを送信
      if (sendNotification) {
        try {
          let channelId = interaction?.channelId;

          // interaction がない場合は、保存されたデータから取得
          if (!channelId && guildId && lofiInteractionData[guildId]) {
            channelId = lofiInteractionData[guildId].interaction?.channelId;
          }

          if (channelId && client) {
            const channel = client.channels.cache.get(channelId);
            if (channel && channel.isTextBased()) {
              const smallEmbed = new EmbedBuilder()
                .setTitle('🎵 再生中')
                .setDescription(randomTrack.info.title)
                .setColor(0x9d84b7);

              await channel.send({ embeds: [smallEmbed] });
              console.log('[Lofi] Now playing embed sent');
            }
          }
        } catch (err) {
          console.error('[Lofi] Error sending embed:', err.message);
        }
      }

      return randomTrack;
    } else {
      console.log('[Lofi] No tracks found for:', randomKeyword);
    }
  } catch (error) {
    console.error('[Lofi] Error adding track:', error.message);
  }
  return null;
}

async function execute(interaction, client) {
  try {
    // まず deferReply を実行して時間を稼ぐ（3秒制限を回避）
    await interaction.deferReply();

    const vc = interaction.member.voice.channel;

    if (!vc) {
      return interaction.editReply({ content: 'まずボイスチャンネルに参加してください。' });
    }

    // player確認、なければ作成
    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
      player = client.lavalink.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: vc.id,
        textChannelId: interaction.channelId,
        selfDeafen: true,
      });
    }

    // 音量を明示的に設定（50%またはmusicsettings.jsonから読み込み）
    const musicSettings = loadMusicSettings();
    const volume = musicSettings[interaction.guildId] || 50;

    if (player.setVolume) {
      await player.setVolume(volume);
      console.log(`[Lofi] Volume set to ${volume}%`);
    }

    // 初曲を検索して追加
    const firstTrack = await addRandomLofiTrack(player, interaction, client);

    if (!firstTrack) {
      return interaction.editReply({ content: `❌ Lofi音楽が見つかりませんでした。` });
    }

    // Lavalink接続
    if (!player.connected) await player.connect();

    // キューサイズをデバッグ出力
    const queueSize = player.queue?.size || 0;
    const currentTrack = player.queue?.current || player.current;
    console.log('[Lofi] Added Lofi to queue. Queue size:', queueSize, 'Current:', currentTrack?.info?.title);
    console.log('[Lofi] Player info:', { playing: player.playing, paused: player.paused, connected: player.connected });

    // Lofiモードを有効化（これを再生開始の前に設定）
    lofiModeGuilds.add(interaction.guildId);

    // 再生開始
    if (!player.playing && !player.paused) {
      await player.play();
      console.log('[Lofi] Player started playing');
    }

    let thumbnail = firstTrack.info.artworkUrl || firstTrack.info.thumbnail;

    // Embed作成
    const embed = new EmbedBuilder()
      .setTitle('🎵 Lofi再生開始')
      .setDescription(`▶️ | 再生を開始しました: **${firstTrack.info.title}**\n\n(曲が終わると自動的に別のLofi曲が流れます)`)
      .setColor(0x9d84b7)
      .setFooter({ text: `${interaction.user.displayName} がリクエスト | このモード中は /play が使えません`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();
    if (thumbnail) embed.setThumbnail(thumbnail);

    // イベントリスナーをセットアップ
    // 既存のリスナーがあれば削除
    if (player.removeAllListeners && typeof player.removeAllListeners === 'function') {
      try {
        player.removeAllListeners('trackEnd');
        player.removeAllListeners('trackStart');
        player.removeAllListeners('queueEnd');
        console.log('[Lofi] Cleared existing listeners');
      } catch (err) {
        console.warn('[Lofi] Warning clearing listeners:', err.message);
      }
    }

    // 新しいリスナーを登録
    const trackEndHandler = async () => {
      console.log('[Lofi] trackEnd event fired, adding next track...');
      if (lofiModeGuilds.has(interaction.guildId)) {
        try {
          const newTrack = await addRandomLofiTrack(player, interaction, client, true);
          if (newTrack) {
            console.log('[Lofi] 次の曲を追加:', newTrack.info.title);
            // キューが空の場合は再生を開始
            if (!player.playing && !player.paused && player.queue.size > 0) {
              try {
                await player.play();
                console.log('[Lofi] Resumed playing after track end');
              } catch (err) {
                console.error('[Lofi] Error resuming play:', err);
              }
            }
          } else {
            console.warn('[Lofi] Failed to add new track');
          }
        } catch (err) {
          console.error('[Lofi] Error in trackEndHandler:', err);
        }
      }
    };

    // イベント設定を試みる
    try {
      if (player.on && typeof player.on === 'function') {
        // trackEnd イベントをリッスン（プレイヤーレベル）
        player.on('trackEnd', trackEndHandler);
        console.log('[Lofi] Registered player-level trackEnd listener');

        lofiTrackEndListeners.set(interaction.guildId, trackEndHandler);
        console.log('[Lofi] Event listeners registered for guildId:', interaction.guildId);
      } else {
        console.warn('[Lofi] player.on not available - using interval-based auto-play');
        // インターバルベースの自動再生を使用
        setupLofiAutoPlayInterval(interaction.guildId, player, client, interaction);
        lofiInteractionData[interaction.guildId] = { player, client, interaction };
      }
    } catch (err) {
      console.error('[Lofi] Error setting up event listeners:', err);
      // エラーが出た場合もインターバルで対応
      setupLofiAutoPlayInterval(interaction.guildId, player, client, interaction);
      lofiInteractionData[interaction.guildId] = { player, client, interaction };
    }

    // 曲情報を表示
    return interaction.editReply({ content: '', embeds: [embed] });
  } catch (error) {
    console.error('play-lofi execute error:', error);
    try {
      return interaction.editReply({ content: '❌ エラーが発生しました。後でもう一度お試しください。' });
    } catch (e) {
      console.error('Failed to send error reply:', e);
    }
  }
}

module.exports = { command, execute, lofiModeGuilds, lofiTrackEndListeners, addRandomLofiTrack, lofiAutoPlayIntervals, lofiInteractionData };

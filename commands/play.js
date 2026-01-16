const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { lofiModeGuilds } = require('./play-lofi');
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
  .setName('play')
  .setDescription('URLの音楽を再生します。')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('再生する音楽のURLまたは検索語')
      .setRequired(true)
  );

async function execute(interaction, client) {
  // Lofiモード中は play が使えないようにする
  if (lofiModeGuilds.has(interaction.guildId)) {
    return interaction.reply({
      content: '❌ Lofiモード中は `/play` は使用できません。\nLofiモードを終了するには `/stop` を実行してください。',
      ephemeral: true
    });
  }

  const query = interaction.options.getString('query');

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
    console.log(`[Play] Volume set to ${volume}%`);
  }

  // URL チェック
  const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const spotifyRegex = /https?:\/\/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/;
  let searchOptions = { query };

  const youtubeMatch = query.match(youtubeRegex);
  const spotifyMatch = query.match(spotifyRegex);

  if (youtubeMatch) {
    // YouTube URL の場合、タイトル取得
    const videoId = youtubeMatch[1];
    try {
      const response = await axios.get(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`);
      if (response.data.items && response.data.items.length > 0) {
        searchOptions = { query: response.data.items[0].snippet.title };
      }
    } catch (error) {
      console.error('YouTube API error:', error);
      return interaction.editReply({ content: '❌ YouTube のタイトル取得に失敗しました。' });
    }
  } else if (spotifyMatch) {
    searchOptions = { query, source: "spotify" };
  }

  // 検索
  const results = await player.search(searchOptions, interaction.user);

  if (!results.tracks.length) {
    return interaction.editReply({ content: `❌ "${query}" に一致する曲が見つかりませんでした。` });
  }

  // Lavalink接続
  if (!player.connected) await player.connect();
  player.queue.add(results.tracks[0]);
  console.log('Added to queue. Queue size:', player.queue.size, 'Current:', player.queue.current?.info.title);

  // サムネイル取得
  let thumbnail = results.tracks[0].info.artworkUrl || results.tracks[0].info.thumbnail;
  if (!thumbnail && youtubeMatch) thumbnail = `https://img.youtube.com/vi/${youtubeMatch[1]}/maxresdefault.jpg`;

  // Embed作成
  const embed = new EmbedBuilder()
    .setTitle(player.playing ? '🎵 キュー追加' : '🎵 音楽再生開始')
    .setDescription(`${player.playing ? '➕ | キューに追加しました:' : '▶️ | 再生を開始しました:'} **${results.tracks[0].info.title}**`)
    .setColor(0x5865f2)
    .setFooter({ text: `${interaction.user.displayName} がリクエスト`, iconURL: interaction.user.displayAvatarURL() })
    .setTimestamp();
  if (thumbnail) embed.setThumbnail(thumbnail);

  // 再生開始
  if (!player.playing && !player.paused) await player.play();

  // 次の曲に移行した時の通知を設定（初回は通知されず、次の曲以降から通知される）
  try {
    // 既存のtrackEndリスナーを削除（重複を防ぐ）
    if (player.removeAllListeners) {
      player.removeAllListeners('trackEnd');
    }

    if (player.on && typeof player.on === 'function') {
      player.on('trackEnd', async () => {
        console.log('[Play] Track ended, checking next track...');

        // 次の曲がキューにあるか確認（初回実行時は曲が終わった直後なので、次の曲情報が取得される）
        if (player.queue.current) {
          const nextTrack = player.queue.current;
          console.log('[Play] Next track:', nextTrack.info.title);

          try {
            const channel = client.channels.cache.get(interaction.channelId);
            if (channel && channel.isTextBased()) {
              const nextEmbed = new EmbedBuilder()
                .setTitle('🎵 再生中')
                .setDescription(nextTrack.info.title)
                .setColor(0x5865f2);

              await channel.send({ embeds: [nextEmbed] });
              console.log('[Play] Next track notification sent');
            }
          } catch (err) {
            console.error('[Play] Error sending next track embed:', err.message);
          }
        }
      });
      console.log('[Play] Track end listener registered');
    }
  } catch (err) {
    console.error('[Play] Error setting up track end listener:', err.message);
  }

  // 曲情報を表示
  return interaction.editReply({ content: '', embeds: [embed] });
}

module.exports = { command, execute };

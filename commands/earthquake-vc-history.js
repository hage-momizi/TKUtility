const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchEarthquakeHistory, createTTSMessage, joinVoiceChannelForGuild, playAudioFile, createTTSFile, getGuildConfig, voiceConnections, SCALE_MAP } = require('../modules/earthquakeService');
const { FILES } = require('../constants');
const { loadJSON } = require('../modules/fileStorage');

const command = new SlashCommandBuilder()
  .setName('earthquake-vc-history')
  .setDescription('過去の地震情報を音声で読み上げます')
  .addIntegerOption(option =>
    option.setName('count')
      .setDescription('読み上げる件数（デフォルト: 10、最大: 20）')
      .setMinValue(1)
      .setMaxValue(20)
      .setRequired(false)
  );

async function execute(interaction) {
  const count = interaction.options.getInteger('count') || 10;
  const guildId = interaction.guild.id;

  // 設定確認（vc参加中かチェック）
  if (!voiceConnections.has(guildId)) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ 読み上げ開始が必要')
      .setDescription('まず `/earthquake-vc-start` で音声読み上げを開始してください。')
      .setColor(0xffa500);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const config = loadJSON(FILES.EARTHQUAKE_CONFIG);

    // 過去の地震情報を取得
    const history = await fetchEarthquakeHistory({ limit: count });

    if (history.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📊 地震履歴')
        .setDescription('過去の地震情報が見つかりませんでした。')
        .setColor(0xffa500);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ボイスチャンネル参加チェック
    if (!voiceConnections.has(guildId)) {
      joinVoiceChannelForGuild(interaction.client, guildId, config.vcChannelId);
      // 少し待つ
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const embed = new EmbedBuilder()
      .setTitle('📊 地震履歴読み上げ開始')
      .setDescription(`${history.length}件の過去の地震情報を読み上げます。`)
      .setColor(0x00ff00);

    await interaction.editReply({ embeds: [embed] });

    // 順番に読み上げ
    for (let i = 0; i < history.length; i++) {
      const quake = history[i];
      let ttsMessage = '';

      if (quake.code === 551 && quake.earthquake) {
        const eq = quake.earthquake;
        const hypocenter = eq.hypocenter?.name || '不明';
        const maxScale = SCALE_MAP[eq.maxScale] || '不明';
        const magnitude = eq.hypocenter?.magnitude ? `マグニチュード${eq.hypocenter.magnitude}` : '';
        const time = eq.time ? new Date(eq.time).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }) : '';

        if (i === 0) {
          ttsMessage = `地震情報です。${time}、震源地は${hypocenter}、最大震度は${maxScale}です。${magnitude}`;
        } else {
          ttsMessage = `${time}、震源地は${hypocenter}、最大震度は${maxScale}です。${magnitude}`;
        }
      }

      console.log(`[TTS] Processing quake ${quake.id}, message: ${ttsMessage}`);
      if (ttsMessage) {
        try {
          console.log(`[TTS] Creating TTS file for quake ${quake.id}`);
          const filePath = await createTTSFile(ttsMessage);
          console.log(`[TTS] Created TTS file: ${filePath}`);
          console.log(`[TTS] Playing audio for guild ${guildId}`);
          await playAudioFile(guildId, filePath);
          console.log(`[TTS] Audio play completed for quake ${quake.id}`);
          // 次の読み上げまで少し間隔を空ける
          if (i < history.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.error(`Failed to play TTS for quake ${quake.id}:`, error);
        }
      } else {
        console.log(`[TTS] No TTS message for quake ${quake.id}`);
      }
    }

    const finishEmbed = new EmbedBuilder()
      .setTitle('✅ 読み上げ完了')
      .setDescription(`${history.length}件の地震情報を読み上げました。`)
      .setColor(0x00ff00);

    await interaction.followUp({ embeds: [finishEmbed] });

  } catch (error) {
    console.error('Error in earthquake-vc-history command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('地震履歴の取得または読み上げに失敗しました。')
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { command, execute };

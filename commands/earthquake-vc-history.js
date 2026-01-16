const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchEarthquakeHistory, createTTSMessage, joinVoiceChannelForGuild, playAudioFile, createTTSFile, getGuildConfig, voiceConnections } = require('../modules/earthquakeService');

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
      const ttsMessage = createTTSMessage(quake);
      if (ttsMessage) {
        try {
          const filePath = await createTTSFile(ttsMessage);
          playAudioFile(guildId, filePath);
          // 次の読み上げまで少し待つ
          if (i < history.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        } catch (error) {
          console.error(`Failed to play TTS for quake ${quake.id}:`, error);
        }
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

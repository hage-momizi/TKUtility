const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchEarthquakeHistory, createEarthquakeEmbed } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-latest')
  .setDescription('最新の地震情報を表示します');

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const data = await fetchEarthquakeHistory({ limit: 1 });

    if (data.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('🔔 地震情報')
        .setDescription('現在利用可能な地震情報がありません。')
        .setColor(0x0099ff);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // 一番新しい情報を取得
    const latestData = data[0];

    if (!latestData) {
      const embed = new EmbedBuilder()
        .setTitle('🔔 最新の情報')
        .setDescription('現在利用可能な情報がありません。')
        .setColor(0x0099ff);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = createEarthquakeEmbed(latestData);
    embed.setTitle('🔔 最新の情報');

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in earthquake-latest command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('地震情報の取得に失敗しました。')
      .setColor(0xff0000);
    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = { command, execute };

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { leaveVoiceChannel, voiceConnections } = require('../modules/earthquakeService');

const command = new SlashCommandBuilder()
  .setName('earthquake-vc-stop')
  .setDescription('地震情報の音声読み上げを停止します');

async function execute(interaction) {
  const guildId = interaction.guild.id;

  try {
    // 接続中の場合は切断
    if (!voiceConnections.has(guildId)) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ 読み上げ停止済み')
        .setDescription('地震情報の音声読み上げはすでに停止されています。')
        .setColor(0xffa500);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ボイスチャンネルから切断
    leaveVoiceChannel(guildId);

    const embed = new EmbedBuilder()
      .setTitle('⏸️ 音声読み上げ停止')
      .setDescription('地震情報の音声読み上げを停止しました。')
      .setColor(0xffa500);

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in earthquake-vc-stop command:', error);
    const embed = new EmbedBuilder()
      .setTitle('❌ エラー')
      .setDescription('音声読み上げの停止に失敗しました。')
      .setColor(0xff0000);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = { command, execute };

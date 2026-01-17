const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { leaveVoiceChannelForYomiage } = require('../modules/yomiageService');

const command = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('ボイスチャンネルから読み上げボットを切断させます。');

async function execute(interaction) {
  const connection = getVoiceConnection(interaction.guildId);
  if (connection) {
    leaveVoiceChannelForYomiage(interaction.guildId);

    const embed = new EmbedBuilder()
      .setTitle('TK鯖読み上げ1号機')
      .setColor(0xff0000)
      .setDescription('読み上げを停止しました。')
      .addFields(
        { name: '\u200B', value: 'また接続するには `/join` を使用します！' }
      );

    await interaction.reply({ embeds: [embed] });
  } else {
    await interaction.reply({ content: 'I am not connected to a voice channel.', ephemeral: true });
  }
}

module.exports = { command, execute };

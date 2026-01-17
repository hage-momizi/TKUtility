const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { skipYomiage } = require('../modules/yomiageService');

const command = new SlashCommandBuilder()
  .setName('skip-yomiage')
  .setDescription('読み上げをスキップします。');

async function execute(interaction) {
  const skipped = skipYomiage(interaction.guildId);

  if (skipped) {
    const embed = new EmbedBuilder()
      .setTitle('読み上げスキップ')
      .setColor(0xffa500)
      .setDescription('現在再生中の音声をスキップし、キューをクリアしました。');

    await interaction.reply({ embeds: [embed] });
  } else {
    await interaction.reply({ content: '読み上げボットが接続されていません。', ephemeral: true });
  }
}

module.exports = { command, execute };

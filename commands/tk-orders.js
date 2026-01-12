const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatOrderBook } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-orders')
    .setDescription('現在のオーダー板を表示します'),

  async execute(interaction, client) {
    try {
      const orderBookText = formatOrderBook();

      const embed = new EmbedBuilder()
        .setTitle('📊 TKUCオーダー板')
        .setDescription(orderBookText)
        .setColor(0x007bff)
        .setFooter({ text: '注文は自動マッチングされます' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Orders command error:', error);
      await interaction.reply({
        content: 'オーダー板の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

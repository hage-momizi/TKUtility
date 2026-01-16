const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { cancelOrder } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-cancel-order')
    .setDescription('注文をキャンセルします')
    .addStringOption(option =>
      option.setName('order_id')
        .setDescription('キャンセルする注文ID')
        .setRequired(true)),

  async execute(interaction, client) {
    try {
      const orderId = interaction.options.getString('order_id');

      const result = cancelOrder(interaction.user.id, orderId);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ 注文キャンセル')
          .setDescription(result.message)
          .addFields(
            { name: '注文ID', value: orderId, inline: true }
          )
          .setColor(0xff0000)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: result.message,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Cancel order command error:', error);
      await interaction.reply({
        content: '注文キャンセル中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

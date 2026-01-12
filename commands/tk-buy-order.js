const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { placeBuyOrder } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-buy-order')
    .setDescription('TKUCの買い注文を追加します')
    .addNumberOption(option =>
      option.setName('price')
        .setDescription('1 TKUCあたりの希望価格（TKUP）')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10000))
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('注文数量（TKUC）')
        .setRequired(true)
        .setMinValue(0.01)),

  async execute(interaction, client) {
    try {
      const price = interaction.options.getNumber('price');
      const amount = interaction.options.getNumber('amount');

      // 小数点2桁に制限
      const roundedPrice = Math.round(price * 100) / 100;
      const roundedAmount = Math.round(amount * 100) / 100;

      const result = placeBuyOrder(interaction.user.id, roundedPrice, roundedAmount);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ 買い注文追加')
          .setDescription(result.message)
          .addFields(
            { name: '注文価格', value: `${roundedPrice} TKUP/TKUC`, inline: true },
            { name: '注文数量', value: `${roundedAmount} TKUC`, inline: true },
            { name: '必要TKUP', value: `${(roundedPrice * roundedAmount).toFixed(2)} TKUP`, inline: true }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: result.message,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Buy order command error:', error);
      await interaction.reply({
        content: '買い注文の追加中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

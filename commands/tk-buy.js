const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buyTKUC, getTKUCRate } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-buy')
    .setDescription('TKUPを使ってTKUCを購入します')
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('購入するTKUCの数量')
        .setRequired(true)
        .setMinValue(0.01)),

  async execute(interaction, client) {
    try {
      const tkucAmount = interaction.options.getNumber('amount');

      // 小数点2桁に制限
      const roundedAmount = Math.round(tkucAmount * 100) / 100;

      if (roundedAmount <= 0) {
        return await interaction.reply({
          content: '購入数量は0より大きい値を指定してください。',
          ephemeral: true
        });
      }

      const result = buyTKUC(interaction.user.id, roundedAmount);

      if (result.success) {
        const currentRate = getTKUCRate();
        const embed = new EmbedBuilder()
          .setTitle('✅ TKUC購入完了')
          .setDescription(result.message)
          .addFields(
            { name: '現在のレート', value: `${currentRate} TKUP = 1 TKUC`, inline: true },
            { name: '手数料', value: '5%', inline: true }
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
      console.error('Buy command error:', error);
      await interaction.reply({
        content: '購入処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gambleTKUC } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-gamble')
    .setDescription('TKUCベット（2倍チャンス）')
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('ベットするTKUCの数量')
        .setRequired(true)
        .setMinValue(0.01)),

  async execute(interaction) {
    try {
      const betAmount = interaction.options.getNumber('amount');

      // 小数点2桁に制限
      const roundedAmount = Math.round(betAmount * 100) / 100;

      if (roundedAmount <= 0) {
        return await interaction.reply({
          content: 'ベット金額は0より大きい値を指定してください。',
          ephemeral: true
        });
      }

      const result = gambleTKUC(interaction.user.id, roundedAmount);

      if (result.success) {
        let embed;
        if (result.won) {
          embed = new EmbedBuilder()
            .setTitle('🎉 勝利！')
            .setDescription(result.message)
            .setColor(0xffd700) // 金色
            .setTimestamp();
        } else {
          embed = new EmbedBuilder()
            .setTitle('💔 敗北...')
            .setDescription(result.message)
            .setColor(0xff0000) // 赤色
            .setTimestamp();
        }

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: result.message,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Gamble command error:', error);
      await interaction.reply({
        content: 'ギャンブル処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

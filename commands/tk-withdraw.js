const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { withdrawTKUP } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-withdraw')
    .setDescription('TKUPを出金します（手数料10%）')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('出金するTKUPの数量')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    try {
      const amount = interaction.options.getInteger('amount');

      const result = withdrawTKUP(interaction.user.id, amount);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ 出金完了')
          .setDescription(result.message)
          .addFields(
            { name: '出金額', value: `${result.withdrawn}円`, inline: true },
            { name: '手数料', value: '10%', inline: true }
          )
          .setColor(0x00ff00)
          .setFooter({ text: '出金処理は手動で行われます' })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: result.message,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Withdraw command error:', error);
      await interaction.reply({
        content: '出金処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

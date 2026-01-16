const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { withdrawTKUP } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-withdraw')
    .setDescription('TKUPを出金します（手数料3%）')
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('出金するTKUPの数量')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, client) {
    try {
      const amount = interaction.options.getInteger('amount');

      const result = withdrawTKUP(interaction.user.id, amount);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ TKUP出金完了')
          .setDescription(result.message)
          .addFields(
            { name: '出金額', value: `${Math.round(result.withdrawn * 100) / 100} TKUP`, inline: true },
            { name: '手数料', value: '3%（元の金額の）', inline: true },
            { name: '入力額', value: `${amount} TKUP`, inline: true }
          )
          .setColor(0x00ff00)
          .setFooter({ text: '🚨 注意: 出金はTKUP（ゲーム内通貨）のみです。TKUCではありません。' })
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

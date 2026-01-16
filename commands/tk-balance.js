const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatBalance, formatBoosterInfo } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-balance')
    .setDescription('TKUPとTKUCの残高を表示します'),

  async execute(interaction, client) {
    try {
      const balanceInfo = formatBalance(interaction.user.id);
      const boosterInfo = formatBoosterInfo(interaction.user.id);

      const embed = new EmbedBuilder()
        .setTitle('💰 残高情報')
        .setDescription(`${balanceInfo}\n\n${boosterInfo}`)
        .setColor(0x00ff00)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Balance command error:', error);
      await interaction.reply({
        content: '残高情報の取得中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

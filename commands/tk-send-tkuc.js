const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { transferTKUC } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-send-tkuc')
    .setDescription('TKUCを他のユーザーに送金します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('送金先のユーザー')
        .setRequired(true))
    .addNumberOption(option =>
      option.setName('amount')
        .setDescription('送金するTKUCの数量')
        .setRequired(true)
        .setMinValue(0.01)),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getNumber('amount');

      // 小数点2桁に制限
      const roundedAmount = Math.round(amount * 100) / 100;

      if (targetUser.id === interaction.user.id) {
        return await interaction.reply({
          content: '自分自身には送金できません。',
          ephemeral: true
        });
      }

      if (roundedAmount <= 0) {
        return await interaction.reply({
          content: '送金数量は0より大きい値を指定してください。',
          ephemeral: true
        });
      }

      // 同じサーバーにいるかチェック
      const member = interaction.guild.members.cache.get(targetUser.id);
      if (!member) {
        return await interaction.reply({
          content: '指定されたユーザーがこのサーバーにいません。',
          ephemeral: true
        });
      }

      const result = transferTKUC(interaction.user.id, targetUser.id, roundedAmount);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ TKUC送金完了')
          .setDescription(result.message)
          .addFields(
            { name: '送金先', value: targetUser.toString(), inline: true },
            { name: '送金額', value: `${roundedAmount} TKUC`, inline: true }
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
      console.error('Send TKUC command error:', error);
      await interaction.reply({
        content: '送金処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

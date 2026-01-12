const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { transferTKUP } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-send-tkup')
    .setDescription('TKUPを他のユーザーに送金します')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('送金先のユーザー')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('送金するTKUPの数量')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, client) {
    try {
      const targetUser = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      if (targetUser.id === interaction.user.id) {
        return await interaction.reply({
          content: '自分自身には送金できません。',
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

      const result = transferTKUP(interaction.user.id, targetUser.id, amount);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ TKUP送金完了')
          .setDescription(result.message)
          .addFields(
            { name: '送金先', value: targetUser.toString(), inline: true },
            { name: '送金額', value: `${amount} TKUP`, inline: true }
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
      console.error('Send TKUP command error:', error);
      await interaction.reply({
        content: '送金処理中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

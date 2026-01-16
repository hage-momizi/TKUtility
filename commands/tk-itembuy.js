const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buyBoosterItem } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-itembuy')
    .setDescription('TKUPブースターアイテムを購入します')
    .addStringOption(option =>
      option.setName('item')
        .setDescription('購入するアイテム')
        .setRequired(true)
        .addChoices(
          { name: '🕐 1時間ブースター (1.5倍) - 500 TKUP / 2 TKUC', value: '1h' },
          { name: '⏰ 3時間ブースター (2倍) - 1200 TKUP / 4 TKUC', value: '3h' },
          { name: '⏳ 6時間ブースター (2.5倍) - 2000 TKUP / 6 TKUC', value: '6h' },
          { name: '📅 24時間ブースター (3倍) - 5000 TKUP / 15 TKUC', value: '24h' }
        ))
    .addStringOption(option =>
      option.setName('payment')
        .setDescription('支払い方法')
        .setRequired(true)
        .addChoices(
          { name: 'TKUP', value: 'tkup' },
          { name: 'TKUC', value: 'tkuc' }
        )),

  async execute(interaction, client) {
    try {
      const itemType = interaction.options.getString('item');
      const payment = interaction.options.getString('payment');

      const result = buyBoosterItem(interaction.user.id, itemType, payment);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('✅ ブースター購入完了')
          .setDescription(result.message)
          .setColor(result.extended ? 0xffa500 : 0x00ff00)
          .addFields(
            { name: '💡 効果', value: 'チャットでのTKUP獲得量が増加します', inline: false }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({
          content: `❌ ${result.message}`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error('Item buy command error:', error);
      await interaction.reply({
        content: 'アイテム購入中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};

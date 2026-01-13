const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBoosterItems } = require('../modules/economyService');

module.exports = {
  command: new SlashCommandBuilder()
    .setName('tk-itemhelp')
    .setDescription('TKUPブースターアイテムの情報を表示します'),

  async execute(interaction, client) {
    try {
      const items = getBoosterItems();

      const embed = new EmbedBuilder()
        .setTitle('📦 TKUPブースターアイテム')
        .setDescription('チャットでのTKUP獲得量を増やすアイテムです。\n重複購入で効果時間が延長されます。')
        .setColor(0x4169e1)
        .addFields(
          {
            name: '🕐 1時間ブースター',
            value: `**倍率:** ${items['1h'].multiplier}倍\n**価格:** ${items['1h'].tkup} TKUP / ${items['1h'].tkuc} TKUC\n**効果時間:** 1時間`,
            inline: false
          },
          {
            name: '⏰ 3時間ブースター',
            value: `**倍率:** ${items['3h'].multiplier}倍\n**価格:** ${items['3h'].tkup} TKUP / ${items['3h'].tkuc} TKUC\n**効果時間:** 3時間`,
            inline: false
          },
          {
            name: '⏳ 6時間ブースター',
            value: `**倍率:** ${items['6h'].multiplier}倍\n**価格:** ${items['6h'].tkup} TKUP / ${items['6h'].tkuc} TKUC\n**効果時間:** 6時間`,
            inline: false
          },
          {
            name: '📅 24時間ブースター',
            value: `**倍率:** ${items['24h'].multiplier}倍\n**価格:** ${items['24h'].tkup} TKUP / ${items['24h'].tkuc} TKUC\n**効果時間:** 24時間`,
            inline: false
          },
          {
            name: '💡 購入方法',
            value: '`/tk-itembuy` コマンドで購入できます',
            inline: false
          },
          {
            name: '⏱️ 確認方法',
            value: '`/tk-balance` コマンドで現在のブースター状況を確認できます',
            inline: false
          }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Item help command error:', error);
      await interaction.reply({
        content: 'アイテム情報の表示中にエラーが発生しました。',
        ephemeral: true
      });
    }
  },
};
